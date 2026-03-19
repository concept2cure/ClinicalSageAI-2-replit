/**
 * AI Completion API Route
 *
 * Server-side proxy for client AI requests. Routes through the AI Gateway
 * which defaults to Claude as the primary provider. This replaces direct
 * OpenAI calls from the browser (which exposed API keys).
 *
 * @module server/routes/ai-completion
 */

import { Router, Request, Response } from 'express';
import { ai } from '../lib/unified-ai-client';
import type { TaskType } from '../services/ai-gateway/types';

const router = Router();

router.post('/ai/completion', async (req: Request, res: Response) => {
  try {
    const {
      taskType = 'general',
      systemPrompt,
      userPrompt,
      messages: rawMessages,
      jsonMode = false,
      maxTokens = 2000,
      temperature,
    } = req.body;

    if (!userPrompt && !rawMessages) {
      return res.status(400).json({ error: 'userPrompt or messages is required' });
    }

    const messages = rawMessages || [
      ...(systemPrompt ? [{ role: 'system', content: systemPrompt }] : []),
      { role: 'user', content: typeof userPrompt === 'string' ? userPrompt : JSON.stringify(userPrompt) },
    ];

    if (jsonMode) {
      const result = await ai.structured(messages, undefined, {
        taskType: taskType as TaskType,
        maxTokens,
        temperature,
        callerModule: `ai-completion/${taskType}`,
      });
      return res.json(result);
    }

    const result = await ai.chat(messages, {
      taskType: taskType as TaskType,
      maxTokens,
      temperature,
      callerModule: `ai-completion/${taskType}`,
    });

    return res.json({
      content: result.content,
      provider: result.provider,
      model: result.model,
      usage: result.usage,
    });
  } catch (error: any) {
    console.error('[ai-completion] Error:', error.message);
    return res.status(500).json({ error: 'AI completion failed', details: error.message });
  }
});

export default router;
