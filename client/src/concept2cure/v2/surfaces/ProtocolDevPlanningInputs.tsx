/**
 * Protocol development — the planning inputs of the bound study design.
 *
 * The planning engines (dose escalation, enrollment, MMRM, external control,
 * master protocol, decentralised elements, biospecimens) read inputs only a
 * sponsor can supply, and nothing on screen could record them. This panel is
 * that: one governed `C2CForm` per block, posting to
 * `POST /api/study-design/:studyId/planning`, which validates the block
 * strictly, writes it through the one design writer and records the reason.
 *
 * What it does not do: compute anything, default anything, or show a block as
 * recorded before the server has confirmed the write — the panel re-reads the
 * design after every write rather than trusting what it sent.
 */
import React, { useCallback, useEffect, useState } from 'react';
import * as PG from './ProtocolGov';
import { apiRequest } from '@/lib/queryClient';
import { C2CForm } from '../C2CForm';
import { ACCRUAL_FORM, DOSE_FORM, MMRM_FORM, withGovernance, type PlanningFormSpec, type Values } from './planningInputForms';
import { EXTERNAL_FORM, MASTER_FORM, activityFields, parseActivity } from './planningStructureForms';

type Obj = Record<string, unknown>;
const MIN_REASON = 8;
const str = (v: unknown): string => (v == null ? '' : String(v));

/** Where each block lives on the design object. */
const BLOCKS: Array<{ spec: PlanningFormSpec; read: (d: Obj) => unknown }> = [
  { spec: DOSE_FORM, read: (d) => (d.safety as Obj | undefined)?.doseEscalation },
  { spec: ACCRUAL_FORM, read: (d) => d.accrualPlan },
  { spec: MMRM_FORM, read: (d) => (d.statisticalPlan as Obj | undefined)?.mmrmAssumptions },
  { spec: EXTERNAL_FORM, read: (d) => d.externalControlPlan },
  { spec: MASTER_FORM, read: (d) => d.masterProtocol },
];

function refusal(body: unknown, status: number): string {
  const b = body as { error?: unknown; detail?: unknown; details?: unknown } | null;
  const details = Array.isArray(b?.details) ? ` ${(b!.details as unknown[]).map(str).join('; ')}` : '';
  const detail = typeof b?.detail === 'string' ? ` ${b.detail}` : '';
  return `${typeof b?.error === 'string' ? b.error : `HTTP ${status}`}.${detail}${details}`;
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

type Open = { kind: 'block'; spec: PlanningFormSpec; current: Obj | null } | { kind: 'activity'; activityId: string };

export interface PlanningInputsPanelProps {
  studyId: string;
  canWrite: boolean;
  onError?: (m: string) => void;
  onToast?: (m: string) => void;
}

export function PlanningInputsPanel({ studyId, canWrite, onError, onToast }: PlanningInputsPanelProps) {
  const { design, error, reload } = useDesign(studyId);
  const [open, setOpen] = useState<Open | null>(null);

  const write = async (block: string, value: Obj | null, reason: string, label: string) => {
    const res = await apiRequest('POST', `/api/study-design/${encodeURIComponent(studyId)}/planning`, { block, value, reason } as never);
    const j = await res.json().catch(() => null);
    if (!res.ok) throw new Error(`${label} was not recorded — ${refusal(j, res.status)} Nothing was written.`);
  };

  const submit = async (v: Values, block: string, label: string, parse: (v: Values) => { ok: true; value: Obj | null } | { ok: false; error: string }) => {
    if ((v.reason ?? '').trim().length < MIN_REASON) {
      onError?.(`The governed reason must be at least ${MIN_REASON} characters. Nothing was written.`);
      return;
    }
    const parsed = parse(v);
    if (!parsed.ok) {
      onError?.(`${parsed.error} Nothing was written.`);
      return;
    }
    try {
      await write(block, parsed.value, v.reason.trim(), label);
      setOpen(null);
      onToast?.(parsed.value === null ? `${label} cleared from the design.` : `${label} recorded on the design.`);
      await reload();
    } catch (e) {
      onError?.(e instanceof Error ? e.message : String(e));
    }
  };

  if (error) return <div className="pde-refusal" role="alert">The design could not be read, so its planning inputs are not shown. {error}</div>;
  if (!design) return <div role="status" className="scaf-note">Reading the design’s planning inputs…</div>;

  const activities = (((design.scheduleOfActivities as Obj | undefined)?.activities ?? []) as Obj[]);

  return (
    <section style={{ marginTop: 16 }} aria-label="Planning inputs">
      <h3 className="pd-pane-t" style={{ fontSize: 13 }}>Planning inputs</h3>
      <div className="pd-pane-s">
        The sponsor inputs the planning projections read. Each is a governed write to the design object, with a reason; nothing here is computed or assumed.
      </div>
      <div style={{ display: 'grid', gap: 6, marginTop: 8 }}>
        {BLOCKS.map(({ spec, read }) => {
          const current = (read(design) ?? null) as Obj | null;
          return (
            <div key={spec.block} className="pd-kv">
              <span className="pd-kv-k">{spec.title}</span>
              <span className="pd-kv-v"><PG.StatusBadge status={current ? 'recorded' : 'not recorded'} /></span>
              <PG.Btn icon="penLine" variant="outline" disabled={!canWrite} onClick={() => setOpen({ kind: 'block', spec, current })}>
                {current ? 'Edit' : 'Record'}
              </PG.Btn>
            </div>
          );
        })}
      </div>
      {activities.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div className="pd-pane-s">Schedule of Activities — where each activity happens and what it collects.</div>
          {activities.map((a) => (
            <div key={str(a.id)} className="pd-kv">
              <span className="pd-kv-k">{str(a.name)}</span>
              <span className="pd-kv-v">
                {str(a.location) || 'location not stated'} · {str((a.specimen as Obj | undefined)?.type) || 'no specimen recorded'}
              </span>
              <PG.Btn icon="penLine" variant="outline" disabled={!canWrite} onClick={() => setOpen({ kind: 'activity', activityId: str(a.id) })}>Edit</PG.Btn>
            </div>
          ))}
        </div>
      )}
      {open?.kind === 'block' && canWrite && (
        <C2CForm
          key={open.spec.block}
          config={{ eyebrow: 'Study design · planning inputs', title: open.spec.title, sub: open.spec.sub, governed: true, submitLabel: 'Record', fields: withGovernance(open.spec.fields(open.current)) }}
          onCancel={() => setOpen(null)}
          onSubmit={(v) => void submit(v, open.spec.block, open.spec.title, open.spec.parse)}
        />
      )}
      {open?.kind === 'activity' && canWrite && (
        <C2CForm
          key={`activity:${open.activityId}`}
          config={{ eyebrow: 'Study design · planning inputs', title: 'Activity location and specimen', sub: '"Not stated" and "None recorded" clear the attribute.', governed: true, submitLabel: 'Record', fields: activityFields(activities, open.activityId) }}
          onCancel={() => setOpen(null)}
          onSubmit={(v) => void submit(v, 'activityAttributes', 'The activity’s location and specimen', parseActivity)}
        />
      )}
    </section>
  );
}
