import { PageHeader } from '@/components/ui/PageHeader';
import { ProgressOverview } from '@/features/progress/ProgressOverview';

export function ProgressPage() {
  return (
    <section className="page">
      <PageHeader
        title="Fortschritt"
        subtitle="Sieh deinen Verlauf über Sessions hinweg und erkenne Trends pro Kategorie."
      />
      <ProgressOverview />
    </section>
  );
}
