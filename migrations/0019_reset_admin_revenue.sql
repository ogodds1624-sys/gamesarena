create table admin_revenue_period (
  id text primary key check (id = 'main'),
  starts_at timestamptz not null
);

insert into admin_revenue_period (id, starts_at) values ('main', now());
