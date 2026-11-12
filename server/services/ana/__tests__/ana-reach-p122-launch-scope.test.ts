/**
 * P-122 reach (2026-11-12): AnA's commitment and study-design capabilities are
 * offered under launch scope.
 *
 * They were withheld in production only because the inventory filed them under
 * two locked screens (docs/evidence/DESIGN/P-122/reach-map/README.md rows 8 and
 * 45): the commitment tools under `lifecycle-mgmt`, the study-design tool and
 * the two endpoint commands under `csr-workflow`. The jobs they do belong to
 * launch screens: commitments are recorded and listed in Communication
 * (`communication-center`, /api/ha-interactions), and a study's design is
 * simulated in the protocol workspace (`protocol-dev`, /api/study-design).
 *
 * Re-filed, with the REAL toolset, inventory and dispatch gates:
 *   create_regulatory_commitment, review_commitment_portfolio   communication-center
 *   simulate_study_design, evaluate_endpoint, recommend_endpoints   protocol-dev
 *
 * Left withheld, on purpose: fulfill_regulatory_commitment. It refuses a PMR,
 * PMC or REMS (a signed act, P-41), but for a meeting commitment or other it
 * records the fulfilment itself, which is terminal, on a confirmation in
 * chat. That is not re-filed without the founder's word.
 *
 * Evidence: docs/evidence/DESIGN/P-122/ana-reach/.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../vault/document-catalog.service.js', () => ({ isDocumentCatalogEnabled: async () => true }));

import { getToolHandler } from '../AnaToolExecutor';
import { authorizeCommand } from '../../ana-ri/command-rbac';
import type { CommandContext } from '../../ana-ri/command-executor';
import { LAUNCH_SURFACE_IDS } from '../../../../shared/constants/launch-scope';
import {
  CLASSIFIED_COMMANDS,
  CLASSIFIED_TOOLS,
  HIDDEN_APP_COMMANDS,
  HIDDEN_APP_TOOLS,
  anaCapabilityInLaunchScope,
} from '../ana-launch-scope';
import { governedToolsetFor } from '../governed-toolset';

vi.setConfig({ testTimeout: 60_000, hookTimeout: 60_000 });

const COMMUNICATION_TOOLS = ['create_regulatory_commitment', 'review_commitment_portfolio'] as const;
const PROTOCOL_TOOLS = ['simulate_study_design'] as const;
const PROTOCOL_COMMANDS = ['evaluate_endpoint', 'recommend_endpoints'] as const;
const REFILED_TOOLS = [...COMMUNICATION_TOOLS, ...PROTOCOL_TOOLS];
const STILL_WITHHELD = 'fulfill_regulatory_commitment';

const pool = { query: vi.fn(async () => ({ rows: [] })) };
const production = () => {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('LAUNCH_SCOPE_ENFORCE', '');
};
afterEach(() => vi.unstubAllEnvs());

describe('the launch screens that own the jobs', () => {
  it('Communication and the protocol workspace are launch surfaces; the two locked screens are not', () => {
    expect(LAUNCH_SURFACE_IDS.has('communication-center')).toBe(true);
    expect(LAUNCH_SURFACE_IDS.has('protocol-dev')).toBe(true);
    expect(LAUNCH_SURFACE_IDS.has('lifecycle-mgmt')).toBe(false);
    expect(LAUNCH_SURFACE_IDS.has('csr-workflow')).toBe(false);
  });
});

describe('what AnA is offered under launch scope', () => {
  it.each(REFILED_TOOLS)('%s is classified, and not as a hidden app’s tool', (name) => {
    expect(CLASSIFIED_TOOLS.has(name)).toBe(true);
    expect(HIDDEN_APP_TOOLS.has(name), `${name} is still filed under ${HIDDEN_APP_TOOLS.get(name)?.join(', ')}`).toBe(false);
    expect(anaCapabilityInLaunchScope(name, HIDDEN_APP_TOOLS)).toBe(true);
  });

  it.each(PROTOCOL_COMMANDS)('the command %s is classified, and not as a hidden app’s command', (name) => {
    expect(CLASSIFIED_COMMANDS.has(name)).toBe(true);
    expect(HIDDEN_APP_COMMANDS.has(name), `${name} is still filed under ${HIDDEN_APP_COMMANDS.get(name)?.join(', ')}`).toBe(false);
    expect(anaCapabilityInLaunchScope(name, HIDDEN_APP_COMMANDS)).toBe(true);
  });

  it('in production, the toolset every chat door composes offers the re-filed tools', async () => {
    production();
    const offered = new Set((await governedToolsetFor(pool, 42)).map((t) => t.name));
    for (const name of REFILED_TOOLS) expect(offered.has(name), name).toBe(true);
  });

  it('in production, the fulfilment tool is still withheld', async () => {
    production();
    const offered = new Set((await governedToolsetFor(pool, 42)).map((t) => t.name));
    expect(offered.has(STILL_WITHHELD)).toBe(false);
    expect(HIDDEN_APP_TOOLS.get(STILL_WITHHELD)).toEqual(['lifecycle-mgmt']);
  });
});

describe('what runs when it is reached by name', () => {
  /** The registered handler as the loop reaches it; a tool answers JSON or a sentence. */
  async function reach(name: string): Promise<string> {
    return String(await getToolHandler(name)!({}, { organizationId: 1, userId: 2 } as never));
  }

  it.each(REFILED_TOOLS)('in production, %s is not refused as outside the release', async (name) => {
    production();
    expect(await reach(name)).not.toContain('LAUNCH_SCOPE');
  });

  it('in production, the fulfilment tool is refused as outside the release, before anyone is asked to confirm', async () => {
    production();
    const out = JSON.parse(await reach(STILL_WITHHELD));
    expect(out).toMatchObject({ error: 'LAUNCH_SCOPE', tool: STILL_WITHHELD });
  });

  it.each(PROTOCOL_COMMANDS)('in production, the command %s passes the launch-scope step of dispatch', async (name) => {
    production();
    const decision = await authorizeCommand(name, { userId: 7, organizationId: 3 } as CommandContext);
    const refusal = decision.ok ? null : decision.result.error;
    expect(refusal).not.toBe('LAUNCH_SCOPE');
  });
});
