/**
 * Section Quality Gating Service
 *
 * This service handles validation of section quality gates based on CtQ factor completion.
 * It enforces risk-based quality validation before section generation through:
 * - High-risk factors (hard gate)
 * - Medium-risk factors (soft gate/warnings)
 * - Low-risk factors (informational messages)
 */

import { SQL, eq, and, inArray, sql } from 'drizzle-orm';
import { TenantDb } from '../db/tenantDb';
import {
  qmpSectionGating,
  ctqFactors,
  cerProjects,
  qualityManagementPlans,
  qmpTraceabilityMatrix,
} from '../../shared/schema';

// Types for quality validation results
export type CtqValidationResult = {
  factorId: number;
  name: string;
  description: string | null;
  riskLevel: string;
  category: string;
  validated: boolean;
  validationCriteria: string | null;
  validationMethod: string | null;
  requirementType: string;
  failureAction: string;
  evidenceReferences?: Array<{
    id: number;
    status: string;
    evidenceType: string;
    reference: string;
  }>;
};

export type SectionGateValidationResult = {
  sectionKey: string;
  sectionName: string;
  valid: boolean;
  mandatoryCompletionPercentage: number;
  recommendedCompletionPercentage: number;
  allowOverride: boolean;
  overrideRequiresApproval: boolean;
  overrideRequiresReason: boolean;
  minimumMandatoryCompletion: number;
  minimumRecommendedCompletion: number;
  highRiskFactors: CtqValidationResult[];
  mediumRiskFactors: CtqValidationResult[];
  lowRiskFactors: CtqValidationResult[];
  hardGateFailures: number;
  softGateWarnings: number;
  infoMessages: number;
};

/**
 * Validate all quality requirements for a specific CER section
 *
 * @param tenantDb - The tenant database context
 * @param organizationId - The organization ID for tenant isolation
 * @param projectId - The CER project ID
 * @param sectionKey - The section key to validate
 * @returns Validation result with detailed factor analysis
 */
export async function validateSectionQualityGate(
  tenantDb: TenantDb,
  organizationId: number,
  projectId: number,
  sectionKey: string
): Promise<SectionGateValidationResult | null> {
  try {
    // Step 1: Get project QMP reference
    const project = (
      await tenantDb.select(
        cerProjects,
        and(eq(cerProjects.id, projectId), eq(cerProjects.organizationId, organizationId))
      )
    )[0];

    if (!project || !project.qmpId) {
      throw new Error('Project not found or no QMP associated');
    }

    // Step 2: Get section gate configuration
    const sectionGate = (
      await tenantDb.select(
        qmpSectionGating,
        and(
          eq(qmpSectionGating.organizationId, organizationId),
          eq(qmpSectionGating.qmpId, project.qmpId),
          eq(qmpSectionGating.sectionKey, sectionKey)
        )
      )
    )[0];

    if (!sectionGate) {
      throw new Error(`Section gate not found for section: ${sectionKey}`);
    }

    // Step 3: Get CTQ factors required for this section
    const requiredFactorIds = sectionGate.requiredCtqFactorIds as number[];

    if (!requiredFactorIds || requiredFactorIds.length === 0) {
      // No factors defined, section is valid by default
      return {
        sectionKey,
        sectionName: sectionGate.sectionName,
        valid: true,
        mandatoryCompletionPercentage: 100,
        recommendedCompletionPercentage: 100,
        allowOverride: sectionGate.allowOverride,
        overrideRequiresApproval: sectionGate.overrideRequiresApproval,
        overrideRequiresReason: sectionGate.overrideRequiresReason,
        minimumMandatoryCompletion: sectionGate.minimumMandatoryCompletion,
        minimumRecommendedCompletion: sectionGate.minimumRecommendedCompletion,
        highRiskFactors: [],
        mediumRiskFactors: [],
        lowRiskFactors: [],
        hardGateFailures: 0,
        softGateWarnings: 0,
        infoMessages: 0,
      };
    }

    // Step 4: Get required CTQ factors details
    const requiredFactors = await tenantDb.select(
      ctqFactors,
      and(
        eq(ctqFactors.organizationId, organizationId),
        eq(ctqFactors.qmpId, project.qmpId),
        inArray(ctqFactors.id, requiredFactorIds)
      )
    );

    // Step 5: Get evidence for required factors
    const evidenceItems = await tenantDb.select(
      qmpTraceabilityMatrix,
      and(
        eq(qmpTraceabilityMatrix.organizationId, organizationId),
        eq(qmpTraceabilityMatrix.qmpId, project.qmpId),
        inArray(qmpTraceabilityMatrix.ctqFactorId, requiredFactorIds)
      )
    );

    // Create evidence map by factor ID
    const evidenceMap = new Map<number, any[]>();
    evidenceItems.forEach((item: any) => {
      if (item.ctqFactorId) {
        if (!evidenceMap.has(item.ctqFactorId)) {
          evidenceMap.set(item.ctqFactorId, []);
        }
        evidenceMap.get(item.ctqFactorId)?.push(item);
      }
    });

    // Step 6: Validate each factor and categorize by risk level
    const highRiskFactors: CtqValidationResult[] = [];
    const mediumRiskFactors: CtqValidationResult[] = [];
    const lowRiskFactors: CtqValidationResult[] = [];

    requiredFactors.forEach((factor: any) => {
      // Check if factor has validated evidence
      const factorEvidence = evidenceMap.get(factor.id) || [];
      const isValidated = factorEvidence.some(
        (item: any) => item.verificationStatus === 'verified'
      );

      const validationResult: CtqValidationResult = {
        factorId: factor.id,
        name: factor.name,
        description: factor.description,
        riskLevel: factor.riskLevel,
        category: factor.category,
        validated: isValidated,
        validationCriteria: factor.validationCriteria,
        validationMethod: factor.validationMethod,
        requirementType: factor.requirementType,
        failureAction: factor.failureAction,
        evidenceReferences: factorEvidence.map((item: any) => ({
          id: item.id,
          status: item.verificationStatus,
          evidenceType: item.verificationMethod || 'Unknown',
          reference: item.implementationEvidence
            ? JSON.stringify(item.implementationEvidence)
            : 'No evidence',
        })),
      };

      // Categorize by risk level
      if (factor.riskLevel === 'high') {
        highRiskFactors.push(validationResult);
      } else if (factor.riskLevel === 'medium') {
        mediumRiskFactors.push(validationResult);
      } else {
        lowRiskFactors.push(validationResult);
      }
    });

    // Step 7: Compute validation metrics
    const mandatoryFactors = requiredFactors.filter((f: any) => f.requirementType === 'mandatory');
    const recommendedFactors = requiredFactors.filter(
      (f: any) => f.requirementType === 'recommended'
    );

    const validatedMandatoryCount = mandatoryFactors.filter((f: any) => {
      const evidence = evidenceMap.get(f.id) || [];
      return evidence.some((e: any) => e.verificationStatus === 'verified');
    }).length;

    const validatedRecommendedCount = recommendedFactors.filter((f: any) => {
      const evidence = evidenceMap.get(f.id) || [];
      return evidence.some((e: any) => e.verificationStatus === 'verified');
    }).length;

    const mandatoryCompletionPercentage =
      mandatoryFactors.length === 0
        ? 100
        : Math.round((validatedMandatoryCount / mandatoryFactors.length) * 100);

    const recommendedCompletionPercentage =
      recommendedFactors.length === 0
        ? 100
        : Math.round((validatedRecommendedCount / recommendedFactors.length) * 100);

    // Count failures by severity
    const hardGateFailures = highRiskFactors.filter(
      f => !f.validated && f.requirementType === 'mandatory'
    ).length;
    const softGateWarnings =
      mediumRiskFactors.filter(f => !f.validated && f.requirementType === 'mandatory').length +
      highRiskFactors.filter(f => !f.validated && f.requirementType === 'recommended').length;
    const infoMessages =
      lowRiskFactors.filter(f => !f.validated).length +
      mediumRiskFactors.filter(f => !f.validated && f.requirementType === 'recommended').length;

    // Step 8: Determine overall validation status
    const isValid =
      hardGateFailures === 0 &&
      mandatoryCompletionPercentage >= sectionGate.minimumMandatoryCompletion &&
      recommendedCompletionPercentage >= sectionGate.minimumRecommendedCompletion;

    return {
      sectionKey,
      sectionName: sectionGate.sectionName,
      valid: isValid,
      mandatoryCompletionPercentage,
      recommendedCompletionPercentage,
      allowOverride: sectionGate.allowOverride,
      overrideRequiresApproval: sectionGate.overrideRequiresApproval,
      overrideRequiresReason: sectionGate.overrideRequiresReason,
      minimumMandatoryCompletion: sectionGate.minimumMandatoryCompletion,
      minimumRecommendedCompletion: sectionGate.minimumRecommendedCompletion,
      highRiskFactors,
      mediumRiskFactors,
      lowRiskFactors,
      hardGateFailures,
      softGateWarnings,
      infoMessages,
    };
  } catch (error) {
    console.error('Error validating section quality gate:', error);
    throw error;
  }
}

/**
 * Request an override for a section that failed validation
 *
 * @param tenantDb - The tenant database context
 * @param organizationId - The organization ID for tenant isolation
 * @param projectId - The CER project ID
 * @param sectionKey - The section key to override
 * @param userId - The user requesting the override
 * @param reason - The reason for the override request
 * @param validationResult - The validation result showing failures
 * @returns Object containing the override request status and ID if created
 */
export async function requestSectionGateOverride(
  tenantDb: TenantDb,
  organizationId: number,
  projectId: number,
  sectionKey: string,
  userId: number,
  reason: string,
  validationResult: SectionGateValidationResult
): Promise<{ success: boolean; approvalId?: number; message: string }> {
  try {
    // Only allow override requests if the section gate allows it
    if (!validationResult.allowOverride) {
      return {
        success: false,
        message: 'Overrides are not allowed for this section',
      };
    }

    // Check if we need a reason
    if (validationResult.overrideRequiresReason && (!reason || reason.trim() === '')) {
      return {
        success: false,
        message: 'A reason is required for this override request',
      };
    }

    // Create approval record with detailed validation result
    const approvalData = {
      organizationId,
      projectId,
      sectionKey,
      status: validationResult.overrideRequiresApproval ? 'pending' : 'approved',
      requestedById: userId,
      requestedAt: new Date(),
      approvedById: validationResult.overrideRequiresApproval ? null : userId,
      approvedAt: validationResult.overrideRequiresApproval ? null : new Date(),
      rejectedById: null,
      rejectedAt: null,
      reason,
      validationDetails: JSON.stringify(validationResult),
    };

    // Insert approval record
    const result = await tenantDb.execute(
      sql`INSERT INTO cer_approvals (
        organization_id, project_id, section_key, status,
        requested_by_id, requested_at, approved_by_id, approved_at,
        rejected_by_id, rejected_at, reason, validation_details
      ) VALUES (
        ${approvalData.organizationId}, ${approvalData.projectId}, ${approvalData.sectionKey}, ${approvalData.status},
        ${approvalData.requestedById}, ${approvalData.requestedAt}, ${approvalData.approvedById}, ${approvalData.approvedAt},
        ${approvalData.rejectedById}, ${approvalData.rejectedAt}, ${approvalData.reason}, ${approvalData.validationDetails}
      ) RETURNING id`
    );

    const approvalId = result[0]?.id;

    if (!approvalId) {
      throw new Error('Failed to create approval record');
    }

    return {
      success: true,
      approvalId,
      message: validationResult.overrideRequiresApproval
        ? 'Override request submitted and pending approval'
        : 'Override automatically approved',
    };
  } catch (error) {
    console.error('Error requesting section gate override:', error);
    throw error;
  }
}

/**
 * Get override status for a CER section
 *
 * @param tenantDb - The tenant database context
 * @param organizationId - The organization ID for tenant isolation
 * @param projectId - The CER project ID
 * @param sectionKey - The section key to check
 * @returns The latest approval record for the section or null
 */
export async function getSectionOverrideStatus(
  tenantDb: TenantDb,
  organizationId: number,
  projectId: number,
  sectionKey: string
) {
  try {
    const result = await tenantDb.execute(
      sql`SELECT * FROM cer_approvals
          WHERE organization_id = ${organizationId}
          AND project_id = ${projectId}
          AND section_key = ${sectionKey}
          ORDER BY requested_at DESC
          LIMIT 1`
    );

    return result[0] || null;
  } catch (error) {
    console.error('Error getting section override status:', error);
    throw error;
  }
}

/**
 * Approve or reject a section override request
 *
 * @param tenantDb - The tenant database context
 * @param approvalId - The approval ID to update
 * @param organizationId - The organization ID for tenant isolation
 * @param userId - The user approving/rejecting
 * @param approved - Whether to approve or reject
 * @param comment - Optional comment
 * @returns Updated approval record
 */
export async function processSectionOverrideRequest(
  tenantDb: TenantDb,
  approvalId: number,
  organizationId: number,
  userId: number,
  approved: boolean,
  comment?: string
) {
  try {
    // Ensure approval belongs to organization (tenant isolation)
    const approval = await tenantDb.execute(
      sql`SELECT * FROM cer_approvals WHERE id = ${approvalId} AND organization_id = ${organizationId}`
    );

    if (!approval || !approval[0]) {
      throw new Error('Approval record not found or not accessible');
    }

    if (approval[0].status !== 'pending') {
      throw new Error('Approval request has already been processed');
    }

    // Update approval status
    const now = new Date();
    let updateQuery: SQL<unknown>;

    if (approved) {
      updateQuery = sql`
        UPDATE cer_approvals
        SET status = 'approved',
            approved_by_id = ${userId},
            approved_at = ${now},
            comments = ${comment || ''}
        WHERE id = ${approvalId}
        RETURNING *
      `;
    } else {
      updateQuery = sql`
        UPDATE cer_approvals
        SET status = 'rejected',
            rejected_by_id = ${userId},
            rejected_at = ${now},
            comments = ${comment || ''}
        WHERE id = ${approvalId}
        RETURNING *
      `;
    }

    const result = await tenantDb.execute(updateQuery);
    return result[0];
  } catch (error) {
    console.error('Error processing section override request:', error);
    throw error;
  }
}
