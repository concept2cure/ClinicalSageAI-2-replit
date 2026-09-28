/**
 * Protocol development — the planning inputs of the bound study design.
 *
 * The planning engines (dose escalation, enrollment, MMRM, external control,
 * master protocol, decentralised elements, biospecimens) read inputs only a
 * sponsor can supply, and nothing on screen could record them. This panel is
 * that: one governed `C2CForm` per block and per SoA activity, posting to
 * `POST /api/study-design/:studyId/planning`, which validates the block
 * strictly, writes it through the one design writer and records the reason.
 *
 * What it does not do: compute anything, default anything, or show a block as
 * recorded before the server has confirmed the write — the panel re-reads the
 * design after every write rather than trusting what it sent. Every write
 * carries the block as it was read (`expected`), so another author's write in
 * between is refused by the server, not silently replaced. A refusal is shown
 * in the server's own words (its field-level details); a request that did not
 * complete is not reported as "nothing was written", because that is not
 * known — the design is re-read instead. A design that cannot be read is an
 * error, never an empty panel.
 */
import React, { useCallback, useEffect, useState } from 'react';
import * as PG from './ProtocolGov';
import { apiRequest, ApiRequestError } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';
import { str } from './projectionFormat';
import { ACCRUAL_FORM, DOSE_FORM, MMRM_FORM, drawerFor, type Drawer, type PlanningFormSpec, type Values } from './planningInputForms';
import { EXTERNAL_FORM, MASTER_FORM, activityFields, activityRecorded, parseActivity } from './planningStructureForms';

type Obj = Record<string, unknown>;
const MIN_REASON = 8;
const WRITER_ONLY = 'A writing role is required to record planning inputs.';

/** Where each block lives on the design object. */
const BLOCKS: Array<{ spec: PlanningFormSpec; read: (d: Obj) => unknown }> = [
  { spec: DOSE_FORM, read: (d) => (d.safety as Obj | undefined)?.doseEscalation },
  { spec: ACCRUAL_FORM, read: (d) => d.accrualPlan },
  { spec: MMRM_FORM, read: (d) => (d.statisticalPlan as Obj | undefined)?.mmrmAssumptions },
  { spec: EXTERNAL_FORM, read: (d) => d.externalControlPlan },
  { spec: MASTER_FORM, read: (d) => d.masterProtocol },
];

/** The server's refusal in sentences: its field-level details, else its detail. An error code is not a sentence and is not shown as one. */
export function refusal(body: unknown, status: number): string {
  const b = (body ?? {}) as { detail?: unknown; details?: unknown };
  const details = Array.isArray(b.details) ? b.details.map(str).filter(Boolean) : [];
  if (details.length) return `The server refused these values: ${details.join('; ')}.`;
  if (typeof b.detail === 'string' && b.detail.trim()) return b.detail.trim();
  return `The server refused it (HTTP ${status}).`;
}

/** The server answered and refused: nothing was written. */
class Refused extends Error {
  constructor(message: string, public readonly code: unknown) {
    super(message);
    this.name = 'Refused';
  }
}

/** POST one block. `apiRequest` throws for every non-2xx but 401, which it returns; both become a {@link Refused} with the server's words. */
async function postBlock(studyId: string, body: Obj): Promise<void> {
  let res: Response;
  try {
    res = await apiRequest('POST', `/api/study-design/${encodeURIComponent(studyId)}/planning`, body);
  } catch (e) {
    if (e instanceof ApiRequestError) throw new Refused(refusal(e.payload, e.status), (e.payload as Obj | null)?.error);
    throw e;
  }
  if (!res.ok) {
    const j = (await res.json().catch(() => null)) as Obj | null;
    throw new Refused(refusal(j, res.status), j?.error);
  }
}

function useDesign(studyId: string) {
  const [design, setDesign] = useState<Obj | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setError(null);
    try {
      const res = await apiRequest('GET', `/api/study-design/${encodeURIComponent(studyId)}`);
      const j = (await res.json().catch(() => null)) as { design?: Obj } | null;
      if (!res.ok || !j?.design) throw new Error(refusal(j, res.status));
      setDesign(j.design);
    } catch (e) {
      setDesign(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [studyId]);
  useEffect(() => { void load(); }, [load]);
  return { design, error, reload: load };
}

/** An open drawer: what it edits, what the design recorded when it was opened (the write's precondition), and its fields. */
type Open =
  | { kind: 'block'; spec: PlanningFormSpec; expected: Obj | null; drawer: Drawer }
  | { kind: 'activity'; activity: Obj; expected: Obj; drawer: Drawer };

const labelOf = (o: Open): string => (o.kind === 'block' ? o.spec.title : `${str(o.activity.name)} — location and specimen`);

function openBlock(spec: PlanningFormSpec, current: Obj | null, design: Obj): Open {
  return { kind: 'block', spec, expected: current, drawer: drawerFor(spec.fields(current, design), (v) => spec.parse(v, design), current) };
}

function openActivity(activity: Obj): Open {
  const id = str(activity.id);
  const expected = activityRecorded(activity);
  return { kind: 'activity', activity, expected, drawer: drawerFor(activityFields(activity), (v) => parseActivity(v, id), { activityId: id, ...expected }, null) };
}

export interface PlanningInputsPanelProps {
  studyId: string;
  canWrite: boolean;
  onError?: (m: string) => void;
  onToast?: (m: string) => void;
}

function EditButton({ verb, target, canWrite, onClick }: { verb: string; target: string; canWrite: boolean; onClick: () => void }) {
  return (
    <PG.Btn icon="penLine" variant="outline" disabled={!canWrite} title={canWrite ? `${verb} ${target}` : WRITER_ONLY} onClick={onClick}>
      {/* The space sits outside the hidden span, so every accessible-name algorithm keeps it. */}
      {verb} <span className="sr-only">{target}</span>
    </PG.Btn>
  );
}

function ActivityRows({ design, canWrite, onOpen }: { design: Obj; canWrite: boolean; onOpen: (o: Open) => void }) {
  const soa = design.scheduleOfActivities as Obj | undefined;
  const activities = (Array.isArray(soa?.activities) ? soa!.activities : []) as Obj[];
  if (activities.length === 0) {
    return (
      <div className="pd-pane-s" style={{ marginTop: 10 }}>
        {soa ? 'The Schedule of Activities lists no activities' : 'This design records no Schedule of Activities'}, so no activity location or specimen can be recorded.
      </div>
    );
  }
  return (
    <div style={{ marginTop: 10 }}>
      <div className="pd-pane-s">Schedule of Activities — where each activity happens and what it collects.</div>
      {activities.map((a) => (
        <div key={str(a.id)} className="pd-kv">
          <span className="pd-kv-k">{str(a.name)}</span>
          <span className="pd-kv-v">
            {str(a.location) || 'location not stated'} · {str((a.specimen as Obj | undefined)?.type) || 'no specimen recorded'}
          </span>
          <EditButton verb="Edit" target={`${str(a.name)} location and specimen`} canWrite={canWrite} onClick={() => onOpen(openActivity(a))} />
        </div>
      ))}
    </div>
  );
}

export function PlanningInputsPanel({ studyId, canWrite, onError, onToast }: PlanningInputsPanelProps) {
  const { design, error, reload } = useDesign(studyId);
  const [open, setOpen] = useState<Open | null>(null);

  /** A write that failed: say what is known — refused (nothing written) or not completed (not known) — and re-read when the drawer is stale. */
  const failed = async (e: unknown, label: string) => {
    if (!(e instanceof Refused)) {
      onError?.(`The write of ${label} did not complete (${e instanceof Error ? e.message : String(e)}), so whether it was recorded is not known. The design is re-read to show what is recorded.`);
      setOpen(null);
      await reload();
      return;
    }
    onError?.(`${label} was not recorded — ${e.message} Nothing was written.`);
    // A stale block's drawer holds another author's superseded values: close it and re-read.
    if (e.code === 'STALE_BLOCK') {
      setOpen(null);
      await reload();
    }
  };

  const submit = async (v: Values, o: Open, d: Obj) => {
    const label = labelOf(o);
    if ((v.reason ?? '').trim().length < MIN_REASON) {
      onError?.(`The governed reason must be at least ${MIN_REASON} characters. Nothing was written.`);
      return;
    }
    const parsed = o.kind === 'block' ? o.spec.parse(v, d) : parseActivity(v, str(o.activity.id));
    if (!parsed.ok) {
      onError?.(`${parsed.error} Nothing was written.`);
      return;
    }
    const block = o.kind === 'block' ? o.spec.block : 'activityAttributes';
    try {
      await postBlock(studyId, { block, value: parsed.value, expected: o.expected, reason: v.reason.trim() });
    } catch (e) {
      await failed(e, label);
      return;
    }
    setOpen(null);
    onToast?.(parsed.value === null ? `${label} cleared from the design.` : `${label} recorded on the design.`);
    await reload();
  };

  if (error) return <div className="pde-refusal" role="alert">The design could not be read, so its planning inputs are not shown. {error}</div>;
  if (!design) return <div role="status" className="scaf-note">Reading the design’s planning inputs…</div>;

  const sub = open?.kind === 'block' ? open.spec.sub : '"Not stated" clears the location; "None recorded" clears the specimen and everything recorded about it.';

  return (
    <section style={{ marginTop: 16 }} aria-label="Planning inputs">
      <h3 className="pd-pane-t" style={{ fontSize: 13 }}>Planning inputs</h3>
      <div className="pd-pane-s">
        The sponsor inputs the planning projections read. Each is a governed write to the design object, with a reason; nothing here is computed or assumed.
        {!canWrite && ` ${WRITER_ONLY}`}
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        {BLOCKS.map(({ spec, read }) => {
          const current = (read(design) ?? null) as Obj | null;
          return (
            <div key={spec.block} className="pd-kv">
              <span className="pd-kv-k">{spec.title}</span>
              <span className="pd-kv-v"><PG.StatusBadge status={current ? 'recorded' : 'not recorded'} /></span>
              <EditButton verb={current ? 'Edit' : 'Record'} target={spec.title} canWrite={canWrite} onClick={() => setOpen(openBlock(spec, current, design))} />
            </div>
          );
        })}
      </div>
      <ActivityRows design={design} canWrite={canWrite} onOpen={setOpen} />
      {open && canWrite && (
        <C2CForm
          key={open.kind === 'block' ? open.spec.block : `activity:${str(open.activity.id)}`}
          config={{
            eyebrow: 'Study design · planning inputs', title: labelOf(open), sub: [sub, open.drawer.note].filter(Boolean).join(' '),
            governed: true, submitLabel: 'Record', fields: open.drawer.fields,
          }}
          onCancel={() => setOpen(null)}
          onSubmit={(v) => void submit(v, open, design)}
        />
      )}
    </section>
  );
}
