-- Next-visit plan for a doctor: the rep sets an objective and a success measure
-- BEFORE the visit (Visit Prep); the AI Coach debrief pre-fills from it afterwards.
-- Nullable text on the rep-owned row; existing "doctors" RLS already limits
-- select/update to the owner, so no policy change is needed.
alter table public.doctors add column if not exists plan_objective text;
alter table public.doctors add column if not exists plan_success_measure text;
