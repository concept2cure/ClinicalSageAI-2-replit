import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import InfoTip from '@/components/InfoTip';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function CoachPanel({ batchId }: { batchId: string }) {
  const [rows, setRows] = useState<any[]>([]);
  const [note, setNote] = useState<string>('');

  async function load() {
    try {
      const r = await apiRequest('GET', `/api/quality/batches/${batchId}/coach`);
      const d = await r.json();
      setRows(d.recos || []);
      setNote(d.rationale || '');
    } catch { setRows([]); setNote(''); }
  }
  async function apply(ids: string[]) {
    if (!ids.length) return;
    try {
      await apiRequest('POST', `/api/quality/batches/${batchId}/coach/apply`, { reco_ids: ids });
      load();
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Apply failed', variant: 'destructive' });
    }
  }
  useEffect(() => {
    load();
  }, [batchId]);

  return (
    <Card data-tour="quality.coach">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle>QC Coach (AI)</CardTitle>
          <InfoTip>
            <div>
              <b>Coach</b> prioritizes next actions (AI). Use "Apply All Safe" for auto-safe steps.
            </div>
          </InfoTip>
        </div>
        <Button variant="outline" onClick={() => apply(rows.map(r => r.reco_id))}>
          Apply All Safe
        </Button>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {note && <div className="text-xs text-stone-600">Rationale: {note}</div>}
        {!rows.length ? (
          <div className="text-stone-600">No open recommendations.</div>
        ) : (
          rows.map((r: any) => (
            <div key={r.reco_id} className="rounded border p-2 flex items-center justify-between">
              <div>
                <b>{r.severity}</b> — {r.title}
              </div>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => apply([r.reco_id])}>
                  Apply
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
}
