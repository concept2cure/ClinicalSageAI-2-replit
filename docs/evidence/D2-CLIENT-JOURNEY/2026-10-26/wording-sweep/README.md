# D2: "program" leaves the visible text of the main client (decision 12)

Decision 12 of `docs/design/CLIENT_JOURNEY_2026-10-25.md`: one word, "project", for one regulatory application across
its life. "Program" and "programme" leave what a person reads on screen. This change covers the main client,
`client/src/concept2cure/v2`. It also includes four strings outside it that the review found on the same screens.
The device lane (`mdx/`), Quality (`quality/`), the rest of `shared/` and text the server sends are the second
sweep, listed below.

Only visible text changed: JSX text, `title`, `hint`, `label`, `aria-label` and `placeholder` props, toasts, error
and empty-state sentences, and the summaries and actions a surface publishes to AnA. AnA reads those as what the
screen says.

Identifiers, data keys, API fields and values, URL parameters, test ids, CSS classes, surface and action ids,
comments and anything the server parses are unchanged. `programId`, `projects.open-program`,
`OPEN_PROGRAM_SURFACE` and `/api/.../programs/...` all keep their names. The diff is 631 lines in and 622 out
across 149 files.

## What already exists

Nothing is built. Every line changes text that already renders (Rule 3).

| Path | Before | After |
| --- | --- | --- |
| 95 source files under `client/src/concept2cure/v2` (surfaces, editor, shell helpers, fixtures shown on screen) | "program" / "programme" on screen | "project", or the right noun where "program" meant something else (below) |
| `shared/constants/ui-surface-registry.ui-v2.ts:132`, `shared/navigation/index.ts:238` | "Program journey" in the breadcrumb, page title, ⌘K and the `@` menu | "Project journey", matching the screen's own title |
| `client/src/concept2cure/mdx/components/DataGate.tsx:148` | "… are held per program" beside a swept "Open a project" button | "… are held per project" |
| 54 test files | pins on the old wording | pins on the new wording (red and green below) |

### Where "program" did not mean one project

Each of these was checked against the code, not the word:

- **The numeric `projects` row.** It is the record that tasks, readiness and reports are attached to. A person never
  opens it as a project, and it is called the **tracking record** everywhere:
  - `TrackedFilingDetail.tsx:48`: "Tracking record ID", "No tracking record bound";
  - `biostatBridge.tsx:252`;
  - `Insights.tsx:2029`;
  - `IndFormsPanel.tsx:358`;
  - `ProjectHome.tsx:840-841`.

  Before this, the panels called both stores "project record", or one of them "task record".
- **A filing's type.** It is now "Filing type": `SubmissionCenter.tsx:1607` (the device-filings column) and
  `TrackedFilingDetail.tsx:38`.
- **The report-os scope enum.** It printed raw ("Runs over program or account") and now reads in words, with
  `program` as "project group" (`Insights.tsx`, `SCOPE_WORD`).
- **The RBM store's `program`.** It is a study, so the sentence is now "for a study" (`Rbm.tsx:344`).
- **Organisation-wide designations, vouchers and engagements.** They are not projects. The title is "Orphan and rare
  disease" (`BiopharmaSpecialty.tsx:583`).
- **"IND-enabling program".** This is the industry's name for the studies before an IND, and the product's project
  is the IND itself. The welcome now offers "stand up your first IND, with its IND-enabling studies" and "Help me set
  up my first IND project" (`onboardingWelcome.ts`).
- **The workflow-run target.** It is the organisation's lead project (`useOrchProgram`, `attentionRanked[0]`), never
  the open one. The disabled reason now says so instead of "Open a project …", which opening a project never
  satisfied (`Orchestration.tsx:982`).
- **A commitment's project with no regulatory record linked.** It is now "has no linked regulatory record yet"
  (`CommitmentFulfilment.tsx:149, 202`). "Not linked to a project" would be nonsense on a project.

Kept as they are, because they are regulatory or industry terms or name something other than a project:
- FDA's "Q-Submission Program";
- expedited and pediatric programmes;
- a whole multi-application "clinical development program".

## Review

Twelve readers in workflow `wf_d6988048-ed7`:
- four over the source files;
- one over the test edits;
- one completeness reader over all of `client/src/concept2cure` and the `shared/` constants it shows;
- an independent skeptic per batch, defaulting to "not real".

| Batch | Findings | Confirmed | Applied here |
| --- | --- | --- | --- |
| source 1–4 | 21 | 12 | all (one superseded by the tracking-record naming) |
| tests | 6 | 4 | all |
| completeness | 41 | 27 | the 2 inside `v2`: `SubmissionSeqWorkspaces.tsx:1992`, `CommitmentFulfilment.tsx:149,202` |

The skeptics rejected these findings, and they are left as swept:
- Mission Control's "Projects" heading (it is the product's project store);
- the source-import association warning (it is accurate);
- the CMC Module 3 build hint (server text, second sweep);
- the Project journey's per-record wording;
- `IndFormsPanel.tsx:358`, `DataGate.tsx:148` and `TrackedFilingDetail.tsx:48`, which were already fixed when read;
- Market Access's count (it counts distinct project codes);
- the "Project manager" persona label;
- the responsibilities labels.

## Tests, made to fail first

- **Red: `red/pins-against-head-source.txt`.**
  - Setup: the sweep's 54 test files, run against the source at `928b70996` (the old wording).
  - Result: 118 tests fail. Each one pins a string the sweep changed.
  - The red includes:
    - `emptyState.contract.test.tsx`, which now refuses "Select a project" as well as "Select a program";
    - `dataGateContract.test.tsx`, which does the same for DataGate's idle panel;
    - `conversationArtifactPanel.test.tsx`, pinned to the exact sentence instead of a regex.
  - Negative assertions that named the old word were changed to name the new one, so none passes because the word
    is simply gone.
- **Green: `green.txt`.** The same 54 files with the sweep: 577 tests, 6 failures, 0 that fail only with the sweep.
  The 6 also fail at `928b70996`:
  - five in `conversationArtifactPanel.test.tsx`: `useAuth must be used within an AuthProvider`, from
    `CanvasDocumentList.tsx`'s `useAuth`, added in `cc1607c3a` on 2026-10-18;
  - one in `anaDrivesScreens.test.tsx` (Vault search).
- **Affected set: `affected-set-baseline.txt`.**
  - Scope: every client test that imports a changed file or names a changed string. That is 406 files and 3,918
    tests.
  - Result: 3,732 pass and 186 fail, in 35 files.
  - Those 35 files were run at `928b70996` and with the sweep. Both runs fail the same 186 tests, name for name:
    0 fail only with the sweep, and 0 only at HEAD.
- **A file that does not finish.** `submissionBuilderStudyTagging.test.tsx` does not finish at `928b70996` or with
  the sweep: vitest times out terminating its worker after about 250 s. Its test file is unchanged.
- **Gates.**
  - `typecheck-no-regression --incremental`: 0 errors, matching the baseline.
  - `eslint` over the 149 files: 0 errors.

## Not in this change: the second sweep

Confirmed by the completeness reader and left for the next commit, together with server text, which decision 12
marks open.

The `shared/` constants a client reads:
- `shared/company-documents.ts:87`, the refusal under Submission Center's "Another project" card;
- `shared/navigation/index.ts:194-232`, the device and readiness descriptions in the `@` menu;
- `shared/navigation/surface-actions.ts:118`, the chip label "Open a program" (with `anaDrivesScreens.test.tsx:410,424`);
- `shared/ana/slash-commands.ts:176`, the `/align` summary;
- `shared/types/onboarding-discovery.ts:27,35,36`, onboarding answers;
- `shared/constants/notifications.ts:41`, "Program goal resets";
- `shared/navigation/demo-scripts.ts`, the training demo's narration.

Quality:
- `quality/ControlledDocumentDialogs.tsx:85-86`;
- `quality/ControlledDocumentTarget.tsx:38`.

The device lane (`mdx/`):
- `MdxSurfaceHost.tsx:432`;
- `hooks/useCerPmsFeeds.ts:141`, `hooks/useEstarExport.ts:415`;
- `workbench/Workbench.tsx:405`;
- `surfaces/` `Overview`, `K510Surface`, `PmaSurface`, `IvdSurface`, `CerSurface`, `OfficialEstarPanel`,
  `DeviceProfilePanel`, `EngineeringSurface`, `VaultSurface`, `pathway/PathwayPanes`, `PostmarketSurface`,
  `AnalyticsSurface`;
- `cer/PmsPmcfTab.tsx:392,477`;
- `pdev/surfaces/Contradictions.tsx:55`.

Server text, rendered verbatim:
- `server/routes/ind-forms.routes.ts:787` ("This program has no project record …");
- `server/routes/ectd-compile.ts:95,188,750`;
- `server/routes/insights-canvas-routes.ts:468,541,619`;
- `server/routes/company-document-actions.ts:59,74`;
- `server/routes/c2c/communication-center.ts:1028`;
- `services/regulatory/pyramids/ind-pyramid.ts:45`, the phase "Program Planning".
