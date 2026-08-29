begin;

update public.prompt_definitions
set
  system_prompt = 'Du bereitest Rohtranskripte für die Sprachanalyse auf und antwortest ausschließlich als valides JSON.',
  developer_prompt = 'Liefere cleaned_transcript, sprechersegmentierte utterances sowie notes mit cleanup_actions, filler_word_annotations, sentence_fragment_annotations, uncertainty_markers und quality_indicators.',
  user_prompt_template =
    'Rohtranskript: {{raw_transcript}}\n'
    'Aufgabe:\n'
    '- normalisiere das Transkript für Analysezwecke (Interpunktion/Basisnormalisierung),\n'
    '- segmentiere in utterances mit Sprecherrolle learner|tutor|unknown,\n'
    '- entferne/normalisiere Füllwörter im cleaned_transcript, markiere sie aber in notes.filler_word_annotations,\n'
    '- erkenne Satzfragmente und gib sie in notes.sentence_fragment_annotations aus,\n'
    '- gib Unsicherheiten in notes.uncertainty_markers aus,\n'
    '- gib Qualitätsindikatoren in notes.quality_indicators aus.\n'
    'Wenn ein Bereich keine Treffer hat: leeres Array verwenden.',
  metadata = coalesce(metadata, '{}'::jsonb) || '{"pipeline_step":"session_transcript_cleanup_v2"}'::jsonb,
  response_format = 'json_object',
  updated_at = timezone('utc', now())
where prompt_key = 'session_transcript_cleanup'
  and version = 1;

commit;
