create or replace function exclude_test_account_revenue()
returns trigger language plpgsql as $$
begin
  if exists (
    select 1
    from "user" u
    join test_accounts t on t.email = lower(trim(u.email))
    where u.id = new.user_id
  ) then
    new.counts_revenue := false;
  end if;
  return new;
end;
$$;
