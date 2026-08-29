begin;

-- Korrektur zu Phase E1: "Mecklenburg-Vorpommern-10" (25 Zeichen) und andere
-- lange Bundesland-Namen im external_number-Format "{Bundesland}-{N}"
-- überschreiten das ursprüngliche 20-Zeichen-Limit aus
-- 20260826140000_create_civics_exam_questions.sql. Erhöht auf 40.
alter table public.civics_exam_questions
  drop constraint civics_exam_questions_external_number_length;

alter table public.civics_exam_questions
  add constraint civics_exam_questions_external_number_length
  check (char_length(trim(external_number)) between 1 and 40);

commit;
