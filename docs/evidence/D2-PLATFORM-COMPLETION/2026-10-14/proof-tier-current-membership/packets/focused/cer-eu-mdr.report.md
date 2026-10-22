# CER (EU MDR) — programme intake to the MEDDEV-shaped clinical evaluation export

The EU MDR clinical-evaluation path over HTTP against real canonical DDL: intake scaffolds the MDR/MEDDEV outline and anchors the programme to the PM spine, PubMed hits are recorded into literature_entries with no fabricated appraisal score and no invented publication date, the GSPR/structure assessment counts only authored sections, and the export delivers the MEDDEV-shaped section set audited-unplaced — with the un-authored section absent rather than invented.

**Result:** PASS — 11 ok, 8 blocked-as-expected, 0 failed

| # | Step | Kind | Status | Evidence |
|---|---|---|---|---|
| 1 | intake-creates-the-cer-programme-and-scaffolds-the-mdr-outline | action | ok | {"programId":"c5cb6f49-5d0b-4dff-9d9a-e5e69b862fc1","anchorProjectId":1,"anchorCreated":true,"docType":"cer","agency":"ema","rulePack":"eu-mdr-2017-745","outlineSections":9,"submissionId":null} |
| 2 | a-second-tenant-runs-the-same-intake-for-isolation-probes | action | ok | {"otherOrgProgramId":"30064e9f-3f3c-4cf1-84f9-3189d4803f19"} |
| 3 | record-pubmed-hits-into-the-organization-literature-corpus | action | ok | {"created":2,"notes":["entries enter the corpus unscreened — include/exclude appraisal is recorded separately, per appraisal stage and reviewer, through the literature screening path (POST /api/cerv2/literature/screen)", |
| 4 | the-stored-entries-fabricate-nothing-they-do-not-know | action | ok | {"entries":2,"publicationDate":"2023-01-01","relevanceScore":null} |
| 5 | re-recording-the-same-pmid-updates-and-never-erases | action | ok | {"rows":1,"corpusSize":2} |
| 6 | cannot-record-against-another-tenants-programme | known-bad | blocked-as-expected | {"blocked":true,"status":404,"error":"Program not found in your organization"} |
| 7 | a-blank-title-entry-is-refused-and-writes-nothing | known-bad | blocked-as-expected | {"blocked":true,"status":400,"error":"Invalid payload"} |
| 8 | without-an-organization-context-the-write-path-fails-closed | known-bad | blocked-as-expected | {"blocked":true,"status":400,"error":"Organization context required"} |
| 9 | author-the-meddev-shaped-clinical-evaluation-sections | action | ok | {"authored":7,"stored":7,"deliberatelyAbsent":"GSPR mapping"} |
| 10 | read-the-cer-structure-mdr-annex-xiv-meddev-2-7-1 | action | ok | {"stages":5,"sections":12} |
| 11 | assess-the-cer-structure-against-what-is-actually-authored | action | ok | {"ready":false,"missing":["summary","scope","evaluator_qualification","references"],"presentCount":7} |
| 12 | claiming-equivalence-adds-an-obligation-it-does-not-remove-one | known-bad | blocked-as-expected | {"blocked":true,"status":200,"missingWithEquivalence":5,"missingWithout":4} |
| 13 | docx-export-carries-the-authored-sections-and-invents-none | action | ok | {"bytes":9144,"authoredSectionsPresent":7,"gsprMappingPresent":false} |
| 14 | meddev-shaped-zip-is-delivered-and-registry-placed | action | ok | {"status":200,"governed":true,"artifactId":"artifact_1791961078636_e1780c18","meddevSectionSet":["01_StateOfTheArt.pdf","02_DeviceIntendedPurpose.pdf","03_ClinicalDataSet.pdf","04_CriticalAppraisal.pdf","05_BenefitRiskDe |
| 15 | an-org-with-no-authored-sections-is-refused-not-handed-an-empty-cer | known-bad | blocked-as-expected | {"blocked":true,"status":422,"error":"NO_AUTHORED_CONTENT","message":"No authored sections found for this organization — author section content before exporting."} |
| 16 | another-tenant-cannot-export-this-programme | known-bad | blocked-as-expected | {"blocked":true,"status":404,"error":"Project not found in your organization"} |
| 17 | governed-registry-placement-writes-artifact-and-provenance | action | ok | {"status":200,"artifactId":"artifact_1791961078721_7d68e2cb","artifactsBefore":2,"artifactsAfter":3,"provenanceAfter":3} |
| 18 | cannot-place-an-export-into-another-tenants-project | known-bad | blocked-as-expected | {"blocked":true,"status":404,"error":"Project not found in your organization","victimProjectArtifactsBefore":3,"victimProjectArtifactsAfter":3} |
| 19 | a-viewer-cannot-produce-a-governed-cer-export | known-bad | blocked-as-expected | {"blocked":true,"status":403,"error":"Insufficient permissions"} |

## Observations
- RESOLVED — the CER export shares the 510(k) export governance plane and inherited its blocking finding: artifactWriteback.ts / exportGovernance.ts INSERTed concept2cure_provenance_events.updated_at and regulatory_audit_logs.created_at/.updated_at, columns in NO schema lineage and no drizzle model, so registry placement 500'd on every database. Those column lists are corrected and the step now asserts placement completing. A uuid programme no longer takes the audited-unplaced path either, because the CER route now resolves the C1 anchor.
- FIXED, AND IT HAD TO BE FIXED IN THE SAME CHANGE — a numeric `projectId` in the export body was not org-checked: resolveExportRequest resolved `meta.ident` org-scoped (404 outside the org) but passed `data.projectId` straight through to the artifact registry, so a caller could file their own export into another tenant's project lineage. That was inert ONLY because the registry writeback above 500'd before reaching the insert. Reconciling the column list without also closing this would have converted a dead bug into a live cross-tenant write. resolveExportRequest now proves the supplied projectId belongs to the caller's org against `projects` — the table concept2cure_artifacts.project_id actually references — and 404s identically for "not yours" and "does not exist". Step "cannot-place-an-export-into-another-tenants-project" asserts it, and that the victim project gains no artifact row.
- Recording literature and appraising it are kept apart on purpose, and the route says so: the response carries screeningState:null plus the notes naming what the corpus table cannot hold (no program column; screening state recorded elsewhere). The journey asserts the notes are present and mention the program-binding limit rather than pinning their exact wording, because that wording is owned by the service constants.

## Known limitations
- PubMed retrieval (GET /api/cerv2/literature/search) is NOT exercised: it calls the live NCBI E-utilities API. This journey drives the WRITE path with caller-supplied hits, which is exactly what the search surface hands it. The search route's honest-degradation contract (available:false + unavailableReason on a network failure) needs a network fault injection and is covered by its own route test.
- Per-section PDFs are the PDFKit text fallback (puppeteer is not installed), so this journey asserts the MEDDEV-shaped file SET and real PDF bytes, not layout fidelity. The "nothing was invented" assertion is made against the DOCX, whose XML is directly readable.
- The Notified Body submission channel (EUDAMED / NB portal upload) is not exercised — there is no gateway to submit a technical file to in this environment.
- authMiddleware is replaced by a verified-principal middleware (see the 510(k) journey); the authorization decisions under test still run in the real routers.
- auditService's second sink (audit.tamper_proof_log) is not provisioned here, so each audited action logs one non-fatal tamper-proof-write failure; the chained audit_logs row this journey asserts is written first and independently.

_Rendered from the manifest JSON; the JSON is the truth source._
