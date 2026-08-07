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
import type {
  ChangeControl, ChangeLink, ChangeSummary, ChangeState, ChangeType,
  Classification, RiskLevel, LinkType, Relationship,
} from './changeData';

interface Envelope<T> { data?: T; rows?: T; count?: number; meta?: { pendingStore?: boolean } }

/** Same failure the SOP register hit (see ./hooks.ts): `p?.data ?? p?.rows ?? []`
 *  only reaches the `[]` when `data` is absent, so `{ data: {} }` came back as
 *  an object and `.map` threw during render. Null means "no list in this body" —
 *  distinct from `[]`, which is the real answer "the log is empty" and must stay
 *  renderable. */
function listOf<T>(payload: unknown): T[] | null {
  const p = payload as Envelope<T[]> | null;
  const rows = Array.isArray(payload) ? payload : p?.data ?? p?.rows;
  if (!Array.isArray(rows)) return null;
  return rows.every((r) => typeof r === 'object' && r !== null) ? (rows as T[]) : null;
}

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
  target_implementation_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  links?: ServerLink[];
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
    targetImplementationDate: r.target_implementation_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    /* Truthy-but-not-an-array again: a `links` that arrives as an object or a
       string passed `r.links ?` and threw on `.map`. */
    links: Array.isArray(r.links) ? r.links.map(adaptLink) : undefined,
  };
}

/** Change-control register — GET /api/mdx/qms/changes. */
const CHANGES_PATH = '/api/mdx/qms/changes';
export function useChangeRegister() {
  const { data, loading, error, refresh } = useFetchJson<unknown>(CHANGES_PATH);
  const rows = useMemo(() => listOf<ServerChange>(data), [data]);
  const changes = useMemo<ChangeControl[] | null>(() => rows?.map(adaptChange) ?? null, [rows]);
  const shape = data != null && rows === null ? `unexpected response shape for ${CHANGES_PATH}` : null;
  return { changes, loading, error: error ?? shape, refresh };
}

/** Register KPIs — GET /api/mdx/qms/changes/summary. */
const SUMMARY_PATH = '/api/mdx/qms/changes/summary';
export function useChangeSummary() {
  const { data, loading, error } = useFetchJson<unknown>(SUMMARY_PATH);
  const summary = useMemo<ChangeSummary | null>(() => objectOf<ChangeSummary>(data), [data]);
  const shape =
    data != null && summary === null ? `unexpected response shape for ${SUMMARY_PATH}` : null;
  return { summary, loading, error: error ?? shape };
}
