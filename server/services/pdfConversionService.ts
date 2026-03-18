/**
 * PDF Conversion Service
 *
 * Converts DOCX files to PDF using LibreOffice headless mode.
 * Used by template download endpoints to offer PDF format output.
 *
 * Strategy:
 *   1. LibreOffice headless (primary) — high-fidelity DOCX-to-PDF conversion
 *   2. Error with install guidance if LibreOffice is not available
 *
 * Temp file lifecycle: write DOCX to /tmp, convert, read PDF, clean up.
 *
 * @module server/services/pdfConversionService
 */

import { execFile } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { createScopedLogger } from '../utils/logger.js';

const execFileAsync = promisify(execFile);
const logger = createScopedLogger('pdfConversion');

const TMP_DIR = '/tmp/pdf-conversion';

// Cache the availability check for 60 seconds
let libreOfficeAvailable: boolean | null = null;
let lastAvailabilityCheck = 0;
const AVAILABILITY_CACHE_MS = 60_000;

/**
 * Ensure the temp directory exists.
 */
async function ensureTmpDir(): Promise<void> {
  await fs.mkdir(TMP_DIR, { recursive: true });
}

/**
 * Generate a unique filename prefix to avoid collisions.
 */
function uniqueName(): string {
  return `convert_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
}

/**
 * Find the LibreOffice binary. Checks common paths.
 */
async function findLibreOfficeBinary(): Promise<string | null> {
  const candidates = [
    'libreoffice',
    'soffice',
    '/usr/bin/libreoffice',
    '/usr/bin/soffice',
    '/usr/lib/libreoffice/program/soffice',
    '/opt/libreoffice/program/soffice',
    '/Applications/LibreOffice.app/Contents/MacOS/soffice',
  ];

  for (const bin of candidates) {
    try {
      await execFileAsync(bin, ['--version']);
      return bin;
    } catch {
      // Not found at this path, try next
    }
  }
  return null;
}

/**
 * Check whether PDF conversion via LibreOffice is available.
 * Result is cached for 60 seconds to avoid repeated shell calls.
 */
export async function isPdfConversionAvailable(): Promise<boolean> {
  const now = Date.now();
  if (libreOfficeAvailable !== null && now - lastAvailabilityCheck < AVAILABILITY_CACHE_MS) {
    return libreOfficeAvailable;
  }

  const binary = await findLibreOfficeBinary();
  libreOfficeAvailable = binary !== null;
  lastAvailabilityCheck = now;

  if (libreOfficeAvailable) {
    logger.info('LibreOffice detected — PDF conversion available');
  } else {
    logger.warn(
      'LibreOffice not found. Install with: apt-get install -y libreoffice-common libreoffice-writer'
    );
  }

  return libreOfficeAvailable;
}

/**
 * Convert a DOCX buffer to a PDF buffer using LibreOffice headless.
 *
 * @param docxBuffer - The raw DOCX file contents
 * @returns The converted PDF as a Buffer
 * @throws Error if LibreOffice is unavailable or conversion fails
 */
export async function convertDocxToPdf(docxBuffer: Buffer): Promise<Buffer> {
  // Pre-flight check
  const available = await isPdfConversionAvailable();
  if (!available) {
    throw new Error(
      'PDF conversion unavailable: LibreOffice is not installed. ' +
        'Install with: apt-get install -y libreoffice-common libreoffice-writer'
    );
  }

  const binary = (await findLibreOfficeBinary())!;
  const name = uniqueName();

  await ensureTmpDir();

  const docxPath = path.join(TMP_DIR, `${name}.docx`);
  const expectedPdfPath = path.join(TMP_DIR, `${name}.pdf`);

  try {
    // 1. Write DOCX to temp file
    await fs.writeFile(docxPath, docxBuffer);

    // 2. Run LibreOffice headless conversion
    //    --outdir specifies where the PDF lands (same dir)
    //    The output filename matches input but with .pdf extension
    await execFileAsync(
      binary,
      [
        '--headless',
        '--norestore',
        '--convert-to',
        'pdf',
        '--outdir',
        TMP_DIR,
        docxPath,
      ],
      {
        timeout: 60_000, // 60 second timeout for large documents
        env: {
          ...process.env,
          HOME: TMP_DIR, // LibreOffice needs a writable HOME
        },
      }
    );

    // 3. Read the resulting PDF
    try {
      const pdfBuffer = await fs.readFile(expectedPdfPath);
      logger.info(`Converted DOCX to PDF (${pdfBuffer.length} bytes)`);
      return pdfBuffer;
    } catch {
      throw new Error(
        'LibreOffice conversion completed but output PDF was not found. ' +
          'The DOCX file may be corrupted or in an unsupported format.'
      );
    }
  } catch (error: any) {
    // Re-throw our own errors as-is
    if (error.message?.includes('PDF conversion unavailable') ||
        error.message?.includes('output PDF was not found')) {
      throw error;
    }
    logger.error('LibreOffice conversion failed:', error);
    throw new Error(`PDF conversion failed: ${error.message || 'Unknown error'}`);
  } finally {
    // 4. Clean up temp files — fire and forget
    fs.unlink(docxPath).catch(() => {});
    fs.unlink(expectedPdfPath).catch(() => {});
  }
}

/**
 * Convert a DOCX buffer to PDF, returning null instead of throwing if
 * conversion is not available. Useful for optional PDF offering in endpoints.
 */
export async function tryConvertDocxToPdf(docxBuffer: Buffer): Promise<Buffer | null> {
  try {
    return await convertDocxToPdf(docxBuffer);
  } catch (error: any) {
    logger.warn(`PDF conversion skipped: ${error.message}`);
    return null;
  }
}

export default {
  convertDocxToPdf,
  tryConvertDocxToPdf,
  isPdfConversionAvailable,
};
