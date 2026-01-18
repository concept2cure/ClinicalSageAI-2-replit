# Quick Start: Automated Conflict Resolution

Get started with automated merge conflict resolution in 5 minutes.

## Prerequisites

- Node.js 20+
- GitHub repository access
- GitHub personal access token

## Setup

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure GitHub Token

```bash
export GITHUB_TOKEN=your_github_token_here
```

### 3. (Optional) Configure OpenAI for AI Features

```bash
export OPENAI_API_KEY=your_openai_key_here
```

## Quick Test

### Option 1: Manual CLI Trigger

Resolve conflicts for PR #32:

```bash
npm run resolve:conflicts -- --pr 32
```

### Option 2: Dry Run (Recommended First)

See what would happen without making changes:

```bash
npm run resolve:conflicts -- --pr 32 --dry-run
```

### Option 3: GitHub Actions

1. Go to **Actions** tab in GitHub
2. Select **Auto-Resolve Merge Conflicts**
3. Click **Run workflow**
4. Enter PR number: `32`
5. Check "Dry run" if testing
6. Click **Run workflow**

## What Happens Next

The system will:

1. ✅ Detect conflicts in the PR
2. 🔍 Analyze each conflict
3. 🛠️ Attempt resolution using intelligent strategies
4. 📝 Create a new branch: `auto-resolve/pr-32`
5. 💬 Post a detailed comment on the PR
6. 📊 Save logs to `logs/conflict-resolutions.json`

## Expected Output

### Console Output
```
🚀 Auto-Resolve Merge Conflicts

📦 Repository: concept2cure/ClinicalSageAI-2-replit
🎯 Trigger: manual

🔍 Checking PR #32: Add Co-Author DEMO_MODE fixtures...
   Base: main, Head: codex/implement-liquid-csr-ingestion-pipeline
   ⚠️  Found 3 file(s) with conflicts:
      - client/src/lib/queryClient.ts
      - client/src/pages/CoAuthor.jsx
      - server/routes/coauthor.js

🔧 Attempting to resolve conflicts...

   📄 client/src/lib/queryClient.ts
      ✅ Resolved 2 conflict(s) (92.5% confidence)

   📄 client/src/pages/CoAuthor.jsx
      ✅ Resolved 1 conflict(s) (88.0% confidence)

   📄 server/routes/coauthor.js
      🔒 Protected file - skipping

✅ Created resolution branch: auto-resolve/pr-32
✅ Posted summary comment on PR #32

✅ Auto-resolve workflow completed
```

### PR Comment
A detailed comment will be posted with:
- Summary of conflicts found and resolved
- Confidence scores for each resolution
- Link to resolution branch
- Recommendation for next steps

## Review the Results

### 1. Check the Resolution Branch

```bash
git fetch origin
git checkout auto-resolve/pr-32
git diff main
```

### 2. Review the PR Comment

Go to PR #32 and read the automated comment for details.

### 3. Inspect the Logs

```bash
cat logs/conflict-resolutions.json | jq '.[-1]'
```

## Next Steps

### If Resolution Successful ✅

1. Review the changes in `auto-resolve/pr-32`
2. Run tests on the resolution branch
3. If satisfied, merge the resolution branch into your PR branch
4. Delete the resolution branch

```bash
# Example: Merge resolution into PR branch
git checkout codex/implement-liquid-csr-ingestion-pipeline
git merge auto-resolve/pr-32
git push origin codex/implement-liquid-csr-ingestion-pipeline
```

### If Resolution Failed ❌

1. Check the PR comment for details
2. Review logs for specific errors
3. Manually resolve remaining conflicts
4. Consider adjusting configuration:
   - Lower `minConfidence` threshold
   - Enable additional strategies
   - Remove files from `protectedFiles` if appropriate

## Configuration

Customize in `.github/auto-resolve-config.yml`:

### Conservative (Safe)
```yaml
autoResolve:
  enabled: true
  minConfidence: 90
  autoMerge: false
  strategies:
    whitespace: true
    imports: true
    dependencies: true
    aiAssisted: false
```

### Balanced (Recommended)
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

## Troubleshooting

### "No conflicts found"
- PR may already be up to date
- Conflicts may have been resolved manually
- Check PR status in GitHub

### "Permission denied"
- Verify `GITHUB_TOKEN` has write access
- Check workflow permissions in repository settings

### "Strategy failed"
- Review logs for details
- Try lowering confidence threshold
- Enable AI assistance if not already enabled

## Learn More

- [Full Documentation](../docs/AUTO_CONFLICT_RESOLUTION.md)
- [Library API](lib/README.md)
- [Scripts Guide](README.md)

## Get Help

If you encounter issues:

1. Check the logs: `logs/conflict-resolutions.json`
2. Review workflow runs in GitHub Actions
3. Read the full documentation
4. Open an issue with details

## Success Criteria

✅ Workflow runs without errors
✅ Resolution branch created
✅ PR comment posted with details
✅ Confidence scores ≥ 85%
✅ All tests pass on resolution branch

You're ready to go! 🚀
