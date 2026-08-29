import type { CivicsExamQuestion } from '@/services/supabase/civics-exam-questions.service';

type Props = {
  question: CivicsExamQuestion;
  isCreating: boolean;
  canCreate: boolean;
  onStart: () => void;
};

/**
 * Lernpfade Phase E2b: Ersetzt SessionTopicPicker für das Ziel "Leben in Deutschland" -- statt
 * eines offenen Gesprächsthemas wird eine echte Frage aus dem offiziellen BAMF-Katalog gezeigt.
 * Bewusst kein "Anderes Thema"/Vorlagen-Fallback wie beim generischen Flow: die nächste Frage
 * kommt aus der themenbasierten Auswahl in civicsExamQuestionsService, ein manueller Wechsel
 * würde diese Steuerung unterlaufen.
 */
export function CivicsQuestionPicker({ question, isCreating, canCreate, onStart }: Props) {
  return (
    <>
      <div className="session-opener-bubble" role="status" aria-live="polite">
        <p className="session-opener-question">{question.questionText}</p>
        <ul style={{ marginTop: 8, paddingLeft: 20, display: 'grid', gap: 4 }}>
          <li>A) {question.optionA}</li>
          <li>B) {question.optionB}</li>
          <li>C) {question.optionC}</li>
          <li>D) {question.optionD}</li>
        </ul>
        <p className="session-opener-rationale">
          Erkläre die richtige Antwort einfach mit deinen eigenen Worten.
        </p>
      </div>

      <div className="button-row session-creation-actions button-row--stack-mobile">
        <button type="button" className="button button-secondary" onClick={onStart} disabled={!canCreate}>
          {isCreating ? 'Session wird erstellt ...' : 'Aufnahme starten'}
        </button>
      </div>
    </>
  );
}
