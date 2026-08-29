begin;

-- Lernpfade Phase C (26.08.2026): session_analysis bekommt eine neue,
-- optionale Variable learning_goal_context (leer, wenn kein Lernziel gewählt
-- ist). Bei gesetztem Ziel muss priority_intervention.reason konkret auf die
-- Distanz zum genannten Ziel eingehen, statt generisch zu bleiben. Ohne Ziel
-- bleibt das Verhalten exakt wie in v6 (leerer String -> keine zusätzliche
-- Weisung, kein Unterschied für bestehende Nutzer ohne gesetztes Ziel).
-- expected_output_schema_json bleibt unverändert -- priority_intervention.reason
-- existiert bereits, es wird nur die inhaltliche Weisung dazu verschärft.
update public.prompt_definitions
set is_active = false, updated_at = timezone('utc', now())
where prompt_key = 'session_analysis' and is_active = true;

insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'session_analysis',
  7,
  'Session Analysis',
  'Bewertet eine einzelne Session mit CEFR-Can-Do-Layer je Kategorie, erkannten Mustern und einer priorisierten Intervention. v7: neue Variable learning_goal_context -- bei gesetztem Prüfungsziel referenziert priority_intervention.reason explizit die Distanz zum Ziel.',
  'session',
  'gpt-5-mini',
  128000,
  'json_object',
  true,
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
- bewerte das sprachliche Niveau (z. B. „überwiegend korrekt", „eingeschränkt", „unsicher")
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
Wenn justification leer ist oder den Score nicht plausibel erklärt, oder wenn cefr_band_estimate/can_do_evidence/limiting_factor fehlen oder nicht den Regeln entsprechen, ist die Antwort ungültig.

SESSION_SUMMARY -- ANREDE (PFLICHT):

10. session_summary spricht den Lernenden IMMER direkt mit "Du" an, niemals in der dritten Person.
- Richtig: "Du kommunizierst insgesamt funktional und gut verständlich auf B1-Niveau. Du kannst Absichten und Handlungen beschreiben und dialogisch reagieren."
- Falsch: "Der/die Lernende kommuniziert ...", "Er/sie kann ..."
- Das gilt nur für session_summary, nicht für justification/can_do_evidence/limiting_factor in den category_scores (die bleiben im analytischen Stil, da sie dem Nutzer nicht direkt angezeigt werden).

LERNZIEL-BEZUG (PFLICHT, wenn learning_goal_context nicht leer ist):

11. Ist der übergebene learning_goal_context nicht leer, muss priority_intervention.reason explizit auf das genannte Ziel Bezug nehmen (Prüfungsname und/oder Ziel-Niveau aus dem Kontext nennen) und erklären, was für dieses konkrete Ziel als Nächstes am wichtigsten ist -- statt generisch zu bleiben.
12. Ist learning_goal_context leer (kein Lernziel gewählt), bleibt priority_intervention wie bisher allgemein gehalten, ohne Bezug auf ein Prüfungsziel -- kein Verhaltensunterschied für Nutzer ohne gesetztes Ziel.',
  'Transkript (bereinigt): {{cleaned_transcript}}
Sprache: {{language_code}}
Lernziel-Kontext: {{learning_goal_context}}
Aufgabe: Erstelle eine Session-Analyse mit category_scores (inkl. CEFR-Can-Do-Layer: cefr_band_estimate, can_do_evidence, limiting_factor je Kategorie), detected_patterns, priority_intervention und session_summary exakt gemäß Ausgabeschema. Falls ein Lernziel-Kontext angegeben ist, muss priority_intervention.reason konkret darauf Bezug nehmen.',
  '{
    "type": "object",
    "required": ["category_scores", "detected_patterns", "priority_intervention", "session_summary"],
    "properties": {
      "category_scores": {
        "type": "object",
        "required": ["grammatical_accuracy", "lexical_appropriateness", "fluency", "intelligibility", "coherence_and_sentence_structure", "register_and_naturalness", "interactional_competence"],
        "properties": {
          "fluency": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "can_do_evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 3, "minItems": 2}, "limiting_factor": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"], "type": "string"}}, "additionalProperties": false},
          "intelligibility": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "can_do_evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 3, "minItems": 2}, "limiting_factor": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"], "type": "string"}}, "additionalProperties": false},
          "grammatical_accuracy": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "can_do_evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 3, "minItems": 2}, "limiting_factor": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"], "type": "string"}}, "additionalProperties": false},
          "lexical_appropriateness": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "can_do_evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 3, "minItems": 2}, "limiting_factor": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"], "type": "string"}}, "additionalProperties": false},
          "interactional_competence": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "can_do_evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 3, "minItems": 2}, "limiting_factor": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"], "type": "string"}}, "additionalProperties": false},
          "register_and_naturalness": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "can_do_evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 3, "minItems": 2}, "limiting_factor": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"], "type": "string"}}, "additionalProperties": false},
          "coherence_and_sentence_structure": {"type": "object", "required": ["score", "confidence", "justification", "evidence", "cefr_band_estimate", "can_do_evidence", "limiting_factor"], "properties": {"score": {"type": "integer", "maximum": 5, "minimum": 0}, "evidence": {"type": "array", "items": {"type": "string"}, "default": []}, "confidence": {"type": "number", "maximum": 1, "minimum": 0}, "justification": {"type": "string", "minLength": 1}, "can_do_evidence": {"type": "array", "items": {"type": "string", "minLength": 1}, "maxItems": 3, "minItems": 2}, "limiting_factor": {"type": "string", "minLength": 1}, "cefr_band_estimate": {"enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"], "type": "string"}}, "additionalProperties": false}
        },
        "additionalProperties": false
      },
      "session_summary": {"type": "string", "minLength": 1},
      "detected_patterns": {"type": "array", "items": {"type": "object", "required": ["pattern_key", "label", "description", "frequency_estimate", "communicative_impact", "category"], "properties": {"label": {"type": "string", "minLength": 1}, "category": {"enum": ["grammatical_accuracy", "lexical_appropriateness", "fluency", "intelligibility", "coherence_and_sentence_structure", "register_and_naturalness", "interactional_competence"], "type": "string"}, "description": {"type": "string", "minLength": 1}, "pattern_key": {"type": "string", "minLength": 1}, "frequency_estimate": {"enum": ["low", "medium", "high"], "type": "string"}, "communicative_impact": {"enum": ["low", "medium", "high"], "type": "string"}}, "additionalProperties": false}, "default": []},
      "priority_intervention": {"type": "object", "required": ["pattern_key", "label", "reason"], "properties": {"label": {"type": "string", "minLength": 1}, "reason": {"type": "string", "minLength": 1}, "pattern_key": {"type": "string", "minLength": 1}}, "additionalProperties": false}
    },
    "additionalProperties": false
  }'::jsonb,
  '[
    {"name": "cleaned_transcript", "type": "string", "required": true, "description": "", "defaultValue": ""},
    {"name": "language_code", "type": "string", "required": true, "description": "", "defaultValue": ""},
    {"name": "learning_goal_context", "type": "string", "required": true, "description": "", "defaultValue": ""}
  ]'::jsonb,
  '{"activation_rule": "latest_existing_version_per_runtime_key", "activation_source": "learning_paths_phase_c_2026_08_26"}'::jsonb
);

commit;
