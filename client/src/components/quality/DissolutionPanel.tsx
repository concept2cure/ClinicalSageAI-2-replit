import React, { useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from '@/hooks/use-toast';

interface DissolutionOutcome {
 stage: number;
 pass: boolean;
 reason: string;
}

export default function DissolutionPanel({ testId, Q = 80 }: { testId: string; Q?: number }) {
 const [s1, setS1] = useState('');
 const [s2, setS2] = useState('');
 const [s3, setS3] = useState('');
 const [out, setOut] = useState<DissolutionOutcome | null>(null);

 async function submit(stage: number) {
 const raw = stage === 1 ? s1 : stage === 2 ? s2 : s3;
 const vals = raw
 .split(/[,\s]+/)
 .map(s => s.trim())
 .filter(Boolean)
 .map(Number);
 const r = await fetch(`/api/quality/tests/${testId}/dissolution`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ values: vals, Q }),
 });
 const d = await r.json();
 if (!r.ok) {
 toast({ title: 'Dissolution Error', description: d.error || 'Evaluation failed', variant: 'destructive' });
 return;
 }
 setOut(d.outcome);
 toast({
 title: `Stage ${d.outcome.stage}: ${d.outcome.pass ? 'PASS' : 'FAIL'}`,
 description: d.outcome.reason || 'Evaluation complete',
 });
 }

 return (
 <Card>
 <CardHeader>
 <CardTitle>Dissolution S1–S3</CardTitle>
 </CardHeader>
 <CardContent className="space-y-3 text-sm">
 <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
 <div>
 <label htmlFor="dissolution-s1" className="font-medium block">S1 (6 units)</label>
 <Input
 id="dissolution-s1"
 placeholder="e.g., 88 92 95 85 90 96"
 value={s1}
 onChange={e => setS1(e.target.value)}
 aria-label="Stage 1 dissolution values"
 />
 <Button variant="outline" onClick={() => submit(1)}>
 Evaluate S1
 </Button>
 </div>
 <div>
 <label htmlFor="dissolution-s2" className="font-medium block">S2 (next 6, total 12)</label>
 <Input id="dissolution-s2" placeholder="next 6 units" value={s2} onChange={e => setS2(e.target.value)} aria-label="Stage 2 dissolution values" />
 <Button variant="outline" onClick={() => submit(2)}>
 Evaluate S2
 </Button>
 </div>
 <div>
 <label htmlFor="dissolution-s3" className="font-medium block">S3 (next 12, total 24)</label>
 <Input id="dissolution-s3" placeholder="next 12 units" value={s3} onChange={e => setS3(e.target.value)} aria-label="Stage 3 dissolution values" />
 <Button variant="outline" onClick={() => submit(3)}>
 Evaluate S3
 </Button>
 </div>
 </div>
 {out && (
 <div className={`rounded border p-2 ${out.pass ? 'border-stone-400' : 'border-stone-400'}`}>
 Final: <b>{out.stage}</b> — {out.pass ? 'PASS' : 'FAIL'} • {out.reason}
 </div>
 )}
 <div className="text-xs text-stone-600">
 Q={Q}. Enforcement: COA/Release will block if Dissolution fails.
 </div>
 </CardContent>
 </Card>
 );
}
