# Automated Merge Conflict Resolution System

## Overview

This system provides fully automated detection and resolution of merge conflicts in pull requests using intelligent strategies and optional AI assistance. The system can be triggered manually, automatically on PR updates, or on a schedule to check all open PRs.

## Features

- **Automated Conflict Detection**: Automatically detects PRs with merge conflicts
- **Intelligent Resolution Strategies**: Multiple strategies for different conflict types
- **AI-Powered Analysis**: Optional AI assistance for complex code conflicts
- **Safety Mechanisms**: Protected files, confidence thresholds, and manual review gates
- **Detailed Reporting**: Comprehensive comments on PRs with resolution details
- **Logging**: Complete audit trail of all resolution attempts

## System Components

### 1. GitHub Actions Workflow

Location: `.github/workflows/auto-resolve-conflicts.yml`

**Triggers:**
- `workflow_dispatch`: Manual trigger with optional PR number
- `pull_request`: Automatic trigger when PRs are opened/updated
- `schedule`: Daily check of all open PRs (2 AM UTC)

**Permissions Required:**
- `contents: write` - To create branches and commit changes
- `pull-requests: write` - To comment on PRs
- `issues: write` - To add labels and comments

### 2. Configuration File

Location: `.github/auto-resolve-config.yml`

```yaml
autoResolve:
  enabled: true
  minConfidence: 85        # Minimum confidence % to auto-resolve
  autoMerge: false         # Enable auto-merge (not recommended)
  
  strategies:
    whitespace: true       # Auto-fix whitespace conflicts
    imports: true          # Merge import statements
    dependencies: true     # Merge package.json dependencies
    aiAssisted: true       # Use AI for complex conflicts
    
  protectedFiles:         # Never auto-resolve these files
    - "*.sql"
    - "db/migrations/*"
    - "prisma/migrations/*"
    - ".github/workflows/*"
```

### 3. Resolution Strategies

The system uses a priority-based approach with the following strategies:

| Strategy | Confidence | Description |
|----------|-----------|-------------|
| Whitespace | 100% | Resolves conflicts that only differ in whitespace |
| Line Endings | 100% | Normalizes CRLF/LF differences |
| Imports | 95% | Merges and deduplicates import statements |
| Dependencies | 90% | Intelligently merges package.json dependencies |
| Non-overlapping | 85% | Accepts both when changes don't conflict |
| AI-Assisted | 70% | Uses AI to analyze and resolve code conflicts |

### 4. Scripts

**Main Scripts:**
- `scripts/auto-resolve-conflicts.mjs` - Main workflow script
- `scripts/resolve-pr-conflicts.mjs` - CLI tool for manual execution

**Library Modules:**
- `scripts/lib/github-client.mjs` - GitHub API interactions
- `scripts/lib/conflict-resolver.mjs` - Core conflict resolution logic
- `scripts/lib/merge-strategies.mjs` - Strategy implementations
- `scripts/lib/ai-code-analyzer.mjs` - AI-powered analysis

## Usage

### Manual Trigger via CLI

```bash
# Resolve conflicts for a specific PR
npm run resolve:conflicts -- --pr 32

# Check all open PRs with conflicts
npm run resolve:conflicts -- --all

# Dry run (show what would be done without making changes)
npm run resolve:conflicts -- --pr 32 --dry-run
```

### Manual Trigger via GitHub Actions

1. Go to **Actions** tab in GitHub
2. Select **Auto-Resolve Merge Conflicts** workflow
3. Click **Run workflow**
4. Enter PR number (optional - leave empty for all open PRs)
5. Choose dry run mode if desired
6. Click **Run workflow**

### Automatic Trigger

The workflow automatically runs when:
- A pull request is opened, updated, or reopened
- On schedule (daily at 2 AM UTC)

## Environment Variables

### Required

- `GITHUB_TOKEN`: GitHub token for API access (automatically provided in Actions)

### Optional

- `OPENAI_API_KEY`: OpenAI API key for AI-assisted conflict resolution
- `SLACK_WEBHOOK_URL`: Slack webhook for notifications (future feature)

## How It Works

### 1. Detection Phase

1. Fetch PR details from GitHub API
2. Check `mergeable_state` for conflicts
3. Attempt test merge to identify conflicting files

### 2. Analysis Phase

For each conflicting file:
1. Parse conflict markers (`<<<<<<<`, `=======`, `>>>>>>>`)
2. Extract base and head versions
3. Check if file is protected from auto-resolution

### 3. Resolution Phase

For each conflict:
1. Try each resolution strategy in priority order
2. Check if resolution meets minimum confidence threshold
3. If all automatic strategies fail, optionally try AI resolution
4. If still unresolved, mark for manual review

### 4. Commit Phase

If conflicts are resolved:
1. Stage resolved files
2. Create commit with resolution details
3. Create new branch: `auto-resolve/pr-{number}`
4. Push branch to repository

### 5. Reporting Phase

1. Post detailed comment on PR with:
   - Summary of resolved/failed conflicts
   - Confidence scores for each resolution
   - Link to resolution branch
   - Recommendations for next steps
2. Save resolution log to `logs/conflict-resolutions.json`

## Safety Mechanisms

### 1. Protected Files

Files matching patterns in `protectedFiles` config are never auto-resolved:
- Database migrations
- SQL files
- Workflow files
- Any critical configuration files

### 2. Confidence Thresholds

- Each resolution strategy has a confidence score (0-100%)
- Only resolutions meeting `minConfidence` threshold are applied
- AI-assisted resolutions are capped at 70% confidence

### 3. Manual Review Gates

- `autoMerge` is disabled by default
- Resolution branch is created but not merged
- PR comment clearly indicates if manual review is needed
- High-confidence resolutions (90%+) are flagged for expedited review

### 4. Audit Trail

- All resolution attempts logged to `logs/conflict-resolutions.json`
- Includes timestamp, PR details, files, strategies used, and outcomes
- Logs retained as workflow artifacts for 30 days

## Reviewing AI Resolutions

When AI resolves a conflict:

1. **Check the Comment**: Review the confidence score and explanation
2. **Examine the Diff**: Compare the resolution against both versions
3. **Test the Code**: Run tests on the resolution branch
4. **Verify Intent**: Ensure both changes are properly preserved

**Red Flags:**
- Confidence below 80%
- Logic changes in critical code paths
- Removed functionality from either version
- Comments indicating uncertainty

## Configuration Best Practices

### Conservative (Recommended)

```yaml
autoResolve:
  enabled: true
  minConfidence: 90
  autoMerge: false
  
  strategies:
    whitespace: true
    imports: true
    dependencies: true
    aiAssisted: false    # Disable AI for maximum safety
```

### Balanced

```yaml
autoResolve:
  enabled: true
  minConfidence: 85
  autoMerge: false
  
  strategies:
    whitespace: true
    imports: true
    dependencies: true
    aiAssisted: true
```

### Aggressive (Not Recommended)

```yaml
autoResolve:
  enabled: true
  minConfidence: 70
  autoMerge: true        # Auto-merge - use with extreme caution!
  
  strategies:
    whitespace: true
    imports: true
    dependencies: true
    aiAssisted: true
```

## Troubleshooting

### Workflow Fails to Start

**Issue**: Workflow doesn't run when PR is updated

**Solutions**:
- Check workflow file syntax: `yamllint .github/workflows/auto-resolve-conflicts.yml`
- Verify repository permissions in Settings > Actions
- Check if Actions are enabled for the repository

### Failed to Resolve Conflicts

**Issue**: Script runs but can't resolve conflicts

**Possible Causes**:
- Conflicts too complex for automated strategies
- File is in protected list
- Confidence threshold too high
- Git merge issues

**Solutions**:
- Review the PR comment for specific failure reasons
- Check logs in workflow artifacts
- Lower `minConfidence` if appropriate
- Add exception to `protectedFiles` if needed

### AI Resolution Not Working

**Issue**: AI-assisted resolution always fails

**Solutions**:
- Verify `OPENAI_API_KEY` is set in repository secrets
- Check OpenAI API quota and billing
- Review error messages in workflow logs
- Ensure `aiAssisted: true` in config

### Branch Already Exists Error

**Issue**: `auto-resolve/pr-{number}` branch already exists

**Solutions**:
- Delete the old resolution branch manually
- Run the workflow again
- Or review the existing resolution branch

### Permission Denied Errors

**Issue**: Git push or branch creation fails

**Solutions**:
- Verify workflow has `contents: write` permission
- Check if branch protection rules are blocking
- Ensure GITHUB_TOKEN has necessary scopes

## Monitoring and Metrics

### Resolution Logs

View all resolution attempts:

```bash
cat logs/conflict-resolutions.json | jq
```

### Success Metrics

Track success rates by file type:

```bash
cat logs/conflict-resolutions.json | jq '
  [.[] | .results.details[] | 
   {file: .file | split(".") | .[-1], status: .status}] | 
  group_by(.file) | 
  map({type: .[0].file, 
       total: length, 
       resolved: [.[] | select(.status == "resolved")] | length})'
```

### Recent Activity

View last 10 resolution attempts:

```bash
cat logs/conflict-resolutions.json | jq '.[-10:]'
```

## Disabling the System

### Temporary Disable

In `.github/auto-resolve-config.yml`:

```yaml
autoResolve:
  enabled: false
```

### Permanent Disable

1. Delete or rename the workflow file:
   ```bash
   mv .github/workflows/auto-resolve-conflicts.yml \
      .github/workflows/auto-resolve-conflicts.yml.disabled
   ```

2. Or disable the workflow in GitHub UI:
   - Go to Actions tab
   - Select the workflow
   - Click "⋯" menu → "Disable workflow"

## Advanced Configuration

### Custom Strategies

Add custom resolution strategies in `scripts/lib/merge-strategies.mjs`:

```javascript
export function customStrategy(baseContent, headContent, context) {
  // Your custom logic here
  return {
    resolved: true/false,
    content: 'resolved content',
    confidence: 85,
    reason: 'explanation'
  };
}

// Add to resolutionStrategies array
export const resolutionStrategies = [
  // ... existing strategies
  { 
    type: 'custom', 
    handler: customStrategy, 
    confidence: 85,
    description: 'Custom resolution logic' 
  },
];
```

### File Type Specific Rules

Protect specific file types:

```yaml
protectedFiles:
  - "*.sql"
  - "*.prisma"
  - "*.graphql"
  - "terraform/**/*.tf"
  - "kubernetes/**/*.yaml"
```

### Notification Integrations

Future feature - add webhook notifications:

```yaml
notifications:
  slack: true
  slackWebhook: "https://hooks.slack.com/..."
  email: true
  emailTo: "team@example.com"
```

## Security Considerations

1. **API Keys**: Never commit API keys - use GitHub Secrets
2. **Protected Branches**: Ensure resolution branches can't bypass required reviews
3. **Code Review**: Always review AI-generated resolutions
4. **Testing**: Run full test suite on resolution branches
5. **Audit Logs**: Regularly review resolution logs for anomalies

## Future Enhancements

- [ ] Machine learning from manual resolutions
- [ ] Pattern detection for conflict prevention
- [ ] Integration with code review tools
- [ ] Slack/email notifications
- [ ] Web UI for reviewing resolutions
- [ ] Pre-commit hooks for conflict detection
- [ ] Team-specific resolution policies
- [ ] Resolution analytics dashboard

## Support

For issues or questions:

1. Check this documentation
2. Review workflow logs in Actions tab
3. Check `logs/conflict-resolutions.json` for details
4. Open an issue with:
   - PR number
   - Workflow run URL
   - Error messages
   - Configuration file

## License

This automated conflict resolution system is part of the ClinicalSageAI-2-replit project and follows the same license terms.
