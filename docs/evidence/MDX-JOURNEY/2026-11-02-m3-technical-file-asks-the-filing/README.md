# MDX journey M3, server half: the EU technical file asks whether the filing holds the document's text

From `.design/client-journey/MDX_JOURNEY_2026-11-01.md` M3 and the DEFECT entry that slice 3 recorded
(`docs/evidence/MDX-JOURNEY/2026-11-02-slice-3-estar-exits-ask-the-filing/`). Plan: F1. Decision P-29.3
(`docs/EXIT_ATTESTATION_DECISION_2026-10-18.md`).

## What already exists (RULE 3)

- **The exit.** `assembleTechnicalFileFromProgram` (`server/services/pathway-engines/mdr-ivdr/assemble-technical-file-from-core.ts`)
  builds the EU MDR/IVDR technical-file ZIP from the program's governed `mdr` or `ivdr` document through
  `loadGovernedDeviceSections`. `POST /api/submissions/programs/:programId/technical-file/export` (`server/routes/submissions.ts`)
  calls it. No screen calls that route yet; reaching it from the IVDR door is M3's UI half.
- **The question, in its device form.** `governedDeviceFilingAgreement` (`estar-content-leaves.ts`, slice 3) resolves the
  document through the same `loadGovernedDeviceDocument` lookup, by class, and asks `filingAgreesWithBoundDocuments`.
- **The sentence.** `filedCopyDivergedSentence` (`filing-section-target.ts`, slice 3).
- **The status mapping.** `submissions.ts` maps a service error's `code` through `CODE_STATUS`. The assembler's
  `NoAuthoredTechnicalFileContentError` (`NO_AUTHORED_CONTENT` → 422) is the pattern followed.

## The change

- The assembler asks `governedDeviceFilingAgreement(organizationId, programId, { client: pool, docTypes: [regulation] })`
  right after the section load. A rewritten filed copy throws `TechnicalFileFilingDivergedError` (code `FILING_DIVERGED`):
  "The technical file was not assembled. …", naming the section and the editor's Re-file saved text. Nothing is staged
  and nothing is audited as assembled. A filing no editing document is bound to is not applicable. A failed read throws.
- `submissions.ts`: `FILING_DIVERGED: 409` in `CODE_STATUS`. That is the only change in that file.
- `scripts/ci/filing-exit-agreement-baseline.json`: the DEFECT entry dropped to 0 and was removed. What remains is
  `cerv2-export-routes.ts`, a PROOF (the legacy single store).

## Proof: it failed first

| | File |
|---|---|
| Red: the assembler assembled over a rewritten filed copy. The route sent the unmapped code down its generic 500 path. | `red/before.txt` |
| Red: the gate with the old baseline, an entry now at 0 | `red/gate-old-baseline.txt` |
| Green: the gate, 1 baselined site in 1 file | `green/gate-after.txt` |
| Green: tests | `green/tests-after.txt` |

`technical-file-asks-the-filing.pglite.test.ts` runs the assembler against PostgreSQL (PGlite). It uses the harness's
leaf materializer and governed store, plus the editing store shaped as the shipped migration shapes it. The cases: it
assembles when the filing agrees; it refuses a rewritten copy, naming it, and writes no assembly audit row; a filing
with no bound editing document is not applicable and assembles.

`assemble-technical-file-vault-uuid.pglite.test.ts` fails in this neighbourhood: its fixture has no
`company_legal_registry`. It fails identically with HEAD's sources (`../2026-11-02-slice-3-estar-exits-ask-the-filing/green/pre-existing-failures-at-head.txt`).
It is not this change's.

## Not done here

- M3's UI half: an EU IVDR project's "Assemble the technical documentation" still opens the FDA eSTAR screen
  (`IvdSurface.tsx`). Reaching this route from that door is device-screen work. The device screens are in no design
  package (the journey's founder question 1), and the R1 lane (`01QoxbL`) is named for the reach.
