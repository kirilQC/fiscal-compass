-- Fiscal Compass — single-user schema. Every row is owned by user_id and guarded by RLS.

create extension if not exists pgcrypto;

create type account_kind as enum ('checking','savings','credit','loan','investment','other');
create type txn_status as enum ('posted','pending');

create table accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'stripe',          -- stripe | manual
  provider_account_id text,                          -- Stripe Financial Connections account id (fca_...)
  institution text not null,
  name text not null,
  kind account_kind not null,
  last4 text,
  currency text not null default 'usd',
  credit_limit_cents bigint,
  loan_apr numeric(6,3),
  loan_payment_cents bigint,
  loan_payments_left int,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, provider, provider_account_id)
);

-- One row per account per day; the net-worth history is a sum over this table.
create table balances_daily (
  account_id uuid not null references accounts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  as_of date not null,
  balance_cents bigint not null,                     -- liabilities stored NEGATIVE
  primary key (account_id, as_of)
);
create index balances_daily_user_asof on balances_daily(user_id, as_of);

create table transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  provider_txn_id text,
  posted_on date not null,
  amount_cents bigint not null,                      -- negative = money out
  merchant text not null,
  description text,
  category text not null default 'Other',
  category_source text not null default 'provider',  -- provider | rule | manual | ai
  status txn_status not null default 'posted',
  is_transfer boolean not null default false,
  is_income boolean not null default false,
  anomaly_note text,
  created_at timestamptz not null default now(),
  unique (user_id, provider_txn_id)
);
create index transactions_user_date on transactions(user_id, posted_on desc);

create table category_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_pattern text not null,                    -- case-insensitive substring / ILIKE
  category text not null,
  is_transfer boolean not null default false,
  is_income boolean not null default false,
  created_at timestamptz not null default now()
);

create table budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  month date not null,                               -- first of month
  total_cents bigint not null,
  unique (user_id, month)
);

create table budget_categories (
  budget_id uuid not null references budgets(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  category text not null,
  limit_cents bigint not null,
  primary key (budget_id, category)
);

create table holdings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references accounts(id) on delete cascade,
  symbol text not null,
  name text,
  asset_class text,                                  -- us_equity | intl_equity | bond | cash | other
  target_pct numeric(5,2),
  unique (account_id, symbol)
);

create table holdings_daily (
  holding_id uuid not null references holdings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  as_of date not null,
  quantity numeric(18,6),
  price_cents bigint,
  value_cents bigint not null,
  primary key (holding_id, as_of)
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target_cents bigint not null,
  saved_cents bigint not null default 0,
  target_date date,
  monthly_plan_cents bigint,
  linked_account_id uuid references accounts(id) on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table paychecks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  pay_date date not null,
  employer text,
  gross_cents bigint not null,
  net_cents bigint not null,
  taxes_cents bigint,
  retirement_cents bigint,
  benefits_cents bigint,
  raw jsonb,
  created_at timestamptz not null default now()
);

create table chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New conversation',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references chat_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  created_at timestamptz not null default now()
);
create index chat_messages_thread on chat_messages(thread_id, created_at);

create table advisor_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null,                                -- brief | alert | annotation
  body text not null,
  anchor jsonb,                                      -- e.g. {"series":"net_worth","month":"2026-02"}
  created_at timestamptz not null default now()
);

create table sync_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  status text not null default 'running',
  detail jsonb
);

-- Row level security: the signed-in user sees only their own rows. Service role bypasses for cron.
do $$
declare t text;
begin
  for t in select unnest(array['accounts','balances_daily','transactions','category_rules','budgets',
    'budget_categories','holdings','holdings_daily','goals','paychecks','chat_threads','chat_messages',
    'advisor_notes','sync_runs'])
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t || '_owner', t);
  end loop;
end $$;
