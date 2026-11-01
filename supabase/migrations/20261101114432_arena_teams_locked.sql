-- StyleShift Arena: the trainer can lock groups so participants cannot create,
-- join or leave a team (they can still set their team's nickname and photo).
alter table public.arena_classes add column if not exists teams_locked boolean not null default false;
