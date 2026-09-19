/**
 * Decision Lineage fixture data -- ported verbatim from kit
 * app/decision-lineage-data.jsx.
 *
 * Grounded in server/routes/decision-lineage.ts:
 *   GET /api/decision-lineage/:entityType/:entityId -> LineageGraph
 *   GET /api/decision-lineage/verify-chain          -> chain integrity
 *   GET /api/decision-lineage/:t/:id/export?format=json|csv|xml
 *
 * LineageNode, LineageGraph, 5 nodeTypes, regulatory badges, 3 artifact
 * graphs, chain-verification contract -- all verbatim from integration tests.
 */

/* ── Types ── */

/**
 * WO-16C finding 70. `cfr11Compliant: boolean` used to live here, and the
 * surface rendered a "21 CFR §11" badge wherever it was true — which the
 * server set to `true` on every node, from a literal nothing computed. The
 * server now sends a per-record presence check instead: which of the elements
 * 21 CFR Part 11 requires an entry to carry (§11.10(e) attributed actor and
 * recorded timestamp, §11.50 applied signature where one is required) this
 * record actually has. COMPLETE is a statement about the record, not a
 * compliance verdict about the decision or the system.
 * Server shape: DecisionLineageService.Part11RecordCheck.
 */
export type LineagePart11Element = 'attributed-actor' | 'recorded-timestamp' | 'applied-signature';

/**
 * Mirrors Part11RecordCheck in server/services/workflow/DecisionLineageService.
 * WO-16C #70 follow-up added PARTIAL and `notAssessed`: the §11.50 element is
 * never checked by that service — `workflow_approvals` carries no signature
 * column and the service reads no signature store — so a record with nothing
 * missing but an unchecked signature is PARTIAL, not COMPLETE.
 */
export interface LineagePart11RecordCheck {
  status: 'COMPLETE' | 'PARTIAL' | 'INCOMPLETE';
  missing: LineagePart11Element[];
  notAssessed: LineagePart11Element[];
}

export interface LineageRegulatory {
  /**
   * `null` when the source record does not classify the event — which is every
   * row from `workflow_approvals`, `workflow_history` and
   * `document_audit_logs`, none of which has such a column. WO-16C #70, second
   * follow-up review: this was the literal `true` at all five server-side node
   * constructors.
   */
  gxpRelevant: boolean | null;
  requiresSignature: boolean;
  /**
   * Mirrors `SignatureStatus` in server/services/workflow/DecisionLineageService.
   * There is deliberately no `'signed'`: the service reads no signature store,
   * and the value it used to emit was `status === 'approved'` relabelled.
   * `'pending'` and `'rejected'` are positive statements that no signature has
   * been applied; `'not_assessed'` is the absence of a check.
   */
  signatureStatus?: 'pending' | 'rejected' | 'not_assessed';
  part11RecordCheck: LineagePart11RecordCheck;
}

/**
 * Mirrors `FrameworkAssessment` in server/services/workflow/DecisionLineageService
 * — the per-framework standing the graph's own metadata carries (WO-16C #71).
 */
export interface LineageFrameworkAssessment {
  framework: string;
  status: 'COMPLIANT' | 'REVIEW_REQUIRED' | 'UNVERIFIABLE' | 'NOT_ASSESSED';
  note?: string;
}

export interface LineageNodeDetails {
  reason?: string;
  note?: string;
  claim?: string;
  changes?: string;
  open?: string;
  scope?: string;
  purpose?: string;
  evidence?: string;
  location?: string;
  to?: string;
  from?: string;
  fromStatus?: string;
  toStatus?: string;
  status?: string;
  version?: string;
  esignature?: string;
  decision?: string;
  module?: string;
  standard?: string;
  form?: string;
  reviewers?: string[];
  [key: string]: unknown;
}

export interface LineageNode {
  id: string;
  nodeType: 'decision' | 'document_state' | 'workflow_step' | 'evidence_link' | 'delegation';
  entityType: string;
  entityId: number;
  action: string;
  /** null when the source record attributes the event to nobody. */
  performedBy: string | null;
  performedByRole?: string;
  /** null when the source record carries no time — e.g. a pending approval. */
  performedAt: string | null;
  details: LineageNodeDetails;
  recordHash: string;
  parentIds: string[];
  childIds: string[];
  regulatory: LineageRegulatory;
}

export interface LineageEdge {
  from: string;
  to: string;
  relationship: string;
}

export interface LineageMetadata {
  generatedAt: string;
  totalDecisions: number;
  totalApprovals: number;
  totalRejections: number;
  totalDelegations: number;
  chainVerified: boolean;
  /** WO-16B finding 12's three-valued chain result, as the server sends it. */
  chainVerification?: 'verified' | 'failed' | 'unverifiable';
  chainVerificationReason?: string;
  /**
   * WO-16C #71 made this a per-framework assessment on the server. The client
   * type still said `string[]`, so the surface could not read the statuses and
   * rendered a static four-item list with a check beside each instead — an
   * attestation independent of anything the server computed.
   */
  complianceFrameworks?: LineageFrameworkAssessment[];
}

export interface LineageGraph {
  rootEntityType: string;
  rootEntityId: number;
  artifactLabel: string;
  nodes: LineageNode[];
  edges: LineageEdge[];
  metadata: LineageMetadata;
}

export interface LineageNodeTypeConfig {
  label: string;
  icon: string;
  tone: string;
}

export interface LineageFramework {
  framework: string;
  sections: string[];
}

export interface LineageChain {
  chainIntegrity: string;
  entriesVerified: number;
  complianceStatus: string;
  verifiedAt: string;
  frameworks: string[];
}

/* ── Node-type visual config (5 types from integration test) ── */

export const LINEAGE_NODE_TYPES: Record<string, LineageNodeTypeConfig> = {
  document_state: { label: 'Document', icon: 'fileText', tone: 'neutral' },
  decision: { label: 'Decision', icon: 'gitBranch', tone: 'accent' },
  workflow_step: { label: 'Workflow', icon: 'workflow', tone: 'neutral' },
  evidence_link: { label: 'Evidence', icon: 'link', tone: 'info' },
  delegation: { label: 'Delegation', icon: 'users', tone: 'warn' },
};

/* ── Compliance frameworks ── */

export const LINEAGE_FRAMEWORKS: LineageFramework[] = [
  { framework: 'FDA 21 CFR Part 11', sections: ['§11.10(e) Audit trails', '§11.50 Signature manifestation'] },
  { framework: 'EU Annex 11', sections: ['§9 Audit trails', '§14 Electronic signatures'] },
  { framework: 'ICH E6(R2) GCP', sections: ['§5.5.3 Data integrity'] },
  { framework: 'PMDA ERES', sections: ['Electronic records & signatures'] },
];

/* ── What was here, and why it is gone ─────────────────────────────────────
 *
 * `LINEAGE_CHAIN`, `LINEAGE_GRAPHS`, and the `lnHash` / `node` helpers that
 * built them. All four had ZERO consumers: `DecisionLineage.tsx` imports only
 * the types and the two config constants above, and reads the real chain from
 * `/api/decision-lineage/verify-chain`.
 *
 * They are deleted rather than left dead because of what they were.
 *
 * `lnHash` was a manufacturer of content hashes:
 *
 *     function lnHash(seed: string): string {
 *       let h = 0;
 *       for (…) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
 *       return 'sha256:' + h.toString(16)… ;
 *     }
 *
 * A 31-multiplier string hash, prefixed `sha256:` and stamped onto every
 * lineage node as its `recordHash`. `LINEAGE_CHAIN` asserted
 * `chainIntegrity: 'VERIFIED'`, `entriesVerified: 1284` and
 * `complianceStatus: 'COMPLIANT'`, citing 21 CFR Part 11 §11.10(e) and EU
 * Annex 11 §9 by name.
 *
 * The surface was cleaned up and the generator was left behind — one import
 * away from putting invented hashes and a self-declared VERIFIED chain back on
 * a Part 11 lineage view. This is the same class as the synthesized hash-chain
 * removed from `mdx/data/pathwayTabs.ts`: an audit trail's evidentiary value is
 * that nothing in it was authored for display, and a fabricated one is not a
 * lesser version of that record but the opposite of one. Deleting the machinery
 * is what stops it returning; keeping it as dead code is an invitation with a
 * comment on it.
 *
 * The types (`LineageChain`, `LineageNode`, `LineageGraph`) stay — they describe
 * the shape the REAL endpoint returns, and are consumed. */
