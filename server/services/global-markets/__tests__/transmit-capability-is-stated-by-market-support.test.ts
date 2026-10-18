/**
 * The platform transmits to a market only where regulatory/market-support.ts
 * states a channel it sends through. Today it states none.
 *
 * What the code used to do (until 2026-10-15): market-registry.ts set
 * `canTransmit: true` by hand for eleven markets (us-fda, eu-mdr-ivdr, uk-mhra,
 * cn-nmpa, ca-health-canada, au-tga, br-anvisa, kr-mfds, ch-swissmedic, in-cdsco,
 * sg-hsa). Its header said they "have a live gateway", and eu-mdr-ivdr, a
 * Notified Body market, named EMA's gateway region ('ema'). The platform's own
 * channel judgement said none of them can send: channelSupportFor reads FDA ESG
 * as unproven ("FDA would reject it"), Health Canada as having no transport, and
 * every other adapter as written from no agency source. For a device filing,
 * marketSupport states "the platform transmits no device filing yet". So
 * GET /api/global-markets, POST /api/global-markets/plan, the MDX planner, AnA's
 * advise_global_market_strategy and the device assembly / cockpit market overlay
 * listed eleven markets as transmit-capable and left out the "platform cannot
 * transmit to X" blocker for each. AnA's structured fields also contradicted its
 * own prose ("The platform never transmits").
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

import { getMarket, listMarkets, marketRegistrySummary } from '../market-registry';
import { assessMarketReadiness } from '../market-readiness';
import type { MarketId } from '../types';
import { planGlobalSubmission } from '../../mdx-submission-planner/planner';
import { adviseGlobalMarketStrategy } from '../../ana-advisory/device-market-advisor';
import { assembleDeviceSubmission } from '../../pathway-engines/device-assembly/assemble-device-submission';
import { assessDeviceProgram } from '../../device-ivd-cockpit/cockpit';
import type { MarketInput } from '../../regulatory/market-support';

/** The markets that used to read transmit-capable. */
const ELEVEN: MarketId[] = [
  'us-fda', 'eu-mdr-ivdr', 'uk-mhra', 'cn-nmpa', 'ca-health-canada', 'au-tga',
  'br-anvisa', 'kr-mfds', 'ch-swissmedic', 'in-cdsco', 'sg-hsa',
];

const cannotTransmitTo = (id: MarketId) => `platform cannot transmit to ${getMarket(id)!.authorityShort}`;

describe('no market reads transmit-capable while market-support states no channel the platform sends through', () => {
  it.each(ELEVEN)('%s: canTransmit is false', (id) => {
    expect(getMarket(id)!.canTransmit).toBe(false);
  });

  it('no market in the registry is listed transmit-capable', () => {
    expect(listMarkets().filter((m) => m.canTransmit).map((m) => m.id)).toEqual([]);
    expect(marketRegistrySummary().transmitCapable).toEqual([]);
  });

  it.each(ELEVEN)('%s: readiness carries the blocker naming the authority it cannot transmit to', (id) => {
    const m = getMarket(id)!;
    expect(assessMarketReadiness(id, m.requiredDossierElements).blockers).toContain(cannotTransmitTo(id));
  });

  it('eu-mdr-ivdr names no EMA gateway: its dossier goes to a Notified Body, not EMA', () => {
    expect(getMarket('eu-mdr-ivdr')!.gatewayRegion).toBeUndefined();
  });
});

describe('canTransmit is read from market-support.ts, never set by hand', () => {
  afterEach(() => {
    vi.doUnmock('../../regulatory/market-support');
    vi.resetModules();
  });

  it("asks market-support for each market's device filing (a Notified Body's MDR file for the EU)", async () => {
    vi.resetModules();
    const asked: Array<{ applicationType: string; market: string }> = [];
    vi.doMock('../../regulatory/market-support', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../regulatory/market-support')>();
      return {
        ...actual,
        marketSupport: (input: MarketInput, ...rest: [Parameters<typeof actual.marketSupport>[1], string?]) => {
          asked.push({ applicationType: input.applicationType, market: input.market });
          return actual.marketSupport(input, ...rest);
        },
      };
    });
    await import('../market-registry');
    // The IVD statement is asked only when the device one transmits (none does).
    expect(asked).toContainEqual({ applicationType: 'device', market: 'FDA' });
    expect(asked).toContainEqual({ applicationType: 'mdr', market: 'Notified_Body' });
    expect(asked.some((a) => a.market === 'EMA')).toBe(false);
  });

  it("a wired gateway nothing has been accepted through ('unproven', as FDA ESG is) makes no market transmit-capable", async () => {
    vi.resetModules();
    vi.doMock('../../regulatory/market-support', async (importOriginal) => {
      const actual = await importOriginal<typeof import('../../regulatory/market-support')>();
      return {
        ...actual,
        marketSupport: (...args: Parameters<typeof actual.marketSupport>) => ({
          ...actual.marketSupport(...args),
          channel: { state: 'unproven' as const, detail: 'FDA would reject it' },
        }),
      };
    });
    const fresh = await import('../market-registry');
    expect(fresh.listMarkets().filter((m) => m.canTransmit).map((m) => m.id)).toEqual([]);
  });
});

describe('every consumer carries the same answer', () => {
  const profile = { name: 'Acme Analyzer', isIvd: false, availableArtifacts: [] as string[] };

  it('the MDX planner (POST /api/global-markets/plan): no transmit-capable market, and a blocker for each', () => {
    const plan = planGlobalSubmission(profile, [...ELEVEN]);
    expect(plan.transmitCapableMarkets).toEqual([]);
    for (const mp of plan.marketPlans) {
      expect(mp.canTransmit, mp.marketId).toBe(false);
      expect(mp.blockers, mp.marketId).toContain(cannotTransmitTo(mp.marketId));
    }
    for (const id of ELEVEN) expect(plan.globalBlockers).toContain(cannotTransmitTo(id));
  });

  it("AnA advise_global_market_strategy: the structured fields agree with its prose", () => {
    const advice = adviseGlobalMarketStrategy({ profile, candidateMarkets: [...ELEVEN] });
    expect(advice.transmitCapableMarkets).toEqual([]);
    for (const m of advice.rankedMarkets) {
      expect(m.canTransmit, m.marketId).toBe(false);
      expect(m.blockers, m.marketId).toContain(cannotTransmitTo(m.marketId));
      expect(m.summary, m.marketId).toMatch(/the platform cannot transmit to /);
    }
    expect(advice.findings.find((f) => f.key === 'transmission')!.detail).toMatch(/cannot transmit to any authority/);
  });

  it('the device assembly and cockpit market overlay (POST /api/device-cockpit/assess) say FDA cannot be transmitted to', () => {
    const assembly = assembleDeviceSubmission({ pathway: '510k', variant: 'device', leaves: [], market: 'us-fda', availableArtifacts: [] });
    expect(assembly.blockers).toContain(cannotTransmitTo('us-fda'));
    const cockpit = assessDeviceProgram({ leaves: [], variant: 'device', market: 'us-fda', availableArtifacts: [] });
    expect(cockpit.blockers).toContain(cannotTransmitTo('us-fda'));
  });

  it('no header or field note claims a live gateway', async () => {
    for (const rel of [
      '../market-registry.ts',
      '../types.ts',
      '../market-readiness.ts',
      '../../mdx-submission-planner/planner.ts',
      '../../mdx-submission-planner/types.ts',
      '../../ana-advisory/device-market-advisor.ts',
      '../../../routes/global-markets.ts',
    ]) {
      const src = await fs.readFile(path.resolve(__dirname, rel), 'utf8');
      expect(src, rel).not.toMatch(/live (submission )?gateway/i);
    }
  });
});
