/**
 * Does this submission contradict itself? — the Truth Engine's findings, on a
 * screen.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `consistency_findings` records every cross-document check run against a
 * submission: a dimension (subject counts, specification vs QOS, label vs
 * safety), the claim under review, what it was checked against, and the
 * verdict. `GET /api/submissions/:id/consistency` has returned them since the
 * Truth Engine was written, and the route says in its own comment that **no
 * browser client calls it** — AnA's `check_consistency` is the only door.
 *
 * So a reviewer could be told in chat that §2.7.4 disagrees with the CSR, and
 * then find nothing about it anywhere in Submission Center. The same gap CMC
 * had with stability trending and process capability, in the surface a client
 * reaches straight after Module 3 (reachability sweep over Submission Center's
 * claimed prefixes, docs/evidence/D2-CLIENT-JOURNEY/2026-10-26/pass9/).
 *
 * ── The one thing this panel must never say ─────────────────────────────────
 * That an unchecked submission is consistent. An empty table here means NO
 * CHECK HAS RUN — not "no conflict found" — and the two are opposite claims to
 * a reviewer deciding whether to file. Everything below follows from that: the
 * empty state says what it is, a failed read is the failure, and the heading
 * counts what was checked rather than asserting a state.
 */
import React from 'react';
import { I } from '../icons';
import { EmptyState, useLiveRows } from '../dataConnect';

/** One row of `consistency_findings`, as the route returns it (SELECT *). */
export interface ConsistencyFindingRow {
  id: number;
  dimension: string;
  leftRef: string;
  rightRef: string;
  /** The engine writes exactly these two. Anything else is shown as recorded. */
  status: string;
  detail: string | null;
  createdAt: string | null;
}

/** A 200 that is not an array of findings is a mismatch, not "no conflicts". */
export function isFindingRows(value: unknown): value is ConsistencyFindingRow[] {
  return Array.isArray(value) && value.every((r) => r && typeof r === 'object' && 'dimension' in r && 'status' in r);
}

/** A reader's name for each dimension the engine checks. */
const DIMENSION_LABELS: Record<string, string> = {
  'subject-counts': 'Subject counts',
  'spec-vs-qos': 'Specification vs QOS',
  'label-vs-safety': 'Label vs safety',
};

export function isConflict(status: string): boolean {
  return status.trim().toLowerCase() === 'conflict';
}

function FindingRow({ row }: { row: ConsistencyFindingRow }) {
  const conflict = isConflict(row.status);
  return (
    <tr>
      <td style={{ fontWeight: 600 }}>{DIMENSION_LABELS[row.dimension] ?? row.dimension}</td>
      <td className="mono">{row.leftRef}</td>
      <td className="mono">{row.rightRef}</td>
      <td>
        <span className={'rd-chip tone-' + (conflict ? 'err' : 'ok')}>{row.status}</span>
      </td>
      <td style={{ fontSize: 11.5, color: 'var(--text-300)' }}>
        {/* A conflict with no recorded detail is still a conflict; saying "—"
            is honest, and inventing a reason would not be. */}
        {row.detail ?? '—'}
      </td>
      <td className="mono" style={{ whiteSpace: 'nowrap', fontSize: 11 }}>
        {row.createdAt ? String(row.createdAt).replace('T', ' ').replace(/\..*$/, '') : '—'}
      </td>
    </tr>
  );
}

export function SubmissionConsistency({ submissionId }: { submissionId: number }) {
  const path = `/api/submissions/${submissionId}/consistency`;
  const live = useLiveRows<ConsistencyFindingRow>(path, [path], isFindingRows);
  const rows = live.loading || live.error ? [] : live.rows;
  const conflicts = rows.filter((r) => isConflict(r.status)).length;

  return (
    <div className="pj-card" style={{ marginTop: 12 }} data-testid="submission-consistency">
      <div className="pj-card-h">
        <span className="t">Cross-document consistency</span>
        <span className="s">
          {/* What was CHECKED, never a claim about what was not. */}
          {live.loading
            ? 'reading the recorded checks…'
            : live.error
              ? 'not read'
              : rows.length === 0
                ? 'no check recorded'
                : `${rows.length} check(s) recorded · ${conflicts} conflict(s)`}
        </span>
      </div>
      <div className="pj-card-b" style={{ padding: 0 }}>
        {live.loading ? (
          <div style={{ padding: 12 }}>
            <EmptyState icon={I.gitBranch} title="Reading this submission's consistency checks…" busy testId="consistency-loading" />
          </div>
        ) : live.error ? (
          <div style={{ padding: 12 }}>
            {/* Never "no conflicts": an unread check and a clean one are
                opposite claims to a reviewer deciding whether to file. */}
            <EmptyState
              tone="error"
              icon={I.alertTriangle}
              title="This submission's consistency checks could not be read"
              hint={`The submission core answered ${live.status ?? 'no status'}. Nothing is being claimed about whether this submission agrees with itself.`}
              testId="consistency-error"
            />
          </div>
        ) : rows.length === 0 ? (
          <div style={{ padding: 12 }}>
            <EmptyState
              icon={I.gitBranch}
              title="No consistency check has been run on this submission"
              hint="This is not a finding of consistency — nothing has been compared. Ask AnA to check a claim against its sources (check_consistency), and every check it runs is recorded here with its verdict."
              testId="consistency-none"
            />
          </div>
        ) : (
          <>
            {conflicts > 0 && (
              <div role="alert" style={{ padding: '8px 12px', color: 'var(--warning)', fontSize: 11.5 }}>
                {conflicts} recorded conflict(s). A conflict is a difference between a claim and the source it was
                checked against; it is resolved in the documents, not here.
              </div>
            )}
            <table className="reg-tbl">
              <thead>
                <tr><th>Dimension</th><th>Claim</th><th>Checked against</th><th>Verdict</th><th>Detail</th><th>Recorded</th></tr>
              </thead>
              <tbody>{rows.map((r) => <FindingRow key={r.id} row={r} />)}</tbody>
            </table>
            <div style={{ padding: '8px 12px', fontSize: 11, color: 'var(--text-400)' }}>
              Only the checks that have been run appear here. A dimension absent from this table has not been
              compared on this submission.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
