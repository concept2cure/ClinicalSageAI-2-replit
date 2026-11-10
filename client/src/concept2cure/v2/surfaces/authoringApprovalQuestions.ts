/**
 * The questions the filing bar asks when the server refuses a seal or an
 * approval for a reason the signer can act on (surfaces/AuthoringFilingBar.tsx):
 * the document is not settled (Freeze, DP-35; approval, 2026-10-30), or its
 * review is not complete (P-95, 2026-11-09). Split out of the bar, in its
 * folder, when P-95's question took it past the file-size limit; the bar owns
 * when each is asked and what its answer does.
 */
import type { C2CFormConfig } from '../C2CForm';

/** What the server said is still outstanding on this document. */
export interface Unresolved { openComments: number; pendingEdits: number }

/** "1 unresolved comment and 2 tracked changes" — the same phrasing the server
 *  uses, built here so the dialog can restate it without echoing server text. */
export function describeUnresolved(u: Unresolved): string {
  const parts: string[] = [];
  if (u.openComments > 0) {
    parts.push(`${u.openComments} unresolved comment${u.openComments === 1 ? '' : 's'}`);
  }
  if (u.pendingEdits > 0) {
    parts.push(`${u.pendingEdits} tracked change${u.pendingEdits === 1 ? '' : 's'} nobody has accepted or rejected`);
  }
  return parts.join(' and ');
}

/* The freeze is a signature (DP-35), so it is asked for by the shared
 * EsignModal: meaning, reason, password and code. When the server has REFUSED
 * because the document is not settled, this form asks first — naming exactly
 * what is outstanding and making the choice explicit — and the signature
 * dialog opens again only if the user chooses to seal it as it stands. That
 * refusal is not a dead end and must not read like one: freezing a draft with
 * open comments is a real thing to want. What it is NOT is a button that
 * quietly proceeds: the acknowledgement is a deliberate selection, and the
 * server records what was sealed over. */
export const UNSETTLED_FORM = (title: string, unresolved: Unresolved): C2CFormConfig => ({
  eyebrow: 'Part 11 · content freeze',
  title: 'This document is not settled',
  sub:
    `“${title}” still has ${describeUnresolved(unresolved)}. Freezing seals the ` +
    'content for signature and filing, so the questions would go unanswered and the ' +
    'proposed edits would reach a reviewer undecided.',
  governed: true,
  submitLabel: 'Continue',
  fields: [
    {
      key: 'acknowledge',
      label: 'How do you want to proceed?',
      type: 'seg' as const,
      required: true,
      options: [
        { value: 'resolve', label: 'Go back and resolve them' },
        { value: 'seal', label: 'Seal it as it stands' },
      ],
    },
  ],
});

/* The same question for an approval (2026-10-30): an Approval signature
 * approves and freezes, so the server asks what Freeze asks and refuses while
 * comments are open or tracked changes are undecided. Approving it as it
 * stands is a deliberate choice, re-signed, and recorded by the server. */
export const APPROVAL_UNSETTLED_FORM = (title: string, unresolved: Unresolved): C2CFormConfig => ({
  eyebrow: 'Part 11 · approval',
  title: 'This document is not settled',
  sub:
    `“${title}” still has ${describeUnresolved(unresolved)}. An approval seals the ` +
    'content for filing, so the questions would go unanswered and the proposed edits ' +
    'would stay undecided in the approved text.',
  governed: true,
  submitLabel: 'Continue',
  fields: [
    {
      key: 'acknowledge',
      label: 'How do you want to proceed?',
      type: 'seg' as const,
      required: true,
      options: [
        { value: 'resolve', label: 'Go back and resolve them' },
        { value: 'approve', label: 'Approve it as it stands' },
      ],
    },
  ],
});

/* P-95 (the founder, 2026-11-02, clarified 2026-11-09): a regulated document is
 * approved only after its review. The server refuses the approval before the
 * password (REVIEW_REQUIRED) and says why: not reviewed, review still open, or
 * the text changed since it was reviewed. That is a step not yet taken,
 * not a failure to retry, so the question states the server's sentence and
 * offers the editor's own Send for review. It records nothing, so it is not
 * marked governed, and there is no "approve anyway". */
export const NOT_REVIEWED_FORM = (sentence: string, canSend: boolean): C2CFormConfig => ({
  eyebrow: 'Part 11 · approval',
  title: 'Review comes before approval',
  sub: sentence,
  submitLabel: canSend ? 'Send for review' : 'Close',
  fields: [],
});
