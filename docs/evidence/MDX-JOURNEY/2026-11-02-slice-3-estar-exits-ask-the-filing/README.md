# MDX journey slice 3: the eSTAR exits ask whether the filing holds the document's text

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md`, the order of work after M5. Plan: F1. This implements
decision P-29.3 (`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`): *the device/IVD exit attests to the same thing, and
today attests to nothing.* The work is the completion of `server/routes/510k-estar-routes.ts`, the baseline entry
P-29.3 named. The scanner then found three more doors of the same kind.

## What already exists (RULE 3)

- **The question.** `filingAgreesWithEditing` (`server/services/c2c/filing-section-target.ts`) compares one editing
  document's sections (`authoring_sections`) with its bound filing (`c2c_document_sections`), node by node, using the
  approval's own rule (`signedFilingSectionTexts`). It writes nothing and runs on the caller's executor. The three
  drug-lane seals ask it (`authoring.router.ts` `filingBlocksSeal`, `sealRefusedForFiling`), and so does the QMS
  approval (`document-approval-signature.ts`). No device exit asked it.
- **The binding.** `authoring_documents.c2c_document_id`: text, a foreign key to `c2c_documents`, under a
  non-unique index (`migrations/20260728_authoring_document_governed_binding.sql`). `checkFilingWritable`
  (`server/services/authoring/document-lock.ts`) already reads it from the filing's side.
- **The device loaders.** `estar-content-leaves.ts` has `resolveDeviceContentScope`, `loadDeviceContentLeaves`,
  `loadAuthoredDeviceSections`, `loadGovernedDeviceSections` and `loadGovernedDeviceDocument`. That last one is the
  one tenant-scoped lookup behind every governed load.
- **The device exits.** `POST /build` (draft ZIP), `POST /official` (the official eSTAR; its section attachments
  come from `createDeviceAttachmentResolver` in `estar-attachment-plan.ts`), `POST /filing-readiness` and
  `GET /submissions/:id/readiness` (`assessFilingReadinessFor`), and `POST /assemble` plus the
  `assemble_device_submission` AnA tool (`loadProgramDeviceAssemblyInput`, `assemble-device-submission.ts`).
- **The remedy the refusal names.** The editor's Re-file saved text (`client/src/concept2cure/v2/editor/AuthoringRefileSavedText.tsx`).
- **The gate.** `scripts/ci/check-filing-exit-agreement.mjs`, its selftest, and the shrink-only baseline. That
  baseline held `510k-estar-routes.ts` (3) and `assemble-device-submission.ts` (2) as DEFECTS until the template
  vocabulary was fixed (M5, `be46895c97`, 2026-11-01).

Nothing was rebuilt. The new code asks the existing question from the filing's side, in the module that holds the
question, and adds a device wrapper beside the loaders.

## The defect

Every device exit built from `c2c_document_sections` and asked nothing of the text the author edits and signs:

| Exit | What it did with a rewritten filed copy |
|---|---|
| `POST /build` | Built the draft package from it. |
| `POST /official` | Attached it to a named CDRH slot of the official eSTAR. |
| `POST /filing-readiness`, `GET /submissions/:id/readiness` | Said "Can file now". |
| `POST /assemble`, `assemble_device_submission` | Said `official-estar` producible, with no blocker. |

The gate could not see two of these doors. It scanned for `loadDeviceContentLeaves` and `resolveDeviceContentScope`.
The official eSTAR's attachments and `/build`'s section load use `loadAuthoredDeviceSections`, and the EU technical
file uses `loadGovernedDeviceSections`.

## The change

- `filing-section-target.ts`: `filingAgreesWithBoundDocuments(client, { documentId, tenantId })` asks
  `filingAgreesWithEditing` of every editing document bound to a filing, scoped to the tenant. It returns `rewritten`
  (the `different` subset, which refuses) and `unfiled` (authored but never filed, which is reported). It also adds
  `divergedSectionLabel` and `filedCopyDivergedSentence`, the one sentence every device exit says. If nothing is
  bound, the question does not apply and the result says why. A failed read throws.
- `estar-content-leaves.ts`: `governedDeviceFilingAgreement(organizationId, programId, { client, docTypes })` resolves
  the document through `loadGovernedDeviceDocument`, the same lookup with the same `docTypes` the exit's loader runs.
  So the filing it compares is the filing the exit builds from.
- **`/build`** refuses with 409 `FILING_DIVERGED` ("Nothing was built. …"), naming the sections, and builds nothing.
  If the check itself cannot run, it answers 500 `FILING_AGREEMENT_UNAVAILABLE` and builds nothing. On success,
  `filingAgreement: { compared, documentId, unfiled, reason? }` is returned and is recorded in the export's governed
  metadata. A legacy scope reads `cerv2_510k_sections`, which is not the filing, so `/build` does not ask it.
- **The official eSTAR's attachments** refuse a rewritten section by name ("Section "E1" (Biocompatibility) was not
  attached. …"). The question is asked again at delivery (`assertCurrent`), so an editing copy that moved after its
  section was rendered refuses with 409 `FILING_DIVERGED`.
- **The two verdicts** (`assessEstarFilingReadiness`, `assembleDeviceSubmission`) take `filedCopyDiverged`.
  `canFileNow` and `canProduceOfficialEstar` become false. `artifactKind` becomes `none`, because `/build` would refuse
  the draft too. The result names the sections in `filedCopyDiverged` and adds one blocker. The callers pass the
  `rewritten` half.
- **AnA's readiness advisor** (`adviseDeviceReadiness`) passes `filedCopyDiverged` to the assembler. When it is
  set, the headline and the "Producible artifact" finding name the section and the remedy, not "required content is
  missing".
- **The gate** also scans for `loadAuthoredDeviceSections` and `loadGovernedDeviceSections`, and counts
  `filingAgreesWithBoundDocuments` and `governedDeviceFilingAgreement` as asking. Baseline: the two entries dropped to
  0 and were removed. The wider scan found two doors that existed before this change but could not be seen:
  - `assemble-technical-file-from-core.ts` (EU MDR/IVDR technical file): **DEFECT**, count 1. The same fix applies,
    but it needs `FILING_DIVERGED: 409` in `server/routes/submissions.ts`. That is M3's work (the IVDR door), next in
    the journey's order.
  - `cerv2-export-routes.ts`: **PROOF**, count 1. It never passes a `programId`, so it reads only the legacy single
    store, which its own editor writes (`cerv2-sections.ts`). There is no second copy to disagree.

  Net: 5 baselined sites in 2 files, with 4 doors unseen, became 2 baselined sites in 2 files, with every door seen.

Only `different` refuses, as at the seals. A section that was authored but never filed is already missing from the
package and from its readiness ("missing required sections"), so it is reported, not refused.

## Proof: it failed first

| Red, before the change | File |
|---|---|
| The official eSTAR attached a rewritten filed copy. An editing copy that moved under a rendered attachment was delivered. | `red/attachment-resolver-before.txt` |
| Both verdicts read a rewritten filed copy as fileable and producible. | `red/verdict-engines-before.txt` |
| AnA's readiness advisor said "Ready" over it. | `red/advisor-before.txt` |
| `/build` built it, `/assemble` called it an assemblable draft, the panel and the filing row said "Can file now". | `red/routes-before.txt` |
| The gate's selftest: a door through the section loaders passed. | `red/gate-selftest-before.txt` |
| The widened gate on the real tree with the old baseline: two doors it never saw, two entries now at 0. | `red/gate-real-tree-old-baseline.txt` |

| Green, after | File |
|---|---|
| Gate selftest (11 cases), and the gate on the real tree | `green/gate-selftest-after.txt`, `green/gate-real-tree-after.txt` |
| Tests | `green/tests-after.txt` |

The question runs against PostgreSQL (PGlite) in
`server/services/pathway-engines/estar/__tests__/estar-exits-ask-the-filing.pglite.test.ts`. The tables are shaped as
the shipped migrations shape them. The cases: agreement; a rewritten copy, named with the section the author opens;
an unfiled section; not bound; another organization; another organization's editing document bound to the same
filing id, never compared; and the export's own document class. The resolver is run for real against the same tables.
The route cases (`tests/routes/estar-export-governance.test.ts`, `tests/routes/estar-filing-row-gate.test.ts`) drive
the seam: does the exit ask, and does it act on the answer.

## Not done here, and where it goes

- The EU technical file: the DEFECT entry above. That is M3.
- AnA's `advise_device_readiness` in project mode. The advisor (`ana-advisory/device-market-advisor.ts`) now takes
  `filedCopyDiverged`. Given it, the advice is not "Ready" and names the section and the remedy, never "required
  content is missing" (`red/advisor-before.txt`). The tool's call site in `server/services/ana/AnaToolExecutor.ts`
  rebuilds the engine input field by field, so it drops the field. That file is held by the filing-types lane, and
  the one-line change (`filedCopyDiverged: a.filedCopyDiverged`) is handed to it in COORDINATION.md. Until it lands,
  that advice can say Ready over a rewritten filed copy. Every exit still refuses it, with the sentence above.
  `assemble_device_submission` passes the loader's input whole, so it already reports the refusal.
- `authoring.router.ts` `filingDivergedRefusal` names its nodes inline by the same rule as `divergedSectionLabel`.
  That file is held by the AI-architecture lane (`.design/claude-convergence/COORDINATION.md`). It converges onto the
  shared label when released; the request is recorded there.
- A screen was not opened in the running app for this slice. The change is server-side, and the refusals reach the
  existing surfaces as their error and blocker copy (`EstarFilingPanel`, `DeviceFilings`). Walking the journey in the
  running app is slice 5.
