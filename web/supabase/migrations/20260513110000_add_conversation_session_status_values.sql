do $$
begin
  if exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'conversation_session_status'
      and n.nspname = 'public'
  ) then
    alter type public.conversation_session_status add value if not exists 'insufficient_data';
    alter type public.conversation_session_status add value if not exists 'completed_capped';
    alter type public.conversation_session_status add value if not exists 'rejected_too_long';
  else
    raise notice 'type public.conversation_session_status does not exist; skipping enum extension';
  end if;
end
$$;
