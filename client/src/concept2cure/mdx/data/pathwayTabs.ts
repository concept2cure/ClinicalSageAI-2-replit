/**
 * Pathway sub-tab closed enums.
 * Ported from `design-system/ui_kits/mdx/data-pathway-tabs.jsx`.
 *
 * @kit-registry-no-consumer-yet
 * Remove the marker above when the kit's pathway sub-tab pane lands and
 * imports AUDIT_KIND_META. Until then this file is exempt from the
 * orphan-import check (scripts/check-mdx-orphans.sh) on the grounds that
 * the closed-enum registry is real Part 11 audit-kind taxonomy, not dead
 * seed data.
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

import type { AuditKind, AuditKindMeta } from '../types';

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
