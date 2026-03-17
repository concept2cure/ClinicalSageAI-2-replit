/**
 * Universal Packager API Routes
 *
 * Single unified endpoint for all document packaging and export needs.
 * Replaces the need to call different endpoints for PDF, DOCX, ZIP, etc.
 *
 * @module server/routes/universal-packager
 */

import { Router, Request, Response } from 'express';
import {
  packageDeliverable,
  packageSingleFormat,
  type PackageRequest,
  type PackageFormat,
} from '../services/universal-packager';

const router = Router();

/**
 * POST /api/packager/generate
 * Generate one or more output formats from content.
 *
 * Body: PackageRequest
 * Returns: JSON with download URLs or inline base64 buffers.
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const request: PackageRequest = req.body;

    if (!request.title || !request.content) {
      return res.status(400).json({
        success: false,
        error: 'title and content are required',
      });
    }

    if (!request.formats?.length) {
      return res.status(400).json({
        success: false,
        error: 'At least one format must be specified',
      });
    }

    // Validate formats
    const validFormats: PackageFormat[] = ['pdf', 'docx', 'xlsx', 'csv', 'json', 'xml', 'zip', 'ectd-zip', 'html'];
    const invalidFormats = request.formats.filter(f => !validFormats.includes(f));
    if (invalidFormats.length > 0) {
      return res.status(400).json({
        success: false,
        error: `Invalid formats: ${invalidFormats.join(', ')}. Valid: ${validFormats.join(', ')}`,
      });
    }

    const result = await packageDeliverable(request);

    // Return metadata + base64 encoded outputs
    return res.json({
      success: true,
      jobId: result.jobId,
      generationTimeMs: result.generationTimeMs,
      checksums: result.checksums,
      audit: result.audit,
      outputs: result.outputs.map(o => ({
        format: o.format,
        fileName: o.fileName,
        mimeType: o.mimeType,
        sizeBytes: o.sizeBytes,
        checksum: o.checksum,
        data: o.buffer.toString('base64'),
      })),
    });
  } catch (err: any) {
    console.error('[UniversalPackager] POST /generate error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/packager/download/:format
 * Generate a single format and stream it as a file download.
 *
 * Body: { title, content, contentType?, metadata?, style?, sections? }
 */
router.post('/download/:format', async (req: Request, res: Response) => {
  try {
    const format = req.params.format as PackageFormat;
    const { title, content, contentType, metadata, style, sections } = req.body;

    if (!title || !content) {
      return res.status(400).json({ success: false, error: 'title and content are required' });
    }

    const result = await packageDeliverable({
      formats: [format],
      title,
      content,
      contentType,
      metadata,
      style,
      sections,
    });

    const output = result.outputs[0];
    if (!output) {
      return res.status(500).json({ success: false, error: `Failed to generate ${format}` });
    }

    // Set download headers
    res.setHeader('Content-Type', output.mimeType);
    res.setHeader('Content-Disposition', `attachment; filename="${output.fileName}"`);
    res.setHeader('Content-Length', output.sizeBytes);
    res.setHeader('X-Checksum-SHA256', output.checksum);
    res.setHeader('X-Generation-Time-Ms', String(result.generationTimeMs));

    return res.send(output.buffer);
  } catch (err: any) {
    console.error('[UniversalPackager] POST /download/:format error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/packager/multi-download
 * Generate multiple formats and return as a ZIP containing all outputs.
 */
router.post('/multi-download', async (req: Request, res: Response) => {
  try {
    const request: PackageRequest = req.body;

    if (!request.title || !request.content || !request.formats?.length) {
      return res.status(400).json({
        success: false,
        error: 'title, content, and formats are required',
      });
    }

    // Generate all formats
    const result = await packageDeliverable(request);

    if (result.outputs.length === 1) {
      // Single format — just download it directly
      const output = result.outputs[0];
      res.setHeader('Content-Type', output.mimeType);
      res.setHeader('Content-Disposition', `attachment; filename="${output.fileName}"`);
      res.setHeader('Content-Length', output.sizeBytes);
      return res.send(output.buffer);
    }

    // Multiple formats — bundle into ZIP
    const archiver = (await import('archiver')).default;
    const { Writable } = await import('stream');

    const chunks: Buffer[] = [];
    const writable = new Writable({
      write(chunk, _encoding, callback) {
        chunks.push(chunk);
        callback();
      },
    });

    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(writable);

    for (const output of result.outputs) {
      archive.append(output.buffer, { name: output.fileName });
    }

    // Add checksums manifest
    archive.append(
      JSON.stringify({ ...result.audit, checksums: result.checksums }, null, 2),
      { name: 'package_manifest.json' }
    );

    await archive.finalize();

    await new Promise<void>((resolve) => writable.on('finish', resolve));

    const zipBuffer = Buffer.concat(chunks);
    const zipFileName = `${request.title.replace(/[^a-zA-Z0-9]/g, '_')}_package.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
    res.setHeader('Content-Length', zipBuffer.length);

    return res.send(zipBuffer);
  } catch (err: any) {
    console.error('[UniversalPackager] POST /multi-download error:', err);
    return res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * GET /api/packager/formats
 * List all supported packaging formats.
 */
router.get('/formats', (_req: Request, res: Response) => {
  return res.json({
    success: true,
    formats: [
      { id: 'pdf', name: 'PDF', description: 'Portable Document Format — FDA submission standard', mimeType: 'application/pdf' },
      { id: 'docx', name: 'Word (DOCX)', description: 'Microsoft Word — editable regulatory documents', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' },
      { id: 'xlsx', name: 'Excel (XLSX)', description: 'Microsoft Excel — tabular data, listings, analyses', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' },
      { id: 'csv', name: 'CSV', description: 'Comma-separated values — data interchange', mimeType: 'text/csv' },
      { id: 'json', name: 'JSON', description: 'Structured data — API interchange', mimeType: 'application/json' },
      { id: 'html', name: 'HTML', description: 'Web format — preview and review', mimeType: 'text/html' },
      { id: 'zip', name: 'ZIP Package', description: 'Bundled package with multiple files', mimeType: 'application/zip' },
      { id: 'ectd-zip', name: 'eCTD Package', description: 'ICH eCTD-compliant submission package', mimeType: 'application/zip' },
    ],
  });
});

export default router;
