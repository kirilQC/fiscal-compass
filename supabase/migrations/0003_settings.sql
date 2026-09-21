create table user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  paycheck_net_cents bigint,              -- expected take-home per paycheck
  pay_days int[] not null default '{1,15}', -- days of month paychecks land
  tithe_pct numeric(5,2) not null default 10,
  notes text,                             -- free-form standing context for the advisor
  updated_at timestamptz not null default now()
);
alter table user_settings enable row level security;
create policy user_settings_owner on user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
