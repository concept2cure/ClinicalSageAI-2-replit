import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export default function ControlStrategyTab({ processId }) {
  const [paramName, setParam] = useState('');
  const [test, setTest] = useState('');
  const [limit, setLimit] = useState('');
  const [method, setMethod] = useState('');

  async function save() {
    const r = await fetch(`/api/cmc-process/processes/${processId}/control-strategy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paramName, test, limit, methodHint: method }),
    });
    if (r.ok) {
      setParam('');
      setTest('');
      setLimit('');
      setMethod('');
      alert('Saved');
    } else alert('Failed');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Control Strategy Editor</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <Input
            placeholder="Parameter (e.g., Inlet Temp)"
            value={paramName}
            onChange={e => setParam(e.target.value)}
          />
          <Input
            placeholder="Test (e.g., LOD)"
            value={test}
            onChange={e => setTest(e.target.value)}
          />
          <Input
            placeholder="Limit (e.g., ≤ 3.0%)"
            value={limit}
            onChange={e => setLimit(e.target.value)}
          />
          <Input
            placeholder="Method hint (e.g., AM-001)"
            value={method}
            onChange={e => setMethod(e.target.value)}
          />
        </div>
        <Button onClick={save}>Add / Update Control</Button>
        <div className="text-xs text-slate-500">
          Tip: Use the AI Advisor to auto-propose IPCs and CPV rules.
        </div>
      </CardContent>
    </Card>
  );
}
