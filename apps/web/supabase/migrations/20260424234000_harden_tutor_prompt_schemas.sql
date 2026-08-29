begin;

with schema_map as (
  select
    'tutor_explanation'::text as prompt_key,
    jsonb_build_object(
      'type', 'object',
      'additionalProperties', false,
      'required', jsonb_build_array('explanation', 'examples', 'check_question', 'redirected_to_focus'),
      'properties', jsonb_build_object(
        'explanation', jsonb_build_object('type', 'string'),
        'examples', jsonb_build_object(
          'type', 'array',
          'minItems', 2,
          'maxItems', 3,
          'items', jsonb_build_object(
            'type', 'object',
            'additionalProperties', false,
            'required', jsonb_build_array('incorrect', 'correct', 'why'),
            'properties', jsonb_build_object(
              'incorrect', jsonb_build_object('type', 'string'),
              'correct', jsonb_build_object('type', 'string'),
              'why', jsonb_build_object('type', 'string')
            )
          )
        ),
        'check_question', jsonb_build_object('type', 'string'),
        'redirected_to_focus', jsonb_build_object('type', 'boolean')
      )
    ) as expected_output_schema_json

  union all

  select
    'tutor_followup_answer'::text as prompt_key,
    jsonb_build_object(
      'type', 'object',
      'additionalProperties', false,
      'required', jsonb_build_array('answer', 'scope_ok', 'redirected_to_focus', 'next_question'),
      'properties', jsonb_build_object(
        'answer', jsonb_build_object('type', 'string'),
        'scope_ok', jsonb_build_object('type', 'boolean'),
        'redirected_to_focus', jsonb_build_object('type', 'boolean'),
        'next_question', jsonb_build_object('type', 'string')
      )
    ) as expected_output_schema_json

  union all

  select
    'understanding_check'::text as prompt_key,
    jsonb_build_object(
      'type', 'object',
      'additionalProperties', false,
      'required', jsonb_build_array('status', 'feedback', 'next_step', 'redirected_to_focus'),
      'properties', jsonb_build_object(
        'status', jsonb_build_object(
          'type', 'string',
          'enum', jsonb_build_array('not_yet', 'partial', 'sufficient')
        ),
        'feedback', jsonb_build_object('type', 'string'),
        'next_step', jsonb_build_object(
          'type', 'string',
          'enum', jsonb_build_array('clarification', 'transfer_ready')
        ),
        'redirected_to_focus', jsonb_build_object('type', 'boolean')
      )
    ) as expected_output_schema_json

  union all

  select
    'improvement_check'::text as prompt_key,
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
  expected_output_schema_json = sm.expected_output_schema_json,
  updated_at = timezone('utc', now())
from schema_map sm
where pd.prompt_key = sm.prompt_key
  and pd.is_active = true;

commit;
