# Saved CRF intake through the existing authoring HTTP route

## What already exists

- `server/services/study-design/study-design-repository.ts` reads the recorded `c2c.studyDesign.v1` design with `rowsToStudyDesign`; `crf-shell.ts` derives deterministic blank forms and honest gaps. Neither is a patient data collection system.
- `server/services/authoring/workflow-source-import.ts` materializes recorded workflow sources; `authoring-source-import.ts` owns preview, fresh fingerprint verification, explicit organization-source association, controlled creation and exact actor draft reuse.
- `authoring-from-draft.ts`, the revision ledger and canonical migrations own the saved working copy, source-copy lineage and audits. Existing authoring document/section HTTP reads and section PATCH remain the editor's read/write paths.
- `import-source-references.ts` owns independent saved import identity/current-source verification. This fixture exercises it against the persisted CRF provenance instead of inventing another verifier.
- `_authoring-canvas-fixture.ts`, `_authoring-record-fixture.ts` and the golden-journey PGlite harness supply the existing real JWT, canonical authoring DDL, current project access prerequisites and query trace. Only the database binding is redirected; no parser, projection, importer, writer, permission decision or JWT verification is mocked.

## Meaningful RED

`red.json` / `red.log.gz` record the existing POST `/api/authoring/import/source` refusing the exact saved CRF selector with **400 SOURCE_REQUIRED**, where the prepared preview assertion expects 200. The single failing test ran against unchanged production sources (`sourceDrift: []`). `source-freeze-red.json` pins those source bytes and `red-test.ts.gz` retains the exact original test bytes; later coverage growth does not overwrite this receipt.

Two setup runs are retained separately and are **not product RED**: `fixture-setup-*` exposed the shared JWT mint helper's absent editor role; `fixture-reason-*` exposed the binary fallback route's required reason. The fixture was calibrated to a real signed member JWT, the existing request SQL client binding and a valid reason before the product RED. These are fixture corrections, without production edits or weaker assertions.

## Final GREEN

`final-green.json` / `final-green.log.gz`: **27 tests passed**. `final-lint.json` / `final-lint.log.gz`: strict scoped ESLint **0 errors / 0 warnings**. Both receipts report `sourceDrift: []` against `source-freeze-final.json`. `frozen-source-*` archives preserve those exact inputs. `verification.json` checks the current source pins and raw log integrity.

The owned real HTTP fixture checks exact identification/gap/form sections; all projected items, visit IDs, origins and available CDASH hints/units/placeholders; ignored client prose/status/model claims; source-copy revision hashes and workflow import spans; original source immutability; actual document/sections GET, a governed section PATCH and edit-preserving reuse; persisted identity and independent fresh-source verification; design, metadata and timestamp drift; tenant/target/private project/current actor/membership refusals before source content; explicit organization association; exact selector validity and contradictory design identities. A separate literal-value case preserves hostile-looking title/item/eligibility text as escaped editable text, independently checks source and saved-copy hashes and refuses active markup. Final cases exercise direct null identity admission with zero SQL, malformed saved null identity and present invalid saved program identities.

Two intermediate **23 tests passed** receipts remain: `initial-green.json` records the owner's selector/verifier lint refactor during the run, and `green.json` records the later explicit null-identity type guard. Their runners correctly failed drift verification despite all tests passing. They are not the final no-drift proof. No behavior assertion was weakened to reach GREEN; the final fixture adds the requested direct admission and saved identity edge cases. Test-only explicit SQL row types and splitting the fixture's describe blocks keep compiler/lint contracts intact.

Tests run only this focused file. The control tower owns broader regression/compiler/build and publication. The six changed production files, existing parser/projector/helper, writers/readers and test setup are pinned together. The final worker review found no concrete source admission or saved-verifier blocker within this bounded path.

## Limits

This is isolated local automated PGlite qualification with real authoring migrations and a minimal explicit `cdisc_prm_studies` source table containing the selected saved-study columns. It does not prove native PostgreSQL concurrency/RLS, production schema integration, model quality, subject data collection, CDASH certification, SDTM annotations or clinical/regulatory validation. No provider, live clinical records or network call is used. Human cases: **Not run**.
