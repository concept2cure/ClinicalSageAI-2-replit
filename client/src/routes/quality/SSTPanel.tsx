import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import InfoTip from '@/components/InfoTip';
import { toast } from '@/hooks/use-toast';

export default function SSTPanel({ testId }: { testId: string }) {
  const [json, setJson] = useState<string>('{"plates": 5000, "tailing": 1.2, "r2": 0.9999}');
  const [latest, setLatest] = useState<any>(null);
  async function load() {
    const r = await fetch(`/api/quality/tests/${testId}/sst/latest`);
    setLatest(await r.json());
  }
  async function save() {
    try {
      const payload = JSON.parse(json);
      const r = await fetch(`/api/quality/tests/${testId}/sst`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload_json: payload, pass: true }),
      });
      const d = await r.json();
      if (!r.ok) { toast({ title: 'SST Error', description: d.error || 'SST recording failed', variant: 'destructive' }); return; }
      load();
    } catch {
      toast({ title: 'Invalid Input', description: 'Please enter valid JSON', variant: 'destructive' });
    }
  }
  useEffect(() => {
    load();
  }, [testId]);
  return (
    <Card data-tour="quality.sst">
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle>System Suitability (SST)</CardTitle>
          <InfoTip>
            <div>
              Record SST before entering results (enforced). Templates define <b>valid hours</b> and{' '}
              <b>thresholds</b> (plates, tailing, r², …). Results entry is blocked when SST isn't
              current or fails template.
            </div>
          </InfoTip>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        <div className="text-slate-600">
          Latest: {latest ? new Date(latest.created_at).toLocaleString() : '—'}
        </div>
        <Textarea value={json} onChange={e => setJson(e.target.value)} />
        <Button variant="outline" onClick={save}>
          Record SST (pass)
        </Button>
        <div className="text-xs text-slate-500">
          Results entry is blocked if SST is not current.
        </div>
      </CardContent>
    </Card>
  );
}
