begin;

-- Lernpfade Phase E2 (26.08.2026): Speichert je Versuch, wie der Nutzer eine
-- civics_exam_questions-Frage mündlich in eigenen Worten erklärt hat, plus die
-- getrennte KI-Bewertung von fachlicher Richtigkeit und Sprachqualität (Munthers
-- Vorgabe: "der KI Assistent... bewertet fachliche Richtigkeit UND
-- Sprachqualität getrennt"). Gleiches Besitzer-RLS-Muster wie session_analyses
-- (eigene Zeilen lesen/schreiben, Admins lesen alles).
create table if not exists public.civics_practice_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  question_id uuid not null references public.civics_exam_questions (id),
  session_id uuid references public.conversation_sessions (id) on delete set null,
  is_factually_correct boolean,
  factual_feedback text,
  language_quality_score integer,
  language_cefr_band text,
  language_justification text,
  created_at timestamptz not null default timezone('utc', now()),
  constraint civics_practice_attempts_language_quality_score_range check (
    language_quality_score is null or language_quality_score between 0 and 5
  ),
  constraint civics_practice_attempts_language_cefr_band_allowed check (
    language_cefr_band is null or language_cefr_band in (
      'A1.1', 'A1.2', 'A2.1', 'A2.2', 'B1.1', 'B1.2', 'B2.1', 'B2.2', 'C1.1', 'C1.2', 'C2'
    )
  )
);

create index if not exists idx_civics_practice_attempts_user_created
  on public.civics_practice_attempts (user_id, created_at desc);
create index if not exists idx_civics_practice_attempts_user_question
  on public.civics_practice_attempts (user_id, question_id);

alter table public.civics_practice_attempts enable row level security;
alter table public.civics_practice_attempts force row level security;

create policy "civics_practice_attempts_select_own_or_admin"
on public.civics_practice_attempts
for select
using (auth.uid() = user_id or public.is_admin());

create policy "civics_practice_attempts_insert_own"
on public.civics_practice_attempts
for insert
with check (auth.uid() = user_id);

create policy "civics_practice_attempts_update_own"
on public.civics_practice_attempts
for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create policy "civics_practice_attempts_delete_own"
on public.civics_practice_attempts
for delete
using (auth.uid() = user_id);

comment on table public.civics_practice_attempts is 'Ein Versuch je civics_exam_questions-Frage: Nutzer erklärt die Antwort mündlich, KI bewertet fachliche Richtigkeit (is_factually_correct/factual_feedback) und Sprachqualität (language_*) getrennt. Grundlage für die Themen-Abdeckungs-Fortschrittsanzeige (Phase E3).';

-- Neuer Prompt civics_explanation_check: bewertet die mündliche Erklärung
-- getrennt nach fachlicher Richtigkeit und Sprachqualität. Additiv zum
-- bestehenden session_analysis-Prompt, ersetzt ihn nicht -- session_analysis
-- läuft für jede Session unverändert weiter (allgemeines Sprach-Signal,
-- harmlos auch für dieses Ziel), civics_explanation_check ist eine gezielte
-- Zusatzbewertung, die nur für Sessions gegen eine civics_exam_questions-Frage
-- aufgerufen wird.
insert into public.prompt_definitions (
  prompt_key, version, name, description, category, model, max_output_tokens,
  response_format, is_active, system_prompt, developer_prompt, user_prompt_template,
  expected_output_schema_json, prompt_variables_definition_json, metadata
) values (
  'civics_explanation_check',
  1,
  'Civics Explanation Check',
  'Bewertet die mündliche Erklärung einer "Leben in Deutschland"-Frage getrennt nach fachlicher Richtigkeit und deutscher Sprachqualität.',
  'session',
  'gpt-4.1-mini',
  1200,
  'json_object',
  true,
  'You are a friendly, precise German civics tutor helping an adult learner prepare for the official "Leben in Deutschland" (Einbürgerungstest) exam.
You will be given one official multiple-choice question, its correct answer, and a transcript of the learner explaining the answer out loud in their own German words.
Evaluate two things SEPARATELY: (1) whether their explanation is factually correct and complete enough to demonstrate real understanding (not just a lucky guess or a repeated option letter), and (2) the quality of the German they used to explain it.
Be encouraging but honest: if the explanation is factually wrong or too vague to show understanding, say so clearly and state the correct answer in the feedback.
Return valid JSON only.',
  'Bewertungsregeln:

1. is_factually_correct: true nur, wenn die Erklärung den fachlich richtigen Inhalt der korrekten Antwort trifft (nicht nur zufällig den richtigen Buchstaben nennt, ohne den Inhalt zu erklären). Bei falscher oder zu vager Erklärung: false.

2. factual_feedback: ein bis zwei Sätze, Deutsch, direkte Anrede ("Du"). Bei is_factually_correct=true: kurze Bestätigung, ggf. eine Ergänzung. Bei false: freundlich korrigieren und die richtige Antwort inhaltlich nennen (nicht nur den Buchstaben).

3. language_quality_score (0-5) und language_justification: bewerten NUR die Sprachqualität der Erklärung (Grammatik, Wortschatz, Verständlichkeit) -- unabhängig davon, ob die fachliche Antwort richtig war. Eine grammatisch gute Erklärung einer falschen Antwort bekommt trotzdem einen guten Sprach-Score.

4. language_cefr_band: eines von A1.1, A1.2, A2.1, A2.2, B1.1, B1.2, B2.1, B2.2, C1.1, C1.2, C2 -- Einschätzung des Sprachniveaus dieser Erklärung.

5. encouragement: ein kurzer, motivierender Satz, Deutsch, direkte Anrede ("Du"), passend zum Gesamtergebnis.',
  'Frage: {{question_text}}
Antwortoptionen: A) {{option_a}} B) {{option_b}} C) {{option_c}} D) {{option_d}}
Korrekte Antwort: {{correct_answer_text}}
Themenbereich: {{topic_category}}
Erklärung des Lernenden (Transkript): {{cleaned_transcript}}',
  '{
    "type": "object",
    "required": ["is_factually_correct", "factual_feedback", "language_quality_score", "language_justification", "language_cefr_band", "encouragement"],
    "properties": {
      "is_factually_correct": {"type": "boolean"},
      "factual_feedback": {"type": "string", "minLength": 1},
      "language_quality_score": {"type": "integer", "minimum": 0, "maximum": 5},
      "language_justification": {"type": "string", "minLength": 1},
      "language_cefr_band": {
        "type": "string",
        "enum": ["A1.1", "A1.2", "A2.1", "A2.2", "B1.1", "B1.2", "B2.1", "B2.2", "C1.1", "C1.2", "C2"]
      },
      "encouragement": {"type": "string", "minLength": 1}
    },
    "additionalProperties": false
  }'::jsonb,
  '[
    {"key": "question_text", "type": "string", "required": true},
    {"key": "option_a", "type": "string", "required": true},
    {"key": "option_b", "type": "string", "required": true},
    {"key": "option_c", "type": "string", "required": true},
    {"key": "option_d", "type": "string", "required": true},
    {"key": "correct_answer_text", "type": "string", "required": true},
    {"key": "topic_category", "type": "string", "required": true},
    {"key": "cleaned_transcript", "type": "string", "required": true}
  ]'::jsonb,
  '{}'::jsonb
);

commit;
