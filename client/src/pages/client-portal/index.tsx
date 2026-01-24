/**
 * Client Portal - New UI Entry Point
 * 
 * This is the main entry point for the redesigned Client Portal.
 * Features a modern, clean interface with dashboard widgets and quick actions.
 */

import { ClientPortalLayout } from '@/components/client-portal/navigation/ClientPortalLayout';
import { DashboardOverview } from '@/components/client-portal/dashboard/DashboardOverview';

export default function ClientPortalPage() {
  return (
    <ClientPortalLayout>
      <DashboardOverview />
    </ClientPortalLayout>
  );
}

export { ClientPortalPage };
