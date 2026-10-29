/**
 * Module 2 QC — the cross-summary check (ICH M4) over the summaries a package
 * run would build now, from this project's saved records (slice G5).
 *
 * Reads GET /api/submissions/:id/module2-qc. The server builds 2.3, 2.5 and
 * 2.7 with the canonical builders from the approved CMC sources and the
 * completed CSR builds, exactly as the program run does, and grades them with
 * the deterministic QC. A summary a run would not build is named with its
 * reason and reported missing; it is never invented. A failed read is the
 * failure, never "ready".
 *
 * @module client/src/concept2cure/v2/surfaces/SubmissionModule2Qc
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState, useLiveData } from '../dataConnect';

export interface Module2QcFinding { summaryKey: string; severity: 'error' | 'warning'; code: string; message: string }
export interface SavedModule2QcView {
  basis: 'SAVED_PROGRAM_CONTENT';
  qc: {
    ready: boolean;
    checked: string[];
    missingSummaries: string[];
    completenessByKey: Record<string, number>;
    findings: Module2QcFinding[];
    counts: { errors: number; warnings: number };
  };
  notBuilt: Array<{ summaryKey: string; reason: string }>;
  sources: { completedCsrStudies: number; cmcGate: string; module3Sections: number };
}

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
/** A 200 that is not this shape is a mismatch, never "ready". */
export function isSavedModule2Qc(v: unknown): v is SavedModule2QcView {
  if (!isObj(v) || v.basis !== 'SAVED_PROGRAM_CONTENT' || !isObj(v.qc) || !isObj(v.sources)) return false;
  const qc = v.qc;
  return typeof qc.ready === 'boolean' && Array.isArray(qc.checked) && Array.isArray(qc.missingSummaries) &&
    Array.isArray(qc.findings) && qc.findings.every((f) => isObj(f) && typeof f.message === 'string' && typeof f.severity === 'string') &&
    isObj(qc.counts) && Array.isArray(v.notBuilt);
}

/** The heading's status: what was checked, never a claim about what was not. */
export function module2QcStatus(v: SavedModule2QcView): string {
  const { errors, warnings } = v.qc.counts;
  if (v.qc.checked.length === 0) return 'nothing built to check';
  if (v.qc.ready) return `${v.qc.checked.length} summary(ies) checked · no blocking finding`;
  return `${v.qc.checked.length} summary(ies) checked · ${errors} blocking · ${warnings} warning(s)`;
}

export function SubmissionModule2Qc({ submissionId }: { submissionId: number }) {
  const path = `/api/submissions/${submissionId}/module2-qc`;
  const st = useLiveData<SavedModule2QcView>(path, [path], isSavedModule2Qc);
  const v = st.loading || st.error ? null : st.data;
  const reasonFor = (key: string) => v?.notBuilt.find((n) => n.summaryKey === key)?.reason ?? null;

  return (
    <div className="pj-card" style={{ marginTop: 12 }} data-testid="submission-module2-qc">
      <div className="pj-card-h">
        <span className="t">Module 2 summaries QC</span>
        <span className="s">{st.loading ? 'checking…' : st.error || !v ? 'not read' : module2QcStatus(v)}</span>
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        {st.loading ? (
          <div style={{ padding: 12 }}>
            <EmptyState icon={I.checkSquare} title="Building this project's Module 2 summaries to check them…" busy testId="module2-qc-loading" />
          </div>
        ) : st.error || !v ? (
          <div style={{ padding: 12 }}>
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="The Module 2 check could not be run"
              hint={`The submission core answered ${st.status ?? 'no status'}. Nothing is being claimed about this submission's Module 2.`}
              testId="module2-qc-error"
            />
          </div>
        ) : (
          <>
            <div style={{ padding: '8px 12px', fontSize: 11.5, color: 'var(--text-400)' }}>
              Built from this project's saved records as a package run would build them now
              ({v.sources.completedCsrStudies} completed CSR build(s); CMC sources {v.sources.cmcGate === 'open' ? 'approved' : 'not approved'}),
              then checked for presence, traceability, content, completeness and the builders' own gaps.
            </div>
            <table className="reg-tbl">
              <thead>
                <tr><th>Summary</th><th>Severity</th><th>Check</th><th>Finding</th></tr>
              </thead>
              <tbody>
                {v.qc.findings.map((f, i) => (
                  <tr key={`${f.summaryKey}-${f.code}-${i}`}>
                    <td className="mono">{f.summaryKey === '*' ? 'Module 2' : f.summaryKey}</td>
                    <td><span className={'rd-chip tone-' + (f.severity === 'error' ? 'err' : 'warn')}>{f.severity === 'error' ? 'Blocking' : 'Warning'}</span></td>
                    <td className="mono">{f.code}</td>
                    <td>
                      {f.message}
                      {f.code === 'PRESENCE' && reasonFor(f.summaryKey) ? <div style={{ color: 'var(--text-400)' }}>{reasonFor(f.summaryKey)}</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {v.qc.findings.length === 0 && (
              <div style={{ padding: '8px 12px', fontSize: 11.5 }}>No finding on the {v.qc.checked.join(', ')} summaries checked.</div>
            )}
            {v.notBuilt.length > 0 && (
              <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-400)' }}>
                Not built now: {v.notBuilt.map((n) => `${n.summaryKey} (${n.reason})`).join('; ')}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
