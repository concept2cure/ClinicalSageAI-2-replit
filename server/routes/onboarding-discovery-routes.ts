/**
 * Saved discovery for the caller's active organization. Questionnaire needs
 * are distinct from provisioned projects, security policy and account persona.
 * Uses the single settings writer: row lock, revision check, settings update
 * and chained audit row commit together on the tenant-pinned connection.
 */
import { Router, type Request } from 'express';
import rateLimit from 'express-rate-limit';
import { eq } from 'drizzle-orm';
import { organizations } from '@shared/schema';
import {
  assessOnboardingDiscovery,
  emptyDiscoveryAnswers,
  onboardingDiscoveryPatchSchema,
  onboardingDiscoveryRecordSchema,
  type OnboardingDiscoveryRecord,
  type OnboardingDiscoveryResponse,
} from '@shared/types/onboarding-discovery';
import { authMiddleware } from '../auth';
import { requestDb } from '../db/requestDb';
import { governedActorId } from '../middleware/orgMembership';
import { authedOrgId, usableOrgId } from '../utils/authedOrgId';
import { asSettings, writeTenantSettings, type Settings } from '../services/tenant/tenant-settings-writer';
import { createScopedLogger } from '../utils/logger';

const router = Router();
const log = createScopedLogger('onboarding-discovery');
router.use(rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false }));
router.use(authMiddleware);

function canEditDiscovery(req: Request): boolean {
  // Canonical auth re-checks this membership on every request. Platform role
  // spellings and a second roles array never turn a member into an org admin.
  const role = req.userRole ?? req.user?.role;
  return role === 'admin' || role === 'owner';
}

class DiscoveryUnavailable extends Error {}
class DiscoveryRevisionConflict extends Error {}

function storedDiscovery(settings: Settings): OnboardingDiscoveryRecord | null {
  if (!Object.prototype.hasOwnProperty.call(settings, 'onboardingDiscovery')) return null;
  const parsed = onboardingDiscoveryRecordSchema.safeParse(settings.onboardingDiscovery);
  if (!parsed.success) throw new DiscoveryUnavailable('Stored discovery does not match the supported contract.');
  return parsed.data;
}

function discoveryResponse(record: OnboardingDiscoveryRecord | null, canEdit: boolean): OnboardingDiscoveryResponse {
  return { discovery: record, assessment: assessOnboardingDiscovery(record?.answers ?? emptyDiscoveryAnswers()), canEdit };
}

router.get('/', async (req, res) => {
  const orgId = usableOrgId(authedOrgId(req));
  if (orgId === null) return res.status(403).json({ success: false, error: 'An active organization context is required.' });
  try {
    const [org] = await requestDb(req).select({ settings: organizations.settings }).from(organizations).where(eq(organizations.id, orgId)).limit(1);
    if (!org) return res.status(404).json({ success: false, error: 'Organization not found.' });
    return res.json({ success: true, data: discoveryResponse(storedDiscovery(asSettings(org.settings)), canEditDiscovery(req)) });
  } catch (error) {
    log.error('Could not read organization discovery', { error: error instanceof Error ? error.message : String(error) });
    return res.status(503).json({ success: false, error: 'Discovery could not be loaded. Please try again.' });
  }
});

router.patch('/', async (req, res) => {
  const orgId = usableOrgId(authedOrgId(req));
  const actorId = governedActorId(req);
  if (orgId === null || actorId === null) return res.status(403).json({ success: false, error: 'An active organization and signed-in user are required.' });
  if (!canEditDiscovery(req)) return res.status(403).json({ success: false, error: 'An organization administrator or owner must save shared discovery.' });
  const parsed = onboardingDiscoveryPatchSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid discovery update.' });
  const { answers, expectedRevision, complete, reason } = parsed.data;
  const assessment = assessOnboardingDiscovery(answers);
  if (complete && !assessment.readyToComplete) {
    return res.status(422).json({ success: false, code: 'DISCOVERY_INCOMPLETE', error: 'Answer the required discovery questions before completing discovery.', missingFields: assessment.missingFields });
  }
  try {
    const stored = await writeTenantSettings(req, orgId, {
      action: 'tenant_settings_changed',
      discoveryDoor: true,
      // This callback runs after SELECT FOR UPDATE in the canonical writer;
      // reading a revision before that lock would lose simultaneous edits.
      next: current => {
        const before = storedDiscovery(current);
        if ((before?.revision ?? 0) !== expectedRevision) throw new DiscoveryRevisionConflict();
        const now = new Date().toISOString();
        const record: OnboardingDiscoveryRecord = {
          schemaVersion: 1, revision: expectedRevision + 1, answers,
          updatedAt: now, updatedBy: actorId, completedAt: complete ? now : null,
        };
        return { ...current, onboardingDiscovery: record };
      },
      sections: () => ['onboardingDiscovery'],
      reason,
    });
    if (!stored) return res.status(404).json({ success: false, error: 'Organization not found.' });
    return res.json({ success: true, data: discoveryResponse(storedDiscovery(stored), true), auditTrail: { persisted: true, chained: true } });
  } catch (error) {
    if (error instanceof DiscoveryRevisionConflict) {
      return res.status(409).json({ success: false, code: 'DISCOVERY_REVISION_CONFLICT', error: 'A teammate saved newer discovery answers. Reload discovery before saving your changes.' });
    }
    log.error('Could not save organization discovery', { error: error instanceof Error ? error.message : String(error) });
    return res.status(503).json({ success: false, error: 'Discovery could not be saved. Nothing was changed. Please try again.' });
  }
});

export default router;
