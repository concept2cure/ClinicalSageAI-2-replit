import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { apiRequest } from '@/lib/queryClient';

export default function FlowHealthPanel({ batchId }: { batchId: string }) {
  const [data, setData] = useState<any>(null);
  const [processId, setPID] = useState('');
  const [stabId, setSID] = useState('');

  async function load() {
    try {
      const r = await apiRequest('GET', `/api/quality/batches/${batchId}/flow/verify`);
      setData(await r.json());
    } catch { setData(null); }
  }
  async function save() {
    try {
      await apiRequest('POST', `/api/quality/batches/${batchId}/linkages`, { process_id: processId || null, stability_study_id: stabId || null });
      load();
    } catch { /* handled by apiRequest */ }
  }
  useEffect(() => {
    load();
  }, [batchId]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Upstream / Downstream Health</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <Input
            placeholder="Process ID"
            value={processId}
            onChange={e => setPID(e.target.value)}
          />
          <Input
            placeholder="Stability Study ID"
            value={stabId}
            onChange={e => setSID(e.target.value)}
          />
          <Button variant="outline" onClick={save}>
            Save Links
          </Button>
          <Button variant="outline" onClick={load}>
            Recheck
          </Button>
        </div>
        {!data ? (
          <div className="text-slate-600">Loading…</div>
        ) : (
          <ul className="list-disc ml-6">
            {!data.issues?.length && <li className="text-emerald-700">All checks OK</li>}
            {data.issues?.map((i: any, idx: number) => (
              <li
                key={idx}
                className={/CRITICAL/.test(i.severity) ? 'text-red-700' : 'text-amber-700'}
              >
                [{i.severity}] {i.msg}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
