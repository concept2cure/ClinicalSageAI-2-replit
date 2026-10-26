/**
 * The eCTD compile screen's module readiness: what GET
 * /api/ectd-compile/:projectIdent/status counted, module by module
 * (FILING_SPINE F23 6/9). Moved out of EctdCompile.tsx with its types.
 *
 * The server says what it counted (`readinessBasis`):
 *   - 'placed': the required sections the sequence's placed documents cover,
 *     against the required set of the sequence's own market;
 *   - 'approved': a project's own section store, approved/locked/final;
 *   - 'no-sequence' and 'unavailable': nothing counted, and `readinessNote`
 *     says why. The card prints the sentence and no figure.
 * A module with nothing required has no figure (`completionPct` null) and is
 * not "ready". A reply without `modules` is a failed read (isStatusView), never
 * an empty state.
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState } from '../dataConnect';

export interface ModuleReadiness {
  moduleCode: string;
  moduleName: string;
  totalSections: number;
  requiredSections: number;
  completedRequired: number;
  /** Null when the module requires nothing. */
  completionPct: number | null;
  /** Null when the module requires nothing. */
  ready: boolean | null;
}
/** Where the required-section set came from: the live rule pack, the labelled
 *  ICH baseline when no pack applies, or no CTD set at all (with the reason). */
export interface RequiredSectionSource {
  source: 'rule_pack' | 'fallback' | 'not_applicable';
  docType?: string;
  agency?: string;
  packVersion?: string;
  reason?: string;
}
export type ReadinessBasis = 'placed' | 'approved' | 'no-sequence' | 'unavailable';
export interface StatusView {
  /** Legacy numeric project id, or null when the ident named a program. */
  projectId: number | null;
  projectIdent?: string;
  programId?: string | null;
  /** Null when nothing was counted (`readinessNote` says why). */
  overallReadiness: number | null;
  /** Every required section approved/locked/final. Not the same as submittable. */
  contentComplete?: boolean;
  submissionReady: boolean;
  /** Why the package cannot be transmitted. Empty exactly when submissionReady. */
  submissionBlockers?: string[];
  modules: ModuleReadiness[];
  requiredSectionSource?: RequiredSectionSource | null;
  readinessBasis?: ReadinessBasis;
  /** Why nothing was counted ('no-sequence', 'unavailable'). */
  readinessNote?: string | null;
  /** The sequence a compile builds, with its recorded region and type. */
  sequence?: { sequenceNumber: string; region: string; leafCount: number; type?: string | null } | null;
  totalSections: number;
  totalRequired: number;
  totalCompleted: number;
  lastUpdated: string | null;
}

/** A status reply the card can draw: one without `modules` is a failed read. */
export function isStatusView(v: unknown): v is StatusView {
  return !!v && typeof v === 'object' && Array.isArray((v as { modules?: unknown }).modules);
}

const NOTHING_COUNTED: ReadonlySet<ReadinessBasis | undefined> = new Set(['no-sequence', 'unavailable']);

/** What the status counted, in words, for the chip and for AnA. */
export function statusReadinessWords(s: StatusView): string {
  if (NOTHING_COUNTED.has(s.readinessBasis)) return s.readinessNote ?? 'nothing counted';
  if (s.readinessBasis === 'placed') {
    const seq = s.sequence?.sequenceNumber;
    return `${s.totalCompleted} of ${s.totalRequired} required sections placed${seq ? ` in sequence ${seq}` : ''}`;
  }
  if (s.overallReadiness == null) return 'not measured';
  return `${s.overallReadiness}% · ${(s.contentComplete ?? s.overallReadiness === 100) ? 'content complete' : 'incomplete'}`;
}

function StatusChip({ status }: { status: StatusView }) {
  if (NOTHING_COUNTED.has(status.readinessBasis)) return null;
  const complete = status.readinessBasis === 'placed'
    ? status.totalRequired > 0 && status.totalCompleted === status.totalRequired
    : (status.contentComplete ?? status.overallReadiness === 100);
  return <span className={'rd-chip tone-' + (complete ? 'ok' : 'warn')}>{statusReadinessWords(status)}</span>;
}

function sourceLine(src: RequiredSectionSource): string {
  if (src.source === 'rule_pack') {
    return `Required sections from rule pack ${src.docType ?? ''}:${src.agency ?? ''} ${src.packVersion ?? ''}`.replace(/\s+/g, ' ').trim();
  }
  if (src.source === 'not_applicable') return src.reason ?? 'No CTD required-section set applies.';
  return `Required sections are the generic ICH baseline, not this project's outline. ${src.reason ?? ''}`.trim();
}

function ModuleRow({ m }: { m: ModuleReadiness }) {
  const nothingRequired = m.completionPct == null;
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{m.moduleName}</td>
      <td>{m.completedRequired}/{m.requiredSections}</td>
      <td>{m.totalSections}</td>
      <td style={{ minWidth: 120 }}>
        {nothingRequired ? <span style={{ fontSize: 11, color: 'var(--text-400)' }}>none required</span> : (
          <>
            <div style={{ background: 'var(--border)', borderRadius: 6, height: 8, overflow: 'hidden' }}>
              <div style={{ width: m.completionPct + '%', height: '100%', background: m.ready ? 'var(--success)' : 'var(--warning)' }} />
            </div>
            <span style={{ fontSize: 11, color: 'var(--text-400)' }}>{m.completionPct}%</span>
          </>
        )}
      </td>
      <td style={{ textAlign: 'right' }}>
        {m.ready != null && <span className={'rd-chip tone-' + (m.ready ? 'ok' : 'warn')}>{m.ready ? 'ready' : 'partial'}</span>}
      </td>
    </tr>
  );
}

function ReadinessBody({ status, state }: { status: StatusView | null; state: 'idle' | 'loading' | 'ready' | 'error' }) {
  if (state === 'loading' || state === 'idle') return <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Loading readiness…" /></div>;
  if (state === 'error' || !status) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState tone="error" icon={I.alertTriangle} title="Compilation readiness could not be read"
          hint="The readiness read didn’t answer, so no module is shown as ready or not. Sign in to your tenant and retry." />
      </div>
    );
  }
  if (NOTHING_COUNTED.has(status.readinessBasis)) {
    return <div style={{ padding: 16 }}><EmptyState icon={I.layers} title="Nothing is counted yet" hint={status.readinessNote ?? undefined} /></div>;
  }
  if (status.modules.length === 0) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState icon={I.layers} title="No CTD modules to measure"
          hint={status.requiredSectionSource?.reason ?? 'The required-section set names no CTD module.'} />
      </div>
    );
  }
  return (
    <>
      {/* Which required set the numbers below are measured against. A
          generic baseline must never pass for the program's own outline. */}
      {status.requiredSectionSource && (
        <div style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-400)', borderBottom: '1px solid var(--border)' }}>
          {sourceLine(status.requiredSectionSource)}
        </div>
      )}
      <table className="reg-tbl"><thead><tr><th>Module</th><th>Required complete</th><th>Sections</th><th>Completion</th><th style={{ textAlign: 'right' }}>Status</th></tr></thead>
        <tbody>{status.modules.map((m) => <ModuleRow key={m.moduleCode} m={m} />)}</tbody></table>
    </>
  );
}

/** The module readiness card. The chip reports what was counted: placement in
 *  a sequence, or content completeness for a project's section store; never
 *  "submission-ready", which the blockers panel decides. */
export function EctdModuleReadiness({ status, state }: { status: StatusView | null; state: 'idle' | 'loading' | 'ready' | 'error' }) {
  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Module readiness</span>
        {status && <StatusChip status={status} />}
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        <ReadinessBody status={status} state={state} />
      </div>
    </div>
  );
}
