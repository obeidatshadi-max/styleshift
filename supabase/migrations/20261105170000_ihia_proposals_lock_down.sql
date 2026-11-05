-- Tighten ihia_proposals after a security review. Signed-in users may only ADD their own proposals.
-- Nobody reads or updates the table directly any more, not even reviewers: the reviewer screen goes
-- through the server (service role, after an IHIA reviewer check), which groups the proposals and
-- never sends the rep id. That keeps "no rep identity" true even for someone querying the database
-- with a reviewer login.
drop policy if exists ihia_proposals_read on public.ihia_proposals;
drop policy if exists ihia_proposals_update on public.ihia_proposals;
revoke select, update on public.ihia_proposals from authenticated;
