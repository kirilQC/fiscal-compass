-- Kiril's own essential/discretionary tag on a transaction; null means the app decides (see src/lib/spend.ts).
alter table transactions add column if not exists spend_class text check (spend_class in ('essential','discretionary'));
