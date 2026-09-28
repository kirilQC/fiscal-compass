-- One row per merchant: the company behind it and its logo, looked up once and reused for every charge.
-- Logo images live in the public "merchant-logos" storage bucket, one file per domain.
create table if not exists merchant_logos (
  user_id uuid not null references auth.users(id) on delete cascade,
  merchant_key text not null,
  brand text,
  domain text,
  logo_path text,
  source text not null default 'none',   -- dictionary | ai | research | manual | none
  checked_at timestamptz not null default now(),
  primary key (user_id, merchant_key)
);
alter table merchant_logos enable row level security;
create policy merchant_logos_owner on merchant_logos for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
