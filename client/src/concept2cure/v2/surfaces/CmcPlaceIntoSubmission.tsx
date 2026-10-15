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
  placements: Array<{ sectionKey: string; leafSectionCode: string; leafId: number; title: string; updatedInPlace?: boolean }>;
  skipped: Array<{ sectionKey: string; reason: string }>;
}

type Verdict = { ok: true; outcome: PlacementOutcome } | { ok: false; message: string } | null;

function VerdictCard({ verdict }: { verdict: Exclude<Verdict, null> }) {
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
  const { placements, skipped } = verdict.outcome;
  const updated = placements.filter((p) => p.updatedInPlace).length;
  return (
    <div className="pj-con cm-gate-verdict is-ok" style={{ marginTop: 10 }}>
      <span className="ico">{I.shieldCheck}</span>
      <div>
        <div className="pj-con-t">
          {placements.length} {placements.length === 1 ? 'section' : 'sections'} placed into the submission
          {updated > 0 ? ` (${updated} updated in place)` : ''}
        </div>
        <div className="pj-con-d">
          {placements.map((p) => p.leafSectionCode).join(', ') || '—'}
          {skipped.length > 0 && <> · skipped: {skipped.map((s) => `§${s.sectionKey} (${s.reason})`).join('; ')}</>}
        </div>
      </div>
    </div>
  );
}

export function PlaceIntoSubmission({ projectId, onPlaced }: { projectId: string; onPlaced: () => void }) {
  const [verdict, setVerdict] = React.useState<Verdict>(null);
  const target = useFilingTarget(() => setVerdict(null), projectId);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    target.load();
    // A mount-time read of this program's submissions; `target` is stable per
    // render, and re-running on every one would re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  const reasonOk = placementReasonOk(reason);
  const canPlace = Boolean(target.subId != null && target.seq && reasonOk && !busy);

  const place = async () => {
    if (!canPlace || target.subId == null || !target.seq) return;
    setBusy(true);
    setVerdict(null);
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
      setVerdict({ ok: true, outcome: { placements: data?.placements ?? [], skipped: data?.skipped ?? [] } });
      onPlaced();
    } catch (e) {
      setVerdict({ ok: false, message: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div data-testid="m3-place-into-submission">
      <div className="cm-meta" style={{ marginBottom: 6 }}>
        Place the approved §3.2 sections into an IND sequence — each becomes a real submission leaf the checklist,
        package manifest and eCTD assembly read. Placing again into the same sequence updates its leaves; into a later
        sequence, they are filed as replacements.
      </div>
      <FilingTargetFields target={target} idPrefix="m3-place" />
      <PlacementReasonField value={reason} onChange={setReason} idPrefix="m3-place" disabled={busy} />
      <button
        className="reg-cta"
        onClick={() => void place()}
        disabled={!canPlace}
        title={reasonOk ? undefined : PLACEMENT_REASON_REQUIRED}
      >
        {I.fileDown} {busy ? 'Placing…' : 'Place into the submission'}
      </button>
      {verdict && <VerdictCard verdict={verdict} />}
    </div>
  );
}
