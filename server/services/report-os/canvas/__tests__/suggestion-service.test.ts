import { describe, it, expect } from 'vitest';
import { rankReportSuggestions, buildPresetSpec, type CandidateType, type ProgramFact } from '../suggestion-service';

function cand(over: Partial<CandidateType> & { typeId: string; family: string }): CandidateType {
  return {
    label: over.typeId, allowedScopes: ['program'], entitled: true, requiredTier: 'standard',
    ...over,
  };
}

const TYPES: CandidateType[] = [
  cand({ typeId: 'readiness.executive_digest', family: 'readiness', label: 'Exec Readiness' }),
  cand({ typeId: 'portfolio.board_pack', family: 'portfolio', label: 'Board Pack', entitled: false, requiredTier: 'enterprise' }),
  cand({ typeId: 'usa_fda.estar_510k_equivalence_matrix', family: 'usa_fda_510k', label: '510(k) Matrix' }),
  cand({ typeId: 'compliance.audit_assurance_pack', family: 'compliance_audit', label: 'Audit Pack' }),
];

describe('rankReportSuggestions', () => {
  it('ranks entitled before locked', () => {
    const out = rankReportSuggestions({ types: TYPES, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    const locked = out.find((s) => s.typeId === 'portfolio.board_pack')!;
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

  it('boosts the 510(k) matrix for a device program running 510K', () => {
    const programs: ProgramFact[] = [{ programType: '510K', phase: 'authoring', status: 'active' }];
    const out = rankReportSuggestions({ types: TYPES, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs });
    const matrix = out.find((s) => s.typeId === 'usa_fda.estar_510k_equivalence_matrix')!;
    expect(matrix.score).toBeGreaterThan(1);
    expect(matrix.reasons.some((r) => /510K/.test(r))).toBe(true);
  });

  it('demotes already-used/subscribed types below fresh ones and labels them', () => {
    const out = rankReportSuggestions({
      types: TYPES,
      usedTypeIds: new Set(['readiness.executive_digest']),
      subscribedTypeIds: new Set(['compliance.audit_assurance_pack']),
      programs: [],
    });
    const readiness = out.find((s) => s.typeId === 'readiness.executive_digest')!;
    const audit = out.find((s) => s.typeId === 'compliance.audit_assurance_pack')!;
    expect(readiness.alreadyUsed).toBe(true);
    expect(audit.alreadyUsed).toBe(true);
    expect(audit.reasons.some((r) => /schedule/.test(r))).toBe(true);
    // a fresh entitled type outranks the used ones
    const fresh = out.filter((s) => s.entitled && !s.alreadyUsed);
    expect(out.indexOf(fresh[0])).toBeLessThan(out.indexOf(readiness));
  });
});

describe('buildPresetSpec', () => {
  const byType = new Map(TYPES.map((t) => [t.typeId, t]));

  it('builds panels only from entitled, not-yet-used types', () => {
    const out = rankReportSuggestions({ types: TYPES, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    const spec = buildPresetSpec(out, byType)!;
    expect(spec.panels.length).toBeGreaterThan(0);
    expect(spec.panels.every((p) => p.reportTypeId !== 'portfolio.board_pack')).toBe(true); // locked excluded
    expect(spec.panels[0]).toHaveProperty('reportTypeId');
    expect(spec.panels[0]).toHaveProperty('scopeType');
  });

  it('returns null when nothing is entitled', () => {
    const noneEntitled = TYPES.map((t) => ({ ...t, entitled: false, requiredTier: 'enterprise' }));
    const out = rankReportSuggestions({ types: noneEntitled, usedTypeIds: new Set(), subscribedTypeIds: new Set(), programs: [] });
    expect(buildPresetSpec(out, byType)).toBeNull();
  });
});
