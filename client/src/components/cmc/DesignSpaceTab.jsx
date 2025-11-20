import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectTrigger,
  SelectContent,
  SelectItem,
  SelectValue,
} from '@/components/ui/select';

export default function DesignSpaceTab({ processId }) {
  const [factors, setFactors] = useState([{ name: '', low: '', high: '', unit: '' }]);
  const [status, setStatus] = useState('DRAFT');

  function addRow() {
    setFactors([...factors, { name: '', low: '', high: '', unit: '' }]);
  }

  function set(i, key, val) {
    const copy = [...factors];
    copy[i][key] = val;
    setFactors(copy);
  }

  async function save() {
    const r = await fetch(`/api/process/processes/${processId}/design-space`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ factors, status }),
    });
    if (r.ok) alert('Design Space saved');
    else alert('Failed');
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Design Space</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          {factors.map((f, i) => (
            <div key={i} className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <Input
                placeholder="Factor (e.g., Inlet Temp)"
                value={f.name}
                onChange={e => set(i, 'name', e.target.value)}
              />
              <Input
                placeholder="Low"
                value={f.low}
                onChange={e => set(i, 'low', e.target.value)}
              />
              <Input
                placeholder="High"
                value={f.high}
                onChange={e => set(i, 'high', e.target.value)}
              />
              <Input
                placeholder="Unit"
                value={f.unit}
                onChange={e => set(i, 'unit', e.target.value)}
              />
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={addRow}>
            Add Factor
          </Button>
          <Select value={status} onValueChange={v => setStatus(v)}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="DRAFT">DRAFT</SelectItem>
              <SelectItem value="LOCKED">LOCKED</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={save}>Save Design Space</Button>
        </div>
        <div className="text-xs text-slate-500">
          Use AI Advisor → "Propose DOE / Design Space" (coming next) to pre-fill factors.
        </div>
      </CardContent>
    </Card>
  );
}
