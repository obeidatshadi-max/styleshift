-- Iraqi Objection Bank: a shared board for the Social Style workshop.
-- Participants write real objections in Iraqi dialect, tag the Social Style that
-- raised them, and note a reply that worked. The page (public/objections.html) is
-- open without a StyleShift account, so every read and write goes through
-- /api/objections with the service role. Adding or rating needs the workshop code.
-- No one else can touch the table: RLS is on and there are no policies.

create table if not exists public.workshop_objections (
  id uuid primary key default gen_random_uuid(),
  style text not null check (style in ('driver', 'expressive', 'amiable', 'analytical')),
  text_ar text not null check (char_length(text_ar) between 1 and 500),
  context text not null default '' check (char_length(context) <= 120),
  rebuttal text not null default '' check (char_length(rebuttal) <= 300),
  code_switch boolean not null default false,
  realism smallint not null default 0 check (realism between 0 and 5),
  created_at timestamptz not null default now()
);

create index if not exists workshop_objections_created_at_idx
  on public.workshop_objections (created_at desc);

alter table public.workshop_objections enable row level security;
revoke all on public.workshop_objections from anon, authenticated;
