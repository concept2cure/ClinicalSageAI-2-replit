# Project creation doors

## What already exists

- Home's `surfaces/Surfaces.tsx` supplies one creation callback to both
  `HomeProjects` and `HomeSetup`; the latter already delegates its first-project
  step through that callback. Home and `surfaces/Onboarding.tsx` previously set
  `__C2C_NEW_PROJECT`, which Projects consumed on mount.
- `mdx/MdxSurfaceHost.tsx` renders the existing device `Overview`. Its two create
  controls previously sent an AnA prompt without opening the wizard.
- `v2/surfaceActions.ts` already resolves, applies and stashes screen actions
  across navigation and mount. Root completes `projects.new-project` in that
  channel and in the existing Projects surface; this work reaches it.
- The other doors in plan A2.4 section 1 choose or open a project. They already
  reach the Projects index, through direct navigation or `programAction.ts` and
  the shell's `OPEN_PROGRAM_EVENT` listener. Their outcome stays an index visit.
  `define-project` remains the existing choose-or-create onboarding recommendation.
- `tests/ci/no-ghost-globals.contract.test.ts` already prevents retired channels
  from reappearing, but did not previously list the project-creation flag.

Searches covered creation labels, `__C2C_NEW_PROJECT`, `openProgramAction`, the
Overview hosts and the plan's full door list. The parent evidence records the
deleted-history inventory. Mission Control's distinct creator remains the
previously documented dev-only path outside the launch catalog; no new admission
or feature change is part of this slice.

## Changes and reachability

Home's shared callback and Onboarding now call the canonical `openNewProject`
helper. The device host passes that same opener as Overview's `onNewProject`
callback, used by both New project and Create your first project. No creation
door sends a request that writes a project; a person still reviews intake and
presses the existing Create button.

The rendered Home, HomeSetup, Onboarding and actual MDX-host tests click their
real controls, observe navigation to Projects, and register the destination
afterward to prove the real action bus retained the wizard opener. Root's
`projectsNewProjectAction.test.tsx` additionally mounts the actual Projects
destination and proves one-shot consumption, input-preserving idempotence,
existing wizard guards and no automatic POST.

`projectCreationDoors.contract.test.ts` inventories the unchanged index doors,
the canonical CMC/MDX empty-state action, the MDX catalog callback and onboarding
recommendation. A TypeScript AST check pins the shell event listener to the same
Projects constant; negative cases reject the former Mission Control destination
and a detached listener. This is a source-level guard, not a claim that every
listed index button was browser-tested. The old flag is now in the existing
eliminated-globals guard, which checks reads, writes and declarations.

## Verification

| Check | Result | Artifact |
| --- | --- | --- |
| Rendered creation doors and eliminated flag against previous behavior | 7 failed, 61 passed in five suites | `doors-red.txt.gz` |
| Same five suites after convergence | 68 passed | `doors-first-green.txt.gz` |
| Index-door/listener/recommendation contract | 21 passed | `doors-contract.txt.gz` |
| Final affected Home, onboarding, device-host, Overview and contract regression | 14 suites, 141 passed | `doors-final.txt.gz` |
| Non-ignored owned files and tests lint | 0 errors; 10 existing production warnings | `doors-lint.txt.gz` |

The green runs overlap and their counts are not additive. The repository's ESLint
configuration deliberately ignores MDX files; lint results do not claim those
files were linted. The required Overview callback is supplied by its production
host and both direct test callers. The final regression includes all device-host
rendering/failure checks and prior pathway/readiness cases.

The initial new onboarding test extended an existing describe callback past its
line warning threshold. Giving the new scenario its own describe removes that
added warning; no warning allowance or baseline changed.

## Independent review and existing fixture failures

Read-only review of root's helper, registry declaration, Projects handler,
idempotence, no-write assertions, wizard guards and human cancellation found no
blocker. The action remains available while intake is open solely to preserve
the current wizard; all other portfolio actions retain their prior guard.

Root's wider action/chip run exposed three unrelated existing fixture failures.
A temporary Vitest pre-load overlay executed exactly those cases using HEAD
contents for the root-changed bus, registry and Projects files, plus HEAD
contents of both failing test fixtures. Production files were never replaced.
It reproduced the same three failures (25 cases skipped), recorded in
`existing-fixtures-head-red.txt.gz`; the five content hashes and base commit are
in `existing-fixtures-head-overlay.json`. The ignored temporary config was
removed after the run.

Two conversation-chip cases mocked only `useAuth` while the existing authoring
session reader now needs the module's `authService`. The Vault case omitted the
required `current` boolean from search hits and asserted a result before the
asynchronous search settled. Root corrected only those fixtures: retain the real
auth-service export, mark synthetic hits current, and await the matching result.
No production current-read or search guard was weakened. Root records their
corrected green run in the parent evidence.
