/**
 * The filing copy's status as the Place into filing dialog says it
 * (docs/design/FILING_SPINE.md F17). Moved out of AuthoringPlaceIntoFiling.tsx
 * unchanged (2026-10-08), so the dialog's own file stays inside its length
 * limit; it re-exports both.
 */
import { snapshotStatusFor } from '@shared/regulatory/filing-copy-status';

/**
 * What the filing copy will be, said before placing (FILING_SPINE.md F17).
 * The copy takes the source's state at placement and keeps it: a draft placed
 * today is still a draft copy after the document is approved, and freeze,
 * dispatch and transmit release only approved copies. An unknown state claims
 * nothing and states the rule.
 */
export function copyStatusLine(docStatus: string | null | undefined): string {
  if (docStatus == null || String(docStatus).trim() === '') {
    return 'The filing copy takes this document’s state when it is placed, and keeps it. ' +
      'Freeze, dispatch and transmit accept only an approved copy.';
  }
  /* A forecast from the status as loaded: nothing is filed yet, and only the
     server reads the approval seal (it refuses an unsealed or altered source). */
  const copy = snapshotStatusFor(docStatus);
  if (copy === 'approved') return 'Will be filed as approved once the server verifies its approval seal.';
  if (copy === 'finalized') return 'Will be filed as finalized, not approved. Freeze refuses it until you re-place the document after approval.';
  return 'Will be filed as a draft. Freeze refuses it until you re-place the document after approval.';
}

/** The server's copy status after placing, as a sentence; empty when it is
 *  approved or the server did not say. */
export function placedCopyNote(copyStatus: string | null): string {
  if (copyStatus === 'draft') return ' The filing copy is a draft. Freeze will refuse it until you re-place it after approval.';
  if (copyStatus === 'finalized') return ' The filing copy is finalized, not approved. Freeze will refuse it until you re-place it after approval.';
  return '';
}
