# Conflict Resolution Library Modules

This directory contains the core library modules for automated merge conflict resolution.

## Modules

### github-client.mjs
GitHub API client for interacting with pull requests, branches, and repository data.

**Key Functions:**
- `getPullRequest(prNumber)` - Get PR details
- `listOpenPullRequests()` - List all open PRs
- `getPullRequestFiles(prNumber)` - Get files changed in PR
- `createComment(prNumber, body)` - Post comment on PR
- `getFileContent(path, ref)` - Get file contents from GitHub

### conflict-resolver.mjs
Core conflict resolution logic and orchestration.

**Key Functions:**
- `parseConflictMarkers(content)` - Parse Git conflict markers
- `loadConfig()` - Load auto-resolve configuration
- `resolveConflict(conflict, filePath, config)` - Resolve a single conflict
- `resolveFileConflicts(filePath, config)` - Resolve all conflicts in a file
- `getConflictedFiles()` - Get list of files with conflicts
- `isProtectedFile(filePath, config)` - Check if file is protected
- `saveResolutionLog(logEntry)` - Save resolution attempt to log

### merge-strategies.mjs
Implementation of different conflict resolution strategies.

**Available Strategies:**
1. **Whitespace** (100% confidence) - Resolves whitespace-only differences
2. **Line Endings** (100% confidence) - Normalizes CRLF/LF differences
3. **Imports** (95% confidence) - Merges and deduplicates import statements
4. **Dependencies** (90% confidence) - Intelligently merges package.json
5. **Non-overlapping** (85% confidence) - Accepts both when changes don't conflict

**Adding Custom Strategies:**
```javascript
export function customStrategy(baseContent, headContent, context) {
  // Your resolution logic
  return {
    resolved: true/false,
    content: 'resolved content',
    confidence: 85,
    reason: 'explanation of resolution'
  };
}

// Add to resolutionStrategies array
export const resolutionStrategies = [
  // ... existing strategies
  { 
    type: 'custom', 
    handler: customStrategy, 
    confidence: 85,
    description: 'Custom conflict resolution' 
  }
];
```

### ai-code-analyzer.mjs
Optional AI-powered conflict analysis using OpenAI API.

**Key Functions:**
- `aiResolveCode(baseContent, headContent, context)` - AI-assisted resolution
- `createConflictReport(conflicts, context)` - Generate detailed report

**Requirements:**
- `OPENAI_API_KEY` environment variable
- `openai` npm package
- Falls back gracefully if not available

**Confidence Cap:**
AI-generated resolutions are capped at 70% confidence to ensure human review.

## Usage Example

```javascript
import GitHubClient from './lib/github-client.mjs';
import { loadConfig, resolveFileConflicts } from './lib/conflict-resolver.mjs';

const client = new GitHubClient(token, owner, repo);
const config = loadConfig();

// Resolve conflicts in a file
const result = await resolveFileConflicts('path/to/file.js', config);

if (result.resolved) {
  console.log(`Resolved with ${result.avgConfidence}% confidence`);
} else {
  console.log(`Failed: ${result.message}`);
}
```

## Development

When modifying these modules:

1. **Maintain backward compatibility** - Don't break existing API contracts
2. **Add tests** - Ensure new strategies are well-tested
3. **Update confidence scores** - Be conservative with confidence values
4. **Document edge cases** - Note any limitations or special cases
5. **Error handling** - Always fail gracefully with helpful messages

## Testing

Syntax check all modules:
```bash
node --check scripts/lib/*.mjs
```

Run with dry-run mode to test without making changes:
```bash
npm run resolve:conflicts -- --pr 32 --dry-run
```
