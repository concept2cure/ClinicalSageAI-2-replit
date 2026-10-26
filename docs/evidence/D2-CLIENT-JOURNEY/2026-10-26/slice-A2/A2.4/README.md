# A2.4 — converge project creation onto the existing Projects wizard

Launch row D2, client journey; `concept2cure-v2` only. Base `49211250d` includes
the prior A2.1–A2.3 work and concurrent COA evidence fixes.

## What already exists

- `client/src/concept2cure/v2/surfaces/Projects.tsx` owns NewProjectWizard and its
  canonical intake request, but offers no `projects.new-project` action handler.
  It advertises wizard opening and cancellation beyond what its actions support.
- `shared/navigation/surface-actions.ts` validates the available screen actions;
  `v2/surfaceActions.ts` already stashes a validated action across navigation and
  mount. This is the canonical channel for reaching the wizard.
- Home (`surfaces/Surfaces.tsx`) and Onboarding use `__C2C_NEW_PROJECT`, consumed
  by Projects on mount. HomeSetup has its own existing creation affordance.
  The device Overview's two creation buttons ask AnA instead of opening intake.
- `server/services/ana-ri/command-executor.ts` separately registers, exports and
  handles `create_project`, writing only the PM-spine `projects` table. Its
  command union, RBAC entry and launch inventory still admit that bypass.
- `server/routes/c2c/projects.ts` is the canonical creator: verified workspace,
  filing/market checks, outline and regulatory-program/project anchor transaction.
- `ana/client-journey.ts`, `ana/agentic-workflow-tools.ts` and
  `ana-ri/onboarding-tour.ts` direct a new client to `project_setup`; that flow
  remains useful for configuring an existing project and is not retired here.

The plan's discovery in `.design/client-journey/SLICE_A2_PLAN.md` and fresh
searches cover create_project/createProject, new-project, project_setup, wizard,
routes and callers. Deleted-history searches on the same creation, command and
client-surface paths found earlier editor/navigation removals and workflow
discovery convergence; no missing replacement must be reconstructed.

## Contract and verification

Complete `projects.new-project` using the existing registry/bus. Opening an
already-open wizard is idempotent and preserves input. The person's Create
button remains the only write trigger. Replace old flag/prompt doors, remove
the separate AnA writer and its advertised command, and honestly reject stale
directives. Keep existing project configuration and governed-write gates.
No schema, dependency or entitlement changed. Implementation and detailed
evidence are in [backend.md](backend.md) and [doors.md](doors.md).

## Result

`projects.new-project` is a parameter-free, validated view action. The existing
`surfaceActions.ts` bus owns its navigation/mount stash; `openNewProject` is a
small caller of that bus. The actual Projects handler opens NewProjectWizard,
or reports already open without remounting it. All existing portfolio guards
remain; the unsupported AnA cancellation claim is gone and the person's Cancel
button remains. Human and AnA opening paths share the same handler.

Home's project list/setup step, Onboarding and both device Overview buttons
reach this action. The old flag is deleted and protected by the existing ghost
guard. Choose-or-create index doors retain their current destination. The
separate AnA writer, command type, registry, handler, export, RBAC and inventory
entries are retired. Stale commands fail with COMMAND_NOT_REGISTERED rather
than being silently discarded, proposed or executed. Existing-project setup,
authorization, governance and proposal boundaries remain intact.

The reachable replacement for the retired command is
`client/src/concept2cure/v2/surfaces/Projects.tsx`'s `projects.new-project`
handler, declared in `shared/navigation/surface-actions.ts`, with client proof
in `projectsNewProjectAction.test.tsx` and native proof in
`tests/e2e/project-create-action.e2e.ts`.

## Verification

- Root's new actual-wizard/action cases first fail **6/6**. They now prove
  one-shot mount handoff, preservation of chosen filing/typed fields, guarded
  portfolio actions, human cancellation, honest context and opening over a failed
  portfolio read. Opening itself sends no POST.
- Intake/portfolio regression: **133/133**, 17 suites. Action bus, commit barrier,
  actual screen actions and action chips: **60/60**, five suites. Door/ghost/
  index-contract regression: **141/141**, 14 suites. These targeted runs overlap.
- Backend regression: **262/262**, 18 suites; launch-scope gate passed. The
  PGlite red confirmed-command case writes +1 standalone PM project and +0
  regulatory programs. The repaired stale confirmed/unconfirmed/reply-block
  cases write neither. An actual Express governed-action route refuses the
  stale confirmation before dispatch or audit writes.
- A read-only HEAD load-overlay reproduced three older fixture failures in the
  wider action/chip suite. Updated only fixtures: retain authService exports,
  mark synthetic search hits current, and await the search response. The
  production search/current-read guards are unchanged. See doors.md for proof.
- Four focused native-server Chromium flows pass on the final source, across
  two runs. Step return/reload, Client filtering and pathway counts pass in
  `browser-related.txt.gz`. That batch started before the restarted server was
  listening, so its new action test initially gets ECONNREFUSED before signup;
  after checking HTTP readiness, only that failed test is rerun and passes
  (**9.3 seconds**, `browser-create.txt.gz`). The earlier standalone action run
  also passed (**24.3 seconds**). No application retry policy or rate limit was
  relaxed.
- The new browser case invokes the same live client action module used by the
  app; no provider is needed to choose the action. It preserves a typed name on
  a repeated opener, verifies zero portfolio rows/POSTs through review, then
  observes exactly one manual POST returning 201 and a canonical anchor, plus
  one resulting portfolio row. This tests action delivery and intake; it does
  not claim that a model selected the tool. No HTTP responses are mocked.
- Native reads/writes use the deploy-shaped isolated PostgreSQL database as
  NOSUPERUSER/NOBYPASSRLS `app_service`, RLS enforcement on. PGlite checks do not
  establish native RLS coverage. No AI provider or API request is required.
- Production frontend/server/audit-verifier build passed (Vite **29.03 seconds**).
  Existing chunk-size notices remain. Lint reports no errors or added warning
  allowance. Independent server/client replacement reviews found no blockers.

The screenshot and result JSON contain synthetic test records and safe outcome
metadata; tokens and raw authenticated traces are not committed. Full TypeScript
and pre-push gates are required before publication. A2.5 is next; no surface or
catalog entry was retired by this creation convergence.

Final boundary-type review represents parsed command names as untrusted strings
until dispatcher membership is checked; the dispatchable union stays closed.
Four directly affected command/governance/GDPR suites pass **34/34** after that
type-only correction (`backend-boundary-type.txt.gz`). No caller or runtime
behavior changed.

Whole-tree TypeScript passed with zero errors before integration. Concurrent
section-evidence assembly work through `e9ee6b110` merged without source
conflicts. The four directly interacting wizard, step-return, command-schema
and assembly-source suites pass **39/39** on the merged tree
(`merged-related.txt.gz`). Browser/build qualification above precedes that
merge; mandatory pre-push gates run on the final combined tree.
