import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';

type Props = {
  recentTopics: string[];
};

export function SessionHistoryAccordion({ recentTopics }: Props) {
  return (
    <details className="session-history-accordion">
      <summary>Verlauf</summary>
      {recentTopics.length > 0 ? (
        <p>
          Letzte Themen: <strong>{recentTopics.join(', ')}</strong>
        </p>
      ) : (
        <p>Noch keine letzten Themen vorhanden.</p>
      )}
      <p>
        <Link to={paths.sessions.list}>Alle Sessions im Verlauf öffnen</Link>
      </p>
    </details>
  );
}
