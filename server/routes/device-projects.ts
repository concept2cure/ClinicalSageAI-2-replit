/**
 * device-projects.ts
 *
 * Extracted from server/index.ts — Device-Project CRUD endpoints.
 * CERV2 module server-backed persistence.
 *
 * Routes:
 *   GET    /api/device-projects      — list (org-scoped)
 *   POST   /api/device-projects      — create
 *   PUT    /api/device-projects/:id  — update
 *   DELETE /api/device-projects/:id  — delete
 */

import { Router, type Request, type Response } from 'express';
import { and, eq, desc } from 'drizzle-orm';
import { projects } from '@shared/schema';
import { db } from '../db';

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
router.post('/', async (req: Request, res: Response) => {
  try {
    const organization_id = Number(req.tenantId || req.tenantContext?.organizationId);
    if (!organization_id) {
      return res.status(403).json({ error: 'Organization context required' });
    }

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

    console.log('✅ Created device project:', row.id, `(org=${organization_id})`);
    res.status(201).json(row);
  } catch (error: any) {
    console.error('Failed to create device project:', error);
    res.status(500).json({ error: 'Failed to create device project' });
  }
});

/** PUT /api/device-projects/:id — update an existing device project (org-scoped) */
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const organization_id = Number(req.tenantId || req.tenantContext?.organizationId);
    if (!organization_id) {
      return res.status(403).json({ error: 'Organization context required' });
    }

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

    if (deviceName !== undefined) {
      const trimmedName = String(deviceName).trim();
      if (trimmedName.length === 0) {
        return res.status(400).json({ error: 'deviceName cannot be empty' });
      }
      if (trimmedName.length > MAX_NAME_LENGTH) {
        return res
          .status(400)
          .json({ error: `deviceName must be ${MAX_NAME_LENGTH} characters or fewer` });
      }
    }
    if (deviceClass !== undefined && !VALID_DEVICE_CLASSES.includes(String(deviceClass))) {
      return res
        .status(400)
        .json({ error: `deviceClass must be one of: ${VALID_DEVICE_CLASSES.join(', ')}` });
    }
    if (manufacturer !== undefined && String(manufacturer).length > MAX_TEXT_LENGTH) {
      return res
        .status(400)
        .json({ error: `manufacturer must be ${MAX_TEXT_LENGTH} characters or fewer` });
    }
    if (intendedUse !== undefined && String(intendedUse).length > MAX_TEXT_LENGTH) {
      return res
        .status(400)
        .json({ error: `intendedUse must be ${MAX_TEXT_LENGTH} characters or fewer` });
    }
    if (attachedDocuments !== undefined && !Array.isArray(attachedDocuments)) {
      return res.status(400).json({ error: 'attachedDocuments must be an array' });
    }
    if (
      state !== undefined &&
      (typeof state !== 'object' || state === null || Array.isArray(state))
    ) {
      return res.status(400).json({ error: 'state must be a JSON object' });
    }
    if (
      progress !== undefined &&
      (typeof progress !== 'number' || progress < 0 || progress > 100)
    ) {
      return res.status(400).json({ error: 'progress must be a number between 0 and 100' });
    }
    if (status !== undefined && !VALID_STATUSES.includes(String(status))) {
      return res.status(400).json({ error: `status must be one of: ${VALID_STATUSES.join(', ')}` });
    }

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
      .where(eq(projects.id, projectId))
      .returning();

    console.log('✅ Updated device project:', projectId, `(org=${organization_id})`);
    res.json(updated);
  } catch (error: any) {
    console.error('Failed to update device project:', error);
    res.status(500).json({ error: 'Failed to update device project' });
  }
});

/** DELETE /api/device-projects/:id — remove a device project (org-scoped) */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const projectId = Number(req.params.id);
    if (!projectId || isNaN(projectId)) {
      return res.status(400).json({ error: 'Invalid project ID' });
    }

    const organization_id = Number(req.tenantId || req.tenantContext?.organizationId);
    if (!organization_id) {
      return res.status(403).json({ error: 'Organization context required' });
    }

    const [deleted] = await db
      .delete(projects)
      .where(and(eq(projects.id, projectId), eq(projects.organizationId, organization_id)))
      .returning();

    if (!deleted) {
      return res.status(404).json({ error: 'Project not found' });
    }

    console.log('✅ Deleted device project:', projectId, `(org=${organization_id})`);
    res.json({ success: true, id: projectId });
  } catch (error: any) {
    console.error('Failed to delete device project:', error);
    res.status(500).json({ error: 'Failed to delete device project' });
  }
});

export default router;
