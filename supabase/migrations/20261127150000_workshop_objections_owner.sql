-- Iraqi Objection Bank: each participant sees only their own entries.
-- There are no accounts, so the browser keeps a random secret key and sends it with
-- every request. The API stores only a SHA-256 hash of it here and filters on it.
-- Rows added before this column existed get '' and no browser can see them on the page.

alter table public.workshop_objections
  add column if not exists owner_hash text not null default '';

create index if not exists workshop_objections_owner_idx
  on public.workshop_objections (owner_hash, created_at desc);
