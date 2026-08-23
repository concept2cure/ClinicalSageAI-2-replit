/**
 * usePathwayTabsData — live backend data for the pathway sub-tab panes.
 *
 * Operator decision (2026-06-02): keep the kit UI byte-identical, but back the
 * Audit / Correspondence / Approvals panes with the real backend instead of the
 * kit's in-memory fixtures. This reuses the existing react-query service layer
 * (`hooks/useProgramTabs` → `/api/mdx/audit`,
 * `/api/regulatory-correspondence/correspondence`,
 * `/api/approval-workflows/pending`) and adapts each response to the kit's
 * `AuditEvent` / `Correspondence` / `Approval` shapes.
 *
 * Data honesty: live data wins when present. Correspondence may fall back to
 * the kit fixture under the explicit sample-mode boundary (../lib/sampleMode,
 * force-disabled in production builds), always under the standing banner.
 *
 * Audit and approvals have NO fallback. They used to share one — a synthesized
 * Part 11 hash-chain and a set of fabricated signed approvals — and it is
 * deleted, along with the type fields that carried it. Those two buckets are
 * live rows or nothing. `states.*` carries the honest DataState (loading /
 * error / idle / empty) for the pane's DataGate; `live.*` reports which buckets
 * are real.
 *
 * Scope note: the Files tree + DossierDrawer document content are still served by
 * the in-memory `dossierStore`. Backing those with real document content is an
 * async store refactor tracked as the next increment.
 */

import * as React from 'react';
import {
  useAuditTrail,
  useCorrespondence,
  useApprovalsPending,
} from '../../hooks/useProgramTabs';
import type {
  AuditEvent as SvcAuditEvent,
  CorrespondenceRow,
  PendingApproval,
} from '../../services/programTabsService';
import { PATHWAY_TABS_DATA } from '../data/pathwayTabs';
import { toDataState, type DataState } from '../lib/dataState';
import { useSampleRows } from '../lib/useSampleRows';
import type {
  Approval,
  AuditEvent,
  AuditKind,
  Correspondence,
  PathwayKey,
  PathwayTabsBundle,
} from '../types';

/* The audit endpoint emits free-form `action` strings; map the common ones onto
   the kit's closed AuditKind enum. Unknown actions fall through to `access` (the
   pane still labels them via AUDIT_KIND_META's neutral default). */
const ACTION_TO_KIND: Record<string, AuditKind> = {
  edit: 'section.edit', update: 'section.edit', create: 'section.edit', write: 'section.edit',
  lock: 'section.lock', unlock: 'section.unlock',
  review: 'review.start', 'review.start': 'review.start',
  verify: 'review.complete', complete: 'review.complete', 'review.complete': 'review.complete',
  sign: 'sign', esign: 'sign', approve: 'sign',
  comment: 'comment', attach: 'attach', upload: 'attach',
  export: 'export', download: 'export', access: 'access', view: 'access',
};

function adaptAudit(events: SvcAuditEvent[]): AuditEvent[] {
  return events.map((e) => {
    const kind = ACTION_TO_KIND[(e.action || '').toLowerCase()] ?? 'access';
    const signed = kind === 'sign';
    return {
      id: e.id,
      when: e.when,
      kind,
      actor: e.actorName || e.actor || 'system',
      role: e.role || undefined,
      target: e.target || e.resource || '',
      target_id: e.resourceId || undefined,
      reason: e.reason || undefined,
      hash: e.sha || undefined,
      prev: e.prev || undefined,
      /* Carried through so the pane can state integrity instead of asserting
         it. The server reads both from the real columns; see mdx-audit.ts. */
      chain: e.chain as AuditEvent['chain'],
      prevAvailable: e.prevAvailable,
      sig: signed ? e.sha : undefined,
      signed,
    };
  });
}

function mapCorrStatus(s?: string | null): Correspondence['status'] {
  const v = (s || '').toLowerCase();
  if (['closed', 'resolved', 'complete', 'completed', 'done'].includes(v)) return 'closed';
  if (['in_review', 'in-review', 'reviewing', 'review', 'pending_review'].includes(v)) return 'in_review';
  return 'open';
}

function adaptCorrespondence(rows: CorrespondenceRow[]): Correspondence[] {
  return rows.map((r) => ({
    id: String(r.id),
    kind: r.communication_type || r.direction || 'Correspondence',
    channel: r.source_channel || '—',
    from: r.sender || '—',
    received: r.received_at || r.created_at || '',
    due: r.due_date || undefined,
    status: mapCorrStatus(r.status),
    subject: r.subject || '(no subject)',
    summary: r.subject || '',
    refs: [],
    ai: false,
  }));
}

function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

const STAGES: readonly string[] = ['review', 'qa', 'medical', 'regulatory'];

/* /api/approval-workflows/pending returns loosely-typed rows ({ id, ...}). Map
   defensively across the field names the server may use; unknowns degrade to
   safe placeholders rather than throwing. Exact field mapping is verified on the
   deployed backend. */
function adaptApprovals(rows: PendingApproval[]): Approval[] {
  return rows.map((r) => {
    const stageRaw = (str(r.stage) || '').toLowerCase();
    const stage = (STAGES.includes(stageRaw) ? stageRaw : 'review') as Approval['stage'];
    const tid = r.target_id;
    return {
      id: String(r.id),
      stage,
      target: str(r.target) || str(r.artifact_name) || str(r.document_title) || str(r.title) || str(r.name) || 'Pending approval',
      target_id: typeof tid === 'string' || typeof tid === 'number' ? tid : undefined,
      requested: str(r.requested_at) || str(r.created_at) || '',
      requested_by: str(r.requested_by) || str(r.requestor) || str(r.created_by) || '—',
      signer: str(r.assigned_to) || str(r.signer) || str(r.approver) || 'You',
      role: str(r.role) || str(r.approver_role) || '—',
      status: 'pending',
      due: str(r.due_date) || str(r.due) || undefined,
      meaning: str(r.meaning) || undefined,
      /* Carried through so the approval card can apply a real Part 11
         signature. Both must be numeric for signing to be offered — a
         signature has to identify the exact revision it covers
         (§11.50(a)), so a missing version disables signing rather than
         defaulting to "latest". */
      document_id: num(r.documentId ?? r.document_id),
      version_id: num(r.versionId ?? r.version_id),
      approval_id: num(r.approvalId ?? r.approval_id ?? r.id),
    };
  });
}

/** Numeric coercion that refuses anything not already a clean number. */
function num(v: unknown): number | undefined {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (typeof v === 'string' && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

/* Stable identities: FilesTreePane keys its tree memo on these arrays, so a
   fresh `[]` each render would rebuild the tree on every render. */
const EMPTY_AUDIT: AuditEvent[] = [];
const EMPTY_APPROVALS: Approval[] = [];

/** Operator-facing message for a failed query, or null when there is none. */
function errorMessage(e: unknown): string | null {
  if (!e) return null;
  return e instanceof Error ? e.message : String(e);
}

export interface PathwayTabsLive extends PathwayTabsBundle {
  /** Live audit events. Never sample content — see the note above. */
  audit: AuditEvent[];
  /** Live pending/decided approvals. Never sample content. */
  approvals: Approval[];
  /** Which buckets resolved from the backend (true) vs sample/empty (false). */
  live: { audit: boolean; correspondence: boolean; approvals: boolean };
  /** Honest per-bucket state for DataGate — loading / error / idle / empty / ready. */
  states: {
    audit: DataState<AuditEvent[]>;
    correspondence: DataState<Correspondence[]>;
    approvals: DataState<Approval[]>;
  };
  /** Per-bucket refetch, wired to DataGate's retry affordance. */
  refresh: { audit: () => void; correspondence: () => void; approvals: () => void };
}

/**
 * Live Audit / Correspondence / Approvals for a pathway program. `programId` is
 * the canonical project id (anchors audit + scopes correspondence); approvals
 * are user/org-scoped server-side. Fixtures appear only in explicit sample mode.
 */
export function usePathwayTabsData(pathway: PathwayKey, programId?: string | null): PathwayTabsLive {
  const fixtures = PATHWAY_TABS_DATA[pathway];

  const auditQ = useAuditTrail({ program: programId ?? undefined });
  const corrQ = useCorrespondence(programId ?? null);
  const apprQ = useApprovalsPending();

  /* Memoized so the adapted arrays keep a stable identity across renders —
     FilesTreePane keys its tree memo on these. */
  const liveAudit = React.useMemo(
    () => (auditQ.data?.events?.length ? adaptAudit(auditQ.data.events) : null),
    [auditQ.data],
  );
  const liveCorr = React.useMemo(
    () => (corrQ.data?.length ? adaptCorrespondence(corrQ.data) : null),
    [corrQ.data],
  );
  const liveAppr = React.useMemo(
    () => (apprQ.data?.length ? adaptApprovals(apprQ.data) : null),
    [apprQ.data],
  );

  /* Correspondence may fall back to sample content under the explicit
     sample-mode boundary, always under the standing banner.

     AUDIT AND APPROVALS MAY NOT, and no longer can: there is no fixture left to
     pass. Both used to run through `useSampleRows` against a synthesized Part 11
     hash-chain and a set of invented signed approvals. Sample mode gated them
     and is force-disabled in production, which made the exposure small — but the
     rule is not about exposure. An audit trail's only evidentiary value is that
     nothing in it was authored for display, so a demonstrable one is not a
     lesser version of the record, it is the opposite of one. Empty is the
     honest answer, and it is the only one these two buckets can now give. */
  const audit = liveAudit ?? EMPTY_AUDIT;
  const correspondence = useSampleRows(liveCorr, fixtures.correspondence);
  const approvals = liveAppr ?? EMPTY_APPROVALS;

  return {
    audit,
    correspondence,
    approvals,
    corrLabel: fixtures.corrLabel,
    live: { audit: !!liveAudit, correspondence: !!liveCorr, approvals: !!liveAppr },
    states: {
      /* `query.data ? live ?? [] : null` keeps toDataState's precedence exact:
         a resolved feed with zero rows is `empty`, an unresolved one is
         `idle` / `loading` / `error`. */
      audit: toDataState<AuditEvent[]>(
        auditQ.data ? liveAudit ?? [] : null,
        auditQ.isLoading,
        errorMessage(auditQ.error),
      ),
      correspondence: toDataState<Correspondence[]>(
        corrQ.data ? liveCorr ?? [] : null,
        corrQ.isLoading,
        errorMessage(corrQ.error),
        { idleReason: 'Agency and notified-body correspondence is filed per program.' },
      ),
      approvals: toDataState<Approval[]>(
        apprQ.data ? liveAppr ?? [] : null,
        apprQ.isLoading,
        errorMessage(apprQ.error),
      ),
    },
    refresh: {
      audit: () => void auditQ.refetch(),
      correspondence: () => void corrQ.refetch(),
      approvals: () => void apprQ.refetch(),
    },
  };
}
