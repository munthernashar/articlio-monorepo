begin;

update public.prompt_definitions
set
  developer_prompt = 'Bewerte ausschließlich das AKTUELLE Fokus-Thema (current_focus_topic_key) und ignoriere alle anderen Themen. Vergleiche Baseline und neuere freie Sessions konservativ und evidenzbasiert. Entscheide nur, wenn baseline_evidence und current_evidence eindeutig diesem Fokus-Thema zuordenbar sind. Wenn die Datenlage unklar ist, gib decision=insufficient_data zurück. Wenn focus_topic_key nicht exakt current_focus_topic_key entspricht (key mismatch), setze zwingend decision=insufficient_data, focus_topic_key_match=false und focus_topic_match=false. Antworte NUR als JSON mit exakt diesem Rückgabeobjekt: {"decision":"improved|unchanged|worsened|insufficient_data","rationale":"string","focus_evidence":"string","baseline_evidence":["string"],"current_evidence":["string"],"focus_topic_key":"string","focus_topic_key_match":boolean,"focus_topic_match":boolean,"confidence":0.0-1.0,"evidence_quality":"low|medium|high(optional)","recommendation":"string"}.',
  updated_at = timezone('utc', now())
where prompt_key = 'improvement_check'
  and is_active = true;

commit;
