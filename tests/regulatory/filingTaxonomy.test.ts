/**
 * Tests for the segment/category filing taxonomy (axis 2) layered over the
 * Global Document Registry. Verifies full coverage of the Concept2Cure
 * Regulatory Filing & Document Taxonomy: 4 segments, 18 categories, 99+ filings.
 */

import { describe, it, expect } from 'vitest';
import {
  GLOBAL_REGISTRY,
  getBySegment,
  getByCategory,
} from '../../shared/regulatory/global-document-registry';
import {
  SEGMENT_METADATA,
  FILING_CATEGORY_METADATA,
  getTaxonomyTree,
  getCountBySegment,
  getCategoriesForSegment,
  getSegmentMetadata,
  getCategoryMetadata,
  getSegmentsSorted,
} from '../../shared/regulatory/filing-taxonomy';
import type { Segment } from '../../shared/regulatory/document-taxonomy';

const SEGMENTS: Segment[] = [
  'pharma_biotech',
  'medical_devices',
  'diagnostics_ivd',
  'cross_cutting',
];

describe('Filing Taxonomy — segment/category axis', () => {
  it('defines all 4 segments', () => {
    expect(SEGMENT_METADATA).toHaveLength(4);
    for (const s of SEGMENTS) {
      expect(SEGMENT_METADATA.some(m => m.id === s)).toBe(true);
    }
  });

  it('defines all 18 categories, each bound to a segment', () => {
    expect(FILING_CATEGORY_METADATA).toHaveLength(18);
    for (const c of FILING_CATEGORY_METADATA) {
      expect(SEGMENTS).toContain(c.segment);
      expect(c.title).toBeTruthy();
      expect(c.description).toBeTruthy();
    }
  });

  it('distributes 5/5/5/3 categories across the segments (document structure)', () => {
    expect(getCategoriesForSegment('pharma_biotech')).toHaveLength(5);
    expect(getCategoriesForSegment('medical_devices')).toHaveLength(5);
    expect(getCategoriesForSegment('diagnostics_ivd')).toHaveLength(5);
    expect(getCategoriesForSegment('cross_cutting')).toHaveLength(3);
  });

  it('classifies ALL active filings on the segment axis', () => {
    const active = GLOBAL_REGISTRY.filter(e => e.active);
    const classified = active.filter(e => e.segment && e.category);
    expect(classified.length).toBe(active.length);
  });

  it('every classified entry has BOTH a segment and a category', () => {
    for (const e of GLOBAL_REGISTRY) {
      if (e.segment || e.category) {
        expect(e.segment).toBeTruthy();
        expect(e.category).toBeTruthy();
      }
    }
  });

  it('every category belongs to its declared segment for each entry', () => {
    const catToSeg = new Map(FILING_CATEGORY_METADATA.map(c => [c.id, c.segment]));
    for (const e of GLOBAL_REGISTRY) {
      if (e.category) {
        expect(catToSeg.get(e.category)).toBe(e.segment);
      }
    }
  });

  it('every entry preserves its region/agency axis (organized by both)', () => {
    const classified = GLOBAL_REGISTRY.filter(e => e.active && e.segment);
    for (const e of classified) {
      expect(e.region).toBeTruthy();
      expect(e.agency).toBeTruthy();
    }
  });

  describe('getTaxonomyTree', () => {
    const tree = getTaxonomyTree();

    it('returns 4 segments in document order', () => {
      expect(tree.map(s => s.id)).toEqual(SEGMENTS);
    });

    it('every category in the tree is populated (no empty categories)', () => {
      for (const seg of tree) {
        for (const cat of seg.categories) {
          expect(cat.filingCount).toBeGreaterThan(0);
          expect(cat.filings.length).toBe(cat.filingCount);
        }
      }
    });

    it('segment filing counts equal the sum of their category counts', () => {
      for (const seg of tree) {
        const sum = seg.categories.reduce((acc, c) => acc + c.filingCount, 0);
        expect(seg.filingCount).toBe(sum);
      }
    });
  });

  describe('getCountBySegment', () => {
    it('returns a positive count for every segment', () => {
      const counts = getCountBySegment();
      for (const s of SEGMENTS) {
        expect(counts[s]).toBeGreaterThan(0);
      }
    });
  });

  describe('spot-checks: filings land in the right segment/category', () => {
    const cases: Array<[string, Segment, string]> = [
      ['US_IND', 'pharma_biotech', 'investigational'],
      ['US_NDA', 'pharma_biotech', 'marketing_authorization'],
      ['ICH_QOS', 'pharma_biotech', 'cmc_quality'],
      ['US_REMS', 'pharma_biotech', 'post_approval_lifecycle'],
      ['US_BTD', 'pharma_biotech', 'preclinical_pre_ind'],
      ['US_510K', 'medical_devices', 'device_market_auth_us'],
      ['EU_MDR_TECHDOC', 'medical_devices', 'device_market_auth_eu_intl'],
      ['US_PCCP', 'medical_devices', 'device_samd_ai'],
      ['US_CDX_PMA', 'diagnostics_ivd', 'ivd_companion_dx'],
      ['US_LDT', 'diagnostics_ivd', 'ivd_market_auth_us'],
      ['ICH_CTD_M3', 'cross_cutting', 'ctd_ectd'],
      ['QMS_MDSAP', 'cross_cutting', 'qms'],
      ['ICH_ICSR', 'cross_cutting', 'safety_pv'],
    ];

    it.each(cases)('%s → %s / %s', (id, segment, category) => {
      const e = GLOBAL_REGISTRY.find(x => x.id === id);
      expect(e, `entry ${id} should exist`).toBeDefined();
      expect(e!.segment).toBe(segment);
      expect(e!.category).toBe(category);
    });
  });

  describe('getBySegment / getByCategory', () => {
    it('getBySegment returns only entries in that segment', () => {
      const pharma = getBySegment('pharma_biotech');
      expect(pharma.length).toBeGreaterThan(0);
      expect(pharma.every(e => e.segment === 'pharma_biotech')).toBe(true);
    });

    it('getByCategory returns only entries in that category', () => {
      const cdx = getByCategory('ivd_companion_dx');
      expect(cdx.length).toBeGreaterThan(0);
      expect(cdx.every(e => e.category === 'ivd_companion_dx')).toBe(true);
    });
  });

  it('all IDs remain unique after the buildout', () => {
    const ids = GLOBAL_REGISTRY.map(e => e.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  describe('getSegmentMetadata', () => {
    it('returns metadata for each known segment', () => {
      for (const s of SEGMENTS) {
        const meta = getSegmentMetadata(s);
        expect(meta).toBeDefined();
        expect(meta!.id).toBe(s);
        expect(meta!.title).toBeTruthy();
        expect(meta!.subtitle).toBeTruthy();
        expect(meta!.iconHint).toBeTruthy();
      }
    });

    it('returns undefined for unknown segment', () => {
      expect(getSegmentMetadata('nonexistent' as any)).toBeUndefined();
    });

    it('pharma_biotech has order 1 (first)', () => {
      expect(getSegmentMetadata('pharma_biotech')!.order).toBe(1);
    });

    it('cross_cutting has order 4 (last)', () => {
      expect(getSegmentMetadata('cross_cutting')!.order).toBe(4);
    });
  });

  describe('getCategoryMetadata', () => {
    it('returns metadata for a known category', () => {
      const meta = getCategoryMetadata('investigational');
      expect(meta).toBeDefined();
      expect(meta!.id).toBe('investigational');
      expect(meta!.segment).toBe('pharma_biotech');
      expect(meta!.title).toBeTruthy();
      expect(meta!.description).toBeTruthy();
    });

    it('returns undefined for unknown category', () => {
      expect(getCategoryMetadata('nonexistent' as any)).toBeUndefined();
    });

    it('device_samd_ai belongs to medical_devices', () => {
      expect(getCategoryMetadata('device_samd_ai')!.segment).toBe('medical_devices');
    });

    it('ivd_companion_dx belongs to diagnostics_ivd', () => {
      expect(getCategoryMetadata('ivd_companion_dx')!.segment).toBe('diagnostics_ivd');
    });

    it('safety_pv belongs to cross_cutting', () => {
      expect(getCategoryMetadata('safety_pv')!.segment).toBe('cross_cutting');
    });
  });

  describe('getSegmentsSorted', () => {
    it('returns all 4 segments in ascending order', () => {
      const sorted = getSegmentsSorted();
      expect(sorted).toHaveLength(4);
      for (let i = 1; i < sorted.length; i++) {
        expect(sorted[i].order).toBeGreaterThan(sorted[i - 1].order);
      }
    });

    it('first segment is pharma_biotech, last is cross_cutting', () => {
      const sorted = getSegmentsSorted();
      expect(sorted[0].id).toBe('pharma_biotech');
      expect(sorted[sorted.length - 1].id).toBe('cross_cutting');
    });
  });
});
