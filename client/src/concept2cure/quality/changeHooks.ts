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
function listOf<T>(payload: unknown): T[] {
  if (Array.isArray(payload)) return payload as T[];
  const p = payload as Envelope<T[]> | null;
  return p?.data ?? p?.rows ?? [];
}
function objectOf<T>(payload: unknown): T | null {
  const p = payload as Envelope<T> | null;
  return (p?.data as T) ?? null;
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
    links: r.links ? r.links.map(adaptLink) : undefined,
  };
}

/** Change-control register — GET /api/mdx/qms/changes. */
export function useChangeRegister() {
  const { data, loading, error, refresh } = useFetchJson<unknown>('/api/mdx/qms/changes');
  const changes = useMemo<ChangeControl[] | null>(
    () => (data ? listOf<ServerChange>(data).map(adaptChange) : null),
    [data],
  );
  return { changes, loading, error, refresh };
}

/** Register KPIs — GET /api/mdx/qms/changes/summary. */
export function useChangeSummary() {
  const { data, loading, error } = useFetchJson<unknown>('/api/mdx/qms/changes/summary');
  const summary = useMemo<ChangeSummary | null>(() => objectOf<ChangeSummary>(data), [data]);
  return { summary, loading, error };
}
