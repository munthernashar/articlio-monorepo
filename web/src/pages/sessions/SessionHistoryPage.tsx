import { PageHeader } from '@/components/ui/PageHeader';
import { SessionList } from '@/features/sessions/SessionList';

export function SessionHistoryPage() {
  return (
    <section className="page">
      <PageHeader
        title="Deine Sessions"
        subtitle="Alle deine Sessions im Überblick, mit deinem Verlauf über die Zeit."
      />
      <SessionList />
    </section>
  );
}
