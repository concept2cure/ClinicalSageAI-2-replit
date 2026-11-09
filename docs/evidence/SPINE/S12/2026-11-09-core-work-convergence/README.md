# RULE 4's "Core work" convergence: a design note (no code until the coordinating session rules)

**Asked by:** the coordinating session, 2026-11-09. **Session:** `session_01FTWcmXm7At3ZXBE5VWn6oS`. **Read at:**
`966ff292b`. This note proposes and changes nothing. All paths below are relative to `client/src/concept2cure/v2/`
unless they start with `server/`, `shared/` or `docs/`.

## 0. Before the inventory: what is already decided

RULE 4 (2026-10-31) lists three "Core work" workspaces in `ProjectCoreWork.tsx` to converge: Study & Protocol Design,
Risk-based monitoring and Biostatistics. Three things have happened since.

- **`ProjectCoreWork.tsx` is no longer a set of workspaces.**
  - Since D3-2a it is one card of door rows (`ProjectCoreWork`, :408–426): one row per work area, opening the existing
    area on the open project.
  - It also lists the project's work projects (S12, P-83/P-109/P-111).
  - It holds no capability of its own. Nothing in it is to converge; only its doors follow the areas they open.
- **Biostatistics stays on the rail (P-107 item 1).**
  - P-107 says: "RULE 4's 2026-10-31 list of Core work workspaces to converge is superseded for Biostatistics' rail
    entry only."
  - Its documents (the SAP, the TLFs) are written in the one editor (P-101, owned by D4 with S3).
- **Risk-based monitoring is a central rail service (P-76, 2026-10-30) and a featured work area (P-79, 2026-11-01).**
  - RULE 4's list came the day after P-76, and P-79 came the day after RULE 4.
  - No record says, as P-107 did for Biostatistics, that RULE 4's list is superseded for RBM. §4 asks for that line.

So the convergence RULE 4 still asks for is narrower than its list suggests:
- **Study & Protocol Design** has no rail entry and no decision admitting it. It is a second editor for one document
  type, the protocol.
- **Biostatistics** keeps its area, but its per-type document builder converges into the one editor (P-101).
- **RBM** stays as it is: the area, its records and its signed approvals.

## 1. What already exists (RULE 3)

Three read-only inventories were run at HEAD, one per area, with every path, line and route. They are summarised
here; anything marked "only here" has no other way in. The R1 inventory
(`docs/evidence/DESIGN/R1/2026-11-01-inventory/inventory.json`, commit `18261a908`) attributes these routes by
`claimedBy`:

| Surface | Routes with a client caller | Routes with none |
|---|---|---|
| `protocol-dev` | 110 | 30 |
| `biostatistics` | 33 | 46 |
| `biostat-workbench` | 42 | 40 |
| `rbm` | 41 | 3 |

The R1 inventory is from 2026-11-01. The live greps below are newer.

### 1a. Study & Protocol Design (`protocol-dev`; `surfaces/ProtocolDev*.tsx`; package S3)

**Ways in.**
- The Work areas card (`ProjectCoreWork.tsx` :47–48).
- ⌘K.
- `Shell.tsx:138` `PROJECT_WORK_IDS`.
- "Open the protocol" from the Biostatistics assessment (`biostatBridge.tsx:434`).
- No rail entry.

**Its store is a second document system.** `protocol_documents` has its own sections, finalize (e-signed), reviews
and export. Separately, the one document start already offers the protocol as an authoring document:
- `registry:ICH_PROTOCOL` and `component:protocol` (`server/services/authoring/builtin-authoring-templates.ts:79,101`);
- the M11 outline (`server/services/market-specs/document-template-library.ts:199–213`);
- shown in New document (`AuthoringCreateExport.tsx:127`) and the project's template list (`ProjectBiotechPlan.tsx:122`).

So a protocol can be written in two places that do not know each other. **The editor has no protocol-type section**:
the only type-keyed section is CSR's `StudyDataBuild` (`editor/DocumentWorkbench.tsx:5115`).

The table's columns:
- **Today:** where the capability lives in `protocol-dev` (file:line) and the route it calls.
- **Also reachable:** where else in the product it can be reached.

| # | Capability | Today | Also reachable |
|---|---|---|---|
| P1 | Protocol pickers | `ProtocolDevSelection.tsx:74,78`; GET `/api/protocol-dev` (`server/routes/protocol-dev.routes.ts:45`) | only here |
| P2 | Start a protocol | `ProtocolDevSelection.tsx:83`; POST `/api/protocol-development/documents` (`protocol-development.ts:174`) | AnA `create_protocol_document`. The one document start makes an *authoring* protocol, not this row |
| P3 | File the protocol in the open project | `ProtocolDevFileProgram.tsx:11`; POST `…/documents/:id/program` (:249) | only here |
| P4 | Cover page (sponsor, PI) | `ProtocolDevWorkspace.tsx:148`; PATCH `…/documents/:id` (:233) | only here |
| P5 | Section outline and section editor | `ProtocolDevPanes.tsx:40`, `ProtocolDevSection.tsx:71` (uses `editor/RichSectionEditor`); PATCH `…/sections/:id` (:385) | AnA `update_protocol_section`. **The one editor is the same capability for authoring documents** |
| P6 | Finalize, e-signed | `ProtocolDevSigning.tsx`; POST `…/finalize` (:523) | AnA checks only. **The one editor's signing, for authoring documents** |
| P7 | Reviews: reviewer, comments, resolve, signed disposition | `ProtocolDevReviews.tsx:169`; `server/routes/protocol-reviews.ts:116,137,150,175` | AnA assign and comment. **The one editor's `SendForReviewDialog` and `ReviewTasksPanel` (`DocumentWorkbench.tsx:6752,6391`)** |
| P8 | Export docx, pdf, markdown | `ProtocolDevWorkspace.tsx:166`; GET `/api/protocol-export/:id` | AnA `export_protocol_document`. **The one editor's export** |
| P9 | Open the saved draft in the editor | `ProtocolDevWorkspace.tsx:167,634`; POST `/api/authoring/import/source` `kind:'protocol'` (`server/services/authoring/workflow-source-import.ts:89,369`) | the only bridge from this store into the editor |
| P10 | Objectives and eligibility registers | `ProtocolDevPanes.tsx:119,148`; `protocol-development.ts:401,414` | AnA add tools |
| P11 | Schedule of assessments: grid, assessments, visits | `ProtocolDevSoa.tsx:50,258,259`; `/api/protocol-soa/*`, `…/visits` | AnA cells and assessments. Visits and remove: only here |
| P12 | Risk register, milestones, budget | `ProtocolDevRegisters.tsx:168,273`, `ProtocolDevPanes.tsx:169`; `/api/protocol-risks/*`, `/api/protocol-milestones/*`, `/api/protocol-budget/*` | AnA adds. Residual rating: only here |
| P13 | Amendments and EU substantiality | `ProtocolDevPanes.tsx:199,233,273`; `/api/protocol-amendments/*` | AnA create and change. Status and substantiality: only here |
| P14 | Deviations and CAPA, signed close, trends | `ProtocolDevPanes.tsx:311–376`; `/api/protocol-deviations/*` | AnA report, CAPA, trends. Assess, close, CAPA status: only here |
| P15 | Consent completeness (read) | `ProtocolDevReviews.tsx:198` | AnA `review_consent_completeness` |
| P16 | Study design: list, bind, create, planning inputs | `ProtocolDevDesign.tsx:303`, `ProtocolDevCreateDesign.tsx:88`, `ProtocolDevPlanningInputs.tsx:65`; `/api/study-design/*` | AnA bind. Create and planning: only here |
| P17 | Projections: protocol, SAP, SoA, registration, CRF shells; industry and planning projections; "Open blank CRFs in editor" | `ProtocolDevProjections.tsx:199,274,332`; `/api/study-design/:id/<projection>` | AnA industry reviews. Core five and CRF hand-off: only here |
| P18 | Design derivation, compliance | `ProtocolDevDerivation.tsx:420`, `ProtocolDevCompliance.tsx:185` | AnA review and apply |
| P19 | IRB package manifest | `IrbPackage.tsx:450`; `/api/irb/submissions/:id/package-manifest` | AnA reads the submission, not the manifest |
| P20 | Statistics tab | `biostatBridge.tsx:520` (`StudyDesignStatisticsTab`), mounted at `ProtocolDevWorkspace.tsx:309` | **The Biostatistics area's `DesignBridgePanel` (`Biostatistics.tsx:1190`)**, the same read and writes |
| P21 | Workflow guide | `ProtocolWorkflowGuide.tsx:21` | only here |

### 1b. Biostatistics (`biostatistics`, `biostat-workbench`; packages D5, S3, S12)

**Ways in.**
- The rail (`registryModel.ts:176`, P-107).
- The Work areas card.
- `ProjectRecords.tsx:160`.
- `biostatBridge.tsx:655`.
- The workbench, from "Design calculators" (`Biostatistics.tsx:958`).

The table's columns:
- **Today:** where the capability lives (file:line) and the route it calls.
- **Also reachable:** where else in the product it can be reached.

| # | Capability | Today | Also reachable |
|---|---|---|---|
| B1 | Study design picker | `biostatBridge.tsx:213`; GET `/api/biostat-bridge/designs` | only here |
| B2 | Design inputs and live sizing | `Biostatistics.tsx:1015–1088`; POST `/api/ana-biostats/compute` | AnA `compute_sample_size`, `compare_statistical_scenarios` |
| B3 | **Document builder: 11 engine document types** (`DOC_REGISTRY` :330–342): sample size rationale, full SAP, SAP section, protocol statistical section, CSR §9.7 methods, risk memo, assumption note, interim plan, DSMB charter, TLF shells, randomization plan | `Biostatistics.tsx:990–1004`; POST `/api/ana-biostats/document` | AnA `generate_statistical_document`. **No editor section** |
| B4 | "Open in editor" and "Save as a working document" | `Biostatistics.tsx:963–972,1135–1144`; `authoringHandoff.ts:108` | the builder's write into the one editor |
| B5 | Design assessment, statistical review table, apply sample size, raise tasks | `biostatBridge.tsx:389,430,377,381`; `/api/biostat-bridge/designs/:id/*` | P20, the protocol's Statistics tab. It lacks the review table and tasks |
| B6 | Persisted statistical documents (list) | `Biostatistics.tsx:1202–1258`; GET `/api/ana-biostats/governed-documents` | only here |
| B7 | Defensibility assessment | `BiostatWorkbench.tsx:713–760`; POST `/api/statistical-defensibility/assess` | AnA `assess_statistical_defensibility` |
| B8 | 29 calculators: 18 under `/api/biostat`, 11 under `/api/diagnostics-performance` | `BiostatWorkbench.tsx:300,765–788` | AnA `statisticalDesignTools.ts` for most. Interim conditional power, enrollment back-test, MMRM power at n: only here |
| B9 | "Insert into document" (a calculator result as an authoring section) | `BiostatWorkbench.tsx:440–447` | only here |
| B10 | Adaptive monitoring: plan, interim snapshots, SSR, operating characteristics, IDMC report, signed decision | `adaptiveMonitoring.tsx:382`; `/api/biostat/adaptive/*` | only here |
| B11 | Statistical precedent knowledge | `biostatKnowledge.tsx:367`; `/api/biostat/knowledge/*` | only here |

**In the catalog.** The SAP is a catalog type:
- `ICH_SAP` (`shared/regulatory/global-document-registry.ts:286`);
- `statistical_analysis_plan` (`server/services/market-specs/document-template-library.ts:214`);
- reached through the one document start.

The other ten engine types exist only in `DOC_REGISTRY` and `shared/navigation/surface-actions.ts:920`. **The
editor has no SAP section**, and nothing in `editor/**` calls `/api/ana-biostats`, `/api/biostat*` or the bridge.

### 1c. Risk-based monitoring (`rbm`; `surfaces/Rbm*.tsx`; packages D7, S8, S12)

**Ways in.**
- The rail (`registryModel.ts:177`, P-76).
- The Work areas card.
- "Open risk-based monitoring" in Project files (`ProjectHome.tsx:250`).
- The device kit's `useRbqm` reads the summary and attention (`client/src/concept2cure/mdx/hooks/useRbqm.ts:112`).
- `ClinicalOps.tsx:303` reads site risk.

**What it holds.** Ten tabs (`Rbm.tsx:396–407`) over records, not documents:
- the RACT, with CtQ factors and its signed approval and amendment;
- KRIs (library seed, configure, readings);
- QTLs (seed, configure, document a breach);
- signals (central monitoring, log, triage, investigate, escalate);
- patient scan, site risk and oversight;
- the monitoring plan (generate from the RACT, signed approval, amend, actions);
- the risk review report (print), and the extract ingest (`RbmIngest.tsx:189`).

All but extract ingest, KRI seed, QTL seed, breach documentation, signal investigation and the two amends have an
in-scope AnA tool (`server/services/ana/evidence-literature-tool-defs.ts`).

**In the catalog.** There is no monitoring plan, RACT or KRI document type. The phrase appears only as labels:
- `shared/regulatory/study-archetypes.ts:135`;
- the eTMF artifact `monitoring_plan` (`server/services/etmf/tmf-completeness.ts:42`).

The editor has no RBM section. The plan and the RACT are versioned and signed as `rbm_*` records
(`migrations/20260629_rbm_surfaces.sql`, `20260930_rbm_plan_versioning.sql`).

## 2. The convergence, per area

### 2a. Study & Protocol Design converges into the protocol document in the one editor

The protocol is a document type (`ICH_PROTOCOL`, M11) that the one document start already makes. RULE 4 forbids a
second editor for a type. The proposal is the CSR pattern: a **protocol section in the one editor**, mounted for a
protocol template as `StudyDataBuild` is for a CSR (`DocumentWorkbench.tsx:5115`). The workspace's own document
functions are retired onto the editor's.

The destination column says one of:
- **retire onto the editor:** the editor already does it;
- **protocol section:** it moves into the protocol section, made from the existing component, not rewritten;
- **decide:** §4.

| Capability | Destination | Replacement by path |
|---|---|---|
| P2 start, P1 pickers, P4 cover page | Retire onto the editor | The one document start (`AuthoringCreateExport.tsx:127`, `ProjectBiotechPlan.tsx:122`); the M11 outline's title page |
| P5 sections, P6 finalize, P7 reviews, P8 export | Retire onto the editor | `editor/DocumentWorkbench.tsx` (`RichSectionEditor`, signing, `SendForReviewDialog`, `ReviewTasksPanel`, export) |
| P3 file in the open project | Retire onto the editor | An authoring document is made in its project |
| P10 objectives and eligibility, P11 schedule of assessments | Protocol section | `ProtocolDevPanes.tsx`, `ProtocolDevSoa.tsx`, mounted in the section |
| P16 study design, P17 projections and CRF hand-off, P18 derivation and compliance | Protocol section | `ProtocolDevDesign.tsx`, `ProtocolDevCreateDesign.tsx`, `ProtocolDevPlanningInputs.tsx`, `ProtocolDevProjections.tsx`, `ProtocolDevDerivation.tsx`, `ProtocolDevCompliance.tsx` |
| P20 statistics | Protocol section, the one component | `biostatBridge.tsx` `StudyDesignStatisticsTab`, which gains the review table and tasks from B5 so one panel serves both places |
| P12 risk register, milestones, budget | **Decide** (§4, item 2) | Protocol section, or Tasks for milestones (`unified_tasks`) |
| P13 amendments | Protocol section | `ProtocolDevPanes.tsx` amendment panes. An amendment is a change to this document |
| P14 deviations and CAPA | **Decide** (§4, item 2) | Quality (QMS, `QualityModule.tsx`), where CAPA lives, or the protocol section |
| P15 consent (read) | P-102's `informed_consent` checks in the one editor | The consent document type's checks (P-102), not the protocol section. Corrected by the coordinating session, 2026-11-09 |
| P19 IRB package | Protocol section | `IrbPackage.tsx` |
| P21 workflow guide | Retire | The section's own order replaces it |
| P9 import bridge | **Becomes the migration** | `server/services/authoring/workflow-source-import.ts` `composeProtocol` carries an existing `protocol_documents` row into an authoring protocol |

**What the section needs to know.** It must know the `protocol_documents` row its registers belong to. Whether the
import records that link durably on the authoring document is **unverified**; it is the first thing slice P-a reads.
If it does not, the link is a field on the existing authoring document record, not a new table.

The `protocol_documents` store and its register tables are **kept** (RULE 1): no DROP. Only their document
functions lose their screen.

### 2b. Biostatistics: the area stays; its document builder moves into the one editor (P-101)

- **B3 and B4 move into the one editor.** The builder becomes the SAP document's section, "Build from the study
  design", mounted for `statistical_analysis_plan` / `ICH_SAP` as the CSR's is.
  - The engine call (POST `/api/ana-biostats/document`) and the save path (`authoringHandoff.ts:108`) move with it.
  - The chooser and the "Open in editor" and "Save as a working document" controls are deleted from
    `Biostatistics.tsx` in the same change.
  - The protocol statistical section and CSR §9.7 methods are offered in the protocol and CSR sections, from the
    same builder.
  - The other eight types need §4, item 3.
- **B6 the list** is replaced by the project's documents list once every generated document is an authoring
  document.
- **B5 and P20 become one panel** (above).
- **They stay in the area:** B1, B2, B7, B8, B9, B10 and B11. These are the work area over the project's data that
  P-107 keeps.
- **Owner.** D4 with S3 (P-101). S12 holds only the door.

### 2c. Risk-based monitoring: no convergence

RBM stays as P-76 and P-79 have it. Its RACT and monitoring plan are signed records with their own versioning, not
editor documents, and no catalog type exists for them. Moving the monitoring plan into the editor would make it a
document type, which is a founder decision (§4, item 4). This note proposes none. RBM's remaining work is D7's one
work-area pattern (ONE_DESIGN_PLAN §1a).

### 2d. `ProjectCoreWork.tsx`

The card stays. Its Study & Protocol Design door (:47–48) is deleted in slice P-e, with `protocol-dev` in
`Shell.tsx:138` `PROJECT_WORK_IDS`. Biostatistics, CMC and RBM keep their doors.

## 3. The slices, in order, each deletable on its own

Each slice moves one group, deletes its old place in the same change, and names the replacement by path. Each one
carries these checks:

- **RULE 0.** It is pushed to `concept2cure-v2` only.
- **RULE 1.** No DROP. The `protocol_documents` tables, the register tables and the biostatistics stores are kept;
  only writers that lose their screen stop. `ci:migration-drop-safety` applies.
- **RULE 3.** `git log --all --diff-filter=D` on the moved names, and the slice's "What already exists".
- **RULE 4.** `ci:one-product` baseline only shrinks. No new surface, card or editor: the section mounts existing
  components inside `DocumentWorkbench`.
- **RULE 5 and 6.** `Plan:` names the owning package. `Completes:` names the existing component moved.
- **The capability ledger.** A table in each slice's evidence lists every capability of the group, its new place,
  and the test that reaches it there. R1's inventory is run again: no route loses its last caller unless the ledger
  retires it by decision.
- **Proof.** Red first, then a walk of the new place in the running app at 1440 and 390, and the old place shown
  gone.

| Slice | Owner | Moves | Deletes in the same change | Waits on |
|---|---|---|---|---|
| **P-a** | S3, with D4 for the mount | The protocol section in the one editor, with P10 and P11 (objectives, eligibility, schedule of assessments), on an authoring protocol linked to its `protocol_documents` row | The same panes' tab in `ProtocolDevWorkspace.tsx` | §4, item 1 |
| **P-b** | S3 | P16, P17, P18 and P20 into the section; `StudyDesignStatisticsTab` gains B5's review table and tasks | Their tabs in `ProtocolDevWorkspace.tsx`; `DesignBridgePanel`'s duplicate in `Biostatistics.tsx` becomes the one component | P-a |
| **P-c** | S3 | P13 and P19 into the section, P15 to P-102's consent checks; P12 and P14 per §4, item 2 | Their panes in `ProtocolDev*.tsx` | P-a; §4, item 2 |
| **P-d** | S3, with D4 | Existing `protocol_documents` rows carried into authoring protocols through `composeProtocol` (P9), with a replay-safe idempotent run | P1–P8 and P21: the protocol workspace's own document functions | P-a–P-c |
| **P-e** | S3, with S12 for the door and D1 for the shell | Nothing: `protocol-dev` is now unreachable by design | The `protocol-dev` surface, its ⌘K and segment entries, `PROJECT_WORK_IDS` entry and the Work areas door; the routes whose last caller went, by the ledger | P-d |
| **B-a** | D4, with S3 (P-101) | B3 and B4 as the SAP section, "Build from the study design"; the protocol statistical section and CSR §9.7 offered in their sections | The chooser and the editor hand-offs in `Biostatistics.tsx`; B6 when the list is the project's documents | P-101's "waits for the CSR demo"; §4, item 3 |

P-a to P-e and B-a are independent except as shown. Each leaves the product working if the next never lands: the
protocol workspace stays reachable until P-e.

## 4. What needs a founder decision

1. **The protocol is one document, written in the one editor.**
   - This is P-101's question for the protocol. `protocol_documents`' own document functions (sections, finalize,
     reviews, export) would be retired onto the editor's, and its registers reached as the protocol document's
     section.
   - Slices P-a to P-e wait on this. Without it the protocol stays in two places, which RULE 4 forbids, but no
     session may retire a store by itself.
2. **Where study-conduct records belong.**
   - Deviations and CAPA (P14): Quality, where CAPA lives, or the protocol.
   - Milestones and budget (P12): Tasks and the project plan, or the protocol.
   - These are records of running the study, not of the document.
3. **The eight engine statistical documents that have no catalog type:** sample size rationale, risk memo,
   assumption note, interim plan, DSMB charter, TLF shells, randomization plan, and SAP section.
   - Option (a): each becomes a catalog document type, which is data (RULE 4) but adds catalog entries.
   - Option (b): each becomes a section of the SAP or protocol.
   - Option (c): some are retired.
   - TLF shells are named in P-101 as an SAP function, which suggests (b) for that one.
4. **RBM's place against RULE 4's list.**
   - A one-line record, as P-107 made for Biostatistics, that RULE 4's 2026-10-31 list is superseded for
     risk-based monitoring by P-76 and P-79.
   - And whether the monitoring plan should ever be an editor document type. This note recommends it should not
     for now: it is a signed record with its own versioning, and the eTMF reads it as an artifact.

## 5. Not decided here, and not claimed

- No code, screen or route is changed by this note.
- The B8 calculators without an AnA tool, and the uncalled routes R1 lists, are outside RULE 4. They are R1's
  retirement candidates, not this convergence's.
- Lines cited come from the three inventories at `966ff292b`. P9's durable link, and the routes each slice's ledger
  would retire, are unverified until that slice reads them.

## 6. The coordinating session's answer (2026-11-09)

- The four questions in §4 go to the founder, with the coordinating session's recommendations; they are not recorded
  under the 2026-11-08 delegation, because retiring a store and adding catalog types are founder-level.
- One correction is applied above: the consent read (P15) belongs to P-102's `informed_consent` checks.
- Until the founder answers, no slice here is built. The P slices belong to the protocol lane and D4.
