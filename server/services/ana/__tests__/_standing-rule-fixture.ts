/**
 * The standing-rule gate for suites whose fixture has no rule store.
 *
 * Since 2026-11-06 (`4852aa78`, `a2f9264a`, P-104) every registered AnA tool
 * reads the tenant's and the project's mandatory rules and the acting member's
 * private rules before it runs (`../governed-tool-gate.ts`
 * `loadToolSkillGates`), and refuses SKILL_POLICY_UNAVAILABLE when it cannot.
 * A stub `sqlClient` answers that read with no rows, which the gate rightly
 * reads as "not an active member": the suite's tools then refuse before the
 * behaviour under test runs.
 *
 * A suite that is about something else declares its fixture has no rules:
 *
 *   vi.mock('../governed-tool-gate.js', async orig =>
 *     (await import('./_standing-rule-fixture')).withNoStandingRules(await orig()));
 *
 * It then gets the snapshot the real gate returns for a tenant with no tenant,
 * project or private rules. An organization id the real gate refuses is still
 * refused. The gate itself is tested against real clients: governed-tool-gate,
 * governedActionApprovalTenantPinned, ana-skills-routes and the pglite
 * integrations. `tests/setup.ts` applies the same snapshot to the global `pg`
 * stub.
 */
import type * as Gate from '../governed-tool-gate';
import type * as Router from '../../ana-context-router';

type GateScope = Parameters<typeof Gate.loadToolSkillGates>[0];
type GateSnapshot = Awaited<ReturnType<typeof Gate.loadToolSkillGates>>;

/** The real gate's answer for a tenant with no rules; null where it has no tenant. */
export function noStandingRulesSnapshot(scope: GateScope): GateSnapshot {
  const organizationId = scope?.organizationId;
  if (organizationId == null) return null;
  return { organizationId, userId: scope?.userId ?? null, projectId: scope?.projectId ?? null, rules: [], ruleHash: 'e'.repeat(64) };
}

/** True where the real gate refuses the tenant before reading anything. */
export function refusedPolicyTenant(scope: GateScope): boolean {
  const organizationId = scope?.organizationId;
  return organizationId != null && (!Number.isSafeInteger(organizationId) || organizationId <= 0);
}

/** The gate module with its rule read answered from a fixture that has no rules. */
export function withNoStandingRules(actual: typeof Gate): typeof Gate {
  return {
    ...actual,
    loadToolSkillGates: async (scope, call) =>
      refusedPolicyTenant(scope) ? actual.loadToolSkillGates(scope, call) : noStandingRulesSnapshot(scope),
  };
}

/**
 * The same private rules on the model's side. Since `a2f9264a` the AnA stream
 * issues the acting member's private rules as owner-private model context
 * before it reads the conversation (`../../ana-context-router.ts`
 * `issuePrivateRuleModelContext`), and the turn stops when it cannot. A stub
 * `sqlClient` cannot verify the member, so a suite about something else
 * declares its member has no private rules:
 *
 *   vi.mock('…/services/ana-context-router.js', async orig =>
 *     (await import('…/_standing-rule-fixture')).withNoPrivateRules(await orig()));
 *
 * It then gets what the real issuer returns for a member with none: no
 * context (null). A scope the real issuer refuses outright is still refused.
 */
export function withNoPrivateRules(actual: typeof Router): typeof Router {
  return {
    ...actual,
    issuePrivateRuleModelContext: async (client, scope) =>
      refusedPolicyTenant(scope) || !Number.isSafeInteger(scope.userId) || scope.userId <= 0
        ? actual.issuePrivateRuleModelContext(client, scope)
        : null,
  };
}
