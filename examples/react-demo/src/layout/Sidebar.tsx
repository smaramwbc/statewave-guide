import { NavLink } from 'react-router-dom';

/**
 * Note that every `data-guide` value here is written out as a literal.
 *
 * The indexer only records facts it can prove from the syntax tree, so a
 * computed identifier — `data-guide={link.guideId}` from a `.map()` — is
 * deliberately skipped. It would still register at runtime, but it would be
 * missing from the Product Model, and the two must agree.
 */
export function Sidebar() {
  return (
    <aside className="sidebar" data-guide="nav" data-guide-type="menu">
      <h1>Statewave Guide</h1>
      <p className="tagline">React demo</p>
      <nav>
        <NavLink
          to="/"
          end
          data-guide="nav.dashboard"
          data-guide-type="link"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          Dashboard
        </NavLink>
        <NavLink
          to="/clients"
          data-guide="nav.clients"
          data-guide-type="link"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          Clients
        </NavLink>
        <NavLink
          to="/settings"
          data-guide="nav.settings"
          data-guide-type="link"
          className={({ isActive }) => (isActive ? 'active' : undefined)}
        >
          Settings
        </NavLink>
      </nav>
    </aside>
  );
}
