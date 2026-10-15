# P-27 follow-ups — recorded package identity, dry runs, one signing-authority policy

Date: 2026-10-08. Source: `docs/LAUNCH_DEFINITION_OF_DONE.md`, section "P-27". No migration.
Each item was red before its fix; the red and green outputs are in this folder.

## 1. AnA `package_ectd_for_region` takes identity from the record only

- **Before:** `application_id`, `sponsor_id` and `sponsor_name` were model input. Whatever the model wrote went into the regional backbone (`<application-number>`, `<company-name>`, `<id>`).
- **Now:**
  - The schema drops those three fields and requires `program_id`.
  - The handler reads the application number and the applicant through `server/services/ectd/package-identity.ts` (`readRecordedPackageIdentity` + `packageIdentityRefusal`), the reader export and compile use.
  - A missing value is refused by name: `PACKAGE_IDENTITY_MISSING`, with `missing: [...]`.
  - A call without `program_id` is refused the same way, and nothing is read.
  - Model-supplied identity fields that still arrive are not read.
  - The result names what the backbone carries (`applicationNumber`, `applicantName`, `identitySource: 'record'`).
  - The applicant's D-U-N-S number has no recorded home yet. The tool writes `UNASSIGNED-ORG-n`, as the compile does. This is the known gap already recorded in P-27.
- **Digests:** `docs/ana-capability-manifest.json` was regenerated with `npm run manifest:ana`. Only this tool's entry was spliced in, because the generator also carries unrelated drift from other tools. `ci:step-presentation` does not depend on the schema (its preview field `sequence` is unchanged) and stays green. No tool-registry digest exists.
- **Tests:**
  - `server/services/ana/__tests__/package-ectd-for-region-recorded-identity.test.ts` (new).
  - `server/services/ana/__tests__/package-ectd-for-region-withdrawal.test.ts` was moved to the new contract.
- **Evidence:** `item1-red.txt` shows 5 failures, including a package built from model identity (`expected true to be undefined`). `item1-green.txt` shows the passing run.

## 2. Dry runs say so, and never become a stored or sent package

There is now one dry-run identity: `dryRunPackageIdentity` in `package-identity.ts`, alongside `DRY_RUN_NOTICE`. `assembleSequence` takes either a recorded identity or `{ dryRun: true }`. A dry run names no identity of its own. Its result, its audit row and its governance manifest carry `dryRun`.

| Dry run | Change |
|---|---|
| Packageability check (`assertSequencePackageable`, before a governed freeze or dispatch) | Asks for `dryRun: true` and supplies no identity. The bundle is discarded on every path; this was already true and is now pinned by a test. |
| `POST /api/submissions/sequences/:id/assemble` | The answer carries `dryRun: true`, `packageProduced: false` and `notice`. It no longer returns `sha256`, a digest of bytes the route deletes, which a caller could record as a package digest. A body that names `applicationId`, `sponsorId` or `sponsorName` is refused with **400 `DRY_RUN_TAKES_NO_IDENTITY`**. Before, those fields were accepted and written into the dry run. No client calls this route. |
| Orchestrator validation assembly | **This one reached a stored package, so it now refuses.** `assembleRealPackage` wrote `UNASSIGNED (applicant)` into the regional backbone. That backbone's MD5 is a leaf of the `index.xml` that the §11.70 release signature binds, and that `index.xml` is persisted in the signed snapshot returned by the signed-package export. The run now reads its identity from the record (`server/services/ectd/run-package-identity.ts`): the submission's project's application number, which must equal the run's, and the organisation's name. With that identity the backbone names the recorded applicant and signing proceeds. Without it, the assembly is `dryRun: true` with a `dryRunReason`, and the `package.assemble` outputRef says it is a dry run. It still validates. `package.sign` is skipped with the dry-run reason, so no payload digest and no signed snapshot are written. A legacy run re-derived without recorded identity fails its resume with `signature_dry_run_identity`. |

- **Tests:**
  - `tests/unit/orchestrator-dry-run-identity.test.ts`
  - `server/services/submission-service/__tests__/packageability-dry-run.test.ts`
  - `server/routes/__tests__/submissions-assemble-dry-run.test.ts`
  - Three orchestrator suites are about steps rather than identity. They now stand in a recorded identity with one module mock.
- **Evidence:** `item2-red.txt` shows 7 failed and 1 passed. The passing case is the cleanup regression guard. The `sha256` assertion was added after the red run. `item2-green.txt` shows the passing run.

## 3. One signing-authority policy: `checkSigningAuthority`

**Deleted copies:**
- `c2c/actions.ts` `signingAuthorityRefusal`
- `api/cmc/cmc-signer.ts` `refusedWithoutSigningAuthority`; `verifiedReauthFactors` stays
- `authoring.router.ts` `assertSigningAuthority`
- the ceremony's own `assertSigningAuthority` wrapper

**Inline `resolveSignerOrgRole` + `isSigningAuthorized` checks moved onto the gate:**
- `mdx-qms` (approval signer)
- `pccp` approve
- `governed-signed-act`
- `submission-sign-release`
- `document-lifecycle`
- `audit-compliance-reviews`
- `mdx-rbm` (two routes)
- `esignature` `/sign`
- `ana-ri/seal-verified`
- the four CMC handlers

`c2c/artifacts` `GET /user/permissions` no longer writes the role list out by hand.

**Refusal contracts:** every route keeps its 403 status and code: `ESIGNATURE_NO_AUTHORITY`, `QMS_NO_SIGNING_AUTHORITY`, `PCCP_NO_SIGNING_AUTHORITY` and `RBM_NO_SIGNING_AUTHORITY`.

**Changes, each pinned by a test:**
- **A role lookup that fails** now answers the gate's **503 `SIGNING_AUTHORITY_UNVERIFIED`**. Before, each route did this differently:
  - `c2c/actions` answered 500 `INTERNAL_ERROR`; its test is updated.
  - CMC, `governed-signed-act` and `pccp` answered 500 or threw.
  - `audit-compliance-reviews` still throws to its 500, so that a failed lookup is never shown as "cannot sign".
- **Order:** `pccp`, both `mdx-rbm` approves and `seal-verified` now ask authority before the password. Before, a role without signing authority could still test a password on these routes.
- **Role source:** `esignature /sign` and `document-lifecycle` judged the role carried on the request (`resolveUserRole`). They now judge the membership row. The role recorded on the signature is still the request's reading, as before.
- `esignature /sign` resolves the organisation before authority. It still answers 403 `ESIGNATURE_ORG_REQUIRED`.

**Gate:** `ci:sign-ceremony` now counts only `checkSigningAuthority(` as an authority check. The selftest adds two cases: an inline `isSigningAuthorized` no longer satisfies the rule, and neither do the retired wrappers. Baseline reasons are updated. No count changed.

**Tests:**
- `server/services/part11/__tests__/one-signing-authority-policy.test.ts` (new). It allows no retired wrapper definition, and it caps direct `isSigningAuthorized` calls to listed display-only or other-person callers, each with a reason.
- New cases in `pccp-approve-signing.test.ts` and `esignature-sign.test.ts`.

**Evidence:**
- `item3-red-gate.txt`: the tightened gate fails on 16 sites.
- `item3-red-selftest.txt`: the new selftest case fails against the old gate.
- `item3-red-tests.txt`: 6 failures, including `expected 201 to be 403` (request role), `expected 401 to be 403` (password before authority) and `expected 500 to be 503`.
- `item3-green-tests.txt`, `gate-ci-sign-ceremony.txt` and `gate-ci-sign-ceremony-selftest.txt`: the passing runs.

## Gates

- `ci:sign-ceremony` and its selftest are green; the selftest has 27 cases.
- `ci:step-presentation` is green.
- `ci:untracked-imports`, recorded in `gate-ci-untracked-imports.txt`:
  - It is clean for this change's files once its six new files are added to git. This was checked on a scratch copy of the index.
  - Until then, `submission-package-orchestrator.ts` → `run-package-identity.ts` is flagged.
  - The other flagged imports belong to concurrent work.
- ESLint on the 44 changed files: 0 errors. Warnings went from 237 before to 236 after. The before count comes from `git show HEAD:<file> | eslint --stdin`.
- Unit runs use `RLS_ENFORCE=off`. They cover the 207 suites that import a touched module, plus the related PGlite suites.
- Typecheck, recorded in `gate-typecheck-eslint.txt`: the whole-tree `tsc` run reports 3 errors, none in this change's files. All 3 are in other sessions' uncommitted test files.
