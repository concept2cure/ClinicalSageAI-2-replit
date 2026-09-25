/**
 * Protocol development — the schedule of assessments.
 *
 * Split out of ProtocolDev.tsx when the register stopped being half-writable.
 *
 * ── What was here before ─────────────────────────────────────────────────────
 * The cells wrote (POST /api/protocol-soa/cells and /cells/clear, each carrying
 * the session's stated reason, each reverted if the server refused). The GRID
 * ITSELF did not: there was no way to add a visit or an assessment from this
 * screen, although `POST …/documents/:id/visits` and `POST
 * /api/protocol-soa/documents/:id/assessments` both existed, and WO added the
 * rename and the two removals on 2026-09-21 with no caller either. A schedule
 * of assessments whose columns and rows can only be created through an API is
 * not a schedule anyone can author.
 *
 * ── The findings ─────────────────────────────────────────────────────────────
 * `issues` used to be a hard-coded `[]` in the assembler — not a verdict, an
 * empty list. It is now `validateSoa`'s findings, the same deterministic
 * engine `/api/protocol-soa/documents/:id/matrix` reports. So an empty list
 * here means the engine ran and found nothing; a MISSING list means it did not
 * run, and this pane says that rather than drawing a clean bill of health over
 * a verdict nobody computed.
 */
import React, { useState } from 'react';
import * as PG from './ProtocolGov';
import { PaneHead } from './ProtocolDevShared';
import type { PdevFormKind, PdevFormTarget } from './ProtocolDevForms';
import { apiRequest, serverMessage } from '@/lib/queryClient';

const MIN_REASON = 8;

export interface SoaTabProps {
  doc: { soa?: { visits?: unknown[]; assessments?: unknown[]; cells?: Record<string, string[]>; issues?: unknown } };
  /** False when the protocol row carries no governed document id. */
  canWrite?: boolean;
  onError?: (message: string) => void;
  /** Opens the governed drawer for a visit / assessment write. Omitted where
   *  the host has no drawer to open, in which case the controls are not drawn
   *  rather than drawn inert. */
  onEdit?: (kind: PdevFormKind, target?: PdevFormTarget) => void;
}

type Row = Record<string, unknown>;
const asRows = (v: unknown): Row[] => (Array.isArray(v) ? (v as Row[]) : []);
const str = (v: unknown): string => (v == null ? '' : String(v));

/** The cell write, and the sentence to show if the record refuses it. */
async function writeCell(wasOn: boolean, assessmentId: number, visitId: number, reason: string): Promise<string | null> {
  try {
    const res = await apiRequest(
      'POST',
      wasOn ? '/api/protocol-soa/cells/clear' : '/api/protocol-soa/cells',
      wasOn ? { assessmentId, visitId, reason } : { assessmentId, visitId, required: true, reason },
    );
    if (res.ok) return null;
    /* `apiRequest` throws for every refusal except 401, so this is the 401
       path. It used to fall back to the envelope's code and then `HTTP 401`,
       putting an enum token on screen (ci:error-envelope). */
    const j: unknown = await res.json().catch(() => null);
    return serverMessage(j) ?? 'Your session has ended. Sign in again; the cell was not changed.';
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

/** The grid's tick state and the one governed write behind it. */
function useSoaCells(
  assessments: Row[], seeded: Record<string, string[]>, reason: string, editable: boolean,
  onError?: (m: string) => void,
) {
  const [cells, setCells] = useState<Record<string, Set<string>>>(() => {
    const m: Record<string, Set<string>> = {};
    assessments.forEach((a) => { m[str(a.id)] = new Set(seeded[str(a.id)] ?? []); });
    return m;
  });
  const [saving, setSaving] = useState<string | null>(null);

  const flip = (aid: string, vid: string) => setCells((prev) => {
    const n = { ...prev };
    const set = new Set(n[aid]);
    if (set.has(vid)) set.delete(vid); else set.add(vid);
    n[aid] = set;
    return n;
  });

  const toggle = async (aid: string, vid: string) => {
    if (!editable || saving) return;
    const assessmentId = Number(aid);
    const visitId = Number(vid);
    if (!Number.isInteger(assessmentId) || !Number.isInteger(visitId)) {
      onError?.('This row has no governed id, so the cell cannot be written.');
      return;
    }
    const wasOn = cells[aid]?.has(vid) ?? false;
    setSaving(aid + ':' + vid);
    flip(aid, vid); // optimistic
    const refusal = await writeCell(wasOn, assessmentId, visitId, reason.trim());
    if (refusal) {
      flip(aid, vid); // the record did not change, so neither does the grid
      onError?.('The cell was not saved — ' + refusal + '. The schedule is unchanged.');
    }
    setSaving(null);
  };

  return { cells, toggle, saving };
}

/** The engine's findings, or the plain statement that none were computed. */
export function SoaIssues({ issues, hasSchedule }: { issues: unknown; hasSchedule: boolean }) {
  if (!Array.isArray(issues)) {
    return (
      <div className="pde-note">
        The schedule was not validated for this protocol, so nothing here is a verdict on it.
        Re-open the protocol once the schedule engine has run.
      </div>
    );
  }
  if (issues.length === 0 && !hasSchedule) {
    return <div className="pde-note">There is no schedule to validate yet — add a visit and an assessment.</div>;
  }
  return <PG.FindingsList findings={issues as never} dense={true} />;
}

interface GridProps {
  visits: Row[];
  assessments: Row[];
  cells: Record<string, Set<string>>;
  saving: string | null;
  editable: boolean;
  onToggle: (aid: string, vid: string) => void;
  onEdit?: (kind: PdevFormKind, target?: PdevFormTarget) => void;
}

function SoaVisitHead({ v, onEdit }: { v: Row; onEdit?: GridProps['onEdit'] }) {
  const label = str(v.label);
  return (
    <th className="pd-soa-vh">
      <span className="pd-soa-vl">{label}</span>
      <span className="pd-soa-vd">{str(v.day)}</span>
      {v.window ? <span className="pd-soa-vw">{str(v.window)}</span> : null}
      {onEdit && (
        <span className="pde-soa-vh">
          {/* Icon controls, named for a screen reader by the visit they act on.
              Spelling the name in visible text made every column as wide as
              "Remove visit Week 16 (primary endpoint)" and the grid unreadable,
              which is the one thing a schedule of assessments must not be. */}
          <button type="button" className="pde-rowbtn" aria-label={'Rename visit ' + label} title={'Rename visit ' + label}
            onClick={() => onEdit('visit-rename', { id: Number(v.id), label, defaults: { visitName: label, timepoint: str(v.day) } })}>
            <PG.Ic n="penLine" s={12} />
          </button>
          <button type="button" className="pde-rowbtn" aria-label={'Remove visit ' + label} title={'Remove visit ' + label}
            onClick={() => onEdit('visit-remove', { id: Number(v.id), label })}>
            <PG.Ic n="minus" s={12} />
          </button>
        </span>
      )}
    </th>
  );
}

function SoaRowHead({ a, onEdit }: { a: Row; onEdit?: GridProps['onEdit'] }) {
  const label = str(a.label);
  return (
    <th className="pd-soa-rh">
      <span className="pde-soa-label">
        <span className="pd-soa-rl">{label}</span>
        <span className="pd-soa-rc">{str(a.cat)}</span>
      </span>
      {onEdit && (
        <span className="pde-soa-rh">
          <button type="button" className="pde-rowbtn" aria-label={'Remove assessment ' + label} title={'Remove assessment ' + label}
            onClick={() => onEdit('assessment-remove', { id: Number(a.id), label })}>
            <PG.Ic n="minus" s={12} />
          </button>
        </span>
      )}
    </th>
  );
}

function SoaGrid({ visits, assessments, cells, saving, editable, onToggle, onEdit }: GridProps) {
  const visitTotal = (vid: string) => assessments.reduce((acc, a) => acc + (cells[str(a.id)]?.has(vid) ? 1 : 0), 0);
  return (
    <div className="pd-soa-wrap">
      <table className="pd-soa">
        <thead><tr>
          <th className="pd-soa-cnr">Assessment</th>
          {visits.map((v) => <SoaVisitHead key={str(v.id)} v={v} onEdit={onEdit} />)}
        </tr></thead>
        <tbody>{assessments.map((a) => {
          const aid = str(a.id);
          return (
            <tr key={aid}>
              <SoaRowHead a={a} onEdit={onEdit} />
              {visits.map((v) => {
                const vid = str(v.id);
                const on = cells[aid]?.has(vid) ?? false;
                return (
                  <td
                    key={vid}
                    className={'pd-soa-cell' + (on ? ' on' : '') + (editable ? '' : ' ro')}
                    onClick={() => onToggle(aid, vid)}
                    onKeyDown={(e) => { if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); onToggle(aid, vid); } }}
                    role="checkbox"
                    aria-checked={on}
                    aria-disabled={!editable}
                    aria-busy={saving === aid + ':' + vid}
                    tabIndex={editable ? 0 : -1}
                    title={str(a.label) + ' · ' + str(v.label) + (editable ? '' : ' — enter a reason for change to edit')}
                  >
                    {on ? <span className="pd-soa-x">{'✕'}</span> : null}
                  </td>
                );
              })}
            </tr>
          );
        })}</tbody>
        <tfoot><tr>
          <th className="pd-soa-rh foot">Per-visit total</th>
          {visits.map((v) => {
            const total = visitTotal(str(v.id));
            return <td key={str(v.id)} className={'pd-soa-tot' + (total < 3 ? ' low' : '')}>{total}</td>;
          })}
        </tr></tfoot>
      </table>
    </div>
  );
}

/**
 * Every tick is a governed write, and the reason is stated ONCE for the
 * editing session rather than per cell: the router requires ≥ 8 characters on
 * each write and prompting forty times for the same sentence would be unusable.
 * Each cell still writes its own audited row carrying that reason. Structural
 * changes — a visit, an assessment — go through their own governed drawer,
 * which collects its own reason, because those are not forty small edits.
 */
export function SoaTab({ doc, canWrite, onError, onEdit }: SoaTabProps) {
  const soa = doc.soa ?? {};
  const assessments = asRows(soa.assessments);
  const visits = asRows(soa.visits);
  const [reason, setReason] = useState('');
  const editable = Boolean(canWrite) && reason.trim().length >= MIN_REASON;
  const { cells, toggle, saving } = useSoaCells(assessments, soa.cells ?? {}, reason, editable, onError);

  const actions = onEdit && canWrite
    ? [
        { label: 'Add visit', icon: 'plus', onAct: () => onEdit('visit-add'), variant: 'outline' },
        { label: 'Add assessment', icon: 'plus', onAct: () => onEdit('assessment-add'), variant: 'outline' },
      ]
    : undefined;

  return (
    <div className="pd-pane">
      <PaneHead
        title="Schedule of assessments"
        sub={assessments.length + ' assessments × ' + visits.length + ' visits'}
        actions={actions}
      />
      {canWrite ? (
        <label className="pd-soa-reason">
          <span>Reason for change (governed) — required before the grid can be edited</span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Why the schedule is being changed — written to the audit trail with every cell"
            aria-label="Reason for change, required before editing the schedule of assessments"
          />
        </label>
      ) : (
        <div className="pde-note">
          This protocol has no governed document id, so the schedule is read-only here.
        </div>
      )}
      <SoaGrid
        visits={visits} assessments={assessments} cells={cells} saving={saving}
        editable={editable} onToggle={toggle} onEdit={canWrite ? onEdit : undefined}
      />
      <div className="pd-soa-issues">
        <SoaIssues issues={soa.issues} hasSchedule={visits.length > 0 && assessments.length > 0} />
      </div>
    </div>
  );
}
