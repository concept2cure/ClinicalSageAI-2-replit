# Testing the Copilot Branch Delegation Fix

## Overview
This document provides test cases and verification steps for the Copilot branch delegation fix.

## Test Cases

### Test Case 1: Verify Copilot Instructions are Loaded

**Purpose:** Ensure Copilot can read and access the updated instructions.

**Steps:**
1. Open VS Code with GitHub Copilot enabled
2. Check `.github/copilot-instructions.md` is present
3. Check `.vscode/settings.json` contains Copilot settings

**Expected Result:**
- Copilot should have access to branch management rules
- Code generation instructions should reference `concept2cure-v2`

**Verification:**
```bash
# Check copilot-instructions.md exists and has branch rules
grep -A 5 "CRITICAL: Branch Management" .github/copilot-instructions.md

# Check VS Code settings has Copilot configuration
grep -A 3 "github.copilot.chat.codeGeneration.instructions" .vscode/settings.json
```

### Test Case 2: Migration Script - Already on concept2cure-v2

**Purpose:** Verify script handles the case where user is already on the correct branch.

**Setup:**
```bash
git checkout concept2cure-v2
```

**Steps:**
```bash
./scripts/fix-copilot-branch.sh
```

**Expected Result:**
- Script detects you're not on a copilot/* branch
- Exits successfully with green checkmark
- No changes made

### Test Case 3: Migration Script - On copilot/* Branch (No Commits)

**Purpose:** Verify script can switch from copilot/* branch to concept2cure-v2 when no commits need migration.

**Setup:**
```bash
# Create a test copilot branch from concept2cure-v2 (no new commits)
git checkout concept2cure-v2
git checkout -b copilot/test-branch-no-commits
```

**Steps:**
```bash
./scripts/fix-copilot-branch.sh
# Answer 'y' to switch to concept2cure-v2
# Answer 'y' to delete local branch
# Answer 'n' to remote deletion (if branch wasn't pushed)
```

**Expected Result:**
- Script detects copilot/* branch
- Shows warning in red
- Finds 0 commits to migrate
- Switches to concept2cure-v2
- Offers to delete copilot/test-branch-no-commits
- Successfully completes

**Cleanup:**
```bash
# If still on the test branch
git checkout concept2cure-v2
git branch -D copilot/test-branch-no-commits 2>/dev/null || true
```

### Test Case 4: Migration Script - On copilot/* Branch (With Commits)

**Purpose:** Verify script can cherry-pick commits from copilot/* branch to concept2cure-v2.

**Setup:**
```bash
# Create a test copilot branch with a commit
git checkout concept2cure-v2
git checkout -b copilot/test-branch-with-commits
echo "Test file for migration" > /tmp/test-migration.txt
git add /tmp/test-migration.txt
git commit -m "Test commit for migration testing"
```

**Steps:**
```bash
./scripts/fix-copilot-branch.sh
# Answer 'y' to migrate commits
# Answer 'n' to pushing (for testing)
# Answer 'y' to delete local branch
```

**Expected Result:**
- Script detects copilot/* branch
- Shows warning
- Finds 1 commit to migrate
- Displays commit list
- Switches to concept2cure-v2
- Cherry-picks the commit
- Shows success message
- Offers to delete the copilot/* branch

**Verification:**
```bash
# Check the commit was applied
git log --oneline -5 | grep "Test commit for migration testing"

# Check the file exists
test -f /tmp/test-migration.txt && echo "File exists"
```

**Cleanup:**
```bash
# Remove the test commit and file
git reset --hard HEAD~1
rm /tmp/test-migration.txt
git branch -D copilot/test-branch-with-commits 2>/dev/null || true
```

### Test Case 5: Verify GitHub Copilot Behavior

**Purpose:** Verify that GitHub Copilot respects the branch instructions.

**Setup:**
1. Ensure you're on `concept2cure-v2` branch
2. Open VS Code with Copilot enabled
3. Start a Copilot chat or workspace session

**Steps:**
1. Ask Copilot: "What branch should I work on?"
2. Ask Copilot: "Create a new feature"
3. Observe what branch Copilot creates or recommends

**Expected Result:**
- Copilot should reference `concept2cure-v2`
- Should NOT create `copilot/*` branches
- Should warn against creating feature branches

**Note:** This test requires actual Copilot interaction and may vary based on Copilot's behavior.

### Test Case 6: Branch Protection Settings

**Purpose:** Verify VS Code Git settings enforce branch constraints.

**Steps:**
```bash
# Check VS Code settings
cat .vscode/settings.json | jq '.["git.branchProtection"]'
cat .vscode/settings.json | jq '.["git.branchValidationRegex"]'
```

**Expected Result:**
```json
["main", "concept2cure-v2"]
"^(concept2cure-v2|main)$"
```

### Test Case 7: Documentation Completeness

**Purpose:** Verify all documentation is in place and accessible.

**Steps:**
```bash
# Check all documentation files exist
test -f .github/copilot-instructions.md && echo "✓ copilot-instructions.md"
test -f .github/COPILOT_INSTRUCTIONS.md && echo "✓ COPILOT_INSTRUCTIONS.md"
test -f docs/fixes/COPILOT_BRANCH_DELEGATION_FIX.md && echo "✓ Fix documentation"
test -f scripts/fix-copilot-branch.sh && echo "✓ Migration script"

# Check README has troubleshooting section
grep -A 5 "Common Issues" README.md
```

**Expected Result:**
- All documentation files exist
- README contains troubleshooting section
- Documentation references are correct

## Regression Tests

### RT-1: Existing Workflow Compatibility

**Purpose:** Ensure fix doesn't break existing development workflow.

**Steps:**
1. Checkout `concept2cure-v2`
2. Make a simple change to a file
3. Commit the change
4. Push to origin

**Expected Result:**
- Normal git workflow functions correctly
- No errors or warnings related to branch validation

### RT-2: PR Creation

**Purpose:** Verify PRs can still be created from concept2cure-v2 to main.

**Steps:**
1. Ensure you're on `concept2cure-v2`
2. Create a test branch for PR: `git checkout -b test/pr-creation`
3. Make a change and commit
4. Push to origin
5. Create PR via GitHub UI or API

**Expected Result:**
- PR can be created successfully
- No branch validation errors

**Cleanup:**
```bash
git checkout concept2cure-v2
git branch -D test/pr-creation
```

## Manual Verification Checklist

After deploying the fix, verify:

- [ ] `.github/copilot-instructions.md` has branch management section at the top
- [ ] `.github/COPILOT_INSTRUCTIONS.md` has GitHub Copilot delegation section
- [ ] `.vscode/settings.json` has Copilot code generation instructions
- [ ] `scripts/fix-copilot-branch.sh` is executable (`chmod +x`)
- [ ] `docs/fixes/COPILOT_BRANCH_DELEGATION_FIX.md` exists and is complete
- [ ] README.md has troubleshooting section with link to fix documentation
- [ ] All changes committed and pushed
- [ ] PR #134 issue is resolved or documented

## Success Criteria

The fix is considered successful when:

1. ✅ No new `copilot/*` branches are created by Copilot delegation
2. ✅ All work happens on `concept2cure-v2` branch
3. ✅ Migration script can recover from accidental `copilot/*` branch creation
4. ✅ Documentation is clear and accessible
5. ✅ Existing workflows are not broken
6. ✅ Team members can easily follow the new workflow

## Reporting Issues

If you encounter issues with the fix:

1. Document the specific scenario
2. Include branch names and commit SHAs
3. Capture any error messages
4. Note what Copilot instructions or actions were taken
5. Report via GitHub Issues with label `copilot-branch-issue`

## Additional Notes

- The fix is preventive, not restrictive - it guides Copilot but doesn't technically prevent branch creation
- GitHub Copilot behavior may evolve over time; monitor for changes
- Consider periodic reviews of branch list to identify any stray `copilot/*` branches
- The migration script is safe to run multiple times
