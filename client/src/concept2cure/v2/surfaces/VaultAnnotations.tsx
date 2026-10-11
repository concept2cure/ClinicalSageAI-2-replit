/**
 * Review annotations on a Vault version (plan critique 15, rows D2 and D5).
 *
 * GET  /api/c2c/project-vault/:id/documents/:documentId/annotations, …/text?from=&length=
 * POST /api/c2c/project-vault/:id/documents/:documentId/annotations
 * POST /api/c2c/project-vault/:id/annotations/:annotationId/(replies|resolve|retract)
 *
 * Lists the annotations of every version of the document as the server returns
 * them (server/services/vault/vault-annotations.ts), with each version's open
 * count. A new annotation is posted on the version the panel is opened on,
 * anchored to the whole version, a page when its page count is recorded, or a
 * passage of its extracted text, counted in code points as the server counts
 * them: the browser's UTF-16 selection offsets are converted before sending,
 * with the text's SHA-256 as read. The server records every text read; a
 * page-count read asks for one character. Nothing is claimed before a 2xx, and
 * a list that could not be read is never shown as empty.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { GOVERNED_REASON_MIN } from '@shared/constants/governed-reason';
import { ApiRequestError, apiRequest, redactInternals, serverMessage } from '@/lib/queryClient';
import { useAuthUser } from '@/services/portal/authService';
import type { ShapeGuard } from '../dataConnect';

type Kind = 'comment' | 'request_changes';
type Status = 'open' | 'resolved' | 'retracted';

export type AnnotationAnchorShape =
  | { kind: 'document' }
  | { kind: 'page'; page: number; pagesAtPost: number }
  | { kind: 'text'; quote: string; charStart: number; charEnd: number; textSha256: string };

export interface AnnotationShape {
  id: string; parentId: string | null; versionId: string; versionLabel: string | null; kind: Kind;
  anchor: AnnotationAnchorShape | null; anchorCurrent: boolean | null; status: Status; body: string;
  authorId: number; authorName: string; createdAt: string;
  resolution: { byId: number; byName: string; at: string; note: string; addressedIn: { versionId: string; versionLabel: string | null } | null } | null;
  retraction: { byId: number; byName: string; at: string; reason: string } | null;
  replies: AnnotationShape[];
}

export interface OpenByVersion { versionId: string; versionLabel: string | null; current: boolean; open: number; openChangeRequests: number }

export interface AnnotationsShape { annotations: AnnotationShape[]; openByVersion: OpenByVersion[] }

export const isAnnotationsShape: ShapeGuard<AnnotationsShape> = (v): v is AnnotationsShape =>
  !!v && typeof v === 'object' && Array.isArray((v as AnnotationsShape).annotations) && Array.isArray((v as AnnotationsShape).openByVersion);

interface TextWindow { text: string; from: number; length: number; totalLength: number; textSha256: string; pageCount: number | null }

const isTextWindow = (v: unknown): v is TextWindow => {
  const w = v as TextWindow | null;
  return !!w && typeof w.text === 'string' && typeof w.from === 'number' && typeof w.totalLength === 'number' && typeof w.textSha256 === 'string';
};

const BODY_MAX = 4000;
const QUOTE_MAX = 2000;
const TEXT_WINDOW_MAX = 200_000;
const FILTERS: Array<{ value: Status; label: string; none: string }> = [
  { value: 'open', label: 'Open', none: 'No annotation is open.' },
  { value: 'resolved', label: 'Resolved', none: 'No annotation has been resolved.' },
  { value: 'retracted', label: 'Retracted', none: 'No annotation has been retracted.' },
];
const READ_FAILED = 'The review annotations could not be read; none are shown rather than an incomplete list.';

const base = (projectId: string) => `/api/c2c/project-vault/${encodeURIComponent(projectId)}`;
const docUrl = (projectId: string, documentId: string) => `${base(projectId)}/documents/${encodeURIComponent(documentId)}`;
const versionName = (label: string | null) => (label ? `v${label}` : 'an unnumbered version');
const said = (e: unknown) => (e instanceof Error ? e.message : String(e));
const n = (v: number) => v.toLocaleString('en-US');
const chars = (s: string) => Array.from(s).length;

/** An ISO time as YYYY-MM-DD HH:MM UTC. */
function utc(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : `${d.toISOString().slice(0, 16).replace('T', ' ')} UTC`;
}

/** One request; a refusal or a dropped connection becomes an Error with the sentence to show. */
async function call<T>(method: 'GET' | 'POST', url: string, body: unknown, failed: string): Promise<T> {
  let res: Response;
  try {
    res = await apiRequest(method, url, body);
  } catch (e) {
    const detail = e instanceof ApiRequestError ? serverMessage(e.payload) : null;
    throw new Error(`${failed} ${redactInternals(detail ?? (e instanceof Error ? e.message : ''), 'The connection dropped.')}`, { cause: e });
  }
  const json = (await res.json().catch(() => null)) as { data?: T } | null;
  if (!res.ok) throw new Error(`${failed} ${redactInternals(serverMessage(json), `The Vault refused it (HTTP ${res.status}).`)}`);
  return (json?.data ?? ({} as T));
}

/** One act at a time: busy while the server is asked, and the refusal in words. */
function useSubmit() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (act: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await act();
    } catch (e) {
      setError(said(e));
    } finally {
      setBusy(false);
    }
  };
  return { busy, error, submit };
}

/**
 * A selection of `text` given in UTF-16 offsets, as code points: where it
 * starts and what it quotes. Null when it is empty or either end splits a
 * surrogate pair (half a character cannot be quoted).
 */
export function codePointRange(text: string, utf16Start: number, utf16End: number): { charStart: number; quote: string } | null {
  if (!Number.isInteger(utf16Start) || !Number.isInteger(utf16End)) return null;
  if (utf16Start < 0 || utf16End <= utf16Start || utf16End > text.length) return null;
  const splits = (i: number) => {
    const before = text.charCodeAt(i - 1);
    const after = text.charCodeAt(i);
    return i > 0 && i < text.length && before >= 0xd800 && before <= 0xdbff && after >= 0xdc00 && after <= 0xdfff;
  };
  if (splits(utf16Start) || splits(utf16End)) return null;
  return { charStart: chars(text.slice(0, utf16Start)), quote: text.slice(utf16Start, utf16End) };
}

const changeRequests = (k: number) => (k === 0 ? 'no change requests' : `${k} change request${k === 1 ? '' : 's'}`);
const versionCount = (v: OpenByVersion) => `${versionName(v.versionLabel)} — ${v.open} (${changeRequests(v.openChangeRequests)})`;

/** What was open on each version of the document, in one sentence, for the review and approval dialogs. */
export function openAnnotationsSentence(openByVersion: OpenByVersion[] | null): string {
  if (!openByVersion) return 'The open annotations on this document could not be read, so none are listed here.';
  const open = openByVersion.filter((v) => v.open > 0);
  if (open.length === 0) return 'No annotations were open on any version of this document.';
  const total = open.reduce((sum, v) => sum + v.open, 0);
  return `${total === 1 ? 'This annotation was' : 'These annotations were'} open: ${open.map(versionCount).join('; ')}.`;
}

function openSummary(openByVersion: OpenByVersion[]): string {
  const open = openByVersion.filter((v) => v.open > 0);
  return open.length === 0 ? 'No open annotations on any version of this document.' : `Open: ${open.map(versionCount).join(' · ')}`;
}

/** The page count an annotation on this version shows is still current, if any. */
function pagesFromAnnotations(data: AnnotationsShape | null, documentId: string): number | undefined {
  const a = data?.annotations.find((x) => x.versionId === documentId && x.anchor?.kind === 'page' && x.anchorCurrent === true);
  return a?.anchor?.kind === 'page' ? a.anchor.pagesAtPost : undefined;
}

function useActorId(given: number | null | undefined): number | null {
  const user = useAuthUser();
  if (given !== undefined) return given;
  return user?.id && /^\d+$/.test(user.id) ? Number(user.id) : null;
}

/** The list is read on mount and again whenever `refreshKey` changes (the parent bumps it after a change). */
function useAnnotations(projectId: string, documentId: string, refreshKey: number | undefined) {
  const [data, setData] = useState<AnnotationsShape | null>(null);
  const [readError, setReadError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setReadError(null);
    try {
      const d = await call<unknown>('GET', `${docUrl(projectId, documentId)}/annotations`, undefined, READ_FAILED);
      if (!isAnnotationsShape(d)) throw new Error(`${READ_FAILED} The answer was not in the expected form.`);
      setData(d);
    } catch (e) {
      setData(null);
      setReadError(said(e));
    }
  }, [projectId, documentId]);
  useEffect(() => { void load(); }, [load, refreshKey]);
  return { data, readError };
}

interface Ctx { projectId: string; actorId: number | null; currentId: string | null; family: OpenByVersion[]; onDone: (text: string) => void }
type ActProps = { a: AnnotationShape; ctx: Ctx; onClose: () => void };

const actUrl = (ctx: Ctx, id: string, act: 'replies' | 'resolve' | 'retract') =>
  `${base(ctx.projectId)}/annotations/${encodeURIComponent(id)}/${act}`;

/** A text the server needs before it acts: a reply, a resolution note or a retraction reason. */
function ActForm({ label, min, placeholder, submit, run, onClose, testid, children }: {
  label: string; min: number; placeholder: string; submit: string; testid: string;
  run: (text: string) => Promise<void>; onClose: () => void; children?: React.ReactNode;
}) {
  const [text, setText] = useState('');
  const s = useSubmit();
  const length = chars(text.trim());
  const ready = !s.busy && length >= min && length <= BODY_MAX;
  // Closed only once the server recorded it; a refusal keeps the words.
  const send = async () => {
    await run(text.trim());
    onClose();
  };
  return (
    <div className="vd-d-filing" data-testid={testid}>
      <label className="vd-d-filing-row">
        <span className="k">{label}</span>
        <textarea className="vd-d-filing-reason" rows={3} value={text} disabled={s.busy} placeholder={placeholder}
          onChange={(e) => setText(e.target.value)} />
      </label>
      {children}
      <div className="vd-d-filing-acts">
        <button className="sp-primary" disabled={!ready} onClick={() => void s.submit(send)}>{s.busy ? 'Sending…' : submit}</button>
        <button className="sp-ask" disabled={s.busy} onClick={onClose}>Cancel</button>
      </div>
      {s.error ? <div className="vd-dr-err" role="alert">{s.error}</div> : null}
    </div>
  );
}

function ResolveForm({ a, ctx, onClose }: ActProps) {
  const [addressed, setAddressed] = useState('');
  const run = async (note: string) => {
    await call('POST', actUrl(ctx, a.id, 'resolve'), { note, ...(addressed ? { addressedInVersionId: addressed } : {}) },
      'The annotation was not resolved.');
    ctx.onDone("Annotation resolved. Your note is recorded in the document's history.");
  };
  return (
    <ActForm label="Resolution note" min={GOVERNED_REASON_MIN} submit="Resolve annotation" run={run} onClose={onClose}
      placeholder={`Required, at least ${GOVERNED_REASON_MIN} characters. Recorded with the resolution.`} testid="vault-annotation-resolve-form">
      <label className="vd-d-filing-row">
        <span className="k">Addressed in</span>
        <select className="vd-d-move-sel" value={addressed} onChange={(e) => setAddressed(e.target.value)} data-testid="vault-annotation-addressed">
          <option value="">No version named</option>
          {ctx.family.map((v) => <option key={v.versionId} value={v.versionId}>{versionName(v.versionLabel)}{v.current ? ' (current)' : ''}</option>)}
        </select>
      </label>
    </ActForm>
  );
}

function RetractForm({ a, ctx, onClose }: ActProps) {
  const what = a.parentId ? 'reply' : 'annotation';
  const run = async (reason: string) => {
    await call('POST', actUrl(ctx, a.id, 'retract'), { reason }, `The ${what} was not retracted.`);
    ctx.onDone(`${a.parentId ? 'Reply' : 'Annotation'} retracted. Your reason is recorded in the document's history.`);
  };
  return (
    <ActForm label="Reason for retraction" min={GOVERNED_REASON_MIN} submit={`Retract ${what}`} run={run} onClose={onClose}
      placeholder={`Required, at least ${GOVERNED_REASON_MIN} characters. The words stay on the record.`} testid="vault-annotation-retract-form" />
  );
}

function ReplyForm({ a, ctx, onClose }: ActProps) {
  const run = async (body: string) => {
    await call('POST', actUrl(ctx, a.id, 'replies'), { body }, 'The reply was not posted.');
    ctx.onDone("Reply posted. Recorded in the document's history.");
  };
  return <ActForm label="Reply" min={1} submit="Post reply" placeholder="At most 4,000 characters." run={run} onClose={onClose} testid="vault-annotation-reply-form" />;
}

function RootActions({ a, ctx }: { a: AnnotationShape; ctx: Ctx }) {
  const [mode, setMode] = useState<'reply' | 'resolve' | 'retract' | null>(null);
  const close = () => setMode(null);
  if (mode === 'reply') return <ReplyForm a={a} ctx={ctx} onClose={close} />;
  if (mode === 'resolve') return <ResolveForm a={a} ctx={ctx} onClose={close} />;
  if (mode === 'retract') return <RetractForm a={a} ctx={ctx} onClose={close} />;
  return (
    <div className="vd-d-filing-acts">
      <button className="sp-ask" onClick={() => setMode('reply')}>Reply</button>
      <button className="sp-ask" onClick={() => setMode('resolve')}>Resolve</button>
      {ctx.actorId !== null && ctx.actorId === a.authorId ? <button className="sp-ask" onClick={() => setMode('retract')}>Retract</button> : null}
    </div>
  );
}

function AnchorView({ a }: { a: AnnotationShape }) {
  const stale = a.anchorCurrent === false;
  if (a.anchor?.kind === 'page') {
    return (
      <>
        <div className="vd-ver-m">Page {a.anchor.page} of {a.anchor.pagesAtPost}</div>
        {stale ? <div className="vd-ver-m">This version&apos;s page count has changed since this was posted.</div> : null}
      </>
    );
  }
  if (a.anchor?.kind === 'text') {
    return (
      <>
        <blockquote className="vd-d-preview">{a.anchor.quote}</blockquote>
        {stale ? <div className="vd-ver-m">The extracted text has changed since this was posted; the quote is as the reviewer saw it.</div> : null}
      </>
    );
  }
  return a.anchor?.kind === 'document' ? <div className="vd-ver-m">Whole document</div> : null;
}

function Outcome({ a }: { a: AnnotationShape }) {
  const r = a.resolution;
  const t = a.retraction;
  let text: string | null = null;
  if (r) text = `Resolved by ${r.byName} · ${utc(r.at)} · ${r.note}${r.addressedIn ? ` · addressed in ${versionName(r.addressedIn.versionLabel)}` : ''}`;
  else if (t) text = `Retracted by ${t.byName} · ${utc(t.at)} · ${t.reason}`;
  return text ? <div className="vd-ver-m" data-testid="vault-annotation-outcome">{text}</div> : null;
}

function ReplyView({ r, rootOpen, ctx }: { r: AnnotationShape; rootOpen: boolean; ctx: Ctx }) {
  const [retracting, setRetracting] = useState(false);
  const canRetract = rootOpen && r.status === 'open' && ctx.actorId !== null && ctx.actorId === r.authorId;
  return (
    <div className="vd-d-filing" data-testid="vault-annotation-reply">
      <div className="vd-d-filing-row"><span className="k">Reply</span><span className="v">{`${r.authorName} · ${utc(r.createdAt)}`}</span></div>
      <div className="vd-cmp-line">{r.body}</div>
      <Outcome a={r} />
      {canRetract && !retracting ? (
        <div className="vd-d-filing-acts"><button className="sp-ask" onClick={() => setRetracting(true)}>Retract reply</button></div>
      ) : null}
      {retracting ? <RetractForm a={r} ctx={ctx} onClose={() => setRetracting(false)} /> : null}
    </div>
  );
}

function AnnotationCard({ a, ctx }: { a: AnnotationShape; ctx: Ctx }) {
  return (
    <div className="vd-cmp" role="listitem" data-testid="vault-annotation">
      <div className="vd-cmp-head">
        {a.kind === 'request_changes' ? <span className="rd-chip tone-warn">Change request</span> : <span className="rd-chip tone-idle">Comment</span>}
        {a.versionId !== ctx.currentId ? <span className="vd-ver-m">Posted on {versionName(a.versionLabel)}</span> : null}
        <span className="vd-ver-m">{`${a.authorName} · ${utc(a.createdAt)}`}</span>
      </div>
      <AnchorView a={a} />
      <div className="vd-cmp-line">{a.body}</div>
      <Outcome a={a} />
      {a.replies.map((r) => <ReplyView key={r.id} r={r} rootOpen={a.status === 'open'} ctx={ctx} />)}
      {a.status === 'open' ? <RootActions a={a} ctx={ctx} /> : null}
    </div>
  );
}

function AnnotationList({ data, ctx }: { data: AnnotationsShape; ctx: Ctx }) {
  const [filter, setFilter] = useState<Status>('open');
  const shown = data.annotations.filter((a) => a.status === filter);
  return (
    <>
      <div className="vd-d-idx" data-testid="vault-annotations-summary">{openSummary(data.openByVersion)}</div>
      <div className="vd-d-filing-acts" role="group" aria-label="Show annotations">
        {FILTERS.map((f) => (
          <button key={f.value} className={filter === f.value ? 'sp-primary' : 'sp-ask'} aria-pressed={filter === f.value} onClick={() => setFilter(f.value)}>
            {`${f.label} (${data.annotations.filter((a) => a.status === f.value).length})`}
          </button>
        ))}
      </div>
      {shown.length === 0 ? <div className="vd-d-idx">{FILTERS.find((f) => f.value === filter)?.none}</div> : (
        <div className="vd-d-filing" role="list" aria-label="Review annotations">
          {shown.map((a) => <AnnotationCard key={a.id} a={a} ctx={ctx} />)}
        </div>
      )}
    </>
  );
}

// ── Posting an annotation and its anchor ────────────────────────────────────

type Choice = 'document' | 'page' | 'passage';
type AnchorRequest = { kind: 'document' } | { kind: 'page'; page: number } | { kind: 'text'; quote: string; charStart: number; textSha256: string };

/** Reads of the version's extracted text: one character for its page count, or a window to select from. */
function useTextRead(projectId: string, documentId: string) {
  const [win, setWin] = useState<TextWindow | null>(null);
  const [pageCount, setPageCount] = useState<number | null | undefined>(undefined);
  const s = useSubmit();
  const read = (from: number, length: number, failed: string) => s.submit(async () => {
    const d = await call<unknown>('GET', `${docUrl(projectId, documentId)}/text?from=${from}&length=${length}`, undefined, failed);
    if (!isTextWindow(d)) throw new Error(`${failed} The answer was not in the expected form.`);
    setPageCount(d.pageCount);
    if (length > 1) setWin(d);
  });
  return {
    win, pageCount, busy: s.busy, error: s.error,
    readPages: () => read(0, 1, 'The page count of this version could not be read.'),
    readWindow: (from: number) => read(from, TEXT_WINDOW_MAX, 'The text of this version could not be read.'),
  };
}

/** The selection inside the text as an absolute code-point anchor; a sentence when it cannot be one; null when nothing is selected. */
function selectedPassage(pre: HTMLElement | null, win: TextWindow): { quote: string; charStart: number } | string | null {
  const sel = window.getSelection();
  if (!pre || !sel || sel.rangeCount === 0 || sel.isCollapsed) return null;
  const node = pre.firstChild;
  if (!node || sel.anchorNode !== node || sel.focusNode !== node) return 'Select the passage within the text shown.';
  const r = codePointRange(win.text, Math.min(sel.anchorOffset, sel.focusOffset), Math.max(sel.anchorOffset, sel.focusOffset));
  if (!r) return 'That selection splits a character. Select the passage again.';
  if (chars(r.quote) > QUOTE_MAX) return 'A passage is at most 2,000 characters. Select a shorter one.';
  return { quote: r.quote, charStart: win.from + r.charStart };
}

function useAnchor(projectId: string, documentId: string, knownPages: number | undefined) {
  const [choice, setChoice] = useState<Choice>('document');
  const [page, setPage] = useState('');
  const [picked, setPicked] = useState<{ quote: string; charStart: number } | null>(null);
  const [selNote, setSelNote] = useState<string | null>(null);
  const text = useTextRead(projectId, documentId);
  const pageCount = text.pageCount !== undefined ? text.pageCount : knownPages;
  const choose = (c: Choice) => {
    setChoice(c);
    if (c === 'page' && pageCount === undefined && !text.busy) void text.readPages();
    if (c === 'passage' && !text.win && !text.busy) void text.readWindow(0);
  };
  const capture = (pre: HTMLElement | null) => {
    const r = text.win ? selectedPassage(pre, text.win) : null;
    if (r === null) return;
    setPicked(typeof r === 'string' ? null : r);
    setSelNote(typeof r === 'string' ? r : null);
  };
  const move = (from: number) => {
    setPicked(null);
    setSelNote(null);
    void text.readWindow(from);
  };
  const p = Number(page);
  let request: AnchorRequest | null = null;
  if (choice === 'document') request = { kind: 'document' };
  else if (choice === 'page' && pageCount && Number.isInteger(p) && p >= 1 && p <= pageCount) request = { kind: 'page', page: p };
  else if (choice === 'passage' && picked && text.win) request = { kind: 'text', ...picked, textSha256: text.win.textSha256 };
  return { choice, choose, page, setPage, pageCount, text, picked, selNote, capture, move, request };
}

type Anchor = ReturnType<typeof useAnchor>;

function PagePick({ x, disabled }: { x: Anchor; disabled: boolean }) {
  if (x.pageCount === undefined) {
    return x.text.error ? <div className="vd-dr-err" role="alert">{x.text.error}</div> : <div className="vd-d-idx">Reading the page count…</div>;
  }
  if (x.pageCount === null) return <div className="vd-d-idx">This version has no recorded page count. Anchor to the whole document or a passage.</div>;
  return (
    <label className="vd-d-filing-row">
      <span className="k">Page number</span>
      <input className="vd-d-filing-reason" type="number" min={1} max={x.pageCount} step={1} value={x.page} disabled={disabled}
        onChange={(e) => x.setPage(e.target.value)} data-testid="vault-annotations-page" />
      <span className="v">of {x.pageCount}</span>
    </label>
  );
}

function WindowMoves({ x, w }: { x: Anchor; w: TextWindow }) {
  if (w.totalLength <= TEXT_WINDOW_MAX) return null;
  return (
    <div className="vd-d-filing-acts">
      <button className="sp-ask" disabled={x.text.busy || w.from === 0} onClick={() => x.move(Math.max(0, w.from - TEXT_WINDOW_MAX))}>Earlier text</button>
      <button className="sp-ask" disabled={x.text.busy || w.from + w.length >= w.totalLength} onClick={() => x.move(w.from + w.length)}>Later text</button>
    </div>
  );
}

function PassagePick({ x }: { x: Anchor }) {
  const pre = useRef<HTMLElement | null>(null);
  const w = x.text.win;
  const picked = x.picked;
  return (
    <div className="vd-d-filing" data-testid="vault-annotations-passage">
      <div className="vd-d-idx">A passage is anchored to the extracted text, not to a page of the file.</div>
      {x.text.busy ? <div className="vd-d-idx">Reading the text…</div> : null}
      {x.text.error ? <div className="vd-dr-err" role="alert">{x.text.error}</div> : null}
      {w && w.totalLength === 0 ? <div className="vd-d-idx">The extracted text of this version is empty, so no passage can be selected.</div> : null}
      {w && w.totalLength > 0 ? (
        <>
          <div className="vd-ver-m">{`Characters ${n(w.from + 1)}–${n(w.from + w.length)} of ${n(w.totalLength)}. Select the passage in the text below.`}</div>
          <pre className="vd-cmp-lines vd-cmp-line" ref={(el) => { pre.current = el; }} tabIndex={0} aria-label="Extracted text of this version"
            onMouseUp={() => x.capture(pre.current)} onKeyUp={() => x.capture(pre.current)} data-testid="vault-annotations-text">{w.text}</pre>
          <WindowMoves x={x} w={w} />
        </>
      ) : null}
      {x.selNote ? <div className="vd-dr-err" role="alert">{x.selNote}</div> : null}
      {picked ? <div className="vd-ver-m">{`Selected: characters ${n(picked.charStart + 1)}–${n(picked.charStart + chars(picked.quote))}`}</div> : null}
      {picked ? <blockquote className="vd-d-preview" data-testid="vault-annotations-picked">{picked.quote}</blockquote> : null}
    </div>
  );
}

const CHOICES: Array<{ value: Choice; label: string }> = [
  { value: 'document', label: 'Whole document' }, { value: 'page', label: 'Page' }, { value: 'passage', label: 'Passage' },
];

function AddForm({ projectId, documentId, knownPages, onPosted, onCancel }: {
  projectId: string; documentId: string; knownPages: number | undefined; onPosted: (text: string) => void; onCancel: () => void;
}) {
  const [kind, setKind] = useState<Kind>('comment');
  const [body, setBody] = useState('');
  const s = useSubmit();
  const x = useAnchor(projectId, documentId, knownPages);
  const length = chars(body.trim());
  const ready = !s.busy && length > 0 && length <= BODY_MAX && x.request !== null;
  const post = async () => {
    await call('POST', `${docUrl(projectId, documentId)}/annotations`, { kind, body: body.trim(), anchor: x.request }, 'The annotation was not posted.');
    onPosted("Annotation posted. Recorded in the document's history.");
  };
  return (
    <div className="vd-d-filing" data-testid="vault-annotations-add">
      <label className="vd-d-filing-row">
        <span className="k">Kind</span>
        <select className="vd-d-move-sel" value={kind} disabled={s.busy} onChange={(e) => setKind(e.target.value as Kind)} data-testid="vault-annotations-kind">
          <option value="comment">Comment</option>
          <option value="request_changes">Change request</option>
        </select>
      </label>
      <label className="vd-d-filing-row">
        <span className="k">Annotation</span>
        <textarea className="vd-d-filing-reason" rows={4} value={body} disabled={s.busy} placeholder="At most 4,000 characters."
          onChange={(e) => setBody(e.target.value)} data-testid="vault-annotations-body" />
      </label>
      {length > BODY_MAX ? <div className="vd-ver-m">{`An annotation is at most 4,000 characters; this one has ${n(length)}.`}</div> : null}
      <div className="vd-d-filing-row" role="radiogroup" aria-label="Anchored to">
        <span className="k">Anchored to</span>
        {CHOICES.map((c) => (
          <label key={c.value}>
            <input type="radio" name={`anchor-${documentId}`} checked={x.choice === c.value} disabled={s.busy} onChange={() => x.choose(c.value)} /> {c.label}
          </label>
        ))}
      </div>
      {x.choice === 'page' ? <PagePick x={x} disabled={s.busy} /> : null}
      {x.choice === 'passage' ? <PassagePick x={x} /> : null}
      <div className="vd-d-filing-acts">
        <button className="sp-primary" disabled={!ready} onClick={() => void s.submit(post)} data-testid="vault-annotations-post">
          {s.busy ? 'Posting…' : 'Post annotation'}
        </button>
        <button className="sp-ask" disabled={s.busy} onClick={onCancel}>Cancel</button>
      </div>
      {s.error ? <div className="vd-dr-err" role="alert">{s.error}</div> : null}
    </div>
  );
}

export interface VaultAnnotationsProps {
  projectId: string;
  /** The version the panel is opened on; a new annotation is posted on it. */
  documentId: string;
  /** Called after the server recorded a change. The parent re-reads and bumps `refreshKey`; this panel is not remounted. */
  onChanged: () => void;
  /** Changing it reads the list again. The Vault passes its re-read counter, so one change is one read. */
  refreshKey?: number;
  /** The signed-in user's id; read from the session when not given. */
  actorId?: number | null;
}

export function VaultAnnotations({ projectId, documentId, onChanged, refreshKey, actorId }: VaultAnnotationsProps) {
  const me = useActorId(actorId);
  const { data, readError } = useAnnotations(projectId, documentId, refreshKey);
  const [adding, setAdding] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  // No read here: the parent's re-read bumps `refreshKey`, and that is the one read after a change.
  const changed = (text: string) => {
    setDone(text);
    setAdding(false);
    onChanged();
  };
  const ctx: Ctx = {
    projectId, actorId: me, onDone: changed,
    currentId: data?.openByVersion.find((v) => v.current)?.versionId ?? null, family: data?.openByVersion ?? [],
  };
  return (
    <div data-testid="vault-annotations">
      <div className="vd-d-seclbl">Review annotations</div>
      {readError ? <div className="vd-dr-err" role="alert">{readError}</div> : null}
      {!data && !readError ? <div className="vd-d-idx">Reading the annotations…</div> : null}
      {data ? <AnnotationList data={data} ctx={ctx} /> : null}
      {done ? <div className="vd-d-idx" role="status">{done}</div> : null}
      {adding ? (
        <AddForm projectId={projectId} documentId={documentId} knownPages={pagesFromAnnotations(data, documentId)}
          onPosted={changed} onCancel={() => setAdding(false)} />
      ) : (
        <div className="vd-d-filing-acts">
          <button className="sp-ask" onClick={() => { setDone(null); setAdding(true); }} data-testid="vault-annotations-open">Add annotation</button>
        </div>
      )}
    </div>
  );
}
