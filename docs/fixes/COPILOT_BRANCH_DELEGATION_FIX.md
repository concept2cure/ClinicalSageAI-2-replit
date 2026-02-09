# GitHub Copilot Branch Delegation Fix

## Problem Statement

When using GitHub Copilot's delegation feature (especially with `@workspace` in VS Code), Copilot automatically creates branches with the pattern `copilot/*` (e.g., `copilot/audit-steps-5-and-6`). However, this repository has strict branch governance rules that require **ALL development work to happen on the `concept2cure-v2` branch**.

This creates a conflict where:
1. Pull requests are created from `copilot/*` branches
2. These PRs violate repository governance rules
3. After delegation completes, PRs may be difficult to find or merge
4. Regulatory compliance requires all work to be traceable to `concept2cure-v2`

## Root Cause

GitHub Copilot's coding agent has default behavior to create feature branches with the `copilot/` prefix when delegating work. This behavior conflicts with repositories that enforce single-branch development for regulatory or governance reasons.

## Solution

This fix implements multiple layers of prevention and remediation:

### 1. Updated Copilot Instructions

**Files Modified:**
- `.github/copilot-instructions.md` - Added explicit branch management rules
- `.github/COPILOT_INSTRUCTIONS.md` - Added delegation-specific guidance
- `.vscode/settings.json` - Added Copilot code generation instructions

**What Changed:**
- Explicit warnings against creating `copilot/*` branches
- Step-by-step instructions for verifying current branch
- Clear guidance on using `concept2cure-v2` exclusively
- Instructions for handling accidental `copilot/*` branch creation

### 2. VS Code Configuration

Added settings to `.vscode/settings.json`:
```json
"github.copilot.chat.codeGeneration.instructions": [
  {
    "text": "ALWAYS work on the concept2cure-v2 branch. DO NOT create copilot/* branches. Before any work, verify you are on concept2cure-v2 with 'git branch --show-current'."
  }
],
"git.defaultBranchName": "concept2cure-v2",
"git.branchProtection": ["main", "concept2cure-v2"],
"git.branchValidationRegex": "^(concept2cure-v2|main)$"
```

### 3. Migration Script

**New File:** `scripts/fix-copilot-branch.sh`

This utility script helps developers who accidentally work on a `copilot/*` branch to migrate their changes back to `concept2cure-v2`.

**Usage:**
```bash
# If you find yourself on a copilot/* branch:
./scripts/fix-copilot-branch.sh
```

**What it does:**
1. Detects if you're on a `copilot/*` branch
2. Checks for uncommitted changes
3. Counts commits that need to be migrated
4. Cherry-picks commits to `concept2cure-v2`
5. Optionally pushes changes
6. Cleans up the `copilot/*` branch (local and remote)

## How to Use

### For Copilot Users

**Before starting any work:**
1. Always check your current branch:
   ```bash
   git branch --show-current
   ```
2. If not on `concept2cure-v2`, switch immediately:
   ```bash
   git checkout concept2cure-v2
   git pull origin concept2cure-v2
   ```
3. Then proceed with Copilot delegation

**If you accidentally created a copilot/* branch:**
1. Run the migration script:
   ```bash
   ./scripts/fix-copilot-branch.sh
   ```
2. Follow the prompts to migrate your changes

### For Repository Administrators

1. Ensure all contributors are aware of the single-branch policy
2. Monitor for `copilot/*` branches and clean them up promptly
3. Consider setting up branch protection rules in GitHub to prevent pushes to `copilot/*` patterns

## Testing

To verify the fix is working:

1. Check that Copilot instructions are loaded:
   ```bash
   cat .github/copilot-instructions.md
   ```

2. Verify VS Code settings are correct:
   ```bash
   cat .vscode/settings.json | grep copilot
   ```

3. Test the migration script (if on a copilot/* branch):
   ```bash
   ./scripts/fix-copilot-branch.sh
   ```

## Expected Behavior After Fix

After implementing this fix:

1. ✅ Copilot will receive explicit instructions to work on `concept2cure-v2`
2. ✅ VS Code will show warnings/guidance about branch usage
3. ✅ Developers have a clear migration path if mistakes happen
4. ✅ All PRs will be created from `concept2cure-v2` to `main`
5. ✅ Repository governance rules are enforced

## Related Files

- `.github/copilot-instructions.md` - Copilot agent instructions
- `.github/COPILOT_INSTRUCTIONS.md` - Main Copilot governance rules
- `.github/BRANCH_SYNC_GOVERNANCE.md` - Branch synchronization governance
- `.github/BRANCH_LOCK.md` - Branch protection rules
- `.vscode/settings.json` - VS Code Copilot configuration
- `scripts/fix-copilot-branch.sh` - Migration utility script

## Further Reading

- [GitHub Copilot Workspace Documentation](https://docs.github.com/en/copilot/using-github-copilot/using-github-copilot-in-the-command-line)
- [Repository Branch Governance](/.github/BRANCH_SYNC_GOVERNANCE.md)
- [Copilot Instructions](/.github/COPILOT_INSTRUCTIONS.md)

## Issue Reference

- Original Issue: "Failed to find pull request #134 after delegation"
- PR #134: Created from `copilot/audit-steps-5-and-6` branch
- Root Cause: Conflict between Copilot's default branching and repository governance
- Resolution: Updated instructions and added migration tooling
