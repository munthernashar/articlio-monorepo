begin;

-- Lernpfade Phase E4 (26.08.2026): Inhalts-Migration für civics_exam_questions.
-- Fragen- und Antwort-TEXT ist mechanisch aus der offiziellen BAMF-PDF
-- (docs/gesamtfragenkatalog-lebenindeutschland.pdf, Stand 07.05.2025) extrahiert,
-- nicht abgetippt -- 300 allgemeine + 160 landesspezifische Fragen, exakt wie im
-- Quelldokument. Das Quelldokument selbst markiert KEINE richtige Antwort (reines
-- Lernheft ohne Lösungsschlüssel) -- correct_option wurde daher von Claude aus
-- allgemeinem Wissen befüllt und ist NICHT gegen die Quelle verifiziert. Jede
-- Zeile trägt deshalb verification_status = 'unverified_by_source'.
-- 39 Fragen, die ohne das zugehörige Bild/Karte nicht sinnvoll beantwortbar sind
-- (je Bundesland Wappen + Bundeslandkarte = 32, plus Wappen BRD/DDR/EU-Flagge,
-- Wahlzettel-Muster, Besatzungszonen-Karte = 7 allgemeine), sind is_active = false
-- gesetzt statt mit erfundenen Bildbeschreibungen befüllt zu werden.

alter table public.civics_exam_questions
  add column if not exists verification_status text not null default 'unverified_by_source';

alter table public.civics_exam_questions
  add constraint civics_exam_questions_verification_status_allowed
  check (verification_status in ('unverified_by_source', 'verified'));

comment on column public.civics_exam_questions.verification_status is 'unverified_by_source: correct_option wurde von Claude aus allgemeinem Wissen befüllt, da die BAMF-Quell-PDF keinen Lösungsschlüssel enthält -- noch nicht gegen eine autoritative Quelle geprüft. verified: von einem Menschen geprüft/bestätigt.';

commit;
