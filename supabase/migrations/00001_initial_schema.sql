-- ===========================================
-- Initial Schema: Profiles + Simulators
-- ===========================================
-- Run this in Supabase Dashboard → SQL Editor
-- or via `supabase db push` if using the CLI

-- Profiles table (extends Supabase auth.users)
create table if not exists public.profiles (
  id uuid references auth.users on delete cascade primary key,
  email text,
  display_name text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Auto-create a profile when a user signs up
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email)
  values (new.id, new.email);
  return new;
end;
$$ language plpgsql security definer;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- Simulators table (tracks which simulators exist)
create table if not exists public.simulators (
  id uuid default gen_random_uuid() primary key,
  owner_id uuid references public.profiles(id) on delete cascade,
  title text not null,
  description text,
  slug text unique not null,
  status text default 'draft' check (status in ('draft', 'live', 'archived')),
  config jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Simulation runs / saved state
create table if not exists public.simulation_runs (
  id uuid default gen_random_uuid() primary key,
  simulator_id uuid references public.simulators(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  input_data jsonb default '{}'::jsonb,
  output_data jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.simulators enable row level security;
alter table public.simulation_runs enable row level security;

-- Profiles: users can read/update their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.profiles for update
  using (auth.uid() = id);

-- Simulators: owners have full access, everyone can view live ones
create policy "Anyone can view live simulators"
  on public.simulators for select
  using (status = 'live');

create policy "Owners have full access to their simulators"
  on public.simulators for all
  using (auth.uid() = owner_id);

-- Simulation runs: users can see their own runs
create policy "Users can view own runs"
  on public.simulation_runs for select
  using (auth.uid() = user_id);

create policy "Users can create runs"
  on public.simulation_runs for insert
  with check (auth.uid() = user_id);
