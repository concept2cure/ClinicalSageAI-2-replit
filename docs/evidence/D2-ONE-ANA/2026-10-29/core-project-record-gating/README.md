# The project record under module enforcement, a stale IND claim, and Engineering's risk and design-control reads

Launch row D2, workstream "one AnA, one project". Date 2026-10-29. Working tree over `6184439b3`. This settles the two
"For a decision" items in `../ivd-board-under-diagnostics/README.md` (`a86ed04ed`) and adds item 3, the same mirror case
for Engineering after `79d00b348`.

**Status: done.** No grant changed, no gate rule changed, and no claim was moved. The prefix map gains claimants on four
rows and loses one uncalled prefix. One defect found on the way is left for a decision ("Left as found"). `ci:launch-scope-api`
is red at HEAD because of `7b209818a`, not this slice (see "Trunk red at HEAD").

| Item | Verdict | Change |
|---|---|---|
| 1. `/api/c2c/projects` claimed only by submission-center and ivd-completeness | **Real**, measured | `projects` also claims it |
| 2. `ind-checklist` claims `/api/ind-lifecycle/briefing-book`, which none of its screens calls | **Real**: the claim is stale, not the test | Claim dropped; two tests updated |
| 3. device-engineering reads `/api/mdx/risk-items` and `/api/design-controls`, claimed only by risk and design-controls | **Real**, measured | device-engineering also claims both |

## What already exists

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| Prefix map | `server/services/entitlements/api-prefix-map.ts:44` `buildPrefixMap` | Maps each `/api` prefix to the set of every surface that declares it. Prefixes on NEVER_GATED are left out. | — |
| Path attribution | `api-prefix-map.ts:68` `modulesForPath` | The longest prefix that matches at a segment boundary wins. Its whole set is the claimants. | — |
| The gate | `server/middleware/moduleEntitlementGate.ts:186-263` | Launch scope first. Then, under `report` or `enforce`, it serves a path when the organization holds any claimant (`canAccessModule`, `:203`), else 403 `MODULE_NOT_LICENSED` (`:258`). A path no surface claims is not module-gated. | — |
| Entitlement | `server/services/license-manager.ts:390` `canAccessModule` | An enabled grant allows (`:411`). An administrator's switch-off denies (`:444`). Otherwise the module's tier decides. A module with no catalog row is denied, "does not exist" (`:426`). | It does not treat a claimant with no catalog row as available. Navigation does (`navigation-entitlements.ts:32`, "NOT LICENSABLE … unconditionally available"). See "Left as found". |
| Tiers | `db/migrations/20260823_module_catalog_commercial_packaging.sql:154`, `:216`, `:236`, `:252`, `:255` | `projects` is `free`. `submission-center`, `ivd-completeness`, `device-engineering` and `risk` are `standard`. `design-controls` is `standard` (`20260823_module_catalog_mdx_registers.sql`). | — |
| Launch grants | `shared/constants/launch-scope.ts:249` `LAUNCH_MODULE_IDS`; `server/services/entitlements/launch-scope.ts:130` `provisionLaunchModules` | Every new organization gets 13 grants: projects, tasks, vault, artifacts-center, document-authoring, review, protocol-dev, submission-center, ectd-compile, gateway-transmittals, dispatch-readiness, quality, insights. Self-serve signup is `tier: 'free'` (`server/routes/auth.ts:1028`, `:1111`). | An org whose provisioning failed keeps only its tier. |
| The admin switch | `server/routes/module-subscriptions.ts:216` `PUT /:moduleId/toggle` | An org administrator turns a module off for the organization, with a reason. The revocation outranks tier and grants. | — |
| NEVER_GATED | `api-prefix-map.ts:23`, 12 prefixes | Paths the gate never judges. The header limits it to how a customer learns it is locked, how it unlocks, and compliance controls. | The "48 never-gated" that `ci:launch-scope-api` prints is the 48 screen paths that fall under these 12 prefixes. It is not a second list. `/api/c2c/projects` is not on it. |
| Platform list | `server/services/entitlements/launch-scope-api.ts:61` `LAUNCH_PLATFORM_API`, 12 prefixes | Paths the shell uses whatever app is open: the organization, tenant, user, AnA and gateway accounts. None is claimed by a surface, so the module gate never judges them. | `/api/c2c/projects` is not on it. |
| Shared claims | the registry; 52 of 284 prefixes at HEAD | `/api/projects` is claimed by projects and project-home (the gate header's own example). `/api/ivd-completeness` is claimed by device-diagnostics and ivd-completeness (`a86ed04ed`). | — |
| The project record routers | `server/bootstrap/register-inline-routes.ts:845`; `server/routes/c2c/projects.ts`, `document-data-dispositions.ts` | 21 routes on 18 paths: the list, create, `/:id`, dossier, drafts, team, evidence, activity, records, adopt, conversation files, sources, source changes, markets, archive, unarchive, delete, and document dispositions. Every one is the program's own record. | — |
| The pattern this follows | `server/middleware/__tests__/ivd-board-under-diagnostics.test.ts` (`a86ed04ed`) | The real registry, the calls the walk reads, the gate production builds, enforcement on, and organizations by holding. | — |

Searches run: `c2c/projects` across `client/src`, `server` and `shared`; `NEVER_GATED`, `LAUNCH_PLATFORM_API`,
`canAccessModule`, `provisionLaunchModules`, `ignoreRevocation`, `does not exist` and `NOT LICENSABLE` across `server` and
`shared`; the catalog migrations for `projects`, `project-home`, `conversation-thread`, `submission-center` and
`ivd-completeness`; `ind-lifecycle/briefing-book` and `briefing-book'` across `client`, `server` (AnA included), `shared`
and `scripts`; `risk-items` and `design-controls` in the registry and the two panels. The whole prefix map was dumped
before and after (`green/prefix-map-diff-*.txt`).

## Item 1: the project record — real

**The run.** `server/middleware/__tests__/core-project-record-gating.test.ts` uses the real registry, the gate production
builds (launch scope on, unattributed enforced, `MODULE_ENFORCEMENT=enforce`), and the real `canAccessModule`. Only the
database is stood in for, and each module's tier is read from the packaging migration. The requests are every
`/api/c2c/projects` path a launch or shell screen names, according to the `ci:launch-scope-api` walk. That covers Project
home's `/:p`, dossier, team, activity, records, sources, source changes, conversation files, adopt and document
dispositions, and the Projects list from the projects surface and the shell. The requests also include every route the
two routers mount. That makes 18 paths.

| Organization | At HEAD | After |
|---|---|---|
| 301: free tier, no grant row. It holds Projects, Vault and Tasks by tier alone, as when launch provisioning failed. | **403 `MODULE_NOT_LICENSED` on all 18** | served, 18/18 |
| 302: self-serve (free tier and the launch grants), with Submission Center switched off by an administrator | **403 on all 18** | served, 18/18 |
| 303: standard tier with the launch grants | served (via Submission Center) | served |
| 305: free tier, Submission Center granted, Projects switched off | served (via Submission Center) | served |
| 304: free tier, Projects and Submission Center both switched off | 403 on all 18 | 403 on all 18 (fails closed: it holds no claimant) |

The gate's own reason for 301 (`red/gate-at-head.txt`): `submission-center: Module 'submission-center' requires standard
tier or higher (current: free)`, and the same for ivd-completeness. So under enforcement a Projects customer without
Submission Center gets no project list, cannot create a project, and gets no Project home. The other screens that read
`/:p` and `/:p/sources` lose them too (Vault, the editor, Review, Quality, CMC, the shell).

**The choice, by precedent.** Three ways exist in the repo to make a path reachable:
- **A shared claim.** `/api/projects`, the other project record, is claimed by projects and project-home. `a86ed04ed` used
  the same option for the IVD panel. This was chosen.
- **NEVER_GATED.** Its header limits it to locked-state discovery, unlocking and compliance controls, "so the list cannot
  grow by convenience". The project record is none of those. Mutation F1-M4 shows the difference: on NEVER_GATED, the
  organization holding no claimant (304) is served too.
- **Unclaimed, on `LAUNCH_PLATFORM_API`.** That needs submission-center's and ivd-completeness's claims removed. The
  ivd-completeness array is pinned as founder decision 4 (`ivd-board-under-diagnostics.test.ts`). It is also not this
  slice's file.

`projects` and not `project-home`: project-home has no catalog row. A claim by it admits no one (mutation F1-M2, where the
gate logs "Module 'project-home' does not exist"). `projects` is the Projects app's module, `free` tier, and granted to
every new organization.

`projects` claims the whole prefix. Every route under it is the program's own record. A narrower claim cannot be written
anyway: the matcher has no parameters, so a claim on `/:id/…` is not possible. One route widens beyond Project home's reads,
and the reader should know it. `POST /:id/markets` (`projects.ts:2035`, governed, with a reason) adds a market to the
project. It writes that market's Module 1 and 3.2.R outline and its anchored submission. Only Submission Center's screen
calls it. A Projects holder can now call it, just as it can create the project itself (`POST /`). Before this change, such
an organization reached nothing under the prefix.

**Both directions.** `green/prefix-map-diff-finding1.txt` diffs the whole map: 284 prefixes before and after, and one row
changes. `/api/c2c/projects` gains `projects` and loses nothing. Admission is "any claimant" and no prefix was added, so the
longest-prefix attribution of every other path is unchanged. Organization 305 holds only an earlier claimant and is still
served. Mutation F1-M3 moves the claim instead of sharing it, and 305 goes red.

## Item 2: the briefing-book claim — the claim is stale, not the test

What calls `/api/ind-lifecycle/briefing-book`:
- **No screen of `ind-checklist`.** Since `5894e1aaa`, the briefing book is the project's meeting-package document in the
  editor. `IndLifecycle.tsx:1638` renders `IndBriefingBookStart`, and
  `indLifecycleDeliverables.test.tsx:109` asserts the screen makes no such call.
- **AnA: nothing over HTTP.** `AnaToolExecutor.ts:1595`, `:1648` and `ana-ri/artifact-generator.ts:367` use the
  `briefing-book` document type in-process. `fixtures/ind-lifecycle-data.ts:129` holds the route as text. It is not a call.
- **One caller is left: `AgencyMeetings.tsx:285`, `POST …/briefing-book/pdf`.** Its surface, `agency-meetings`, is outside
  the release, and no launch screen's graph reaches it (`ci:launch-scope-api --list` has no briefing-book path).

So `ind-checklist`'s claim admitted an out-of-scope screen's call into launch scope, which P-32 forbids ("claims only the
paths its screens call"). The claim was dropped, with a dated note. Both routes are now unclaimed: refused 403
`LAUNCH_SCOPE` in production and not module-gated anywhere. No launch screen loses anything. The agency-meetings screen is
already hidden in production, and is served as before where launch scope is off.

Two tests named the old state as "called", so both were stale too:
- `launch-scope-api-gate.test.ts`: `/briefing-book/pdf` moves from `CALLED` to `UNCLAIMED`, with `/briefing-book` beside it.
- `ind-launch-claim.test.ts`: both paths leave `CALLED` (whose note "wired['briefing-book']" was no longer true). They join
  the "not in launch scope" list, dated.

## Item 3: Engineering's risk register and design-control trace — real

Since `79d00b348`, device-engineering mounts `RiskRegister.tsx` and `DesignControlsTrace.tsx`
(`EngineeringSurface.tsx:37-38` imports them, and the screen calls `useRiskRegister` and `useDesignControlsTrace`). Their reads and writes are `/api/mdx/risk-items` (GET and POST, PATCH `/:id`,
POST `/:id/controls`) and `/api/design-controls` (GET and POST). Only `risk` and `design-controls` claimed them.

`server/middleware/__tests__/engineering-risk-design-controls-gate.test.ts` follows `a86ed04ed`'s method: the real registry,
the walk's calls from the two panel files, the gate production builds, enforcement on, and `canAccessModule` answered by
holding.

| Organization | Before | After |
|---|---|---|
| 401: device-engineering only | **403 `MODULE_NOT_LICENSED` on all 4** | served, 4/4 |
| 402: risk only | risk-items served | served, as before |
| 403: design-controls only | design-controls served | served, as before |
| 404: none of the three | 403 | 403 |

device-engineering now also claims both prefixes, with a dated note. risk and design-controls keep their claims until the
fold (founder decision 4), and the test pins them. `green/prefix-map-diff-item3.txt`: 283 prefixes before and after, and
exactly two rows change, each gaining `device-engineering` and losing nothing.

## Red, green, mutations

Each run is one file under `timeout 240`, trimmed to the verdict lines.

| File | What it shows |
|---|---|
| `red/gate-at-head.txt` | Item 1 with HEAD's registry. Organizations 301 and 302 are refused all 18 paths, with the gate's tier reason. (Run before organization 305 was added; F1-M1 reruns all seven cases.) |
| `red/launch-scope-api-gate-at-head.txt` | Item 2 at `a86ed04ed`: 42/43, failing on the briefing-book claim. |
| `red/ind-claim-at-head-6184439b3.txt` | Item 2 at HEAD `6184439b3`: 40/43. One failure is the briefing-book claim; two are `/api/csr/jobs` (below). ind-launch-claim 65/65. |
| `red/item3-gate-before.txt` | Item 3 before the claim: organization 401 is refused all 4. |
| `red/ci-launch-scope-api-at-head.txt` | `ci:launch-scope-api` on HEAD's registry: red on `/api/csr/jobs`. |
| `green/gate-finding1.txt` | Item 1: 7/7. |
| `green/ind-claim.txt` | Item 2: launch-scope-api-gate 41/43, both failures `/api/csr/jobs`. ind-launch-claim 63/63. |
| `green/launch-scope-api-gate-csr-probe.txt` | A probe, not a fix: `/api/csr/jobs` claimed by ectd-compile for one run gives 43/43, so `/api/csr/jobs` is the only red left. The registry was restored after it. |
| `green/item3-gate.txt` | Item 3: 6/6. |
| `green/prefix-map-diff-finding1.txt`, `green/prefix-map-diff-item3.txt`, `green/prefix-map-diff-whole-slice.txt` | The whole map before and after each change, and HEAD against the final tree. |
| `mutation/F1-M1-no-new-claim.txt` | The projects claim removed: 301 and 302 red again on all 18, and the claim pin is red. |
| `mutation/F1-M2-claimed-by-project-home.txt` | The claim put on project-home instead: still red, "Module 'project-home' does not exist". |
| `mutation/F1-M3-claim-moved-off-submission-center.txt` | The claim moved rather than shared: 305 goes red, and so does the pin. |
| `mutation/F1-M4-never-gated-instead.txt` | `/api/c2c/projects` on NEVER_GATED: 304 (which holds no claimant) is served, so the case goes red. |
| `mutation/F2-M1-claim-restored-*.txt` | The briefing-book claim restored. The gate test is red on "claims no IND prefix the IND screen does not call" and on the unclaimed routes being served. ind-launch-claim is red with "served under /api/ind-lifecycle with no screen caller: POST …/briefing-book, …/pdf". |
| `mutation/I3-M1-no-new-claim.txt` | device-engineering's claims removed: 401 red on all 4. |
| `mutation/I3-M2-risk-claim-moved.txt` | risk's own claim dropped (the fold without decision 4): the risk-only organization goes red, and so does the pin. |

Each mutation was applied to a copy, run, and restored from that copy, checked with `cmp` (byte-for-byte).

Kept green (`green/keep-green.txt`): the three gate tests above, ivd-board-under-diagnostics, launch-scope-device-features,
moduleEntitlementGate, moduleEntitlementMasterAdmin, all 18 suites in `server/services/entitlements/__tests__` (including
launch-reproof-narrowing 204/204 and ind-launch-claim 63/63), and both registry suites. `ci:launch-scope` and its selftest
pass, and so does the `ci:launch-scope-api` selftest. `launch-scope-api-gate` is 41/43 and `ci:launch-scope-api` is red,
both only on `/api/csr/jobs`. eslint (`green/eslint.txt`): 0 errors, and the same 3 warnings as HEAD on the changed files.
Typecheck: `green/typecheck.txt`.

## Trunk red at HEAD, not this slice

`7b209818a` ("CSR slice 3", merged from origin) added `CsrBuildProgress.tsx`. It is in the ectd-compile graph and POSTs
`/api/csr/jobs`, which only the out-of-scope `csr` surface claims (`ui-surface-registry.ts`, `apiPrefixes: ['/api/csr',
'/api/csr-builder']`). `ci:launch-scope-api` fails on it at HEAD with this slice's edits set aside
(`red/ci-launch-scope-api-at-head.txt`), and so do two `launch-scope-api-gate` cases. It was not fixed here. Whether a launch
surface claims `/api/csr/jobs` is that workstream's launch-scope decision (RULE 2).

## Left as found, for a decision

- **A claimant with no catalog row admits no one, and some launch paths have only such claimants.** The gate asks
  `canAccessModule` for each claimant. For a surface with no `available_modules` row it answers "does not exist" and
  denies. Navigation says the opposite: such a destination is "unconditionally available". 38 of the 283 gated prefixes
  have only claimants with no row, and 13 of those are launch or shell paths
  (`left-as-found/no-catalog-row-claimants.txt`): `/api/chat` (conversation-thread), `/api/concept2cure/projects`
  (project-home, conversation-thread), `/api/setup`, `/api/onboarding`, `/api/tenant-users`, `/api/tenant-config`,
  `/api/mdx/admin`, `/api/api-keys`, `/api/audit-trail/ledger`, `/api/module-access-requests`, `/api/validation-kit`,
  `/api/vault/legal-holds/retention`, `/api/tenant-export/attestation`. Under `MODULE_ENFORCEMENT=enforce`, each is refused
  to every organization that is not a master admin, including one that holds everything. On Project home this is AnA's
  thread list (`GET /api/chat/threads`) and the unified work view (`GET /api/concept2cure/projects/:id/unified-work`)
  (`left-as-found/project-home-calls.txt`). `/api/module-access-requests`, "how a member asks for a locked app", is the
  kind of trap NEVER_GATED exists to prevent. This is a gate rule, not a claim, and it is outside this slice's files.
  The fix is one of two. (a) The gate admits a claimant with no catalog row, as navigation does. That also opens every
  shared prefix where such a claimant sits beside a licensed one (`/api/projects`, `/api/document-authoring`, and others),
  so it is a packaging decision. (b) Each of the 13 is claimed by a licensed launch module, or placed on
  NEVER_GATED or the platform list, one decision per path. `report` mode measures the cost of either before enforcement.
- **An organization that switched Projects off and holds neither Submission Center nor IVD completeness** (304) is still
  refused the record that Vault, the editor and the shell read. That is the claim rule working as written. Making the record
  readable whatever the packaging is the platform-list option above, and it needs founder decision 4 for the
  ivd-completeness claim.

## What changed

- `shared/constants/ui-surface-registry.ts`:
  - `projects` claims `/api/c2c/projects`, with a dated note.
  - `ind-checklist` no longer claims `/api/ind-lifecycle/briefing-book`, with a dated note.
- `shared/constants/ui-surface-registry.ui-v2.ts`: `device-engineering` claims `/api/mdx/risk-items` and
  `/api/design-controls`, with a dated note.
- `server/middleware/__tests__/core-project-record-gating.test.ts` (new): item 1.
- `server/middleware/__tests__/engineering-risk-design-controls-gate.test.ts` (new): item 3.
- `server/middleware/__tests__/launch-scope-api-gate.test.ts`: the briefing-book paths are unclaimed, not called.
- `server/services/entitlements/__tests__/ind-launch-claim.test.ts`: the same.
