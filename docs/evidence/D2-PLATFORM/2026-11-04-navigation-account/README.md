# One platform: navigation belongs to the current signed-in account

Repository: `concept2cure/ClinicalSageAI-2-replit`  
Branch: `concept2cure-v2`  
Baseline: `f79ab55bc4bf37af5f0928b69a69acdc72089822`  
Plan: F1; completes `client/src/concept2cure/v2/navEntitlements.tsx`.

## Scope and existing architecture

The product remains one platform, adapting to project settings and client
licensing, with one Data Room/catalog, AnA, canvas/editor and Submission Center.
This is a shared-shell repair, not a separate industry, region, document or
filing application. It introduces no service, screen, route, table, engine,
commercial tier, feature policy, production dependency or model permission.
No roadmap, ledger or repository gate is altered.

### What already exists

| Owner | Existing responsibility |
|---|---|
| `client/src/concept2cure/v2/navEntitlements.tsx` | Validates license-response contracts, isolates verdict objects, supplies the shared shell/lock explanations |
| `client/src/concept2cure/v2/dataConnect.tsx` | `DataReadOwner`, `useDataReadVisit` and `useLiveData` retire obsolete reads, cancel requests and mask previous-visit state during render |
| `client/src/services/portal/authService.tsx` | The signed-in account exposed by the existing `useAuth` context |
| `client/src/utils/authToken.ts` | Canonical bearer/header identity; server validation remains authoritative |
| `client/src/concept2cure/v2/V2App.tsx` | Mounts the shared provider; AnA's navigation publisher consumes the same verdict set |
| `client/src/concept2cure/v2/surfaces/riskRecordRead.ts` | Existing precedent for composing account/project ownership with `DataReadOwner`, rather than a second fetch system |
| `server/routes/module-subscriptions.ts` | Authenticated organization-scoped navigation response and independent administration standing |
| `server/services/entitlements/navigation-entitlements.ts` | Real subscribed/included/disabled/tier/industry/release explanations |

The root rules and roadmap remain those already inspected at this branch's
parent. Related owners, usages and tests were searched. Full deleted Git
history and the complete repository dependency graph were not inspected:
container GitHub/npm DNS is unavailable. Baseline source was retrieved with
the connected GitHub tool and verified against its exact Git blob hash.

## Confirmed defect

The navigation read used only a fixed URL and fixed dependency list. It did
not bind that read to the account even though the response includes
organization-specific licensing and user-specific administration facts.
A provider that stays mounted across an account change could therefore keep
its previous answer; a late request could also finish after that change.
Payload shape validation did not establish that the returned organization
was the one identified by the current account.

The regression demonstrates this through controlled same-mounted account
changes. It is not proof of a production privilege escalation, data access,
billing error, or the cause of an earlier customer demonstration failure.
Server-side authorization was and remains the permission boundary.

## Repair, in the existing provider

1. Read the account from the shell's existing `useAuth` context.
2. Give each observed account/profile visit a distinct identity. A -> B -> A
   cannot revive the first visit, even when its original account object is
   reused. Unmount retires the captured verdict getter.
3. Pass that owner into the existing `useLiveData` contract. A changed owner
   masks earlier state before passive-effect cleanup and causes a fresh read
   through the same API and transport. No second fetch implementation is added.
4. Clear previous owner/admin/plan indicators while the new response is
   unresolved. Do not issue a navigation request while no account is known.
5. Compare the response organization with the authenticated profile's numeric
   organization where provided. Numeric-text IDs are supported; invalid IDs
   are not guessed from browser storage. An older profile without that field
   retains the current authenticated server response rather than inventing an
   organization. This compatibility case does not assert independent client
   verification of an organization that the profile did not supply.
6. Keep subscription, workspace settings, industry and release explanations,
   row immutability, and the no-fabricated-lock behavior from the preceding
   repair. No entitlement is granted or revoked by this change.

The scope is *observed React account/profile changes*, not a new global auth
session mechanism or a guarantee about every external storage/token event.
An ordinary render with the same account object does not re-fetch. Replacing
that profile intentionally rechecks the account's current answer.

## Executed verification

Node 22.16.0 and TypeScript 5.8.3. The same suite executes the actual provider
and validation code; React context/hook scheduling, account context and the
existing read-lifecycle contract are explicitly controlled substitutes.
No live HTTP, browser DOM, authentication or billing enforcement is qualified.

| Executed suite | Baseline pass / fail | Repaired pass / fail | Skipped |
|---|---:|---:|---:|
| Account/organization/late-response ownership, 33 cases | 4 / 29 | 33 / 0 | 0 |
| Previous navigation-contract regression, 66 cases | 66 / 0 | 66 / 0 | 0 |
| Total | 70 / 29 | 99 / 0 | 0 |

The pre-existing 66-case test file received only explicit auth and additional
React-hook collaborators; its assertions were retained. Both versions of the
production file use those same collaborators for the comparison. Test and
production baseline files were verified against their existing Git blobs.

All four changed TypeScript/TSX files transpile without syntax diagnostics in
classic and automatic JSX modes. This is not a semantic whole-repository
TypeScript check. `execution.json` records individual account-case results, prior-suite totals and
source/test/adapter Git blob identities plus raw-run SHA-256 values.

The companion `navEntitlementsAccount.dom.test.tsx` adds six native
React/useLiveData cases for organization switches, same-organization user
changes, late HTTP completion, A -> B -> A, logout and wrong-organization
answers. These six are authored but not executed here: React, Vitest and
jsdom dependencies are not installed and npm DNS is unavailable.

### Reproduce in the repository

```sh
node --test docs/evidence/D2-PLATFORM/2026-11-04-navigation-account/offline-runner.cjs
C2C_NAV_ACCOUNT_BASELINE=1 node --test docs/evidence/D2-PLATFORM/2026-11-04-navigation-account/offline-runner.cjs
C2C_NAV_ACCOUNT_SUITE=client/src/concept2cure/v2/__tests__/navEntitlementsIntegrity.test.tsx node --test docs/evidence/D2-PLATFORM/2026-11-04-navigation-account/offline-runner.cjs
```

The baseline command intentionally fails 29 cases and needs the baseline Git
commit. The local run supplied the same hash-verified source through
`C2C_NAV_ACCOUNT_BASELINE_FILE`; this affects only the test runner.

Native and whole-platform checks still required:

```sh
npx vitest run client/src/concept2cure/v2/__tests__/navEntitlementsAccount.test.tsx client/src/concept2cure/v2/__tests__/navEntitlementsAccount.dom.test.tsx client/src/concept2cure/v2/__tests__/navEntitlementsIntegrity.test.tsx client/src/concept2cure/v2/__tests__/rbmNavigation.test.tsx
NODE_OPTIONS=--max-old-space-size=12288 npx tsc --noEmit -p .
npm run ci:one-design-plan
```

Also verify the shell/account-menu/native auth suites, actual account changes,
AnA navigation state, server entitlement enforcement, real license refresh,
and the broader single-platform project/document/region workflows. This
repair does not certify each regional filing or adapt every existing project
setting. No hosted environment, Neon account, customer record or license was
modified. Direct GitHub publication does not run the local pre-push hook;
queued workflows are not passing evidence.

## Rollback

Revert this one repair commit under ordinary change control. No migration or
backfill is required; reverting restores the demonstrated stale-account
navigation behavior.
