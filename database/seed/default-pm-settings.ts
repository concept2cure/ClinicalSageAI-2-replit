import type { InsertPmSettings } from '../../shared/schema';

export const buildDefaultPmSettings = (
  organizationId: number,
  updatedBy?: number
): InsertPmSettings => ({
  organizationId,
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
    auditTrailRetentionDays: 3650,
    redactionMode: 'auto',
  },
  therapeuticAreaSettings: {
    primaryArea: 'oncology',
    secondaryAreas: [],
  },
  updatedBy,
});
