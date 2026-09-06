/**
 * device-projects.ts
 *
 * Extracted from server/index.ts — Device-Project CRUD endpoints.
 * CERV2 module server-backed persistence.
 *
 * Routes:
 *   GET    /api/device-projects      — list (org-scoped)
 *   POST   /api/device-projects      — create   (editor+, audited)
 *   PUT    /api/device-projects/:id  — update   (editor+, audited)
 *   DELETE /api/device-projects/:id  — delete   (editor+, audited)
 *
 * The three WRITES were org-scoped and nothing else: any authenticated member
 * of the organization, a read-only viewer included, could rename or DELETE any
 * medical-device project in it, and no row recorded who. A device project is
 * the spine an FDA submission is assembled against, and a delete is not
 * recoverable. They now carry the same governed-write gate as the sibling
 * device writes (`requireEditorAccess`, one implementation in
 * middleware/orgMembership) and each writes an audit row against the session's
 * actor. The read stays open.
 */

import { Router, type Request, type Response } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { projects } from '@shared/schema';
import { db } from '../db';
import { governedActorId, requireEditorAccess } from '../middleware/orgMembership';
import auditService from '../services/auditService';

const router = Router();

const VALID_DEVICE_CLASSES = ['I', 'II', 'IIa', 'IIb', 'III'];
const MAX_NAME_LENGTH = 200;
const MAX_TEXT_LENGTH = 2000;
const VALID_STATUSES = ['draft', 'active', 'submitted', 'approved', 'archived'];

/** GET /api/device-projects — list device projects scoped to the authenticated user's org */
router.get('/', async (req: Request, res: Response) => {
  try {
    const organization_id = Number(req.tenantId || req.tenantContext?.organizationId);
    if (!organization_id) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const client_workspace_id = req.query.client_workspace_id
      ? Number(req.query.client_workspace_id)
      : undefined;

    const conditions = [
      eq(projects.organizationId, organization_id),
      eq(projects.type, 'medical-device'),
    ];
    if (client_workspace_id) {
      conditions.push(eq(projects.clientWorkspaceId, client_workspace_id));
    }

    const rows = await db
      .select()
      .from(projects)
      .where(and(...conditions))
      .orderBy(desc(projects.createdAt));

    console.log(`✅ GET /api/device-projects → ${rows.length} rows (org=${organization_id})`);
    res.json(rows);
  } catch (error: any) {
    console.error('Failed to list device projects:', error);
    res.status(500).json({ error: 'Failed to list device projects' });
  }
});

/** POST /api/device-projects — create a new device project */
router.post('/', requireEditorAccess, async (req: Request, res: Response) => {
  try {
    const organization_id = Number(req.tenantId || req.tenantContext?.organizationId);
    if (!organization_id) {
      return res.status(403).json({ error: 'Organization context required' });
    }
    /* Refused rather than audited against an invented actor. */
    const actorId = governedActorId(req);
    if (actorId === null) return res.status(403).json({ error: 'Authenticated actor required' });

    const {
      deviceName,
      deviceType = 'medical-device',
      manufacturer = '',
      deviceClass = 'II',
      intendedUse = '',
      state = {},
      attachedDocuments = [],
      clientWorkspaceId: bodyWsId,
    } = req.body || {};

    const trimmedName = String(deviceName || '').trim();
    if (!trimmedName || trimmedName.length === 0) {
      return res.status(400).json({ error: 'deviceName is required' });
    }
    if (trimmedName.length > MAX_NAME_LENGTH) {
      return res
        .status(400)
        .json({ error: `deviceName must be ${MAX_NAME_LENGTH} characters or fewer` });
    }
    if (!VALID_DEVICE_CLASSES.includes(String(deviceClass))) {
      return res
        .status(400)
        .json({ error: `deviceClass must be one of: ${VALID_DEVICE_CLASSES.join(', ')}` });
    }
    if (String(manufacturer).length > MAX_TEXT_LENGTH) {
      return res
        .status(400)
        .json({ error: `manufacturer must be ${MAX_TEXT_LENGTH} characters or fewer` });
    }
    if (String(intendedUse).length > MAX_TEXT_LENGTH) {
      return res
        .status(400)
        .json({ error: `intendedUse must be ${MAX_TEXT_LENGTH} characters or fewer` });
    }
    if (!Array.isArray(attachedDocuments)) {
      return res.status(400).json({ error: 'attachedDocuments must be an array' });
    }
    if (typeof state !== 'object' || state === null || Array.isArray(state)) {
      return res.status(400).json({ error: 'state must be a JSON object' });
    }

    const client_workspace_id = Number(bodyWsId);
    if (!client_workspace_id) {
      return res.status(400).json({ error: 'clientWorkspaceId is required' });
    }

    const [row] = await db
      .insert(projects)
      .values({
        organizationId: organization_id,
        clientWorkspaceId: client_workspace_id,
        name: trimmedName,
        type: 'medical-device',
        status: 'draft',
        progress: 0,
        metadata: {
          manufacturer: String(manufacturer).trim(),
          deviceClass: String(deviceClass),
          intendedUse: String(intendedUse).trim(),
          deviceType: String(deviceType).trim(),
          attachedDocuments,
          state,
        },
      })
      .returning();

    await auditService.logAction({
      organizationId: organization_id,
      userId: actorId,
      action: 'DEVICE_PROJECT_CREATED',
      resourceType: 'device_project',
      resourceId: String(row.id),
      details: { name: row.name ?? null },
    });

    console.log('✅ Created device project:', row.id, `(org=${organization_id})`);
    res.status(201).json(row);
  } catch (error: any) {
    console.error('Failed to create device project:', error);
    res.status(500).json({ error: 'Failed to create device project' });
  }
});

/**
 * The PUT's field rules, one per field, in the order the handler reports them.
 * A rule runs only when its key is PRESENT — this is a patch, and an absent key
 * means "leave it alone" — and returns the refusal message or null.
 *
 * A table rather than a chain of ifs: the rules are independent of one another,
 * so expressing them as a chain made one function carry the branch count of all
 * eight (complexity 22, over the limit of 15) while saying nothing a reader
 * could not get from the list.
 *
 * Each rule states the condition under which the field is REFUSED — the same
 * predicate the chain used, not its inverse. Written as an inverse, `progress`
 * silently changed meaning: `typeof v === 'number' && v >= 0 && v <= 100` is not
 * the negation of `typeof v !== 'number' || v < 0 || v > 100` when v is NaN,
 * which every comparison answers false to. A differential run over 200k patches
 * caught it; keep the refusal form.
 */
const PATCH_RULES: ReadonlyArray<readonly [string, (value: unknown) => string | null]> = [
  ['deviceName', value => {
    const trimmed = String(value).trim();
    if (trimmed.length === 0) return 'deviceName cannot be empty';
    return trimmed.length > MAX_NAME_LENGTH ? `deviceName must be ${MAX_NAME_LENGTH} characters or fewer` : null;
  }],
  ['deviceClass', value =>
    (!VALID_DEVICE_CLASSES.includes(String(value)) ? `deviceClass must be one of: ${VALID_DEVICE_CLASSES.join(', ')}` : null)],
  ['manufacturer', value =>
    (String(value).length > MAX_TEXT_LENGTH ? `manufacturer must be ${MAX_TEXT_LENGTH} characters or fewer` : null)],
  ['intendedUse', value =>
    (String(value).length > MAX_TEXT_LENGTH ? `intendedUse must be ${MAX_TEXT_LENGTH} characters or fewer` : null)],
  ['attachedDocuments', value => (!Array.isArray(value) ? 'attachedDocuments must be an array' : null)],
  ['state', value =>
    (typeof value !== 'object' || value === null || Array.isArray(value) ? 'state must be a JSON object' : null)],
  ['progress', value =>
    (typeof value !== 'number' || value < 0 || value > 100 ? 'progress must be a number between 0 and 100' : null)],
  ['status', value =>
    (!VALID_STATUSES.includes(String(value)) ? `status must be one of: ${VALID_STATUSES.join(', ')}` : null)],
];

/**
 * Returns the message for the first field that fails, or null when the patch is
 * acceptable. Kept separate from the handler so the handler reads as what it
 * DOES (authorize, validate, load, write, audit).
 */
export function validatePatch(p: Record<string, unknown>): string | null {
  for (const [key, check] of PATCH_RULES) {
    if (p[key] === undefined) continue;
    const message = check(p[key]);
    if (message !== null) return message;
  }
  return null;
}

/** PUT /api/device-projects/:id — update an existing device project (org-scoped) */
router.put('/:id', requireEditorAccess, async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const organization_id = Number(req.tenantId || req.tenantContext?.organizationId);
    if (!organization_id) {
      return res.status(403).json({ error: 'Organization context required' });
    }
    /* Refused rather than audited against an invented actor. */
    const actorId = governedActorId(req);
    if (actorId === null) return res.status(403).json({ error: 'Authenticated actor required' });

    const {
      deviceName,
      status,
      manufacturer,
      deviceClass,
      intendedUse,
      state,
      attachedDocuments,
      deviceType,
      progress,
    } = req.body || {};

    const invalid = validatePatch({
      deviceName,
      status,
      manufacturer,
      deviceClass,
      intendedUse,
      state,
      attachedDocuments,
      progress,
    });
    if (invalid) return res.status(400).json({ error: invalid });

    const [existing] = await db
      .select()
      .from(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organization_id)));

    if (!existing) {
      return res.status(404).json({ error: 'Project not found' });
    }

    const prevMeta: any = existing.metadata || {};
    const mergedMeta = {
      ...prevMeta,
      ...(manufacturer !== undefined && { manufacturer: String(manufacturer).trim() }),
      ...(deviceClass !== undefined && { deviceClass: String(deviceClass) }),
      ...(intendedUse !== undefined && { intendedUse: String(intendedUse).trim() }),
      ...(deviceType !== undefined && { deviceType: String(deviceType).trim() }),
      ...(attachedDocuments !== undefined && { attachedDocuments }),
      ...(state !== undefined && { state }),
    };

    const [updated] = await db
      .update(projects)
      .set({
        ...(deviceName !== undefined && { name: String(deviceName).trim() }),
        ...(status !== undefined && { status: String(status) }),
        ...(progress !== undefined && { progress }),
        metadata: mergedMeta,
        updatedAt: new Date(),
      })
      /* The same predicate the ownership select above used. That select already
         404s a project outside the org, so this is not the control — it is the
         write refusing to depend on a read for its own scoping. */
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organization_id)))
      .returning();

    await auditService.logAction({
      organizationId: organization_id,
      userId: actorId,
      action: 'DEVICE_PROJECT_UPDATED',
      resourceType: 'device_project',
      resourceId: String(projectId),
      details: { fields: Object.keys(req.body || {}) },
    });

    console.log('✅ Updated device project:', projectId, `(org=${organization_id})`);
    res.json(updated);
  } catch (error: any) {
    console.error('Failed to update device project:', error);
    res.status(500).json({ error: 'Failed to update device project' });
  }
});

/** DELETE /api/device-projects/:id — remove a device project (org-scoped) */
router.delete('/:id', requireEditorAccess, async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const organization_id = Number(req.tenantId || req.tenantContext?.organizationId);
    if (!organization_id) {
      return res.status(403).json({ error: 'Organization context required' });
    }
    /* Refused rather than audited against an invented actor. */
    const actorId = governedActorId(req);
    if (actorId === null) return res.status(403).json({ error: 'Authenticated actor required' });

    const [deleted] = await db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organization_id)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }

    await auditService.logAction({
      organizationId: organization_id,
      userId: actorId,
      action: 'DEVICE_PROJECT_DELETED',
      resourceType: 'device_project',
      resourceId: String(projectId),
      details: { name: deleted.name ?? null },
    });

    console.log('✅ Deleted device project:', projectId, `(org=${organization_id})`);
    res.json({ success: true, id: projectId });
  } catch (error: any) {
    console.error('Failed to delete device project:', error);
    res.status(500).json({ error: 'Failed to delete device project' });
  }
});

export default router;
