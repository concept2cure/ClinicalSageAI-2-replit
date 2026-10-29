# D2: a CSR is built in its application's project, and a CSR project opens no IND (2026-10-29)

Session `…01E8btkB`, CSR path review for LMN-201, stage 1 row "Filing type
'Clinical Study Report': a project of this type can never be sequenced"
(`docs/design/CSR_PATH_REVIEW_2026-10-29.md`).

## What already exists

Traced from the wizard to the sequence, read-only, before any change.

| Exists | Path | What it does | What was wrong |
|---|---|---|---|
| The wizard's CSR entry | `global-document-registry.ts` `ICH_CSR`, `filing-document-classes.ts` (`csr`, ICH) | Offered under "More filing types" as a document "authored here" | Its note said the CSR is placed into an application's sequence, and not where to build it |
| Project creation | `routes/c2c/projects.ts`, `project-intake.ts` `DRUG_APPLICATION_TYPES` | A `csr` project gets the ICH E3 document (`csr:ich` pack) and, by design, no submission | — |
| The project's own screens | `ProjectMarkets.tsx`, `DispatchReadiness.tsx`, `add-project-market.ts` | Say "authored, not sequenced", and refuse a market (NOT_AN_APPLICATION) | Each prints the same sentence, so none said where to go |
| The supported home | an IND project: `submissions` (ind, fda), CSR builds bound to its program, placement into its sequences (`csr-assembly-placement.ts`, `b265d6fc0`), the information amendment (`b9dbaeff4`) | Files the CSR as an IND amendment | — |
| The side door | `POST /api/submissions` → `createSubmission` | Checked the market and the organization only | Anchored an IND submission to a `csr` project, a second IND spine beside the sponsor's real one. `applicationType: 'csr'` itself was created as an application |

The CSR stays in the catalog. AnA's and Authoring's outline (`ich_csr_sections`),
the `csr:ich` pack contract and the legacy aliases all depend on the row, and
the "author documents" tier was chosen on purpose
(`WORKFLOW_DECISION_2026-10-08.md` §4). Whether a standalone CSR project may
be linked to an IND project is a product decision, not taken here.

## What changed

- **`classNotSequencedReason`, ICH branch** (`shared/regulatory/filing-document-classes.ts`)
  now reads: "The clinical study report is a harmonised (ICH) document filed
  in an application's sequence. Author it in that application's project (for
  a US IND, the IND's own project) and place it into the sequence there; a
  project of this type sends nothing on its own." The one sentence reaches:
  - the wizard's note;
  - the create response;
  - the project's Submit tab;
  - Submission Readiness;
  - the add-market refusal.

  It covers the protocol, IB, SAP, ICF and DSUR too.
- **`createSubmission`** (`submission-service.ts`) refuses with
  `NOT_AN_APPLICATION` (422), with nothing written:
  - **a submission in a document-class project**: "No submission is created in
    this project: it is a clinical study report. …";
  - **a document class as the application type** (`insertSubmissionRow`, so
    every creator): "A clinical study report is not an application, so no
    submission is created for it. …".

## Evidence: seen failing first

| Check | Red (`red.txt`, the committed code) | Green |
|---|---|---|
| `document-class-not-an-application.pglite.test.ts` (new), 4 cases: <ul><li>a CSR project refuses an IND submission;</li><li>`csr` is refused as an application;</li><li>the IND project takes its IND (control);</li><li>the status is 422</li></ul> | 3 fail (both refusals created a submission; the status was unmapped); the control passes | 4/4 |
| `add-project-market.pglite` (the sentence, pinned whole) | fails on the old sentence | passes |
| The class suites: picker offers, the Submit tab, create offer, market support | — | 139 passed, 4 skipped (`green.txt`) |
| Wide run (`wide.txt`): 547 files in five batches (submission service, projects, regulatory and schema contracts, IND lifecycle and the submissions routes, the client surfaces that show a filing class) | — | 7,898 passed, 55 failed, 5 skipped. Every failure is red without this change: the slice-1 baseline, three re-run at the parent, and four with causes in other files |

## Not done

- The CSR's assembly and placement controls are on the CSR workflow board,
  which production does not serve (handed to the CSR end-to-end lane,
  `docs/evidence/D5/2026-10-29-pivotal-is-declared/` correction). So in
  production a CSR built in an IND project cannot yet be placed from the
  screen.
- Linking an existing standalone CSR project to an IND project.
