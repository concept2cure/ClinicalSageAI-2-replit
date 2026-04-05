import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { apiRequest } from '@/lib/queryClient';

export default function LineagePanel({ batchId }: { batchId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  async function load() {
    try {
      const r = await apiRequest('GET', `/api/quality/batches/${batchId}/lineage`);
      const data = await r.json();
      setRows(Array.isArray(data) ? data : []);
    } catch (e) {
      setRows([]);
    }
  }
  useEffect(() => {
    load();
  }, [batchId]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Lineage</CardTitle>
      </CardHeader>
      <CardContent className="text-xs space-y-1">
        {!rows.length ? (
          <div className="text-stone-600">No lineage yet.</div>
        ) : (
          rows.map((l: any) => (
            <div key={l.lin_id} className="rounded border p-2">
              <b>{l.action}</b> {l.entity_type}:{l.entity_id} • {l.source} • rev {l.rev} •{' '}
              {l.actor || '—'} • {new Date(l.created_at).toLocaleString()}
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
