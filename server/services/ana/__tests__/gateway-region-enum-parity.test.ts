/**
 * Gateway region/transport parity between what AnA is TOLD and what it can DO.
 *
 * `package_ectd_for_region` and `transmit_submission` advertised
 * `fda|ema|pmda|ca` in their tool definitions while their handlers accepted all
 * twelve regions and the regional packager built Module 1 backbones for all
 * twelve. Nothing bound the two together, so the model was told it could not do
 * something the code fully supported — eight jurisdictions were unreachable in
 * practice because the model never offered them.
 *
 * These assertions fail if a definition enum drifts from the runtime source of
 * truth in submission-gateways/region-constants.ts again.
 */

import { describe, it, expect } from 'vitest';
import { ALL_ANA_TOOLS } from '../AnaToolDefinitions.js';
import {
  ALL_REGIONS,
  ALL_GATEWAY_NAMES,
} from '../../submission-gateways/region-constants.js';

const toolByName = (name: string) => {
  const tool = ALL_ANA_TOOLS.find((t) => t.name === name);
  if (!tool) throw new Error(`tool not found in ALL_ANA_TOOLS: ${name}`);
  return tool;
};

const enumOf = (name: string, prop: string): string[] => {
  const schema = toolByName(name).input_schema as {
    properties?: Record<string, { enum?: string[] }>;
  };
  const values = schema.properties?.[prop]?.enum;
  if (!values) throw new Error(`${name}.${prop} has no enum`);
  return values;
};

describe('gateway region enum parity', () => {
  it('package_ectd_for_region advertises every supported region', () => {
    expect(enumOf('package_ectd_for_region', 'region')).toEqual([...ALL_REGIONS]);
  });

  it('transmit_submission advertises every supported region', () => {
    expect(enumOf('transmit_submission', 'region')).toEqual([...ALL_REGIONS]);
  });

  it('transmit_submission advertises every supported gateway transport', () => {
    expect(enumOf('transmit_submission', 'gateway')).toEqual([...ALL_GATEWAY_NAMES]);
  });

  // Guards the regression directly: the pre-fix enums were this 4-region subset.
  // If someone narrows them back, the assertions above fail — but this states the
  // intent explicitly so the reason is legible in the failure output.
  it('no longer exposes only the legacy four-region subset', () => {
    const legacy = ['fda', 'ema', 'pmda', 'ca'];
    expect(enumOf('package_ectd_for_region', 'region')).not.toEqual(legacy);
    expect(ALL_REGIONS.length).toBeGreaterThan(legacy.length);
  });
});
