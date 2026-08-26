/**
 * The route table.
 *
 * One `<Routes>` element, five literal paths, one component each. This is the
 * easiest thing in the whole fixture to extract and the hardest to get wrong —
 * which makes it a good canary: if `route:/clients` is missing, nothing
 * downstream of it can be right either.
 */
import { Route, Routes } from 'react-router-dom';
import { AppNav } from './components/AppNav';
import { ClientDetailPage } from './pages/ClientDetailPage';
import { ClientsPage } from './pages/ClientsPage';
import DashboardPage from './pages/DashboardPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { SettingsPage } from './pages/SettingsPage';

/** The application shell and its routes. */
export function App() {
  return (
    <div className="app-shell" data-guide="app.shell">
      <AppNav />
      <main className="app-main">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:clientId" element={<ClientDetailPage />} />
          <Route path="/invoices" element={<InvoicesPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<p data-guide="app.not-found">No such page.</p>} />
        </Routes>
      </main>
    </div>
  );
}
