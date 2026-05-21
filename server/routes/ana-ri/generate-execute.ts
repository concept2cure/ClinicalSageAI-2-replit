/**
 * Governed-artifact generation (POST /generate) and operational command
 * execution (POST /execute) endpoints. Both are privileged side-effect paths
 * that require an authenticated tenant context.
 *
 * Extracted from ana-ri.ts. Mounted via {@link mountGenerateExecuteRoutes}.
 *
 * @module server/routes/ana-ri/generate-execute
 */

import type { Request, Response, Router } from 'express';

import { sendSuccess, sendError, extractRequestContext } from './shared.js';

import { createScopedLogger } from '../../utils/logger.js';

const logger = createScopedLogger('generate-execute');

/** Register /generate and /execute endpoints on the given router. */
export function mountGenerateExecuteRoutes(router: Router): void {
  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/ana-ri/generate — Generate Governed Artifact
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/generate', async (req: Request, res: Response) => {
    try {
      const {
        action_type,
        conversation_context,
        project_id,
        title,
        section_code,
        user_role,
        intent_lens,
      } = req.body;

      const VALID_ACTIONS = [
        'risk_memo',
        'deficiency_preemption_memo',
        'evidence_memo',
        'strategy_note',
        'reviewer_question_brief',
        'rewritten_section',
        'revised_artifact',
        'attach_to_dossier',
      ];
      if (!action_type || typeof action_type !== 'string' || !VALID_ACTIONS.includes(action_type)) {
        return sendError(
          res,
          400,
          `Invalid action_type. Must be one of: ${VALID_ACTIONS.join(', ')}`,
          null,
          'INVALID_ACTION'
        );
      }

      if (
        !conversation_context ||
        !Array.isArray(conversation_context) ||
        conversation_context.length === 0
      ) {
        return sendError(res, 400, 'conversation_context is required', null, 'INVALID_CONTEXT');
      }

      if (!project_id) {
        return sendError(res, 400, 'project_id is required', null, 'MISSING_PROJECT');
      }

      const { orgId, userId } = extractRequestContext(req);

      if (!orgId) {
        return sendError(res, 403, 'Organization context required', null, 'NO_ORG');
      }

      const { generateArtifact } = await import('../../services/ana-ri/artifact-generator.js');

      const result = await generateArtifact({
        actionType: action_type as any,
        conversationContext: conversation_context,
        projectId: Number(project_id),
        organizationId: orgId ? Number(orgId) : 0,
        userId: userId ? Number(userId) : undefined,
        userRole: user_role,
        intentLens: intent_lens,
        title,
        sectionCode: section_code,
      } as any);

      if (!result.success || result.persistenceStatus !== 'persisted') {
        return sendError(
          res,
          502,
          result.error || result.persistenceError || 'Artifact generation failed',
          {
            persisted: result.persisted,
            persistenceStatus: result.persistenceStatus,
          },
          result.persistenceStatus && result.persistenceStatus !== 'persisted'
            ? 'PERSISTENCE_FAILED'
            : 'GENERATION_FAILED'
        );
      }

      return sendSuccess(res, {
        content: result.content,
        title: result.title,
        artifactId: result.artifactId,
        isNew: result.isNew,
        provider: result.provider,
        model: result.model,
      });
    } catch (error: any) {
      logger.error('Generate error', { err: error instanceof Error ? error.message : String(error) });
      return sendError(res, 500, error?.message || 'Internal server error', null, 'INTERNAL_ERROR');
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  // POST /api/ana-ri/execute — Execute AnA commands (project/doc/task ops)
  // ─────────────────────────────────────────────────────────────────────────
  router.post('/execute', async (req: Request, res: Response) => {
    try {
      const { command, params } = req.body;

      if (!command || typeof command !== 'string') {
        return sendError(res, 400, 'command is required', null, 'INVALID_COMMAND');
      }

      const { orgId, userId } = extractRequestContext(req);

      if (!orgId || !userId) {
        return sendError(res, 403, 'Authentication required', null, 'NO_AUTH');
      }

      // CommandContext is a TypeScript interface — cannot destructure at runtime
      const executor = await import('../../services/ana-ri/command-executor.js');

      const ctx = {
        userId: Number(userId),
        organizationId: orgId ? Number(orgId) : undefined,
        activeProjectId: params?.projectId ? Number(params.projectId) : undefined,
        userName: (req as any).user?.name,
        userRole: (req as any).user?.role || (req as any).user?.title,
      };

      const isKnownCommand = executor.COMMAND_REGISTRY.some((c: any) => c.name === command);
      if (!isKnownCommand) {
        return sendError(
          res,
          400,
          `Unknown command: ${command}`,
          { availableCommands: executor.COMMAND_REGISTRY.map((c: any) => c.name) },
          'UNKNOWN_COMMAND'
        );
      }

      const [result] = await executor.executeCommands([{ command: command as any, params: params || {} }], ctx as any);

      return sendSuccess(
        res,
        result || {
          success: false,
          action: command,
          message: `Command ${command} did not produce a result.`,
        }
      );
    } catch (error: any) {
      logger.error('Command execution error', { err: error instanceof Error ? error.message : String(error) });
      return sendError(
        res,
        500,
        error?.message || 'Command execution failed',
        null,
        'EXECUTION_ERROR'
      );
    }
  });
}
