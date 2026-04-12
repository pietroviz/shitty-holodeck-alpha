-- ===========================================
-- Feedback table for in-app note taking
-- ===========================================
-- Run this in Supabase Dashboard → SQL Editor

create table if not exists public.feedback (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references public.profiles(id) on delete set null,
  page_url text,
  message text not null,
  created_at timestamptz default now()
);

-- RLS
alter table public.feedback enable row level security;

-- Logged-in users can insert their own feedback
create policy "Users can insert own feedback"
  on public.feedback for insert
  with check (auth.uid() = user_id);

-- Users can view their own feedback
create policy "Users can view own feedback"
  on public.feedback for select
  using (auth.uid() = user_id);

-- Index for fast lookups by user
create index idx_feedback_user_id on public.feedback(user_id);
create index idx_feedback_created_at on public.feedback(created_at desc);
