/**
 * Submission Center — per-sequence workspaces (Builder / Validation / Shadow
 * Review / Dispatch), extracted from SubmissionCenter.tsx when
 * the stub workspaces were wired to the real submission core.
 *
 * Doctrine (identical to the parent surface): FAIL CLOSED, NEVER FABRICATE.
 *   • Every read renders four honest states — loading → error → honest empty →
 *     real server rows. A 200 with the wrong shape reaches the error branch
 *     (hasKeys guards), never an invented empty.
 *   • Every mutation is awaited and its SERVER verdict is surfaced verbatim via
 *     `mutateVerbatim` (which reads the error body instead of inventing copy);
 *     success is announced only after the server confirms.
 *   • The governed freeze/dispatch chain (Part 11 e-signature →
 *     POST /api/c2c/actions/sign → governed endpoint) is owned by the PARENT
 *     surface — DispatchWorkspace only *requests* it through `onGoverned`, so
 *     no code path in this module can produce a frozen/dispatched state
 *     without the real re-auth chain.
 *
 * Endpoints (server/routes/submissions.ts):
 *   Builder      GET/PUT /api/submissions/sequences/:seqId/leaves
 *                GET /api/coauthor/documents            (leaf source picker)
 *   Validation   GET /api/submissions/sequences/:seqId/dispatch-readiness
 *                POST /api/submissions/:id/validation/explain
 *   Shadow       POST/GET /api/submissions/sequences/:seqId/shadow-review
 *                GET /api/submissions/shadow-review/:runId/findings
 *   Dispatch     GET /api/submissions/sequences/:seqId/dispatch-readiness
 *                POST /api/submissions/:id/dispatch-qc  (deterministic verdict; model narrates)
 *                GET /api/mdx/gateways/transmittals?program_id=&region=  (the market's transmissions, F13)
 */
import React from 'react';
import { I } from '../icons';
import { AnaActivity } from '../AnaActivity';
import { apiRequest, serverMessage, redactInternals } from '@/lib/queryClient';
import { useLiveRows, useLiveData, hasKeys, isRowsWith, liveGetOrNull, EmptyState } from '../dataConnect';
import { assessmentStateFor } from '../assessmentState';
import { documentSourceLabel } from '@shared/regulatory/canonical-document';
import { PlacementReasonField, placementReasonOk } from './filingTarget';
import { downloadBlob } from '../download';
import { gatewayLabel, transmittalStatusTone } from '../gatewayLabels';
import { useSurfaceAvailable } from '../surfaceAvailable';
import {
  SC_LENSES,
  SC_LIFECYCLE_OPS,
  SC_FIND_SEV,
  SC_FIND_STATUS,
  SC_SEQ_STATUS,
  type ToneMap,
} from '../fixtures/submission';

/* ── Shared display types ──────────────────────────────────────────────────── */

// GET /api/submissions/:id/sequences → listSequences() → `ectd_sequences` rows.
export interface SeqRow {
  id: number;
  sequenceNumber: string; // '0000', '0001', …
  type: string; // original|amendment|response|variation|annual|withdrawal
  status: string; // draft|assembling|validated|frozen|dispatched (SC_SEQ_STATUS)
  region: string; // fda|eu|jp
  validationStatus: string | null; // pending|passed|failed — nullable column
}

/** The submission columns these workspaces read (subset of the parent's SubRow). */
export interface SubLike {
  id: number;
  title: string;
  applicationType: string;
  primaryRegion: string;
  /** The project it belongs to (submissions.program_id); null when the server
   *  recorded none. The Dispatch tab lists the project's transmissions by it. */
  programId?: string | null;
}

export interface Notice {
  tone: 'ok' | 'warn' | 'err';
  text: string;
}

/** Inline verdict line — the server's outcome, announced politely and verbatim. */
export function VerdictNote({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <div className={`sc-verdict tone-${notice.tone}`} role="status">
      {notice.text}
    </div>
  );
}

export function Chip({ map, k }: { map: Record<string, ToneMap>; k: string }) {
  const m = map[k] ?? { l: k, t: 'idle' };
  return <span className={`rd-chip tone-${m.t}`}>{m.l}</span>;
}

const lensL = (v: string) => SC_LENSES.find((l) => l.v === v)?.l ?? v;

/** A server sentence used as a clause: its closing period dropped, so the
 *  sentence it is spliced into does not end in "..". */
export const clause = (s: string): string => s.replace(/[.\s]+$/, '');

/* ── mutateVerbatim — awaited mutation, server verdict verbatim ──────────────
 *
 * `liveMutateOrNull` reports a non-OK response as `HTTP <status> <path>`, which
 * throws away the server's own words. These workspaces exist to SHOW the
 * server's verdict (a refused lifecycle transition, a blocked dispatch gate, a
 * separation-of-duties rejection), so this helper lifts the message out of the
 * error body in both failure paths:
 *   • apiRequest THROWS ApiRequestError for every non-OK except 401 — its
 *     message is the reduction `extractApiError` performs
 *     (client/src/lib/queryClient.ts), i.e. the server's human copy with any
 *     enum token or infrastructure text already replaced, and the payload's
 *     `detail` (the c2c actions route's second line) is appended;
 *   • a 401 passes through un-thrown (REAUTH_* / AUTH_REQUIRED) — the body is
 *     read directly.
 * A failed mutation NEVER yields data — nothing local is fabricated.
 */
export interface MutateResult<T> {
  data: T | null;
  error?: string;
  /** No reliable refusal/success receipt: the mutation may have committed. */
  unconfirmed?: boolean;
  status?: number;
  code?: string;
  /** The response headers of a confirmed answer (a 204 carries its news there). */
  headers?: Headers;
}

/**
 * The server's own words for a refusal, or a plain sentence if it sent none.
 *
 * Delegated to `serverMessage`, which already reads `{ error: CODE, detail }` —
 * the governed-action envelope these workspaces exist to surface — and which
 * refuses to return an enum token or infrastructure text. This used to lead
 * with `if (typeof err === 'string') return err`, so a separation-of-duties
 * refusal rendered as "SEPARATION_OF_DUTIES — The signer must not be the
 * author of the target." with the code bolted onto the front of the sentence,
 * and a code-only refusal rendered as the bare token.
 */
function messageFromBody(p: unknown, status: number): string {
  return serverMessage(p) ?? `The server did not accept that (HTTP ${status}).`;
}

export async function mutateVerbatim<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
): Promise<MutateResult<T>> {
  try {
    const res = await apiRequest(method, path, body);
    if (!res.ok) {
      const p = (await res.json().catch(() => null)) as unknown;
      const code = mutationCode(p);
      return { data: null, error: messageFromBody(p, res.status), status: res.status, code, unconfirmed: mutationUnconfirmed(res.status, code) };
    }
    return confirmedResult<T>(res);
  } catch (e) {
    const payload = (e as { payload?: unknown } | null)?.payload;
    const detail = (payload as { detail?: unknown } | null)?.detail;
    // Only an ApiRequestError message is user copy; anything else here is a
    // browser-native throw ("Failed to fetch"), and the old fallback put the
    // HTTP method and the API route on screen.
    const known =
      (e as { name?: unknown } | null)?.name === 'ApiRequestError' &&
      typeof (e as { message?: unknown }).message === 'string' &&
      (e as { message: string }).message.trim();
    const failure = e as { status?: number; code?: string } | null;
    const code = failure?.code ?? mutationCode(payload);
    const status = failure?.status;
    const unconfirmed = mutationUnconfirmed(status, code);
    const base = known
      ? redactInternals((e as { message: string }).message, 'The result could not be confirmed. Check the current record before retrying.')
      : 'We cannot confirm whether the change was recorded. Check the current record before retrying.';
    return {
      data: null,
      error: typeof detail === 'string' && detail && !base.includes(detail) ? `${base} — ${redactInternals(detail, 'Check the current record before retrying.')}` : base,
      unconfirmed, status, code,
    };
  }
}

/**
 * An OK answer. 204 No Content is confirmed with nothing to read — the write
 * happened (a leaf removal answers so). Every other OK answer is confirmed only
 * by its body.
 */
async function confirmedResult<T>(res: Response): Promise<MutateResult<T>> {
  if (res.status === 204) return { data: null, status: 204, headers: res.headers };
  const data = (await res.json().catch(() => null)) as T | null;
  return { data, status: res.status, unconfirmed: data == null, headers: res.headers };
}

/** Only a definite refusal can justify saying that a write did not occur. */
function mutationUnconfirmed(status?: number, code?: string): boolean {
  if (code === 'OUTCOME_UNKNOWN') return true;
  return typeof status !== 'number' || ![400, 401, 403, 404, 409, 422, 429].includes(status);
}
function mutationCode(body: unknown): string | undefined {
  const value = body as { code?: unknown; error?: { code?: unknown } } | null;
  const code = value?.code ?? value?.error?.code;
  return typeof code === 'string' ? code : undefined;
}

/* ── Sequence picker — the selector the per-sequence workspaces feed from ──── */

export function SeqPicker({
  loading,
  error,
  rows,
  selId,
  onSel,
}: {
  loading: boolean;
  error?: string;
  rows: SeqRow[];
  selId: number | null;
  onSel: (id: number) => void;
}) {
  if (loading) {
    return <div role="status" className="scaf-note sc-mb">Loading this submission&#39;s sequences…</div>;
  }
  if (error) {
    return (
      <div className="sc-verdict tone-err" role="status">
        Couldn&#39;t load this submission&#39;s sequences — {redactInternals(error, 'the read did not settle')}. The workspaces below need a
        sequence to work on.
      </div>
    );
  }
  if (rows.length === 0) {
    return (
      <div className="scaf-note sc-mb">
        This submission has no eCTD sequences yet — create sequence 0000 from the Sequences
        workspace first.
      </div>
    );
  }
  const sel = rows.find((s) => s.id === selId) ?? rows[0];
  return (
    <div className="cm-pushbar sc-seqbar sc-mb">
      <label className="sp-q-s" htmlFor="sc-seq-picker">
        Working sequence
      </label>
      <select
        id="sc-seq-picker"
        className="sc-subpick"
        value={sel.id}
        onChange={(e) => onSel(Number(e.target.value))}
      >
        {rows.map((s) => (
          <option key={s.id} value={s.id}>
            {s.sequenceNumber} · {s.type} · {stageLabel(s)}
          </option>
        ))}
      </select>
      <Chip map={SC_SEQ_STATUS} k={sel.status} />
    </div>
  );
}

/* ═══ Builder — the sequence's real eCTD leaves ═════════════════════════════ */

// GET /sequences/:seqId/leaves → listLeaves() → `submission_leaves` rows
// (only the columns this table renders are typed; nullable columns render
// null-safe — never fabricated).
interface LeafRow {
  id: number;
  sectionCode: string;
  title: string;
  granularity: string | null;
  lifecycleOp: string; // new|replace|append|delete
  documentTable: string | null;
  documentId: number | null;
  /** The uuid half of the polymorphic reference — set for uuid-keyed stores
   *  (vault_documents), where documentId is null. */
  documentUuid?: string | null;
  documentType: string | null;
  /** What the leaf's pointer resolves to, computed by the server from the SAME
   *  resolver the dispatch gate uses (server/services/ectd/leaf-document-resolver).
   *  Absent on a server that predates it; the column then falls back to the
   *  pointer alone. */
  sourceDocument?: LeafSourceResolution | null;
}

interface LeafSourceResolution {
  status: 'resolved' | 'no_pointer' | 'unplaceable_table' | 'missing' | 'content_changed';
  keyKind: 'integer' | 'uuid' | null;
  pinnedSha256: string | null;
  storedSha256: string | null;
  pin: 'match' | 'mismatch' | 'unpinned' | 'unverifiable';
  reason: string | null;
  /** Why the document may not be transmitted ('not reviewed', 'draft', …), from
   *  the rule freeze and transmit apply; null when approved; absent for a store
   *  with no approval state or a server that predates it. */
  notTransmittable?: string | null;
  /** The document has no content to build a leaf from. */
  noContent?: boolean;
}

/* The Builder's "Source document" cell. "unlinked" is reserved for a leaf that
   carries NO pointer. A leaf that carries one is named by its store and key —
   a vault leaf by its uuid (documentId is null there; the column used to test
   documentId alone, and six vault leaves the platform had just filed read
   "unlinked": MDX demo pack, 2026-09-21, finding F5) — and, when the server
   has resolved it, by the verdict: the pin verified, no pin taken, the content
   changed since filing, or the document not found. Server words, never a
   client guess. */
const SOURCE_VERDICT: Record<LeafSourceResolution['status'], { chip: string; tone: string } | null> = {
  resolved: null, // the pin verdict says it
  no_pointer: null,
  unplaceable_table: { chip: 'store not placeable', tone: 'tone-err' },
  missing: { chip: 'not found in this organization', tone: 'tone-err' },
  content_changed: { chip: 'content changed since filing', tone: 'tone-warn' },
};
/** The chip for a resolved source: the store's status first, then empty
 *  content, then approval, then the pin. Approval is never inferred from a pin. */
function sourceVerdict(r: LeafSourceResolution): { chip: string; tone: string; title?: string } | null {
  const byStatus = SOURCE_VERDICT[r.status];
  if (byStatus) return { ...byStatus, title: r.reason ?? undefined };
  if (r.noContent) return { chip: 'no content', tone: 'tone-err', title: r.reason ?? undefined };
  if (r.notTransmittable) {
    return {
      chip: `not approved: ${r.notTransmittable}`,
      tone: 'tone-warn',
      title: 'Only approved documents are transmitted. Freeze, dispatch and transmit refuse this leaf until the document is approved.',
    };
  }
  return pinVerdict(r);
}
function pinVerdict(r: LeafSourceResolution): { chip: string; tone: string; title?: string } | null {
  if (r.pin === 'match') return { chip: 'source verified', tone: 'tone-ok', title: r.reason ?? undefined };
  if (r.pin === 'unpinned') return { chip: 'no content pin', tone: 'tone-idle', title: r.reason ?? undefined };
  return null;
}

function LeafSourceCell({ leaf }: { leaf: LeafRow }) {
  const key = leaf.documentUuid ?? (leaf.documentId != null ? String(leaf.documentId) : null);
  if (!leaf.documentTable || key == null) return <>unlinked</>;
  const isUuid = leaf.documentUuid != null;
  /* The source row, named rather than related. The key stays — it is how an
     auditor ties this leaf to its source — but it is qualified by a store name
     a reader can act on instead of by a relation name (documentSourceLabel).
     A uuid is shown short with the full value on hover. */
  const label = documentSourceLabel(leaf.documentTable, isUuid ? `${key.slice(0, 8)}…` : key);
  const r = leaf.sourceDocument ?? null;
  /* "source verified" said only that the content pin matched. On a Vault
     version nobody had reviewed it read as approval (QA 2026-10-08, j6): the
     same version showed "Not sent for review" in the Vault. A document that is
     empty or not approved now says so first, in the server's words, and the
     green chip is kept for a pinned, approved source. */
  const verdict = r ? sourceVerdict(r) : null;
  return (
    <>
      <span className="sc-mono" title={isUuid ? key : undefined}>{label}</span>
      {verdict && (
        <>
          {' '}
          <span className={`rd-chip ${verdict.tone}`} title={verdict.title}>{verdict.chip}</span>
        </>
      )}
    </>
  );
}

// GET /api/coauthor/documents → { documents } (coauthor_documents rows).
interface CoauthorDocRow {
  id: number;
  title: string;
  moduleNumber: string | null; // e.g. "3.2.S.4.1" — prefills the section code
  status: string;
}

/** What a leaf write answers beyond the row: a no-op, or a status it moved. */
interface LeafWriteAnswer {
  id: number;
  sectionCode?: string;
  unchanged?: true;
  sequenceStatusChanged?: { from: string; to: string };
}

/** What a leaf write did, for the Builder to re-read what changed. */
export interface LeafWriteEffect {
  /** A leaf was written or removed (the list must be re-read). */
  changed: boolean;
  /** The sequence's status moved (the sequence list must be re-read). */
  sequenceChanged: boolean;
}

/** The sentence a status the server moved adds to a leaf write's notice. */
function revertedSentence(seq: SeqRow, change: { from: string; to: string } | undefined): string {
  if (!change) return '';
  return ` Sequence ${seq.sequenceNumber} was ${SC_SEQ_STATUS[change.from]?.l ?? change.from}; changing its leaves returned it to ${
    SC_SEQ_STATUS[change.to]?.l ?? change.to
  }, so validate it again.`;
}

/** An original sequence has nothing earlier to act on: the server refuses a
 *  replace, append or delete there (LIFECYCLE_OP_IN_ORIGINAL), so it is not offered. */
const isOriginalSequence = (seq: SeqRow) => seq.type === 'original' || seq.sequenceNumber === '0000';

/** What a placement answered, as the notice and the re-reads it calls for. */
function placementAnswer(seq: SeqRow, title: string, r: MutateResult<LeafWriteAnswer>): { notice: Notice; effect: LeafWriteEffect } {
  if (!r.data || typeof r.data.id !== 'number') {
    return { notice: { tone: 'err', text: `The leaf was not placed — ${clause(r.error ?? 'the request failed')}.` }, effect: { changed: false, sequenceChanged: false } };
  }
  const at = typeof r.data.sectionCode === 'string' ? r.data.sectionCode : '(section code not returned)';
  /* QA 2026-10-08 (j6): the same document placed into the same section again
     came back as the existing leaf, marked `unchanged`, and this read
     "placed … server-confirmed" — a placement that did not happen. */
  if (r.data.unchanged) {
    return {
      notice: { tone: 'warn', text: `“${title}” is already leaf #${r.data.id} at ${at} in this sequence, with the same operation. Nothing was placed, so nothing was recorded.` },
      effect: { changed: false, sequenceChanged: false },
    };
  }
  return {
    notice: { tone: 'ok', text: `Leaf ${at} placed from “${title}” — server-confirmed (leaf #${r.data.id}).${revertedSentence(seq, r.data.sequenceStatusChanged)}` },
    effect: { changed: true, sequenceChanged: Boolean(r.data.sequenceStatusChanged) },
  };
}

/** What the chosen lifecycle operation does, said beside the select.
 *  QA 2026-10-08 (j6): a Replace was saved with nothing to say what it
 *  replaces. The operation is bound to a filed leaf by section and document
 *  when the package is assembled (package-from-core), so the form says that
 *  rather than implying a target it does not record. */
function lifecycleOpNote(seq: SeqRow, op: string): string {
  if (isOriginalSequence(seq)) {
    return `Sequence ${seq.sequenceNumber} is an original, so every leaf is New: nothing earlier exists to replace, append to or delete.`;
  }
  if (op === 'new') return 'New adds this document to the section.';
  return `${SC_LIFECYCLE_OPS[op]?.l ?? op} acts on the leaf already filed for this same document in this section, in an earlier sequence that was sent. It is bound when the package is assembled; the freeze check refuses one that binds to no filed leaf, before anyone signs.`;
}

/** Place a Co-Author document into the sequence as a leaf — a REAL persisted
 *  PUT (upsertLeaf), sourced from the real coauthor_documents list. No source
 *  document, no leaf: the picker never invents a document to place. */
function AddLeafForm({ seq, onDone }: { seq: SeqRow; onDone: (n: Notice, effect: LeafWriteEffect) => void }) {
  const seqId = seq.id;
  const original = isOriginalSequence(seq);
  const opsOffered = Object.entries(SC_LIFECYCLE_OPS).filter(([v]) => !original || v === 'new');
  const [open, setOpen] = React.useState(false);
  const docsPath = open ? '/api/coauthor/documents' : null;
  const docs = useLiveData<{ documents: CoauthorDocRow[] }>(
    docsPath,
    [docsPath],
    hasKeys<{ documents: CoauthorDocRow[] }>('documents'),
  );
  const docRows = Array.isArray(docs.data?.documents) ? docs.data.documents : [];
  const [docId, setDocId] = React.useState<number | null>(null);
  const [section, setSection] = React.useState('');
  const [op, setOp] = React.useState('new');
  const [reason, setReason] = React.useState('');
  const [saving, setSaving] = React.useState(false);
  const doc = docRows.find((d) => d.id === docId) ?? null;
  const effectiveOp = original ? 'new' : op;

  if (!open) {
    return (
      <div className="cm-pushbar sc-mt">
        <button type="button" className="sc-trans-b" onClick={() => setOpen(true)}>
          {I.plus} Place a Co-Author document as a leaf
        </button>
      </div>
    );
  }

  const place = async () => {
    if (!doc || !section.trim() || !placementReasonOk(reason) || saving) return;
    setSaving(true);
    const r = await mutateVerbatim<LeafWriteAnswer>('PUT', `/api/submissions/sequences/${seqId}/leaves`, {
      sectionCode: section.trim(),
      title: doc.title,
      lifecycleOp: effectiveOp,
      documentTable: 'coauthor_documents',
      documentId: doc.id,
      reason: reason.trim(),
    });
    setSaving(false);
    const answer = placementAnswer(seq, doc.title, r);
    onDone(answer.notice, answer.effect);
    if (r.data && typeof r.data.id === 'number') {
      setDocId(null);
      setSection('');
      setReason('');
    }
  };

  return (
    <div className="sc-mt">
      {docs.loading ? (
        <div role="status" className="scaf-note">Loading the Co-Author documents…</div>
      ) : docs.error ? (
        <div className="sc-verdict tone-err" role="status">
          Couldn&#39;t load the Co-Author documents — {redactInternals(docs.error, 'the read did not settle')}. Nothing to place.
        </div>
      ) : docRows.length === 0 ? (
        <div className="scaf-note">
          No Co-Author documents in this organization. Place a document from the
          editor or the Vault instead (below).
        </div>
      ) : (
        <div className="sc-leafform">
          <div className="sc-field">
            <label htmlFor="sc-leaf-doc">Source document</label>
            <select
              id="sc-leaf-doc"
              className="sc-subpick"
              value={docId ?? ''}
              onChange={(e) => {
                const id = Number(e.target.value);
                const d = docRows.find((x) => x.id === id) ?? null;
                setDocId(d ? id : null);
                if (d?.moduleNumber && !section.trim()) setSection(d.moduleNumber);
              }}
            >
              <option value="">Choose a document…</option>
              {docRows.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.title}
                  {d.moduleNumber ? ` · ${d.moduleNumber}` : ''} · {d.status}
                </option>
              ))}
            </select>
          </div>
          <div className="sc-field">
            <label htmlFor="sc-leaf-section">Section code</label>
            <input
              id="sc-leaf-section"
              className="sc-subpick"
              type="text"
              placeholder="e.g. 2.5 or m1/us/1.1"
              value={section}
              onChange={(e) => setSection(e.target.value)}
            />
          </div>
          <div className="sc-field">
            <label htmlFor="sc-leaf-op">Lifecycle operation</label>
            <select
              id="sc-leaf-op"
              className="sc-subpick"
              value={effectiveOp}
              onChange={(e) => setOp(e.target.value)}
              aria-describedby="sc-leaf-op-note"
            >
              {opsOffered.map(([v, m]) => (
                <option key={v} value={v}>
                  {m.l}
                </option>
              ))}
            </select>
            <span id="sc-leaf-op-note" className="sp-row-s">
              {lifecycleOpNote(seq, effectiveOp)}
            </span>
          </div>
          <PlacementReasonField value={reason} onChange={setReason} idPrefix="sc-leaf" disabled={saving} variant="inline" />
          <button
            type="button"
            className="sp-primary sc-btn"
            disabled={!doc || !section.trim() || !placementReasonOk(reason) || saving}
            onClick={place}
          >
            {I.layers} {saving ? 'Placing…' : 'Place leaf in the sequence'}
          </button>
          <button type="button" className="sc-trans-b" onClick={() => setOpen(false)} disabled={saving}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

/**
 * Remove one leaf — DELETE /sequences/:seqId/leaves/:leafId with the reason the
 * server records on LEAF_REMOVED. QA 2026-10-08 (j6): the route existed and no
 * control called it, so a duplicate or misplaced leaf could not be taken out.
 */
function RemoveLeafControl({
  seq,
  leaf,
  onDone,
}: {
  seq: SeqRow;
  leaf: LeafRow;
  onDone: (n: Notice, effect: LeafWriteEffect) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  if (!open) {
    return (
      <button type="button" className="sc-trans-b" aria-label={`Remove leaf ${leaf.sectionCode} ${leaf.title}`} onClick={() => setOpen(true)}>
        Remove
      </button>
    );
  }
  const remove = async () => {
    if (!placementReasonOk(reason) || busy) return;
    setBusy(true);
    const r = await mutateVerbatim<null>('DELETE', `/api/submissions/sequences/${seq.id}/leaves/${leaf.id}`, { reason: reason.trim() });
    setBusy(false);
    if (r.status === 204) {
      const moved = r.headers?.get('X-Sequence-Status-Changed') ?? null;
      const [from, to] = moved ? moved.split('->') : [];
      onDone(
        {
          tone: 'ok',
          text: `Leaf ${leaf.sectionCode} (“${leaf.title}”) removed — server-confirmed.${revertedSentence(seq, from && to ? { from, to } : undefined)}`,
        },
        { changed: true, sequenceChanged: Boolean(moved) },
      );
      setOpen(false);
    } else {
      onDone(
        {
          tone: 'err',
          text: r.unconfirmed
            ? `We cannot confirm whether leaf ${leaf.sectionCode} was removed. Check the leaves before retrying.`
            : `Leaf ${leaf.sectionCode} was not removed — ${clause(r.error ?? 'the request failed')}.`,
        },
        { changed: Boolean(r.unconfirmed), sequenceChanged: Boolean(r.unconfirmed) },
      );
    }
  };
  return (
    <div className="sc-leafform">
      <PlacementReasonField value={reason} onChange={setReason} idPrefix={`sc-leaf-rm-${leaf.id}`} disabled={busy} variant="inline" />
      <button type="button" className="sp-primary sc-btn" disabled={!placementReasonOk(reason) || busy} onClick={remove}>
        {busy ? 'Removing…' : 'Remove leaf'}
      </button>
      <button type="button" className="sc-trans-b" onClick={() => setOpen(false)} disabled={busy}>
        Cancel
      </button>
    </div>
  );
}

/** Where a leaf's document comes from (FILING_SPINE.md F16). The Builder
 *  pointed at the eCTD Co-Author, which is locked and scrapped; documents
 *  reach a sequence from where they are written or stored. Each door is offered
 *  only where its surface can be opened. */
function BuilderSources({ onNav }: { onNav?: (id: string) => void }) {
  const available = useSurfaceAvailable();
  return (
    <div className="scaf-note sc-mt" data-testid="sc-builder-sources">
      Documents reach this sequence from where they are kept: an authored
      document&apos;s Place into filing, in the editor, or a file&apos;s Place into
      submission, in the Vault. Copying a leaf from another market&apos;s sequence
      comes later.
      {onNav && (available('document-authoring') || available('vault')) && (
        <div className="cm-pushbar sc-mt">
          {available('document-authoring') && (
            <button type="button" className="sc-trans-b" onClick={() => onNav('document-authoring')}>
              Open documents
            </button>
          )}
          {available('vault') && (
            <button type="button" className="sc-trans-b" onClick={() => onNav('vault')}>
              Open the Vault
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function BuilderWorkspace({ seq, onSequenceChanged, onNav }: {
  seq: SeqRow; onSequenceChanged?: () => void;
  /** Shell navigation, for the doors to where documents are placed from. */
  onNav?: (id: string) => void;
}) {
  const [bump, setBump] = React.useState(0);
  const leavesPath = `/api/submissions/sequences/${seq.id}/leaves`;
  /* The module header promises a wrong-shaped 200 reaches the error branch;
     that held for the two useLiveData reads and not for these three, which
     flattened a non-array body to zero rows and rendered "nothing here yet". */
  const leaves = useLiveRows<LeafRow>(leavesPath, [leavesPath, bump], isRowsWith<LeafRow>('id', 'sectionCode'));
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const locked = seq.status === 'frozen' || seq.status === 'dispatched';
  const afterWrite = (n: Notice, effect: LeafWriteEffect) => {
    setNotice(n);
    if (effect.changed) setBump((b) => b + 1);
    if (effect.sequenceChanged) onSequenceChanged?.();
  };

  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Builder · eCTD leaves · sequence {seq.sequenceNumber}</span>
        <span className="s">governed leaves</span>
      </div>
      <div className="pj-card-b">
        <VerdictNote notice={notice} />
        {leaves.loading ? (
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>
            Loading the sequence&#39;s leaves…
          </div>
        ) : leaves.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the leaves"
            hint={`The submission core didn't return sequence ${seq.sequenceNumber}'s leaves — ${leaves.error}.`}
          />
        ) : leaves.empty ? (
          <EmptyState
            icon={I.layers}
            title={`No leaves in sequence ${seq.sequenceNumber} yet`}
            hint="Each leaf carries a lifecycle operator (new / replace / append / delete) and traces to its source document. Place the first one below."
          />
        ) : (
          <table className="ub-inv">
            <thead>
              <tr>
                <th>Section</th>
                <th>Title</th>
                <th>Operation</th>
                <th>Granularity</th>
                <th>Source document</th>
                {!locked && <th>Actions</th>}
              </tr>
            </thead>
            <tbody>
              {leaves.rows.map((l) => (
                <tr key={l.id}>
                  <td className="sc-mono">{l.sectionCode}</td>
                  <td>
                    <b>{l.title}</b>
                  </td>
                  <td>
                    <Chip map={SC_LIFECYCLE_OPS} k={l.lifecycleOp} />
                  </td>
                  <td>{l.granularity ?? '—'}</td>
                  <td>
                    <LeafSourceCell leaf={l} />
                  </td>
                  {!locked && (
                    <td>
                      <RemoveLeafControl seq={seq} leaf={l} onDone={afterWrite} />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {locked ? (
          <div className="scaf-note sc-mt">
            Sequence {seq.sequenceNumber} is {SC_SEQ_STATUS[seq.status]?.l.toLowerCase() ?? seq.status} —
            its leaves are immutable and cannot be added to or changed.
          </div>
        ) : !leaves.loading && !leaves.error ? (
          <>
            <AddLeafForm seq={seq} onDone={afterWrite} />
            <BuilderSources onNav={onNav} />
          </>
        ) : null}
      </div>
    </div>
  );
}

/* ═══ Validation — deterministic findings + AI explain ══════════════════════ */

// GET /sequences/:seqId/dispatch-readiness → assessSequenceDispatchReadiness
// (server/services/ectd/assess-dispatch-readiness.ts). Server-computed inputs;
// Each finding arrives with the corpus rule it is an instance of (or null when
// the corpus names none) — the same enriched shape the dispatch-readiness
// surface renders, so the two views cannot tell a finding's rule differently.
interface ReadinessFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  sectionCode: string | null;
  message: string;
  rule?: { id: string; title: string; regions: string[]; severity: string; enforcementStatement: string } | null;
}
interface ReadinessAssessment {
  sequenceId: number;
  region: string;
  sequenceStatus: string;
  validationErrors: number;
  unacknowledgedShadowCriticals: number;
  shadowReviewRunCount: number;
  shadowReviewMissing: boolean;
  /** The DISPATCH-step verdict: every gate, including the §11.70 requirement
   *  that a release signature already exists. Governs dispatch, never freeze. */
  gate: { cleared: boolean; blockers: string[] };
  /** The FREEZE-step verdict. Same gates, minus the REQUIREMENT for a release
   *  signature — which `assess-dispatch-readiness.ts` computes separately
   *  precisely because requiring one to freeze inverts the order the product
   *  works in. An `invalid` signature still blocks it, so this is not the
   *  weaker gate, only the correctly-scoped one.
   *
   *  Declared here, and not merely read, because it was the absence of a
   *  declaration that hid the defect: the server returned `freezeGate` and the
   *  client typed only `gate`, so reading the wrong field was not a type error.
   *  Both fields are now on the interface; picking the wrong one is a choice a
   *  reviewer can see, not a gap the compiler stays silent about. */
  freezeGate: { cleared: boolean; blockers: string[] };
  /** The DISPATCH verdict as it will stand once the operator's dispatch
   *  signature is recorded — what the Dispatch button asks. On the submissions
   *  spine the release signature IS that dispatch signature, so gating the
   *  button on `gate` (which requires it to exist already) hid the only control
   *  that creates it. The server decides when signing resolves the requirement
   *  (signingNowResolvesRelease: the resolver's spine precedence lives there),
   *  and this client never re-derives it. */
  dispatchGateOnSigning: { cleared: boolean; blockers: string[] };
  /** Whether THIS user may sign the freeze and dispatch, from the lookup the
   *  sign step enforces (separation of duties: the sequence's creator cannot).
   *  Informational — the server still decides at signing. */
  signer?: { state: 'independent' | 'author' | 'unresolved' | 'unverified'; sources: string[] };
  /** §11.70 state. Informational — the blocking happens in the gates. */
  releaseSignature?: {
    required: boolean;
    verdict: string;
    runId?: string | null;
    signatureId?: number | null;
    detail?: string | null;
    cleared: boolean;
  };
  readiness: { errors: number; warnings: number; infos: number; findings: ReadinessFinding[] };
  leafCount: number;
  /** For a sequence recorded as Validated: whether that still holds, by the
   *  validation this assessment ran (assess-dispatch-readiness validatedStageOf).
   *  Null for any other stage; absent on an older server. */
  validatedStage?: { holds: boolean; verdictRecorded: boolean; errors?: number; reason?: string } | null;
}

/**
 * A stored Validated stage the current validation no longer supports, in the
 * server's words (QA 2026-10-08, j7 finding 20: "0000 original — VALIDATED"
 * beside a dispatch-blocked gate). Renders nothing when it holds.
 */
function ValidatedStageNote({ a }: { a: ReadinessAssessment }) {
  const v = a.validatedStage;
  if (!v || v.holds || !v.reason) return null;
  return (
    <div className="sc-verdict tone-warn sc-mb" role="status" data-validated-stage="stale">
      {v.reason}
    </div>
  );
}

/** "Validated" for the stage label, and what it lacks when no verdict was
 *  recorded with it — a stage stored before 0e50993c5 recorded one. */
export function stageLabel(s: { status: string; validationStatus?: string | null }): string {
  const label = SC_SEQ_STATUS[s.status]?.l ?? s.status;
  return s.status === 'validated' && s.validationStatus !== 'passed' ? `${label} (no validation recorded)` : label;
}

const VAL_SEV: Record<string, ToneMap> = {
  error: { l: 'Error', t: 'warn' },
  warning: { l: 'Warning', t: 'ai' },
  info: { l: 'Info', t: 'idle' },
};

// POST /:id/validation/explain → explainValidation (submission-ai-service).
// The model's prose, each row bound to a validator finding by index: the rule,
// severity and leaf are the validator's, copied by the server. There is no
// verdict in it: the reply used to carry the model's own `blocking`, printed
// here as "Blocking." (Rule 2; filing-spine design review 2026-10-08).
interface ExplainRow {
  index: number;
  ruleId: string | null;
  severity: string;
  leaf: string | null;
  cause: string;
  fix: string;
}
interface ExplainResponse {
  narrative: { source: 'model'; label: string; promptVersion: string; summary: string; explained: ExplainRow[] } | null;
  narrativeUnavailable: { code: string; message: string } | null;
}
const isExplainResponse = (d: unknown): d is ExplainResponse =>
  !!d && typeof d === 'object' && 'narrative' in d &&
  ((d as ExplainResponse).narrative === null || Array.isArray((d as ExplainResponse).narrative?.explained));

export function ValidationWorkspace({ sub, seq }: { sub: SubLike; seq: SeqRow }) {
  const path = `/api/submissions/sequences/${seq.id}/dispatch-readiness`;
  const live = useLiveData<ReadinessAssessment>(
    path,
    [path, seq.status],
    hasKeys<ReadinessAssessment>('gate', 'readiness'),
  );
  const a = live.data;
  const findings = a?.readiness?.findings ?? [];
  const [explain, setExplain] = React.useState<{
    phase: 'idle' | 'running' | 'done' | 'error';
    data?: ExplainResponse;
    error?: string;
    /** When the running request began, for the live record's clock. */
    since?: number;
  }>({ phase: 'idle' });
  React.useEffect(() => setExplain({ phase: 'idle' }), [seq.id]);

  const runExplain = async () => {
    if (findings.length === 0 || explain.phase === 'running') return;
    setExplain({ phase: 'running', since: Date.now() });
    const r = await mutateVerbatim<ExplainResponse>(
      'POST',
      `/api/submissions/${sub.id}/validation/explain`,
      {
        region: seq.region,
        findings: findings.map((f) => ({
          ruleId: f.code,
          severity: f.severity,
          message: f.message,
          leaf: f.sectionCode ?? undefined,
        })),
      },
    );
    if (isExplainResponse(r.data)) setExplain({ phase: 'done', data: r.data });
    else setExplain({ phase: 'error', error: r.error ?? 'unexpected response shape' });
  };

  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Validation · sequence {seq.sequenceNumber}</span>
        <span className="s">dispatch readiness · validation</span>
      </div>
      <div className="pj-card-b">
        {live.loading ? (
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>
            Running the deterministic validation checks…
          </div>
        ) : live.error || !a || !Array.isArray(a.readiness?.findings) ? (
          /* hasKeys checks the KEY `readiness` exists, not its shape; a readiness
             object without `findings` rendered "nothing to flag" over nothing. */
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the validation findings"
            hint={`The server-side readiness assessment didn't respond${live.error ? ` — ${live.error}` : ''}. Findings are computed from the canonical leaves; nothing is shown in their place.`}
          />
        ) : (
          <>
            <ValidatedStageNote a={a} />
            <div className="scaf-note sc-mb">
              Sequence {seq.sequenceNumber} · {a.leafCount} {a.leafCount === 1 ? 'leaf' : 'leaves'} ·{' '}
              {a.readiness.errors} {a.readiness.errors === 1 ? 'error' : 'errors'} ·{' '}
              {a.readiness.warnings} {a.readiness.warnings === 1 ? 'warning' : 'warnings'} ·{' '}
              {a.readiness.infos} info · computed server-side from the canonical leaves, each
              shown as the validation-corpus rule it is an instance of.
            </div>
            {findings.length === 0 ? (
              <EmptyState
                icon={I.shieldCheck}
                title={`No validation findings for sequence ${seq.sequenceNumber}`}
                hint="The deterministic checks over the canonical leaves report nothing to flag."
              />
            ) : (
              <div className="sp-list">
                {findings.map((f, i) => (
                  <div key={i} className="sp-row">
                    <Chip map={VAL_SEV} k={f.severity} />
                    <span className="sp-row-b">
                      <span className="sp-row-t">
                        <span className="sc-mono">{f.code}</span>
                        {f.sectionCode ? (
                          <>
                            {' '}
                            {I.dot} <span className="sc-mono">{f.sectionCode}</span>
                          </>
                        ) : null}
                      </span>
                      <span className="sp-row-s">
                        {f.rule
                          ? `${f.rule.title} · ${f.rule.regions.map((r) => r.toUpperCase()).join(' · ')} · ${f.rule.severity} · ${f.rule.enforcementStatement}`
                          : 'Not in the rule corpus, so no rule stands behind this finding.'}
                      </span>
                      <span className="sp-row-s">{f.message}</span>
                    </span>
                  </div>
                ))}
              </div>
            )}
            {findings.length > 0 && (
              <div className="cm-pushbar sc-mt">
                <button
                  type="button"
                  className="sp-primary sc-btn"
                  disabled={explain.phase === 'running'}
                  onClick={runExplain}
                >
                  {I.sparkles}{' '}
                  {explain.phase === 'running' ? 'Explaining…' : 'Explain the findings (AI)'}
                </button>
              </div>
            )}
            {/* The wait, in the same live record AnA shows everywhere else: what is
            running, a pulse, and a clock — never a percentage, which the
            request cannot know. Its polite live region is what a screen-reader
            user hears; the button label alone said nothing to them. */}
            {explain.phase === 'running' && (
              <AnaActivity
                streaming
                phase={`Explaining ${findings.length} ${findings.length === 1 ? 'finding' : 'findings'} for ${seq.region}…`}
                startedAt={explain.since}
              />
            )}
            {explain.phase === 'error' && (
              <div className="sc-verdict tone-err sc-mt" role="status">
                The findings could not be explained — {explain.error}. The deterministic findings
                above stand on their own.
              </div>
            )}
            {explain.phase === 'done' && explain.data && !explain.data.narrative && (
              <div className="sc-verdict sc-mt" role="status">
                No model explanation: {explain.data.narrativeUnavailable?.message ?? 'the model returned none.'} The
                findings above are the validator&apos;s and stand on their own.
              </div>
            )}
            {explain.phase === 'done' && explain.data?.narrative && (
              <div className="sc-verdict sc-mt" role="note">
                <span className="sp-row-s">{explain.data.narrative.label}</span>
                {explain.data.narrative.summary && <p>{explain.data.narrative.summary}</p>}
                <div className="sp-list">
                  {explain.data.narrative.explained.map((e, i) => (
                    <div key={i} className="sp-row">
                      <Chip map={VAL_SEV} k={e.severity} />
                      <span className="sp-row-b">
                        <span className="sp-row-t">
                          <span className="sc-mono">{e.ruleId ?? 'unmapped rule'}</span>
                          {e.leaf ? (
                            <>
                              {' '}
                              {I.dot} <span className="sc-mono">{e.leaf}</span>
                            </>
                          ) : null}
                        </span>
                        <span className="sp-row-s">{e.cause}</span>
                        {e.fix && <span className="sp-row-s">Fix: {e.fix}</span>}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══ Shadow Review — real runs + persisted findings ════════════════════════ */

// GET /sequences/:seqId/shadow-review → shadow_review_runs rows (newest first).
interface ShadowRunRow {
  id: number;
  sequenceId: number;
  region: string;
  lens: string;
  status: string; // running|complete|failed
  rtfRiskScore: number | null;
  crlRiskScore: number | null;
  summary: string | null;
  createdAt: string | null;
}

// GET /shadow-review/:runId/findings → shadow_review_findings rows.
interface ShadowFindingRow {
  id: number;
  runId: number;
  dimension: string; // rtf|crl|format|nb
  severity: string; // critical|major|minor|info (SC_FIND_SEV)
  title: string;
  detail: string | null;
  basis: string | null;
  recommendation: string | null;
  leafRef: string | null;
  status: string; // open|accepted|fixed|waived (SC_FIND_STATUS — the acknowledged state)
}

const RUN_STATUS: Record<string, ToneMap> = {
  running: { l: 'Running', t: 'ai' },
  complete: { l: 'Complete', t: 'ok' },
  failed: { l: 'Failed', t: 'warn' },
};

function runWhen(iso: string | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
}

export function ShadowReviewWorkspace({ seq }: { seq: SeqRow }) {
  const [lens, setLens] = React.useState('fda_filing');
  const [bump, setBump] = React.useState(0);
  const runsPath = `/api/submissions/sequences/${seq.id}/shadow-review`;
  const runs = useLiveRows<ShadowRunRow>(runsPath, [runsPath, bump], isRowsWith<ShadowRunRow>('id', 'status'));
  const [selRun, setSelRun] = React.useState<number | null>(null);
  React.useEffect(() => setSelRun(null), [seq.id]);
  const run = runs.rows.find((r) => r.id === selRun) ?? runs.rows[0] ?? null;
  const findingsPath = run ? `/api/submissions/shadow-review/${run.id}/findings` : null;
  /* Without a guard, a non-array body settled as zero rows and — with the run
     complete — rendered "Run #N recorded no findings.": the false clear the
     comment block below was written to prevent. */
  const findings = useLiveRows<ShadowFindingRow>(findingsPath, [findingsPath, bump], isRowsWith<ShadowFindingRow>('id', 'runId', 'severity'));
  /* ── A run row exists before the review does ───────────────────────────────
     The findings panel used to say "Run #N recorded no findings." on the sole
     condition that the findings read settled empty. The run row, however, is
     INSERTED with status 'running' before the reviewer is called at all, and is
     set to 'failed' — with no finding rows ever written — when that call does
     not return a usable answer. The list is newest-first and the newest run is
     the one selected by default, which is precisely the run most likely to be
     in flight or to have aborted.

     So the sentence rendered in two states where it was false: over a run still
     executing, and over a run that failed outright. In both, zero findings means
     the review never got as far as recording any — not that a reviewer read the
     sequence and had nothing to raise. On a submission sequence that is the
     sentence a regulatory director acts on.

     Clearance is now gated on the run's own recorded completion, which is the
     positive evidence assessmentState.ts asks for, and is deliberately NOT the
     emptiness that produced the bug: a complete run can hold findings or hold
     none, and those stay different states. */
  const findingsState = assessmentStateFor(findings, {
    scopeExists: Boolean(run),
    findingCount: findings.rows.length,
    assessmentRan: run?.status === 'complete',
  });
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const [running, setRunning] = React.useState(false);
  /** When the running review began, for the live record's clock. */
  const [runningSince, setRunningSince] = React.useState<number | null>(null);

  const runReview = async () => {
    if (running) return;
    setRunning(true);
    setRunningSince(Date.now());
    setNotice(null);
    const r = await mutateVerbatim<{ runId: number; findingCount: number; summary: string }>(
      'POST',
      `/api/submissions/sequences/${seq.id}/shadow-review`,
      { lens },
    );
    setRunning(false);
    if (r.data && typeof r.data.runId === 'number') {
      setNotice({
        tone: 'ok',
        text:
          typeof r.data.findingCount === 'number'
            ? `Shadow review run ${r.data.runId} complete — ${r.data.findingCount} ${r.data.findingCount === 1 ? 'finding' : 'findings'} recorded.`
            : `Shadow review run ${r.data.runId} complete — the finding count was not returned; open the run to see them.`,
      });
      setSelRun(r.data.runId);
      setBump((b) => b + 1);
    } else {
      setNotice({
        tone: 'err',
        text: `The shadow review did not complete — ${r.error ?? 'the request failed'}. No findings were recorded.`,
      });
    }
  };

  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Shadow review · sequence {seq.sequenceNumber}</span>
        <span className="s">shadow review · findings</span>
      </div>
      <div className="pj-card-b">
        <div className="cm-pushbar sc-mb">
          <label className="sp-q-s" htmlFor="sc-shadow-lens">
            Review lens
          </label>
          <select
            id="sc-shadow-lens"
            className="sc-subpick"
            value={lens}
            onChange={(e) => setLens(e.target.value)}
          >
            {SC_LENSES.map((l) => (
              <option key={l.v} value={l.v}>
                {l.l}
              </option>
            ))}
          </select>
          <button
            type="button"
            className="sp-primary sc-btn"
            disabled={running}
            onClick={runReview}
          >
            {I.sparkles} {running ? 'Reviewing…' : 'Run shadow review'}
          </button>
        </div>
        {/* The wait, in the same live record AnA shows everywhere else: what is
            running, a pulse, and a clock — never a percentage, which the
            request cannot know. Its polite live region is what a screen-reader
            user hears; the button label alone said nothing to them. */}
        {running && (
          <AnaActivity
            streaming
            phase={`Reading sequence ${seq.sequenceNumber} through the ${lensL(lens)} lens…`}
            startedAt={runningSince ?? undefined}
          />
        )}
        <VerdictNote notice={notice} />
        {runs.loading ? (
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>
            Loading the shadow-review runs…
          </div>
        ) : runs.error ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't load the shadow-review runs"
            hint={`The submission core didn't return this sequence's runs — ${runs.error}.`}
          />
        ) : runs.empty ? (
          <EmptyState
            icon={I.eye}
            title={`No shadow reviews for sequence ${seq.sequenceNumber} yet`}
            hint={`Run one to see how a ${lensL(lens)} reviewer would read this sequence before you file — pre-empting information requests.`}
          />
        ) : (
          <>
            <table className="ub-inv">
              <thead>
                <tr>
                  <th>Run</th>
                  <th>Lens</th>
                  <th>Status</th>
                  <th>RTF risk</th>
                  <th>CRL risk</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {runs.rows.map((r) => (
                  <tr
                    key={r.id}
                    className="sc-subrow"
                    data-cur={r.id === run?.id || undefined}
                    onClick={() => setSelRun(r.id)}
                  >
                    {/* The row was click-to-select with no role, tabIndex or key
                        handler, so the shadow-review history was mouse-only.
                        role="button" on the <tr> would buy the tab stop by
                        destroying the row's table semantics, so the control goes
                        in the cell instead: the row keeps being a row, the run id
                        becomes the thing you activate, and the row's own onClick
                        stays as the mouse convenience it already was. */}
                    <td className="sc-mono">
                      <button
                        type="button"
                        className="tbl-name-btn"
                        aria-current={r.id === run?.id || undefined}
                        onClick={(e) => { e.stopPropagation(); setSelRun(r.id); }}
                      >
                        #{r.id}
                      </button>
                    </td>
                    <td>{lensL(r.lens)}</td>
                    <td>
                      <Chip map={RUN_STATUS} k={r.status} />
                    </td>
                    <td>{r.rtfRiskScore != null ? r.rtfRiskScore.toFixed(2) : '—'}</td>
                    <td>{r.crlRiskScore != null ? r.crlRiskScore.toFixed(2) : '—'}</td>
                    <td>{runWhen(r.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {run && (
              <div className="sc-mt">
                {run.summary ? <div className="scaf-note sc-mb">{run.summary}</div> : null}
                {findings.loading ? (
                  <div role="status" className="scaf-note">Loading run #{run.id}&#39;s findings…</div>
                ) : findings.error ? (
                  <div className="sc-verdict tone-err" role="status">
                    Couldn&#39;t load run #{run.id}&#39;s findings — {redactInternals(findings.error, 'the read did not settle')}.
                  </div>
                ) : findings.empty ? (
                  findingsState === 'assessed-clear' ? (
                    <div className="scaf-note">Run #{run.id} recorded no findings.</div>
                  ) : run.status === 'running' ? (
                    <div className="scaf-note">
                      Run #{run.id} is still running, so it holds no findings yet. That is
                      the absence of a result, not a clear one.
                    </div>
                  ) : (
                    <div className="sc-verdict tone-err" role="status">
                      Run #{run.id} did not complete, so no findings were recorded. That is
                      the absence of a review, not a clear one — run the shadow review again.
                    </div>
                  )
                ) : (
                  <div className="sp-list">
                    {findings.rows.map((f) => (
                      <div key={f.id} className="sp-row">
                        <Chip map={SC_FIND_SEV} k={f.severity} />
                        <span className="sp-row-b">
                          <span className="sp-row-t">
                            {f.title}
                            {f.leafRef ? (
                              <>
                                {' '}
                                {I.dot} <span className="sc-mono">{f.leafRef}</span>
                              </>
                            ) : null}
                          </span>
                          {f.detail ? <span className="sp-row-s">{f.detail}</span> : null}
                          {f.basis ? <span className="sp-row-s">Basis: {f.basis}</span> : null}
                          {f.recommendation ? (
                            <span className="sp-row-s">Fix: {f.recommendation}</span>
                          ) : null}
                        </span>
                        <span className="sc-cap sp-q-s">{f.dimension}</span>
                        <Chip map={SC_FIND_STATUS} k={f.status} />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ═══ Dispatch — the deterministic gate + governed freeze/dispatch ══════════ */

// POST /:id/dispatch-qc → runDispatchQc. Since 2026-09-21 (VSR-001 F-9) the
// verdict is the deterministic dispatch gate — with sequenceId, the SAME
// composed gate the assessment above and freeze/dispatch enforce — and the
// model, when a provider exists, only narrates it. `narrative` is prose;
// nothing in it is a verdict.
interface DispatchQcResult {
  clearedToDispatch: boolean;
  blockers: string[];
  warnings: string[];
  checklist: Array<{ item: string; pass: boolean }>;
  verdictSource: 'assess-dispatch-readiness' | 'dispatch-gate';
  narrative: {
    source: 'model';
    label: string;
    promptVersion: string;
    summary: string;
    observations: string[];
  } | null;
  narrativeUnavailable: { code: string; message: string } | null;
}

/** The governed steps the parent's e-signature chain runs. */
export type GovernedKind = 'freeze' | 'dispatch' | 'transmit';
/** What a transmit needs beyond its signature (POST /sequences/:id/transmit). */
export interface TransmitRequest {
  environment: 'staging' | 'production';
  applicationId: string;
}

/** POST /sequences/:seqId/governed-precheck {step:'transmit'} → its `transmit`. */
export interface TransmitReadiness {
  sequenceStatus: string;
  dispatchStatus: string | null;
  route: { ok: true; region: string; gateway: string } | { ok: false; reason: string };
  configured: { staging: boolean | null; production: boolean | null };
  recordedApplicationNumber: string | null;
  gate: { cleared: boolean; blockers: string[] };
  refusal: string | null;
}
/** POST /sequences/:seqId/governed-precheck — the step's gates, asked before signing. */
export interface GovernedPrecheck {
  step: GovernedKind;
  cleared: boolean;
  refusal: string | null;
  transmit?: TransmitReadiness;
}

const credentialWord = (v: boolean | null): string =>
  v === true ? 'configured' : v === false ? 'not configured' : 'could not be checked';

/** Why a transmit to `env` would be refused, from the server's precheck; null when it would not. */
function transmitBlockedBy(t: TransmitReadiness, env: 'staging' | 'production'): string | null {
  if (t.refusal && !/credentials configured|is configured for/.test(t.refusal)) return t.refusal;
  if (!t.route.ok) return t.route.reason;
  const gw = gatewayLabel(t.route.gateway);
  if (t.configured[env] === null) return `Whether ${gw} is configured for ${env} could not be checked, so nothing can be sent until it can.`;
  if (t.configured[env] !== true) {
    return `${gw} has no ${env} credentials configured for this organization, so nothing can be sent. An administrator adds them under Gateway accounts.`;
  }
  return null;
}

/**
 * The package, downloaded: POST /api/ectd/export/:submissionId {sequenceNumber}
 * — the canonical eCTD export (assemble-from-core, index.xml, structural
 * validation that fails closed), the route eCTD compile downloads from. QA
 * 2026-10-08 (j6, the blocker): the Submission Center had no export or download
 * control, and nothing here called this route.
 */
function PackageDownload({ sub, seq }: { sub: SubLike; seq: SeqRow }) {
  const [pkg, setPkg] = React.useState<{ phase: 'idle' | 'running' | 'done' | 'error'; text?: string }>({ phase: 'idle' });
  const final = seq.status === 'dispatched' || seq.status === 'frozen';
  const download = async () => {
    if (pkg.phase === 'running') return;
    setPkg({ phase: 'running' });
    try {
      const res = await apiRequest('POST', `/api/ectd/export/${sub.id}`, { sequenceNumber: seq.sequenceNumber });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as unknown;
        setPkg({ phase: 'error', text: serverMessage(body) ?? `The package was not returned (HTTP ${res.status}).` });
        return;
      }
      const blob = await res.blob();
      const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? `sequence-${seq.sequenceNumber}.zip`;
      const saved = downloadBlob(name, blob);
      setPkg(saved
        ? { phase: 'done', text: `Package ${name} downloaded (${Math.max(1, Math.round(blob.size / 1024))} KB) — assembled from sequence ${seq.sequenceNumber}'s leaves as they stand now, with its index.xml.` }
        : { phase: 'error', text: 'The package was assembled but this browser did not save it. Try again.' });
    } catch (e) {
      setPkg({ phase: 'error', text: redactInternals(e instanceof Error ? e.message : '', 'The package could not be assembled right now.') });
    }
  };
  const label = final ? 'Download the eCTD package (zip)' : 'Download an inspection copy of the package (zip)';
  return (
    <>
      <div className="cm-pushbar sc-mb">
        <button type="button" className="sc-trans-b" disabled={pkg.phase === 'running'} onClick={download}>
          {I.layers} {pkg.phase === 'running' ? 'Assembling the package…' : label}
        </button>
      </div>
      {pkg.phase === 'done' && <div className="sc-verdict tone-ok" role="status">{pkg.text}</div>}
      {pkg.phase === 'error' && <div className="sc-verdict tone-err" role="status">The package was not returned — {clause(pkg.text ?? 'the request failed')}.</div>}
    </>
  );
}

/** Where the transmit would go and with which credentials, as the server answered. */
function TransmitFacts({ t }: { t: TransmitReadiness }) {
  const rows: Array<[string, string]> = [
    ['Gateway', t.route.ok ? `${gatewayLabel(t.route.gateway)} (${t.route.region.toUpperCase()})` : 'none for this filing'],
    ['Staging credentials', credentialWord(t.configured.staging)],
    ['Production credentials', credentialWord(t.configured.production)],
    ['Dispatch status', t.dispatchStatus ?? 'pending'],
  ];
  return (
    <div className="tl-spec-grid sc-spec">
      {rows.map(([k, v]) => (
        <div key={k} className="tl-spec-row">
          <span className="tl-spec-k">{k}</span>
          <span className="tl-spec-v">{v}</span>
        </div>
      ))}
    </div>
  );
}

/** A row of GET /api/mdx/gateways/transmittals, as the Dispatch tab lists it. */
interface DossierTransmittal {
  id: number;
  status?: string | null;
  transmission_id?: string | null;
  error_message?: string | null;
  submitted_at?: string | null;
  ack_received_at?: string | null;
  submitted_by?: number | null;
  submitted_by_name?: string | null;
  /** transmitSequence records the sequence NUMBER it filed and the environment. */
  metadata?: { sequence?: string | null; environment?: string | null } | null;
}

const whenOf = (iso: string | null | undefined): string | null => (iso ? new Date(iso).toLocaleString() : null);

/**
 * The market's transmissions and acknowledgements (FILING_SPINE F13): GET
 * /api/mdx/gateways/transmittals?program_id=&region=, for the project this
 * submission belongs to and the region its gateway serves (`region`, from the
 * server's transmit route). A transmittal row records the sequence number it
 * filed, not the sequence, so the list says it is filtered by project and
 * region and marks this sequence's rows. A failed or misshapen read is an
 * error, never "none sent"; a submission with no project is not listed.
 */
function DossierTransmissions({ programId, region, sequenceNumber }: { programId: string | null | undefined; region: string; sequenceNumber: string }) {
  const path = programId
    ? `/api/mdx/gateways/transmittals?program_id=${encodeURIComponent(programId)}&region=${encodeURIComponent(region)}`
    : null;
  const live = useLiveRows<DossierTransmittal>(path, [path], isRowsWith<DossierTransmittal>('id'));
  const market = region.toUpperCase();
  let body: React.ReactNode;
  if (!programId) {
    body = (
      <div className="scaf-note">
        This submission is not anchored to a project, so its transmissions cannot be listed by project here. Anchor it to its project,
        under the submission&#39;s title, to list them.
      </div>
    );
  } else if (live.loading) {
    body = <div role="status" className="scaf-note">Reading the transmissions…</div>;
  } else if (live.error) {
    body = (
      <div className="sc-verdict tone-err" role="status">
        The transmissions could not be read, so whether any were sent is not shown here. Open the Dispatch tab again to retry.
      </div>
    );
  } else if (live.rows.length === 0) {
    body = <div className="scaf-note">No transmissions are recorded for this project in {market}.</div>;
  } else {
    body = (
      <div className="tl-spec-grid sc-spec">
        {live.rows.map((t) => {
          const filed = t.metadata?.sequence ?? null;
          const acked = whenOf(t.ack_received_at);
          const sender = t.submitted_by_name ?? (t.submitted_by != null ? `user #${t.submitted_by}` : 'sender not recorded');
          return (
            <div key={t.id} className="tl-spec-row">
              <span className="tl-spec-k">
                Transmittal #{t.id}
                {filed ? ` · sequence ${filed}${filed === sequenceNumber ? ' (this one)' : ''}` : ' · sequence not recorded'}
              </span>
              <span className="tl-spec-v">
                {t.status ? <span className={`rd-chip tone-${transmittalStatusTone(t.status)}`}>{t.status}</span> : 'status not recorded'}
                {t.transmission_id ? ` · ${t.transmission_id}` : ''}
                {` · ${acked ? `acknowledged ${acked}` : 'not acknowledged'}`}
                {` · sent by ${sender}`}
                {whenOf(t.submitted_at) ? ` on ${whenOf(t.submitted_at)}` : ''}
                {t.metadata?.environment ? ` (${t.metadata.environment})` : ''}
                {t.error_message ? ` · ${t.error_message}` : ''}
              </span>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="sc-mt" role="region" aria-label="Transmissions and acknowledgements">
      <div className="tl-spec-k sc-mb">Transmissions and acknowledgements</div>
      {programId && !live.loading && !live.error && (
        <div className="scaf-note sc-mb">
          Filtered by project and {market}, not by sequence: a transmittal records the number of the sequence it filed.
        </div>
      )}
      {body}
    </div>
  );
}

/**
 * The transmit of a dispatched sequence: POST /sequences/:seqId/transmit, run
 * by the parent's Part 11 chain. Where it would go and whether that gateway
 * holds credentials is read first (governed-precheck {step:'transmit'}), so
 * "not configured" is said here, before a password is typed — never
 * discovered after (QA 2026-10-08, j6, the blocker).
 */
function TransmitPanel({ seq, programId, onTransmit, canSign }: { seq: SeqRow; programId: string | null | undefined; onTransmit: (req: TransmitRequest) => void; canSign: boolean }) {
  const [ready, setReady] = React.useState<{ phase: 'loading' | 'done' | 'error'; t?: TransmitReadiness; error?: string }>({ phase: 'loading' });
  const [environment, setEnvironment] = React.useState<'staging' | 'production'>('staging');
  const [applicationId, setApplicationId] = React.useState('');
  React.useEffect(() => {
    let cancelled = false;
    void mutateVerbatim<GovernedPrecheck>('POST', `/api/submissions/sequences/${seq.id}/governed-precheck`, { step: 'transmit' }).then((r) => {
      if (cancelled) return;
      const t = r.data?.transmit;
      if (t) {
        setReady({ phase: 'done', t });
        setApplicationId((v) => v || t.recordedApplicationNumber || '');
      } else {
        setReady({ phase: 'error', error: r.error ?? 'the transmit check did not answer' });
      }
    });
    return () => {
      cancelled = true;
    };
  }, [seq.id]);

  if (ready.phase === 'loading') return <div role="status" className="scaf-note sc-mt">Checking where this sequence would be sent…</div>;
  const t = ready.t;
  if (!t) {
    return (
      <div className="sc-verdict tone-err sc-mt" role="status">
        Whether this sequence can be transmitted could not be checked — {clause(ready.error ?? 'no answer')}. Nothing is offered until it can.
      </div>
    );
  }
  const blockedBy = transmitBlockedBy(t, environment);
  const appNumber = applicationId.trim();
  return (
    <div className="sc-mt">
      <TransmitFacts t={t} />
      <div className="sc-leafform sc-mt">
        <div className="sc-field">
          <label htmlFor="sc-tx-env">Environment</label>
          <select id="sc-tx-env" className="sc-subpick" value={environment} onChange={(e) => setEnvironment(e.target.value as 'staging' | 'production')}>
            <option value="staging">Staging (agency test)</option>
            <option value="production">Production</option>
          </select>
        </div>
        <div className="sc-field">
          <label htmlFor="sc-tx-app">Agency application number</label>
          <input id="sc-tx-app" className="sc-subpick" type="text" value={applicationId} placeholder="e.g. 000512" onChange={(e) => setApplicationId(e.target.value)} />
        </div>
        <button
          type="button"
          className="sp-primary sc-btn"
          disabled={blockedBy !== null || !appNumber || !canSign}
          onClick={() => onTransmit({ environment, applicationId: appNumber })}
        >
          {I.rocket} Transmit sequence {seq.sequenceNumber} (Part 11 e-signature)
        </button>
      </div>
      {blockedBy ? (
        <div className="sc-verdict tone-warn sc-mt" role="status">Transmit is not available: {clause(blockedBy)}.</div>
      ) : !appNumber ? (
        <div className="scaf-note sc-mt">
          No agency application number is recorded for this program. Enter the number the agency assigned; a package is never sent without one.
        </div>
      ) : null}
      {t.route.ok && <DossierTransmissions programId={programId} region={t.route.region} sequenceNumber={seq.sequenceNumber} />}
    </div>
  );
}

/** The package and the transmit, for this sequence (QA 2026-10-08, j6, the blocker). */
function PackageAndTransmit({ sub, seq, onTransmit, canSign }: { sub: SubLike; seq: SeqRow; onTransmit: (req: TransmitRequest) => void; canSign: boolean }) {
  return (
    <div className="sc-mt">
      <div className="tl-spec-k sc-mb">Package and transmit</div>
      <PackageDownload sub={sub} seq={seq} />
      {seq.status === 'dispatched' ? (
        <TransmitPanel seq={seq} programId={sub.programId} onTransmit={onTransmit} canSign={canSign} />
      ) : (
        <div className="scaf-note sc-mt">
          Transmit opens once sequence {seq.sequenceNumber} is dispatched. It sends this package to the region&#39;s agency gateway,
          under its own Part 11 e-signature, and only when that gateway holds credentials for this organization.
        </div>
      )}
    </div>
  );
}

export function DispatchWorkspace({
  sub,
  seq,
  onGoverned,
}: {
  sub: SubLike;
  seq: SeqRow;
  onGoverned: (seq: SeqRow, kind: GovernedKind, transmit?: TransmitRequest) => void;
}) {
  const path = `/api/submissions/sequences/${seq.id}/dispatch-readiness`;
  const live = useLiveData<ReadinessAssessment>(
    path,
    [path, seq.status],
    hasKeys<ReadinessAssessment>('gate', 'readiness'),
  );
  const a = live.data;
  // Which governed step is open, each read from the verdict for THAT step. A
  // missing field is not cleared: this is network data, so absence fails closed
  // rather than throwing or falling back to another step's verdict.
  const freezeOpen = a?.freezeGate?.cleared === true;
  const dispatchOpen = a?.dispatchGateOnSigning?.cleared === true;
  // The gate blocks, and its only blocker is the release signature that the
  // dispatch e-signature itself records. See the header state that reads this.
  const awaitingOwnSignature = !!a && !a.gate.cleared && dispatchOpen;
  // Separation of duties, told in advance. The sign step refuses the sequence's
  // creator, and used to say so only after a password and code were typed. The
  // buttons are not offered to someone the server will refuse; 'unverified'
  // (the lookup failed) hides nothing — unknown is not "you cannot".
  const signerState = a?.signer?.state;
  const cannotSign = signerState === 'author' || signerState === 'unresolved';
  const [qc, setQc] = React.useState<{
    phase: 'idle' | 'running' | 'done' | 'error';
    data?: DispatchQcResult;
    error?: string;
  }>({ phase: 'idle' });
  React.useEffect(() => setQc({ phase: 'idle' }), [seq.id]);

  const runQc = async () => {
    if (qc.phase === 'running') return;
    setQc({ phase: 'running' });
    /* The server overrides the two COUNTS from the canonical core and passes
       `leaves` straight through — and the QC prompt decides "required modules
       present, forms present, lifecycle operations coherent" from `leaves`.
       Sent empty, every checklist row was a verdict over a section inventory
       the sequence does not have. Read the real leaves first; refuse the run
       if they cannot be read. */
    const leafRead = await liveGetOrNull<LeafRow[]>(`/api/submissions/sequences/${seq.id}/leaves`);
    if (leafRead.error || !Array.isArray(leafRead.data)) {
      setQc({
        phase: 'error',
        error: `couldn't read sequence ${seq.sequenceNumber}'s leaves for the advisory — ${redactInternals(leafRead.error, 'the read did not settle')}`,
      });
      return;
    }
    const r = await mutateVerbatim<DispatchQcResult>('POST', `/api/submissions/${sub.id}/dispatch-qc`, {
      region: seq.region,
      // With sequenceId the server recomputes the gate inputs from the
      // canonical core — the two counts below are floors it overrides, never
      // client claims it trusts. The leaves are the sequence's real inventory.
      sequenceId: seq.id,
      validationErrors: a?.validationErrors ?? 0,
      unresolvedShadowCriticals: a?.unacknowledgedShadowCriticals ?? 0,
      leaves: leafRead.data.map((l) => ({ sectionCode: l.sectionCode, operation: l.lifecycleOp })),
    });
    if (r.data && Array.isArray(r.data.checklist)) setQc({ phase: 'done', data: r.data });
    else setQc({ phase: 'error', error: r.error ?? 'unexpected response shape' });
  };

  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Dispatch · sequence {seq.sequenceNumber}</span>
        <span className="s">dispatch readiness · QC</span>
      </div>
      <div className="pj-card-b">
        <div className="scaf-note sc-mb">
          Dispatch is governed: a sequence must be Validated → Frozen (Part 11 e-signature) and
          clear the deterministic dispatch gate before it can be dispatched. The gate below is
          computed server-side from the canonical leaves and open Shadow Review criticals — the
          same gate the freeze/dispatch endpoints enforce atomically with the e-signature.
        </div>
        {live.loading ? (
          <div role="status" className="scaf-note" style={{ padding: '18px 10px' }}>
            Computing the dispatch gate…
          </div>
        ) : live.error || !a ? (
          <EmptyState
            tone="error"
            icon={I.alertTriangle}
            title="Couldn't compute the dispatch gate"
            hint={`The deterministic readiness assessment didn't respond${live.error ? ` — ${live.error}` : ''}. Freeze and dispatch stay unavailable until it does — the gate fails closed.`}
          />
        ) : (
          <>
            <ValidatedStageNote a={a} />
            {/* Three states, not two. `awaitingOwnSignature` is a gate whose
                only blocker is the release signature the dispatch e-signature
                itself records (dispatchGateOnSigning clears, `gate` does not).
                Reporting that as "Dispatch blocked" sent the user looking for a
                defect that does not exist; reporting it as clear would be false.
                `?.` / `=== true`: network data, and missing fails closed. */}
            <div
              className={`sc-gate ${a.gate.cleared || awaitingOwnSignature ? 'ok' : 'blocked'}`}
              role="status"
            >
              {a.gate.cleared || awaitingOwnSignature ? I.shieldCheck : I.lock}{' '}
              {a.gate.cleared
                ? 'Dispatch gate clear'
                : awaitingOwnSignature
                  ? 'Dispatch gate clear except for the release signature — the dispatch e-signature applies it'
                  : `Dispatch blocked — ${a.gate.blockers.length} ${
                      a.gate.blockers.length === 1 ? 'blocker' : 'blockers'
                    }`}
            </div>
            {awaitingOwnSignature && (
              <div className="scaf-note sc-mb">
                This submission type requires a 21 CFR Part 11 release signature, and none is on record
                for this sequence yet. When the sequence is dispatched, the dispatch e-signature is
                recorded as that release signature, and the server checks the full gate again with it
                on record before anything moves.
              </div>
            )}
            {!a.gate.cleared && !awaitingOwnSignature && (
              <ol className="sc-blockers">
                {a.gate.blockers.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ol>
            )}
            <div className="scaf-note sc-mb">
              {a.validationErrors} validation {a.validationErrors === 1 ? 'error' : 'errors'} ·{' '}
              {a.unacknowledgedShadowCriticals} unacknowledged shadow{' '}
              {a.unacknowledgedShadowCriticals === 1 ? 'critical' : 'criticals'} ·{' '}
              {a.shadowReviewRunCount} shadow {a.shadowReviewRunCount === 1 ? 'review' : 'reviews'}{' '}
              run · {a.leafCount} {a.leafCount === 1 ? 'leaf' : 'leaves'} · status{' '}
              {stageLabel({ status: a.sequenceStatus, validationStatus: seq.validationStatus })}
            </div>
            {/* `shadowReviewMissing` is a HARD blocker merged into the gate, so
                this note only ever rendered directly beneath "Dispatch blocked"
                — while saying the gate was clear and dispatch permitted. It
                now says what it is: the reason the gate blocks. */}
            {a.shadowReviewMissing && (
              <div className="sc-verdict tone-warn" role="status">
                No completed Shadow Review has run for this sequence — that is one of the reasons the
                gate blocks. Dispatch is not permitted until it has been adversarially reviewed.
              </div>
            )}
            {seq.status !== 'dispatched' && signerState === 'author' && (
              <div className="sc-verdict tone-warn" role="status">
                You created this sequence, so you cannot sign its freeze or dispatch. Separation of
                duties requires a different colleague with signing rights to sign both steps — arrange
                who that is before the sequence is ready.
              </div>
            )}
            {seq.status !== 'dispatched' && signerState === 'unresolved' && (
              <div className="sc-verdict tone-warn" role="status">
                No creator is recorded for this sequence, so nobody can show they are independent of it
                and its freeze and dispatch cannot be signed. Ask an administrator to establish who
                created it.
              </div>
            )}
            {seq.status !== 'dispatched' && signerState === 'unverified' && (
              <div className="scaf-note sc-mb">
                Whether you may sign this sequence could not be checked just now. The check runs again
                when you sign.
              </div>
            )}
            <div className="sc-disp-actions">
              {/* FREEZE reads `freezeGate`, not `gate`. `gate` is the dispatch
                  verdict and for IND / NDA / BLA / MAA it requires a §11.70
                  release signature to already exist. Freezing is how a sequence
                  becomes signable in the first place, so gating this button on
                  `gate` hid it until a release had been signed — for exactly
                  the four types that need one, the sequence could never leave
                  `validated` through this screen. The server has computed the
                  two verdicts separately since composeDispatchGatesForStep
                  landed; only the client was still reading the single one. */}
              {/* `?.` because this is network data, not a local value: a
                  payload without `freezeGate` must hide the button, not throw
                  and white-screen the workspace (hostilePayloadProbe). Missing
                  is treated as NOT cleared — fail closed. It never falls back
                  to `gate`, which is the defect this line is fixing. */}
              {freezeOpen && !cannotSign && seq.status === 'validated' && (
                <button
                  type="button"
                  className="sp-primary sc-btn"
                  onClick={() => onGoverned(seq, 'freeze')}
                >
                  {I.lock} Freeze sequence (Part 11 e-signature)
                </button>
              )}
              {/* DISPATCH reads `dispatchGateOnSigning`, not `gate` — the same
                  defect as Freeze, one step later (P11-28b). For IND / NDA / BLA
                  / MAA `gate` requires a release signature to exist already, and
                  on the submissions spine the signature it accepts is the one
                  this click records (runGoverned signs, then dispatches). Gated
                  on `gate`, the only control that creates the signature never
                  rendered. The server says when signing resolves the
                  requirement, and re-checks `gate` at transition with the new
                  signature on record, so nothing the server enforces is relaxed
                  here. When the signature is what this click supplies, the label
                  says so: the signer is applying the release, not only moving a
                  status (§11.50 — the meaning of the act must be clear). */}
              {dispatchOpen && !cannotSign && seq.status === 'frozen' && (
                <button
                  type="button"
                  className="sp-primary sc-btn"
                  onClick={() => onGoverned(seq, 'dispatch')}
                >
                  {I.rocket}{' '}
                  {awaitingOwnSignature
                    ? 'Sign the release and dispatch (Part 11 e-signature)'
                    : 'Dispatch sequence (Part 11 e-signature)'}
                </button>
              )}
            </div>
            <PackageAndTransmit
              sub={sub}
              seq={seq}
              canSign={!cannotSign}
              onTransmit={(req) => onGoverned(seq, 'transmit', req)}
            />
            {/* A freeze instruction reads the FREEZE verdict. Gated on `gate`,
                it was hidden for every IND / NDA / BLA / MAA sequence — a third
                instance of the step-verdict defect, beside the two buttons. */}
            {freezeOpen &&
              seq.status !== 'validated' &&
              seq.status !== 'frozen' &&
              seq.status !== 'dispatched' && (
                <div className="scaf-note sc-mt">
                  The governed freeze needs the sequence at Validated (currently{' '}
                  {SC_SEQ_STATUS[seq.status]?.l ?? seq.status}) — move it forward in the Sequences
                  workspace first.
                </div>
              )}
            {/* Say what is locked, for the step this sequence is at. This read
                "Freeze and dispatch stay locked while the gate blocks" whenever
                `gate` blocked — including beside a rendered Freeze button, once
                Freeze read its own verdict: a sentence on screen contradicting
                the control under it. */}
            {((seq.status === 'validated' && !freezeOpen) ||
              (seq.status === 'frozen' && !dispatchOpen) ||
              (seq.status !== 'validated' &&
                seq.status !== 'frozen' &&
                seq.status !== 'dispatched' &&
                !freezeOpen)) && (
              <div className="scaf-note sc-mt">
                {seq.status === 'validated'
                  ? 'Freeze stays locked while the gate blocks.'
                  : seq.status === 'frozen'
                    ? 'Dispatch stays locked while the gate blocks.'
                    : 'Freeze and dispatch stay locked while the gate blocks.'}{' '}
                The server enforces this same gate atomically with the e-signature, so it cannot be
                bypassed from here.
              </div>
            )}
            <div className="cm-pushbar sc-mt">
              <button
                type="button"
                className="sc-trans-b"
                disabled={qc.phase === 'running'}
                onClick={runQc}
              >
                {I.shieldCheck}{' '}
                {qc.phase === 'running' ? 'Running dispatch QC…' : 'Run dispatch QC'}
              </button>
            </div>
            {qc.phase === 'error' && (
              <div className="sc-verdict tone-err sc-mt" role="status">
                Dispatch QC did not complete — {qc.error}. The deterministic gate above is
                unaffected.
              </div>
            )}
            {qc.phase === 'done' && qc.data && (
              <div className="sc-mt">
                {/* With a sequence the QC verdict IS the composed dispatch gate
                    (verdictSource 'assess-dispatch-readiness'); it cannot disagree
                    with the assessment above. The counts-only fallback covers
                    less and says so in its warnings. Either way the tone follows
                    the gate, never a model. */}
                <div
                  className={`sc-verdict ${qc.data.clearedToDispatch && a?.gate.cleared ? 'tone-ok' : 'tone-warn'}`}
                  role="status"
                >
                  Dispatch QC: {qc.data.clearedToDispatch ? 'cleared to dispatch' : 'not cleared'}
                  {qc.data.blockers.length > 0 ? ` — ${qc.data.blockers.join(' ')}` : ''}
                  {qc.data.warnings.length > 0 ? ` Warnings: ${qc.data.warnings.join(' ')}` : ''}
                  {a && !a.gate.cleared
                    ? ' The deterministic gate above still blocks dispatch; this verdict does not override it.'
                    : qc.data.verdictSource === 'dispatch-gate'
                      ? ' Verdict from the count-based gate only; the sequence-level checks above were not part of it.'
                      : ' Verdict from the deterministic sequence dispatch gate.'}
                </div>
                {qc.data.narrative ? (
                  <div className="sc-verdict sc-mt" role="note">
                    <span className="sp-row-s">{qc.data.narrative.label}</span>
                    <p>{qc.data.narrative.summary}</p>
                    {qc.data.narrative.observations.length > 0 && (
                      <ul>
                        {qc.data.narrative.observations.map((o, i) => (
                          <li key={i}>{o}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : qc.data.narrativeUnavailable ? (
                  <div className="sc-verdict sc-mt" role="note">
                    No model narrative: {qc.data.narrativeUnavailable.message} The verdict above is
                    unaffected.
                  </div>
                ) : null}
                <div className="sp-list">
                  {qc.data.checklist.map((c, i) => (
                    <div key={i} className="sp-row">
                      <span className={`rd-chip tone-${c.pass ? 'ok' : 'warn'}`}>
                        {c.pass ? 'pass' : 'fail'}
                      </span>
                      <span className="sp-row-b">
                        <span className="sp-row-s">{c.item}</span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
