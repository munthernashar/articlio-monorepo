import { useEffect, useId, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { CreditCard, GraduationCap, History, Home, LogOut, Map, Shield, User } from 'lucide-react';
import { paths } from '@/app/routes/paths';
import { useAuth } from '@/features/auth/useAuth';

const navItems = [
  { to: paths.dashboard, label: 'Home', icon: Home },
  { to: paths.sessions.list, label: 'Verläufe', icon: History },
  { to: paths.tutor, label: 'Coach', icon: GraduationCap },
  { to: paths.skillMap, label: 'Skill Map', icon: Map },
];

export function AppShell() {
  const navigate = useNavigate();
  const { user, isAdmin, role, logout } = useAuth();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false);
  const mobileMenuId = useId();
  const accountMenuId = useId();
  const mobileMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);

  const onLogout = async () => {
    await logout();
    navigate(paths.auth.login, { replace: true });
  };
  const nameParts =
    user?.user_metadata && typeof user.user_metadata.display_name === 'string'
      ? user.user_metadata.display_name.trim().split(/\s+/).filter(Boolean)
      : [];
  const initials =
    nameParts.length >= 2
      ? `${nameParts[0]?.[0] ?? ''}${nameParts[nameParts.length - 1]?.[0] ?? ''}`.toUpperCase()
      : (nameParts[0]?.slice(0, 2) ?? user?.email?.slice(0, 2) ?? 'U').toUpperCase();

  const closeMobileMenu = () => {
    setIsMobileMenuOpen(false);
    mobileMenuButtonRef.current?.focus();
  };

  useEffect(() => {
    if (!isMobileMenuOpen && !isAccountMenuOpen) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileMenu();
        setIsAccountMenuOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isMobileMenuOpen, isAccountMenuOpen]);

  useEffect(() => {
    if (!isAccountMenuOpen) {
      return;
    }

    const onPointerDown = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) {
        return;
      }

      if (accountMenuRef.current?.contains(target)) {
        return;
      }

      setIsAccountMenuOpen(false);
    };

    window.addEventListener('mousedown', onPointerDown);
    return () => window.removeEventListener('mousedown', onPointerDown);
  }, [isAccountMenuOpen]);

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
    <div className="app-shell">
      <header className="app-header">
        <Link to={paths.dashboard} className="logo">
          Articlio
        </Link>

        <div className="main-nav-scroll">
          <nav className="main-nav" aria-label="Hauptnavigation">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className="nav-link">
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

        <div className="auth-toolbar" ref={accountMenuRef}>
          <button
            type="button"
            className="auth-avatar-button"
            aria-expanded={isAccountMenuOpen}
            aria-controls={accountMenuId}
            onClick={() => setIsAccountMenuOpen((current) => !current)}
          >
            <span aria-hidden="true">{initials || 'U'}</span>
            <span className="sr-only">Account-Menü öffnen</span>
          </button>
          {isAccountMenuOpen ? (
            <div id={accountMenuId} className="account-menu" role="menu" aria-label="Account-Menü">
              <div className="account-menu-identity">
                <p className="account-menu-user">{nameParts.join(' ') || user?.email || 'Unbekannt'}</p>
                <p className="account-menu-role">{role}</p>
              </div>
              <div className="account-menu-actions">
                {isAdmin ? (
                  <NavLink to={paths.admin.dashboard} className="nav-link mobile-nav-link" role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>
                    <Shield aria-hidden="true" size={16} className="nav-link-icon" />
                    Admin
                  </NavLink>
                ) : null}
                <NavLink to={paths.profile} className="nav-link mobile-nav-link" role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>
                  <User aria-hidden="true" size={16} className="nav-link-icon" />
                  Profil bearbeiten
                </NavLink>
                <NavLink to={paths.billing.pricing} className="nav-link mobile-nav-link" role="menuitem" onClick={() => setIsAccountMenuOpen(false)}>
                  <CreditCard aria-hidden="true" size={16} className="nav-link-icon" />
                  Preise & Abrechnung
                </NavLink>
              </div>
              <button type="button" className="button button-secondary account-menu-logout" role="menuitem" onClick={onLogout}>
                <LogOut aria-hidden="true" size={16} className="nav-link-icon" />
                Logout
              </button>
            </div>
          ) : null}
        </div>
      </header>
      {isMobileMenuOpen ? (
        <>
          <div className="mobile-nav-backdrop" onClick={closeMobileMenu} aria-hidden="true" />
          <div
            id={mobileMenuId}
            ref={mobileMenuRef}
            className="mobile-nav-panel"
            role="dialog"
            aria-modal="true"
            aria-label="Mobile Hauptnavigation"
            onKeyDown={onMobilePanelKeyDown}
          >
            <nav className="main-nav main-nav-mobile" aria-label="Hauptnavigation mobil">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className="nav-link mobile-nav-link"
                  onClick={closeMobileMenu}
                >
                  <item.icon aria-hidden="true" size={18} className="nav-link-icon" />
                  {item.label}
                </NavLink>
              ))}
            </nav>
          </div>
        </>
      ) : null}
      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
