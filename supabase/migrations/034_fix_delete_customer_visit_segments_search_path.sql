-- supabase/migrations/034_fix_delete_customer_visit_segments_search_path.sql
--
-- delete_customer_visit_segments (033) is SECURITY DEFINER with no
-- search_path pinned, which the Supabase linter flags as hijackable via a
-- mutable search_path. Pin it.

alter function public.delete_customer_visit_segments() set search_path = public, pg_temp;
