/**
 * Helpers shared across the AnA RI per-route modules.
 *
 * Nothing here owns behaviour — these are the small utilities and singletons
 * that two or more route files need. Per-handler helpers stay in their own
 * module; anything that lives here has at least two importers.
 *
 * @module server/routes/ana-ri/shared
 */

import type { Request, Response } from 'express';

import { getGateway } from '../../services/ai-gateway/index.js';
import { getPool } from '../../db.js';
import type { IntentLens, UserRole } from '../../services/ana-ri/index.js';

// ─── Response envelope helpers (match concept2cure.ts contract) ──────────────

/** Success envelope — `{ success: true, data, meta? }`. */
export const sendSuccess = <T>(
  res: Response,
  data: T,
  meta?: Record<string, unknown>
) => {
  if (meta) return res.json({ success: true, data, meta });
  return res.json({ success: true, data });
};

/** Error envelope — `{ success: false, error: { message, code?, details? } }`. */
export const sendError = (
  res: Response,
  status: number,
  message: string,
  details?: unknown,
  code?: string
) =>
  res
    .status(status)
    .json({ success: false, error: { message, code, details } });

// ─── Request context extractor ───────────────────────────────────────────────

/**
 * Normalise the tenant + user identity stamped onto the request by middleware.
 * All AnA RI handlers need this shape so the gateway / memory / persistence
 * paths can scope correctly.
 */
export function extractRequestContext(req: Request): {
  orgId: number | null;
  userId: number;
  numericOrgId: number | null;
} {
  const orgId = (req as any).tenantId || (req as any).tenantContext?.organizationId || null;
  const userId = (req as any).userId || (req as any).user?.id || 'anonymous';
  return {
    orgId: orgId ? Number(orgId) : null,
    userId: typeof userId === 'number' ? userId : 0,
    numericOrgId: orgId ? Number(orgId) : null,
  };
}

// ─── Gateway singleton ───────────────────────────────────────────────────────

let gatewayInstance: ReturnType<typeof getGateway> | null = null;

/**
 * Lazy gateway accessor. Swallows init errors so route handlers can fall
 * through to a clean 503 instead of crashing on startup when the provider
 * env is misconfigured.
 */
export function ensureGateway(): ReturnType<typeof getGateway> | null {
  if (!gatewayInstance) {
    try {
      gatewayInstance = getGateway();
    } catch (e: any) {
      console.error('[AnA RI] AI Gateway initialization failed:', e?.message);
    }
  }
  return gatewayInstance;
}

// ─── Database liveness probe ─────────────────────────────────────────────────

/** Non-throwing `SELECT 1` against the main pool. Used by /health. */
export function isDatabaseAvailable(): Promise<boolean> {
  try {
    const p = getPool();
    return p
      .query('SELECT 1')
      .then(() => true)
      .catch(() => false);
  } catch {
    return Promise.resolve(false);
  }
}

// ─── Enum validation sets (intent lens + user role) ──────────────────────────

export const VALID_LENSES: Set<IntentLens> = new Set<IntentLens>([
  'auto',
  'audit',
  'improve',
  'risk',
  'strategy',
  'compare',
]);

export const VALID_ROLES: Set<UserRole> = new Set<UserRole>([
  'ceo',
  'ra_lead',
  'medical_writer',
  'clinical_lead',
  'cmc_lead',
  'investor',
  'general',
]);

// Response languages AnA can answer in. Mirrors the client language registry
// (client/src/i18n/languages.ts) and persona.ts LANGUAGE_OVERLAYS.
export const VALID_LANGUAGES: Set<string> = new Set<string>([
  'en',
  'fr',
  'de',
  'ja',
  'zh',
  'ko',
  'es',
]);
