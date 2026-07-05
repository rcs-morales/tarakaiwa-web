-- Phase 3 — API proxy quota helper
--
-- Atomic check-and-increment for the api_usage table (created in 0001). The
-- Cloudflare Pages Functions proxy calls this with the SERVICE-ROLE key before
-- forwarding a request to Groq: it reserves quota for the call and reports
-- whether the daily limit was already reached.
--
-- SECURITY DEFINER so it can write api_usage (which has RLS enabled and no
-- policies). Execute is REVOKED from anon/authenticated so a signed-in user
-- can't call it directly via PostgREST and hand themselves free quota — only
-- the service-role key (which the proxy holds server-side) may run it.

create or replace function public.increment_api_usage(
  p_user_id       uuid,
  p_chat_delta    int     default 0,
  p_whisper_delta numeric default 0,
  p_chat_limit    int     default 200,
  p_whisper_limit numeric default 600
)
returns table (allowed boolean, chat_requests int, whisper_seconds numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_chat    int;
  v_whisper numeric;
begin
  -- Ensure today's row exists, then lock it for the check-and-increment.
  insert into public.api_usage (user_id, day, chat_requests, whisper_seconds)
  values (p_user_id, current_date, 0, 0)
  on conflict (user_id, day) do nothing;

  select au.chat_requests, au.whisper_seconds
    into v_chat, v_whisper
  from public.api_usage au
  where au.user_id = p_user_id and au.day = current_date
  for update;

  -- Reject if this call would push either counter past its daily cap.
  if (v_chat + p_chat_delta > p_chat_limit)
     or (v_whisper + p_whisper_delta > p_whisper_limit) then
    allowed := false;
    chat_requests := v_chat;
    whisper_seconds := v_whisper;
    return next;
    return;
  end if;

  update public.api_usage au
     set chat_requests   = au.chat_requests + p_chat_delta,
         whisper_seconds = au.whisper_seconds + p_whisper_delta
   where au.user_id = p_user_id and au.day = current_date
   returning au.chat_requests, au.whisper_seconds
        into v_chat, v_whisper;

  allowed := true;
  chat_requests := v_chat;
  whisper_seconds := v_whisper;
  return next;
end;
$$;

-- Lock down increment to the service role only (proxy needs this).
revoke all on function public.increment_api_usage(uuid, int, numeric, int, numeric) from public;
revoke all on function public.increment_api_usage(uuid, int, numeric, int, numeric) from anon;
revoke all on function public.increment_api_usage(uuid, int, numeric, int, numeric) from authenticated;
grant execute on function public.increment_api_usage(uuid, int, numeric, int, numeric) to service_role;

-- But let authenticated users *read* their own usage (for the quota indicator).
create or replace function public.get_api_usage()
returns table (chat_requests int, whisper_seconds numeric)
language sql
security definer
set search_path = public
as $$
  select au.chat_requests, au.whisper_seconds
  from public.api_usage au
  where au.user_id = auth.uid() and au.day = current_date;
$$;

grant execute on function public.get_api_usage() to authenticated;
