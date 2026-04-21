-- ===========================================
-- Add is_priority flag to feedback for triage
-- ===========================================
-- Run this in Supabase Dashboard → SQL Editor

alter table public.feedback
  add column if not exists is_priority boolean not null default false;

create index if not exists idx_feedback_is_priority
  on public.feedback(is_priority)
  where is_priority = true;
