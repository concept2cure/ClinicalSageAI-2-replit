import fs from 'fs/promises';
import path from 'path';
import minimist from 'minimist';
import * as ds from '../server/services/docushare.js';
import * as ss from '../server/services/semanticSearch.js';
import pdf from 'pdf-parse';
import crypto from 'crypto';
import prisma from '../server/prisma/client.js';
import io from '../server/index.js';

/**
 * Bulk Legacy Import CLI
 *
 * This tool processes PDF files from a local directory, extracts text,
 * creates semantic embeddings, and uploads to DocuShare.
 *
 * Usage:
 *   node scripts/bulkImport.js --dir ./path/to/pdfs --study 123
 */

(async () => {
  // Parse command line arguments
  const argv = minimist(process.argv.slice(2));
  const dir = argv.dir || process.env.IMPORT_ROOT_PATH;
  if (!dir) {
    logger.error('Missing --dir parameter');
    process.exit(1);
  }

  const study = argv.study || 'legacy';
  logger.info(`Starting import from ${dir} for study ${study}`);

  try {
    // Get all files in directory
    const files = await fs.readdir(dir);
    let processedCount = 0;

    for (const fileName of files) {
      if (!fileName.toLowerCase().endsWith('.pdf')) continue;

      const filePath = path.join(dir, fileName);
      logger.info(`Processing ${fileName}...`);

      // Emit progress to connected clients via WebSocket
      if (io) {
        io.emit('import', {
          file: fileName,
          percent: (processedCount / files.length) * 100,
        });
      }

      try {
        // Read file and calculate hash
        const data = await fs.readFile(filePath);
        const sha256 = crypto.createHash('sha256').update(data).digest('hex');

        // Check if already imported (deduplicate)
        const existing = await prisma.document.findFirst({
          where: { sha256 },
        });

        if (existing) {
          logger.info(`Skipping duplicate file: ${fileName}`);
          continue;
        }

        // Upload to DocuShare
        const uploadResult = await ds.upload(data, fileName, process.env.DS_DRAFT_FOLDER);
        const objectId = uploadResult.objectId;
        logger.info(`Uploaded to DocuShare as ${objectId}`);

        // Extract text from PDF
        const pdfData = await pdf(data);
        const text = pdfData.text || '';

        if (text.trim().length === 0) {
          logger.warn(`Warning: No text extracted from ${fileName}`);
        }

        // Create document embedding for semantic search
        await ss.upsertDoc({
          objectId,
          title: fileName,
          text,
        });

        // Record in document table
        await prisma.document.create({
          data: {
            name: fileName,
            sha256,
            uploadedBy: 1, // System user
            studyId: study,
          },
        });

        logger.info(`Successfully processed ${fileName}`);
        processedCount++;
      } catch (error) {
        logger.error(`Error processing ${fileName}:`, error);
      }
    }

    logger.info(`Import complete. Processed ${processedCount} files.`);

    // Final progress update
    if (io) {
      io.emit('import', {
        file: 'Import complete',
        percent: 100,
      });
    }
  } catch (error) {
    logger.error('Import failed:', error);
  }

  process.exit(0);
})();
