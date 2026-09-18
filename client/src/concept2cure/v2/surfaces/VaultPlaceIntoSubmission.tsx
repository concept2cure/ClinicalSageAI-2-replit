/**
 * VaultPlaceIntoSubmission — file a governed vault document into a sequence.
 *
 * ── Why this is SHORTER than the authoring dialog beside it ──────────────────
 * AuthoringPlaceIntoFiling has to SNAPSHOT: an authored document lives as
 * sections in a uuid store the assembler has no branch for, so filing one means
 * copying its content into `coauthor_documents` first and stating that the
 * filed artifact is a derivation.
 *
 * A vault document needs none of that. It is already a single governed PDF in
 * the store of record, and as of 2026-09-17 a leaf can name it directly —
 * `submission_leaves.document_uuid` beside the integer `document_id`, and a
 * `vault_documents` branch in the resolver that fetches the bytes through the
 * storage provider. So THE VAULT COPY IS WHAT IS FILED. No snapshot, no
 * derivation, nothing to explain away: the bytes assembled into the package are
 * byte-for-byte the ones in the vault, and the resolver re-checks them against
 * the recorded content hash before staging.
 *
 * ── Fail closed ──────────────────────────────────────────────────────────────
 *   • the target pickers are the SHARED ones (./filingTarget), so a frozen or
 *     dispatched sequence is excluded here for the same reason and with the
 *     same words as in authoring;
 *   • the section code is validated by the SAME rule as the write boundary and
 *     the packager (shared/regulatory/section-code) — a bare module is a
 *     container, not a section a document can be filed at, and it is refused
 *     BEFORE anything is written;
 *   • the server's verdict is surfaced verbatim; a refusal never reads as a
 *     placement, and success reports the leaf the server actually wrote.
 */
import React from 'react';
import { I } from '../icons';
import { mutateVerbatim } from './SubmissionSeqWorkspaces';
import { SC_LIFECYCLE_OPS } from '../fixtures/submission';
import { useFilingTarget, FilingTargetFields, judgeSectionCode } from './filingTarget';

/** PUT /sequences/:seqId/leaves → upsertLeaf() row (subset). */
interface PlacedLeaf {
  id: number;
  sectionCode: string;
  title: string;
  lifecycleOp: string;
}

export interface VaultPlaceIntoSubmissionProps {
  /** vault.documents.id — a uuid. This is what the leaf will name. */
  documentUuid: string;
  /** What to title the leaf. Prefilled from the document. */
  documentTitle: string;
  /** Closes the dialog. */
  onClose: () => void;
  /** Re-read the surface after a successful placement. */
  onPlaced?: () => void;
}

type Verdict = { kind: 'error' | 'ok'; message: string } | null;

export function VaultPlaceIntoSubmission({
  documentUuid,
  documentTitle,
  onClose,
  onPlaced,
}: VaultPlaceIntoSubmissionProps) {
  const [verdict, setVerdict] = React.useState<Verdict>(null);
  const target = useFilingTarget(() => setVerdict(null));
  const { seq } = target;

  const [section, setSection] = React.useState('');
  const [op, setOp] = React.useState('new');
  const [placing, setPlacing] = React.useState(false);
  const [placed, setPlaced] = React.useState<PlacedLeaf | null>(null);

  /* Dialog behaviour the surrounding pattern does not carry. `aria-modal` is a
     claim that everything outside is inert; making it without trapping focus
     tells a screen-reader user that content is unavailable while their focus
     can still walk into it, which is worse than not claiming it at all. So the
     claim is backed here: focus moves in on open, is held, and is returned to
     whatever opened the dialog on close. Escape closes, as a dialog must. */
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
  const firstFieldRef = React.useRef<HTMLSelectElement | HTMLInputElement | null>(null);
  const openerRef = React.useRef<Element | null>(null);

  React.useEffect(() => {
    openerRef.current = document.activeElement;
    // Focus the dialog itself rather than a control: the heading and the
    // sentence explaining what filing does are read before the first field,
    // which is the part a person needs to hear before choosing anything.
    dialogRef.current?.focus();
    return () => {
      const opener = openerRef.current as HTMLElement | null;
      if (opener && typeof opener.focus === 'function') opener.focus();
    };
  }, []);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape' && !placing) {
      e.stopPropagation();
      onClose();
      return;
    }
    if (e.key !== 'Tab') return;
    const root = dialogRef.current;
    if (!root) return;
    const focusable = Array.from(
      root.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href]',
      ),
    ).filter((el) => el.offsetParent !== null || el === document.activeElement);
    if (focusable.length === 0) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  React.useEffect(() => {
    target.load();
    // Loading the org's submissions is a mount-time read; `target` is stable
    // per render but re-running this on every one would re-fetch in a loop.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* What the typed code resolves to, by the SAME rule the write boundary and
     the packager apply — and the same one the authoring dialog applies, from
     one shared implementation. Shown BEFORE the write, so the person sees where
     their document is going rather than finding out at assembly.

     Worth stating why this is shared rather than re-derived: written separately
     here it read "resolves to a canonical code AND a folder", which looks
     equivalent and is not — a bare module resolves to a folder too, so that
     version happily filed a document at a container. */
  const judged = judgeSectionCode(section);
  const sectionUsable = judged.placeable;

  const canPlace = Boolean(seq && sectionUsable && !placing && !placed);

  const place = async () => {
    if (!seq || !sectionUsable) return;
    setPlacing(true);
    setVerdict(null);
    try {
      const put = await mutateVerbatim<PlacedLeaf>('PUT', `/api/submissions/sequences/${seq.id}/leaves`, {
        sectionCode: judged.canonical,
        title: documentTitle,
        lifecycleOp: op,
        // The vault document is named DIRECTLY. No snapshot, no copy — the
        // filed bytes are the vault's own.
        documentTable: 'vault_documents',
        documentUuid,
      });
      if (put.error || !put.data) {
        setVerdict({ kind: 'error', message: put.error ?? 'The server refused the placement without a reason.' });
        return;
      }
      setPlaced(put.data);
      setVerdict({
        kind: 'ok',
        message:
          `Filed as leaf ${put.data.sectionCode} in sequence ${seq.sequenceNumber}. ` +
          'The vault copy is what will be assembled — nothing was duplicated.',
      });
      onPlaced?.();
    } finally {
      setPlacing(false);
    }
  };

  return (
    <div
      className="de-bd"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !placing) onClose();
      }}
    >
      <div
        className="de"
        role="dialog"
        aria-modal="true"
        aria-labelledby="vpf-title"
        ref={dialogRef}
        tabIndex={-1}
        onKeyDown={onKeyDown}
      >
        <div className="de-h">
          <div>
            <div className="de-h-eye">Vault → filing</div>
            <div className="de-h-t" id="vpf-title">Place into submission</div>
            <div className="de-h-s">
              The vault copy is filed as itself — the leaf points at this document, so what is
              assembled is what is stored here. Nothing is copied.
            </div>
          </div>
          <button className="de-x" onClick={onClose} aria-label="Close" disabled={placing}>
            {I.close}
          </button>
        </div>

        <div className="de-body">
          <div className="de-desc" style={{ marginBottom: 12 }}>
            Filing <b>{documentTitle}</b>.
          </div>

          <FilingTargetFields target={target} idPrefix="vpf" />

          <div className="de-field half">
            <label className="de-label" htmlFor="vpf-section">
              Section code<span className="req">*</span>
            </label>
            <input
              id="vpf-section"
              className="c2c-input"
              value={section}
              onChange={(e) => { setSection(e.target.value); setVerdict(null); }}
              placeholder="e.g. 3.2.P.8.3"
            />
            {judged.note && (
              <div
                className={judged.note.tone === 'err' ? 'de-err' : 'de-desc'}
                role="status"
              >
                {judged.note.text}
                {judged.note.tone === 'err' ? ' Nothing will be written.' : ''}
              </div>
            )}
          </div>

          <div className="de-field half">
            <label className="de-label" htmlFor="vpf-op">Lifecycle operation</label>
            <select
              id="vpf-op"
              className="c2c-input"
              value={op}
              onChange={(e) => setOp(e.target.value)}
            >
              {Object.entries(SC_LIFECYCLE_OPS).map(([v, m]) => (
                <option key={v} value={v}>{m.l}</option>
              ))}
            </select>
          </div>

          <div className="de-gov">
            <span className="ico">{I.lock}</span>
            <span className="de-gov-t">
              Placement is recorded in the submission of record — audited and org-scoped. The
              server refuses a frozen or dispatched sequence, and re-checks the document against
              the hash held for it before assembling.
            </span>
          </div>

          {verdict && (
            <div className={verdict.kind === 'error' ? 'de-err' : 'de-gov'} role="status">
              {verdict.kind === 'ok' ? <span className="ico">{I.checkCircle}</span> : null}
              <span className={verdict.kind === 'ok' ? 'de-gov-t' : undefined}>{verdict.message}</span>
            </div>
          )}
        </div>

        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose} disabled={placing}>
            {placed ? 'Close' : 'Cancel'}
          </button>
          <button
            className="de-btn primary"
            onClick={() => void place()}
            disabled={!canPlace}
            title={
              !seq
                ? 'Choose a submission and a sequence that can take a leaf'
                : !sectionUsable
                  ? 'A CTD section code is required'
                  : undefined
            }
          >
            {placing ? 'Filing…' : 'Place into submission'}
          </button>
        </div>
      </div>
    </div>
  );
}
