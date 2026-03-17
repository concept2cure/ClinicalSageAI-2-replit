/**
 * Document Preview Routes
 *
 * GET /api/documents/:id/preview
 *   Query params:
 *     - format: "html" (default) | "thumbnail"
 *
 * Returns an HTML preview of the document content. For PDF documents,
 * serves the PDF file directly so the browser's built-in viewer can handle it.
 *
 * Includes tenant isolation via organizationId header check.
 */

import { Router, Request, Response } from 'express';
import {
  generateHtmlPreview,
  DocumentPreviewError,
} from '../services/documentPreviewService';
import fs from 'fs';

const router = Router();

router.get('/:id/preview', async (req: Request, res: Response) => {
  try {
    const documentId = Number(req.params.id);
    if (isNaN(documentId) || documentId <= 0) {
      return res.status(400).json({ error: 'Invalid document ID' });
    }

    const format = (req.query.format as string) || 'html';

    // Extract organization ID for tenant isolation
    const orgHeader = req.headers['x-organization-id'] as string | undefined;
    const organizationId = orgHeader ? Number(orgHeader) : null;

    const result = await generateHtmlPreview(documentId, organizationId);

    // PDF handling – serve the file directly
    if (result.isPdf && result.pdfPath) {
      if (!fs.existsSync(result.pdfPath)) {
        return res.status(404).json({ error: 'PDF file no longer available' });
      }
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader(
        'Content-Disposition',
        `inline; filename="${encodeURIComponent(result.documentTitle)}.pdf"`
      );
      return fs.createReadStream(result.pdfPath).pipe(res);
    }

    // Thumbnail format – return a minimal JSON payload with a snippet
    if (format === 'thumbnail') {
      // Extract first ~300 chars of text content for thumbnail usage
      const textOnly = result.html
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
      const snippet = textOnly.substring(0, 300) + (textOnly.length > 300 ? '...' : '');

      return res.json({
        documentId,
        title: result.documentTitle,
        snippet,
        previewUrl: `/api/documents/${documentId}/preview?format=html`,
      });
    }

    // Default: return full HTML preview
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'private, max-age=60');
    return res.send(result.html);
  } catch (err: any) {
    if (err instanceof DocumentPreviewError) {
      return res.status(err.statusCode).json({ error: err.message });
    }
    console.error('Document preview error:', err);
    return res.status(500).json({ error: 'Failed to generate document preview' });
  }
});

export default router;
