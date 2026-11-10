# D6: zero-retention approval is traceable to an agreement (2026-10-25)

Launch row D6 (security posture) owes the Anthropic BAA. Until it is signed, no AI provider may be treated as
retaining nothing on the strength of a configuration value alone. This change makes the approval name its agreement,
makes the approval and the placement registry two keys that must agree, and records the agreement on the ledger row.
No provider is marked zero-retention here; every default is still "no zero retention".

## What already existed

- `AI_PROVIDER_PLACEMENT_APPROVALS` (`server/services/ai-gateway/sensitive-placement-policy.ts`): per provider, a
  region, `zeroRetentionApproved` (a boolean), data classes and intended uses. The production boot refused a missing
  policy mode, an empty object, a malformed entry, and PII/PHI approved without zero retention.
- The placement registry (`server/services/ai-gateway/providers/placement.ts`) with its own zero-retention flag per
  provider (`ANTHROPIC_ZERO_RETENTION`, `OPENAI_ZERO_RETENTION`, `AI_VERTEX_ZERO_RETENTION`, `AI_AZURE_ZERO_RETENTION`).
- `ai.gateway_audit_log` rows with `retention_policy`, `placement_reason_code` and a `metadata` jsonb column.
- Terraform validation of the approvals' shape (`terraform/stack/variables.tf`) and its suite
  (`terraform/stack/tests/boot_contract.tftest.hcl`).

## What was wrong

1. The gateway passed `approval.zeroRetentionApproved` as **both** keys of the decision (`zeroRetentionApproval` and
   the approval itself, `gateway.ts` before this change). One JSON boolean let PII reach a shared API in production.
2. Nothing tied that boolean to an agreement, and nothing compared it with the registry's flag.
3. Bedrock claimed zero retention when `AI_BEDROCK_ZERO_RETENTION` was unset.
4. The ledger recorded the posture (`retention_policy`), never the agreement.
5. The Terraform suite deployed with Anthropic approved for PII on the boolean alone.

## The rules now

1. **Parse** (`readProviderPlacementApprovals`). `zeroRetentionApproved: true` requires
   `zeroRetentionAgreement: {"reference": "<non-blank>", "effectiveFrom": "YYYY-MM-DD"}` (a real calendar date). Without
   one: *"AI_PROVIDER_PLACEMENT_APPROVALS approves zero retention for anthropic but names no agreement it rests on: add
   "zeroRetentionAgreement": {...}, or set zeroRetentionApproved to false"*. A malformed agreement on any entry is
   refused. A JSON null is no agreement. The self-hosted lane (`local`) needs none (ADR-0014 §1.5: no third party
   receives its text). In production the refusal stops boot through the existing `assertSensitivePlacementConfiguration`
   path; at dispatch it fails closed as misconfiguration.
2. **Dispatch** (`zeroRetentionInForce`, `decideSensitivePlacement`). A sensitive dispatch that requires zero retention
   (every one in production, any whose tenant requires it) is allowed only when the registry flag is true **and** the
   approval approves zero retention **and** its agreement's `effectiveFrom` is on or before the dispatch's UTC date.
   An agreement dated tomorrow is not in force: `DENY_SHARED_PROVIDER_WITHOUT_ZDR`. The decision's input
   `zeroRetentionApproval` is replaced by `registryZeroRetention`, which the gateway fills from the registry.
3. **Boot** (`zeroRetentionDisagreements`, production). Refused: a zero-retention approval for a provider whose
   registry flag is not true, for Moonshot, or for a name the gateway does not route to; and a registry flag set to
   true for a provider the approvals do not approve for zero retention.
4. **Default**. Bedrock claims zero retention only when `AI_BEDROCK_ZERO_RETENTION=true`. No lane a third party runs
   claims it without configuration; `local` (self-hosted) still does.
5. **Ledger**. A served row whose dispatch relied on zero retention carries
   `metadata.zeroRetentionAgreement = {reference, effectiveFrom}` (chat and embeddings). Other rows carry none.
   The existing jsonb column is used: no migration.
6. **Terraform**. `variables.tf` refuses at plan a zero-retention approval without an agreement, a malformed
   agreement on any entry, and a zero-retention approval for any provider but `local`, because the stack sets none
   of the registry flags and the app's boot would refuse it (a crash-loop rather than a failed plan).

## Evidence

- `red/vitest-red.txt`: the new and updated tests against the unchanged source: 27 failed, 38 passed (65).
  The decision cases "ordinary PII" and "health information" are red partly because the decision's input was renamed
  (`zeroRetentionApproval` to `registryZeroRetention`); the gateway-level cases in
  `zero-retention-agreement.test.ts` are the red that shows the defect itself (PII sent with the approval alone,
  with no agreement, and with an agreement not yet in force; no agreement on the ledger row).
- `red/terraform-test-red.txt`: the six new Terraform runs against the unchanged validation: 5 failed, 1 passed
  (the passing one is the guard that a well-formed agreement is accepted).
- `green-summary.txt`: the same tests green (65/65; Terraform 84/84, 6/6), every ai-gateway test (938/939, the one
  failure belongs to another session's uncommitted classifier edit and failed before this change too), lint, types.

Tests: `server/services/ai-gateway/__tests__/zero-retention-agreement.test.ts` (new),
`__tests__/sensitive-placement-policy.test.ts`, `providers/__tests__/placement.test.ts`, and
`terraform/stack/tests/boot_contract.tftest.hcl`.

## Fixtures changed so the suite stays green

Approval fixtures with `zeroRetentionApproved: true` and no agreement were changed in one of two ways. Where the
approval was only a well-formed entry for another subject's test, it became the fail-closed interim value
(`zeroRetentionApproved: false`, no data classes): `server/config/__tests__/environment.test.ts`,
`environment-audit-export-key.test.ts`, `server/services/storage/__tests__/storage-posture.test.ts`,
`server/startup/__tests__/ai-provider-election-posture.test.ts`, `authoring-import-cycle.boot.test.ts`, the
embedding probe case in `embeddings/__tests__/embedding-provider.test.ts`, and the Terraform suite's default and
six of its runs. Where the test exercises a sensitive dispatch, it gained a test-only agreement
(`TEST-ZDR-ADDENDUM-0001`, labelled as a fixture): `self-hosted-residency.test.ts` (and `AI_BEDROCK_ZERO_RETENTION=true`
for its Bedrock cases), `embedding-placement-gate.test.ts`, `embedding-provider.test.ts`. `local` entries are unchanged.

## Not done, and why

- **Files outside this slice that must change.** `.github/workflows/ci.yml` lines 2150 and 2304 boot production with
  `{"private-deployment":{"region":"us","zeroRetentionApproved":true,...}}`; the boot now refuses it (no agreement,
  and not a routable provider). Its own comment says "nothing here claims a contractual zero-retention approval
  exists". The fix is `"zeroRetentionApproved":false` in both places. Until then the production-boot CI jobs fail.
  `.env.example` line 941 shows an example approval with zero retention and no agreement, and line 106 sets
  `AI_BEDROCK_ZERO_RETENTION=true`, which a production boot now refuses without a Bedrock approval naming an agreement.
  `docs/commercial/DATA_PROCESSING_ADDENDUM.md` §6.2 says Bedrock zero retention is "Yes by default"; it is not now.
  `server/services/ai-gateway/types.ts` should carry `zeroRetentionAgreement?: ZeroRetentionAgreement` on
  `GatewayResponse`, replacing the local `ClearedResponse` cast in `gateway.ts`.
- **The tenant floor and `retention_policy` still read the registry flag alone** (`requestPlacementDenial`,
  `logAudit`). Routing them through `zeroRetentionInForce` changes the routing of non-sensitive payloads for
  zero-retention tenants, and the tests that set a registry flag without an approval; that is its own change.
  The production boot rule (a registry flag needs an approval with an agreement) closes it except between setting the
  flag and a future `effectiveFrom`; the operator guidance in `docs/AI_SENSITIVE_DATA_PLACEMENT.md` says to set the
  flag no earlier than that date.
- **The hosted stack cannot yet record an agreement**: `terraform/stack/main.tf` sets no registry flag, so the
  stack refuses any non-local zero-retention approval at plan. When the BAA/ZDR is signed, `main.tf` needs the
  provider's flag in the task definition and `variables.tf` the rule relaxed for that provider.
- **A failed dispatch's row** (the provider errored after the gate allowed it) does not name the agreement: the
  failure row is built without the gate's clearance.
