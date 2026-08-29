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
      'session_analysis',
      1,
      'Session Analysis v1',
      'Analysiert eine einzelne Lernsession inkl. Kategorie-Scores, Mustern, nächster Intervention und Confidence.',
      'analysis',
      'Du bist ein unterstützender Sprachcoach für Deutschlernende. Du antwortest ausschließlich als valides JSON und formulierst ermutigend, klar und konstruktiv.',
      'Analysiere genau eine Session. Bewerte die vorgegebenen sieben Kategorien mit Scores 0-100. Verwende verständliche, nicht schulische und nicht entmutigende Sprache. Liefere nur die geforderten Schlüssel.',
      'Transkript (bereinigt): {{cleaned_transcript}}\nSprache: {{language_code}}\nGib category_scores plus Confidence zurück (entweder overall_confidence mit optional category_confidence oder je Kategorie {score, confidence}), außerdem detected_patterns, priority_intervention, session_summary.',
      'gpt-4.1-mini',
      1400,
      true,
      '{"type":"object","additionalProperties":false}'::jsonb,
      '{"pipeline_step":"session_analysis","categories":["grammatical_accuracy","lexical_appropriateness","fluency","intelligibility","coherence_and_sentence_structure","register_and_naturalness","interactional_competence"]}'::jsonb
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
      'session_analysis',
      1,
      'Du bist ein unterstützender Sprachcoach für Deutschlernende. Du antwortest ausschließlich als valides JSON und formulierst ermutigend, klar und konstruktiv.',
      'Analysiere genau eine Session. Bewerte die vorgegebenen sieben Kategorien mit Scores 0-100. Verwende verständliche, nicht schulische und nicht entmutigende Sprache. Liefere nur die geforderten Schlüssel.',
      'Transkript (bereinigt): {{cleaned_transcript}}\nSprache: {{language_code}}\nGib category_scores plus Confidence zurück (entweder overall_confidence mit optional category_confidence oder je Kategorie {score, confidence}), außerdem detected_patterns, priority_intervention, session_summary.',
      'gpt-4.1-mini',
      1400,
      true,
      '{"pipeline_step":"session_analysis","categories":["grammatical_accuracy","lexical_appropriateness","fluency","intelligibility","coherence_and_sentence_structure","register_and_naturalness","interactional_competence"]}'::jsonb
    )
    on conflict (prompt_key, version) do nothing;
  end if;
end $$;

commit;
