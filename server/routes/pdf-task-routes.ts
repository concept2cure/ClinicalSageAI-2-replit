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
    const filePath = path.join(exportsDir, filename);

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
