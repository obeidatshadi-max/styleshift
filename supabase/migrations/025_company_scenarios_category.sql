-- Objection category for each company-authored scenario — drives the
-- cognitive-bias callout (see src/lib/cognitive-biases.ts) shown to the rep
-- alongside the drill. Backfilled to 'evidence' for any pre-existing rows
-- (none expected yet — this ships the same day as the base table) so the
-- not-null constraint can apply going forward.
alter table public.company_scenarios
  add column category text not null default 'evidence'
  check (category in ('evidence', 'price', 'safety', 'time', 'competitor', 'logistics', 'trust'));

alter table public.company_scenarios alter column category drop default;
