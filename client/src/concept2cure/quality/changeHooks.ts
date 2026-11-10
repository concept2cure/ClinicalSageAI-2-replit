/**
 * Change control — live data hooks (`live ?? fixture`).
 *
 * Read the live QMS change-control API at /api/mdx/qms/changes/* and adapt
 * snake_case rows into the surface's camelCase shapes, reusing the shared MDX
 * `useFetchJson` (auth headers + cancellable fetches). The surface lights up
 * with live data when the org is authenticated and the store is provisioned,
 * and falls back to the typed fixtures otherwise.
 *
 * @module client/src/concept2cure/quality/changeHooks
 */

import { useMemo } from 'react';
import { useFetchJson } from '../mdx/hooks/useFetchJson';
import { listOf } from './qmsList';
import { learningReviewViewOf } from './qmsApproval';
import type {
  ChangeControl, ChangeLink, ChangeSummary, ChangeState, ChangeType,
  Classification, RiskLevel, LinkType, Relationship,
} from './changeData';

interface Envelope<T> { data?: T; rows?: T; count?: number; meta?: { pendingStore?: boolean } }

/** `?? null` only fires on null/undefined, so `{ data: [] }` and `{ data: {} }`
 *  both became the "summary" and every KPI rendered the string "undefined".
 *  Require the counters to be present (presence, not truthiness — a real zero
 *  count is data) and otherwise report no summary, which the surface already
 *  handles by falling back. */
const SUMMARY_KEYS = ['total', 'open'] as const;
function objectOf<T>(payload: unknown): T | null {
  const d = (payload as Envelope<T> | null)?.data;
  if (typeof d !== 'object' || d === null || Array.isArray(d)) return null;
  return SUMMARY_KEYS.every((k) => k in d) ? (d as T) : null;
}

interface ServerChange {
  id: number;
  change_number: string;
  title: string;
  description: string | null;
  change_type: string;
  classification: string;
  risk_level: string | null;
  status: string;
  reason: string | null;
  /** Who raised the change: the server refuses their approval (change-approval-signature.ts, the two-person rule). */
  proposed_by?: number | null;
  impact_assessment?: string | null;
  implementation_plan?: string | null;
  /** The digest of the content an approval of this change signs (computeQmsChangeContentDigest). */
  content_digest?: string;
  target_implementation_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  links?: ServerLink[];
  /** The database's overdue verdict against CURRENT_DATE (changeControl.service). */
  implementation_overdue?: boolean;
  /** CHANGE_TRANSITIONS for this row's status, sent by the register read. */
  next_states?: unknown;
  learning_review?: unknown;
}
interface ServerLink {
  id: number;
  change_id: number;
  link_type: string;
  linked_ref: string;
  linked_label: string | null;
  relationship: string;
  note: string | null;
}

function adaptLink(r: ServerLink): ChangeLink {
  return {
    id: r.id,
    changeId: r.change_id,
    linkType: r.link_type as LinkType,
    linkedRef: r.linked_ref,
    linkedLabel: r.linked_label,
    relationship: r.relationship as Relationship,
    note: r.note,
  };
}

function adaptChange(r: ServerChange): ChangeControl {
  return {
    id: r.id,
    changeNumber: r.change_number,
    title: r.title,
    description: r.description,
    changeType: r.change_type as ChangeType,
    classification: r.classification as Classification,
    riskLevel: (r.risk_level as RiskLevel | null) ?? null,
    status: r.status as ChangeState,
    reason: r.reason,
    proposedBy: typeof r.proposed_by === 'number' ? r.proposed_by : null,
    impactAssessment: typeof r.impact_assessment === 'string' ? r.impact_assessment : null,
    implementationPlan: typeof r.implementation_plan === 'string' ? r.implementation_plan : null,
    contentDigest: typeof r.content_digest === 'string' && /^[a-f0-9]{64}$/.test(r.content_digest) ? r.content_digest : null,
    learningReview: learningReviewViewOf(r.learning_review),
    targetImplementationDate: r.target_implementation_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    /* Truthy-but-not-an-array again: a `links` that arrives as an object or a
       string passed `r.links ?` and threw on `.map`. */
    links: Array.isArray(r.links) ? r.links.map(adaptLink) : undefined,
    implementationOverdue: typeof r.implementation_overdue === 'boolean' ? r.implementation_overdue : undefined,
    nextStates: Array.isArray(r.next_states) && r.next_states.every((v) => typeof v === 'string')
      ? (r.next_states as ChangeState[])
      : undefined,
  };
}

/** Change-control register — GET /api/mdx/qms/changes. */
const CHANGES_PATH = '/api/mdx/qms/changes';
export function useChangeRegister() {
  const { data, loading, error, refresh, failure } = useFetchJson<unknown>(CHANGES_PATH);
  const rows = useMemo(() => listOf<ServerChange>(data), [data]);
  const changes = useMemo<ChangeControl[] | null>(() => rows?.map(adaptChange) ?? null, [rows]);
  const shape = data != null && rows === null ? `unexpected response shape for ${CHANGES_PATH}` : null;
  return { changes, loading, error: error ?? shape, failure, refresh };
}

/** Register KPIs — GET /api/mdx/qms/changes/summary. */
const SUMMARY_PATH = '/api/mdx/qms/changes/summary';
export function useChangeSummary() {
  const { data, loading, error, failure, refresh } = useFetchJson<unknown>(SUMMARY_PATH);
  const summary = useMemo<ChangeSummary | null>(() => objectOf<ChangeSummary>(data), [data]);
  const shape =
    data != null && summary === null ? `unexpected response shape for ${SUMMARY_PATH}` : null;
  /* `refresh` so a write re-reads the figures with the log: until 2026-11-10 a raised change appeared in the log
     while the figure line above it still counted the log as it was (walked, C3). */
  return { summary, loading, error: error ?? shape, failure, refresh };
}
