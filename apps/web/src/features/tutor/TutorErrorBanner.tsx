import { InlineAlert } from '@/components/ui/InlineAlert';

type Props = {
  errorMessage: string | null;
  onRetry: () => void;
};

export function TutorErrorBanner({ errorMessage, onRetry }: Props) {
  if (!errorMessage) return null;

  return (
    <InlineAlert
      tone="danger"
      action={
        <button className="button button-secondary" type="button" onClick={onRetry}>
          Erneut versuchen
        </button>
      }
    >
      {errorMessage}
    </InlineAlert>
  );
}
