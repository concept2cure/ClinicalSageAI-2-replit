/**
 * Value-dossier (HEOR / market-access) knowledge — unit tests. Deterministic;
 * verifies deliverable + HTA-body resolution (incl. aliases), brief content,
 * catalog listing, and graceful handling of unknown deliverables.
 */
import { describe, it, expect } from 'vitest';
import { composeValueDossierGuidance, listValueDossierCatalog } from '../value-dossier';

describe('composeValueDossierGuidance', () => {
  it('resolves an AMCP dossier and surfaces framework + comparator guidance', () => {
    const g = composeValueDossierGuidance({ deliverable: 'amcp_dossier' });
    expect(g.resolved.deliverable).toBe('amcp_dossier');
    expect(g.deliverable?.framework.join(' ')).toContain('AMCP Format');
    expect(g.brief).toContain('budget-impact');
    expect(g.brief).toContain('place in therapy');
    expect(g.availableDeliverables).toBeUndefined();
  });

  it('resolves deliverable and HTA body together (NICE) via aliases', () => {
    const g = composeValueDossierGuidance({ deliverable: 'nice', htaBody: 'uk' });
    expect(g.resolved.deliverable).toBe('nice_submission');
    expect(g.resolved.htaBody).toBe('nice');
    expect(g.brief).toContain('NICE');
    expect(g.brief).toContain('QALY');
    expect(g.htaBody?.country).toBe('United Kingdom');
  });

  it('resolves an HTA body alias for Germany (AMNOG → G-BA)', () => {
    const g = composeValueDossierGuidance({ htaBody: 'amnog' });
    expect(g.resolved.htaBody).toBe('gba');
    expect(g.brief).toContain('Added benefit');
  });

  it('flags the budget-impact-vs-cost-effectiveness distinction', () => {
    const g = composeValueDossierGuidance({ deliverable: 'bia' });
    expect(g.resolved.deliverable).toBe('budget_impact_model');
    expect(g.brief.toLowerCase()).toContain('per-member-per-month');
    expect(g.brief).toContain('NOT lifetime');
  });

  it('returns available deliverables when the deliverable is unknown', () => {
    const g = composeValueDossierGuidance({ deliverable: 'totally-made-up' });
    expect(g.deliverable).toBeNull();
    expect(g.availableDeliverables).toContain('amcp_dossier');
    expect(g.brief).toContain('not recognized');
  });

  it('lists the catalog of deliverables and HTA bodies', () => {
    const cat = listValueDossierCatalog();
    expect(cat.deliverables.map(d => d.id)).toContain('global_value_dossier');
    expect(cat.htaBodies.map(h => h.id)).toEqual(
      expect.arrayContaining(['nice', 'icer', 'gba', 'has', 'cadth', 'pbac']),
    );
  });
});
