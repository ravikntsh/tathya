-- Some indicators have no "better" direction (e.g. share of jobs in each sector,
-- imports, depreciation share). Allow higher_is_better to be null for those.
-- Run once in the Supabase SQL Editor.
alter table public.indicators alter column higher_is_better drop not null;
