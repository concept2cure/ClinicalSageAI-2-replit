import express from 'express';
import { db } from '../db/index.js';
import { cerv2SectionVersions, cerv2DocumentSessions, cerv2510kSections } from '../../shared/schema.ts';
import { eq, and, desc, sql } from 'drizzle-orm';
import { requireTenant } from '../middleware/tenant.js';

const router = express.Router();

// Tenant enforcement (JWT in production; header fallback only in dev/demo)
router.use(requireTenant());

function isMissingRelationError(error) {
  // Postgres: undefined_table
  return Boolean(
    error &&
      (
        error.code === '42P01' ||
        error.code === 'NO_DB' ||
        String(error.message || '').includes('does not exist') ||
        String(error.message || '').includes('DATABASE_URL environment variable not set')
      )
  );
}

router.get('/', async (_req, res) => {
  return res.json({
    ok: true,
    service: 'cerv2-versions',
    endpoints: {
      sectionVersions: 'GET /sections/:sectionId/versions',
      createVersion: 'POST /sections/:sectionId/versions',
      versionDetails: 'GET /versions/:versionId',
      compare: 'GET /versions/:versionId/compare/:compareToVersionId',
      sessionGetOrCreate: 'GET /sessions/document/:documentId/user/:userId',
      sessionPatch: 'PATCH /sessions/:sessionId',
    },
  });
});

/**
 * CERV2 Version Management API
 * Handles version history, change tracking, and multi-section editing sessions
 */

// Get version history for a section
router.get('/sections/:sectionId/versions', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const { limit = 50, offset = 0 } = req.query;
    
    const versions = await db
      .select()
      .from(cerv2SectionVersions)
      .where(
        and(
          eq(cerv2SectionVersions.sectionId, parseInt(sectionId)),
          eq(cerv2SectionVersions.organizationId, req.organizationId)
        )
      )
      .orderBy(desc(cerv2SectionVersions.versionNumber))
      .limit(parseInt(limit))
      .offset(parseInt(offset));
    
    res.json({ versions, count: versions.length });
  } catch (error) {
    if (isMissingRelationError(error)) {
      return res.json({
        versions: [],
        count: 0,
        warning: 'Versions storage not initialized. Run `npm run db:push` to enable persistent version history.',
      });
    }
    console.error('Error fetching version history:', error);
    res.status(500).json({ error: 'Failed to fetch version history' });
  }
});

// Get specific version details
router.get('/versions/:versionId', async (req, res) => {
  try {
    const { versionId } = req.params;
    
    const version = await db
      .select()
      .from(cerv2SectionVersions)
      .where(
        and(
          eq(cerv2SectionVersions.id, parseInt(versionId)),
          eq(cerv2SectionVersions.organizationId, req.organizationId)
        )
      )
      .limit(1);
    
    if (!version || version.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    res.json({ version: version[0] });
  } catch (error) {
    console.error('Error fetching version:', error);
    if (isMissingRelationError(error)) {
      return res.status(501).json({
        error: 'Versions storage not initialized. Run `npm run db:push` to enable persistent version history.',
      });
    }
    res.status(500).json({ error: 'Failed to fetch version' });
  }
});

// Compare two versions
router.get('/versions/:versionId/compare/:compareToVersionId', async (req, res) => {
  try {
    const { versionId, compareToVersionId } = req.params;
    
    const versions = await db
      .select()
      .from(cerv2SectionVersions)
      .where(
        and(
          sql`${cerv2SectionVersions.id} IN (${parseInt(versionId)}, ${parseInt(compareToVersionId)})`,
          eq(cerv2SectionVersions.organizationId, req.organizationId)
        )
      )
      .orderBy(desc(cerv2SectionVersions.versionNumber));
    
    if (versions.length !== 2) {
      return res.status(404).json({ error: 'One or both versions not found' });
    }
    
    const [newer, older] = versions.sort((a, b) => b.versionNumber - a.versionNumber);
    
    // Calculate diff
    const diff = {
      fieldsChanged: newer.fieldsChanged || [],
      previousValues: older.fieldData || {},
      newValues: newer.fieldData || {},
      contentChanges: {
        from: older.content || '',
        to: newer.content || ''
      },
      metadata: {
        olderVersion: {
          number: older.versionNumber,
          changedBy: older.changedByName,
          changedAt: older.changedAt
        },
        newerVersion: {
          number: newer.versionNumber,
          changedBy: newer.changedByName,
          changedAt: newer.changedAt
        }
      }
    };
    
    res.json({ diff, versions: { older, newer } });
  } catch (error) {
    console.error('Error comparing versions:', error);
    if (isMissingRelationError(error)) {
      return res.status(501).json({
        error: 'Versions storage not initialized. Run `npm run db:push` to enable persistent version history.',
      });
    }
    res.status(500).json({ error: 'Failed to compare versions' });
  }
});

// Save a new version (called when section is edited)
router.post('/sections/:sectionId/versions', async (req, res) => {
  try {
    const { sectionId } = req.params;
    const {
      content,
      fieldData,
      status,
      completionPercentage,
      fieldsChanged,
      previousValues,
      newValues,
      changeType = 'edited',
      changeSummary,
      changedBy,
      changedByName,
      changedByEmail,
      comment,
      ipAddress,
      userAgent
    } = req.body;

    const organizationId = req.organizationId;
    const effectiveUserId = req.user?.id ?? changedBy ?? null;
    const effectiveUserName = req.user?.name ?? req.user?.fullName ?? changedByName ?? null;
    const effectiveUserEmail = req.user?.email ?? changedByEmail ?? null;
    
    // Get the latest version number
    const latestVersion = await db
      .select({ versionNumber: cerv2SectionVersions.versionNumber })
      .from(cerv2SectionVersions)
      .where(
        and(
          eq(cerv2SectionVersions.sectionId, parseInt(sectionId)),
          eq(cerv2SectionVersions.organizationId, organizationId)
        )
      )
      .orderBy(desc(cerv2SectionVersions.versionNumber))
      .limit(1);
    
    const nextVersionNumber = latestVersion.length > 0 
      ? latestVersion[0].versionNumber + 1 
      : 1;
    
    // Create new version record
    const newVersion = await db
      .insert(cerv2SectionVersions)
      .values({
        sectionId: parseInt(sectionId),
        organizationId,
        versionNumber: nextVersionNumber,
        changeType,
        changeSummary: changeSummary || `${changeType.charAt(0).toUpperCase() + changeType.slice(1)} section`,
        content,
        fieldData,
        status,
        completionPercentage,
        fieldsChanged,
        previousValues,
        newValues,
        changedBy: effectiveUserId,
        changedByName: effectiveUserName,
        changedByEmail: effectiveUserEmail,
        comment,
        ipAddress: ipAddress || req.ip,
        userAgent: userAgent || req.get('user-agent')
      })
      .returning();
    
    res.json({ version: newVersion[0], versionNumber: nextVersionNumber });
  } catch (error) {
    console.error('Error saving version:', error);
    if (isMissingRelationError(error)) {
      return res.status(501).json({
        error: 'Versions storage not initialized. Run `npm run db:push` to enable persistent version history.',
      });
    }
    res.status(500).json({ error: 'Failed to save version' });
  }
});

// Get or create document session for a user
router.get('/sessions/document/:documentId/user/:userId', async (req, res) => {
  try {
    const { documentId, userId } = req.params;
    const organizationId = req.organizationId;
    const effectiveUserId = req.user?.id ?? parseInt(userId);

    if (req.user?.id && parseInt(userId) !== req.user.id && !(req.user.roles || []).includes('admin')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    
    // Find existing session
    let session = await db
      .select()
      .from(cerv2DocumentSessions)
      .where(
        and(
          eq(cerv2DocumentSessions.documentId, parseInt(documentId)),
          eq(cerv2DocumentSessions.userId, parseInt(effectiveUserId)),
          eq(cerv2DocumentSessions.organizationId, parseInt(organizationId))
        )
      )
      .limit(1);
    
    if (!session || session.length === 0) {
      // Create new session
      const newSession = await db
        .insert(cerv2DocumentSessions)
        .values({
          organizationId: parseInt(organizationId),
          documentId: parseInt(documentId),
          userId: parseInt(effectiveUserId),
          openSections: [],
          sectionOrder: [],
          isDirty: false
        })
        .returning();
      
      session = newSession;
    }
    
    res.json({ session: session[0] });
  } catch (error) {
    console.error('Error fetching session:', error);
    if (isMissingRelationError(error)) {
      return res.status(501).json({
        error: 'Sessions storage not initialized. Run `npm run db:push` to enable persistent editing sessions.',
      });
    }
    res.status(500).json({ error: 'Failed to fetch session' });
  }
});

// Update document session (open sections, active section, etc.)
router.patch('/sessions/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const {
      openSections,
      activeSectionId,
      sectionOrder,
      isDirty,
      unsavedData
    } = req.body;
    
    const updates = {
      lastActivity: new Date()
    };
    
    if (openSections !== undefined) updates.openSections = openSections;
    if (activeSectionId !== undefined) updates.activeSectionId = activeSectionId;
    if (sectionOrder !== undefined) updates.sectionOrder = sectionOrder;
    if (isDirty !== undefined) updates.isDirty = isDirty;
    if (unsavedData !== undefined) updates.unsavedData = unsavedData;
    
    const updated = await db
      .update(cerv2DocumentSessions)
      .set(updates)
      .where(
        and(
          eq(cerv2DocumentSessions.id, parseInt(sessionId)),
          eq(cerv2DocumentSessions.organizationId, req.organizationId)
        )
      )
      .returning();
    
    res.json({ session: updated[0] });
  } catch (error) {
    console.error('Error updating session:', error);
    if (isMissingRelationError(error)) {
      return res.status(501).json({
        error: 'Sessions storage not initialized. Run `npm run db:push` to enable persistent editing sessions.',
      });
    }
    res.status(500).json({ error: 'Failed to update session' });
  }
});

// Get timeline of all changes for a document
router.get('/documents/:documentId/timeline', async (req, res) => {
  try {
    const { documentId } = req.params;
    const { limit = 100 } = req.query;
    
    // Get all sections for this document
    const sections = await db
      .select({ id: cerv2510kSections.id })
      .from(cerv2510kSections)
      .where(
        and(
          eq(cerv2510kSections.documentId, parseInt(documentId)),
          eq(cerv2510kSections.organizationId, req.organizationId)
        )
      );
    
    const sectionIds = sections.map(s => s.id);
    
    if (sectionIds.length === 0) {
      return res.json({ timeline: [] });
    }
    
    // Get all versions for these sections
    const timeline = await db
      .select({
        id: cerv2SectionVersions.id,
        sectionId: cerv2SectionVersions.sectionId,
        versionNumber: cerv2SectionVersions.versionNumber,
        changeType: cerv2SectionVersions.changeType,
        changeSummary: cerv2SectionVersions.changeSummary,
        changedBy: cerv2SectionVersions.changedByName,
        changedAt: cerv2SectionVersions.changedAt,
        fieldsChanged: cerv2SectionVersions.fieldsChanged,
        comment: cerv2SectionVersions.comment
      })
      .from(cerv2SectionVersions)
      .where(
        and(
          sql`${cerv2SectionVersions.sectionId} IN (${sectionIds.join(',')})`,
          eq(cerv2SectionVersions.organizationId, req.organizationId)
        )
      )
      .orderBy(desc(cerv2SectionVersions.changedAt))
      .limit(parseInt(limit));
    
    res.json({ timeline });
  } catch (error) {
    console.error('Error fetching timeline:', error);
    res.status(500).json({ error: 'Failed to fetch timeline' });
  }
});

// Restore section to a specific version
router.post('/versions/:versionId/restore', async (req, res) => {
  try {
    const { versionId } = req.params;
    const { userId, userName, userEmail } = req.body;

    const effectiveUserId = req.user?.id ?? userId ?? null;
    const effectiveUserName = req.user?.name ?? req.user?.fullName ?? userName ?? null;
    const effectiveUserEmail = req.user?.email ?? userEmail ?? null;
    
    // Get the version to restore
    const versionToRestore = await db
      .select()
      .from(cerv2SectionVersions)
      .where(
        and(
          eq(cerv2SectionVersions.id, parseInt(versionId)),
          eq(cerv2SectionVersions.organizationId, req.organizationId)
        )
      )
      .limit(1);
    
    if (!versionToRestore || versionToRestore.length === 0) {
      return res.status(404).json({ error: 'Version not found' });
    }
    
    const version = versionToRestore[0];
    
    // Update the section with the restored data
    const updated = await db
      .update(cerv2510kSections)
      .set({
        content: version.content,
        status: version.status,
        completionPercentage: version.completionPercentage,
        lastEditedBy: effectiveUserId,
        updatedAt: new Date()
      })
      .where(
        and(
          eq(cerv2510kSections.id, version.sectionId),
          eq(cerv2510kSections.organizationId, req.organizationId)
        )
      )
      .returning();
    
    // Create a new version entry for the restore action
    const latestVersion = await db
      .select({ versionNumber: cerv2SectionVersions.versionNumber })
      .from(cerv2SectionVersions)
      .where(
        and(
          eq(cerv2SectionVersions.sectionId, version.sectionId),
          eq(cerv2SectionVersions.organizationId, req.organizationId)
        )
      )
      .orderBy(desc(cerv2SectionVersions.versionNumber))
      .limit(1);
    
    const nextVersionNumber = latestVersion[0].versionNumber + 1;
    
    await db
      .insert(cerv2SectionVersions)
      .values({
        sectionId: version.sectionId,
        organizationId: req.organizationId,
        versionNumber: nextVersionNumber,
        changeType: 'restored',
        changeSummary: `Restored to version ${version.versionNumber}`,
        content: version.content,
        fieldData: version.fieldData,
        status: version.status,
        completionPercentage: version.completionPercentage,
        changedBy: effectiveUserId,
        changedByName: effectiveUserName,
        changedByEmail: effectiveUserEmail,
        comment: `Restored from version ${version.versionNumber}`
      });
    
    res.json({ 
      success: true, 
      section: updated[0],
      restoredVersion: version.versionNumber,
      newVersion: nextVersionNumber
    });
  } catch (error) {
    console.error('Error restoring version:', error);
    res.status(500).json({ error: 'Failed to restore version' });
  }
});

export default router;
