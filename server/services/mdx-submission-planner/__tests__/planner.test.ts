/**
 * Unit tests for the MDX global submission planner.
 *
 * Covers: single + multi-market plans; IVD vs non-IVD pathway selection;
 * readiness reflecting availableArtifacts; the honest cannot-transmit blocker
 * present for every market; graceful handling of unknown markets; and the
 * correctness of the aggregate rollup (readiness counts, assemble-capable vs
 * incapable sets, empty transmit set, de-duplicated global blockers).
 *
 * Pure assertions against pure functions — no DB, no network, no LLM.
 */

import { describe, it, expect } from 'vitest';

import { planGlobalSubmission } from '../planner';
import type { DeviceProfile } from '../types';
import {
  getMarket,
  MARKET_IDS,
} from '../../global-markets/market-registry';
import type { MarketId } from '../../global-markets/types';

/** A profile with no artifacts produced yet. */
function emptyProfile(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  return {
    name: 'Test Device',
    isIvd: false,
    availableArtifacts: [],
    ...overrides,
  };
}

describe('planGlobalSubmission — single market', () => {
  it('produces one market plan for a single target market', () => {
    const plan = planGlobalSubmission(emptyProfile(), ['us-fda']);

    expect(plan.marketPlans).toHaveLength(1);
    expect(plan.unknownMarkets).toHaveLength(0);

    const mp = plan.marketPlans[0];
    const descriptor = getMarket('us-fda')!;
    expect(mp.marketId).toBe('us-fda');
    expect(mp.marketName).toBe(descriptor.name);
    expect(mp.authority).toBe(descriptor.authority);
    expect(mp.authorityShort).toBe(descriptor.authorityShort);
    expect(mp.dossierStandard).toBe(descriptor.dossierStandard);
    expect(mp.dossierFormatName).toBe(descriptor.dossierFormatName);
    expect(mp.classificationScheme).toBe(descriptor.classificationScheme);
  });

  it('echoes the profile it was built for', () => {
    const profile = emptyProfile({ name: 'Acme Analyzer', riskTier: 'Class II' });
    const plan = planGlobalSubmission(profile, ['us-fda']);
    expect(plan.profile).toEqual(profile);
  });

  it('carries provenance with the composed modules', () => {
    const plan = planGlobalSubmission(emptyProfile(), ['us-fda']);
    expect(plan.provenance.modules).toContain('global-markets/market-registry');
    expect(plan.provenance.modules).toContain('global-markets/market-readiness');
    expect(typeof plan.provenance.generatedAt).toBe('string');
  });
});

describe('planGlobalSubmission — multi-market', () => {
  it('produces a plan per requested market', () => {
    const targets: MarketId[] = ['us-fda', 'eu-mdr-ivdr', 'jp-pmda'];
    const plan = planGlobalSubmission(emptyProfile(), targets);
    expect(plan.marketPlans.map((p) => p.marketId).sort()).toEqual(
      [...targets].sort(),
    );
  });

  it('sorts market plans by canonical registry order (deterministic)', () => {
    // Request in a deliberately scrambled order.
    const scrambled: MarketId[] = ['jp-pmda', 'us-fda', 'au-tga', 'eu-mdr-ivdr'];
    const plan = planGlobalSubmission(emptyProfile(), scrambled);

    const ids = plan.marketPlans.map((p) => p.marketId);
    const expected = MARKET_IDS.filter((id) => scrambled.includes(id));
    expect(ids).toEqual(expected);
  });

  it('deduplicates repeated target market ids', () => {
    const plan = planGlobalSubmission(emptyProfile(), [
      'us-fda',
      'us-fda',
      'eu-mdr-ivdr',
    ]);
    expect(plan.marketPlans).toHaveLength(2);
  });

  it('is deterministic across repeated calls (ignoring the timestamp)', () => {
    const targets: MarketId[] = ['us-fda', 'cn-nmpa', 'eu-mdr-ivdr'];
    const a = planGlobalSubmission(emptyProfile(), targets);
    const b = planGlobalSubmission(emptyProfile(), targets);

    const strip = (p: ReturnType<typeof planGlobalSubmission>) => ({
      ...p,
      provenance: { ...p.provenance, generatedAt: 'X' },
    });
    expect(strip(a)).toEqual(strip(b));
  });
});

describe('planGlobalSubmission — IVD vs non-IVD pathway selection', () => {
  it('selects the device pathway set when profile.isIvd is false', () => {
    const plan = planGlobalSubmission(emptyProfile({ isIvd: false }), ['us-fda']);
    const mp = plan.marketPlans[0];
    const descriptor = getMarket('us-fda')!;
    expect(mp.pathwayKind).toBe('device');
    expect(mp.pathways).toEqual(descriptor.devicePathways);
  });

  it('selects the IVD pathway set when profile.isIvd is true', () => {
    const plan = planGlobalSubmission(emptyProfile({ isIvd: true }), ['us-fda']);
    const mp = plan.marketPlans[0];
    const descriptor = getMarket('us-fda')!;
    expect(mp.pathwayKind).toBe('ivd');
    expect(mp.pathways).toEqual(descriptor.ivdPathways);
  });

  it('IVD and device pathways differ where the registry distinguishes them', () => {
    const device = planGlobalSubmission(emptyProfile({ isIvd: false }), ['us-fda']);
    const ivd = planGlobalSubmission(emptyProfile({ isIvd: true }), ['us-fda']);
    // us-fda has distinct ivdPathways vs devicePathways in the registry.
    expect(ivd.marketPlans[0].pathways).not.toEqual(
      device.marketPlans[0].pathways,
    );
  });

  it('returns a copy of the pathway array (not the registry reference)', () => {
    const descriptor = getMarket('eu-mdr-ivdr')!;
    const plan = planGlobalSubmission(emptyProfile(), ['eu-mdr-ivdr']);
    const mp = plan.marketPlans[0];
    expect(mp.pathways).toEqual(descriptor.devicePathways);
    expect(mp.pathways).not.toBe(descriptor.devicePathways);
  });
});

describe('planGlobalSubmission — readiness reflects availableArtifacts', () => {
  it('reports not-started readiness when no artifacts are supplied', () => {
    const plan = planGlobalSubmission(emptyProfile(), ['us-fda']);
    const mp = plan.marketPlans[0];
    expect(mp.readiness.presentElements).toHaveLength(0);
    expect(mp.readiness.score).toBe(0);
    expect(mp.readiness.band).toBe('not-started');
    expect(mp.readiness.complete).toBe(false);
  });

  it('reports present elements and a higher score when artifacts are supplied', () => {
    const descriptor = getMarket('us-fda')!;
    const someElements = descriptor.requiredDossierElements.slice(0, 2);
    const plan = planGlobalSubmission(
      emptyProfile({ availableArtifacts: someElements }),
      ['us-fda'],
    );
    const mp = plan.marketPlans[0];
    expect(mp.readiness.presentElements.sort()).toEqual([...someElements].sort());
    expect(mp.readiness.score).toBeGreaterThan(0);
    expect(mp.readiness.complete).toBe(false);
  });

  it('reports complete readiness when every required element is present', () => {
    const descriptor = getMarket('us-fda')!;
    const plan = planGlobalSubmission(
      emptyProfile({ availableArtifacts: [...descriptor.requiredDossierElements] }),
      ['us-fda'],
    );
    const mp = plan.marketPlans[0];
    expect(mp.readiness.complete).toBe(true);
    expect(mp.readiness.missingElements).toHaveLength(0);
    expect(mp.readiness.score).toBe(100);
  });

  it('prioritizes next actions for missing elements in registry order', () => {
    const descriptor = getMarket('us-fda')!;
    // Supply the first required element; the rest are missing.
    const supplied = descriptor.requiredDossierElements.slice(0, 1);
    const plan = planGlobalSubmission(
      emptyProfile({ availableArtifacts: supplied }),
      ['us-fda'],
    );
    const mp = plan.marketPlans[0];

    const expectedMissing = descriptor.requiredDossierElements.filter(
      (e) => !supplied.includes(e),
    );
    expect(mp.nextActions.map((a) => a.element)).toEqual(expectedMissing);
    // Priorities are 1-based and contiguous.
    expect(mp.nextActions.map((a) => a.priority)).toEqual(
      expectedMissing.map((_, i) => i + 1),
    );
  });

  it('emits no next actions when readiness is complete', () => {
    const descriptor = getMarket('us-fda')!;
    const plan = planGlobalSubmission(
      emptyProfile({ availableArtifacts: [...descriptor.requiredDossierElements] }),
      ['us-fda'],
    );
    expect(plan.marketPlans[0].nextActions).toHaveLength(0);
  });
});

describe('planGlobalSubmission — honest capability flags & blockers', () => {
  it('reports a cannot-transmit blocker for EVERY planned market', () => {
    const plan = planGlobalSubmission(emptyProfile(), [...MARKET_IDS]);
    expect(plan.marketPlans).toHaveLength(MARKET_IDS.length);
    for (const mp of plan.marketPlans) {
      expect(mp.canTransmit).toBe(false);
      const hasTransmitBlocker = mp.blockers.some((b) =>
        b.includes('cannot transmit'),
      );
      expect(hasTransmitBlocker).toBe(true);
    }
  });

  it('reports canAssemble straight from the registry', () => {
    const plan = planGlobalSubmission(emptyProfile(), [...MARKET_IDS]);
    for (const mp of plan.marketPlans) {
      expect(mp.canAssemble).toBe(getMarket(mp.marketId)!.canAssemble);
      expect(mp.assembleNote).toBe(getMarket(mp.marketId)!.assembleNote);
    }
  });

  it('surfaces a cannot-assemble blocker for assemble-incapable markets', () => {
    // jp-pmda is canAssemble: false in the registry.
    const plan = planGlobalSubmission(emptyProfile(), ['jp-pmda']);
    const mp = plan.marketPlans[0];
    expect(mp.canAssemble).toBe(false);
    expect(mp.blockers.some((b) => b.includes('cannot assemble'))).toBe(true);
  });

  it('de-duplicates per-market blockers', () => {
    const plan = planGlobalSubmission(emptyProfile(), ['us-fda']);
    const mp = plan.marketPlans[0];
    expect(new Set(mp.blockers).size).toBe(mp.blockers.length);
  });
});

describe('planGlobalSubmission — unknown markets handled gracefully', () => {
  it('reports an unknown market without throwing', () => {
    const plan = planGlobalSubmission(emptyProfile(), [
      'not-a-real-market' as MarketId,
    ]);
    expect(plan.marketPlans).toHaveLength(0);
    expect(plan.unknownMarkets).toHaveLength(1);
    expect(plan.unknownMarkets[0].requestedId).toBe('not-a-real-market');
    expect(plan.unknownMarkets[0].reason).toMatch(/unknown market/i);
  });

  it('plans known markets and reports unknown ones alongside', () => {
    const plan = planGlobalSubmission(emptyProfile(), [
      'us-fda',
      'mars-colony' as MarketId,
      'eu-mdr-ivdr',
    ]);
    expect(plan.marketPlans.map((p) => p.marketId)).toEqual([
      'us-fda',
      'eu-mdr-ivdr',
    ]);
    expect(plan.unknownMarkets.map((u) => u.requestedId)).toEqual(['mars-colony']);
  });

  it('handles an empty target list', () => {
    const plan = planGlobalSubmission(emptyProfile(), []);
    expect(plan.marketPlans).toHaveLength(0);
    expect(plan.unknownMarkets).toHaveLength(0);
    expect(plan.readinessSummary.totalPlanned).toBe(0);
    expect(plan.globalBlockers).toHaveLength(0);
  });
});

describe('planGlobalSubmission — aggregate rollup', () => {
  it('counts ready / partial / not-started correctly', () => {
    const fdaDescriptor = getMarket('us-fda')!;
    const euDescriptor = getMarket('eu-mdr-ivdr')!;

    // us-fda: fully complete (ready).
    // eu-mdr-ivdr: one element present (partial).
    // mdsap: nothing present (not-started) — its required QMS elements do not
    //        overlap with the supplied device/IVD dossier artifacts.
    const artifacts = [
      ...fdaDescriptor.requiredDossierElements,
      euDescriptor.requiredDossierElements[0],
    ];
    const plan = planGlobalSubmission(
      emptyProfile({ availableArtifacts: artifacts }),
      ['us-fda', 'eu-mdr-ivdr', 'mdsap'],
    );

    expect(plan.readinessSummary.totalPlanned).toBe(3);
    expect(plan.readinessSummary.ready).toBe(1);
    expect(plan.readinessSummary.partial).toBe(1);
    expect(plan.readinessSummary.notStarted).toBe(1);
  });

  it('partitions markets into assemble-capable vs incapable correctly', () => {
    // us-fda + eu-mdr-ivdr are assemble-capable; jp-pmda + cn-nmpa are not.
    const plan = planGlobalSubmission(emptyProfile(), [
      'us-fda',
      'eu-mdr-ivdr',
      'jp-pmda',
      'cn-nmpa',
    ]);

    expect(plan.assembleCapableMarkets).toEqual(['us-fda', 'eu-mdr-ivdr']);
    expect(plan.assembleIncapableMarkets).toEqual(['jp-pmda', 'cn-nmpa']);

    // Every planned market is in exactly one partition.
    const union = [
      ...plan.assembleCapableMarkets,
      ...plan.assembleIncapableMarkets,
    ].sort();
    expect(union).toEqual(plan.marketPlans.map((p) => p.marketId).sort());
  });

  it('keeps the transmit-capable set empty (honest invariant) across all markets', () => {
    const plan = planGlobalSubmission(emptyProfile(), [...MARKET_IDS]);
    expect(plan.transmitCapableMarkets).toHaveLength(0);
  });

  it('rolls up a de-duplicated set of all per-market blockers', () => {
    const plan = planGlobalSubmission(emptyProfile(), ['us-fda', 'eu-mdr-ivdr']);

    // No duplicates.
    expect(new Set(plan.globalBlockers).size).toBe(plan.globalBlockers.length);

    // The rollup is the union of every market's blockers.
    const expectedUnion = new Set(
      plan.marketPlans.flatMap((p) => p.blockers),
    );
    expect(new Set(plan.globalBlockers)).toEqual(expectedUnion);

    // And it contains the honest cannot-transmit blockers.
    expect(plan.globalBlockers.some((b) => b.includes('cannot transmit'))).toBe(
      true,
    );
  });
});
