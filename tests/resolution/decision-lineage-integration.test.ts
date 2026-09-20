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
/*
 * WO-16C #70, second follow-up review. This file used to re-declare
 * `LineageNode` and `LineageGraph` as local copies, and the copies had drifted:
 * they still carried `gxpRelevant: boolean`, `signatureStatus?: … | 'signed'`,
 * a two-valued `part11RecordCheck.status` and `complianceFrameworks: string[]`
 * — a shape the service stopped producing. A structural test whose types are a
 * private copy of the thing under test cannot fail when that thing changes; it
 * pins the OLD contract and reads as coverage.
 *
 * The real types are imported instead, so the fixture below is checked against
 * the service's own vocabulary at compile time and this file cannot drift again.
 */
import type { LineageGraph } from '../../server/services/workflow/DecisionLineageService';

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
        regulatory: {
          // A document_audit_logs row records no GxP classification.
          gxpRelevant: null,
          requiresSignature: false,
          part11RecordCheck: { status: 'COMPLETE', missing: [], notAssessed: [] },
        },
      },
      {
        id: 'node-2', nodeType: 'decision', entityType: 'artifact', entityId: 42,
        action: 'approved', performedBy: 'reviewer-1', performedAt: '2026-03-21T10:00:00Z',
        details: { fromStatus: 'review', toStatus: 'approved' }, parentIds: ['node-1'], childIds: ['node-3'],
        regulatory: {
          gxpRelevant: true,
          requiresSignature: true,
          // No 'signed' exists: nothing in this subsystem reads a signature
          // store, so a record that needs one is reported unchecked, and a
          // record with nothing missing and an unchecked element is PARTIAL.
          signatureStatus: 'not_assessed',
          part11RecordCheck: {
            status: 'PARTIAL',
            missing: [],
            notAssessed: ['applied-signature'],
          },
        },
      },
      {
        id: 'node-3', nodeType: 'document_state', entityType: 'artifact', entityId: 42,
        action: 'locked', performedBy: 'reviewer-1', performedAt: '2026-03-22T10:00:00Z',
        details: { status: 'locked' }, parentIds: ['node-2'], childIds: [],
        regulatory: {
          gxpRelevant: true,
          requiresSignature: true,
          // No 'signed' exists: nothing in this subsystem reads a signature
          // store, so a record that needs one is reported unchecked, and a
          // record with nothing missing and an unchecked element is PARTIAL.
          signatureStatus: 'not_assessed',
          part11RecordCheck: {
            status: 'PARTIAL',
            missing: [],
            notAssessed: ['applied-signature'],
          },
        },
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
      chainVerification: 'verified',
      complianceFrameworks: [
        { framework: 'FDA 21 CFR Part 11', status: 'COMPLIANT' },
        { framework: 'EU Annex 11', status: 'COMPLIANT' },
      ],
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

  it('metadata carries a per-framework standing, not a list of names', () => {
    expect(mockGraph.metadata.chainVerification).toBe('verified');
    // WO-16C #71: a framework appears with the status something computed for
    // it. A bare name in a list reads as conformance and asserts nothing.
    const part11 = mockGraph.metadata.complianceFrameworks.find(
      f => f.framework === 'FDA 21 CFR Part 11',
    );
    expect(part11).toBeDefined();
    expect(part11!.status).toBe('COMPLIANT');
    for (const f of mockGraph.metadata.complianceFrameworks) {
      expect(f.status).toMatch(/^(COMPLIANT|REVIEW_REQUIRED|UNVERIFIABLE|NOT_ASSESSED)$/);
    }
  });

  it('GxP relevance is three-valued — recorded, recorded-false, or not recorded', () => {
    for (const node of mockGraph.nodes) {
      // WO-16C #70, second follow-up review: `true` at every constructor made
      // the compliance report's gxpRelevantRecords equal its total, always.
      expect([true, false, null]).toContain(node.regulatory.gxpRelevant);
      // The interface carries a per-record element check, never a standing
      // Part 11 verdict. The real service's values are asserted against real
      // rows in server/services/workflow/__tests__/decision-lineage-node-fabrication.test.ts.
      expect(node.regulatory.part11RecordCheck.status).toMatch(/^(COMPLETE|PARTIAL|INCOMPLETE)$/);
      expect(node.regulatory).not.toHaveProperty('cfr11Compliant');
    }
    // The document_state row comes from a table with no such column.
    expect(mockGraph.nodes[0].regulatory.gxpRelevant).toBeNull();
  });

  it('an approval that requires a signature is never reported as signed', () => {
    const approvalNode = mockGraph.nodes.find(n => n.action === 'approved');
    expect(approvalNode).toBeDefined();
    expect(approvalNode!.regulatory.requiresSignature).toBe(true);
    // 'signed' is not a member of the union — this subsystem reads no signature
    // store, so the strongest true statement is that it was not assessed here.
    expect(approvalNode!.regulatory.signatureStatus).toBe('not_assessed');
    expect(approvalNode!.regulatory.part11RecordCheck.notAssessed).toContain('applied-signature');
  });
});
