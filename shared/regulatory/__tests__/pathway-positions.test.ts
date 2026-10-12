/**
 * One governed list of pathway positions, bridged to the two modules that
 * already hold the facts (founder's directive, 2026-10-12).
 *
 * "Which pathway are you on?" had four answers: the filing registry's 234
 * entries (authoritative id space, no meaning), the modality frame's
 * modality-aware pathway names (drugs only, named in its own words),
 * `APPLICATION_TYPES`' nine bare labels, and project-setup's two hand-written
 * lists. This module is not a fifth: the positions ARE registry entries, and
 * it holds what taking each one commits the programme to.
 *
 * What these tests hold:
 *   - both directions of coverage, so a filing the registry gains cannot reach
 *     a person as a bare label, and an annotation cannot outlive its filing;
 *   - every pathway name in the modality frame resolves to a registry id —
 *     the first check in the codebase that those two agree;
 *   - the distinctions a programme turns on are present rather than collapsed;
 *   - a position that is not a route to market says so;
 *   - a pair this module holds nothing for returns nothing.
 */
import { describe, expect, it } from 'vitest';

import { getApplicationType, GLOBAL_REGISTRY } from '../global-document-registry.js';
import { MODALITIES, MODALITY_FRAME } from '../modality.js';
import {
  allPathwayPositions,
  annotatedPositionIds,
  governedFramePathways,
  pathwayOptions,
  pathwayPositionsFor,
  positionFor,
} from '../pathway-positions.js';

describe('the positions are the registry’s own filings', () => {
  it('annotates no filing the registry does not hold', () => {
    const orphans = annotatedPositionIds().filter(id => !getApplicationType(id));
    expect(orphans, 'an annotation whose filing does not exist').toEqual([]);
  });

  it('takes its label from the registry, so the question and the filing agree', () => {
    const position = positionFor('US_510K')!;
    expect(position.label).toBe(getApplicationType('US_510K')!.displayName);
    expect(position.value).toBe('US_510K');
  });

  it('offers nothing for a filing it has no meaning for', () => {
    // A real registry entry this module does not annotate.
    expect(getApplicationType('US_PCCP')).toBeDefined();
    expect(positionFor('US_PCCP')).toBeNull();
    expect(positionFor('NOT_A_FILING')).toBeNull();
  });

  it('covers every US and EU route to market in the segments it claims', () => {
    const claimed = new Set(['pharma_biotech', 'medical_devices', 'diagnostics_ivd']);
    const routeFamilies = new Set(['marketing_authorization', 'device_clearance', 'device_approval', 'companion_diagnostic']);
    /* Documents that live INSIDE a route rather than being one. Each is named,
       because an unexplained exclusion is how a route goes missing. */
    const notARoute = new Set([
      'EU_CER', 'EU_SSCP', 'EU_DOC', 'EU_PER', 'EU_SSCP_IVD', // documents within the MDR/IVDR route
      'US_PMA_SUPP', 'US_510K_MOD', 'US_IND_AMENDMENT', 'US_ROLLING', // changes to a filing already chosen
      'US_COMPLEMENTARY_DX', 'US_CDX_CODEV', // a claim and an agreement, not filings of their own
      'US_DEVICE_REG', // registration and listing, not a premarket route
      // The documentation every class route produces, not a choice of route.
      'EU_MDR_TECHDOC', 'EU_IVDR',
      // Reports that live inside a route.
      'EU_IVD_CLIN_EVIDENCE', 'US_IVD_ANALYTICAL_VALIDATION',
    ]);
    const annotated = new Set(annotatedPositionIds());
    const missing = GLOBAL_REGISTRY.filter(
      e =>
        e.active &&
        ['US', 'EU'].includes(String(e.region)) &&
        claimed.has(String(e.segment)) &&
        routeFamilies.has(String(e.applicationFamily)) &&
        !notARoute.has(e.id) &&
        !annotated.has(e.id),
    ).map(e => `${e.id} (${e.displayName})`);
    expect(missing, 'a route to market with no position: it would reach a person as a bare label').toEqual([]);
  });
});

describe('the bridge to the modality frame', () => {
  it('every pathway the frame holds resolves to a registry filing', () => {
    const unresolved = governedFramePathways().filter(pathway => {
      // Resolution is observable: some modality offering it must yield a position.
      const modality = MODALITIES.find(m => MODALITY_FRAME[m].pathways.some(p => p.pathway === pathway))!;
      const positions = pathwayPositionsFor({ domain: 'pharma_biotech', region: 'US', modality });
      return positions.length !== MODALITY_FRAME[modality].pathways.length;
    });
    expect(unresolved, 'a frame pathway with no registry filing behind it').toEqual([]);
  });

  it('offers a modality only what the frame allows it, in the frame’s order', () => {
    expect(pathwayPositionsFor({ domain: 'pharma_biotech', region: 'US', modality: 'biosimilar' }).map(p => p.value)).toEqual([
      'US_351K',
    ]);
    expect(pathwayPositionsFor({ domain: 'pharma_biotech', region: 'US', modality: 'small_molecule' }).map(p => p.value)).toEqual([
      'US_NDA',
      'US_505B2',
      'US_ANDA',
    ]);
    expect(pathwayPositionsFor({ domain: 'pharma_biotech', region: 'US', modality: 'mab' }).map(p => p.value)).toEqual(['US_BLA']);
  });

  it('every modality in the frame resolves to as many positions as the frame holds', () => {
    for (const modality of MODALITIES) {
      expect(
        pathwayPositionsFor({ domain: 'pharma_biotech', region: 'US', modality }).length,
        modality,
      ).toBe(MODALITY_FRAME[modality].pathways.length);
    }
  });
});

describe('the distinctions a programme turns on', () => {
  it('keeps 505(b)(1) apart from 505(b)(2), and 351(a) from 351(k)', () => {
    const b2 = positionFor('US_505B2')!;
    expect(b2.commits).toMatch(/bridging data/i);
    expect(b2.authority).toMatch(/314\.54/);
    expect(positionFor('US_NDA')!.authority).toMatch(/505\(b\)\(1\)/);
    expect(positionFor('US_351K')!.commits).toMatch(/analytical similarity/i);
    expect(positionFor('US_BLA')!.commits).not.toMatch(/similarity/i);
  });

  it('keeps a 510(k) apart from a De Novo', () => {
    expect(positionFor('US_510K')!.commits).toMatch(/predicate/i);
    expect(positionFor('US_DE_NOVO')!.commits).toMatch(/special controls/i);
    expect(positionFor('US_DE_NOVO')!.authority).toMatch(/513\(f\)\(2\)/);
  });

  it('says plainly where a position is not a route to market', () => {
    for (const id of ['US_513G', 'US_QSUB', 'US_IDE', 'US_CLIA_WAIVER', 'EU_REF_LAB', 'US_IND']) {
      expect(positionFor(id)!.marketingRoute, id).toBe(false);
    }
    expect(positionFor('US_513G')!.commits).toMatch(/clears nothing/i);
    expect(positionFor('US_CLIA_WAIVER')!.commits).toMatch(/where the test may be run/i);
    // And the option a person reads says it too.
    const ivd = pathwayOptions({ domain: 'diagnostics_ivd', region: 'US' });
    expect(ivd.find(o => o.value === 'US_CLIA_WAIVER')!.label).toMatch(/not a route to market/);
    expect(ivd.find(o => o.value === 'US_510K_IVD')!.label).not.toMatch(/not a route to market/);
  });

  it('is honest that the LDT position is unsettled rather than asserting it', () => {
    expect(positionFor('US_LDT')!.commits).toMatch(/unsettled/i);
  });
});

describe('what every position must carry', () => {
  it('never travels without the authority that makes it one', () => {
    const bare = allPathwayPositions().filter(p => !p.authority.trim() || !p.commits.trim());
    expect(bare.map(p => p.value)).toEqual([]);
  });

  it('says a consequence, not a restatement of its own label', () => {
    for (const position of allPathwayPositions()) {
      expect(position.commits.length, position.value).toBeGreaterThan(40);
      expect(position.commits.toLowerCase(), position.value).not.toBe(position.label.toLowerCase());
    }
  });

  it('offers the device and IVD routes the platform already files', () => {
    const device = pathwayPositionsFor({ domain: 'medical_devices', region: 'US' }).map(p => p.value);
    // HDE and EUA were in project-setup's hand-written list; dropping them would be a regression.
    expect(device).toContain('US_HDE');
    expect(device).toContain('US_EUA');
    // 513(g) and the Q-Sub were missing from it.
    expect(device).toContain('US_513G');
    expect(device).toContain('US_QSUB');
    const ivd = pathwayPositionsFor({ domain: 'diagnostics_ivd', region: 'US' }).map(p => p.value);
    expect(ivd).toContain('US_CDX_PMA');
    expect(ivd).toContain('US_DE_NOVO_IVD');
  });

  it('cites a paragraph only where it has been verified, and an article otherwise', () => {
    /* A review of 2026-10-12 found several paragraph-level citations wrong:
       the IVDR Class B route cited Art 48(7), which carries Class C; the
       companion-diagnostic consultation cited Art 48(6), which is the Class D
       expert-panel paragraph; the Class D reference-laboratory verification
       cited Annex IX § 4.4. A citation precise enough to be wrong is worse
       than one broad enough to be right, so these name the article and the
       annex. */
    for (const id of ['EU_IVDR_CLASS_B', 'EU_IVDR_CLASS_CD', 'EU_CDX_IVDR_D', 'EU_IVDR_ART48_CONSULT', 'EU_REF_LAB']) {
      const authority = positionFor(id)!.authority;
      expect(authority, id).toMatch(/IVDR/);
      expect(authority, `${id} cites a paragraph of Article 48`).not.toMatch(/Art 48\(/);
      expect(authority, `${id} cites a section of Annex IX`).not.toMatch(/Annex IX Section/);
    }
    expect(positionFor('EU_REF_LAB')!.authority, 'the reference laboratory is Article 100').toMatch(/Art 100/);
  });

  it('does not offer a Class IIa device a route Article 52(6) withholds', () => {
    /* The Annex X type-examination is open to Class IIb and III, not IIa. */
    const iia = positionFor('EU_MDR_CLASS_IIA')!;
    expect(iia.commits).toMatch(/Annex X type-examination is not open to Class IIa/);
    expect(iia.authority).toBe('MDR Art 52(6), Annexes IX and XI');
    expect(positionFor('EU_MDR_CLASS_IIB')!.commits, 'IIb does have it').toMatch(/type-examination route open/);
  });

  it('puts a companion diagnostic in the class Rule 3(f) puts it in', () => {
    const cdx = positionFor('EU_CDX_IVDR_D')!;
    expect(cdx.commits, 'Rule 3(f) yields Class C').toMatch(/Rule 3\(f\) puts a companion diagnostic in Class C/);
    expect(cdx.commits, 'and another rule may reach D').toMatch(/Class D/);
  });

  it('cites the 513(g) and Q-submission procedures rather than a neighbouring section', () => {
    /* 21 CFR 860.123 is the reclassification petition; 515B is the
       Breakthrough Devices Program. Neither is what these are. */
    expect(positionFor('US_513G')!.authority).not.toMatch(/860\.123/);
    expect(positionFor('US_513G')!.authority).toMatch(/513\(g\)/);
    expect(positionFor('US_QSUB')!.authority).not.toMatch(/515B/);
    expect(positionFor('US_QSUB')!.authority).toMatch(/Q-Submission Program/);
  });

  it('says where the LDT position stands, and that AnA does not track it', () => {
    const ldt = positionFor('US_LDT')!.commits;
    expect(ldt).toMatch(/vacated by a federal court in 2025/);
    expect(ldt, 'and does not claim to know where it rests now').toMatch(/not something AnA tracks/);
    expect(ldt).toMatch(/unsettled/);
  });

  it('offers the EU class routes, which are what a sponsor chooses between', () => {
    expect(pathwayPositionsFor({ domain: 'medical_devices', region: 'EU' }).map(p => p.value)).toEqual([
      'EU_MDR_CLASS_I',
      'EU_MDR_CLASS_IIA',
      'EU_MDR_CLASS_IIB',
      'EU_MDR_CLASS_III',
    ]);
    expect(positionFor('EU_MDR_CLASS_I')!.commits).toMatch(/declare conformity yourself/i);
    expect(positionFor('EU_MDR_CLASS_III')!.authority).toMatch(/Art 54/);
    const ivd = pathwayPositionsFor({ domain: 'diagnostics_ivd', region: 'EU' }).map(p => p.value);
    expect(ivd.slice(0, 4)).toEqual(['EU_IVDR_CLASS_A', 'EU_IVDR_CLASS_B', 'EU_IVDR_CLASS_CD', 'EU_CDX_IVDR_D']);
    expect(positionFor('EU_IVDR_CLASS_CD')!.commits).toMatch(/reference laboratory/i);
  });

  it('offers the EU medicine routes, so a European filing is not sent FDA\u2019s', () => {
    expect(pathwayPositionsFor({ domain: 'pharma_biotech', region: 'EU' }).map(p => p.value)).toEqual([
      'EU_MAA',
      'EU_CMA',
      'EU_BIOSIMILAR_MAA',
      'EU_GENERIC_DCP',
    ]);
    expect(positionFor('EU_CMA')!.commits).toMatch(/specific obligations/i);
  });
});

describe('a pair this module holds nothing for', () => {
  it('returns nothing, rather than offering another regulator\u2019s routes', () => {
    // Japan's filings are in the registry; what they commit a sponsor to is not written.
    const japan = { domain: 'pharma_biotech' as const, region: 'JP' as unknown as 'US' };
    expect(pathwayPositionsFor(japan)).toEqual([]);
    expect(pathwayOptions(japan)).toEqual([]);
  });

  it('holds something for every pair it does claim', () => {
    for (const domain of ['pharma_biotech', 'medical_devices', 'diagnostics_ivd'] as const) {
      for (const region of ['US', 'EU'] as const) {
        expect(pathwayPositionsFor({ domain, region }).length, `${domain}:${region}`).toBeGreaterThan(0);
      }
    }
  });
});
