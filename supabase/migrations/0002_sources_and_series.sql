-- Phase 1b: source registry and multi-source series.
-- Run once in the Supabase SQL Editor after 0001_tracker.sql, then run the
-- regenerated supabase/seed.sql. Drops the old observations table: it is fully
-- rebuilt from the repo's data files by seed.sql.

create table if not exists public.sources (
  id            text primary key,           -- e.g. 'maddison-2023'
  publisher     text not null,
  title         text not null,
  url           text not null,
  class         text not null check (class in ('A', 'B', 'C', 'D', 'E', 'F')),
  licence       text,
  method        text,
  coverage      text,
  limitations   text,
  last_checked  date
);

create table if not exists public.datasets (
  id        text primary key,               -- one consistent series from one provider
  label     jsonb not null,                 -- {"en": ..., "hi": ...}
  provider  text not null,
  class     text not null,
  chart     boolean not null default true  -- false: don't draw its All-India line (repeats another source)
);

alter table public.indicators add column if not exists domain   jsonb;   -- [min, max] for the map scale
alter table public.indicators add column if not exists decimals int not null default 1;
alter table public.indicators add column if not exists map_domain jsonb;  -- optional narrower scale for the state map

drop table if exists public.observations;
create table public.observations (
  id            bigint generated always as identity primary key,
  region_code   text not null references public.regions(code),
  indicator_id  text not null references public.indicators(id),
  dataset_id    text not null references public.datasets(id),
  period_label  text not null,              -- as printed: '1951', 'NFHS-5', '2016-20'
  year          int  not null,              -- plotting year (end of a period)
  value         numeric not null,
  source_id     text not null references public.sources(id),
  source_table  text,
  source_page   text,
  date_pulled   date not null,
  archive_url   text,
  break_before  boolean not null default false,
  note          text,
  updated_at    timestamptz not null default now(),
  unique (region_code, indicator_id, dataset_id, period_label)
);
create index observations_indicator on public.observations (indicator_id, dataset_id);

alter table public.sources      enable row level security;
alter table public.datasets     enable row level security;
alter table public.observations enable row level security;

drop policy if exists "public read" on public.sources;
drop policy if exists "public read" on public.datasets;
drop policy if exists "public read" on public.observations;
create policy "public read" on public.sources      for select to anon, authenticated using (true);
create policy "public read" on public.datasets     for select to anon, authenticated using (true);
create policy "public read" on public.observations for select to anon, authenticated using (true);
