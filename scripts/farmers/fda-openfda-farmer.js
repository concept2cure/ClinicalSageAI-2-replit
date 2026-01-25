#!/usr/bin/env node
/**
 * FDA OpenFDA Data Farmer
 *
 * Harvests regulatory intelligence from FDA's open data APIs:
 * - FAERS (FDA Adverse Event Reporting System)
 * - Drug Labels
 * - 510(k) Device Clearances
 * - PMA Approvals
 * - Drug NDC Directory
 *
 * Part of Project Cortex - Automated Data Harvester
 */

import dotenv from 'dotenv';
import pg from 'pg';
import axios from 'axios';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const BATCH_SIZE = 100;
const API_DELAY_MS = 500; // 0.5 second between requests (well under 240/min limit)
const PROGRESS_FILE = path.join(__dirname, '../cortex_fda_progress.json');

// OpenFDA API Base
const OPENFDA_BASE = 'https://api.fda.gov';

// Database pool
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Color output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function log(emoji, message, color = colors.reset) {
  console.log(`${color}${emoji} ${message}${colors.reset}`);
}

/**
 * Load/save progress tracking
 */
function loadProgress() {
  if (fs.existsSync(PROGRESS_FILE)) {
    return JSON.parse(fs.readFileSync(PROGRESS_FILE, 'utf8'));
  }
  return {
    faers: { lastSkip: 0, totalHarvested: 0 },
    labels: { lastSkip: 0, totalHarvested: 0 },
    devices510k: { lastSkip: 0, totalHarvested: 0 },
    devicesPma: { lastSkip: 0, totalHarvested: 0 },
    lastRun: null,
  };
}

function saveProgress(progress) {
  progress.lastRun = new Date().toISOString();
  fs.writeFileSync(PROGRESS_FILE, JSON.stringify(progress, null, 2));
}

/**
 * Create a data atom in the Cortex
 */
async function createAtom(atomType, sourceId, content, structuredData = {}) {
  const title = structuredData.title || structuredData.name || sourceId;
  const tags = structuredData.tags || [];
  const sourceType = structuredData.source || 'fda_openfda';

  try {
    const existing = await pool.query(
      `SELECT id FROM lumen_data_atoms WHERE source_id = $1 AND atom_type = $2`,
      [sourceId, atomType]
    );

    if (existing.rows.length > 0) {
      await pool.query(
        `
        UPDATE lumen_data_atoms
        SET content = $1, structured_data = $2, tags = $3, updated_at = NOW()
        WHERE id = $4
      `,
        [content, JSON.stringify(structuredData), tags, existing.rows[0].id]
      );
      return existing.rows[0].id;
    }

    const result = await pool.query(
      `
      INSERT INTO lumen_data_atoms
      (id, organization_id, source_type, source_id, atom_type, title, content,
       structured_data, tags, confidence, status, created_at, updated_at)
      VALUES (gen_random_uuid(), 1, $1, $2, $3, $4, $5, $6, $7, 0.9, 'active', NOW(), NOW())
      RETURNING id
    `,
      [sourceType, sourceId, atomType, title, content, JSON.stringify(structuredData), tags]
    );
    return result.rows[0]?.id;
  } catch (error) {
    log('⚠️', `Atom creation error: ${error.message}`, colors.yellow);
    return null;
  }
}

/**
 * Create knowledge graph relationship
 */
async function createGraphEdge(
  entityId,
  entityType,
  entityName,
  relationship,
  relatedId,
  relatedType,
  relatedName
) {
  try {
    await pool.query(
      `
      INSERT INTO rag_knowledge_graph
      (id, organization_id, entity_id, entity_type, entity_name,
       relationship_type, related_entity_id, related_entity_type, related_entity_name,
       confidence, direction, created_at, updated_at)
      VALUES (gen_random_uuid(), 1, $1, $2, $3, $4, $5, $6, $7, 0.85, 'outbound', NOW(), NOW())
      ON CONFLICT DO NOTHING
    `,
      [entityId, entityType, entityName, relationship, relatedId, relatedType, relatedName]
    );
  } catch (error) {
    // Silently fail on edge creation
  }
}

/**
 * Harvest FAERS (Adverse Event Reports)
 */
async function harvestFAERS(skip = 0, limit = BATCH_SIZE) {
  log(
    '💊',
    `Harvesting FDA FAERS adverse events (skip: ${skip}, limit: ${limit})...`,
    colors.magenta
  );

  try {
    const response = await axios.get(`${OPENFDA_BASE}/drug/event.json`, {
      params: {
        search: 'patient.drug.drugindication:*',
        limit,
        skip,
      },
      timeout: 30000,
    });

    const results = response.data?.results || [];
    log('✅', `Retrieved ${results.length} adverse event reports`, colors.green);

    let imported = 0;
    for (const event of results) {
      const safetyReportId = event.safetyreportid;
      if (!safetyReportId) continue;

      const drugs = event.patient?.drug || [];
      const reactions = event.patient?.reaction || [];
      const serious = event.serious;
      const receiveDate = event.receivedate;

      // Create the adverse event atom
      const atomId = await createAtom(
        'adverse_event',
        `FAERS:${safetyReportId}`,
        JSON.stringify({
          report_id: safetyReportId,
          drugs: drugs.map(d => d.medicinalproduct).filter(Boolean),
          reactions: reactions.map(r => r.reactionmeddrapt).filter(Boolean),
          serious,
          receive_date: receiveDate,
          source: 'FDA FAERS',
        }),
        {
          title: `FAERS Report ${safetyReportId}`,
          tags: ['faers', 'adverse_event', 'drug_safety', ...(serious ? ['serious'] : [])],
          source: 'fda_faers',
          drugs: drugs.map(d => d.medicinalproduct).filter(Boolean),
          reactions: reactions.map(r => r.reactionmeddrapt).filter(Boolean),
        }
      );

      if (atomId) {
        imported++;

        // Create drug atoms and link them
        for (const drug of drugs) {
          if (drug.medicinalproduct) {
            const drugAtomId = await createAtom(
              'drug',
              `DRUG:${drug.medicinalproduct}`,
              drug.medicinalproduct,
              {
                name: drug.medicinalproduct,
                indication: drug.drugindication,
              }
            );

            if (drugAtomId) {
              await createGraphEdge(
                `FAERS:${safetyReportId}`,
                'adverse_event',
                `FAERS ${safetyReportId}`,
                'INVOLVES_DRUG',
                `DRUG:${drug.medicinalproduct}`,
                'drug',
                drug.medicinalproduct
              );
            }
          }
        }

        // Create reaction atoms and link them
        for (const reaction of reactions) {
          if (reaction.reactionmeddrapt) {
            const reactionAtomId = await createAtom(
              'adverse_reaction',
              `REACTION:${reaction.reactionmeddrapt}`,
              reaction.reactionmeddrapt,
              {
                name: reaction.reactionmeddrapt,
                outcome: reaction.reactionoutcome,
              }
            );

            if (reactionAtomId) {
              await createGraphEdge(
                `FAERS:${safetyReportId}`,
                'adverse_event',
                `FAERS ${safetyReportId}`,
                'CAUSED_REACTION',
                `REACTION:${reaction.reactionmeddrapt}`,
                'adverse_reaction',
                reaction.reactionmeddrapt
              );
            }
          }
        }
      }
    }

    return { imported, total: results.length };
  } catch (error) {
    log('❌', `FAERS API error: ${error.message}`, colors.red);
    return { imported: 0, total: 0, error: error.message };
  }
}

/**
 * Harvest Drug Labels
 */
async function harvestDrugLabels(skip = 0, limit = BATCH_SIZE) {
  log('📋', `Harvesting FDA drug labels (skip: ${skip}, limit: ${limit})...`, colors.cyan);

  try {
    const response = await axios.get(`${OPENFDA_BASE}/drug/label.json`, {
      params: {
        search: 'openfda.brand_name:*',
        limit,
        skip,
      },
      timeout: 30000,
    });

    const results = response.data?.results || [];
    log('✅', `Retrieved ${results.length} drug labels`, colors.green);

    let imported = 0;
    for (const label of results) {
      const setId = label.set_id || label.id;
      if (!setId) continue;

      const brandNames = label.openfda?.brand_name || [];
      const genericNames = label.openfda?.generic_name || [];
      const manufacturer = label.openfda?.manufacturer_name?.[0];
      const indications = label.indications_and_usage?.[0];
      const warnings = label.warnings?.[0];
      const contraindications = label.contraindications?.[0];

      const primaryName = brandNames[0] || genericNames[0] || setId;

      const atomId = await createAtom(
        'drug_label',
        `LABEL:${setId}`,
        JSON.stringify({
          set_id: setId,
          brand_names: brandNames,
          generic_names: genericNames,
          manufacturer,
          indications: indications?.substring(0, 1000),
          warnings: warnings?.substring(0, 1000),
          contraindications: contraindications?.substring(0, 500),
          source: 'FDA Drug Labels',
        }),
        {
          title: `${primaryName} Label`,
          tags: ['drug_label', 'fda', ...brandNames.slice(0, 3)],
          source: 'fda_labels',
          brand_names: brandNames,
          generic_names: genericNames,
          manufacturer,
        }
      );

      if (atomId) {
        imported++;

        // Link to manufacturer
        if (manufacturer) {
          await createGraphEdge(
            `LABEL:${setId}`,
            'drug_label',
            primaryName,
            'MANUFACTURED_BY',
            `ORG:${manufacturer}`,
            'organization',
            manufacturer
          );
        }
      }
    }

    return { imported, total: results.length };
  } catch (error) {
    log('❌', `Drug Labels API error: ${error.message}`, colors.red);
    return { imported: 0, total: 0, error: error.message };
  }
}

/**
 * Harvest 510(k) Device Clearances
 */
async function harvest510k(skip = 0, limit = BATCH_SIZE) {
  log('🏥', `Harvesting FDA 510(k) clearances (skip: ${skip}, limit: ${limit})...`, colors.blue);

  try {
    const response = await axios.get(`${OPENFDA_BASE}/device/510k.json`, {
      params: {
        search: 'decision_description:*',
        limit,
        skip,
      },
      timeout: 30000,
    });

    const results = response.data?.results || [];
    log('✅', `Retrieved ${results.length} 510(k) clearances`, colors.green);

    let imported = 0;
    for (const clearance of results) {
      const kNumber = clearance.k_number;
      if (!kNumber) continue;

      const deviceName = clearance.device_name;
      const applicant = clearance.applicant;
      const decision = clearance.decision_description;
      const decisionDate = clearance.decision_date;
      const productCode = clearance.product_code;
      const regulatoryClass = clearance.clearance_type;

      const atomId = await createAtom(
        'device_510k',
        `510K:${kNumber}`,
        JSON.stringify({
          k_number: kNumber,
          device_name: deviceName,
          applicant,
          decision,
          decision_date: decisionDate,
          product_code: productCode,
          regulatory_class: regulatoryClass,
          source: 'FDA 510(k)',
        }),
        {
          title: `510(k) ${kNumber}: ${deviceName}`,
          tags: ['510k', 'medical_device', 'fda_clearance', productCode].filter(Boolean),
          source: 'fda_510k',
          device_name: deviceName,
          applicant,
          decision,
        }
      );

      if (atomId) {
        imported++;

        // Link to applicant organization
        if (applicant) {
          await createGraphEdge(
            `510K:${kNumber}`,
            'device_510k',
            `510(k) ${kNumber}`,
            'SUBMITTED_BY',
            `ORG:${applicant}`,
            'organization',
            applicant
          );
        }
      }
    }

    return { imported, total: results.length };
  } catch (error) {
    log('❌', `510(k) API error: ${error.message}`, colors.red);
    return { imported: 0, total: 0, error: error.message };
  }
}

/**
 * Harvest PMA Approvals
 */
async function harvestPMA(skip = 0, limit = BATCH_SIZE) {
  log('🔬', `Harvesting FDA PMA approvals (skip: ${skip}, limit: ${limit})...`, colors.yellow);

  try {
    const response = await axios.get(`${OPENFDA_BASE}/device/pma.json`, {
      params: {
        search: 'decision_description:*',
        limit,
        skip,
      },
      timeout: 30000,
    });

    const results = response.data?.results || [];
    log('✅', `Retrieved ${results.length} PMA approvals`, colors.green);

    let imported = 0;
    for (const approval of results) {
      const pmaNumber = approval.pma_number;
      if (!pmaNumber) continue;

      const deviceName = approval.trade_name || approval.generic_name;
      const applicant = approval.applicant;
      const decision = approval.decision_code;
      const decisionDate = approval.decision_date;
      const productCode = approval.product_code;

      const atomId = await createAtom(
        'device_pma',
        `PMA:${pmaNumber}`,
        JSON.stringify({
          pma_number: pmaNumber,
          device_name: deviceName,
          applicant,
          decision,
          decision_date: decisionDate,
          product_code: productCode,
          source: 'FDA PMA',
        }),
        {
          title: `PMA ${pmaNumber}: ${deviceName}`,
          tags: ['pma', 'medical_device', 'fda_approval', productCode].filter(Boolean),
          source: 'fda_pma',
          device_name: deviceName,
          applicant,
          decision,
        }
      );

      if (atomId) {
        imported++;

        if (applicant) {
          await createGraphEdge(
            `PMA:${pmaNumber}`,
            'device_pma',
            `PMA ${pmaNumber}`,
            'SUBMITTED_BY',
            `ORG:${applicant}`,
            'organization',
            applicant
          );
        }
      }
    }

    return { imported, total: results.length };
  } catch (error) {
    log('❌', `PMA API error: ${error.message}`, colors.red);
    return { imported: 0, total: 0, error: error.message };
  }
}

/**
 * Get current Cortex stats
 */
async function getCortexStats() {
  try {
    const atomCount = await pool.query(`SELECT COUNT(*) as count FROM lumen_data_atoms`);
    const graphCount = await pool.query(`SELECT COUNT(*) as count FROM rag_knowledge_graph`);
    return {
      atoms: parseInt(atomCount.rows[0]?.count || 0),
      edges: parseInt(graphCount.rows[0]?.count || 0),
    };
  } catch (error) {
    return { atoms: 0, edges: 0 };
  }
}

/**
 * Main harvesting function
 */
async function runFDAHarvest() {
  console.log('\n' + '═'.repeat(60));
  log('🏛️', '\x1b[1mFDA OPENFDA DATA FARMER\x1b[0m', colors.magenta);
  console.log('═'.repeat(60) + '\n');

  // Verify database connection
  try {
    const result = await pool.query('SELECT current_database() as db');
    log('🔗', `Connected to database: ${result.rows[0].db}`, colors.green);
  } catch (error) {
    log('❌', `Database connection failed: ${error.message}`, colors.red);
    process.exit(1);
  }

  const progress = loadProgress();
  const initialStats = await getCortexStats();
  log(
    '📈',
    `Current Cortex: ${initialStats.atoms} atoms, ${initialStats.edges} edges`,
    colors.blue
  );

  console.log('\n' + '-'.repeat(40));

  // Harvest FAERS
  const faersResult = await harvestFAERS(progress.faers.lastSkip);
  progress.faers.lastSkip += faersResult.total;
  progress.faers.totalHarvested += faersResult.imported;

  await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
  console.log('-'.repeat(40));

  // Harvest Drug Labels
  const labelsResult = await harvestDrugLabels(progress.labels.lastSkip);
  progress.labels.lastSkip += labelsResult.total;
  progress.labels.totalHarvested += labelsResult.imported;

  await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
  console.log('-'.repeat(40));

  // Harvest 510(k)
  const k510Result = await harvest510k(progress.devices510k.lastSkip);
  progress.devices510k.lastSkip += k510Result.total;
  progress.devices510k.totalHarvested += k510Result.imported;

  await new Promise(resolve => setTimeout(resolve, API_DELAY_MS));
  console.log('-'.repeat(40));

  // Harvest PMA
  const pmaResult = await harvestPMA(progress.devicesPma.lastSkip);
  progress.devicesPma.lastSkip += pmaResult.total;
  progress.devicesPma.totalHarvested += pmaResult.imported;

  // Final stats
  const finalStats = await getCortexStats();
  saveProgress(progress);

  // Summary
  console.log('\n' + '═'.repeat(60));
  log('✅', '\x1b[1mFDA HARVEST COMPLETE\x1b[0m', colors.green);
  console.log('═'.repeat(60));
  console.log(`
  📊 Session Results:
     • FAERS Events:    +${faersResult.imported} reports
     • Drug Labels:     +${labelsResult.imported} labels
     • 510(k) Devices:  +${k510Result.imported} clearances
     • PMA Approvals:   +${pmaResult.imported} approvals

  🧠 Cortex Prime Status:
     • Total Atoms: ${finalStats.atoms} (+${finalStats.atoms - initialStats.atoms})
     • Total Edges: ${finalStats.edges} (+${finalStats.edges - initialStats.edges})

  📈 Cumulative Progress:
     • FAERS: ${progress.faers.totalHarvested} (skip: ${progress.faers.lastSkip})
     • Labels: ${progress.labels.totalHarvested} (skip: ${progress.labels.lastSkip})
     • 510(k): ${progress.devices510k.totalHarvested} (skip: ${progress.devices510k.lastSkip})
     • PMA: ${progress.devicesPma.totalHarvested} (skip: ${progress.devicesPma.lastSkip})
  `);

  await pool.end();
}

// Run
runFDAHarvest().catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
