/**
 * A turn's Summary: everything AnA did for one answer, as one timeline
 * (ANA-SUMMARY S4, docs/design/ANA_AGENT_WORK_VIEW_2026-10-08.md §3).
 *
 * ── Where it opens ───────────────────────────────────────────────────────────
 * One component in two containers. On a wide screen it is the body of the
 * Progress panel for the turn its Summary button chose (AnaWorkPanel `turn`);
 * below 760px it is a bottom sheet (TurnSummarySheet, on useDialog), which
 * replaces the stacked dock. The header chip keeps its one meaning: the panel
 * on the latest turn.
 *
 * ── Where its rows come from ─────────────────────────────────────────────────
 * Live: the `timeline` frames the turn kept. Settled and recorded: the
 * record's own sealed timeline, read through GET /turn-records/:id/summary and
 * verified on that read — the same events, so a reload reads the same rows.
 * No timeline (a record from before /4, or none): the turn's trace, labelled,
 * with no durations claimed. Rows are turnSummaryRows.ts's; every count is the
 * server's (timelineHeader); AnA's notes are marked as hers and never counted.
 *
 * ── What it never shows ──────────────────────────────────────────────────────
 * A tool's name, an id, an input or a result: the payload holds none of them
 * (server: turn-summary.ts), and a live frame's raw fields are not read here.
 *
 * @module client/src/concept2cure/v2/TurnSummary
 */

import React from 'react';

import { getAuthHeaders } from '@/utils/authToken';
import { serverMessage } from '@/lib/queryClient';
import { readTimelineEvent, timelineHeader, type TimelineControl, type TimelineEvent } from '@shared/ana/turn-timeline';
import type { AnaChatMessage } from '../components/ana/useAnaChat';
import { formatElapsed } from '../components/ana/anaProgress';
import { I } from './icons';
import { RecordDownload, Row } from './AnaActivity';
import { statusGlyph, StepFactList } from './AnaWorkSections';
import { sourceGlyph } from './anaSourceGlyphs';
import { useDialog } from './useDialog';
import { useNow } from './useNow';
import { footerState, summaryRows, traceRows, type StepRow, type SummaryRow, type TaskRow } from './turnSummaryRows';

/* ── The record's Summary, read once per record ───────────────────────────── */

export interface SummaryPayload {
  schemaVersion: string;
  recordSha256: string;
  verdict: { ok: boolean; reason?: string };
  events: TimelineEvent[] | null;
  controls: TimelineControl[] | null;
  models: Array<{ provider: string | null; model: string | null }>;
}

type SummaryRead = { state: 'none' | 'loading' } | { state: 'ok'; payload: SummaryPayload } | { state: 'refused' | 'failed'; message: string };

function readPayload(raw: unknown): SummaryPayload | null {
  const d = (raw as { data?: Record<string, unknown> } | null)?.data;
  if (!d || typeof d.recordSha256 !== 'string' || !d.verdict || typeof d.verdict !== 'object') return null;
  const events = Array.isArray(d.events) ? d.events.map(readTimelineEvent).filter((e): e is TimelineEvent => e !== null) : null;
  return {
    schemaVersion: String(d.schemaVersion ?? ''),
    recordSha256: d.recordSha256,
    verdict: { ok: (d.verdict as { ok?: unknown }).ok === true, ...(typeof (d.verdict as { reason?: unknown }).reason === 'string' ? { reason: (d.verdict as { reason: string }).reason } : {}) },
    events,
    controls: Array.isArray(d.controls) ? (d.controls as TimelineControl[]) : null,
    models: Array.isArray(d.models) ? (d.models as SummaryPayload['models']) : [],
  };
}

/** GET /turn-records/:id/summary for a recorded turn; nothing for a turn without one. */
function useSummaryRead(recordId: string | null): SummaryRead {
  const [read, setRead] = React.useState<SummaryRead>({ state: 'none' });
  React.useEffect(() => {
    if (!recordId) {
      setRead({ state: 'none' });
      return undefined;
    }
    const ctl = new AbortController();
    setRead({ state: 'loading' });
    void (async () => {
      try {
        const res = await fetch(`/api/ana-ri/turn-records/${encodeURIComponent(recordId)}/summary`, {
          headers: { ...getAuthHeaders() },
          credentials: 'include',
          signal: ctl.signal,
        });
        const body = await res.json().catch(() => null);
        if (ctl.signal.aborted) return;
        const payload = res.ok ? readPayload(body) : null;
        if (payload) setRead({ state: 'ok', payload });
        else if (res.status === 403) setRead({ state: 'refused', message: serverMessage(body) ?? "This turn's record is visible to the person who asked and to administrators." });
        else setRead({ state: 'failed', message: "This turn's record could not be read." });
      } catch {
        if (!ctl.signal.aborted) setRead({ state: 'failed', message: "This turn's record could not be read." });
      }
    })();
    return () => ctl.abort();
  }, [recordId]);
  return read;
}

/* ── Rows ─────────────────────────────────────────────────────────────────── */

function StepSummaryRow({ row }: { row: StepRow }) {
  const glyph = row.source === 'engine' && !row.engine ? statusGlyph(row.status) : sourceGlyph(row.source);
  return (
    <Row
      status={row.status}
      glyph={glyph}
      verb={row.label}
      preview={row.sub}
      trailing={row.trailing}
      note={row.message}
      detail={row.facts.length > 0 ? <StepFactList facts={row.facts} /> : undefined}
    />
  );
}

/** A task opened: the plan as it stood at that moment, then the steps that served the task (S5). */
function TaskDetail({ row }: { row: TaskRow }) {
  if (row.list.length === 0 && row.steps.length === 0) return null;
  return (
    <>
      {row.list.length > 0 && (
        <ol className="ana-activity-plan">
          {row.list.map((t) => (
            <li key={t.title}>{t.title}{t.status === 'completed' ? ' · completed' : t.status === 'in_progress' ? ' · in progress' : ''}</li>
          ))}
        </ol>
      )}
      {row.steps.length > 0 && (
        <>
          <p className="ana-summary-task-steps-title">Steps for this task</p>
          <ol className="ana-summary-task-steps">
            {row.steps.map((st) => (
              <li key={st.key} className={`is-${st.status}`}>
                <span className="ana-summary-task-step">{st.label}</span>
                <span className="ana-summary-task-step-sub">{st.sub}</span>
                {st.message ? <span className="ana-summary-task-step-msg">{st.message}</span> : null}
              </li>
            ))}
          </ol>
        </>
      )}
    </>
  );
}

function SummaryRowView({ row, checked, onContinue, now, startedAt }: { row: SummaryRow; checked: boolean; onContinue?: () => void; now: number; startedAt?: number }) {
  switch (row.kind) {
    case 'note':
      return (
        <Row
          status="success"
          variant="note"
          glyph={I.dot}
          verb={row.text}
          preview={checked ? "AnA's words" : "AnA's words · not checked"}
          detail={<p className="ana-summary-note-full">{row.text}</p>}
        />
      );
    case 'step':
      return <StepSummaryRow row={row} />;
    case 'task':
      return (
        <Row
          status="success"
          glyph={I.list}
          verb={row.verb}
          object={row.title}
          note={row.fact}
          detail={row.list.length > 0 || row.steps.length > 0 ? <TaskDetail row={row} /> : undefined}
        />
      );
    case 'control':
      return <Row status="success" glyph={I.user} verb={row.text} preview={row.message} />;
    case 'end':
      return (
        <li className={`ana-activity-step ana-summary-end is-${row.reason ? 'error' : 'success'}`}>
          <span className="ana-activity-glyph" aria-hidden="true">{row.reason ? I.alertTriangle : I.check}</span>
          <span className="ana-activity-row is-static">
            <span className="ana-activity-text"><span className="ana-activity-verb">{row.text}</span></span>
            {onContinue && row.continuable ? <button type="button" className="ana-activity-continue" onClick={onContinue}>Continue</button> : null}
          </span>
        </li>
      );
    case 'working':
      return (
        <li className="ana-activity-phase">
          <span className="ana-activity-pulse" aria-hidden="true">{I.dot}</span>
          <span>Working…</span>
          {typeof startedAt === 'number' && <span className="ana-activity-clock">{formatElapsed(now - startedAt)}</span>}
        </li>
      );
  }
}

/** How this view saw the turn end, when its events carry no end of their own. */
function clientEndingOf(turn: AnaChatMessage) {
  if (turn.stopped) return { outcome: 'stopped' as const, reason: 'cancelled' };
  if (turn.interrupted) return { outcome: 'stopped' as const, reason: 'client_disconnected' };
  return null;
}

function SummaryFooter({ turn, read }: { turn: AnaChatMessage; read: SummaryRead }) {
  if (read.state === 'refused') return <p className="ana-summary-foot" role="note">{read.message}</p>;
  const payload = read.state === 'ok' ? read.payload : null;
  const state = footerState(turn, payload?.verdict);
  if (!state) return null;
  if (state === 'Recorded' && payload && turn.turnRecord?.status === 'recorded') {
    const id = turn.turnRecord.id;
    return (
      <ol className="ana-activity-list ana-summary-foot">
        <Row
          status="success"
          glyph={I.shieldCheck}
          verb="Recorded"
          object={payload.recordSha256.slice(0, 12)}
          mono
          detail={
            <>
              <code className="ana-activity-pre">SHA-256 {payload.recordSha256}</code>
              <RecordDownload id={id} />
            </>
          }
        />
      </ol>
    );
  }
  const reason = state === 'Record could not be verified' ? payload?.verdict.reason : undefined;
  return (
    <p className="ana-summary-foot" role="note">
      {state}
      {reason ? ` — ${reason}` : ''}
    </p>
  );
}

export interface TurnSummaryProps {
  turn: AnaChatMessage;
  /** The turn is still running in this view. */
  live: boolean;
  /** Offered only on the latest settled turn, as the transcript offers it. */
  onContinue?: () => void;
}

/** The turn's events: the record's, once read; else the frames this view kept; else none (trace rows). */
function eventsOf(turn: AnaChatMessage, payload: SummaryPayload | null): TimelineEvent[] | null {
  if (payload?.events) return payload.events;
  return turn.timeline && turn.timeline.length > 0 ? turn.timeline : null;
}

function rowsOf(turn: AnaChatMessage, events: TimelineEvent[] | null, payload: SummaryPayload | null, live: boolean): SummaryRow[] {
  // A live turn before its first event is working, not a turn that ran nothing.
  if (!events) return live ? summaryRows([], [], { live }) : traceRows(turn);
  return summaryRows(events, payload?.controls ?? [], { live, clientEnding: live ? null : clientEndingOf(turn) });
}

/** The header line (every number the server's) and the models that narrated the turn. */
function SummaryHead({ events, payload }: { events: TimelineEvent[] | null; payload: SummaryPayload | null }) {
  if (!events) return payload ? <p className="ana-summary-head">This turn was recorded before step timelines.</p> : null;
  const models = (payload?.models ?? []).map((m) => [m.provider, m.model].filter(Boolean).join(' · ')).filter(Boolean);
  return (
    <p className="ana-summary-head">
      {timelineHeader(events)}
      {models.length > 0 && <span className="ana-summary-models">Narrated by {models.join(', ')}</span>}
    </p>
  );
}

/** The Summary of one turn: the header line, the rows, and the record's footer. */
export function TurnSummary({ turn, live, onContinue }: TurnSummaryProps) {
  const recordId = !live && turn.turnRecord?.status === 'recorded' ? turn.turnRecord.id : null;
  const read = useSummaryRead(recordId);
  const now = useNow(live);
  const payload = read.state === 'ok' ? read.payload : null;
  const events = eventsOf(turn, payload);
  const rows = rowsOf(turn, events, payload, live);
  const checked = !live && Boolean(turn.evidence?.check);
  return (
    <div className="ana-summary" data-live={live ? 'true' : 'false'}>
      <SummaryHead events={events} payload={payload} />
      {rows.length === 0 ? (
        <p className="ana-work-empty">This turn ran no steps.</p>
      ) : (
        <ol className="ana-activity-list ana-summary-list">
          {rows.map((row) => (
            <SummaryRowView key={row.key} row={row} checked={checked} onContinue={onContinue} now={now} startedAt={turn.sentAt} />
          ))}
        </ol>
      )}
      <SummaryFooter turn={turn} read={read} />
    </div>
  );
}

/* ── The phone's sheet ─────────────────────────────────────────────────────── */

/** Keeps a scroller at its newest row only while the reader is already at the bottom. */
function useFollowNewest(ref: React.RefObject<HTMLDivElement | null>, size: number) {
  const atBottom = React.useRef(true);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (el && atBottom.current) el.scrollTop = el.scrollHeight;
  }, [ref, size]);
  return () => {
    const el = ref.current;
    if (el) atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
  };
}

/**
 * The Summary as a bottom sheet: full height less 48px, a grab handle, a close
 * button and the title "Summary". A dialog (useDialog): focus moves in, Tab
 * stays in, Escape closes, and focus returns to the button that opened it.
 */
export function TurnSummarySheet({ turn, live, onClose, onContinue }: TurnSummaryProps & { onClose: () => void }) {
  const ref = useDialog(onClose);
  const titleId = React.useId();
  const bodyRef = React.useRef<HTMLDivElement>(null);
  const onScroll = useFollowNewest(bodyRef, turn.timeline?.length ?? 0);
  return (
    <div className="ana-sheet-backdrop" onClick={onClose}>
      <div
        className="ana-sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        ref={ref}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ana-sheet-grab" aria-hidden="true" />
        <div className="ana-sheet-hdr">
          <h2 className="ana-sheet-title" id={titleId}>Summary</h2>
          <button type="button" className="ana-sheet-close" aria-label="Close summary" onClick={onClose}>
            {I.close}
          </button>
        </div>
        <div className="ana-sheet-body" ref={bodyRef} onScroll={onScroll}>
          <TurnSummary turn={turn} live={live} onContinue={onContinue} />
        </div>
      </div>
    </div>
  );
}

/* ── For hosts ─────────────────────────────────────────────────────────────── */

/** True below 760px, where the Summary is a sheet rather than a panel. */
export const SUMMARY_SHEET_QUERY = '(max-width: 760px)';

function useNarrow(): boolean {
  const query = React.useMemo(
    () => (typeof window !== 'undefined' && typeof window.matchMedia === 'function' ? window.matchMedia(SUMMARY_SHEET_QUERY) : null),
    [],
  );
  const [narrow, setNarrow] = React.useState(() => Boolean(query?.matches));
  React.useEffect(() => {
    if (!query) return undefined;
    const on = () => setNarrow(query.matches);
    query.addEventListener?.('change', on);
    return () => query.removeEventListener?.('change', on);
  }, [query]);
  return narrow;
}

/**
 * Which turn's Summary a host shows. `open(id)` from a turn's Summary button:
 * the panel at that turn on a wide screen (the host opens its dock), the sheet
 * below 760px. `turn` is null when the panel should show the latest turn.
 */
export function useSummaryTurn(messages: AnaChatMessage[]) {
  const [turnId, setTurnId] = React.useState<string | null>(null);
  const narrow = useNarrow();
  const turn = turnId ? messages.find((m) => m.id === turnId) ?? null : null;
  const open = React.useCallback((id: string) => setTurnId(id), []);
  const close = React.useCallback(() => setTurnId(null), []);
  return { turn, narrow, open, close };
}

/**
 * A host's Summary, wired the one way: a turn's Summary button opens the
 * host's panel at that turn (opening the dock if it was shut), or the sheet
 * below 760px; the header chip keeps its one meaning — the panel on the
 * latest turn — so it forgets the chosen turn as it toggles.
 */
export function useHostSummary(
  messages: AnaChatMessage[],
  dock: { open: boolean; toggle: () => void },
  streaming: boolean,
  onContinue?: () => void,
) {
  const s = useSummaryTurn(messages);
  const openFor = (id: string) => {
    s.open(id);
    if (!s.narrow && !dock.open) dock.toggle();
  };
  const toggleDock = () => {
    s.close();
    dock.toggle();
  };
  const sheet =
    s.narrow && s.turn ? (
      <TurnSummarySheet turn={s.turn} live={streaming && Boolean(s.turn.streaming)} onClose={s.close} onContinue={onContinue} />
    ) : null;
  return { panelTurn: s.narrow ? null : s.turn, openFor, toggleDock, sheet };
}
