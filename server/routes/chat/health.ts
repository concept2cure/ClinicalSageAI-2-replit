/**
 * Chat service health probe.
 * Reports AI provider configuration and active chat thread count.
 */
import type { Request, Response } from 'express';
import { pool } from '../../db.js';

export const healthHandler = async (req: Request, res: Response) => {
  const hasApiKey = !!process.env.ANTHROPIC_API_KEY || !!process.env.OPENAI_API_KEY;

  let threadCount = 0;
  try {
    const result = await pool.query('SELECT COUNT(*)::int AS count FROM chat_threads');
    threadCount = result.rows[0]?.count || 0;
  } catch (e) {
    /* ignore */
  }

  res.json({
    status: hasApiKey ? 'healthy' : 'degraded',
    service: 'AnA Chat',
    ai_configured: hasApiKey,
    primary_provider: process.env.ANTHROPIC_API_KEY ? 'anthropic' : 'openai',
    active_threads: threadCount,
    persistence: 'postgresql',
    timestamp: new Date().toISOString(),
  });
};
