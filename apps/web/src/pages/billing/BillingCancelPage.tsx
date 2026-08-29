import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';

export function BillingCancelPage() {
  return (
    <section className="page">
      <header className="page-header">
        <h1>Zahlung abgebrochen</h1>
        <p>Dein Checkout wurde nicht abgeschlossen. Es wurden keine Änderungen an deinem Plan vorgenommen.</p>
      </header>

      <article className="card" style={{ display: 'grid', gap: '1rem' }}>
        <p>Du kannst den Checkout jederzeit erneut starten oder zuerst die verfügbaren Pakete vergleichen.</p>
        <div className="button-row">
          <Link className="button" to={paths.billing.pricing}>
            Zur Preisübersicht
          </Link>
          <Link className="button button-secondary" to={paths.dashboard}>
            Zum Dashboard
          </Link>
        </div>
      </article>
    </section>
  );
}
