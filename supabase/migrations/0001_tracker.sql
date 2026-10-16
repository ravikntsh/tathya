-- Phase 1: development tracker tables.
-- Run once in the Supabase dashboard: SQL Editor -> New query -> paste -> Run.
-- Public visitors (anon key) can only read. Writes go through the dashboard or,
-- later, the reviewer workflow (phase 6), never through the anon key.

create table if not exists public.regions (
  code        text primary key,               -- ISO-style code, e.g. 'BR'; 'IN' for all-India
  kind        text not null check (kind in ('country', 'state', 'ut')),
  name        jsonb not null,                 -- {"en": "Bihar", "hi": "बिहार"}
  map_name    text                            -- feature name in geo/india-states.topo.json
);

create table if not exists public.indicators (
  id                text primary key,         -- e.g. 'clean_fuel'
  label             jsonb not null,           -- {"en": ..., "hi": ...}
  short_label       jsonb not null,
  definition        jsonb not null,
  unit              text not null default '%',
  dataset           text not null,            -- one dataset per line chart, never mixed
  higher_is_better  boolean not null default true,
  break_note        jsonb,                    -- shown as a break marker on charts when set
  sort              int not null default 0
);

create table if not exists public.observations (
  id            bigint generated always as identity primary key,
  region_code   text not null references public.regions(code),
  indicator_id  text not null references public.indicators(id),
  round         text not null,                -- 'NFHS-4', 'NFHS-5'
  survey_years  text not null,                -- '2015-16'
  period_end    int  not null,                -- last year of the survey, for ordering
  value         numeric not null,
  source_url    text not null,
  source_page   text,
  publisher     text not null,
  date_pulled   date not null,
  archive_url   text,
  note          text,
  updated_at    timestamptz not null default now(),
  unique (region_code, indicator_id, round)
);

create index if not exists observations_indicator_round on public.observations (indicator_id, round);

-- Public correction log: every change to a published number gets a row here.
create table if not exists public.corrections (
  id           bigint generated always as identity primary key,
  made_at      timestamptz not null default now(),
  page         text not null,
  summary      text not null,
  old_value    text,
  new_value    text,
  source_url   text
);

alter table public.regions      enable row level security;
alter table public.indicators   enable row level security;
alter table public.observations enable row level security;
alter table public.corrections  enable row level security;

drop policy if exists "public read" on public.regions;
drop policy if exists "public read" on public.indicators;
drop policy if exists "public read" on public.observations;
drop policy if exists "public read" on public.corrections;
create policy "public read" on public.regions      for select to anon, authenticated using (true);
create policy "public read" on public.indicators   for select to anon, authenticated using (true);
create policy "public read" on public.observations for select to anon, authenticated using (true);
create policy "public read" on public.corrections  for select to anon, authenticated using (true);
