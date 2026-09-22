create table if not exists prices (
  symbol text not null,
  as_of date not null,
  close_cents bigint not null,
  primary key (symbol, as_of)
);
alter table prices enable row level security;
create policy prices_read on prices for select to authenticated using (true);
