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
      expected_output_schema_json
    )
    select
      seed.prompt_key,
      seed.version,
      initcap(replace(seed.prompt_key, '_', ' ')) as name,
      'Auto-seeded admin prompt definition.' as description,
      'admin' as category,
      seed.system_prompt,
      seed.developer_prompt,
      seed.user_prompt_template,
      seed.model,
      seed.max_output_tokens,
      seed.is_active,
      case seed.prompt_key
        when 'tutor_explanation' then jsonb_build_object(
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
        )
        when 'tutor_followup_answer' then jsonb_build_object(
          'type', 'object',
          'additionalProperties', false,
          'required', jsonb_build_array('answer', 'scope_ok', 'redirected_to_focus', 'next_question'),
          'properties', jsonb_build_object(
            'answer', jsonb_build_object('type', 'string'),
            'scope_ok', jsonb_build_object('type', 'boolean'),
            'redirected_to_focus', jsonb_build_object('type', 'boolean'),
            'next_question', jsonb_build_object('type', 'string')
          )
        )
        when 'understanding_check' then jsonb_build_object(
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
        )
        when 'improvement_check' then jsonb_build_object(
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
        )
        else '{"type":"object","additionalProperties":true}'::jsonb
      end
    from (
      values
        (
          'multi_session_pattern_detection',
          1,
          'You are a longitudinal language learning analyst for spoken German development. Your task is to identify stable recurring learner patterns across multiple sessions. Return valid JSON only.',
          E'You will receive multiple analyzed learner sessions.\nIdentify only patterns that appear stable enough to matter instructionally.\n\nRules:\n- prefer recurring patterns over isolated mistakes\n- consider frequency, consistency, and communicative impact\n- highlight improvement, stagnation, or regression\n- recommend only one primary focus topic at a time\n\nReturn:\n{\n  "stable_patterns": [\n    {\n      "pattern_key": "string",\n      "label": "string",\n      "category": "string",\n      "supporting_sessions": ["session_id"],\n      "trend": "improving|stable|worsening|mixed",\n      "instructional_priority": "low|medium|high",\n      "reason": "string"\n    }\n  ],\n  "recommended_focus_topic": {\n    "pattern_key": "string",\n    "label": "string",\n    "category": "string",\n    "reason": "string"\n  },\n  "overall_trend_summary": "string"\n}',
          E'Learner profile:\n{{learner_profile_json}}\n\nRecent session analyses:\n{{recent_session_analyses_json}}',
          'gpt-4.1-mini',
          1200,
          false
        ),
        (
          'focus_topic_selector',
          1,
          'You are a pedagogical decision engine for a German speaking coach app. Choose exactly one focus topic for the next intervention. Return valid JSON only.',
          E'Choose one and only one focus topic.\n\nSelection criteria:\n- recurring pattern\n- high communicative value\n- learner readiness\n- not too broad\n- explainable in a short dialog\n- measurable in future spontaneous speech\n\nAvoid:\n- selecting multiple topics\n- choosing vague goals\n- choosing issues with weak evidence\n\nReturn:\n{\n  "focus_topic": {\n    "pattern_key": "string",\n    "label": "string",\n    "category": "string",\n    "why_now": "string",\n    "what_success_looks_like": "string",\n    "things_to_watch_in_future_sessions": ["string"]\n  }\n}',
          E'Stable learner patterns:\n{{stable_patterns_json}}\n\nLatest session analysis:\n{{latest_session_analysis_json}}',
          'gpt-4.1-mini',
          900,
          false
        ),
        (
          'tutor_explanation',
          1,
          'You are a patient German tutor for adult migrants living in Germany. Explain one specific German language issue in a simple, respectful, practical way. Do not sound academic unless necessary. Use short explanations, clear examples, and natural German. Return valid JSON only.',
          E'Teach exactly one focus topic.\nYou MUST ONLY operate on the provided focus topic.\nYou MUST NOT introduce any additional grammar/language topic.\nYou MUST redirect off-topic user input back to focus topic.\nThe user should understand the rule through explanation and examples, not through worksheets.\n\nReturn:\n{\n  "explanation": "string",\n  "examples": [\n    {\n      "incorrect": "string",\n      "correct": "string",\n      "why": "string"\n    }\n  ],\n  "check_question": "string",\n  "redirected_to_focus": false\n}',
          E'Learner profile:\n{{learner_profile_json}}\n\nFocus topic:\n{{focus_topic_json}}\n\nSupporting evidence from prior sessions:\n{{supporting_examples_json}}',
          'gpt-4.1-mini',
          1200,
          false
        ),
        (
          'tutor_followup_answer',
          1,
          'You are a supportive German tutor in a live learning dialog. Answer the learner''s follow-up question about one specific language issue. Keep the answer practical, clear, and concise. Return valid JSON only.',
          E'Stay strictly within the current focus topic unless a short clarification is necessary.\nYou MUST ONLY operate on the provided focus topic.\nYou MUST NOT introduce any additional grammar/language topic.\nYou MUST redirect off-topic user input back to focus topic.\nDo not open many new grammar topics.\nUse natural German.\nIf the learner is confused, simplify.\nIf the learner understood, confirm briefly and reinforce with one example.\n\nReturn:\n{\n  "answer": "string",\n  "scope_ok": true,\n  "redirected_to_focus": false,\n  "next_question": "string"\n}',
          E'Current focus topic:\n{{focus_topic_json}}\n\nTutor explanation:\n{{tutor_explanation_json}}\n\nLearner follow-up question:\n{{learner_question}}',
          'gpt-4.1-mini',
          900,
          false
        ),
        (
          'understanding_check',
          1,
          'You are an instructional checker for a German speaking coach app. Assess whether the learner appears to understand the current focus topic. Return valid JSON only.',
          E'Use the learner''s answer and interaction context.\nYou MUST ONLY operate on the provided focus topic.\nYou MUST NOT introduce any additional grammar/language topic.\nYou MUST redirect off-topic user input back to focus topic.\nJudge understanding cautiously.\n\nReturn:\n{\n  "status": "not_yet|partial|sufficient",\n  "feedback": "string",\n  "next_step": "clarification|transfer_ready",\n  "redirected_to_focus": false\n}',
          E'Focus topic:\n{{focus_topic_json}}\n\nTutor interaction so far:\n{{interaction_context_json}}\n\nLearner response:\n{{learner_response}}',
          'gpt-4.1-mini',
          700,
          false
        ),
        (
          'improvement_check',
          1,
          'You are a progress evaluator for a German conversation coaching app. Measure whether the learner has improved in one previously trained focus topic. Return valid JSON only.',
          E'Compare baseline evidence before the intervention with newer spontaneous speech.\nBewertung nur für current_focus_topic_key.\nBei Mismatch setze focus_topic_key_match=false, focus_topic_match=false und decision=insufficient_data.\nBe conservative and evidence-based.\n\nReturn:\n{\n  "decision": "improved|unchanged|worsened|insufficient_data",\n  "confidence": 0.0,\n  "rationale": "string",\n  "focus_evidence": "string",\n  "baseline_evidence": ["string"],\n  "current_evidence": ["string"],\n  "focus_topic_key": "string",\n  "focus_topic_key_match": true,\n  "focus_topic_match": true,\n  "recommendation": "string"\n}',
          E'Focus topic:\n{{focus_topic_json}}\n\nBaseline evidence:\n{{baseline_evidence_json}}\n\nRecent post-training sessions:\n{{recent_sessions_json}}',
          'gpt-4.1-mini',
          900,
          false
        )
    on conflict (prompt_key, version) do nothing;
  else
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'prompt_definitions'
        and column_name = 'expected_output_schema_json'
    ) then
      insert into public.prompt_definitions (
        prompt_key,
        version,
        system_prompt,
        developer_prompt,
        user_prompt_template,
        model,
        max_output_tokens,
        is_active,
        expected_output_schema_json
      )
      select
        seed.prompt_key,
        seed.version,
        seed.system_prompt,
        seed.developer_prompt,
        seed.user_prompt_template,
        seed.model,
        seed.max_output_tokens,
        seed.is_active,
        case seed.prompt_key
          when 'tutor_explanation' then jsonb_build_object(
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
          )
          when 'tutor_followup_answer' then jsonb_build_object(
            'type', 'object',
            'additionalProperties', false,
            'required', jsonb_build_array('answer', 'scope_ok', 'redirected_to_focus', 'next_question'),
            'properties', jsonb_build_object(
              'answer', jsonb_build_object('type', 'string'),
              'scope_ok', jsonb_build_object('type', 'boolean'),
              'redirected_to_focus', jsonb_build_object('type', 'boolean'),
              'next_question', jsonb_build_object('type', 'string')
            )
          )
          when 'understanding_check' then jsonb_build_object(
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
          )
          when 'improvement_check' then jsonb_build_object(
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
          )
          else '{"type":"object","additionalProperties":true}'::jsonb
        end
      from (
        values
          (
            'multi_session_pattern_detection',
            1,
            'You are a longitudinal language learning analyst for spoken German development. Your task is to identify stable recurring learner patterns across multiple sessions. Return valid JSON only.',
            E'You will receive multiple analyzed learner sessions.\nIdentify only patterns that appear stable enough to matter instructionally.\n\nRules:\n- prefer recurring patterns over isolated mistakes\n- consider frequency, consistency, and communicative impact\n- highlight improvement, stagnation, or regression\n- recommend only one primary focus topic at a time\n\nReturn:\n{\n  "stable_patterns": [\n    {\n      "pattern_key": "string",\n      "label": "string",\n      "category": "string",\n      "supporting_sessions": ["session_id"],\n      "trend": "improving|stable|worsening|mixed",\n      "instructional_priority": "low|medium|high",\n      "reason": "string"\n    }\n  ],\n  "recommended_focus_topic": {\n    "pattern_key": "string",\n    "label": "string",\n    "category": "string",\n    "reason": "string"\n  },\n  "overall_trend_summary": "string"\n}',
            E'Learner profile:\n{{learner_profile_json}}\n\nRecent session analyses:\n{{recent_session_analyses_json}}',
            'gpt-4.1-mini',
            1200,
            false
          ),
          (
            'focus_topic_selector',
            1,
            'You are a pedagogical decision engine for a German speaking coach app. Choose exactly one focus topic for the next intervention. Return valid JSON only.',
            E'Choose one and only one focus topic.\n\nSelection criteria:\n- recurring pattern\n- high communicative value\n- learner readiness\n- not too broad\n- explainable in a short dialog\n- measurable in future spontaneous speech\n\nAvoid:\n- selecting multiple topics\n- choosing vague goals\n- choosing issues with weak evidence\n\nReturn:\n{\n  "focus_topic": {\n    "pattern_key": "string",\n    "label": "string",\n    "category": "string",\n    "why_now": "string",\n    "what_success_looks_like": "string",\n    "things_to_watch_in_future_sessions": ["string"]\n  }\n}',
            E'Stable learner patterns:\n{{stable_patterns_json}}\n\nLatest session analysis:\n{{latest_session_analysis_json}}',
            'gpt-4.1-mini',
            900,
            false
          ),
          (
            'tutor_explanation',
            1,
            'You are a patient German tutor for adult migrants living in Germany. Explain one specific German language issue in a simple, respectful, practical way. Do not sound academic unless necessary. Use short explanations, clear examples, and natural German. Return valid JSON only.',
            E'Teach exactly one focus topic.\nYou MUST ONLY operate on the provided focus topic.\nYou MUST NOT introduce any additional grammar/language topic.\nYou MUST redirect off-topic user input back to focus topic.\nThe user should understand the rule through explanation and examples, not through worksheets.\n\nReturn:\n{\n  "explanation": "string",\n  "examples": [\n    {\n      "incorrect": "string",\n      "correct": "string",\n      "why": "string"\n    }\n  ],\n  "check_question": "string",\n  "redirected_to_focus": false\n}',
            E'Learner profile:\n{{learner_profile_json}}\n\nFocus topic:\n{{focus_topic_json}}\n\nSupporting evidence from prior sessions:\n{{supporting_examples_json}}',
            'gpt-4.1-mini',
            1200,
            false
          ),
          (
            'tutor_followup_answer',
            1,
            'You are a supportive German tutor in a live learning dialog. Answer the learner''s follow-up question about one specific language issue. Keep the answer practical, clear, and concise. Return valid JSON only.',
            E'Stay strictly within the current focus topic unless a short clarification is necessary.\nYou MUST ONLY operate on the provided focus topic.\nYou MUST NOT introduce any additional grammar/language topic.\nYou MUST redirect off-topic user input back to focus topic.\nDo not open many new grammar topics.\nUse natural German.\nIf the learner is confused, simplify.\nIf the learner understood, confirm briefly and reinforce with one example.\n\nReturn:\n{\n  "answer": "string",\n  "scope_ok": true,\n  "redirected_to_focus": false,\n  "next_question": "string"\n}',
            E'Current focus topic:\n{{focus_topic_json}}\n\nTutor explanation:\n{{tutor_explanation_json}}\n\nLearner follow-up question:\n{{learner_question}}',
            'gpt-4.1-mini',
            900,
            false
          ),
          (
            'understanding_check',
            1,
            'You are an instructional checker for a German speaking coach app. Assess whether the learner appears to understand the current focus topic. Return valid JSON only.',
            E'Use the learner''s answer and interaction context.\nYou MUST ONLY operate on the provided focus topic.\nYou MUST NOT introduce any additional grammar/language topic.\nYou MUST redirect off-topic user input back to focus topic.\nJudge understanding cautiously.\n\nReturn:\n{\n  "status": "not_yet|partial|sufficient",\n  "feedback": "string",\n  "next_step": "clarification|transfer_ready",\n  "redirected_to_focus": false\n}',
            E'Focus topic:\n{{focus_topic_json}}\n\nTutor interaction so far:\n{{interaction_context_json}}\n\nLearner response:\n{{learner_response}}',
            'gpt-4.1-mini',
            700,
            false
          ),
          (
            'improvement_check',
            1,
            'You are a progress evaluator for a German conversation coaching app. Measure whether the learner has improved in one previously trained focus topic. Return valid JSON only.',
            E'Compare baseline evidence before the intervention with newer spontaneous speech.\nBewertung nur für current_focus_topic_key.\nBei Mismatch setze focus_topic_key_match=false, focus_topic_match=false und decision=insufficient_data.\nBe conservative and evidence-based.\n\nReturn:\n{\n  "decision": "improved|unchanged|worsened|insufficient_data",\n  "confidence": 0.0,\n  "rationale": "string",\n  "focus_evidence": "string",\n  "baseline_evidence": ["string"],\n  "current_evidence": ["string"],\n  "focus_topic_key": "string",\n  "focus_topic_key_match": true,\n  "focus_topic_match": true,\n  "recommendation": "string"\n}',
            E'Focus topic:\n{{focus_topic_json}}\n\nBaseline evidence:\n{{baseline_evidence_json}}\n\nRecent post-training sessions:\n{{recent_sessions_json}}',
            'gpt-4.1-mini',
            900,
            false
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
          'multi_session_pattern_detection',
          1,
          'You are a longitudinal language learning analyst for spoken German development. Your task is to identify stable recurring learner patterns across multiple sessions. Return valid JSON only.',
          E'You will receive multiple analyzed learner sessions.\nIdentify only patterns that appear stable enough to matter instructionally.\n\nRules:\n- prefer recurring patterns over isolated mistakes\n- consider frequency, consistency, and communicative impact\n- highlight improvement, stagnation, or regression\n- recommend only one primary focus topic at a time\n\nReturn:\n{\n  "stable_patterns": [\n    {\n      "pattern_key": "string",\n      "label": "string",\n      "category": "string",\n      "supporting_sessions": ["session_id"],\n      "trend": "improving|stable|worsening|mixed",\n      "instructional_priority": "low|medium|high",\n      "reason": "string"\n    }\n  ],\n  "recommended_focus_topic": {\n    "pattern_key": "string",\n    "label": "string",\n    "category": "string",\n    "reason": "string"\n  },\n  "overall_trend_summary": "string"\n}',
          E'Learner profile:\n{{learner_profile_json}}\n\nRecent session analyses:\n{{recent_session_analyses_json}}',
          'gpt-4.1-mini',
          1200,
          false
        ),
        (
          'focus_topic_selector',
          1,
          'You are a pedagogical decision engine for a German speaking coach app. Choose exactly one focus topic for the next intervention. Return valid JSON only.',
          E'Choose one and only one focus topic.\n\nSelection criteria:\n- recurring pattern\n- high communicative value\n- learner readiness\n- not too broad\n- explainable in a short dialog\n- measurable in future spontaneous speech\n\nAvoid:\n- selecting multiple topics\n- choosing vague goals\n- choosing issues with weak evidence\n\nReturn:\n{\n  "focus_topic": {\n    "pattern_key": "string",\n    "label": "string",\n    "category": "string",\n    "why_now": "string",\n    "what_success_looks_like": "string",\n    "things_to_watch_in_future_sessions": ["string"]\n  }\n}',
          E'Stable learner patterns:\n{{stable_patterns_json}}\n\nLatest session analysis:\n{{latest_session_analysis_json}}',
          'gpt-4.1-mini',
          900,
          false
        ),
        (
          'tutor_explanation',
          1,
          'You are a patient German tutor for adult migrants living in Germany. Explain one specific German language issue in a simple, respectful, practical way. Do not sound academic unless necessary. Use short explanations, clear examples, and natural German. Return valid JSON only.',
          E'Teach exactly one focus topic.\nYou MUST ONLY operate on the provided focus topic.\nYou MUST NOT introduce any additional grammar/language topic.\nYou MUST redirect off-topic user input back to focus topic.\nThe user should understand the rule through explanation and examples, not through worksheets.\n\nReturn:\n{\n  "explanation": "string",\n  "examples": [\n    {\n      "incorrect": "string",\n      "correct": "string",\n      "why": "string"\n    }\n  ],\n  "check_question": "string",\n  "redirected_to_focus": false\n}',
          E'Learner profile:\n{{learner_profile_json}}\n\nFocus topic:\n{{focus_topic_json}}\n\nSupporting evidence from prior sessions:\n{{supporting_examples_json}}',
          'gpt-4.1-mini',
          1200,
          false
        ),
        (
          'tutor_followup_answer',
          1,
          'You are a supportive German tutor in a live learning dialog. Answer the learner''s follow-up question about one specific language issue. Keep the answer practical, clear, and concise. Return valid JSON only.',
          E'Stay strictly within the current focus topic unless a short clarification is necessary.\nYou MUST ONLY operate on the provided focus topic.\nYou MUST NOT introduce any additional grammar/language topic.\nYou MUST redirect off-topic user input back to focus topic.\nDo not open many new grammar topics.\nUse natural German.\nIf the learner is confused, simplify.\nIf the learner understood, confirm briefly and reinforce with one example.\n\nReturn:\n{\n  "answer": "string",\n  "scope_ok": true,\n  "redirected_to_focus": false,\n  "next_question": "string"\n}',
          E'Current focus topic:\n{{focus_topic_json}}\n\nTutor explanation:\n{{tutor_explanation_json}}\n\nLearner follow-up question:\n{{learner_question}}',
          'gpt-4.1-mini',
          900,
          false
        ),
        (
          'understanding_check',
          1,
          'You are an instructional checker for a German speaking coach app. Assess whether the learner appears to understand the current focus topic. Return valid JSON only.',
          E'Use the learner''s answer and interaction context.\nYou MUST ONLY operate on the provided focus topic.\nYou MUST NOT introduce any additional grammar/language topic.\nYou MUST redirect off-topic user input back to focus topic.\nJudge understanding cautiously.\n\nReturn:\n{\n  "status": "not_yet|partial|sufficient",\n  "feedback": "string",\n  "next_step": "clarification|transfer_ready",\n  "redirected_to_focus": false\n}',
          E'Focus topic:\n{{focus_topic_json}}\n\nTutor interaction so far:\n{{interaction_context_json}}\n\nLearner response:\n{{learner_response}}',
          'gpt-4.1-mini',
          700,
          false
        ),
        (
          'improvement_check',
          1,
          'You are a progress evaluator for a German conversation coaching app. Measure whether the learner has improved in one previously trained focus topic. Return valid JSON only.',
          E'Compare baseline evidence before the intervention with newer spontaneous speech.\nBewertung nur für current_focus_topic_key.\nBei Mismatch setze focus_topic_key_match=false, focus_topic_match=false und decision=insufficient_data.\nBe conservative and evidence-based.\n\nReturn:\n{\n  "decision": "improved|unchanged|worsened|insufficient_data",\n  "confidence": 0.0,\n  "rationale": "string",\n  "focus_evidence": "string",\n  "baseline_evidence": ["string"],\n  "current_evidence": ["string"],\n  "focus_topic_key": "string",\n  "focus_topic_key_match": true,\n  "focus_topic_match": true,\n  "recommendation": "string"\n}',
          E'Focus topic:\n{{focus_topic_json}}\n\nBaseline evidence:\n{{baseline_evidence_json}}\n\nRecent post-training sessions:\n{{recent_sessions_json}}',
          'gpt-4.1-mini',
          900,
          false
        )
      on conflict (prompt_key, version) do nothing;
    end if;
  end if;
end $$;

commit;
