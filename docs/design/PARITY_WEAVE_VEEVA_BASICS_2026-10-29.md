# Parity with Weave and Veeva Basics, and where we go further: measured 2026-10-29

**Status:** proposal. This document moves no launch row by itself. Each slice in §7 names its row, its workstream and the evidence it files.

**Measured at:** `e7736eea6`, the HEAD of `concept2cure-v2` on 2026-10-29.
- It contains `f9f0dee12` (Quality reaches the CAPA register) and `c9f14b5b9` (raise a CAPA from a nonconformance or an internal audit).
- An earlier draft of this document said it was measured at `432a00e7a`. That commit predates both, so it cannot support the CAPA corrections the draft made. The draft was wrong on that point.
- The domain inventory was read at `8b58354af` (authoring), `556735798` (submissions), `dc9e22a1f` (quality) and the day's head (clinical).

**Line numbers:** every `file:line` in this document was re-resolved at `e7736eea6`. Where an inventory line number could not be re-resolved, the line number is dropped and only the path is kept.

**Not counted:** at measurement time, the working tree held uncommitted QMS changes. They were this session's own, not another session's as first written. They landed afterwards as `ee828c24d` (CAPA action items) and the G1 commit:
- `client/src/concept2cure/quality/CapaActions.tsx` (new);
- `QmsRecords.tsx`, `qmsRecordData.ts`, `app.css`;
- `shared/constants/capa-lifecycle.ts`, `server/services/capa-mdr/stateMachine.ts`;
- the P-48 evidence README.

They were treated as in flight, not landed (§2.2, G9). They have since landed.

**No tests were run for this document.** The figures in §2.5 come from greps and one read-only script.

**Binding rules:** `CLAUDE.md` RULE 2 (no new capability outside the launch catalog until D1–D10 are green) and RULE 3 (search first; name the work "complete", "reach" or "fix").

**Builds on, does not replace:** `docs/design/WEAVE_GAP_2026-10-23.md`, `docs/design/VEEVA_GAP_2026-10-22.md`, `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md`.

---

## 1. Purpose and the founder's ask

The founder, 2026-10-29, as recorded under decision P-48 in `docs/LAUNCH_DEFINITION_OF_DONE.md`:

> "we need to offer everything www.weave.bio does and much more plus what Veeva basics offers biotechs"

The same direction was given twice the week before:

- 2026-10-22 (`docs/design/VEEVA_GAP_2026-10-22.md`): *"Continue to close the gap between what we do and what biotechs currently get from Veeva."*
- 2026-10-23 (`docs/design/WEAVE_GAP_2026-10-23.md`; the work-order board, `docs/work-orders/README.md:50`): offer what Weave and Veeva Basics give a biotech.

This document puts both benchmarks into one matrix against the code at `e7736eea6`. It then:

1. names what we already do better than both vendors, but only where it is reachable in production;
2. lists what is built but not yet proven;
3. splits the gaps in two:
   - gaps inside the launch catalog, which can be worked now (§5);
   - gaps that would widen the catalog, which are the founder's decision under RULE 2 (§6).

It does not say we do everything Weave does. `docs/competitive-analysis-weave-bio.md:32` sets the completion rule: *"There is no supported statement that Concept2Cure does everything Weave does, exceeds it, or is ready for every biotech filing."* That rule still holds. §4 makes narrower claims. Each comes with a path, with the evidence it rests on, and with its caveat.

### 1.1 Research basis, and why the vendor pages could not be opened

The question relayed with this task was *"Why won't your work?"*. Part of the answer is here.

- **Every page fetch was blocked.** The research could not open a single vendor page. These hosts failed with `getaddrinfo ENOTFOUND`: `www.weave.bio`, `hlth.com`, `veevabasics.veeva.com`, `veeva.com`, `www.veeva.com`, `www.nasdaq.com`, `www.webull.com`. The session's network policy does not allow them.
- **Search still worked.** So every competitor finding below comes from search-result excerpts of the cited URL, not from reading the page.
- **The same policy blocks D7.** The DoD row D7 records a 403 on CONNECT to `www.fda.gov` and `admin.ich.org` when D7's DTDs were fetched.
- **How to fix it.**
  1. Open the cloud environment menu in the session's title bar and choose Edit, then Network access.
  2. Choose a broader access level, or add the hosts below under Allowed domains and leave "Allow package managers" ticked. Allowed domains appears under the Limited level. An app that has not updated shows it under Custom, with a box to include the default package managers.
  3. Re-run the research step.

  The steps are at https://code.claude.com/docs/en/cloud-environments#network-access.

The hosts to allow come from every URL this document cites. They are grouped by what each would verify:

| Host | What it would verify |
|---|---|
| `www.weave.bio` | Every Weave (V) row from Submission Builder, Platform, the home page, the release notes, the HAQ Manager page, the newsletter, the news listing and the Takeda page |
| `weave.bio` (apex, a separate host) | The Weave security page (SOC 2, data retention, MFA) |
| `www.businesswire.com` | HAQ Manager launch and its metrics; NDA workflow; global submissions, the EU CTA template and the custom template builder; Series A |
| `newsroom.parexel.com` | The Parexel partnership and its 50% figure |
| `www.globenewswire.com` | The Annovis NDA customer |
| `arxiv.org` | The Takeda study specifics (UNVERIFIED today) |
| `intuitionlabs.ai` | Basics and Part 11/Annex 11; Basics against full Vault; pricing estimates; Weave's AI architecture (all third-party) |
| `veevabasics.veeva.com` | Every Basics app row: Submissions, Archive, Publishing, QualityDocs, Training, QMS, eTMF, CTMS, deployment, validation and support |
| `www.veeva.com` | The 2024 launch and the May 2025, November 2025 and October 2026 releases; Quality Cloud; the QMS and Registrations briefs; the eCTD 4.0 blog; the Safety implementation model; Study Startup; MedTech Basics; the Study Builder Agent |
| `veeva.com` (apex) | The clinical platform page |
| `ir.veeva.com` | AI Agents (2025); the 2026-10-07 release |
| `regulatory.veevavault.help` | Full Publishing: continuous validation and gateway |
| `pantheon.veeva.com` | The Basics Summit agenda (connectivity between apps) |
| `cdmshelp.veeva.com` | The CDMS overview |
| `www.prnewswire.com` | Spotline V-Assure; release mirrors |
| `kivo.io` | Registrations absent from Basics (a competitor's statement) |
| `www.fda.gov`, `admin.ich.org` | D7's DTDs (not research) |

**Verification legend used throughout:**

- **(V):** the research returned vendor-quoted text, from that URL or from the primary press release, in a search excerpt. The page itself was not fetched. If "confirmed" has to mean a direct fetch, read every (V) as UNVERIFIED.
- **UNVERIFIED:** anything the research marked verified=false. That covers:
  - sources that are third-party only;
  - teasers with no specifics;
  - roadmap items;
  - conflicting sources;
  - **every negative finding** ("not listed", "none found", "no public evidence").

  A negative finding is never marked (V), even when the page it came from is a (V) source.
- **Every Veeva finding is UNVERIFIED.** No Veeva host could be fetched.
- **"Not in the research"** means the research says nothing on the point. Such a cell carries no URL.
- **Performance figures** are vendor- or partner-reported.

### 1.2 Workstreams

RULE 2 asks each slice to name a W workstream. The launch playbook that defines W1–W7 **does not exist in the repository**. `docs/evidence/W4/2026-09-21/README.md` records that, and the collision it caused. The mapping below is inferred from the headers of the evidence directories.

| Workstream | Row(s) | Basis |
|---|---|---|
| W1 | D2 launch catalog | `docs/evidence/W1/2026-09-20/`, "Row moved: D2" |
| W2 | D1 hosted production, D3 tenant isolation | `docs/evidence/W2/2026-09-20/` |
| W3 (named "W3a" in W4's README) | D4 validation package | `docs/evidence/W3/2026-09-20/` |
| W4 | D4 | `docs/evidence/W4/2026-09-21/README.md`. Its own package was deleted and it converged onto W3a's. It holds no slice now. |
| W3b | D5 Part 11, D6 security | `docs/evidence/W3b/2026-09-20/` |
| W5 | D7 one real sequence | `docs/evidence/W5/2026-09-20/` |
| W6 | D9 commercial paper | `docs/evidence/W6/2026-09-20/` |
| W7 | D8 connector for Claude | `docs/evidence/W7/` |

`docs/evidence/WA` to `WP` are **one-day workers of 2026-09-21, not workstreams**. Each names the row it moved: WA D5; WB D4/D5; WC D4; WD D1/D3; WE D4; WF D4; WI D2. WJ, WK, WO, WO2 and WP name a defect or surface. WM and WN have no README header. This document assigns them nothing.

D10 (one customer) is the founder's alone.

---

## 2. What already exists

### 2.1 Prior analyses, by path

| Path | Date | What it covers | What holds at `e7736eea6` |
|---|---|---|---|
| `docs/design/WEAVE_GAP_2026-10-23.md` | 2026-10-23 | Weave against the code. Three in-catalog items (`:144-148`): (1) the letter parser and the phantom tool names; (2) a drafted response inside the response record, with lineage; (3) per-citation verification in Review. Plus three founder decisions. | The lane is **claimed** by session `…01E8btkB8mcLirW4rNvsMNxK`. Its row says "Waiting on the founder: decision 1…" (`docs/work-orders/README.md:50`). The same session claimed the CSR-path lane on 2026-10-29 and is active there (`:51`). No `docs/evidence/D2-WEAVE-GAP/` exists. Items 1–3 are not released (§8, Q3). |
| `docs/design/VEEVA_GAP_2026-10-22.md` | 2026-10-22 | Vault RIM, DMS and QualityDocs against the code. | Its six fixes landed. Review routing (gap 4) is open. Training assignment waits on NEW-2 and NEW-3. |
| `docs/design/RIM_GAP_ANALYSIS_2026-10-18.md` | 2026-10-18 | The RIM task map, the duplicate stores, decisions P-37 to P-39. | Next item 1 (complete the eCTD viewer) and item 2 (extract questions from the letter) are open. Item 3 is done (P-41). |
| `docs/design/VAULT_VEEVA_PARITY_PLAN_2026-09-24.md` | 2026-09-24 | Vault and the data room against Veeva Vault. | Many rows are overtaken (versions, viewer, where-used, legal holds, filters). The file says to verify against HEAD before building. |
| `docs/competitive-analysis-weave-bio.md` | reviewed 2026-10-26 | The Weave benchmark and the completion rule (`:32`). | Holds. |
| `docs/design/US_BIOTECH_AUTHORING_COMPLETION_2026-10-26.md`, `docs/design/US_BIOTECH_FILING_COMPLETION_2026-10-27.md`, `docs/biotech/BIOTECH_DOCUMENT_COMPLETION_MATRIX.md` | 2026-10-26/27 | Coverage and limits per document type. | Used for the document-type rows. |
| `docs/evidence/D2-FILING-TYPE-TEMPLATES/2026-10-18/FOUNDER-DECISIONS-OWED-2026-10-26.md` | 2026-10-26 | Founder decisions owed. Row "2 (R-1)" asks which nonclinical store AnA's 2.4/2.6 read, and recommends `nonclinical_studies`. | R-1's record. Open. |
| `docs/evidence/RULE2/2026-10-26-model-figures-audit/design.md` | 2026-10-26 | The Rule 2 audit of model-supplied figures. Its F1–F8 are R-1 to R-8. | R-1's second record. |
| `docs/evidence/D2-ONE-ANA/2026-10-29/p48-quality-records/README.md` | 2026-10-29 | P-48: Quality reaches NCR, suppliers, audits, management reviews and CAPA. | Committed version "Owed": CAPA action moves and detail, management-review actions, staging screenshots. The uncommitted draft in the working tree lists CAPA actions as done. |
| `docs/evidence/D5/2026-10-29-csr-scientific-review-step/` | 2026-10-29 | The reviewer maps each figure in a CSR's saved text to a retained table cell and attests, inside the review decision. | The nearest existing piece to per-citation verification (G6). |
| `docs/work-orders/MR-09-authoring-filing-grade-output.md`, `MR-12-qms-controlled-document-control.md`, register `MR-findings-2026-10-13.json` | 2026-10-13, re-checked since | Findings CAT1-\*, CAT2-\*, P11-03, AI-01 and their stages. MR-09 maps Stages 1, 2 and 4 to D7 and D10 (`:506`). MR-12 has no distribution stage. | Open findings are cited row by row. |
| `docs/audit-2026-07/13-competitive-scorecard.md` and `13-competitive/*.md` | July 2026 | Scored category profiles. | Stale on reach and on several engineering claims. The inventory corrects each. |
| `docs/COMPETITIVE_LANDSCAPE_2026-08.md`, `docs/COMPETITIVE_POSITION_DELTA_2026-08.md`, `docs/COMPETITIVE_LANDSCAPE_AUDIT_2026-07-18.md` | Jul–Aug 2026 | The landscape. | **Not re-read for this document.** |
| `docs/SURFACE_DECISIONS_2026-10-08.md` | 2026-10-08 | Catalog decisions and the "coming later" families. | Holds. |

### 2.2 Corrections found at `e7736eea6`

These correct the inventory, the prior documents or this document's earlier draft.

- **CAPA in Quality.**
  - Quality reaches the CAPA register. The quality surface claims `/api/capa-mdr/capa` (`shared/constants/ui-surface-registry.ui-v2.ts:686-688`), and `QmsRecords.tsx` has a CAPA tab (`f9f0dee12`).
  - A nonconformance or a started internal audit now raises its CAPA, carried as `sourceRefs` (`c9f14b5b9`). The inventory's "a finding does not open a CAPA" is out of date.
  - CAPA action moves and the CAPA detail view are **in flight, uncommitted**, in another session's working tree (`CapaActions.tsx`). They are not counted and not proposed here.
- **The Nonconformances tab is not a deviation register.**
  - Its store is `qms_nonconforming_products` (`migrations/20260511_qms_and_labeling.sql:141-158`): `device_name`, `lot_or_serial`, and the dispositions `use_as_is`, `rework`, `regrade`, `scrap`, `return_to_supplier`. That is a nonconforming-product register.
  - Its description says "Deviations and nonconforming material" (`QmsRecords.tsx:249` at `e7736eea6`; `:211` at `f9f0dee12`; `:81` at `432a00e7a`), and P-48's own text speaks of "deviations and nonconformances".
  - `/api/qc/deviations` (`server/routes/qc.routes.ts:397-444`) is a stub. Reads return `[]` or `undefined`, writes throw `NOT_IMPLEMENTED` (`server/storage.ts:1495-1516`), no table exists, and no surface claims `/api/qc`.
  - The earlier draft's "the Nonconformances tab covers deviations" was based only on that description string, and it was wrong.
- **Device complaints are inside the launch catalog.**
  - `shared/constants/launch-scope.ts:71` lists `device-postmarket` in the Projects app, and that surface claims `/api/mdx` and `/api/capa-mdr` (`ui-surface-registry.ui-v2.ts:474`). So the complaints routes (`server/routes/capa-mdr.ts:184-279`) are not refused by `LAUNCH_SCOPE`.
  - On screen they are read-only, in the CER PMS tab. The postmarket board is off (`SURVEILLANCE_KEYED_TO_PROJECT = false`, `client/src/concept2cure/mdx/surfaces/PostmarketSurface.tsx:53`).
  - AnA's `create_complaint` has been inScope since 2026-10-26, per the amendment note in `ana-launch-scope.inventory.json`.
  - P-48 calls device post-market "hidden". That contradicts `launch-scope.ts` and is an open correction (§8, Q6).
- **The CTD module QC routes grade what the caller sends.**
  - The routes are `server/routes/authoring-pdf.routes.ts:67` (`/m2-summary/qc`), `:91` (`/m4-nonclinical/qc`), `:115` (`/m5-clinical/qc`) and `:135` (`/ctd-readiness`). They are POSTs over the request body.
  - The file says so itself (`:128-131`): "These caller-supplied verdicts do not load current governed program content".
- **AnA's 2.4/2.6 tools no longer take study figures from the model.** `server/services/ana/module2-nonclinical-inputs.ts` answers `needs_data` until R-1 is decided.
  - R-1 is recorded in `FOUNDER-DECISIONS-OWED-2026-10-26.md`, row "2 (R-1)", and in `docs/evidence/RULE2/2026-10-26-model-figures-audit/design.md`. The earlier draft said no decision document existed, and that was wrong.
  - **The two nonclinical stores are not reconciled.** R-1 recommends `nonclinical_studies`. But the ingest path writes `ctd_nonclinical_studies` (`server/services/preclinical/feature-flags.ts`), and so does the loader the orchestrator reads (`load-nonclinical-studies-for-project.ts`).
- **What the orchestrator's 2.4 step does in production.**
  - `server/routes/submission-orchestrator.ts:49`, `:692` call `loadNonclinicalStudiesForProject` only when a `ctdProgramId` is supplied.
  - With `PRECLINICAL_REVIEWER_ENABLED` off, the loader reads nothing and returns `[]`.
  - The step then records `skipped (no inputs)` (`server/services/submission-package-orchestrator.ts:1676`, `:1451-1454`).
- **Approved models: 16, not 17.** `server/services/ai-governance/approved-models.ts` holds 16 entries, each with `pq: { status: 'pending' }`, and 0 passed. The earlier figure of 17 was a grep that also counted the `PqStatus` type union at `:32`.
- **FDA forms.**
  - `docs/biotech/FDA_FORMS_FILL_STATUS.md` §3 records every form as `IMPLEMENTED_UNVERIFIED`.
  - 1571 and 3674 are filled through the XFA datasets on the official template, with reconstruction only as a fallback.
  - `templates/forms/acroforms/` holds 1571, 1572, 3454, 356H and 3674. **There is no vendored 3455 PDF**, and none was found anywhere in the tree.
  - The 1571 and 3674 manifests carry `assetTrusted: false`, left for a named reviewer.
  - The same file's row 2 ("stateless / ungoverned") disagrees with `server/routes/ind-forms.routes.ts`: `listFormPlacements` (`:287`) and `sendAuditedDownload` (`:392`). Re-verify before slicing.
- **The Weave-gap lane** is claimed and waiting on the founder (`docs/work-orders/README.md:50`). Its owner is active on another lane (`:51`). The earlier draft called the lane "idle" and proposed that a new session take it. That would repeat the collision recorded in `docs/evidence/W4/2026-09-21/README.md`. Items 1–3 start only when the founder or the owning session releases them.
- **The controlled-copy pieces already in Authoring.**
  - The working copy is stamped "DRAFT — uncontrolled copy" on every page, with id, version and status (`server/routes/authoring.router.ts:6537`, `:6573`).
  - The controlled export is offered only on a frozen or approved document (`client/src/concept2cure/v2/editor/DownloadMenu.tsx:52-54`).
  - An SOP's body is an Authoring copy: `qms_documents.authoring_document_id` (`db/migrations/20261014_qms_controlled_authoring_content.sql:20`).
- **There are three briefing-book assemblers.** See §2.3 and G14.
- **Submission consistency findings have a screen.** `SubmissionConsistency` is mounted at `SubmissionSeqWorkspaces.tsx:1420`.
- **Source refresh is reachable.** "Refresh all sources" calls `POST /api/authoring/docs/:docId/refresh-all` (`authoring.router.ts:5824`; client `DocumentWorkbench.tsx:3144`).

### 2.3 Inventory by domain (every claim with a path)

#### Regulatory authoring

| Capability | Status | Paths | Open gap |
|---|---|---|---|
| AI drafting from sources | Staging only | `server/routes/authoring.router.ts:3375` (`/ai/draft`, and `/ai/draft/accept`); project-scope refusal `:3440`; `server/services/authoring/authoring-draft-sources.ts`; `server/services/ana/draft-project-sources.ts`, `draft-source-window.ts`, `drafting-source-lineage.ts`; `client/src/concept2cure/v2/surfaces/AuthoringAiDraft.tsx` | All 16 entries in `approved-models.ts` have PQ `pending`, so production refuses governed drafting (MR-13 AI-01) |
| Editor and canvas | Launch | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx`, `RichSectionEditor.tsx` (TipTap 3), `DocumentCanvas.tsx` | Structural and formatting edits untracked (`RichSectionEditor.tsx:2394`, UX-16); no footnote insert (CAT1-23); live co-editing off (`client/src/flags/featureFlags.ts:74`) |
| Span lineage | Launch, partial | `server/services/clinical-regulatory-evidence/span-lineage.service.ts`, `source-attribution.ts`; `db/migrations/20260803_document_span_lineage.sql` | Walk-back readers `SourceTracer.tsx`, `DecisionLineage.tsx` are outside the catalog; hops A6, A9, A16, A20 of `docs/design/LINEAGE_END_TO_END_PLAN_2026-09-25.md` need re-verifying |
| Citations and their standing | Launch | `authoring.router.ts:2830` (cite-source), `:2923` (section citations), `:5824` (refresh-all); `client/src/concept2cure/v2/editor/citationNode.ts`, `citationAdmission.ts`; `shared/authoring/citations.ts`; `source-usage-projection.ts` | Six citation tables beside `authoring_citations`, not converged |
| Bibliographic citation check | Launch (AnA) | `server/services/citation-verification-service.ts`; `POST /api/citations/verify` (`server/routes/citations.ts:38`); AnA `verify_citations` (`AnaToolExecutor.ts:4788`, inScope) | Checks that a reference exists (PubMed, Crossref, retraction). It is not a reviewer's check that the source supports the text (G6) |
| CSR scientific-review step | Launch | `client/src/concept2cure/v2/surfaces/ReviewDecisionDialog.tsx`; `shared/authoring/csr-scientific-review.ts`; `server/services/authoring/csr-scientific-review.ts`; evidence `docs/evidence/D5/2026-10-29-csr-scientific-review-step/` | CSR only |
| Data room | Launch | `server/services/clinical-regulatory-evidence/data-room-processing*.ts`, `data-room-search.ts`; `server/services/vault/document-passage-search.ts`; `VaultDataRoomFiling.tsx`; `editor/DataRoomSourcesPanel.tsx` | XPT and Dataset-JSON are profiled for structure only |
| Document connectors | AnA only | `server/services/connectors/connector-registry.ts:73-79` (Veeva Vault, Medidata Rave, SharePoint, FHIR R4, OneDrive, Google Drive, Box); AnA `search_connected_repositories` (`AnaToolExecutor.ts:2304`, inScope) over `server/services/integrations/connector-search.ts`; `/api/deep-research` (the `deep-research` surface, outside the catalog) | No import that keeps folder structure, and no resync, found; `server/integrations/veeva-vault/*` unreachable; whether any tenant has a connector configured was not measured |
| Export, controlled copy, place into filing | Launch, partial | `server/services/authoring/authoring-export.ts` (`renderDocx` `:435`; PDF via LibreOffice `:546`); working copy stamped at `authoring.router.ts:6537`, `:6573`; `DownloadMenu.tsx:52-54`; `authoring-file-to-vault.ts`; `AuthoringPlaceIntoFiling.tsx`, `placeIntoFilingCopy.ts:28` | CAT1-09: no running header or footer, ID/version/status, page X of Y, TOC or Letter size on a controlled export. CAT1-18: place into filing files plain text |
| Module 2 | Launch, partial | `server/services/m2-summary-builders.ts`; `server/services/ana/module2-csr-inputs.ts`, `module2-nonclinical-inputs.ts`, `cmc-quality-summary-tool.ts`; `server/services/preclinical/m26-nonclinical-summaries.ts` (deterministic 2.6.1–2.6.7 composer), `nonclinical-m24-adapter.ts`, `load-nonclinical-studies-for-project.ts` | 2.4/2.6 wait on R-1. `migrations/20260628_csr_job_state.sql` is not in `C2C_MIGRATION_FILES`. CTD QC routes grade caller-supplied bodies and are unclaimed (`authoring-pdf.routes.ts:128-131`) |
| Clinical documents | Mixed | Protocol `ProtocolDevWorkspace.tsx`; CSR `server/services/ind/ctd/csr-e3-guidance.ts`; IB `server/services/authoring/ib-builder.ts`; DSUR `server/services/safety-reports/psur-dsur-service.ts`; annual report `server/routes/ind-lifecycle/filing.routes.ts:288` | DSUR is a structure only; the IB readiness surface is outside the catalog |
| Briefing book | Launch, partial | (1) `server/services/ind-lifecycle/ind-briefing-book-service.ts`, the engine of `POST /api/ind-lifecycle/briefing-book` and `/pdf` (`documents.routes.ts:17`, `:413`, `:426`), reached from `IndLifecycle.tsx:1018`; (2) `server/services/ana/briefing-book-core.ts`, behind hidden AnA `assemble_briefing_book` (`AnaToolExecutor.ts:1536`); (3) `server/services/ana/intelligence-questions/flows/briefing-book.ts`, an Advisory Committee briefing flow, which is a different document | Two assemblers for one FDA meeting package; PDF only (`canFile: false`); no editor document, sources, review or signature |
| Agency responses | Launch | `server/routes/c2c/agency-responses.ts` (questions `:384`, approve `:492`, owner `:605`, package `:660`, editor source `:337`); `server/services/agency-responses/response-service.ts` (`saveResponseTx` `:469`); `server/services/authoring/agency-response-source.ts`, `agency-response-machine-origin.ts`; `AgencyInbox.tsx`, `AgencyResponses.tsx`, `AgencyResponseEditor.tsx` | Questions entered by hand; no prior-answer reuse, related-question link or per-question source search (searched); the package is downloaded, not placed |
| Letter and finding extractors | Unwired or outside | `server/services/regulatory-correspondence/issue-parser.ts` (heuristic; imports `DEVICE_ISSUE_TAXONOMY` from `device-issue-taxonomy.ts`), behind `/api/regulatory-correspondence` (claimed by communication-center, `ui-surface-registry.ui-v2.ts:770`; no client caller); the numbered-question split in `draft_fda_ir_response` (`AnaToolExecutor.ts:16012`); `server/services/clinical-regulatory-evidence/crl-ingestion.service.ts:173` `extractFindingsFromText` (model-based, through the AI gateway, for the CRL library outside the catalog); `POST /api/c2c/commitments/extract` (`server/routes/c2c/commitments.ts:108`, AI extraction of commitments) | P-39 step 3 names the issue parser as the inbox's |
| Agency response drafting | Partial | `draft_fda_ir_response` (inScope) returns format instructions and writes nothing (WEAVE_GAP §3); MCP `c2c_draft_agency_response` (`server/mcp/tools/drafting.ts:70`) drafts from caller-supplied facts | No drafted response inside the response record with lineage (WEAVE_GAP item 2) |
| QC and consistency | Launch, partial | `server/services/truth-engine/truth-engine-service.ts`; `SubmissionConsistency.tsx`; section deficiency scan (`DocumentWorkbench.tsx:3868`); `server/services/authoring/m2-summary-qc.ts`, `m4-nonclinical-qc.ts`, `m5-clinical-qc.ts`, `ctd-authoring-readiness.ts` | `check_consistency` takes the text from its call (`AnaToolExecutor.ts:10064`, `:10074`, `:10082`); CTD QC grades caller-supplied bodies |
| Templates and style | Launch, partial | `shared/regulatory/global-document-registry.ts`; `server/services/authoring/builtin-authoring-templates.ts`; `AuthoringTemplatePicker.tsx`; `TemplateLibrary.tsx`, `server/routes/c2c/templates.ts` (outside the catalog) | Template Library out since 2026-10-08 (`launch-scope.ts:103-107`); a saved template formats nothing (CAT1-16); no style-guide record |
| Review, tracked changes, e-signature | Launch | `server/services/authoring/peer-review.ts`; `Review.tsx` (verdicts are not signatures, `:590`); `server/services/part11/governed-signature-ceremony.ts`, `reverify-signer.ts` | Approver list from the request body (`/docs/:docId/submit`, `authoring.router.ts:6739`; steps inserted at `:6723`); SSO-only signers cannot sign (CAT1-03) |
| Source import | Launch | `POST /api/authoring/import/source` (`authoring.router.ts:1469`); `SourceImportDialog.tsx`, `SourceAssemblyDialog.tsx` | DOCX import drops page layout, figures and form controls |
| Data ingestion (TFL, CMC) | Partial | `shared/csr-source-input.ts`; `server/services/csr-tabulation-builders.ts`; `server/services/cmc/register-writes.ts`, `recorded-stability.ts` | No sponsor SAS/RTF TLF import; CMC values typed by hand |
| Translation | Unreachable | `server/routes/translation.routes.ts`; `migrations/20260629_translation_platform.sql` (not deployed) | No client screen (deleted in `2895218b8`) |

#### Submissions and RIM

| Capability | Status | Paths | Open gap |
|---|---|---|---|
| eCTD v3.2.2 compile | Launch | `server/services/submission-gateways/regional-packager.ts` (backbones `:570`, `:691`, `:727`, `:765`); `server/services/ectd/package-from-core.ts`, `stf-generator.ts`; `EctdCompile.tsx` | No agency acceptance (D7) |
| Validation | Launch, partial | `server/services/ectd/xml-validator.ts`, `validation-rule-corpus.ts`; `external-validator/lorenz-adapter.ts`, `gate.ts`; LORENZ import `ectd-compile.ts:1789` (XML refused `:1690`) | Agency DTDs not vendored (`assets/ectd-dtd/`); no licensed engine (F-9) |
| Lifecycle and filed state | Launch | `server/services/ectd/lifecycle-operator.ts`, `prior-sequence-loader.ts`; `GET /:projectIdent/filed-state` (`ectd-compile.ts:1529`) | The history read (`:1471`, SELECT `:1492-1497`) returns no backbone; the IND diff (`server/routes/ind-lifecycle/sequence.routes.ts:173`, `:190`) has no caller |
| Dispatch verdict, Shadow Review | Launch, cannot clear | `server/services/ectd/dispatch-gate.ts`, `shadow-review-waiver.ts`, `shadow-finding-disposition.ts`; `DispatchReadiness.tsx` | Cannot clear without the external validator and the DTDs |
| FDA ESG transmit | Launch, not proven | `server/services/submission-gateways/governed-transmit.ts`, `as2-cms.ts`, `fda-esg-receipts.ts`; `submissions.ts:2098` | No FDA UAT; no Ack3 ingestion (`server/services/ectd/filed-sequence-rejection.ts:13`) |
| Non-FDA gateways | Stub (refuse) | `pmda-gateway.ts`, `health-canada-gateway.ts`, `ema-cesp.ts` | No wire contract from a regulator |
| eCTD v4.0 | Unreachable | `server/services/ectd/ectd4/*`; `server/routes/ectd-v4.ts` | No screen; F-23 |
| Registrations | Unreachable | `server/routes/rim.ts`; `migrations/20260610_rim_lite.sql` (not deployed) | Out by P-37 |
| Commitments | Launch | `server/services/ha-interactions/commitment-fulfilment.ts`; `CommitmentFulfilment.tsx` | Milestones have no screen; no correction path; `c2c_commitments` converges under P-39 step 2 |
| IND forms and lifecycle | Launch | `server/services/ind-forms/ind-form-fill-service.ts`; `templates/forms/acroforms/`; `IndFormsPanel.tsx`; `ind-forms.routes.ts:128`, `:287`, `:392` | All forms `IMPLEMENTED_UNVERIFIED`; no vendored 3455; IND safety reports stay shut (P-32) |
| Regulatory clock | Launch, partial | `server/services/ind-lifecycle/ind-regulatory-clock.ts` (`/api/ind-lifecycle/clock`, in the ind-checklist claim, `ui-surface-registry.ts:638`) | The CFR response clock (`regulatory-correspondence/response-clock.ts`) runs only on the duplicate store |
| Planning | Launch, partial | `ProjectPlan.tsx`, `PlanAssign.tsx`; Planner tab (`SubmissionCenter.tsx`) | `POST /api/submissions/:id/plan` has no caller; multi-region after D10 (P-45) |
| Regulatory intelligence | Partial (AnA) | `server/services/regulatory-currency/guidance-ingestion-service.ts`; `server/services/precedent-engine.ts:516` | Screens outside the catalog; the precedent library starts empty |
| SSO, SCIM, export, MCP | Launch | `server/routes/sso.ts`, `scim.ts`; `server/routes/tenant-export.ts`; `server/mcp/` | OIDC answers 501 (`sso.ts:781`); no RIM, QMS or CTMS connector |

#### Quality and document management

| Capability | Status | Paths | Open gap |
|---|---|---|---|
| Controlled documents | Launch | `client/src/concept2cure/quality/SopRegister.tsx`; `server/routes/mdx-qms.ts`; `server/services/qms/document-approval-signature.ts`; `migrations/20261001_qms_document_signature_required.sql`; `db/migrations/20261014_qms_controlled_authoring_content.sql` | One signer and no routing (CAT2-23); optional effective date (CAT2-19); retirement signs `approval` (`SopRegister.tsx:592`) |
| Periodic review | Launch, partial | `server/services/qms/periodic-review.ts`; `mdx-qms.ts:473` (review-due), `:505` (signed review) | Client overdue flag computed against `TODAY = '2026-06-04'` (`client/src/concept2cure/quality/data.ts:137`, used by `isReviewOverdue` `:139` and `reviewRowOf` `:182`; CAT2-22); no reminders |
| Controlled copy | Partial | Authoring controlled export and stamped working copy (§2.2); SOP body is an Authoring copy | No QMS controlled-copy record with the approval signature block, watermark and audited print (CAT2-24, MR-12 Stage 8) |
| Read-and-understood | Launch | `server/services/qms/training.ts`; `PersonalTrainingReader.tsx`; `mdx-qms.ts:824` | Attestation, not a signed act |
| Training coverage | Launch, partial | `server/services/qms/training-compliance.ts`; `TrainingCoverage.tsx`; `mdx-qms.ts:879` | Denominator is every active member; `GET /qms/training` (`:845`) and `/qms/training/expiring` (`:857`) have no client caller; no assignments |
| Distribution | Absent | `server/services/notifications/notification-record-target.ts:97`, `:137` resolve a `qms_document` target that nothing emits | No work order covers it |
| Change control | Launch | `ChangeControl.tsx`; `server/services/qms/changeControl.service.ts`; `change-approval-signature.ts` | Links are free text, and unlink is a hard delete (CAT2-25) |
| CAPA | Launch, partial | `QmsRecords.tsx` CAPA tab; `server/routes/capa-mdr.ts` (`GET /capa/:id` `:474`, action transition `:537`); `shared/constants/capa-lifecycle.ts` | Action moves and detail in flight (uncommitted); closure not signed |
| Nonconforming product, suppliers, internal audits, management reviews | Launch, partial (P-48) | `QmsRecords.tsx`; `mdx-qms.ts:914` (suppliers), `:1031` (audits), `:1129` (management reviews, GET and POST only), `:1189` (nonconforming) | Management-review actions owed; NCR disposition and supplier approval not signed; NCR `capa_linked` not set when a CAPA is raised from it |
| Quality deviations | Absent | No deviation record. The nonconforming-product register is product-keyed (`migrations/20260511_qms_and_labeling.sql:141-158`); the `/api/qc/deviations` stub (`qc.routes.ts:397-444`; `storage.ts:1495-1516`) has no table and is unclaimed; GCP protocol deviations live in protocol-dev (`server/routes/protocol-deviations.ts`); AnA `classify_gmp_deviation` reasons only | Change-control "deviation" links point to nothing |
| Complaints | Launch, read-only on screen (device) | `capa-mdr.ts:184-279`; CER PMS tab (`useCerPmsFeeds.ts`); AnA `create_complaint` (inScope) | Board off (`PostmarketSurface.tsx:53`); no drug product-quality complaint |
| QRM, lab investigations, APQR | Partial or not measured | Device ISO 14971 risk only (`client/src/concept2cure/v2/surfaces/Risk.tsx`, in the Projects app); `/api/qc/oos-investigations` routes (`qc.routes.ts:163-239`, unclaimed; backing not measured) | No ICH Q9 register. APQR is not in the inventory |
| Vault DMS | Launch | `server/routes/c2c/project-vault.ts` (where-used `:1721`); `server/services/vault/vault-where-used.ts` (`:83`, `:166`, `:220`); `vault-legal-holds.ts`, `vault-retention-period.ts`; `server/jobs/retentionCron.ts` | No restore (CAT1-04); no check-out; the sweep keeps the S3 bytes; where-used omits authoring citations |
| Audit, Part 11, validation | Launch / D4 owed | `server/routes/audit-trail-ledger.routes.ts`; `server/services/part11/*`; `docs/validation/*`; `tests/validation/run-all.mjs`; `server/routes/validation-kit.ts` | Two audit chains; every validation document is DRAFT, UNSIGNED |

#### Clinical, safety and data

| Capability | Status | Paths | Open gap |
|---|---|---|---|
| eTMF | Locked | `Etmf.tsx`; `server/routes/etmf.routes.ts`; `server/services/etmf/tmf-completeness.ts`; `migrations/20260615_tmf_artifact_filings.sql` | Second store (`server/routes/etmf.ts`) whose migration `migrations/20260610_etmf.sql` is not deployed; `trial_id` is free text |
| TMF folders in Vault | Launch, partial | `shared/constants/domain/vault-taxonomy.ts:52`; `server/services/vault/vault-filing.service.ts` | Service organisations only; no readiness verdict |
| CTMS | Locked | `server/routes/clinical-operations-routes.ts`; `ClinicalOps.tsx`; `db/migrations/20260902_clinical_ops_schema.sql` | The clinical-ops registry row does not claim `/api/clinical-operations` |
| Protocol operations | Launch | `server/routes/protocol-milestones.ts`, `protocol-deviations.ts`, `protocol-amendments.ts`; `ProtocolDevRegisters.tsx` | Per protocol, not per study or site |
| Device clinical studies | Launch, read-only | `server/routes/mdx-clinical-studies.ts`; `ClinicalStudiesSurface.tsx` | Writes only through AnA |
| IRB and ICF | Launch | `server/routes/irb.ts`; `server/routes/protocol-consent.ts` | No transmission to an IRB |
| Site activation | Absent | `IndFormsPanel.tsx` (1572/3454/3455) only | No packet, checklist or SIV |
| Safety / PV | Locked | `server/routes/pharmacovigilance-routes.ts` (`:285`, no client caller); `server/services/ind-lifecycle/e2b-icsr-composer.ts` (`:340`, not HL7 v3); `server/services/pv/expedited-reporting-clock.ts`; `server/services/medical-coding/medical-coding-service.ts`; `server/services/compliance/pv-signal-detection.ts` | No intake UI; no MedDRA licence (F-16); P-32 keeps it shut |
| EDC / CDMS | Absent | `server/services/study-design/crf-shell.ts` (a blank CRF shell) | — |
| CDISC conformance | Partial (AnA) | `server/services/cdisc/*`; `server/services/clinical-regulatory-evidence/xpt-structure.ts` | `/api/cdisc-validation` unclaimed; checkers read descriptors, not datasets |
| Biostatistics, RBM | Locked | `server/services/stats/*`; `BiostatWorkbench.tsx`; `server/services/rbm/*`; `Rbm.tsx` | Join the rail's Work areas only once in the catalog (P-47) |

### 2.4 Deleted predecessors that must not be rebuilt (RULE 3, step 2)

| Deleted | Commit | Where its outcome lives now |
|---|---|---|
| `server/routes/haq-manager.ts` | `0308ee257` | The letter, in Communication and Respond (P-38) |
| `workflow/HAQManager.tsx`, `pages/HAQManagerDashboard.tsx` | `d04381632`, `3147609f6` | Same |
| `server/routes/content-plan.js`, `ContentPlan.jsx`, `EctdPlanner.jsx` | `35785b4cb`, `7a144fd1e`, `b49e7495f` | `ProjectPlan.tsx` with `PlanAssign.tsx` (P-47) |
| `regulatory/ECTDNavigator.tsx`, `submission/DossierNavigator.tsx`, `workspace/DossierTree.tsx` | `e5a74a4df` | `EctdCompile.tsx`, `SubmissionSeqWorkspaces.tsx` |
| `ConsistencyPanel.tsx`, `server/routes/document_qc_routes.ts` | `2895218b8`, `da4e681a4` | `SubmissionConsistency.tsx`, `truth-engine-service.ts` |
| `CAPAManagement.tsx`, `SOPManagement.tsx`, `QualitySurface.tsx` | `e5a74a4df` | `client/src/concept2cure/quality/*` |
| `client/src/components/cmc/DeviationCapaBoard.jsx` | `7a144fd1e` | None: no deviation record exists (G16) |
| `TrainingManagement.tsx` (portal-v2), `pages/TrainingTasks.jsx`, `_deprecated/training.js` | `5d29680f2`, `b49e7495f`, `4a87d39a4` | The read-and-understood record (`PersonalTrainingReader.tsx`) |
| `TranslationWorkspace.tsx`, `EditorTranslate.tsx` | `2895218b8` | None: the backend is unreachable |
| `components/calendar/RegulatoryCalendar.tsx`, `SubmissionCalendar.tsx` | `e5a74a4df`, `7a144fd1e` | None |
| `csr-extractor-service.ts` | `27ecdb8d2` | The CSR source contract (`server/services/csr/vault-source-input.ts`) |
| `AnnotatedViewer.jsx` and four other viewers | `83fa7f6cf`, `7a144fd1e` | `client/src/concept2cure/v2/editor/vaultPdfViewer.tsx` |

### 2.5 Checked for this revision, at `e7736eea6`

Greps, plus one read-only script:

- **`anaToolFamilies`.** The script read both registry files, including arrays that span lines. It found 106 entries, with 70 distinct names.
  - 37 entries (26 distinct names) match no AnA tool or command. A tool or command means a name in `ana-launch-scope.inventory.json`, a `registerToolHandler` name or an `AnaToolDefinitions.ts` name.
  - Of those 37: 3 are Report OS tools (`report-tools.ts`); 3 are ai-actions types (`run_validation` twice, `document_drafting`); 2 are prefixes (`global_ri_`, `get_document`); 29 entries (19 distinct names) match nothing searched.
  - The CI check that G2 proposes has not been written, so it has not been seen red.
- `approved-models.ts`: 16 `pq: {` blocks, all `pending`. The 17th match of the earlier grep was the type union at `:32`.
- `issue-parser.ts` imports `DEVICE_ISSUE_TAXONOMY`, `devicePathwayFor` and `isDeviceSubmissionType`.
- No prior-answer reuse, related-question link or passage-search call was found in `agency-responses.ts`, `server/services/agency-responses/` or the agency surfaces (searched for "prior answer", "previous answer", "reuse", "related", `passage-search` and `data-room-search`).
- `check_consistency` reads `left.text` and passes it on (`AnaToolExecutor.ts:10074`, `:10082`).
- `TODAY = '2026-06-04'` is at `quality/data.ts:137`.
  - It is read by `isReviewOverdue` (`:139`), `deriveReviewDue` (`:174`) and `reviewRowOf` (`:182`, whose row carries `overdue`, `:188`).
  - `reviewRowOf` is called at `SopRegister.tsx:500` and `:504`.
  - `canRecordReview` reads only status and revision (`PeriodicReview.tsx:58`).
- The compile-history SELECT has no backbone column (`ectd-compile.ts:1492-1497`).
- "There is no Ack3 ingestion" is at `filed-sequence-rejection.ts:13`.
- Retirement offers only `meanings={['approval']}` (`SopRegister.tsx:592`).
- `US_PRE_IND` and the Type A/B/C entries are at `global-document-registry.ts:81` and `:454-456`.
- No `FDA_3455*.pdf` exists in the tree.

---

## 3. Capability matrix

Status vocabulary for "Us":

- **Launch:** reachable in the launch catalog in the production posture.
- **Launch, partial:** reachable, with the gap stated.
- **Staging only:** reachable, but refused in production by the PQ gate.
- **Locked:** built, but its surface is outside the catalog and refused with 403 `LAUNCH_SCOPE`.
- **Unreachable:** in the tree, with no caller, no API claim or no deployed migration.
- **Absent:** searched for and not found.

### 3.A Authoring, AI and data

| Capability | Weave | Veeva Basics | Us |
|---|---|---|---|
| Source-grounded AI drafting | Configurable AI templates "grounded in source context"; the user instructs the AI to generate tables, figures and whole sections (V) [SB](https://www.weave.bio/platform/submission-builder/), [Platform](https://www.weave.bio/platform/) | No AI drafting found in Basics. Veeva AI Agents for Regulatory were scheduled for August 2026; Basics coverage unknown. UNVERIFIED [AI](https://ir.veeva.com/news/news-details/2025/Veeva-AI-Agents-to-Be-Released-Across-All-Veeva-Applications/default.aspx) | **Staging only.** `authoring.router.ts:3375`; project-scoped retrieval that refuses with no verified scope (`:3440`); `AuthoringAiDraft.tsx`. PQ pending for all 16 models. |
| Sentence- and claim-level traceability | Sentence-level tracing, always-current links, Data Tags and automated data verification (V) [SB](https://www.weave.bio/platform/submission-builder/). A source citation in each table cell (V) [Dec24](https://www.weave.bio/resources/autoind-december-2024-product-release-notes/) | Not in the research. | **Launch, partial.** `document_span_lineage`; `span-lineage.service.ts`; `citationNode.ts`; each citation's standing (`source-usage-projection.ts`). No per-citation reviewer step outside the CSR scientific review (G6). |
| Closed per-program data room | A closed Data Room per program, with AI-extracted metadata and semantic search (V) [HAQ page](https://www.weave.bio/platform/haq-manager/) | Not in the research. | **Launch.** `data-room-processing*.ts`, `data-room-search.ts`, `document-passage-search.ts`. |
| Import from connected repositories, folder structure kept, resync | Veeva is the only connector named (V) [SB](https://www.weave.bio/platform/submission-builder/). No SharePoint, Box or Egnyte connector documented: UNVERIFIED (a negative finding) | Not in the research. | **Partial, AnA only.** Connectors for SharePoint, Box, OneDrive, Google Drive, Veeva Vault and Medidata Rave (`connector-registry.ts:73-79`), searched through `search_connected_repositories` (`AnaToolExecutor.ts:2304`). No import with folders kept, and no resync, found. |
| Dossier document import (May 2026) | Teaser only. UNVERIFIED [Newsletter](https://www.weave.bio/resource-category/newsletter/) | Not in the research. | **Launch, partial.** `POST /api/authoring/import/source` (`authoring.router.ts:1469`); `SourceImportDialog.tsx`. A sponsor's earlier eCTD sequences cannot be imported (`/api/mdx/imports` has no caller). |
| Section templates (M1/2/3/5) with AI instructions | Modules 1, 2, 3 and 5 (V) [SB](https://www.weave.bio/platform/submission-builder/). Nonclinical 2.2, 2.4 and 2.6 templates with AI instructions and dynamic values (V) [Dec24](https://www.weave.bio/resources/autoind-december-2024-product-release-notes/) | Not in the research. | **Launch, partial.** `global-document-registry.ts`, `builtin-authoring-templates.ts`, `AuthoringTemplatePicker.tsx`. A saved template formats nothing (CAT1-16). |
| EU CTA template; custom template builder for any authority | Both shipped 2026-06-15 (V) [Global](https://www.businesswire.com/news/home/20260615319013/en/Weave-Bio-Enables-Global-Submissions-From-a-Single-Source-of-Truth). More jurisdictions "coming": UNVERIFIED | Not in the research. | **Locked.** `TemplateLibrary.tsx`, `server/routes/c2c/templates.ts`, out since 2026-10-08. Founder decision in §6. |
| Module 4 | Modules 1, 2, 3 and 5 are listed (V); Module 4 is not listed, which is a negative finding: UNVERIFIED [SB](https://www.weave.bio/platform/submission-builder/) | Not in the research. | **Launch, partial.** `nonclinical-study-report-builder.ts`. M4 QC (`m4-nonclinical-qc.ts`) grades a caller-supplied body behind the unclaimed `/api/authoring-pdf` (G5). |
| Module 2 composition | Takeda: first-draft time cut 97%, about 100 hours to about 3 (vendor) (V) [Takeda](https://www.weave.bio/weave-bio-announces-collaboration-with-takeda-to-deploy-ai-native-regulatory-automation-across-key-drug-development-activities/). Study specifics UNVERIFIED [arXiv](https://arxiv.org/pdf/2509.09738) | Not in the research. | **Launch, partial.** 2.5/2.7 from completed CSR jobs (`module2-csr-inputs.ts`), but the `csr_build_jobs` migration is not in `C2C_MIGRATION_FILES`. 2.3 from the CMC record (`cmc-quality-summary-tool.ts`). 2.4/2.6 `needs_data` until R-1; the orchestrator's 2.4 step is `skipped (no inputs)` with the flag off (§2.2). |
| Document types | Briefing books, IBs, protocols and amendments, annual reports, CSRs, DSURs, INDs, CTAs, NDAs/BLAs, MAAs (V) [Home](https://www.weave.bio/). The research reports an older webinar calling CSRs, protocols and annual reports roadmap items, but gives no URL for it: that conflict is UNVERIFIED | Not in the research. | Protocol **Launch** (`ProtocolDevWorkspace.tsx`). CSR **Launch** (`csr-e3-guidance.ts`). IND annual report **Launch** (`filing.routes.ts:288`). IB **Launch, partial** (`ib-builder.ts`). DSUR structure only (`psur-dsur-service.ts`). Briefing book PDF only (`documents.routes.ts:413`). CMC refuses NDA/BLA/MAA by name (`composition-scope.ts`). |
| NDA workflow | NDA-specific templates with Parexel, more than 60% less authoring time (vendor) (V) [NDA](https://www.businesswire.com/news/home/20260429322286/en/Weave-Bio-Launches-NDA-Workflow-Designed-in-Partnership-with-Parexel-Extending-AI-Native-Platform-Coverage-Across-the-Full-Regulatory-Lifecycle) | Not in the research. | **Outside the boundary.** P-28 refuses a marketing application in CMC (`composition-scope.ts`). §6. |
| AI review / QC across the dossier | AutoReview: configurable reviewers flag mismatches, conflicts and missing information as editor comments (V) [Feb26](https://www.weave.bio/resources/weave-february-2026-release-notes/) | Quality agents reported live; Regulatory agents scheduled for August 2026; Basics coverage unknown. UNVERIFIED [AI](https://ir.veeva.com/news/news-details/2025/Veeva-AI-Agents-to-Be-Released-Across-All-Veeva-Applications/default.aspx) | **Launch, partial.** Deficiency scan (`DocumentWorkbench.tsx:3868`); `SubmissionConsistency.tsx`. `check_consistency` takes its text from the call (G4); CTD module QC grades caller-supplied bodies (G5). |
| Change propagation | "Sections are tied to underlying data, updates surface where changes are needed" (V) [Platform](https://www.weave.bio/platform/). AutoUpdate: UNVERIFIED [Newsletter](https://www.weave.bio/resource-category/newsletter/) | Not in the research. | **Launch, partial.** Per-citation `changed`/`superseded`; Refresh all sources (`authoring.router.ts:5824`). Where-used omits authoring citations (G7). |
| Context management | March 2026 release, specifics unknown. UNVERIFIED [Newsletter](https://www.weave.bio/resource-category/newsletter/) | Not in the research. | **Launch.** `draft-source-window.ts`; the letter pinned as a source (`AgencyInbox.tsx:23`). No basis to compare. |
| Real-time collaboration | (V) [SB](https://www.weave.bio/platform/submission-builder/) | Collaborative authoring in Submissions Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Built, off.** `ENABLE_LIVE_COEDITING` (`featureFlags.ts:74`); F-27. |
| Comments, redlines, versions, restore | (V) [SB](https://www.weave.bio/platform/submission-builder/) | Not in the research. | **Launch, partial.** `commentAnchor.ts`, `ReviewThreads.tsx`, `suggestions.ts`. Structural edits untracked (UX-16). |
| Roles, approval, audit log | Admin, Contributor and Viewer roles; permissions to author, edit and approve; "every edit, comment, and version is logged" (V) [SB](https://www.weave.bio/platform/submission-builder/) | Not in the research. | **Launch.** `shared/constants/org-roles.ts:33`; `peer-review.ts`; `audit-trail-ledger.routes.ts`. Approver list from the request (`authoring.router.ts:6723`); two audit chains. |
| Part 11 e-signature | None found; approval appears only as a permission. UNVERIFIED [SB](https://www.weave.bio/platform/submission-builder/) | Aligned with Part 11 and Annex 11, per a third party. UNVERIFIED [IntuitionLabs](https://intuitionlabs.ai/articles/veeva-vault-basics-vs-full-vault) | **Launch.** `governed-signature-ceremony.ts`. SSO-only signers cannot sign (CAT1-03). |
| Export and publishing | Section status, version control, restore, customizable DOCX export; export and classify into Veeva (V) [SB](https://www.weave.bio/platform/submission-builder/). PDF bookmarks, eCTD XML and validation not public: UNVERIFIED (negative) | See 3.B. | **Launch, partial.** DOCX and PDF (`authoring-export.ts:435`, `:546`). CAT1-09; CAT1-18. |
| Landscape table export | Shipped February 2026 (V) [Feb26](https://www.weave.bio/resources/weave-february-2026-release-notes/) | Not in the research. | **Not measured.** `server/services/docx/docxFactory.ts:64-65` carries a landscape page option; whether an authored table section exports landscape was not checked. |
| TFL and dataset ingestion | None public. UNVERIFIED [SB](https://www.weave.bio/platform/submission-builder/) | Not in the research. | **Launch, partial.** `shared/csr-source-input.ts`; `csr-tabulation-builders.ts`; `xpt-structure.ts`. No sponsor TLF import. |
| Module 3 from data | Adding manufacturers and excipients auto-creates 3.2.A appendices; landscape table export (V) [Feb26](https://www.weave.bio/resources/weave-february-2026-release-notes/). No public data-driven 3.2.S/3.2.P: UNVERIFIED (negative) | LIMS Basics (QC data, not dossier composition). UNVERIFIED [Nov25](https://www.veeva.com/resources/veeva-basics-adopted-by-more-than-100-emerging-biotechs-to-simplify-and-standardize-operations/) | **Launch** (small-molecule US IND). `server/services/cmc/module3-compile.ts`, `final-export-gate.ts`, `place-module3-into-submission.ts`. Register values typed. |
| HAQ intake | Extracts questions and metadata from FDA and EMA files; 100% precision, 99.7% recall (vendor) (V) [HAQ](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase) | HA questions belong to Registrations, which is not in Basics. UNVERIFIED [Kivo](https://kivo.io/news/kivo-vs.-veeva-vault-rim-a-side-by-side-comparison), [Registrations brief](https://www.veeva.com/resources/veeva-registrations-product-brief/) | **Launch, partial.** `agency-responses.ts:384`; questions entered by hand; the issue parser is unwired (G3). |
| HAQ: sources found per question | "Finds relevant Data Room sources for each question" (V) [HAQ](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase) | As above. UNVERIFIED | **Absent.** Passage search exists (`document-passage-search.ts`) but the agency-response code does not call it (G17). |
| HAQ responses and reuse | Drafts from sources and prior answers; links related questions to drafted or submitted responses; assignment; a compiled document (V) [HAQ](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase). Module 1.11 placement: UNVERIFIED [HAQ page](https://www.weave.bio/platform/platform-haq-manager/) | As above. UNVERIFIED | **Launch, partial.** `AgencyResponseEditor.tsx`; `response-service.ts`; owner per question (`:605`); Part 11 approval (`:492`); package only from approved answers (`:660`). No drafted response with lineage in the record (G15), no prior-answer reuse or related-question link (G11), no placement (G12). |
| Program planning | Program Planner labeled "Launching Q4 2026" (V) [Home](https://www.weave.bio/). No launch announcement found: UNVERIFIED | Submission planning with status dashboards. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Launch, partial.** `ProjectPlan.tsx`, `PlanAssign.tsx`; multi-region after D10 (P-45). |
| Regulatory intelligence | None found. UNVERIFIED [News](https://www.weave.bio/news/) | Not in the research. | **Partial, AnA.** `lookup_fda_guidance` (P-9); `precedent-engine.ts:516`. Screens outside the catalog. |
| Integrations and SSO | Veeva round trip; "SAML-compatible" SSO; no public API found (negative, UNVERIFIED) (V for the first two) [SB](https://www.weave.bio/platform/submission-builder/) | Native connectivity between Basics apps (Summit session). UNVERIFIED [Summit](https://pantheon.veeva.com/events/veeva-basics-summit/agenda/) | **Launch.** SAML and SCIM (`sso.ts`, `scim.ts`); Claude connector (`server/mcp/`, D8). OIDC answers 501 (`sso.ts:781`). |
| Security posture | SOC 2 Type II (A-LIGN); zero data retention with OpenAI; no training on customer data; MFA; RBAC (V; the page was indexed about a year ago) [Security](https://weave.bio/data-security-privacy) | Not in the research. | **D6 owed.** SOC 2 window, pen test and BAA (DoD D6); runtime role `app_service` without `BYPASSRLS` (`terraform/stack/main.tf`). |
| GxP validation | None found. UNVERIFIED [Security](https://weave.bio/data-security-privacy) | Pre-validated; every release validated; packages on demand. UNVERIFIED [Basics](https://veevabasics.veeva.com/), [MedTech](https://www.veeva.com/medtech/veeva-basics/). Automated release qualification. UNVERIFIED [Spotline](https://www.prnewswire.com/news-releases/spotline-v-assure-platform-enables-pre-validation-for-veeva-basics-releases-302459936.html) | **D4 owed.** `docs/validation/*` DRAFT, UNSIGNED; `tests/validation/run-all.mjs`; `server/routes/validation-kit.ts`. |

### 3.B Submissions and RIM (Veeva RIM Basics)

| Capability | Weave | Veeva Basics | Us |
|---|---|---|---|
| Plan, author, review and approve submission content, with dashboards | Authoring, review and approval permissions (V) [SB](https://www.weave.bio/platform/submission-builder/). Planning only as the unreleased Program Planner | Submissions Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/), [Launch 2024](https://www.veeva.com/resources/veeva-introduces-vault-basics-for-biotechs/) | **Launch.** Plan, editor, Review and signature. |
| Archive, viewer, correspondence history | Not in the research. The research says only that submission "remains within the customer's established publishing process" (V) [SB](https://www.weave.bio/platform/submission-builder/) | Submissions Archive Basics with a viewer. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Launch, partial.** Filed state (`ectd-compile.ts:1529`); Builder leaf table; correspondence linked. A past compile's tree cannot be reopened; leaves do not link to Vault (G8). |
| In-house build and publish | Does not submit; submission stays in the customer's publishing process (V) [SB](https://www.weave.bio/platform/submission-builder/) | Submissions Publishing Basics, 2025-05-20, North America and Europe. UNVERIFIED [May 2025](https://www.veeva.com/resources/more-than-75-emerging-biotechs-use-veeva-basics-across-clinical-regulatory-and-quality/), [Oct 2026](https://ir.veeva.com/news/news-details/2026/Emerging-Biotechs-Standardize-on-Veeva-Basics-to-Accelerate-Drug-Development/default.aspx) | **Launch.** `regional-packager.ts`; `stf-generator.ts`; `pdfa-pipeline.ts`; `EctdCompile.tsx`. |
| Continuous eCTD validation | None public. UNVERIFIED (negative) [SB](https://www.weave.bio/platform/submission-builder/) | In the full product; how much Basics exposes is unknown. UNVERIFIED [Veeva help](https://regulatory.veevavault.help/en/gr/48611/) | **Launch, partial.** `xml-validator.ts` without agency DTDs; a curated rule corpus; LORENZ JSON import. |
| Gateway transmission and ACKs | Does not submit (V) [SB](https://www.weave.bio/platform/submission-builder/) | The full product sends to FDA ESG with the ACK sequence; Basics' "transmit" wording. UNVERIFIED [Veeva help](https://regulatory.veevavault.help/en/gr/48611/), [May 2025](https://www.veeva.com/resources/more-than-75-emerging-biotechs-use-veeva-basics-across-clinical-regulatory-and-quality/) | **Launch, not proven.** `governed-transmit.ts`. No FDA UAT; no Ack3 ingestion. |
| eCTD 4.0 | Not in the research. | In the full RIM; Basics unconfirmed. UNVERIFIED [eCTD 4.0](https://www.veeva.com/blog/enabling-submission-success-with-ectd-4-0/) | **Unreachable.** `server/services/ectd/ectd4/*` (F-23). |
| Registrations | Not in the research. | Not in Basics. UNVERIFIED [Kivo](https://kivo.io/news/kivo-vs.-veeva-vault-rim-a-side-by-side-comparison), [RIM Essentials](https://www.veeva.com/cn/products/vault-rim-essentials/) | **Unreachable; out by P-37.** `server/routes/rim.ts`. |
| Commitments | Not in the research. | Full Registrations only. UNVERIFIED [Registrations brief](https://www.veeva.com/resources/veeva-registrations-product-brief/) | **Launch.** `commitment-fulfilment.ts` (P-41). |
| IND forms, cover letter, annual report, 30-day clock | Not in the research. | Not in the research. | **Launch.** `ind-form-fill-service.ts` (all forms `IMPLEMENTED_UNVERIFIED`); `cover-letter-composer.ts`; `filing.routes.ts:288`; `ind-regulatory-clock.ts`. |

### 3.C Quality (Veeva Quality Basics)

| Capability | Weave | Veeva Basics | Us |
|---|---|---|---|
| SOP and quality document management | Not in the research. | QualityDocs Basics, "best practices for managing SOPs". UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Launch.** `SopRegister.tsx`; `document-approval-signature.ts`. CAT2-19, CAT2-23; retirement meaning (P11-03). |
| Periodic review | Not in the research. | Reminders in the full QualityDocs; Basics configuration unknown. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Launch, partial.** `periodic-review.ts`. Stale client date (G1); no reminders. |
| Controlled copies | Not in the research. | In the full QualityDocs. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Partial.** Authoring's controlled export and stamped working copy reach an SOP's bound copy; no QMS controlled-copy record (CAT2-24). |
| Distribution of an effective document | Not in the research. | Not in the research. | **Absent.** Notification target resolves, nothing emits it (`notification-record-target.ts:97`). |
| Read-and-understood | Not in the research. | In the full QualityDocs. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Launch.** `training.ts`; `PersonalTrainingReader.tsx`. |
| Training LMS | Not in the research. | Training Basics, "an industry-specific LMS"; role matrices and event-triggered retraining are full-product features. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Launch, partial.** `training-compliance.ts` (whole roster); no assignments; expiry routes uncalled (G10). |
| Change control | Not in the research. | In QMS Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Launch.** `ChangeControl.tsx`; CAT2-25. |
| Deviations | Not in the research. | In QMS Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Absent.** The NCR tab is a nonconforming-product register only (§2.2). `/api/qc/deviations` is a stub. G16. |
| Nonconforming product | Not in the research. | Not named in the Basics list in the research. | **Launch, partial.** NCR tab (`mdx-qms.ts:1189`); disposition not signed. |
| Standalone CAPA | Not in the research. | In QMS Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Launch, partial.** CAPA tab; raise from NCR or audit (`c9f14b5b9`); action moves in flight. |
| Audits | Not in the research. | In QMS Basics, apparently added 2025–26. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Launch, partial.** `mdx-qms.ts:1031`; an audit raises its CAPA (`c9f14b5b9`). |
| Management review, supplier quality | Not in the research. | Supplier quality only in the full QMS (inferred by comparing lists). UNVERIFIED [QMS brief](https://www.veeva.com/resources/veeva-qms-product-brief/) | **Launch, partial.** `mdx-qms.ts:914`, `:1129`; management-review actions owed (G9); no supplier qualification workflow. |
| Complaints, lab investigations, QRM, APQR | Not in the research. | Full QMS only (inferred). UNVERIFIED [QMS brief](https://www.veeva.com/resources/veeva-qms-product-brief/) | Device complaints **Launch, read-only on screen**, AnA-created, board off (§2.2). Device risk only (`Risk.tsx`). OOS routes unclaimed. APQR not in the inventory. |
| LIMS: specifications, external results, batch release, CoA | Not in the research. | LIMS Basics, early 2026; stability planned. UNVERIFIED [Nov 2025](https://www.veeva.com/resources/veeva-basics-adopted-by-more-than-100-emerging-biotechs-to-simplify-and-standardize-operations/) | **Launch, partial, as Module 3 evidence.** `register-writes.ts`, `recorded-stability.ts`, `batch-release-evidence.ts`; values typed. |

### 3.D Clinical and safety (Veeva Basics, clinical side)

| Capability | Weave | Veeva Basics | Us |
|---|---|---|---|
| eTMF | Not in the research. | eTMF Basics (May 2024, North America). UNVERIFIED [Basics](https://veevabasics.veeva.com/), [Launch 2024](https://www.veeva.com/resources/veeva-introduces-vault-basics-for-biotechs/) | **Locked.** `Etmf.tsx`, `tmf-completeness.ts`. TMF folders in the launch Vault (`vault-taxonomy.ts:52`). |
| CTMS | Not in the research. | CTMS Basics: milestones, monitoring, enrollment, issues, site communications. UNVERIFIED [Basics](https://veevabasics.veeva.com/), [May 2025](https://www.veeva.com/resources/more-than-75-emerging-biotechs-use-veeva-basics-across-clinical-regulatory-and-quality/) | **Locked.** `clinical-operations-routes.ts`. Protocol-scoped registers at launch. |
| Study startup | Not in the research. | No Basics edition found (negative). UNVERIFIED [Study Startup](https://www.veeva.com/products/vault-study-startup-features/) | **Launch, partial.** IRB and ICF (`irb.ts`, `protocol-consent.ts`); 1572/3454/3455. No site activation. |
| Safety | DSUR named as a document type (V) [Home](https://www.weave.bio/) | No Safety Basics; full Safety in about 8 weeks. UNVERIFIED [Safety](https://www.veeva.com/eu/resources/vault-safety-accelerated-implementation-model/) | **Locked; shut by P-32.** `pharmacovigilance-routes.ts`; `e2b-icsr-composer.ts`; `expedited-reporting-clock.ts`. |
| EDC / CDMS | Not in the research. | No EDC Basics found (negative); Study Builder Agent in full EDC. UNVERIFIED [CDMS](https://cdmshelp.veeva.com/lr/resources/clinical-data-overview/), [Study Builder](https://www.veeva.com/resources/new-veeva-study-builder-agent-to-configure-clinical-studies-in-as-little-as-one-day/) | **Absent** (`crf-shell.ts` only). |

### 3.E Deployment, commercial and scope

| Capability | Weave | Veeva Basics | Us |
|---|---|---|---|
| Pre-validated, vendor-managed releases | Not in the research. | Three updates a year; every release validated. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | D4 drafts are unsigned. No release-cadence or regression-validation commitment found in the inventory. |
| Live in weeks; no implementation fee | No public pricing found; every page leads to a demo request. UNVERIFIED (the research gives no URL for this) | "In weeks", with 30–60 days of guided onboarding. UNVERIFIED [Oct 2026](https://www.veeva.com/resources/emerging-biotechs-standardize-on-veeva-basics-to-accelerate-drug-development/), [MedTech](https://www.veeva.com/medtech/veeva-basics/) | Self-serve signup (DoD D2); `docs/beta/CUSTOMER_ONBOARDING_RUNBOOK.md`, `docs/commercial/ONBOARDING_RUNBOOK.md`; the pricing decision is owed (D9). |
| Support and on-demand training | Not in the research. | 24x7 end-user support through the Global Support Center, plus on-demand training. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | **Draft, narrower.** `docs/commercial/SUPPORT_POLICY.md` (DRAFT): Mon–Fri 08:00–18:00 US Eastern, with Sev-1 monitored outside those hours (`:20-21`). No 24x7 (§8). |
| Upgrade path | Not in the research. | Graduate to full Vault with no migration. UNVERIFIED [Nov 2025](https://www.veeva.com/resources/veeva-basics-adopted-by-more-than-100-emerging-biotechs-to-simplify-and-standardize-operations/) | One product. Tenant export with attestation (`server/routes/tenant-export.ts`). |
| Published time-savings and quality metrics | Takeda 97% (V) [Takeda](https://www.weave.bio/weave-bio-announces-collaboration-with-takeda-to-deploy-ai-native-regulatory-automation-across-key-drug-development-activities/); Parexel INDs 50% faster (V) [Parexel](https://newsroom.parexel.com/news-releases/news-release-details/parexel-announces-ai-partnership-weave-bio-accelerate-regulatory); NDA more than 60% (V) [NDA](https://www.businesswire.com/news/home/20260429322286/en/Weave-Bio-Launches-NDA-Workflow-Designed-in-Partnership-with-Parexel-Extending-AI-Native-Platform-Coverage-Across-the-Full-Regulatory-Lifecycle); HAQ extraction figures (V) [HAQ](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase). All vendor-reported | More than 175 adopters on 2026-10-07. UNVERIFIED [Oct 2026](https://ir.veeva.com/news/news-details/2026/Emerging-Biotechs-Standardize-on-Veeva-Basics-to-Accelerate-Drug-Development/default.aspx) | **Absent.** No published figure. PQ pending for every model; CSR qualification uses synthetic LMN-201 data with no human acceptance (inventory); no customer (D10). |
| Medical and commercial scope (PromoMats Basics) | Not in the research. | PromoMats Basics announced November 2025; Basics scope stated as clinical, regulatory, quality, medical and commercial. UNVERIFIED [Nov 2025](https://www.veeva.com/resources/veeva-basics-adopted-by-more-than-100-emerging-biotechs-to-simplify-and-standardize-operations/), [Oct 2026](https://ir.veeva.com/news/news-details/2026/Emerging-Biotechs-Standardize-on-Veeva-Basics-to-Accelerate-Drug-Development/default.aspx) | **Absent at launch.** Promotional-compliance routes under global-ri (`server/routes/global-ri/promotional-compliance.routes.ts`, outside the catalog). No promotional review workflow found (searched `promotional`, `promomats`, `MLR`). §6. |

---

## 4. Where we already exceed both (the "much more")

**What counts as "exceed" here.** We do it, through the path given, and it is **reachable in production** at `e7736eea6`. The research found nothing equal in either vendor's public material, or in the Basics tier.

**What every vendor-side cell rests on.** On every row of the table below, the vendor side is a **negative or third-party finding**. Under the legend, that is UNVERIFIED and is not proof of absence. The basis column says so row by row.

| What we do | Path | Weave | Veeva Basics | Basis and caveat |
|---|---|---|---|---|
| Each agency answer approved by its own Part 11 signature; the response package assembled only from approved answers | `server/routes/c2c/agency-responses.ts:492`, `:660`; `server/services/agency-responses/response-service.ts` | HAQ Manager tracks, assigns and compiles (V) [HAQ](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase); no e-signature found, UNVERIFIED [SB](https://www.weave.bio/platform/submission-builder/) | HA questions sit in Registrations, not in Basics. UNVERIFIED [Kivo](https://kivo.io/news/kivo-vs.-veeva-vault-rim-a-side-by-side-comparison) | Negative on Weave; a competitor's statement on Veeva. Questions are still typed by hand (G3). |
| A PMR, PMC or REMS recorded fulfilled only by a signature that names the sequence or the sha256-pinned Vault version | `server/services/ha-interactions/commitment-fulfilment.ts`; `CommitmentFulfilment.tsx`; P-41 | Not in the research. | Full Registrations only. UNVERIFIED [Registrations brief](https://www.veeva.com/resources/veeva-registrations-product-brief/) | Not in the research for Weave; inferred for Basics. Milestones have no screen, and there is no correction path. |
| CMC Module 3 compiled, Part 11-approved, gated and placed into the IND sequence; 2.3 QOS composed from the CMC record | `server/services/cmc/module3-compile.ts`, `final-export-gate.ts`, `place-module3-into-submission.ts`; `cmc-quality-summary-tool.ts` | Only 3.2.A appendices are public (V) [Feb26](https://www.weave.bio/resources/weave-february-2026-release-notes/); data-driven 3.2.S/3.2.P not found, UNVERIFIED | No dossier composition in the research; LIMS Basics is QC data. UNVERIFIED [Nov 2025](https://www.veeva.com/resources/veeva-basics-adopted-by-more-than-100-emerging-biotechs-to-simplify-and-standardize-operations/) | Negative on both. Small-molecule US IND only (P-28). The professional tier decides who sees it. Register values are typed. |
| FDA forms filled into the official templates and placed into the program's sequence; IND cover letter; the annual report filed as an annual sequence with its m1.13 leaf | `server/services/ind-forms/ind-form-fill-service.ts`; `templates/forms/acroforms/`; `ind-forms.routes.ts:287`; `cover-letter-composer.ts`; `filing.routes.ts:288` | Not in the research; submission stays with the customer's publisher (V) [SB](https://www.weave.bio/platform/submission-builder/) | Not in the research. | Negative on both. Every form is `IMPLEMENTED_UNVERIFIED`. No vendored 3455 template. The 1571 and 3674 assets are not yet trusted by a named reviewer (`assetTrusted: false`). The forms status file and the route disagree on governance (§2.2). |
| An IND 30-day clock that will not state clearance without a recorded FDA receipt | `server/services/ind-lifecycle/ind-regulatory-clock.ts` (claim at `ui-surface-registry.ts:638`) | Not in the research. | Not in the research. | Negative on both. |

**Exceeds one vendor, not both:**

- **Against Weave:**
  - eCTD v3.2.2 compile and in-product validation (`regional-packager.ts`, `xml-validator.ts`). Weave's FAQ says submission stays in the customer's publishing process (V) ([SB](https://www.weave.bio/platform/submission-builder/)). Veeva Basics has Submissions Publishing (UNVERIFIED).
  - Part 11 signing on authoring and QMS acts (`governed-signature-ceremony.ts`). None was found for Weave (UNVERIFIED). Basics is aligned with Part 11 according to a third party (UNVERIFIED).
  - QMS records in one Quality place (`QmsRecords.tsx`, `mdx-qms.ts`). The research has no QMS for Weave. Against QMS Basics we lack a deviation record (G16).
- **Against Veeva Basics:** each citation's standing and Refresh all sources (`source-usage-projection.ts`, `authoring.router.ts:5824`). The research has no traceability for Basics (negative, UNVERIFIED). Weave has sentence-level tracing and always-current links (V).
- **Parity with Weave at best:** the per-program data room.

**Built, reachable or partly reachable, not yet proven.** These are not "exceed" claims. Each says why.

- **One governed chain from AnA draft to agency transmission** (`docs/design/ANA_DOCUMENT_CANVAS.md`, `authoring-file-to-vault.ts`, `dispatch-gate.ts`, `governed-transmit.ts`). Production refuses AI drafting: 0 of 16 models have passed PQ. FDA ESG is not proven (no UAT).
- **A dispatch verdict in which a critical Shadow Review finding closes only by a named person's signature** (`dispatch-gate.ts`, `shadow-finding-disposition.ts`, `shadow-review-waiver.ts`; P-34, P-35). The verdict cannot clear without the external validator and the DTDs (F-9, D7).
- **Approved-model governance and the Claude connector** (`approved-models.ts`, `server/mcp/`). 0 of 16 models have passed PQ. The connector is owed staging, a second machine's client and the Directory submission (D8).
- **Module 2.5/2.7 composed from completed CSR jobs** (`module2-csr-inputs.ts`). `migrations/20260628_csr_job_state.sql` is not in `C2C_MIGRATION_FILES`, so a deployed database may lack `csr_build_jobs`. CSR qualification is synthetic only.
- **Source-grounded AI drafting with span lineage, set against Basics.** Staging only until PQ passes.

**Built but locked: more, once admitted.** Each needs a founder decision (§6):

- deterministic biostatistics engines checked against published values (`server/services/stats/`; `docs/evidence/D2-BIOSTATISTICS/2026-10-11/`);
- CDISC conformance and Define-XML (`server/services/cdisc/`);
- RBQM scoring with Part 11 approvals (`server/services/rbm/`);
- PRR/ROR/EBGM signal detection (`pv-signal-detection.ts`);
- the eCTD v4.0 RPS builder (`server/services/ectd/ectd4/`);
- TMF completeness (`tmf-completeness.ts`).

---

## 5. Gaps inside the launch catalog

### 5.1 Can be built now

Each item names its work by the object that already exists, maps it to a row and a workstream, and says which test to see fail first and where the evidence goes.

Sizes:
- **XS:** up to half a day;
- **S:** up to a day;
- **M:** 2–4 days;
- **L:** 1–2 weeks.

**Held by another lane.** G2, G3, G6 and G15 are items 1–3 of the Weave-gap lane. That lane is claimed by `…01E8btkB8mcLirW4rNvsMNxK` and is waiting on the founder (`docs/work-orders/README.md:50`). None starts until the founder or that session releases it (§8, Q3). G11 and G17 change the same files (`agency-responses.ts`, the agency surfaces), so they wait for the same answer.

**G1. Fix the SOP register's review-overdue dates (CAT2-22; part of MR-12 Stage 1).**

- **Exists:**
  - `client/src/concept2cure/quality/data.ts:137` sets `TODAY = '2026-06-04'`.
  - It is read by `isReviewOverdue` (`:139`, called at `SopRegister.tsx:445`), `deriveReviewDue` (`:174`) and `reviewRowOf` (`:182`).
  - `reviewRowOf` builds the row passed to the record-review action (`SopRegister.tsx:500`, `:504`). That row's `overdue` field (`data.ts:188`) carries the stale date.
  - `canRecordReview` reads status and revision only (`PeriodicReview.tsx:58`), so the button shows correctly. The drawer does not.
  - The server's review-due read is at `mdx-qms.ts:473`. The shared UTC-day helper is `shared/utils/utc-day.ts`.
- **Benchmark:** periodic review in QualityDocs. UNVERIFIED [Basics](https://veevabasics.veeva.com/)
- **Row:** D2 (W1); also a step for OQ-006 (D4).
- **Fails first:** in `client/src/concept2cure/quality/__tests__/SopRegisterPeriodicReview.test.tsx`, set the system time to 2026-10-29 and a next review date of 2026-07-01. Assert both of these:
  1. the register's overdue mark;
  2. the row handed to the record-review action carries `overdue: true`.

  Both are red at HEAD.
- **Evidence:** `docs/evidence/MR-12/<date>-overdue-today/`.
- **Size:** XS–S.

**G2. Fix the registry's tool families that name no tool (held by the lane, item 1).**

- **The namespace the check enforces.** Each `anaToolFamilies` entry must be one of:
  - (a) an AnA tool or platform command: a name in `ana-launch-scope.inventory.json`, a `registerToolHandler` name, or an `AnaToolDefinitions.ts` name;
  - (b) a Report OS AnA tool (`server/services/report-os/ana/report-tools.ts`), which the insights surface offers.

  Two other namespaces do not count:
  - ai-actions types, such as `run_validation` (`server/services/ai-actions/handlers/run-validation.ts:26`);
  - MCP tools, such as `c2c_draft_agency_response` (`server/mcp/tools/drafting.ts:70`).

  For a prefix (`global_ri_`, `get_document`), the design decides: either write out the names it covers, or have the check accept a declared prefix.
- **Measured at `e7736eea6`** (§2.5): 106 entries. Under (a) and (b), 34 entries fail, or 32 if declared prefixes are accepted.
- **Launch-surface offenders, to fix first:**
  - submission-center: `validate_submission` (`shared/constants/ui-surface-registry.ts:361`);
  - dispatch-readiness: `run_validation`, an ai-actions type (`ui-surface-registry.ui-v2.ts:142`);
  - ivd-completeness: `assess_filing_readiness` (`:193`);
  - communication-center: `draft_agency_response` and `plan_crl_response` (`:771`).

  The insights entries at `:880` are Report OS tools, so they pass under (b). Off the catalog, `haq-manager` (`:319`) names `draft_haq_response` and `search_precedent_responses`.
- **Why it matters:** these names are shown on the Surfaces and Coverage screens (`Surfaces.tsx:460-465`, `Coverage.tsx:207-209`) and feed the shell's search text (`Shell.tsx:834`). A user is shown tools that do not exist.
- **Work:** replace each launch-surface name with the real tool, or remove it. For communication-center, the real tools are `draft_fda_ir_response` and `compile_correspondence_response_package`, both inScope.
- **Benchmark:** none. This is registry honesty (WEAVE_GAP §3).
- **Row:** D2 (W1).
- **Fails first:** write the check first and show it red at HEAD on the 34 (or 32) entries. Then fix the registry. The script count in §2.5 is not that check.
- **Evidence:** `docs/evidence/D2-WEAVE-GAP/<date>/phantom-tools/`.
- **Size:** XS–S.

**G3. Reach question extraction from the letter, in the Agency inbox. A step of P-39 step 3 (held by the lane, item 1).**

- **Exists:**
  - the question store and its writer (`migrations/20261018b_agency_response_questions.sql`; `POST …/questions`, `agency-responses.ts:384`);
  - the letter as a data-room source (`AgencyInbox.tsx:23`) and its text (`migrations/20261008c_data_room_source_text.sql`);
  - `POST /api/regulatory-correspondence/correspondence/intake`, claimed by communication-center (`ui-surface-registry.ui-v2.ts:770`) and called by no client.
- **Extractors found (RULE 3):**
  - `server/services/regulatory-correspondence/issue-parser.ts`: heuristic, device-scoped (it imports `DEVICE_ISSUE_TAXONOMY`).
  - The numbered-question split in `draft_fda_ir_response` (`AnaToolExecutor.ts:16012`).
  - `crl-ingestion.service.ts:173` `extractFindingsFromText`: model-based, through the AI gateway, serving the CRL library outside the catalog.
  - `POST /api/c2c/commitments/extract` (`commitments.ts:108`): an AI extraction of commitments, not of questions.
- **Already decided:** P-39 step 3 (`docs/LAUNCH_DEFINITION_OF_DONE.md`) converges the `c2c_correspondence` family onto the inbox, "keeping its issue parser and response clock as the inbox's". So the survivor is `issue-parser.ts`.
  - The `draft_fda_ir_response` split converges onto it, or is deleted, in the same change.
  - The CRL extractor is not a candidate: a model would produce the question list (Rule 2), and it serves a screen outside the catalog.
  - The commitments extraction belongs to P-39 step 2.
- **Open in the design:** IND letters are drug letters, and the parser is device-scoped. The design states whether the parser's split runs without the device taxonomy, or whether a drug taxonomy is added. It shows the result on a drug IND letter's shape before the slice is built.
- **Order:** P-39 lists step 2 (`c2c_commitments` onto `regulatory_commitments`) before step 3. Either step 2 lands first, or the founder allows the parser to move ahead of it (§8, Q4).
- **Work:**
  - propose the letter's questions verbatim, with their positions in the letter;
  - a person confirms each through the existing POST;
  - a proposal writes nothing;
  - the extraction makes no model call.
- **Benchmark:** HAQ Manager extraction (V) [HAQ](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase).
- **Row:** D2 (W1).
- **Fails first:** take a letter source holding three numbered drug-IND questions. Then:
  1. the proposal returns three, with their exact text;
  2. confirming one writes one row;
  3. a proposal alone writes none.

  This is red at HEAD, because no proposal path reaches the inbox.
- **Evidence:** `docs/evidence/D2-WEAVE-GAP/<date>/question-extraction/`.
- **Size:** M.

**G4. Fix `check_consistency` so that it compares the saved text, not the text in the call.**

- **Exists:**
  - The handler (`AnaToolExecutor.ts:10064`) requires `left.text` (`:10074`) and passes the supplied text on (`:10082`).
  - The deterministic comparison `runConsistencyCheck` (`truth-engine-service.ts`) and `figure-consistency.ts`.
  - Findings are stored in `consistency_findings` and shown by `SubmissionConsistency.tsx`.
- **Gap:** a finding recorded against a submission can describe text that is not in it. This is the Rule 2 class measured in `docs/evidence/RULE2/2026-10-26-model-figures-audit/`.
- **Work:**
  - take references to sections or leaves, and read their saved text server-side under tenant scope;
  - ignore any supplied text, and say so.
- **Benchmark:** AutoReview (V) [Feb26](https://www.weave.bio/resources/weave-february-2026-release-notes/).
- **Row:** D2 (W1).
- **Fails first:** save a section with "N=120", then call with `left.text` "N=100". Today a finding is recorded on 100. After the fix, the saved 120 is compared.
- **Evidence:** `docs/evidence/RULE2/<date>-check-consistency-saved-text/`.
- **Size:** S–M.

**G5. Fix the CTD module QC checks so they read saved content, then reach them. Behind G4: a Rule 2 fix first, then a reach.**

- **Exists:**
  - the checks `m2-summary-qc.ts`, `m4-nonclinical-qc.ts`, `m5-clinical-qc.ts`, `ctd-authoring-readiness.ts`;
  - POST routes `authoring-pdf.routes.ts:67`, `:91`, `:115`, `:135`, over the request body. The file says so itself (`:128-131`): "These caller-supplied verdicts do not load current governed program content";
  - no registry claim and no client caller, so production refuses them as unmapped.
- **Gap:** putting these routes on a screen as they are would show verdicts about whatever the client sends. That is the same defect as G4. They are not reads.
- **Work, in order:**
  1. A server-side loader assembles each check's input from saved records under tenant scope: Module 2 from the saved Module 2 sections; Module 5 from the project's completed CSR jobs, following the `module2-csr-inputs.ts` pattern. Module 4 waits on R-1, since no store links nonclinical studies to a project.
  2. The routes ignore a supplied body and say so.
  3. Claim the reads for the launch surface that shows findings, and render them beside `SubmissionConsistency`.

  Whether the standalone M2 PDF route is admitted is the design's call.
- **Benchmark:** AutoReview (V) [Feb26](https://www.weave.bio/resources/weave-february-2026-release-notes/).
- **Row:** D2 (W1).
- **Fails first:**
  1. Saved M5 inputs hold a phase 1 CSR only. Send a body that claims phases 1–3. The verdict must not change. At HEAD it reflects the body.
  2. Before the claim, `npm run ci:launch-scope-api` must refuse the screen's call. The P-48 README reports 538 launch paths, none refused.
- **Evidence:** `docs/evidence/RULE2/<date>-ctd-module-qc-saved-content/`, then `docs/evidence/D2-CTD-MODULE-QC/<date>/`.
- **Size:** M–L.

**G6. Complete per-citation verification in Review (held by the lane, item 3).**

- **Exists:**
  - `document_span_lineage`; each citation's standing (`source-usage.service.ts`, `source-usage-projection.ts`);
  - `Review.tsx`, whose verdicts "are not electronic signatures" (`:590`);
  - **the CSR scientific-review step** (`ReviewDecisionDialog.tsx`, `shared/authoring/csr-scientific-review.ts`, `server/services/authoring/csr-scientific-review.ts`; `docs/evidence/D5/2026-10-29-csr-scientific-review-step/`): the reviewer maps each figure in the saved text to a retained table cell and attests, bound by hash;
  - **the bibliographic "citation verification"** (`server/services/citation-verification-service.ts`; `POST /api/citations/verify`, `server/routes/citations.ts:38`; AnA `verify_citations`, `AnaToolExecutor.ts:4788`). It checks that a reference exists (PubMed, Crossref, retraction). That is a different act.
- **Work:**
  - Extend the review decision's map (`shared/authoring/peer-review.ts`) from CSR figures to the citations of the version under review. Do not add a parallel store.
  - The reviewer marks each citation; the mark is bound to the cited version's checksum.
  - A `changed`, `superseded` or `unresolved` citation cannot be marked.
  - Name the act so it cannot be confused with the bibliographic check, and say whether that check's result is shown beside it.
  - Session `…01E8btkB` changed `ReviewDecisionDialog.tsx` on 2026-10-29. Coordinate with it.
- **Benchmark:** sentence-level tracing (V) [SB](https://www.weave.bio/platform/submission-builder/).
- **Row:** D2 (W1).
- **Fails first:** take a document with two citations, one of whose sources has a successor. Marking the superseded one is refused. Marking the current one records the checksum in the review decision. Red at HEAD.
- **Evidence:** `docs/evidence/D2-WEAVE-GAP/<date>/citation-verification/`.
- **Size:** M.

**G7. Complete Vault where-used with the sections that cite a version, and list what a new version affects.**

- **Exists:**
  - `server/services/vault/vault-where-used.ts`: placements `:83`, eSTAR uses `:166`, CMC evidence uses `:220`. Its comment at `:23` notes that `vault.evidence_citations` holds search hits, not uses.
  - It is read at `project-vault.ts:1721` and shown in `VaultVersions.tsx`.
  - The `superseded` state of a citation (`source-usage-projection.ts`).
- **Work:**
  - add authoring citations to where-used;
  - on the successor version, list the sections that cite the predecessor, each opening the editor at that section;
  - the design's first question is which key joins an authoring citation to a Vault version, given six unconverged citation tables.
- **Benchmark:** Dossier Manager (V) [Platform](https://www.weave.bio/platform/); AutoUpdate UNVERIFIED [Newsletter](https://www.weave.bio/resource-category/newsletter/).
- **Row:** D2 (W1).
- **Fails first:** extend `tests/db/vault-where-used.dbtest.ts`. Cite v1 in a section, then file v2 as its `replace`. v1's where-used must list the section. Red at HEAD.
- **Evidence:** `docs/evidence/D2-SOURCE-CHANGE-IMPACT/<date>/`.
- **Size:** M.

**G8. Complete the eCTD viewer that Submission Center already has.**

- **Exists:**
  - `backboneTree()` (`EctdCompile.tsx:417`) renders the current compile only (`:784`).
  - The history route (`ectd-compile.ts:1471`) selects no backbone (`:1492-1497`).
  - The filed-state view (`:1529`) and the Builder leaf table.
  - The IND diff routes (`sequence.routes.ts:173`, `:190`) and `manifestForSequence` (`:35`), which have no client caller.
- **Work:**
  - reopen a past compile's tree from the history;
  - link each leaf to its Vault document and version;
  - either fix the diff's semantics and give it a caller, or delete it and name the reachable replacement.
- **Benchmark:** the Submissions Archive viewer. UNVERIFIED [Basics](https://veevabasics.veeva.com/). Also RIM_GAP next item 1 and P-37.
- **Row:** D7 (W5).
- **Fails first:** compile 0000, then 0001, and open 0000 from the history. Its `index.xml` tree must render. Red at HEAD.
- **Evidence:** `docs/evidence/W5/<date>-ectd-viewer/`.
- **Size:** M.

**G9. Complete management-review actions (P-48 owed).**

- **Exists:**
  - `qms_management_reviews` holds `outputs` and its action counts (`migrations/20260511_qms_and_labeling.sql:121-136`);
  - its routes are GET and POST only (`mdx-qms.ts:1129`, `:1141`);
  - raise-a-CAPA-from-a-record (`c9f14b5b9`) is the pattern for an action that needs a CAPA.
- **Not taken here:** CAPA action moves and the CAPA detail view. They are in flight, uncommitted, in another session's working tree (`CapaActions.tsx`). This slice starts after that session commits, because it touches `QmsRecords.tsx`.
- **Work:**
  - record a management-review action through the existing `outputs`, with no new table;
  - whether the stored counts are replaced by derived ones is decided in the design.
- **Benchmark:** none. Management review is not in the Basics list in the research.
- **Row:** D2 (W1).
- **Fails first:** a review with one recorded open action shows 1 open, and closing that action shows 0. At HEAD, no route records an action.
- **Evidence:** `docs/evidence/D2-ONE-ANA/<date>/p48-management-review-actions/`.
- **Size:** S–M.

**G10. Reach per-person training expiry.**

- **Exists:** `GET /qms/training` (`mdx-qms.ts:845`) and `GET /qms/training/expiring` (`:857`), with no client caller. Only `/qms/training/compliance` (`:879`) is called.
- **Work:** a per-person expiry view in Quality, with no new route. Distribution of an effective SOP is not part of this slice (§5.2).
- **Benchmark:** Training Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/)
- **Row:** D2 (W1).
- **Fails first:** a training record expiring in 10 days is listed for its person in Quality. Red at HEAD, because nothing calls the route.
- **Evidence:** `docs/evidence/MR-12/<date>-training-expiry/`.
- **Size:** S.

**G11. Complete agency responses with the program's approved prior answers as sources, and with links between related questions.**

- **Exists:**
  - append-only response texts with their approving signatures (`agency-responses.ts:492`);
  - the editor intake for a question (`agency-responses.ts:337`; `agency-response-source.ts:72`; `SourceImportDialog`).
- **Not found:** no prior-answer lookup and no related-question link (§2.5).
- **Work:**
  - offer the program's approved answers as citable sources, each with its letter, question and signature;
  - let a person link a question to a related question on another letter;
  - reuse is always a citation, never a silent copy.
- **Benchmark:** "drafts responses from sources and prior answers … links related questions to drafted or submitted responses" (V) [HAQ](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase).
- **Row:** D2 (W1). Waits for the lane answer (shared files).
- **Fails first:** given an approved answer to letter A's question 1, opening a response to letter B lists A/Q1 with its signature id. Linking B/Q2 to A/Q1 shows the link on both. Red at HEAD.
- **Evidence:** `docs/evidence/D2-HAQ-PRIOR-ANSWERS/<date>/`.
- **Size:** M.

**G12. Reach placement of the signed response package into the program's sequence.**

- **Exists:**
  - the audited package (`agency-responses.ts:660`);
  - the Module 1 placement catalogue (`module1HeadingForSectionKey`, as the IND forms use it at `ind-forms.routes.ts:128`);
  - a Vault version becoming a leaf (P-42).
- **Work:**
  - file the package to the Vault and place it as a Module 1 leaf through the existing placement;
  - its section comes from the placement catalogue, not from this document.
- **Benchmark:** Module 1.11 placement. UNVERIFIED [HAQ page](https://www.weave.bio/platform/platform-haq-manager/)
- **Row:** D7 (W5). It runs after the W1 Agency worker's slices that touch `agency-responses.ts`.
- **Fails first:** after approval, placement creates one Vault version whose sha256 equals the package bytes, and one leaf. Red at HEAD.
- **Evidence:** `docs/evidence/W5/<date>-response-package-placement/`.
- **Size:** M.

**G13. Complete Place into filing with the formatted PDF (MR-09 Stage 4, CAT1-18).**

- **Exists:**
  - `AuthoringPlaceIntoFiling.tsx` writes a snapshot, then makes a separate leaf PUT;
  - `assembleSnapshot` (`placeIntoFilingCopy.ts:28`);
  - `fileAuthoringDocumentToVault`;
  - `renderLeafPdf` (`server/services/ectd/leaf-pdf-renderer.ts:558`, imported at `leaf-source-resolver.ts:57`);
  - DOCX to PDF through LibreOffice (`authoring-export.ts:546`).
- **Benchmark:** export fidelity; Weave's DOCX export (V) [SB](https://www.weave.bio/platform/submission-builder/).
- **Row:** D7/D10 (MR-09 `:506`), W5.
- **Fails first:** the MR-09 Stage 4 acceptance test. A section holding a table is placed in one server call, and the leaf PDF carries the table. Red at HEAD.
- **Evidence:** `docs/evidence/MR-09/<date>/stage-4/`.
- **Size:** M.

**G14. Converge the briefing-book assemblers, and complete the briefing book as an editor document.**

- **Exists:** three implementations (§2.3):
  1. `ind-briefing-book-service.ts`: the engine of the launch route (`documents.routes.ts:17`, `:413`, `:426`; `IndLifecycle.tsx:1018`, `canFile: false`).
  2. `server/services/ana/briefing-book-core.ts`: behind hidden AnA `assemble_briefing_book` (`AnaToolExecutor.ts:1536`).
  3. `intelligence-questions/flows/briefing-book.ts`: an Advisory Committee briefing flow, which is a different document.
- **Also exists:** the registry entries `US_PRE_IND` and `US_TYPE_A/B/C_MEETING` (`global-document-registry.ts:81`, `:454-456`). The two meeting stores converge in P-39 step 4.
- **Canonical:** `ind-briefing-book-service.ts`, the launch-reachable engine.
  - `briefing-book-core.ts` is folded onto it, or deleted, in the same change, after each of its functions is shown to exist in the canonical engine or is carried over (P-47; RULE 3 step 5).
  - The Advisory Committee flow is named as a different document and stays outside this slice.
- **Work:**
  - start the book in the editor from its meeting entry, with sources, review and signature;
  - the IND screen opens that document instead of assembling a second one.
- **Benchmark:** briefing books (V) [Home](https://www.weave.bio/).
- **Row:** D2 (W1).
- **Fails first:**
  1. Starting a Pre-IND briefing book from Plan creates an authoring document that can be sent for review.
  2. After the change, one FDA-meeting assembler remains (a structural test).

  Both are red at HEAD.
- **Evidence:** `docs/evidence/D2-BRIEFING-BOOK/<date>/`.
- **Size:** M–L.

**G15. Complete the drafted response inside the response record (WEAVE_GAP item 2; held by the lane, item 2).**

- **Exists:**
  - the question goes to an editor copy (`agency-responses.ts:337`; `agency-response-source.ts:72`);
  - drafting in the editor from the program's sources, with lineage (`authoring.router.ts:3375`; `span-lineage.service.ts`; staging only);
  - machine-origin receipts (`agency-response-machine-origin.ts`);
  - write-back through `saveResponseTx` (`response-service.ts:469`);
  - `draft_fda_ir_response`, which returns format instructions and writes nothing;
  - MCP `c2c_draft_agency_response` (`drafting.ts:70`), which drafts from caller-supplied facts.
- **Gap:** no drafted response inside the response record from the program's own record, with span lineage. The round trip to the editor already exists, so the design's first step is to name the missing hop. Is it the response record carrying the lineage of its saved text? Or a draft started from the question with its letter and the program's sources pinned?
- **Rule 2:** the model narrates. Figures come from the program's records.
- **Production:** refused until PQ passes (`approved-models.ts`). The slice is testable in staging only, and a status report must say so.
- **Benchmark:** HAQ drafting (V) [HAQ](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase).
- **Row:** D2 (W1).
- **Fails first:** in staging, draft a response for a question, accept it and write it back. The response record's text must resolve to span-lineage rows naming the program's sources. The design confirms which hop is red at HEAD before building.
- **Evidence:** `docs/evidence/D2-WEAVE-GAP/<date>/drafted-response/`.
- **Size:** M.

**G16. Complete the deviation record in Quality (P-48).**

- **Exists:**
  - the nonconforming-product register (`qms_nonconforming_products`, product-keyed) and its tab, whose description claims deviations (`QmsRecords.tsx:249`);
  - the `/api/qc/deviations` stub (`qc.routes.ts:397-444`; `storage.ts:1495-1516`: reads return empty, writes throw `NOT_IMPLEMENTED`, no table, unclaimed);
  - GCP protocol deviations in protocol-dev (`server/routes/protocol-deviations.ts`);
  - change-control deviation links in free text (`changeControl.service.ts`);
  - AnA `classify_gmp_deviation` (reasoning only);
  - deleted: `DeviationCapaBoard.jsx` (`7a144fd1e`).
- **Work:**
  - one quality deviation record in Quality: no product needed, a type, an investigation, and a CAPA raised through `sourceRefs` as `c9f14b5b9` does;
  - the store choice is made in the design. Either the NCR register gains a record kind through an additive column, or a new `public` table with `organization_id INTEGER NOT NULL` is inserted before the final sweep pair (RULE 1 corollary);
  - the losing stub is deleted in the same change (zero duplication).
- **Basis:** P-48 already puts deviations in the QMS app. If the founder reads the NCR tab as meeting that, this slice waits (§8, Q5).
- **Benchmark:** Deviations in QMS Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/)
- **Row:** D2 (W1). Starts after the in-flight QMS session commits.
- **Fails first:** record a deviation with no product or lot (a missed environmental-monitoring reading) through Quality. It is listed as a deviation. At HEAD, the only form is product-keyed and `POST /api/qc/deviations` throws.
- **Evidence:** `docs/evidence/D2-ONE-ANA/<date>/p48-deviations/`.
- **Size:** M–L.

**G17. Reach the program's Data Room passages for each agency question.**

- **Exists:**
  - `data-room-search.ts`, `document-passage-search.ts`;
  - the letter pinned as a source;
  - project-scoped retrieval in the editor (`authoring.router.ts:3440`);
  - none of these is called by the agency-response code (§2.5).
- **Work:**
  - for each question, list the program's passages that match its text, with deterministic search and no model call, each with its source and version checksum;
  - a person pins the passages that answer it.
- **Benchmark:** "finds relevant Data Room sources for each question" (V) [HAQ](https://www.businesswire.com/news/home/20251106110323/en/Weave-Bio-Launches-HAQ-Manager-Extending-AI-Native-Regulatory-Automation-into-Critical-Review-Phase).
- **Row:** D2 (W1). Waits for the lane answer (shared files).
- **Fails first:** a question that names "stability at 25 °C", and a program source that holds that passage. The question lists the passage with its source id and checksum. Red at HEAD.
- **Evidence:** `docs/evidence/D2-HAQ-QUESTION-SOURCES/<date>/`.
- **Size:** S–M.

### 5.2 Inside the catalog, waiting on a founder decision (not buildable now)

Each item appears once. The nonclinical ingest path and NDA, BLA or biologic Module 3 widen the catalog, so they are in §6.

| Gap | Exists | Decision | Row (W) |
|---|---|---|---|
| **Production AI drafting.** Every Weave-parity drafting row, and G15, is staging-only. | `approved-models.ts` (16 pending, 0 passed); `server/eval/rag/`, `server/eval/doc-quality/`; `docs/evidence/MODEL-GOVERNANCE/` | Approve the PQ protocol for Opus 5.5, raise the gold bank to its floor, and supply the product provider key (DoD D4, MR-13 AI-01) | D4 (W3) |
| Controlled export document control (CAT1-09) | `authoring-export.ts` (`:435`, `:546`); the working copy stamped "DRAFT — uncontrolled copy" (`authoring.router.ts:6537`, `:6573`); controlled export offered only when frozen or approved (`DownloadMenu.tsx:52-54`); MR-09 Stage 1 | MR-09 NEW: page size (Letter recommended), PDF target, confidentiality footer | D7/D10 (W5) |
| QMS controlled copy (CAT2-24) | The SOP body is an Authoring copy (`qms_documents.authoring_document_id`), so Authoring's controlled export applies to it | MR-12 Stage 8 comes after Stage 5, which waits on NEW-4. Stage 5 delegates the printed signature block to Stage 8 | D2 (W1) |
| Per-document training assignment | `training-compliance.ts`; MR-12 Stage 4. The training surface stays out of the shell (`launch-scope.ts:232-238`); this lives in Quality | NEW-2 (role or curriculum), NEW-3 (training before the effective date) | D2 (W1) |
| Distribution of an effective SOP | `notification-record-target.ts:97`, `:137` (a target nothing emits); the deadline-task pattern (VEEVA_GAP §5). No MR-12 stage covers distribution; Stage 7 reuses notifications for review reminders only | Who receives it: every active member, by role, or by assignment. That is the assignment model NEW-2 reserves. Distribution is not in the research for either vendor | D2 (W1) |
| Reviewer and approver routing, quorum, retirement meaning | `authoring_workflow_steps` (`authoring.router.ts:6723`); `SopRegister.tsx:592`; MR-12 Stages 5 and 7 | NEW-4, F-12 | D2/D5 (W1, W3b) |
| Signing for SSO-only organisations (CAT1-03) | `reverify-signer.ts`; MR-09 Stage 6 | MR-09 NEW signing method; F-13; F-24 | D5 (W3b) |
| Live co-editing | `featureFlags.ts:74`; `hocuspocus-server.ts` | F-27 | D2 (W1) |

---

## 6. Gaps outside the catalog (founder decisions under RULE 2)

Each row would widen the launch catalog. The recommendation is one of **adopt now**, **after D10**, **partner or integrate**, or **never**.

| Area | Benchmark | What exists | Recommendation | Reason | Dependency |
|---|---|---|---|---|---|
| Nonclinical study-report ingest into 2.4/2.6 (admits `/api/preclinical`, claimed only by the locked `nonclinical` surface) | AutoIND nonclinical templates (V) [Dec24](https://www.weave.bio/resources/autoind-december-2024-product-release-notes/); Takeda result (V) [Takeda](https://www.weave.bio/weave-bio-announces-collaboration-with-takeda-to-deploy-ai-native-regulatory-automation-across-key-drug-development-activities/) | `server/routes/preclinical.ts`; `preclinical-ingest-service.ts` (writes `ctd_nonclinical_studies`, gated by `PRECLINICAL_INGEST_ENABLED`); `nonclinical-program-loader.ts`; `load-nonclinical-studies-for-project.ts` (orchestrator 2.4 step); `nonclinical-m24-adapter.ts`; `m26-nonclinical-summaries.ts` (deterministic 2.6.1–2.6.7); `module2-nonclinical-inputs.ts` (`needs_data`) | **Adopt now** | It is the one Weave headline we cannot match honestly (WEAVE_GAP decision 1), and the capability lands in Authoring | R-1, recorded in `FOUNDER-DECISIONS-OWED-2026-10-26.md` row "2 (R-1)" and RULE2 `design.md`. R-1 recommends `nonclinical_studies`, but ingest and the orchestrator use `ctd_nonclinical_studies`, so the decision must pick one and converge the other. Also: both flags on in the deploy; an upload entry on a launch surface; extracted values confirmed by a person before any composer reads them (RULE 2); PQ for the model step |
| NDA, BLA or biologic Module 3 | Weave NDA workflow (V) [NDA](https://www.businesswire.com/news/home/20260429322286/en/Weave-Bio-Launches-NDA-Workflow-Designed-in-Partnership-with-Parexel-Extending-AI-Native-Platform-Coverage-Across-the-Full-Regulatory-Lifecycle) | `server/services/cmc/composition-scope.ts` refuses them by name | **After D10** | The launch customer is a small-molecule US IND sponsor (P-28) | Widening P-28; P-37 reopens registrations with it |
| Template Library and a custom template builder | EU CTA template and custom template builder (V) [Global](https://www.businesswire.com/news/home/20260615319013/en/Weave-Bio-Enables-Global-Submissions-From-a-Single-Source-of-Truth) | `TemplateLibrary.tsx`; `server/routes/c2c/templates.ts`, `template-upload.ts`; `server/services/templates/templateStore.ts`; out since 2026-10-08 (`launch-scope.ts:103-107`) | **After D10** | A saved template formats no authored document (CAT1-16); re-admitting the screen first would repeat the reason it left | MR-09 NEW, then MR-09 Stage 1 (template formatting on export); a non-US template also needs P-28 widened |
| eTMF | eTMF Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/), [Launch 2024](https://www.veeva.com/resources/veeva-introduces-vault-basics-for-biotechs/) | `Etmf.tsx`; `etmf.routes.ts`; `tmf-completeness.ts` (41 artifacts); second store `etmf.ts`, its migration not deployed; TMF folders in the launch Vault | **After D10** | One study record and one TMF store come first, with their own URS and OQ | One study store; converge the two TMF stores (RULE 1 for the losing migration) |
| CTMS | CTMS Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/), [May 2025](https://www.veeva.com/resources/more-than-75-emerging-biotechs-use-veeva-basics-across-clinical-regulatory-and-quality/) | `clinical-operations-routes.ts`; `ClinicalOps.tsx`; `db/migrations/20260902_clinical_ops_schema.sql`; the registry claim mismatch | **After D10** | Four study stores (`clinical_ops.studies`, `clinical_studies`, `cro_studies`, `protocol_documents`) must converge first | The study-store decision; the registry claim fix |
| Study startup (site activation) | No Basics edition found. UNVERIFIED [Study Startup](https://www.veeva.com/products/vault-study-startup-features/) | IRB, ICF, 1572/3454/3455 and budget feasibility already in the catalog (`irb.ts`, `protocol-consent.ts`, `protocol-budget.ts`) | **After D10** | Basics does not seem to offer it either | CTMS study store |
| Safety / PV | No Safety Basics; full Safety through an 8-week model. UNVERIFIED [Safety](https://www.veeva.com/eu/resources/vault-safety-accelerated-implementation-model/) | Locked `PvCockpit.tsx`; no intake UI (`pharmacovigilance-routes.ts:285`); E2B not HL7 v3 (`e2b-icsr-composer.ts:340`); `expedited-reporting-clock.ts`; licence-gated MedDRA; `pharmacovigilanceService.ts` builds a case id from `Math.random` and swallows an audit write | **Partner or integrate** for case processing and E2B; **after D10** for the IND safety card and DSUR line listings | A safety database of record is a regulated system of its own; P-32 keeps it shut | MedDRA and WHODrug licences (F-16); an E2B rewrite or a partner gateway; reversing P-32 |
| EDC / CDMS | No EDC Basics found. UNVERIFIED [CDMS](https://cdmshelp.veeva.com/lr/resources/clinical-data-overview/), [Study Builder](https://www.veeva.com/resources/new-veeva-study-builder-agent-to-configure-clinical-studies-in-as-little-as-one-day/) | `crf-shell.ts` only; `server/services/cdisc/*`; `xpt-structure.ts` | **Partner or integrate** | A validated subject-data system; neither benchmark offers one in a starter tier | An EDC partner; SDTM/ADaM import through the data room |
| Biostatistics workbench, RBM | **Not researched for either vendor** | `server/services/stats/`; `BiostatWorkbench.tsx`; `server/services/rbm/`; `Rbm.tsx`; P-47 | **After D10** | No benchmark asks for them | A statistical qualification package; a KRI data feed |
| Full LMS: curricula, eLearning, classroom | Training Basics. UNVERIFIED [Basics](https://veevabasics.veeva.com/) | Read-and-understood; CITI matrix (`citi-logic.ts`), locked | **Partner or integrate** | A content LMS is a product of its own. Per-document assignment stays in Quality (§5.2) | NEW-2 |
| Registrations and labels | Not in Basics. UNVERIFIED [Kivo](https://kivo.io/news/kivo-vs.-veeva-vault-rim-a-side-by-side-comparison) | `server/routes/rim.ts`; `Registrations.tsx`; `migrations/20260610_rim_lite.sql` not deployed | **After D10**, when P-28 widens (P-37) | Launch customers hold no marketing authorisation | The migration added to `C2C_MIGRATION_FILES` (additive, RULE 1) |
| QC operations: batch release, CoA, external results, stability | LIMS Basics. UNVERIFIED [Nov 2025](https://www.veeva.com/resources/veeva-basics-adopted-by-more-than-100-emerging-biotechs-to-simplify-and-standardize-operations/) | CMC registers (`register-writes.ts`, `batch-release-evidence.ts`); `/api/qc` stubs (`releaseBatch` throws `NOT_IMPLEMENTED`) | **After D10**; **integrate** with the CMO's LIMS | Module 3 needs the values, not a LIMS | A batch-release signature design; CMO data formats |
| Drug complaints, ICH Q9 QRM, APQR, lab investigations | Full QMS only (inferred). UNVERIFIED [QMS brief](https://www.veeva.com/resources/veeva-qms-product-brief/) | Device complaints in the catalog, read-only on screen (§2.2); device risk (`Risk.tsx`); `/api/qc/oos-investigations`, unclaimed | **After D10** | Not in the Basics list; rare for a clinical-stage sponsor | P-48 follow-ups |
| Medical and commercial: promotional review (PromoMats Basics) | UNVERIFIED [Nov 2025](https://www.veeva.com/resources/veeva-basics-adopted-by-more-than-100-emerging-biotechs-to-simplify-and-standardize-operations/) | `server/routes/global-ri/promotional-compliance.routes.ts` (knowledge, outside the catalog); no review workflow found | **After D10**, only with a marketing application | A launch customer has no marketed product to promote | Widening P-28 |
| eCTD v4.0 | Full RIM. UNVERIFIED [eCTD 4.0](https://www.veeva.com/blog/enabling-submission-success-with-ectd-4-0/) | `server/services/ectd/ectd4/*`, unreachable | **After D10** (F-23) | Not needed for a US IND on v3.2.2 | Agency timing; a compile and transmit path |
| Non-FDA markets and gateways | Publishing Basics in North America and Europe. UNVERIFIED [May 2025](https://www.veeva.com/resources/more-than-75-emerging-biotechs-use-veeva-basics-across-clinical-regulatory-and-quality/). EU CTA template (V) [Global](https://www.businesswire.com/news/home/20260615319013/en/Weave-Bio-Enables-Global-Submissions-From-a-Single-Source-of-Truth) | Refusing adapters (`pmda-gateway.ts`, `health-canada-gateway.ts`); `ema-cesp.ts` (non-centralised only); `market-support.ts` | **After D10** | P-28 is a US IND | Wire contracts from regulators; P-28; P-45 |
| Translation | **Not in the research for either vendor** | `translation.routes.ts`, unreachable; migration not deployed | **Never at launch**; revisit with the first non-US filing | No benchmark asks for it | Widening P-28 |
| Regulatory intelligence screens | None found for Weave. UNVERIFIED [News](https://www.weave.bio/news/) | AnA tools in scope; `CrlLibrary.tsx`, `GlobalRiBrowser.tsx`, `PrecedentEngine.tsx` locked | **After D10** for the screens | Corpus ingestion stays as the DoD sets it | A corpus loaded per tenant |
| Veeva Vault connector (import, export) | Veeva round trip (V) [SB](https://www.weave.bio/platform/submission-builder/) | `server/services/connectors/veeva-vault.ts` (AnA search only); `server/integrations/veeva-vault/*`, unreachable | **Partner or integrate, after D10**, import first | The DoD's connector scope names the agency gateways and the Claude connector | Veeva API access; field-mapping review; ingest through `vault-ingest` |
| Multi-region planner, submission simulation | Program Planner, unreleased (V for the label; launch UNVERIFIED) [Home](https://www.weave.bio/) | `POST /api/submissions/:id/plan` (no caller) | **After D10** (P-45) | Decided already | — |

---

## 7. Proposed order

At most four workers run at once (DoD, "How sessions run"). Each owns **one workstream** (RULE 2) and one directory set:

| Worker | Workstream | Directory set | Slices, in order |
|---|---|---|---|
| Quality | W1 (D2) | `client/src/concept2cure/quality/`, `server/routes/mdx-qms.ts`, `server/routes/qc.routes.ts` | G1, G10, then G16 and G9 after the in-flight QMS session commits |
| Authoring and QC | W1 (D2) | `server/services/ana/AnaToolExecutor.ts` (consistency), `server/services/truth-engine/`, `server/routes/authoring-pdf.routes.ts`, `server/services/vault/vault-where-used.ts`, `Review.tsx` | G4, G5, G7, then G6 when released |
| Agency | W1 (D2) | `server/routes/c2c/agency-responses.ts`, `server/services/agency-responses/`, `server/services/regulatory-correspondence/`, the IND briefing book, the registry's tool families | G14 first; then G2, G3, G15, G11, G17 once the lane is released |
| Submission | W5 (D7) | `server/routes/ectd-compile.ts`, `EctdCompile.tsx`, `server/routes/ind-lifecycle/sequence.routes.ts`, place into filing, `leaf-source-resolver.ts` | G8, G13, then G12 after the Agency worker's response slices |

Two files are shared. Registry files (G2, G5) and `agency-responses.ts` (G11, G12, G15, G17) are changed by one worker at a time, in the order above.

| # | Slice | Files | Row (W) | Evidence | Starts when | Size |
|---|---|---|---|---|---|---|
| 1 | G1. Fix the review-overdue dates, including `reviewRowOf` | `client/src/concept2cure/quality/data.ts`, `SopRegister.tsx`, `quality/__tests__/SopRegisterPeriodicReview.test.tsx` | D2 (W1) | `docs/evidence/MR-12/<date>-overdue-today/` | Now | XS–S |
| 2 | G4. Fix `check_consistency` to compare the saved text | `server/services/ana/AnaToolExecutor.ts:10064`; `AnaToolDefinitions.ts`; `server/services/truth-engine/truth-engine-service.ts` | D2 (W1) | `docs/evidence/RULE2/<date>-check-consistency-saved-text/` | Now | S–M |
| 3 | G8. Complete the eCTD viewer (history tree, leaf to Vault, IND diff) | `server/routes/ectd-compile.ts:1471`; `EctdCompile.tsx`; `server/routes/ind-lifecycle/sequence.routes.ts` | D7 (W5) | `docs/evidence/W5/<date>-ectd-viewer/` | Now | M |
| 4 | G10. Reach per-person training expiry | `client/src/concept2cure/quality/` (a view and its hook); reads `mdx-qms.ts:845`, `:857` | D2 (W1) | `docs/evidence/MR-12/<date>-training-expiry/` | Now | S |
| 5 | G5. Fix the CTD module QC to read saved content, then reach it | `server/routes/authoring-pdf.routes.ts`; `server/services/authoring/m2-summary-qc.ts`, `m5-clinical-qc.ts`, `ctd-authoring-readiness.ts`; `shared/constants/ui-surface-registry.ts`; `SubmissionConsistency.tsx` | D2 (W1) | `docs/evidence/RULE2/<date>-ctd-module-qc-saved-content/`, `docs/evidence/D2-CTD-MODULE-QC/<date>/` | After G4 | M–L |
| 6 | G14. Converge the briefing-book assemblers; the book in the editor | `server/services/ind-lifecycle/ind-briefing-book-service.ts`; `server/services/ana/briefing-book-core.ts`; `server/routes/ind-lifecycle/documents.routes.ts`; `IndLifecycle.tsx` | D2 (W1) | `docs/evidence/D2-BRIEFING-BOOK/<date>/` | Now | M–L |
| 7 | G13. Complete Place into filing with the formatted PDF | `AuthoringPlaceIntoFiling.tsx`, `placeIntoFilingCopy.ts`; `authoring-file-to-vault.ts`; `server/services/ectd/leaf-source-resolver.ts` | D7/D10 (W5) | `docs/evidence/MR-09/<date>/stage-4/` | After G8 | M |
| 8 | G7. Complete where-used and the affected-sections list | `vault-where-used.ts`; `project-vault.ts:1721`; `VaultVersions.tsx`; `tests/db/vault-where-used.dbtest.ts` | D2 (W1) | `docs/evidence/D2-SOURCE-CHANGE-IMPACT/<date>/` | After G5 | M |
| 9 | G16. Complete the deviation record in Quality | `QmsRecords.tsx`, `qmsRecordData.ts`; `mdx-qms.ts` or `qc.routes.ts` (one survives); a migration in `C2C_MIGRATION_FILES` | D2 (W1) | `docs/evidence/D2-ONE-ANA/<date>/p48-deviations/` | After the in-flight QMS commit, and the founder's answer to Q5 | M–L |
| 10 | G2. Fix the registry's tool families, with the check that keeps them honest | `shared/constants/ui-surface-registry.ts:361`; `ui-surface-registry.ui-v2.ts:142`, `:193`, `:771`; a new registry-integrity test | D2 (W1) | `docs/evidence/D2-WEAVE-GAP/<date>/phantom-tools/` | When the lane is released | XS–S |

Next come, in this order: G9, G3, G15, G6, G11, G17, G12.

**Running beside all of this, owed by the founder and not by a session:**

- PQ for Opus 5.5 (D4, W3);
- R-1, including which nonclinical store, and admission of the nonclinical path;
- the MR-09 page-size decision;
- the lane release (§8, Q3).

Until PQ passes, every drafting improvement above can be tested only in staging, and a status report must say so.

---

## 8. Open questions for the founder

1. **PQ.** Will you approve the Opus 5.5 PQ protocol and supply the product provider key? All 16 approved-model entries are `pending` (`approved-models.ts`). Until one passes, production refuses governed drafting, and no claim of parity with Weave on AI drafting holds there.
2. **R-1 and AutoIND.** Which store links nonclinical studies to a project? R-1's records (`FOUNDER-DECISIONS-OWED-2026-10-26.md` row "2 (R-1)"; `docs/evidence/RULE2/2026-10-26-model-figures-audit/design.md`) recommend `nonclinical_studies`. The ingest path and the orchestrator's loader use `ctd_nonclinical_studies`. And may `/api/preclinical` ingest and review be admitted under Authoring, with both flags on (WEAVE_GAP decision 1)?
3. **The Weave-gap lane.** It is claimed by `…01E8btkB8mcLirW4rNvsMNxK` and waiting on you (`docs/work-orders/README.md:50`), and that session is active on the CSR lane (`:51`). Will you, or that session, release items 1–3 (G2, G3, G6, G15), or should the owner continue them? G11 and G17 share their files and wait for the same answer.
4. **P-39 order.** P-39 converges `c2c_commitments` (step 2) before the correspondence family (step 3). May the issue parser move to the inbox (G3) before step 2 lands?
5. **Deviations.** P-48 says the QMS app keeps "deviations and nonconformances". The store is a nonconforming-product register only. Do you want a deviation record of its own (G16), or does the nonconforming-product tab meet P-48? If it does, its description should stop saying "Deviations".
6. **Device post-market.** P-48 calls it hidden. `launch-scope.ts:71` lists `device-postmarket` in Projects, so its `/api/capa-mdr` claim, complaints included, is inside the catalog. Which is meant? Either the surface leaves `LAUNCH_APPS`, or P-48's text is corrected.
7. **MR-09 NEW.** Do you accept Letter page size, the FDA PDF specification as the PDF target, and the default confidentiality text? That unblocks controlled exports (CAT1-09) and template formatting.
8. **MR-12 NEW-2, NEW-3, NEW-4, and distribution.** Is training assigned by role or by curriculum? May someone train before the effective date? What are the review quorum and the retirement meaning? Who receives an effective SOP?
9. **Safety and EDC.** Do you accept "partner or integrate" for safety case processing, E2B and EDC? If so, which partners should be approached? This affects D9 paper and D10 conversations.
10. **eTMF and CTMS after D10.** Do you agree, and do you agree that one canonical study record comes first?
11. **NDA scope and the Template Library.** Weave ships an NDA workflow and a custom template builder. Is either a near-term target that would justify widening P-28, or re-admitting the Template Library, after D10?
12. **SSO signing.** Does the design partner sign in only through SSO? If so, MR-09 Stage 6 moves to Phase 1 (CAT1-03).
13. **Support.** Veeva Basics offers 24x7 end-user support (UNVERIFIED). The draft support policy covers Mon–Fri 08:00–18:00 US Eastern (`docs/commercial/SUPPORT_POLICY.md:20-21`). Is that the commercial position for D9?
14. **Claims policy.** Do you confirm two things?
    - Sales and trust material keeps the completion rule of `docs/competitive-analysis-weave-bio.md:32`, with no claim of doing everything Weave does.
    - §4's claims are used only with their basis and caveats, and the "built, not yet proven" items are never presented as shipped.
15. **An owner action, not a decision: network access.** Allow the hosts in §1.1 so the research can be re-run against the live pages, and allow `www.fda.gov` and `admin.ich.org` for D7's DTDs. Until then, every (V) is a search excerpt and every Veeva row is UNVERIFIED.
