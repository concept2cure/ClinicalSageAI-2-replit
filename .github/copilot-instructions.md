# Copilot Agent Instructions

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
1. Check if file exists
2. If EXISTS: modify automatically without asking
3. If NEW: ask for confirmation before creating
4. Proceed with all other operations automatically
