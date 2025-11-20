#!/usr/bin/env node

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;

// Get current directory name (equivalent to __dirname in CommonJS)
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * This utility script runs the data fetcher python script and imports the data
 * into the database directly, bypassing the need for the API endpoint.
 */

// Step 1: Run the Python fetcher script
async function fetchData(maxRecords = 20) {
  console.log(`Fetching ${maxRecords} clinical trial records...`);

  return new Promise((resolve, reject) => {
    const scriptPath = path.join(__dirname, 'fetch_trials_v2_api.py');
    const pythonProcess = spawn('python', [scriptPath, '--max-records', maxRecords.toString()]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', data => {
      const chunk = data.toString();
      console.log(chunk);
      output += chunk;
    });

    pythonProcess.stderr.on('data', data => {
      const chunk = data.toString();
      console.error(chunk);
      errorOutput += chunk;
    });

    pythonProcess.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Python script exited with code ${code}: ${errorOutput}`));
      }

      // Parse the output to find the generated file path
      const fileMatch = output.match(/Data saved to (.+\.json)/);

      if (fileMatch) {
        const filePath = fileMatch[1];
        console.log(`Data fetched successfully and saved to ${filePath}`);

        // Get the full path to the file (the Python script uses a relative path)
        const fullPath = path.join(__dirname, filePath.replace('./', ''));
        resolve(fullPath);
      } else {
        reject(new Error('Could not find output file path in script output'));
      }
    });
  });
}

/**
 * Import the data directly into the database
 */
async function importData(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Data file not found: ${filePath}`);
  }

  console.log(`Importing data from ${filePath}...`);

  // Read the file
  const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  if (!data || !data.studies || !Array.length) {
    throw new Error('Invalid data format in file');
  }

  console.log(`Loaded ${data.studies.length} studies from file`);

  // Now process this data for database import
  // We'll use the database directly to import the data

  // First we need to set up the database connection
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL environment variable is not set');
  }

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  // Import each study
  let importCount = 0;
  let updateCount = 0;
  let errorCount = 0;

  for (const study of data.studies) {
    try {
      // Extract data from the study
      const protocolSection = study.protocolSection || {};
      const identification = protocolSection.identificationModule || {};
      const statusModule = protocolSection.statusModule || {};
      const sponsorModule = protocolSection.sponsorCollaboratorsModule || {};
      const conditions = protocolSection.conditionsModule || {};
      const design = protocolSection.designModule || {};

      // Get basic data
      const title = identification?.briefTitle || identification?.officialTitle || 'Untitled Study';
      const sponsor = sponsorModule?.leadSponsor?.name || 'Unknown';
      const indication = conditions?.conditions?.[0] || 'Unknown';
      const phase = design?.phases?.[0] || 'Unknown';
      const nctId = identification?.nctId || null;
      const status = statusModule?.overallStatus || 'Unknown';
      const completionDate = statusModule?.completionDateStruct?.date || null;

      // Check if study already exists
      const existingResult = await pool.query('SELECT id FROM csr_reports WHERE nctrial_id = $1', [
        nctId,
      ]);

      let reportId;

      if (existingResult.rows.length > 0) {
        // Update existing record
        reportId = existingResult.rows[0].id;
        await pool.query(
          `UPDATE csr_reports SET 
            title = $1, 
            sponsor = $2, 
            indication = $3, 
            phase = $4, 
            status = $5, 
            date = $6
          WHERE id = $7`,
          [title, sponsor, indication, phase, status, completionDate, reportId]
        );
        updateCount++;
        console.log(`Updated existing report: ${title} (ID: ${reportId})`);
      } else {
        // Insert new record
        const fileName = `${nctId || 'unknown'}.pdf`;
        const result = await pool.query(
          `INSERT INTO csr_reports (
            title, sponsor, indication, phase, status, date, nctrial_id, study_id, file_name, file_size
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING id`,
          [title, sponsor, indication, phase, status, completionDate, nctId, nctId, fileName, 0]
        );

        reportId = result.rows[0].id;
        importCount++;
        console.log(`Inserted new report: ${title} (ID: ${reportId})`);
      }

      // Check if details exist for this report
      const detailsExist = await pool.query('SELECT id FROM csr_details WHERE report_id = $1', [
        reportId,
      ]);

      if (detailsExist.rows.length === 0) {
        // Extract more detailed data
        const eligibility = protocolSection.eligibilityModule || {};
        const description = protocolSection.descriptionModule || {};
        const arms = protocolSection.armsInterventionsModule || {};
        const outcomes = protocolSection.outcomesModule || {};

        // Study design
        const studyDesign = [
          design?.studyType,
          design?.phases?.[0],
          design?.designInfo?.allocation,
          design?.designInfo?.interventionModel,
          design?.designInfo?.primaryPurpose,
          design?.designInfo?.maskingInfo?.masking,
        ]
          .filter(Boolean)
          .join(', ');

        // Primary objective and description
        const primaryObjective = description?.briefSummary || null;
        const studyDescription = description?.detailedDescription || null;

        // Inclusion and exclusion criteria
        const inclusionCriteria = eligibility?.inclusionCriteria || null;
        const exclusionCriteria = eligibility?.exclusionCriteria || null;

        // Treatment arms
        const treatmentArms = arms?.armGroups
          ? JSON.stringify(
              arms.armGroups.map(arm => ({
                name: arm.armGroupLabel || 'Unknown',
                description: arm.armGroupDescription || '',
                type: arm.armGroupType || 'Experimental',
                interventions: arm.armGroupInterventionList || [],
              }))
            )
          : '[]';

        // Study duration
        const studyDuration = design?.designInfo?.description || null;

        // Endpoints
        const endpoints = {
          primary: outcomes?.primaryOutcomes?.[0]?.measure || null,
          secondary: outcomes?.secondaryOutcomes?.map(o => o.measure).filter(Boolean) || [],
        };

        // Age range
        const ageRange =
          eligibility?.minimumAge && eligibility?.maximumAge
            ? `${eligibility.minimumAge} - ${eligibility.maximumAge}`
            : null;

        // Sample size estimate
        const sampleSize = Number(eligibility?.maximumEnrollment) || null;

        // Gender eligibility
        const genderDistribution = {
          male: eligibility?.sex?.includes('Male') || false,
          female: eligibility?.sex?.includes('Female') || false,
          unknown: !eligibility?.sex || eligibility?.sex === 'All',
        };

        // Insert details
        await pool.query(
          `INSERT INTO csr_details (
            report_id, study_design, primary_objective, study_description, 
            inclusion_criteria, exclusion_criteria, treatment_arms, 
            study_duration, endpoints, results, safety, processed, 
            processing_status, sample_size, age_range, gender_distribution
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
          )`,
          [
            reportId,
            studyDesign,
            primaryObjective,
            studyDescription,
            inclusionCriteria,
            exclusionCriteria,
            treatmentArms,
            studyDuration,
            JSON.stringify(endpoints),
            '{}',
            '{}',
            true,
            'imported_from_api_v2',
            sampleSize,
            ageRange,
            JSON.stringify(genderDistribution),
          ]
        );

        console.log(`Added details for report ID ${reportId}`);
      } else {
        console.log(`Details already exist for report ID ${reportId}`);
      }
    } catch (error) {
      console.error(`Error processing study:`, error);
      errorCount++;
    }
  }

  console.log(
    `Import completed: ${importCount} new records, ${updateCount} updated, ${errorCount} errors`
  );
  return { importCount, updateCount, errorCount };
}

// Main function
async function main() {
  try {
    // Default to 20 records, can be changed with command line argument
    const maxRecords = process.argv[2] ? parseInt(process.argv[2]) : 20;

    // First fetch the data
    const dataFile = await fetchData(maxRecords);

    // Then import it
    const result = await importData(dataFile);

    console.log('Data import complete!');
    console.log(`Imported ${result.importCount} new records`);
    console.log(`Updated ${result.updateCount} existing records`);
    console.log(`Encountered ${result.errorCount} errors`);

    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

// Run the script
// In ES modules, there's no direct equivalent to require.main === module
// but we can just call main directly since this is a script file
main();
