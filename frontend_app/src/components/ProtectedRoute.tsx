import { Navigate, Outlet } from 'react-router-dom';
import { useAuthStore } from '../store/auth';

export function ProtectedRoute() {
  const hasKeys = useAuthStore((s) => s.hasSessionKeys());

  if (!hasKeys) return <Navigate to="/local-unlock" replace />;
  return <Outlet />;
}
