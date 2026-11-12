# W2-assembly-refusal: assembling a package says what is wrong instead of a 500

Lane of wave B (2026-11-12). Rows: rehearsal B2 (product half) and rehearsal lane 2.
Plan package: F1 (the repair of something reached and broken). Completes: `server/services/ectd/assemble-from-core.ts`,
`server/services/submission-gateways/regional-packager.ts`.

## What already exists

- `client/src/concept2cure/v2/surfaces/SequenceAssembleTestPackage.tsx`: Submission Center, Dispatch tab, "Assemble a
  test package". It already renders a 422 as "No test package was assembled — <the server's sentence>." and a 5xx as
  "Whether the test package was assembled could not be confirmed". Pinned by
  `client/src/concept2cure/v2/__tests__/sequenceAssembleDryRun.test.tsx`. No client change was needed.
- `server/routes/submissions.ts` (POST /api/submissions/sequences/:seqId/assemble): already answers an
  `EctdAssemblyBlockedError` as 422 `ECTD_ASSEMBLE_BLOCKED` with its audit outcome. Anything else went to `fail()`: 500.
- `server/services/ectd/assemble-from-core.ts` (`assembleSequence`): converted only `FdaSubmissionIdentityRefusal` to
  `EctdAssemblyBlockedError`, with an ECTD_ASSEMBLE_BLOCKED audit row.
- `server/services/submission-gateways/regional-packager.ts` (`packageEctdSubmission`): refuses FDA 1789 (a file in a
  Module 4/5 study section that no Study Tagging File references) as a `ValidationError`, naming the generated package
  file name; and refuses a device pathway at the FDA backbone with a sentence naming `fda.applicationType` and `fdaat1`.
- `server/routes/ectd-export.ts` already answers a packager `ValidationError` as 422 `PACKAGE_VALIDATION_REFUSED`
  (2026-11-10); the assemble route was the one door that did not.
- `shared/regulatory/submission-type-bridge.ts` (`resolveToRegistryEntry`): the registry entry carries
  `segment` (`medical_devices`, `diagnostics_ivd`) and `submissionFormat` (eSTAR, eCopy). Used, not duplicated.
- `shared/regulatory/global-document-registry.ts` (`isDeviceRegistryEntry`): the registry's one device predicate
  (device and diagnostic segments, and cross-cutting entries whose every product class is a device or an IVD). The
  packager's `isDeviceFiling` calls it; it does not re-implement it (repair, verifier V-W2-4).

## What was hidden, unreached or wrong

- B2 / lane 2: "Assemble a test package" answered 500 "Request failed." on all three demo sequences (C2C-101 IND,
  LMN-201 IND, NeuroPanel-Dx 510(k)); the server log held the real reason (FDA 1789). Seen again on 5240 on
  2026-11-12: `before-assemble-5240.txt`.
- The refusal named files as `protoco-vault-documents-<uuid>.pdf (section m5.3.5.1 ...)`: an id a person cannot place.
- The 510(k) was held to the drug Study Tagging File rule (1789 is a CDER/CBER eCTD validation; FDA receives a 510(k)
  as eSTAR). Past it, the device refusal spoke in code terms (`fda.applicationType`, `fdaat1`).
- A packager refusal left no ECTD_ASSEMBLE_BLOCKED row.

## What changed

- `assemble-from-core.ts`: `refusedByPublisher` converts the identity refusal (unchanged) and every packager
  `ValidationError` into `EctdAssemblyBlockedError`, writing ECTD_ASSEMBLE_BLOCKED (reason `package_validation`, the
  findings count) and carrying the packager's findings. Anything else passes through unchanged. The route's existing
  422 branch now answers it. `assembleSequence` got shorter (151 -> 144 lines).
- `regional-packager.ts`: the 1789 check moved, unchanged in rule, into `refuseUntaggedStudyFiles`. It names each
  document by its title and its section without the "m" prefix; the findings keep the file name. A device or
  diagnostic filing is not held to it, whether it is named by its submission type or only by `fda.applicationType`;
  "device" is decided by `isDeviceRegistryEntry`. A leaf with no title is named by its file name. `refuseDeviceFilingOnEctd` says the device fact in words: "A 510(k) Premarket
  Notification is a device filing, not an eCTD sequence, so no eCTD package is assembled for it. FDA receives it as
  eSTAR. ... Nothing was assembled." The reason and the error type are unchanged; drug and non-US pathways keep the old
  sentence. It sits beside `isDeviceFiling`, so `buildFdaBackbone`'s long comment stays directly above
  `buildFdaBackbone` (repair, V-W2-5).
- `server/services/ectd/__tests__/stf-coverage-1789.test.ts` (repair): the `pack` helper takes an optional filing
  override, and three cases were added: a De Novo IVD filing (diagnostics segment) with an untagged 5.3.1.4 report is
  refused only as a device filing, never for 1789; a filing named a 510(k) only by `fda.applicationType` is never
  refused for 1789; an untagged leaf with an empty title is named by its file name, never by `""`.
- `server/routes/submissions.ts`: not changed (its 422 branch already existed; the file is over 100,000 bytes).
- Nothing was removed from any screen (P-122): the screen now shows the server's sentence where it showed
  "could not be confirmed — Request failed".

## Proof

| Row | Before | After | Test | Screenshot |
|---|---|---|---|---|
| B2 IND, untagged 5.3.x file | 500 "Request failed." (`red.txt`, `before-assemble-5240.txt`) | 422 ECTD_ASSEMBLE_BLOCKED, "FDA validation 1789 ... "Bioanalytical method report" (section 5.3.1.4, no study id) ...", audit row recorded | `server/services/ectd/__tests__/assemble-from-core.package-refusal.pglite.test.ts` (route through supertest on PGlite, real `assembleSequence` and packager) | `shots/before-ind-1440.png`, `shots/before-ind-390.png` (before); after needs the 5240 restart (see rewalk) |
| B2 510(k) | 500 (1789) | 422 naming the device rule only, never 1789 | same file, third test | `shots/before-device-1440.png`, `shots/before-device-390.png` |
| B2 diagnostic (IVD) filing | not tested (V-W2-1) | refused only as a device filing, never 1789 | `stf-coverage-1789.test.ts`, De Novo IVD case | none (no IVD sequence in the demo) |
| B2 device named by `fda.applicationType` only | not tested (V-W2-2) | never refused for 1789 | `stf-coverage-1789.test.ts`, 510(k) by application type | none |
| B2 untagged leaf with no title | not tested (V-W2-3) | named by its file name, never `""` | `stf-coverage-1789.test.ts`, empty-title case | none |

- Red first: `red.txt`, 3 of 3 failing for the right reasons (ValidationError not converted; 500; the 510(k) refused for 1789).
  `red.txt` records an earlier form of the third test, which expected 200. The final form (422 with the device
  sentence, never 1789) was never run red before the code; it is shown failing by mutation M3 in `mutations.txt` and
  `mutations-repair.txt` (device sentence removed), and by the verifier's mutation V8 (V-W2-7).
- Repair (verifier V-W2-1 to V-W2-3): the three new `stf-coverage-1789` cases went in after the code they test, so
  their red is by mutation: M7 (diagnostics not a device), M8 (`fda.applicationType` ignored) and M9 (always the
  quoted title) each fail them (`mutations-repair.txt`).
- Green: `green2.txt`, 22 of 22 (author). After the repair, `green3.txt`: 33 of 33 across the lane test,
  `stf-coverage-1789.test.ts`, `fda-filing-identity.test.ts` and both assemble audit-outcome tests.
- Mutations: `mutations.txt`, 6 of 6 caught (author). After the repair, `mutations-repair.txt`: 9 of 9 caught (the
  six again, plus M7, M8, M9), run over the lane test, `stf-coverage-1789` and `fda-filing-identity`, with fresh
  checksums taken after the repair; every file restored to its sha256.
- Every test that imports a changed module: 102 files, 1,064 tests, all passing before the repair
  (`importers-0*.txt`). After the repair, every test that imports `regional-packager`: 31 files, 374 tests, passing
  (`importers-repair-packager.txt`). `assemble-from-core.ts` was not changed by the repair.
- In the running app (5240, as Ana, 1440 x 900 and 390 x 844, DSF 2): Submission Center, Dispatch, Assemble a test
  package on C2C-101 and NeuroPanel-Dx: both show "could not be confirmed — Request failed" and record
  `500 POST /api/submissions/sequences/{2,3}/assemble`; no horizontal overflow at 390 (`walk-before-phone.txt`).
  5240 runs the server code loaded at 23:40 UTC on 2026-11-11, so it shows the before state.
- ESLint: no warning gained on either file (HEAD and tree compared; `buildFdaBackbone` stays at 18, `packageEctdSubmission`
  falls from 59 to 58 and 360 to 340 lines). After the repair, `check-pushed-lint-warnings.mjs --base HEAD` lists none
  of the lane's files. No file crosses 100,000 bytes (83,275 and 35,594). No client change, so
  `ci:undefined-css-classes` is unaffected.

## Not done here

- In-app "after" at 1440 and 390: the server change needs a restart of 5240, which is the lead's. 5220 (cadmin) holds no
  submission, sequence or leaf to assemble. Proven at the HTTP layer; the lead's rewalk is in the lane result.
- Seed half of B2 (lane L3, `scripts/demo/launch-demo/packs/biotech.mjs`, `lumen*.mjs`): C2C-101's protocol and SAP at
  5.3.5.1 should carry a study id and STF file-tags (`protocol-or-amendment`, `statistical-methods-interim-analysis-plan`);
  the LMN-201 copy's three leaves sit at placeholder sections "5.3.5.xxx" and "4.2.3.xxx" with no study id and should be
  placed at real sections with their `stf` entries from `lumen-vault-content.mjs`. NeuroPanel-Dx needs no STF.
- Freeze, dispatch and readiness (`assertSequencePackageable`) receive the same sentence through `unassembledRefusal`.
  Transmit does not (V-W2-6, corrected): `transmitSequence` (`server/services/submission-service/submission-service.ts`)
  calls `assembleSequence` and rethrows, and POST /api/submissions/sequences/:seqId/transmit
  (`server/routes/submissions.ts`, this lane's file) sends it to `fail()`, so a packager refusal there still answers
  500 "Request failed.", as the ValidationError did before. Unchanged here: the brief keeps this lane's
  `submissions.ts` change to the assemble catch, and transmit is reached only after dispatch, whose readiness check
  assembles first. Follow-up: the transmit catch answers `EctdAssemblyBlockedError` as 422, as the assemble catch does.
- Scoped typecheck, in part (V-W2-8). With `NODE_OPTIONS=--max-old-space-size=4096`: `regional-packager.ts` with
  `stf-coverage-1789.test.ts` completed with no error (one error in the new test was found by it and fixed);
  `assemble-from-core.ts` alone completed with no error in it (16 errors elsewhere, all from global request
  augmentations and untyped modules that a file-scoped config leaves out). The set with the route tests, the PGlite
  tests and `ectd-compile.ts` was killed by the memory limit (137) twice more while other lanes' tsc runs held the
  machine. The lead runs the verifier's tsconfig (`waveB-work/v-W2-assembly-refusal/tsconfig.json`) when memory allows.

## Questions for the founder

- None.
