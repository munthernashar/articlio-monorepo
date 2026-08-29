import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Home, LogIn, Sparkles, Tag, UserPlus } from 'lucide-react';
import { paths } from '@/app/routes/paths';

const publicNavItems = [
  { to: paths.landing, label: 'Home', end: true, icon: Home },
  { to: paths.public.features, label: 'Features', icon: Sparkles },
  { to: paths.public.pricing, label: 'Preise', icon: Tag },
  { to: paths.auth.register, label: 'Registrieren', icon: UserPlus },
  { to: paths.auth.login, label: 'Anmelden', icon: LogIn },
];

export function PublicNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const mobileMenuId = useId();
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    mobileMenuButtonRef.current?.focus();
  };

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileMenu();
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobileMenuOpen]);

  useEffect(() => {
    if (!isMobileMenuOpen) {
      return;
    }

    const firstFocusable = mobileMenuRef.current?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    firstFocusable?.focus();
  }, [isMobileMenuOpen]);

  const onMobilePanelKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key !== 'Tab') {
      return;
    }

    const focusableElements = mobileMenuRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );

    if (!focusableElements || focusableElements.length === 0) {
      return;
    }

    const focusables = Array.from(focusableElements);
    const firstElement = focusables[0];
    const lastElement = focusables[focusables.length - 1];
    const activeElement = document.activeElement;

    if (!firstElement || !lastElement) {
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus();
    } else if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus();
    }
  };

  return (
    <>
      <header className="public-header">
        <Link to={paths.landing} className="logo">
          Articlio
        </Link>

        <div className="main-nav-scroll">
          <nav className="main-nav" aria-label="Öffentliche Navigation">
            {publicNavItems.map((item) => (
              <NavLink key={item.to} to={item.to} end={item.end} className="nav-link">
                <item.icon aria-hidden="true" size={18} className="nav-link-icon" />
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <button
          ref={mobileMenuButtonRef}
          type="button"
          className="mobile-nav-toggle"
          aria-expanded={isMobileMenuOpen}
          aria-controls={mobileMenuId}
          aria-label={isMobileMenuOpen ? 'Navigation schließen' : 'Navigation öffnen'}
          onClick={() => setIsMobileMenuOpen((current) => !current)}
        >
          {isMobileMenuOpen ? 'Menü schließen' : 'Menü'}
        </button>
      </header>

      {isMobileMenuOpen ? (
        <>
          {/* Als Geschwister von <header>, nicht als Kind - .public-header hat
              backdrop-filter, was für position:fixed-Nachfahren einen eigenen
              Containing Block erzeugt und dieses Overlay sonst auf die
              Kopfzeilenhöhe zusammenstaucht statt den ganzen Viewport zu
              bedecken (siehe AppShell.tsx, das exakt deshalb schon immer so
              strukturiert war). */}
          <div className="mobile-nav-backdrop" onClick={closeMobileMenu} aria-hidden="true" />
          <div
            id={mobileMenuId}
            ref={mobileMenuRef}
            className="mobile-nav-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile öffentliche Navigation"
            onKeyDown={onMobilePanelKeyDown}
          >
            <nav className="main-nav main-nav-mobile" aria-label="Öffentliche Navigation mobil">
              {publicNavItems.map((item) => (
                <NavLink key={item.to} to={item.to} end={item.end} className="nav-link mobile-nav-link" onClick={closeMobileMenu}>
                  <item.icon aria-hidden="true" size={18} className="nav-link-icon" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      ) : null}
    </>
  );
}
