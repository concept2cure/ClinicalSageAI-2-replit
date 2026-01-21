import React, { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { useTenant } from '../contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { RefreshCw, Database, Brain, CheckCircle, AlertTriangle } from 'lucide-react';

const LumenCortexPage = () => {
  const queryClient = useQueryClient();
  let tenantContext;
  try {
    tenantContext = useTenant();
  } catch (err) {
    console.error('Error accessing tenant context:', err);
    tenantContext = { currentOrganization: null };
  }
  const { currentOrganization } = tenantContext;
  const organizationId = currentOrganization?.id;
  const [category, setCategory] = useState('');
  const [termType, setTermType] = useState('');
  const [cik, setCik] = useState('');
  const [limit, setLimit] = useState('');
  const [includeAmended, setIncludeAmended] = useState(false);

  const healthQuery = useQuery({
    queryKey: ['/api/lumen-cortex/health'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/lumen-cortex/health');
      return response.json();
    },
  });

  const termsQuery = useQuery({
    queryKey: ['/api/lumen-cortex/observation-terms', organizationId, category, termType],
    enabled: !!organizationId,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (organizationId) params.set('organizationId', String(organizationId));
      if (category) params.set('category', category);
      if (termType) params.set('termType', termType);
      const response = await apiRequest('GET', `/api/lumen-cortex/observation-terms?${params.toString()}`);
      return response.json();
    },
  });

  const syncTermsMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/lumen-cortex/observation-terms/csr', {
        organizationId,
      });
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/lumen-cortex/observation-terms'] });
    },
  });

  const harvestMutation = useMutation({
    mutationFn: async () => {
      const response = await apiRequest('POST', '/api/lumen-cortex/harvest/10k', {
        organizationId,
        cik,
        limit: limit ? Number(limit) : undefined,
        includeAmended,
      });
      return response.json();
    },
  });

  const healthStatus = healthQuery.data?.status;
  const terms = termsQuery.data?.terms || [];

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Brain className="h-7 w-7 text-indigo-600" />
            Lumen Cortex Module
          </h1>
          <p className="text-muted-foreground mt-2">
            Real-time intelligence harvesting, evidence signals, and observation term synthesis.
          </p>
        </div>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-blue-600" />
              Connectivity
            </CardTitle>
          </CardHeader>
          <CardContent>
            {healthQuery.isLoading && <p>Checking Lumen Cortex status...</p>}
            {healthQuery.isError && (
              <div className="text-red-600 flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" />
                {healthQuery.error?.message || 'Unable to reach Lumen Cortex'}
              </div>
            )}
            {healthStatus && (
              <div className="flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                <span className="font-medium">Connected</span>
                <Badge variant="secondary">{healthStatus}</Badge>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Observation Term Sync</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Build controlled vocabulary from CSR data for device intelligence workflows.
            </p>
            <Button
              onClick={() => syncTermsMutation.mutate()}
              disabled={!organizationId || syncTermsMutation.isPending}
            >
              {syncTermsMutation.isPending ? 'Syncing...' : 'Sync From CSR'}
            </Button>
            {syncTermsMutation.data?.success && (
              <p className="text-sm text-green-600">Synced {syncTermsMutation.data?.synced ?? ''} terms.</p>
            )}
            {!organizationId && (
              <p className="text-sm text-muted-foreground">Select an organization to run sync.</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>10-K Harvest</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Company CIK"
              value={cik}
              onChange={event => setCik(event.target.value)}
            />
            <Input
              placeholder="Limit (optional)"
              value={limit}
              onChange={event => setLimit(event.target.value)}
            />
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={includeAmended}
                onChange={event => setIncludeAmended(event.target.checked)}
              />
              Include amended filings
            </label>
            <Button
              onClick={() => harvestMutation.mutate()}
              disabled={!organizationId || !cik || harvestMutation.isPending}
            >
              {harvestMutation.isPending ? 'Harvesting...' : 'Harvest 10-K'}
            </Button>
            {harvestMutation.data?.success && (
              <p className="text-sm text-green-600">Harvest completed successfully.</p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Observation Terms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <Input
              placeholder="Category"
              value={category}
              onChange={event => setCategory(event.target.value)}
            />
            <Input
              placeholder="Term Type"
              value={termType}
              onChange={event => setTermType(event.target.value)}
            />
            <Button
              variant="outline"
              onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/lumen-cortex/observation-terms'] })}
              disabled={!organizationId}
            >
              Filter
            </Button>
          </div>

          {termsQuery.isLoading && <p>Loading observation terms...</p>}
          {termsQuery.isError && (
            <p className="text-red-600">{termsQuery.error?.message || 'Failed to load terms.'}</p>
          )}
          {!organizationId && (
            <p className="text-sm text-muted-foreground">Select an organization to view terms.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {terms.map(term => (
              <div key={term.id} className="rounded-lg border p-3 bg-white">
                <div className="font-medium">{term.term}</div>
                <div className="text-xs text-muted-foreground">
                  {term.termType} · {term.category}
                </div>
                {term.source && <div className="text-xs text-muted-foreground">{term.source}</div>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default LumenCortexPage;
