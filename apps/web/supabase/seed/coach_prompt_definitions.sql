begin;

with target_prompts as (
  select *
  from jsonb_to_recordset(
    '[
      {
        "prompt_key":"coach_training_recommendation",
        "version":1,
        "name":"Coach Training Recommendation",
        "description":"Leitet eine konkrete Trainingsrichtung für die nächste Lernphase ab.",
        "system_prompt":"",
        "developer_prompt":"",
        "user_prompt_template":"",
        "model":"gpt-4.1-mini",
        "max_output_tokens":650,
        "expected_output_schema_json":{"type":"object","additionalProperties":false,"required":["recommendation","rationale","practice_format","time_scope"],"properties":{"recommendation":{"type":"string"},"rationale":{"type":"string"},"practice_format":{"type":"string"},"time_scope":{"type":"string"}}},
        "prompt_variables_definition_json":[{"key":"learner_profile_json","type":"string","required":true},{"key":"pattern_summary_json","type":"string","required":true},{"key":"available_time","type":"string","required":true}]
      },
      {
        "prompt_key":"coach_session_plan",
        "version":1,
        "name":"Coach Session Plan",
        "description":"Erstellt einen strukturierten Plan für die aktuelle Coach-Session.",
        "system_prompt":"",
        "developer_prompt":"",
        "user_prompt_template":"",
        "model":"gpt-4.1-mini",
        "max_output_tokens":700,
        "expected_output_schema_json":{"type":"object","additionalProperties":false,"required":["objective","priorities","session_focus","success_signal"],"properties":{"objective":{"type":"string"},"priorities":{"type":"array","items":{"type":"string"}},"session_focus":{"type":"string"},"success_signal":{"type":"string"}}},
        "prompt_variables_definition_json":[{"key":"learner_level","type":"string","required":true},{"key":"focus_topic","type":"string","required":true},{"key":"observed_patterns_json","type":"string","required":true},{"key":"recent_notes","type":"string","required":true}]
      },
      {
        "prompt_key":"coach_next_step",
        "version":1,
        "name":"Coach Next Step",
        "description":"Bestimmt den nächsten didaktischen Schritt im laufenden Session-Verlauf.",
        "system_prompt":"",
        "developer_prompt":"",
        "user_prompt_template":"",
        "model":"gpt-4.1-mini",
        "max_output_tokens":550,
        "expected_output_schema_json":{"type":"object","additionalProperties":false,"required":["step_type","coach_message","learner_action","reason"],"properties":{"step_type":{"type":"string","enum":["clarify","practice","transfer","review"]},"coach_message":{"type":"string"},"learner_action":{"type":"string"},"reason":{"type":"string"}}},
        "prompt_variables_definition_json":[{"key":"session_goal","type":"string","required":true},{"key":"learner_turn","type":"string","required":true},{"key":"context_json","type":"string","required":true}]
      },
      {
        "prompt_key":"coach_session_completion",
        "version":1,
        "name":"Coach Session Completion",
        "description":"Fasst den Session-Abschluss zusammen und markiert verbleibenden Fokus.",
        "system_prompt":"",
        "developer_prompt":"",
        "user_prompt_template":"",
        "model":"gpt-4.1-mini",
        "max_output_tokens":700,
        "expected_output_schema_json":{"type":"object","additionalProperties":false,"required":["completion_status","summary","retained_strength","remaining_focus","next_session_hint"],"properties":{"completion_status":{"type":"string","enum":["completed","partially_completed","not_completed"]},"summary":{"type":"string"},"retained_strength":{"type":"string"},"remaining_focus":{"type":"string"},"next_session_hint":{"type":"string"}}},
        "prompt_variables_definition_json":[{"key":"session_goal","type":"string","required":true},{"key":"session_findings_json","type":"string","required":true},{"key":"current_state","type":"string","required":true}]
      },
      {
        "prompt_key":"coach_reflection_interpreter",
        "version":1,
        "name":"Coach Reflection Interpreter",
        "description":"Interpretiert Selbstreflexion und leitet eine unterstützende Lernfokussierung ab.",
        "system_prompt":"",
        "developer_prompt":"",
        "user_prompt_template":"",
        "model":"gpt-4.1-mini",
        "max_output_tokens":600,
        "expected_output_schema_json":{"type":"object","additionalProperties":false,"required":["reflection_state","interpreted_need","supportive_response","suggested_focus"],"properties":{"reflection_state":{"type":"string","enum":["stable","uncertain","overloaded","confident"]},"interpreted_need":{"type":"string"},"supportive_response":{"type":"string"},"suggested_focus":{"type":"string"}}},
        "prompt_variables_definition_json":[{"key":"learner_reflection","type":"string","required":true},{"key":"learning_context","type":"string","required":true},{"key":"recent_signals_json","type":"string","required":true}]
      }
    ]'::jsonb
  ) as x(
    prompt_key text,
    version integer,
    name text,
    description text,
    system_prompt text,
    developer_prompt text,
    user_prompt_template text,
    model text,
    max_output_tokens integer,
    expected_output_schema_json jsonb,
    prompt_variables_definition_json jsonb
  )
), deactivated as (
  update public.prompt_definitions pd
     set is_active = false,
         updated_at = now()
    from target_prompts tp
   where pd.prompt_key = tp.prompt_key
     and pd.is_active = true
     and pd.version <> tp.version
)
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
  response_format,
  expected_output_schema_json,
  prompt_variables_definition_json,
  metadata,
  is_active
)
select
  tp.prompt_key,
  tp.version,
  tp.name,
  tp.description,
  'coach',
  tp.system_prompt,
  tp.developer_prompt,
  tp.user_prompt_template,
  tp.model,
  tp.max_output_tokens,
  'json_object',
  tp.expected_output_schema_json,
  tp.prompt_variables_definition_json,
  jsonb_build_object('runtime','coach','source','supabase_prompt_library','required',true),
  false
from target_prompts tp
on conflict (prompt_key, version) do update
set
  category = excluded.category,
  name = excluded.name,
  description = excluded.description,
  system_prompt = excluded.system_prompt,
  developer_prompt = excluded.developer_prompt,
  user_prompt_template = excluded.user_prompt_template,
  model = excluded.model,
  max_output_tokens = excluded.max_output_tokens,
  response_format = excluded.response_format,
  expected_output_schema_json = excluded.expected_output_schema_json,
  prompt_variables_definition_json = excluded.prompt_variables_definition_json,
  metadata = excluded.metadata,
  is_active = false,
  updated_at = now();

commit;
