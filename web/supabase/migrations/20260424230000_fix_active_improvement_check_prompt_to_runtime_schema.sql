begin;

with runtime_payload as (
  select
    'Vergleiche die Entwicklung NUR für das angegebene Fokus-Thema konservativ mit der Baseline. Wenn die Datenlage nicht reicht oder die Evidenz nicht klar ist, gib insufficient_data zurück. Eine Entscheidung ist nur gültig, wenn die Evidenz eindeutig dem Fokus-Thema zugeordnet ist. Bewerte nicht mehrere Themen gleichzeitig und vermeide optimistische Überinterpretation. Aktueller focus_topic_key: {{current_focus_topic_key}}. Fokus-Thema: {{focus_topic_title}}. Themenkategorie: {{focus_pattern_type}}. Baseline (JSON): {{baseline_json}}. Neuere freie Sessions (JSON): {{recent_sessions_json}}. Anzahl neuer Sessions: {{recent_session_count}}. Wenn baseline_evidence/current_evidence nicht eindeutig zum current_focus_topic_key/focus_topic_title/focus_pattern_type passen, setze focus_topic_key_match=false, focus_topic_match=false und decision=insufficient_data. Antworte NUR als JSON mit exakt diesen Feldern: {"decision":"improved|unchanged|worsened|insufficient_data","confidence":0.0-1.0,"rationale":"string","focus_evidence":"string","baseline_evidence":["string"],"current_evidence":["string"],"focus_topic_key":"string","focus_topic_key_match":boolean,"focus_topic_match":boolean,"evidence_quality":"low|medium|high(optional)","recommendation":"string"}.'::text as developer_prompt,
    jsonb_build_object(
      'type', 'object',
      'additionalProperties', false,
      'required', jsonb_build_array(
        'decision',
        'confidence',
        'rationale',
        'focus_evidence',
        'baseline_evidence',
        'current_evidence',
        'focus_topic_key',
        'focus_topic_key_match',
        'focus_topic_match',
        'recommendation'
      ),
      'properties', jsonb_build_object(
        'decision', jsonb_build_object(
          'type', 'string',
          'enum', jsonb_build_array('improved', 'unchanged', 'worsened', 'insufficient_data')
        ),
        'confidence', jsonb_build_object('type', 'number', 'minimum', 0, 'maximum', 1),
        'rationale', jsonb_build_object('type', 'string'),
        'focus_evidence', jsonb_build_object('type', 'string'),
        'baseline_evidence', jsonb_build_object(
          'type', 'array',
          'items', jsonb_build_object('type', 'string')
        ),
        'current_evidence', jsonb_build_object(
          'type', 'array',
          'items', jsonb_build_object('type', 'string')
        ),
        'focus_topic_key', jsonb_build_object('type', 'string'),
        'focus_topic_key_match', jsonb_build_object('type', 'boolean'),
        'focus_topic_match', jsonb_build_object('type', 'boolean'),
        'evidence_quality', jsonb_build_object(
          'type', 'string',
          'enum', jsonb_build_array('low', 'medium', 'high')
        ),
        'recommendation', jsonb_build_object('type', 'string')
      )
    ) as expected_output_schema_json
)
update public.prompt_definitions pd
set
  developer_prompt = rp.developer_prompt,
  expected_output_schema_json = rp.expected_output_schema_json,
  updated_at = timezone('utc', now())
from runtime_payload rp
where pd.prompt_key = 'improvement_check'
  and pd.is_active = true;

update public.prompt_definitions
set
  is_active = false,
  updated_at = timezone('utc', now())
where prompt_key = 'improvement_check'
  and is_active = true
  and id <> (
    select id
    from public.prompt_definitions
    where prompt_key = 'improvement_check'
      and is_active = true
    order by version desc, updated_at desc
    limit 1
  );

commit;
