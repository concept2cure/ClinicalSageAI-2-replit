# AnA reach: commitments and study design in conversation (P-122)

2026-11-12, branch `concept2cure-v2`. Source: `docs/evidence/DESIGN/P-122/reach-map/README.md` row 45, section 4
item 7, and the first "smaller reach" (row 8).

Five AnA capabilities were withheld in production only because the inventory filed them under a locked screen. They
are re-filed under the launch screen that owns the job. One was left withheld on purpose. Nothing was built: no tool,
route, service, screen, mount or table.

| Capability | Was filed under | Now | Why |
|---|---|---|---|
| `create_regulatory_commitment` (tool) | `lifecycle-mgmt` | in scope, Communication (`communication-center`) | Re-filed, after adding a project-level check. |
| `review_commitment_portfolio` (tool) | `lifecycle-mgmt` | in scope, Communication | Re-filed, after adding a project-level check. |
| `fulfill_regulatory_commitment` (tool) | `lifecycle-mgmt` | in scope, Communication | This lane first left it withheld. R1 re-filed it on 2026-11-11 (`7994dc8f1`); the merge kept that, and this lane added the project check it lacked. See section 3. |
| `simulate_study_design` (tool) | `csr-workflow` | in scope, protocol workspace (`protocol-dev`) | Re-filed. No executor change was needed. |
| `recommend_endpoints` (command) | `csr-workflow` | in scope, protocol workspace | Re-filed. No executor change was needed. |
| `evaluate_endpoint` (command) | `csr-workflow` | in scope, protocol workspace | Re-filed. No executor change was needed. |

Commits: `a07ae151e` (S9, the service), `1ac146d37` (R1, the commitment tools), and the commit that carries this
file (R1, the study-design capabilities).

## 1. What already exists

**How a tool is withheld.**
- `server/services/ana/ana-launch-scope.inventory.json` lists every AnA tool and platform command as `hiddenApp`
  (under named locked screens) or `inScope`. `ana-launch-scope.ts` re-checks the screens against
  `LAUNCH_SURFACE_IDS`.
- Three places apply it: `governed-toolset.ts` (what AnA is offered), the registry wrapper in `AnaToolExecutor.ts`
  (`preHandlerRefusal`, refusal `LAUNCH_SCOPE` for a tool reached by name), and `ana-ri/command-rbac.ts`
  (`launchScopeRefusal`, for a platform command).
- `scripts/ci/check-one-design-plan.mjs` reads the same inventory. It refuses a tool name that is new to it. A name
  moved from `hiddenApp` to `inScope` is not new.
- `scripts/ci/check-step-presentation.mjs` requires each in-scope tool to have a `present` entry in
  `tool-authorization.register.json`. The three re-filed tools had none.
- Precedent for the move: `create_ha_interaction` went to `inScope` when Communication joined the catalog
  (2026-10-22 amendment in the inventory's `$note`).

**Commitments.**
- One register: `regulatory_commitments` (`migrations/20260610_ha_interactions_commitments.sql`). The earlier
  `c2c_commitments` has been read-only since 2026-10-29 (P-39 step 2).
- One service: `server/services/ha-interactions/ha-service.ts` (`createCommitmentTx`, `listCommitments`,
  `fulfillCommitmentTx`), with `commitment-fulfilment.ts` and `ha-logic.ts`.
- Two doors onto it (`CommitmentScope`, decided 2026-10-18):
  - the organisation's own commitments (`project_id IS NULL`): `server/routes/ha-interactions.ts`, read by
    Communication's Meetings & commitments tab (`surfaces/CommunicationCenter.tsx`);
  - a project's commitments, made in an answer to that project's agency letter:
    `server/routes/c2c/agency-responses.ts`, read by the project page and its Respond step
    (`surfaces/ProjectHome.tsx`, `AgencyResponses.tsx`) and also listed in Communication.
- AnA's three tools work the organisation's door only. That is the service's own stated rule ("AnA's tools reach
  only commitments that belong to no project").
- Fulfilment: `server/routes/commitment-fulfil-route.ts` and `surfaces/CommitmentFulfilment.tsx`. A PMR, PMC or REMS
  is fulfilled by a Part 11 signature (P-41); the database refuses it otherwise
  (`migrations/20261019_commitment_fulfilment_evidence.sql`).
- Existing tests: `ha-tools.test.ts`, `addons-tools.test.ts`, `ana-cannot-sign.test.ts`,
  `ha-interactions-meeting-admission.test.ts`, `tests/db/commitment-fulfilment-*.dbtest.ts`.

**Study design.**
- `simulate_study_design` (`AnaToolExecutor.ts`) calls `server/services/study-design/study-twin-service.ts`, which
  runs `simulateTrial` (`trial-simulator.ts`, a seeded Monte Carlo) on a prior from `csr-evidence-source.ts`.
- The protocol workspace already serves that engine: `POST /api/study-design/simulate`
  (`server/routes/study-design.ts`), claimed by `protocol-dev`, with the same organisation-wide CSR prior.
- `recommend_endpoints` and `evaluate_endpoint` (`server/services/ana-ri/command-executor.ts`) call
  `server/services/endpoint-recommender-service.ts`. The same service is served at the AnA inline routes and the
  public API.
- Existing tests: `study-twin-service.test.ts`, `endpoint-recommender-reads-only-the-callers-corpus.pglite.test.ts`,
  `endpoint-commands-say-what-was-read.test.ts`, `endpoint-evaluation-takes-no-score-from-a-model.pglite.test.ts`.

**Project access for AnA's tools.**
- The registry wrapper admits the open project before any tool runs (`governed-tool-gate.ts`,
  `project-scope-admission.ts` `admitAnaProjectScope`). A project the person cannot open is refused there.
- `programReadScope` gives the programs a person may read. `artifactEditRefusal` (`AnaToolExecutor.ts`) gives the
  project edit right. Both existed and are reused.
- The test harness copied: `server/services/ana/__tests__/ana-vault-tools-project-scope.pglite.test.ts`.

## 2. What reading the executors found

| Capability | Tenant | Project | Store | Figures (RULE 2) |
|---|---|---|---|---|
| `create_regulatory_commitment` | Organisation from the verified context. **Gap:** `submission_id` was inserted as given, and the foreign key admits another tenant's submission. | **Gap:** only the organisation's editor role was checked, so an editor could record a commitment against a submission of a project they cannot open. | The one register, organisation's door. | None. |
| `review_commitment_portfolio` | Organisation predicate. **Gap:** a submission that is not the organisation's was answered "No overdue commitments". | **Gap:** every commitment of the organisation was counted for any caller, with or without an identified user. | The one register, organisation's door. | Counts from `summarizeCommitmentPortfolio`, deterministic. |
| `fulfill_regulatory_commitment` | Organisation predicate; the commitment is read in the organisation's door only. | Not changed. | The one register. | None. |
| `simulate_study_design` | Organisation predicate on every corpus read. | Reads no project's records. The CSR corpus (`csr_reports`) has no project key. The wrapper refuses an open project the person cannot use. | Writes nothing. | Seeded engine; no model call. The static gate confirms it (`ci:step-presentation`: "139 engine claims, none with a reachable model call"). |
| `recommend_endpoints` | Organisation predicate (fixed 2026-10-15). | As above. | Writes nothing. | Counts and `evidence_strength` are computed. A model is asked only for endpoint wording when the corpus gives too few; such an endpoint carries no count and no rate, strength 10 (a constant), and the label "proposed by a language model". |
| `evaluate_endpoint` | Organisation predicate. | As above. | Writes nothing. | `score` is always null. The model's commentary is labelled as commentary. |

## 3. `fulfill_regulatory_commitment`: first withheld here, then re-filed by R1, now admitted by project

This lane's brief said the tool must not record a fulfilment by itself, so it was first left withheld:
- For a PMR, PMC or REMS it does not record one: it reads the type from the record, writes nothing and points to
  Communication (`ana-cannot-sign.test.ts`). The database would refuse the write as well.
- For a meeting commitment or other it does: on a confirmation in chat with a stated reason, it sets the commitment
  fulfilled. That status is terminal, and no reopen exists. The tool names no evidence of what met it, which the
  screen lets a person name.
- P-41 allows exactly this ("a meeting commitment or other is fulfilled by a governed write with a reason"), and a
  test pins it.

R1 reached the same three tools on 2026-11-11 and re-filed all of them (`7994dc8f1`), on P-41's words. The two lanes
merged on 2026-11-12 and R1's re-file was kept. Two things followed here:
- `ci:step-presentation` was red on trunk, because the tool had no `present` entry. Added in `63be97f98`.
- The tool asked for the organisation's editor role and nothing about the project. It now asks what the create
  asks: a commitment that names a submission, or was made at a meeting on one, is marked fulfilled only by someone
  who may change that submission's project. It asks before the type is read, so a refusal says nothing about a
  commitment the person cannot open (`red/06-ana-fulfil-at-head.txt`: 3 of 26 failed; `green/06-ana-fulfil.txt`).

## 4. What changed

- `server/services/ha-interactions/ha-service.ts`:
  - `createCommitmentTx` refuses a submission that is not the organisation's, as `createInteractionTx` does;
  - `projectOfSubmission`, `submissionOfInteraction`, `submissionReadableIn`;
  - `listCommitments` takes an optional program scope, bound in SQL. The screens pass none and list as before.
- `server/services/ana/AnaToolExecutor.ts`:
  - `create_regulatory_commitment`: a commitment that names a submission, or a meeting on one, is recorded only by
    someone who may change that submission's project. Another organisation's, a private project's and a missing one
    are refused in the same words;
  - `review_commitment_portfolio`: counts the organisation's own commitments that name no submission, or one of a
    project the person can open. A named submission outside that is refused, in the words a missing one gets.
- `server/routes/ha-interactions.ts`: the meeting admission reads the submission's project and the meeting's
  submission from the two service functions. Behaviour unchanged.
- **The screen's own commitments door, 2026-11-12 (second change).** It had been left looser than AnA. Now:
  - `POST /commitments` naming a submission, or a meeting on one, needs the edit right on that submission's project;
  - `GET /commitments` is bound to the reader's program scope, as the meetings list beside it is. A commitment that
    names a submission, or was made at a meeting on one, of a program the reader cannot open is not listed;
  - `POST /commitments/:id/milestones` and `POST /commitments/:id/fulfill` need the edit right, and
    `GET /commitments/:id/fulfilment-options` the read right, on the project of the submission or meeting the
    commitment names. A refused read answers "Commitment not found here.";
  - a commitment that names neither is the organisation's own, as before;
  - `subjectsOfCommitment` (`ha-service.ts`) is the one reader the routes and AnA's fulfilment tool both use.
- `server/services/ana/ana-launch-scope.inventory.json`: the five names moved to `inScope`, with the amendment
  `amended20261112`.
- `server/services/ana/tool-authorization.register.json`: `present` entries for the three tools.
- Tests updated because they named a re-filed capability as their hidden probe:
  `ana-launch-scope-execution.test.ts` (now `create_lifecycle_obligation`), `command-rbac.test.ts` (now
  `generate_report`).

## 5. Red and green

Run with `npx vitest run <file> --reporter=verbose`. Each new test runs with launch scope on.

| File | What it shows |
|---|---|
| `red/01-withheld-at-head.txt` | At HEAD, only the new tests added: 32 of 42 fail. Every capability answers `LAUNCH_SCOPE`. |
| `red/02-refiled-without-access-checks.txt` | The inventory re-filed and nothing else. The study-design tests pass, 10 of 10. The commitment tests fail, 13 of 18: organisation 2's user records a commitment on organisation 1's submission; a private project's commitment is counted; an unidentified caller is answered. |
| `red/03-service-at-head.txt` | The service test against `ha-service.ts` at HEAD: 5 of 7 fail. A commitment took another tenant's submission. |
| `green/01-service.txt` | `server/services/ha-interactions/__tests__`: 43 of 43. |
| `green/02-commitment-tools.txt` | The commitment tools and the suites around them: 171 of 171. |
| `green/03-study-design-and-launch-scope.txt` | The study-design tools, the launch-scope test for all five, and the suites around them: 911 of 911. |
| `green/04-gates.txt` | `ci:launch-scope-api`, `ci:sql-interpolation`, `ci:step-presentation`, the ESLint delta per changed file, and the full typecheck. |
| `red/04-screen-routes-at-head.txt` | The screen's routes before the second change: 9 of 14 fail. A commitment is recorded on a submission the person may not change; a milestone and a fulfilment go through; the list is read with no scope. |
| `red/05-list-without-the-meeting-clause.txt` | The list with its meeting clause disabled: a commitment made at a meeting on a program the reader cannot open is listed. 1 of 10 fails. |
| `red/06-ana-fulfil-at-head.txt` | AnA's fulfilment tool before its project check: a reader with no edit right, and a non-member of a private project, mark a commitment fulfilled. 3 of 26 fail. |
| `green/05-screen-routes-and-service.txt` | The routes' admission tests, the meeting admission, error containment, the fulfilment route and the service: 43 of 43. |
| `green/06-ana-fulfil.txt` | The commitment tools with the fulfilment cases, and the suites around them: 106 of 106. |

New tests:
- `server/services/ana/__tests__/ana-reach-p122-launch-scope.test.ts`: withheld at HEAD, offered after; an
  obligation tool of the locked lifecycle screen still withheld.
- `server/routes/__tests__/ha-interactions-commitment-admission.test.ts`: the screen's routes.
- `server/services/ana/__tests__/commitment-tools-project-scope.pglite.test.ts`: a member of the project is
  answered; a user of another organisation is refused; so is a member who cannot change or open the project.
- `server/services/ana/__tests__/study-design-tools-reach.pglite.test.ts`: the same, plus RULE 2 (no model call in
  the simulation; no score; a model-proposed endpoint carries no figure).
- `server/services/ha-interactions/__tests__/commitment-scope.pglite.test.ts`: the service.

## 6. What this does not do, and what was not verified

- **A commitment AnA records is the organisation's own.** It appears in Communication, Meetings & commitments, and
  in AnA's review. It does not appear on a project's page or Respond step, which list the commitments made in that
  project's letters. It is the same register through its other door, by the 2026-10-18 rule. Recording into a
  project's door from conversation would need the letter and its visibility tier, and is not done here.
- **The screen's door and AnA now ask the same question** (section 4, second change). What is left: the screen's
  route tests are mocks of the admission, not a PostgreSQL run; and a project's own commitments (the Respond step's
  door, `routes/c2c/agency-responses.ts`) were not touched, because that door already admits by project.
- **`docs/design/ONE_DESIGN_PLAN.md` section 1b** still said the three commitment tools are "held for
  `lifecycle-mgmt`". R1 recorded their landing in section 3a (`9838081df`). The plan changes only by founder decision, so it was not edited.
- **Tool wording was not changed.** `simulate_study_design`'s description promises "enrolment/dropout feasibility",
  which its result does not contain.
- **The CSR corpus has a `client_workspace_id` column that no reader narrows by.** For a CRO, the study-design
  capabilities draw on every sponsor's reports in the organisation, as `POST /api/study-design/simulate` already
  does. The writers found (`server/services/corpus/drizzle-corpus-writer.ts`, `server/data-importer.ts`) load a
  reference corpus; whether any sets the column was not traced.
- **Not run against PostgreSQL with row-level security enforced.** The tests are PGlite with the register from its
  migration and the real sharing policy. No `*.dbtest.ts` was added.
- **Not exercised in the running app.** No conversation with a model was run, so whether the model picks these
  tools well is not shown.
