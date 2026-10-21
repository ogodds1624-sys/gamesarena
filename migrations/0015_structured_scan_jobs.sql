create table if not exists blocked_emails (
  email text primary key,
  created_at timestamptz not null default now()
);

create table virtual_scan_jobs (
  id uuid primary key,
  user_id text not null,
  image_hash text not null,
  image_payload text,
  status text not null default 'queued'
    check (status in ('queued','processing','completed','needs_review','failed')),
  attempts integer not null default 0,
  lease_token uuid,
  lease_until timestamptz,
  available_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 minutes',
  result jsonb,
  error text,
  model text not null,
  charged boolean not null default false,
  balance integer,
  created_at timestamptz(3) not null default now(),
  updated_at timestamptz not null default now()
);
create unique index virtual_scan_jobs_dedupe on virtual_scan_jobs(user_id,image_hash)
  where status <> 'failed';
create index virtual_scan_jobs_history on virtual_scan_jobs(user_id,created_at desc,id desc);
create index virtual_scan_jobs_queue on virtual_scan_jobs(available_at)
  where status in ('queued','processing');

create table virtual_scan_upload_limits (
  user_id text primary key,
  window_start timestamptz not null default now(),
  attempts integer not null default 1
);
create function allow_virtual_scan_upload(p_user text)
returns boolean language sql as $$
  insert into virtual_scan_upload_limits(user_id) values(p_user)
  on conflict(user_id) do update set
    attempts=case when virtual_scan_upload_limits.window_start<=now()-interval '1 hour'
      then 1 else virtual_scan_upload_limits.attempts+1 end,
    window_start=case when virtual_scan_upload_limits.window_start<=now()-interval '1 hour'
      then now() else virtual_scan_upload_limits.window_start end
  returning attempts<=40;
$$;

create function virtual_scan_allowed(p_user text)
returns boolean language sql stable as $$
  select exists (
    select 1 from "user" u join registered_users r on r.user_id=u.id
    where u.id=p_user and r.country in ('Ghana','Nigeria')
      and r.sporty_number <> ''
      and not exists (select 1 from blocked_emails b where b.email=lower(u.email))
      and exists (select 1 from payments p where p.user_id=u.id
        and p.purpose='activation' and p.status='confirmed')
      and exists (select 1 from payments p where p.user_id=u.id
        and p.purpose='virtual_credits' and p.status='confirmed')
  );
$$;

create function enqueue_virtual_scan(
  p_id uuid, p_user text, p_hash text, p_payload text, p_model text
) returns table(job_id uuid, outcome text) language plpgsql as $$
declare
  remaining integer;
  prior virtual_scan_jobs%rowtype;
  pending_count integer;
begin
  select w.balance into remaining from virtual_credit_wallets w
    where w.user_id=p_user for update;
  if not virtual_scan_allowed(p_user) then
    return query select p_id,'forbidden'::text; return;
  end if;
  select * into prior from virtual_scan_jobs where id=p_id;
  if found then
    if prior.user_id<>p_user or prior.image_hash<>p_hash then
      return query select p_id,'conflict'::text;
    else return query select prior.id,'existing'::text;
    end if;
    return;
  end if;
  select * into prior from virtual_scan_jobs
    where user_id=p_user and image_hash=p_hash and status<>'failed' limit 1;
  if found then return query select prior.id,'existing'::text; return; end if;
  select count(*) into pending_count from virtual_scan_jobs
    where user_id=p_user and status in ('queued','processing');
  if pending_count >= coalesce(remaining,0) then
    return query select p_id,'no_credits'::text; return;
  end if;
  if pending_count >= 5 or (
    select count(*) from virtual_scan_jobs
    where user_id=p_user and created_at>now()-interval '1 hour'
  ) >= 20 then
    return query select p_id,'rate_limited'::text; return;
  end if;
  insert into virtual_scan_jobs(id,user_id,image_hash,image_payload,model)
    values(p_id,p_user,p_hash,p_payload,p_model);
  return query select p_id,'created'::text;
end;
$$;

create function expire_virtual_scan_jobs()
returns void language sql as $$
  update virtual_scan_jobs set status='failed',image_payload=null,lease_token=null,
    lease_until=null,error='Scan expired or retry limit reached. No credit was used.',
    updated_at=now()
    where status in ('queued','processing') and
      (expires_at<=now() or (attempts>=3 and coalesce(lease_until,now())<=now()));
$$;

create function claim_virtual_scan(p_id uuid, p_user text, p_token uuid)
returns setof virtual_scan_jobs language plpgsql as $$
begin
  perform expire_virtual_scan_jobs();
  return query
    with candidate as (
      select id from virtual_scan_jobs
      where (p_id is null or id=p_id) and (p_user is null or user_id=p_user)
        and available_at<=now() and expires_at>now() and attempts<3
        and (status='queued' or (status='processing' and lease_until<=now()))
      order by created_at for update skip locked limit 1
    )
    update virtual_scan_jobs j set status='processing',attempts=j.attempts+1,
      lease_token=p_token,lease_until=now()+interval '100 seconds',updated_at=now()
    from candidate c where j.id=c.id returning j.*;
end;
$$;

create function finish_structured_scan(
  p_id uuid,p_user text,p_token uuid,p_result jsonb,p_usable boolean
) returns boolean language plpgsql as $$
declare
  job virtual_scan_jobs%rowtype;
  spent_credit boolean;
  remaining integer;
begin
  perform 1 from virtual_credit_wallets where user_id=p_user for update;
  select * into job from virtual_scan_jobs where id=p_id and user_id=p_user for update;
  if not found or job.status<>'processing' or job.lease_token is distinct from p_token
    or job.lease_until<=now() then return false; end if;
  if not virtual_scan_allowed(p_user) then
    update virtual_scan_jobs set status='failed',image_payload=null,lease_token=null,
      lease_until=null,error='Scan access is no longer available. No credit was used.',
      updated_at=now() where id=p_id;
    return false;
  end if;
  if p_usable then
    select spent,balance into spent_credit,remaining
      from spend_virtual_credit(p_user,'structured-scan:'||p_id::text);
    if not spent_credit then
      update virtual_scan_jobs set status='failed',image_payload=null,lease_token=null,
        lease_until=null,error='No credit available. This scan was not charged.',
        updated_at=now() where id=p_id;
      return false;
    end if;
  else
    select balance into remaining from virtual_credit_wallets where user_id=p_user;
  end if;
  update virtual_scan_jobs set
    status=case when p_usable then 'completed' else 'needs_review' end,
    result=p_result,charged=p_usable,balance=coalesce(remaining,0),
    image_payload=null,lease_token=null,lease_until=null,error=null,updated_at=now()
    where id=p_id;
  return true;
end;
$$;

create function fail_structured_scan(p_id uuid,p_token uuid,p_retry boolean,p_error text)
returns void language sql as $$
  update virtual_scan_jobs set
    status=case when p_retry and attempts<3 and expires_at>now() then 'queued' else 'failed' end,
    image_payload=case when p_retry and attempts<3 and expires_at>now() then image_payload else null end,
    available_at=now()+interval '15 seconds',lease_token=null,lease_until=null,
    error=case when p_retry and (attempts>=3 or expires_at<=now())
      then 'AI service unavailable; scan expired or retry limit reached. No credit was used. Upload again to retry.'
      else p_error end,updated_at=now()
  where id=p_id and status='processing' and lease_token=p_token;
$$;
