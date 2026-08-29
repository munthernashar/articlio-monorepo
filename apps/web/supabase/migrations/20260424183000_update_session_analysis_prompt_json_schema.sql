begin;

do $$
declare
  v_target_id uuid;
  v_target_version integer;
  v_expected_schema jsonb :=
    jsonb_build_object(
      'type', 'object',
      'additionalProperties', false,
      'required', jsonb_build_array('category_scores', 'detected_patterns', 'priority_intervention', 'session_summary'),
      'properties', jsonb_build_object(
        'category_scores', jsonb_build_object(
          'type', 'object',
          'additionalProperties', false,
          'required', jsonb_build_array(
            'grammatical_accuracy',
            'lexical_appropriateness',
            'fluency',
            'intelligibility',
            'coherence_and_sentence_structure',
            'register_and_naturalness',
            'interactional_competence'
          ),
          'properties', jsonb_build_object(
            'grammatical_accuracy', jsonb_build_object(
              'type', 'object',
              'additionalProperties', false,
              'required', jsonb_build_array('score', 'confidence', 'justification', 'evidence'),
              'properties', jsonb_build_object(
                'score', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 5),
                'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
                'justification', jsonb_build_object('type', 'string', 'minLength', 1),
                'evidence', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'), 'default', jsonb_build_array())
              )
            ),
            'lexical_appropriateness', jsonb_build_object(
              'type', 'object',
              'additionalProperties', false,
              'required', jsonb_build_array('score', 'confidence', 'justification', 'evidence'),
              'properties', jsonb_build_object(
                'score', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 5),
                'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
                'justification', jsonb_build_object('type', 'string', 'minLength', 1),
                'evidence', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'), 'default', jsonb_build_array())
              )
            ),
            'fluency', jsonb_build_object(
              'type', 'object',
              'additionalProperties', false,
              'required', jsonb_build_array('score', 'confidence', 'justification', 'evidence'),
              'properties', jsonb_build_object(
                'score', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 5),
                'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
                'justification', jsonb_build_object('type', 'string', 'minLength', 1),
                'evidence', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'), 'default', jsonb_build_array())
              )
            ),
            'intelligibility', jsonb_build_object(
              'type', 'object',
              'additionalProperties', false,
              'required', jsonb_build_array('score', 'confidence', 'justification', 'evidence'),
              'properties', jsonb_build_object(
                'score', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 5),
                'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
                'justification', jsonb_build_object('type', 'string', 'minLength', 1),
                'evidence', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'), 'default', jsonb_build_array())
              )
            ),
            'coherence_and_sentence_structure', jsonb_build_object(
              'type', 'object',
              'additionalProperties', false,
              'required', jsonb_build_array('score', 'confidence', 'justification', 'evidence'),
              'properties', jsonb_build_object(
                'score', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 5),
                'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
                'justification', jsonb_build_object('type', 'string', 'minLength', 1),
                'evidence', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'), 'default', jsonb_build_array())
              )
            ),
            'register_and_naturalness', jsonb_build_object(
              'type', 'object',
              'additionalProperties', false,
              'required', jsonb_build_array('score', 'confidence', 'justification', 'evidence'),
              'properties', jsonb_build_object(
                'score', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 5),
                'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
                'justification', jsonb_build_object('type', 'string', 'minLength', 1),
                'evidence', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'), 'default', jsonb_build_array())
              )
            ),
            'interactional_competence', jsonb_build_object(
              'type', 'object',
              'additionalProperties', false,
              'required', jsonb_build_array('score', 'confidence', 'justification', 'evidence'),
              'properties', jsonb_build_object(
                'score', jsonb_build_object('type', 'integer', 'minimum', 0, 'maximum', 5),
                'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
                'justification', jsonb_build_object('type', 'string', 'minLength', 1),
                'evidence', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'), 'default', jsonb_build_array())
              )
            )
          )
        ),
        'detected_patterns', jsonb_build_object(
          'type', 'array',
          'default', jsonb_build_array(),
          'items', jsonb_build_object(
            'type', 'object',
            'additionalProperties', false,
            'required', jsonb_build_array(
              'pattern_key',
              'label',
              'description',
              'frequency_estimate',
              'communicative_impact',
              'category'
            ),
            'properties', jsonb_build_object(
              'pattern_key', jsonb_build_object('type', 'string', 'minLength', 1),
              'label', jsonb_build_object('type', 'string', 'minLength', 1),
              'description', jsonb_build_object('type', 'string', 'minLength', 1),
              'frequency_estimate', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('low', 'medium', 'high')),
              'communicative_impact', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('low', 'medium', 'high')),
              'category', jsonb_build_object(
                'type', 'string',
                'enum', jsonb_build_array(
                  'grammatical_accuracy',
                  'lexical_appropriateness',
                  'fluency',
                  'intelligibility',
                  'coherence_and_sentence_structure',
                  'register_and_naturalness',
                  'interactional_competence'
                )
              )
            )
          )
        ),
        'priority_intervention', jsonb_build_object(
          'type', 'object',
          'additionalProperties', false,
          'required', jsonb_build_array('pattern_key', 'label', 'reason'),
          'properties', jsonb_build_object(
            'pattern_key', jsonb_build_object('type', 'string', 'minLength', 1),
            'label', jsonb_build_object('type', 'string', 'minLength', 1),
            'reason', jsonb_build_object('type', 'string', 'minLength', 1)
          )
        ),
        'session_summary', jsonb_build_object('type', 'string', 'minLength', 1)
      )
    );
begin
  select id, version
  into v_target_id, v_target_version
  from public.prompt_definitions
  where prompt_key = 'session_analysis'
    and is_active = true
  order by version desc
  limit 1;

  if v_target_id is null then
    select id, version
    into v_target_id, v_target_version
    from public.prompt_definitions
    where prompt_key = 'session_analysis'
    order by version desc
    limit 1;
  end if;

  if v_target_id is null then
    insert into public.prompt_definitions (
      prompt_key,
      version,
      system_prompt,
      developer_prompt,
      user_prompt_template,
      model,
      max_output_tokens,
      is_active,
      expected_output_schema_json,
      metadata,
      response_format
    )
    values (
      'session_analysis',
      1,
      'Du bist ein unterstützender Sprachcoach für Deutschlernende. Du antwortest ausschließlich als valides JSON-Objekt.',
      'Nutze das Zielmodell gpt-5-mini. Analysiere genau eine Session und gib ausschließlich ein einziges JSON-Objekt zurück. Keine alternativen Antwortformen (kein Markdown, kein Freitext außerhalb des JSON, keine Erklärblöcke). Verwende exakt die vorgegebenen Schlüssel und Wertebereiche.',
      'Transkript (bereinigt): {{cleaned_transcript}}\nSprache: {{language_code}}\nAufgabe: Erstelle eine Session-Analyse mit category_scores, detected_patterns, priority_intervention und session_summary exakt gemäß Ausgabeschema.',
      'gpt-5-mini',
      1400,
      true,
      v_expected_schema,
      '{"pipeline_step":"session_analysis","schema_version":"2.0.0","categories":["grammatical_accuracy","lexical_appropriateness","fluency","intelligibility","coherence_and_sentence_structure","register_and_naturalness","interactional_competence"]}'::jsonb,
      'json_object'
    )
    on conflict (prompt_key, version) do update
    set
      developer_prompt = excluded.developer_prompt,
      user_prompt_template = excluded.user_prompt_template,
      model = excluded.model,
      expected_output_schema_json = excluded.expected_output_schema_json,
      metadata = coalesce(public.prompt_definitions.metadata, '{}'::jsonb) || excluded.metadata,
      response_format = excluded.response_format,
      is_active = true,
      updated_at = timezone('utc', now());

    update public.prompt_definitions
    set
      is_active = (version = 1),
      updated_at = timezone('utc', now())
    where prompt_key = 'session_analysis';
  else
    update public.prompt_definitions
    set
      developer_prompt = 'Nutze das Zielmodell gpt-5-mini. Analysiere genau eine Session und gib ausschließlich ein einziges JSON-Objekt zurück. Keine alternativen Antwortformen (kein Markdown, kein Freitext außerhalb des JSON, keine Erklärblöcke). Verwende exakt die vorgegebenen Schlüssel und Wertebereiche.',
      user_prompt_template = 'Transkript (bereinigt): {{cleaned_transcript}}\nSprache: {{language_code}}\nAufgabe: Erstelle eine Session-Analyse mit category_scores, detected_patterns, priority_intervention und session_summary exakt gemäß Ausgabeschema.',
      model = 'gpt-5-mini',
      expected_output_schema_json = v_expected_schema,
      metadata = coalesce(metadata, '{}'::jsonb) || '{"pipeline_step":"session_analysis","schema_version":"2.0.0"}'::jsonb,
      response_format = 'json_object',
      is_active = true,
      updated_at = timezone('utc', now())
    where id = v_target_id;

    update public.prompt_definitions
    set
      is_active = false,
      updated_at = timezone('utc', now())
    where prompt_key = 'session_analysis'
      and id <> v_target_id
      and is_active = true;
  end if;
end $$;

commit;
