-- 030_voice_partner_live_source.sql
alter table public.doctor_visits drop constraint if exists doctor_visits_source_check;
alter table public.doctor_visits add constraint doctor_visits_source_check
  check (source = any (array[
    'manual','warmup','ai_drill',
    'voice_partner','voice_partner_opening','voice_partner_question','voice_partner_fab','voice_partner_closing',
    'voice_partner_live'
  ]));
