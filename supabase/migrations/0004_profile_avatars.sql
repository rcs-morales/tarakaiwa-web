-- Phase — Profile avatars
-- Adds profiles.avatar_url and an `avatars` storage bucket with owner-only
-- writes + public read. Unlike the grandfathered bug-screenshots bucket (made
-- manually in the dashboard, predating this migrations workflow), this bucket
-- is migration-managed for reproducibility.
--
-- Object path convention: avatars/<auth.uid()>/avatar.jpg — one stable object
-- per user (uploaded with upsert:true from the client), not timestamp-named
-- like bug-screenshots, so re-uploads overwrite instead of accumulating.

-- 1. Column — profiles already has an owner-only update policy
--    (profiles_update_own, 0001_phase2_accounts_sync.sql), so no new table
--    policy is needed for this column.
alter table public.profiles
  add column if not exists avatar_url text;

-- 2. Public bucket (public read so <img src> works without signed URLs).
-- `do update` (not `do nothing`) so a pre-existing private bucket with this
-- id still gets flipped to public when this migration runs.
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do update set public = true;

-- 3. RLS on storage.objects — owner writes to their own `${uid}/…` folder only.
drop policy if exists "avatars_insert_own" on storage.objects;
create policy "avatars_insert_own" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_update_own" on storage.objects;
create policy "avatars_update_own" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "avatars_delete_own" on storage.objects;
create policy "avatars_delete_own" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- 4. Public read for the whole bucket. The bucket being `public = true`
--    already permits this via getPublicUrl; this policy is belt-and-suspenders
--    for direct Storage API reads.
drop policy if exists "avatars_read_public" on storage.objects;
create policy "avatars_read_public" on storage.objects
  for select to public
  using (bucket_id = 'avatars');
