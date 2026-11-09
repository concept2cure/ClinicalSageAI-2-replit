# One-platform navigation entitlement contract — F1 repair

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `d6bf36c16a1e6a44c4eb212d0f042b0cdb6871bf`  
Plan: F1; completes the existing `client/src/concept2cure/v2/navEntitlements.tsx`.

## Direction and boundary

The founder requires one platform whose existing project, document, filing,
regional and industry behavior adjusts to the recorded project and client
license. This repair belongs in the shared navigation provider, not another
CSR, device, regional or CRO application. It changes no entitlement policy,
price, tier, release scope, project setting, supported regulatory pathway,
model approval, tenant authorization, screen, service, table or API mount.
It does not assert that all project settings and regulatory pathways are
already correctly connected or qualified.

## What already exists

| Existing owner | Responsibility retained |
|---|---|
| `client/src/concept2cure/v2/navEntitlements.tsx` | One response shared by the shell, lock explanations and work-area navigation |
| `client/src/concept2cure/v2/surfaceAvailable.ts` | Applies the existing release-visibility rule without becoming an authorization gate |
| `client/src/concept2cure/v2/surfaces/ProjectCoreWork.tsx` | Selects existing work-area doors from recorded project track and availability |
| `server/services/entitlements/navigation-entitlements.ts` | Resolves organization catalog, subscribed/included/disabled, tier, industry and release verdicts |
| `server/services/licensing/entitlements-service.ts` | Existing license summary, quotas and recommendations; no new commercial policy here |
| `client/src/concept2cure/v2/dataConnect.tsx` | Existing request convention, runtime payload guard and honest unresolved reads |
| `client/src/concept2cure/v2/__tests__/rbmNavigation.test.tsx` | Existing browser-shaped coverage for one central work area across biotech, medtech and CRO client views |

The current roadmap/ledger and root rules were read. No changes were made to
them. Existing owners and their tests were searched before coding. The local
workspace cannot fetch the complete Git repository because GitHub DNS is
unavailable; the inspected baseline file was retrieved by the GitHub connector
and verified byte-for-byte against its Git blob before the before/after run.
This is not a claim that full deleted-history or complete dependency analysis
was executed.

## Confirmed defect

The client response guard checked only `resolved` and whether `surfaces` was
an array. It accepted rows with missing/nonboolean availability, unknown lock
reasons, duplicate IDs, invalid contract headers and contradictory results.
The provider inserted rows into a Map without rejecting duplicates, so the
last duplicate could decide what the shell said about the client's license.
An unknown lock source reached the default subscription/upgrade explanation.

The provider also retained the response's mutable verdict objects. A later
cache or consumer mutation could alter another reader's answer without a new
validated provider value. These are deterministic shared-presentation defects,
not proof of a real customer exploit, billing failure or an authorization
bypass. The server remains the security boundary.

## Repair inside the existing provider

- Validate the complete declared response header and every verdict. Preserve
  optional older-server `platformAdmin` and `launchScope` compatibility.
- Reject duplicate IDs, missing or incorrectly typed fields, unknown reasons,
  contradictory grant/lock outcomes, and owner-only claims without the owner
  fact. An explicitly disabled release flag cannot simultaneously report a
  release lock.
- Validate at the network guard and again before deriving presentation state.
  Invalid data becomes unresolved: it must not fabricate a subscription denial,
  an industry explanation, an administrative grant or an upgrade recommendation.
- Copy and freeze each admitted verdict. The common provider owns the answer;
  response-cache and consumer mutations cannot silently alter it afterward.
- Preserve the existing distinction among subscription limits, disabled
  workspace features, industry applicability and launch scope. Preserve
  independently verified administration information in a valid unresolved
  catalog response, and preserve the release restriction for platform owners.

No hardcoded industry/license catalog is added. Tests with various industry
labels and generic work-area IDs exercise the same contract; they do not
prove that those labels or capabilities are commercially enabled, licensed,
or regulatorily qualified.

## Executed before/after verification

Node 22.16.0; TypeScript 5.8.3. The same 66-case suite executes the actual
provider, its decoder and lock/recovery functions in both runs. React
memo/context/element construction and the network hook are explicitly declared
substitutes. This is not DOM rendering, authentication, an actual API call,
subscription enforcement, billing validation or a live browser journey.

| Implementation | Tests | Passed | Failed | Skipped |
|---|---:|---:|---:|---:|
| Original Git-blob-verified provider | 66 | 28 | 38 | 0 |
| Repaired provider | 66 | 66 | 0 | 0 |

Cases cover valid grants and four distinct lock explanations; older optional
fields; unresolved reads; common contract handling across client/work-area
labels; invalid headers and rows; contradictory reasons; duplicate IDs in both
orders; partial catalogs; cached-data revalidation; response and consumer
mutation isolation. Both changed TypeScript files transpile without syntax
errors under classic and automatic JSX. This is NOT a semantic whole-repo
TypeScript check.

`execution.json` records source/test/runner Git blob identities, raw-log
SHA-256 hashes and individual before/after outcomes. Native Vitest and existing
rail/catalog integration suites have not run here; the workspace has no
installed React/Vitest application dependencies and npm/GitHub DNS access is
unavailable.

Reproduce using the repository's existing TypeScript dependency and Node 22:

```sh
node --test docs/evidence/D2-PLATFORM/2026-11-04-navigation-contract/offline-runner.cjs
C2C_NAV_BASELINE=1 node --test docs/evidence/D2-PLATFORM/2026-11-04-navigation-contract/offline-runner.cjs
```

The baseline command intentionally fails 38 cases. It needs the baseline Git
commit. The local run used `C2C_NAV_BASELINE_FILE` for the connector-retrieved,
hash-verified baseline instead. That switch affects only the test adapter.

## Required broader verification — still open

```sh
npx vitest run client/src/concept2cure/v2/__tests__/navEntitlementsIntegrity.test.tsx
npx vitest run client/src/concept2cure/v2/__tests__/rbmNavigation.test.tsx
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

Also verify the existing shell/catalog/admin suites, actual license-response
refresh, organization switching, server-side entitlement and project access,
and a real journey through the single Data Room, editor, AnA and Submission
Center. Regional/filing qualification remains separate. No hosted environment,
Neon account, license record or production model was changed. Direct GitHub
publication does not execute the local pre-push hook; CI and hosted acceptance
must not be labeled passed without their actual results.

## Rollback

Revert this one repair commit under normal change control. No migration or
data backfill is required; rollback reintroduces the demonstrated ambiguous
and mutable navigation-verdict behavior.
