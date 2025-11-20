import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import dayjs from 'dayjs';
import InfoTip from '@/components/InfoTip';
import HelpDrawer from '@/components/HelpDrawer';

export default function SamplingWorkbench({ studyId }: { studyId: string }) {
  const [due, setDue] = useState<any[]>([]);
  const [samples, setSamples] = useState<any[]>([]);
  const [helpOpen, setHelpOpen] = useState(false);

  async function load() {
    const u = await fetch(`/api/stability/studies/${studyId}/timepoints/due?limit=20`).then(r =>
      r.json()
    );
    const s = await fetch(`/api/stability/studies/${studyId}/samples`).then(r => r.json());
    setDue(u || []);
    setSamples(s || []);
  }
  useEffect(() => {
    if (studyId) load();
  }, [studyId]);

  async function create(tp: any) {
    const r = await fetch(`/api/stability/studies/${studyId}/samples`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tp_id: tp.tp_id }),
    });
    const d = await r.json();
    if (!r.ok) return alert(d.error || 'Create sample failed');
    await load();
    window.open(`/api/stability/samples/${d.sample_id}/barcode.png`, '_blank');
  }
  async function collect(sample: any) {
    const r = await fetch(`/api/stability/studies/${studyId}/samples/collect`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sample_id: sample.sample_id }),
    });
    if (!r.ok) return alert('Collect failed');
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <button className="text-xs text-blue-600 underline" onClick={() => setHelpOpen(true)}>
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
                  {tp.planned_date ? dayjs(tp.planned_date).format('YYYY-MM-DD') : '—'}
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
                    ? `collected ${dayjs(s.collected_at).format('YYYY-MM-DD HH:mm')}`
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
