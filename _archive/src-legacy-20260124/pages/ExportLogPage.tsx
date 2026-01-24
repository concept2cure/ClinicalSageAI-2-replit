import ExportLogDashboard from '@/components/ExportLogDashboard';
import { useAuth } from '@/contexts/AuthContext';
import { Redirect } from 'wouter';

export default function ExportLogPage() {
  const { user, isLoading } = useAuth();

  // Admin-only route (in a real app, we would check for admin role)
  if (!isLoading && !user) {
    return <Redirect to="/login" />;
  }

  return (
    <div>
      <ExportLogDashboard />
    </div>
  );
}
