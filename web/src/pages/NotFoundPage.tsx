import { Link } from 'react-router-dom';
import { paths } from '@/app/routes/paths';

export function NotFoundPage() {
  return (
    <div className="centered-page">
      <h1>404</h1>
      <p>Diese Seite existiert nicht.</p>
      <Link className="button" to={paths.dashboard}>
        Zum Dashboard
      </Link>
    </div>
  );
}
