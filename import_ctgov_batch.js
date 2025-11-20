/**
 * Import ClinicalTrials.gov XML batch
 *
 * This script processes a batch of ClinicalTrials.gov XML files from the attached_assets directory
 * and imports them into the database.
 */

import fs from 'fs';
import path from 'path';
import pg from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { Pool } = pg;

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// Constants
const ASSETS_DIR = path.join('.', 'attached_assets');
const BATCH_SIZE = 50;

// Simple XML parsing function for a specific tag
function extractTag(xmlContent, tagName) {
  const regex = new RegExp(`<${tagName}[^>]*>([\\s\\S]*?)<\\/${tagName}>`, 'g');
  const matches = [];
  let match;

  while ((match = regex.exec(xmlContent)) !== null) {
    matches.push(match[1].trim());
  }

  return matches.length ? matches : null;
}

// Process an XML file
async function processXmlFile(filePath) {
  try {
    const fileContent = fs.readFileSync(filePath, 'utf8');

    // Extract key data using regex
    const nctId = path.basename(filePath, '.xml');

    // Extract title
    const briefTitles = extractTag(fileContent, 'brief_title');
    const officialTitles = extractTag(fileContent, 'official_title');
    const title =
      (briefTitles && briefTitles[0]) || (officialTitles && officialTitles[0]) || 'Unknown Title';

    // Extract sponsor
    const sponsorTags = extractTag(fileContent, 'agency');
    const sponsor = sponsorTags && sponsorTags.length > 0 ? sponsorTags[0] : null;

    // Extract phase
    const phaseTags = extractTag(fileContent, 'phase');
    const phase = phaseTags && phaseTags.length > 0 ? phaseTags[0] : null;

    // Extract condition
    const conditionTags = extractTag(fileContent, 'condition');
    const condition = conditionTags && conditionTags.length > 0 ? conditionTags[0] : null;

    // Extract eligibility criteria
    const criteriaText = extractTag(fileContent, 'criteria');
    const inclusionCriteria = [];
    const exclusionCriteria = [];

    if (criteriaText && criteriaText.length > 0) {
      const lines = criteriaText[0].split('\n').filter(line => line.trim().length > 0);

      let includeSection = false;
      let excludeSection = false;

      for (const line of lines) {
        const trimmedLine = line.trim();

        if (trimmedLine.toLowerCase().includes('inclusion criteria')) {
          includeSection = true;
          excludeSection = false;
          continue;
        } else if (trimmedLine.toLowerCase().includes('exclusion criteria')) {
          includeSection = false;
          excludeSection = true;
          continue;
        }

        if (includeSection) {
          inclusionCriteria.push(trimmedLine);
        } else if (excludeSection) {
          exclusionCriteria.push(trimmedLine);
        }
      }
    }

    // Extract study design
    const designTags = extractTag(fileContent, 'study_design_info');
    let studyDesign = null;
    if (designTags && designTags.length > 0) {
      const designInfo = designTags[0];
      const designMatch = /<design>(.*?)<\/design>/i.exec(designInfo);
      studyDesign = designMatch ? designMatch[1] : null;
    }

    // Extract primary outcome
    const outcomeTags = extractTag(fileContent, 'primary_outcome');
    let primaryObjective = null;
    const endpoints = [];

    if (outcomeTags && outcomeTags.length > 0) {
      // Use the first outcome as the primary objective
      const firstOutcome = outcomeTags[0];
      const measureMatch = /<measure>(.*?)<\/measure>/i.exec(firstOutcome);
      primaryObjective = measureMatch ? measureMatch[1] : null;

      // Extract all outcomes as endpoints
      for (const outcome of outcomeTags) {
        const measureMatch = /<measure>(.*?)<\/measure>/i.exec(outcome);
        if (measureMatch) {
          endpoints.push(measureMatch[1]);
        }
      }
    }

    // Extract study description
    const detailedDescTags = extractTag(fileContent, 'detailed_description');
    const briefSummaryTags = extractTag(fileContent, 'brief_summary');
    const studyDescription =
      (detailedDescTags && detailedDescTags[0]) ||
      (briefSummaryTags && briefSummaryTags[0]) ||
      null;

    // Extract arms
    const armTags = extractTag(fileContent, 'arm_group');
    const arms = [];

    if (armTags && armTags.length > 0) {
      for (const arm of armTags) {
        const labelMatch = /<arm_group_label>(.*?)<\/arm_group_label>/i.exec(arm);
        if (labelMatch) {
          arms.push(labelMatch[1]);
        }
      }
    }

    // Format for database
    const reportData = {
      title,
      sponsor,
      indication: condition,
      phase,
      fileName: path.basename(filePath),
      fileSize: fs.statSync(filePath).size,
      uploadDate: new Date(),
      summary: `${title}. Phase: ${phase || 'Unknown'}, Sponsor: ${sponsor || 'Unknown'}`,
      region: 'ClinicalTrials.gov',
      nctrial_id: nctId, // Use underscore format as per database schema
    };

    // Return the structured data
    return {
      report: reportData,
      details: {
        studyDesign,
        primaryObjective,
        studyDescription,
        inclusionCriteria,
        exclusionCriteria,
        arms,
        endpoints,
        processingStatus: 'completed',
      },
    };
  } catch (error) {
    console.error(`Error processing ${filePath}:`, error);
    return null;
  }
}

// Insert data into database
async function insertTrialData(client, processedData) {
  try {
    // Insert report
    const reportResult = await client.query(
      `INSERT INTO csr_reports(
        title, sponsor, indication, phase, "fileName", "fileSize", 
        "uploadDate", summary, region, "nctrial_id"
      ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
      ON CONFLICT ("nctrial_id") DO NOTHING
      RETURNING id`,
      [
        processedData.report.title,
        processedData.report.sponsor,
        processedData.report.indication,
        processedData.report.phase,
        processedData.report.fileName,
        processedData.report.fileSize,
        processedData.report.uploadDate,
        processedData.report.summary,
        processedData.report.region,
        processedData.report.nctrial_id,
      ]
    );

    // If report inserted successfully
    if (reportResult.rows.length > 0) {
      const reportId = reportResult.rows[0].id;

      // Insert details
      await client.query(
        `INSERT INTO csr_details(
          "reportId", "studyDesign", "primaryObjective", "studyDescription",
          "inclusionCriteria", "exclusionCriteria", arms, endpoints, "processingStatus"
        ) VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [
          reportId,
          processedData.details.studyDesign,
          processedData.details.primaryObjective,
          processedData.details.studyDescription,
          processedData.details.inclusionCriteria,
          processedData.details.exclusionCriteria,
          processedData.details.arms,
          processedData.details.endpoints,
          processedData.details.processingStatus,
        ]
      );

      return reportId;
    } else {
      console.log(`Trial ${processedData.report.nctrial_id} already exists in database, skipping`);
      return null;
    }
  } catch (error) {
    console.error('Error inserting trial data:', error);
    return null;
  }
}

// Get a batch of XML files to process
async function getXmlBatch() {
  try {
    const files = fs.readdirSync(ASSETS_DIR);
    const xmlFiles = files
      .filter(file => file.endsWith('.xml') && file.startsWith('NCT'))
      .map(file => path.join(ASSETS_DIR, file))
      .slice(0, BATCH_SIZE);

    return xmlFiles;
  } catch (error) {
    console.error('Error getting XML files:', error);
    return [];
  }
}

// Run the batch import
async function runBatchImport() {
  console.log('=== Starting Import of ClinicalTrials.gov XML Files ===');
  console.log('Timestamp:', new Date().toISOString());

  const client = await pool.connect();
  try {
    // Get XML files to process
    const xmlFiles = await getXmlBatch();
    console.log(`Found ${xmlFiles.length} XML files to process`);

    // Process each file
    let successCount = 0;
    let skipCount = 0;
    let errorCount = 0;

    for (const filePath of xmlFiles) {
      console.log(`Processing ${path.basename(filePath)}...`);
      const processedData = await processXmlFile(filePath);

      if (processedData) {
        // Check if trial already exists in database
        const checkResult = await client.query(
          `SELECT id FROM csr_reports WHERE "nctrial_id" = $1`,
          [processedData.report.nctrial_id]
        );

        if (checkResult.rows.length > 0) {
          console.log(
            `Trial ${processedData.report.nctrial_id} already exists in database, skipping`
          );
          skipCount++;
          continue;
        }

        // Insert data in transaction
        try {
          await client.query('BEGIN');
          const reportId = await insertTrialData(client, processedData);

          if (reportId) {
            await client.query('COMMIT');
            console.log(`Successfully imported trial ${processedData.report.nctrial_id}`);
            successCount++;
          } else {
            await client.query('ROLLBACK');
            console.error(`Failed to import trial ${processedData.report.nctrial_id}`);
            errorCount++;
          }
        } catch (error) {
          await client.query('ROLLBACK');
          console.error(`Transaction failed for ${processedData.report.nctrial_id}:`, error);
          errorCount++;
        }
      } else {
        console.error(`Failed to process ${path.basename(filePath)}`);
        errorCount++;
      }
    }

    // Summary
    console.log('\n=== Import Summary ===');
    console.log(`Total studies processed: ${xmlFiles.length}`);
    console.log(`Successfully imported: ${successCount}`);
    console.log(`Skipped (already exists): ${skipCount}`);
    console.log(`Failed imports: ${errorCount}`);
  } catch (error) {
    console.error('Error during batch import:', error);
  } finally {
    client.release();
    await pool.end();
  }
}

// Run the import
runBatchImport().catch(err => {
  console.error('Fatal error during import:', err);
  process.exit(1);
});
