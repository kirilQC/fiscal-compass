create table planned_expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,                       -- "Rent (Dover Glen)"
  category text not null,                   -- canonical category
  amount_cents bigint,                      -- expected per month; null = varies / unknown
  amount_min_cents bigint,                  -- optional range for "varies" items
  amount_max_cents bigint,
  pct_of_income numeric(5,2),               -- e.g. tithe 10 (amount derived from income)
  merchant_pattern text,                    -- ILIKE match to recognize the actual charge
  due_day int,                              -- day of month if fixed
  is_reimbursed boolean not null default false, -- paid by me, paid back later; excluded from spending
  is_active boolean not null default true,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table planned_expenses enable row level security;
create policy planned_expenses_owner on planned_expenses for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table user_settings add column if not exists monthly_income_cents bigint;
