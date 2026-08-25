import { createBrowserRouter } from 'react-router-dom';
import { ClientDetail } from './pages/ClientDetail';
import { Clients } from './pages/Clients';

export const router = createBrowserRouter([
  {
    path: '/clients',
    element: <Clients />,
    children: [
      { path: 'new', element: <ClientDetail /> },
      { path: '/clients/archived', element: <ClientDetail /> },
    ],
  },
]);
