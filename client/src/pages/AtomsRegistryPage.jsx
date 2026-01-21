import React, { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { useTenant } from '../contexts/TenantContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Database, RefreshCw } from 'lucide-react';

const AtomsRegistryPage = () => {
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

  const [search, setSearch] = useState('');
  const [sourceType, setSourceType] = useState('');
  const [atomType, setAtomType] = useState('');
  const [status, setStatus] = useState('');

  const params = useMemo(() => {
    const query = new URLSearchParams();
    if (organizationId) query.set('organizationId', String(organizationId));
    if (search) query.set('search', search);
    if (sourceType) query.set('sourceType', sourceType);
    if (atomType) query.set('atomType', atomType);
    if (status) query.set('status', status);
    return query.toString();
  }, [organizationId, search, sourceType, atomType, status]);

  const atomsQuery = useQuery({
    queryKey: ['/api/atoms', organizationId, search, sourceType, atomType, status],
    enabled: !!organizationId,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/atoms?${params}`);
      return response.json();
    },
  });

  const atoms = atomsQuery.data?.atoms || atomsQuery.data || [];

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <Database className="h-7 w-7 text-blue-600" />
            Content ATOMS Registry
          </h1>
          <p className="text-muted-foreground mt-2">
            Govern reusable content atoms and structured evidence blocks across modules.
          </p>
        </div>
        <Button variant="outline" onClick={() => queryClient.invalidateQueries()}>
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Filters</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <Input placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} />
          <Input placeholder="Source Type" value={sourceType} onChange={e => setSourceType(e.target.value)} />
          <Input placeholder="Atom Type" value={atomType} onChange={e => setAtomType(e.target.value)} />
          <Input placeholder="Status" value={status} onChange={e => setStatus(e.target.value)} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Atoms</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {atomsQuery.isLoading && <p>Loading atoms...</p>}
          {atomsQuery.isError && (
            <p className="text-red-600">{atomsQuery.error?.message || 'Failed to load atoms.'}</p>
          )}
          {!organizationId && (
            <p className="text-sm text-muted-foreground">Select an organization to view atoms.</p>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {atoms.map(atom => (
              <div key={atom.id} className="rounded-lg border p-3 bg-white">
                <div className="font-medium truncate">{atom.title || atom.id}</div>
                <div className="text-xs text-muted-foreground truncate">{atom.sourceType} · {atom.atomType}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {atom.status && <Badge variant="secondary">{atom.status}</Badge>}
                  {atom.tags?.slice(0, 3)?.map(tag => (
                    <Badge key={tag} variant="outline">{tag}</Badge>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AtomsRegistryPage;
