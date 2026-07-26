/**
 * ═══════════════════════════════════════════════════════════════════════════════
 *                     DANGER.JS - AUTOMATED PR REVIEW
 * ═══════════════════════════════════════════════════════════════════════════════
 *
 * This file defines automated PR review rules for the Concept2Cure Platform.
 * Danger.js runs in CI and posts comments on PRs based on these rules.
 *
 * Documentation: https://danger.systems/js/
 * ═══════════════════════════════════════════════════════════════════════════════
 */

import { danger, warn, fail, message, markdown } from 'danger';

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           CONFIGURATION                                      │
// └─────────────────────────────────────────────────────────────────────────────┘

const CONFIG = {
  // PR size thresholds
  PR_SIZE_WARN: 500, // Lines changed before warning
  PR_SIZE_FAIL: 1000, // Lines changed before failure

  // File thresholds
  LARGE_FILE_WARN: 500, // Single file lines before warning

  // Critical paths requiring extra scrutiny
  CRITICAL_PATHS: [
    'server/auth/',
    'server/middleware/auth',
    'server/services/part11',
    'lumen_cortex/enterprise/compliance',
    'lumen_cortex/enterprise/audit',
    'shared/schema.ts',
    'db/migrations/',
    '.github/workflows/',
    '.github/CODEOWNERS',
  ],

  // Files that should have tests when modified
  REQUIRES_TESTS: ['server/services/', 'server/routes/', 'lumen_cortex/', 'client/src/components/'],

  // Deprecated paths that should not be imported
  DEPRECATED_PATHS: ['_deprecated_migrations/', '_archive/'],
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           HELPER FUNCTIONS                                   │
// └─────────────────────────────────────────────────────────────────────────────┘

const getModifiedFiles = () => [...danger.git.modified_files, ...danger.git.created_files];

const getDeletedFiles = () => danger.git.deleted_files;

const getAllChangedFiles = () => [...getModifiedFiles(), ...getDeletedFiles()];

const matchesPath = (file, patterns) => {
  return patterns.some(pattern => file.includes(pattern));
};

const getLinesChanged = () => {
  const pr = danger.github.pr;
  return (pr.additions || 0) + (pr.deletions || 0);
};

const hasLargePROverride = () => {
  const pr = danger.github.pr;
  const title = (pr.title || '').toLowerCase();
  const labels = pr.labels || [];
  const labelNames = labels.map(label => (label?.name || '').toLowerCase());
  const headRef = (pr.head?.ref || '').toLowerCase();

  return (
    labelNames.includes('override-large-pr') ||
    labelNames.includes('hotfix') ||
    headRef === 'concept2cure-v2' ||
    title.startsWith('revert') ||
    title.startsWith('hotfix')
  );
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           RULE: PR SIZE                                      │
// └─────────────────────────────────────────────────────────────────────────────┘

const checkPRSize = () => {
  const linesChanged = getLinesChanged();

  if (linesChanged > CONFIG.PR_SIZE_FAIL) {
    if (hasLargePROverride()) {
      warn(
        `⚠️ **Large PR (Override)**: This PR changes ${linesChanged} lines.\n\n` +
          `An override was detected (label or title). Please ensure reviewers are aware and the scope is justified.\n\n` +
          `**Suggested approach:**\n` +
          `- Separate refactoring from feature changes\n` +
          `- Split by module or feature area\n` +
          `- Create a PR stack with dependencies`
      );
      return;
    }

    fail(
      `🚨 **Extremely Large PR**: This PR changes ${linesChanged} lines.\n\n` +
        `PRs over ${CONFIG.PR_SIZE_FAIL} lines are difficult to review thoroughly. ` +
        `Please consider breaking this into smaller, focused PRs.\n\n` +
        `**Suggested approach:**\n` +
        `- Separate refactoring from feature changes\n` +
        `- Split by module or feature area\n` +
        `- Create a PR stack with dependencies`
    );
  } else if (linesChanged > CONFIG.PR_SIZE_WARN) {
    warn(
      `⚠️ **Large PR**: This PR changes ${linesChanged} lines.\n\n` +
        `Consider whether this could be split into smaller PRs for easier review.`
    );
  }
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           RULE: CRITICAL PATH CHANGES                        │
// └─────────────────────────────────────────────────────────────────────────────┘

const checkCriticalPathChanges = () => {
  const changedFiles = getAllChangedFiles();
  const criticalChanges = changedFiles.filter(file => matchesPath(file, CONFIG.CRITICAL_PATHS));

  if (criticalChanges.length > 0) {
    warn(
      `🔒 **Critical Path Modified**: The following security/compliance-sensitive files were changed:\n\n` +
        criticalChanges.map(f => `- \`${f}\``).join('\n') +
        '\n\n' +
        `**Required Actions:**\n` +
        `- Ensure security team has reviewed these changes\n` +
        `- Verify compliance implications\n` +
        `- Update relevant ADR if architecture changed`
    );
  }
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           RULE: SCHEMA CHANGES                               │
// └─────────────────────────────────────────────────────────────────────────────┘

// This repo applies migrations from `migrations/` — that is the directory the
// preview-DB job reads. `db/migrations/` is accepted too for the drizzle-kit
// generated lineage. Checking only the latter made this rule fail every
// migration PR in the repo while claiming no migration had been added.
//
// The archived migration directory in CONFIG.DEPRECATED_PATHS also ends in
// `migrations/`, so it is filtered out here: touching an archived migration is
// not the same as adding one. (Referenced through the constant rather than
// spelled out, because checkDeprecatedImports scans added lines for that
// literal and would flag this file for mentioning it.)
const isMigrationFile = file =>
  ['migrations/', 'db/migrations/'].some(dir => file.includes(dir)) &&
  !CONFIG.DEPRECATED_PATHS.some(dep => file.includes(dep));

const checkSchemaChanges = () => {
  const changedFiles = getAllChangedFiles();
  const schemaChanged = changedFiles.some(f => f.includes('shared/schema.ts'));
  const migrationsChanged = changedFiles.some(isMigrationFile);

  if (schemaChanged && !migrationsChanged) {
    fail(
      `🗄️ **Schema Changed Without Migration**: You modified \`shared/schema.ts\` but didn't add a migration.\n\n` +
        `**Required Actions:**\n` +
        `- Add a migration under \`migrations/\` (or \`db/migrations/\` for the drizzle-kit lineage)\n` +
        `- Test migration on a fresh database`
    );
  }

  if (migrationsChanged) {
    message(
      `📋 **Database Migration Detected**: This PR includes database migrations.\n\n` +
        `**Checklist:**\n` +
        `- [ ] Migration is reversible (has down migration)\n` +
        `- [ ] Tested on copy of production data\n` +
        `- [ ] No breaking changes to existing data\n` +
        `- [ ] Deployment plan accounts for migration timing`
    );
  }
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           RULE: DEPRECATED IMPORTS                           │
// └─────────────────────────────────────────────────────────────────────────────┘

const checkDeprecatedImports = async () => {
  const modifiedFiles = getModifiedFiles().filter(
    f => f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')
  );

  for (const file of modifiedFiles) {
    const content = await danger.git.diffForFile(file);
    if (!content) continue;

    for (const deprecatedPath of CONFIG.DEPRECATED_PATHS) {
      if (content.added.includes(deprecatedPath)) {
        fail(
          `🚫 **Deprecated Import Detected** in \`${file}\`:\n\n` +
            `Importing from \`${deprecatedPath}\` is not allowed. ` +
            `These files are scheduled for removal.\n\n` +
            `Please use the current implementation instead.`
        );
      }
    }
  }
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           RULE: TEST COVERAGE                                │
// └─────────────────────────────────────────────────────────────────────────────┘

const checkTestCoverage = () => {
  const modifiedFiles = getModifiedFiles();
  const testableChanges = modifiedFiles.filter(
    f =>
      matchesPath(f, CONFIG.REQUIRES_TESTS) &&
      !f.includes('.test.') &&
      !f.includes('.spec.') &&
      !f.includes('__tests__')
  );

  const testFiles = modifiedFiles.filter(
    f => f.includes('.test.') || f.includes('.spec.') || f.includes('__tests__')
  );

  if (testableChanges.length > 0 && testFiles.length === 0) {
    warn(
      `🧪 **No Tests Added**: You modified testable files but didn't add/update tests:\n\n` +
        testableChanges
          .slice(0, 5)
          .map(f => `- \`${f}\``)
          .join('\n') +
        (testableChanges.length > 5 ? `\n- ...and ${testableChanges.length - 5} more` : '') +
        '\n\n' +
        `Please consider adding tests for your changes.`
    );
  }
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           RULE: CONSOLE.LOG CHECK                            │
// └─────────────────────────────────────────────────────────────────────────────┘

const checkConsoleLogs = async () => {
  const modifiedFiles = getModifiedFiles().filter(
    f =>
      (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) &&
      !f.includes('dangerfile') &&
      !f.includes('.test.') &&
      !f.includes('.spec.')
  );

  const filesWithConsoleLogs = [];

  for (const file of modifiedFiles) {
    const content = await danger.git.diffForFile(file);
    if (!content) continue;

    // Check for new console.log statements (not console.error or console.warn)
    if (content.added.match(/console\.log\(/)) {
      filesWithConsoleLogs.push(file);
    }
  }

  if (filesWithConsoleLogs.length > 0) {
    warn(
      `🔍 **Console.log Detected**: New \`console.log\` statements found in:\n\n` +
        filesWithConsoleLogs.map(f => `- \`${f}\``).join('\n') +
        '\n\n' +
        `Please remove debugging statements before merging, or use the structured logger:\n` +
        `\`\`\`typescript\nimport { createScopedLogger } from './utils/logger';\nconst logger = createScopedLogger('MyModule');\nlogger.info('message', { context });\n\`\`\``
    );
  }
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           RULE: PR DESCRIPTION                               │
// └─────────────────────────────────────────────────────────────────────────────┘

const checkPRDescription = () => {
  const pr = danger.github.pr;

  if (!pr.body || pr.body.length < 50) {
    warn(
      `📝 **PR Description Missing/Short**: Please provide a meaningful description.\n\n` +
        `A good PR description includes:\n` +
        `- What changes were made\n` +
        `- Why these changes were necessary\n` +
        `- How to test the changes\n` +
        `- Any breaking changes or migration steps`
    );
  }

  // Check for required sections from PR template.
  //
  // The section list is READ FROM THE TEMPLATES rather than hardcoded. The
  // hardcoded list previously required '## Summary', '## Type of Change' and
  // '## Testing' — headings no template in this repo provides ('## Change
  // Summary', '## Description', and '### Testing' as a sub-heading), so the rule
  // fired on every PR regardless of how carefully the template was filled in. A
  // warning that can never be satisfied trains reviewers to skip the whole
  // Danger comment, including the critical-path and migration notices that
  // matter. Deriving the list means it cannot drift from the templates again.
  if (pr.body && pr.body.length > 50) {
    const templates = readPrTemplates();
    // Nothing to check against, and nothing to invent: stay silent.
    if (templates.length > 0) {
      const scored = templates
        .map(t => ({
          ...t,
          missing: t.sections.filter(s => !pr.body.includes(s)),
        }))
        // The repo has more than one sanctioned template. Judge the PR against
        // the one the author actually used — fewest missing sections — instead
        // of demanding the union of every template's headings.
        .sort((a, b) => a.missing.length - b.missing.length);
      const best = scored[0];

      if (best.missing.length > 0) {
        warn(
          `📋 **PR Template Sections Missing** (against \`${best.path}\`):\n\n` +
            best.missing.map(s => `- ${s}`).join('\n') +
            '\n\n' +
            `Please use the PR template for consistent reviews.`
        );
      }
    }
  }
};

/**
 * The PR templates present in the repo, with their top-level (`## `) headings.
 *
 * GitHub resolves the template filename case-insensitively across the root,
 * `.github/` and `docs/`, so every location it would honour is checked here.
 * Returns `[]` when no template exists, which the caller treats as "no rule to
 * enforce" rather than "the author skipped the template".
 */
const readPrTemplates = () => {
  const fs = require('fs');
  const candidates = [
    '.github/pull_request_template.md',
    '.github/PULL_REQUEST_TEMPLATE.md',
    'docs/pull_request_template.md',
    'docs/PULL_REQUEST_TEMPLATE.md',
    'pull_request_template.md',
    'PULL_REQUEST_TEMPLATE.md',
  ];
  const seen = new Set();
  const templates = [];
  for (const path of candidates) {
    // A case-insensitive filesystem resolves several candidates to one file;
    // dedupe on content so it is not counted (and reported) twice.
    if (!fs.existsSync(path)) continue;
    const body = fs.readFileSync(path, 'utf8');
    if (seen.has(body)) continue;
    seen.add(body);
    const sections = body
      .split('\n')
      .filter(line => /^##\s+\S/.test(line))
      .map(line => line.trimEnd());
    if (sections.length > 0) templates.push({ path, sections });
  }
  return templates;
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           RULE: PACKAGE.JSON CHANGES                         │
// └─────────────────────────────────────────────────────────────────────────────┘

const checkPackageChanges = () => {
  const changedFiles = getAllChangedFiles();
  const packageChanged = changedFiles.includes('package.json');
  const lockfileChanged = changedFiles.includes('package-lock.json');
  const fs = require('fs');
  const gitignore = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
  const lockfileIgnored = /^\s*package-lock\.json\s*$/m.test(gitignore);

  if (packageChanged && !lockfileChanged) {
    if (lockfileIgnored) {
      warn(
        `📦 **package.json Changed Without Lockfile**: \`package-lock.json\` is gitignored in this repository, so lockfile updates are not expected in PR diffs.`
      );
    } else {
      fail(
        `📦 **package.json Changed Without Lockfile**: You modified \`package.json\` but \`package-lock.json\` wasn't updated.\n\n` +
          `Run \`npm install\` to regenerate the lockfile.`
      );
    }
  }

  if (packageChanged) {
    message(
      `📦 **Dependencies Changed**: This PR modifies package dependencies.\n\n` +
        `**Security Checklist:**\n` +
        `- [ ] New packages reviewed for security advisories\n` +
        `- [ ] Licenses compatible with project\n` +
        `- [ ] No unnecessary dependencies added\n` +
        `- [ ] \`npm audit\` passes`
    );
  }
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           RULE: ADR CHECK                                    │
// └─────────────────────────────────────────────────────────────────────────────┘

const checkADRNeeded = () => {
  const changedFiles = getAllChangedFiles();
  const linesChanged = getLinesChanged();

  // Significant architectural areas
  const architecturalAreas = [
    'server/db.ts',
    'shared/schema.ts',
    'lumen_cortex/',
    'server/services/aiProviderRouter',
    'client/src/portal-v2/',
  ];

  const architecturalChanges = changedFiles.filter(f => matchesPath(f, architecturalAreas));

  if (architecturalChanges.length > 3 && linesChanged > 300) {
    const adrChanged = changedFiles.some(f => f.includes('docs/adr/'));

    if (!adrChanged) {
      message(
        `📚 **Consider Adding an ADR**: This PR makes significant architectural changes.\n\n` +
          `If this changes how the system is structured, consider documenting the decision:\n` +
          `1. Copy \`docs/adr/TEMPLATE.md\`\n` +
          `2. Fill in the context, decision, and consequences\n` +
          `3. Update \`docs/adr/README.md\` index\n\n` +
          `ADRs help future developers (and AI agents) understand why things are the way they are.`
      );
    }
  }
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           SUMMARY GENERATION                                 │
// └─────────────────────────────────────────────────────────────────────────────┘

const generateSummary = () => {
  const changedFiles = getAllChangedFiles();
  const linesChanged = getLinesChanged();

  const categories = {
    Frontend: changedFiles.filter(f => f.startsWith('client/')).length,
    Backend: changedFiles.filter(f => f.startsWith('server/')).length,
    'AI/ML': changedFiles.filter(f => f.includes('lumen_cortex') || f.includes('agent')).length,
    Database: changedFiles.filter(f => f.includes('schema') || f.includes('migration')).length,
    DevOps: changedFiles.filter(f => f.includes('.github') || f.includes('docker')).length,
    Docs: changedFiles.filter(f => f.includes('docs/') || f.endsWith('.md')).length,
  };

  const summary = Object.entries(categories)
    .filter(([_, count]) => count > 0)
    .map(([name, count]) => `| ${name} | ${count} files |`)
    .join('\n');

  markdown(
    `## 📊 PR Summary\n\n` +
      `| Metric | Value |\n` +
      `|--------|-------|\n` +
      `| Total Files | ${changedFiles.length} |\n` +
      `| Lines Changed | ${linesChanged} |\n` +
      `${summary}`
  );
};

// ┌─────────────────────────────────────────────────────────────────────────────┐
// │                           MAIN EXECUTION                                     │
// └─────────────────────────────────────────────────────────────────────────────┘

const runDanger = async () => {
  // Generate summary first
  generateSummary();

  // Run all checks
  checkPRSize();
  checkPRDescription();
  checkCriticalPathChanges();
  checkSchemaChanges();
  await checkDeprecatedImports();
  checkTestCoverage();
  await checkConsoleLogs();
  checkPackageChanges();
  checkADRNeeded();
};

// Execute
runDanger();
