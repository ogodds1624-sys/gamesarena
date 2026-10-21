create table if not exists virtual_scans (
  id uuid primary key,
  user_id text not null,
  image_hash text not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  analysis text,
  balance integer,
  created_at timestamptz not null default now()
);
create unique index if not exists virtual_scans_active_user
  on virtual_scans (user_id) where status = 'processing';
create index if not exists virtual_scans_user_time on virtual_scans (user_id, created_at);

create or replace function begin_virtual_scan(p_id uuid, p_user text, p_hash text)
returns text language plpgsql as $$
declare
  wallet_balance integer;
  prior virtual_scans%rowtype;
begin
  select balance into wallet_balance from virtual_credit_wallets
  where user_id = p_user for update;
  select * into prior from virtual_scans where id = p_id;
  if found then
    if prior.user_id <> p_user or prior.image_hash <> p_hash then return 'conflict'; end if;
    return prior.status;
  end if;
  if coalesce(wallet_balance, 0) < 1 then return 'no_credits'; end if;
  update virtual_scans set status = 'failed'
    where user_id = p_user and status = 'processing' and created_at < now() - interval '2 minutes';
  if exists (select 1 from virtual_scans where user_id = p_user and status = 'processing') then
    return 'busy';
  end if;
  if (select count(*) from virtual_scans where user_id = p_user
      and created_at > now() - interval '1 hour') >= 20 then return 'rate_limited'; end if;
  insert into virtual_scans (id, user_id, image_hash, status)
    values (p_id, p_user, p_hash, 'processing');
  return 'started';
end;
$$;

create or replace function finish_virtual_scan(p_id uuid, p_user text, p_analysis text)
returns integer language plpgsql as $$
declare
  scan virtual_scans%rowtype;
  did_spend boolean;
  remaining integer;
begin
  perform 1 from virtual_credit_wallets where user_id = p_user for update;
  select * into scan from virtual_scans where id = p_id and user_id = p_user for update;
  if not found then raise exception 'Scan not found.'; end if;
  if scan.status = 'completed' then return scan.balance; end if;
  if scan.status <> 'processing' then raise exception 'Scan expired. Please try again.'; end if;
  select spent, balance into did_spend, remaining
    from spend_virtual_credit(p_user, 'scan:' || p_id::text);
  if not did_spend then raise exception 'No credit available. This scan was not charged.'; end if;
  update virtual_scans set status = 'completed', analysis = p_analysis, balance = remaining
    where id = p_id;
  return remaining;
end;
$$;
