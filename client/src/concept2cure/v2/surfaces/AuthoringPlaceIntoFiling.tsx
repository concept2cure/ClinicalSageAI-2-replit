/**
 * AuthoringPlaceIntoFiling — the authoring → filing seam for the document
 * editor. "Place into filing" takes the OPEN authored document and places it
 * into a sequence of the canonical submission core as a real submission_leaves
 * row (PUT /api/submissions/sequences/:seqId/leaves — the same write the
 * Submission Center Builder makes).
 *
 * ── The identity fact this dialog states instead of hiding ───────────────────
 * The editor's store is `authoring_documents` (uuid-keyed; server/routes/
 * authoring.router.ts). The filing core's leaves reference their source
 * document polymorphically as (document_table, document_id) where document_id
 * is an INTEGER (shared/schema/submissions.ts), and the assembler can
 * materialize only the locally-renderable tables — coauthor_documents and
 * unified_documents (server/services/ectd/leaf-source-resolver.ts; anything
 * else fails closed at assembly as an unresolved leaf). A uuid authoring
 * document therefore CANNOT be referenced by a leaf, and nothing links or
 * derives one automatically (its only bridges — concept2cure_artifacts and
 * c2c_documents — are uuid stores too).
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
import { liveGetOrNull } from '../dataConnect';
import { mutateVerbatim } from './SubmissionSeqWorkspaces';
import { SC_LIFECYCLE_OPS, SC_SEQ_STATUS } from '../fixtures/submission';
import type { FireToast } from '../toast';
import { documentSourceLabel } from '@shared/regulatory/canonical-document';

/* ── Server row shapes (only the columns this dialog reads) ── */

/** GET /api/submissions → listSubmissions() rows. */
interface SubmissionRow {
  id: number;
  title: string;
  applicationType: string;
  primaryRegion: string;
  status: string;
}

/** GET /api/submissions/:id/sequences → listSequences() rows. */
interface SequenceRow {
  id: number;
  sequenceNumber: string;
  type: string;
  status: string; // draft|assembling|validated|frozen|dispatched
  region: string;
}

/** GET /api/authoring/docs/:docId/sections rows (subset). */
interface SavedSection {
  code: string | null;
  title: string | null;
  content: string | null;
}

/** PUT /sequences/:seqId/leaves → upsertLeaf() row (subset). */
interface PlacedLeaf {
  id: number;
  sectionCode: string;
  title: string;
  lifecycleOp: string;
}

/** A frozen or dispatched sequence's leaves are immutable (submission-service
 *  isSequenceLocked) — mirrored here so the picker can say WHY it excludes. */
const isLocked = (status: string) => status === 'frozen' || status === 'dispatched';

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
 * Assemble the saved sections into one snapshot body — the SAME format the
 * authoring → canonical bridge uses server-side
 * (server/services/ana/authoring-canonical-bridge.ts, loadDocumentSnapshot),
 * so the filed content reads identically wherever the document is projected.
 */
export function assembleSnapshot(sections: SavedSection[]): string {
  return sections
    .map((s) => {
      const heading = [s.code, s.title].filter(Boolean).join(' — ');
      return heading ? `## ${heading}\n\n${s.content ?? ''}` : String(s.content ?? '');
    })
    .join('\n\n')
    .trim();
}

export interface AuthoringPlaceIntoFilingProps {
  docId: string;
  docTitle: string;
  /** The active section's code — the section-code prefill (editable). */
  activeSectionCode: string | null;
  /** Unsaved changes in the open section: placement snapshots SAVED content
   *  only, so a dirty editor refuses with the reason rather than filing a
   *  document that silently omits what is on screen. */
  dirty: boolean;
  onNav: (id: string) => void;
  fireToast: FireToast;
}

type Verdict = { tone: 'ok' | 'err'; text: string } | null;

interface Placement {
  leafId: number;
  sectionCode: string;
  sequenceLabel: string;
  snapshotId: number;
}

export function AuthoringPlaceIntoFiling({
  docId,
  docTitle,
  activeSectionCode,
  dirty,
  onNav,
  fireToast,
}: AuthoringPlaceIntoFilingProps) {
  const [open, setOpen] = React.useState(false);

  // Target submissions — the org's real list, loaded when the dialog opens.
  const [subs, setSubs] = React.useState<{ state: 'loading' | 'ready' | 'error'; rows: SubmissionRow[]; error?: string }>({ state: 'loading', rows: [] });
  const [subId, setSubId] = React.useState<number | null>(null);

  // The chosen submission's sequences.
  const [seqs, setSeqs] = React.useState<{ state: 'idle' | 'loading' | 'ready' | 'error'; rows: SequenceRow[]; error?: string }>({ state: 'idle', rows: [] });
  const [seqId, setSeqId] = React.useState<number | null>(null);

  const [section, setSection] = React.useState('');
  const [op, setOp] = React.useState('new');
  const [placing, setPlacing] = React.useState(false);
  const [verdict, setVerdict] = React.useState<Verdict>(null);
  const [placement, setPlacement] = React.useState<Placement | null>(null);

  const openDialog = () => {
    setOpen(true);
    setVerdict(null);
    setPlacement(null);
    setSection(activeSectionCode ?? '');
    setOp('new');
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
  };

  const pickSubmission = (id: number | null) => {
    setSubId(id);
    setSeqId(null);
    setVerdict(null);
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
      const firstOpen = r.data.find((s) => !isLocked(s.status));
      setSeqId(firstOpen ? firstOpen.id : null);
    });
  };

  const lockedSeqs = seqs.rows.filter((s) => isLocked(s.status));
  const seq = seqs.rows.find((s) => s.id === seqId) ?? null;
  const canPlace = !placing && !dirty && seq != null && !isLocked(seq.status) && section.trim() !== '';

  const place = async () => {
    if (!canPlace || !seq) return;
    setPlacing(true);
    setVerdict(null);
    setPlacement(null);
    try {
      // 1. The SAVED sections, fresh from the server — never the local buffer.
      const read = await liveGetOrNull<{ sections?: SavedSection[] }>(
        `/api/authoring/docs/${encodeURIComponent(docId)}/sections`,
      );
      if (read.error || !read.data) {
        setVerdict({
          tone: 'err',
          text: `Couldn’t read the document’s saved sections — ${read.error ?? 'no response'}. Nothing was filed.`,
        });
        return;
      }
      const saved = Array.isArray(read.data.sections) ? read.data.sections : [];
      // The honest refusal: a document whose sections hold no SAVED text would
      // snapshot to bare headings — that must not become a leaf. Checked on the
      // sections' content, not the assembled string, so headings alone never
      // pass as substance.
      if (!saved.some((s) => (s.content ?? '').trim() !== '')) {
        setVerdict({
          tone: 'err',
          text: 'This document has no saved section content yet — there is nothing to file. Nothing was created.',
        });
        return;
      }
      const body = assembleSnapshot(saved);

      // 2. File the snapshot into the renderable store the leaves can reference.
      const snap = await mutateVerbatim<{ document?: { id?: number } }>('POST', '/api/coauthor/documents', {
        title: docTitle,
        moduleNumber: section.trim(),
        content: body,
        /* Names the source so the server can read ITS governed state. The
           snapshot's status is derived there, never sent from here: a
           client-supplied status would let any caller mark a draft approved
           and make an incomplete package report itself complete.
           Without this the snapshot was always 'draft', and the eCTD
           completeness check — which correctly refuses to count a draft —
           made this path structurally incapable of producing a filable
           package, however thoroughly the document had been frozen and
           signed. */
        sourceAuthoringDocId: docId,
      });
      const snapshotId = snap.data?.document?.id;
      if (typeof snapshotId !== 'number') {
        setVerdict({
          tone: 'err',
          text: `The filing snapshot could not be created — ${snap.error ?? 'the server returned no document id'}. Nothing was placed.`,
        });
        return;
      }

      // 3. The canonical write: the leaf, pointing at the snapshot. Verdict verbatim.
      const put = await mutateVerbatim<PlacedLeaf>('PUT', `/api/submissions/sequences/${seq.id}/leaves`, {
        sectionCode: section.trim(),
        title: docTitle,
        lifecycleOp: op,
        documentTable: 'coauthor_documents',
        documentId: snapshotId,
      });
      if (!put.data || typeof put.data.id !== 'number') {
        setVerdict({
          tone: 'err',
          text:
            `The leaf was refused — ${put.error ?? 'the request failed'}. ` +
            `The filing copy was created (${documentSourceLabel('coauthor_documents', snapshotId)}), ` +
            `but nothing was placed in the sequence.`,
        });
        return;
      }
      const sequenceLabel = `${seq.sequenceNumber} · ${seq.type}`;
      setPlacement({ leafId: put.data.id, sectionCode: put.data.sectionCode, sequenceLabel, snapshotId });
      setVerdict({
        tone: 'ok',
        text:
          `Placed as leaf ${put.data.sectionCode} in sequence ${sequenceLabel} — ` +
          `server-confirmed (leaf #${put.data.id}, from ${documentSourceLabel('coauthor_documents', snapshotId)}).`,
      });
      fireToast(`Placed into filing — leaf ${put.data.sectionCode} in sequence ${seq.sequenceNumber}.`);
    } finally {
      setPlacing(false);
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
          <div className="de" role="dialog" aria-label="Place into filing">
            <div className="de-h">
              <div>
                <div className="de-h-eye">Authoring → filing</div>
                <div className="de-h-t">Place into filing</div>
                <div className="de-h-s">{IDENTITY_STATEMENT}</div>
              </div>
              <button className="de-x" onClick={() => setOpen(false)} aria-label="Close">
                {I.close}
              </button>
            </div>

            <div className="de-body">
              {/* ── Target submission ── */}
              <div className="de-field">
                <label className="de-label" htmlFor="apf-sub">Target submission</label>
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
                    id="apf-sub"
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

              {/* ── Sequence (non-frozen only; the excluded say why) ── */}
              {subId != null && (
                <div className="de-field">
                  <label className="de-label" htmlFor="apf-seq">Sequence</label>
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
                        id="apf-seq"
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

              {/* ── Section code + lifecycle operation ── */}
              <div className="de-field half">
                <label className="de-label" htmlFor="apf-section">
                  Section code<span className="req">*</span>
                </label>
                <div className="de-desc">Prefilled from the open section; edit to file elsewhere.</div>
                <input
                  id="apf-section"
                  className="c2c-input"
                  type="text"
                  placeholder="e.g. 2.7.3 or m1/us/1.2"
                  value={section}
                  onChange={(e) => setSection(e.target.value)}
                />
              </div>
              <div className="de-field half">
                <label className="de-label" htmlFor="apf-op">Lifecycle operation</label>
                <select id="apf-op" className="c2c-input" value={op} onChange={(e) => setOp(e.target.value)}>
                  {Object.entries(SC_LIFECYCLE_OPS).map(([v, m]) => (
                    <option key={v} value={v}>{m.l}</option>
                  ))}
                </select>
              </div>

              {dirty && (
                <div className="de-err" role="status">
                  This section has unsaved changes. Placement snapshots the SAVED document, so
                  filing now would omit what is on screen — save first, then place.
                </div>
              )}

              <div className="de-gov">
                <span className="ico">{I.lock}</span>
                <span className="de-gov-t">
                  Placement is recorded in the submission of record — audited and
                  org-scoped. The server refuses a frozen or dispatched sequence.
                </span>
              </div>

              {verdict && (
                <div className={verdict.tone === 'err' ? 'de-err' : 'de-gov'} role="status">
                  {verdict.tone === 'ok' ? <span className="ico">{I.checkCircle}</span> : null}
                  <span className={verdict.tone === 'ok' ? 'de-gov-t' : undefined}>{verdict.text}</span>
                </div>
              )}

              {placement && (
                <div className="de-field">
                  <button
                    className="btn ghost"
                    style={{ height: 30 }}
                    onClick={() => {
                      setOpen(false);
                      onNav('submission-center');
                    }}
                  >
                    {I.layers} Open in Submission Center
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
