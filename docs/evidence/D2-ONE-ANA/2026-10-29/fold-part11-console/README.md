# Fold `part11-console` into Audit trail (D2, 2026-10-29)

**Launch row:** D2 ("one AnA"; `docs/LAUNCH_DEFINITION_OF_DONE.md`).

**Founder direction, 2026-10-29:** "We are moving most 'app' into core functionality and away from any out of process 'app'."

**Plan:**
- the placement map: `.design/client-journey/FUNCTION_PARITY.md`, "Into the audit trail (`audit-trail`) / From `part11-console`";
- the common fold checklist: `docs/design/DEVICE_FOLDS_2026-10-29.md` (from `2168fd56`; it applies to any fold);
- the deletion rule: `CLAUDE.md`'s working agreement.

**The work, named for what it is:**
- **reach** the Part 11 console's two functions inside the existing Audit trail surface:
  - the `audit_events` chain's live verdict in the chain banner;
  - AnA reading it in Audit trail's facts;
- then **fold** the console: delete the screen, alias its id to `audit-trail`, and take it off every list.

No route was added or changed. The verdict is read from the route the console read.

## What already exists

Searched by every name the capability could have:
- names: `Part11Console`, `part11-console`, `part11`, `/api/part11`, `chain-integrity`, `chainIntegrity`, `audit_events`, `audit-event chain`, `audit-trail`, `AuditTrail`, `hashChain`, `ledgerChain`;
- across: `client/src`, `shared`, `server`, `scripts/ci`, `scripts/visual-qa`, `tests`, `db/migrations`, `migrations`, `docs`, `.design`.

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| Part 11 console (deleted here) | `client/src/concept2cure/v2/surfaces/Part11Console.tsx` | Read two verdicts: the ledger's `meta.chain` (`audit_logs`, :132) and `GET /api/part11/audit-trail/chain-integrity` (`audit_events`, :133). Rendered each with loading, forbidden, error and empty states (:207-245). Published both to AnA as `part11-console` (:153-203). | It was a separate "app" screen. Its chip showed `chainStatus` and its line showed `integrityValid` separately, so `intact` could sit beside "Not verified" (:237-238). An error offered no retry. |
| Audit trail (the target) | `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx` `AuditTrail` | The hash-chained ledger: filters, search, entry drawer, chain view and signed export. Its chain banner states the `audit_logs` verdict from `meta.chain` (`readChainVerdict`, `chainSummary`). AnA context `audit-trail`, `facts.hashChain`. | It did not read the `audit_events` chain, which the ledger's verdict does not cover (`store: 'audit_logs'`, `server/routes/audit-trail-ledger.routes.ts:504-532`). |
| The verifier route | `server/routes/part11-compliance.ts:811-990`, mounted at `/api/part11` behind `authenticateToken` (`server/bootstrap/register-advanced-platform-routes.ts:181-182`) | Re-computes the organisation's `audit_events` chain, with the org taken from the JWT. Returns `chainStatus` (`empty`, `intact`, `broken`, `unverifiable`) and `integrityValid` (`true`, `false`, `null`). Also returns counts, `lastHash` and `verifiedAt`. | Unchanged. It does not take the audit-reader role the ledger takes (`requireAuditReader`, `audit-trail-ledger.routes.ts:680-681`). |
| Route honesty tests | `server/routes/__tests__/part11ChainIntegrityRoute.test.ts`, `part11-chain-empty-honesty.test.ts`, `part11-chain-unhashed-honesty.test.ts` | Pin the route's tenant scope, the empty verdict `null` and `unverifiable`. | Kept. The first now names the new client guard (`isAuditEventChainIntegrity`) as the shape it pins. |
| Sealed export's event-chain line | `client/src/concept2cure/v2/surfaces/complianceReportData.ts:203-219` `storeLines`, from `server/services/audit/signedAuditExport.ts` `snapshotChainIntegrity` | The signed export and compliance reports state an "Event chain" verdict at generation, sealed in the manifest. | It is not a live verdict, so it does not replace the live read. |
| Decision lineage chain | `client/src/concept2cure/v2/surfaces/DecisionLineage.tsx:302,581` | A different chain. | Not `audit_events`. Out of scope. |
| Registry claim | `shared/constants/ui-surface-registry.ts:1037` | `audit-trail` already claimed `/api/part11`. | **No claim had to move.** `review` (:328) claims it too, which is why `ci:launch-scope-api` cannot see a lost audit-trail claim; see mutation P6. |
| Catalogue | `db/migrations/20260810_reconcile_module_catalog.sql`, `20260823_module_catalog_commercial_packaging.sql` | The console was never seeded (21 CFR §11.10(e): not licensable). It was on 20260810's step-1 keep-list. | 20260823 has no part11-console row, only a comment that stays true. |
| The tour | `shared/navigation/demo-scripts.ts` (training-submission-day) | A part11-console stop just before the audit-trail stop. | Its line named "the signer mode in force, the signature manifestations", which the console had stopped showing on 2026-10-17. |
| The visual-QA fixture | `scripts/visual-qa/api-fixtures.mjs:63` | A fixture for the chain-integrity route. | Kept: Audit trail calls the route now. |

### Deletion history search (Rule 3 step 2; the working agreement)

- The clone is shallow: 1,263 commits back to `892739bb7` (2026-10-22).
- `git log --all --diff-filter=D --name-only`, filtered for `part11 | part-11 | audit.?trail | audit.?event | chain.?integrity | hash.?chain | compliance.?console`: **no deleted paths**.
- The full history of `Part11Console.tsx` from the GitHub API (`gh api repos/concept2cure/ClinicalSageAI-2-replit/commits?path=…`):
  - created in `5d1033440` (2026-07-21, "part11: compliance console + fix shadowed chain-integrity route");
  - last changed in `41c02467a` (2026-10-17).
- This is the capability's first fold. No predecessor was deleted and rebuilt.

## Parity

| Function | From | Goes to | Status |
|---|---|---|---|
| The live verdict for the second chain (`audit_events`) | `Part11Console.tsx:133,229-243` | `AuditEventChainBanner` in `client/src/concept2cure/v2/surfaces/AuditEventChain.tsx`: the second verdict in Audit trail's chain banner, read from `GET /api/part11/audit-trail/chain-integrity`. It renders beneath the ledger's verdict, and on its own read when no ledger rows are on screen (loading, refused, failed or empty). | **Reached** |
| AnA reads both chain verdicts | `Part11Console.tsx:153-203` | Audit trail's facts, in every state of the ledger read. `facts.auditEventChain` is `{ verdict, status, integrityValid, totalEntries, verifiedEntries, unhashedEntries, brokenLinks, algorithm, verifiedAt }` or `null`, and `facts.auditEventChainUnavailable` says why it is null. The summary carries one sentence. The ledger's `facts.hashChain` is unchanged, so the two are never merged. | **Reached** |
| The ledger chain verdict (the console's first block) | `Part11Console.tsx:132,212-226` | Already in Audit trail's banner and `facts.hashChain`. | Already present |

**Carried:** the console's honesty rules, each restated as a test against Audit trail in `auditTrailEventChainVerdict.test.tsx`:
- an empty chain is "nothing to verify", even when the route says `integrityValid: true` (finding 111);
- `unverifiable` reads "not verifiable", never as the raw key;
- a 403 reads as no access, not as a failed verification;
- a failed read, a 200 with no payload and a body that is not a verdict (`[]`, or a non-numeric count) each read "Couldn't verify", never as an empty chain;
- the chain type is printed in words, with no §11.10 or SOC 2 table.

**Tightened:**
- "intact" needs both the status and `integrityValid: true`;
- a failed verification offers Try again, through the product's `ErrorState` (UI standards §8).

## The deletion rule: replacement, proof and history

- **What was deleted:**
  - `client/src/concept2cure/v2/surfaces/Part11Console.tsx`;
  - `client/src/concept2cure/v2/__tests__/part11Console.test.tsx` and `part11ConsoleHonesty.test.tsx`. Their cases were ported first; see above.
- **The reachable replacement, by path:**
  - `client/src/concept2cure/v2/surfaces/AuditEventChain.tsx`, mounted by `AuditTrail` in `client/src/concept2cure/v2/surfaces/AdminSurfaces.tsx`;
  - the id `part11-console` is an alias of `audit-trail` in `client/src/concept2cure/v2/registryModel.ts` `DEEP_LINK_ALIASES`.
- **The proof that it is reachable:**
  - `client/src/concept2cure/v2/__tests__/foldPart11Console.test.ts`. It covers a link, an in-app move and AnA's kept target, with and without a project open. It checks that Audit trail reads the route under its own registry claim, and that the old screen, its registry entry, its scope entries, its rail entries and its tour stop are gone.
  - `client/src/concept2cure/v2/__tests__/auditTrailEventChainVerdict.test.tsx`: the function itself.
- **History:** see "Deletion history search" above.

## Checklist (`DEVICE_FOLDS_2026-10-29.md`, "The common checklist")

| Step | Done |
|---|---|
| 1. Delete the source component and its tests | Done. `surfaceViews.ts` was the only importer. |
| 2. `MdxSurfaceHost.tsx` | Not applicable: a v2 surface, not host-mounted. |
| 3. The id leaves `surfaceViews.ts` and `ui-surface-registry.ts`; `apiPrefixes` move | Done. `ui-surface-registry.ui-v2.ts` had no entry. No prefix had to move, because `audit-trail` already claims `/api/part11`. |
| 4. `registryModel.ts`: the alias, and off the lists | Done. Alias `'part11-console': 'audit-trail'`. Removed from both `SEGMENT_MODULES` "Review & govern" groups. It was in no `NAV_GROUP_OF`, `NAV_HIDDEN`, `SEGMENTS.focus` or `SURFACE_ACTIONS` entry. |
| 5. `launch-scope.ts` (+ `mdx-project-features.ts`) with a guard | Done. Removed from `LAUNCH_SHELL_SURFACES`; it was not in `mdx-project-features.ts`. Guard: `launch-scope.test.ts` "the folded Part 11 console". |
| 6. Catalogue (Rule 1) | **20260810** is amended in place with a dated header: off step 1's keep-list only, since it was never upserted. A row added by any other path is now deprecated on replay, and its subscriptions are kept, with no DELETE. Before this change such a row stayed live and failed 20260823's tier guard (red). **20260823** is unchanged: it has no part11-console row. Fresh and replay cases are in `catalog-module-claims.contract.test.ts` "Retired Part 11 console". |
| 7. The AnA target stays and resolves through the alias | Done. `shared/navigation/index.ts`: the `part11-console` target is kept, with its description corrected to say what the screen it lands on shows. The console had no surface actions. |
| 8. Retarget the tour | Done. The two stops are merged into the one audit-trail stop, which says what the screen shows: both chains verified on the server. |
| 9. CI | `ID_BASELINE` 110 → 109. `check-surface-discoverability.mjs` drops the entry and its audit-trail reason. `REAL.components`, `dump-v2-surfaces.spec.tsx` and `NO_PROJECT_DOOR` had no part11-console entry. Also changed: `tests/e2e/launch-catalog.ts` (access-qualification list), `tests/ci/launch-qualification-catalog.test.ts`, `capabilityBrowser.test.tsx` (⌘K now has no part11-console entry) and `moduleCatalogReconciliation.test.ts` (`FOLDED_NEVER_LICENSABLE`). |
| 10. A fold guard | `foldPart11Console.test.ts`: red first (3/4), then green (4/4), then mutations. |
| 11. Gates | All green; see below. |

Comments that named Part11Console as the route's live caller now name Audit trail:
- `server/routes/part11-compliance.ts`;
- `server/routes/__tests__/part11ChainIntegrityRoute.test.ts`;
- `client/src/concept2cure/v2/navEntitlements.tsx`;
- `server/services/entitlements/navigation-entitlements.ts`.

`FUNCTION_PARITY.md` has both items ticked, with their homes.

## Red, green, mutations

- **`red.txt`:**
  - Part 1: the verdict suite against Audit trail before the fold, **17/17 failed**, each for the missing second verdict.
  - Part 2: the fold guard **3/4 failed** before the retirement. The landing case passes because Part 1 is in.
  - Part 2: the catalogue contract **1/2 new cases failed**. The fresh-replay case passes before and after, and pins that the console is never seeded.
- **`green.txt`:**
  - final, on trunk `46db6c762` + this change: **21 suites, 264/264**;
  - before the second freeze: the 105-suite regression set (every suite touching the registry, views, aliases, rails, navigation targets, launch scope, tours, the audit trail or part11), **2,431/2,431**;
  - Part 1: 22 neighbouring suites, **203/203**.
- **`mutations.txt`:** **20/20 killed**.
  - Part 1, 12/12: verdict, guard, empty, error, retry, AnA in each ledger state, the never-merged facts, both banner placements.
  - Part 2, 8/8: alias, rail, scope list, keep-list, tour stop, registry claim, `ID_BASELINE`, qualification list.
  - Every mutation was reversed by replacement and checked with `md5sum -c`.

## Gates

`gates.txt`, run on `18ecfe003` + this change; `ci:ana-surface-context` was re-run on `46db6c762`.

All green:
- ci:launch-scope and its selftest;
- ci:launch-scope-api (545 paths, none refused) and its selftest;
- ci:ana-surface-context (109 exact);
- ci:surface-discoverability;
- ci:migration-drop-safety and its selftest;
- ci:migration-set-order;
- ci:migration-deploy-path;
- check:catalog-copy;
- ci:program-ownership-single-source;
- ci:sql-interpolation;
- ci:undefined-css-classes;
- ci:unreferenced-modules.

Type-check and lint:
- scoped `tsc` over the 20 changed TS files: 0 errors;
- ESLint ratchet `--since HEAD`: no file of this fold gained a warning, net −4 (the deleted console files); `eslint.txt`.

## Not carried, and found

- **Access.** A member whom the ledger refuses (403) still sees the `audit_events` verdict, because the verifier route admits any authenticated member of the tenant. That was already the console's behaviour. Whether the route should take `requireAuditReader`, as the ledger does, is a server decision; this fold does not change it.
- **`ci:launch-scope-api` cannot see a lost claim** on a prefix that another launch surface also claims (P6). The fold guard pins audit-trail's own claim.
- **Docs left as history:** design and audit documents that mention the console were not rewritten:
  - `.design/client-journey/INFORMATION_ARCHITECTURE.md`;
  - `docs/design/ONE_ANA_ONE_CANVAS.md`;
  - `docs/SURFACE_DECISIONS_2026-10-08.md`;
  - `docs/security/SECURITY_AUDIT_2026-09-24.md` DP-21.
