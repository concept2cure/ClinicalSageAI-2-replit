/**
 * Submission Center — per-sequence workspaces (Builder / Validation / Shadow
 * Review / Cross-region / Dispatch), extracted from SubmissionCenter.tsx when
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
 *   Cross-region POST /api/submissions/:id/cross-region
 *   Dispatch     GET /api/submissions/sequences/:seqId/dispatch-readiness
 *                POST /api/submissions/:id/dispatch-qc  (AI advisory)
 */
import React from 'react';
import { I } from '../icons';
import { apiRequest, serverMessage, redactInternals } from '@/lib/queryClient';
import { useLiveRows, useLiveData, hasKeys, isRowsWith, liveGetOrNull, EmptyState } from '../dataConnect';
import { assessmentStateFor } from '../assessmentState';
import { documentSourceLabel } from '@shared/regulatory/canonical-document';
import {
  SC_LENSES,
  SC_LIFECYCLE_OPS,
  SC_FIND_SEV,
  SC_FIND_STATUS,
  SC_REGIONS,
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

const regL = (v: string) => SC_REGIONS.find((a) => a.v === v)?.l ?? v;
const lensL = (v: string) => SC_LENSES.find((l) => l.v === v)?.l ?? v;

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
  method: 'POST' | 'PUT',
  path: string,
  body?: unknown,
): Promise<MutateResult<T>> {
  try {
    const res = await apiRequest(method, path, body);
    if (!res.ok) {
      const p = (await res.json().catch(() => null)) as unknown;
      return { data: null, error: messageFromBody(p, res.status) };
    }
    return { data: (await res.json().catch(() => null)) as T };
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
    const base = known
      ? (e as { message: string }).message
      : 'The change was not saved. Check your connection and try again.';
    return {
      data: null,
      error: typeof detail === 'string' && detail && !base.includes(detail) ? `${base} — ${detail}` : base,
    };
  }
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
    return <div className="scaf-note sc-mb">Loading this submission&#39;s sequences…</div>;
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
            {s.sequenceNumber} · {s.type} · {SC_SEQ_STATUS[s.status]?.l ?? s.status}
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
  documentType: string | null;
}

// GET /api/coauthor/documents → { documents } (coauthor_documents rows).
interface CoauthorDocRow {
  id: number;
  title: string;
  moduleNumber: string | null; // e.g. "3.2.S.4.1" — prefills the section code
  status: string;
}

/** Place a Co-Author document into the sequence as a leaf — a REAL persisted
 *  PUT (upsertLeaf), sourced from the real coauthor_documents list. No source
 *  document, no leaf: the picker never invents a document to place. */
function AddLeafForm({ seqId, onDone }: { seqId: number; onDone: (n: Notice) => void }) {
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
  const [saving, setSaving] = React.useState(false);
  const doc = docRows.find((d) => d.id === docId) ?? null;

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
    if (!doc || !section.trim() || saving) return;
    setSaving(true);
    const r = await mutateVerbatim<LeafRow>('PUT', `/api/submissions/sequences/${seqId}/leaves`, {
      sectionCode: section.trim(),
      title: doc.title,
      lifecycleOp: op,
      documentTable: 'coauthor_documents',
      documentId: doc.id,
    });
    setSaving(false);
    if (r.data && typeof r.data.id === 'number') {
      onDone({
        tone: 'ok',
        text: `Leaf ${typeof r.data.sectionCode === 'string' ? r.data.sectionCode : '(section code not returned)'} placed from “${doc.title}” — server-confirmed (leaf #${r.data.id}).`,
      });
      setDocId(null);
      setSection('');
    } else {
      onDone({ tone: 'err', text: `The leaf was not placed — ${r.error ?? 'the request failed'}.` });
    }
  };

  return (
    <div className="sc-mt">
      {docs.loading ? (
        <div className="scaf-note">Loading the Co-Author documents…</div>
      ) : docs.error ? (
        <div className="sc-verdict tone-err" role="status">
          Couldn&#39;t load the Co-Author documents — {redactInternals(docs.error, 'the read did not settle')}. Nothing to place.
        </div>
      ) : docRows.length === 0 ? (
        <div className="scaf-note">
          No Co-Author documents in this organization yet — author one in the eCTD Co-Author
          first, then place it here as a leaf.
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
              value={op}
              onChange={(e) => setOp(e.target.value)}
            >
              {Object.entries(SC_LIFECYCLE_OPS).map(([v, m]) => (
                <option key={v} value={v}>
                  {m.l}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="sp-primary sc-btn"
            disabled={!doc || !section.trim() || saving}
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

export function BuilderWorkspace({ seq }: { seq: SeqRow }) {
  const [bump, setBump] = React.useState(0);
  const leavesPath = `/api/submissions/sequences/${seq.id}/leaves`;
  /* The module header promises a wrong-shaped 200 reaches the error branch;
     that held for the two useLiveData reads and not for these three, which
     flattened a non-array body to zero rows and rendered "nothing here yet". */
  const leaves = useLiveRows<LeafRow>(leavesPath, [leavesPath, bump], isRowsWith<LeafRow>('id', 'sectionCode'));
  const [notice, setNotice] = React.useState<Notice | null>(null);
  const locked = seq.status === 'frozen' || seq.status === 'dispatched';

  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Builder · eCTD leaves · sequence {seq.sequenceNumber}</span>
        <span className="s">governed leaves</span>
      </div>
      <div className="pj-card-b">
        <VerdictNote notice={notice} />
        {leaves.loading ? (
          <div className="scaf-note" style={{ padding: '18px 10px' }}>
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
                    {l.documentTable && l.documentId != null ? (
                      /* The source row, named rather than related. The id stays —
                         it is how an auditor ties this leaf to its source — but
                         it is qualified by a store name a reader can act on
                         instead of by a relation name (documentSourceLabel). */
                      <span className="sc-mono">{documentSourceLabel(l.documentTable, l.documentId)}</span>
                    ) : (
                      'unlinked'
                    )}
                  </td>
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
          <AddLeafForm
            seqId={seq.id}
            onDone={(n) => {
              setNotice(n);
              if (n.tone === 'ok') setBump((b) => b + 1);
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

/* ═══ Validation — deterministic findings + AI explain ══════════════════════ */

// GET /sequences/:seqId/dispatch-readiness → assessSequenceDispatchReadiness
// (server/services/ectd/assess-dispatch-readiness.ts). Server-computed inputs;
// findings' `code` is the validation-rule id (traceable to /validation-rules).
interface ReadinessFinding {
  severity: 'error' | 'warning' | 'info';
  code: string;
  sectionCode: string | null;
  message: string;
}
interface ReadinessAssessment {
  sequenceId: number;
  region: string;
  sequenceStatus: string;
  validationErrors: number;
  unacknowledgedShadowCriticals: number;
  shadowReviewRunCount: number;
  shadowReviewMissing: boolean;
  gate: { cleared: boolean; blockers: string[] };
  readiness: { errors: number; warnings: number; infos: number; findings: ReadinessFinding[] };
  leafCount: number;
}

const VAL_SEV: Record<string, ToneMap> = {
  error: { l: 'Error', t: 'warn' },
  warning: { l: 'Warning', t: 'ai' },
  info: { l: 'Info', t: 'idle' },
};

// POST /:id/validation/explain → explainValidation (submission-ai-service).
interface ExplainRow {
  ruleId: string | null;
  severity: string;
  leaf: string | null;
  cause: string;
  fix: string;
}
interface ExplainResponse {
  explained: ExplainRow[];
  summary: string;
  blocking: boolean;
}

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
  }>({ phase: 'idle' });
  React.useEffect(() => setExplain({ phase: 'idle' }), [seq.id]);

  const runExplain = async () => {
    if (findings.length === 0 || explain.phase === 'running') return;
    setExplain({ phase: 'running' });
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
    if (r.data && Array.isArray(r.data.explained)) setExplain({ phase: 'done', data: r.data });
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
          <div className="scaf-note" style={{ padding: '18px 10px' }}>
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
            <div className="scaf-note sc-mb">
              Sequence {seq.sequenceNumber} · {a.leafCount} {a.leafCount === 1 ? 'leaf' : 'leaves'} ·{' '}
              {a.readiness.errors} {a.readiness.errors === 1 ? 'error' : 'errors'} ·{' '}
              {a.readiness.warnings} {a.readiness.warnings === 1 ? 'warning' : 'warnings'} ·{' '}
              {a.readiness.infos} info · computed server-side from the canonical leaves. Each
              finding&#39;s code is a rule id in the validation corpus.
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
            {explain.phase === 'error' && (
              <div className="sc-verdict tone-err sc-mt" role="status">
                The findings could not be explained — {explain.error}. The deterministic findings
                above stand on their own.
              </div>
            )}
            {explain.phase === 'done' && explain.data && (
              <div className="sc-mt">
                <div className="scaf-note sc-mb">
                  {explain.data.blocking ? 'Blocking. ' : ''}
                  {explain.data.summary}
                </div>
                <div className="sp-list">
                  {explain.data.explained.map((e, i) => (
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
                        <span className="sp-row-s">Fix: {e.fix}</span>
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

  const runReview = async () => {
    if (running) return;
    setRunning(true);
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
        <VerdictNote notice={notice} />
        {runs.loading ? (
          <div className="scaf-note" style={{ padding: '18px 10px' }}>
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
                    <td className="sc-mono">#{r.id}</td>
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
                  <div className="scaf-note">Loading run #{run.id}&#39;s findings…</div>
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

/* ═══ Cross-region — real gap computation off the sequence's leaves ═════════ */

// POST /:id/cross-region → computeCrossRegionGap (submission-ai-service).
interface CrossRegionPerRegion {
  region: string;
  module1Deltas: string[];
  bridgingNeeded: boolean;
  bridgingRationale: string | null;
  translationScope: string;
  formatConversion: string;
}

export function CrossRegionWorkspace({ sub, seq }: { sub: SubLike; seq: SeqRow }) {
  const [state, setState] = React.useState<{
    phase: 'idle' | 'running' | 'done' | 'error';
    data?: CrossRegionPerRegion[];
    error?: string;
    basis?: string;
  }>({ phase: 'idle' });
  React.useEffect(() => setState({ phase: 'idle' }), [sub.id, seq.id]);

  const targets = ['fda', 'eu', 'jp'].filter((r) => r !== sub.primaryRegion);

  const runGap = async () => {
    if (state.phase === 'running') return;
    setState({ phase: 'running' });
    // The analysis floors on the sequence's REAL section inventory — read the
    // canonical leaves first; if that read fails, report it rather than run
    // the analysis on inputs we do not have.
    const leaves = await liveGetOrNull<LeafRow[]>(`/api/submissions/sequences/${seq.id}/leaves`);
    if (leaves.error) {
      setState({
        phase: 'error',
        error: `couldn't read sequence ${seq.sequenceNumber}'s leaves for the analysis — ${redactInternals(leaves.error, 'the read did not settle')}`,
      });
      return;
    }
    const sectionsPresent = (Array.isArray(leaves.data) ? leaves.data : []).map((l) => l.sectionCode);
    const r = await mutateVerbatim<{ perRegion: CrossRegionPerRegion[] }>(
      'POST',
      `/api/submissions/${sub.id}/cross-region`,
      {
        sourceRegion: sub.primaryRegion,
        targetRegions: targets,
        applicationType: sub.applicationType,
        sectionsPresent,
      },
    );
    if (r.data && Array.isArray(r.data.perRegion)) {
      setState({
        phase: 'done',
        data: r.data.perRegion,
        basis: `computed from sequence ${seq.sequenceNumber}'s ${sectionsPresent.length} ${
          sectionsPresent.length === 1 ? 'leaf' : 'leaves'
        }`,
      });
    } else {
      setState({ phase: 'error', error: r.error ?? 'unexpected response shape' });
    }
  };

  return (
    <div className="pj-card">
      <div className="pj-card-h">
        <span className="t">Cross-region gap analysis · sequence {seq.sequenceNumber}</span>
        <span className="s">cross-region</span>
      </div>
      <div className="pj-card-b">
        <div className="scaf-note sc-mb">
          What the {regL(sub.primaryRegion)} sequence is missing to file the same program in{' '}
          {targets.map(regL).join(' and ')}.
        </div>
        {state.phase === 'idle' && (
          <EmptyState
            icon={I.gitBranch}
            title="No cross-region gap analysis yet"
            hint="Run one to compare this sequence's real section inventory against the other regions' requirements — reusable content vs. the gaps you'd need to close to file there."
          />
        )}
        {state.phase === 'running' && (
          <div className="scaf-note" style={{ padding: '18px 10px' }}>
            Computing the cross-region gaps from the sequence&#39;s leaves…
          </div>
        )}
        {state.phase === 'error' && (
          <div className="sc-verdict tone-err" role="status">
            The gap analysis did not complete — {redactInternals(state.error, 'the analysis did not settle')}. No gaps were invented in its place.
          </div>
        )}
        {state.phase === 'done' && state.data && (
          <>
            {state.basis ? <div className="scaf-note sc-mb">{state.basis}</div> : null}
            <div className="sp-list">
              {state.data.map((p, i) => (
                <div key={i} className="sp-row">
                  <span className="sp-tag2">{regL(p.region)}</span>
                  <span className="sp-row-b">
                    <span className="sp-row-t">
                      {p.bridgingNeeded ? 'Bridging needed' : 'No bridging flagged'} {I.dot}{' '}
                      translation: {p.translationScope} {I.dot} format: {p.formatConversion}
                    </span>
                    {p.module1Deltas.length > 0 ? (
                      <span className="sp-row-s">Module 1 deltas: {p.module1Deltas.join('; ')}</span>
                    ) : (
                      <span className="sp-row-s">No Module 1 deltas reported.</span>
                    )}
                    {p.bridgingRationale ? (
                      <span className="sp-row-s">{p.bridgingRationale}</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
        {state.phase !== 'running' && (
          <div className="cm-pushbar sc-mt">
            <button type="button" className="sp-primary sc-btn" onClick={runGap}>
              {I.sparkles} {state.phase === 'done' ? 'Re-run gap analysis' : 'Run gap analysis'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══ Dispatch — the deterministic gate + governed freeze/dispatch ══════════ */

// POST /:id/dispatch-qc → runDispatchQc (AI advisory; server recomputes the
// gate inputs from the sequence when sequenceId is supplied).
interface DispatchQcResult {
  clearedToDispatch: boolean;
  blockers: string[];
  warnings: string[];
  checklist: Array<{ item: string; pass: boolean }>;
}

export function DispatchWorkspace({
  sub,
  seq,
  onGoverned,
}: {
  sub: SubLike;
  seq: SeqRow;
  onGoverned: (seq: SeqRow, kind: 'freeze' | 'dispatch') => void;
}) {
  const path = `/api/submissions/sequences/${seq.id}/dispatch-readiness`;
  const live = useLiveData<ReadinessAssessment>(
    path,
    [path, seq.status],
    hasKeys<ReadinessAssessment>('gate', 'readiness'),
  );
  const a = live.data;
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
       the sequence does not have. Read the real leaves first, as the
       cross-region analysis already does; refuse the run if they cannot be read. */
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
          <div className="scaf-note" style={{ padding: '18px 10px' }}>
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
            <div className={`sc-gate ${a.gate.cleared ? 'ok' : 'blocked'}`} role="status">
              {a.gate.cleared ? I.shieldCheck : I.lock}{' '}
              {a.gate.cleared
                ? 'Dispatch gate clear'
                : `Dispatch blocked — ${a.gate.blockers.length} ${
                    a.gate.blockers.length === 1 ? 'blocker' : 'blockers'
                  }`}
            </div>
            {!a.gate.cleared && (
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
              {SC_SEQ_STATUS[a.sequenceStatus]?.l ?? a.sequenceStatus}
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
            <div className="sc-disp-actions">
              {a.gate.cleared && seq.status === 'validated' && (
                <button
                  type="button"
                  className="sp-primary sc-btn"
                  onClick={() => onGoverned(seq, 'freeze')}
                >
                  {I.lock} Freeze sequence (Part 11 e-signature)
                </button>
              )}
              {a.gate.cleared && seq.status === 'frozen' && (
                <button
                  type="button"
                  className="sp-primary sc-btn"
                  onClick={() => onGoverned(seq, 'dispatch')}
                >
                  {I.rocket} Dispatch sequence (Part 11 e-signature)
                </button>
              )}
            </div>
            {seq.status === 'dispatched' && (
              <div className="scaf-note sc-mt">
                Sequence {seq.sequenceNumber} is dispatched. Wire transmission to the agency
                gateway runs through the governed transmit path, and only when the region gateway
                is configured for this organization.
              </div>
            )}
            {a.gate.cleared &&
              seq.status !== 'validated' &&
              seq.status !== 'frozen' &&
              seq.status !== 'dispatched' && (
                <div className="scaf-note sc-mt">
                  The governed freeze needs the sequence at Validated (currently{' '}
                  {SC_SEQ_STATUS[seq.status]?.l ?? seq.status}) — move it forward in the Sequences
                  workspace first.
                </div>
              )}
            {!a.gate.cleared && (
              <div className="scaf-note sc-mt">
                Freeze and dispatch stay locked while the gate blocks. The server enforces this
                same gate atomically with the e-signature, so it cannot be bypassed from here.
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
                {qc.phase === 'running' ? 'Running dispatch QC…' : 'Run dispatch QC (AI advisory)'}
              </button>
            </div>
            {qc.phase === 'error' && (
              <div className="sc-verdict tone-err sc-mt" role="status">
                The dispatch QC advisory did not complete — {qc.error}. The deterministic gate
                above is unaffected.
              </div>
            )}
            {qc.phase === 'done' && qc.data && (
              <div className="sc-mt">
                {/* The advisory's verdict is floored on the STRUCTURAL gate only —
                    not the shadow-presence or external-validation gates the
                    deterministic assessment merges in — so it could sit green
                    under "Dispatch blocked" with no qualifier. It never outranks
                    the gate, and says so; under a blocked gate it is never green. */}
                <div
                  className={`sc-verdict ${qc.data.clearedToDispatch && a?.gate.cleared ? 'tone-ok' : 'tone-warn'}`}
                  role="status"
                >
                  QC advisory: {qc.data.clearedToDispatch ? 'cleared to dispatch' : 'not cleared'}
                  {qc.data.blockers.length > 0 ? ` — ${qc.data.blockers.join(' ')}` : ''}
                  {qc.data.warnings.length > 0 ? ` Warnings: ${qc.data.warnings.join(' ')}` : ''}
                  {a && !a.gate.cleared
                    ? ' The deterministic gate above still blocks dispatch; this advisory does not override it.'
                    : ' Advisory only — the deterministic gate above decides.'}
                </div>
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
