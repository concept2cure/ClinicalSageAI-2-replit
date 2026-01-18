#!/usr/bin/env node

/**
 * CLI tool for manually resolving PR conflicts
 * Usage:
 *   npm run resolve:conflicts -- --pr 32
 *   npm run resolve:conflicts -- --all
 *   npm run resolve:conflicts -- --pr 32 --dry-run
 */

import { execSync } from 'child_process';
import { parseArgs } from 'node:util';

const SCRIPT_PATH = './scripts/auto-resolve-conflicts.mjs';

// Parse command line arguments
const options = {
  pr: { type: 'string', short: 'p' },
  all: { type: 'boolean', short: 'a' },
  'dry-run': { type: 'boolean', short: 'd' },
  help: { type: 'boolean', short: 'h' }
};

let args;
try {
  const parsed = parseArgs({ options, allowPositionals: true });
  args = parsed.values;
} catch (error) {
  console.error('Error parsing arguments:', error.message);
  showHelp();
  process.exit(1);
}

function showHelp() {
  console.log(`
Auto-Resolve PR Conflicts - CLI Tool

Usage:
  npm run resolve:conflicts -- [options]

Options:
  --pr, -p <number>     Resolve conflicts for a specific PR number
  --all, -a             Resolve conflicts for all open PRs
  --dry-run, -d         Show what would be done without making changes
  --help, -h            Show this help message

Examples:
  # Resolve conflicts for PR #32
  npm run resolve:conflicts -- --pr 32

  # Check all open PRs with conflicts
  npm run resolve:conflicts -- --all

  # Dry run for PR #32 (show what would be done)
  npm run resolve:conflicts -- --pr 32 --dry-run

Environment Variables:
  GITHUB_TOKEN          GitHub personal access token (required)
  OPENAI_API_KEY        OpenAI API key for AI-assisted resolution (optional)

Note: This tool creates a new branch with resolved conflicts but does not
auto-merge. Manual review is always recommended.
  `);
}

function main() {
  if (args.help) {
    showHelp();
    process.exit(0);
  }
  
  if (!args.pr && !args.all) {
    console.error('❌ Error: Either --pr or --all must be specified\n');
    showHelp();
    process.exit(1);
  }
  
  if (args.pr && args.all) {
    console.error('❌ Error: Cannot use both --pr and --all\n');
    showHelp();
    process.exit(1);
  }
  
  if (!process.env.GITHUB_TOKEN) {
    console.error('❌ Error: GITHUB_TOKEN environment variable is required');
    console.error('   Set it with: export GITHUB_TOKEN=your_token_here\n');
    process.exit(1);
  }
  
  // Build environment variables for the script
  const env = { ...process.env };
  
  if (args.pr) {
    env.PR_NUMBER = args.pr;
  }
  
  if (args['dry-run']) {
    env.DRY_RUN = 'true';
  }
  
  env.TRIGGER_EVENT = 'manual';
  
  // Execute the auto-resolve script
  try {
    console.log('🚀 Starting conflict resolution...\n');
    execSync(`node ${SCRIPT_PATH}`, {
      env,
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('\n❌ Conflict resolution failed');
    process.exit(1);
  }
}

main();
