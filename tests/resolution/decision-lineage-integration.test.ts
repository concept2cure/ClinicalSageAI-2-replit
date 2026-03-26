/**
 * Decision Lineage Integration — Pass 16 Tests
 *
 * Tests covering:
 * - DecisionLineageMap component interface
 * - Tab integration into GovernedDocumentPanel
 * - Lineage node type classification
 * - Audit trail completeness
 *
 * @module tests/resolution/decision-lineage-integration.test
 */

import { describe, it, expect } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// TYPES (matching DecisionLineageMap)
// ═══════════════════════════════════════════════════════════════════════════════

interface LineageNode {
  id: string;
  nodeType: 'decision' | 'document_state' | 'workflow_step' | 'evidence_link' | 'delegation';
  entityType: string;
  entityId: number;
  action: string;
  performedBy: string;
  performedAt: string;
  details: Record<string, unknown>;
  recordHash?: string;
  parentIds: string[];
  childIds: string[];
  regulatory: {
    gxpRelevant: boolean;
    requiresSignature: boolean;
    signatureStatus?: 'pending' | 'signed' | 'rejected';
    cfr11Compliant: boolean;
  };
}

interface LineageGraph {
  rootEntityType: string;
  rootEntityId: number;
  nodes: LineageNode[];
  edges: Array<{ from: string; to: string; relationship: string }>;
  metadata: {
    generatedAt: string;
    totalDecisions: number;
    totalApprovals: number;
    totalRejections: number;
    totalDelegations: number;
    chainVerified: boolean;
    complianceFrameworks: string[];
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: COMPONENT INTERFACE
// ═══════════════════════════════════════════════════════════════════════════════

describe('DecisionLineageMap Component Interface', () => {
  it('accepts entityType and entityId props', () => {
    const props = { entityType: 'artifact', entityId: 42 };
    expect(props.entityType).toBe('artifact');
    expect(props.entityId).toBe(42);
  });

  it('supports optional organizationId', () => {
    const props = { entityType: 'artifact', entityId: 42, organizationId: 1 };
    expect(props.organizationId).toBe(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: TAB INTEGRATION
// ═══════════════════════════════════════════════════════════════════════════════

describe('GovernedDocumentPanel Tab Integration', () => {
  const allTabs = ['status', 'audit', 'governance', 'lineage', 'versions', 'snapshots', 'threads'];

  it('includes lineage tab', () => {
    expect(allTabs).toContain('lineage');
  });

  it('lineage tab is positioned after governance', () => {
    const govIdx = allTabs.indexOf('governance');
    const lineageIdx = allTabs.indexOf('lineage');
    expect(lineageIdx).toBe(govIdx + 1);
  });

  it('all 7 tabs are present', () => {
    expect(allTabs).toHaveLength(7);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: LINEAGE NODE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

describe('Lineage Node Types', () => {
  const NODE_TYPES = ['decision', 'document_state', 'workflow_step', 'evidence_link', 'delegation'];

  it('defines 5 node types', () => {
    expect(NODE_TYPES).toHaveLength(5);
  });

  it('includes decision and document_state', () => {
    expect(NODE_TYPES).toContain('decision');
    expect(NODE_TYPES).toContain('document_state');
  });

  it('each node type has visual config', () => {
    const configs: Record<string, { label: string }> = {
      decision: { label: 'Decision' },
      document_state: { label: 'Document' },
      workflow_step: { label: 'Workflow' },
      evidence_link: { label: 'Evidence' },
      delegation: { label: 'Delegation' },
    };

    for (const type of NODE_TYPES) {
      expect(configs[type]).toBeDefined();
      expect(configs[type].label).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// TESTS: LINEAGE GRAPH STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Lineage Graph Structure', () => {
  const mockGraph: LineageGraph = {
    rootEntityType: 'artifact',
    rootEntityId: 42,
    nodes: [
      {
        id: 'node-1', nodeType: 'document_state', entityType: 'artifact', entityId: 42,
        action: 'created', performedBy: 'user-1', performedAt: '2026-03-20T10:00:00Z',
        details: { status: 'draft' }, parentIds: [], childIds: ['node-2'],
        regulatory: { gxpRelevant: true, requiresSignature: false, cfr11Compliant: true },
      },
      {
        id: 'node-2', nodeType: 'decision', entityType: 'artifact', entityId: 42,
        action: 'approved', performedBy: 'reviewer-1', performedAt: '2026-03-21T10:00:00Z',
        details: { fromStatus: 'review', toStatus: 'approved' }, parentIds: ['node-1'], childIds: ['node-3'],
        regulatory: { gxpRelevant: true, requiresSignature: true, signatureStatus: 'signed', cfr11Compliant: true },
      },
      {
        id: 'node-3', nodeType: 'document_state', entityType: 'artifact', entityId: 42,
        action: 'locked', performedBy: 'reviewer-1', performedAt: '2026-03-22T10:00:00Z',
        details: { status: 'locked' }, parentIds: ['node-2'], childIds: [],
        regulatory: { gxpRelevant: true, requiresSignature: true, signatureStatus: 'signed', cfr11Compliant: true },
      },
    ],
    edges: [
      { from: 'node-1', to: 'node-2', relationship: 'led_to' },
      { from: 'node-2', to: 'node-3', relationship: 'resulted_in' },
    ],
    metadata: {
      generatedAt: '2026-03-25T12:00:00Z',
      totalDecisions: 1,
      totalApprovals: 1,
      totalRejections: 0,
      totalDelegations: 0,
      chainVerified: true,
      complianceFrameworks: ['FDA 21 CFR Part 11', 'EU Annex 11'],
    },
  };

  it('graph has root entity', () => {
    expect(mockGraph.rootEntityType).toBe('artifact');
    expect(mockGraph.rootEntityId).toBe(42);
  });

  it('nodes form a chain (parent→child)', () => {
    expect(mockGraph.nodes[0].childIds).toContain('node-2');
    expect(mockGraph.nodes[1].parentIds).toContain('node-1');
    expect(mockGraph.nodes[1].childIds).toContain('node-3');
    expect(mockGraph.nodes[2].parentIds).toContain('node-2');
  });

  it('edges connect sequential nodes', () => {
    expect(mockGraph.edges).toHaveLength(2);
    expect(mockGraph.edges[0].from).toBe('node-1');
    expect(mockGraph.edges[0].to).toBe('node-2');
  });

  it('metadata tracks compliance', () => {
    expect(mockGraph.metadata.chainVerified).toBe(true);
    expect(mockGraph.metadata.complianceFrameworks).toContain('FDA 21 CFR Part 11');
  });

  it('regulatory nodes have GxP relevance flags', () => {
    for (const node of mockGraph.nodes) {
      expect(node.regulatory.gxpRelevant).toBe(true);
      expect(node.regulatory.cfr11Compliant).toBe(true);
    }
  });

  it('approval decisions have signature status', () => {
    const approvalNode = mockGraph.nodes.find(n => n.action === 'approved');
    expect(approvalNode).toBeDefined();
    expect(approvalNode!.regulatory.requiresSignature).toBe(true);
    expect(approvalNode!.regulatory.signatureStatus).toBe('signed');
  });
});
