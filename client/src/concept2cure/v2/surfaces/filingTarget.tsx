/**
 * Choosing WHERE to file: the submission and the sequence.
 *
 * Extracted from AuthoringPlaceIntoFiling when a second surface needed it — the
 * Vault, so a governed PDF can be filed into a sequence without being copied
 * into an authoring store first. Two copies of this would be two places to
 * forget the same rule, and the rule has regulatory consequence: a FROZEN or
 * DISPATCHED sequence has immutable leaves, `upsertLeaf` refuses one
 * server-side, and a picker that offered it would be inviting a refusal the
 * person cannot see coming. It is excluded here, WITH the reason said out loud.
 *
 * Data only, plus the two fields that render it. The surrounding dialog — what
 * is being filed, what it costs, what the verdict means — differs per surface
 * and belongs to each.
 *
 * @module client/src/concept2cure/v2/surfaces/filingTarget
 */
import React from 'react';
import { liveGetOrNull } from '../dataConnect';
import { shellProgramId, useShellProject } from '../shellProject';
import { SC_SEQ_STATUS } from '../fixtures/submission';
import { normalizeCtdCode, ctdFolderSlug } from '@shared/regulatory/section-code';
import {
  validateSectionCode,
  vocabularyForApplicationType,
  type PlacementVocabulary,
} from '@shared/regulatory/placement-vocabulary';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';

export { vocabularyForApplicationType };
export type { PlacementVocabulary };

/** How each non-CTD vocabulary is named to the person. */
const VOCABULARY_LABEL: Record<Exclude<PlacementVocabulary, 'ctd'>, string> = {
  estar: 'eSTAR',
  ctis: 'CTIS',
  irb: 'IRB',
  registry: 'trial-registry',
};

/** GET /api/submissions → listSubmissions() rows (only what the picker reads). */
export interface SubmissionRow {
  id: number;
  title: string;
  applicationType: string;
  primaryRegion: string;
  status: string;
  /** submissions.program_id: the project the submission belongs to; null when unanchored. */
  programId?: string | null;
}

/** GET /api/submissions/:id/sequences → listSequences() rows. */
export interface SequenceRow {
  id: number;
  sequenceNumber: string;
  type: string;
  status: string; // draft|assembling|validated|frozen|dispatched
  region: string;
}

/** A frozen or dispatched sequence's leaves are immutable (submission-service
 *  isSequenceLocked) — mirrored here so the picker can say WHY it excludes. */
export const isLocked = (status: string) => status === 'frozen' || status === 'dispatched';

interface SubsState {
  state: 'idle' | 'loading' | 'ready' | 'error';
  rows: SubmissionRow[];
  error?: string;
  /** Submissions of other projects, not offered (PF-11): said, never silently dropped. */
  hiddenOtherProjects?: number;
}
interface SeqsState { state: 'idle' | 'loading' | 'ready' | 'error'; rows: SequenceRow[]; error?: string }

export interface FilingTarget {
  subs: SubsState;
  subId: number | null;
  seqs: SeqsState;
  seqId: number | null;
  /** The chosen sequence row, or null. */
  seq: SequenceRow | null;
  /** Sequences excluded because their leaves are immutable. */
  lockedSeqs: SequenceRow[];
  /** Load the org's submissions and clear any previous choice. */
  load: () => void;
  /** Reset to nothing chosen and nothing loaded. */
  reset: () => void;
  pickSubmission: (id: number | null) => void;
  setSeqId: (id: number | null) => void;
}

/**
 * The submission → sequence choice. Every state is explicit: loading, a failed
 * read WITH its reason, an empty list, or rows. A failed read is never rendered
 * as "no sequences" — the two look identical to the person and only one of them
 * means their work has nowhere to go.
 */
export function useFilingTarget(onChange?: () => void, programId?: string | null): FilingTarget {
  const [subs, setSubs] = React.useState<SubsState>({ state: 'idle', rows: [] });
  const [subId, setSubId] = React.useState<number | null>(null);
  const [seqs, setSeqs] = React.useState<SeqsState>({ state: 'idle', rows: [] });
  const [seqId, setSeqId] = React.useState<number | null>(null);

  const shellProject = useShellProject();
  const project = (programId ?? shellProgramId(shellProject))?.toLowerCase() ?? null;
  const reads = React.useRef({ submissions: 0, sequences: 0, active: false });

  const reset = React.useCallback(() => {
    reads.current.submissions += 1;
    reads.current.sequences += 1;
    reads.current.active = false;
    setSubId(null);
    setSeqId(null);
    setSeqs({ state: 'idle', rows: [] });
    setSubs({ state: 'idle', rows: [] });
  }, []);

  const load = React.useCallback(() => {
    const request = ++reads.current.submissions;
    reads.current.sequences += 1;
    reads.current.active = true;
    setSubId(null);
    setSeqId(null);
    setSeqs({ state: 'idle', rows: [] });
    setSubs({ state: 'loading', rows: [] });
    /* The list is scoped on the server to this project (?programId): the
       server returns only the project's own submissions and says how many it
       left out (meta.notOffered). Only the project's own submissions are offered
       (PF-11; founder decision 2026-09-26): an unanchored submission belongs to
       no project and is not offered for one, because a document is placed only
       into its own project's submissions. The same rule is applied to the rows
       here, so a list that was not scoped is still never offered wrongly. */
    const path = project ? `/api/submissions?programId=${encodeURIComponent(project)}` : '/api/submissions';
    void liveGetOrNull<SubmissionRow[]>(path).then((r) => {
      if (request !== reads.current.submissions) return;
      if (r.error || !Array.isArray(r.data)) {
        setSubs({ state: 'error', rows: [], error: r.error ?? 'unexpected response shape' });
        return;
      }
      const own = project
        ? r.data.filter((row) => row.programId?.toLowerCase() === project)
        : r.data;
      const leftOut = r.meta?.notOffered;
      const leftOutByServer = typeof leftOut === 'number' ? leftOut : 0;
      setSubs({
        state: 'ready',
        rows: own,
        hiddenOtherProjects: leftOutByServer + (r.data.length - own.length),
      });
    });
  }, [project]);

  // Clear old choices before another project can use them. A currently open
  // picker reloads; an idle picker waits for its dialog's existing load action.
  React.useLayoutEffect(() => {
    const pendingReads = reads.current;
    const active = pendingReads.active;
    reset();
    if (active) load();
    return () => {
      pendingReads.submissions += 1;
      pendingReads.sequences += 1;
    };
  }, [project, reset, load]);

  const pickSubmission = React.useCallback(
    (id: number | null) => {
      const request = ++reads.current.sequences;
      setSubId(id);
      setSeqId(null);
      onChange?.();
      if (id == null) {
        setSeqs({ state: 'idle', rows: [] });
        return;
      }
      setSeqs({ state: 'loading', rows: [] });
      void liveGetOrNull<SequenceRow[]>(`/api/submissions/${id}/sequences`).then((r) => {
        if (request !== reads.current.sequences) return;
        if (r.error || !Array.isArray(r.data)) {
          setSeqs({ state: 'error', rows: [], error: r.error ?? 'unexpected response shape' });
          return;
        }
        setSeqs({ state: 'ready', rows: r.data });
        // Pre-select a sequence only when exactly one can take a leaf: then
        // there is no choice to make. With two or more open (an original 0000
        // and a draft amendment 0001), which one a document is filed in is the
        // person's regulatory decision, so nothing is chosen until they choose
        // (P-21, product decision 2026-10-08). It used to take the FIRST open
        // one. A locked sequence is never pre-selected — that would stage a
        // refusal.
        const open = r.data.filter((s) => !isLocked(s.status));
        setSeqId(open.length === 1 ? open[0].id : null);
      });
    },
    [onChange],
  );

  const lockedSeqs = seqs.rows.filter((s) => isLocked(s.status));
  const seq = seqs.rows.find((s) => s.id === seqId) ?? null;

  return { subs, subId, seqs, seqId, seq, lockedSeqs, load, reset, pickSubmission, setSeqId };
}

/** "1 submission is not offered", plural-aware. Covers another project's submission and an unanchored one alike. */
function otherProjectsPhrase(n: number): string {
  return n === 1
    ? '1 submission belongs to another project or to no project and is not offered'
    : `${n} submissions belong to other projects or to no project and are not offered`;
}

export interface FilingTargetFieldsProps {
  target: FilingTarget;
  /** Prefix for the field ids, so two dialogs can coexist in one document. */
  idPrefix: string;
}

/** The submission choice, with every state said, and what is not offered counted (PF-11). */
function SubmissionChoice({ target, idPrefix }: FilingTargetFieldsProps) {
  const { subs, subId, pickSubmission } = target;
  return (
    <div className="de-field">
      <label className="de-label" htmlFor={`${idPrefix}-sub`}>Target submission</label>
      {subs.state === 'loading' ? (
        <div role="status" className="de-desc">Loading this organization’s submissions…</div>
      ) : subs.state === 'error' ? (
        <div className="de-err" role="status">
          Couldn’t load the submissions — {subs.error}. There is no target to place into.
        </div>
      ) : subs.rows.length === 0 ? (
        <div className="de-desc">
          {subs.hiddenOtherProjects
            ? `No submissions of this project yet. ${otherProjectsPhrase(subs.hiddenOtherProjects)} — create one for this project in the Submission Center first.`
            : 'No submissions in this organization yet — create one in the Submission Center first.'}
        </div>
      ) : (
        <select
          id={`${idPrefix}-sub`}
          className="c2c-input"
          value={subId ?? ''}
          onChange={(e) => pickSubmission(e.target.value === '' ? null : Number(e.target.value))}
        >
          <option value="">Choose a submission…</option>
          {subs.rows.map((s) => (
            <option key={s.id} value={s.id}>
              {s.title} · {s.applicationType.toUpperCase()} · {s.primaryRegion.toUpperCase()}
            </option>
          ))}
        </select>
      )}
      {subs.state === 'ready' && subs.rows.length > 0 && !!subs.hiddenOtherProjects && (
        <div className="de-desc" data-testid={`${idPrefix}-hidden-other-projects`}>
          {otherProjectsPhrase(subs.hiddenOtherProjects)}: a document is placed only into its own project’s submissions.
        </div>
      )}
    </div>
  );
}

/**
 * The two selects, with every state said rather than implied.
 *
 * The strings are the ones the authoring dialog already shipped, carried over
 * VERBATIM. They were written and reviewed for this decision, and a refactor
 * that quietly reworded them would be changing what a regulatory user reads
 * under cover of moving code — which is how reviewed copy degrades.
 */
export function FilingTargetFields({ target, idPrefix }: FilingTargetFieldsProps) {
  const { subId, seqs, seqId, lockedSeqs, setSeqId } = target;
  return (
    <>
      <SubmissionChoice target={target} idPrefix={idPrefix} />

      {subId != null && (
        <div className="de-field">
          <label className="de-label" htmlFor={`${idPrefix}-seq`}>Sequence</label>
          {seqs.state === 'loading' ? (
            <div role="status" className="de-desc">Loading the submission’s sequences…</div>
          ) : seqs.state === 'error' ? (
            <div className="de-err" role="status">
              Couldn’t load the sequences — {seqs.error}. There is no sequence to place into.
            </div>
          ) : seqs.rows.length === 0 ? (
            <div className="de-desc">
              This submission has no eCTD sequences yet — create sequence 0000 in the
              Submission Center first.
            </div>
          ) : (
            <>
              <select
                id={`${idPrefix}-seq`}
                className="c2c-input"
                value={seqId ?? ''}
                onChange={(e) => setSeqId(e.target.value === '' ? null : Number(e.target.value))}
              >
                <option value="">Choose a sequence…</option>
                {seqs.rows.map((s) => (
                  <option key={s.id} value={s.id} disabled={isLocked(s.status)}>
                    {s.sequenceNumber} · {s.type} · {SC_SEQ_STATUS[s.status]?.l ?? s.status}
                    {isLocked(s.status) ? ' — leaves immutable' : ''}
                  </option>
                ))}
              </select>
              {lockedSeqs.length > 0 && (
                <div className="de-desc">
                  {lockedSeqs.map((s) => s.sequenceNumber).join(', ')}{' '}
                  {lockedSeqs.length === 1 ? 'is' : 'are'}{' '}
                  {lockedSeqs.map((s) => SC_SEQ_STATUS[s.status]?.l.toLowerCase() ?? s.status).join(' / ')} —
                  a frozen or dispatched sequence’s leaves are immutable, so it cannot be
                  placed into.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}


/* ── What a typed section code resolves to ──────────────────────────────────
 *
 * The SAME rule the write boundary and the packager apply
 * (shared/regulatory/section-code). Shared because both filing dialogs need it
 * and a second copy got it WRONG the first time it was written: "canonical and
 * a folder" looks equivalent but admits a bare module, because a module does
 * resolve to a folder. The real test is that the code has a dot — a module is a
 * container, not a section a document can be filed at.
 *
 * The section code decides which module folder the document is filed into, and
 * this input was free text with no feedback: an unusable value was only
 * discovered after a filing snapshot had already been created for it, and
 * before the write boundary was closed it produced a package with a top-level
 * folder no eCTD layout defines.
 */
export interface SectionCodeJudgement {
  canonical: string | null;
  folder: string | null;
  /** A document can be filed at this code. */
  placeable: boolean;
  /** What to tell the person, or null while the field is empty. */
  note: { tone: 'ok' | 'err'; text: string } | null;
}

export function judgeSectionCode(section: string, vocabulary: PlacementVocabulary = 'ctd'): SectionCodeJudgement {
  /* A submission's section codes come from its OWN vocabulary — the server has
     judged placements that way since d0da50de (shared/regulatory/
     placement-vocabulary.ts): an IRB package files on artifact slots, a 510(k)
     on eSTAR sections. Applying the CTD rule to every submission refused every
     valid IRB and eSTAR placement, and ACCEPTED a CTD code for an IRB package
     that the server then refused. Non-CTD vocabularies are judged by the same
     shared function the write boundary calls, and its message is shown as
     written. The CTD branch below is unchanged, so a caller that passes no
     vocabulary behaves exactly as before. */
  if (vocabulary !== 'ctd') {
    const trimmed = section.trim();
    const verdict = validateSectionCode(section, vocabulary);
    const label = VOCABULARY_LABEL[vocabulary];
    return {
      canonical: verdict.ok ? (verdict.canonical ?? trimmed) : null,
      folder: null,
      placeable: verdict.ok,
      note:
        trimmed === ''
          ? null
          : verdict.ok
            ? { tone: 'ok', text: `Files at ${verdict.canonical ?? trimmed} in this ${label} submission.` }
            : { tone: 'err', text: `This is an ${label} submission. ${verdict.message ?? ''}`.trim() },
    };
  }
  const canonical = normalizeCtdCode(section);
  const folder = ctdFolderSlug(section);
  const placeable = canonical !== null && canonical.includes('.');
  const note: SectionCodeJudgement['note'] =
    section.trim() === ''
      ? null
      : !placeable
        ? {
            tone: 'err',
            text:
              canonical === null
                ? `"${section.trim()}" is not a CTD section code. Use one like 1.2, 2.7.3 or 3.2.S.4.2.`
                : `Module ${canonical} on its own is a container, not a section a document can be filed at.`,
          }
        : {
            tone: 'ok',
            text:
              canonical!.charAt(0) === '1'
                ? `Files as ${canonical} in the regional Module 1 folder (${folder}/).`
                : `Files as ${canonical} at m${canonical!.charAt(0)}/${folder}/.`,
          };
  return { canonical, folder, placeable, note };
}

/* ── Why the placement is made ─────────────────────────────────────────────
   A placement decides what content goes into a regulator-facing sequence. Its
   audit row recorded what changed and never why: none of the three placement
   forms asked (PX-1, docs/evidence/reviews/2026-09-24/lenses.md). The server
   now refuses a placement without a reason (PUT …/leaves → REASON_REQUIRED) at
   the one floor both sides import; these say so before the click. */

/** True when `reason` meets the floor the placement route enforces. */
export function placementReasonOk(reason: string): boolean {
  return reason.trim().length >= GOVERNED_REASON_MIN;
}

/** The disabled-button title for a placement still missing its reason. */
export const PLACEMENT_REASON_REQUIRED = `A reason for this placement of at least ${GOVERNED_REASON_MIN} characters is required`;

const REASON_KIT = {
  dialog: { field: 'de-field', label: 'de-label', input: 'c2c-input', note: 'de-desc' },
  inline: { field: 'sc-field', label: undefined, input: 'sc-subpick', note: 'scaf-note' },
} as const;

export function PlacementReasonField({
  value,
  onChange,
  idPrefix,
  disabled,
  variant = 'dialog',
  label = 'Reason for this placement',
}: {
  value: string;
  onChange: (value: string) => void;
  /** Prefix for the field id, so two forms can coexist in one document. */
  idPrefix: string;
  disabled?: boolean;
  /** The field's name, when the act is not a first placement (a re-place). */
  label?: string;
  /** `dialog` for the de- dialog kit, `inline` for the Submission Center form. */
  variant?: keyof typeof REASON_KIT;
}) {
  const kit = REASON_KIT[variant];
  const id = `${idPrefix}-reason`;
  const short = value.trim().length > 0 && !placementReasonOk(value);
  /* 2026-09-28 (A-0928-1): the field was required only visually. The textarea
     carried no required state, the "*" was read into its name ("Reason for this
     placement star"), and the note named the floor only after a too-short
     value was typed. Now `aria-required` carries it, the marker is decorative
     (as C2CForm does), and the note states the requirement up front. */
  return (
    <div className={kit.field}>
      <label className={kit.label} htmlFor={id}>
        {label}<span className="req" aria-hidden="true">*</span>
      </label>
      <textarea
        id={id}
        className={kit.input}
        rows={2}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. Final clinical overview, approved for this sequence"
        aria-required="true"
        aria-describedby={`${id}-note`}
        aria-invalid={short || undefined}
      />
      <div id={`${id}-note`} className={kit.note}>
        {short
          ? `At least ${GOVERNED_REASON_MIN} characters.`
          : `Required, at least ${GOVERNED_REASON_MIN} characters. Recorded with the placement in the audit trail.`}
      </div>
    </div>
  );
}



/** Confirmation returned by the existing canonical leaf write, shared by both filing dialogs. */
export interface FilingLeafReceipt {
  id: number;
  sequenceId: number;
  sectionCode: string;
  lifecycleOp: string;
  documentTable: string;
  documentId?: number | null;
  documentUuid?: string | null;
  /** null when nothing was written (see `unchanged`): there is no audit row to report. */
  auditTrail?: { persisted?: boolean; chained?: boolean } | null;
  /** The document was already placed at this section; the existing leaf came back and nothing was written. */
  unchanged?: true;
}

export function validReceiptId(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
}

type ExpectedLeaf = { sequenceId: number; sectionCode: string; lifecycleOp: string } & (
  | { documentTable: 'coauthor_documents'; documentId: number }
  | { documentTable: 'vault_documents'; documentUuid: string }
);

/** A nonempty body is not confirmation that the requested document was filed. */
export function matchingLeafReceipt(value: unknown, expected: ExpectedLeaf): value is FilingLeafReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const row = value as FilingLeafReceipt;
  if (!validReceiptId(row.id) || row.sequenceId !== expected.sequenceId ||
      row.sectionCode !== expected.sectionCode || row.lifecycleOp !== expected.lifecycleOp ||
      row.documentTable !== expected.documentTable) return false;
  return expected.documentTable === 'vault_documents'
    ? row.documentUuid === expected.documentUuid
    : row.documentId === expected.documentId;
}

/** Placement can stand while its audit write or retrievable history is incomplete. */
export function placementAuditWarning(row: FilingLeafReceipt): string {
  if (row.auditTrail?.persisted !== true) return ' The placement audit entry was not confirmed. Check the audit history and follow up before treating this as a complete governed filing.';
  if (row.auditTrail.chained !== true) return ' The placement audit entry is not confirmed in retrievable history. Follow up before treating this as a complete governed filing.';
  return '';
}
