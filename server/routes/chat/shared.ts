/**
 * Shared helpers for chat route handlers.
 *
 * - `ensureGateway` lazy-initializes the AI Gateway and caches it per process.
 * - `normalizeBody` maps useChat's `context.projectId` → top-level `project_id`.
 *
 * @module server/routes/chat/shared
 */

import type { Request } from 'express';
import { getGateway } from '../../services/ai-gateway/index.js';

let gateway: ReturnType<typeof getGateway> | null = null;

/** Lazy-init the AI Gateway. Returns null if initialization fails. */
export function ensureGateway() {
  if (!gateway) {
    try {
      gateway = getGateway();
    } catch (e: any) {
      console.error('[AnA] AI Gateway initialization failed:', e?.message);
    }
  }
  return gateway;
}

/** Normalize useChat payload: map context.projectId → project_id */
export function normalizeBody(req: Request) {
  if (req.body.context?.projectId && !req.body.project_id) {
    req.body.project_id = req.body.context.projectId;
  }
}
