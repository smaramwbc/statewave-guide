import { useEffect } from 'react';
import { Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { StatewaveGuideProvider } from '@statewavedev/guide-react';
import { Sidebar } from './layout/Sidebar';
import { ClientDetails } from './pages/ClientDetails';
import { Clients } from './pages/Clients';
import { Dashboard } from './pages/Dashboard';
import { Settings } from './pages/Settings';
import { GuideDemoPanel } from './guide/GuideDemoPanel';
import { guide } from './guide/runtime';

/**
 * Pushes the router's location into the guide's application context.
 *
 * The guide never reads the router. The host owns the context and reports it —
 * which is what lets the same runtime work under a different router, or none.
 */
function RouteSync() {
  const { pathname } = useLocation();

  useEffect(() => {
    guide.patchContext({ route: pathname });
  }, [pathname]);

  return null;
}

export function App() {
  const navigate = useNavigate();

  return (
    <StatewaveGuideProvider
      runtime={guide}
      // Supplying this is what registers the built-in `navigate` action.
      // Without it the action simply does not exist — the React package will
      // not invent a routing implementation.
      navigate={({ route, replace }) => navigate(route, { replace: replace ?? false })}
    >
      <RouteSync />
      <div className="app">
        <Sidebar />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/clients" element={<Clients />} />
          <Route path="/clients/:clientId" element={<ClientDetails />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
      <GuideDemoPanel />
    </StatewaveGuideProvider>
  );
}
