# R1: S5 handoffs to RIM, and three decisions for the founder

**Package:** R1. **Date:** 2026-11-05. **Source:** the R1 inventory (`../2026-11-01-inventory/`), with rows of
confidence `none` that production serves. Each row was re-checked against today's client by its last two path
segments. This filing changes no code.

## Part 1. S5 (eCTD and filing): what R1 hands to RIM, and what it does not

S5's behaviour is held by RIM (`.design/claude-convergence/COORDINATION.md`). R1 does not edit RIM's files. These are
the S5 routes that production serves and no screen calls, sorted into three kinds.

### 1a. Reach: the capability belongs on the sequence (for RIM)

| Route | What it does (from its handler) | Where it is reached | Test that proves it |
|---|---|---|---|
| `POST /api/ectd/validate/preflight` (`server/routes/ectd-export.ts:1122`) | eCTD validation preflight. | **First, check that it is not a second validator** beside the one the sequence's Validation tab runs (`SubmissionSeqWorkspaces.tsx` ValidationWorkspace). If it is a second validator, it is retired, not reached. | A test that the Validation tab issues exactly one validation request per run. |
| `GET /api/submissions/sequences/:seqId/pathway-readiness` (`submissions.ts:1580`) | Projects a sequence's leaves onto a non-eCTD pathway (CTIS, MDR, IVDR, eSTAR) and reports the gaps. It is a map and gap check only, and never submits. | On the sequence, beside its eCTD validation: one read that names the pathway, shown only when the project's markets include a non-eCTD pathway. | The read is made for a CTIS or eSTAR market and not for a US-only project. A failed read is said as one. |
| `POST /api/ind-lifecycle/cover-letter/pdf-from-records` (`documents.routes.ts:306`) | Renders the IND cover letter from the stored sponsor and submission records. | The IND forms screen (P-32: a feature of Submission Center), as the cover letter's "Render from records". | The route and body, and that the PDF is saved as the sequence's cover-letter leaf, not just downloaded. |
| `POST /api/ind-lifecycle/annual-report/line-listing` (`documents.routes.ts:214`) | The serious-AE line listing and summary tabulation for an IND annual report (21 CFR 312.33(b), ICH E2F). | **Inside the one editor**, as an engine table of the annual report (DSUR) document type (Rule 4: a type's functions appear in the editor). This makes it D4's call, or the editor holder's, as much as RIM's. | The table comes from the engine's output, never from a model. Its reporting period comes from the document. |

### 1b. Retire: a parallel path already replaced (for the founder, under Rule 3's zero duplication)

These six routes are on `/api/submission-ops/packages/:packageId/…`, a second filing store. On 2026-10-17
(`docs/design/FILING_SPINE.md` F12; `GatewayTransmittals.tsx` header) the product's one path became the
**sequence**: build, validate, sign, transmit. The package screens were removed on purpose, so "no caller" here is
the intended state. The routes are still mounted and served.

| Route | Handler |
|---|---|
| `GET/POST …/packages/:id/milestones` | `submission-ops.ts:863`, `:936` |
| `POST …/packages/:id/preflight` | `submission-ops.ts:3550` |
| `POST …/packages/:id/publish` ("locks a package for regulatory export") | `submission-ops.ts:1795` |
| `GET …/packages/:id/readiness-history` | `submission-ops.ts:1212` |
| `PUT …/packages/:id/regulatory-identifiers` | `submission-ops.ts:2448` |

**Recommendation:** unmount them, or claim them out of the launch scope (`LAUNCH_EXCLUDED_API` with the F12 reason).
A served lock-for-export route beside the signed sequence is a second way to "publish" a filing that no screen
governs. Retiring it is a founder decision (working agreement: the replacement, the sequence, is named here), and
RIM would carry it out.

### 1c. Reference catalogs that may duplicate the project's own (to verify, then reach or retire)

These are in `submissions.ts`. Each is static reference data plus a pure assessment. Before any of them is reached,
it must be checked against what the project already uses (Rule 3). If one duplicates it, it is retired; if not, it
is reached where that decision is made.

| Route | What it is | What it may duplicate | Where it would be reached |
|---|---|---|---|
| `GET /requirements`, `GET /requirements/:type` (`:558`) | The submission requirements matrix per type: CTD modules, templates, forms and a gap check. | The project's dossier outline, chosen by filing type at New project ("The filing decides the dossier outline"), and the registry blueprints (`server/services/regulatory/registry/blueprints/*`). | S1 or project setup, only if it is not the same data. |
| `GET /document-templates`, `GET /document-templates/:templateId` (`:526`) | Section skeletons of key documents: M2 summaries, 510(k) summary, SmPC, GSPR, PER, IMPD. | The one editor's template catalog (`server/services/regulatory/templateCatalog.ts`, `document-template-outline-sections.ts`). | Nowhere, if duplicated. Otherwise it converges into the editor's catalog (D4). |
| `GET /designations` (`:605`) | Expedited-pathway criteria and a deterministic eligibility check. | Project charter or designations, if recorded elsewhere. | S1 (the project's goal and pathway), as the eligibility check. |
| `GET /change-categories` (`:637`) | The FDA supplement and EU variation catalog, and a change classifier. | Post-approval change assessment (`ChangeAssessment.tsx`, out of scope). | Not in launch scope today. Left for the founder. |
| `GET /capabilities`, `GET /regulatory-capabilities` (`:351`, `:926`) | Discovery indexes for a UI. | The launch-scope and entitlement registry. | Retire: the product reads entitlements, not a second index. |
| `/device/*` (blueprint, global strategy, timeline, reviewer checklist, biocompatibility, electrical safety, sterilization, CER assess-stored) | Device submission helpers. | The MDX device journey's own screens and engines. | MDX journey session (`01P6GW…`), as its reach or retirement. |

## Part 2. Decisions for the founder

### Decision A. The statistical analysis plan (SAP)

**What exists**
- The **SAP document type** in the one editor: `statistical_analysis_plan` in `templateCatalog.ts`.
- A **separate SAP system**, `server/routes/biostatPlatform.ts`. It handles:
  - create;
  - section edit;
  - comments and their resolution;
  - amendments;
  - lock;
  - versions and audit trail.

  It sits on a "statistical continuum" thread that holds analysis specs, TLF shells and results, and generates CSR
  sections.
- **No screen calls any of the second system's SAP or continuum routes** (R1 inventory: 12 SAP routes, 7
  continuum routes).

**The question:** two places to write a SAP is a Rule 4 breach (one editor for every document type). Which is the
SAP?
1. **Converge into the editor** *(recommended)*. The SAP is written in the one editor like every document. The
   continuum's useful engines (analysis specs, TLF shells, the CSR-section generator) are reached as that
   document's functions. The second system's own section, comment, lock and version store is retired.
2. **Keep the second system** as the SAP's store, and make the editor open it.
3. **Defer.** The second system stays unreachable, as it is today.

### Decision B. Informed consent

**What exists**
- The **`informed_consent` document type** in the one editor.
- **`/api/protocol-consent`** (7 routes, none called): a structured record of the 21 CFR 50.25 required elements,
  with a completeness gate and a signed approval (`signGovernedAct`).

**The question:** should the 50.25 element checklist, completeness and signed approval become the informed_consent
document type's checks in the one editor, with one record and not two?
- *Recommended: yes.* The checklist becomes the editor's check for that type, and approval runs through the
  editor's one signing.
- This was handed to D4's holder on 2026-11-05 (`COORDINATION.md`, `011Dpx…` row). It waits for this decision and
  for the CSR demo.

### Decision C. The submission-ops package path

- **Retire the six `/api/submission-ops/packages/*` routes** in Part 1b, the parallel filing store the sequence
  replaced on 2026-10-17? *Recommended: yes*, by unmounting them or excluding them from the launch scope with the
  F12 reason. RIM carries it out.
