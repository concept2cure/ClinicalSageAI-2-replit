/**
 * Pathway sub-tab vocabulary — tab labels and the audit-kind taxonomy. No records.
 * Ported from `ui_kits/mdx/data-pathway-tabs.jsx`.
 *
 * Consumed by `hooks/usePathwayTabsData.ts` and, through it, by
 * `surfaces/pathway/PathwayPanes.tsx` and `surfaces/pathway/FilesTreePane.tsx`.
 * The example letters this file once held are deleted (see below). The
 * closed-enum `AUDIT_KIND_META` taxonomy stays here: it is a
 * display vocabulary shared by every audit path regardless of data source, and
 * it describes REAL events.
 *
 * ── What was deleted, and why it must not come back ──────────────────────────
 * The kit fixtures also carried AUDIT and APPROVALS bundles: 46 audit events
 * across four pathways, stitched into a *synthesized* Part 11 hash-chain by a
 * `chain()` helper, and 13 approval records — several marked `status: 'signed'`
 * with a `signed_at`, a named signer and a signature id, plus audit rows
 * carrying `signed: true` and a `sig`, actor IP addresses and a named notified-
 * body reviewer.
 *
 * That is a fabricated e-signature record and a fabricated immutable audit
 * trail. Sample mode gated them and the standing banner labelled them, which is
 * the right treatment for example CONTENT and the wrong treatment for these:
 * the audit trail is the artifact whose entire evidentiary value is that
 * nothing in it was authored for display. A demonstrable chain of invented
 * signatures is not a lesser version of that record, it is the opposite of one,
 * and no banner makes it safe to render in the surface whose job is to be
 * trusted. The same fabrication was removed once already from the Part 11
 * console; this was the second copy, one lane over.
 *
 * The audit and approvals panes now render live rows or an honest empty state.
 * `PathwayTabsBundle` no longer HAS those fields, so a future `sample={…}` on
 * either gate is a type error rather than a judgement call.
 */

import type {
  AuditKind,
  AuditKindMeta,
  Correspondence,
  PathwayTabsData,
} from '../types';

export const AUDIT_KIND_META: Record<AuditKind, AuditKindMeta> = {
  'section.edit':    { label: 'Edit',     tone: 'neutral' },
  'section.lock':    { label: 'Lock',     tone: 'neutral' },
  'section.unlock':  { label: 'Unlock',   tone: 'warn' },
  'review.start':    { label: 'Review',   tone: 'neutral' },
  'review.complete': { label: 'Verified', tone: 'success' },
  sign:              { label: 'E-sign',   tone: 'accent' },
  comment:           { label: 'Comment',  tone: 'neutral' },
  attach:            { label: 'Attach',   tone: 'neutral' },
  export:            { label: 'Export',   tone: 'neutral' },
  access:            { label: 'Access',   tone: 'neutral' },
  /* Only reached when the row carries no action string at all; a row that has
     one shows it verbatim through `auditChipMeta` below. */
  unclassified:      { label: 'Action not recorded', tone: 'neutral' },
};

/**
 * The chip a row is rendered with.
 *
 * For every classified kind this is the closed-enum label above. For the third
 * state it is the action string THE SERVER RECORDED, shown verbatim — because
 * the alternative that shipped was to guess, and the guess was `access`: a
 * `signature_apply`, a `section.delete` and a `data_modify` all rendered as
 * "Access", a read, with the real action nowhere on the screen. A label this
 * client cannot derive is not a label this client may invent.
 */
export function auditChipMeta(e: { kind: AuditKind; action?: string }): AuditKindMeta {
  if (e.kind === 'unclassified') {
    const action = (e.action || '').trim();
    return action ? { label: action, tone: 'neutral' } : AUDIT_KIND_META.unclassified;
  }
  return AUDIT_KIND_META[e.kind] || { label: e.kind, tone: 'neutral' };
}

/**
 * What a narrow kind filter cannot speak for, or null when it can speak for
 * every row in the window.
 *
 * The kind filters ("E-sign", "Review", "Edits", …) partition a vocabulary that
 * unclassified rows are by definition outside of. Answering "No events match
 * this filter." over a window that contains them reports a verdict — no
 * e-signatures here — for a question that was never asked of those rows. This
 * sentence is the difference between that and "this filter cannot tell".
 */
export function unclassifiedFilterCaveat(unclassified: number, total: number): string | null {
  if (unclassified <= 0) return null;
  return (
    `${unclassified} of ${total} events carry an action this view has no category for. ` +
    'They are listed under "All" with the recorded action shown verbatim; this filter ' +
    'cannot say whether any of them belong to it.'
  );
}

/* K510_CORRESP, PMA_CORRESP, CER_CORRESP and IVD_CORRESP — removed. Agency and
   notified-body letters that were never sent: a CDRH AI-Hold citing a missing
   MARD sub-analysis, an RTA, a Day-100 letter, notified-body GSPR questions,
   each with a reviewer, a due date and a triage owner. The correspondence tab
   reads GET /api/regulatory-correspondence/correspondence for the program, or
   says it has none. */

/** Per-pathway bundle so surfaces can index by pathway. */
export const PATHWAY_TABS_DATA: PathwayTabsData = {
  k510: { corrLabel: 'RTA / AI-Hold' },
  pma:  { corrLabel: 'Day-100' },
  cer:  { corrLabel: 'NB Q&A' },
  ivd:  { corrLabel: 'NB / GSPR' },
};
