import { beforeEach, describe, it, expect, vi } from 'vitest';
import { createDefinition, validatePanels } from '../definition-service';
import type { ReportCanvasPanel } from '@shared/schema/report-os';

const mocks = vi.hoisted(() => ({ registry: vi.fn(), insert: vi.fn(), capabilities: vi.fn() }));
vi.mock('../../../../db', () => ({ db: { select: () => ({ from: mocks.registry }), insert: mocks.insert } }));
vi.mock('../../../entitlements/resolver', () => ({ resolveCapabilities: mocks.capabilities }));

// Registry metadata carries both entitlement family and the type's allowed scopes.
const KNOWN = new Map([
  ['readiness.executive_digest', { family: 'readiness', allowedScopes: ['program', 'project', 'submission'] }],
  ['grants.portfolio_register', { family: 'grants', allowedScopes: ['program', 'project', 'account'] }],
  ['prediction.regulatory_forecast', { family: 'prediction', allowedScopes: ['program', 'project', 'submission'] }],
  ['fcoi.disclosure_register', { family: 'fcoi', allowedScopes: ['submission', 'project'] }],
  ['provenance.evidence_trace_report', { family: 'provenance', allowedScopes: ['project', 'document'] }],
]);

function panel(over: Partial<ReportCanvasPanel> & { reportTypeId: string }): ReportCanvasPanel {
  return { scopeType: 'project', ...over };
}

describe('validatePanels', () => {
  it('accepts entitled, known, well-scoped panels', () => {
    const issues = validatePanels([panel({ reportTypeId: 'readiness.executive_digest' })], KNOWN, 'standard');
    expect(issues).toEqual([]);
  });

  it('flags an unknown report type', () => {
    const issues = validatePanels([panel({ reportTypeId: 'does.not_exist' })], KNOWN, 'enterprise');
    expect(issues).toEqual([{ index: 0, reportTypeId: 'does.not_exist', reason: 'unknown_type' }]);
  });

  it('flags an invalid scope', () => {
    const issues = validatePanels(
      [{ reportTypeId: 'readiness.executive_digest', scopeType: 'galaxy' as any }],
      KNOWN,
      'standard',
    );
    expect(issues[0]).toMatchObject({ index: 0, reason: 'invalid_scope' });
  });

  it('flags a panel the tier does not entitle, with the required tier', () => {
    // A computed domain portfolio still requires the enterprise plan.
    const issues = validatePanels([panel({ reportTypeId: 'grants.portfolio_register' })], KNOWN, 'standard');
    expect(issues[0]).toMatchObject({ index: 0, reason: 'not_entitled', requiredTier: 'enterprise' });
  });

  it('lets enterprise through the same portfolio panel', () => {
    expect(validatePanels([panel({ reportTypeId: 'grants.portfolio_register' })], KNOWN, 'enterprise')).toEqual([]);
  });

  it('reports issues per-panel with correct indices', () => {
    const issues = validatePanels(
      [
        panel({ reportTypeId: 'readiness.executive_digest' }),  // ok
        panel({ reportTypeId: 'grants.portfolio_register' }),   // not entitled at professional
        panel({ reportTypeId: 'unknown.type' }),                // unknown
      ],
      KNOWN,
      'professional',
    );
    expect(issues.map((i) => i.index)).toEqual([1, 2]);
    expect(issues.map((i) => i.reason)).toEqual(['not_entitled', 'unknown_type']);
  });

  it('refuses a registered, entitled type when no engine computes it', () => {
    const issues = validatePanels([panel({ reportTypeId: 'prediction.regulatory_forecast' })], KNOWN, 'enterprise');
    expect(issues[0]).toMatchObject({ reason: 'not_computed' });
    expect(issues[0].availabilityReason).toBeTruthy();
  });

  it('refuses a valid global scope that this registry type does not allow', () => {
    const issues = validatePanels([panel({ reportTypeId: 'fcoi.disclosure_register', scopeType: 'account' })], KNOWN, 'enterprise');
    expect(issues[0]).toMatchObject({ reason: 'invalid_scope' });
    expect(issues[0].availabilityReason).toBeTruthy();
  });

  it('refuses advertised readiness scopes that the actual engine does not compute', () => {
    for (const scopeType of ['program', 'submission'] as const) {
      const issues = validatePanels([panel({ reportTypeId: 'readiness.executive_digest', scopeType })], KNOWN, 'standard');
      expect(issues[0]).toMatchObject({ reason: 'invalid_scope' });
      expect(issues[0].availabilityReason).toBeTruthy();
    }
  });

  it('allows lineage on a document and refuses it on a project', () => {
    expect(validatePanels([panel({ reportTypeId: 'provenance.evidence_trace_report', scopeType: 'document' })], KNOWN, 'standard')).toEqual([]);
    expect(validatePanels([panel({ reportTypeId: 'provenance.evidence_trace_report' })], KNOWN, 'standard')[0]).toMatchObject({ reason: 'invalid_scope' });
  });

  it('refuses a type whose registry has no allowed scopes', () => {
    const known = new Map([['fcoi.disclosure_register', { family: 'fcoi', allowedScopes: [] }]]);
    expect(validatePanels([panel({ reportTypeId: 'fcoi.disclosure_register' })], known, 'enterprise')[0]).toMatchObject({ reason: 'invalid_scope' });
  });
});

describe('createDefinition validation', () => {
  beforeEach(() => vi.clearAllMocks());

  it('does not save a standard report when entitlement resolution is unavailable', async () => {
    mocks.registry.mockResolvedValue([{ typeId: 'readiness.executive_digest', family: 'readiness', allowedScopes: ['project'] }]);
    mocks.capabilities.mockRejectedValue(new Error('Entitlement store unavailable'));
    await expect(createDefinition({
      organizationId: 7,
      title: 'Readiness',
      spec: { scopeType: 'project', panels: [panel({ reportTypeId: 'readiness.executive_digest' })] },
    })).rejects.toThrow('Entitlement store unavailable');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('uses the fetched registry scope restriction before persisting a panel', async () => {
    mocks.registry.mockResolvedValue([{ typeId: 'fcoi.disclosure_register', family: 'fcoi', allowedScopes: ['submission'] }]);
    mocks.capabilities.mockResolvedValue({ tier: 'enterprise' });
    const result = await createDefinition({
      organizationId: 7,
      title: 'Disclosures',
      spec: { scopeType: 'project', panels: [panel({ reportTypeId: 'fcoi.disclosure_register' })] },
    });
    expect(result).toMatchObject({ ok: false, issues: [{ reason: 'invalid_scope' }] });
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('does not persist an entitled forecast as an executable panel', async () => {
    mocks.registry.mockResolvedValue([{ typeId: 'prediction.regulatory_forecast', family: 'prediction', allowedScopes: ['project'] }]);
    mocks.capabilities.mockResolvedValue({ tier: 'enterprise' });
    const result = await createDefinition({
      organizationId: 7,
      title: 'Forecast',
      spec: { scopeType: 'project', panels: [panel({ reportTypeId: 'prediction.regulatory_forecast' })] },
    });
    expect(result).toMatchObject({ ok: false, issues: [{ reason: 'not_computed' }] });
    expect(mocks.insert).not.toHaveBeenCalled();
  });
});
