import { describe, it, expect, vi } from 'vitest';
import { rankReportSuggestions, buildPresetSpec, suggestReportsForOrg, type CandidateType, type ProgramFact } from '../suggestion-service';

const mocks = vi.hoisted(() => ({ select: vi.fn(), capabilities: vi.fn() }));
vi.mock('../../../../db', () => ({ db: { select: mocks.select } }));
vi.mock('../../../entitlements/resolver', () => ({ resolveCapabilities: mocks.capabilities }));
vi.mock('../../segment', async (importOriginal) => ({ ...await importOriginal<typeof import('../../segment')>(), deriveOrgSegments: async () => ['device'] }));

function cand(over: Partial<CandidateType> & { typeId: string; family: string }): CandidateType {
  return {
    label: over.typeId, allowedScopes: ['project'], entitled: true, requiredTier: 'standard',
    ...over,
  };
}

const TYPES: CandidateType[] = [
  cand({ typeId: 'readiness.executive_digest', family: 'readiness', label: 'Exec Readiness' }),
  cand({ typeId: 'grants.portfolio_register', family: 'grants', label: 'Grants Portfolio', entitled: false, requiredTier: 'enterprise' }),
  cand({ typeId: 'etmf.completeness_pack', family: 'etmf', label: 'eTMF Completeness' }),
  cand({ typeId: 'fcoi.disclosure_register', family: 'fcoi', label: 'Disclosure Register' }),
];

describe('rankReportSuggestions', () => {
  it('ranks entitled before locked', () => {
    const out = rankReportSuggestions({ types: TYPES, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    const locked = out.find((s) => s.typeId === 'grants.portfolio_register')!;
    // the locked enterprise pack must not outrank any entitled type
    expect(out.filter((s) => s.entitled).every((s) => out.indexOf(s) < out.indexOf(locked))).toBe(true);
    expect(locked.entitled).toBe(false);
    expect(locked.reasons.some((r) => /enterprise plan/.test(r))).toBe(true);
  });

  it('boosts readiness when programs are in an active push, with a reason', () => {
    const programs: ProgramFact[] = [{ programType: 'NDA', phase: 'submission', status: 'in_review' }];
    const out = rankReportSuggestions({ types: TYPES, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs });
    const readiness = out.find((s) => s.typeId === 'readiness.executive_digest')!;
    expect(readiness.score).toBeGreaterThan(1);
    expect(readiness.reasons.some((r) => /active submission push|NDA/.test(r))).toBe(true);
    // readiness (relevant) should be the first entitled suggestion
    expect(out.filter((s) => s.entitled)[0].typeId).toBe('readiness.executive_digest');
  });

  it('boosts the computed eTMF pack for a CER program', () => {
    const programs: ProgramFact[] = [{ programType: 'CER', phase: 'authoring', status: 'active' }];
    const out = rankReportSuggestions({ types: TYPES, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs });
    const matrix = out.find((s) => s.typeId === 'etmf.completeness_pack')!;
    expect(matrix.score).toBeGreaterThan(1);
    expect(matrix.reasons.some((r) => /CER/.test(r))).toBe(true);
  });

  it('demotes already-used/subscribed types below fresh ones and labels them', () => {
    const out = rankReportSuggestions({
      types: TYPES,
      usedTypeIds: new Set(['readiness.executive_digest']),
      subscribedTypeIds: new Set(['fcoi.disclosure_register']),
      programs: [],
    });
    const readiness = out.find((s) => s.typeId === 'readiness.executive_digest')!;
    const audit = out.find((s) => s.typeId === 'fcoi.disclosure_register')!;
    expect(readiness.alreadyUsed).toBe(true);
    expect(audit.alreadyUsed).toBe(true);
    expect(audit.reasons.some((r) => /schedule/.test(r))).toBe(true);
    // a fresh entitled type outranks the used ones
    const fresh = out.filter((s) => s.entitled && !s.alreadyUsed);
    expect(out.indexOf(fresh[0])).toBeLessThan(out.indexOf(readiness));
  });

  it('does not suggest regional, prediction or assurance types with no implemented engine', () => {
    const unsupported = [
      cand({ typeId: 'prediction.regulatory_forecast', family: 'prediction' }),
      cand({ typeId: 'ema.rmp_psur_signal_alignment', family: 'ema_rmp' }),
      cand({ typeId: 'compliance.audit_assurance_pack', family: 'compliance_audit' }),
    ];
    const out = rankReportSuggestions({ types: [...TYPES, ...unsupported], usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    expect(out.map((s) => s.typeId)).toEqual(expect.arrayContaining(TYPES.map((t) => t.typeId)));
    expect(out.some((s) => unsupported.some((t) => s.typeId === t.typeId))).toBe(false);
  });

  it('only suggests a report when at least one registry scope is actually computed', () => {
    const out = rankReportSuggestions({
      types: [
        cand({ typeId: 'readiness.executive_digest', family: 'readiness', allowedScopes: ['program', 'submission'] }),
        cand({ typeId: 'provenance.evidence_trace_report', family: 'provenance', allowedScopes: ['project'] }),
        cand({ typeId: 'fcoi.disclosure_register', family: 'fcoi', allowedScopes: [] }),
        cand({ typeId: 'irb.submission_register', family: 'irb', allowedScopes: ['galaxy'] }),
      ],
      usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [],
    });
    expect(out).toEqual([]);
  });
});

describe('buildPresetSpec', () => {
  const byType = new Map(TYPES.map((t) => [t.typeId, t]));

  it('builds panels only from entitled, not-yet-used types', () => {
    const out = rankReportSuggestions({ types: TYPES, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    const spec = buildPresetSpec(out, byType)!;
    expect(spec.panels.length).toBeGreaterThan(0);
    expect(spec.panels.every((p) => p.reportTypeId !== 'grants.portfolio_register')).toBe(true); // locked excluded
    expect(spec.panels[0]).toHaveProperty('reportTypeId');
    expect(spec.panels[0]).toHaveProperty('scopeType');
  });

  it('returns null when nothing is entitled', () => {
    const noneEntitled = TYPES.map((t) => ({ ...t, entitled: false, requiredTier: 'enterprise' }));
    const out = rankReportSuggestions({ types: noneEntitled, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    expect(buildPresetSpec(out, byType)).toBeNull();
  });

  it('selects an implemented scope rather than the first advertised scope', () => {
    const types = [
      cand({ typeId: 'readiness.executive_digest', family: 'readiness', allowedScopes: ['program', 'submission', 'project'] }),
      cand({ typeId: 'provenance.evidence_trace_report', family: 'provenance', allowedScopes: ['project', 'document'] }),
    ];
    const out = rankReportSuggestions({ types, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    const spec = buildPresetSpec(out, new Map(types.map((t) => [t.typeId, t])))!;
    expect(spec.panels).toEqual(expect.arrayContaining([
      expect.objectContaining({ reportTypeId: 'readiness.executive_digest', scopeType: 'project' }),
      expect.objectContaining({ reportTypeId: 'provenance.evidence_trace_report', scopeType: 'document' }),
    ]));
  });

  it('rechecks candidates before slicing so unavailable or unknown rows cannot crowd out runnable panels', () => {
    const supported = TYPES.find((t) => t.typeId === 'fcoi.disclosure_register')!;
    const unsupported = cand({ typeId: 'prediction.regulatory_forecast', family: 'prediction' });
    const supportedSuggestion = rankReportSuggestions({ types: [supported], usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] })[0];
    const staleSuggestions = [
      { ...supportedSuggestion, typeId: unsupported.typeId },
      { ...supportedSuggestion, typeId: 'unknown.report' },
      supportedSuggestion,
    ];
    const spec = buildPresetSpec(staleSuggestions, new Map([supported, unsupported].map((t) => [t.typeId, t])), 1)!;
    expect(spec.panels).toEqual([{ reportTypeId: supported.typeId, scopeType: 'project', label: supported.label }]);
  });

  it('does not trust stale entitlement in a suggestion when the candidate is now locked', () => {
    const supported = TYPES.find((t) => t.typeId === 'fcoi.disclosure_register')!;
    const suggestions = rankReportSuggestions({ types: [supported], usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    expect(buildPresetSpec(suggestions, new Map([[supported.typeId, { ...supported, entitled: false }]]))).toBeNull();
  });

  it('returns null when saved suggestions have no computable registry scope', () => {
    const supported = TYPES.find((t) => t.typeId === 'readiness.executive_digest')!;
    const out = rankReportSuggestions({ types: [supported], usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    expect(buildPresetSpec(out, new Map([[supported.typeId, { ...supported, allowedScopes: ['program'] }]]))).toBeNull();
  });
});

describe('suggestReportsForOrg entitlement failures', () => {
  it('does not offer a baseline plan when entitlement resolution is unavailable', async () => {
    mocks.select.mockClear();
    mocks.capabilities.mockRejectedValue(new Error('Entitlement store unavailable'));
    await expect(suggestReportsForOrg(7)).rejects.toThrow('Entitlement store unavailable');
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it('does not turn an unavailable reporting-history read into unused reports and an empty portfolio', async () => {
    mocks.select.mockReset();
    mocks.capabilities.mockResolvedValue({ tier: 'standard' });
    mocks.select
      .mockReturnValueOnce({ from: () => ({ where: async () => [{
        typeId: 'fcoi.disclosure_register', label: 'Disclosures', family: 'fcoi',
        allowedScopes: ['project'], allowedClientSegments: [], allowedPersonas: [], enabled: true,
      }] }) })
      .mockReturnValueOnce({ from: () => ({ where: async () => { throw new Error('Reporting history unavailable'); } }) })
      .mockReturnValue({ from: () => ({ where: async () => [] }) });
    await expect(suggestReportsForOrg(7)).rejects.toThrow('Reporting history unavailable');
  });
});
