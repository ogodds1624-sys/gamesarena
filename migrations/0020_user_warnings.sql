create table user_warnings (
  id uuid primary key,
  user_id text not null references "user"(id) on delete cascade,
  message text not null check (length(trim(message)) between 1 and 1000),
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  removed_at timestamptz
);
create index user_warnings_active on user_warnings (user_id, created_at)
  where acknowledged_at is null and removed_at is null;
