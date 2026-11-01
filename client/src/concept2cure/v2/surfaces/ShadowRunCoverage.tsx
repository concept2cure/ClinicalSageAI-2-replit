/**
 * What a Shadow Review run's reviewer read (2026-10-25, row D7).
 *
 * Since prompt v1.2 the reviewer is sent each leaf's text, within a per-leaf and
 * a per-run budget, and some leaves are withheld or unreadable
 * (server/services/shadow-review/shadow-review-input.ts). A finding list alone
 * cannot say that: "no findings" over three leaves read out of fourteen is not
 * a clean review of fourteen. The run records its coverage
 * (`inputCoverage` on GET /api/submissions/sequences/:seqId/shadow-review) and
 * this states it, in words.
 *
 * It decides nothing. A run recorded before coverage existed carries none, and
 * reads as "sent section codes and titles only", which is what such a run was
 * given.
 */
import React from 'react';

export interface ShadowRunCoverageRecord {
  textSent: boolean;
  textWithheld?: string;
  charsSent: number;
  leafDigest?: 'recorded' | 'changed_during_read' | 'not_derivable';
  leaves: Array<{ sectionCode: string; status: 'read' | 'truncated' | 'not_read' | 'withheld' | 'withdrawn'; reason?: string }>;
}

const isCoverage = (v: unknown): v is ShadowRunCoverageRecord =>
  !!v && typeof v === 'object' && Array.isArray((v as ShadowRunCoverageRecord).leaves);

export function ShadowRunCoverage({ run }: { run: { id: number; status: string; inputCoverage?: unknown } }) {
  if (run.status === 'waived' || run.status === 'running') return null;
  const c = run.inputCoverage;
  if (!isCoverage(c)) {
    return (
      <div className="scaf-note sc-mb" data-testid="shadow-run-coverage">
        Run #{run.id}&#39;s reviewer was sent section codes and titles only; it did not read the documents.
      </div>
    );
  }
  const read = c.leaves.filter((l) => l.status === 'read' || l.status === 'truncated');
  const cut = c.leaves.filter((l) => l.status === 'truncated').length;
  const unread = c.leaves.filter((l) => l.status === 'not_read' || l.status === 'withheld');
  return (
    <div className="scaf-note sc-mb" data-testid="shadow-run-coverage">
      {c.textSent
        ? `The reviewer read the text of ${read.length} of ${c.leaves.length} ${c.leaves.length === 1 ? 'leaf' : 'leaves'}` +
          `${cut > 0 ? ` (${cut} cut to the review budget)` : ''}.`
        : `The reviewer was sent section codes and titles only.${c.textWithheld ? ` ${c.textWithheld}` : ''}`}
      {c.textSent && unread.length > 0 && (
        <ul className="sc-mt">
          {unread.map((l, i) => (
            <li key={`${l.sectionCode}-${i}`}>
              <span className="sc-mono">{l.sectionCode}</span>: {l.reason ?? 'not read'}
            </li>
          ))}
        </ul>
      )}
      {c.leafDigest === 'changed_during_read' && (
        <div className="sc-mt">The leaves changed while this run read them, so it covers no current leaves.</div>
      )}
    </div>
  );
}
