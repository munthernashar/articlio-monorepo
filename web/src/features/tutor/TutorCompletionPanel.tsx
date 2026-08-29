import { Link } from 'react-router-dom';
import { CheckCircle } from 'lucide-react';
import { paths } from '@/app/routes/paths';
import { InlineAlert } from '@/components/ui/InlineAlert';
import { ICON_SIZE_MD } from '@/lib/icon-sizes';

type Props = {
  hasAiCompletionContent: boolean;
  completionTitle?: string;
  completionMessage?: string;
  trainedTodayPoints: string[];
  completionAssessment: string;
  aiTechnicalErrorMessage: string;
  reflectionPrompt: string;
  reflectionText: string;
  onReflectionTextChange: (value: string) => void;
  reflectionSaved: boolean;
  onSaveReflection: () => void;
  onSkipReflection: () => void;
  onRetryTraining: () => void;
};

export function TutorCompletionPanel({
  hasAiCompletionContent,
  completionTitle,
  completionMessage,
  trainedTodayPoints,
  completionAssessment,
  aiTechnicalErrorMessage,
  reflectionPrompt,
  reflectionText,
  onReflectionTextChange,
  reflectionSaved,
  onSaveReflection,
  onSkipReflection,
  onRetryTraining,
}: Props) {
  return (
    <div className="card tutor-panel-spacing">
      <h3 className="card-heading-with-icon">
        {hasAiCompletionContent ? (
          <CheckCircle aria-hidden="true" size={ICON_SIZE_MD} className="icon--success" />
        ) : null}
        Training abgeschlossen
      </h3>
      {hasAiCompletionContent ? (
        <>
          {completionTitle ? <p>{completionTitle}</p> : null}
          {completionMessage ? <p className="tutor-session-intro">{completionMessage}</p> : null}
          {trainedTodayPoints.length > 0 ? (
            <>
              <p>
                <strong>Heute trainiert</strong>
              </p>
              <ul>
                {trainedTodayPoints.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </>
          ) : null}
          {completionAssessment ? (
            <>
              <p>
                <strong>Einschätzung</strong>
              </p>
              <p>{completionAssessment}</p>
            </>
          ) : null}
        </>
      ) : (
        <InlineAlert tone="danger">{aiTechnicalErrorMessage}</InlineAlert>
      )}
      <div className="tutor-panel-spacing">
        <p>
          <strong>Optionaler Eintrag</strong>
        </p>
        <p className="tutor-session-intro">{reflectionPrompt}</p>
        <textarea
          className="auth-input"
          value={reflectionText}
          onChange={(e) => onReflectionTextChange(e.target.value.slice(0, 180))}
          placeholder="Optionaler Eintrag."
          rows={2}
          disabled={reflectionSaved}
        />
        <div className="button-row button-row--start tutor-reflection-actions">
          <button className="button button-secondary" type="button" disabled={reflectionSaved || !reflectionText.trim()} onClick={onSaveReflection}>
            Rückblick speichern
          </button>
          <button className="button button-secondary" type="button" disabled={reflectionSaved} onClick={onSkipReflection}>
            Überspringen
          </button>
        </div>
      </div>
      <div className="button-row button-row--start tutor-panel-spacing">
        <button className="button" type="button" onClick={onRetryTraining}>
          Noch eine Runde üben
        </button>
        <Link className="button button-secondary" to={paths.skillMap}>
          Zur Skill Map
        </Link>
      </div>
    </div>
  );
}
