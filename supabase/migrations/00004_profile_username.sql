-- Add username and full_name to profiles
alter table public.profiles
  add column if not exists username text unique,
  add column if not exists full_name text;

-- Index for fast username lookups
create unique index if not exists idx_profiles_username on public.profiles(username);

-- Allow users to read any profile (for public usernames)
create policy "Anyone can view profiles"
  on public.profiles for select
  using (true);

-- Allow users to update their own profile
create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);
