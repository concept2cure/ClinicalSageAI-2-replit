/**
 * Nano Banana Routes — Google Gemini Image Generation API
 *
 * POST /api/nano-banana/generate     — Generate image(s) from a prompt
 * POST /api/nano-banana/edit         — Edit an existing image with a prompt
 * POST /api/nano-banana/presentation — Generate a PPTX deck with AI visuals
 * POST /api/nano-banana/chat         — Conversational mode (auto-detects intent)
 * GET  /api/nano-banana/health       — Check if Gemini API key is configured
 */

import { Router, type Request, type Response } from 'express';
import {
  generateImage,
  generatePresentation,
  chatWithNanoBanana,
  isConfigured,
} from '../services/nanoBananaService';

const router = Router();

// ─── Health check ─────────────────────────────────────────────────────────────

router.get('/health', (_req: Request, res: Response) => {
  res.json({
    service: 'nano-banana',
    configured: isConfigured(),
    models: {
      fast: 'gemini-2.0-flash-preview-image-generation',
      pro: 'gemini-2.0-flash-exp',
    },
  });
});

// ─── Generate Image ───────────────────────────────────────────────────────────

router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { prompt, quality, count, style } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }

    const result = await generateImage({
      prompt,
      quality: quality || 'fast',
      count: Math.min(count || 1, 4),
      style,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[nano-banana] generate error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Image generation failed',
    });
  }
});

// ─── Edit Image ───────────────────────────────────────────────────────────────

router.post('/edit', async (req: Request, res: Response) => {
  try {
    const { prompt, referenceImage, referenceMimeType, quality, style } = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required' });
    }
    if (!referenceImage) {
      return res.status(400).json({ error: 'referenceImage (base64) is required' });
    }

    const result = await generateImage({
      prompt,
      referenceImage,
      referenceMimeType: referenceMimeType || 'image/png',
      quality: quality || 'fast',
      style,
    });

    return res.json({
      success: true,
      ...result,
    });
  } catch (err: any) {
    console.error('[nano-banana] edit error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Image editing failed',
    });
  }
});

// ─── Generate Presentation ────────────────────────────────────────────────────

router.post('/presentation', async (req: Request, res: Response) => {
  try {
    const { topic, slideCount, audience, generateImages } = req.body;

    if (!topic || typeof topic !== 'string') {
      return res.status(400).json({ error: 'topic is required' });
    }

    const result = await generatePresentation({
      topic,
      slideCount: slideCount || 6,
      audience: audience || 'scientific',
      generateImages: generateImages !== false,
    });

    // Send PPTX as downloadable file
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
    res.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    res.setHeader('X-Slide-Count', String(result.slideCount));

    if (result.coverImage) {
      res.setHeader('X-Cover-Image', 'true');
    }

    return res.send(result.pptxBuffer);
  } catch (err: any) {
    console.error('[nano-banana] presentation error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Presentation generation failed',
    });
  }
});

// ─── Conversational Chat Mode ─────────────────────────────────────────────────

router.post('/chat', async (req: Request, res: Response) => {
  try {
    const { message, conversationHistory } = req.body;

    if (!message || typeof message !== 'string') {
      return res.status(400).json({ error: 'message is required' });
    }

    const result = await chatWithNanoBanana(message, conversationHistory || []);

    // If a PPTX was generated, encode it as base64 for JSON transport
    const response: any = {
      success: true,
      response: result.text,
      images: result.images,
    };

    if (result.pptxBuffer) {
      response.pptx = {
        base64: result.pptxBuffer.toString('base64'),
        filename: result.pptxFilename,
        mimeType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
      };
    }

    return res.json(response);
  } catch (err: any) {
    console.error('[nano-banana] chat error:', err.message);
    return res.status(500).json({
      success: false,
      error: err.message || 'Nano Banana chat failed',
    });
  }
});

export default router;
