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
 * Resilience: every bucket falls back to the kit fixtures (`PATHWAY_TABS_DATA`)
 * when its query has no data (loading / error / undeployed / empty), so the panes
 * never render empty or throw. `live.*` reports which buckets are real.
 *
 * Scope note: the Files tree + DossierDrawer document content are still served by
 * the in-memory `dossierStore`. Backing those with real document content is an
 * async store refactor tracked as the next increment.
 */

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
    };
  });
}

export interface PathwayTabsLive extends PathwayTabsBundle {
  /** Which buckets resolved from the backend (true) vs fixture fallback (false). */
  live: { audit: boolean; correspondence: boolean; approvals: boolean };
}

/**
 * Live Audit / Correspondence / Approvals for a pathway program, with kit-fixture
 * fallback. `programId` is the canonical project id (anchors audit + scopes
 * correspondence); approvals are user/org-scoped server-side.
 */
export function usePathwayTabsData(pathway: PathwayKey, programId?: string | null): PathwayTabsLive {
  const fixtures = PATHWAY_TABS_DATA[pathway];

  const auditQ = useAuditTrail({ program: programId ?? undefined });
  const corrQ = useCorrespondence(programId ?? null);
  const apprQ = useApprovalsPending();

  const liveAudit = auditQ.data?.events?.length ? adaptAudit(auditQ.data.events) : null;
  const liveCorr = corrQ.data?.length ? adaptCorrespondence(corrQ.data) : null;
  const liveAppr = apprQ.data?.length ? adaptApprovals(apprQ.data) : null;

  return {
    audit: liveAudit ?? fixtures.audit,
    correspondence: liveCorr ?? fixtures.correspondence,
    approvals: liveAppr ?? fixtures.approvals,
    corrLabel: fixtures.corrLabel,
    live: { audit: !!liveAudit, correspondence: !!liveCorr, approvals: !!liveAppr },
  };
}
