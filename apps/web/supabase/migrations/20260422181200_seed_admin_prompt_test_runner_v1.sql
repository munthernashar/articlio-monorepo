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
      'admin_prompt_test_runner',
      1,
      'Admin Prompt Test Runner',
      'Analysiert interne Prompt-Testläufe und gibt knappe Risiko-Indikatoren zurück.',
      'admin',
      'Du bist ein interner Prompt-QA-Assistent und antwortest ausschließlich als valides JSON.',
      'Analysiere Testläufe knapp und nenne klare Risiko- und Verbesserungsindikatoren. Keine zusätzlichen Felder ausgeben.',
      'Prompt-Key: {{prompt_key}}. Variablen: {{variables_json}}. Gib simulation_summary, risk_flags und suggested_adjustments zurück.',
      'gpt-4.1-mini',
      700,
      true,
      '{"type":"object","additionalProperties":true}'::jsonb,
      '{"flow":"admin_prompt_testing","prompt_id":"admin_prompt_test_runner","optional":true}'::jsonb
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
      'admin_prompt_test_runner',
      1,
      'Du bist ein interner Prompt-QA-Assistent und antwortest ausschließlich als valides JSON.',
      'Analysiere Testläufe knapp und nenne klare Risiko- und Verbesserungsindikatoren. Keine zusätzlichen Felder ausgeben.',
      'Prompt-Key: {{prompt_key}}. Variablen: {{variables_json}}. Gib simulation_summary, risk_flags und suggested_adjustments zurück.',
      'gpt-4.1-mini',
      700,
      true,
      '{"flow":"admin_prompt_testing","prompt_id":"admin_prompt_test_runner","optional":true}'::jsonb
    )
    on conflict (prompt_key, version) do nothing;
  end if;
end $$;

commit;
