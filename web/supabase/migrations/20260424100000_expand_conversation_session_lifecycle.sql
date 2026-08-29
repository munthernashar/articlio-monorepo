begin;

alter type public.conversation_session_status add value if not exists 'recording';
alter type public.conversation_session_status add value if not exists 'uploaded';
alter type public.conversation_session_status add value if not exists 'transcribed';
alter type public.conversation_session_status add value if not exists 'analyzed';
alter type public.conversation_session_status add value if not exists 'feedback_ready';
alter type public.conversation_session_status add value if not exists 'training_in_progress';

commit;
