# D3 — the kernel's two conditional tenant predicates, 2026-10-12

`ci:tenant-isolation:strict` is one of the seven zero-baseline gates in
**Nightly Governance Strict**, red every scheduled run since at least
2026-10-05. It reported **6 candidates**. An earlier reading of this lane's
called them "conditional-predicate reads the detector cannot see through" —
that was wrong about five of them. The detector was right: the predicate is
conditional, and in two modules the condition is decided by whether a request
carries a resolvable organisation.

This gate is now at **zero**, honestly: two real holes fixed, one reviewed
query marked, and the marker says what the detector could not see.

## 1 · `GET /api/ana-ri/kernel/metrics` — platform-wide aggregates to a caller with no tenant

The sibling route on the same router, `GET /api/ana-ri/kernel/decisions`, had
already been repaired, and its comment names the rule:

> This read the org off the request and then appended the tenant clause only
> `if (orgId)`, so a request carrying no tenant listed the kernel DECISION
> RECORDS — the audit trail — for every organization at once. **A conditional
> tenant predicate is not a predicate; it is a default.**

`/kernel/metrics` kept the default. It passed
`organizationId: orgId ? Number(orgId) : null`, and each of the four
statements in `getKernelMetrics` read
`WHERE ($1::int IS NULL OR organization_id = $1)`. A request with no resolvable
tenant therefore returned **every organisation's** kernel decision count and
success rate, policy outcomes and average quality score, goal-plan runs, and
agent-protocol events. Nothing covered it: the test file that proves the
decisions fix (`ana-ri-kernel-decisions-scope.test.ts:15`) mocks
`getKernelMetrics` away.

Fixed the way the sibling was, and at the service boundary too: the route
refuses `403 ORG_REQUIRED` before the read, and `getKernelMetrics` throws
rather than returning its `empty` value, so a missing organisation can never
read as "this organisation has no kernel activity".

## 2 · `getKernelPolicyHint` — one tenant's outcomes steering another's routing

`WHERE … AND ($3::int IS NULL OR organization_id = $3)`, and both callers pass
`organizationId: … || null` (`routes/chat/send-message.ts:744`,
`ana-kernel-orchestrator.ts:29`). A turn whose organisation could not be
resolved chose its routing strategy from the average quality scores of every
tenant's recorded outcomes, and the cross-tenant aggregate
(`avgQualityScore`, `sampleSize`) came back to the caller.

No organisation now means no hint. That loses no behaviour: both callers
already read `policyHint?.preferredStrategy || routingPlan.strategy`, so the
turn falls back to the router's own deterministic strategy instead of to
another tenant's.

## 3 · `module-access-requests.ts:290` — reviewed, and the distinction written down

This one is safe, and it is the one the detector genuinely cannot see through.
Its null is the **mount's own scope**: `scope` is a compile-time argument to
`readAccessRequestQueue`, only the `all` mount passes it, and that mount sits
behind `denyQueueRead(actor, 'all')`, which requires the owner grant and does
not admit platform staff. Every other mount passes `actor.organizationId`. It
carries a `// tenant-isolation-safe:` marker saying exactly that, and naming
the contrast with the two holes above — a null from a mount constant behind an
owner grant is not a null from an unresolvable request org.

## Measurements

- `red.txt` — the gate at 6 candidates, and the two new suites failing 5/5 on
  the unfixed code (measured by stashing the fix, so it is the old code that
  was run).
- `green.txt` — the gate at zero; the two new suites and the three existing
  kernel suites, 10/10; every suite that touches the changed modules, 56 files
  / 529 tests; `tsc --noEmit` exit 0.
- `mutation.txt` — one of the four predicates made conditional again, and the
  gate catching it. A gate seen only to pass has not been tested.
