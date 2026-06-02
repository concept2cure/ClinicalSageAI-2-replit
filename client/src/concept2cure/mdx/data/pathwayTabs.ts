/**
 * Pathway sub-tab closed enums.
 * Ported from `design-system/ui_kits/mdx/data-pathway-tabs.jsx`.
 *
 * The orphan-check marker is gone: a pathway sub-tab pane has landed.
 * APPROVAL_STAGE_META is consumed by surfaces/pathway/ApprovalsPane;
 * AUDIT_KIND_META is consumed by the audit pane as it ships. Both are
 * closed Part 11 taxonomies (kind + stage labels), not seed data.
 *
 * The kit's data fixture also includes hand-crafted demo rows
 * (K510_AUDIT, PMA_AUDIT, CER_AUDIT, K510_CORRESP, …, K510_APPROVALS,
 * PATHWAY_TABS_DATA). Those are NOT ported here — paying clients
 * consume real audit rows from /api/audit/logs, real correspondence
 * from /api/regulatory-correspondence/correspondence, and real
 * approvals from /api/approval-workflows/pending. When the kit's
 * pathway sub-tab panes land, build react-query hooks (using
 * @/lib/queryClient apiRequest) that adapt those endpoints into
 * the kit's AuditEvent / Correspondence / Approval types from ../types.
 *
 * Kept in this module: AUDIT_KIND_META — the closed enum of audit
 * kind labels + tones consumed by display code (chips, tooltips,
 * filter dropdowns) regardless of data source.
 */

import type { AuditKind, AuditKindMeta, AuditTone, ApprovalStage } from '../types';

export const AUDIT_KIND_META: Record<AuditKind, AuditKindMeta> = {
  'section.edit':    { label: 'Edit',     tone: 'neutral' },
  'section.lock':    { label: 'Lock',     tone: 'neutral' },
  'section.unlock':  { label: 'Unlock',   tone: 'warn' },
  'review.start':    { label: 'Review',   tone: 'neutral' },
  'review.complete': { label: 'Verified', tone: 'success' },
  sign:              { label: 'E-sign',   tone: 'accent' },
  comment:           { label: 'Comment',  tone: 'neutral' },
  attach:            { label: 'Attach',   tone: 'neutral' },
  export:            { label: 'Export',   tone: 'neutral' },
  access:            { label: 'Access',   tone: 'neutral' },
};

/** Closed enum: approval stage → pill label + tone. Regulatory is the one
 *  accent (focal) stage; the rest are neutral. */
export const APPROVAL_STAGE_META: Record<ApprovalStage, { label: string; tone: AuditTone }> = {
  review:     { label: 'Review',      tone: 'neutral' },
  qa:         { label: 'QA',          tone: 'neutral' },
  medical:    { label: 'Med affairs', tone: 'neutral' },
  regulatory: { label: 'Regulatory',  tone: 'accent' },
};
