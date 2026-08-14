/**
 * PDF Task Routes
 *
 * This module provides API endpoints for enhanced PDF generation with email notifications
 * by invoking Python scripts as background tasks.
 */

import { Router, Request, Response } from 'express';
import { spawn } from 'child_process';
import { v4 as uuidv4 } from 'uuid';
import path from 'path';
import fs from 'fs';
import { z } from 'zod';
import {
  COMPRESSION_PROFILES,
  compressPdfBatch,
  compressPdfWithGhostscript,
  isGhostscriptAvailable,
  recommendCompressionQuality,
} from '../services/pdf-compression-service.js';

const router = Router();
const qualityEnum = z.enum(['screen', 'ebook', 'printer', 'prepress', 'default']);
const compressSchema = z.object({
  inputPath: z.string().min(1),
  outputPath: z.string().min(1).optional(),
  quality: qualityEnum.optional(),
});
const recommendSchema = z.object({
  inputPath: z.string().min(1),
});
const batchSchema = z.object({
  defaultQuality: qualityEnum.optional(),
  files: z
    .array(
      z.object({
        inputPath: z.string().min(1),
        outputPath: z.string().min(1).optional(),
        quality: qualityEnum.optional(),
      })
    )
    .min(1),
});

// Initialize exports directory if it doesn't exist
const exportsDir = path.join(process.cwd(), 'data', 'exports');
if (!fs.existsSync(exportsDir)) {
  fs.mkdirSync(exportsDir, { recursive: true });
}

const renderMarkdownPdfSchema = z.object({
  title: z.string().max(300).optional(),
  markdown: z.string().min(1),
  compress: z.boolean().optional(),
  quality: qualityEnum.optional(),
});

/**
 * POST /api/pdf-tasks/render-markdown-pdf
 *
 * Render draft markdown to a PDF, with optional best-effort Ghostscript
 * compression. Backs the Document Studio's "Download as PDF" (CC-P1).
 *
 * The base PDF is JS-native (pdfkit) and always produced. Compression is
 * best-effort: if Ghostscript is unavailable — or the pass errors — the
 * uncompressed PDF is returned with `X-Compression-Skipped` set, never a 5xx.
 *
 * Body: { title?, markdown, compress?, quality? }
 * Response: application/pdf (binary). Headers:
 *   X-Compression-Skipped: <reason>  — only when compression was requested but skipped
 *   X-Compression-Ratio:   <0..1>    — only when compression ran
 */
router.post('/render-markdown-pdf', async (req: Request, res: Response) => {
  const parsed = renderMarkdownPdfSchema.safeParse(req.body);
  if (!parsed.success) {
    return res
      .status(400)
      .json({ error: 'markdown (non-empty string) is required', details: parsed.error.flatten() });
  }
  const { title, markdown, compress, quality } = parsed.data;

  try {
    const { renderMarkdownDraftToPDF } = await import('../services/documentExportService.js');
    let pdf = await renderMarkdownDraftToPDF(title || 'Document', markdown);

    let compressionSkipped: string | null = null;
    let compressionRatio: number | null = null;

    if (compress === true) {
      const q = quality || 'ebook';
      if (!(await isGhostscriptAvailable())) {
        compressionSkipped = 'ghostscript_unavailable';
      } else {
        const workDir = fs.mkdtempSync(path.join(exportsDir, 'pdf-'));
        const inPath = path.join(workDir, 'in.pdf');
        const outPath = path.join(workDir, 'out.pdf');
        try {
          fs.writeFileSync(inPath, pdf);
          const result = await compressPdfWithGhostscript({
            inputPath: inPath,
            outputPath: outPath,
            quality: q,
          });
          pdf = fs.readFileSync(outPath);
          compressionRatio = result.compressionRatio;
        } catch (e) {
          // Never lose the produced PDF on a compression error.
          compressionSkipped = `ghostscript_error:${(e instanceof Error ? e.message : String(e)).slice(0, 120)}`;
        } finally {
          fs.rmSync(workDir, { recursive: true, force: true });
        }
      }
    }

    const stem = (title || 'document').replace(/[^\w.-]+/g, '_').slice(0, 80) || 'document';
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${stem}.pdf"`);
    res.setHeader('Access-Control-Expose-Headers', 'X-Compression-Skipped, X-Compression-Ratio');
    if (compressionSkipped) res.setHeader('X-Compression-Skipped', compressionSkipped);
    if (compressionRatio !== null) res.setHeader('X-Compression-Ratio', String(compressionRatio));
    return res.status(200).end(pdf);
  } catch (err) {
    console.error('Error rendering markdown PDF:', err);
    return res
      .status(500)
      .json({ error: 'PDF render failed', message: err instanceof Error ? err.message : String(err) });
  }
});

/**
 * Schedule enhanced PDF generation with email notification
 */
router.post('/cer/:ndcCode/enhanced-pdf-task', async (req: Request, res: Response) => {
  try {
    const { ndcCode } = req.params;
    const userId = req.body.userId || 'test-user'; // In a real app, get from auth token

    // Generate a task ID for tracking
    const taskId = uuidv4();

    // Log the request
    console.log(
      `Scheduling enhanced PDF generation for NDC: ${ndcCode}, User: ${userId}, Task ID: ${taskId}`
    );

    // Run the Python script
    const pythonProcess = spawn('python3', [
      'cer_tasks.py',
      '--ndc',
      ndcCode,
      '--user',
      userId,
      '--task',
      taskId,
    ]);

    // Handle the process output
    let outputData = '';
    let errorData = '';

    pythonProcess.stdout.on('data', data => {
      outputData += data.toString();
    });

    pythonProcess.stderr.on('data', data => {
      errorData += data.toString();
      console.error(`PDF task error: ${data}`);
    });

    // Don't wait for the process to complete
    // Just send back a response that the task has been scheduled
    res.status(202).json({
      message: "PDF generation started in background. You will receive an email when it's ready.",
      taskId: taskId,
      ndcCode: ndcCode,
    });

    // Handle process completion (for logging purposes)
    pythonProcess.on('close', code => {
      if (code !== 0) {
        console.error(`PDF background task process exited with code ${code}`);
        console.error(`Error: ${errorData}`);
      } else {
        console.log(`PDF background task started successfully for Task ID: ${taskId}`);
        console.log(`Output: ${outputData}`);
      }
    });
  } catch (error) {
    console.error('Error scheduling PDF generation:', error);
    res.status(500).json({
      error: 'Error scheduling PDF generation task',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * Check status of a scheduled PDF generation task
 */
router.get('/tasks/:taskId/status', async (req: Request, res: Response) => {
  try {
    const { taskId } = req.params;

    // In a real implementation, you would query a database to get task status
    // For this example, we'll just return a placeholder

    res.json({
      taskId: taskId,
      status: 'processing', // Could be 'queued', 'processing', 'completed', 'failed'
      message: 'Your PDF is being generated. You will receive an email when it is ready.',
    });
  } catch (error) {
    console.error('Error checking task status:', error);
    res.status(500).json({ error: 'Error checking task status' });
  }
});

/**
 * List available PDF exports for a specific NDC code
 */
router.get('/cer/:ndcCode/exports', async (req: Request, res: Response) => {
  try {
    const { ndcCode } = req.params;

    // Read the exports directory for matching files
    const files = fs
      .readdirSync(exportsDir)
      .filter(file => file.includes(`CER_Report_${ndcCode}`))
      .map(file => {
        const stat = fs.statSync(path.join(exportsDir, file));
        return {
          filename: file,
          created: stat.birthtime,
          size: stat.size,
          url: `/api/pdf-tasks/download/${file}`,
        };
      })
      .sort((a, b) => b.created.getTime() - a.created.getTime()); // Sort newest first

    res.json({
      ndcCode: ndcCode,
      exports: files,
    });
  } catch (error) {
    console.error('Error listing PDF exports:', error);
    res.status(500).json({ error: 'Error listing PDF exports' });
  }
});

/**
 * Download a specific PDF export
 */
router.get('/download/:filename', async (req: Request, res: Response) => {
  try {
    const { filename } = req.params;
    // basename: `filename` is a route param joined onto a path. Express decodes
    // %2F, so `..%2F..%2F.env` arrives here as real traversal — "it is only one
    // path segment" is not a defence.
    const filePath = path.join(exportsDir, path.basename(String(filename)));

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Send the file
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

    const fileStream = fs.createReadStream(filePath);
    fileStream.pipe(res);
  } catch (error) {
    console.error('Error downloading PDF:', error);
    res.status(500).json({ error: 'Error downloading PDF' });
  }
});

/**
 * Compress an existing PDF via Ghostscript.
 * Body: { inputPath: string, outputPath?: string, quality?: 'screen'|'ebook'|'printer'|'prepress'|'default' }
 */
router.post('/compress', async (req: Request, res: Response) => {
  try {
    const parsed = compressSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map(issue => issue.message),
      });
    }
    const { inputPath, outputPath, quality } = parsed.data;

    const available = await isGhostscriptAvailable();
    if (!available) {
      return res.status(503).json({ error: 'Ghostscript not available on server runtime' });
    }

    const result = await compressPdfWithGhostscript({
      inputPath,
      outputPath: typeof outputPath === 'string' ? outputPath : undefined,
      quality: quality || 'ebook',
    });

    return res.json({
      ok: true,
      result,
      message: `Compressed PDF saved to ${result.outputPath}`,
    });
  } catch (error) {
    console.error('Error compressing PDF:', error);
    return res.status(500).json({
      error: 'PDF compression failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/compress/profiles', (_req: Request, res: Response) => {
  return res.json({
    ok: true,
    profiles: COMPRESSION_PROFILES,
  });
});

router.post('/compress/recommend', async (req: Request, res: Response) => {
  try {
    const parsed = recommendSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map(issue => issue.message),
      });
    }
    const { inputPath } = parsed.data;

    const recommendation = await recommendCompressionQuality(inputPath);
    return res.json({ ok: true, recommendation });
  } catch (error) {
    return res.status(500).json({
      error: 'Failed to recommend compression profile',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.post('/compress/batch', async (req: Request, res: Response) => {
  try {
    const parsed = batchSchema.safeParse(req.body || {});
    if (!parsed.success) {
      return res.status(400).json({
        error: 'Invalid request body',
        details: parsed.error.issues.map(issue => issue.message),
      });
    }
    const { files, defaultQuality } = parsed.data;

    const available = await isGhostscriptAvailable();
    if (!available) {
      return res.status(503).json({ error: 'Ghostscript not available on server runtime' });
    }

    const result = await compressPdfBatch({ files, defaultQuality });

    return res.json({
      ok: true,
      summary: result.summary,
      result,
    });
  } catch (error) {
    return res.status(500).json({
      error: 'Batch PDF compression failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
