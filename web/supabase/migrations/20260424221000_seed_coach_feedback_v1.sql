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
      'coach_feedback',
      1,
      'Coach Feedback',
      'Erzeugt strukturiertes Coach-Feedback für kurze Lerneräußerungen.',
      'coaching',
      'Du bist ein präziser Deutsch-Coach und lieferst ausschließlich valides JSON.',
      'Analysiere Grammatik, Wortschatz und Natürlichkeit. Keine zusätzlichen Schlüssel ausgeben.',
      'Analysiere diese Lerneräußerung: "{{learner_utterance}}". Niveau: {{level}}. Gib summary, corrections und next_steps zurück.',
      'gpt-4.1-mini',
      700,
      true,
      '{"type":"object","additionalProperties":true}'::jsonb,
      '{"flow":"coach_feedback","prompt_id":"coach_feedback"}'::jsonb
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
      'coach_feedback',
      1,
      'Du bist ein präziser Deutsch-Coach und lieferst ausschließlich valides JSON.',
      'Analysiere Grammatik, Wortschatz und Natürlichkeit. Keine zusätzlichen Schlüssel ausgeben.',
      'Analysiere diese Lerneräußerung: "{{learner_utterance}}". Niveau: {{level}}. Gib summary, corrections und next_steps zurück.',
      'gpt-4.1-mini',
      700,
      true,
      '{"flow":"coach_feedback","prompt_id":"coach_feedback"}'::jsonb
    )
    on conflict (prompt_key, version) do nothing;
  end if;
end $$;

commit;
