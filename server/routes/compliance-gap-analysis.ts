/**
 * Compliance Gap Analysis API
 * 
 * Provides comprehensive compliance validation and gap reporting
 * for regulatory submissions across FDA, EMA, PMDA, Health Canada, WHO, and TGA.
 * 
 * Features:
 * - Multi-agency compliance validation
 * - Real-time gap detection and scoring
 * - Intelligent discrepancy identification
 * - Automated remediation recommendations
 * - Historical compliance trend analysis
 * - Predictive risk assessment
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { db } from '../db';
import { documents, components, organizations } from '../../shared/schema';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
// @ts-ignore - JavaScript middleware file
// @ts-ignore - JavaScript middleware file
import * as authMiddleware from '../middleware/auth.cjs';

const { authenticateToken } = authMiddleware as {
  authenticateToken: (req: Request, res: Response, next: () => void) => void;
};
// @ts-ignore - JavaScript middleware file
import { requireOrganizationContext } from '../middleware/tenantContext';

if (!db) {
  throw new Error('Database connection not initialized');
}

const router = Router();

const isDemoMode = () => process.env.DEMO_MODE === 'true';

// Apply authentication and organization context middleware
router.use(authenticateToken);
router.use(requireOrganizationContext);

// Compliance rule definitions for each agency
const COMPLIANCE_RULES = {
  FDA: {
    required_sections: [
      '1.0-administrative',
      '2.0-summaries',
      '3.0-quality',
      '4.0-nonclinical',
      '5.0-clinical'
    ],
    validation_rules: {
      'manufacturing_controls': { weight: 0.15, required: true },
      'clinical_safety': { weight: 0.20, required: true },
      'labeling_requirements': { weight: 0.10, required: true },
      'stability_data': { weight: 0.15, required: true },
      'bioequivalence': { weight: 0.10, required: false },
      'sterility_assurance': { weight: 0.10, required: false },
      'environmental_assessment': { weight: 0.05, required: false },
      'pediatric_plan': { weight: 0.05, required: false },
      'rems_assessment': { weight: 0.05, required: false },
      'patent_certification': { weight: 0.05, required: true }
    }
  },
  EMA: {
    required_sections: [
      'module-1-administrative',
      'module-2-summaries',
      'module-3-quality',
      'module-4-nonclinical',
      'module-5-clinical'
    ],
    validation_rules: {
      'gmp_compliance': { weight: 0.15, required: true },
      'risk_management_plan': { weight: 0.15, required: true },
      'clinical_overview': { weight: 0.15, required: true },
      'quality_overall_summary': { weight: 0.15, required: true },
      'pharmacovigilance': { weight: 0.10, required: true },
      'environmental_risk': { weight: 0.05, required: false },
      'pediatric_investigation': { weight: 0.10, required: false },
      'orphan_designation': { weight: 0.05, required: false },
      'conditional_approval': { weight: 0.05, required: false },
      'biosimilar_comparability': { weight: 0.05, required: false }
    }
  },
  PMDA: {
    required_sections: [
      'ctd-module-1',
      'ctd-module-2',
      'ctd-module-3',
      'ctd-module-4',
      'ctd-module-5'
    ],
    validation_rules: {
      'japanese_labeling': { weight: 0.20, required: true },
      'local_clinical_data': { weight: 0.20, required: true },
      'gmp_certificate': { weight: 0.15, required: true },
      'stability_zone_ivb': { weight: 0.10, required: true },
      'ethnic_factors': { weight: 0.10, required: false },
      'pmda_consultation': { weight: 0.10, required: false },
      'ich_e5_compliance': { weight: 0.05, required: true },
      'japanese_pharmacopoeia': { weight: 0.05, required: true },
      'post_marketing_surveillance': { weight: 0.05, required: false }
    }
  },
  'Health Canada': {
    required_sections: [
      'cover-letter',
      'administrative-info',
      'quality-data',
      'nonclinical-data',
      'clinical-data'
    ],
    validation_rules: {
      'canadian_reference_product': { weight: 0.15, required: true },
      'notice_of_compliance': { weight: 0.15, required: true },
      'risk_management_plan': { weight: 0.15, required: true },
      'pediatric_plan': { weight: 0.10, required: false },
      'inner_outer_labels': { weight: 0.10, required: true },
      'product_monograph': { weight: 0.10, required: true },
      'bioequivalence_canadian': { weight: 0.10, required: false },
      'environmental_assessment': { weight: 0.05, required: false },
      'priority_review': { weight: 0.05, required: false },
      'patent_register': { weight: 0.05, required: false }
    }
  },
  WHO: {
    required_sections: [
      'product-information',
      'quality-module',
      'nonclinical-module',
      'clinical-module',
      'prequalification-specific'
    ],
    validation_rules: {
      'who_public_assessment': { weight: 0.20, required: true },
      'stringent_authority_approval': { weight: 0.15, required: false },
      'who_bioequivalence': { weight: 0.15, required: false },
      'api_prequalification': { weight: 0.10, required: false },
      'who_gmp_compliance': { weight: 0.15, required: true },
      'stability_who_zones': { weight: 0.10, required: true },
      'who_model_list': { weight: 0.05, required: false },
      'tb_hiv_malaria_program': { weight: 0.05, required: false },
      'who_collaborative_registration': { weight: 0.05, required: false }
    }
  },
  TGA: {
    required_sections: [
      'administrative-data',
      'product-information',
      'quality-data',
      'nonclinical-data',
      'clinical-data'
    ],
    validation_rules: {
      'australian_pi': { weight: 0.15, required: true },
      'consumer_medicine_info': { weight: 0.10, required: true },
      'tga_gmp_clearance': { weight: 0.15, required: true },
      'australian_clinical_data': { weight: 0.10, required: false },
      'artg_listing': { weight: 0.15, required: true },
      'priority_review_designation': { weight: 0.05, required: false },
      'orphan_drug_designation': { weight: 0.05, required: false },
      'biologicals_requirements': { weight: 0.10, required: false },
      'complementary_medicine': { weight: 0.05, required: false },
      'export_only_registration': { weight: 0.10, required: false }
    }
  }
};

// Schema for validation request
const validationRequestSchema = z.object({
  documentIds: z.array(z.string()).optional(),
  componentUdis: z.array(z.string()).optional(),
  agencies: z.array(z.enum(['FDA', 'EMA', 'PMDA', 'Health Canada', 'WHO', 'TGA'])).default(['FDA']),
  submissionType: z.enum(['IND', 'NDA', 'ANDA', 'BLA', 'MAA', 'CTA', 'JNDA']).optional(),
  includeRecommendations: z.boolean().default(true)
});

/**
 * POST /api/compliance-gap-analysis/validate
 * Perform comprehensive compliance validation
 */
router.post('/validate', async (req, res) => {
  try {
    const { organizationId } = req as any;
    const validatedData = validationRequestSchema.parse(req.body);
    
    // Fetch actual documents/components to validate
    let documentsToCheck: any[] = [];
    let componentsToCheck: any[] = [];
    
    if (validatedData.documentIds && validatedData.documentIds.length > 0) {
      documentsToCheck = await db!
        .select()
        .from(documents)
        .where(
          and(
            eq(documents.organizationId, organizationId),
            sql`${documents.id}::text = ANY(${validatedData.documentIds})`
          )
        );
    } else {
      // Get all documents for the organization
      documentsToCheck = await db!
        .select()
        .from(documents)
        .where(eq(documents.organizationId, organizationId));
    }
    
    if (validatedData.componentUdis && validatedData.componentUdis.length > 0) {
      componentsToCheck = await db!
        .select()
        .from(components)
        .where(
          and(
            eq(components.organizationId, organizationId),
            sql`${components.udi} = ANY(${validatedData.componentUdis})`
          )
        );
    } else {
      // Get all components for the organization
      componentsToCheck = await db!
        .select()
        .from(components)
        .where(eq(components.organizationId, organizationId));
    }
    
    // Initialize results structure
    const results = {
      overallScore: 0,
      agencies: {} as any,
      criticalGaps: [] as any[],
      recommendations: [] as any[],
      timestamp: new Date().toISOString(),
      documentsAnalyzed: documentsToCheck.length,
      componentsAnalyzed: componentsToCheck.length
    };
    
    // Validate for each requested agency
    for (const agency of validatedData.agencies) {
      const rules = COMPLIANCE_RULES[agency];
      const agencyResult = {
        agency,
        score: 0,
        gaps: [] as any[],
        compliantItems: [] as any[],
        totalWeight: 0,
        achievedWeight: 0
      };
      
      // Check each validation rule
      for (const [rule, config] of Object.entries(rules.validation_rules)) {
        const ruleResult = {
          rule,
          required: config.required,
          weight: config.weight,
          status: 'missing' as 'complete' | 'partial' | 'missing',
          details: ''
        };
        
        // Check if rule keyword exists in documents or components
        const ruleKeyword = rule.replace(/_/g, ' ').toLowerCase();
        
        const docsWithKeyword = documentsToCheck.filter(doc => 
          (doc.title?.toLowerCase().includes(ruleKeyword) || 
           doc.content?.toString().toLowerCase().includes(ruleKeyword))
        );
        
        const compsWithKeyword = componentsToCheck.filter(comp =>
          (comp.sectionTitle?.toLowerCase().includes(ruleKeyword) ||
           JSON.stringify(comp.content)?.toLowerCase().includes(ruleKeyword))
        );
        
        const hasContent = docsWithKeyword.length > 0 || compsWithKeyword.length > 0;
        const contentCount = docsWithKeyword.length + compsWithKeyword.length;
        
        // Determine completeness based on content volume
        const isComplete = contentCount >= 2; // At least 2 instances found = complete
        const isPartial = contentCount === 1; // Only 1 instance = partial
        
        if (isComplete) {
          ruleResult.status = 'complete';
          ruleResult.details = `Found in ${contentCount} documents/components`;
          agencyResult.achievedWeight += config.weight;
          agencyResult.compliantItems.push(ruleResult);
        } else if (isPartial) {
          ruleResult.status = 'partial';
          ruleResult.details = `Found in only ${contentCount} document/component - may need additional coverage`;
          agencyResult.achievedWeight += config.weight * 0.5;
          agencyResult.gaps.push(ruleResult);
          
          if (config.required) {
            results.criticalGaps.push({
              agency,
              rule,
              severity: 'high',
              details: ruleResult.details
            });
          }
        } else {
          ruleResult.status = 'missing';
          ruleResult.details = 'Required content not found in any documents or components';
          agencyResult.gaps.push(ruleResult);
          
          if (config.required) {
            results.criticalGaps.push({
              agency,
              rule,
              severity: 'critical',
              details: ruleResult.details
            });
          }
        }
        
        agencyResult.totalWeight += config.weight;
      }
      
      // Calculate agency score
      agencyResult.score = agencyResult.totalWeight > 0 
        ? Math.round((agencyResult.achievedWeight / agencyResult.totalWeight) * 100)
        : 0;
      
      results.agencies[agency] = agencyResult;
    }
    
    // Calculate overall score
    const scores = Object.values(results.agencies).map((a: any) => a.score);
    results.overallScore = scores.length > 0
      ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length)
      : 0;
    
    // Generate recommendations if requested
    if (validatedData.includeRecommendations) {
      results.recommendations = generateRecommendations(results.criticalGaps);
    }
    
    res.json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error performing compliance validation:', error);
    
    if (error instanceof z.ZodError) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid request data', 
        details: error.errors 
      });
    }
    
    res.status(500).json({ 
      success: false, 
      error: 'Failed to perform compliance validation' 
    });
  }
});

/**
 * GET /api/compliance-gap-analysis/trends
 * Get historical compliance trends
 */
router.get('/trends', async (req, res) => {
  try {
    if (!isDemoMode()) {
      return res.status(501).json({
        success: false,
        error: 'Compliance trends require DEMO_MODE=true',
      });
    }
    const { organizationId } = req as any;
    const { period = '30d', agency } = req.query;
    
    // Generate mock trend data (in production, would query historical data)
    const trends = [];
    const days = period === '7d' ? 7 : period === '30d' ? 30 : 90;
    const now = new Date();
    
    for (let i = days; i >= 0; i -= Math.ceil(days / 10)) {
      const date = new Date(now);
      date.setDate(date.getDate() - i);
      
      const dataPoint = {
        date: date.toISOString().split('T')[0],
        overallScore: 65 + Math.random() * 25,
        agencies: {} as any
      };
      
      if (agency) {
        dataPoint.agencies[agency as string] = 70 + Math.random() * 20;
      } else {
        dataPoint.agencies = {
          FDA: 70 + Math.random() * 20,
          EMA: 65 + Math.random() * 25,
          PMDA: 60 + Math.random() * 30
        };
      }
      
      trends.push(dataPoint);
    }
    
    res.json({
      success: true,
      data: {
        period,
        trends,
        improvement: trends.length > 1 
          ? (trends[trends.length - 1].overallScore - trends[0].overallScore).toFixed(1)
          : 0
      }
    });
  } catch (error) {
    console.error('Error fetching compliance trends:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch compliance trends' 
    });
  }
});

/**
 * GET /api/compliance-gap-analysis/report/:submissionId
 * Generate detailed compliance report for a submission
 */
router.get('/report/:submissionId', async (req, res) => {
  try {
    if (!isDemoMode()) {
      return res.status(501).json({
        success: false,
        error: 'Compliance report requires DEMO_MODE=true',
      });
    }
    const { organizationId } = req as any;
    const { submissionId } = req.params;
    
    // Generate comprehensive report (mock data for now)
    const report = {
      submissionId,
      generatedAt: new Date().toISOString(),
      executiveSummary: {
        overallReadiness: 78,
        estimatedApprovalProbability: 0.72,
        criticalGapsCount: 3,
        majorGapsCount: 7,
        minorGapsCount: 15,
        estimatedRemediationTime: '2-3 weeks'
      },
      agencyBreakdown: {
        FDA: {
          score: 82,
          status: 'Nearly Complete',
          gaps: [
            { section: '3.2.S.4.3', issue: 'Stability data incomplete for accelerated conditions', severity: 'major' },
            { section: '5.3.5.1', issue: 'Missing pediatric study waiver justification', severity: 'critical' }
          ]
        },
        EMA: {
          score: 75,
          status: 'Significant Gaps',
          gaps: [
            { section: 'Module 1.8.2', issue: 'Risk Management Plan requires updates', severity: 'critical' },
            { section: 'Module 2.5', issue: 'Clinical Overview missing ethnic sensitivity analysis', severity: 'major' }
          ]
        }
      },
      remediationPlan: {
        immediate: [
          'Complete stability studies for accelerated conditions',
          'Submit pediatric waiver request with justification',
          'Update Risk Management Plan per latest EMA guidance'
        ],
        shortTerm: [
          'Conduct ethnic sensitivity analysis',
          'Update manufacturing process validation',
          'Complete outstanding bioequivalence studies'
        ],
        longTerm: [
          'Implement continuous process verification',
          'Establish post-approval change management protocol'
        ]
      },
      riskAssessment: {
        regulatoryRisk: 'Medium',
        timelineRisk: 'Low',
        qualityRisk: 'Medium',
        clinicalRisk: 'Low'
      }
    };
    
    res.json({
      success: true,
      data: report
    });
  } catch (error) {
    console.error('Error generating compliance report:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate compliance report' 
    });
  }
});

/**
 * POST /api/compliance-gap-analysis/compare
 * Compare compliance across multiple agencies
 */
router.post('/compare', async (req, res) => {
  try {
    const { organizationId } = req as any;
    const { agencies = ['FDA', 'EMA', 'PMDA'] } = req.body;
    
    const comparison = {
      agencies: agencies,
      commonRequirements: [] as any[],
      uniqueRequirements: {} as any,
      harmonizationScore: 0
    };
    
    // Identify common requirements
    const allRules = new Set<string>();
    const rulesByAgency = {} as any;
    
    for (const agency of agencies) {
      const rules = COMPLIANCE_RULES[agency as keyof typeof COMPLIANCE_RULES];
      if (rules) {
        rulesByAgency[agency] = new Set(Object.keys(rules.validation_rules));
        Object.keys(rules.validation_rules).forEach(rule => allRules.add(rule));
      }
    }
    
    // Find common and unique requirements
    for (const rule of allRules) {
      const presentIn = agencies.filter((agency: string) => 
        rulesByAgency[agency] && rulesByAgency[agency].has(rule)
      );
      
      if (presentIn.length === agencies.length) {
        comparison.commonRequirements.push({
          requirement: rule,
          agencies: presentIn
        });
      } else {
        for (const agency of presentIn) {
          if (!comparison.uniqueRequirements[agency]) {
            comparison.uniqueRequirements[agency] = [];
          }
          comparison.uniqueRequirements[agency].push(rule);
        }
      }
    }
    
    // Calculate harmonization score
    const totalRules = allRules.size;
    const commonRules = comparison.commonRequirements.length;
    comparison.harmonizationScore = totalRules > 0
      ? Math.round((commonRules / totalRules) * 100)
      : 0;
    
    res.json({
      success: true,
      data: comparison
    });
  } catch (error) {
    console.error('Error comparing compliance:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to compare compliance' 
    });
  }
});

/**
 * Helper function to generate remediation recommendations
 */
function generateRecommendations(gaps: any[]): any[] {
  const recommendations = [];
  
  const priorityMap = {
    critical: 1,
    high: 2,
    medium: 3,
    low: 4
  };
  
  // Sort gaps by severity
  const sortedGaps = gaps.sort((a, b) => 
    (priorityMap[a.severity as keyof typeof priorityMap] || 5) - 
    (priorityMap[b.severity as keyof typeof priorityMap] || 5)
  );
  
  // Generate recommendations for top gaps
  for (const gap of sortedGaps.slice(0, 5)) {
    const recommendation = {
      priority: gap.severity,
      gap: gap.rule,
      agency: gap.agency,
      action: '',
      estimatedEffort: '',
      resources: [] as string[]
    };
    
    // Generate specific recommendations based on the rule
    switch (gap.rule) {
      case 'stability_data':
        recommendation.action = 'Complete stability studies for all required conditions';
        recommendation.estimatedEffort = '4-6 weeks';
        recommendation.resources = ['Stability protocol template', 'ICH Q1A guidance'];
        break;
      case 'clinical_safety':
        recommendation.action = 'Compile comprehensive safety database and analysis';
        recommendation.estimatedEffort = '2-3 weeks';
        recommendation.resources = ['Safety reporting template', 'E2B format guide'];
        break;
      case 'risk_management_plan':
        recommendation.action = 'Develop or update Risk Management Plan per agency requirements';
        recommendation.estimatedEffort = '1-2 weeks';
        recommendation.resources = ['RMP template', 'Agency-specific guidance'];
        break;
      default:
        recommendation.action = `Address ${gap.rule} requirements for ${gap.agency} submission`;
        recommendation.estimatedEffort = '1-2 weeks';
        recommendation.resources = ['Agency guidance documents'];
    }
    
    recommendations.push(recommendation);
  }
  
  return recommendations;
}

export default router;