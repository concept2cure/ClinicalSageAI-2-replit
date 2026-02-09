/**
 * PM Settings API Routes
 * 
 * Provides CRUD operations for organization-specific project management settings.
 * 
 * Routes:
 * - GET    /api/pm-settings/:organizationId - Get settings for an organization
 * - PUT    /api/pm-settings/:organizationId - Update settings for an organization
 * - POST   /api/pm-settings/:organizationId/reset - Reset to default settings
 * - GET    /api/pm-settings/:organizationId/history - Get audit history
 */

import { Router } from 'express';
import { z } from 'zod';
import { db } from '../../db/connection';
import { pmSettings, auditLogs, organizations } from '../../../shared/schema';
import { eq, and, desc } from 'drizzle-orm';

const router = Router();

// =============================================================================
// Validation Schemas
// =============================================================================

const aiSettingsSchema = z.object({
  tone: z.enum(['regulatory', 'conversational', 'technical']).optional(),
  riskTolerance: z.enum(['low', 'moderate', 'high']).optional(),
  citationPreference: z.enum(['primary_sources', 'mixed', 'secondary_acceptable']).optional(),
});

const workflowSettingsSchema = z.object({
  defaultSubmissionType: z.enum(['510K', 'IND', 'NDA', 'BLA', 'MAA', 'PMA', 'DE_NOVO', 'EUA']).optional(),
  reviewCadenceDays: z.number().min(1).max(30).optional(),
  requireSecondReviewer: z.boolean().optional(),
});

const notificationSettingsSchema = z.object({
  emailDigest: z.enum(['immediate', 'daily', 'weekly', 'never']).optional(),
  notifyOnRiskDetection: z.boolean().optional(),
  notifyOnSubmissionMilestones: z.boolean().optional(),
});

const complianceSettingsSchema = z.object({
  part11Enabled: z.boolean().optional(),
  auditTrailRetentionDays: z.number().min(365).max(7300).optional(),
  redactionMode: z.enum(['auto', 'manual', 'disabled']).optional(),
});

const therapeuticAreaSettingsSchema = z.object({
  primaryArea: z.string().optional(),
  secondaryAreas: z.array(z.string()).optional(),
});

const updateSettingsSchema = z.object({
  aiSettings: aiSettingsSchema.optional(),
  workflowSettings: workflowSettingsSchema.optional(),
  notificationSettings: notificationSettingsSchema.optional(),
  complianceSettings: complianceSettingsSchema.optional(),
  therapeuticAreaSettings: therapeuticAreaSettingsSchema.optional(),
});

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Get default PM settings for a new organization
 */
function getDefaultSettings() {
  return {
    aiSettings: {
      tone: 'regulatory',
      riskTolerance: 'moderate',
      citationPreference: 'primary_sources',
    },
    workflowSettings: {
      defaultSubmissionType: 'IND',
      reviewCadenceDays: 7,
      requireSecondReviewer: true,
    },
    notificationSettings: {
      emailDigest: 'daily',
      notifyOnRiskDetection: true,
      notifyOnSubmissionMilestones: true,
    },
    complianceSettings: {
      part11Enabled: true,
      auditTrailRetentionDays: 3650, // 10 years
      redactionMode: 'auto',
    },
    therapeuticAreaSettings: {
      primaryArea: 'oncology',
      secondaryAreas: [],
    },
  };
}

/**
 * Validate organization exists
 */
async function validateOrganization(organizationId: number): Promise<boolean> {
  try {
    const result = await db
      .select({ id: organizations.id })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);
    
    return result.length > 0;
  } catch (error) {
    console.error('Error validating organization:', error);
    return false;
  }
}

// =============================================================================
// Routes
// =============================================================================

/**
 * GET /api/pm-settings/:organizationId
 * Get PM settings for an organization
 */
router.get('/:organizationId', async (req, res) => {
  try {
    const organizationId = parseInt(req.params.organizationId, 10);
    
    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // Validate organization exists
    const orgExists = await validateOrganization(organizationId);
    if (!orgExists) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Fetch settings
    const result = await db
      .select()
      .from(pmSettings)
      .where(eq(pmSettings.organizationId, organizationId))
      .limit(1);

    if (result.length === 0) {
      // Return default settings if none exist
      const defaults = getDefaultSettings();
      return res.json({
        organizationId,
        ...defaults,
        isDefault: true,
      });
    }

    const settings = result[0];
    
    res.json({
      id: settings.id,
      organizationId: settings.organizationId,
      aiSettings: settings.aiSettings,
      workflowSettings: settings.workflowSettings,
      notificationSettings: settings.notificationSettings,
      complianceSettings: settings.complianceSettings,
      therapeuticAreaSettings: settings.therapeuticAreaSettings,
      updatedAt: settings.updatedAt,
      updatedBy: settings.updatedBy,
      isDefault: false,
    });
  } catch (error) {
    console.error('Error fetching PM settings:', error);
    res.status(500).json({ error: 'Failed to fetch settings' });
  }
});

/**
 * PUT /api/pm-settings/:organizationId
 * Update PM settings for an organization
 */
router.put('/:organizationId', async (req, res) => {
  try {
    const organizationId = parseInt(req.params.organizationId, 10);
    
    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // Validate request body
    const validationResult = updateSettingsSchema.safeParse(req.body);
    if (!validationResult.success) {
      return res.status(400).json({ 
        error: 'Invalid settings data',
        details: validationResult.error.issues,
      });
    }

    const updates = validationResult.data;

    // Validate organization exists
    const orgExists = await validateOrganization(organizationId);
    if (!orgExists) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    // Get user ID from session/auth (placeholder - adjust based on auth implementation)
    const userId = (req as any).user?.id || null;

    // Check if settings exist
    const existing = await db
      .select()
      .from(pmSettings)
      .where(eq(pmSettings.organizationId, organizationId))
      .limit(1);

    let result;

    if (existing.length === 0) {
      // Insert new settings
      const defaults = getDefaultSettings();
      result = await db
        .insert(pmSettings)
        .values({
          organizationId,
          aiSettings: updates.aiSettings || defaults.aiSettings,
          workflowSettings: updates.workflowSettings || defaults.workflowSettings,
          notificationSettings: updates.notificationSettings || defaults.notificationSettings,
          complianceSettings: updates.complianceSettings || defaults.complianceSettings,
          therapeuticAreaSettings: updates.therapeuticAreaSettings || defaults.therapeuticAreaSettings,
          updatedBy: userId,
        })
        .returning();
    } else {
      // Update existing settings (merge with existing)
      const current = existing[0];
      result = await db
        .update(pmSettings)
        .set({
          aiSettings: updates.aiSettings 
            ? { ...(current.aiSettings || {}), ...updates.aiSettings }
            : current.aiSettings,
          workflowSettings: updates.workflowSettings
            ? { ...(current.workflowSettings || {}), ...updates.workflowSettings }
            : current.workflowSettings,
          notificationSettings: updates.notificationSettings
            ? { ...(current.notificationSettings || {}), ...updates.notificationSettings }
            : current.notificationSettings,
          complianceSettings: updates.complianceSettings
            ? { ...(current.complianceSettings || {}), ...updates.complianceSettings }
            : current.complianceSettings,
          therapeuticAreaSettings: updates.therapeuticAreaSettings
            ? { ...(current.therapeuticAreaSettings || {}), ...updates.therapeuticAreaSettings }
            : current.therapeuticAreaSettings,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(pmSettings.organizationId, organizationId))
        .returning();
    }

    res.json({
      message: 'Settings updated successfully',
      settings: result[0],
    });
  } catch (error) {
    console.error('Error updating PM settings:', error);
    res.status(500).json({ error: 'Failed to update settings' });
  }
});

/**
 * POST /api/pm-settings/:organizationId/reset
 * Reset settings to defaults
 */
router.post('/:organizationId/reset', async (req, res) => {
  try {
    const organizationId = parseInt(req.params.organizationId, 10);
    
    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // Validate organization exists
    const orgExists = await validateOrganization(organizationId);
    if (!orgExists) {
      return res.status(404).json({ error: 'Organization not found' });
    }

    const userId = (req as any).user?.id || null;
    const defaults = getDefaultSettings();

    // Check if settings exist
    const existing = await db
      .select()
      .from(pmSettings)
      .where(eq(pmSettings.organizationId, organizationId))
      .limit(1);

    let result;

    if (existing.length === 0) {
      // Insert default settings
      result = await db
        .insert(pmSettings)
        .values({
          organizationId,
          ...defaults,
          updatedBy: userId,
        })
        .returning();
    } else {
      // Reset to defaults
      result = await db
        .update(pmSettings)
        .set({
          ...defaults,
          updatedBy: userId,
          updatedAt: new Date(),
        })
        .where(eq(pmSettings.organizationId, organizationId))
        .returning();
    }

    res.json({
      message: 'Settings reset to defaults successfully',
      settings: result[0],
    });
  } catch (error) {
    console.error('Error resetting PM settings:', error);
    res.status(500).json({ error: 'Failed to reset settings' });
  }
});

/**
 * GET /api/pm-settings/:organizationId/history
 * Get audit history for PM settings changes
 */
router.get('/:organizationId/history', async (req, res) => {
  try {
    const organizationId = parseInt(req.params.organizationId, 10);
    
    if (isNaN(organizationId)) {
      return res.status(400).json({ error: 'Invalid organization ID' });
    }

    // Get limit from query param (default 50, max 200)
    const limit = Math.min(
      parseInt(req.query.limit as string, 10) || 50,
      200
    );

    // Fetch audit logs for pm_settings changes for this organization
    const logs = await db
      .select()
      .from(auditLogs)
      .where(
        and(
          eq(auditLogs.tableName, 'pm_settings'),
          eq(auditLogs.tenantId, organizationId)
        )
      )
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit);

    res.json({
      organizationId,
      total: logs.length,
      limit,
      history: logs.map(log => ({
        id: log.id,
        action: log.action,
        userId: log.userId,
        oldValues: log.oldValues,
        newValues: log.newValues,
        createdAt: log.createdAt,
        ipAddress: log.ipAddress,
      })),
    });
  } catch (error) {
    console.error('Error fetching PM settings history:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

export default router;
