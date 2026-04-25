-- ===========================================
-- user_assets — per-user storage for builder creations
-- ===========================================
-- Run this in Supabase Dashboard → SQL Editor.
--
-- One row per user-created asset (character, environment, music, voice,
-- object, image, story, simulation). Mirrors the asset shape used by the
-- in-browser db.js so a row maps 1:1 to an in-memory asset object.
--
-- Stock/preset assets are NOT stored here — they're served from the
-- /global_assets/ JSON files. This table is exclusively for the things a
-- signed-in user has saved under their account.

create table if not exists public.user_assets (
  -- Composite primary key (user_id, id): a user can't collide with their
  -- own ids, but two different users may end up with the same id string.
  id          text not null,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  type        text not null,
  name        text not null,
  tags        jsonb not null default '[]'::jsonb,
  meta        jsonb not null default '{}'::jsonb,
  payload     jsonb not null default '{}'::jsonb,
  refs        jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (user_id, id),
  -- Constrain type to the known asset families so a typo can't pollute the
  -- table. Keep this list in sync with USER_STORES in assetLoader.js.
  constraint user_assets_type_check check (type in (
    'character', 'environment', 'music', 'voice',
    'object',    'image',       'story', 'simulation'
  ))
);

alter table public.user_assets enable row level security;

create policy "Users can read own assets"
  on public.user_assets for select
  using (auth.uid() = user_id);

create policy "Users can insert own assets"
  on public.user_assets for insert
  with check (auth.uid() = user_id);

create policy "Users can update own assets"
  on public.user_assets for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own assets"
  on public.user_assets for delete
  using (auth.uid() = user_id);

-- Bump updated_at automatically on every UPDATE so the in-browser code
-- doesn't have to remember to set it.
create or replace function public.user_assets_set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_assets_updated_at on public.user_assets;
create trigger trg_user_assets_updated_at
  before update on public.user_assets
  for each row execute function public.user_assets_set_updated_at();

-- Lookups: list-by-type is the hot path (the Browse panel calls
-- "give me all my characters" etc.). Newest-first ordering uses meta.modified
-- so it matches what dbGetAll does in the browser today.
create index if not exists idx_user_assets_user_type
  on public.user_assets(user_id, type);

create index if not exists idx_user_assets_modified
  on public.user_assets(user_id, type, ((meta->>'modified')) desc);
