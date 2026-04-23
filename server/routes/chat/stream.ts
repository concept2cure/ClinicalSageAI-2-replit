/**
 * POST /api/chat/stream
 * Stream chat responses via Server-Sent Events (SSE).
 * Same provenance pipeline as /send-message but with real-time token delivery.
 */
import type { Request, Response } from 'express';
import type { GatewayMessage } from '../../services/ai-gateway/types.js';
import { getThreadMessages } from '../../services/chat-thread-helpers.js';
import { processResponseActions } from '../../services/ana-guidance-executor.js';
import { orchestrate } from '../../services/ana-ri/orchestrator.js';
import { ensureGateway, normalizeBody } from './shared.js';

export async function streamHandler(req: Request, res: Response) {
  normalizeBody(req);
  try {
    const { message, thread_id, system_prompt, project_id } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'message is required' });
    }

    const gw = ensureGateway();
    if (!gw || gw.getEnabledProviders().length === 0) {
      return res.status(503).json({
        error: 'No AI providers available. Configure ANTHROPIC_API_KEY or OPENAI_API_KEY.',
      });
    }

    const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId;
    const rawUserId = (req as any).userId || (req as any).user?.id;
    const numericOrgId = orgId ? (typeof orgId === 'string' ? Number(orgId) : orgId) : null;
    const numericUserId = typeof rawUserId === 'string' ? parseInt(rawUserId, 10) || 0 : (rawUserId ?? 0);

    // Set SSE headers
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });

    // Build messages — use orchestrator for enriched prompt with intent detection
    const orchestratorResult = orchestrate({ message });
    const systemContent = system_prompt || orchestratorResult.systemPrompt;
    const gwMessages: GatewayMessage[] = [
      { role: 'system', content: systemContent },
      { role: 'user', content: message },
    ];

    // If thread_id provided, load previous messages
    if (thread_id) {
      try {
        const history = await getThreadMessages(thread_id);
        if (history.length > 0) {
          const historyMessages = history.slice(-10).map((m: any) => ({
            role: m.role as 'user' | 'assistant',
            content: m.content,
          }));
          gwMessages.splice(1, 0, ...historyMessages);
        }
      } catch (_e) {
        /* ignore — proceed without history */
      }
    }

    const gwResponse = await gw.route({
      taskType: 'chat',
      messages: gwMessages,
      temperature: 0.7,
      maxTokens: 4096,
      stream: true,
      onStream: (chunk: string, metadata?: any) => {
        res.write(
          `data: ${JSON.stringify({
            type: metadata?.type || 'text',
            content: chunk,
          })}\n\n`
        );
      },
      callerModule: 'ana-ri-chat-stream',
    });

    // Governed action parity: run processResponseActions on the full response
    // (same pattern as /send-message — non-blocking, non-fatal)
    let executedActions: Array<{
      actionType: string;
      executed: boolean;
      artifactId: string | null;
    }> = [];

    if (numericOrgId && project_id && gwResponse.content) {
      try {
        const actionResult = await processResponseActions(gwResponse.content, {
          projectId: typeof project_id === 'string' ? parseInt(project_id, 10) : project_id,
          organizationId: numericOrgId,
          userId: numericUserId,
          userName: (req as any).user?.name || (req as any).user?.email || 'System',
          threadId: thread_id || undefined,
        });

        if (actionResult.actions.length > 0) {
          executedActions = actionResult.actions.map((a: any) => ({
            actionType: a.actionType,
            executed: a.executed,
            artifactId: a.artifactId,
          }));
        }
      } catch (actionErr: any) {
        console.warn('[Chat Stream] Guidance action processing failed:', actionErr?.message);
      }
    }

    // Send final event (includes any governed actions that were executed)
    res.write(
      `data: ${JSON.stringify({
        type: 'done',
        model: gwResponse.model,
        provider: gwResponse.provider,
        usage: gwResponse.usage,
        latencyMs: gwResponse.latencyMs,
        ...(executedActions.length > 0 ? { executedActions } : {}),
      })}\n\n`
    );

    res.end();
  } catch (error: any) {
    console.error('[Chat Stream] Error:', error.message);
    if (res.headersSent) {
      res.write(
        `data: ${JSON.stringify({ type: 'error', error: 'An error occurred while generating the response' })}\n\n`
      );
      res.end();
    } else {
      res.status(500).json({ error: 'An error occurred while generating the response' });
    }
  }
}
