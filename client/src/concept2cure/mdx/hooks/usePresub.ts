/**
 * usePresub — fetches /api/q-sub list + /api/q-sub/:id detail and adapts the
 * server DTOs into the kit's PresubListRow / PresubDetail shapes.
 *
 * The server already returns near-identical shapes (see
 * server/services/q-sub/q-sub.service.ts QSubListRow / QSubDetail), so the
 * adapters are mostly type translation:
 *
 *  - List:    QSubListRow.* fields map 1:1 onto PresubListRow. Same names.
 *  - Detail:  QSubQuestionDto.question  → PresubQuestion.q
 *             QSubQuestionDto.commitments[] (array, server can have 0..N) →
 *               PresubQuestion.commitment (single, kit's UI shows one).
 *               When the server returns multiple, the first wins; the rest
 *               are reachable via the Commitments tab once we add multi-render.
 *             QSubDossierLink.sectionId (string) → DossierLink.sectionId (number).
 *
 * Both fetchers cancel on unmount and surface error/loading state. Detail is
 * keyed by the row id so the hook re-fetches on selection change.
 */

import { useEffect, useMemo, useState } from 'react';
import type {
  PresubKpi,
  PresubListRow,
  PresubDetail,
  PresubQuestion,
  Commitment,
  DossierLink,
} from '../data/presub';
import { useFetchJson, type ReadFailure } from './useFetchJson';
import { isRecord, shapeMismatch } from '../lib/payloadShape';

interface ServerQSubListRow {
  id: string;
  qNumber: string;
  type: PresubListRow['type'];
  prog: string;
  progTitle: string;
  title: string;
  stage: PresubListRow['stage'];
  daysIn: number;
  filed: string | null;
  targetDate: string | null;
  meeting: PresubListRow['meeting'];
  questions: number;
  answered: number;
  commitments: number;
  rolledIn: number;
  fdaTeam: string;
  tone: PresubListRow['tone'];
}

interface ServerQSubDossierLink {
  kind: DossierLink['kind'];
  label: string;
  sectionId: string;
}

interface ServerQSubCommitmentDto {
  id: string;
  displayCode: string;
  text: string;
  dossierLink: ServerQSubDossierLink;
  rolledIn: boolean;
  rolledInAt: string | null;
  rolledInBy: string | null;
  blocker: boolean;
}

interface ServerQSubQuestionDto {
  id: string;
  n: number;
  question: string;
  ourPosition: string;
  fdaResponse: string | null;
  status: 'answered' | 'awaiting';
  commitments: ServerQSubCommitmentDto[];
}

interface ServerQSubTimelineDto {
  when: string;
  who: string;
  what: string;
  occurredAt: string;
}

interface ServerQSubDetail {
  id: string;
  summary: string;
  questions: ServerQSubQuestionDto[];
  timeline: ServerQSubTimelineDto[];
}

function adaptDossierLink(s: ServerQSubDossierLink): DossierLink {
  const sectionId = Number.parseInt(s.sectionId, 10);
  return {
    kind:      s.kind,
    label:     s.label,
    sectionId: Number.isFinite(sectionId) ? sectionId : 0,
  };
}

function adaptCommitment(c: ServerQSubCommitmentDto): Commitment {
  return {
    id:          c.displayCode || c.id,
    text:        c.text,
    dossierLink: adaptDossierLink(c.dossierLink),
    rolledIn:    c.rolledIn,
    blocker:     c.blocker,
  };
}

function adaptQuestion(q: ServerQSubQuestionDto): PresubQuestion {
  const first = q.commitments[0];
  return {
    n:           q.n,
    q:           q.question,
    ourPosition: q.ourPosition,
    fdaResponse: q.fdaResponse,
    status:      q.status,
    commitment:  first ? adaptCommitment(first) : null,
  };
}

/**
 * Adapt the server's Q-Sub detail, without trusting its shape.
 *
 * This read `d.questions.map(...)` and `d.timeline.map(...)` directly. Any 200
 * response whose body is not exactly `{ data: { summary, questions, timeline } }`
 * therefore threw `Cannot read properties of undefined (reading 'map')` — and
 * because the throw happens in a `useMemo` during render, `PreSubManager` and
 * everything under it comes down with it.
 *
 * `SurfaceBoundary` catches it, so the blast radius is one surface showing
 * `SurfaceDegraded` rather than the whole shell. But "degraded" is what this
 * product shows when something is genuinely broken, and a detail endpoint
 * returning no questions is not broken — it is a Q-Sub package with no questions
 * logged yet, which `PreSubManager` already has an empty state for.
 *
 * Found by the visual-QA capture: `device-presub` was the one converged surface
 * that serialized to zero bytes once its data resolved. The existing mount test
 * cannot see it — it asserts synchronously, while the surface is still drawing
 * its loading state, which is before the crash.
 *
 * Slice 0: "no questions" is `questions: []`, which is what `getQSubDetail`
 * sends for a Q-Sub with none on record. A record with no `questions` or
 * `timeline` array at all, or a list where the record should be, was drawn as
 * that empty Q-Sub, and an absent record as "Package in draft". Neither was
 * read, so both are null here and `usePresubDetail` reports them as a failure.
 */
function adaptDetail(d: ServerQSubDetail | null | undefined): PresubDetail | null {
  if (!isRecord(d) || !Array.isArray(d.questions) || !Array.isArray(d.timeline)) return null;
  return {
    summary:   typeof d.summary === 'string' ? d.summary : '',
    questions: d.questions.map(adaptQuestion),
    timeline:  d.timeline.map((t) => ({ when: t.when, who: t.who, what: t.what })),
  };
}

/* ─── List + KPI derivation ────────────────────────────────────────────── */

/** Canonical envelope wrapper returned by /api/q-sub list. The inner
 *  `data` carries the rows + count; outer envelope shape is shared
 *  with regulatory-programs and saved-precedent-queries. */
interface ListPayload {
  data: { rows: ServerQSubListRow[]; count: number };
}

export interface UsePresubListResult {
  list: PresubListRow[] | null;
  kpis: PresubKpi[] | null;
  loading: boolean;
  error: string | null;
  /** What the failed read was (readFailureFor). Null for a body it could not
   *  read, which is a failed read with no status to classify. */
  failure: ReadFailure | null;
  refresh: () => void;
}

function deriveKpis(list: PresubListRow[]): PresubKpi[] {
  const total = list.length;
  const awaiting = list.filter((r) => r.stage === 'await').length;
  const feedback = list.filter((r) => r.stage === 'feedback').length;
  const totalCommit = list.reduce((s, r) => s + r.commitments, 0);
  const rolled = list.reduce((s, r) => s + r.rolledIn, 0);
  const rolledPct = totalCommit > 0 ? Math.round((rolled / totalCommit) * 100) : 0;
  const blockedRolled = totalCommit - rolled;
  const inFeedback = list.filter((r) => r.stage === 'feedback');
  const avgFeedbackDays = inFeedback.length
    ? Math.round(inFeedback.reduce((s, r) => s + r.daysIn, 0) / inFeedback.length)
    : 0;
  /* Slice 0 (placement map, `device-presub` row): with no commitments on
     record these read "0% · 0 of 0" in red and "0 · All integrated" in green —
     a failure and a completion where nothing exists yet. Say that instead,
     with no tone; the figures stand once there is a commitment to count. */
  const noCommitments = totalCommit === 0;
  return [
    { label: 'Q-Subs in flight',  metric: String(total),    unit: '',  meta: `${awaiting} awaiting · ${feedback} feedback`, tone: '' },
    noCommitments
      ? { label: 'Commitments rolled', metric: '—', unit: '', meta: 'No commitments recorded yet', tone: '' }
      : { label: 'Commitments rolled',metric: String(rolledPct),unit: '%', meta: `${rolled} of ${totalCommit}`, tone: rolledPct >= 80 ? 'ok' : rolledPct >= 50 ? 'warn' : 'err' },
    noCommitments
      ? { label: 'Pending rollin', metric: '—', unit: '', meta: 'No commitments recorded yet', tone: '' }
      : { label: 'Pending rollin',    metric: String(blockedRolled), unit: '', meta: blockedRolled === 0 ? 'All integrated' : 'Open in dossier', tone: blockedRolled === 0 ? 'ok' : 'warn' },
    { label: 'Avg days in feedback', metric: String(avgFeedbackDays), unit: 'd', meta: feedback === 0 ? 'No active feedback' : 'Across active Q-Subs', tone: avgFeedbackDays > 30 ? 'warn' : '' },
  ];
}

/**
 * Fetch one project's Q-Sub list from /api/q-sub?program_id= and adapt each
 * row into the kit's PresubListRow shape (server shape is structurally
 * identical; this hook bridges the type so the kit's surface compiles cleanly).
 *
 * Also derives the 4 KPI cards (in-flight count, rolled-in %, pending
 * rollin, avg days in feedback) from the same list — single
 * round-trip drives both the list and the metrics strip.
 *
 * The project is required. This read had no project and returned every
 * project's Q-Subs, which the host drew under the open project's title as an
 * "Organization-wide view" (D2, 2026-10-29; the map's `device-presub` row,
 * slice 12). There is no unscoped read left: with no project there is no read,
 * and the route refuses a project the organization does not own.
 */
export function usePresubList(programId: string | null): UsePresubListResult {
  const url = programId ? `/api/q-sub?program_id=${encodeURIComponent(programId)}` : null;
  const { data, loading, error, failure, refresh } = useFetchJson<ListPayload>(url);
  /* Server shape is structurally identical to PresubListRow — assert
     through a single typed bridge rather than copying field-by-field. */
  /*
   * `data.data.rows.map(...)` — unguarded, and this one runs on mount rather
   * than on selection, so any 200 whose body is not exactly
   * `{ data: { rows: [...] } }` took the whole surface down before it drew
   * anything. Same defect as `adaptDetail` below; this was the crash the
   * visual-QA capture actually hit.
   */
  const list = useMemo<PresubListRow[] | null>(
    () => (Array.isArray(data?.data?.rows) ? data.data.rows.map((r) => ({
      id:          r.id,
      qNumber:     r.qNumber,
      type:        r.type,
      prog:        r.prog,
      progTitle:   r.progTitle,
      title:       r.title,
      stage:       r.stage,
      daysIn:      r.daysIn,
      filed:       r.filed,
      targetDate:  r.targetDate,
      meeting:     r.meeting,
      questions:   r.questions,
      answered:    r.answered,
      commitments: r.commitments,
      rolledIn:    r.rolledIn,
      fdaTeam:     r.fdaTeam,
      tone:        r.tone,
    })) : null),
    [data],
  );
  /* A 200 whose body is not `{ data: { rows } }` used to return `list: null`
     with no error — which reads as "still loading" forever. While a fixture
     stood in for null nobody saw it; now the manager renders null as a
     spinner, so an unreadable body has to say so. */
  const failed = error ?? (url !== null && data != null && list === null ? shapeMismatch(url) : null);
  return {
    list,
    kpis: list ? deriveKpis(list) : null,
    loading,
    error: failed,
    failure: error ? failure : null,
    refresh,
  };
}

/* ─── Detail (per row) ────────────────────────────────────────────────── */

export interface UsePresubDetailResult {
  detail: PresubDetail | null;
  loading: boolean;
  error: string | null;
  /** What the failed read was (readFailureFor), once it has settled. */
  failure: ReadFailure | null;
  /** Re-run the detail fetch. Its failure state had no way out without one. */
  refresh: () => void;
}

/**
 * Fetch the rich detail for a single Q-Sub from /api/q-sub/:id —
 * questions + commitments + timeline. Adapter renames `question` →
 * `q`, picks `commitments[0]` → `commitment` (kit's UI shows one),
 * and parseInts the dossierLink.sectionId.
 *
 * Pass `null` for `id` to disable the fetch (idle state).
 *
 * With an id, every render is one of three things: pending (`loading`), the
 * detail of THAT id, or a failure. Slice 0 (placement map, `device-presub`
 * row): `useFetchJson` keeps the previous URL's body while the next one loads,
 * and its first render, before the fetch effect runs, is neither loading nor
 * done. So a row change drew the new Q-Sub's header over the old one's summary
 * and FDA responses, and the first frame read as "Package in draft". A body
 * counts only once a fetch for this URL has settled, and a settled body that
 * is not a Q-Sub record is a failed read, as it is for the list above.
 */
export function usePresubDetail(id: string | null): UsePresubDetailResult {
  const url = id ? `/api/q-sub/${encodeURIComponent(id)}` : null;
  /* Canonical envelope: server returns { data: ServerQSubDetail }. */
  const { data, loading, error, failure, refresh } = useFetchJson<{ data: ServerQSubDetail }>(url);
  /* The URL whose fetch has started, and the body on hand when it did (the
     previous URL's). Set by an effect declared after useFetchJson's, so it
     lands in the same update as that fetch's `loading: true`: a render that
     sees it with `loading` false holds this URL's settled result. */
  const [started, setStarted] = useState<{ url: string | null; stale: unknown } | null>(null);
  useEffect(() => {
    setStarted({ url, stale: data });
    /* `data` is read once, as the previous URL's body. */
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [url]);
  const current = started !== null && started.url === url;
  const fresh = current && data !== started.stale ? data : null;
  const detail = useMemo(() => (fresh ? adaptDetail(fresh.data) : null), [fresh]);
  if (url === null) return { detail: null, loading: false, error: null, failure: null, refresh };
  const settled = current && !loading;
  const failed = settled ? error ?? (detail === null ? shapeMismatch(url) : null) : null;
  return { detail, loading: !settled, error: failed, failure: settled && error ? failure : null, refresh };
}
