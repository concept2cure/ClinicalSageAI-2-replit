/**
 * Project Health Risk Factor Definitions
 * Phase 3.1 - Predictive Intelligence Engine
 * 
 * Defines general project health risk factors that apply across
 * all submission types (510(k), IND, NDA, BLA, PMA, MAA, De Novo).
 */

import { RiskFactor, RiskSeverity, RiskCategory, DetectedRisk } from './510k-risks';

/**
 * Project Health Risk Factors
 * Total: 17 risk factors for general project health
 */
export const PROJECT_HEALTH_RISKS: RiskFactor[] = [
  // Timeline Risks
  {
    id: 'PH-R001',
    name: 'Critical Path Delay',
    description: 'Tasks on critical path are delayed, threatening overall timeline',
    category: 'TIMELINE',
    severity: 'HIGH',
    weight: 0.85,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Reallocate resources to critical path or adjust timeline expectations',
    dataRequirements: ['task_schedule', 'actual_progress', 'dependencies']
  },
  {
    id: 'PH-R002',
    name: 'Milestone Slippage Pattern',
    description: 'Pattern of milestone slippage indicates systemic planning issues',
    category: 'TIMELINE',
    severity: 'MEDIUM',
    weight: 0.70,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Review and recalibrate project schedule with buffer time',
    relatedRisks: ['PH-R001'],
    dataRequirements: ['milestone_history', 'planned_vs_actual']
  },
  {
    id: 'PH-R003',
    name: 'Submission Date at Risk',
    description: 'Target submission date is at risk based on current progress',
    category: 'TIMELINE',
    severity: 'HIGH',
    weight: 0.85,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Initiate recovery plan or communicate revised timeline to stakeholders',
    relatedRisks: ['PH-R001', 'PH-R002'],
    dataRequirements: ['target_submission_date', 'remaining_tasks', 'velocity']
  },

  // Resource Risks
  {
    id: 'PH-R004',
    name: 'Resource Overallocation',
    description: 'Key team members are overallocated across multiple projects',
    category: 'RESOURCE',
    severity: 'MEDIUM',
    weight: 0.65,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Rebalance workload or bring in additional resources',
    dataRequirements: ['resource_allocation', 'team_capacity']
  },
  {
    id: 'PH-R005',
    name: 'Key Personnel Departure Risk',
    description: 'Critical team members may leave project before completion',
    category: 'RESOURCE',
    severity: 'HIGH',
    weight: 0.80,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Cross-train team members and document critical knowledge',
    dataRequirements: ['team_stability', 'turnover_indicators', 'knowledge_concentration']
  },
  {
    id: 'PH-R006',
    name: 'Expertise Gap',
    description: 'Project lacks required specialized expertise in key areas',
    category: 'RESOURCE',
    severity: 'HIGH',
    weight: 0.75,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Engage consultants or train existing team members',
    dataRequirements: ['required_skills', 'team_skills', 'gap_analysis']
  },

  // Quality Risks
  {
    id: 'PH-R007',
    name: 'Document Quality Trend Negative',
    description: 'Quality scores on recent deliverables show declining trend',
    category: 'COMPLIANCE',
    severity: 'MEDIUM',
    weight: 0.70,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Implement additional review cycles and quality checkpoints',
    dataRequirements: ['document_quality_scores', 'review_comments', 'revision_history']
  },
  {
    id: 'PH-R008',
    name: 'Regulatory Review Rejection Rate High',
    description: 'Internal regulatory review is rejecting high percentage of deliverables',
    category: 'COMPLIANCE',
    severity: 'HIGH',
    weight: 0.75,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Improve template adherence and provide additional author training',
    relatedRisks: ['PH-R007'],
    dataRequirements: ['review_results', 'rejection_reasons', 'deficiency_patterns']
  },

  // Communication Risks
  {
    id: 'PH-R009',
    name: 'Stakeholder Communication Gap',
    description: 'Inadequate communication with key stakeholders',
    category: 'RESOURCE',
    severity: 'MEDIUM',
    weight: 0.55,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Establish regular stakeholder updates and escalation paths',
    dataRequirements: ['communication_frequency', 'stakeholder_feedback', 'escalation_history']
  },
  {
    id: 'PH-R010',
    name: 'FDA Communication Delay',
    description: 'FDA communications are not being responded to within target timeframes',
    category: 'REGULATORY',
    severity: 'HIGH',
    weight: 0.85,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Prioritize FDA response and establish dedicated response team',
    dataRequirements: ['fda_communications', 'response_times', 'due_dates']
  },

  // Scope Risks
  {
    id: 'PH-R011',
    name: 'Scope Creep Detected',
    description: 'Project scope expanding without corresponding timeline/resource adjustment',
    category: 'TIMELINE',
    severity: 'MEDIUM',
    weight: 0.70,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Document scope changes and adjust timeline/resources accordingly',
    dataRequirements: ['original_scope', 'current_scope', 'change_requests']
  },
  {
    id: 'PH-R012',
    name: 'Requirements Instability',
    description: 'Frequent changes to project requirements creating rework',
    category: 'TIMELINE',
    severity: 'MEDIUM',
    weight: 0.65,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Lock requirements and implement formal change control',
    relatedRisks: ['PH-R011'],
    dataRequirements: ['requirements_changes', 'change_frequency', 'rework_hours']
  },

  // Technical Risks
  {
    id: 'PH-R013',
    name: 'Technical Uncertainty',
    description: 'Unresolved technical issues may impact regulatory strategy',
    category: 'TECHNICAL',
    severity: 'HIGH',
    weight: 0.80,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Prioritize resolution of technical issues and develop contingency plans',
    dataRequirements: ['open_technical_issues', 'impact_assessment', 'resolution_progress']
  },
  {
    id: 'PH-R014',
    name: 'Data Integrity Concern',
    description: 'Potential data integrity issues identified in study data',
    category: 'COMPLIANCE',
    severity: 'CRITICAL',
    weight: 0.95,
    detectionMethod: 'HYBRID',
    mitigationGuidance: 'Conduct data audit and implement corrective actions',
    dataRequirements: ['data_quality_metrics', 'audit_findings', 'alcoa_compliance']
  },

  // Budget Risks
  {
    id: 'PH-R015',
    name: 'Budget Overrun Trend',
    description: 'Project is trending toward budget overrun',
    category: 'RESOURCE',
    severity: 'MEDIUM',
    weight: 0.60,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Review spending and identify cost-saving opportunities',
    dataRequirements: ['budget_allocated', 'actual_spending', 'forecast']
  },

  // Dependency Risks
  {
    id: 'PH-R016',
    name: 'External Dependency Delay',
    description: 'External dependencies (vendors, labs, CROs) are causing delays',
    category: 'TIMELINE',
    severity: 'HIGH',
    weight: 0.75,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Escalate with vendors and develop backup plans',
    dataRequirements: ['external_dependencies', 'vendor_performance', 'delivery_dates']
  },
  {
    id: 'PH-R017',
    name: 'Regulatory Landscape Change',
    description: 'Regulatory guidance or requirements have changed affecting project',
    category: 'REGULATORY',
    severity: 'HIGH',
    weight: 0.80,
    detectionMethod: 'AUTOMATED',
    mitigationGuidance: 'Assess impact of changes and update project plan accordingly',
    dataRequirements: ['guidance_documents', 'regulation_changes', 'impact_analysis']
  }
];

/**
 * Get project health risk factor by ID
 */
export function getProjectHealthRiskById(id: string): RiskFactor | undefined {
  return PROJECT_HEALTH_RISKS.find(rf => rf.id === id);
}

/**
 * Get project health risks by category
 */
export function getProjectHealthRisksByCategory(category: RiskCategory): RiskFactor[] {
  return PROJECT_HEALTH_RISKS.filter(rf => rf.category === category);
}

/**
 * Get timeline-related risks
 */
export function getTimelineRisks(): RiskFactor[] {
  return PROJECT_HEALTH_RISKS.filter(rf => rf.category === 'TIMELINE');
}

/**
 * Get resource-related risks
 */
export function getResourceRisks(): RiskFactor[] {
  return PROJECT_HEALTH_RISKS.filter(rf => rf.category === 'RESOURCE');
}

/**
 * Get compliance-related risks
 */
export function getComplianceRisks(): RiskFactor[] {
  return PROJECT_HEALTH_RISKS.filter(rf => rf.category === 'COMPLIANCE');
}

/**
 * Get critical project health risks
 */
export function getCriticalProjectHealthRisks(): RiskFactor[] {
  return PROJECT_HEALTH_RISKS.filter(rf => rf.severity === 'CRITICAL');
}

/**
 * Calculate overall project health score based on detected risks
 */
export function calculateProjectHealthScore(detectedRisks: DetectedRisk[]): {
  score: number;
  status: 'HEALTHY' | 'AT_RISK' | 'CRITICAL';
  topRisks: DetectedRisk[];
} {
  if (detectedRisks.length === 0) {
    return { score: 1.0, status: 'HEALTHY', topRisks: [] };
  }

  const activeRisks = detectedRisks.filter(dr => dr.detected);
  
  // Calculate weighted score (inverted - higher is better)
  const totalRiskWeight = activeRisks.reduce((sum, dr) => 
    sum + (dr.factor.weight * dr.confidence), 0
  );
  
  const maxPossibleWeight = detectedRisks.reduce((sum, dr) => 
    sum + dr.factor.weight, 0
  );
  
  const riskLevel = maxPossibleWeight > 0 ? totalRiskWeight / maxPossibleWeight : 0;
  const healthScore = 1 - riskLevel;

  // Sort risks by impact (weight * confidence)
  const sortedRisks = [...activeRisks].sort((a, b) => 
    (b.factor.weight * b.confidence) - (a.factor.weight * a.confidence)
  );

  // Determine status
  let status: 'HEALTHY' | 'AT_RISK' | 'CRITICAL';
  if (healthScore >= 0.7) {
    status = 'HEALTHY';
  } else if (healthScore >= 0.4) {
    status = 'AT_RISK';
  } else {
    status = 'CRITICAL';
  }

  // Check for any critical severity risks
  if (activeRisks.some(dr => dr.factor.severity === 'CRITICAL' && dr.confidence > 0.7)) {
    status = 'CRITICAL';
  }

  return {
    score: healthScore,
    status,
    topRisks: sortedRisks.slice(0, 5)
  };
}

export default PROJECT_HEALTH_RISKS;
