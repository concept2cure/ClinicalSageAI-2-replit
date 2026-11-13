# Continue the published demo from GitHub Copilot in Codespaces

Plan: F1. Finish the existing Codespace/Copilot handoff; no product screen, service, route, table, model or tool is added.

## What already exists

- `.devcontainer/devcontainer.json` installs GitHub Copilot and Copilot Chat, starts the existing bootstrap, and opens the existing human-testing guide. `.vscode/settings.json` already enables the agent and the canonical-branch instruction.
- `.github/copilot-instructions.md` is the standard repository instruction file. Both it and the uppercase historical copy are protected `planFiles`; this repair leaves them and the plan unchanged. Its old PR-to-main diagram conflicts with the authoritative root branch rules. The uppercase copy also references retired components.
- `docs/getting-started/CODESPACE_AGENT_PLAYBOOK.md` already directs Codespace work to the canonical branch and the human-testing guide, but does not index the current project/Vault demo and its acceptance evidence.
- The playbook recommends `.github/agents/cer-orchestrator.agent.md`. That existing profile still calls `docs/ROADMAP.md` and `docs/ARCHITECTURE.md` the source of truth, requests new epics and PR reviews, and therefore needs to point to the existing founder-owned plan and direct-publication workflow.
- `docs/testing/CODESPACES_EDITOR_HUMAN_TESTING_2026-10-14.md` already owns startup, refresh, credentials, provider limitations and the current demo path. The tracked demo packs regenerate a Codespace's own database records and documents; this session's database, private state and runtime IDs are not portable Git assets.
- Published `cef271edb` passed hosted Tier 5 Browser Smoke (run `43514511740`) and the Codespace image/post-create/post-start job (`132192887133`, run `43514511746`). Local acceptance includes 1,813 proof-tier tests, four real browser cases, the full compiler/build and normal push hooks. Broader hosted CI was still in progress at this inspection.

Searches covered current instruction files, VS Code settings, agent profiles, startup/seed owners and the existing playbook. Deleted-history searches over the playbook and orchestrator found no retired alternative to restore. No current coordination hold names these two owners.

## Completion contract

Make the existing playbook an operational index to current authoritative rules, startup/doctor, actual project/document owners and committed demo/acceptance evidence. Correct the recommended existing orchestrator's stale plan/PR guidance without changing founder policy or expanding its scope. Keep historical subsystem criteria explicitly subordinate to the current plan. Supply only supported Copilot instruction discovery, with existing protected policy files untouched. Manual seed guidance must write runtime manifests outside committed historical evidence.

Check repository-relative links and tracked seed/document inputs, configuration syntax, exact entry commands and the public canonical revision. Use normal commit/push hooks; do not repeat application/compiler suites for prose-only changes. Record that a running Codespace and an already-open Copilot conversation need their own checkout/context refresh; repository publication is not proof of a live Copilot session.

## Verification

- The repository default branch is `concept2cure-v2`; it is enabled and the published implementation is reachable. The only new upstream commit at this refresh was its automatic health-report update, adopted by fast-forward.
- The published implementation passed Tier 5 Browser Smoke, Codespace image/post-create/post-start, security contracts and the full-history secret scan. The larger CI Lint job was still in progress without a reported failed step at this inspection. These are checks of the named implementation revision, not a live Copilot conversation.
- The 81 existing Codespace doctor/startup/policy/browser-bootstrap tests passed with no failures or skips. YAML frontmatter, devcontainer JSON/opened-file paths, 74 relative links and both playbook Bash blocks validate. All seven protected authority/gate files remain unchanged.
- `verification.json` records source hashes, bounded outcomes and the unobserved live-session limits; `startup-checks.txt.gz` retains the existing test result. Current app source and dependencies were unchanged, so full compiler/build/application suites were not repeated for this operational metadata.
- New Codespaces open the existing playbook; existing Codespaces still need their own canonical pull and startup, then a fresh Copilot conversation or an explicit playbook attachment. No runtime environment file, credential or database snapshot is published.
