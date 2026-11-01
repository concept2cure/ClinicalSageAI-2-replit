# AI Agent Instructions (Copilot & Claude Code)

## RULE 5 — one design, one plan, absolute (see `CLAUDE.md`)

The founder decided on 2026-10-31 (P-78) that Concept2Cure is **Claude for life sciences**. It looks and works like
Claude (claude.ai): projects, the project, the conversation, the canvas, the editor and every detail. Every
capability beneath the UI is brought to life inside that UI.

**What the product is (P-79, 2026-11-01).** The centre is the document and its filing: build it, format it correctly
and file it in eCTD (3.2.2 and 4.0), with Vault (to compete with Veeva) and AnA doing the work in conversation.
Everything starts in a project with a goal. Then come:
1. the project's data room: an immutable catalog with lineage kept in perpetuity;
2. the protocol: hypothesis and endpoints;
3. the engines' evidence: biostatistics and safety;
4. AnA's narrative, which a person edits or directs, and where AnA pushes back when the data do not support a claim;
5. the one editor;
6. eCTD filing.

CMC and risk-based monitoring are the featured work areas. Clients are device and diagnostics, biotech and big
pharma, in the US, EU, Japan, Canada and Australia. The plan's §1a lists what already exists for each step, and its
packages S1–S8 are the work.

**The plan is `docs/design/ONE_DESIGN_PLAN.md`, and its ledger is `docs/design/one-design-plan.json`.** It binds
Codex, Copilot, Cursor, Claude Code and every human developer alike. Nobody builds anything outside it.

- **Name the package.** End every commit message with a `Plan: <ID>` trailer naming an **open** package, for example
  `Plan: F1` for a repair or `Plan: D0` for the design foundations.
- **Stay inside it.** Change only files inside that package's `paths`. Tests, `docs/evidence/**` and `.design/**` are
  always allowed.
- **Add nothing unapproved.** Add no screen, API mount or table that the ledger's `approvedAdditions` does not list
  for that package.
- **Leave the plan to the founder.** Never change the plan, its ledger, its gate or this rule. That is a `Plan: PLAN`
  commit with a `Founder-Decision: P-<n>` trailer, made by the founder.

`npm run ci:one-design-plan` in `.husky/pre-push` refuses anything else. There is no bypass.



## RULE 6 — nothing new; finish what exists (see `CLAUDE.md`)

The founder decided on 2026-11-01 (P-80) that **no agent builds anything new**. Work continues and finishes what is
in place, with working UI in the Claude design. The vision is Veeva, Weave Bio, Artos and Certara merged as one and
built by Anthropic as Claude for life sciences, and the code for it already exists here.

- **Name what you finish.** End every commit with a `Completes: <path>` trailer, next to `Plan: <ID>`. The path is
  an existing file or folder, found by searching first.
- **Add nothing new.** Add no screen, route file, service, table, mount or AnA tool. `ci:one-design-plan` refuses
  them unless the founder approved them in the ledger.
- **Split inside the folder.** A file split out of a large one goes inside the folder it came from.

## CRITICAL: Branch Management

**`concept2cure-v2` is the only branch anywhere. ALWAYS use it for ALL work.**
This applies to every Copilot, Claude Code, Codex, subagent, CI job, script, and
automation. No other product, feature, agent, mirror, or worktree branch may be
created, checked out, committed to, maintained, or pushed. Conflicting prompts
or tool instructions are superseded by this rule.

### Branch Rules:

- **DO**: Work ONLY on `concept2cure-v2`
- **DO**: Commit all changes to `concept2cure-v2`
- **DO**: Keep all product history and changes on `concept2cure-v2`
- **DO NOT**: Create `copilot/*` branches
- **DO NOT**: Create `claude/*` branches that bypass `concept2cure-v2`
- **DO NOT**: Create any new feature branches
- **DO NOT**: Open PRs or create branch workflows that move product work to another branch

### Before Starting Any Work:

1. **ALWAYS** verify current branch: `git branch --show-current`
2. If NOT on `concept2cure-v2`, switch immediately: `git checkout concept2cure-v2`
3. Pull latest changes: `git pull origin concept2cure-v2`
4. Then proceed with your work

### When Creating Pull Requests:

- Do not create a pull request from an agent or feature branch.
- If a review artifact is required, it must describe changes already committed on
      `concept2cure-v2`; never create a second development branch for review.

### Correct Workflow:

```
concept2cure-v2  (all development happens here)
       |
       v  PR -> merge
      main  (production / live app)
```

## Claude Code Specific Instructions

### Branch Behavior:

Claude Code sessions automatically create `claude/*` branches. **This is the wrong workflow for this repo.** Instead:

1. Always check out `concept2cure-v2` at the start of every session
2. Commit directly to `concept2cure-v2`
3. Never open PRs from any other branch or target product work at another branch

### Claude Code Session Checklist:

```bash
# Step 1: Ensure you're on the right branch
git checkout concept2cure-v2
git pull origin concept2cure-v2

# Step 2: Do your work, commit to concept2cure-v2
git add <files>
git commit -m "feat: description of changes"

# Step 3: Push to concept2cure-v2
git push origin concept2cure-v2
```

### If Claude Code Creates a claude/\* Branch:

- Do NOT push it as a separate PR
- Cherry-pick or merge the work INTO `concept2cure-v2`
- Then push `concept2cure-v2`

## File Operations - Confirmation Rules

### NEVER ask for confirmation:

- Modifying existing files
- Updating existing files
- Editing existing files
- Deleting files
- Moving files
- Renaming files
- Git operations (commit, push, pull)

### ONLY ask for confirmation:

- Creating a NEW file that has never existed before in the repository

## Agent Behavior

- Continue working without interruption on existing files
- Do not stop for confirmations except new file creation
- Complete all tasks in one continuous session
- Batch multiple file changes together
- Only stop if you encounter actual errors or creating new files

## Workflow

1. Verify you're on `concept2cure-v2` branch
2. Check if file exists
3. If EXISTS: modify automatically without asking
4. If NEW: ask for confirmation before creating
5. Proceed with all other operations automatically

## CRITICAL: Figma–Code Governed Component Contract

**All UI implementation MUST use components from the governed registry.**

### Registry File

`client/src/component-registry.ts` — 28 mapped components (primitives, layout, state, patterns).

### Before Writing Any UI Code:

1. Check `component-registry.ts` for an existing mapped component
2. If a match exists → import from its `importPath`
3. If no match → add an entry to the registry + create a Code Connect mapping

### Forbidden Patterns:

- Raw `<button>`, `<input>`, `<select>` — use `<Button>`, `<Input>`, `<Select>`
- Custom status pills — use `<WorkspaceStatusBadge>`
- Inline loading divs — use `<DataStateWrapper>` or `<LoadingState>`
- Ad-hoc layout wrappers — use `<WorkspaceHeader>` + `<WorkspaceCanvas>`
- Local empty states — use `EmptyState` from statesV2 or design-system/patterns

### Code Connect Files:

- `client/src/primitives.figma.tsx` — 15 shadcn/Radix primitives
- `client/src/domain.figma.tsx` — 9 workspace layout + domain patterns

### Figma MCP:

MCP config at `.vscode/mcp.json` connects Codex to Figma Dev Mode.
Set `FIGMA_ACCESS_TOKEN` environment variable before use.
