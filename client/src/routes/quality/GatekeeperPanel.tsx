import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import InfoTip from '@/components/InfoTip';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function GatekeeperPanel({ batchId }: { batchId: string }) {
  const [out, setOut] = useState<any>(null);
  async function evalNow() {
    try {
      const r = await apiRequest('GET', `/api/quality/batches/${batchId}/gatekeeper/evaluate`);
      setOut(await r.json());
    } catch { setOut(null); }
  }
  async function applyFixes() {
    try {
      const ids = (out?.blockers || []).filter((b: any) => b.fixable).map((b: any) => b.id);
      const r = await apiRequest('POST', `/api/quality/batches/${batchId}/gatekeeper/apply-fixes`, { blocker_ids: ids });
      const d = await r.json();
      toast({ title: 'Fixes Applied', description: `Applied ${d.applied} fixes` });
      setOut(d.after);
    } catch (e: any) {
      toast({ title: 'Error', description: e.message || 'Apply fixes failed', variant: 'destructive' });
    }
  }
  useEffect(() => {
    evalNow();
  }, [batchId]);

  return (
    <Card data-tour="quality.gatekeeper">
      <CardHeader className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <CardTitle>Gatekeeper</CardTitle>
          <InfoTip aria-label="Gatekeeper information">
            <div>
              One-click release check (policy + flow + trends + AI). Shows blockers & safe
              auto-fixes.
            </div>
          </InfoTip>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={evalNow}>
            Re-Evaluate
          </Button>
          <Button
            variant="outline"
            onClick={applyFixes}
            disabled={!out || !(out.blockers || []).some((b: any) => b.fixable)}
          >
            Apply Safe Fixes
          </Button>
        </div>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        {!out ? (
          <div className="text-slate-600">Evaluating…</div>
        ) : (
          <>
            <div
              className={
                out.status === 'PASS'
                  ? 'text-emerald-700'
                  : out.status === 'REJECT'
                    ? 'text-red-700'
                    : 'text-amber-700'
              }
            >
              Status: {out.status}
            </div>
            {(out.blockers || []).length === 0 ? (
              <div className="text-slate-600">No blockers 🎉</div>
            ) : (
              <ul className="list-disc ml-6">
                {out.blockers.map((b: any, i: number) => (
                  <li
                    key={i}
                    className={/CRITICAL/.test(b.severity) ? 'text-red-700' : 'text-amber-700'}
                  >
                    [{b.severity}] {b.msg}{' '}
                    {b.fixable && <span className="text-blue-600">(fixable)</span>}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
