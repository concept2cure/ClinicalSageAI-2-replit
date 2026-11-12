/**
 * Place the approved Module 3 into an IND sequence — the CMC → IND seam, from
 * the CMC board.
 *
 * POST /api/cmc/module3-os/place-into-submission snapshots every approved §3.2
 * section into the canonical renderable leaf source and places real
 * submission leaves at the m-prefixed section codes, after re-running the same
 * final-export gate the board's "Check export gate" reports.
 *
 * It used its own submission and sequence pickers, which listed every
 * submission of the organisation (another project's included, which the
 * server then refused), and sent no reason (discovery map 2026-10-04,
 * cmc-placement-no-reason-own-picker). It now uses the ONE filing picker the
 * Vault and Authoring placements use (filingTarget.tsx: this program's
 * submissions only, locked sequences offered disabled with the reason) and the
 * one placement reason field, and the server requires the reason. A second
 * placement into the same sequence updates its leaves; into a later sequence,
 * it files them as replace.
 */
import React from 'react';
import { I } from '../icons';
import { apiRequest } from '@/lib/queryClient';
import { cmcWriteError } from './cmcShared';
import {
  FilingTargetFields,
  PLACEMENT_REASON_REQUIRED,
  PlacementReasonField,
  placementReasonOk,
  useFilingTarget,
} from './filingTarget';

interface PlacementOutcome {
  /** `unchanged`: the section's leaf already files exactly this text, and nothing was written for it. */
  placements: Array<{ sectionKey: string; leafSectionCode: string; leafId: number; title: string; updatedInPlace?: boolean; unchanged?: boolean }>;
  skipped: Array<{ sectionKey: string; reason: string }>;
}

type Verdict = { ok: true; outcome: PlacementOutcome } | { ok: false; message: string } | null;

const sections = (n: number) => `${n} ${n === 1 ? 'section' : 'sections'}`;

/**
 * What a placement did, in words. A section the server left untouched is
 * never called "placed": until 2026-11-12 a repeat read "21 sections placed
 * into the submission (21 updated in place)".
 */
type PlacedRow = PlacementOutcome['placements'][number];
const codes = (rows: PlacedRow[]) => rows.map((p) => p.leafSectionCode).join(', ');
const labelled = (label: string, rows: PlacedRow[]) => (rows.length > 0 ? `${label}: ${codes(rows)}` : '');
const counted = (rows: PlacedRow[], verb: string) => (rows.length > 0 ? `${sections(rows.length)} ${verb}` : '');

/** "All 21 sections in sequence 0001 are unchanged." */
function unchangedSentence(n: number, where: string): string {
  const all = n === 1 ? 'The section' : n === 2 ? 'Both sections' : `All ${n} sections`;
  return `${all} in ${where} ${n === 1 ? 'is' : 'are'} unchanged.`;
}

export function placementWords(outcome: PlacementOutcome, sequenceNumber?: string): { title: string; detail: string } {
  const { placements, skipped } = outcome;
  const where = sequenceNumber ? `sequence ${sequenceNumber}` : 'this sequence';
  const unchanged = placements.filter((p) => p.unchanged);
  const refiled = placements.filter((p) => !p.unchanged && p.updatedInPlace);
  const fresh = placements.filter((p) => !p.unchanged && !p.updatedInPlace);
  const skippedWords = skipped.length > 0 ? ` · skipped: ${skipped.map((x) => `§${x.sectionKey} (${x.reason})`).join('; ')}` : '';
  if (placements.length > 0 && unchanged.length === placements.length) {
    return { title: 'Already placed. Nothing was written.', detail: unchangedSentence(placements.length, where) + skippedWords };
  }
  if (unchanged.length + refiled.length === 0) {
    const suffix = sequenceNumber ? ` · ${where}` : '';
    return { title: `${sections(fresh.length)} placed into the submission`, detail: (codes(fresh) || '—') + suffix + skippedWords };
  }
  const tail = unchanged.length > 0 ? `${unchanged.length} unchanged` : '';
  const title = [counted(fresh, 'placed'), counted(refiled, 'filed again'), tail].filter(Boolean).join('; ');
  const detail = [labelled('Placed', fresh), labelled('Filed again', refiled)].filter(Boolean).join(' · ');
  return { title: title + (sequenceNumber ? `, in ${where}` : ''), detail: detail + skippedWords };
}

/* The last placement of each project in this page session. The board re-reads
   readiness after a placement and mounts this control afresh, with nothing
   chosen, which lost the verdict: a person who had just placed 21 sections
   saw an empty form and no word of what happened. The verdict is kept here
   with the sequence it was made into, and shown again until another sequence
   is chosen or another placement is made. */
type Shown = Exclude<Verdict, null> & { sequenceNumber?: string };
const lastPlacement = new Map<string, { sequenceId: number; verdict: Shown }>();
export function rememberPlacement(projectId: string, sequence: { id: number; sequenceNumber?: string }, verdict: Exclude<Verdict, null>): Shown {
  const shown: Shown = { ...verdict, sequenceNumber: sequence.sequenceNumber };
  lastPlacement.set(projectId, { sequenceId: sequence.id, verdict: shown });
  return shown;
}
/** The remembered verdict, unless a different sequence is now chosen. */
export function recallPlacement(projectId: string, chosenSequenceId: number | null | undefined): Shown | null {
  const last = lastPlacement.get(projectId);
  if (!last) return null;
  return chosenSequenceId == null || chosenSequenceId === last.sequenceId ? last.verdict : null;
}
export function forgetPlacement(projectId: string): void {
  lastPlacement.delete(projectId);
}

function VerdictCard({ verdict }: { verdict: Shown }) {
  if (!verdict.ok) {
    return (
      <div className="pj-con cm-gate-verdict" style={{ marginTop: 10 }}>
        <span className="ico">{I.alertTriangle}</span>
        <div>
          <div className="pj-con-t">Placement refused</div>
          <div className="pj-con-d">{verdict.message}</div>
        </div>
      </div>
    );
  }
  const words = placementWords(verdict.outcome, verdict.sequenceNumber);
  return (
    <div className="pj-con cm-gate-verdict is-ok" style={{ marginTop: 10 }} role="status">
      <span className="ico">{I.shieldCheck}</span>
      <div>
        <div className="pj-con-t">{words.title}</div>
        <div className="pj-con-d">{words.detail}</div>
      </div>
    </div>
  );
}

export function PlaceIntoSubmission({ projectId, onPlaced }: { projectId: string; onPlaced: () => void }) {
  const [verdict, setVerdict] = React.useState<Shown | null>(null);
  const target = useFilingTarget(() => setVerdict(null), projectId);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    target.load();
    // A mount-time read of this program's submissions; `target` is stable per
    // render, and re-running on every one would re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  /* What is on screen: this mount's own verdict, else the one the last
     placement into the chosen sequence left (see lastPlacement). */
  const shown = verdict ?? recallPlacement(projectId, target.seq?.id);
  const reasonOk = placementReasonOk(reason);
  const canPlace = Boolean(target.subId != null && target.seq && reasonOk && !busy);

  const place = async () => {
    if (!canPlace || target.subId == null || !target.seq) return;
    setBusy(true);
    setVerdict(null);
    forgetPlacement(projectId);
    try {
      const res = await apiRequest('POST', '/api/cmc/module3-os/place-into-submission/' + encodeURIComponent(projectId), {
        submissionId: target.subId,
        sequenceId: target.seq.id,
        reason: reason.trim(),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) {
        setVerdict({ ok: false, message: cmcWriteError(json, res.status) });
        return;
      }
      const data = (json as { data?: PlacementOutcome })?.data;
      const placed: Exclude<Verdict, null> = { ok: true, outcome: { placements: data?.placements ?? [], skipped: data?.skipped ?? [] } };
      setVerdict(rememberPlacement(projectId, target.seq, placed));
      onPlaced();
    } catch (e) {
      setVerdict({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="m3-place-into-submission">
      {/* What placing DOES, as a disclosure rather than a paragraph above the
          control (D5 §A.4.15, §WA.4.2 rule 8). The words are unchanged and
          one click away; a reader who already knows is not made to read them
          again every time they file. */}
      <details className="pj-more">
        <summary>What placing does</summary>
        <p>
          Place the approved §3.2 sections into an IND sequence — each becomes a real submission leaf the checklist,
          package manifest and eCTD assembly read. Placing again into the same sequence updates its leaves; into a later
          sequence, they are filed as replacements.
        </p>
      </details>
      <FilingTargetFields target={target} idPrefix="m3-place" />
      <PlacementReasonField value={reason} onChange={setReason} idPrefix="m3-place" disabled={busy} />
      {/* A ghost, not the view's orange: Module 3 build's one primary is
          "Compile Module 3" (D5 §A.4.13), and a view gets one (§WA.3). */}
      <button
        type="button"
        className="btn ghost"
        onClick={() => void place()}
        disabled={!canPlace}
        title={reasonOk ? undefined : PLACEMENT_REASON_REQUIRED}
      >
        {I.fileDown} {busy ? 'Placing…' : 'Place into the submission'}
      </button>
      {shown && <VerdictCard verdict={shown} />}
    </div>
  );
}
