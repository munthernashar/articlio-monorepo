import { PageHeader } from '@/components/ui/PageHeader';
import { SkillMapOverview } from '@/features/progress/SkillMapOverview';

export function SkillMapPage() {
  return (
    <section className="page">
      <PageHeader
        title="Skill Map"
        subtitle="Visualisiere deine Kompetenzen pro Kategorie inklusive aktuellem Stand, Durchschnitt und Trend."
      />
      <SkillMapOverview />
    </section>
  );
}
