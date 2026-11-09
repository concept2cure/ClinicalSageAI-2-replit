# One CSR type, and a clinical source list of clinical sources (2026-11-05)

Two defects from the 2026-11-02 demo walk (`../2026-11-02-phase2-demo-walk/README.md`, "Found, not fixed here"):

- **F1.** New document listed "GLOBAL · Clinical Study Report (CSR)" twice. One entry is the template
  `component:clinical_study_report`; a CSR made from it shows "Build from the study's data". The other is
  `registry:ICH_CSR`; a CSR made from it does not.
- **F5.** The "Clinical source" picker in a CSR's study-data step lists every JSON file in the project's Vault,
  including the efficacy results file, which cannot be a clinical source.

Launch row: D2 (CSR). Plan package: F1 (repairs to shipped behaviour). Nothing new is built: both are fixes to
existing code, named below by path.

## What already exists

Written before any change (CLAUDE.md RULE 3). Searches run: `registry:`, `component:clinical_study_report`,
`clinical_study_report`, `ICH_CSR`, `CSR_TEMPLATE_ENTRY`, `CSR_TEMPLATE_IDS`, `isCsrTemplateId`, `entryId`,
`builtinAuthoringTemplateId`, `getBuiltinAuthoringTemplate(s)`, `globalCatalog`, `/api/authoring/templates`,
`StudyDataBuild`, `csr/sources`, `listCsrVaultSources`, `isAdamBundle`, `CSR_ADAM_BUNDLE_FORMAT`,
`CSR_SOURCE_FORMAT`, `csr-efficacy-results`; and `git log --all --diff-filter=D` on `*StudyData*`,
`*CsrSourceInputControls*`, `*TemplatePicker*` and the CSR source services.

### F1: how New document is assembled

| Piece | Path | What it does today | What it does not |
|---|---|---|---|
| New document menu | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:4782` ("New document…") | Opens the creation form drawn by `AuthoringCreateExport`. | — |
| Creation form and picker | `client/src/concept2cure/v2/surfaces/AuthoringCreateExport.tsx:218` `useCreationTemplateCatalog`, `:322` `AuthoringTemplatePicker`; `surfaces/AuthoringTemplatePicker.tsx:36` `templateLabel` | Reads `GET /api/authoring/templates` and lists every row it returns. Has no catalog of its own. | Dedupes nothing (correctly: the server owns the catalog). |
| The catalog route | `server/routes/authoring.router.ts:1033` `GET /templates` | Merges, in order: the organisation's `authoring_templates` rows, the shared `intelligence.document_templates` rows (fail-soft, `globalCatalog`), and the built-in projections (`:1176`, `getBuiltinAuthoringTemplates().map(builtinTemplateListRow)`). | The shared reference store holds CTD section sets and response letters (`server/services/intelligence/template-seeds.ts`), no CSR. Both CSR rows came from the built-ins. |
| Built-in projections | `server/services/authoring/builtin-authoring-templates.ts:145` `getBuiltinAuthoringTemplates`, `:79` `registryTemplate`, `:101` `componentTemplate`, `:155` `getBuiltinAuthoringTemplate` | Projects every active pharma/biotech, device and shared-planning registry entry (`registry:<id>`) and every document component (`component:<id>`). Both CSR rows are named `GLOBAL · Clinical Study Report (CSR)`. | — |
| **The list half of F1 is already fixed** | same file, `:146–150`, commit `8626ff43ae` (2026-11-02, after the walk) | Leaves `ICH_CSR` out of the listed registry entries and keeps `component:clinical_study_report`. `getBuiltinAuthoringTemplate` still resolves the `registry:ICH_CSR` id, so documents made from it open. Pinned by `server/services/authoring/__tests__/builtin-authoring-templates.test.ts:33`. | It did not update `server/routes/__tests__/globalBiotechTemplateEditor.pglite.integration.test.ts:174`, which still selects `registry:ICH_CSR` from the picker and **fails on HEAD** ("registry:ICH_CSR must be loadable from the one existing template picker"). It did not touch the editor, so a CSR made from `registry:ICH_CSR` still gets no "Build from the study's data". |
| Registry entry | `shared/regulatory/global-document-registry.ts:280` `ICH_CSR` | The registry type. Read by drafting requirements (`server/services/ana/AnaDocumentDraftingService.ts:378,1024`), the draft advisory (`draft-product-advisory.ts:147`), module intelligence (`server/services/module-intelligence.ts:1454`), filing document classes (`shared/regulatory/filing-document-classes.ts:110`), the lifecycle reference (`shared/regulatory/filing-lifecycle-reference.ts:138`), section blueprints (`server/services/regulatory/sectionBlueprintCatalog.ts:85`), the template catalog (`server/services/regulatory/templateCatalog.ts:109`), the AnA clinical skill, and many tests. | Must stay: these readers name the type, not a picker row. Nothing here is deleted. |
| Registry → component map | `server/services/market-specs/document-template-library.ts:488` `REGISTRY_COMPONENT_TEMPLATES` (`ICH_CSR: 'clinical_study_report'`), `:507` `componentTemplateIdForRegistry`, `:521` `getRegistryDocumentTemplate` | `registry:ICH_CSR` resolves to the same E3 outline object as the component (`document-template-library.test.ts:271`). | — |
| Component → registry, for AnA | `server/services/ana-ri/open-document.ts:81` `registryIdForTemplateEntry` | A saved document from either CSR entry is described to AnA as `ICH_CSR`. | — |
| **The CSR identity the platform already uses** | `shared/authoring/csr-scientific-review.ts:81` `CSR_TEMPLATE_IDS`, `:89` `isCsrTemplateId` | The four built-in CSR templates by stored template id: IND 5.3.5.1, IND 5.3.5.2, `registry:ICH_CSR`, `component:clinical_study_report`. Proven to be the ids the library resolves by `server/services/authoring/__tests__/csr-template-identity.pglite.test.ts:68`. Used by the CSR scientific review gate (`server/services/authoring/csr-scientific-review.ts:165,175`) and the saved-document critique (`server/services/ana/saved-document-critique.ts:127`). | Not used by the editor. |
| **The editor's own, second, CSR test** | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx:4893`, with `CSR_TEMPLATE_ENTRY` from `editor/StudyDataBuild.tsx:21` | Mounts `StudyDataBuild` only when the recorded `templateSource.entryId` is exactly `component:clinical_study_report`. | Recognises one of the four CSR identities. A CSR from `registry:ICH_CSR` (existing documents in existing databases) or from IND 5.3.5.1/5.3.5.2 is a CSR to the review, which asks for the study data "in Build from the study's data" (`reviewDecisionCsrEvidence.test.tsx:218`), but that section is not shown for it. |
| Recorded identity | `shared/authoring/recorded-template-source.ts:25,56` | Validates a document's recorded `templateSource` as recorded: `registry:ICH_CSR` must carry `filingContext.registryId = 'ICH_CSR'`. | So a recorded identity is never rewritten to the canonical one; it is recognised. |
| Demo pack | `scripts/demo/launch-demo/packs/faux.mjs:524–545` | Selects the one `component:clinical_study_report` row and refuses a duplicate. | — |

No database row is involved: built-in templates are code, with no seed or migration (RULE 1 does not apply).

### F5: the clinical source list

| Piece | Path | What it does today | What it does not |
|---|---|---|---|
| Picker | `client/src/concept2cure/v2/editor/StudyDataSource.tsx:126–135`, `:186` `SourcePicker` | Reads `GET /api/submission-orchestrator/csr/sources`, lists every row as "title · vVersion · approved/not approved". A failed read is an alert (`:133`, `:190`), never an empty list. | Cannot tell a clinical source from any other JSON file: the server does not say. |
| Route | `server/routes/csr-source-inputs.ts:40` | Calls `listCsrVaultSources`. | — |
| Source list | `server/services/csr/vault-source-input.ts:25–43` `listCsrVaultSources` | Lists the project's current, eligible Vault files named `*.json` with a JSON or text MIME type, at most 100. "Candidate metadata, not a declaration that file contents have been parsed." | Reads no bytes, so it offers the efficacy results file, Dataset-JSON datasets and any other JSON. |
| What a clinical source is | same file, `:124–144` `load`, `:119` `selectedEnvelope`; `server/services/csr/adam-bundle-load.ts:19` `isAdamBundle` | Preview and freeze accept exactly two formats, by the file's top-level `format`: an ADaM bundle manifest (`concept2cure.csr-adam-bundle.v1`, `shared/csr-adam-bundle.ts:12,61`) or a supporting source (`concept2cure.csr-source.v1`, `shared/csr-source-input.ts:5,259`). Anything else fails the source contract (422). The source is limited to 5 MiB (`MAX_SOURCE_BYTES`). | — |
| Efficacy file | `shared/csr-adam-bundle.ts:13,88` `concept2cure.csr-efficacy-results.v1` | A file a manifest names; read by `adam-bundle-load.ts:34`. | Never a clinical source. |
| Tests | `server/services/csr/__tests__/vault-source-input.test.ts:114` ("lists metadata only", asserts no byte read); `client/src/concept2cure/v2/__tests__/studyDataSource.test.tsx` | — | — |
| History | `client/src/concept2cure/v2/surfaces/CsrSourceInputControls.tsx`, deleted in `6fe917060c` (2026-10-31) | Moved, not copied, into `StudyDataSource.tsx`. | — |

So the task's "offer only ADaM bundle manifests" would refuse the `csr-source.v1` sources the same code accepts.
The list offers what preview accepts: the two formats.

## F1: one CSR entry, and every CSR gets "Build from the study's data"

**Decision.** The list half was already fixed in `8626ff43ae`: New document offers the CSR once, as
`component:clinical_study_report`, and the `registry:ICH_CSR` template id still resolves, so CSRs made from it open,
verify their recorded snapshot and keep their recorded filing context (`registry:ICH_CSR` with `registryId
ICH_CSR`, which `recorded-template-source.ts` requires and which is therefore recognised, never rewritten). No
catalog data is deleted and no reader of `ICH_CSR` changes.

What was left is the editor. It decided "this is a CSR" by its own rule, the exact component entry, while the
scientific review, the critique and the CSR template-identity test decide it by the stored template id, the four
built-in CSR templates of `shared/authoring/csr-scientific-review.ts` `CSR_TEMPLATE_IDS`. The editor now uses that
same definition (`isCsrTemplateId(docTemplateId)`), so there is one rule for what a CSR document is. A CSR made from
`registry:ICH_CSR`, including the ones already in existing databases, shows "Build from the study's data". So does
one made from the IND library's 5.3.5.1 or 5.3.5.2 report template, which the review already treats as a CSR and
whose review says the study data is frozen in "Build from the study's data". Before this change, that section was
missing from those documents.

| Change | Path |
|---|---|
| The editor mounts `StudyDataBuild` for any document whose stored template id is a built-in CSR template | `client/src/concept2cure/v2/editor/DocumentWorkbench.tsx` (the mount beside `AuthoringAssemblyBuild`; import of `isCsrTemplateId`) |
| The route-level suite that `8626ff43ae` left failing on HEAD: the list offers one CSR, the E3 component; `registry:ICH_CSR` is not offered and still saves and reopens all 119 headings by its id | `server/routes/__tests__/globalBiotechTemplateEditor.pglite.integration.test.ts` |
| Editor gate, per CSR identity, and a non-CSR document | `client/src/concept2cure/v2/editor/__tests__/workbenchCsrStudyData.test.tsx` |

`editor/StudyDataBuild.tsx:21` `CSR_TEMPLATE_ENTRY` has no reader left. It is in another lane's file, so it is left
for that lane to remove.

### Red, then green

- `red/f1-integration-suite-on-head.txt`: on HEAD before this change, three tests of the route suite fail, because
  `8626ff43ae` stopped listing `registry:ICH_CSR` and did not update them.
- `red/f1-list-without-filter.txt`: with `8626ff43ae`'s filter taken out (the walk's code), the new "is one New
  document entry" test fails with two entries (`[ 'registry:ICH_CSR', … ]`), as do the registry case and the
  service test. The filter was restored straight after.
- `red/f1-editor-gate.txt`: on the old editor gate, the `registry:ICH_CSR`, IND 5.3.5.1 and IND 5.3.5.2 cases fail.
  The component and non-CSR cases pass, so the harness mounts the section when the gate allows it.
- `green/f1-editor-gate.txt`: all five pass on the new gate.
- `green/f1-route-suite.txt`: the route suite, 34 of 34 on its first whole-file run. On three later runs, on this
  shared and loaded host, every case passed except "creates and reopens all registry filings…". That case hit its
  own 180 s limit after making 242 of its 244 documents. It is a time limit, not an assertion. On HEAD the same case
  fails at ICH_CSR after 54 s.

### Found, not fixed here

| # | What | Where | Why not here |
|---|---|---|---|
| O1 | **The canonical CSR loses the CSR drafting kind.** A section draft takes its document kind from the recorded `filingContext.registryId`. The E3 component records `registryId: null`, so a CSR made from it, the one New document now offers, drafts as `'ctd'`, not `'csr'`. The therapeutic-area advisory then reads an E3 heading number ("12.2") as a CTD code. `server/services/ana-ri/open-document.ts:81` `registryIdForTemplateEntry` already resolves the component to `ICH_CSR`, and AnA's open-document brief uses it. | `server/services/authoring/authoring-draft-template.ts:103` | Outside this change's files. It changes drafting prompts, so it needs its own red test. |
| O2 | **The same duplicate exists for 13 more types.** New document lists a `registry:<id>` row and a `component:<id>` row under one name for EU_RMP, ICH_DSUR, ICH_PROTOCOL, ICH_IB, ICH_ICF, ICH_SAP, ICH_M3_DS, ICH_M3_DP, ICH_QOS, EU_PER, ICH_CLIN_OVERVIEW, ICH_CLIN_SUMMARY and ICH_NONCLIN_OVERVIEW (`REGISTRY_COMPONENT_TEMPLATES`, `document-template-library.ts:488`). It does the same for the US lifecycle pairs: US_EXPANDED_ACCESS_INDIVIDUAL, _INTERMEDIATE and _TREATMENT, US_EUA_THERAPEUTIC, US_BPDR and US_CBER_MASTER_FILE. Which row keeps the type's functions differs by type: for the protocol, the registry row carries the `'protocol'` drafting kind (O1's line). | `server/services/authoring/builtin-authoring-templates.ts:150` | A catalog decision per type (RULE 4). It is not needed for the CSR demo. |
| O3 | `CSR_TEMPLATE_ENTRY` has no reader left. The demo pack's comment says the editor shows the build "only" for the component entry, which is no longer true; selecting the component stays right. | `client/src/concept2cure/v2/editor/StudyDataBuild.tsx:21`; `scripts/demo/launch-demo/packs/faux.mjs:524` | Other lanes' files |

## F5: the picker offers clinical sources only

**Decision, from the code.** A clinical source is what preview and freeze accept (`vault-source-input.ts` `load`):
a JSON file whose top-level `format` is the ADaM bundle manifest (`concept2cure.csr-adam-bundle.v1`) or the
supporting source (`concept2cure.csr-source.v1`), of at most 5 MiB. Offering only bundle manifests would refuse
the supporting sources the same code accepts, so the list offers both formats and nothing else.

The list now reads each candidate's bytes and checks its digest. The cost is bounded:
- a file over 5 MiB is not read, because it cannot be a source;
- one list reads at most 25 MiB, five sources of the largest size;
- beyond that, the list says it reached its limit, as it already does past 100 files.

A file is offered when its JSON declares one of the two formats. The contract itself stays with the preview, which
names its issues, so a manifest that declares its format but breaks the contract is still offered, and the person
can see why it fails. The efficacy results file, a Dataset-JSON dataset, unparseable JSON and any other JSON are
not offered, and the list says how many there are. A file whose bytes cannot be read, or fail their digest, is
named in an alert. It is never silently dropped, so a failed read is never shown as an empty list. A list response
that is malformed is still "could not be listed".

The list reads bytes the preview reads, under the same program access (`authorizeCsrSourceProgram`). No content
leaves the server: only the title, version and digest the list already returned.

| Change | Path |
|---|---|
| `listCsrVaultSources` reads, digests and checks each candidate (`candidateKind`), returns `unreadable` and `notClinicalSources` | `server/services/csr/vault-source-input.ts` lines 25–84 (was 25–43); no other line of the file changed |
| The picker validates the two new fields, names unreadable files in an alert, counts the others | `client/src/concept2cure/v2/editor/StudyDataSource.tsx` (`sourceList`, `SourceListNotes`) |
| Server cases: manifest and source offered, efficacy, dataset, bad JSON and an oversized file not; a contract-breaking manifest offered; unreadable and changed bytes named; the byte bound | `server/services/csr/__tests__/vault-source-input.test.ts` ("the clinical source list offers clinical sources only"); "lists metadata only" became "lists the source", because the list now reads bytes |
| Client cases: unreadable named beside the sources, unreadable with no sources, malformed fields are a failed list | `client/src/concept2cure/v2/__tests__/studyDataSource.test.tsx` |

### Red, then green

- `red/f5-server.txt`: on the old list, the efficacy results, dataset, bad JSON and oversized file were offered.
  Unreadable files were offered as sources, and seven files were listed with no byte bound. The contract-breaking
  manifest case passes before and after, by design.
- `red/f5-client.txt`: the old picker showed no alert for an unreadable file and accepted malformed new fields.
- `green/f5-server.txt`, `green/f5-client.txt`.
