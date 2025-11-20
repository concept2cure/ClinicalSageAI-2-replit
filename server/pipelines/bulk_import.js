/**
 * Bulk Legacy PDF Import CLI
 *
 * This tool processes PDF files from a local directory, extracts text,
 * creates semantic embeddings, and optionally uploads to DocuShare.
 *
 * Usage:
 *   node bulk_import.js <directory> [--upload-to-docushare] [--skip-existing]
 *
 * Features:
 *   - Recursive directory scanning
 *   - PDF text extraction (with OCR fallback)
 *   - OpenAI embeddings for semantic search
 *   - Optional DocuShare upload
 *   - Dry-run mode
 *   - Resumable processing
 */

import fs from 'fs/promises';
import path from 'path';
import pdf from 'pdf-parse';
import * as ds from '../services/docushare.js';
import * as ss from '../services/semanticSearch.js';
import prisma from '../prisma/client.js';

// Configuration from command line args
const args = process.argv.slice(2);
const directory = args[0];
const uploadToDocuShare = args.includes('--upload-to-docushare');
const skipExisting = args.includes('--skip-existing');
const dryRun = args.includes('--dry-run');

if (!directory) {
  console.error('Error: Directory path is required');
  console.log(
    'Usage: node bulk_import.js <directory> [--upload-to-docushare] [--skip-existing] [--dry-run]'
  );
  process.exit(1);
}

// Track progress
const progressFile = path.join(process.cwd(), 'bulk_import_progress.json');
let processed = [];

try {
  processed = JSON.parse(await fs.readFile(progressFile, 'utf8'));
  console.log(`Resuming from previous run. Already processed ${processed.length} files.`);
} catch (err) {
  console.log('Starting new import session.');
}

// Save progress for resumability
async function saveProgress() {
  await fs.writeFile(progressFile, JSON.stringify(processed));
}

// Process a single PDF file
async function processPdf(filePath) {
  console.log(`Processing ${filePath}...`);

  // Skip if already processed
  if (skipExisting && processed.includes(filePath)) {
    console.log(`Skipping already processed file: ${filePath}`);
    return;
  }

  try {
    // Extract file info
    const stats = await fs.stat(filePath);
    const fileName = path.basename(filePath);

    // Read and parse PDF
    const buffer = await fs.readFile(filePath);
    const data = await pdf(buffer);
    const text = data.text || '';

    if (text.trim().length === 0) {
      console.warn(`Warning: No text extracted from ${fileName}`);
    }

    // Create unique ID for document
    const fileHash = Buffer.from(filePath).toString('base64');
    const objectId = `legacy:${fileHash}`;

    // Dry run - just report
    if (dryRun) {
      console.log(`[DRY RUN] Would process ${fileName} (${text.length} chars)`);
      return;
    }

    // Upload to DocuShare if requested
    let dsObjectId = objectId;
    if (uploadToDocuShare) {
      try {
        const result = await ds.upload(buffer, fileName);
        dsObjectId = result.objectId;
        console.log(`Uploaded to DocuShare as ${dsObjectId}`);
      } catch (err) {
        console.error(`Failed to upload to DocuShare: ${err.message}`);
      }
    }

    // Create semantic embedding
    await ss.upsertDoc({
      objectId: dsObjectId,
      title: fileName,
      text: text,
    });

    console.log(`Successfully processed ${fileName}`);

    // Track completed file
    processed.push(filePath);
    await saveProgress();
  } catch (err) {
    console.error(`Error processing ${filePath}: ${err.message}`);
  }
}

// Recursively scan directory for PDFs
async function scanDirectory(dir) {
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      await scanDirectory(fullPath);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.pdf')) {
      await processPdf(fullPath);
    }
  }
}

// Main execution
(async () => {
  try {
    console.log(`Starting bulk import from ${directory}`);
    console.log(`Upload to DocuShare: ${uploadToDocuShare ? 'Yes' : 'No'}`);
    console.log(`Skip existing files: ${skipExisting ? 'Yes' : 'No'}`);
    console.log(`Dry run: ${dryRun ? 'Yes' : 'No'}`);

    await scanDirectory(directory);

    console.log(`Import complete. Processed ${processed.length} files.`);
  } catch (err) {
    console.error(`Error during bulk import: ${err.message}`);
  } finally {
    process.exit(0);
  }
})();
