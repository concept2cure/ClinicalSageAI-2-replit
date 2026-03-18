# AI Agent Instructions (Copilot & Claude Code)

## CRITICAL: Branch Management
**ALWAYS use the `concept2cure-v2` branch for ALL development work**

### Branch Rules:
- **DO**: Work ONLY on `concept2cure-v2`
- **DO**: Commit all changes to `concept2cure-v2`
- **DO**: Create PRs from `concept2cure-v2` to `main`
- **DO NOT**: Create `copilot/*` branches
- **DO NOT**: Create `claude/*` branches that bypass `concept2cure-v2`
- **DO NOT**: Create any new feature branches
- **DO NOT**: Open PRs directly from agent branches to `main`

### Before Starting Any Work:
1. **ALWAYS** verify current branch: `git branch --show-current`
2. If NOT on `concept2cure-v2`, switch immediately: `git checkout concept2cure-v2`
3. Pull latest changes: `git pull origin concept2cure-v2`
4. Then proceed with your work

### When Creating Pull Requests:
- Source branch: `concept2cure-v2`
- Target branch: `main`
- If you're on a `copilot/*` or `claude/*` branch, this is an ERROR - switch to `concept2cure-v2` first

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
3. Never open PRs from `claude/*` branches to `main`

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

### If Claude Code Creates a claude/* Branch:
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
