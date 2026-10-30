import { describe, expect, it } from 'vitest';
import { parseDraftProductAudit, renderDraftProductAdvisory } from '../draft-product-advisory';
import type { RecordedDraftProduct } from '../draft-product-context';

const record = (overrides: Partial<RecordedDraftProduct> = {}): RecordedDraftProduct => ({
  state: 'recorded', projectId: 11, programId: '11111111-2222-4333-8444-000000000011',
  therapeuticArea: 'oncology', phase: 'phase_2', population: 'Adults',
  productType: 'monoclonal_antibody', modality: 'mab', indication: 'Recorded indication',
  charterState: 'recorded', charter: { id: 3, version: 2, updatedAt: '2026-10-30T12:00:00Z', approvalStatus: 'draft' },
  snapshot: 'a'.repeat(64), ...overrides,
});

describe('recorded and declared product facts retain independent origins', () => {
  it('keeps partial-record fallback visibly declared and out of record-mode applicability facts', () => {
    const out = renderDraftProductAdvisory({ therapeuticArea: 'cardiology', phase: 'phase_3', population: 'Children',
      modality: 'gene_therapy', indication: 'Declared indication' }, '2.5', 'record:ctd-section:2.5:exact',
    record({ therapeuticArea: null, phase: null, population: null, productType: null, modality: null, indication: null, charterState: 'missing', charter: null }));
    expect(out.audit).toMatchObject({ productContextSource: 'mixed-recorded-declared-unqualified',
      productContextOrigins: { therapeuticArea: 'declared', phase: 'declared', population: 'declared', modality: 'declared', indication: 'declared' } });
    expect(out.prompt).toContain('CALLER-DECLARED FALLBACK');
    expect(out.prompt).toContain('THERAPEUTIC AREA PROFILE SOURCE: caller-declared fallback');
    expect(out.prompt).toContain('Product context (recorded advisory, not evidence): {"phase":null,"modality":null,"population":null}');
    expect(out.prompt).not.toContain('Product context (recorded advisory, not evidence): {"phase":"phase_3"');
  });

  it('retains recorded precedence and reports only conflicting field names', () => {
    const out = renderDraftProductAdvisory({ therapeuticArea: 'cns', modality: 'gene_therapy', phase: 'phase_3',
      population: 'Children', indication: 'Declared indication' }, '2.5', 'record:ctd-section:2.5:exact', record());
    expect(out.audit.productContextConflicts).toEqual(['therapeuticArea', 'modality', 'phase', 'population', 'indication']);
    expect(out.audit.productContextOrigins).toEqual({ therapeuticArea: 'recorded', modality: 'recorded',
      phase: 'recorded', population: 'recorded', indication: 'recorded' });
    expect(out.prompt).toContain('Therapeutic Area Context — Oncology');
    expect(JSON.stringify(out.audit)).not.toContain('Children');
    expect(JSON.stringify(out.audit)).not.toContain('Recorded indication');
  });

  it('does not report aliases as therapeutic-area conflicts or sharpen a broad recorded biologic', () => {
    const out = renderDraftProductAdvisory({ therapeuticArea: 'oncology-hematology', modality: 'mab' },
      '3.2.P.2', 'record:ctd-section:3.2.P.2:exact', record({ productType: 'biologic', modality: null }));
    expect(out.audit.productContextConflicts).toEqual(['modality']);
    expect(out.audit.productModality).toBeNull();
    expect(out.audit.productContextOrigins.modality).toBe('unassessed');
    expect(out.prompt).toContain('PRODUCT MODALITY: UNASSESSED');
    expect(out.prompt).not.toContain('Existing modality CMC reference set');
  });

  it.each([{ phase: 'phase_1' }, { population: 'Adult volunteers' }, { indication: 'Declared indication' }])('retains a declaration without TA/modality: %j', declared => {
    const out = renderDraftProductAdvisory(declared, '2.5', 'record:ctd-section:2.5:exact');
    expect(out.prompt).toContain('CALLER-DECLARED, UNVERIFIED ADVISORY');
    expect(out.prompt).toContain(Object.values(declared)[0]);
    expect(out.audit.productContextSource).toBe('caller-declared-unverified');
  });

  it('retains the existing omitted-context and declared-modality contracts', () => {
    expect(renderDraftProductAdvisory(undefined, '2.5', 'none').prompt).toBe('');
    const out = renderDraftProductAdvisory({ therapeuticArea: 'oncology', modality: 'mab' }, '3.2.P.2', 'none');
    expect(out.audit).toMatchObject({ productContextSource: 'caller-declared-unverified', therapeuticProfile: 'oncology', productModality: 'mab' });
    expect(out.prompt).toContain('PRODUCT MODALITY (declared): Monoclonal antibody');
  });
});

describe('canonical document kind reaches existing therapeutic selection', () => {
  it.each([
    ['12.2 Adverse events', 'record:outline:csr-e3:12.2:exact', undefined],
    ['3 Study design', 'record:outline:protocol-m11:3:exact', undefined],
    ['12.2 Adverse events', 'none', 'csr'],
    ['ICH_PROTOCOL', 'none', undefined],
  ] as const)('uses known identity for %s / %s / %s', (section, source, kind) => {
    const out = renderDraftProductAdvisory({ therapeuticArea: 'cardiology' }, section, source, undefined, 'US', kind);
    expect(out.prompt).toContain('### Endpoint Considerations');
  });

  it('does not infer document kind from an arbitrary protocol-like title', () => {
    const out = renderDraftProductAdvisory({ therapeuticArea: 'cardiology' }, 'A proposed protocol and scientific report', 'none');
    expect(out.prompt).not.toContain('### Endpoint Considerations');
  });
});

describe('one product-audit parser preserves only the typed bounded contract', () => {
  it('round-trips valid metadata with per-field origins and recorded identity', () => {
    const { audit } = renderDraftProductAdvisory({ phase: 'phase_3' }, '2.5', 'none', record());
    expect(parseDraftProductAudit(JSON.parse(JSON.stringify(audit)))).toEqual(audit);
  });

  it.each([
    { productContextSource: 'approved' }, { productContextSource: ['recorded-unqualified'] },
    { productContextSnapshot: 'wrong-hash' },
    { productContextOrigins: { phase: 'qualified' } }, { productContextConflicts: ['private-raw-label'] },
    { productContextOrigins: { therapeuticArea: ['recorded'], modality: 'recorded', phase: 'recorded', population: 'recorded', indication: 'recorded' } },
    { productContextCharter: { id: -1, version: 1, updatedAt: null, approvalStatus: 'draft' } },
    { productContextCharter: { id: 3, version: 0, updatedAt: null, approvalStatus: 'draft' } },
    { arbitraryRawPopulation: 'Private population' },
  ])('refuses malformed present audit metadata: %j', bad => {
    const { audit } = renderDraftProductAdvisory(undefined, '2.5', 'none', record());
    expect(parseDraftProductAudit({ ...audit, ...bad })).toBeNull();
  });
});
