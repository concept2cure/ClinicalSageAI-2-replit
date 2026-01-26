import React from 'react';
import { useTenant } from '@/contexts/TenantContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLocation } from 'wouter';
import { usePortal } from '../../core/portalContext';

const moduleToRoute: Record<string, string> = {
  dashboard: '/client-portal',
  vault: '/client-portal/vault',
  regulatory_intel: '/client-portal/regulatory-intel',
  cmc_platform: '/client-portal/cmc-wizard',
  clinical_trial: '/client-portal/study-architect',
  quality_management: '/client-portal/regulatory-intel',
  document_control: '/client-portal/vault',
  analytics: '/client-portal/analytics',
  settings: '/module-settings',
};

export const Dashboard = () => {
  const tenant = useTenant();
  const { experience } = usePortal();
  const [, setLocation] = useLocation();

  const orgName = tenant.currentOrganization?.name || 'Organization';
  const clientName = tenant.currentClientWorkspace?.name || 'Client Workspace';

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900">Client Portal V2</h1>
          <p className="text-sm text-muted-foreground">
            Unified workspace for {orgName} • {clientName}
          </p>
        </div>
        <Badge variant="secondary">{experience.features.join(', ')}</Badge>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Module Access</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {experience.modules.map(moduleId => (
            <button
              key={moduleId}
              onClick={() => setLocation(moduleToRoute[moduleId] || '/client-portal')}
              className="rounded-lg border border-gray-200 bg-white p-4 text-left transition hover:border-blue-200 hover:bg-blue-50"
            >
              <div className="text-sm font-semibold text-gray-900">
                {moduleId.replace('_', ' ').toUpperCase()}
              </div>
              <div className="mt-2 text-xs text-muted-foreground">
                Access {moduleId.replace('_', ' ')} module
              </div>
            </button>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Tenant Context</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Organization</div>
            <div className="text-base font-medium text-gray-900">{orgName}</div>
          </div>
          <div>
            <div className="text-xs uppercase text-muted-foreground">Client Workspace</div>
            <div className="text-base font-medium text-gray-900">{clientName}</div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-3">
        <Button onClick={() => setLocation('/client-portal/vault')}>Open Vault</Button>
        <Button variant="outline" onClick={() => setLocation('/submission-center')}>
          Open Submission Center
        </Button>
        <Button variant="outline" onClick={() => setLocation('/client-portal/analytics')}>
          Open Analytics
        </Button>
      </div>
    </div>
  );
};
