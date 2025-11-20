#!/usr/bin/env node

/**
 * Database Migration Script for LumenTrialGuide.AI
 *
 * This script pushes the schema defined in shared/schema.ts
 * to the connected PostgreSQL database using Drizzle ORM.
 */

const { execSync } = require('child_process');
const readline = require('readline');
const fs = require('fs');
const path = require('path');

// ANSI color codes for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

// Helper function to print colored output
function printColored(text, color) {
  console.log(`${color}${text}${colors.reset}`);
}

// Helper function to print a step
function printStep(stepNumber, stepName) {
  printColored(`\n[Step ${stepNumber}] ${stepName}`, colors.bright + colors.blue);
}

// Ask user for confirmation before proceeding
function askForConfirmation(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    rl.question(`${question} (y/N): `, answer => {
      rl.close();
      resolve(answer.toLowerCase() === 'y');
    });
  });
}

async function runMigration() {
  printColored('\n╔══════════════════════════════════════════════════╗', colors.cyan);
  printColored('║             DATABASE MIGRATION SCRIPT             ║', colors.cyan);
  printColored('║            LumenTrialGuide.AI Platform            ║', colors.cyan);
  printColored('╚══════════════════════════════════════════════════╝\n', colors.cyan);

  // Step 1: Verify DATABASE_URL environment variable
  printStep(1, 'Verifying database connection');

  if (!process.env.DATABASE_URL) {
    printColored('ERROR: DATABASE_URL environment variable is not set!', colors.red);
    printColored('Make sure your database is provisioned and the URL is available.', colors.yellow);
    process.exit(1);
  }

  printColored('✓ DATABASE_URL environment variable is set', colors.green);
  printColored(
    `Connection URL: ${process.env.DATABASE_URL.replace(/\/\/(.+?):.+?@/, '//***:***@')}`,
    colors.cyan
  );

  // Step 2: Verify schema file exists
  printStep(2, 'Checking schema definition file');

  const schemaPath = path.resolve(__dirname, '../shared/schema.ts');

  if (!fs.existsSync(schemaPath)) {
    printColored(`ERROR: Schema file not found at ${schemaPath}`, colors.red);
    process.exit(1);
  }

  printColored('✓ Schema file exists', colors.green);

  // Step 3: Confirmation before pushing changes
  printStep(3, 'Preparing to push schema to database');

  printColored(
    'WARNING: This will attempt to push schema changes to your database.',
    colors.yellow
  );
  printColored(
    'Existing tables will be preserved but columns might be added or altered.',
    colors.yellow
  );

  const confirmed = await askForConfirmation('Do you want to continue?');

  if (!confirmed) {
    printColored('Migration cancelled by user.', colors.yellow);
    process.exit(0);
  }

  // Step 4: Run the migration
  printStep(4, 'Pushing schema to database');

  try {
    printColored('Running Drizzle migration...', colors.cyan);

    // Execute the drizzle-kit push command
    const output = execSync('npx drizzle-kit push --verbose', {
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    printColored('Migration output:', colors.cyan);
    console.log(output);

    printColored('✓ Schema successfully pushed to database!', colors.green);
  } catch (error) {
    printColored('ERROR: Migration failed!', colors.red);
    console.error(error.toString());
    process.exit(1);
  }

  // Step 5: Verify tables were created
  printStep(5, 'Verifying database tables');

  try {
    printColored('Running verification script...', colors.cyan);

    // You can modify this to call your verification script directly
    const output = execSync('node scripts/check-tables.js', {
      stdio: 'pipe',
      encoding: 'utf-8',
    });

    console.log(output);

    printColored('✓ Tables verified successfully!', colors.green);
  } catch (error) {
    printColored(
      'WARNING: Verification failed, but migration might still have succeeded.',
      colors.yellow
    );
    console.error(error.toString());
  }

  printColored('\n╔══════════════════════════════════════════════════╗', colors.green);
  printColored('║              MIGRATION COMPLETED                 ║', colors.green);
  printColored('╚══════════════════════════════════════════════════╝\n', colors.green);
}

// Run the migration
runMigration().catch(error => {
  printColored('\nERROR: Unexpected error occurred:', colors.red);
  console.error(error);
  process.exit(1);
});
