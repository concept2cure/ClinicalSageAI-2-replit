import { describe, it, expect } from 'vitest';
import { clampGraphRagBounds } from '../../routes/graphrag-util';
import { parseVaultMetadata } from '../../services/vaultService';
import { generateConsequences } from '../../src/control-plane/document-consequence-engine';
import { evaluatePublishGate } from '../../src/control-plane/export-publish-gates';

// Fix A — vaultService.parseVaultMetadata: corrupt JSON must not throw.
describe('parseVaultMetadata (vault corrupt-metadata crash)', () => {
  it('parses valid metadata', () => {
    const meta = parseVaultMetadata(JSON.stringify({ storedAt: 'x' }));
    expect(meta).toEqual({ storedAt: 'x' });
  });
  it('returns null on malformed JSON instead of throwing', () => {
    expect(() => parseVaultMetadata('{ not json')).not.toThrow();
    expect(parseVaultMetadata('{ not json')).toBeNull();
    expect(parseVaultMetadata('')).toBeNull();
  });
});

// Fix B — graphrag clampGraphRagBounds: unbounded traversal -> clamped.
describe('clampGraphRagBounds (graphrag resource exhaustion)', () => {
  it('defaults when unset/non-finite', () => {
    expect(clampGraphRagBounds(undefined, undefined)).toEqual({ maxHops: 2, topK: 10 });
    expect(clampGraphRagBounds(NaN as unknown as number, 'x' as unknown as number)).toEqual({ maxHops: 2, topK: 10 });
  });
  it('clamps abusive upper bounds', () => {
    expect(clampGraphRagBounds(1000, 10000)).toEqual({ maxHops: 5, topK: 100 });
  });
  it('clamps non-positive to the floor', () => {
    expect(clampGraphRagBounds(0, 0)).toEqual({ maxHops: 1, topK: 1 });
    expect(clampGraphRagBounds(-5, -5)).toEqual({ maxHops: 1, topK: 1 });
  });
  it('passes through valid values (truncating fractions)', () => {
    expect(clampGraphRagBounds(3, 50)).toEqual({ maxHops: 3, topK: 50 });
    expect(clampGraphRagBounds(2.9, 9.9)).toEqual({ maxHops: 2, topK: 9 });
  });
});

// Fix C — document-consequence-engine: no duplicate dispatch-ready consequence.
describe('generateConsequences (duplicate dispatch-ready consequence)', () => {
  const base = {
    context: { organizationId: 1, projectId: 1, artifactId: 'a1' },
    readiness: { level: 'export_ready', score: 100, blockers: [], warnings: [] },
    placement: { outcome: 'allowed', blockingReasons: [] },
    exportGate: { outcome: 'eligible', gateChecks: [], blockingReasons: [], remediationSteps: [] },
  } as any;

  const countNotDispatchReady = (input: any) =>
    generateConsequences(input).filter(
      c => c.consequenceType === 'mark_submission_item_not_dispatch_ready'
    ).length;

  it('emits the consequence exactly once for a blocked publish gate', () => {
    const input = {
      ...base,
      publishGate: {
        outcome: 'blocked',
        gateChecks: [],
        blockingReasons: [{ category: 'publish_gate_failed', severity: 'critical', message: 'x' }],
        remediationSteps: [],
        dispatchReady: false,
      },
    };
    expect(countNotDispatchReady(input)).toBe(1);
  });

  it('emits once when not blocked but not dispatch-ready', () => {
    const input = {
      ...base,
      publishGate: {
        outcome: 'insufficient_context',
        gateChecks: [],
        blockingReasons: [],
        remediationSteps: [],
        dispatchReady: false,
      },
    };
    expect(countNotDispatchReady(input)).toBe(1);
  });

  it('does not emit when dispatch-ready', () => {
    const input = {
      ...base,
      publishGate: {
        outcome: 'eligible',
        gateChecks: [],
        blockingReasons: [],
        remediationSteps: [],
        dispatchReady: true,
      },
    };
    expect(countNotDispatchReady(input)).toBe(0);
  });
});

// Fix D — export-publish-gates: dispatchReady consistent with outcome.
describe('evaluatePublishGate (dispatchReady/outcome consistency)', () => {
  const baseInput = () =>
    ({
      context: { organizationId: 1, projectId: 1, artifactId: 'a1', regulatorBody: 'FDA', submissionType: 'NDA' },
      readiness: { level: 'export_ready', score: 100, blockers: [], warnings: [] },
      placement: { outcome: 'allowed', blockingReasons: [] },
      hasContent: true,
      hasApproval: true,
      humanReviewApproved: true,
      aiGenerated: false,
      provenanceComplete: true,
      unresolvedContradictionCount: 0,
      isStale: false,
      exportCompleted: true,
      hasGatewayProfile: true,
      gatewayProfileValid: true,
      hasSequenceNumber: true,
      hasAuthorityProfile: true,
      authorityAcceptsFormat: true,
      allSectionsApproved: true,
      staleSectionCount: 0,
    }) as any;

  it('a clean gate is eligible and dispatch-ready', () => {
    const r = evaluatePublishGate(baseInput());
    expect(r.outcome).toBe('eligible');
    expect(r.dispatchReady).toBe(true);
  });

  it('a blocked gate is never dispatch-ready', () => {
    const input = baseInput();
    input.allSectionsApproved = false; // required check fails -> outcome blocked
    const r = evaluatePublishGate(input);
    expect(r.outcome).toBe('blocked');
    expect(r.dispatchReady).toBe(false);
  });

  it('insufficient context is never dispatch-ready', () => {
    const input = baseInput();
    delete input.context.regulatorBody;
    const r = evaluatePublishGate(input);
    expect(r.outcome).toBe('insufficient_context');
    expect(r.dispatchReady).toBe(false);
  });
});
