import ExportLogDashboard from '@/components/ExportLogDashboard';
import { useAuth } from '@/portal-v2/services/authService';
import { Redirect } from 'wouter';

export default function ExportLogPage() {
  const { isAuthenticated, isLoading } = useAuth();

  // Admin-only route (in a real app, we would check for admin role)
  if (!isLoading && !isAuthenticated) {
    return <Redirect to="/concept2cure/login" />;
  }

  return (
    <div>
      <ExportLogDashboard />
    </div>
  );
}
