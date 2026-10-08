-- A promise the rep made to a doctor (doctor_visits.promise_made) stays "open" until the rep
-- ticks it off. Existing owner-only RLS on doctor_visits already covers reading and updating this.
alter table public.doctor_visits add column if not exists promise_done_at timestamptz;
