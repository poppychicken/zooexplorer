import { Navigate } from 'react-router-dom';
import MainLayout from './layouts/MainLayout';
import DashboardPage from './pages/DashboardPage';
import ItemsPage from './pages/ItemsPage';
import ErrorBoundary from './components/ErrorBoundary';

// No /login route, no ProtectedRoute wrapper — identity is enforced
// at the platform gateway via SSO. Every request that reaches this
// React app is already authenticated. See src/api/me.js for the
// `useCurrentUser` hook that surfaces the caller's email/name.
const routes = [
  {
    path: '/',
    element: <Navigate to="/dashboard" replace />,
  },
  {
    path: '/',
    element: <MainLayout />,
    children: [
      {
        path: 'dashboard',
        element: <ErrorBoundary><DashboardPage /></ErrorBoundary>
      },
      {
        path: 'items',
        element: <ErrorBoundary><ItemsPage /></ErrorBoundary>
      },
    ],
  },
  // Catch-all
  {
    path: '*',
    element: <Navigate to="/dashboard" replace />,
  },
];

export default routes;
