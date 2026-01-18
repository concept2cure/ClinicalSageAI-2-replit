# Automated Conflict Resolution Scripts

This directory contains scripts for automated merge conflict detection and resolution.

## Main Scripts

### auto-resolve-conflicts.mjs
Main workflow script that runs in GitHub Actions or can be run locally.

**Triggers:**
- GitHub Actions workflow
- Manual execution
- Scheduled runs

**Environment Variables:**
- `GITHUB_TOKEN` (required) - GitHub API authentication
- `OPENAI_API_KEY` (optional) - For AI-assisted resolution
- `PR_NUMBER` (optional) - Specific PR to process
- `DRY_RUN` (optional) - Set to 'true' for dry run mode
- `TRIGGER_EVENT` (optional) - Event type that triggered the run

**Output:**
- Creates resolution branch: `auto-resolve/pr-{number}`
- Posts detailed comment on PR
- Saves log to `logs/conflict-resolutions.json`

### resolve-pr-conflicts.mjs
Command-line interface for manual conflict resolution.

**Usage:**
```bash
# Resolve specific PR
npm run resolve:conflicts -- --pr 32

# Check all open PRs
npm run resolve:conflicts -- --all

# Dry run mode
npm run resolve:conflicts -- --pr 32 --dry-run
```

**Options:**
- `--pr, -p <number>` - PR number to process
- `--all, -a` - Process all open PRs
- `--dry-run, -d` - Show what would be done without making changes
- `--help, -h` - Show help message

## Library Modules

See [lib/README.md](lib/README.md) for detailed documentation of library modules.

## Workflow

1. **Detection** - Identify PRs with merge conflicts
2. **Analysis** - Parse conflict markers and categorize conflicts
3. **Resolution** - Apply appropriate resolution strategies
4. **Validation** - Verify resolution quality and confidence
5. **Commit** - Create branch with resolved conflicts
6. **Report** - Post detailed summary on PR

## Resolution Strategies

The system uses a priority-based approach:

| Priority | Strategy | Confidence | Description |
|----------|----------|-----------|-------------|
| 1 | Whitespace | 100% | Whitespace-only differences |
| 2 | Line Endings | 100% | CRLF vs LF normalization |
| 3 | Imports | 95% | Merge and deduplicate imports |
| 4 | Dependencies | 90% | Smart package.json merging |
| 5 | Non-overlapping | 85% | Accept both when possible |
| 6 | AI-Assisted | 70% | AI code analysis (optional) |

## Configuration

Edit `.github/auto-resolve-config.yml` to customize:

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
  
  protectedFiles:
    - "*.sql"
    - "db/migrations/*"
```

## Safety Features

1. **Protected Files** - Never auto-resolve critical files
2. **Confidence Thresholds** - Only apply high-confidence resolutions
3. **Manual Review** - Creates branch for review, doesn't auto-merge
4. **Audit Logs** - Complete history of all attempts
5. **Dry Run Mode** - Test without making changes

## Local Development

### Setup
```bash
# Install dependencies
npm install

# Set GitHub token
export GITHUB_TOKEN=your_token_here

# Optional: Set OpenAI key for AI features
export OPENAI_API_KEY=your_key_here
```

### Testing
```bash
# Syntax check
node --check scripts/*.mjs
node --check scripts/lib/*.mjs

# Dry run
npm run resolve:conflicts -- --pr 32 --dry-run

# Actual run
npm run resolve:conflicts -- --pr 32
```

### Debugging
```bash
# Check logs
cat logs/conflict-resolutions.json | jq

# View recent attempts
cat logs/conflict-resolutions.json | jq '.[-5:]'

# Check workflow runs
gh run list --workflow=auto-resolve-conflicts.yml
```

## GitHub Actions

The workflow runs automatically on:
- Pull request updates
- Schedule (daily at 2 AM UTC)
- Manual trigger via workflow_dispatch

**Manual Trigger:**
1. Go to Actions tab
2. Select "Auto-Resolve Merge Conflicts"
3. Click "Run workflow"
4. Enter PR number (optional)
5. Choose dry run if desired

## Common Issues

### "Module not found" errors
```bash
# Ensure dependencies are installed
npm install @octokit/rest js-yaml
```

### "Permission denied" on branch creation
```bash
# Verify GITHUB_TOKEN has write permissions
# Check repository settings > Actions > General > Workflow permissions
```

### AI resolution not working
```bash
# Verify OPENAI_API_KEY is set
echo $OPENAI_API_KEY

# Check OpenAI API status
curl https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
```

## Best Practices

1. **Start with dry run** - Always test with `--dry-run` first
2. **Review AI resolutions** - Manually verify AI-generated code
3. **Monitor logs** - Regularly check resolution success rates
4. **Adjust confidence** - Lower threshold if too conservative
5. **Protect critical files** - Add to protectedFiles list
6. **Test resolutions** - Run full test suite on resolution branches

## Contributing

When adding new features:

1. Add tests for new strategies
2. Document in this README
3. Update main documentation
4. Maintain backward compatibility
5. Follow existing code style

## License

Part of the ClinicalSageAI-2-replit project.
