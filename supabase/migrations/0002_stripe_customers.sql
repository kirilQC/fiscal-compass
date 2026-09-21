create table stripe_customers (
  user_id uuid primary key references auth.users(id) on delete cascade,
  customer_id text not null unique,
  created_at timestamptz not null default now()
);
alter table stripe_customers enable row level security;
create policy stripe_customers_owner on stripe_customers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
