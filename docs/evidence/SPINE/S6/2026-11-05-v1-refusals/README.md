# S6 V1: the Vault says each refusal as what it is (2026-11-05)

Package S6 of `docs/design/ONE_DESIGN_PLAN.md`: Vault at Veeva parity, on the existing Vault. This slice changes
behaviour only. It leaves D6-3's layout as it is.

The founder, 2026-11-05: *"Licensing is a separate control from applicability and authorization. A feature can be not
licensed, not relevant to this project, blocked by missing evidence, or unavailable to this user. Those are different
conditions and should not be collapsed into a generic failure."*

## The defect

The server already answers the Vault's reads in distinct ways:

| Answer | Where the server sends it |
|---|---|
| 403 `{ code: 'MODULE_NOT_LICENSED' }`: the plan does not include the Vault | `server/middleware/moduleEntitlementGate.ts:256` |
| 403 `{ error: { code: 'LAUNCH_SCOPE' } }`: the Vault is not in this release | `moduleEntitlementGate.ts:98` |
| 403 with no code: the person's role | `requireEditorAccess` (`server/middleware/orgMembership.ts:587`) |
| 404 `PROJECT_NOT_FOUND`: the project is not in this organization, or is not admitted (a GET hides a refusal as not-found) | `server/routes/c2c/project-route-access.ts:57` |

On trunk the Vault collapsed them:
- **The project vault read** (`Vault.tsx` `vaultReadFailure`, by status only) worded every 403 as *"You don't have
  access to this project's documents. Ask an administrator in your organization to grant it."* A plan without the
  Vault therefore read as a permission the person lacked. AnA was told the store had failed and offered "Retry the
  vault read".
- **Both searches** said *"could not be verified — this is not a result of zero matches"* for every refusal. That is
  the library search across projects (`VaultLibraryResults.tsx`) and the project search (`Vault.tsx`).
- **An upload refused by the module gate** said *"Not filed: … Module access denied"*. `useVaultUpload.ts` read the
  code only from an object `error`, and the gate sends it top-level.

## What already exists

- **The one read classifier.** `readFailureFor`, `readRefusalOf` and `describeReadFailure` are in
  `client/src/concept2cure/mdx/hooks/useFetchJson.ts`. They give a kind and words for not-found, unchecked,
  not-enabled (MODULE_NOT_LICENSED), out-of-release (LAUNCH_SCOPE), no-organization, role and signature.
  - Pre-Sub, UDI, labeling, human factors and the IVD board already use it.
  - The 2026-10-29 record (`docs/evidence/D2-ONE-ANA/2026-10-29/refusal-not-failed-read/README.md`, "Other
    per-screen read classifiers") lists `Vault.tsx` `vaultReadFailure` as **not converged, handed on**. This slice is
    that hand-on.
- **The code reader.** `errorCodeOf` (`client/src/lib/apiErrorCode.ts:41`) reads `{ code }`, `{ error: CODE }` and
  `{ error: { code } }`.
- **The read state.** `useLiveData` (`v2/dataConnect.tsx`) already carries `status` and `code`. The Vault read
  ignored the code.
- **"Not relevant to this project" is already distinct.** `VaultCoverage` says *not applicable* apart from
  *unavailable* (`server/services/vault/vault-coverage.ts`). It is unchanged here.

Searches run, over `client/src/concept2cure` and `server`:
- the names: `vaultReadFailure`, `readFailureFor`, `describeReadFailure`, `readRefusalOf`, `errorCodeOf`;
- the codes: `MODULE_NOT_LICENSED`, `LAUNCH_SCOPE`;
- the copy: "could not be verified", "don't have access to this project", "Module access denied".

## What changed

| Where | Before | After |
|---|---|---|
| `Vault.tsx` `vaultReadFailure` | A switch on status | Classifies through `readFailureFor(status, code)`. A refusal is worded by `describeReadFailure` ("Not enabled for your organization", "Not in this release", "Your role cannot do this") with no retry. 401, 404 and a failure to answer keep their own words, and only a failure offers a retry. |
| `Vault.tsx`, AnA's context | "could not be read … because of a failure", with "Retry the vault read" | For a refusal: "The document vault was not read." plus the refusal's words, and no retry. A failure is unchanged. |
| `Vault.tsx`, project search | "could not be verified" for everything | A refusal says itself ("…, so the vault was not read."). A failure is still unverified. |
| `VaultLibraryResults.tsx` | The same, across projects | The same: a refusal says itself ("…, so the library was not read."). |
| `useVaultUpload.ts` | "Module access denied". The code is read only from an object `error`. | The code comes from `errorCodeOf`, so the gate's top-level code is read. The gate's refusal says "the Vault is not enabled for your organization", never the gate's module id ("vault: Not included in this plan"). |

No new component, route or screen. Every refusal the classifier names is worded by the classifier, so the Vault says
what the device screens say. The Vault keeps its own words for three cases only: an expired session, a project not in
this organization, and a failure to answer. Each of those carries a remedy that is the Vault's own.

## Evidence

| File | What it shows |
|---|---|
| `01-red.txt` | `vaultRefusalNotFailedRead.test.tsx` before the change: 6 of 9 fail. The 3 that pass are the behaviours kept: not found, a failure's retry, and a role refusal's own sentence. With the change, 9 of 9 pass. |
| `02-vault-suites.txt` | The 70 Vault suites, the shared classifier's tests and the new suite, with the change |
| `03-three-red-on-trunk.txt` | `vaultLibrarySearch`, `vaultPlaceFromVault` and `vaultVersionCompare` fail on trunk without this change. They expect a read called as `('GET', url)`, and the data layer now passes `(…, undefined, undefined, AbortSignal)`. Their expectations are brought to trunk's own form, `expect.any(AbortSignal)`, as `cmdkAudience` and `marketSupportLine` already do. |
| `normal.png`, `real-404.png` | The running app against the dev server: the demo biotech project's Vault opens. A project id not in the organization gets the server's real 404 and "wasn't found in your organization", with no retry. |
| `injected-not-licensed.png`, `injected-out-of-release.png`, `injected-library-not-licensed.png` | The running app, with the module gate's exact 403 bodies **injected at the browser's network layer**. The dev account is a platform admin, whom the gate lets through, so the server itself cannot be made to send these here. Each is said as itself, with no retry. |
| `04-running-app.json` | What each of those five screens said, and its console and failed requests |

`vaultHeaderHonesty.test.tsx`'s uncoded 403 is now "Your role cannot do this, so the project vault was not read." It
was "You don't have access … Ask an administrator". The test is updated to that, and its intent is kept: a refusal is
not "the store did not respond", and offers no retry.

## Not done here

- **The project's settings do not yet drive "Required documents" for a device filing.**
  `device-510k-required-documents.png` shows the seeded NeuroPanel-Dx 510(k). Its Library tree already shows the eSTAR
  sections A to G, each required or optional. But "Required documents" says *"This vault is not CTD-numbered, so there
  is no required-section list to count against."* Its Vault documents carry no eSTAR section, so nothing can count
  against that list. Placing Vault documents at eSTAR codes is the device filing model's work, owned by the MDX
  journey and RIM lanes, so it is handed on in `.design/claude-convergence/COORDINATION.md`.
- **V2, next in this lane (F1).** "All my projects" and the organisation's governed artifacts list documents from
  every project the person can use, across sponsors (`client_workspaces`). For a CRO they can mix sponsors in one
  list, and no row names its sponsor. That list should stay inside the open project's sponsor and name it.
- **"Add files" stays in the header when the read is refused.** That is D6-3's choice. For a plan without the Vault,
  the upload is now refused in the same words.
