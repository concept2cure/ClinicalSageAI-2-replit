# Trunk CI reds, attributed — 2026-09-28

**Row:** D4. CI is the validation package's standing verification. A red job
skips every job that `needs:` it, for every lane.
**Lane:** `…01TTTQ1h`.

## Method

1. Ran the full suite locally at `c40d3cca`: `npm test` against a database with
   the GCC migrations applied. Result: 39 failed of 34,086.
2. Merged trunk (`f0b522b4`) and re-ran every failing file on its own
   (`rerun-at-head.txt`).
3. Attributed each failure that remained with `git log` on the test file and
   on the code under test.
4. Compared with trunk CI run 12578 (`bb575e31`, the latest completed run). Its
   Lint job is red at three steps; its Test job is red.

## Result

### Local only, not CI reds

- **Cleared by trunk between the two runs:**
  - `authoringObjectAuthorization.test.ts` and
    `authoringDocAccess.pglite.integration.test.ts`: `d4176395`.
  - The stopped-turn suites: `tool-trace-stopped-turn`,
    `useAnaChat-stopped-reason`, `anaActivity`, `anaContinueHosts`,
    `anaWorkPanel`.
  - `projects-detail-taxonomy`.
  - `submissionCenterGovernedWorkspaces` (CI's red at 06:13): `c1c7c648`.
- **`ana-document-surgery-loop.e2e`:** the local python-docx runtime. CI
  installs its own.
- **`document-consequence`, `CrossReferenceMapping.no-fabricated-content` and
  `conversation-os`:** these fail only because the local `.env.local` sets
  `RLS_ENFORCE=on`, and all three pass with it off.
  - They call services on the shared pool with no tenant scope. Under
    production's setting those calls refuse, which is failing closed.
  - `CrossReferenceMapper` also queries with `organization_id` undefined.
  - None of the three is in the launch catalog, so this is recorded here and
    not handed on.

### Genuine, fixed here

**`tests/routes/ana-models-endpoint.test.ts`** is a cold file, last touched
2026-09-22.

- **Cause.** `b4cd6874` (06:41) made the model picker list approved-models
  entries only, which is correct under Rule 2. The fixture's wire models
  (`claude-opus-4-7`, `claude-haiku-4-5-20251001`) are not the entries' pinned
  versions, so the picker listed nothing (`red.txt`).
- **Fix.** The fixture now carries the pins (`claude-opus-5-5`,
  `claude-haiku-4-5`). Three assertions are added:
  - an enabled model that no entry pins is not offered;
  - `approvedForHighRisk` is read from the entry;
  - `pqStatus` reads `pending`.
- **Green:** `green.txt`.
- **Mutants,** each made in `effort.ts` and restored, not committed. Both fail
  the test:
  - `mutant-no-approval-filter.txt`: the approved-entry filter is dropped, so
    `claude-sonnet-4` is offered;
  - `mutant-pq-claimed.txt`: `pqStatus` is hard-coded `passed`.

### Genuine, handed on

These are in files other lanes changed today. They are on the work-orders board
under "Found by the validation package at head (`…01TTTQ1h`)":

| Red | Job | Owner | Item |
|---|---|---|---|
| HAQ golden journey expects the old domain track | Lint (proof tier) | `…01GJidg5` | 8 |
| `mdx-admin.ts` entry-point digest | Lint | `…01PwLFr8` | 9 |
| `.c2c-v2 .crumbs .sep` defined twice (`7b00c78d`) | Lint | `…01PwLFr8` | 9 |
| `governed-decision-db-integration`: the mock lacks `getByDecisionCode` | Test | `…01GJidg5` | 10 |
| `cmcSuiteWrites`: register rows now filtered to the open program (`288411a4`) | Test | `…01GJidg5` | 10 |
| `ana-launch-scope`: 16 new protocol tools unclassified | Test | `…01M8bGFS` | 11 |
