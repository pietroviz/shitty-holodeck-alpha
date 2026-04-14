-- ===========================================
-- Add status column to feedback for kanban management
-- ===========================================
-- Run this in Supabase Dashboard → SQL Editor

alter table public.feedback
  add column if not exists status text not null default 'todo'
  check (status in ('todo', 'doing', 'done'));

create index if not exists idx_feedback_status on public.feedback(status);

-- Allow admin (pbgagliano@gmail.com) to select + update all feedback rows.
-- Using a helper that looks up the email from auth.users for the current session.
create policy "Admin can view all feedback"
  on public.feedback for select
  using (
    auth.uid() in (
      select id from auth.users where email = 'pbgagliano@gmail.com'
    )
  );

create policy "Admin can update feedback status"
  on public.feedback for update
  using (
    auth.uid() in (
      select id from auth.users where email = 'pbgagliano@gmail.com'
    )
  )
  with check (
    auth.uid() in (
      select id from auth.users where email = 'pbgagliano@gmail.com'
    )
  );
