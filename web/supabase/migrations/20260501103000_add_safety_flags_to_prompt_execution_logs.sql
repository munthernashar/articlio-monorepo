alter table public.prompt_execution_logs
add column if not exists safety_flags jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
