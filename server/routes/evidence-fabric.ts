import { Router } from 'express';
import { z } from 'zod';
import { requireTenant } from '../middleware/tenant.js';
import {
  extractEvidenceTags,
  isManifestStale,
  renderEvidenceTags,
  type EvidenceFabricManifest,
} from '../lib/evidence-fabric';
import {
  getEvidenceSource,
  listEvidenceSources,
  resolveEvidenceTag,
  upsertEvidenceSource,
} from '../lib/evidence-fabric-store';

const router = Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

const KeySchema = z
  .string()
  .min(1)
  .max(200)
  .regex(/^[a-zA-Z0-9_.:-]+$/, 'Invalid key format');

const UpsertSchema = z.object({
  // Optional in request body; we always enforce from auth/tenant middleware.
  tenantId: z.string().optional(),
  key: KeySchema,
  value: z.unknown(),
  provenance: z.record(z.unknown()).optional(),
});

router.post('/sources/upsert', (req, res) => {
  const parsed = UpsertSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const tenantId = String(req.organizationId);
  const record = upsertEvidenceSource({
    tenantId,
    key: parsed.data.key,
    value: parsed.data.value,
    provenance: parsed.data.provenance,
  });

  return res.json({
    success: true,
    source: record,
  });
});

router.get('/sources/:key', (req, res) => {
  const key = String(req.params.key || '');
  const tenantId = String(req.organizationId);

  const record = getEvidenceSource(tenantId, key);
  if (!record) {
    return res.status(404).json({ error: 'Source not found' });
  }

  return res.json({ success: true, source: record });
});

router.get('/sources', (req, res) => {
  const tenantId = String(req.organizationId);
  return res.json({ success: true, sources: listEvidenceSources(tenantId) });
});

const PreviewSchema = z.object({
  tenantId: z.string().optional(),
  content: z.string().default(''),
  previousManifest: z.custom<EvidenceFabricManifest>().optional(),
});

router.post('/preview', (req, res) => {
  const parsed = PreviewSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const tenantId = String(req.organizationId);
  const content = parsed.data.content || '';

  const rendered = renderEvidenceTags(content, (tagKey) => resolveEvidenceTag(tenantId, tagKey));
  const staleness = isManifestStale(parsed.data.previousManifest, rendered.manifest);

  return res.json({
    success: true,
    rendered: rendered.rendered,
    tags: rendered.tags,
    resolved: rendered.resolved,
    manifest: rendered.manifest,
    stale: staleness.stale,
    staleReason: staleness.reason,
    changedSources: staleness.changedSources,
    newBindings: staleness.newBindings,
  });
});

const StatusSchema = z.object({
  tenantId: z.string().optional(),
  content: z.string().default(''),
  previousManifest: z.custom<EvidenceFabricManifest>(),
});

router.post('/status', (req, res) => {
  const parsed = StatusSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: 'Invalid payload', details: parsed.error.flatten() });
  }

  const tenantId = String(req.organizationId);
  const content = parsed.data.content || '';

  const current = renderEvidenceTags(content, (tagKey) => resolveEvidenceTag(tenantId, tagKey));
  const staleness = isManifestStale(parsed.data.previousManifest, current.manifest);

  return res.json({
    success: true,
    tags: extractEvidenceTags(content),
    stale: staleness.stale,
    staleReason: staleness.reason,
    changedSources: staleness.changedSources,
    newBindings: staleness.newBindings,
    currentManifest: current.manifest,
  });
});

export default router;
