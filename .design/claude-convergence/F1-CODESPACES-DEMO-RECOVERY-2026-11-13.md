# Codespaces demo recovery — 2026-11-13

Package: F1 repairs within L1 launch rows D1/D2 and the existing DATA demo path.
Baseline: `d06fb86ec904beb947e8641994f13f9eb3a0d27e` on `concept2cure-v2`.

## What already exists

- `.devcontainer/devcontainer.json` declares the Node 22 Bookworm image, four cores/16 GB, private port 5000 and existing post-create/post-start hooks. `post-create.sh` provisions PostgreSQL 16/pgvector, owner/runtime credential separation and demo identities. No second environment or launch workflow is needed.
- `.devcontainer/post-start.sh` already migrates, starts the app, seeds Lumen and the other packs, prepares CDISCPILOT01, checks the running version and supplied provider credentials, and reports actual readiness. Its CSR preparation installs Playwright 1.56.1 only when the package cannot resolve. A package can survive a failed Chromium/system-dependency install; the next start then skips recovery. Reuse this exact preparation block and its existing official CLI, without automatic model generation.
- `scripts/ops/codespaces-startup.test.mjs` exercises actual shell decisions and is held by the provider-restart continuation. This slice does not edit it or the provider-comparison/restart lines of post-start. An additional test-only shell regression can exercise browser recovery; the existing `codespaces:doctor:test` command includes it.
- `scripts/demo/launch-demo/packs/lumen.mjs` already seeds native Quality before running deterministic reports, bundles and in-platform schedules. Existing report reuse matches type and project scope type, but not the exact LMN-201 project. It rescans an organization-wide first 100 rows for bundle/schedule selection. Reuse the existing verified numeric `project_id` from `GET /api/c2c/projects/:programId/team`, the report route's exact scope filters and its program/scope agreement check.
- `compliance.audit_assurance_pack` is already a supported project report with native Quality facts and truthful partial/unassessed status. It is absent from the Lumen report list. Reach that existing report after the native QMS seed; do not create a report type, provider or screen.
- The bundle API has no update operation. Existing wrong or older bundle snapshots must be retained. Reuse only exact selected LMN-201 memberships; create a fresh snapshot through the current POST when needed. Other-project reports and schedules are not changed.
- Current presenter guidance is `docs/demo/lumen-showcase.md`. `scripts/ops/codespaces-doctor.mjs`, the real-image `codespace` CI job and existing showcase tours already supply acceptance checks. A skipped Codespace job or deterministic seed does not prove live startup or model generation.

Searched existing hooks, callers, runtime/seed helpers, report routes, registry, tests and full canonical deletion history (`git log --all --diff-filter=D` over the existing owners). The checkout is not shallow; no deleted replacement was found. Current P-122 visible-functionality rules remain binding. No screen, route, table, subsystem, provider, model or production dependency is added.

## Bounded repair

1. Independently verify the pinned Playwright package and an actual Chromium launch. Repair missing browser/system dependencies using the existing CLI, retry the launch, and prepare the study only when the browser works. A failed attempt leaves preparation incomplete and retryable; healthy restarts need no browser download. Preserve secret handling and prepare-only behavior.
2. Resolve one canonical LMN-201 numeric scope, query exact report type/scope, verify returned/created receipts, and pass the selected runs directly to bundle/schedule creation. Check program plus numeric scope on creation. Keep old bundle snapshots and refuse malformed/truncated reads. Add the existing Quality assurance report while retaining its real partial status.

Use meaningful red-before-green shell/injected-API tests, existing adjacent suites, actual image startup and the existing Lumen tour. Normal hooks and direct canonical publication remain mandatory. Credential decisions govern live API work separately; isolated browser/bootstrap and deterministic report-selection tests use no model calls.

## Copilot handoff continuation — What already exists

Inventory before instruction edits, at canonical `2a667bf51` on 2026-11-13: `.github/copilot-instructions.md` is the existing repository instruction entry. It already names the single branch and plan, but its later "Correct Workflow" diagram contradicts them by pointing to a PR and `main`; its commit example also omits required trailers. `.github/COPILOT_INSTRUCTIONS.md` is another existing entry, still directing the current demo to the historical client portal/Cortex flow. Neither entry links the current coordination register or Codespaces operator/presenter guidance. The existing devcontainer already enables GitHub Copilot/Chat and invokes the canonical lifecycle hooks; no extension, launcher or separate handoff system is needed.

Searched the two instruction names and Copilot/Codespaces references across root rules, `.github`, `.devcontainer`, coordination and the existing operations/demo docs; full deletion history over both instruction files and existing devcontainer/operator owners contains no replacement. Extend the lowercase entry with current links and correct its contradictory branch example. Keep the uppercase filename as a compatibility entry pointing to the same instructions instead of stale product paths. Preserve the founder's Rule 5/6 text and root authority. Check links, actual configured Copilot extensions and remote commit reachability; publish through normal hooks under F1. This is documentation correction only, with no model, UI, startup or credential change.

The same pre-edit audit found the lowercase file's mandatory `client/src/component-registry.ts` and uppercase auth/portal/Cortex client paths are absent. Their deletion history includes dead-client cleanup, not a current registry to rebuild. The current plan and existing `.design/claude-convergence/D0.md` already name the canonical styles/components and forbid a parallel UI directory. Replace the obsolete registry instructions with those existing authorities. `.github/BRANCH_LOCK.md` still links the uppercase filename, so retain that compatibility entry.

## Final publication scope and instruction proposal

The normal pre-push plan gate rejected `7864d9cb5` because both `.github` instruction files are listed in the ledger's `planFiles`; even a correction preserving Rule 5/6 needs `Plan: PLAN` and a founder decision. That commit was never published. The final F1 correction restores both protected files to their exact pre-edit bytes and puts the current handoff near the top of the existing `docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md`, which `.devcontainer/devcontainer.json` already opens automatically. The existing operator guide links that section. No loader, extension or policy is changed, and the gate is not bypassed.

The pre-edit search also covered this existing testing guide and its configured `openFiles` caller: it already owns Codespaces human/agent startup and demo guidance, so it is the appropriate existing home. The proposed instruction-file correction remains reviewable below; it is documentation only and is not applied to the protected files by this F1 package.

~~~diff
diff --git a/.github/COPILOT_INSTRUCTIONS.md b/.github/COPILOT_INSTRUCTIONS.md
index 28e2692db..b5f665a93 100644
--- a/.github/COPILOT_INSTRUCTIONS.md
+++ b/.github/COPILOT_INSTRUCTIONS.md
@@ -51 +51 @@ built by Anthropic as Claude for life sciences, and the code for it already exis
-## ⚠️ CRITICAL: SINGLE BRANCH DEVELOPMENT ONLY
+## Current Codespaces and Copilot workflow
@@ -53 +53,3 @@ built by Anthropic as Claude for life sciences, and the code for it already exis
-**ALL development work MUST happen on this branch:**
+This filename remains for existing links, including `BRANCH_LOCK.md`. Continue with the
+[repository Copilot instructions](copilot-instructions.md), which link the current roadmap, coordination,
+Codespaces startup, testing and presenter guidance.
@@ -55,3 +57,3 @@ built by Anthropic as Claude for life sciences, and the code for it already exis
-```
-concept2cure-v2
-```
+[CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md) remain the root authority. Work and push directly on
+`concept2cure-v2`, preserving local edits and resolving conflicts through the normal merge and hook workflow.
+Read the [coordination register](../.design/claude-convergence/COORDINATION.md) after each fetch.
@@ -59 +61,3 @@ concept2cure-v2
-### What This Means:
+The current application starts in a project and uses the shared editor. Use the
+[Lumen runbook](../docs/demo/lumen-showcase.md) for the demonstrated path and the
+[Codespaces operator guide](../docs/operations/CODESPACES_NEON_OPENAI_RECOVERY.md) for startup and recovery.
@@ -61,107 +65,2 @@ concept2cure-v2
-- ✅ **DO**: Work ONLY on `concept2cure-v2`
-- ✅ **DO**: Commit all changes to `concept2cure-v2`
-- ✅ **DO**: Push updates to `concept2cure-v2`
-- ❌ **DO NOT**: Create new feature branches
-- ❌ **DO NOT**: Create `copilot/*`, `codex/*`, or any other branches
-- ❌ **DO NOT**: Work on `main` directly
-- ❌ **DO NOT**: Suggest branching strategies unless explicitly asked
-
-### Development Flow:
-
-1. Always verify you're on `concept2cure-v2`: `git branch --show-current`
-2. If not, switch immediately: `git checkout concept2cure-v2`
-3. Pull latest: `git pull origin concept2cure-v2`
-4. Do your work
-5. Commit and push to `concept2cure-v2`
-
-### Exception Handling:
-
-- There are no branch exceptions. Do not create a branch for a hotfix, review,
-  delegation, or any other purpose.
-- If a review artifact is required, it must describe changes already committed
-  on `concept2cure-v2`.
-
-### 🤖 GitHub Copilot Agent Delegation
-
-**CRITICAL for Copilot Workspace/Agent Users:**
-
-When using GitHub Copilot's delegation features:
-
-1. **BEFORE starting**: Ensure you're on `concept2cure-v2` branch
-2. **DO NOT** allow Copilot to create `copilot/*` branches automatically
-3. **ALL delegated work** must happen on `concept2cure-v2`
-4. If Copilot creates a `copilot/*` branch by mistake:
-   - Immediately switch to `concept2cure-v2`: `git checkout concept2cure-v2`
-   - Cherry-pick any changes: `git cherry-pick <commit-hash>`
-   - Delete the copilot branch: `git branch -D copilot/<branch-name>`
-   - Push to origin: `git push origin --delete copilot/<branch-name>` (if pushed)
-5. Do not create a PR or branch workflow via delegation; delegated work belongs
-   directly on `concept2cure-v2`.
-
-**Why This Matters:**
-
-- The repository has strict branch governance for regulatory compliance
-- Multiple `copilot/*` branches create chaos and violate audit requirements
-- PRs from `copilot/*` branches may be rejected or not findable after delegation
-- All work must be traceable to `concept2cure-v2` for compliance
-
-## 🚫 DO NOT REBUILD AUTHENTICATION OR PORTAL
-
-**Existing, working implementations:**
-
-- Auth API: `client/src/lib/authClient.ts`
-- Auth Hook: `client/src/hooks/use-auth.tsx`
-- Login UI: `client/src/components/auth/Login.jsx`
-- Portal V2: `client/src/components/client-portal/`
-- Cortex AI: `client/src/components/ai/LumenAiAssistant.jsx`
-
-**If you think something needs to be rebuilt, STOP and ASK THE USER.**
-
-## 📍 Component & Feature Locations
-
-### Authentication (DO NOT RECREATE)
-
-- **API Client**: `client/src/lib/authClient.ts`
-- **React Hook**: `client/src/hooks/use-auth.tsx`
-- **Login Page**: `client/src/components/auth/Login.jsx`
-- **Backend**: `server/auth.ts`, `server/routes/auth/`
-- **Route Guard**: `client/src/utils/withAuthGuard.jsx`
-
-### Client Portal V2 (DO NOT RECREATE)
-
-- **Main Entry**: `client/src/pages/ClientPortal.jsx`
-- **Components**: `client/src/components/client-portal/`
-- **Portal Shell**: `client/src/portal/` (if exists)
-
-### Project Cortex / LUMEN AI (DO NOT RECREATE)
-
-- **Backend Services**: `server/services/cortexPrimeService.ts`, `server/services/lumen-cortex-service.ts`
-- **UI Components**: `client/src/components/ai/LumenAiAssistant.jsx`
-- **Context**: `client/src/contexts/LumenAiAssistantContext.jsx`
-
-## 🎯 User Flow (DO NOT BREAK)
-
-1. User visits `/login` or `/auth`
-2. Logs in using `Login.jsx` → `authClient.ts`
-3. On success, redirected to `/client-portal` (V2)
-4. Portal loads with Cortex AI panel available
-5. User is authenticated throughout session
-
-## 🔥 If You're About To:
-
-- Create a new auth system → **STOP, USE EXISTING AT `client/src/lib/authClient.ts`**
-- Create a new login page → **STOP, USE `client/src/components/auth/Login.jsx`**
-- Create a new portal → **STOP, USE V2 PORTAL AT `client/src/components/client-portal/`**
-- Rebuild Cortex integration → **STOP, IT EXISTS AT `client/src/components/ai/`**
-- Create a new branch → **STOP, USE `concept2cure-v2` ONLY**
-
-## ❓ Questions?
-
-- If unsure, **ASK THE USER** before making changes
-- When in doubt, **DO NOTHING** rather than break working code
-- Never assume you should rebuild something that already exists
-
----
-
-**Last Updated**: January 26, 2026
-**Enforcement**: Mandatory for all AI agents, Codespace bots, and developers
+Updated 2026-11-13. The historical portal/Cortex paths previously listed here were removed from the product;
+use the current instructions and existing owners instead of reconstructing those files.
diff --git a/.github/copilot-instructions.md b/.github/copilot-instructions.md
index c60ad8e4c..0b166eda8 100644
--- a/.github/copilot-instructions.md
+++ b/.github/copilot-instructions.md
@@ -2,0 +3,34 @@
+## Start here in Codespaces
+
+GitHub Copilot works from this repository's checked-out files. All shared implementation and handoff work is
+published directly to `origin/concept2cure-v2`; refresh an existing Codespace before continuing.
+
+Read [CLAUDE.md](../CLAUDE.md) and [AGENTS.md](../AGENTS.md), then the
+[one design plan](../docs/design/ONE_DESIGN_PLAN.md), its [ledger](../docs/design/one-design-plan.json), and
+[current launch decisions](../docs/LAUNCH_DEFINITION_OF_DONE.md). Read the
+[coordination register](../.design/claude-convergence/COORDINATION.md) after every fetch, check file holds, and
+continue an open assigned package. The root rules and current founder decisions govern older guidance.
+
+For the existing Codespace:
+
+```bash
+git branch --show-current
+git pull --ff-only origin concept2cure-v2
+bash .devcontainer/post-start.sh
+```
+
+Run these on `concept2cure-v2`. Preserve local edits. If local commits and upstream have diverged, fetch and merge
+`origin/concept2cure-v2`, resolve the conflicts, and use the normal hooks when committing and pushing.
+
+- [Codespaces operator guide](../docs/operations/CODESPACES_NEON_OPENAI_RECOVERY.md): existing local PostgreSQL,
+  port 5000, startup diagnostics and recovery.
+- [Codespaces testing handoff](../docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md) and
+  [Lumen demo runbook](../docs/demo/lumen-showcase.md): the current presenter and review paths.
+- [Browser/report recovery evidence](../docs/evidence/F1/2026-11-13-codespaces-demo-recovery/README.md) and
+  [integrated showcase evidence](../docs/evidence/DEMO/2026-11-10-sales-showcase/README.md): what was actually
+  checked and its limits. Seeded synthetic reports, live model generation, scientific review and qualification
+  are distinct states; retain those distinctions.
+
+The existing devcontainer already configures Copilot/Chat and the post-create/post-start lifecycle. Open forwarded
+port **5000** after startup and follow the runbook. The product begins in a project and uses the shared editor.
+
@@ -73 +107 @@ or tool instructions are superseded by this rule.
-3. Pull latest changes: `git pull origin concept2cure-v2`
+3. Pull latest changes: `git pull --ff-only origin concept2cure-v2`; merge upstream if histories have diverged
@@ -85,4 +119 @@ or tool instructions are superseded by this rule.
-concept2cure-v2  (all development happens here)
-       |
-       v  PR -> merge
-      main  (production / live app)
+origin/concept2cure-v2 -> local concept2cure-v2 -> commit -> push origin concept2cure-v2
@@ -95 +126 @@ concept2cure-v2  (all development happens here)
-Claude Code sessions automatically create `claude/*` branches. **This is the wrong workflow for this repo.** Instead:
+Keep Claude Code and delegated sessions on the canonical branch:
@@ -106 +137 @@ git checkout concept2cure-v2
-git pull origin concept2cure-v2
+git pull --ff-only origin concept2cure-v2
@@ -110 +141 @@ git add <files>
-git commit -m "feat: description of changes"
+git commit -m "fix: complete the existing workflow" -m "Plan: F1" -m "Completes: .devcontainer/post-start.sh"
@@ -115,0 +147,3 @@ git push origin concept2cure-v2
+The commit example is for a repair to the existing startup file. Use the actual open package and existing owner
+path for the work being committed.
+
@@ -154,28 +188 @@ git push origin concept2cure-v2
-## CRITICAL: Figma–Code Governed Component Contract
-
-**All UI implementation MUST use components from the governed registry.**
-
-### Registry File
-
-`client/src/component-registry.ts` — 28 mapped components (primitives, layout, state, patterns).
-
-### Before Writing Any UI Code:
-
-1. Check `component-registry.ts` for an existing mapped component
-2. If a match exists → import from its `importPath`
-3. If no match → add an entry to the registry + create a Code Connect mapping
-
-### Forbidden Patterns:
-
-- Raw `<button>`, `<input>`, `<select>` — use `<Button>`, `<Input>`, `<Select>`
-- Custom status pills — use `<WorkspaceStatusBadge>`
-- Inline loading divs — use `<DataStateWrapper>` or `<LoadingState>`
-- Ad-hoc layout wrappers — use `<WorkspaceHeader>` + `<WorkspaceCanvas>`
-- Local empty states — use `EmptyState` from statesV2 or design-system/patterns
-
-### Code Connect Files:
-
-- `client/src/primitives.figma.tsx` — 15 shadcn/Radix primitives
-- `client/src/domain.figma.tsx` — 9 workspace layout + domain patterns
-
-### Figma MCP:
+## Current UI design authority
@@ -183,2 +190,5 @@ git push origin concept2cure-v2
-MCP config at `.vscode/mcp.json` connects Codex to Figma Dev Mode.
-Set `FIGMA_ACCESS_TOKEN` environment variable before use.
+Use the [one design plan](../docs/design/ONE_DESIGN_PLAN.md),
+[D0 foundations](../.design/claude-convergence/D0.md), the assigned screen's current spec and the coordination
+register. Search and reuse the existing classes/components they name. The historical component-registry and
+portal instructions predate the current project workflow; their removed files are not a reason to recreate a
+registry, screen or editor. Follow Rule 3's inventory and Rule 6's existing-owner requirement before changing UI.
~~~
