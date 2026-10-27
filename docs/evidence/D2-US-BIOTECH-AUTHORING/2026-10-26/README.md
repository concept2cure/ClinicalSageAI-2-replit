# US biotech authoring completion

W1 / D2. Contract: `docs/design/US_BIOTECH_AUTHORING_COMPLETION_2026-10-26.md`. Local/Codespaces only. Canonical direct normal publication, no PR/deployment/provider/agency action.

## What already exists — discovery before implementation

- Canonical filing registry and blueprint/task owners: `shared/regulatory/global-document-registry.ts`, `filing-catalog.ts`, `project-bootstrap.ts`, dedicated blueprint catalogs. No second registry.
- Existing outline/metadata/editor projection owners: `server/services/market-specs/document-template-library.ts`, `lifecycle-record-outlines.ts`, `ind/ctd/lifecycle-document-types.ts`, `regulatory/templateCatalog.ts`, `authoring/builtin-authoring-templates.ts`. Core clinical outlines are present but exact metadata omissions disable AnA in those starts; detailed lifecycle subtypes lack starts. Whole filings retain preparation policy.
- Existing CMC contentType policy in the CTD record is lost by `ctd-component-outlines.ts`; exact standalone components can expose source-supported narrative while original data stays manual. Existing PLR section records and seven-part nonclinical working-report records can be reached in the same library, with US label applicability/original SPL and original GLP/signature/tabulation limits. Their separate legacy PI/unretained-job stores are not claimed as verified project source lineage.
- Existing IND deliverable selection in `authoring/ind-authoring-templates.ts` maps the early protocol outline to a broad study-report/CSR tree and SAP to one heading despite detailed protocol/SAP owners. Correct selection, not duplicate outlines.
- ProjectPlan, AuthoringCreateExport and AuthoringTemplatePicker own project-to-editor starts. Non-IND/device plans and filing-guided suggestions are incomplete. DocumentWorkbench remains the sole editor.
- Existing workflow-copy/source admission and governed authoring writers own provenance, drift, current access and saved versions. Respond/AgencyResponses plus response-service own questions/answer revisions/signatures/packages; complete their same-editor bridge without another answer writer.
- `registryCoverage.ts` and `regulatory-coverage-report.ts` own measurement. `docs/biotech/BIOTECH_DOCUMENT_COMPLETION_MATRIX.md` withdrew lexical claims; extend it with current facts/evidence. Existing competitive analysis has unsupported claims and is corrected against current public vendor/FDA sources.
- Existing Pino logger stdout diagnostics interfere with larger machine-readable report output. Retained report failures/diagnostic captures show truncation, interleaving and a failed synchronous-pipe approach. An explicit CLI stderr destination in the same logger preserves diagnostics/redaction and normal server behavior; no assertion is relaxed.

Full discovery paths, limits, deleted-name search, cross-segment vaccine-EUA/RFD gaps and contracts are in the design. Template presence, blueprint readiness, an editable working copy and actual filing readiness are different facts. All human/live-provider/agency results remain unqualified unless separately recorded.

## Implemented through the existing owners

- Exact clinical metadata admits source-supported protocol, IB, SAP, ICF, DSUR and PBRER narrative, retaining manual original records. Existing saved manual snapshots remain manual. IND protocol/SAP deliverables now select their own canonical records.
- Twelve distinct existing lifecycle records expose 76 parts (59 source-supported narrative, 17 manual) through the same builtin template intake. Canonical CMC content-type policy, USPI and nonclinical working-report sources retain original-data/signature/structured-label limits. US regional Module 1 and global Modules 2–5 expose exact preparation workspaces; a global Module 1 is not fabricated.
- Non-IND biotech projects receive filing-specific plans and template recommendations through the shared create/recovery/editor flow. Exact recorded catalogue identity and canonical registry identity retain separate semantics. Blank documents have no invented CTD module. Current session, actor, project and modal visit ownership guard both reads and writes.
- Authority answers enter DocumentWorkbench through the existing source-copy intake. Explicit saved-section writeback uses the existing governed answer writer, exact source/version checks and source/AnA provenance. Question-level approval and package controls remain authoritative. Unsupported rich text and pending changes fail atomically rather than silently losing content.
- The existing coverage CLI reports actual editor identities and section policies separately from static blueprint backing. Its JSON output is a single complete value, with diagnostic logging preserved on stderr. The existing biotech matrix and competitive review distinguish reviewed capabilities, fixture evidence and remaining gaps.

`clinical/`, `medicinal/`, `lifecycle/`, `project/`, `haq/`, `ind/`, `report/` and `qualification/` retain owned RED failures, setup/calibration issues, final scoped checks and source pins. Their overlapping test counts must not be added.

## Canonical reconciliation

The workstream source checkpoint is `14b27100d9006ed3719597630bd93a747b736c89`. A normal merge `1b9c3e89d6d85a5cfe61ee93560d3d279cc7f7e2` preserves incoming filing catalogue/lifecycle and account changes. Three small source conflicts retained both features; `canonical-integration-notes.json` records the exact decisions. The first combined lint caught one additive serializer complexity warning; a small pure exact-filing lookup restores the existing warning limit. Original failure and corrected receipts remain.

## Final automated qualification and publication

Lead qualification is in progress. Final receipts, source publication and artifact manifest will replace this paragraph before the final evidence push. No scoped count is represented here as a combined result.

## Practical limits and human testing

No blanket US biotech coverage, regulatory correctness, Weave superiority/parity or agency acceptance is established. The current [biotech matrix](../../../biotech/BIOTECH_DOCUMENT_COMPLETION_MATRIX.md) lists specialty/form/biologics reporting, medicinal EUA/RFD, exact meeting starts, sponsor-template binding and structured-output/channel gaps. Company formatting-template storage and UUID editor templates are existing separate owners; this work does not claim complete sponsor Word-template binding or arbitrary formatting fidelity. Whole filings/modules remain source preparation where specified.

The local [human-testing worksheet](../../../testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md) retains 163 Not run cases, including this increment's 147–163. No live provider/model competence, agency dispatch, deployment, native PostgreSQL/RLS/concurrency or human acceptance was performed in this workstream. HTTP/JWT/PGlite fixtures use controlled test actors/data; successful response package evidence includes explicitly seeded independent current-digest approval standing, not a live signing ceremony. Known source/AnA provenance is retained; its qualification hold is not silently removed.
