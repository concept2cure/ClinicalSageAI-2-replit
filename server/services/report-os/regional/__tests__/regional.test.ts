import { describe, it, expect } from 'vitest';

import { compareRegions, renderRegionComparison } from '../compare';
import type { MarketReadiness } from '../types';

/**
 * Three markets with overlapping and divergent artifacts.
 *
 * Artifacts:
 *  - Module 1 Regional: present in all three  → reusable
 *  - Clinical Overview:  present in all three → reusable
 *  - Pediatric Plan:     present in EU only   → harmonization gap
 *  - Local Labeling:     present in US + EU   → harmonization gap
 *  - Bridging Study:     missing everywhere   → not a gap, not reusable
 */
const markets: MarketReadiness[] = [
  {
    market: 'US',
    dossierStandard: 'eCTD',
    readinessScore: 90,
    status: 'ready',
    presentArtifacts: ['Module 1 Regional', 'Clinical Overview', 'Local Labeling'],
    missingArtifacts: ['Pediatric Plan', 'Bridging Study'],
    regionalWarnings: [],
  },
  {
    market: 'EU',
    dossierStandard: 'eCTD',
    readinessScore: 70,
    status: 'partial',
    presentArtifacts: ['Module 1 Regional', 'Clinical Overview', 'Local Labeling', 'Pediatric Plan'],
    missingArtifacts: ['Bridging Study'],
    regionalWarnings: ['Pediatric investigation plan due before MAA'],
  },
  {
    market: 'JP',
    dossierStandard: 'eCTD',
    readinessScore: 50,
    status: 'partial',
    presentArtifacts: ['Module 1 Regional', 'Clinical Overview'],
    missingArtifacts: ['Local Labeling', 'Pediatric Plan', 'Bridging Study'],
    regionalWarnings: [],
  },
];

describe('compareRegions', () => {
  it('picks the highest-scoring market as the lead', () => {
    const cmp = compareRegions('prog-1', markets);
    expect(cmp.leadMarket).toBe('US');
  });

  it('breaks lead ties by input order', () => {
    const tied: MarketReadiness[] = markets.map(m => ({ ...m, readinessScore: 80 }));
    const cmp = compareRegions('prog-1', tied);
    expect(cmp.leadMarket).toBe('US');
  });

  it('flags markets below the mean as lagging', () => {
    // mean = (90 + 70 + 50) / 3 = 70; only JP (50) is below.
    const cmp = compareRegions('prog-1', markets);
    expect(cmp.laggingMarkets).toEqual(['JP']);
  });

  it('computes only mixed-presence harmonization gaps', () => {
    const cmp = compareRegions('prog-1', markets);
    const artifacts = cmp.harmonizationGaps.map(g => g.artifact);
    expect(artifacts).toEqual(['Local Labeling', 'Pediatric Plan']);
    // Reusable (everywhere) and absent-everywhere artifacts are NOT gaps.
    expect(artifacts).not.toContain('Module 1 Regional');
    expect(artifacts).not.toContain('Clinical Overview');
    expect(artifacts).not.toContain('Bridging Study');

    const labeling = cmp.harmonizationGaps.find(g => g.artifact === 'Local Labeling')!;
    expect(labeling.presentInMarkets).toEqual(['US', 'EU']);
    expect(labeling.missingInMarkets).toEqual(['JP']);

    const pediatric = cmp.harmonizationGaps.find(g => g.artifact === 'Pediatric Plan')!;
    expect(pediatric.presentInMarkets).toEqual(['EU']);
    expect(pediatric.missingInMarkets).toEqual(['US', 'JP']);
  });

  it('lists artifacts present in every market as reusable', () => {
    const cmp = compareRegions('prog-1', markets);
    expect(cmp.reusableArtifacts).toEqual(['Module 1 Regional', 'Clinical Overview']);
  });

  it('handles empty markets: null lead, empty arrays', () => {
    const cmp = compareRegions('prog-empty', []);
    expect(cmp.leadMarket).toBeNull();
    expect(cmp.laggingMarkets).toEqual([]);
    expect(cmp.harmonizationGaps).toEqual([]);
    expect(cmp.reusableArtifacts).toEqual([]);
    expect(cmp.markets).toEqual([]);
    expect(cmp.scopeId).toBe('prog-empty');
  });
});

describe('renderRegionComparison', () => {
  const meta = {
    reportTypeId: 'global-markets',
    reportTypeLabel: 'Global Markets Readiness',
    generatedAt: '2026-06-15T00:00:00.000Z',
  };

  it('produces all four sections with the readiness table', () => {
    const cmp = compareRegions('prog-1', markets);
    const report = renderRegionComparison(cmp, meta);

    expect(report.reportTypeId).toBe('global-markets');
    expect(report.scopeType).toBe('program');
    expect(report.scopeId).toBe('prog-1');
    expect(report.status).toBe('partial');

    expect(report.sections.map(s => s.id)).toEqual([
      'market-readiness',
      'harmonization-gaps',
      'reuse-opportunities',
      'lead-summary',
    ]);

    const table = report.sections[0].blocks[0];
    expect(table.kind).toBe('table');
    if (table.kind === 'table') {
      expect(table.columns).toEqual(['Market', 'Dossier standard', 'Readiness', 'Status']);
      expect(table.rows).toContainEqual(['US', 'eCTD', 90, 'ready']);
      expect(table.rows).toHaveLength(3);
    }
  });

  it('renders harmonization gaps as a gap-list', () => {
    const cmp = compareRegions('prog-1', markets);
    const report = renderRegionComparison(cmp, meta);
    const gapSection = report.sections.find(s => s.id === 'harmonization-gaps')!;
    const block = gapSection.blocks[0];
    expect(block.kind).toBe('gap-list');
    if (block.kind === 'gap-list') {
      expect(block.items.map(i => i.title)).toEqual([
        'Local Labeling: missing in JP',
        'Pediatric Plan: missing in US, JP',
      ]);
    }
  });

  it('renders the empty-state summary when there are no gaps', () => {
    // All markets share the same single present artifact → no gaps.
    const uniform: MarketReadiness[] = [
      {
        market: 'US',
        dossierStandard: 'eCTD',
        readinessScore: 100,
        status: 'ready',
        presentArtifacts: ['Clinical Overview'],
        missingArtifacts: [],
        regionalWarnings: [],
      },
      {
        market: 'EU',
        dossierStandard: 'eCTD',
        readinessScore: 100,
        status: 'ready',
        presentArtifacts: ['Clinical Overview'],
        missingArtifacts: [],
        regionalWarnings: [],
      },
    ];
    const cmp = compareRegions('prog-2', uniform);
    expect(cmp.harmonizationGaps).toEqual([]);

    const report = renderRegionComparison(cmp, meta);
    const gapSection = report.sections.find(s => s.id === 'harmonization-gaps')!;
    const block = gapSection.blocks[0];
    expect(block.kind).toBe('summary');
    if (block.kind === 'summary') {
      expect(block.text).toBe(
        'No harmonization gaps — artifact coverage is consistent across selected markets.',
      );
    }
  });

  it('names the lead and lagging markets in the summary', () => {
    const cmp = compareRegions('prog-1', markets);
    const report = renderRegionComparison(cmp, meta);
    const summary = report.sections.find(s => s.id === 'lead-summary')!;
    const block = summary.blocks[0];
    expect(block.kind).toBe('summary');
    if (block.kind === 'summary') {
      expect(block.text).toContain('Lead market: US.');
      expect(block.text).toContain('Lagging markets: JP.');
    }
  });

  it('is deterministic when generatedAt is provided', () => {
    const cmp = compareRegions('prog-1', markets);
    const a = renderRegionComparison(cmp, meta);
    const b = renderRegionComparison(cmp, meta);
    expect(a.generatedAt).toBe('2026-06-15T00:00:00.000Z');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});
