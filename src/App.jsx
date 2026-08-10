import { Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { Home as HomeIcon, BarChart3, ListChecks, Users as UsersIcon, Target, ClipboardList, CalendarDays } from 'lucide-react';
import Login from './modules/login/Login.jsx';
import OperatorHome from './modules/operator/OperatorHome.jsx';
import Analytics from './modules/admin/Analytics.jsx';
import Areas from './modules/admin/Areas.jsx';
import Categories from './modules/admin/Categories.jsx';
import HeadcountHistory from './modules/admin/HeadcountHistory.jsx';
import AdminUsers from './modules/admin/Users.jsx';
import Plans from './modules/admin/Plans.jsx';
import Records from './modules/admin/Records.jsx';
import AppLayout from './shared/AppLayout.jsx';
import RequireAuth from './shared/RequireAuth.jsx';
import RequireRole from './shared/RequireRole.jsx';

const operatorNav = [
  { to: '/operator', end: true, icon: HomeIcon, label: 'Hoy' },
];

const adminNav = [
  { to: '/admin', end: true, icon: BarChart3, label: 'Panel' },
  { to: '/admin/headcount', icon: CalendarDays, label: 'Personas' },
  { to: '/admin/records', icon: ClipboardList, label: 'Registros' },
  { to: '/admin/plans', icon: Target, label: 'Planes' },
  { to: '/admin/users', icon: UsersIcon, label: 'Usuarios' },
];

function OperatorShell() {
  return (
    <AppLayout navItems={operatorNav}>
      <Outlet />
    </AppLayout>
  );
}

function AdminShell() {
  return (
    <AppLayout navItems={adminNav}>
      <Outlet />
    </AppLayout>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />

      <Route
        path="/operator"
        element={
          <RequireAuth>
            <OperatorShell />
          </RequireAuth>
        }
      >
        <Route index element={<OperatorHome />} />
      </Route>

      <Route
        path="/admin"
        element={
          <RequireAuth>
            <RequireRole roles={['admin']}>
              <AdminShell />
            </RequireRole>
          </RequireAuth>
        }
      >
        <Route index element={<Analytics />} />
        <Route path="records" element={<Records />} />
        <Route path="areas" element={<Areas />} />
        <Route path="categories" element={<Categories />} />
        <Route path="headcount" element={<HeadcountHistory />} />
        <Route path="users" element={<AdminUsers />} />
        <Route path="plans" element={<Plans />} />
      </Route>

      <Route path="/" element={<Navigate to="/operator" replace />} />
      <Route path="*" element={<Navigate to="/operator" replace />} />
    </Routes>
  );
}
