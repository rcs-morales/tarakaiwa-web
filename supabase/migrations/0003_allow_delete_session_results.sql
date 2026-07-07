-- Allow users to delete their own session_results rows (progress reset).
-- The original migration only granted SELECT + INSERT; this adds DELETE.

drop policy if exists "session_results_delete_own" on public.session_results;
create policy "session_results_delete_own" on public.session_results
  for delete using (auth.uid() = user_id);
