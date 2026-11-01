-- StyleShift Arena: live classroom pre/post assessment competition (public/arena.html).
-- Participants join with a class code and have no Supabase account, so every read
-- and write goes through /api/arena with the service role, which does its own
-- authentication (trainer key, or participant id + hashed bearer token).
-- RLS is enabled with no policies and anon/authenticated hold no privileges.

create table if not exists public.arena_classes (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-HJ-NP-Z2-9]{6}$'),
  name text not null check (char_length(name) between 1 and 60),
  pin_salt text not null,
  pin_hash text not null,
  trainer_key text not null,
  phase text not null default 'lobby' check (phase in ('lobby', 'pre', 'teams', 'post', 'results')),
  reveal boolean not null default false,
  board jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '60 days'
);

create table if not exists public.arena_teams (
  class_id uuid not null references public.arena_classes(id) on delete cascade,
  id text not null check (id ~ '^t[a-z0-9]{8}$'),
  nickname text not null check (char_length(nickname) between 1 and 32),
  motto text not null default '' check (char_length(motto) <= 60),
  photo text check (photo is null or char_length(photo) <= 400000),
  photo_version integer not null default 0,
  post_answers jsonb,
  post_secs integer,
  post_auto integer,
  submitted_by text,
  submitted_at timestamptz,
  created_at timestamptz not null default now(),
  primary key (class_id, id)
);

create table if not exists public.arena_participants (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.arena_classes(id) on delete cascade,
  token_hash text not null,
  name text not null check (char_length(name) between 1 and 40),
  team_id text,
  pre_answers jsonb,
  pre_secs integer,
  pre_submitted_at timestamptz,
  created_at timestamptz not null default now(),
  foreign key (class_id, team_id) references public.arena_teams(class_id, id) on delete set null (team_id)
);
create index if not exists arena_participants_class on public.arena_participants(class_id);

create table if not exists public.arena_marks (
  class_id uuid not null references public.arena_classes(id) on delete cascade,
  key text not null check (key ~ '^(pre|post)_[A-Za-z0-9-]{1,64}$'),
  items jsonb not null,
  updated_at timestamptz not null default now(),
  primary key (class_id, key)
);

alter table public.arena_classes enable row level security;
alter table public.arena_teams enable row level security;
alter table public.arena_participants enable row level security;
alter table public.arena_marks enable row level security;
revoke all on public.arena_classes, public.arena_teams, public.arena_participants, public.arena_marks from anon, authenticated;
