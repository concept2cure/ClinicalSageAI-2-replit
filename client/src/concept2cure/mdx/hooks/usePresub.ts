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

import { useCallback, useEffect, useState } from 'react';
import type {
  PresubKpi,
  PresubListRow,
  PresubDetail,
  PresubQuestion,
  Commitment,
  DossierLink,
} from '../data/presub';

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

function adaptDetail(d: ServerQSubDetail): PresubDetail {
  return {
    summary:   d.summary,
    questions: d.questions.map(adaptQuestion),
    timeline:  d.timeline.map((t) => ({ when: t.when, who: t.who, what: t.what })),
  };
}

/* ─── List + KPI derivation ────────────────────────────────────────────── */

interface ListPayload {
  rows: ServerQSubListRow[];
  count: number;
}

export interface UsePresubListResult {
  list: PresubListRow[] | null;
  kpis: PresubKpi[] | null;
  loading: boolean;
  error: string | null;
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
  return [
    { label: 'Q-Subs in flight',  metric: String(total),    unit: '',  meta: `${awaiting} awaiting · ${feedback} feedback`, tone: '' },
    { label: 'Commitments rolled',metric: String(rolledPct),unit: '%', meta: `${rolled} of ${totalCommit}`, tone: rolledPct >= 80 ? 'ok' : rolledPct >= 50 ? 'warn' : 'err' },
    { label: 'Pending rollin',    metric: String(blockedRolled), unit: '', meta: blockedRolled === 0 ? 'All integrated' : 'Open in dossier', tone: blockedRolled === 0 ? 'ok' : 'warn' },
    { label: 'Avg days in feedback', metric: String(avgFeedbackDays), unit: 'd', meta: feedback === 0 ? 'No active feedback' : 'Across active Q-Subs', tone: avgFeedbackDays > 30 ? 'warn' : '' },
  ];
}

export function usePresubList(): UsePresubListResult {
  const [state, setState] = useState<{
    list: PresubListRow[] | null;
    loading: boolean;
    error: string | null;
  }>({ list: null, loading: false, error: null });
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    fetch('/api/q-sub', { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ListPayload;
      })
      .then((p) => {
        if (cancelled) return;
        /* Server shape is structurally identical to PresubListRow — assert
           through a single typed bridge rather than copying field-by-field. */
        const list: PresubListRow[] = p.rows.map((r) => ({
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
        }));
        setState({ list, loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load Q-Subs',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return {
    list: state.list,
    kpis: state.list ? deriveKpis(state.list) : null,
    loading: state.loading,
    error: state.error,
    refresh,
  };
}

/* ─── Detail (per row) ────────────────────────────────────────────────── */

export interface UsePresubDetailResult {
  detail: PresubDetail | null;
  loading: boolean;
  error: string | null;
}

export function usePresubDetail(id: string | null): UsePresubDetailResult {
  const [state, setState] = useState<UsePresubDetailResult>({
    detail: null,
    loading: false,
    error: null,
  });
  useEffect(() => {
    if (!id) {
      setState({ detail: null, loading: false, error: null });
      return;
    }
    let cancelled = false;
    setState({ detail: null, loading: true, error: null });
    fetch(`/api/q-sub/${encodeURIComponent(id)}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return (await res.json()) as ServerQSubDetail;
      })
      .then((d) => {
        if (cancelled) return;
        setState({ detail: adaptDetail(d), loading: false, error: null });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState({
          detail: null,
          loading: false,
          error: err instanceof Error ? err.message : 'Failed to load Q-Sub',
        });
      });
    return () => {
      cancelled = true;
    };
  }, [id]);
  return state;
}
