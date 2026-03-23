/**
 * Receipt Capture — produces one real BundleExecutionReceipt for demo/audit
 *
 * Run: npx vitest run tests/resolution/receipt-capture.test.ts
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ═══════════════════════════════════════════════════════════════════════════════
// MOCK DATABASE (same as bundle-execution tests)
// ═══════════════════════════════════════════════════════════════════════════════

const mockBundleState = { current: 'proposed' };
const mockPlanState = { current: 'in_resolution' };
const mockItems: any[] = [];
const mockSupersessions: any[] = [];
let supersessionSelectCount = 0; // Track SELECT calls to supersession_records

vi.mock('../../server/db', () => {
  const createChainedMock = () => {
    const chain: any = {};
    chain.values = vi.fn().mockReturnValue(chain);
    chain.returning = vi.fn().mockImplementation(() => {
      const record = {
        id: `supersession-${Date.now()}`,
        state: 'proposed',
      };
      mockSupersessions.push(record);
      return Promise.resolve([record]);
    });
    chain.set = vi.fn().mockImplementation((data: any) => {
      if (data.state && ['in_progress', 'pending_review'].includes(data.state)) {
        mockBundleState.current = data.state;
      }
      return chain;
    });
    chain.where = vi.fn().mockReturnValue(chain);
    chain.from = vi.fn().mockImplementation((table: any) => {
      return chain;
    });
    chain.limit = vi.fn().mockImplementation(() => Promise.resolve([]));
    chain.orderBy = vi.fn().mockImplementation(() => Promise.resolve(mockItems));
    return chain;
  };

  return {
    db: {
      insert: vi.fn().mockImplementation(() => {
        const chain = createChainedMock();
        return chain;
      }),
      select: vi.fn().mockImplementation(() => {
        const chain = createChainedMock();
        chain.from = vi.fn().mockImplementation((table: any) => {
          const tableName = table?.name || table?.[Symbol.for('drizzle:Name')] || 'unknown';
          chain.limit = vi.fn().mockImplementation(() => {
            if (tableName === 'resolution_bundles') {
              return Promise.resolve([{
                id: 'bundle-demo-001',
                organizationId: 1,
                projectId: 42,
                title: 'Resolution: Primary Endpoint Drift Between Protocol and SAP',
                state: mockBundleState.current,
                planId: 'plan-demo-001',
                requiresReview: true,
                requiresReapproval: true,
                confidence: 'moderate',
                createdById: 1,
                resolutionMemo: null,
                reviewThreadId: null,
                approvedById: null,
                approvedAt: null,
                createdAt: new Date('2026-03-23T04:30:00Z'),
                updatedAt: new Date('2026-03-23T04:30:00Z'),
                completedAt: null,
                description: 'Resolves endpoint definition contradiction between Protocol Section 3.1 and SAP Section 2.4',
              }]);
            }
            if (tableName === 'resolution_plans') {
              return Promise.resolve([{
                id: 'plan-demo-001',
                organizationId: 1,
                projectId: 42,
                state: mockPlanState.current,
                triggerType: 'contradiction',
                triggerId: 'contradiction-endpoint-drift-001',
                triggerDescription: 'Primary endpoint defined as PFS in Protocol Section 3.1 but as OS in SAP Section 2.4',
                recommendedPath: 'mixed',
                confidence: 'moderate',
                requiresReview: true,
                requiresReapproval: true,
                requiresEscalation: false,
                affectedObjects: [
                  { objectType: 'artifact', objectId: 'art-protocol-31', objectTitle: 'Protocol Section 3.1 — Endpoints', impactState: 'direct' },
                  { objectType: 'artifact', objectId: 'art-sap-24', objectTitle: 'SAP Section 2.4 — Primary Analysis', impactState: 'direct' },
                  { objectType: 'assumption', objectId: 'assumption-primary-ep', objectTitle: 'Primary Endpoint Selection Rationale', impactState: 'root_cause' },
                  { objectType: 'document', objectId: 'doc-exec-summary', objectTitle: 'Executive Summary v2.1', impactState: 'indirect' },
                  { objectType: 'artifact', objectId: 'art-stat-rationale', objectTitle: 'Statistical Rationale for Sample Size', impactState: 'indirect' },
                ],
                alternativePaths: [],
                rationale: 'Protocol and SAP disagree on primary endpoint. Root cause is outdated endpoint assumption from Phase II. Resolution requires superseding assumption, rewriting SAP, harmonizing protocol, and reviewing downstream documents.',
                createdById: 1,
                bundleId: 'bundle-demo-001',
                resolvedAt: null,
                resolvedById: null,
                resolutionSummary: null,
                createdAt: new Date('2026-03-23T04:25:00Z'),
                updatedAt: new Date('2026-03-23T04:25:00Z'),
              }]);
            }
            if (tableName === 'supersession_records') {
              supersessionSelectCount++;
              // First 2 SELECTs per supersession are chain-check and duplicate-check (return empty)
              // 3rd SELECT is confirmSupersession lookup (return the record)
              if (supersessionSelectCount <= 2) {
                return Promise.resolve([]);
              }
              if (mockSupersessions.length > 0) {
                return Promise.resolve([mockSupersessions[mockSupersessions.length - 1]]);
              }
              return Promise.resolve([]);
            }
            return Promise.resolve([]);
          });
          chain.orderBy = vi.fn().mockImplementation(() => {
            if (tableName === 'resolution_bundle_items') {
              return Promise.resolve(mockItems);
            }
            return Promise.resolve([]);
          });
          return chain;
        });
        return chain;
      }),
      update: vi.fn().mockImplementation(() => createChainedMock()),
      execute: vi.fn().mockImplementation((query: any) => {
        const queryStr = String(query?.queryChunks?.[0] || query?.sql || '');
        if (queryStr.includes('concept2cure_artifacts') && queryStr.includes('SELECT')) {
          // stat-rationale is in 'approved' state (was previously approved)
          // protocol and SAP are in 'draft' state
          return Promise.resolve({ rows: [{ status: 'draft' }] });
        }
        if (queryStr.includes('supersession_records') && queryStr.includes('SELECT')) {
          return Promise.resolve({ rows: [] });
        }
        return Promise.resolve({ rows: [] });
      }),
    },
  };
});

import { executeBundle } from '../../server/services/resolution/bundle-executor';

// ═══════════════════════════════════════════════════════════════════════════════
// RECEIPT CAPTURE
// ═══════════════════════════════════════════════════════════════════════════════

describe('Receipt Capture — Real Execution Example', () => {
  beforeEach(() => {
    mockBundleState.current = 'proposed';
    mockPlanState.current = 'in_resolution';
    mockSupersessions.length = 0;
    supersessionSelectCount = 0;
    mockItems.length = 0;

    // The real scenario: endpoint drift across 5 objects
    mockItems.push(
      {
        id: 'item-001-protocol',
        bundleId: 'bundle-demo-001',
        objectType: 'artifact',
        objectId: 'art-protocol-31',
        objectTitle: 'Protocol Section 3.1 — Endpoints',
        actionType: 'harmonize',
        actionDescription: 'Harmonize protocol endpoint definition to align with corrected primary endpoint (OS, not PFS)',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: 'm5.3.5.1',
        impactRationale: 'Protocol Section 3.1 defines primary endpoint as PFS — must be corrected to OS per updated assumption',
        sortOrder: 0,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T04:30:00Z'),
      },
      {
        id: 'item-002-sap',
        bundleId: 'bundle-demo-001',
        objectType: 'artifact',
        objectId: 'art-sap-24',
        objectTitle: 'SAP Section 2.4 — Primary Analysis',
        actionType: 'rewrite',
        actionDescription: 'Rewrite SAP primary analysis section to reflect OS as primary endpoint with updated statistical methodology',
        status: 'pending',
        preparedContent: '## 2.4 Primary Analysis\n\nThe primary efficacy endpoint is Overall Survival (OS), defined as the time from randomization to death from any cause. The primary analysis will use a stratified log-rank test at a two-sided significance level of 0.05.\n\n### 2.4.1 Primary Estimand\nThe primary estimand targets the treatment effect on OS in the ITT population, using a treatment policy strategy for all intercurrent events.',
        preparedContentConfidence: 'moderate',
        sectionCode: 'm5.3.5.2',
        impactRationale: 'SAP Section 2.4 already references OS but statistical methodology section needs alignment with updated power calculations',
        sortOrder: 1,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T04:30:00Z'),
      },
      {
        id: 'item-003-assumption',
        bundleId: 'bundle-demo-001',
        objectType: 'assumption',
        objectId: 'assumption-primary-ep',
        objectTitle: 'Primary Endpoint Selection Rationale',
        actionType: 'supersede',
        actionDescription: 'Supersede original Phase II endpoint assumption (PFS) with updated Phase III rationale (OS based on DSMB recommendation and regulatory feedback)',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'This assumption is the root cause of the contradiction — Phase II used PFS but DSMB and FDA Type B meeting feedback recommended OS',
        sortOrder: 2,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T04:30:00Z'),
      },
      {
        id: 'item-004-exec-summary',
        bundleId: 'bundle-demo-001',
        objectType: 'document',
        objectId: 'doc-exec-summary',
        objectTitle: 'Executive Summary v2.1',
        actionType: 'review',
        actionDescription: 'Review Executive Summary for stale PFS references — endpoint change may affect efficacy claims summary',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'Executive Summary references "primary endpoint" in efficacy overview — may still cite PFS',
        sortOrder: 3,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T04:30:00Z'),
      },
      {
        id: 'item-005-stat-rationale',
        bundleId: 'bundle-demo-001',
        objectType: 'artifact',
        objectId: 'art-stat-rationale',
        objectTitle: 'Statistical Rationale for Sample Size',
        actionType: 'reapprove',
        actionDescription: 'Reapproval required — sample size calculation was based on PFS hazard ratio, must be recalculated for OS',
        status: 'pending',
        preparedContent: null,
        preparedContentConfidence: null,
        sectionCode: null,
        impactRationale: 'Sample size was powered for PFS (HR=0.70, median 8mo). OS requires different assumptions (HR=0.75, median 24mo), significantly impacting enrollment target',
        sortOrder: 4,
        completedAt: null,
        completedById: null,
        createdAt: new Date('2026-03-23T04:30:00Z'),
      }
    );
  });

  it('produces a complete execution receipt', async () => {
    const receipt = await executeBundle(1, 1, 'bundle-demo-001');

    // ═════════════════════════════════════════════════════════
    // PRINT THE FULL RECEIPT
    // ═════════════════════════════════════════════════════════
    console.log('\n' + '═'.repeat(80));
    console.log('BUNDLE EXECUTION RECEIPT');
    console.log('═'.repeat(80));
    console.log(JSON.stringify(receipt, null, 2));
    console.log('═'.repeat(80) + '\n');

    // ═════════════════════════════════════════════════════════
    // INVARIANT CHECKS (pressure test standard)
    // ═════════════════════════════════════════════════════════

    // 1. Every item accounted for
    const totalAccountedFor = receipt.summary.executed + receipt.summary.prepared + receipt.summary.blocked;
    expect(totalAccountedFor).toBe(receipt.summary.totalItems);
    expect(receipt.summary.totalItems).toBe(5);

    // 2. No superseded object remains authoritative
    for (const obj of receipt.supersededObjects) {
      // Superseded objects should NOT appear in updatedArtifacts
      expect(receipt.updatedArtifacts).not.toContain(obj);
    }

    // 3. Every executed step has traceable lineage
    for (const step of receipt.executedSteps) {
      expect(step.bundleId).toBe('bundle-demo-001');
      expect(step.resolutionPlanId).toBe('plan-demo-001');
      expect(step.timestamp).toBeTruthy();
      expect(step.priorState).toBeTruthy();
      expect(step.newState).toBeTruthy();
      expect(step.priorState).not.toBe(step.newState); // State actually changed
    }

    // 4. Every prepared step has a reason it was not executed
    for (const step of receipt.preparedSteps) {
      expect(step.preparedAction).toBeTruthy();
      expect(step.preparedAction.length).toBeGreaterThan(10); // Not a stub
      expect(step.confidence).toBeTruthy();
    }

    // 5. Every blocked step names the blocking condition
    for (const step of receipt.blockedSteps) {
      expect(step.reason).toBeTruthy();
      expect(step.reason.length).toBeGreaterThan(5);
    }

    // 6. Contradiction state never advances farther than reality supports
    // With 3 executed + 2 prepared, state should be in_resolution (not resolved)
    expect(receipt.contradictionState).toBe('in_resolution');

    // 7. Specific outcome assertions
    // Assumption must be superseded
    expect(receipt.supersededObjects).toContain('assumption:assumption-primary-ep');
    // Protocol and SAP must be updated/staged
    expect(receipt.updatedArtifacts).toContain('artifact:art-sap-24');
    expect(receipt.updatedArtifacts).toContain('artifact:art-protocol-31');
    // Executive summary must require review
    expect(receipt.requiresReview).toContain('document:doc-exec-summary');
    // Stat rationale requires review (reapprove action → always in requiresReview)
    expect(receipt.requiresReview).toContain('artifact:art-stat-rationale');

    // 8. Receipt has planId traceability
    expect(receipt.planId).toBe('plan-demo-001');

    // 9. Timestamp is valid ISO
    expect(() => new Date(receipt.timestamp)).not.toThrow();
    expect(new Date(receipt.timestamp).getTime()).toBeGreaterThan(0);

    // 10. Receipt is serializable (can be stored, transmitted, logged)
    const serialized = JSON.stringify(receipt);
    const deserialized = JSON.parse(serialized);
    expect(deserialized.bundleId).toBe(receipt.bundleId);
    expect(deserialized.summary.totalItems).toBe(receipt.summary.totalItems);
  });
});
