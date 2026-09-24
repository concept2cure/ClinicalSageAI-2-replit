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
import { SC_SEQ_STATUS } from '../fixtures/submission';
import { normalizeCtdCode, ctdFolderSlug } from '@shared/regulatory/section-code';
import {
  validateSectionCode,
  vocabularyForApplicationType,
  type PlacementVocabulary,
} from '@shared/regulatory/placement-vocabulary';

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

interface SubsState { state: 'idle' | 'loading' | 'ready' | 'error'; rows: SubmissionRow[]; error?: string }
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
export function useFilingTarget(onChange?: () => void): FilingTarget {
  const [subs, setSubs] = React.useState<SubsState>({ state: 'idle', rows: [] });
  const [subId, setSubId] = React.useState<number | null>(null);
  const [seqs, setSeqs] = React.useState<SeqsState>({ state: 'idle', rows: [] });
  const [seqId, setSeqId] = React.useState<number | null>(null);

  const reset = React.useCallback(() => {
    setSubId(null);
    setSeqId(null);
    setSeqs({ state: 'idle', rows: [] });
    setSubs({ state: 'idle', rows: [] });
  }, []);

  const load = React.useCallback(() => {
    setSubId(null);
    setSeqId(null);
    setSeqs({ state: 'idle', rows: [] });
    setSubs({ state: 'loading', rows: [] });
    void liveGetOrNull<SubmissionRow[]>('/api/submissions').then((r) => {
      if (r.error || !Array.isArray(r.data)) {
        setSubs({ state: 'error', rows: [], error: r.error ?? 'unexpected response shape' });
        return;
      }
      setSubs({ state: 'ready', rows: r.data });
    });
  }, []);

  const pickSubmission = React.useCallback(
    (id: number | null) => {
      setSubId(id);
      setSeqId(null);
      onChange?.();
      if (id == null) {
        setSeqs({ state: 'idle', rows: [] });
        return;
      }
      setSeqs({ state: 'loading', rows: [] });
      void liveGetOrNull<SequenceRow[]>(`/api/submissions/${id}/sequences`).then((r) => {
        if (r.error || !Array.isArray(r.data)) {
          setSeqs({ state: 'error', rows: [], error: r.error ?? 'unexpected response shape' });
          return;
        }
        setSeqs({ state: 'ready', rows: r.data });
        // Preselect the first sequence that can actually take a leaf, never a
        // locked one — preselecting a locked sequence would stage a refusal.
        const firstOpen = r.data.find((s) => !isLocked(s.status));
        setSeqId(firstOpen ? firstOpen.id : null);
      });
    },
    [onChange],
  );

  const lockedSeqs = seqs.rows.filter((s) => isLocked(s.status));
  const seq = seqs.rows.find((s) => s.id === seqId) ?? null;

  return { subs, subId, seqs, seqId, seq, lockedSeqs, load, reset, pickSubmission, setSeqId };
}

export interface FilingTargetFieldsProps {
  target: FilingTarget;
  /** Prefix for the field ids, so two dialogs can coexist in one document. */
  idPrefix: string;
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
  const { subs, subId, seqs, seqId, lockedSeqs, pickSubmission, setSeqId } = target;
  return (
    <>
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
            No submissions in this organization yet — create one in the Submission Center first.
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
      </div>

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
