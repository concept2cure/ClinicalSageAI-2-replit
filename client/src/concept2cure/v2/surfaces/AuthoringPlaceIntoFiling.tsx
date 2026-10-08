/**
 * AuthoringPlaceIntoFiling — the authoring → filing seam for the document
 * editor. "Place into filing" takes the OPEN authored document and places it
 * into a sequence of the canonical submission core as a real submission_leaves
 * row (PUT /api/submissions/sequences/:seqId/leaves — the same write the
 * Submission Center Builder makes).
 *
 * ── The identity fact this dialog states instead of hiding ───────────────────
 * The editor's store is `authoring_documents` (uuid-keyed; server/routes/
 * authoring.router.ts). A leaf references its source polymorphically, and the
 * assembler can only materialize the tables it has a branch for — the current
 * list is `RESOLVABLE_DOCUMENT_TABLES` in
 * server/services/ectd/leaf-document-tables.ts, and anything else fails closed
 * at assembly as an unresolved leaf. `authoring_documents` is NOT among them,
 * and nothing links or derives one automatically (its only bridges —
 * concept2cure_artifacts and c2c_documents — are uuid stores too). So the
 * snapshot below is still how an authored document gets filed.
 *
 * UPDATED 2026-09-17 — this paragraph used to give the reason as "document_id
 * is an INTEGER, so a uuid-keyed store cannot be referenced at all". That is no
 * longer the general rule and repeating it would send the next reader to build
 * a snapshot workaround they do not need: `submission_leaves` now carries
 * `document_uuid` beside the integer, and `vault_documents` is resolved
 * directly through it — a vault PDF is filed as itself, with no copy. What
 * stops `authoring_documents` is narrower and unchanged: it has no resolver
 * branch, because its content is authored sections rather than a renderable
 * document, which is exactly what the snapshot step produces.
 *
 * So placement here is an explicit, stated DERIVATION, the join point the
 * canonical model names (shared/regulatory/canonical-document.ts §"placement"):
 *   1. re-read the document's SAVED sections from the server (never the local
 *      buffer — what is filed is what is persisted),
 *   2. file a point-in-time snapshot into the Co-Author store
 *      (POST /api/coauthor/documents — coauthor_documents, the canonical
 *      renderable leaf source; assembled section-by-section in the same format
 *      as server/services/ana/authoring-canonical-bridge.ts),
 *   3. place that snapshot as the leaf (PUT …/leaves, verdict verbatim via
 *      mutateVerbatim — the slice-6 idiom, imported, not duplicated).
 *
 * HONESTY / FAIL CLOSED:
 *   • the target pickers render live org data or honest error/empty states;
 *   • frozen/dispatched sequences are excluded from selection WITH the reason
 *     (their leaves are immutable — upsertLeaf refuses them server-side too);
 *   • a document with unsaved changes cannot be placed (the snapshot would
 *     silently omit what is on screen); a document with no saved content is
 *     refused before anything is written;
 *   • every write is awaited; the server's verdict is surfaced verbatim; a
 *     refused leaf after a created snapshot says exactly that — the snapshot's
 *     id is reported, and no placement is claimed;
 *   • success reports the placement (sequence + section + leaf id) from the
 *     server's row and deep-links to the Submission Center.
 */
import React from 'react';
import { I } from '../icons';
import { useDialog } from '../useDialog';
import {
  useFilingTarget,
  FilingTargetFields,
  PlacementReasonField,
  placementReasonOk,
  PLACEMENT_REASON_REQUIRED,
  judgeSectionCode,
  isLocked,
  matchingLeafReceipt,
  placementAuditWarning,
  type FilingLeafReceipt as PlacedLeaf,
} from './filingTarget';
import { mutateVerbatim } from './SubmissionSeqWorkspaces';
import { takeFilingCopy, leafFailure, type Verdict } from './placeIntoFilingCopy';
import { SC_LIFECYCLE_OPS } from '../fixtures/submission';
import type { FireToast } from '../toast';
import { stashNavParamsForTarget } from '../navParams';
import { shellProgramId, useShellProject } from '../shellProject';
import { documentSourceLabel } from '@shared/regulatory/canonical-document';
import { normalizeCtdCode } from '@shared/regulatory/section-code';
import { snapshotStatusFor } from '@shared/regulatory/filing-copy-status';

/* ── Server row shapes (only the columns this dialog reads) ── */

/* SubmissionRow, SequenceRow and isLocked now live in ./filingTarget — the
   Vault files into a sequence too, and one definition cannot drift from the
   other. */

/**
 * The one honest statement of why placement is a derivation. Pinned by test.
 *
 * It used to explain the derivation in the terms an engineer would use — that
 * leaves point at integer document rows while authoring documents are
 * uuid-keyed. True, and useless to the person reading it: a regulatory director
 * cannot act on a key type, and the sentence left them no clearer about what
 * pressing the button would do to their submission.
 *
 * What they DO need is the part that has regulatory consequence — that the
 * thing filed is a point-in-time copy of the SAVED document, so anything
 * unsaved does not travel with it. That fact is kept and made the subject of
 * the sentence; the key-type explanation stays in this file's header, where the
 * reader is the next engineer.
 */
export const IDENTITY_STATEMENT =
  'The submission of record cannot point at a working draft, so placing does not move this ' +
  'document — it files a point-in-time copy of the SAVED sections and places that copy as ' +
  'the leaf. What reaches the sequence is exactly what has been saved, not what is on screen.';

/**
 * The document's own CTD code: the deepest code every one of its sections sits
 * under (a one-section document's is that section's code). Null when its
 * sections share no code below a bare module, or it has none.
 *
 * Why the dialog needs it (QA 2026-10-08, j4): placement files the WHOLE saved
 * document as one leaf — the server takes the copy's text from the source
 * (services/coauthor/coauthor-snapshot.ts, "a source's copy IS the source") —
 * and the dialog prefilled the OPEN section's code. A Clinical Overview placed
 * at 2.5.1 filed 2.5.2 … 2.5.8 inside the 2.5.1 leaf.
 */
export function documentFilingCode(sectionCodes: ReadonlyArray<string | null | undefined>): string | null {
  const codes = sectionCodes.map((c) => normalizeCtdCode(c)).filter((c): c is string => c !== null);
  if (codes.length === 0 || codes.length !== sectionCodes.length) return null;
  let common = codes[0].split('.');
  for (const code of codes.slice(1)) {
    const segs = code.split('.');
    let i = 0;
    while (i < common.length && i < segs.length && common[i] === segs[i]) i += 1;
    common = common.slice(0, i);
  }
  return common.length >= 2 ? common.join('.') : null;
}

/**
 * Why a code cannot take this document, or null: it names one of the
 * document's own sections while the document holds others, so the leaf would
 * carry every other section under that one heading.
 */
export function ownSectionRefusal(canonical: string | null, sectionCodes: ReadonlyArray<string | null | undefined> | undefined): string | null {
  if (!canonical || !sectionCodes || sectionCodes.length < 2) return null;
  const own = documentFilingCode(sectionCodes);
  if (canonical === own) return null;
  if (!sectionCodes.some((c) => normalizeCtdCode(c) === canonical)) return null;
  return (
    `${canonical} is one section of this document. Placement files the whole saved document ` +
    `(${sectionCodes.length} sections) as one leaf, so it is filed at the document’s own code` +
    (own ? `, ${own}.` : ' — a code that covers all of its sections.')
  );
}

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

export interface AuthoringPlaceIntoFilingProps {
  docId: string;
  docTitle: string;
  /** The active section's code — the section-code prefill (editable) when the
   *  document's own code cannot be derived from `sectionCodes`. */
  activeSectionCode: string | null;
  /** The codes of the document's sections, in order. When given, the dialog
   *  prefills the document's own code (documentFilingCode), states that the
   *  whole document is filed, and refuses one of its own section codes. */
  sectionCodes?: ReadonlyArray<string | null>;
  /** Unsaved changes in the open section: placement snapshots SAVED content
   *  only, so a dirty editor refuses with the reason rather than filing a
   *  document that silently omits what is on screen. */
  dirty: boolean;
  /** The open document's governed state (DRAFT, IN_REVIEW, APPROVED, FROZEN…),
   *  from which the filing copy's status is derived. Null when not known. */
  docStatus?: string | null;
  onNav: (id: string) => void;
  fireToast: FireToast;
}


interface Placement {
  leafId: number;
  sectionCode: string;
  sequenceLabel: string;
  snapshotId: number;
  /** The copy's status as the server filed it; null when it did not say. */
  copyStatus: string | null;
  /** The server answered with the leaf that already held this document. */
  unchanged: boolean;
  seqId: number;
  sequenceNumber: string;
  /** The submission the sequence belongs to, for "Open in Submission Center". */
  submissionId: number | null;
}

function AuthoringPlaceIntoFilingForDocument({
  docId,
  docTitle,
  activeSectionCode,
  sectionCodes,
  dirty,
  docStatus,
  onNav,
  fireToast,
}: AuthoringPlaceIntoFilingProps) {
  const [open, setOpen] = React.useState(false);
  /* The code a whole-document leaf is filed at, when the sections give one. */
  const ownCode = sectionCodes ? documentFilingCode(sectionCodes) : null;
  /* `enabled` is the open flag: the panel is inline below rather than its own
     component, and a hook cannot be called conditionally. Guarded on `placing`
     so Escape cannot dismiss the dialog mid-write, matching the backdrop. */
  const dlgRef = useDialog(() => { if (!placing) setOpen(false); }, open);

  // Where to file. Shared with the Vault's own place-into-submission dialog
  // (./filingTarget), so the rule that a frozen or dispatched sequence cannot
  // take a leaf is stated in ONE place rather than two that can drift.
  const target = useFilingTarget(() => setVerdict(null));
  /* Only `seq` is read here — the submission/sequence pickers and their locked
     set are rendered by FilingTargetFields from the same hook. */
  const { seq } = target;

  const [section, setSection] = React.useState('');
  const [op, setOp] = React.useState('new');
  const [reason, setReason] = React.useState('');
  const [placing, setPlacing] = React.useState(false);
  const [verdict, setVerdict] = React.useState<Verdict>(null);
  const [placement, setPlacement] = React.useState<Placement | null>(null);
  const [needsReconciliation, setNeedsReconciliation] = React.useState(false);
  const [replaced, setReplaced] = React.useState(false);
  const [replaceReason, setReplaceReason] = React.useState('');
  const verdictRef = React.useRef<HTMLDivElement | null>(null);
  const generation = React.useRef(0);
  const pending = React.useRef(false);
  React.useEffect(() => () => { generation.current += 1; }, []);

  const openDialog = () => {
    setOpen(true);
    setVerdict(null);
    setPlacement(null);
    setNeedsReconciliation(false);
    setReplaced(false);
    setSection(ownCode ?? activeSectionCode ?? '');
    setOp('new');
    target.load();
  };

  /* What the typed section code resolves to, by the SAME rule the write
     boundary and the packager apply (shared/regulatory/section-code). The
     section code decides which module folder the document is filed into, and
     this input was free text with no feedback: an unusable value was only
     discovered after a filing snapshot had already been created for it, and
     before the write boundary was closed it produced a package with a
     top-level folder no eCTD layout defines. */
  const codeJudged = judgeSectionCode(section);
  const ownSection = ownSectionRefusal(codeJudged.canonical, sectionCodes);
  const sectionJudged = ownSection
    ? { ...codeJudged, placeable: false, note: { tone: 'err' as const, text: ownSection } }
    : codeJudged;
  const sectionIsPlaceable = sectionJudged.placeable;
  const sectionNote = sectionJudged.note;

  const reasonOk = placementReasonOk(reason);
  const canPlace =
    !placing &&
    !needsReconciliation &&
    !placement &&
    !dirty &&
    seq != null &&
    !isLocked(seq.status) &&
    section.trim() !== '' &&
    sectionIsPlaceable &&
    reasonOk;
  /* Where a placement goes, or null when one cannot be made. It files at the
     code the note announces ("Files as 3.2.S.4.2"), not at the keystrokes:
     upsertLeaf stores a section code as sent, and the Vault filing dialog,
     sharing this judgement, sends the canonical form too. */
  const filing = canPlace && seq && sectionJudged.canonical ? { seq, sectionCode: sectionJudged.canonical, subId: target.subId } : null;

  const place = async () => {
    if (!filing || pending.current) return;
    const started = generation.current;
    const current = () => started === generation.current;
    pending.current = true;
    const { sectionCode } = filing;
    setPlacing(true);
    setVerdict(null);
    setPlacement(null);
    try {
      const copy = await takeFilingCopy(docId, docTitle, sectionCode, reason.trim(), current);
      if (!copy || !current()) return;
      if (!copy.ok) {
        setNeedsReconciliation(copy.unconfirmed);
        setVerdict(copy.verdict);
        return;
      }
      const { snapshotId, copyStatus } = copy;

      // 3. The canonical write: the leaf, pointing at the snapshot. Verdict verbatim.
      const put = await mutateVerbatim<PlacedLeaf>('PUT', `/api/submissions/sequences/${filing.seq.id}/leaves`, {
        sectionCode,
        title: docTitle,
        lifecycleOp: op,
        documentTable: 'coauthor_documents',
        documentId: snapshotId,
        reason: reason.trim(),
      });
      if (!current()) return;
      if (!matchingLeafReceipt(put.data, { sequenceId: filing.seq.id, sectionCode, documentTable: 'coauthor_documents', documentId: snapshotId, lifecycleOp: op })) {
        const failure = leafFailure(put, snapshotId, filing.seq.sequenceNumber, sectionCode);
        setNeedsReconciliation(failure.unconfirmed);
        setVerdict(failure.verdict);
        return;
      }
      const sequenceLabel = `${filing.seq.sequenceNumber} · ${filing.seq.type}`;
      setPlacement({
        leafId: put.data.id, sectionCode: put.data.sectionCode, sequenceLabel, snapshotId,
        copyStatus, unchanged: !!put.data.unchanged, seqId: filing.seq.id, sequenceNumber: filing.seq.sequenceNumber,
        submissionId: filing.subId,
      });
      /* The server answers a repeat placement of the same document at the same
         section with the leaf that already holds it, and writes nothing
         (QA 2026-10-08: 2.5.1 was placed twice as two live leaves). Said as
         what it is — not as a placement, and not as an unrecorded one. */
      if (put.data.unchanged) {
        const text =
          `Already placed: leaf #${put.data.id} at ${put.data.sectionCode} in sequence ${sequenceLabel} holds this document ` +
          `(${documentSourceLabel('coauthor_documents', snapshotId)}). The leaf was not changed.` +
          (copyStatus === 'approved'
            ? ' The document is now approved: re-place the approved version so the leaf holds the approved text.'
            : placedCopyNote(copyStatus));
        setVerdict({ tone: 'ok', text });
        fireToast(`Already placed — leaf ${put.data.sectionCode} in sequence ${filing.seq.sequenceNumber} holds this document. The leaf was not changed.`);
        return;
      }
      const auditWarning = placementAuditWarning(put.data);
      setVerdict({
        tone: auditWarning ? 'err' : 'ok',
        text:
          `Placed as leaf ${put.data.sectionCode} in sequence ${sequenceLabel} — ` +
          `server-confirmed (leaf #${put.data.id}, from ${documentSourceLabel('coauthor_documents', snapshotId)}).` +
          placedCopyNote(copyStatus) + auditWarning,
      });
      if (auditWarning) fireToast(`Placement confirmed.${auditWarning}`, 'error');
      else fireToast(`Placed into filing — leaf ${put.data.sectionCode} in sequence ${filing.seq.sequenceNumber}.`);
    } finally {
      if (current()) { pending.current = false; setPlacing(false); }
    }
  };

  /* Re-place approved version (F17): the leaf that already holds this
     document is rewritten by id, so the server re-pins it to the approved
     copy's text. Offered only when the server said the copy is approved. It
     states what it changes and takes its own reason (design review
     2026-10-08, Part 11 lens: it re-sent the first placement's reason from a
     locked field). The button stays mounted while the write runs, so focus
     does not drop to the page. */
  const offerReplace = !!placement && placement.unchanged && placement.copyStatus === 'approved' && !replaced;
  const canReplace = offerReplace && !placing && placementReasonOk(replaceReason);
  const replaceApproved = async () => {
    if (!placement || !canReplace || pending.current) return;
    const started = generation.current;
    pending.current = true;
    setPlacing(true);
    try {
      const put = await mutateVerbatim<PlacedLeaf>('PUT', `/api/submissions/sequences/${placement.seqId}/leaves`, {
        leafId: placement.leafId,
        sectionCode: placement.sectionCode,
        title: docTitle,
        lifecycleOp: op,
        documentTable: 'coauthor_documents',
        documentId: placement.snapshotId,
        reason: replaceReason.trim(),
      });
      if (started !== generation.current) return;
      if (!matchingLeafReceipt(put.data, { sequenceId: placement.seqId, sectionCode: placement.sectionCode, documentTable: 'coauthor_documents', documentId: placement.snapshotId, lifecycleOp: op }) || put.data.id !== placement.leafId) {
        const failure = leafFailure(put, placement.snapshotId, placement.sequenceNumber, placement.sectionCode);
        setNeedsReconciliation(failure.unconfirmed);
        setVerdict(failure.verdict);
        return;
      }
      setReplaced(true);
      const auditWarning = placementAuditWarning(put.data);
      setVerdict({
        tone: auditWarning ? 'err' : 'ok',
        text: `Re-placed: leaf #${put.data.id} at ${put.data.sectionCode} now holds the approved version ` +
          `(${documentSourceLabel('coauthor_documents', placement.snapshotId)}).` + auditWarning,
      });
      // The button goes with the offer: the outcome takes focus, not the page.
      requestAnimationFrame(() => verdictRef.current?.focus());
      fireToast(`Re-placed — leaf ${put.data.sectionCode} in sequence ${placement.sequenceNumber} holds the approved version.`);
    } finally {
      if (started === generation.current) { pending.current = false; setPlacing(false); }
    }
  };

  return (
    <>
      <button
        className="btn ghost"
        style={{ height: 30 }}
        onClick={openDialog}
        title="Place this document into an eCTD sequence of the submission core"
      >
        {I.layers} Place into filing
      </button>

      {open && (
        <div
          className="de-bd"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !placing) setOpen(false);
          }}
        >
          {/* It declared role="dialog" and stopped there. No aria-modal, so a
              screen reader kept reading the editor underneath; no Escape; and
              focus stayed on the trigger behind the scrim, so the only exits
              were a backdrop mousedown (mouse-only) or tabbing blind through
              the page. This is a governed write — it snapshots the document and
              PUTs a submission leaf — so a user could also tab out of it into
              the live editor while it was still on screen. The Escape path is
              guarded the same way the backdrop already was, so it cannot
              dismiss mid-write. */}
          <div
            className="de"
            ref={dlgRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="apf-title"
          >
            <div className="de-h">
              <div>
                <div className="de-h-eye">Authoring → filing</div>
                <div className="de-h-t" id="apf-title">Place into filing</div>
                <div className="de-h-s">{IDENTITY_STATEMENT}</div>
              </div>
              <button className="de-x" onClick={() => setOpen(false)} disabled={placing} aria-label="Close">
                {I.close}
              </button>
            </div>

            <div className="de-body">
              <fieldset disabled={placing || needsReconciliation || !!placement} style={{ border: 0, margin: 0, padding: 0, minWidth: 0 }}>
              <FilingTargetFields target={target} idPrefix="apf" />

              {/* ── Section code + lifecycle operation ── */}
              <div className="de-field half">
                <label className="de-label" htmlFor="apf-section">
                  Section code<span className="req">*</span>
                </label>
                <div className="de-desc">
                  {sectionCodes && sectionCodes.length > 0
                    ? `Files the whole saved document (${sectionCodes.length} section${sectionCodes.length === 1 ? '' : 's'}) as one leaf` +
                      (ownCode ? `, at the document’s own code ${ownCode}.` : '.') + ' Edit to file elsewhere.'
                    : 'Prefilled from the open section; edit to file elsewhere.'}
                </div>
                <input
                  id="apf-section"
                  className="c2c-input"
                  type="text"
                  placeholder="e.g. 1.2, 2.7.3 or 3.2.S.4.2"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                  aria-describedby={sectionNote ? 'apf-section-note' : undefined}
                  aria-invalid={sectionNote?.tone === 'err' ? true : undefined}
                />
                {sectionNote && (
                  <div
                    id="apf-section-note"
                    role="status"
                    className={sectionNote.tone === 'err' ? 'de-err' : 'de-desc'}
                    style={{ marginTop: 4 }}
                  >
                    {sectionNote.text}
                  </div>
                )}
              </div>
              <div className="de-field half">
                <label className="de-label" htmlFor="apf-op">Lifecycle operation</label>
                <select id="apf-op" className="c2c-input" value={op} onChange={(e) => setOp(e.target.value)}>
                  {Object.entries(SC_LIFECYCLE_OPS).map(([v, m]) => (
                    <option key={v} value={v}>{m.l}</option>
                  ))}
                </select>
              </div>

              <PlacementReasonField value={reason} onChange={setReason} idPrefix="apf" disabled={placing} />
              </fieldset>

              {/* Until placement; after it, the verdict states the server's copy status. */}
              {!placement && (
                <div
                  id="apf-copy-status"
                  className={String(docStatus ?? '').trim() !== '' && snapshotStatusFor(docStatus) !== 'approved' ? 'de-gov' : 'de-desc'}
                  data-testid="apf-copy-status"
                >
                  {copyStatusLine(docStatus)}
                </div>
              )}

              {dirty && (
                <div className="de-err" role="status">
                  This section has unsaved changes. Placement snapshots the SAVED document, so
                  filing now would omit what is on screen — save first, then place.
                </div>
              )}

              <div className="de-gov">
                <span className="ico">{I.lock}</span>
                <span className="de-gov-t">
                  The server reports placement and audit outcomes for your organization.
                  A frozen or dispatched sequence cannot be changed.
                </span>
              </div>

              {verdict && (
                <div className={verdict.tone === 'err' ? 'de-err' : 'de-gov'} role="status" ref={verdictRef} tabIndex={-1}>
                  {verdict.tone === 'ok' ? <span className="ico">{I.checkCircle}</span> : null}
                  <span className={verdict.tone === 'ok' ? 'de-gov-t' : undefined}>{verdict.text}</span>
                </div>
              )}

              {offerReplace && placement && (
                <>
                  <div className="de-desc" id="apf-replace-effect">
                    Re-placing pins leaf #{placement.leafId} at {placement.sectionCode} in sequence {placement.sequenceLabel} to
                    the approved version&apos;s text. The ledger records the copy as approved, with your reason.
                  </div>
                  <PlacementReasonField
                    value={replaceReason}
                    onChange={setReplaceReason}
                    idPrefix="apf-replace"
                    label="Reason for re-placing"
                    disabled={placing}
                  />
                  <div className="de-field">
                    <button
                      type="button"
                      className="btn primary sm"
                      disabled={!canReplace}
                      aria-describedby="apf-replace-effect"
                      onClick={replaceApproved}
                    >
                      Re-place approved version
                    </button>
                  </div>
                </>
              )}

              {(placement || needsReconciliation) && (
                <div className="de-field">
                  <button
                    className="btn ghost"
                    style={{ height: 30 }}
                    onClick={() => {
                      setOpen(false);
                      /* F10: the Submission Center opens on the sequence this
                         document went into (or was being placed into), in the
                         Builder, where its leaves are. */
                      const subId = placement ? placement.submissionId : target.subId;
                      const seqId = placement ? placement.seqId : seq?.id;
                      stashNavParamsForTarget('submission-center', { submissionId: String(subId ?? ''), sequenceId: String(seqId ?? ''), ws: 'builder' });
                      onNav('submission-center');
                    }}
                  >
                    {I.layers} {placement ? 'Open in Submission Center' : 'Check filing status'}
                  </button>
                </div>
              )}
            </div>

            <div className="de-f">
              <button className="de-btn ghost" onClick={() => setOpen(false)} disabled={placing}>
                {placement ? 'Close' : 'Cancel'}
              </button>
              <button
                className="de-btn primary"
                onClick={place}
                disabled={!canPlace}
                title={
                  dirty
                    ? 'Save the section first — the snapshot is taken from saved content'
                    : !seq
                      ? 'Choose a submission and a non-frozen sequence'
                      : !section.trim()
                        ? 'A section code is required'
                        : !sectionIsPlaceable
                          ? 'The section code must name a CTD section a document can be filed at'
                          : !reasonOk
                            ? PLACEMENT_REASON_REQUIRED
                            : 'Snapshot the saved document and place it as a leaf'
                }
              >
                {I.layers} {placing ? 'Placing…' : 'Place leaf in the sequence'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/** Changing document/project resets the dialog and invalidates its old chain. */
export function AuthoringPlaceIntoFiling(props: AuthoringPlaceIntoFilingProps) {
  const project = shellProgramId(useShellProject());
  return <AuthoringPlaceIntoFilingForDocument key={JSON.stringify([props.docId, project])} {...props} />;
}
