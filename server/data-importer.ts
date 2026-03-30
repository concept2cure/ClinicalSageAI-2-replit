import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import csvParser from 'csv-parser';
import { pool, query } from './db';
import { sql } from 'drizzle-orm';
import { csrReports, csrDetails } from '../shared/schema';
import { db } from './drizzle';

// Define types for CSR data
export type InsertCsrReport = typeof csrReports.$inferInsert;
export type InsertCsrDetails = typeof csrDetails.$inferInsert;
import { extractTextFromPdf } from './openai-service';
import { validatePdfFile, getPdfMetadata, savePdfFile } from './pdf-processor';
import { analyzeCsrContent, generateCsrSummary } from './openai-service';
import { createScopedLogger } from './utils/logger.js';

const log = createScopedLogger('data-importer');

// Directory paths
const UPLOAD_DIR = path.join(process.cwd(), 'uploads');
const PDF_DIR = path.join(UPLOAD_DIR, 'pdf');
const DATA_DIR = path.join(UPLOAD_DIR, 'data');

// Create necessary directories
for (const dir of [UPLOAD_DIR, PDF_DIR, DATA_DIR]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

/**
 * Run the Python data fetching script (legacy version)
 */
export async function fetchClinicalTrialDataLegacy(
  maxRecords: number = 100,
  downloadPdfs: boolean = true
): Promise<{ success: boolean; message: string; data?: any }> {
  return new Promise((resolve, reject) => {
    log.debug(`Fetching ${maxRecords} clinical trial records, downloadPdfs=${downloadPdfs}`);

    const scriptPath = path.join(process.cwd(), 'server/scripts/fetch_clinical_trials.py');
    const pythonProcess = spawn('python3', [
      scriptPath,
      maxRecords.toString(),
      downloadPdfs.toString(),
    ]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', data => {
      const chunk = data.toString();
      log.debug(chunk);
      output += chunk;
    });

    pythonProcess.stderr.on('data', data => {
      const chunk = data.toString();
      log.error(chunk);
      errorOutput += chunk;
    });

    pythonProcess.on('close', code => {
      if (code !== 0) {
        return resolve({
          success: false,
          message: `Python script exited with code ${code}: ${errorOutput}`,
        });
      }

      // Try to parse the last line for results
      const lines = output.split('\n').filter(Boolean);
      const lastLine = lines[lines.length - 1];

      if (lastLine && lastLine.includes('Downloaded')) {
        // Example: Downloaded 100 trials, 25 with PDFs
        const match = lastLine.match(/Downloaded (\d+) trials, (\d+) with PDFs/);
        if (match) {
          resolve({
            success: true,
            message: `Successfully downloaded ${match[1]} trials, ${match[2]} with PDFs`,
            data: {
              totalTrials: parseInt(match[1]),
              trialsWithPdfs: parseInt(match[2]),
            },
          });
        } else {
          resolve({
            success: true,
            message: 'Data fetching completed successfully',
          });
        }
      } else {
        resolve({
          success: true,
          message: 'Data fetching completed, but could not parse results',
        });
      }
    });
  });
}

/**
 * Run the Python data fetching script using the V2 API
 */
export async function fetchClinicalTrialData(
  maxRecords: number = 100,
  downloadPdfs: boolean = true
): Promise<{ success: boolean; message: string; data?: any }> {
  return new Promise((resolve, reject) => {
    log.debug(`Fetching ${maxRecords} clinical trial records using V2 API`);

    // Use the newer v2 API script which is working successfully
    const scriptPath = path.join(process.cwd(), 'server/scripts/fetch_trials_v2_api.py');
    const args = ['--max-records', maxRecords.toString()];

    // Create output directories
    if (!fs.existsSync('./server/scripts/data')) {
      fs.mkdirSync('./server/scripts/data', { recursive: true });
    }

    const pythonProcess = spawn('python', [scriptPath, ...args]);

    let output = '';
    let errorOutput = '';

    pythonProcess.stdout.on('data', data => {
      const chunk = data.toString();
      log.debug(chunk);
      output += chunk;
    });

    pythonProcess.stderr.on('data', data => {
      const chunk = data.toString();
      log.error(chunk);
      errorOutput += chunk;
    });

    pythonProcess.on('close', code => {
      if (code !== 0) {
        return resolve({
          success: false,
          message: `Python script exited with code ${code}: ${errorOutput}`,
        });
      }

      // Parse the output to find the success message and file path
      const successMatch = output.match(/Successfully fetched (\d+) records/);
      const fileMatch = output.match(/Data saved to (.+\.json)/);

      if (successMatch && fileMatch) {
        const count = parseInt(successMatch[1], 10);
        const filePath = fileMatch[1];

        try {
          // Read the generated file
          const fileData = JSON.parse(fs.readFileSync(filePath, 'utf8'));

          resolve({
            success: true,
            message: `Successfully fetched ${count} clinical trial records`,
            data: fileData,
          });
        } catch (error: any) {
          resolve({
            success: false,
            message: `Error reading output file: ${error.message}`,
          });
        }
      } else {
        resolve({
          success: true,
          message: 'Data fetching completed, but could not parse results',
        });
      }
    });
  });
}

/**
 * Import clinical trial data from CSV file into the database
 */
export async function importTrialsFromCsv(
  csvFilePath: string
): Promise<{ success: boolean; message: string; count: number }> {
  if (!fs.existsSync(csvFilePath)) {
    return { success: false, message: `CSV file not found: ${csvFilePath}`, count: 0 };
  }

  return new Promise((resolve, reject) => {
    const results: any[] = [];

    fs.createReadStream(csvFilePath)
      .pipe(csvParser())
      .on('data', data => results.push(data))
      .on('error', error => {
        resolve({ success: false, message: `Error parsing CSV: ${error.message}`, count: 0 });
      })
      .on('end', async () => {
        try {
          let importCount = 0;

          // Process each row
          for (const row of results) {
            try {
              // Format the data to match our schema
              const reportData: Partial<InsertCsrReport> = {
                title: row.title || 'Untitled Study',
                sponsor: row.sponsor || 'Unknown',
                indication: row.indication || 'Unknown',
                phase: row.phase || 'Unknown',
                status: row.status || 'Completed',
                date: row.date || row.completion_date || null,
                fileName:
                  row.fileName ||
                  row.file_name ||
                  `${row.nctrialId || row.nctrial_id || 'unknown'}.pdf`,
                fileSize: row.fileSize
                  ? parseInt(row.fileSize)
                  : row.file_size
                    ? parseInt(row.file_size)
                    : 0,
                filePath: row.filePath || row.file_path || null,
                nctrialId: row.nctrialId || row.nctrial_id || null,
                studyId: row.studyId || row.study_id || row.nctrialId || row.nctrial_id || null,
                drugName: row.drugName || null,
                region: row.region || null,
              };

              // Skip records that don't have basic required fields
              if (!reportData.title || !reportData.sponsor || !reportData.indication) {
                log.warn(`Skipping record with incomplete data: ${JSON.stringify(reportData)}`);
                continue;
              }

              // Check if this trial is already in the database (by NCT ID)
              const existingReport = reportData.nctrialId
                ? await db
                    .select()
                    .from(csrReports)
                    .where(sql => sql`${csrReports.nctrialId} = ${reportData.nctrialId}`)
                    .limit(1)
                : [];

              let reportId: number;

              if (existingReport.length > 0) {
                reportId = existingReport[0].id;
                // Update the existing record
                await db
                  .update(csrReports)
                  .set(reportData)
                  .where(sql => sql`${csrReports.id} = ${reportId}`);

                log.debug(`Updated existing report: ${reportData.title} (ID: ${reportId})`);
              } else {
                // Insert new record
                const [newReport] = await db
                  .insert(csrReports)
                  .values(reportData as InsertCsrReport)
                  .returning();
                reportId = newReport.id;
                importCount++;

                log.debug(`Inserted new report: ${reportData.title} (ID: ${reportId})`);
              }

              // Process the details if we have the associated PDF
              if (row.file_path && fs.existsSync(row.file_path)) {
                try {
                  // Check if details already exist
                  const existingDetails = await db
                    .select()
                    .from(csrDetails)
                    .where(sql => sql`${csrDetails.reportId} = ${reportId}`)
                    .limit(1);

                  if (existingDetails.length === 0) {
                    // Format treatment arms and endpoints if they exist in the CSV
                    const treatmentArms =
                      row.treatmentArms || row.treatment_arms
                        ? typeof (row.treatmentArms || row.treatment_arms) === 'string'
                          ? JSON.parse(row.treatmentArms || row.treatment_arms)
                          : row.treatmentArms || row.treatment_arms
                        : [];

                    const endpoints = row.endpoints
                      ? typeof row.endpoints === 'string'
                        ? JSON.parse(row.endpoints)
                        : row.endpoints
                      : [];

                    // Extract PDF content
                    const pdfBuffer = fs.readFileSync(row.filePath || row.file_path);
                    const pdfText = await extractTextFromPdf(pdfBuffer);

                    // Generate summary and analyze content
                    const summary = await generateCsrSummary(pdfText);
                    const analysisResults = await analyzeCsrContent(pdfText);

                    // Prepare details data
                    const detailsData: Partial<InsertCsrDetails> = {
                      reportId,
                      studyDesign:
                        row.studyDesign || row.study_design || analysisResults.studyDesign || null,
                      primaryObjective:
                        row.primaryObjective ||
                        row.primary_objective ||
                        analysisResults.primaryObjective ||
                        null,
                      studyDescription: summary || null,
                      inclusionCriteria:
                        row.inclusionCriteria || row.inclusion_criteria
                          ? typeof (row.inclusionCriteria || row.inclusion_criteria) === 'string'
                            ? row.inclusionCriteria || row.inclusion_criteria
                            : JSON.stringify(row.inclusionCriteria || row.inclusion_criteria)
                          : analysisResults.inclusionCriteria || null,
                      exclusionCriteria:
                        row.exclusionCriteria || row.exclusion_criteria
                          ? typeof (row.exclusionCriteria || row.exclusion_criteria) === 'string'
                            ? row.exclusionCriteria || row.exclusion_criteria
                            : JSON.stringify(row.exclusionCriteria || row.exclusion_criteria)
                          : analysisResults.exclusionCriteria || null,
                      treatmentArms:
                        treatmentArms.length > 0
                          ? treatmentArms
                          : analysisResults.treatmentArms || [],
                      studyDuration:
                        row.studyDuration ||
                        row.study_duration ||
                        analysisResults.studyDuration ||
                        null,
                      endpoints: endpoints.length > 0 ? endpoints : analysisResults.endpoints || [],
                      results: analysisResults.results || {},
                      safety: analysisResults.safety || {},
                      processed: true,
                      processingStatus: 'completed',
                      sampleSize: row.sampleSize
                        ? parseInt(row.sampleSize)
                        : row.sample_size
                          ? parseInt(row.sample_size)
                          : analysisResults.sampleSize || null,
                      ageRange: row.ageRange || row.age_range || analysisResults.ageRange || null,
                      gender: analysisResults.gender || {},
                      statisticalMethods: analysisResults.statisticalMethods || [],
                      adverseEvents: analysisResults.adverseEvents || [],
                      efficacyResults: analysisResults.efficacyResults || {},
                      saeCount: analysisResults.saeCount || null,
                      teaeCount: analysisResults.teaeCount || null,
                      completionRate: analysisResults.completionRate || null,
                    };

                    // Insert the details
                    await db.insert(csrDetails).values(detailsData as InsertCsrDetails);
                    log.debug(`Added details for report ID ${reportId}`);
                  } else {
                    log.debug(`Details already exist for report ID ${reportId}, skipping`);
                  }
                } catch (error) {
                  log.error(`Error processing PDF for report ID ${reportId}:`, error);
                }
              }
            } catch (error) {
              log.error(`Error importing row: ${JSON.stringify(row)}`, error);
            }
          }

          resolve({
            success: true,
            message: `Successfully imported ${importCount} new clinical trials`,
            count: importCount,
          });
        } catch (error) {
          resolve({
            success: false,
            message: `Error during import: ${error.message}`,
            count: 0,
          });
        }
      });
  });
}

/**
 * Import clinical trial data from JSON file into the database
 */
export async function importTrialsFromJson(
  jsonFilePath: string
): Promise<{ success: boolean; message: string; count: number }> {
  if (!fs.existsSync(jsonFilePath)) {
    return { success: false, message: `JSON file not found: ${jsonFilePath}`, count: 0 };
  }

  try {
    const fileContent = fs.readFileSync(jsonFilePath, 'utf8');
    const data = JSON.parse(fileContent);

    if (!Array.isArray(data)) {
      return { success: false, message: 'JSON file does not contain an array', count: 0 };
    }

    let importCount = 0;

    // Process each item in the JSON array
    for (const item of data) {
      try {
        // Format the data to match our schema
        const reportData: Partial<InsertCsrReport> = {
          title: item.title || 'Untitled Study',
          sponsor: item.sponsor || 'Unknown',
          indication: item.indication || 'Unknown',
          phase: item.phase || 'Unknown',
          status: item.status || 'Completed',
          date: item.date || item.completion_date || null,
          fileName:
            item.fileName ||
            item.file_name ||
            `${item.nctrialId || item.nctrial_id || 'unknown'}.pdf`,
          fileSize: item.fileSize
            ? parseInt(item.fileSize)
            : item.file_size
              ? parseInt(item.file_size)
              : 0,
          filePath: item.filePath || item.file_path || null,
          nctrialId: item.nctrialId || item.nctrial_id || null,
          studyId: item.studyId || item.study_id || item.nctrialId || item.nctrial_id || null,
          drugName: item.drugName || null,
          region: item.region || null,
        };

        // Skip records that don't have basic required fields
        if (!reportData.title || !reportData.sponsor || !reportData.indication) {
          log.warn(`Skipping record with incomplete data: ${JSON.stringify(reportData)}`);
          continue;
        }

        // Check if this trial is already in the database (by NCT ID)
        const existingReport = reportData.nctrialId
          ? await db
              .select()
              .from(csrReports)
              .where(sql => sql`${csrReports.nctrialId} = ${reportData.nctrialId}`)
              .limit(1)
          : [];

        let reportId: number;

        if (existingReport.length > 0) {
          reportId = existingReport[0].id;
          // Update the existing record
          await db
            .update(csrReports)
            .set(reportData)
            .where(sql => sql`${csrReports.id} = ${reportId}`);

          log.debug(`Updated existing report: ${reportData.title} (ID: ${reportId})`);
        } else {
          // Insert new record
          const [newReport] = await db
            .insert(csrReports)
            .values(reportData as InsertCsrReport)
            .returning();
          reportId = newReport.id;
          importCount++;

          log.debug(`Inserted new report: ${reportData.title} (ID: ${reportId})`);
        }

        // Add the related details if we have them
        if (
          item.treatmentArms ||
          item.treatment_arms ||
          item.endpoints ||
          item.inclusionCriteria ||
          item.inclusion_criteria ||
          item.exclusionCriteria ||
          item.exclusion_criteria
        ) {
          try {
            // Check if details already exist
            const existingDetails = await db
              .select()
              .from(csrDetails)
              .where(sql => sql`${csrDetails.reportId} = ${reportId}`)
              .limit(1);

            if (existingDetails.length === 0) {
              // Prepare details data
              const detailsData: Partial<InsertCsrDetails> = {
                reportId,
                studyDesign: item.studyDesign || item.study_design || null,
                primaryObjective: item.primaryObjective || item.primary_objective || null,
                studyDescription: null,
                inclusionCriteria:
                  item.inclusionCriteria || item.inclusion_criteria
                    ? typeof (item.inclusionCriteria || item.inclusion_criteria) === 'string'
                      ? item.inclusionCriteria || item.inclusion_criteria
                      : JSON.stringify(item.inclusionCriteria || item.inclusion_criteria)
                    : null,
                exclusionCriteria:
                  item.exclusionCriteria || item.exclusion_criteria
                    ? typeof (item.exclusionCriteria || item.exclusion_criteria) === 'string'
                      ? item.exclusionCriteria || item.exclusion_criteria
                      : JSON.stringify(item.exclusionCriteria || item.exclusion_criteria)
                    : null,
                treatmentArms: item.treatmentArms || item.treatment_arms || [],
                studyDuration: item.studyDuration || item.study_duration || null,
                endpoints: item.endpoints || [],
                results: {},
                safety: {},
                processed: false,
                processingStatus: 'pending',
                sampleSize: item.sampleSize
                  ? parseInt(item.sampleSize)
                  : item.sample_size
                    ? parseInt(item.sample_size)
                    : null,
                ageRange: item.ageRange || item.age_range || null,
                gender: {},
                statisticalMethods: [],
                adverseEvents: [],
                efficacyResults: {},
              };

              // Insert the details
              await db.insert(csrDetails).values(detailsData as InsertCsrDetails);
              log.debug(`Added details for report ID ${reportId}`);
            } else {
              log.debug(`Details already exist for report ID ${reportId}, skipping`);
            }
          } catch (error) {
            log.error(`Error adding details for report ID ${reportId}:`, error);
          }
        }
      } catch (error) {
        log.error(`Error importing item: ${JSON.stringify(item)}`, error);
      }
    }

    return {
      success: true,
      message: `Successfully imported ${importCount} new clinical trials from JSON`,
      count: importCount,
    };
  } catch (error) {
    return {
      success: false,
      message: `Error parsing or processing JSON: ${error.message}`,
      count: 0,
    };
  }
}

/**
 * Find the most recent data file in the data directory
 */
export function findLatestDataFile(extension: 'csv' | 'json' = 'json'): string | null {
  if (!fs.existsSync(DATA_DIR)) {
    return null;
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter(file => file.endsWith(`.${extension}`))
    .filter(file => file.includes('clinicaltrials_dump'))
    .sort()
    .reverse();

  return files.length > 0 ? path.join(DATA_DIR, files[0]) : null;
}

/**
 * Import clinical trial data fetched from the ClinicalTrials.gov API v2
 */
export async function importTrialsFromApiV2(
  data: any
): Promise<{ success: boolean; message: string; count: number }> {
  if (!data || !data.studies || !Array.isArray(data.studies)) {
    return { success: false, message: 'Invalid API v2 data format', count: 0 };
  }

  try {
    // Import the functions for processing API v2 data
    const dataImporterV2 = await import('./data-importer-v2');
    const { processApiV2Data } = dataImporterV2;
    const { studies } = processApiV2Data(data);

    if (studies.length === 0) {
      return { success: false, message: 'No valid studies found in API v2 data', count: 0 };
    }

    let importCount = 0;

    // Process each study
    for (const { report, details } of studies) {
      try {
        // Skip records that don't have basic required fields
        if (!report.title || !report.sponsor || !report.indication) {
          log.warn(`Skipping record with incomplete data: ${JSON.stringify(report)}`);
          continue;
        }

        // Check if this trial is already in the database (by NCT ID)
        const existingReport = report.nctrialId
          ? await db
              .select()
              .from(csrReports)
              .where(sql => sql`${csrReports.nctrialId} = ${report.nctrialId}`)
              .limit(1)
          : [];

        let reportId: number;

        if (existingReport.length > 0) {
          reportId = existingReport[0].id;
          // Update the existing record
          await db
            .update(csrReports)
            .set(report)
            .where(sql => sql`${csrReports.id} = ${reportId}`);

          log.debug(`Updated existing report: ${report.title} (ID: ${reportId})`);
        } else {
          // Insert new record
          const [newReport] = await db
            .insert(csrReports)
            .values(report as InsertCsrReport)
            .returning();
          reportId = newReport.id;
          importCount++;

          log.debug(`Inserted new report: ${report.title} (ID: ${reportId})`);
        }

        // Add the related details
        try {
          // Check if details already exist
          const existingDetails = await db
            .select()
            .from(csrDetails)
            .where(sql => sql`${csrDetails.reportId} = ${reportId}`)
            .limit(1);

          if (existingDetails.length === 0) {
            // Update the reportId in the details object
            const detailsWithReportId = {
              ...details,
              reportId,
            };

            // Insert the details
            await db.insert(csrDetails).values(detailsWithReportId as InsertCsrDetails);
            log.debug(`Added details for report ID ${reportId}`);
          } else {
            log.debug(`Details already exist for report ID ${reportId}, skipping`);
          }
        } catch (error: any) {
          log.error(`Error adding details for report ID ${reportId}:`, error);
        }
      } catch (error: any) {
        log.error(`Error importing study: ${JSON.stringify(report)}`, error);
      }
    }

    return {
      success: true,
      message: `Successfully imported ${importCount} new clinical trials from API v2`,
      count: importCount,
    };
  } catch (error: any) {
    log.error('Error in importTrialsFromApiV2:', error);
    return { success: false, message: `Error: ${error.message}`, count: 0 };
  }
}

/**
 * Schedule periodic data updates
 */
export function scheduleDataUpdates(intervalHours: number = 24): NodeJS.Timeout {
  log.debug(`Scheduling data updates every ${intervalHours} hours`);

  const intervalMs = intervalHours * 60 * 60 * 1000;

  const timer = setInterval(async () => {
    log.debug(`Running scheduled data update at ${new Date().toISOString()}`);

    try {
      // Fetch new data using the API v2 endpoint
      const fetchResult = await fetchClinicalTrialData(100, true);
      log.debug(`Data fetch result: ${fetchResult.message}`);

      if (fetchResult.success && fetchResult.data) {
        // Import the data directly using the v2 importer
        const importResult = await importTrialsFromApiV2(fetchResult.data);
        log.debug(`Data import result: ${importResult.message}`);
      } else {
        // Fallback to the old method of importing from a file
        const latestJsonFile = findLatestDataFile('json');
        if (latestJsonFile) {
          const importResult = await importTrialsFromJson(latestJsonFile);
          log.debug(`Data import result (fallback): ${importResult.message}`);
        } else {
          log.debug('No JSON data file found to import');
        }
      }
    } catch (error) {
      log.error('Error during scheduled data update:', error);
    }
  }, intervalMs);

  // Run once immediately
  setTimeout(async () => {
    log.debug('Running initial data update...');
    try {
      // Check if we already have data in the database
      const reportCount = await db.select({ count: sql`count(*)` }).from(csrReports);
      if (reportCount[0].count === 0) {
        // Fetch new data if the database is empty using the API v2 endpoint
        const fetchResult = await fetchClinicalTrialData(25, false);
        log.debug(`Initial data fetch result: ${fetchResult.message}`);

        if (fetchResult.success && fetchResult.data) {
          // Import the data directly using the v2 importer
          const importResult = await importTrialsFromApiV2(fetchResult.data);
          log.debug(`Initial data import result: ${importResult.message}`);
        } else {
          // Fallback to the old method of importing from a file
          const latestJsonFile = findLatestDataFile('json');
          if (latestJsonFile) {
            const importResult = await importTrialsFromJson(latestJsonFile);
            log.debug(`Initial data import result (fallback): ${importResult.message}`);
          } else {
            log.debug('No JSON data file found for initial import');
          }
        }
      } else {
        log.debug(`Database already has ${reportCount[0].count} reports, skipping initial fetch`);
      }
    } catch (error) {
      log.error('Error during initial data update:', error);
    }
  }, 5000);

  return timer;
}

/**
 * Command line interface for data import
 */
// CLI functionality removed for ESM compatibility
// In ESM modules, the CommonJS-style check `require.main === module` doesn't work
// To use these functions from the command line, create a separate CLI script
// that imports these functions
