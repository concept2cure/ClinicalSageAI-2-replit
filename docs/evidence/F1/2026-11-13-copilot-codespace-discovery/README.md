# Expose the existing Codespace handoff to Copilot

Plan: F1. Operational discovery of committed work; no product policy, runtime, agent, screen, service, route, model or tool is added.

## What already exists

- `.github/copilot-instructions.md` is the repository-wide Copilot entry. It and the uppercase legacy `.github/COPILOT_INSTRUCTIONS.md` are protected `planFiles` in `docs/design/one-design-plan.json`; both remain unchanged. Their older instructions include stale branch/component guidance, so this repair points to the existing authoritative rules rather than rewriting policy.
- Root `AGENTS.md`, `CLAUDE.md`, the one design/plan and its ledger already define scope and publication rules. `.design/claude-convergence/COORDINATION.md` records ownership. No parallel rules are needed.
- `docs/getting-started/CODESPACE_AGENT_PLAYBOOK.md` is the existing operational handoff. The control tower updates that owner; this scoped change only exposes it through supported instruction discovery and the existing Codespace opened-files list.
- `.devcontainer/devcontainer.json` already installs/enables Copilot and Copilot Chat, invokes the existing post-create/post-start scripts, and opens the editor human-testing document. The shared editor settings also enable Copilot. No additional extension or guessed setting is required.
- Existing committed evidence covers the Codespace DOCX runtime, project-linked Vault examples, archived project opening and section-draft currentness. All code and non-secret receipts live on the existing canonical branch and can be read from its checked-out tree.
- Searches found no existing `.github/instructions/*.instructions.md` owner or deleted alternative. Deleted history was checked over that directory, instruction filenames, Codespace handoff and Copilot owner paths. The older custom CER orchestrator profile exists at `.github/agents/cer-orchestrator.agent.md`; it is not changed or promoted by this repair.

## Official discovery contract

Verified on 2026-11-13 through the GitHub connector against GitHub's current documentation source:

- [Repository instructions in an IDE](https://github.com/github/docs/blob/main/content/copilot/how-tos/copilot-in-your-ide/customize-copilot/configure-custom-instructions/add-repository-instructions-in-your-ide.md) says VS Code supports `NAME.instructions.md` within `.github/instructions`, applying them to matching files together with repository-wide instructions. Custom instructions are enabled by default, subject to the user's settings.
- [Path-specific instruction format](https://github.com/github/docs/blob/main/data/reusables/copilot/custom-instructions-path.md) requires `applyTo` frontmatter and explicitly documents `**` as matching files in all directories.

This documents a supported repository format. It does not prove a particular signed-in Copilot session has loaded it or that the user's account has Copilot entitlement. It does not replace or bypass repository-wide instructions.

## Completion contract

Add only `.github/instructions/codespaces-demo.instructions.md` with `applyTo: "**"`, linking the existing authorities, operational playbook, code owners and relevant evidence. Add the existing playbook to `customizations.codespaces.openFiles`, retaining the current human-testing document. Leave both protected instruction files, rules, gates, settings, extensions, bootstrap scripts and application behavior unchanged.

Validate the instruction frontmatter, every relative link and the devcontainer JSONC/opened-file paths; verify protected files remain byte-identical. No broad compiler/build or application test is required for this discovery metadata. Actual Copilot UI loading remains a manual References-list observation in the target Codespace.

## Verification

- The instruction frontmatter is valid and selects `**`; all **16 relative links** resolve to existing authorities, source or evidence.
- The existing TypeScript JSONC parser accepts the devcontainer file. Its only change adds the existing Codespace playbook to `openFiles`, retaining the human-testing handoff; both paths exist.
- `protected-sha256.json` records seven unchanged authority/gate files, including both protected Copilot instruction files. The validation checks each current byte hash against that pre-change snapshot.
- Independent read-only review found no policy duplication, setting/extension change or unsupported activation claim. `validation.json` records these bounded checks, and whitespace checks pass.
- Root separately updates the existing playbook. This index does not rewrite the protected legacy policy content. A signed-in Copilot session's actual References list, extension entitlement and hosted Codespace loading were not observed here; no compiler, build or application test was run for these metadata changes.
