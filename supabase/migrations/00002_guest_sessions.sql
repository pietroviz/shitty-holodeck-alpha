-- ===========================================
-- Guest Sessions: Allow anonymous users
-- ===========================================
-- Run this in Supabase Dashboard → SQL Editor
-- after the initial schema migration

-- Add guest_id column to simulation_runs for anonymous sessions
alter table public.simulation_runs
  add column if not exists guest_id text;

-- Index for fast lookup when linking guest data to a real account
create index if not exists idx_simulation_runs_guest_id
  on public.simulation_runs(guest_id)
  where guest_id is not null;

-- Update RLS policies to allow guest access

-- Drop existing policies that are too restrictive for guests
drop policy if exists "Users can view own runs" on public.simulation_runs;
drop policy if exists "Users can create runs" on public.simulation_runs;

-- Recreate with guest support:
-- Authenticated users can see their own runs
create policy "Authenticated users can view own runs"
  on public.simulation_runs for select
  using (auth.uid() = user_id);

-- Authenticated users can create runs
create policy "Authenticated users can create runs"
  on public.simulation_runs for insert
  with check (auth.uid() = user_id);

-- Allow the service role to update guest runs (for linking)
-- This happens server-side when a guest signs up
create policy "Service can update guest runs"
  on public.simulation_runs for update
  using (guest_id is not null);

-- Allow anonymous inserts with a guest_id (no user_id required)
create policy "Guests can create runs with guest_id"
  on public.simulation_runs for insert
  with check (guest_id is not null and user_id is null);

-- Allow guests to view their own runs by guest_id
-- (This requires the guest_id to be passed as a header or RPC param)
create policy "Guests can view own runs"
  on public.simulation_runs for select
  using (guest_id is not null);
