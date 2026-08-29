begin;

-- Compatibility layer for dashboards/parsers that still expect Chat Completions payloads in raw_response.
update public.prompt_execution_logs
set raw_response = jsonb_build_object(
  'choices',
  jsonb_build_array(
    jsonb_build_object(
      'message',
      jsonb_build_object(
        'role',
        'assistant',
        'content',
        coalesce(raw_model_output, raw_response, '')
      )
    )
  )
)::text
where coalesce(raw_response, '') <> ''
  and raw_response not ilike '%"choices"%';

commit;
