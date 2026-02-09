# Copilot Agent Instructions

## CRITICAL: Branch Management
⚠️ **ALWAYS use the `concept2cure-v2` branch for ALL development work**

### Branch Rules:
- ✅ **DO**: Work ONLY on `concept2cure-v2`
- ✅ **DO**: Commit all changes to `concept2cure-v2`
- ✅ **DO**: Create PRs from `concept2cure-v2` to `main`
- ❌ **DO NOT**: Create `copilot/*` branches
- ❌ **DO NOT**: Create any new feature branches
- ❌ **DO NOT**: Work on any branch other than `concept2cure-v2`

### Before Starting Any Work:
1. **ALWAYS** verify current branch: `git branch --show-current`
2. If NOT on `concept2cure-v2`, switch immediately: `git checkout concept2cure-v2`
3. Pull latest changes: `git pull origin concept2cure-v2`
4. Then proceed with your work

### When Creating Pull Requests:
- Base branch: `concept2cure-v2` (NOT copilot/*)
- Target branch: `main`
- If you're on a copilot/* branch, this is an ERROR - switch to concept2cure-v2 first

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
