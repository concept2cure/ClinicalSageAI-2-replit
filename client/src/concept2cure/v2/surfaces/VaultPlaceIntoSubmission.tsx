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
 *     placement, and success reports the leaf the server actually wrote;
 *   • this version's review stage and the server's own verdict on transmitting
 *     it (VR-14, `transmitRefusal` on GET …/versions) are SHOWN, never
 *     re-judged here: there is no list of stages in this file, and a read that
 *     failed says so rather than reading as approved. Placement is not refused
 *     on them — the server refuses to freeze, dispatch or transmit a sequence
 *     whose leaf names a version that is not approved and current, so the
 *     dialog says that before the click and again in the success verdict;
 *   • the section code is pre-filled only from a CONFIRMED filing (a suggestion
 *     is the classifier's guess), and a pre-filled code is judged exactly as a
 *     typed one.
 */
import React from 'react';
import { I } from '../icons';
import { mutateVerbatim } from './SubmissionSeqWorkspaces';
import { SC_LIFECYCLE_OPS } from '../fixtures/submission';
import { useLiveData } from '../dataConnect';
import { versionsPath, isVersionsShape, type VersionsShape } from './VaultVersions';
import { stageLabel } from './VaultLifecycle';
import {
  useFilingTarget,
  FilingTargetFields,
  judgeSectionCode,
  vocabularyForApplicationType,
  PlacementReasonField,
  placementReasonOk,
  PLACEMENT_REASON_REQUIRED,
} from './filingTarget';

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
  /**
   * vault.documents.mime_type, verified against the file's magic bytes at
   * ingest. Only a PDF can be filed: the packager's vault branch refuses a leaf
   * whose bytes do not begin with %PDF- (leaf-source-resolver.ts). Undefined
   * means the caller did not say, and the dialog behaves as it did.
   */
  mimeType?: string | null;
  /** regulatory_programs.id the document is in; with it the dialog reads this version's stage and the server's transmit verdict. */
  projectId?: string | null;
  /** The document's filing; the section is pre-filled only from a confirmed one. */
  filing?: { ctdSection: string | null; placementStatus: string } | null;
}

const PDF = 'application/pdf';

/** An example section code in each vocabulary, for the input's placeholder. */
const SECTION_PLACEHOLDER: Partial<Record<string, string>> = {
  ctd: 'e.g. 3.2.P.8.3',
  irb: 'e.g. irb.consent',
  estar: 'e.g. estar.device-description',
};

type Verdict = { kind: 'error' | 'ok'; message: string } | null;

type Judged = ReturnType<typeof judgeSectionCode>;

/** Why the file button is disabled, in the words of what is missing. */
function placeBlockedReason(
  hasSequence: boolean,
  sectionUsable: boolean,
  vocabulary: string,
  reasonOk: boolean,
): string | undefined {
  if (!hasSequence) return 'Choose a submission and a sequence that can take a leaf';
  if (!sectionUsable) {
    return vocabulary === 'ctd'
      ? 'A CTD section code is required'
      : "A section code in this submission's vocabulary is required";
  }
  return reasonOk ? undefined : PLACEMENT_REASON_REQUIRED;
}

/* Offering to file a non-PDF promised an assembly that cannot happen: the
   success message said "the vault copy is what will be assembled", and the
   packager would then refuse the leaf. */
function NotPdfNotice({ mimeType }: { mimeType: string | null | undefined }) {
  return (
    <div className="de-err" role="status">
      Only a PDF can be filed into a submission. This file is {mimeType || 'of an unrecorded type'}, and the
      packager refuses any leaf that is not a PDF, so it could never be assembled. Nothing will be written.
    </div>
  );
}

/** This version's review stage and the server's transmit verdict, as far as they were read. */
type StageRead =
  | { kind: 'none' }
  | { kind: 'unread' }
  | { kind: 'loading' }
  | { kind: 'unknown' }
  | { kind: 'read'; stage: string | null | undefined; refusal: string | null };

/* The verdict is the server's (vaultVersionNotTransmittable), read from the
   versions list the detail pane reads too. A failed read, a list without this
   version, or a version the server gave no verdict for are all 'unknown' —
   never 'approved'. A file that can never be filed is not read at all. */
function useVersionStage(projectId: string | null | undefined, documentUuid: string, filable: boolean): StageRead {
  const path = projectId && filable ? versionsPath(projectId, documentUuid) : null;
  const st = useLiveData<VersionsShape>(path, [path], isVersionsShape);
  if (!filable) return { kind: 'none' };
  if (!path) return { kind: 'unread' };
  if (st.loading) return { kind: 'loading' };
  const v = st.error ? undefined : st.data?.versions.find((x) => x.id === documentUuid);
  if (!v || v.transmitRefusal === undefined) return { kind: 'unknown' };
  return { kind: 'read', stage: v.lifecycle?.stage, refusal: v.transmitRefusal };
}

const TRANSMIT_RULE = 'Only an approved, current version is transmitted.';

/** The server's reason this leaf would not be transmitted, or null. A Delete leaf ships no content. */
function refusalFor(read: StageRead, op: string): string | null {
  return read.kind === 'read' && op !== 'delete' ? read.refusal : null;
}

/** The success verdict: the leaf the server wrote, and — when the server would refuse it — that it will not be transmitted. */
function placedMessage(sectionCode: string, sequenceNumber: string, refusal: string | null): string {
  return (
    `Filed as leaf ${sectionCode} in sequence ${sequenceNumber}. ` +
    'The vault copy is what will be assembled — nothing was duplicated.' +
    (refusal ? ` It will not be transmitted until this leaf names an approved, current version (${refusal}).` : '')
  );
}

/* Only a person's confirmed filing pre-fills the code: a suggestion is the
   classifier's guess. The code is then judged exactly as a typed one, so a
   container still keeps Place disabled. */
function confirmedSectionOf(filing: VaultPlaceIntoSubmissionProps['filing']): string | null {
  return filing?.placementStatus === 'confirmed' ? filing.ctdSection?.trim() || null : null;
}

function StageNotice({ read, op }: { read: StageRead; op: string }) {
  if (read.kind === 'none') return null;
  let body: React.ReactNode;
  if (read.kind === 'unread') {
    body = <div className="de-desc">{`This version's review stage is not shown here. ${TRANSMIT_RULE}`}</div>;
  } else if (read.kind === 'loading') {
    body = <div className="de-desc">{"Reading this version's review stage…"}</div>;
  } else if (read.kind === 'unknown') {
    body = (
      <div className="de-err" role="status">
        {`This version's review stage could not be read, so whether it would be transmitted is not shown. ${TRANSMIT_RULE}`}
      </div>
    );
  } else if (op === 'delete') {
    body = <div className="de-desc">{"A Delete leaf ships no content, so this version's approval is not checked for it."}</div>;
  } else if (read.refusal === null) {
    body = <div className="de-desc">{`Review and approval: ${stageLabel(read.stage)}. This is the approved, current version.`}</div>;
  } else {
    body = (
      <>
        <div className="de-desc">{`Review and approval: ${stageLabel(read.stage)}.`}</div>
        <div className="de-err" role="status">
          {`This version would not be transmitted: ${read.refusal}. It can be placed now, but the sequence will not be ` +
            'frozen, dispatched or transmitted until this leaf names an approved, current version.'}
        </div>
      </>
    );
  }
  return <div data-testid="vault-place-stage">{body}</div>;
}

function SectionFields({
  section,
  onSection,
  vocabulary,
  judged,
  op,
  onOp,
  confirmedSection,
  filing,
}: {
  section: string;
  onSection: (value: string) => void;
  vocabulary: string;
  judged: Judged;
  op: string;
  onOp: (value: string) => void;
  confirmedSection: string | null;
  filing: VaultPlaceIntoSubmissionProps['filing'];
}) {
  const note = judged.note;
  const isErr = note?.tone === 'err';
  return (
    <>
      <div className="de-field half">
        <label className="de-label" htmlFor="vpf-section">
          Section code<span className="req">*</span>
        </label>
        <input
          id="vpf-section"
          className="c2c-input"
          value={section}
          onChange={(e) => onSection(e.target.value)}
          placeholder={SECTION_PLACEHOLDER[vocabulary] ?? 'e.g. 3.2.P.8.3'}
        />
        {confirmedSection && section === confirmedSection && (
          <div className="de-desc">{"Pre-filled from this document's confirmed filing."}</div>
        )}
        {filing?.placementStatus === 'suggested' && filing.ctdSection && (
          <div className="de-desc">
            {`The filing suggests ${filing.ctdSection}. It is not confirmed, so the section is left for you to enter.`}
          </div>
        )}
        {note && (
          <div className={isErr ? 'de-err' : 'de-desc'} role="status">
            {note.text}
            {isErr ? ' Nothing will be written.' : ''}
          </div>
        )}
      </div>

      <div className="de-field half">
        <label className="de-label" htmlFor="vpf-op">Lifecycle operation</label>
        <select
          id="vpf-op"
          className="c2c-input"
          value={op}
          onChange={(e) => onOp(e.target.value)}
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
          the hash held for it before assembling. {TRANSMIT_RULE}
        </span>
      </div>
    </>
  );
}

function VerdictLine({ verdict }: { verdict: NonNullable<Verdict> }) {
  if (verdict.kind === 'error') {
    return <div className="de-err" role="status"><span>{verdict.message}</span></div>;
  }
  return (
    <div className="de-gov" role="status">
      <span className="ico">{I.checkCircle}</span>
      <span className="de-gov-t">{verdict.message}</span>
    </div>
  );
}

export function VaultPlaceIntoSubmission({
  documentUuid,
  documentTitle,
  onClose,
  onPlaced,
  mimeType,
  projectId,
  filing,
}: VaultPlaceIntoSubmissionProps) {
  // Refused here, before anything loads (see NotPdfNotice).
  const notPdf = mimeType !== undefined && mimeType !== PDF;
  const [verdict, setVerdict] = React.useState<Verdict>(null);
  const target = useFilingTarget(() => setVerdict(null), projectId);
  const { seq } = target;
  const stage = useVersionStage(projectId, documentUuid, !notPdf);

  const confirmedSection = confirmedSectionOf(filing);
  const [section, setSection] = React.useState(confirmedSection ?? '');
  const [op, setOp] = React.useState('new');
  const [reason, setReason] = React.useState('');
  const [placing, setPlacing] = React.useState(false);
  const [placed, setPlaced] = React.useState<PlacedLeaf | null>(null);

  /* Dialog behaviour the surrounding pattern does not carry. `aria-modal` is a
     claim that everything outside is inert; making it without trapping focus
     tells a screen-reader user that content is unavailable while their focus
     can still walk into it, which is worse than not claiming it at all. So the
     claim is backed here: focus moves in on open, is held, and is returned to
     whatever opened the dialog on close. Escape closes, as a dialog must. */
  const dialogRef = React.useRef<HTMLDivElement | null>(null);
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
    if (notPdf) return;
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
  const submission = target.subs.rows.find((r) => r.id === target.subId) ?? null;
  const vocabulary = vocabularyForApplicationType(submission?.applicationType);
  const judged = judgeSectionCode(section, vocabulary);
  const sectionUsable = judged.placeable;

  const reasonOk = placementReasonOk(reason);
  const canPlace = Boolean(!notPdf && seq && sectionUsable && reasonOk && !placing && !placed);

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
        reason: reason.trim(),
      });
      if (put.error || !put.data) {
        setVerdict({ kind: 'error', message: put.error ?? 'The server refused the placement without a reason.' });
        return;
      }
      setPlaced(put.data);
      setVerdict({ kind: 'ok', message: placedMessage(put.data.sectionCode, seq.sequenceNumber, refusalFor(stage, op)) });
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
          {/* One wrapper, as the line it replaces was one div: the half-width
              fields' margins are set by :nth-of-type among .de-body's divs. */}
          <div style={{ marginBottom: 12 }}>
            <div className="de-desc">
              Filing <b>{documentTitle}</b>.
            </div>
            <StageNotice read={stage} op={op} />
          </div>

          {notPdf ? (
            <NotPdfNotice mimeType={mimeType} />
          ) : (
            <>
              <FilingTargetFields target={target} idPrefix="vpf" />
              <SectionFields
                section={section}
                onSection={(value) => { setSection(value); setVerdict(null); }}
                vocabulary={vocabulary}
                judged={judged}
                op={op}
                onOp={setOp}
                confirmedSection={confirmedSection}
                filing={filing}
              />
              <PlacementReasonField value={reason} onChange={setReason} idPrefix="vpf" disabled={placing || Boolean(placed)} />
            </>
          )}

          {verdict && <VerdictLine verdict={verdict} />}
        </div>

        <div className="de-f">
          <button className="de-btn ghost" onClick={onClose} disabled={placing}>
            {placed ? 'Close' : 'Cancel'}
          </button>
          <button
            className="de-btn primary"
            onClick={() => void place()}
            disabled={!canPlace}
            title={placeBlockedReason(Boolean(seq), sectionUsable, vocabulary, reasonOk)}
          >
            {placing ? 'Filing…' : 'Place into submission'}
          </button>
        </div>
      </div>
    </div>
  );
}
