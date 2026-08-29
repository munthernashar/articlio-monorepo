begin;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'prompt_definitions'
      and column_name = 'name'
  ) then
    insert into public.prompt_definitions (
      prompt_key,
      version,
      name,
      description,
      category,
      system_prompt,
      developer_prompt,
      user_prompt_template,
      model,
      max_output_tokens,
      is_active,
      expected_output_schema_json,
      metadata
    )
    values (
      'json_repair',
      1,
      'JSON Repair',
      'Repariert fehlerhaftes JSON minimal-invasiv ohne neue Inhalte zu erfinden.',
      'utility',
      'Du bist ein JSON-Reparatur-Assistent und antwortest ausschließlich als valides JSON.',
      'Repariere kaputtes JSON minimal-invasiv ohne neue Inhalte zu erfinden.',
      'Fehler: {{parse_error}}. Defekter Text: {{invalid_json_text}}. Gib repaired_json zurück.',
      'gpt-4.1-mini',
      900,
      true,
      '{"type":"object","additionalProperties":true}'::jsonb,
      '{"flow":"prompt_execution_error_path","prompt_id":"json_repair"}'::jsonb
    )
    on conflict (prompt_key, version) do nothing;
  else
    insert into public.prompt_definitions (
      prompt_key,
      version,
      system_prompt,
      developer_prompt,
      user_prompt_template,
      model,
      max_output_tokens,
      is_active,
      metadata
    )
    values (
      'json_repair',
      1,
      'Du bist ein JSON-Reparatur-Assistent und antwortest ausschließlich als valides JSON.',
      'Repariere kaputtes JSON minimal-invasiv ohne neue Inhalte zu erfinden.',
      'Fehler: {{parse_error}}. Defekter Text: {{invalid_json_text}}. Gib repaired_json zurück.',
      'gpt-4.1-mini',
      900,
      true,
      '{"flow":"prompt_execution_error_path","prompt_id":"json_repair"}'::jsonb
    )
    on conflict (prompt_key, version) do nothing;
  end if;
end $$;

commit;
