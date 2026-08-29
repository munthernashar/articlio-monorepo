import { PageHeader } from '@/components/ui/PageHeader';
import { UserDashboard } from '@/features/dashboard/UserDashboard';

export function DashboardPage() {
  return (
    <section className="page">
      <PageHeader
        title="Dein Dashboard"
        subtitle="Dein persönlicher Sprachcoach zeigt dir hier deinen nächsten Schritt und deinen Lernverlauf."
      />
      <UserDashboard />
    </section>
  );
}
