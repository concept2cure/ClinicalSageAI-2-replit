import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Activity, AlertTriangle, RefreshCw, ShieldCheck } from 'lucide-react';

const StatusBadge = ({ status }) => {
  if (status === 'ok' || status === 'connected') {
    return <Badge className="bg-emerald-100 text-emerald-800">Healthy</Badge>;
  }
  if (status === 'configured') {
    return <Badge className="bg-blue-100 text-blue-800">Configured</Badge>;
  }
  if (status === 'missing') {
    return <Badge variant="outline">Missing</Badge>;
  }
  return <Badge variant="outline">{status || 'Unknown'}</Badge>;
};

const SupportConsole = () => {
  const [selectedClientId, setSelectedClientId] = useState('');

  const diagnosticsQuery = useQuery({
    queryKey: ['/api/support/diagnostics'],
    queryFn: () => apiRequest('/api/support/diagnostics'),
    refetchOnWindowFocus: false,
  });

  const clientsQuery = useQuery({
    queryKey: ['/api/clients', 'all'],
    queryFn: () => apiRequest('/api/clients/all'),
    refetchOnWindowFocus: false,
  });

  const integrationQuery = useQuery({
    queryKey: ['/api/clients', selectedClientId, 'integrations-status'],
    queryFn: () => apiRequest(`/api/clients/${selectedClientId}/integrations/status`),
    enabled: Boolean(selectedClientId),
    refetchOnWindowFocus: false,
  });

  const diagnostics = diagnosticsQuery.data;
  const dependencies = diagnostics?.dependencies || [];
  const integrations = diagnostics?.integrations || [];
  const dataFlows = diagnostics?.dataFlows || [];

  const clientOptions = useMemo(() => {
    return clientsQuery.data?.clients || [];
  }, [clientsQuery.data]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-primary" />
              Master Support Console
            </CardTitle>
            <CardDescription>
              Dependency health, data flow verification, and integration oversight for Concept2Cure staff.
            </CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => diagnosticsQuery.refetch()}
            disabled={diagnosticsQuery.isFetching}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Run Diagnostics
          </Button>
        </CardHeader>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Core Dependencies</CardTitle>
            <CardDescription>Environment, queues, and primary services</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {dependencies.map(dep => (
              <div key={dep.name} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">{dep.name}</div>
                  <div className="text-xs text-muted-foreground">{dep.description}</div>
                </div>
                <StatusBadge status={dep.status} />
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Integration Readiness</CardTitle>
            <CardDescription>SSO and external platform readiness</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {integrations.map(integration => (
              <div key={integration.name} className="flex items-center justify-between rounded-lg border p-3">
                <div>
                  <div className="text-sm font-medium">{integration.name}</div>
                  <div className="text-xs text-muted-foreground">{integration.description}</div>
                </div>
                <StatusBadge status={integration.status} />
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Ingress & Egress Data Flows</CardTitle>
          <CardDescription>Monitored lanes for regulated data movement</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {dataFlows.map(flow => (
            <div key={flow.name} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <div className="text-sm font-medium">{flow.name}</div>
                <div className="text-xs text-muted-foreground">{flow.description}</div>
              </div>
              <Badge variant="outline" className="capitalize">
                {flow.direction}
              </Badge>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client Integration Status</CardTitle>
          <CardDescription>Check a specific client workspace for connector status</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Select client workspace</label>
              <select
                className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm"
                value={selectedClientId}
                onChange={event => setSelectedClientId(event.target.value)}
              >
                <option value="">Choose client...</option>
                {clientOptions.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Activity className="h-4 w-4" />
              {integrationQuery.isFetching
                ? 'Checking integrations...'
                : 'Select a client to fetch connector status.'}
            </div>
          </div>

          {integrationQuery.data?.integration && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {['veevaVaultConnected', 'sharepointConnected', 'oneDriveConnected'].map(key => (
                <div key={key} className="rounded-lg border p-3">
                  <div className="text-sm font-medium">
                    {key === 'veevaVaultConnected' && 'Veeva Vault'}
                    {key === 'sharepointConnected' && 'SharePoint'}
                    {key === 'oneDriveConnected' && 'OneDrive'}
                  </div>
                  <div className="mt-2">
                    <StatusBadge
                      status={integrationQuery.data.integration[key] ? 'connected' : 'missing'}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {integrationQuery.isError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="h-4 w-4" />
              Unable to load integration status.
            </div>
          )}
        </CardContent>
      </Card>

      <Separator />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Support Actions</CardTitle>
          <CardDescription>Operational controls for Concept2Cure support staff</CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="rounded-lg border p-4 text-sm">
            <div className="font-medium">Incident Response</div>
            <p className="text-muted-foreground mt-1">Trigger incident workflows and notify stakeholders.</p>
            <Button variant="outline" size="sm" className="mt-3">
              Open Incident Hub
            </Button>
          </div>
          <div className="rounded-lg border p-4 text-sm">
            <div className="font-medium">Client Escalations</div>
            <p className="text-muted-foreground mt-1">Review support cases and SLAs.</p>
            <Button variant="outline" size="sm" className="mt-3">
              Review Escalations
            </Button>
          </div>
          <div className="rounded-lg border p-4 text-sm">
            <div className="font-medium">Export Audit Logs</div>
            <p className="text-muted-foreground mt-1">Export system audit data for compliance review.</p>
            <Button variant="outline" size="sm" className="mt-3">
              Export Logs
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default SupportConsole;
