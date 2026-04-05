import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import InfoTip from '@/components/InfoTip';
import { toast } from '@/hooks/use-toast';

export default function DissolutionPanel({ testId, Q = 80 }: { testId: string; Q?: number }) {
  const [s1, setS1] = useState('');
  const [s2, setS2] = useState('');
  const [s3, setS3] = useState('');
  const [result, setResult] = useState<any>(null);
  async function runStage(stage: string) {
    const vals = (stage === 'S1' ? s1 : stage === 'S2' ? s2 : s3)
      .split(/[,\s]+/)
      .filter(Boolean)
      .map(Number);
    if (vals.length === 0) { toast({ title: 'Input Required', description: 'Enter dissolution values', variant: 'destructive' }); return; }
    const r = await fetch(`/api/quality/tests/${testId}/dissolution`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ values: vals, Q }),
    });
    const d = await r.json();
    if (!r.ok) { toast({ title: 'Error', description: d.error || 'Dissolution evaluation failed', variant: 'destructive' }); return; }
    setResult(d.outcome);
  }
  return (
    <Card data-tour="quality.dissolution">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>Dissolution Testing (S1/S2/S3)</CardTitle>
          <InfoTip>
            <div>Evaluate S1→S2→S3 per Q rules; outcomes stored; alerts on fail.</div>
          </InfoTip>
        </div>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <div>
          <label>S1 (6 units):</label>{' '}
          <Input value={s1} onChange={e => setS1(e.target.value)} placeholder="85,87,86,89,88,90" />{' '}
          <Button size="sm" onClick={() => runStage('S1')}>
            Test S1
          </Button>
        </div>
        <div>
          <label>S2 (12 units):</label>{' '}
          <Input value={s2} onChange={e => setS2(e.target.value)} placeholder="Add 6 more values" />{' '}
          <Button size="sm" onClick={() => runStage('S2')}>
            Test S2
          </Button>
        </div>
        <div>
          <label>S3 (24 units):</label>{' '}
          <Input
            value={s3}
            onChange={e => setS3(e.target.value)}
            placeholder="Add 12 more values"
          />{' '}
          <Button size="sm" onClick={() => runStage('S3')}>
            Test S3
          </Button>
        </div>
        {result && (
          <div className={`p-2 rounded ${result.pass ? 'bg-stone-100' : 'bg-stone-100'}`}>
            <strong>{result.stage}:</strong> {result.pass ? 'PASS' : 'FAIL'} - {result.reason}
          </div>
        )}
        <div className="text-xs text-slate-500">
          Q value: {Q}%. Enter comma-separated dissolution values.
        </div>
      </CardContent>
    </Card>
  );
}
