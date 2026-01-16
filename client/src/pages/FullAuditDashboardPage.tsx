import React from 'react';
import { useLocation } from 'wouter';
import { FullAuditDashboard } from '../components/FullAuditDashboard';
import { Button } from '@/components/ui/button';
import { ChevronLeft } from 'lucide-react'

const FullAuditDashboardPage: React.FC = () => {
  const [, setLocation] = useLocation();

  // Parse query parameters for organization, project, and region filters
  const params = new URLSearchParams(window.location.search);
  const organizationId = params.get('org') || undefined;
  const projectId = params.get('project') || undefined;
  const region = params.get('region') || undefined;

  const handleBack = () => {
    setLocation('/admin-dashboard');
  };

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="flex items-center mb-6">
        <Button variant="ghost" className="mr-2" onClick={handleBack}>
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-3xl font-bold">Full Audit Dashboard</h1>
      </div>

      <div className="w-full bg-white rounded-lg shadow-lg p-6">
        <FullAuditDashboard organizationId={organizationId} projectId={projectId} region={region} />
      </div>
    </div>
  );
};

export default FullAuditDashboardPage;
