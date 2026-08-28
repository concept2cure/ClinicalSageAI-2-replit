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

export interface LineageRegulatory {
  gxpRelevant: boolean;
  requiresSignature: boolean;
  signatureStatus?: 'signed' | 'pending' | 'rejected';
  cfr11Compliant: boolean;
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
  performedBy: string;
  performedByRole?: string;
  performedAt: string;
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
  complianceFrameworks: string[];
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
