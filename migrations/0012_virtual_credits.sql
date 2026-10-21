alter table payments drop constraint if exists payments_purpose_check;
alter table payments add constraint payments_purpose_check
  check (purpose in ('session', 'activation', 'virtual_credits'));
alter table payments add column if not exists virtual_credits integer
  check (virtual_credits in (1, 3, 5));

create table if not exists virtual_credit_wallets (
  user_id text primary key,
  balance integer not null default 0 check (balance >= 0)
);

create table if not exists virtual_credit_ledger (
  id bigserial primary key,
  user_id text not null,
  payment_id text unique,
  event_key text unique,
  credits integer not null check (credits <> 0),
  transaction_type text not null check (transaction_type in ('purchase', 'spend', 'reversal')),
  created_at timestamptz not null default now()
);

create or replace function apply_virtual_credit_payment()
returns trigger
language plpgsql
as $$
declare
  awarded integer;
  did_reverse integer;
begin
  if new.purpose = 'virtual_credits'
    and new.status = 'confirmed'
    and (tg_op = 'INSERT' or old.status is distinct from 'confirmed') then
    if new.user_id is null or new.virtual_credits is null then
      raise exception 'Confirmed virtual credit payments require a user and credit quantity.';
    end if;

    insert into virtual_credit_ledger (user_id, payment_id, credits, transaction_type)
    values (new.user_id, new.id, new.virtual_credits, 'purchase')
    on conflict (payment_id) do nothing
    returning credits into awarded;

    if awarded is not null then
      insert into virtual_credit_wallets (user_id, balance)
      values (new.user_id, awarded)
      on conflict (user_id) do update
      set balance = virtual_credit_wallets.balance + excluded.balance;
    end if;
  elsif tg_op = 'UPDATE'
    and old.purpose = 'virtual_credits'
    and old.status = 'confirmed'
    and new.status = 'rejected' then
    update virtual_credit_wallets
    set balance = balance - old.virtual_credits
    where user_id = old.user_id and balance >= old.virtual_credits
    ;
    get diagnostics did_reverse = row_count;

    if did_reverse = 0 then
      raise exception 'Cannot reverse this payment because some purchased credits have already been used.';
    end if;

    insert into virtual_credit_ledger (user_id, event_key, credits, transaction_type)
    values (old.user_id, 'reversal:' || old.id, -old.virtual_credits, 'reversal');
  end if;

  return new;
end;
$$;

drop trigger if exists payments_virtual_credit_wallet on payments;
create trigger payments_virtual_credit_wallet
after insert or update of status on payments
for each row execute function apply_virtual_credit_payment();

create or replace function spend_virtual_credit(p_user_id text, p_event_key text)
returns table (spent boolean, balance integer)
language plpgsql
as $$
declare
  current_balance integer;
begin
  select wallet.balance into current_balance
  from virtual_credit_wallets wallet
  where wallet.user_id = p_user_id
  for update;

  if not found then
    return query select false, 0;
    return;
  end if;

  if exists (
    select 1 from virtual_credit_ledger
    where event_key = p_event_key and user_id = p_user_id and transaction_type = 'spend'
  ) then
    return query select false, current_balance;
    return;
  end if;

  if current_balance < 1 then
    return query select false, current_balance;
    return;
  end if;

  update virtual_credit_wallets as wallet
  set balance = wallet.balance - 1
  where wallet.user_id = p_user_id
  returning wallet.balance into current_balance;

  insert into virtual_credit_ledger (user_id, event_key, credits, transaction_type)
  values (p_user_id, p_event_key, -1, 'spend');

  return query select true, current_balance;
end;
$$;
