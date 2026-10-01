/**
 * P1-54 probe, round 2: does the self-hosted embedding lane (`provider: 'local'`)
 * pass the gateway's placement decision for every tenant?
 *
 * Round 1's copy (../../probe/) pins what was observed before the gateway fix:
 * DENY_TENANT_POLICY for PHI from a tenant resident in `us` or in `eu`, with the
 * lane approved. This copy is the same probe after it (gateway.ts,
 * assertSensitiveDispatchAllowed: a self-hosted placement is decided at its own
 * region, and the tenant's residency is enforced by the tenant floor). Only
 * those two cells change.
 *
 * Runs the real `AIGateway.authorizeEmbedding` (no stub of the decision) under
 * production enforcement, once per tenant posture, data class and placement
 * approval set, and prints what it decided. The assertions pin what was
 * OBSERVED on 2026-10-01, so a change to either answer shows up here; they are
 * not a statement that every observed answer is the desired one (see the
 * evidence README, "What the probe found").
 *
 * Run (from the repository root):
 *   npx vitest run --config docs/evidence/D6/2026-10-01-tranche-4/P1-54-embedding-lane/round-2/probe/vitest.probe.config.ts
 */

import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../../../../../server/utils/logger', () => {
  const quiet = { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() };
  return { createScopedLogger: () => quiet, createContextLogger: () => quiet, logger: quiet, default: quiet };
});

import { AIGateway } from '../../../../../../../server/services/ai-gateway/gateway';
import {
  resetOrgPlacementResolver,
  setOrgPlacementResolver,
  type OrgPlacementPolicy,
} from '../../../../../../../server/services/ai-gateway/providers/org-placement';
import { resetPlacementRegistry } from '../../../../../../../server/services/ai-gateway/providers/placement';
import { resetContentClassifier } from '../../../../../../../server/services/ai-governance/classification/index.js';

const TEXT = {
  none: 'Section 3.2.P.5.1 lists the release specifications for the drug product.',
  phi: 'Patient MRN: 44819023 was admitted on 2026-03-02 for observation.',
} as const;

/** The value terraform/stack/tests/boot_contract.tftest.hcl deploys with: Anthropic only. */
const APPROVALS_STACK = JSON.stringify({
  anthropic: { region: 'global', zeroRetentionApproved: true, approvedDataClasses: ['pii'], approvedIntendedUses: ['drafting'] },
});
/** The same, plus an approval for the self-hosted lane to embed sensitive text. */
const APPROVALS_WITH_LOCAL = JSON.stringify({
  ...JSON.parse(APPROVALS_STACK),
  local: { region: 'on_prem', zeroRetentionApproved: true, approvedDataClasses: ['pii', 'phi'], approvedIntendedUses: ['embedding'] },
});

type Posture = { name: string; organizationId?: number; resolve: () => Promise<OrgPlacementPolicy | null> };
const POSTURES: Posture[] = [
  { name: 'no placement policy (an unelected tenant)', organizationId: 7, resolve: async () => null },
  { name: 'residency us', organizationId: 7, resolve: async () => ({ residency: 'us' }) },
  { name: 'residency eu + zero retention', organizationId: 7, resolve: async () => ({ residency: 'eu', zeroDataRetention: true }) },
  { name: 'residency on_prem', organizationId: 7, resolve: async () => ({ residency: 'on_prem' }) },
  { name: "allowedProviders ['anthropic'] (local not named)", organizationId: 7, resolve: async () => ({ allowedProviders: ['anthropic'] }) },
  { name: "allowedSubstrates ['frontier_private'] (self_hosted not named)", organizationId: 7, resolve: async () => ({ allowedSubstrates: ['frontier_private'] }) },
  { name: 'policy lookup fails', organizationId: 7, resolve: async () => { throw new Error('db down'); } },
  { name: 'no organization bound', organizationId: undefined, resolve: async () => null },
];

function buildGateway() {
  return new AIGateway({
    deterministicMode: false,
    auditEnabled: false, // the decision does not depend on it; the ledger is pinned elsewhere
    providers: [],
    policy: {
      maxTokensPerRequest: 16000,
      maxRequestsPerMinutePerOrg: 100,
      maxRequestsPerMinutePerUser: 30,
      blockedPatterns: [],
      contentFilters: true,
      piiDetection: true,
    },
  });
}

async function decide(posture: Posture, dataClass: keyof typeof TEXT, approvals: string): Promise<string> {
  process.env.AI_PROVIDER_PLACEMENT_APPROVALS = approvals;
  resetOrgPlacementResolver();
  resetPlacementRegistry();
  resetContentClassifier();
  setOrgPlacementResolver({ resolve: posture.resolve } as never);
  try {
    await buildGateway().authorizeEmbedding({
      provider: 'local',
      texts: [TEXT[dataClass]],
      ...(posture.organizationId === undefined ? {} : { organizationId: posture.organizationId }),
    });
    return 'ALLOWED';
  } catch (err) {
    const code = /\b(DENY_[A-Z_]+)\b/.exec(err instanceof Error ? err.message : String(err));
    return code ? code[1] : `ERROR ${(err as Error).message}`;
  }
}

const table: string[] = [];

describe('the self-hosted embedding lane under production enforcement (P1-54 probe)', () => {
  const saved = { ...process.env };

  beforeEach(() => {
    process.env.NODE_ENV = 'production';
    process.env.AI_SENSITIVE_DATA_POLICY_MODE = 'enforce';
    delete process.env.AI_PII_ENFORCEMENT;
  });
  afterEach(() => {
    process.env = { ...saved };
    resetOrgPlacementResolver();
    resetPlacementRegistry();
    resetContentClassifier();
  });
  afterAll(() => {
    console.info(
      [
        '| tenant posture | text | approvals | decision |',
        '|---|---|---|---|',
        ...table,
      ].join('\n'),
    );
  });

  // What each posture got, observed 2026-10-01 after the round-2 gateway fix:
  // [none/stack, phi/stack, none/with-local, phi/with-local].
  const OBSERVED: Record<string, [string, string, string, string]> = {
    'no placement policy (an unelected tenant)': ['ALLOWED', 'DENY_UNKNOWN_PROVIDER', 'ALLOWED', 'ALLOWED'],
    'residency us': ['ALLOWED', 'DENY_UNKNOWN_PROVIDER', 'ALLOWED', 'ALLOWED'],
    'residency eu + zero retention': ['ALLOWED', 'DENY_UNKNOWN_PROVIDER', 'ALLOWED', 'ALLOWED'],
    'residency on_prem': ['ALLOWED', 'DENY_UNKNOWN_PROVIDER', 'ALLOWED', 'ALLOWED'],
    "allowedProviders ['anthropic'] (local not named)": ['DENY_TENANT_POLICY', 'DENY_TENANT_POLICY', 'DENY_TENANT_POLICY', 'DENY_TENANT_POLICY'],
    "allowedSubstrates ['frontier_private'] (self_hosted not named)": ['DENY_TENANT_POLICY', 'DENY_TENANT_POLICY', 'DENY_TENANT_POLICY', 'DENY_TENANT_POLICY'],
    'policy lookup fails': ['DENY_TENANT_POLICY', 'DENY_TENANT_POLICY', 'DENY_TENANT_POLICY', 'DENY_TENANT_POLICY'],
    'no organization bound': ['DENY_TENANT_POLICY', 'DENY_TENANT_POLICY', 'DENY_TENANT_POLICY', 'DENY_TENANT_POLICY'],
  };

  for (const posture of POSTURES) {
    it(posture.name, async () => {
      const got = [
        await decide(posture, 'none', APPROVALS_STACK),
        await decide(posture, 'phi', APPROVALS_STACK),
        await decide(posture, 'none', APPROVALS_WITH_LOCAL),
        await decide(posture, 'phi', APPROVALS_WITH_LOCAL),
      ];
      const labels = [
        ['non-sensitive', 'stack (anthropic only)'],
        ['PHI', 'stack (anthropic only)'],
        ['non-sensitive', 'stack + local/embedding/on_prem'],
        ['PHI', 'stack + local/embedding/on_prem'],
      ];
      got.forEach((g, i) => table.push(`| ${posture.name} | ${labels[i][0]} | ${labels[i][1]} | ${g} |`));
      expect(got).toEqual(OBSERVED[posture.name]);
    });
  }
});
