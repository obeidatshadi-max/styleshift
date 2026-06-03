-- Companies
create table public.companies (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  invite_code text unique not null default substr(md5(random()::text), 1, 8),
  created_at timestamptz default now()
);

-- Rep + manager profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  company_id uuid references public.companies(id),
  role text not null default 'rep',
  display_name text,
  xp integer not null default 0,
  last_visit date,
  created_at timestamptz default now()
);

-- One row per completed level session
create table public.sessions (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references public.profiles(id) on delete cascade,
  level integer not null check (level between 1 and 4),
  accuracy integer not null check (accuracy between 0 and 100),
  xp_earned integer not null,
  avg_reaction_ms integer,
  completed_at timestamptz default now()
);

-- Earned badges (one row per badge per rep)
create table public.badges (
  rep_id uuid not null references public.profiles(id) on delete cascade,
  badge_name text not null,
  earned_at timestamptz default now(),
  primary key (rep_id, badge_name)
);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.companies enable row level security;
alter table public.sessions enable row level security;
alter table public.badges enable row level security;

-- Profiles: own row only
create policy "own profile read" on public.profiles for select using (auth.uid() = id);
create policy "own profile insert" on public.profiles for insert with check (auth.uid() = id);
create policy "own profile update" on public.profiles for update using (auth.uid() = id);

-- Sessions: own rows only
create policy "own sessions read" on public.sessions for select using (rep_id = auth.uid());
create policy "own sessions insert" on public.sessions for insert with check (rep_id = auth.uid());

-- Badges: own rows only
create policy "own badges read" on public.badges for select using (rep_id = auth.uid());
create policy "own badges insert" on public.badges for insert with check (rep_id = auth.uid());

-- Managers: read all profiles + sessions in their company
create policy "manager profiles read" on public.profiles for select using (
  company_id is not null and company_id in (
    select company_id from public.profiles where id = auth.uid() and role = 'manager'
  )
);
create policy "manager sessions read" on public.sessions for select using (
  rep_id in (
    select id from public.profiles
    where company_id in (
      select company_id from public.profiles where id = auth.uid() and role = 'manager'
    )
  )
);
