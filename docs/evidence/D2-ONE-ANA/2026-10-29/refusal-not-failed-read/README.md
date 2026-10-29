# A refusal is not worded as a failed read: converge the read classifier, fix four device screens

Launch row D2, workstream "one AnA, one project". Date 2026-10-29. Working tree over `84aada8f7`. Red was taken at
`8b3ee4b57`, and no touched file differs between the two (`git diff --stat 8b3ee4b57 84aada8f7 -- <files>` is empty).

**Status: done.** One read classifier (`readFailureFor`, in `client/src/concept2cure/mdx/hooks/useFetchJson.ts`)
replaces three status/code readers. Pre-Sub, UDI, labeling and human factors now word each refusal as what it is. Only a
genuine failure still reads as a failed read.

## The defect

The device screens that are now reached inside the project (Pre-Sub, UDI, labeling, human factors; `ca88fa26`,
`8658aa74`, `43fb57cc`, `9975138ed`) call routes that refuse in distinct ways:

| Answer | Where the server sends it |
|---|---|
| 404 `{"error":"Project not found"}` | `server/lib/admit-project.ts` → `notFoundInTenant` (`server/lib/api-response.ts:231`) |
| 503 `{"error":"VERIFICATION_UNAVAILABLE", message}` | `respondVerificationUnavailable` (`server/lib/verification-outcome.ts:105`) |
| 403 `{"code":"MODULE_NOT_LICENSED"}` | the module gate (`server/middleware/moduleEntitlementGate.ts:256`) |
| 403 `{"error":{"code":"LAUNCH_SCOPE"}}` | the gate's launch scope (`moduleEntitlementGate.ts:98`) |
| 403 `{"error":{"code":"ORG_REQUIRED"}}` | `server/routes/human-factors.ts:149` (and the IVD route's `IVD_NO_TENANT`) |
| 403 `{"error":"Insufficient permissions"}` | `requireEditorAccess` (`server/middleware/orgMembership.ts:579`) |
| 428 | a signed act sent without its signature (`server/routes/mdx-labeling.ts:161`, `:308`) |

At HEAD the four screens worded every one of these as a failed read. That is the outage wording, and these answers are
not outages:

- `PreSubManager.tsx:561` "Could not load your Q-Submissions" (the list), and `:210` "Couldn't load this Q-Sub's detail".
- `UdiSurface.tsx`: one read feeds four `DataGate`s, so a refusal drew "Could not load labeling documents / UDI
  records / …" four times, under metric tiles counting 0 documents, 0 blocked and 0 awaiting signature.
- `Labeling.tsx:518` "Couldn't load the labeling document … Sign in and retry, or check the service is reachable";
  `:576` the symbol glossary; `:644` and `:542` the translations. AnA was told (`:323`) "could not be read … because of
  a failure".
- `HumanFactors.tsx:504` "Couldn't load the HFE/UE file … Sign in and retry"; AnA (`:115`) "because of a failure".

The cause: `useFetchJson` (Pre-Sub, UDI) handed out only a string, `HTTP <status>: <body>`, and `useLiveRows`
(Labeling's document and symbol reads) dropped the server's code that `useLiveData` carries. The screens branched on
`error` alone.

## What already exists

| Piece | Path | What it does | What it does not do |
|---|---|---|---|
| Fetch hook | `client/src/concept2cure/mdx/hooks/useFetchJson.ts` | Cancellable JSON read. A non-OK response throws `HTTP <status>: <body ≤200>`, and `error` is that string. | It exposed no status and no code, so a caller could only parse the string. |
| Save classifier | `useFetchJson.ts:84` `saveFailureFor`, `:95` `describeSaveFailure` | Mutations: 403 forbidden, other 4xx rejected, 5xx unavailable, with one sentence each. | Nothing for reads. It does not read the code either: a module-gate 403 on a write is "your role" (handed on). |
| The IVD board's classifier | `client/src/concept2cure/v2/surfaces/IvdReadinessBoard.tsx:135` `REFUSED_403`, `:141` `ivdReadinessView` (`a86ed04ed`, extracted in `1a6701ea6`) | 404 with a project, the 403s by code (MODULE_NOT_LICENSED, LAUNCH_SCOPE, else "organization could not be confirmed"), any 503, each in its own words. | A local copy. Every 503 was a refusal (including `IVD_NOT_PROVISIONED`, a store that is not there). An uncoded 403 was always "organization", including a role refusal. |
| The project refusal reader | `client/src/concept2cure/v2/projectScopedRead.tsx:80` `projectRefusalOfRead`, `:49` `ProjectRefused`, `:32` `refusalWords` | Engineering, the risk register and the design-controls trace: 404 "Project not found" → not-visible, 503 VERIFICATION_UNAVAILABLE → unchecked, in their own words. | Its own status/code checks, a second copy. Only those two classes. |
| The same, from the error line | `client/src/concept2cure/mdx/hooks/useEngineering.ts:112` `projectRefusalOf` | Parses `useFetchJson`'s line with a regex, then the same two status checks. | A third copy. |
| The code reader | `client/src/lib/queryClient.ts:184` `errorCodeOf`; `:170` `extractApiError`; `ApiRequestError.code` | Reads `{ code }`, `{ error: CODE }` and `{ error: { code } }`. `apiRequest` throws `ApiRequestError` with it. `dataConnect`'s `failureFrom` (`:156`) puts it on `DataState.code`. | `useFetchJson` reads the body itself and never called it. Many suites replace `@/lib/queryClient` with a factory that exports only `apiRequest`, so importing it there would throw on a failed read. |
| v2 read state | `client/src/concept2cure/v2/dataConnect.tsx:345` `DataState.code`; `:427` `ListState`; `:470` `useLiveRows` | `useLiveData` carries `status` and `code`. | `useLiveRows` dropped `code`, so a list read could not tell MODULE_NOT_LICENSED from a role refusal. |
| The failure panel | `dataConnect.tsx` `ErrorState`, and `EmptyState tone="error"`, which delegates to it | `role="alert"`, server strings redacted, a retry slot. | No wording; each caller words its own. |
| `DataGate`'s error branch | `client/src/concept2cure/mdx/components/DataGate.tsx:164` | "Could not load <label>" for a `DataState` error. | A `DataState` error carries only a message. Unchanged here; UDI no longer reaches it for a refusal. |
| Other per-screen read classifiers | `v2/surfaces/insightsLibraryShared.tsx:195` `readFailureOf`; `TrackedFilingDetail.tsx:18` `readFailure`; `Vault.tsx:193` `vaultReadFailure`; `indFormsPanelRecords.ts:79` `formsReadFailure`; `biostatKnowledge.tsx:48` `ReadFailure`; `mdx/hooks/useEstarFiling.ts:390` `describeFilingRefusal` (a write) | Each words 401/403/404/5xx for its own screen, by status only. | They are outside the four screens and the IVD board. Not converged here (handed on). `Vault.tsx` is not this worker's to edit. |

Searches run, over `client/src`, `server` and `shared`: `VERIFICATION_UNAVAILABLE`, `MODULE_NOT_LICENSED`,
`LAUNCH_SCOPE`, `IVD_NO_TENANT`, `ORG_REQUIRED`, `notFound`, `Project not found`, `describe*Failure`, `*Failure(`,
`readFailure`, `refusal`, `projectRefusal`, `errorCodeOf`, `saveFailureFor`, `"Couldn't load"`, `"Could not load"`,
`"could not be read"`, and the 403 codes the server sends (`status(403).json` tallied by code). History:
`git log --all --diff-filter=D -- '*eadFailure*' '*efusal*' '*failureState*' '*fetchFailure*' '*errorClass*'` finds
nothing deleted; `git log --all -S readFailureFor` and `-S describeReadFailure` find nothing.

## What changed

**Converge: one read classifier.** In `useFetchJson.ts`, beside the save classifier:

- `readFailureFor(status, code)` → `not-found` (404) · `unchecked` (503 VERIFICATION_UNAVAILABLE) · `not-enabled` (403
  MODULE_NOT_LICENSED) · `out-of-release` (403 LAUNCH_SCOPE) · `no-organization` (403 ORG_REQUIRED, IVD_NO_TENANT,
  NO_ORGANIZATION, TENANT_REQUIRED, TENANT_CONTEXT_REQUIRED) · `role` (any other 403) · `signature` (428) · `failed`
  (everything else: 0, other 5xx, other 4xx). Status and code only, never the wording.
- `readRefusalOf(read)`: the refusal, or null for a genuine failure. It takes a `ReadFailure` or a v2 read's
  `{ status, code }`.
- `describeReadFailure(kind, what, { subject })`: the words, kept beside the classifier as `describeSaveFailure` is.
- `useFetchJson` keeps its `error` line byte for byte, and also returns `failure: { kind, status, code? }`. The code
  is read from the whole body, while the line still keeps 200 characters.

Migrated onto it, with the local copies deleted:
- `IvdReadinessBoard.tsx`: `REFUSED_403` and the three status branches are gone. `ivdReadinessView` asks
  `readRefusalOf` and words the refusal with `describeReadFailure`. A 404 with no project open is still a failed read.
- `projectScopedRead.tsx` `projectRefusalOfRead`: classifies through `readFailureFor`. It keeps admit-project's
  sentence check for the 404, and its two classes and words are unchanged.
- `useEngineering.ts` `projectRefusalOf`: still reads `useFetchJson`'s line, and hands the status and `"error"` value to
  `projectRefusalOfRead`. Its own status checks are gone.
- `client/src/lib/apiErrorCode.ts` (new): `errorCodeOf` and `isErrorCode`, moved unchanged out of `queryClient.ts`,
  which imports them and still re-exports `errorCodeOf`, so every caller keeps its import. `useFetchJson` reads codes
  with the same rule and does not import the module those suites replace.
- `dataConnect.tsx` `useLiveRows` carries `code`, as `useLiveData` already did.

**One refusal panel and one AnA context.** `projectScopedRead.tsx`, beside `ProjectRefused`:
- `ReadRefused`: an `ErrorState` panel in `describeReadFailure`'s words. It offers Try again only where a retry can
  change the answer (the check that could not run).
- `unreadContext`: what AnA is told. A refusal is told as itself, and only a genuine failure as "because of a failure".
- `unreadSentence`: a refusal's sentence, or the screen's own failed-read sentence.

**Fix: the four screens.**
- `PreSubManager.tsx`, `usePresub.ts`: the list and the detail pass `failure` through. A refusal is `ReadRefused`
  (`presub-list-refused`, `presub-detail-refused`). The detail's 404 names the Q-Sub, not the project.
- `UdiSurface.tsx`, `useUdi.ts`: a refusal is said once (`udi-refused`), under the page header. No metric tile or panel
  is drawn beside it, because a refusal is not a count of zero. A genuine failure still reaches each panel's `DataGate`.
- `Labeling.tsx`: the document read, the symbol glossary and the translations (table and headline) each say their
  refusal. The two child reads name the labeling document, not the project. AnA is told the refusal. Try again re-reads
  all three (`reads`).
- `HumanFactors.tsx`: a refusal is `ReadRefused` (`hf-refused`), with Try again where it applies. AnA is told the
  refusal.

The genuine-failure copy on all four screens is unchanged ("Couldn't load …", "… could not be read"). Existing suites
pin it, and it is now reached only by a genuine failure.

### The words

`what` is what was not read ("the HFE/UE file"). `subject` defaults to "this project".

| Class | Title | Message | Try again |
|---|---|---|---|
| not-found | Not found in your organization | This project was not found in your organization, so the HFE/UE file was not read. | no |
| unchecked | The ownership check was unavailable | The check that this project belongs to your organization was unavailable, so the HFE/UE file was not read. This says nothing about this project. Try again. | yes |
| not-enabled | Not enabled for your organization | This feature is not enabled for your organization, so the HFE/UE file was not read. | no |
| out-of-release | Not in this release | This part of the product is not in this release, so the HFE/UE file was not read. | no |
| no-organization | Your organization could not be confirmed | Your organization could not be confirmed, so the HFE/UE file was not read. | no |
| role | Your role cannot do this | Your role cannot do this, so the HFE/UE file was not read. | no |
| signature | Signature required | This step needs your electronic signature, so the HFE/UE file was not read. | no |
| failed | The HFE/UE file could not be read | The HFE/UE file could not be read. Try again. | yes |

The not-enabled, out-of-release and no-organization sentences are the IVD board's, unchanged (its suite pins them).
None of the words says "plan", which the repo bars (IA section 9). MODULE_NOT_LICENSED is sent for a subscription
without the feature and for one an administrator switched off alike, so "not enabled" names neither.

### What the IVD board now says differently

The four cases below change. Each is now the shared classifier's answer:
- 503 `IVD_NOT_PROVISIONED` (the IVD tables are not there) was "The project check or the IVD records were unavailable
  … Retry shortly", a refusal. It is now the board's failed read, "The IVDR readiness could not be read. Nothing here is
  a finding about the technical file." The board still offers its retry.
- 503 VERIFICATION_UNAVAILABLE is now "The check that this project belongs to your organization was unavailable …".
- A 403 with no code was "Your organization could not be confirmed". It is now the role refusal. The IVD route's own
  organization refusal carries `IVD_NO_TENANT` and still reads "Your organization could not be confirmed".
- A 428 is a refusal now, not a failed read.

## Red, green, mutations

| | Count | File |
|---|---|---|
| Red: the five new suites at `8b3ee4b57`, no product change | 63 failing, 6 passing (the 6 are the genuine-failure cases, which already passed) | `red.txt` |
| Green: the five new suites | 78 / 78 (69 behaviour cases + 9 structural "no screen keeps its own copy" cases added with the change) | `green.txt` |
| Green: keep-green, 100 suite files of every touched module (at `ca574ff80`; the 23 labeling, risk and human-factors files re-run at `84aada8f7`, 173 / 173) | 950 / 950 | `green.txt` |
| Mutations, each applied to product code, reverted (sha256 checked), turning a suite red | 19 applied, 19 red, 0 survived | `mutations.txt` |

The new suites:
- `client/src/concept2cure/mdx/hooks/__tests__/useFetchJson.readFailure.test.ts`: the classifier over 14 answers;
  the words of each class; `useFetchJson` exposes `{ kind, status, code }` for the real server envelopes and keeps its
  `error` line; a non-JSON body, no response, an idle read and a refetch. Structurally, it pins that none of the nine
  readers branches on a refusal status or code itself.
- `PreSubManager.refusalNotFailedRead.test.tsx`, `UdiSurface.refusalNotFailedRead.test.tsx`,
  `labelingRefusalNotFailedRead.test.tsx`, `humanFactorsRefusalNotFailedRead.test.tsx`: for each refusal (the real
  envelope; the v2 screens go through an `apiRequest` that throws `ApiRequestError` exactly as the real one does, via
  `extractApiError`), the panel says it, nothing on screen says "could not load / could not be read", Try again appears
  only where it should, AnA is told the refusal, and a retry of the unavailable check draws the answer. A 500 is still
  a failed read.

| # | Mutation | File | Suites run | Result |
|---|---|---|---|---|
| M1 | 404 is no longer not-found | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `PreSubManager.refusalNotFailedRead.test.tsx`, `IvdSurface.readiness.test.tsx` | RED: 3 of 3 suites, 5 tests failing |
| M2 | 503 VERIFICATION_UNAVAILABLE is no longer unchecked | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `humanFactorsRefusalNotFailedRead.test.tsx`, `IvdSurface.readiness.test.tsx` | RED: 3 of 3 suites, 5 tests failing |
| M3 | MODULE_NOT_LICENSED falls to the role refusal (every 403 the same) | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `PreSubManager.refusalNotFailedRead.test.tsx`, `IvdSurface.readiness.test.tsx` | RED: 3 of 3 suites, 7 tests failing |
| M4 | LAUNCH_SCOPE falls to the role refusal | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `UdiSurface.refusalNotFailedRead.test.tsx`, `IvdSurface.readiness.test.tsx` | RED: 3 of 3 suites, 4 tests failing |
| M5 | 428 is a failed read | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `labelingRefusalNotFailedRead.test.tsx` | RED: 2 of 2 suites, 3 tests failing |
| M6a | ORG_REQUIRED is not an unconfirmed organization | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `humanFactorsRefusalNotFailedRead.test.tsx` | RED: 2 of 2 suites, 3 tests failing |
| M6b | IVD_NO_TENANT is not an unconfirmed organization (the IVD board reads the shared classifier) | `mdx/hooks/useFetchJson.ts` | `IvdSurface.readiness.test.tsx` | RED: 1 of 1 suites, 1 tests failing |
| M7 | useFetchJson does not read the body's code | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `PreSubManager.refusalNotFailedRead.test.tsx`, `UdiSurface.refusalNotFailedRead.test.tsx` | RED: 3 of 3 suites, 14 tests failing |
| M8 | useFetchJson exposes no failure | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `PreSubManager.refusalNotFailedRead.test.tsx`, `UdiSurface.refusalNotFailedRead.test.tsx` | RED: 3 of 3 suites, 26 tests failing |
| M9 | useLiveRows drops the server code again | `v2/dataConnect.tsx` | `labelingRefusalNotFailedRead.test.tsx` | RED: 1 of 1 suites, 4 tests failing |
| M10 | Pre-Sub draws a refused list as a failed read | `mdx/presub/PreSubManager.tsx` | `PreSubManager.refusalNotFailedRead.test.tsx` | RED: 1 of 1 suites, 7 tests failing |
| M11 | UDI draws a refused read as four failed panels | `mdx/surfaces/UdiSurface.tsx` | `UdiSurface.refusalNotFailedRead.test.tsx` | RED: 1 of 1 suites, 6 tests failing |
| M12 | Labeling draws a refused document read as a failed read | `v2/surfaces/Labeling.tsx` | `labelingRefusalNotFailedRead.test.tsx` | RED: 1 of 1 suites, 7 tests failing |
| M13 | Human factors draws a refused read as a failed read | `v2/surfaces/HumanFactors.tsx` | `humanFactorsRefusalNotFailedRead.test.tsx` | RED: 1 of 1 suites, 8 tests failing |
| M14 | a project not in the organization offers Try again | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `PreSubManager.refusalNotFailedRead.test.tsx`, `humanFactorsRefusalNotFailedRead.test.tsx` | RED: 3 of 3 suites, 3 tests failing |
| M15 | useFetchJson changes the error line existing callers read | `mdx/hooks/useFetchJson.ts` | `useFetchJson.readFailure.test.ts`, `EngineeringSurface.refusal.test.tsx` | RED: 1 of 2 suites, 9 tests failing |
| M16 | the project refusal reader no longer reads the unchecked class | `v2/projectScopedRead.tsx` | `EngineeringSurface.refusal.test.tsx` | RED: 1 of 1 suites, 2 tests failing |
| M17 | the IVD board keeps a local 403 copy again | `v2/surfaces/IvdReadinessBoard.tsx` | `useFetchJson.readFailure.test.ts` | RED: 1 of 1 suites, 1 tests failing |
| M18 | AnA is told a refusal is a failure | `v2/projectScopedRead.tsx` | `labelingRefusalNotFailedRead.test.tsx`, `humanFactorsRefusalNotFailedRead.test.tsx` | RED: 2 of 2 suites, 13 tests failing |

Keep-green covers the seven Pre-Sub suites, `deviceFeaturesReadTheProject`; the labeling, labeling-PI and
human-factors suites; `adapterShapeSafety`, `ProjectMdxWorkflow` and its device and human-factors doors; the five
`IvdSurface.*` suites and `ivdCompletenessOneBoard`; every `mdx/hooks/__tests__` suite (the `useFetchJson` consumers);
the quality suites that read through `useFetchJson`; the four `dataConnect*` suites and `liveRowsStability`; the six
`EngineeringSurface.*` suites and the two `engineeringAnaContext*` suites; the risk and design-controls suites
(`ProjectRefused` mounts); and the four `client/src/lib/__tests__` queryClient suites.

Type check: the full-tree check is not run, because it is killed for memory under parallel load. The changed and new
files are checked with everything they import, under the repo's compiler options (`typecheck-tsconfig.json`, repo path written as `<repo>`): exit 0, 0 errors. ESLint: 0 errors.
Every changed file has the same warning count as at HEAD, and the new files have none (the per-file table is at the
end of `green.txt`). This is what the pre-push ratchet compares.

## Not done, handed on

- **`ProjectRefused`'s words are not converged.** Engineering, the risk register and the design-controls trace still
  say "This project isn't one this organization can see" / "This project couldn't be checked". Their classification
  now goes through `readFailureFor`, but the sentences are a second wording of `not-found` and `unchecked`, and three
  suites pin them. Moving them to `describeReadFailure` is a wording change on Engineering, which is being worked on.
- **The other per-screen read classifiers** listed under "What already exists" (insights, tracked filing, Vault, IND
  forms, biostatistics knowledge) are not converged. Each classifies by status only, so each would word a
  module-gate 403 as a role refusal.
- **Write refusals.** `saveFailureFor` calls every 403 "your role", including MODULE_NOT_LICENSED and LAUNCH_SCOPE. The
  labeling and human-factors write toasts show the server's own sentence. Neither is changed here.
- **401** is not a class here. `apiRequest` announces the ended session itself, and on these screens it is still a
  failed read.
