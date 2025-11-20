/**
 * Content Plan Management Service
 *
 * Phase 3: Advanced Content Plan Management & Validation
 *
 * This service handles comprehensive tracking, validation, and optimization
 * of generated content plans with cross-reference validation, timeline optimization,
 * and progress tracking capabilities.
 */

import crypto from 'crypto';

/**
 * Cross-Reference Validation for Content Plan Dependencies
 *
 * Validates the dependencies identified within the content plan against
 * actual document content and knowledge graph relations for consistency.
 */
async function validateContentPlanDependencies(contentPlan, knowledgeContext, dbPool, tenantId) {
  console.log('🔍 Phase 3: Validating content plan dependencies...');

  const validationResults = {
    dependencyValidation: [],
    inconsistencies: [],
    recommendations: [],
    validationScore: 0,
  };

  if (!contentPlan.modules || contentPlan.modules.length === 0) {
    return validationResults;
  }

  try {
    // 1. Validate module dependencies against knowledge graph relations
    for (const module of contentPlan.modules) {
      if (module.dependencies && module.dependencies.length > 0) {
        const dependencyCheck = {
          moduleCode: module.moduleCode,
          moduleName: module.moduleName,
          dependencies: module.dependencies,
          validationStatus: 'valid',
          issues: [],
        };

        // Check if dependencies exist in knowledge graph
        const dependencyQuery = await dbPool.query(
          `
          SELECT subject_entity, object_entity, relation_type, confidence_score
          FROM knowledge_graph_relations 
          WHERE tenant_id = $1 
          AND (
            LOWER(subject_entity) LIKE $2 OR 
            LOWER(object_entity) LIKE $2 OR
            LOWER(subject_entity) LIKE $3 OR 
            LOWER(object_entity) LIKE $3
          )
          AND relation_type IN ('depends_on', 'requires', 'prerequisite', 'follows')
          ORDER BY confidence_score DESC
        `,
          [tenantId, `%${module.moduleCode}%`, `%module%`]
        );

        if (dependencyQuery.rows.length === 0) {
          dependencyCheck.issues.push(
            `No knowledge graph evidence found for ${module.moduleCode} dependencies`
          );
          dependencyCheck.validationStatus = 'warning';
        }

        // Validate each dependency
        for (const dep of module.dependencies) {
          const depModule = contentPlan.modules.find(m => m.moduleCode === dep);
          if (!depModule) {
            dependencyCheck.issues.push(`Dependency ${dep} not found in current content plan`);
            dependencyCheck.validationStatus = 'error';
          } else {
            // Check logical sequence
            const moduleIndex = contentPlan.modules.indexOf(module);
            const depIndex = contentPlan.modules.indexOf(depModule);
            if (moduleIndex <= depIndex) {
              dependencyCheck.issues.push(
                `Dependency ${dep} should be completed before ${module.moduleCode}`
              );
              dependencyCheck.validationStatus = 'warning';
            }
          }
        }

        validationResults.dependencyValidation.push(dependencyCheck);
      }
    }

    // 2. Cross-reference with unified documents for consistency
    const documentQuery = await dbPool.query(
      `
      SELECT original_name, document_type, submission_type, module_specific_data
      FROM unified_documents 
      WHERE tenant_id = $1 
      AND submission_type = $2
      ORDER BY created_at DESC
      LIMIT 20
    `,
      [tenantId, contentPlan.metadata?.parameters?.submissionType || 'IND']
    );

    if (documentQuery.rows.length > 0) {
      const moduleCodesInDocs = new Set();
      documentQuery.rows.forEach(doc => {
        if (doc.module_specific_data) {
          try {
            const moduleData =
              typeof doc.module_specific_data === 'string'
                ? JSON.parse(doc.module_specific_data)
                : doc.module_specific_data;
            if (moduleData.moduleCode) {
              moduleCodesInDocs.add(moduleData.moduleCode);
            }
          } catch (e) {
            // Skip invalid JSON
          }
        }
      });

      // Check for missing modules that exist in historical documents
      const planModuleCodes = new Set(contentPlan.modules.map(m => m.moduleCode));
      const missingModules = [...moduleCodesInDocs].filter(code => !planModuleCodes.has(code));

      if (missingModules.length > 0) {
        validationResults.recommendations.push({
          type: 'missing_modules',
          message: `Consider including these modules based on historical submissions: ${missingModules.join(', ')}`,
          modules: missingModules,
          confidence: 0.7,
        });
      }
    }

    // 3. Calculate validation score
    const totalChecks = validationResults.dependencyValidation.length;
    const validChecks = validationResults.dependencyValidation.filter(
      v => v.validationStatus === 'valid'
    ).length;
    const warningChecks = validationResults.dependencyValidation.filter(
      v => v.validationStatus === 'warning'
    ).length;

    validationResults.validationScore =
      totalChecks > 0 ? Math.round(((validChecks + warningChecks * 0.5) / totalChecks) * 100) : 85; // Default score when no dependencies to validate

    console.log(`✅ Dependency validation complete. Score: ${validationResults.validationScore}%`);
  } catch (error) {
    console.error('Error validating content plan dependencies:', error);
    validationResults.inconsistencies.push({
      type: 'validation_error',
      message: 'Failed to validate dependencies due to system error',
      error: error.message,
    });
  }

  return validationResults;
}

/**
 * Timeline Optimization using Historical Data
 *
 * Refines effort and timeline estimates based on historical completion times
 * from unified_documents and compliance_check_history.
 */
async function optimizeTimelineEstimates(contentPlan, knowledgeContext, dbPool, tenantId) {
  console.log('📊 Phase 3: Optimizing timeline estimates with historical data...');

  const optimizationResults = {
    originalTimeline: contentPlan.totalTimeline,
    optimizedTimeline: contentPlan.totalTimeline,
    moduleAdjustments: [],
    historicalInsights: [],
    confidenceLevel: 'medium',
  };

  try {
    // 1. Query historical completion times from unified_documents
    const historicalQuery = await dbPool.query(
      `
      SELECT 
        original_name, 
        document_type, 
        submission_type, 
        module_specific_data,
        created_at,
        updated_at,
        EXTRACT(EPOCH FROM (updated_at::timestamp - created_at::timestamp))/86400 as completion_days
      FROM unified_documents 
      WHERE tenant_id = $1 
      AND submission_type = $2
      AND created_at IS NOT NULL 
      AND updated_at IS NOT NULL
      AND updated_at > created_at
      ORDER BY created_at DESC
      LIMIT 50
    `,
      [tenantId, contentPlan.metadata?.parameters?.submissionType || 'IND']
    );

    const historicalData = historicalQuery.rows.filter(
      row => row.completion_days > 0 && row.completion_days < 365
    );

    if (historicalData.length > 0) {
      // Calculate average completion times by document type
      const completionStats = {};
      historicalData.forEach(doc => {
        const docType = doc.document_type || 'unknown';
        if (!completionStats[docType]) {
          completionStats[docType] = {
            totalDays: 0,
            count: 0,
            documents: [],
          };
        }
        completionStats[docType].totalDays += doc.completion_days;
        completionStats[docType].count++;
        completionStats[docType].documents.push(doc);
      });

      // Calculate averages
      Object.keys(completionStats).forEach(docType => {
        const stats = completionStats[docType];
        stats.averageDays = stats.totalDays / stats.count;
        stats.averageWeeks = Math.round((stats.averageDays / 7) * 10) / 10;
      });

      optimizationResults.historicalInsights.push({
        type: 'completion_statistics',
        message: `Historical analysis of ${historicalData.length} documents`,
        statistics: completionStats,
      });

      // 2. Query compliance check history for risk adjustments
      const complianceQuery = await dbPool.query(
        `
        SELECT 
          document_type,
          submission_type,
          therapeutic_area,
          overall_compliance_score,
          identified_issues,
          regulatory_region
        FROM compliance_check_history 
        WHERE tenant_id = $1 
        AND submission_type = $2
        ORDER BY created_at DESC
        LIMIT 30
      `,
        [tenantId, contentPlan.metadata?.parameters?.submissionType || 'IND']
      );

      const complianceData = complianceQuery.rows;
      const avgComplianceScore =
        complianceData.length > 0
          ? complianceData.reduce(
              (sum, record) => sum + (record.overall_compliance_score || 0),
              0
            ) / complianceData.length
          : 85;

      // 3. Optimize each module's timeline
      const totalWeeksEstimate = [];

      for (const module of contentPlan.modules) {
        const moduleAdjustment = {
          moduleCode: module.moduleCode,
          originalTimeline: module.timeline,
          originalEffort: module.effort,
          optimizedTimeline: module.timeline,
          optimizedEffort: module.effort,
          adjustmentFactors: [],
          confidenceLevel: 'medium',
        };

        // Base timeline parsing
        let baseWeeks = 2; // Default
        const timelineMatch = module.timeline.match(/(\d+)[-–](\d+)\s*weeks?/);
        if (timelineMatch) {
          baseWeeks = (parseInt(timelineMatch[1]) + parseInt(timelineMatch[2])) / 2;
        }

        // Apply historical data adjustments
        const relevantDocType = module.moduleName.toLowerCase().includes('clinical')
          ? 'clinical'
          : module.moduleName.toLowerCase().includes('summary')
            ? 'summary'
            : 'regulatory';

        if (completionStats[relevantDocType]) {
          const historicalWeeks = completionStats[relevantDocType].averageWeeks;
          if (historicalWeeks > 0) {
            const adjustmentFactor = Math.min(Math.max(historicalWeeks / baseWeeks, 0.5), 2.0);
            baseWeeks = Math.round(baseWeeks * adjustmentFactor);
            moduleAdjustment.adjustmentFactors.push({
              type: 'historical_data',
              factor: adjustmentFactor,
              rationale: `Based on ${completionStats[relevantDocType].count} historical ${relevantDocType} documents`,
            });
          }
        }

        // Apply risk level adjustments
        const riskMultiplier =
          {
            high: 1.3,
            medium: 1.1,
            low: 0.9,
          }[module.riskLevel?.toLowerCase()] || 1.0;

        if (riskMultiplier !== 1.0) {
          baseWeeks = Math.round(baseWeeks * riskMultiplier);
          moduleAdjustment.adjustmentFactors.push({
            type: 'risk_adjustment',
            factor: riskMultiplier,
            rationale: `${module.riskLevel} risk modules require additional time`,
          });
        }

        // Apply compliance score adjustments
        if (avgComplianceScore < 80) {
          const complianceMultiplier = 1.2;
          baseWeeks = Math.round(baseWeeks * complianceMultiplier);
          moduleAdjustment.adjustmentFactors.push({
            type: 'compliance_adjustment',
            factor: complianceMultiplier,
            rationale: `Low historical compliance score (${Math.round(avgComplianceScore)}%) suggests additional review time needed`,
          });
        }

        // Update optimized timeline
        const minWeeks = Math.max(1, baseWeeks - 1);
        const maxWeeks = baseWeeks + 1;
        moduleAdjustment.optimizedTimeline =
          minWeeks === maxWeeks ? `${baseWeeks} weeks` : `${minWeeks}-${maxWeeks} weeks`;

        // Update effort level based on timeline
        if (baseWeeks >= 4) {
          moduleAdjustment.optimizedEffort = 'High';
        } else if (baseWeeks >= 2) {
          moduleAdjustment.optimizedEffort = 'Medium';
        } else {
          moduleAdjustment.optimizedEffort = 'Low';
        }

        moduleAdjustment.confidenceLevel =
          moduleAdjustment.adjustmentFactors.length > 0 ? 'high' : 'medium';
        optimizationResults.moduleAdjustments.push(moduleAdjustment);
        totalWeeksEstimate.push(baseWeeks);
      }

      // Calculate optimized total timeline
      const totalWeeks = totalWeeksEstimate.reduce((sum, weeks) => sum + weeks, 0);
      const totalMonths = Math.round((totalWeeks / 4.33) * 10) / 10;
      optimizationResults.optimizedTimeline =
        totalWeeks <= 12 ? `${totalWeeks} weeks` : `${totalMonths} months`;

      optimizationResults.confidenceLevel = historicalData.length > 10 ? 'high' : 'medium';

      console.log(
        `✅ Timeline optimization complete. Original: ${optimizationResults.originalTimeline}, Optimized: ${optimizationResults.optimizedTimeline}`
      );
    } else {
      optimizationResults.historicalInsights.push({
        type: 'insufficient_data',
        message: 'Limited historical data available for timeline optimization',
        recommendation: 'Timeline estimates based on regulatory best practices',
      });
    }
  } catch (error) {
    console.error('Error optimizing timeline estimates:', error);
    optimizationResults.historicalInsights.push({
      type: 'optimization_error',
      message: 'Failed to optimize timeline due to system error',
      error: error.message,
    });
  }

  return optimizationResults;
}

/**
 * Create Content Plan Progress Tracking Record
 *
 * Stores the content plan in the database with progress tracking capabilities
 * and initializes status tracking for each module and section.
 */
async function createContentPlanTrackingRecord(
  contentPlan,
  validationResults,
  optimizationResults,
  dbPool,
  tenantId,
  userId
) {
  console.log('📝 Phase 3: Creating content plan tracking record...');

  const trackingRecord = {
    planId: contentPlan.planId,
    created: true,
    trackingId: null,
    progressTracking: [],
    auditTrailId: null,
  };

  try {
    // 1. Create unified document entry for the content plan
    const planDocument = {
      original_name: `${contentPlan.planTitle}.json`,
      document_type: 'content_plan',
      submission_type: contentPlan.metadata?.parameters?.submissionType || 'IND',
      text_content: JSON.stringify(contentPlan, null, 2),
      processing_id: crypto.randomUUID(),
      file_size: BigInt(JSON.stringify(contentPlan).length),
      mime_type: 'application/json',
      module: 'content_planning',
      content_hash: crypto.createHash('sha256').update(JSON.stringify(contentPlan)).digest('hex'),
      tenant_id: tenantId,
      user_id: userId,
      regulatory_analysis: {
        validationResults,
        optimizationResults,
        phase: 'phase_3_advanced_management',
      },
      module_specific_data: {
        planId: contentPlan.planId,
        totalModules: contentPlan.modules?.length || 0,
        validationScore: validationResults.validationScore,
        optimizedTimeline: optimizationResults.optimizedTimeline,
        trackingEnabled: true,
      },
    };

    const documentInsert = await dbPool.query(
      `
      INSERT INTO unified_documents (
        original_name, document_type, submission_type, text_content, processing_id,
        file_size, mime_type, module, content_hash, tenant_id, user_id,
        regulatory_analysis, module_specific_data, created_at, updated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, NOW(), NOW())
      RETURNING id, created_at
    `,
      [
        planDocument.original_name,
        planDocument.document_type,
        planDocument.submission_type,
        planDocument.text_content,
        planDocument.processing_id,
        planDocument.file_size,
        planDocument.mime_type,
        planDocument.module,
        planDocument.content_hash,
        planDocument.tenant_id,
        planDocument.user_id,
        JSON.stringify(planDocument.regulatory_analysis),
        JSON.stringify(planDocument.module_specific_data),
      ]
    );

    trackingRecord.trackingId = documentInsert.rows[0].id;

    // 2. Initialize progress tracking for each module
    for (const module of contentPlan.modules) {
      const moduleTracking = {
        moduleCode: module.moduleCode,
        moduleName: module.moduleName,
        status: 'not_started',
        progress: 0,
        estimatedEffort: module.effort,
        estimatedTimeline: module.timeline,
        actualStartDate: null,
        actualEndDate: null,
        assignedTo: null,
        sections: [],
      };

      // Initialize section tracking
      if (module.sections) {
        module.sections.forEach(section => {
          moduleTracking.sections.push({
            sectionName: section,
            status: 'not_started',
            progress: 0,
            lastUpdated: null,
            comments: [],
          });
        });
      }

      trackingRecord.progressTracking.push(moduleTracking);
    }

    // 3. Create audit trail entry
    const auditEntry = await dbPool.query(
      `
      INSERT INTO document_audit_trail (
        document_version_id, action, performed_by, performed_at, details, tenant_id
      ) VALUES ($1, $2, $3, NOW(), $4, $5)
      RETURNING audit_id
    `,
      [
        trackingRecord.trackingId,
        'content_plan_created',
        userId,
        JSON.stringify({
          planId: contentPlan.planId,
          totalModules: contentPlan.modules?.length || 0,
          validationScore: validationResults.validationScore,
          optimizedTimeline: optimizationResults.optimizedTimeline,
          phase: 'phase_3_advanced_management',
        }),
        tenantId,
      ]
    );

    trackingRecord.auditTrailId = auditEntry.rows[0].audit_id;

    console.log(`✅ Content plan tracking record created. ID: ${trackingRecord.trackingId}`);
  } catch (error) {
    console.error('Error creating content plan tracking record:', error);
    trackingRecord.created = false;
    trackingRecord.error = error.message;
  }

  return trackingRecord;
}

/**
 * Generate Phase 3 Management Report
 *
 * Creates a comprehensive report of the advanced management and validation
 * capabilities applied to the content plan.
 */
function generatePhase3ManagementReport(
  contentPlan,
  validationResults,
  optimizationResults,
  trackingRecord
) {
  const report = {
    phase: 'phase_3_advanced_management',
    timestamp: new Date().toISOString(),
    planId: contentPlan.planId,
    management: {
      dependencyValidation: {
        score: validationResults.validationScore,
        totalDependencies: validationResults.dependencyValidation.length,
        validDependencies: validationResults.dependencyValidation.filter(
          v => v.validationStatus === 'valid'
        ).length,
        warnings: validationResults.dependencyValidation.filter(
          v => v.validationStatus === 'warning'
        ).length,
        errors: validationResults.dependencyValidation.filter(v => v.validationStatus === 'error')
          .length,
      },
      timelineOptimization: {
        originalTimeline: optimizationResults.originalTimeline,
        optimizedTimeline: optimizationResults.optimizedTimeline,
        adjustedModules: optimizationResults.moduleAdjustments.length,
        confidenceLevel: optimizationResults.confidenceLevel,
        historicalDataPoints: optimizationResults.historicalInsights.length,
      },
      progressTracking: {
        trackingEnabled: trackingRecord.created,
        trackingId: trackingRecord.trackingId,
        totalModules: trackingRecord.progressTracking.length,
        totalSections: trackingRecord.progressTracking.reduce(
          (sum, module) => sum + module.sections.length,
          0
        ),
        auditTrailEnabled: trackingRecord.auditTrailId !== null,
      },
    },
    capabilities: [
      'Cross-reference dependency validation',
      'Historical timeline optimization',
      'Granular progress tracking',
      'Audit trail integration',
      'Real-time status updates',
    ],
    nextSteps: [
      'Monitor content plan execution',
      'Update module progress status',
      'Validate dependency completion',
      'Optimize timelines based on actual progress',
    ],
  };

  return report;
}

export {
  validateContentPlanDependencies,
  optimizeTimelineEstimates,
  createContentPlanTrackingRecord,
  generatePhase3ManagementReport,
};
