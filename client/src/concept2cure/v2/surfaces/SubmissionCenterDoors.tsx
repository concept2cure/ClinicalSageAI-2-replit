/**
 * Submission Center's quiet secondary actions: the doors to the screens that are features of this app (§2's
 * work-area pattern: a header with the title, one line, one primary action and quiet secondary actions).
 *
 * Forms and letters and Compile & export were drawn here already (P-32; FILING_SPINE.md F14). Submission readiness
 * and Gateway transmittals had no door anywhere in the product, only ⌘K and AnA, though both are in the release
 * and in this app (launch-scope.ts, `submission-center`'s surfaces): Submission readiness is each market's dispatch
 * verdict for the open project (P-33; DispatchReadiness.tsx), and Gateway transmittals the log of what was sent to
 * an agency and what it acknowledged (GatewayTransmittals.tsx). P-122 (2026-11-10) gives each its door here.
 *
 * Moved out of SubmissionCenter.tsx, which is past the size ceiling, as the header grew (RULE 6: a split, not new).
 * Each door is offered only when its screen is in this release (useSurfaceAvailable).
 *
 * @module client/src/concept2cure/v2/surfaces/SubmissionCenterDoors
 */
import React from 'react';
import { stashNavParamsForTarget } from '../navParams';
import { useSurfaceAvailable } from '../surfaceAvailable';
import { isUsInd } from './programSequence';

export function SubmissionCenterDoors({ sub, seq, onNav }: {
  /** The submission the page has selected, if any. */
  sub: { id: number; applicationType: string; primaryRegion: string } | null;
  /** Its working sequence, if any. */
  seq: { id: number } | null;
  onNav?: (id: string) => void;
}) {
  const available = useSurfaceAvailable();
  if (!onNav) return null;
  return (
    <>
      {/* P-32: the IND forms and letters are a feature of this app, reached from the US IND they are filed in.
          The IND screen reads { submissionId } once on mount and opens that submission's checklist. */}
      {sub && isUsInd(sub) && available('ind-checklist') && (
        <button
          type="button"
          className="btn ghost"
          title="Form FDA 1571, the cover letter and the Letter of Authorization for this IND, on the IND screen"
          onClick={() => {
            stashNavParamsForTarget('ind-checklist', { submissionId: String(sub.id) });
            onNav('ind-checklist');
          }}
        >
          Forms and letters
        </button>
      )}
      {/* The compile screen, opened on the working sequence (FILING_SPINE.md F14). */}
      {seq && available('ectd-compile') && (
        <button
          type="button"
          className="btn ghost"
          onClick={() => { stashNavParamsForTarget('ectd-compile', { sequenceId: String(seq.id) }); onNav('ectd-compile'); }}
        >
          Compile &amp; export
        </button>
      )}
      {available('dispatch-readiness') && (
        <button
          type="button"
          className="btn ghost"
          title="Whether each of this project's markets is cleared to dispatch, and what blocks it"
          onClick={() => onNav('dispatch-readiness')}
          data-testid="sc-door-readiness"
        >
          Submission readiness
        </button>
      )}
      {available('gateway-transmittals') && (
        <button
          type="button"
          className="btn ghost"
          title="What was sent to an agency gateway, its status and the agency's acknowledgements"
          onClick={() => onNav('gateway-transmittals')}
          data-testid="sc-door-transmittals"
        >
          Gateway transmittals
        </button>
      )}
    </>
  );
}
