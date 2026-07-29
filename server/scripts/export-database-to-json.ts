/**
 * Export Database CSRs to JSON Files
 *
 * This script exports all CSR records from the database to individual JSON files
 * in the data/processed_csrs directory so they can be loaded by the search service.
 *
 * This addresses the discrepancy between the number of CSRs in the database (~2,871)
 * and the number loaded by the search service (~779).
 *
 * It also tracks how many new CSRs are exported since the last request.
 */

import path from 'path';
import fs from 'fs/promises';
import { db } from '../db';
import { csrReports, csrDetails } from '../../shared/schema';
import { eq } from 'drizzle-orm';

// File to store the last export statistics
const STATS_FILE_PATH = path.resolve('./data/csr_export_stats.json');

interface ExportStats {
  lastExportDate: string;
  lastExportTotal: number;
  totalExportedSinceLastRequest: number;
  totalInDb: number;
  totalInFiles: number;
  exportHistory: {
    date: string;
    exported: number;
    totalInDb: number;
    totalInFiles: number;
  }[];
}

/**
 * Load the export statistics from the stats file
 */
async function loadExportStats(): Promise<ExportStats> {
  try {
    const data = await fs.readFile(STATS_FILE_PATH, 'utf8');
    return JSON.parse(data);
  } catch (e) {
    // If the file doesn't exist or can't be parsed, return default stats
    return {
      lastExportDate: '',
      lastExportTotal: 0,
      totalExportedSinceLastRequest: 0,
      totalInDb: 0,
      totalInFiles: 0,
      exportHistory: [],
    };
  }
}

/**
 * Save the export statistics to the stats file
 */
async function saveExportStats(stats: ExportStats): Promise<void> {
  try {
    await fs.writeFile(STATS_FILE_PATH, JSON.stringify(stats, null, 2));
  } catch (e) {
    console.error('Error saving export stats:', e);
  }
}

/**
 * Convert database CSR record to a structure suitable for JSON export
 */
async function formatCsrForExport(report: any, details: any) {
  // Create a merged JSON structure with all CSR data
  const exportData = {
    id: report.id,
    title: report.title || '',
    sponsor: report.sponsor || '',
    indication: report.indication || '',
    phase: report.phase || '',
    summary: report.summary || '',

    // Details fields if available
    studyDesign: details?.studyDesign || '',
    primaryObjective: details?.primaryObjective || '',
    studyDescription: details?.studyDescription || '',
    inclusionCriteria: details?.inclusionCriteria || [],
    exclusionCriteria: details?.exclusionCriteria || [],
    endpoints: details?.endpoints || {},
    fileName: report.fileName || '',

    // Additional metadata
    exportDate: new Date().toISOString(),
    source: 'database-export',
  };

  return exportData;
}

/**
 * Main export function
 */
export async function exportDatabaseToJson() {
  // Load previous export stats
  const stats = await loadExportStats();

  // Make sure the export directory exists
  const exportDir = path.resolve('./data/processed_csrs');

  try {
    await fs.mkdir(exportDir, { recursive: true });
  } catch (e) {
    console.error(`Failed to create directory: ${e}`);
  }

  // Get all CSR reports from database
  const reports = (await db.select().from(csrReports as any)) as any[];
  console.log(`Found ${reports.length} CSR reports in database`);

  // Check how many JSON files already exist
  let existingFiles: string[] = [];
  try {
    existingFiles = await fs.readdir(exportDir);
    existingFiles = existingFiles.filter(f => f.endsWith('.json'));
  } catch (e) {
    console.error(`Error reading existing files: ${e}`);
  }

  console.log(`Found ${existingFiles.length} existing JSON files`);

  // Keep track of results
  const results = {
    total: reports.length,
    exported: 0,
    skipped: 0,
    errors: 0,
    filesInDir: existingFiles.length,
  };

  // Process each report
  for (const report of reports) {
    const jsonFilename = `csr_${report.id}.json`;
    const fullPath = path.join(exportDir, jsonFilename);

    // Skip if file already exists
    if (existingFiles.includes(jsonFilename)) {
      results.skipped++;
      continue;
    }

    try {
      // Get details for this report
      const [details] = (await db
        .select()
        .from(csrDetails as any)
        .where(eq((csrDetails as any).reportId, report.id))) as any[];

      // Format the data for export
      const exportData = await formatCsrForExport(report, details);

      // Write to file
      await fs.writeFile(fullPath, JSON.stringify(exportData, null, 2));

      results.exported++;
    } catch (error) {
      console.error(`Error exporting CSR ID ${report.id}:`, error);
      results.errors++;
    }
  }

  // Recount the files after export
  try {
    const updatedFiles = await fs.readdir(exportDir);
    results.filesInDir = updatedFiles.filter(f => f.endsWith('.json')).length;
  } catch (e) {
    console.error(`Error counting updated files: ${e}`);
  }

  // Update the export statistics
  const now = new Date().toISOString();

  // Calculate number of CSRs exported since the last user request
  const totalExportedSinceLastRequest = stats.totalExportedSinceLastRequest + results.exported;

  // Update stats
  stats.totalInDb = reports.length;
  stats.totalInFiles = results.filesInDir;
  stats.lastExportDate = now;
  stats.lastExportTotal = results.exported;
  stats.totalExportedSinceLastRequest = totalExportedSinceLastRequest;

  // Add to history
  stats.exportHistory.push({
    date: now,
    exported: results.exported,
    totalInDb: reports.length,
    totalInFiles: results.filesInDir,
  });

  // Keep only the last 10 history entries
  if (stats.exportHistory.length > 10) {
    stats.exportHistory = stats.exportHistory.slice(-10);
  }

  // Save updated stats
  await saveExportStats(stats);

  console.log(
    `Export complete. Exported ${results.exported} new files. Total available: ${results.filesInDir}`
  );

  // Add stats to the results
  return {
    ...results,
    lastExportDate: now,
    totalExportedSinceLastRequest,
    totalInDb: reports.length,
    totalInFiles: results.filesInDir,
  };
}

/**
 * Reset the counter of CSRs exported since the last user request
 */
export async function resetExportCounter() {
  const stats = await loadExportStats();
  stats.totalExportedSinceLastRequest = 0;
  await saveExportStats(stats);
  return { success: true, message: 'Export counter reset successfully' };
}
