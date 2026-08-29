begin;

update public.conversation_sessions
set status = 'recording'
where status = 'active';

update public.conversation_sessions
set status = case
  when coalesce(metadata #>> '{processing,analysisStatus}', '') = 'completed' then 'analyzed'::public.conversation_session_status
  when coalesce(metadata #>> '{processing,transcriptStatus}', '') = 'completed' then 'transcribed'::public.conversation_session_status
  else 'uploaded'::public.conversation_session_status
end
where status = 'processing';

commit;
