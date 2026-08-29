import { NavLink, Outlet } from 'react-router-dom';
import { PageHeader } from '@/components/ui/PageHeader';
import { paths } from '@/app/routes/paths';

const ADMIN_NAV_ITEMS = [
  { to: paths.admin.prompts, label: 'Prompts', description: 'Prompt-Definitionen und Runtime-Health.' },
  { to: paths.admin.settings, label: 'Einstellungen', description: 'Globale Defaults und Feature-Flags.' },
  { to: paths.admin.entitlements, label: 'Entitlements', description: 'Manuelle User-Overrides und Limits.' },
  { to: paths.admin.billingEvents, label: 'Billing Ops', description: 'Webhook-Events, Replay und Timeline.' },
  { to: paths.admin.dashboard, label: 'Monitoring', description: 'Funnel, Kosten und Audit/Fehler-Monitoring.' },
] as const;

export function AdminWorkspaceLayout() {
  return (
    <section className="page">
      <PageHeader
        title="Admin"
        subtitle="Zentrale Admin-Workstation mit schneller Navigation statt langer Scroll-Listen."
      />

      <div className="admin-workspace-layout">
        <aside className="card admin-workspace-sidebar" aria-label="Admin Navigation">
          <h3>Bereiche</h3>
          <nav className="admin-workspace-nav">
            {ADMIN_NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) => `admin-workspace-link${isActive ? ' is-active' : ''}`}
                end={item.to === paths.admin.dashboard}
              >
                <strong>{item.label}</strong>
                <span>{item.description}</span>
              </NavLink>
            ))}
          </nav>
        </aside>

        <div className="admin-workspace-content">
          <Outlet />
        </div>
      </div>
    </section>
  );
}
