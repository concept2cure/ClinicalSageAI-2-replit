/**
 * Proactive Monitoring Service
 * Phase 3.4 - Predictive Intelligence Engine
 * 
 * Runs scheduled monitoring cycles to detect emerging risks,
 * track project health, and trigger alerts for high-severity issues.
 */

import { PredictiveIntelligenceEngine, type Prediction, type SubmissionType } from './PredictiveIntelligenceEngine';
import type { DetectedRisk, RiskSeverity } from './risk-factors';

export interface MonitoringConfig {
  cycleIntervalHours: number; // Default: 4 hours
  alertThresholds: AlertThresholds;
  notificationChannels: NotificationChannel[];
  enabledSubmissionTypes: SubmissionType[];
}

export interface AlertThresholds {
  criticalRiskDetected: boolean; // Alert on any critical risk
  successProbabilityDrop: number; // Alert if probability drops by this amount
  successProbabilityBelow: number; // Alert if probability below this threshold
  rtaRiskAbove: number; // Alert if RTA risk above this threshold
  aiLetterProbabilityAbove: number; // Alert if AI letter probability above this
}

export type NotificationChannel = 'EMAIL' | 'IN_APP' | 'WEBHOOK' | 'SLACK' | 'TEAMS';

export interface MonitoredProject {
  projectId: string;
  projectName: string;
  submissionType: SubmissionType;
  targetSubmissionDate?: Date;
  lastMonitoredAt?: Date;
  lastPrediction?: Prediction;
  monitoringEnabled: boolean;
  customThresholds?: Partial<AlertThresholds>;
}

export interface MonitoringCycleResult {
  cycleId: string;
  startedAt: Date;
  completedAt: Date;
  projectsMonitored: number;
  alertsGenerated: Alert[];
  emergingRisks: EmergingRisk[];
  summary: MonitoringSummary;
}

export interface Alert {
  id: string;
  projectId: string;
  projectName: string;
  type: AlertType;
  severity: 'INFO' | 'WARNING' | 'CRITICAL';
  title: string;
  description: string;
  triggeredAt: Date;
  relatedRisks?: DetectedRisk[];
  actionRequired: boolean;
  recommendedActions: string[];
}

export type AlertType = 
  | 'CRITICAL_RISK_DETECTED'
  | 'SUCCESS_PROBABILITY_DROP'
  | 'SUCCESS_PROBABILITY_LOW'
  | 'RTA_RISK_HIGH'
  | 'AI_LETTER_LIKELY'
  | 'NEW_RISK_DETECTED'
  | 'SUBMISSION_DEADLINE_AT_RISK'
  | 'REGULATORY_CHANGE_IMPACT';

export interface EmergingRisk {
  projectId: string;
  risk: DetectedRisk;
  firstDetectedAt: Date;
  trendDirection: 'INCREASING' | 'STABLE' | 'DECREASING';
  confidenceChange: number;
}

export interface MonitoringSummary {
  totalProjects: number;
  healthyProjects: number;
  atRiskProjects: number;
  criticalProjects: number;
  averageSuccessProbability: number;
  newRisksDetected: number;
  risksResolved: number;
}

/**
 * Project history for trend tracking
 */
interface ProjectHistory {
  projectId: string;
  predictions: Array<{
    timestamp: Date;
    prediction: Prediction;
  }>;
  alertHistory: Alert[];
}

/**
 * Proactive Monitoring Service
 * Runs scheduled monitoring cycles to detect and alert on project risks
 */
export class ProactiveMonitoringService {
  private predictionEngine: PredictiveIntelligenceEngine;
  private config: MonitoringConfig;
  private projectHistories: Map<string, ProjectHistory> = new Map();
  private monitoringInterval?: ReturnType<typeof setInterval>;
  private isRunning: boolean = false;

  constructor(config?: Partial<MonitoringConfig>) {
    this.predictionEngine = new PredictiveIntelligenceEngine();
    this.config = {
      cycleIntervalHours: config?.cycleIntervalHours ?? 4,
      alertThresholds: config?.alertThresholds ?? {
        criticalRiskDetected: true,
        successProbabilityDrop: 0.15,
        successProbabilityBelow: 0.5,
        rtaRiskAbove: 0.3,
        aiLetterProbabilityAbove: 0.7
      },
      notificationChannels: config?.notificationChannels ?? ['IN_APP'],
      enabledSubmissionTypes: config?.enabledSubmissionTypes ?? [
        '510k', 'IND', 'NDA', 'BLA', 'PMA', 'MAA', 'DE_NOVO'
      ]
    };
  }

  /**
   * Start the monitoring service
   */
  start(): void {
    if (this.isRunning) {
      console.warn('Proactive monitoring is already running');
      return;
    }

    const intervalMs = this.config.cycleIntervalHours * 60 * 60 * 1000;
    
    this.monitoringInterval = setInterval(async () => {
      await this.runMonitoringCycle([]);
    }, intervalMs);
    
    this.isRunning = true;
    console.log(`Proactive monitoring started - running every ${this.config.cycleIntervalHours} hours`);
  }

  /**
   * Stop the monitoring service
   */
  stop(): void {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = undefined;
    }
    this.isRunning = false;
    console.log('Proactive monitoring stopped');
  }

  /**
   * Check if monitoring is running
   */
  isMonitoringActive(): boolean {
    return this.isRunning;
  }

  /**
   * Run a single monitoring cycle
   */
  async runMonitoringCycle(projects: MonitoredProject[]): Promise<MonitoringCycleResult> {
    const cycleId = `cycle_${Date.now()}`;
    const startedAt = new Date();
    const alerts: Alert[] = [];
    const emergingRisks: EmergingRisk[] = [];

    // Filter to enabled projects
    const activeProjects = projects.filter(p => 
      p.monitoringEnabled && 
      this.config.enabledSubmissionTypes.includes(p.submissionType)
    );

    // Run predictions for each project
    for (const project of activeProjects) {
      try {
        const result = await this.monitorProject(project);
        alerts.push(...result.alerts);
        emergingRisks.push(...result.emergingRisks);
      } catch (error) {
        console.error(`Failed to monitor project ${project.projectId}:`, error);
      }
    }

    // Calculate summary
    const summary = this.calculateSummary(activeProjects);

    return {
      cycleId,
      startedAt,
      completedAt: new Date(),
      projectsMonitored: activeProjects.length,
      alertsGenerated: alerts,
      emergingRisks,
      summary
    };
  }

  /**
   * Monitor a single project
   */
  private async monitorProject(project: MonitoredProject): Promise<{
    alerts: Alert[];
    emergingRisks: EmergingRisk[];
  }> {
    const alerts: Alert[] = [];
    const emergingRisks: EmergingRisk[] = [];

    // Generate new prediction
    const prediction = await this.predictionEngine.generatePrediction({
      projectId: project.projectId,
      submissionType: project.submissionType,
      projectData: {}
    });

    // Get or create project history
    let history = this.projectHistories.get(project.projectId);
    if (!history) {
      history = {
        projectId: project.projectId,
        predictions: [],
        alertHistory: []
      };
      this.projectHistories.set(project.projectId, history);
    }

    // Store prediction in history
    history.predictions.push({
      timestamp: new Date(),
      prediction
    });

    // Limit history to last 100 predictions
    if (history.predictions.length > 100) {
      history.predictions = history.predictions.slice(-100);
    }

    // Get thresholds (project custom or global)
    const thresholds = {
      ...this.config.alertThresholds,
      ...project.customThresholds
    };

    // Check for alerts
    const newAlerts = this.detectAlerts(project, prediction, history, thresholds);
    alerts.push(...newAlerts);

    // Detect emerging risks
    const newEmergingRisks = this.detectEmergingRisks(project, prediction, history);
    emergingRisks.push(...newEmergingRisks);

    // Update alert history
    history.alertHistory.push(...newAlerts);

    return { alerts, emergingRisks };
  }

  /**
   * Detect alerts based on prediction and thresholds
   */
  private detectAlerts(
    project: MonitoredProject,
    prediction: Prediction,
    history: ProjectHistory,
    thresholds: AlertThresholds
  ): Alert[] {
    const alerts: Alert[] = [];
    const now = new Date();

    // Check for critical risks
    if (thresholds.criticalRiskDetected) {
      const criticalRisks = prediction.detectedRisks.filter(
        r => r.detected && r.factor.severity === 'CRITICAL'
      );
      
      for (const risk of criticalRisks) {
        // Check if we already alerted on this risk recently
        const recentAlert = history.alertHistory.find(
          a => a.type === 'CRITICAL_RISK_DETECTED' && 
               a.relatedRisks?.some(r => r.factorId === risk.factorId) &&
               (now.getTime() - a.triggeredAt.getTime()) < 24 * 60 * 60 * 1000
        );

        if (!recentAlert) {
          alerts.push({
            id: `alert_${Date.now()}_${risk.factorId}`,
            projectId: project.projectId,
            projectName: project.projectName,
            type: 'CRITICAL_RISK_DETECTED',
            severity: 'CRITICAL',
            title: `Critical Risk: ${risk.factor.name}`,
            description: risk.factor.description,
            triggeredAt: now,
            relatedRisks: [risk],
            actionRequired: true,
            recommendedActions: risk.mitigationRecommendations
          });
        }
      }
    }

    // Check for success probability drop
    const previousPrediction = history.predictions[history.predictions.length - 2]?.prediction;
    if (previousPrediction) {
      const probabilityDrop = previousPrediction.successProbability - prediction.successProbability;
      if (probabilityDrop >= thresholds.successProbabilityDrop) {
        alerts.push({
          id: `alert_${Date.now()}_prob_drop`,
          projectId: project.projectId,
          projectName: project.projectName,
          type: 'SUCCESS_PROBABILITY_DROP',
          severity: 'WARNING',
          title: 'Success Probability Decreased',
          description: `Success probability dropped from ${Math.round(previousPrediction.successProbability * 100)}% to ${Math.round(prediction.successProbability * 100)}%`,
          triggeredAt: now,
          actionRequired: true,
          recommendedActions: prediction.mitigations.slice(0, 3).map(m => m.action)
        });
      }
    }

    // Check for low success probability
    if (prediction.successProbability < thresholds.successProbabilityBelow) {
      const recentLowProbAlert = history.alertHistory.find(
        a => a.type === 'SUCCESS_PROBABILITY_LOW' &&
             (now.getTime() - a.triggeredAt.getTime()) < 24 * 60 * 60 * 1000
      );

      if (!recentLowProbAlert) {
        alerts.push({
          id: `alert_${Date.now()}_low_prob`,
          projectId: project.projectId,
          projectName: project.projectName,
          type: 'SUCCESS_PROBABILITY_LOW',
          severity: 'WARNING',
          title: 'Low Success Probability',
          description: `Current success probability is ${Math.round(prediction.successProbability * 100)}%, below the ${Math.round(thresholds.successProbabilityBelow * 100)}% threshold`,
          triggeredAt: now,
          actionRequired: true,
          recommendedActions: prediction.mitigations.slice(0, 5).map(m => m.action)
        });
      }
    }

    // Check for high RTA risk
    if (prediction.rtaRisk > thresholds.rtaRiskAbove) {
      alerts.push({
        id: `alert_${Date.now()}_rta`,
        projectId: project.projectId,
        projectName: project.projectName,
        type: 'RTA_RISK_HIGH',
        severity: 'WARNING',
        title: 'High Refuse to Accept Risk',
        description: `RTA risk is ${Math.round(prediction.rtaRisk * 100)}%. Submission may be refused if critical elements are missing.`,
        triggeredAt: now,
        actionRequired: true,
        recommendedActions: [
          'Review RTA checklist for completeness',
          'Ensure all required sections are included',
          'Verify document formatting meets FDA requirements'
        ]
      });
    }

    // Check for high AI letter probability
    if (prediction.aiLetterProbability > thresholds.aiLetterProbabilityAbove) {
      alerts.push({
        id: `alert_${Date.now()}_ai_letter`,
        projectId: project.projectId,
        projectName: project.projectName,
        type: 'AI_LETTER_LIKELY',
        severity: 'INFO',
        title: 'Additional Information Request Likely',
        description: `${Math.round(prediction.aiLetterProbability * 100)}% probability of receiving an AI letter from FDA`,
        triggeredAt: now,
        actionRequired: false,
        recommendedActions: [
          'Proactively address common deficiency areas',
          'Prepare response templates for likely questions',
          'Ensure team availability for rapid response'
        ]
      });
    }

    // Check submission deadline risk
    if (project.targetSubmissionDate) {
      const daysUntilDeadline = Math.ceil(
        (project.targetSubmissionDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
      );
      const estimatedDaysNeeded = prediction.estimatedReviewTime;
      
      if (daysUntilDeadline < estimatedDaysNeeded && daysUntilDeadline > 0) {
        alerts.push({
          id: `alert_${Date.now()}_deadline`,
          projectId: project.projectId,
          projectName: project.projectName,
          type: 'SUBMISSION_DEADLINE_AT_RISK',
          severity: 'WARNING',
          title: 'Submission Deadline at Risk',
          description: `${daysUntilDeadline} days until deadline, but current progress suggests ${estimatedDaysNeeded} days needed`,
          triggeredAt: now,
          actionRequired: true,
          recommendedActions: [
            'Prioritize critical path tasks',
            'Consider additional resources',
            'Evaluate scope for potential reduction'
          ]
        });
      }
    }

    return alerts;
  }

  /**
   * Detect emerging risks by comparing with history
   */
  private detectEmergingRisks(
    project: MonitoredProject,
    prediction: Prediction,
    history: ProjectHistory
  ): EmergingRisk[] {
    const emergingRisks: EmergingRisk[] = [];
    const previousPrediction = history.predictions[history.predictions.length - 2]?.prediction;

    for (const risk of prediction.detectedRisks) {
      if (!risk.detected) continue;

      // Check if this is a new risk
      const wasDetectedBefore = previousPrediction?.detectedRisks.find(
        r => r.factorId === risk.factorId && r.detected
      );

      let trendDirection: 'INCREASING' | 'STABLE' | 'DECREASING' = 'STABLE';
      let confidenceChange = 0;

      if (wasDetectedBefore) {
        confidenceChange = risk.confidence - wasDetectedBefore.confidence;
        if (confidenceChange > 0.1) {
          trendDirection = 'INCREASING';
        } else if (confidenceChange < -0.1) {
          trendDirection = 'DECREASING';
        }
      } else {
        // New risk detected
        trendDirection = 'INCREASING';
      }

      // Only report emerging risks that are increasing or newly detected
      if (trendDirection === 'INCREASING' || !wasDetectedBefore) {
        emergingRisks.push({
          projectId: project.projectId,
          risk,
          firstDetectedAt: wasDetectedBefore ? new Date() : risk.detectedAt,
          trendDirection,
          confidenceChange
        });
      }
    }

    return emergingRisks;
  }

  /**
   * Calculate summary statistics
   */
  private calculateSummary(projects: MonitoredProject[]): MonitoringSummary {
    const totalProjects = projects.length;
    let healthyProjects = 0;
    let atRiskProjects = 0;
    let criticalProjects = 0;
    let totalSuccessProbability = 0;
    let newRisksDetected = 0;
    let risksResolved = 0;

    for (const project of projects) {
      const history = this.projectHistories.get(project.projectId);
      if (!history || history.predictions.length === 0) continue;

      const latestPrediction = history.predictions[history.predictions.length - 1].prediction;
      const previousPrediction = history.predictions[history.predictions.length - 2]?.prediction;

      totalSuccessProbability += latestPrediction.successProbability;

      // Categorize project health
      if (latestPrediction.successProbability >= 0.7) {
        healthyProjects++;
      } else if (latestPrediction.successProbability >= 0.4) {
        atRiskProjects++;
      } else {
        criticalProjects++;
      }

      // Count new and resolved risks
      if (previousPrediction) {
        const previousRiskIds = new Set(
          previousPrediction.detectedRisks.filter(r => r.detected).map(r => r.factorId)
        );
        const currentRiskIds = new Set(
          latestPrediction.detectedRisks.filter(r => r.detected).map(r => r.factorId)
        );

        // New risks
        for (const id of currentRiskIds) {
          if (!previousRiskIds.has(id)) {
            newRisksDetected++;
          }
        }

        // Resolved risks
        for (const id of previousRiskIds) {
          if (!currentRiskIds.has(id)) {
            risksResolved++;
          }
        }
      }
    }

    return {
      totalProjects,
      healthyProjects,
      atRiskProjects,
      criticalProjects,
      averageSuccessProbability: totalProjects > 0 ? totalSuccessProbability / totalProjects : 0,
      newRisksDetected,
      risksResolved
    };
  }

  /**
   * Get alerts for a specific project
   */
  getProjectAlerts(projectId: string): Alert[] {
    const history = this.projectHistories.get(projectId);
    return history?.alertHistory ?? [];
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId: string): boolean {
    for (const history of this.projectHistories.values()) {
      const alertIndex = history.alertHistory.findIndex(a => a.id === alertId);
      if (alertIndex >= 0) {
        history.alertHistory[alertIndex].actionRequired = false;
        return true;
      }
    }
    return false;
  }

  /**
   * Get monitoring configuration
   */
  getConfig(): MonitoringConfig {
    return { ...this.config };
  }

  /**
   * Update monitoring configuration
   */
  updateConfig(updates: Partial<MonitoringConfig>): void {
    this.config = { ...this.config, ...updates };
    
    // Restart with new interval if changed
    if (updates.cycleIntervalHours && this.isRunning) {
      this.stop();
      this.start();
    }
  }

  /**
   * Trigger alerts for distribution
   */
  async triggerAlerts(alerts: Alert[]): Promise<void> {
    for (const alert of alerts) {
      for (const channel of this.config.notificationChannels) {
        await this.sendAlertToChannel(alert, channel);
      }
    }
  }

  /**
   * Send alert to notification channel
   */
  private async sendAlertToChannel(alert: Alert, channel: NotificationChannel): Promise<void> {
    // Implementation would connect to actual notification services
    console.log(`[${channel}] Alert: ${alert.title} (${alert.severity})`);
    
    switch (channel) {
      case 'IN_APP':
        // Would emit event for UI notification
        break;
      case 'EMAIL':
        // Would send email via email service
        break;
      case 'WEBHOOK':
        // Would POST to configured webhook URL
        break;
      case 'SLACK':
        // Would post to Slack channel
        break;
      case 'TEAMS':
        // Would post to Teams channel
        break;
    }
  }
}

export default ProactiveMonitoringService;
