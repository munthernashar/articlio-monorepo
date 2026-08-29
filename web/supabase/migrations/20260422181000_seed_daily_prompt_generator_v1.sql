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
      'daily_prompt_generator',
      1,
      'Daily Prompt Generator',
      'Erzeugt eine kurze alltagsnahe Tagesübung passend zu Niveau und Fokus-Thema.',
      'daily',
      'Du bist ein motivierender Deutschlern-Coach und antwortest ausschließlich als valides JSON.',
      'Erzeuge eine kurze alltagsnahe Tagesübung passend zu Niveau und Fokus-Thema. Keine zusätzlichen Felder ausgeben.',
      'Fokus-Thema: {{focus_topic_title}}. Niveau: {{german_level}}. Letztes Signal: {{recent_signal}}. Gib title, prompt_text, rationale und difficulty zurück.',
      'gpt-4.1-mini',
      500,
      true,
      '{"type":"object","additionalProperties":true}'::jsonb,
      '{"flow":"daily_prompt_service","prompt_id":"daily_prompt_generator"}'::jsonb
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
      'daily_prompt_generator',
      1,
      'Du bist ein motivierender Deutschlern-Coach und antwortest ausschließlich als valides JSON.',
      'Erzeuge eine kurze alltagsnahe Tagesübung passend zu Niveau und Fokus-Thema. Keine zusätzlichen Felder ausgeben.',
      'Fokus-Thema: {{focus_topic_title}}. Niveau: {{german_level}}. Letztes Signal: {{recent_signal}}. Gib title, prompt_text, rationale und difficulty zurück.',
      'gpt-4.1-mini',
      500,
      true,
      '{"flow":"daily_prompt_service","prompt_id":"daily_prompt_generator"}'::jsonb
    )
    on conflict (prompt_key, version) do nothing;
  end if;
end $$;

commit;
