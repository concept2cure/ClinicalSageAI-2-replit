import React, { useEffect, useMemo, useState } from 'react';
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
import {
import { toast } from '@/hooks/use-toast';
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  ReferenceLine,
} from 'recharts';

export default function PPQCPVTab({ processId }) {
  // PPQ
  const [ppq, setPPQ] = useState([]);
  const [lot, setLot] = useState('');
  const [date, setDate] = useState('');
  const [result, setResult] = useState('PASS');
  const [notes, setNotes] = useState('');

  async function loadPPQ() {
    const r = await fetch(`/api/process/processes/${processId}/ppq`);
    setPPQ(await r.json());
  }

  async function addPPQ() {
    const r = await fetch(`/api/process/processes/${processId}/ppq`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lot_no: lot, run_date: date, result, notes }),
    });
    if (r.ok) {
      setLot('');
      setDate('');
      setNotes('');
      await loadPPQ();
    } else toast({ title: 'Failed' });
  }

  // CPV
  const [cpv, setCPV] = useState([]);
  const [param, setParam] = useState('Inlet Temp');
  const [file, setFile] = useState(null);

  async function loadCPV() {
    const r = await fetch(
      `/api/process/processes/${processId}/cpv?param=${encodeURIComponent(param)}`
    );
    setCPV(await r.json());
  }

  async function importCSV() {
    if (!file) return;
    const fd = new FormData();
    fd.append('file', file);
    const r = await fetch(`/api/process/processes/${processId}/cpv/import`, {
      method: 'POST',
      body: fd,
    });
    if (r.ok) {
      await loadCPV();
      toast({ title: `Imported ${(await r.json()).inserted} points` });
    } else toast({ title: 'Import failed' });
  }

  useEffect(() => {
    loadPPQ();
  }, [processId]);
  useEffect(() => {
    loadCPV();
  }, [processId, param]);

  const series = cpv.find(s => s.param === param);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <Card>
        <CardHeader>
          <CardTitle>PPQ Lots</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr>
                  <th className="p-2 text-left">Lot</th>
                  <th className="p-2">Date</th>
                  <th className="p-2">Result</th>
                  <th className="p-2 text-left">Notes</th>
                </tr>
              </thead>
              <tbody>
                {ppq.map(p => (
                  <tr key={p.ppq_id} className="border-t">
                    <td className="p-2">{p.lot_no}</td>
                    <td className="p-2">{new Date(p.run_date).toLocaleDateString()}</td>
                    <td className="p-2">{p.result}</td>
                    <td className="p-2">{p.notes || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
            <Input placeholder="Lot No" value={lot} onChange={e => setLot(e.target.value)} />
            <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            <Select value={result} onValueChange={v => setResult(v)}>
              <SelectTrigger>
                <SelectValue placeholder="Result" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PASS">PASS</SelectItem>
                <SelectItem value="FAIL">FAIL</SelectItem>
              </SelectContent>
            </Select>
            <Input placeholder="Notes" value={notes} onChange={e => setNotes(e.target.value)} />
          </div>
          <Button onClick={addPPQ}>Add PPQ Lot</Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>CPV — {param}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="Param (e.g., Inlet Temp)"
              value={param}
              onChange={e => setParam(e.target.value)}
            />
            <input type="file" accept=".csv" onChange={e => setFile(e.target.files?.[0] || null)} />
            <Button variant="outline" onClick={importCSV} disabled={!file}>
              Import CSV
            </Button>
          </div>
          {!series ? (
            <div className="text-sm text-slate-500">No data</div>
          ) : (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart
                  data={series.points.map(p => ({
                    ts: new Date(p.ts).toLocaleDateString(),
                    value: p.value,
                  }))}
                >
                  <XAxis dataKey="ts" />
                  <YAxis />
                  <RTooltip />
                  <ReferenceLine y={series.mean} stroke="#888" strokeDasharray="3 3" />
                  <ReferenceLine y={series.ucl} stroke="#a00" strokeDasharray="2 2" />
                  <ReferenceLine y={series.lcl} stroke="#a00" strokeDasharray="2 2" />
                  <Line type="monotone" dataKey="value" dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
          {series && (
            <div className="text-xs text-slate-600">
              Mean={series.mean.toFixed(2)}, UCL={series.ucl.toFixed(2)}, LCL=
              {series.lcl.toFixed(2)} • Breaches={series.breaches}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
