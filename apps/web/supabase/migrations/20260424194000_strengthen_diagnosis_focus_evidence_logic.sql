begin;

update public.app_settings
set min_sessions_for_diagnosis = greatest(3, least(5, min_sessions_for_diagnosis)),
    updated_at = timezone('utc', now())
where id = 'global';

alter table public.app_settings
  alter column min_sessions_for_diagnosis set default 3;

update public.prompt_definitions
set
  developer_prompt = E'Analysiere stabile, wiederkehrende Muster über 3 bis 5 Sessions. Session-Anzahl allein reicht nie.\n\nNutze für jedes Muster:\n- pattern_key\n- label\n- description\n- recurrence (0.0-1.0)\n- confidence (0.0-1.0)\n- supporting_sessions\n- communicative_impact\n- evidence\n\nJSON:\n{\n  "enough_data": boolean,\n  "stable_patterns": [\n    {\n      "pattern_key": "string",\n      "label": "string",\n      "description": "string",\n      "recurrence": 0.0,\n      "confidence": 0.0,\n      "supporting_sessions": ["string"],\n      "communicative_impact": "low|medium|high",\n      "evidence": ["string"]\n    }\n  ]\n}',
  user_prompt_template = E'Input (JSON): {{session_analyses_json}}\nAnzahl Sessions: {{session_count}}\nMindestanzahl für Diagnose: {{min_sessions_for_diagnosis}}',
  expected_output_schema_json = jsonb_build_object(
    'type', 'object',
    'additionalProperties', false,
    'required', jsonb_build_array('enough_data', 'stable_patterns'),
    'properties', jsonb_build_object(
      'enough_data', jsonb_build_object('type', 'boolean'),
      'stable_patterns', jsonb_build_object(
        'type', 'array',
        'items', jsonb_build_object(
          'type', 'object',
          'additionalProperties', false,
          'required', jsonb_build_array('pattern_key', 'label', 'description', 'recurrence', 'confidence', 'supporting_sessions', 'communicative_impact', 'evidence'),
          'properties', jsonb_build_object(
            'pattern_key', jsonb_build_object('type', 'string'),
            'label', jsonb_build_object('type', 'string'),
            'description', jsonb_build_object('type', 'string'),
            'recurrence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
            'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
            'supporting_sessions', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string')),
            'communicative_impact', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('low', 'medium', 'high')),
            'evidence', jsonb_build_object('type', 'array', 'items', jsonb_build_object('type', 'string'))
          )
        )
      )
    )
  ),
  updated_at = timezone('utc', now())
where prompt_key = 'multi_session_pattern_detection'
  and is_active = true;

update public.prompt_definitions
set
  developer_prompt = E'Wähle genau ein Haupt-Fokus-Thema nur bei ausreichend starker Evidenz.\n\nErlaubtes Antwortmodell:\n- selected\n- insufficient_evidence\n\nBei insufficient_evidence muss focus_topic = null sein.\nBei selected muss focus_topic vollständig sein.\nAlle Scores sind 0.0-1.0.',
  user_prompt_template = E'Stable patterns (JSON): {{stable_patterns_json}}\nAnzahl Sessions: {{session_count}}\nMindestanzahl für Diagnose: {{min_sessions_for_diagnosis}}',
  expected_output_schema_json = jsonb_build_object(
    'type', 'object',
    'additionalProperties', false,
    'required', jsonb_build_array('selection_status', 'focus_topic', 'reason', 'evidence_summary'),
    'properties', jsonb_build_object(
      'selection_status', jsonb_build_object('type', 'string', 'enum', jsonb_build_array('selected', 'insufficient_evidence')),
      'focus_topic', jsonb_build_object(
        'oneOf', jsonb_build_array(
          jsonb_build_object('type', 'null'),
          jsonb_build_object(
            'type', 'object',
            'additionalProperties', false,
            'required', jsonb_build_array('topic_key', 'label', 'short_explanation', 'reason', 'source_pattern_key'),
            'properties', jsonb_build_object(
              'topic_key', jsonb_build_object('type', 'string'),
              'label', jsonb_build_object('type', 'string'),
              'short_explanation', jsonb_build_object('type', 'string'),
              'reason', jsonb_build_object('type', 'string'),
              'source_pattern_key', jsonb_build_object('type', 'string')
            )
          )
        )
      ),
      'reason', jsonb_build_object('type', 'string'),
      'evidence_summary', jsonb_build_object(
        'type', 'object',
        'additionalProperties', false,
        'required', jsonb_build_array('sessions_analyzed', 'strongest_pattern_key', 'recurrence', 'confidence', 'communicative_impact', 'learner_readiness'),
        'properties', jsonb_build_object(
          'sessions_analyzed', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 8),
          'strongest_pattern_key', jsonb_build_object('type', jsonb_build_array('string', 'null')),
          'recurrence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
          'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
          'communicative_impact', jsonb_build_object('type', jsonb_build_array('string', 'null'), 'enum', jsonb_build_array('low', 'medium', 'high', null)),
          'learner_readiness', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1)
        )
      )
    )
  ),
  updated_at = timezone('utc', now())
where prompt_key = 'focus_topic_selector'
  and is_active = true;

update public.prompt_definitions
set
  user_prompt_template = E'Aktueller focus_topic_key: {{current_focus_topic_key}}\nFokus-Thema: {{focus_topic_title}}\nThemenkategorie: {{focus_pattern_type}}\nBaseline (JSON): {{baseline_json}}\nNeuere freie Sessions (JSON): {{recent_sessions_json}}\nAnzahl neuer Sessions: {{recent_session_count}}',
  prompt_variables_definition_json = jsonb_build_array(
    jsonb_build_object(
      'name', 'current_focus_topic_key',
      'type', 'string',
      'required', true,
      'description', 'Eindeutiger Runtime-Key des aktuell trainierten Fokus-Themas.'
    ),
    jsonb_build_object(
      'name', 'focus_topic_title',
      'type', 'string',
      'required', true,
      'description', 'Titel/Label des aktuell trainierten Fokus-Themas.'
    ),
    jsonb_build_object(
      'name', 'focus_pattern_type',
      'type', 'string',
      'required', true,
      'description', 'Kategorie bzw. Pattern-Typ des Fokus-Themas.'
    ),
    jsonb_build_object(
      'name', 'baseline_json',
      'type', 'string',
      'required', true,
      'description', 'JSON-String mit Baseline-Evidenz vor der Intervention.'
    ),
    jsonb_build_object(
      'name', 'recent_sessions_json',
      'type', 'string',
      'required', true,
      'description', 'JSON-String mit aktuellen freien Sessions nach der Intervention.'
    ),
    jsonb_build_object(
      'name', 'recent_session_count',
      'type', 'string',
      'required', true,
      'description', 'Anzahl der ausgewerteten aktuellen Sessions als String.'
    )
  ),
  updated_at = timezone('utc', now())
where prompt_key = 'improvement_check'
  and is_active = true;

commit;
