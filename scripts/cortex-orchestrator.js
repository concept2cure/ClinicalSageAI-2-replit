#!/usr/bin/env node
/**
 * Project Cortex: Master Orchestrator
 *
 * Coordinates all data farmer microservices to continuously harvest
 * regulatory intelligence from multiple sources into the Lumen Cortex.
 *
 * Architecture: "Fleet of Data Farmers"
 * - ClinicalTrials.gov Farmer
 * - FDA OpenFDA Farmer
 * - PubMed/NCBI Farmer
 * - Health Canada Farmer
 * - SEC EDGAR Farmer (coming soon)
 * - EMA Farmer (coming soon)
 *
 * Runs on configurable schedule, manages job queue, tracks progress.
 */

import dotenv from 'dotenv';
import pg from 'pg';
import cron from 'node-cron';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const ORCHESTRATOR_STATE_FILE = path.join(__dirname, 'cortex_orchestrator_state.json');
const RUN_INTERVAL_MINUTES = 30; // Run harvest cycle every 30 minutes
const FARMER_TIMEOUT_MS = 5 * 60 * 1000; // 5 minute timeout per farmer

// Available farmers
const FARMERS = [
  {
    name: 'ClinicalTrials.gov',
    script: path.join(__dirname, 'lumen-cortex-harvester.js'),
    icon: '🏥',
    enabled: true,
    priority: 1,
  },
  {
    name: 'FDA OpenFDA',
    script: path.join(__dirname, 'farmers/fda-openfda-farmer.js'),
    icon: '💊',
    enabled: true,
    priority: 2,
  },
  {
    name: 'PubMed/NCBI',
    script: path.join(__dirname, 'farmers/pubmed-farmer.js'),
    icon: '📚',
    enabled: true,
    priority: 3,
  },
];

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Color output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(emoji, message, color = colors.reset) {
  const timestamp = new Date().toISOString().slice(11, 19);
  console.log(
    `${colors.dim}[${timestamp}]${colors.reset} ${color}${emoji} ${message}${colors.reset}`
  );
}

/**
 * Load/save orchestrator state
 */
function loadState() {
  if (fs.existsSync(ORCHESTRATOR_STATE_FILE)) {
    return JSON.parse(fs.readFileSync(ORCHESTRATOR_STATE_FILE, 'utf8'));
  }
  return {
    cycleCount: 0,
    totalAtomsHarvested: 0,
    farmerStats: {},
    lastCycleStart: null,
    lastCycleEnd: null,
    errors: [],
  };
}

function saveState(state) {
  fs.writeFileSync(ORCHESTRATOR_STATE_FILE, JSON.stringify(state, null, 2));
}

/**
 * Get current Cortex statistics
 */
async function getCortexStats() {
  try {
    const atomCount = await pool.query(`SELECT COUNT(*) as count FROM lumen_data_atoms`);
    const graphCount = await pool.query(`SELECT COUNT(*) as count FROM rag_knowledge_graph`);
    const atomTypes = await pool.query(`
      SELECT atom_type, COUNT(*) as count
      FROM lumen_data_atoms
      GROUP BY atom_type
      ORDER BY count DESC
      LIMIT 10
    `);

    return {
      totalAtoms: parseInt(atomCount.rows[0]?.count || 0),
      totalEdges: parseInt(graphCount.rows[0]?.count || 0),
      byType: atomTypes.rows,
    };
  } catch (error) {
    return { totalAtoms: 0, totalEdges: 0, byType: [], error: error.message };
  }
}

/**
 * Run a farmer script and capture output
 */
function runFarmer(farmer) {
  return new Promise((resolve, reject) => {
    log(farmer.icon, `Starting ${farmer.name} farmer...`, colors.cyan);

    const startTime = Date.now();
    const child = spawn('node', [farmer.script], {
      cwd: process.cwd(),
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', data => {
      stdout += data.toString();
      // Stream output in real-time
      process.stdout.write(data);
    });

    child.stderr.on('data', data => {
      stderr += data.toString();
      process.stderr.write(data);
    });

    // Timeout handler
    const timeout = setTimeout(() => {
      child.kill('SIGTERM');
      reject(new Error(`${farmer.name} timed out after ${FARMER_TIMEOUT_MS / 1000}s`));
    }, FARMER_TIMEOUT_MS);

    child.on('close', code => {
      clearTimeout(timeout);
      const duration = ((Date.now() - startTime) / 1000).toFixed(1);

      if (code === 0) {
        log('✅', `${farmer.name} completed in ${duration}s`, colors.green);
        resolve({ success: true, duration, stdout, stderr });
      } else {
        log('⚠️', `${farmer.name} exited with code ${code}`, colors.yellow);
        resolve({ success: false, code, duration, stdout, stderr });
      }
    });

    child.on('error', error => {
      clearTimeout(timeout);
      reject(error);
    });
  });
}

/**
 * Run a complete harvest cycle
 */
async function runHarvestCycle(state) {
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log(
    '║' +
      ' '.repeat(12) +
      `${colors.bright}PROJECT CORTEX HARVEST CYCLE${colors.reset}` +
      ' '.repeat(18) +
      '║'
  );
  console.log('║' + ' '.repeat(20) + `Cycle #${state.cycleCount + 1}` + ' '.repeat(29) + '║');
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log();

  state.lastCycleStart = new Date().toISOString();
  const cycleStartStats = await getCortexStats();

  log(
    '📊',
    `Cortex Status: ${cycleStartStats.totalAtoms} atoms, ${cycleStartStats.totalEdges} edges`,
    colors.blue
  );
  console.log();

  // Sort farmers by priority
  const enabledFarmers = FARMERS.filter(f => f.enabled).sort((a, b) => a.priority - b.priority);

  for (const farmer of enabledFarmers) {
    try {
      // Check if script exists
      if (!fs.existsSync(farmer.script)) {
        log('⚠️', `${farmer.name} script not found: ${farmer.script}`, colors.yellow);
        continue;
      }

      console.log('\n' + '─'.repeat(50));
      const result = await runFarmer(farmer);

      // Update farmer stats
      if (!state.farmerStats[farmer.name]) {
        state.farmerStats[farmer.name] = { runs: 0, successes: 0, failures: 0, totalDuration: 0 };
      }
      state.farmerStats[farmer.name].runs++;
      state.farmerStats[farmer.name].totalDuration += parseFloat(result.duration);

      if (result.success) {
        state.farmerStats[farmer.name].successes++;
      } else {
        state.farmerStats[farmer.name].failures++;
      }
    } catch (error) {
      log('❌', `${farmer.name} error: ${error.message}`, colors.red);
      state.errors.push({
        farmer: farmer.name,
        error: error.message,
        timestamp: new Date().toISOString(),
      });
      // Keep only last 50 errors
      if (state.errors.length > 50) {
        state.errors = state.errors.slice(-50);
      }
    }

    // Small delay between farmers
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Cycle complete
  console.log('\n' + '─'.repeat(50));
  const cycleEndStats = await getCortexStats();
  state.lastCycleEnd = new Date().toISOString();
  state.cycleCount++;

  const atomsAdded = cycleEndStats.totalAtoms - cycleStartStats.totalAtoms;
  const edgesAdded = cycleEndStats.totalEdges - cycleStartStats.totalEdges;
  state.totalAtomsHarvested += atomsAdded;

  // Summary
  console.log('\n');
  console.log('╔' + '═'.repeat(58) + '╗');
  console.log(
    '║' + ' '.repeat(15) + `${colors.green}CYCLE COMPLETE${colors.reset}` + ' '.repeat(29) + '║'
  );
  console.log('╚' + '═'.repeat(58) + '╝');
  console.log(`
  ${colors.bright}📊 Cycle Results:${colors.reset}
     • Atoms Added:  +${atomsAdded}
     • Edges Added:  +${edgesAdded}
     • Total Atoms:  ${cycleEndStats.totalAtoms}
     • Total Edges:  ${cycleEndStats.totalEdges}

  ${colors.bright}🧠 Knowledge by Type:${colors.reset}`);

  cycleEndStats.byType.forEach(row => {
    console.log(`     • ${row.atom_type}: ${row.count}`);
  });

  console.log(`
  ${colors.bright}📈 Lifetime Stats:${colors.reset}
     • Cycles Run:    ${state.cycleCount}
     • Total Atoms:   ${state.totalAtomsHarvested}
     • Active Errors: ${state.errors.length}

  ${colors.dim}Next cycle in ${RUN_INTERVAL_MINUTES} minutes...${colors.reset}
  `);

  saveState(state);
}

/**
 * Main entry point
 */
async function main() {
  // Display banner
  console.log(`
╔════════════════════════════════════════════════════════════╗
║                                                            ║
║     🧠  ${colors.bright}PROJECT CORTEX${colors.reset}  🧠                              ║
║     ${colors.cyan}Automated Data Harvester Orchestrator${colors.reset}                ║
║                                                            ║
║     "A fleet of data farmers working constantly"           ║
║                                                            ║
╚════════════════════════════════════════════════════════════╝
  `);

  // Verify database connection
  try {
    const result = await pool.query('SELECT current_database() as db, NOW() as time');
    log('🔗', `Connected to database: ${result.rows[0].db}`, colors.green);
  } catch (error) {
    log('❌', `Database connection failed: ${error.message}`, colors.red);
    process.exit(1);
  }

  // Load state
  const state = loadState();
  log('📂', `Loaded state: ${state.cycleCount} previous cycles`, colors.blue);

  // List enabled farmers
  const enabledFarmers = FARMERS.filter(f => f.enabled);
  log('🚜', `Active farmers (${enabledFarmers.length}):`, colors.magenta);
  enabledFarmers.forEach(f => {
    const exists = fs.existsSync(f.script) ? '✓' : '✗';
    console.log(`   ${f.icon} ${f.name} [${exists}]`);
  });

  // Run initial cycle immediately
  log('🚀', `Starting initial harvest cycle...`, colors.cyan);
  await runHarvestCycle(state);

  // Schedule recurring cycles
  const cronSchedule = `*/${RUN_INTERVAL_MINUTES} * * * *`;
  log('⏰', `Scheduling recurring cycles: every ${RUN_INTERVAL_MINUTES} minutes`, colors.blue);

  cron.schedule(cronSchedule, async () => {
    log('⏰', `Scheduled harvest cycle triggered`, colors.cyan);
    await runHarvestCycle(state);
  });

  // Keep process running
  log('👀', `Orchestrator running. Press Ctrl+C to stop.`, colors.green);
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  log('👋', `Shutting down orchestrator...`, colors.yellow);
  await pool.end();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  log('👋', `Received SIGTERM, shutting down...`, colors.yellow);
  await pool.end();
  process.exit(0);
});

// Run
main().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
