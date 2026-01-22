# Branch Synchronization System

This repository includes an automated system for keeping all branches synchronized with `main` as the single source of truth, while maintaining strict governance and regulatory compliance.

## Quick Start

### Manual Synchronization

To manually synchronize all branches with the latest changes from `main`:

```bash
./scripts/sync-branches.sh
```

### Automated Synchronization

The system runs automatically:
- **Schedule**: Weekly on Mondays at 2 AM UTC
- **Manual**: Trigger via GitHub Actions UI
- **On-Demand**: Via repository dispatch events

## How It Works

### Merge Direction

```
main ──────► branch-1
       │
       ├────► branch-2
       │
       └────► branch-3
```

- Updates flow **FROM** `main` **TO** all other branches
- **Never** merges branches **INTO** `main` automatically
- Keeps `main` stable and requires explicit approval for changes

### Conflict Handling

When conflicts are detected:
1. ❌ Merge is **aborted** (not auto-resolved)
2. 📝 Conflict is **reported** in detail
3. 👤 **Human review** required
4. 🔧 **Manual resolution** performed
5. ✅ Changes **tested** before pushing

## Usage

### Running the Sync Script

```bash
# Make sure you're in the repository root
cd /path/to/ClinicalSageAI-2-replit

# Run the synchronization
./scripts/sync-branches.sh
```

### Understanding the Output

The script provides detailed information:

#### Success Case
```
[SUCCESS] Successfully merged main into feature-branch
[SUCCESS] Successfully pushed feature-branch to remote
```

#### Conflict Case
```
[WARNING] MERGE CONFLICT detected in branch: feature-branch
[WARNING] This requires manual resolution. Aborting merge...
[WARNING] Action: Review changes and resolve conflicts manually
```

#### Already Up-to-Date
```
[INFO] Branch feature-branch is already up to date with main
```

### Summary Report

After running, you'll see a comprehensive summary:

```
==========================================
SYNCHRONIZATION SUMMARY
==========================================

Total branches processed: 5

Successfully synced: 3
  ✓ feature-1
  ✓ feature-2
  ✓ feature-3

Skipped (already up to date): 1
  - feature-4 (already up to date)

Conflicts detected: 1
  ⚠ feature-5
```

## Resolving Conflicts

When conflicts are detected, follow these steps:

### 1. Checkout the Conflicting Branch

```bash
git checkout feature-branch
```

### 2. Merge Main

```bash
git merge main
```

### 3. Resolve Conflicts

Use your preferred tools:
- VS Code conflict resolution
- Git mergetool
- Manual editing

### 4. Test Your Changes

Ensure everything works:
```bash
npm run test
npm run build
```

### 5. Commit and Push

```bash
git commit -m "Resolve merge conflicts with main"
git push origin feature-branch
```

## GitHub Actions Workflow

### Manual Trigger

1. Go to **Actions** tab in GitHub
2. Select **Sync Branches with Main** workflow
3. Click **Run workflow**
4. Choose options:
   - **Dry run**: Preview changes without applying
   - **Normal run**: Execute synchronization

### Monitoring

After workflow runs:
- Check **Summary** for overview
- Download **sync-report** artifact for details
- Review any **issues** created for conflicts

### Notifications

The workflow will:
- ✅ Create success summary if all branches sync
- ⚠️ Create GitHub issue if conflicts detected
- ❌ Fail if errors encountered

## Governance and Compliance

### Main Branch Protection

The `main` branch is protected:
- ❌ No direct pushes allowed
- ✅ All changes via Pull Request
- ✅ CI/CD must pass
- ✅ Approvals required

### Pull Request Requirements

To merge INTO `main`:

1. **Create PR** from feature branch
2. **Document** changes and rationale
3. **Link** to approved plan
4. **Include** risk assessment
5. **Pass** all CI/CD checks
6. **Get** required approvals
7. **Merge** only after all requirements met

### Audit Trail

All synchronization operations maintain:
- Git commit history
- Workflow run logs
- Sync reports (retained 90 days)
- Conflict resolution documentation

## Files and Structure

```
.
├── .github/
│   ├── BRANCH_SYNC_GOVERNANCE.md    # Governance rules and procedures
│   └── workflows/
│       └── sync-branches.yml         # GitHub Actions workflow
├── scripts/
│   └── sync-branches.sh              # Synchronization script
└── BRANCH_SYNC_README.md            # This file
```

## Troubleshooting

### Script Fails to Run

**Problem**: Permission denied

**Solution**: Make script executable
```bash
chmod +x scripts/sync-branches.sh
```

### Authentication Errors

**Problem**: Git authentication fails

**Solution**: Ensure you have proper credentials configured
```bash
# For HTTPS
git config credential.helper store

# For SSH
ssh-add ~/.ssh/id_rsa
```

### Conflict in Critical Branch

**Problem**: Important branch has conflicts

**Solution**: Priority resolution process
1. Notify team immediately
2. Review conflict scope
3. Coordinate resolution
4. Test thoroughly
5. Document changes

### Script Gets Stuck

**Problem**: Script appears to hang

**Solution**: Check for:
- Network connectivity
- Large file transfers
- Locked files
- Background processes

## Best Practices

### For Developers

✅ **DO**:
- Sync your branch frequently
- Keep changes small and focused
- Test after syncing with main
- Resolve conflicts promptly
- Communicate with team

❌ **DON'T**:
- Let branches get too far behind main
- Ignore conflict notifications
- Force-push without coordination
- Bypass the PR process
- Work directly on main

### For Repository Administrators

✅ **DO**:
- Monitor sync reports regularly
- Review conflict patterns
- Update governance as needed
- Maintain branch protection rules
- Document exceptions

❌ **DON'T**:
- Disable branch protection
- Override CI failures
- Auto-resolve complex conflicts
- Skip approval processes
- Ignore security alerts

## Support and Escalation

### Normal Issues

- Create issue in repository
- Tag relevant team members
- Follow up in team channels

### Urgent Issues

- Contact repository administrators
- Document the urgency
- Follow escalation procedures
- Coordinate team response

## Additional Resources

- [Branch Sync Governance](.github/BRANCH_SYNC_GOVERNANCE.md) - Detailed governance rules
- [GitHub Actions Workflow](.github/workflows/sync-branches.yml) - Automation configuration
- [Sync Script](scripts/sync-branches.sh) - Implementation details

## Version History

| Version | Date       | Changes                           |
|---------|------------|-----------------------------------|
| 1.0     | 2026-01-22 | Initial implementation           |

## License

This synchronization system is part of the ClinicalSageAI-2-replit project and follows the same license terms.

---

**Questions or Issues?**  
Create an issue in the repository or contact the maintainers.
