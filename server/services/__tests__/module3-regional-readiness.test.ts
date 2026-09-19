/**
 * Module 3 3.2.R coverage is classified, enforced, and cannot drift.
 *
 * ── WHAT DRIFTED ─────────────────────────────────────────────────────────────
 * The run route's RegionSchema was an independent z.enum of thirteen regions.
 * Module 3's REGIONAL_SUBSECTIONS holds templates for four. Nothing tied the two
 * together, so nine regions were accepted for a submission whose Module 3
 * regional section could never be composed — and the step reported that as
 * "skipped (no inputs)", blaming the caller for a gap in the product.
 *
 * These tests pin the three lists to each other. The last one is the point: if
 * someone adds a region to the route, or an authored template, or renames an
 * agency, a test fails here rather than a customer discovering it in a dossier.
 *
 * ── WHY EIGHT REGIONS ARE NOT AUTHORED HERE ──────────────────────────────────
 * 3.2.R content is pointers to named agency guidance — the EU template cites
 * Annex 16 and EMEA/410/01 rev. 3 by number. Writing the MHRA / Swissmedic / TGA
 * / NMPA / ANVISA / CDSCO / MFDS / HSA equivalents from memory would put
 * unverified regulatory citations into dossier content. regional-backbone-readiness
 * already refused the same thing one layer down for the same eight regions, on
 * the record: claiming conformance it cannot verify "would be a fabrication".
 * So this classifies honestly and gates on it; authoring is regulatory-affairs
 * work with a citable source per claim.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { REGION_IDENTITY } from '../../../shared/regulatory/region-identity';
import { REGIONS_WITH_REGIONAL_TEMPLATE } from '../module3-extensions';
import {
  JURISDICTION_REGIONS,
  SUBMISSION_REGIONS,
  classifyModule3Regional,
  evaluateModule3RegionalGate,
  module3RegionalRequiredFromEnv,
  normalizeSubmissionRegion,
} from '../module3-regional-readiness';

describe('SUBMISSION_REGIONS is the canonical list, not a fourth copy', () => {
  it('is exactly the twelve canonical regions plus GLOBAL', () => {
    expect([...SUBMISSION_REGIONS].sort()).toEqual(
      [...Object.keys(REGION_IDENTITY), 'GLOBAL'].sort()
    );
    expect(SUBMISSION_REGIONS).toHaveLength(13);
  });

  it('the run route builds its enum from this list instead of restating one', () => {
    // The regression guard proper. The defect began as an independent
    // `z.enum(['US','EU',...])` on the route, thirteen literals that no longer
    // matched the four templates and that nothing compared. Re-inlining a literal
    // list is the one edit that would reopen it while every other test here still
    // passed, so it is asserted against the route's source.
    const route = readFileSync(
      path.join(process.cwd(), 'server/routes/submission-orchestrator.ts'),
      'utf8'
    );
    expect(route).toContain('z.enum(SUBMISSION_REGIONS)');
    // No hand-written region list anywhere in the file. When this assertion was
    // first written it failed, and correctly: there was a SECOND literal enum 600
    // lines below (ValidatorRegionSchema), the same drift hazard already repeated
    // once. It now derives from JURISDICTION_REGIONS.
    expect(route).not.toMatch(/z\.enum\(\s*\[\s*'US'/);
    expect(route).toContain('JURISDICTION_REGIONS');
  });

  it('JURISDICTION_REGIONS is exactly the twelve the validator route used to list', () => {
    // Pins the refactor as behaviour-preserving: the literal it replaced, verbatim.
    expect([...JURISDICTION_REGIONS]).toEqual([
      'US',
      'EU',
      'JP',
      'CA',
      'UK',
      'CN',
      'AU',
      'CH',
      'BR',
      'IN',
      'KR',
      'SG',
    ]);
    expect(JURISDICTION_REGIONS).not.toContain('GLOBAL');
  });

  it('classifies EVERY region it accepts — no region falls through unclassified', () => {
    // The drift pin. A region the product accepts but says nothing about is the
    // exact condition that produced the original defect.
    for (const region of SUBMISSION_REGIONS) {
      const status = classifyModule3Regional(region);
      expect(['authored', 'not-authored', 'not-applicable']).toContain(status.coverage);
      if (status.coverage !== 'authored') {
        expect(status.reason, `${region} has no stated reason`).toBeTruthy();
      }
    }
  });

  it('every region claimed as authored really has a template', () => {
    // The other direction: claiming coverage that does not exist would be worse
    // than admitting the gap.
    for (const region of SUBMISSION_REGIONS) {
      const status = classifyModule3Regional(region);
      expect(REGIONS_WITH_REGIONAL_TEMPLATE.has(region)).toBe(status.coverage === 'authored');
    }
  });
});

describe('classifyModule3Regional', () => {
  it.each(['US', 'EU', 'JP', 'CA'] as const)('%s is authored and names its agency', region => {
    const s = classifyModule3Regional(region);
    expect(s.coverage).toBe('authored');
    expect(s.agency).toBe(REGION_IDENTITY[region].agency);
    expect(s.reason).toBeUndefined();
  });

  it.each(['UK', 'CN', 'AU', 'CH', 'BR', 'IN', 'KR', 'SG'] as const)(
    '%s is not-authored, names its agency, and says where content does exist',
    region => {
      const s = classifyModule3Regional(region);
      expect(s.coverage).toBe('not-authored');
      // The agency comes from REGION_IDENTITY, so it cannot be a guess.
      expect(s.agency).toBe(REGION_IDENTITY[region].agency);
      expect(s.reason).toContain(REGION_IDENTITY[region].agency);
      expect(s.reason).toContain('CA/EU/JP/US');
      // It must not imply the content was derived from another region.
      expect(s.reason).toContain('not inferred');
      expect(s.authoredRegions).toEqual(['CA', 'EU', 'JP', 'US']);
    }
  );

  it('GLOBAL is not-applicable, and says so as a fact rather than a gap', () => {
    const s = classifyModule3Regional('GLOBAL');
    expect(s.coverage).toBe('not-applicable');
    expect(s.reason).toContain('not a jurisdiction');
    expect(s.reason).toContain('This is not a gap');
    expect(s.agency).toBeUndefined();
  });

  it('accepts a gateway slug as well as a canonical code', () => {
    // pre-transmit-check holds a packager Region ('fda'), the orchestrator holds
    // 'US'. One classifier, both vocabularies, no second mapping table.
    expect(normalizeSubmissionRegion('fda')).toBe('US');
    expect(normalizeSubmissionRegion('uk')).toBe('UK');
    expect(classifyModule3Regional('fda').coverage).toBe('authored');
    expect(classifyModule3Regional('br').coverage).toBe('not-authored');
  });

  it('an unrecognised region is not-applicable rather than silently authored', () => {
    const s = classifyModule3Regional('ZZ');
    expect(s.coverage).toBe('not-applicable');
    expect(s.reason).toContain('not one of the twelve canonical regions');
  });
});

describe('the 3.2.R gate mirrors the regional-backbone posture', () => {
  const staging = { environment: 'staging' as const, required: false };
  const prodEnforced = { environment: 'production' as const, required: true };

  it('an authored region passes with no warning', () => {
    const r = evaluateModule3RegionalGate({ region: 'US', ...prodEnforced });
    expect(r.check?.passed).toBe(true);
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toEqual([]);
  });

  it('GLOBAL passes — 3.2.R does not apply to a region-agnostic dossier', () => {
    const r = evaluateModule3RegionalGate({ region: 'GLOBAL', ...prodEnforced });
    expect(r.check?.passed).toBe(true);
    expect(r.check?.detail).toContain('does not apply');
    expect(r.blockers).toEqual([]);
  });

  it('an unauthored region WARNS but does not block when enforcement is off', () => {
    const r = evaluateModule3RegionalGate({ region: 'UK', ...staging });
    expect(r.check?.passed).toBe(false);
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toHaveLength(1);
    expect(r.warnings[0]).toContain('MHRA');
  });

  it('an unauthored region BLOCKS a production transmit under M3_REQUIRE_REGIONAL_SECTION', () => {
    const r = evaluateModule3RegionalGate({ region: 'UK', ...prodEnforced });
    expect(r.blockers).toHaveLength(1);
    expect(r.blockers[0]).toContain('M3_REQUIRE_REGIONAL_SECTION');
    expect(r.blockers[0]).toContain('no Module 3 regional information (3.2.R) for UK');
  });

  it('enforcement in STAGING does not block — production only, like its siblings', () => {
    const r = evaluateModule3RegionalGate({
      region: 'UK',
      environment: 'staging',
      required: true,
    });
    expect(r.blockers).toEqual([]);
    expect(r.warnings).toHaveLength(1);
  });

  it('a package that ships a 3.2.R leaf passes even for an unauthored region', () => {
    // The template's absence cost this submission nothing: the content arrived
    // some other way. Blocking here would be the same false report in reverse.
    const r = evaluateModule3RegionalGate({
      region: 'UK',
      shippedCtdSections: ['3.2.S.1', '3.2.R.1', '3.2.P.1'],
      ...prodEnforced,
    });
    expect(r.check?.passed).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it.each([['m3.2.R.1'], ['3.2.R']])('recognises %s as a regional leaf', section => {
    const r = evaluateModule3RegionalGate({
      region: 'UK',
      shippedCtdSections: [section],
      ...prodEnforced,
    });
    expect(r.blockers).toEqual([]);
  });

  it('a manifest-less package is judged on the region and says so', () => {
    const r = evaluateModule3RegionalGate({ region: 'UK', ...staging });
    expect(r.warnings[0]).toContain('manifest was not available');
  });

  it('the env flag is opt-in and case-insensitive', () => {
    expect(module3RegionalRequiredFromEnv({})).toBe(false);
    expect(module3RegionalRequiredFromEnv({ M3_REQUIRE_REGIONAL_SECTION: 'false' })).toBe(false);
    expect(module3RegionalRequiredFromEnv({ M3_REQUIRE_REGIONAL_SECTION: 'TRUE' })).toBe(true);
    expect(module3RegionalRequiredFromEnv({ M3_REQUIRE_REGIONAL_SECTION: 'true' })).toBe(true);
  });
});
