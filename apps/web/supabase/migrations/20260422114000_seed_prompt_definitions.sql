begin;

-- LEGACY-SEED (historisch):
-- Diese Schlüssel wurden in späteren Migrationen durch kanonische prompt_keys ersetzt
-- (u. a. 20260424170000_migrate_prompt_keys_to_canonical.sql und neuere *seed*_v1 Dateien).
-- Die Datei bleibt zur Nachvollziehbarkeit bestehen und ist absichtlich vom Prompt-Key-Audit ausgenommen.

do $$
begin
  -- Backward-/Forward-Kompatibilität:
  -- - In älteren Schemas existieren Metadaten-Spalten noch nicht.
  -- - In neueren Schemas greifen NOT NULL + Längen-Constraints auf name/description/category.
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
      expected_output_schema_json,
      system_prompt,
      developer_prompt,
      user_prompt_template,
      model,
      max_output_tokens,
      is_active
    )
    values
      (
        'coach_feedback',
        1,
        'Coach Feedback',
        'Legacy seed for coach feedback prompt definition.',
        'general',
        '{"type":"object","additionalProperties":true}'::jsonb,
        'Du bist ein präziser Deutsch-Coach und lieferst ausschließlich valides JSON.',
        'Analysiere Grammatik, Wortschatz und Natürlichkeit. Keine zusätzlichen Schlüssel ausgeben.',
        'Analysiere diese Lerneräußerung: "{{learner_utterance}}". Niveau: {{level}}. Gib summary, corrections und next_steps zurück.',
        'gpt-4.1-mini',
        700,
        true
      ),
      (
        'session_transcript_analysis',
        1,
        'Session Transcript Analysis',
        'Legacy seed for transcript analysis prompt definition.',
        'general',
        '{"type":"object","additionalProperties":true}'::jsonb,
        'Du bist ein Tutor-Assistent für Auswertung von deutschen Gesprächstranskripten und antwortest als JSON.',
        'Liefere Fehlercluster, Stärken und priorisierte Empfehlungen in strukturierter Form.',
        'Transkript: {{transcript}}. Lernziel: {{learning_goal}}. Antworte mit Feldern strengths, issues, recommendations.',
        'gpt-4.1-mini',
        900,
        true
      ),
      (
        'focus_topic_extraction',
        1,
        'Focus Topic Extraction',
        'Legacy seed for focus topic extraction prompt definition.',
        'general',
        '{"type":"object","additionalProperties":true}'::jsonb,
        'Du extrahierst Lernfokusthemen aus Analysen. Antworte nur als valides JSON.',
        'Erzeuge topic_key, title, priority, confidence und reasoning pro Eintrag.',
        'Input-Analyse: {{analysis_json}}. Maximal {{max_topics}} Themen extrahieren.',
        'gpt-4.1-mini',
        800,
        true
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
      is_active
    )
    values
      (
        'coach_feedback',
        1,
        'Du bist ein präziser Deutsch-Coach und lieferst ausschließlich valides JSON.',
        'Analysiere Grammatik, Wortschatz und Natürlichkeit. Keine zusätzlichen Schlüssel ausgeben.',
        'Analysiere diese Lerneräußerung: "{{learner_utterance}}". Niveau: {{level}}. Gib summary, corrections und next_steps zurück.',
        'gpt-4.1-mini',
        700,
        true
      ),
      (
        'session_transcript_analysis',
        1,
        'Du bist ein Tutor-Assistent für Auswertung von deutschen Gesprächstranskripten und antwortest als JSON.',
        'Liefere Fehlercluster, Stärken und priorisierte Empfehlungen in strukturierter Form.',
        'Transkript: {{transcript}}. Lernziel: {{learning_goal}}. Antworte mit Feldern strengths, issues, recommendations.',
        'gpt-4.1-mini',
        900,
        true
      ),
      (
        'focus_topic_extraction',
        1,
        'Du extrahierst Lernfokusthemen aus Analysen. Antworte nur als valides JSON.',
        'Erzeuge topic_key, title, priority, confidence und reasoning pro Eintrag.',
        'Input-Analyse: {{analysis_json}}. Maximal {{max_topics}} Themen extrahieren.',
        'gpt-4.1-mini',
        800,
        true
      )
    on conflict (prompt_key, version) do nothing;
  end if;
end
$$;

commit;
