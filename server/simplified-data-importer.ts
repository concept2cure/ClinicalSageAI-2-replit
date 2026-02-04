/**
 * Simplified Data Importer for TrialSage
 *
 * This module provides functions for importing clinical trial data
 * and CSR reports into the database.
 */
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import csvParser from 'csv-parser';
import { pool, query } from './db';
import { createContextLogger } from './utils/logger';

const logger = createContextLogger('simplified-data-importer');

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
    logger.info(`Fetching ${maxRecords} clinical trial records, downloadPdfs=${downloadPdfs}`);

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
      logger.debug(chunk);
      output += chunk;
    });

    pythonProcess.stderr.on('data', data => {
      const chunk = data.toString();
      logger.error(chunk);
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
    logger.info(`Fetching ${maxRecords} clinical trial records using V2 API`);

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
      logger.debug(chunk);
      output += chunk;
    });

    pythonProcess.stderr.on('data', data => {
      const chunk = data.toString();
      logger.error(chunk);
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
              const reportData = {
                title: row.title || 'Untitled Study',
                sponsor: row.sponsor || 'Unknown',
                indication: row.indication || 'Unknown',
                phase: row.phase || 'Unknown',
                status: row.status || 'Completed',
                date: row.date || row.completion_date || null,
                file_name:
                  row.fileName ||
                  row.file_name ||
                  `${row.nctrialId || row.nctrial_id || 'unknown'}.pdf`,
                file_size: row.fileSize
                  ? parseInt(row.fileSize)
                  : row.file_size
                    ? parseInt(row.file_size)
                    : 0,
                file_path: row.filePath || row.file_path || null,
                nctrial_id: row.nctrialId || row.nctrial_id || null,
                study_id: row.studyId || row.study_id || row.nctrialId || row.nctrial_id || null,
                drug_name: row.drugName || null,
                region: row.region || null,
              };

              // Skip records that don't have basic required fields
              if (!reportData.title || !reportData.sponsor || !reportData.indication) {
                logger.warn(`Skipping record with incomplete data: ${JSON.stringify(reportData)}`);
                continue;
              }

              // Check if this trial is already in the database (by NCT ID)
              let existingReport: { rows: Array<{ id: number }> } = { rows: [] };

              if (reportData.nctrial_id) {
                existingReport = await query(
                  'SELECT id FROM csr_reports WHERE nctrial_id = $1 LIMIT 1',
                  [reportData.nctrial_id]
                );
              }

              let reportId: number;

              if (existingReport.rows.length > 0) {
                reportId = existingReport.rows[0].id;

                // Update the existing record
                await query(
                  `UPDATE csr_reports SET
                    title = $1, sponsor = $2, indication = $3, phase = $4, status = $5,
                    date = $6, file_name = $7, file_size = $8, file_path = $9,
                    study_id = $10, drug_name = $11, region = $12, last_updated = NOW()
                  WHERE id = $13`,
                  [
                    reportData.title,
                    reportData.sponsor,
                    reportData.indication,
                    reportData.phase,
                    reportData.status,
                    reportData.date,
                    reportData.file_name,
                    reportData.file_size,
                    reportData.file_path,
                    reportData.study_id,
                    reportData.drug_name,
                    reportData.region,
                    reportId,
                  ]
                );

                logger.info(`Updated existing report: ${reportData.title} (ID: ${reportId})`);
              } else {
                // Insert new record
                const newReport = await query(
                  `INSERT INTO csr_reports (
                    title, sponsor, indication, phase, status, date,
                    file_name, file_size, file_path, nctrial_id, study_id,
                    drug_name, region, upload_date, last_updated
                  ) VALUES (
                    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
                  ) RETURNING id`,
                  [
                    reportData.title,
                    reportData.sponsor,
                    reportData.indication,
                    reportData.phase,
                    reportData.status,
                    reportData.date,
                    reportData.file_name,
                    reportData.file_size,
                    reportData.file_path,
                    reportData.nctrial_id,
                    reportData.study_id,
                    reportData.drug_name,
                    reportData.region,
                  ]
                );

                reportId = newReport.rows[0].id;
                importCount++;

                logger.info(`Inserted new report: ${reportData.title} (ID: ${reportId})`);
              }
            } catch (error: any) {
              logger.error(`Error importing row: ${JSON.stringify(row)}`, { error: error.message });
            }
          }

          resolve({
            success: true,
            message: `Successfully imported ${importCount} new clinical trials`,
            count: importCount,
          });
        } catch (error: any) {
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
 * Find the most recent data file in the data directory
 */
export function findLatestDataFile(extension: 'csv' | 'json' = 'json'): string | null {
  if (!fs.existsSync(DATA_DIR)) {
    return null;
  }

  const files = fs
    .readdirSync(DATA_DIR)
    .filter(file => file.endsWith(`.${extension}`))
    .map(file => ({
      name: file,
      path: path.join(DATA_DIR, file),
      mtime: fs.statSync(path.join(DATA_DIR, file)).mtime,
    }))
    .sort((a, b) => b.mtime.getTime() - a.mtime.getTime());

  return files.length > 0 ? files[0].path : null;
}

/**
 * Schedule periodic data updates
 */
export function scheduleDataUpdates(intervalHours: number = 24): NodeJS.Timeout {
  const intervalMs = intervalHours * 60 * 60 * 1000;
  logger.info(`Scheduling data updates every ${intervalHours} hours`);

  return setInterval(async () => {
    try {
      logger.info('Running scheduled data update');
      const result = await fetchClinicalTrialData(50, true);

      if (result.success && result.data) {
        const latestFile = findLatestDataFile();
        if (latestFile) {
          await importTrialsFromJson(latestFile);
        }
      }
    } catch (error: any) {
      logger.error('Error in scheduled data update', { error: error.message });
    }
  }, intervalMs);
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

    for (const item of data) {
      try {
        const reportData = {
          title: item.title || 'Untitled Study',
          sponsor: item.sponsor || 'Unknown',
          indication: item.indication || 'Unknown',
          phase: item.phase || 'Unknown',
          status: item.status || 'Completed',
          date: item.date || item.completion_date || null,
          file_name:
            item.fileName ||
            item.file_name ||
            `${item.nctrialId || item.nctrial_id || 'unknown'}.pdf`,
          file_size: item.fileSize
            ? parseInt(item.fileSize)
            : item.file_size
              ? parseInt(item.file_size)
              : 0,
          file_path: item.filePath || item.file_path || null,
          nctrial_id: item.nctrialId || item.nctrial_id || null,
          study_id: item.studyId || item.study_id || item.nctrialId || item.nctrial_id || null,
          drug_name: item.drugName || null,
          region: item.region || null,
        };

        // Skip records that don't have basic required fields
        if (!reportData.title || !reportData.sponsor || !reportData.indication) {
          logger.warn(`Skipping record with incomplete data: ${JSON.stringify(reportData)}`);
          continue;
        }

        // Check if this trial is already in the database (by NCT ID)
        let existingReport: { rows: Array<{ id: number }> } = { rows: [] };

        if (reportData.nctrial_id) {
          existingReport = await query('SELECT id FROM csr_reports WHERE nctrial_id = $1 LIMIT 1', [
            reportData.nctrial_id,
          ]);
        }

        let reportId: number;

        if (existingReport.rows.length > 0) {
          reportId = existingReport.rows[0].id;

          // Update the existing record
          await query(
            `UPDATE csr_reports SET
              title = $1, sponsor = $2, indication = $3, phase = $4, status = $5,
              date = $6, file_name = $7, file_size = $8, file_path = $9,
              study_id = $10, drug_name = $11, region = $12, last_updated = NOW()
            WHERE id = $13`,
            [
              reportData.title,
              reportData.sponsor,
              reportData.indication,
              reportData.phase,
              reportData.status,
              reportData.date,
              reportData.file_name,
              reportData.file_size,
              reportData.file_path,
              reportData.study_id,
              reportData.drug_name,
              reportData.region,
              reportId,
            ]
          );

          logger.info(`Updated existing report: ${reportData.title} (ID: ${reportId})`);
        } else {
          // Insert new record
          const newReport = await query(
            `INSERT INTO csr_reports (
              title, sponsor, indication, phase, status, date,
              file_name, file_size, file_path, nctrial_id, study_id,
              drug_name, region, upload_date, last_updated
            ) VALUES (
              $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW()
            ) RETURNING id`,
            [
              reportData.title,
              reportData.sponsor,
              reportData.indication,
              reportData.phase,
              reportData.status,
              reportData.date,
              reportData.file_name,
              reportData.file_size,
              reportData.file_path,
              reportData.nctrial_id,
              reportData.study_id,
              reportData.drug_name,
              reportData.region,
            ]
          );

          reportId = newReport.rows[0].id;
          importCount++;

          logger.info(`Inserted new report: ${reportData.title} (ID: ${reportId})`);
        }
      } catch (error: any) {
        logger.error(`Error importing item: ${JSON.stringify(item)}`, { error: error.message });
      }
    }

    return {
      success: true,
      message: `Successfully imported ${importCount} new clinical trials`,
      count: importCount,
    };
  } catch (error: any) {
    return {
      success: false,
      message: `Error during import: ${error.message}`,
      count: 0,
    };
  }
}

/**
 * Count the number of CSR reports in the database
 */
export async function getReportCount(): Promise<number> {
  try {
    if (!pool) {
      return 0;
    }

    const result = await query('SELECT COUNT(*) as count FROM csr_reports');
    return parseInt(result.rows[0].count, 10);
  } catch (error: any) {
    logger.error('Error counting reports', { error: error.message });
    return 0;
  }
}
