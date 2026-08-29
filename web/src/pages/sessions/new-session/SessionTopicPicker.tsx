import { Skeleton } from '@/components/ui/Skeleton';
import { TOPIC_TEMPLATES } from './topic-templates';
import type { DailyPromptSuggestion } from './useDailyPromptSuggestion';

type Props = {
  suggestion: DailyPromptSuggestion;
  selectedTemplateTopic: string;
  isCreating: boolean;
  canCreate: boolean;
  onConfirmSuggested: () => void;
  onPickDifferentTopic: () => void;
  onSelectTemplate: (value: string) => void;
};

export function SessionTopicPicker({
  suggestion,
  selectedTemplateTopic,
  isCreating,
  canCreate,
  onConfirmSuggested,
  onPickDifferentTopic,
  onSelectTemplate,
}: Props) {
  return (
    <>
      <div className="session-opener-bubble" role="status" aria-live="polite">
        {suggestion.isLoading ? (
          <>
            <span className="sr-only">Persönlicher Themenvorschlag wird vorbereitet …</span>
            <Skeleton width="90%" height="1.1rem" />
            <Skeleton width="65%" height="1.1rem" />
          </>
        ) : (
          <>
            <p className="session-opener-question">{suggestion.promptText}</p>
            {suggestion.rationale ? <p className="session-opener-rationale">{suggestion.rationale}</p> : null}
          </>
        )}
      </div>

      <div className="button-row session-creation-actions button-row--stack-mobile">
        <button type="button" className="button button-secondary" onClick={onConfirmSuggested} disabled={!canCreate}>
          {isCreating ? 'Session wird erstellt ...' : 'Ja, das passt'}
        </button>
        <button type="button" className="button button-secondary" onClick={onPickDifferentTopic}>
          Anderes Thema
        </button>
      </div>

      <details className="session-topic-fallback">
        <summary>Oder selbst ein Thema wählen</summary>
        <label className="auth-label" htmlFor="session-topic-template">
          Thema aus Vorlagen
        </label>
        <select
          id="session-topic-template"
          className="auth-input"
          value={selectedTemplateTopic}
          onChange={(event) => onSelectTemplate(event.target.value)}
        >
          <option value="">Bitte wählen ...</option>
          {TOPIC_TEMPLATES.map((template) => (
            <option key={template} value={template}>
              {template}
            </option>
          ))}
        </select>
      </details>
    </>
  );
}
