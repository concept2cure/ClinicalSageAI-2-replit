# D2 / D6 — launch scope enforced at the API, not only in navigation

**Rows:** D2 (every surface outside the launch catalog behind a flag that is off
in production) and D6 (security posture: the pen test P1-15 is scoped to the
launch catalog). **Lane:** `…session_01E8btkB8mcLirW4rNvsMNxK`, claimed in
`docs/work-orders/README.md` §0. **Date:** 2026-09-25.

## What was wrong

`LAUNCH_SCOPE_ENFORCE` (on by default in production) was read by navigation
only: the rail, the Apps catalog, a deep link. The one API-level check,
`server/middleware/moduleEntitlementGate.ts`, never read it, and it defaults to
`MODULE_ENFORCEMENT=off`. So in production any signed-in organisation could
call every route of every surface the product hides. That includes the
Orchestration and Inconsistency boards the owner locked in VSR-001 §16.5.
The 2026-09-24 audit-outcome measurement counted 118 audited write sites
reachable that way (`docs/evidence/D5-AUDIT-OUTCOMES/2026-09-24/`).

## Why it could not simply be switched on

The rule has to attribute a path to surfaces, and the only attribution is
`UI_SURFACES[].apiPrefixes`. Measured before any rule shipped
(`gate-red-registry-before.txt`): launch and shell screens call **19 paths
that only out-of-scope surfaces declared**:

- Tasks and Vault (through `MdxSurfaceHost`): `/api/regulatory-programs`, `/api/submission-ops`;
- Gateway Transmittals: `/api/submission-ops`;
- Authoring and the conversation thread: `/api/c2c/documents`;
- the regulatory workspace: `/api/clinical-regulatory-evidence`;
- Protocol Dev: `/api/study-design`;
- AnA command: `/api/report-os/portfolio`;
- the shell's task tray: `/api/approval-workflows/pending`.

Enforcing on that registry would have refused working launch screens in
production.

## What changed

1. **The registry is corrected.** Each launch surface now declares what its
   code calls, narrowed to the sub-path where only one is used. The rest of
   `/api/approval-workflows` and `/api/report-os` stays out of scope. Every
   addition carries a comment naming the calling file.
2. **`ci:launch-scope-api`** (`scripts/ci/check-launch-scope-api.ts`, in
   `ci.yml` beside `ci:launch-scope`) walks each launch and shell surface's
   client import graph from its `surfaceViews.ts` registration, plus the shell
   chrome, and fails when a screen names a path production would refuse. Red
   on the old registry (19), green on the corrected one: 264 paths, none
   refused. Its self-test seeds the case and must flag it.
3. **Enforcement.** `moduleEntitlementGate` refuses, before anything else and
   whatever `MODULE_ENFORCEMENT` says, a path whose every claiming surface is
   outside the launch catalog: 403 `{ error: { code: 'LAUNCH_SCOPE' } }`. It
   applies with or without an organisation. `LAUNCH_SCOPE_ENFORCE` is read once
   when the gate is built at boot; a value production cannot parse refuses to
   boot. The verdict is one pure function
   (`server/services/entitlements/launch-scope-api.ts`) shared by the gate and
   the CI check. The prefix map and matcher moved, unchanged, to
   `server/services/entitlements/api-prefix-map.ts`, which the gate
   re-exports.

| Proof | Red | Green |
|---|---|---|
| CI gate on the registry | 19 refused launch paths (`gate-red-registry-before.txt`) | none (`gate-green-registry-after.txt`) |
| Enforcement (gate change stashed) | 7 failed / 23 passed of 30 (`enforcement-red.txt`) | 30 / 30 (`enforcement-green.txt`) |

Real-registry cases in `launch-scope-api-gate.test.ts` pin production's
answers: the contradiction scan and execution history are refused; execute,
templates, submission-ops, tasks, approval-workflows/pending,
regulatory-programs and study-design pass; pharmacovigilance is refused; the
public API (`/api/v1/documents`) and the Stripe webhook pass.

**Not refused**, checked:

- 67 external-caller paths named in server code (webhooks, callbacks,
  health, OAuth, MCP, the public API);
- every out-of-scope mount's router, for webhook, callback, ack or public
  handlers: none found;
- the golden journeys, which run under `NODE_ENV=test`, where scope is off.

## Validation package

OQ-005 drove the locked boards' APIs in the production posture. The protocol
is updated rather than left to fail: **OQ-005 v0.6** and **URS-005 v0.4**.

- OQ-SRDY-08 now also requires both boards' APIs to answer 403 `LAUNCH_SCOPE`.
- OQ-SRDY-06: both scans are refused, and neither is answered as clean.
- OQ-SRDY-06b: the positive half is a deviation that says it is locked.
- OQ-SRDY-05b reads the returned execution, not the locked history.

`ci:validation-traceability` passes. **Protocol v0.6 has not been executed.**
The executed records in VSR-001 are unchanged, and the next OQ execution runs
v0.6.

## Stage 2a — every launch call attributed

The 52 paths launch and shell screens call that no surface claimed are now
attributed. Per-surface ones go into `apiPrefixes`: dossier map, program
journey, review boards and queues, IRB and CSR, the submission orchestrator,
the artifacts center, the audit ledger, the validation kit, tenant users,
tasks, data origins and collaborative locks. Those the shell uses whatever
app is open go on `LAUNCH_PLATFORM_API`
(`server/services/entitlements/launch-scope-api.ts`), each with a reason:
AnA, the session, tenants, clients, organisations. `ci:launch-scope-api` now
fails on an unmapped launch call too. Red on the stage-1 registry
(`gate2a-red-unmapped.txt`, 52), green after (`gate2a-green.txt`: 264 paths,
226 launch, 38 never-gated, 0 unmapped). The self-test gains the unmapped
case.

One consequence stated plainly: the conversation thread and project home call
`/api/concept2cure/projects/:id/...`, and prefixes cannot express `:id`. So the
legacy projects and artifacts subtree is launch-reachable and stays open. Only
the rest of `/api/concept2cure` can be closed, in stage 2b.

## Stage 2b — the unclaimed remainder: measured, then refused

After 2a no launch call is unmapped, but most mounted prefixes are still
claimed by nothing: the legacy `/api/concept2cure` outside the projects
subtree, `/api/qms`, and among others `/api/demo` and `/api/integration-test`.
Static analysis cannot see a computed path or a server-to-server caller, so
the gate does not guess:

- An unmapped `/api/*` path is recorded as a would-refuse in the existing
  enforcement report (Master Admin → Licensing → Enforcement): module
  `launch-scope:unattributed`, ids collapsed to `:id`, requests with no
  organisation recorded against organisation 0. The request is served.
- `LAUNCH_SCOPE_API_UNATTRIBUTED=enforce` refuses it 403 `LAUNCH_SCOPE`.
  Unset means `report`. Any other value refuses to boot in production.
  Documented in `.env.example`.
- `LAUNCH_INFRASTRUCTURE_API` lists the non-screen callers that are never
  refused in any mode, each with its caller: the public API (`/api/v1`),
  Firecrawl's webhook, operator tooling. Non-`/api` paths (the app's pages and
  assets) are never judged.

Red then green: 5 failed / 31 passed of 36, then 36/36 (`stage2b-*`).

**The operator decision this leaves:** run staging with the default, read the
report, add any genuine infrastructure caller to the list with its reason,
then set `enforce`. Until then the legacy namespaces stay callable, and every
call to them is on record.

## Not closed here

- **Unmapped paths are reported, not refused, until an operator sets
  `enforce`** (stage 2b above). The legacy `/api/concept2cure/*` namespace
  and the UI-less `/api/qms` are among them. Closing them means attributing
  each mounted prefix: to a surface, to infrastructure, or to out-of-scope.
  That inventory is the next step. Refusing everything unattributed without it
  would refuse sign-in callbacks, webhooks and the public API along with the
  product.
- **AnA tools** reach services directly, not over HTTP, so this gate does not
  see them. Whether an AnA tool can drive an out-of-scope capability is a
  separate check.
