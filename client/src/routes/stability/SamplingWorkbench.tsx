import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { format } from 'date-fns';
import InfoTip from '@/components/InfoTip';
import HelpDrawer from '@/components/HelpDrawer';
import { toast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function SamplingWorkbench({ studyId }: { studyId: string }) {
  const [due, setDue] = useState<any[]>([]);
  const [samples, setSamples] = useState<any[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  async function load() {
    const uRes = await apiRequest('GET', `/api/stability/studies/${studyId}/timepoints/due?limit=20`);
    const u = await uRes.json();
    const sRes = await apiRequest('GET', `/api/stability/studies/${studyId}/samples`);
    const s = await sRes.json();
    setDue(u || []);
    setSamples(s || []);
  }
  useEffect(() => {
    if (studyId) load();
  }, [studyId]);

  async function create(tp: any) {
    try {
      const res = await apiRequest('POST', `/api/stability/studies/${studyId}/samples`, { tp_id: tp.tp_id });
      const d = await res.json();
      await load();
      window.open(`/api/stability/samples/${d.sample_id}/barcode.png`, '_blank');
    } catch (err: any) {
      toast({ title: 'Error', description: err.message || 'Create sample failed', variant: 'destructive' });
    }
  }
  async function collect(sample: any) {
    try {
      await apiRequest('POST', `/api/stability/studies/${studyId}/samples/collect`, { sample_id: sample.sample_id });
      load();
    } catch {
      toast({ title: 'Error', description: 'Sample collection failed', variant: 'destructive' });
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button className="text-xs text-stone-600 underline" onClick={() => setHelpOpen(true)}>
          Help
        </button>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Due Timepoints</CardTitle>
          <div className="flex items-center gap-2">
            <InfoTip aria-label="Due timepoints help">
              <div className="space-y-1">
                <div>
                  This list shows <b>scheduled but not yet collected</b> timepoints.
                </div>
                <div>
                  Click <b>Create Sample + Label</b> to generate a sample ID and printable barcode.
                </div>
                <div>
                  After collection, the sample will show as <b>collected</b> in <i>Samples</i>.
                </div>
              </div>
            </InfoTip>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {!due.length ? (
            <div className="text-sm text-slate-600">Nothing due.</div>
          ) : (
            due.map(tp => (
              <div
                key={tp.tp_id}
                className="rounded border p-2 flex items-center justify-between text-sm"
              >
                <div>
                  {tp.kind} {tp.label} • planned{' '}
                  {tp.planned_date ? format(new Date(tp.planned_date), 'yyyy-MM-dd') : '—'}
                </div>
                <Button variant="outline" onClick={() => create(tp)}>
                  Create Sample + Label
                </Button>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Samples</CardTitle>
          <div className="flex items-center gap-2">
            <InfoTip aria-label="Samples list help">
              <div className="space-y-1">
                <div>
                  <b>Label</b> opens the barcode for printing.
                </div>
                <div>
                  <b>Mark Collected</b> records the collection event and time.
                </div>
                <div>
                  Use <i>Chain of Custody</i> to track receipt/open/seal/transfer/evidence.
                </div>
              </div>
            </InfoTip>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {!samples.length ? (
            <div className="text-sm text-slate-600">No samples.</div>
          ) : (
            samples.map(s => (
              <div
                key={s.sample_id}
                className="rounded border p-2 flex items-center justify-between text-sm"
              >
                <div>
                  {s.sample_code} •{' '}
                  {s.collected_at
                    ? `collected ${format(new Date(s.collected_at), 'yyyy-MM-dd HH:mm')}`
                    : 'pending'}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    onClick={() =>
                      window.open(`/api/stability/samples/${s.sample_id}/barcode.png`, '_blank')
                    }
                  >
                    Label
                  </Button>
                  {!s.collected_at && (
                    <Button variant="outline" onClick={() => collect(s)}>
                      Mark Collected
                    </Button>
                  )}
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <HelpDrawer
        title="Sampling Workbench — How it works"
        open={helpOpen}
        onClose={() => setHelpOpen(false)}
      >
        <div className="space-y-3 text-sm">
          <div>
            <b>Due Timepoints</b> shows scheduled but not collected TPs.
          </div>
          <div>
            Click <b>Create Sample + Label</b> to generate a <i>sample_id</i> and printable barcode
            (Code 128).
          </div>
          <div>
            After physical collection, click <b>Mark Collected</b>.
          </div>
          <div>
            Use <b>Chain of Custody</b> (CoC) to record receipt/open/seal/transfer and upload
            evidence.
          </div>
          <hr />
          <div className="text-slate-600">
            Approvals are blocked until results are linked to a collected sample. Links appear in
            the <i>Results → Review</i> tab.
          </div>
        </div>
      </HelpDrawer>
    </div>
  );
}
