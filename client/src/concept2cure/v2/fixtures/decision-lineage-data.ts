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

/* ── Chain verification contract ── */

export const LINEAGE_CHAIN: LineageChain = {
  chainIntegrity: 'VERIFIED',
  entriesVerified: 1284,
  complianceStatus: 'COMPLIANT',
  verifiedAt: '2026-07-05T07:12:00Z',
  frameworks: ['FDA 21 CFR Part 11 §11.10(e)', 'EU Annex 11 §9', 'ICH E6(R2) §5.5.3', 'PMDA ERES Guidelines'],
};

/* ── Helper: deterministic display-only short hash ── */

function lnHash(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return 'sha256:' + h.toString(16).padStart(8, '0') + '...' + ((h * 2654435761) >>> 0).toString(16).slice(0, 6);
}

function node(o: Omit<LineageNode, 'recordHash' | 'details' | 'parentIds' | 'childIds'> & {
  recordHash?: string;
  details?: LineageNodeDetails;
  parentIds?: string[];
  childIds?: string[];
}): LineageNode {
  return {
    recordHash: lnHash(o.id + o.action + o.performedAt),
    details: {},
    parentIds: [],
    childIds: [],
    ...o,
  } as LineageNode;
}

/* ── Build a graph from a linear node list (auto-wires edges by parentIds) ── */

function graph(
  rootEntityType: string,
  rootEntityId: number,
  artifactLabel: string,
  nodes: LineageNode[],
): LineageGraph {
  const edges: LineageEdge[] = [];
  nodes.forEach((n) => {
    (n.parentIds || []).forEach((p) => {
      const rel =
        n.nodeType === 'decision'
          ? 'led_to'
          : n.action === 'locked'
            ? 'resulted_in'
            : n.nodeType === 'evidence_link'
              ? 'grounded_by'
              : 'preceded';
      edges.push({ from: p, to: n.id, relationship: rel });
    });
  });
  const decisions = nodes.filter((n) => n.nodeType === 'decision');
  return {
    rootEntityType,
    rootEntityId,
    artifactLabel,
    nodes,
    edges,
    metadata: {
      generatedAt: '2026-07-05T07:12:00Z',
      totalDecisions: decisions.length,
      totalApprovals: decisions.filter((n) => /approv|accept/i.test(n.action)).length,
      totalRejections: decisions.filter((n) => /reject|revision|return/i.test(n.action)).length,
      totalDelegations: nodes.filter((n) => n.nodeType === 'delegation').length,
      chainVerified: true,
      complianceFrameworks: ['FDA 21 CFR Part 11', 'EU Annex 11', 'ICH E6(R2)', 'PMDA ERES'],
    },
  };
}

const _gxp: LineageRegulatory = { gxpRelevant: true, requiresSignature: false, cfr11Compliant: true };
const sig = (status: 'signed' | 'pending' | 'rejected'): LineageRegulatory => ({
  gxpRelevant: true,
  requiresSignature: true,
  signatureStatus: status,
  cfr11Compliant: true,
});

/* ── Artifact 1: §2.5 Clinical Overview (BX-204 BLA 761123) -- in review,
   the real "blocker" doc. Chain shows a revision loop then re-approval pending
   signature (its live status is 'review'). ── */
const g25 = graph('artifact', 4025, 'BX-204 · §2.5 Clinical Overview (BLA 761123)', [
  node({ id: 'n1', nodeType: 'document_state', entityType: 'artifact', entityId: 4025, action: 'created',
    performedBy: 'J. Chen', performedByRole: 'Regulatory Affairs', performedAt: '2026-05-18T09:10:00Z',
    details: { status: 'draft', module: 'CTD 2.5', standard: 'ICH M4E(R2)' }, childIds: ['n2'], regulatory: _gxp }),
  node({ id: 'n2', nodeType: 'evidence_link', entityType: 'artifact', entityId: 4025, action: 'linked_evidence',
    performedBy: 'A. Muller', performedByRole: 'Medical Writer', performedAt: '2026-05-22T14:30:00Z',
    details: { evidence: 'CSR BX204-201 (locked)', location: 'Module 5.3.5.1', claim: 'ORR 42.1% (95% CI 35.8-48.6)' }, parentIds: ['n1'], childIds: ['n3'], regulatory: _gxp }),
  node({ id: 'n3', nodeType: 'workflow_step', entityType: 'artifact', entityId: 4025, action: 'submitted_for_review',
    performedBy: 'A. Muller', performedByRole: 'Medical Writer', performedAt: '2026-06-02T11:05:00Z',
    details: { fromStatus: 'draft', toStatus: 'review', reviewers: ['S. Okafor (Reg Lead)'] }, parentIds: ['n2'], childIds: ['n4'], regulatory: _gxp }),
  node({ id: 'n4', nodeType: 'decision', entityType: 'artifact', entityId: 4025, action: 'revision_requested',
    performedBy: 'S. Okafor', performedByRole: 'Regulatory Lead', performedAt: '2026-06-09T16:40:00Z',
    details: { reason: '§2.5.4 benefit-risk uses "establishes" -- soften to match the E9(R1) estimand; reconcile ORR CI wording with §2.7.3.', decision: 'return for revision' }, parentIds: ['n3'], childIds: ['n5'], regulatory: sig('signed') }),
  node({ id: 'n5', nodeType: 'document_state', entityType: 'artifact', entityId: 4025, action: 'revised',
    performedBy: 'A. Muller', performedByRole: 'Medical Writer', performedAt: '2026-06-24T10:20:00Z',
    details: { status: 'review', changes: '3 tracked changes accepted; benefit-risk language softened; §2.7.3 cross-ref aligned.' }, parentIds: ['n4'], childIds: ['n6'], regulatory: _gxp }),
  node({ id: 'n6', nodeType: 'decision', entityType: 'artifact', entityId: 4025, action: 'approved_pending_signature',
    performedBy: 'S. Okafor', performedByRole: 'Regulatory Lead', performedAt: '2026-07-01T13:15:00Z',
    details: { fromStatus: 'review', toStatus: 'approved', note: 'Approved for lock; awaiting QP electronic signature (§11.50).' }, parentIds: ['n5'], childIds: [], regulatory: sig('pending') }),
]);

/* ── Artifact 2: §1.1 Form FDA 356h (BX-204) -- final/locked, clean chain. ── */
const g11 = graph('artifact', 4011, 'BX-204 · §1.1 Form FDA 356h (BLA 761123)', [
  node({ id: 'm1', nodeType: 'document_state', entityType: 'artifact', entityId: 4011, action: 'created',
    performedBy: 'J. Chen', performedByRole: 'Regulatory Affairs', performedAt: '2026-04-30T08:00:00Z',
    details: { status: 'draft', form: 'FDA 356h', purpose: 'Application to market a biologic -- BX-204, accelerated approval.' }, childIds: ['m2'], regulatory: _gxp }),
  node({ id: 'm2', nodeType: 'decision', entityType: 'artifact', entityId: 4011, action: 'approved',
    performedBy: 'S. Okafor', performedByRole: 'Regulatory Lead', performedAt: '2026-05-06T15:30:00Z',
    details: { fromStatus: 'review', toStatus: 'approved' }, parentIds: ['m1'], childIds: ['m3'], regulatory: sig('signed') }),
  node({ id: 'm3', nodeType: 'document_state', entityType: 'artifact', entityId: 4011, action: 'locked',
    performedBy: 'S. Okafor', performedByRole: 'Regulatory Lead', performedAt: '2026-05-06T15:31:00Z',
    details: { status: 'locked', version: 'v3.0', esignature: '21 CFR §11.50 signature manifestation attached' }, parentIds: ['m2'], childIds: [], regulatory: sig('signed') }),
]);

/* ── Artifact 3: §3.2.S.4 Control of drug substance (BX-204 CMC) -- review with
   a delegation + open comparability decision (its real flag). ── */
const g324 = graph('artifact', 4324, 'BX-204 · §3.2.S.4 Control of drug substance (CMC)', [
  node({ id: 'c1', nodeType: 'document_state', entityType: 'artifact', entityId: 4324, action: 'created',
    performedBy: 'M. Webb', performedByRole: 'CMC Lead', performedAt: '2026-05-11T09:45:00Z',
    details: { status: 'draft', module: 'CTD 3.2.S.4', scope: 'Specifications: identity, purity, potency, impurities.' }, childIds: ['c2'], regulatory: _gxp }),
  node({ id: 'c2', nodeType: 'delegation', entityType: 'artifact', entityId: 4324, action: 'delegated_review',
    performedBy: 'M. Webb', performedByRole: 'CMC Lead', performedAt: '2026-06-15T12:00:00Z',
    details: { to: 'R. Ivanova (Analytical SME)', reason: 'Comparability acceptance criteria vs 3 post-change lots need analytical adjudication.' }, parentIds: ['c1'], childIds: ['c3'], regulatory: _gxp }),
  node({ id: 'c3', nodeType: 'workflow_step', entityType: 'artifact', entityId: 4324, action: 'submitted_for_review',
    performedBy: 'R. Ivanova', performedByRole: 'Analytical SME', performedAt: '2026-06-28T10:10:00Z',
    details: { fromStatus: 'draft', toStatus: 'review', open: 'Comparability acceptance criteria unreconciled vs 3 post-change lots.' }, parentIds: ['c2'], childIds: [], regulatory: _gxp }),
]);

/* ── Exported graph array ── */

export const LINEAGE_GRAPHS: LineageGraph[] = [g25, g11, g324];
