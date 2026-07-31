/**
 * Tests for the eCTD DTD bundler + readiness gate (audit gap P0-1).
 * Pure logic + a no-throw directory read against a temp dir.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import {
  ICH_BACKBONE_DTD,
  requiredDtdsForRegion,
  listVendoredDtds,
  assessDtdReadiness,
  dtdRequiredFromEnv,
} from '../dtd-bundler';

describe('requiredDtdsForRegion', () => {
  it('always includes the ICH backbone plus the regional DTD', () => {
    expect(requiredDtdsForRegion('fda')).toEqual([ICH_BACKBONE_DTD, 'us-regional-v3-3.dtd']);
    expect(requiredDtdsForRegion('ema')).toEqual([ICH_BACKBONE_DTD, 'eu-regional.dtd']);
    expect(requiredDtdsForRegion('pmda')).toEqual([ICH_BACKBONE_DTD, 'jp-regional.dtd']);
    expect(requiredDtdsForRegion('ca')).toEqual([ICH_BACKBONE_DTD, 'ca-regional.dtd']);
  });

  it('requires eu-regional.dtd for every widened region (they build the EMA backbone)', () => {
    // These 8 regions route through buildEmaBackbone, whose DOCTYPE is
    // eu-regional.dtd — so a self-contained package MUST ship it. Under-reporting
    // (returning only the ICH backbone) is the P0-1 gate bypass this guards.
    for (const region of ['uk', 'ch', 'au', 'cn', 'br', 'in', 'kr', 'sg'] as const) {
      expect(requiredDtdsForRegion(region)).toEqual([ICH_BACKBONE_DTD, 'eu-regional.dtd']);
    }
  });
});

describe('listVendoredDtds', () => {
  it('returns [] for a missing directory without throwing', async () => {
    const out = await listVendoredDtds(path.join(os.tmpdir(), 'does-not-exist-' + Date.now()));
    expect(out).toEqual([]);
  });

  describe('with a populated drop-point', () => {
    let dir: string;
    beforeAll(async () => {
      dir = await fs.mkdtemp(path.join(os.tmpdir(), 'dtd-test-'));
      await fs.writeFile(path.join(dir, 'ich-ectd-3-2.dtd'), '<!-- ich -->');
      await fs.writeFile(path.join(dir, 'us-regional-v3-3.dtd'), '<!-- us -->');
      await fs.writeFile(path.join(dir, 'README.md'), 'not a dtd'); // must be ignored
    });
    afterAll(async () => {
      await fs.rm(dir, { recursive: true, force: true });
    });

    it('lists only *.dtd files, sorted', async () => {
      const out = await listVendoredDtds(dir);
      expect(out.map((d) => d.fileName)).toEqual(['ich-ectd-3-2.dtd', 'us-regional-v3-3.dtd']);
      expect(out[0].bytes.toString()).toContain('ich');
    });
  });
});

describe('assessDtdReadiness', () => {
  it('blocks a production FDA package missing the regional DTD when required', () => {
    const r = assessDtdReadiness({
      region: 'fda',
      present: [ICH_BACKBONE_DTD],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.selfContained).toBe(false);
    expect(r.missing).toEqual(['us-regional-v3-3.dtd']);
    expect(r.cleared).toBe(false);
    expect(r.blockers[0]).toContain('us-regional-v3-3.dtd');
  });

  it('clears when every required DTD is present', () => {
    const r = assessDtdReadiness({
      region: 'ema',
      present: [ICH_BACKBONE_DTD, 'eu-regional.dtd'],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.selfContained).toBe(true);
    expect(r.cleared).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('does NOT block when DTDs are not required (graceful default), but still reports missing', () => {
    const r = assessDtdReadiness({ region: 'fda', present: [], environment: 'production', requireDtd: false });
    expect(r.cleared).toBe(true);
    expect(r.selfContained).toBe(false);
    expect(r.missing.length).toBe(2);
  });

  it('does NOT block staging even when required', () => {
    const r = assessDtdReadiness({ region: 'pmda', present: [], environment: 'staging', requireDtd: true });
    expect(r.cleared).toBe(true);
  });

  it('blocks a production widened-region (kr) package missing eu-regional.dtd', () => {
    // Regression guard: kr builds the EMA backbone, so a production package that
    // ships only the ICH backbone is NOT self-contained. Before the region map
    // was completed this cleared incorrectly (kr required only the ICH DTD).
    const r = assessDtdReadiness({
      region: 'kr',
      present: [ICH_BACKBONE_DTD],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.selfContained).toBe(false);
    expect(r.missing).toEqual(['eu-regional.dtd']);
    expect(r.cleared).toBe(false);
    expect(r.blockers[0]).toContain('eu-regional.dtd');
  });

  it('matches DTD names case-insensitively', () => {
    const r = assessDtdReadiness({
      region: 'fda',
      present: ['ICH-ECTD-3-2.DTD', 'US-REGIONAL-V3-3.DTD'],
      environment: 'production',
      requireDtd: true,
    });
    expect(r.selfContained).toBe(true);
  });
});

describe('dtdRequiredFromEnv', () => {
  it('is true only for the literal "true"', () => {
    expect(dtdRequiredFromEnv({ ECTD_REQUIRE_DTD: 'true' } as NodeJS.ProcessEnv)).toBe(true);
    expect(dtdRequiredFromEnv({ ECTD_REQUIRE_DTD: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    expect(dtdRequiredFromEnv({} as NodeJS.ProcessEnv)).toBe(false);
  });
});
