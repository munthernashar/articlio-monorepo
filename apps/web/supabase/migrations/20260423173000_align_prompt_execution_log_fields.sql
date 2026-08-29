begin;

alter table public.prompt_execution_logs
  add column if not exists user_id uuid references public.profiles (id) on delete set null,
  add column if not exists session_id uuid references public.conversation_sessions (id) on delete set null,
  add column if not exists feature_name text,
  add column if not exists input_payload_json jsonb not null default '{}'::jsonb,
  add column if not exists rendered_prompt_json jsonb not null default '{}'::jsonb,
  add column if not exists raw_model_output text,
  add column if not exists success boolean;

update public.prompt_execution_logs
set
  user_id = coalesce(user_id, created_by),
  session_id = coalesce(
    session_id,
    case
      when jsonb_typeof(request_payload) = 'object'
        and (request_payload -> 'execution_context' ->> 'sessionId') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then (request_payload -> 'execution_context' ->> 'sessionId')::uuid
      else null
    end
  ),
  feature_name = coalesce(feature_name, pipeline_step, prompt_key, 'unknown'),
  input_payload_json = coalesce(input_payload_json, test_input, request_payload, '{}'::jsonb),
  rendered_prompt_json = coalesce(
    rendered_prompt_json,
    jsonb_build_object('user_prompt', rendered_user_prompt)
  ),
  raw_model_output = coalesce(raw_model_output, raw_response),
  success = coalesce(success, status = 'success');

update public.prompt_execution_logs
set
  feature_name = coalesce(feature_name, 'unknown'),
  success = coalesce(success, false)
where feature_name is null or success is null;

alter table public.prompt_execution_logs
  alter column feature_name set default 'unknown',
  alter column feature_name set not null,
  alter column success set default false,
  alter column success set not null;

create index if not exists idx_prompt_execution_logs_user_created
  on public.prompt_execution_logs (user_id, created_at desc);

create index if not exists idx_prompt_execution_logs_session_created
  on public.prompt_execution_logs (session_id, created_at desc);

create index if not exists idx_prompt_execution_logs_feature_created
  on public.prompt_execution_logs (feature_name, created_at desc);

commit;
