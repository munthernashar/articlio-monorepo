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
      'dashboard_summary',
      1,
      'Dashboard Summary',
      'Fasst den aktuellen Dashboard-Stand positiv und datenbasiert zusammen.',
      'dashboard',
      'Du bist ein Lernfortschritt-Assistent und antwortest ausschließlich als valides JSON.',
      'Fasse den aktuellen Dashboard-Stand positiv, präzise und datenbasiert zusammen. Keine zusätzlichen Felder ausgeben.',
      'Dashboard-Daten (JSON): {{dashboard_payload_json}}. Gib summary, next_action und confidence_note zurück.',
      'gpt-4.1-mini',
      450,
      true,
      '{"type":"object","additionalProperties":true}'::jsonb,
      '{"flow":"dashboard_data_pipeline","prompt_id":"dashboard_summary"}'::jsonb
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
      'dashboard_summary',
      1,
      'Du bist ein Lernfortschritt-Assistent und antwortest ausschließlich als valides JSON.',
      'Fasse den aktuellen Dashboard-Stand positiv, präzise und datenbasiert zusammen. Keine zusätzlichen Felder ausgeben.',
      'Dashboard-Daten (JSON): {{dashboard_payload_json}}. Gib summary, next_action und confidence_note zurück.',
      'gpt-4.1-mini',
      450,
      true,
      '{"flow":"dashboard_data_pipeline","prompt_id":"dashboard_summary"}'::jsonb
    )
    on conflict (prompt_key, version) do nothing;
  end if;
end $$;

commit;
