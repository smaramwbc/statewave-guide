/** The application's primary navigation. */
import { Link, NavLink } from 'react-router-dom';
import { HELP_URL } from '../lib/constants';

/** Primary navigation. Every destination is a literal route path. */
export function AppNav() {
  return (
    <nav className="app-nav" data-guide="nav" aria-label="Primary">
      <NavLink to="/" data-guide="nav.dashboard" className={({ isActive }) => (isActive ? 'is-active' : '')}>
        Dashboard
      </NavLink>
      <NavLink to="/clients" data-guide="nav.clients" className={({ isActive }) => (isActive ? 'is-active' : '')}>
        Clients
      </NavLink>
      <NavLink to="/invoices" data-guide="nav.invoices" className={({ isActive }) => (isActive ? 'is-active' : '')}>
        Invoices
      </NavLink>
      <Link to="/settings" data-guide="nav.settings">
        Settings
      </Link>
      {/* An external URL that happens to contain `/clients`. Not a route. */}
      <a href={HELP_URL} data-guide="nav.help" target="_blank" rel="noreferrer">
        Help
      </a>
    </nav>
  );
}
