/**
 * Gateway/region enum parity — the advertised schema, the accepted value, and
 * the bound registry are ONE list.
 *
 * THE DEFECT THIS PINS. `package_ectd_for_region` and `transmit_submission`
 * advertised four regions and five gateways while the registry bound thirteen
 * region:gateway pairs across twelve regions and the handlers accepted all of
 * them. A model can only call a tool with a value its input schema admits, so
 * MHRA, NMPA, TGA, Swissmedic, ANVISA, CDSCO, MFDS and HSA were shipped and
 * unreachable through AnA. The advertised enum, the handler's accepted set and
 * the registry were three copies of one list, and two of them had drifted.
 *
 * These tests fail if any of the three diverges again.
 */

import { describe, expect, it } from 'vitest';

import { PACKAGE_ECTD_FOR_REGION, TRANSMIT_SUBMISSION } from '../AnaToolDefinitions';
import { getToolHandler } from '../AnaToolExecutor';
import {
  ALL_GATEWAY_NAMES,
  ALL_REGIONS,
  REGION_AGENCY,
} from '../../submission-gateways/region-constants';
import { listGateways } from '../../submission-gateways/index';

const CTX = { organizationId: 1, userId: 1 };

function enumOf(tool: typeof PACKAGE_ECTD_FOR_REGION, property: string): string[] {
  const props = (tool.input_schema as { properties?: Record<string, { enum?: string[] }> })
    .properties;
  const values = props?.[property]?.enum;
  expect(values, `${tool.name}.${property} declares an enum`).toBeInstanceOf(Array);
  return values as string[];
}

async function run(name: string, input: Record<string, unknown>) {
  const handler = getToolHandler(name);
  expect(handler, `${name} handler registered`).toBeTypeOf('function');
  return JSON.parse(await handler!(input, CTX)) as { error?: string };
}

describe('advertised tool enums match the region/gateway constants', () => {
  it('package_ectd_for_region advertises all twelve regions', () => {
    expect(enumOf(PACKAGE_ECTD_FOR_REGION, 'region')).toEqual([...ALL_REGIONS]);
  });

  it('transmit_submission advertises all twelve regions', () => {
    expect(enumOf(TRANSMIT_SUBMISSION, 'region')).toEqual([...ALL_REGIONS]);
  });

  it('transmit_submission advertises all thirteen gateways', () => {
    expect(enumOf(TRANSMIT_SUBMISSION, 'gateway')).toEqual([...ALL_GATEWAY_NAMES]);
  });
});

describe('the constants match the gateway registry', () => {
  const bound = listGateways();

  it('binds at least one gateway for every advertised region', () => {
    const boundRegions = new Set(bound.map((g) => g.region));
    expect([...ALL_REGIONS].filter((r) => !boundRegions.has(r))).toEqual([]);
  });

  it('advertises every region the registry binds', () => {
    const advertised = new Set<string>(ALL_REGIONS);
    expect([...new Set(bound.map((g) => g.region))].filter((r) => !advertised.has(r))).toEqual([]);
  });

  it('advertises exactly the gateway names the registry binds', () => {
    expect([...new Set(bound.map((g) => g.gateway))].sort()).toEqual([...ALL_GATEWAY_NAMES].sort());
  });
});

describe('tool descriptions name every jurisdiction', () => {
  // Tool selection ranks on description text, so a region the description never
  // names is effectively unselectable even once its enum admits it.
  it('package_ectd_for_region names each region agency', () => {
    for (const region of ALL_REGIONS) {
      expect(PACKAGE_ECTD_FOR_REGION.description).toContain(REGION_AGENCY[region]);
    }
  });

  it('transmit_submission names the eight jurisdictions its enum used to hide', () => {
    for (const agency of ['MHRA', 'NMPA', 'TGA', 'Swissmedic', 'ANVISA', 'CDSCO', 'MFDS', 'HSA']) {
      expect(TRANSMIT_SUBMISSION.description).toContain(agency);
    }
  });
});

describe('the handlers accept what the schema now advertises', () => {
  it('package_ectd_for_region does not refuse a previously hidden region', async () => {
    // 'uk' is one of the eight the enum used to hide. Empty leaves stops the
    // handler before it packages anything, so this asserts the region gate
    // alone — the refusal that comes back must be about leaves, not region.
    const out = await run('package_ectd_for_region', { region: 'uk', leaves: [] });
    expect(out.error).toBeTruthy();
    expect(out.error).not.toContain('region must be one of');
    expect(out.error).toContain('leaves');
  });

  it('package_ectd_for_region refuses an unknown region, listing all twelve', async () => {
    const out = await run('package_ectd_for_region', { region: 'zz', leaves: [] });
    expect(out.error).toContain('region must be one of');
    for (const region of ALL_REGIONS) expect(out.error).toContain(region);
  });

  it('transmit_submission refuses an unknown gateway, listing all thirteen', async () => {
    const out = await run('transmit_submission', { region: 'uk', gateway: 'nope' });
    expect(out.error).toContain('gateway must be one of');
    for (const gateway of ALL_GATEWAY_NAMES) expect(out.error).toContain(gateway);
  });
});
