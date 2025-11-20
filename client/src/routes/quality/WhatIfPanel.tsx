import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import InfoTip from '@/components/InfoTip';

export default function WhatIfPanel({ batchId }: { batchId: string }) {
  const [tests, setTests] = useState<any[]>([]);
  const [rows, setRows] = useState<
    { test_id: string; name: string; value?: string; pass?: boolean }[]
  >([]);

  useEffect(() => {
    (async () => {
      const s = await fetch(`/api/quality/batches/${batchId}/summary`).then(r => r.json());
      setTests(s.tests || []);
      setRows(
        (s.tests || []).map((t: any) => ({
          test_id: t.test_id,
          name: t.name,
          value: '',
          pass: undefined,
        }))
      );
    })();
  }, [batchId]);

  function update(i: number, key: 'value' | 'pass', val: any) {
    const copy = [...rows];
    (copy[i] as any)[key] = val;
    setRows(copy);
  }

  async function run() {
    const overrides = rows
      .filter(r => r.value || typeof r.pass === 'boolean')
      .map(r => ({ test_id: r.test_id, override: { value: r.value || undefined, pass: r.pass } }));
    const r = await fetch(`/api/quality/batches/${batchId}/whatif`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ overrides }),
    });
    const d = await r.json();
    if (!r.ok) return alert(d.error || 'What-if failed');
    alert(`Decision: ${d.decision?.decision} (risk ${d.decision?.risk || '—'})`);
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>What-If Simulator (server-side)</CardTitle>
          <InfoTip>
            <div>
              Try hypothetical overrides (e.g., Assay=99.9). No writes; runs AI decision for
              guidance.
            </div>
          </InfoTip>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="grid grid-cols-12 gap-2 font-medium">
          <div className="col-span-4">Test</div>
          <div className="col-span-4">Override Value</div>
          <div className="col-span-4">Override Pass</div>
        </div>
        {rows.map((r, i) => (
          <div key={r.test_id} className="grid grid-cols-12 gap-2 items-center">
            <div className="col-span-4">{r.name}</div>
            <div className="col-span-4">
              <input
                className="border rounded px-2 py-1 w-full"
                value={r.value || ''}
                onChange={e => update(i, 'value', e.target.value)}
                placeholder="e.g., 99.9 or <0.25"
              />
            </div>
            <div className="col-span-4">
              <select
                className="border rounded px-2 py-1 w-full"
                value={typeof r.pass === 'boolean' ? String(r.pass) : ''}
                onChange={e =>
                  update(i, 'pass', e.target.value === '' ? undefined : e.target.value === 'true')
                }
              >
                <option value="">(no override)</option>
                <option value="true">Force PASS</option>
                <option value="false">Force FAIL</option>
              </select>
            </div>
          </div>
        ))}
        <Button variant="outline" onClick={run}>
          Simulate
        </Button>
      </CardContent>
    </Card>
  );
}
