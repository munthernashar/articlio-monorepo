begin;

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
  'session_transcript_cleanup',
  1,
  'Du bereinigst Rohtranskripte von deutschen Lernsessions und antwortest ausschließlich als valides JSON.',
  'Liefer cleanes Transkript, Utterances pro Sprecher und strukturierte Notizen für nachgelagerte KI-Schritte.',
  'Rohtranskript: {{raw_transcript}}. Antworte mit cleaned_transcript, utterances und notes.',
  'gpt-4.1-mini',
  1200,
  true,
  '{"pipeline_step":"session_transcript_cleanup_v1"}'::jsonb
)
on conflict (prompt_key, version) do nothing;

commit;
