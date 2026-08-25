import { Route, Routes } from 'react-router-dom';
import { Clients } from './pages/Clients';
import Dashboard from './pages/Dashboard';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/clients" element={<Clients />} />
      <Route path="/settings" component={Settings} />
    </Routes>
  );
}
