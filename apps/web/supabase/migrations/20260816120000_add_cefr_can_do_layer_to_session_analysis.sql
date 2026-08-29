-- Launch-Readiness-Audit, Befund K (P0 #1, docs/daf-cefr-prompt-audit-2026-05-06.md):
-- "CEFR-Can-Do-Layer in Session-Analyse einziehen" -- pro Kategorie zusaetzlich
-- cefr_band_estimate, can_do_evidence (2-3 Belege) und limiting_factor, damit
-- jeder Score eine extern interpretierbare didaktische Bedeutung bekommt.
--
-- Keine $ref/$defs: src/services/ai/json-schema-validator.ts loest $ref nicht
-- auf (Custom-Validator, kein voller JSON-Schema-Support), deshalb wird das
-- categoryScore-Schema -- wie schon in v4 -- pro Kategorie wiederholt.
--
-- Deaktiviert v4, fuegt v5 mit erweitertem Schema/Prompt ein.

update public.prompt_definitions
set is_active = false
where prompt_key = 'session_analysis' and version = 4 and is_active = true;

insert into public.prompt_definitions (
  prompt_key,
  version,
  is_active,
  model,
  max_output_tokens,
  response_format,
  name,
  description,
  category,
  prompt_variables_definition_json,
  metadata,
  system_prompt,
  developer_prompt,
  user_prompt_template,
  expected_output_schema_json
)
values (
  'session_analysis',
  5,
  true,
  'gpt-5-mini',
  3400,
  'json_object',
  'Session Analysis',
  'Launch-Readiness-Audit Befund K (P0 #1): CEFR-Can-Do-Layer je Kategorie ergaenzt.',
  'session',
  '[{"name": "cleaned_transcript", "type": "string", "required": true, "description": "", "defaultValue": ""}, {"name": "language_code", "type": "string", "required": true, "description": "", "defaultValue": ""}]'::jsonb,
  '{"activation_rule": "latest_existing_version_per_runtime_key", "activation_source": "launch_readiness_audit_befund_k_2026_08_16"}'::jsonb,
  'You are an expert German-as-a-foreign-language evaluator.
You assess spoken German from adult learners living in Germany who already have everyday functional German.
You must evaluate the learner fairly, constructively, and precisely.
Do not shame the learner. Do not overstate mistakes. Focus on recurring patterns and communicative impact. Return valid JSON only. All required fields must be present and non-empty according to the schema.',
  'Nutze das Zielmodell gpt-5-mini. Analysiere genau eine Session und gib ausschließlich ein einziges JSON-Objekt zurück. Keine alternativen Antwortformen (kein Markdown, kein Freitext außerhalb des JSON, keine Erklärblöcke). Verwende exakt die vorgegebenen Schlüssel und Wertebereiche.

WICHTIG FÜR category_scores:

Für jede Kategorie (z. B. grammatical_accuracy, lexical_appropriateness usw.) musst du ein Objekt mit score, confidence, justification, evidence, cefr_band_estimate, can_do_evidence und limiting_factor erzeugen.

Regeln:

1. score, confidence und justification müssen inhaltlich konsistent sein und aus derselben Bewertung entstehen.

2. justification ist PFLICHT und muss:
- ein nicht-leerer String sein
- mindestens ein vollständiger deutscher Satz sein
- darf niemals "", null oder nur Leerzeichen sein
- muss den vergebenen score direkt erklären

3. Inhalt der justification:
- beschreibe typische sprachliche Muster (keine Einzelfehler)
- bewerte das sprachliche Niveau (z. B. „überwiegend korrekt“, „eingeschränkt“, „unsicher“)
- erkläre den kommunikativen Effekt (z. B. Verständlichkeit, Präzision)

4. Auch wenn keine explizite evidence vorhanden ist:
- justification muss trotzdem sinnvoll und fachlich begründet sein

5. confidence:
- gibt an, wie sicher die Bewertung auf Basis des Transkripts ist
- niedriger bei wenig Daten oder uneindeutigen Mustern

6. evidence:
- optionale Beispiele aus dem Transkript
- darf leer sein, justification aber niemals

CEFR-CAN-DO-LAYER (PFLICHT, Launch-Readiness-Audit Befund K, P0 #1):

7. cefr_band_estimate:
- eines der folgenden Sub-Bänder, exakt so geschrieben: A1.1, A1.2, A2.1, A2.2, B1.1, B1.2, B2.1, B2.2, C1.1, C1.2, C2
- schätzt, auf welchem CEFR-Sub-Band sich die Leistung in DIESER Kategorie in DIESER Session bewegt
- muss zum score konsistent sein (ein hoher score in einer Kategorie impliziert ein höheres Band als ein niedriger score in derselben Kategorie über mehrere Sessions hinweg)

8. can_do_evidence:
- Array mit GENAU 2 oder 3 Einträgen
- jeder Eintrag ist ein konkreter, im Transkript beobachtbarer Performanzbeleg im Can-Do-Format (was der/die Lernende tatsächlich sprachlich leisten konnte), keine abstrakte Bewertung
- Beispiel-Stil: "Konnte eine Alltagssituation im Perfekt korrekt schildern, auch bei einem Wechsel des Zeitbezugs."

9. limiting_factor:
- ein nicht-leerer String
- benennt konkret, WAS die nächste Band-Grenze verhindert (z. B. "Nebensätze werden vermieden, Verbendstellung noch nicht stabil" statt vager Aussagen wie "muss sich verbessern")
- darf sich nicht wiederholen: unterschiedliche Kategorien brauchen unterschiedliche limiting_factor-Texte, wenn die zugrundeliegenden sprachlichen Gründe unterschiedlich sind

WICHTIG:
Wenn justification leer ist oder den Score nicht plausibel erklärt, oder wenn cefr_band_estimate/can_do_evidence/limiting_factor fehlen oder nicht den Regeln entsprechen, ist die Antwort ungültig.',
  'Transkript (bereinigt): {{cleaned_transcript}}\nSprache: {{language_code}}\nAufgabe: Erstelle eine Session-Analyse mit category_scores (inkl. CEFR-Can-Do-Layer: cefr_band_estimate, can_do_evidence, limiting_factor je Kategorie), detected_patterns, priority_intervention und session_summary exakt gemäß Ausgabeschema.',
  '{
    "type": "object",
    "required": ["category_scores", "detected_patterns", "priority_intervention", "session_summary"],
    "properties": {
      "category_scores": {
        "type": "object",
        "required": ["grammatical_accuracy", "lexical_appropriateness", "fluency", "intelligibility", "coherence_and_sentence_structure", "register_and_naturalness", "interactional_competence"],
        "properties": {
          "fluency": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"type": "string", "enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"]}, "can_do_evidence": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "string", "minLength": 1}}, "limiting_factor": {"type": "string", "minLength": 1}}, "additionalProperties": false},
          "intelligibility": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"type": "string", "enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"]}, "can_do_evidence": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "string", "minLength": 1}}, "limiting_factor": {"type": "string", "minLength": 1}}, "additionalProperties": false},
          "grammatical_accuracy": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"type": "string", "enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"]}, "can_do_evidence": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "string", "minLength": 1}}, "limiting_factor": {"type": "string", "minLength": 1}}, "additionalProperties": false},
          "lexical_appropriateness": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"type": "string", "enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"]}, "can_do_evidence": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "string", "minLength": 1}}, "limiting_factor": {"type": "string", "minLength": 1}}, "additionalProperties": false},
          "interactional_competence": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"type": "string", "enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"]}, "can_do_evidence": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "string", "minLength": 1}}, "limiting_factor": {"type": "string", "minLength": 1}}, "additionalProperties": false},
          "register_and_naturalness": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"type": "string", "enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"]}, "can_do_evidence": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "string", "minLength": 1}}, "limiting_factor": {"type": "string", "minLength": 1}}, "additionalProperties": false},
          "coherence_and_sentence_structure": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"type": "string", "enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"]}, "can_do_evidence": {"type": "array", "minItems": 2, "maxItems": 3, "items": {"type": "string", "minLength": 1}}, "limiting_factor": {"type": "string", "minLength": 1}}, "additionalProperties": false}
        },
        "additionalProperties": false
      },
      "session_summary": {"type": "string", "minLength": 1},
      "detected_patterns": {"type": "array", "items": {"type": "object", "required": ["pattern_key", "label", "description", "frequency_estimate", "communicative_impact", "category"], "properties": {"label": {"type": "string", "minLength": 1}, "category": {"enum": ["grammatical_accuracy", "lexical_appropriateness", "fluency", "intelligibility", "coherence_and_sentence_structure", "register_and_naturalness", "interactional_competence"], "type": "string"}, "description": {"type": "string", "minLength": 1}, "pattern_key": {"type": "string", "minLength": 1}, "frequency_estimate": {"enum": ["low", "medium", "high"], "type": "string"}, "communicative_impact": {"enum": ["low", "medium", "high"], "type": "string"}}, "additionalProperties": false}, "default": []},
      "priority_intervention": {"type": "object", "required": ["pattern_key", "label", "reason"], "properties": {"label": {"type": "string", "minLength": 1}, "reason": {"type": "string", "minLength": 1}, "pattern_key": {"type": "string", "minLength": 1}}, "additionalProperties": false}
    },
    "additionalProperties": false
  }'::jsonb
);
