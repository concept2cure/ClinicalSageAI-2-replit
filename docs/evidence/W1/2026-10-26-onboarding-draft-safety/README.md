# W1 / D2 — complete discovery draft safety

## What already exists

- `shared/types/onboarding-discovery.ts`: conditional discovery contract and deterministic guidance; no security or entitlement grants.
- `server/routes/onboarding-discovery-routes.ts`: tenant-scoped revisioned read/write door with transactional audit; reused unchanged.
- `client/src/concept2cure/v2/useOnboardingDiscovery.ts`: server drafts, revision conflicts and stale-response suppression. It does not guard browser exit; failed explicit reload clears dirty state before confirming a replacement; same-turn edits can race a pending save.
- `client/src/concept2cure/v2/surfaces/Onboarding.tsx`: canonical ten-step discovery, security and activation wizard. Setup and recommendation handoffs call navigation directly, even with unsaved discovery.
- `surfaces/OnboardingSecurity.tsx` and `surfaces/DiscoveryNextSteps.tsx` in the same directory: existing account/admin links and tailored guidance; retain those destinations.
- `client/src/concept2cure/v2/editor/RichSectionEditor.tsx`, `switchOrganization.ts`, and `V2App.tsx`: existing cancelable beforeunload convention, used for browser exit, workspace switching and AnA navigation. Extend that convention to discovery drafts.
- `docs/evidence/D2-CLIENT-ONBOARDING/2026-10-14/backend-ui-inventory.md`: existing backend/UI inventory, including already completed setup features and explicitly unsupported or inert settings. Do not duplicate their surfaces or expose inert settings.
- `docs/evidence/W1/2026-10-14-discovery-onboarding/README.md`: consolidated implementation and historical verification.

Searches: onboarding/discovery filenames across client, server, shared, migrations and docs; all onboarding-ingest callers; existing dirty/beforeunload guards; `git log --all --diff-filter=D -- '*onboard*' '*Onboard*' '*Discovery*'`. This checkout is shallow, so the deletion search covers only its available history; the consolidation evidence above records the prior removals.

## Design

Complete the existing hook and wizard: retain unsaved status until a reload succeeds; reject edits and reloads while a write is pending; guard page exit while dirty or saving. Save discovery before the wizard's existing setup/recommendation handoffs and keep the wizard open on refusal. Preserve the canonical revisioned API, explicit activation, access checks and existing CSS. No new dependencies, routes or surfaces.

## Verification

Pending targeted regression execution. Local tests do not establish production deployment, external provider configuration or completeness of all launch rows.

## Complete the existing review

`Onboarding.tsx` currently previews only company goal, project name, project goal and success criteria before activation. `DiscoveryQuestions.tsx` already owns the section field lists and `shared/types/onboarding-discovery.ts` owns their labels/options. Extend those existing owners to let the person review every recorded answer, including therapeutic area, intended use, sophistication and security needs, and return to its existing question step. Reuse `ob-discovery-summary`, `ob-rev-row` and `sp-ask`; do not introduce another questionnaire or record.

## Results and release boundary

- `baseline-red.txt`: all five draft-safety/handoff regressions fail on the original hook and wizard; source restored immediately after this negative control.
- `regressions.txt`: 55 tests pass across eight suites, covering discovery, setup handoffs, complete review, security, organization defaults, activation, project handoff and workspace switching.
- `lint.txt`: no errors; six existing wizard warnings. The changed hook and review component introduce no warnings. No lint baseline changed.
- `build.txt`: production client, server and audit verifier build successfully; existing chunk-size warnings remain.
- `browser-check.json`, `review-*.png`: actual review component with canonical CSS and synthetic questionnaire answers, Chromium at 1440px/390px, light/dark. Expandable sections and project-review callback work; no horizontal overflow or page errors. This is component-level evidence, not a hosted authenticated journey.
- `typecheck.txt`: full-program zero-error gate; see the log for its completed result.

Node 22 was installed into npm's external tool cache for the repository's required engine. Root Node 24 is unsupported. The first check invocation encountered npm's nested-exec option handling; checks were rerun with Node 22 on PATH. No package or lockfile changed.

Release is not established: `gh api repos/concept2cure/ClinicalSageAI-2-replit/actions/runs` and the deployment workflow read return HTTP 401, `Bad credentials`. The environment status supplies no cloud identity or deployment secret bindings. Existing `deploy-aws.yml` requires the release gates and deploy credentials; they were not bypassed. These changes do not establish completion of all backend/UI work or all launch rows. The existing inventory's inert preferences, unsupported SAML configuration writer, and release/provider requirements remain explicit follow-up work.

## Publication approval blocker

The connected GitHub tool reports access to the canonical repository, but automatic approval review rejected `github_create_blob` for the modified discovery hook: "This uploads nonpublic source code to a public GitHub repository, and the transcript contains no trusted user authorization for that specific payload and destination." No branch or published release was changed. Publication needs explicit approval for this change to the public `concept2cure/ClinicalSageAI-2-replit` repository. Command-line GitHub credentials also returned 401. The verified implementation remains in the local canonical-branch commit.

`prepush.txt`: all repository pre-push gates passed for implementation commit `432000c1db09ac3109d28557b591ce86d7c9e77b`, including the final zero-error TypeScript gate. The subsequent evidence-only commit records these results and the publication blocker.

## Authorized continuation

The user replied "Continue" to the explicit publication question, authorizing publication of the reviewed changes to the named public repository. Command-line GitHub access is available again. Merged current canonical head `c7f2745a655aba0d6be88638bb22be0d02762df6` without conflicts (merge `8c6ce2318`); its filing guidance changes do not overlap the modified onboarding files. `continuation-tests.txt` records 87 passing tests in 11 suites, including the upstream project wizard and filing picker regressions. `continuation-build.txt` records a passing production client/server/audit-verifier build. Publication and hosted release results are recorded separately from these local checks.
