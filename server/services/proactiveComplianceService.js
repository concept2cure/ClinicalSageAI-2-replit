/**
 * Proactive Compliance Service - Sprint 3
 * Multi-Agency Validation: Reminder & Notification System
 *
 * Implements automated alerts, deadline monitoring, and proactive compliance notifications
 * to ensure regulatory issues are addressed before they become critical.
 */

import { db } from '../db/index.js';
import { randomUUID } from 'crypto';

export class ProactiveComplianceService {
  constructor() {
    this.reminderIntervals = {
      IMMEDIATE: 0, // Immediate notification
      DAILY: 1, // 1 day before
      WEEKLY: 7, // 7 days before
      BIWEEKLY: 14, // 14 days before
      MONTHLY: 30, // 30 days before
    };

    this.priorityWeights = {
      Critical: 4,
      High: 3,
      Medium: 2,
      Low: 1,
    };

    this.notificationChannels = {
      SYSTEM_LOG: 'system_log',
      EMAIL_QUEUE: 'email_queue',
      DASHBOARD_ALERT: 'dashboard_alert',
      AUDIT_TRAIL: 'audit_trail',
    };
  }

  /**
   * Initialize proactive compliance monitoring
   */
  async initializeComplianceMonitoring(tenantId) {
    try {
      // Create notifications table if it doesn't exist
      await this.ensureNotificationsTable();

      // Set up periodic monitoring
      const monitoringSchedule = await this.createMonitoringSchedule(tenantId);

      console.log(`Proactive compliance monitoring initialized for tenant: ${tenantId}`);
      console.log(
        `Monitoring schedule created with ${monitoringSchedule.activeRules} active rules`
      );

      return monitoringSchedule;
    } catch (error) {
      console.error('Failed to initialize compliance monitoring:', error);
      throw error;
    }
  }

  /**
   * Main monitoring routine - checks for upcoming deadlines and status changes
   */
  async runComplianceMonitoring(tenantId) {
    try {
      console.log(
        `[${new Date().toISOString()}] Running compliance monitoring for tenant: ${tenantId}`
      );

      const monitoringResults = {
        deadlineAlerts: [],
        statusAlerts: [],
        overdueIssues: [],
        priorityEscalations: [],
        processedCount: 0,
        timestamp: new Date(),
      };

      // Check for upcoming deadlines
      const deadlineAlerts = await this.checkUpcomingDeadlines(tenantId);
      monitoringResults.deadlineAlerts = deadlineAlerts;

      // Check for status changes requiring attention
      const statusAlerts = await this.checkStatusChanges(tenantId);
      monitoringResults.statusAlerts = statusAlerts;

      // Check for overdue issues
      const overdueIssues = await this.checkOverdueIssues(tenantId);
      monitoringResults.overdueIssues = overdueIssues;

      // Check for priority escalations
      const priorityEscalations = await this.checkPriorityEscalations(tenantId);
      monitoringResults.priorityEscalations = priorityEscalations;

      // Process all alerts
      await this.processAlerts(monitoringResults, tenantId);

      monitoringResults.processedCount =
        deadlineAlerts.length +
        statusAlerts.length +
        overdueIssues.length +
        priorityEscalations.length;

      console.log(
        `Compliance monitoring completed. Processed ${monitoringResults.processedCount} alerts`
      );

      return monitoringResults;
    } catch (error) {
      console.error('Compliance monitoring error:', error);
      throw error;
    }
  }

  /**
   * Check for issues approaching deadlines
   */
  async checkUpcomingDeadlines(tenantId) {
    try {
      const alerts = [];

      // Query issues with due dates
      const upcomingIssues = await db.query(
        `
        SELECT 
          id,
          specific_violation,
          due_date,
          priority,
          status,
          assigned_to_user_id,
          impact_assessment,
          regulatory_section,
          affected_agencies
        FROM regulatory_validation_issues
        WHERE tenant_id = $1 
        AND due_date IS NOT NULL
        AND status != 'Resolved'
        AND due_date BETWEEN NOW() AND NOW() + INTERVAL '30 days'
        ORDER BY due_date ASC
      `,
        [tenantId]
      );

      for (const issue of upcomingIssues.rows) {
        const daysUntilDue = Math.ceil(
          (new Date(issue.due_date) - new Date()) / (1000 * 60 * 60 * 24)
        );

        // Determine alert urgency based on days until due and priority
        let alertLevel = 'INFO';
        let reminderType = 'ROUTINE';

        if (daysUntilDue <= 1) {
          alertLevel = 'URGENT';
          reminderType = 'IMMEDIATE';
        } else if (daysUntilDue <= 7) {
          alertLevel = 'HIGH';
          reminderType = 'WEEKLY';
        } else if (daysUntilDue <= 14) {
          alertLevel = 'MEDIUM';
          reminderType = 'BIWEEKLY';
        } else {
          alertLevel = 'LOW';
          reminderType = 'MONTHLY';
        }

        // Adjust alert level based on issue priority
        if (issue.priority === 'Critical' || issue.impact_assessment === 'Critical') {
          alertLevel = 'URGENT';
        }

        alerts.push({
          issueId: issue.id,
          type: 'DEADLINE_REMINDER',
          alertLevel,
          reminderType,
          daysUntilDue,
          issue: {
            violation: issue.specific_violation,
            priority: issue.priority,
            status: issue.status,
            assignedTo: issue.assigned_to_user_id,
            impactAssessment: issue.impact_assessment,
            regulatorySection: issue.regulatory_section,
            affectedAgencies: issue.affected_agencies,
          },
          message: `Regulatory validation issue "${issue.specific_violation}" is due in ${daysUntilDue} day(s)`,
          recommendedAction: this.generateDeadlineRecommendation(issue, daysUntilDue),
          dueDate: issue.due_date,
        });
      }

      return alerts;
    } catch (error) {
      console.error('Error checking upcoming deadlines:', error);
      return [];
    }
  }

  /**
   * Check for status changes requiring attention
   */
  async checkStatusChanges(tenantId) {
    try {
      const alerts = [];

      // Query recent status changes
      const statusChanges = await db.query(
        `
        SELECT 
          id,
          specific_violation,
          status,
          priority,
          assigned_to_user_id,
          created_at,
          updated_at,
          impact_assessment,
          regulatory_section
        FROM regulatory_validation_issues
        WHERE tenant_id = $1 
        AND updated_at > NOW() - INTERVAL '24 hours'
        AND status IN ('In Progress', 'Blocked', 'Needs Review')
        ORDER BY updated_at DESC
      `,
        [tenantId]
      );

      for (const issue of statusChanges.rows) {
        const hoursInStatus = Math.ceil(
          (new Date() - new Date(issue.updated_at)) / (1000 * 60 * 60)
        );

        // Alert for issues stuck in status
        if (hoursInStatus > 24) {
          alerts.push({
            issueId: issue.id,
            type: 'STATUS_ALERT',
            alertLevel: 'MEDIUM',
            hoursInStatus,
            issue: {
              violation: issue.specific_violation,
              status: issue.status,
              priority: issue.priority,
              assignedTo: issue.assigned_to_user_id,
              impactAssessment: issue.impact_assessment,
              regulatorySection: issue.regulatory_section,
            },
            message: `Issue "${issue.specific_violation}" has been ${issue.status} for ${hoursInStatus} hours`,
            recommendedAction: this.generateStatusRecommendation(issue, hoursInStatus),
          });
        }
      }

      return alerts;
    } catch (error) {
      console.error('Error checking status changes:', error);
      return [];
    }
  }

  /**
   * Check for overdue issues
   */
  async checkOverdueIssues(tenantId) {
    try {
      const alerts = [];

      // Query overdue issues
      const overdueIssues = await db.query(
        `
        SELECT 
          id,
          specific_violation,
          due_date,
          priority,
          status,
          assigned_to_user_id,
          impact_assessment,
          regulatory_section,
          affected_agencies
        FROM regulatory_validation_issues
        WHERE tenant_id = $1 
        AND due_date < NOW()
        AND status != 'Resolved'
        ORDER BY due_date ASC
      `,
        [tenantId]
      );

      for (const issue of overdueIssues.rows) {
        const daysOverdue = Math.ceil(
          (new Date() - new Date(issue.due_date)) / (1000 * 60 * 60 * 24)
        );

        alerts.push({
          issueId: issue.id,
          type: 'OVERDUE_ALERT',
          alertLevel: 'URGENT',
          daysOverdue,
          issue: {
            violation: issue.specific_violation,
            priority: issue.priority,
            status: issue.status,
            assignedTo: issue.assigned_to_user_id,
            impactAssessment: issue.impact_assessment,
            regulatorySection: issue.regulatory_section,
            affectedAgencies: issue.affected_agencies,
          },
          message: `Issue "${issue.specific_violation}" is ${daysOverdue} day(s) overdue`,
          recommendedAction: this.generateOverdueRecommendation(issue, daysOverdue),
          dueDate: issue.due_date,
        });
      }

      return alerts;
    } catch (error) {
      console.error('Error checking overdue issues:', error);
      return [];
    }
  }

  /**
   * Check for priority escalations
   */
  async checkPriorityEscalations(tenantId) {
    try {
      const alerts = [];

      // Query issues that may need priority escalation
      const escalationCandidates = await db.query(
        `
        SELECT 
          id,
          specific_violation,
          priority,
          status,
          assigned_to_user_id,
          impact_assessment,
          regulatory_section,
          affected_agencies,
          created_at,
          updated_at
        FROM regulatory_validation_issues
        WHERE tenant_id = $1 
        AND status != 'Resolved'
        AND (
          (priority = 'Medium' AND created_at < NOW() - INTERVAL '7 days') OR
          (priority = 'Low' AND created_at < NOW() - INTERVAL '14 days') OR
          (impact_assessment = 'Critical' AND priority != 'Critical')
        )
        ORDER BY created_at ASC
      `,
        [tenantId]
      );

      for (const issue of escalationCandidates.rows) {
        const daysActive = Math.ceil(
          (new Date() - new Date(issue.created_at)) / (1000 * 60 * 60 * 24)
        );

        let recommendedPriority = issue.priority;
        let escalationReason = '';

        // Determine escalation logic
        if (issue.impact_assessment === 'Critical' && issue.priority !== 'Critical') {
          recommendedPriority = 'Critical';
          escalationReason = 'Critical impact assessment requires Critical priority';
        } else if (issue.priority === 'Medium' && daysActive > 7) {
          recommendedPriority = 'High';
          escalationReason = `Medium priority issue active for ${daysActive} days`;
        } else if (issue.priority === 'Low' && daysActive > 14) {
          recommendedPriority = 'Medium';
          escalationReason = `Low priority issue active for ${daysActive} days`;
        }

        if (recommendedPriority !== issue.priority) {
          alerts.push({
            issueId: issue.id,
            type: 'PRIORITY_ESCALATION',
            alertLevel: 'HIGH',
            currentPriority: issue.priority,
            recommendedPriority,
            escalationReason,
            daysActive,
            issue: {
              violation: issue.specific_violation,
              status: issue.status,
              assignedTo: issue.assigned_to_user_id,
              impactAssessment: issue.impact_assessment,
              regulatorySection: issue.regulatory_section,
              affectedAgencies: issue.affected_agencies,
            },
            message: `Priority escalation recommended: ${issue.priority} → ${recommendedPriority}`,
            recommendedAction: `Consider escalating issue priority due to: ${escalationReason}`,
          });
        }
      }

      return alerts;
    } catch (error) {
      console.error('Error checking priority escalations:', error);
      return [];
    }
  }

  /**
   * Process and store all alerts
   */
  async processAlerts(monitoringResults, tenantId) {
    try {
      const allAlerts = [
        ...monitoringResults.deadlineAlerts,
        ...monitoringResults.statusAlerts,
        ...monitoringResults.overdueIssues,
        ...monitoringResults.priorityEscalations,
      ];

      for (const alert of allAlerts) {
        // Store notification in database
        await this.storeNotification(alert, tenantId);

        // Send to appropriate channels
        await this.sendNotification(alert, tenantId);
      }

      console.log(`Processed ${allAlerts.length} compliance alerts`);
      return allAlerts;
    } catch (error) {
      console.error('Error processing alerts:', error);
      throw error;
    }
  }

  /**
   * Store notification in database
   */
  async storeNotification(alert, tenantId) {
    try {
      await db.query(
        `
        INSERT INTO compliance_notifications (
          id, tenant_id, issue_id, notification_type, alert_level,
          title, message, recommended_action, notification_data,
          created_at, processed_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `,
        [
          randomUUID(),
          tenantId,
          alert.issueId,
          alert.type,
          alert.alertLevel,
          this.generateNotificationTitle(alert),
          alert.message,
          alert.recommendedAction,
          JSON.stringify(alert),
          new Date(),
          null,
        ]
      );
    } catch (error) {
      console.error('Error storing notification:', error);
      // Continue processing other notifications
    }
  }

  /**
   * Send notification to appropriate channels
   */
  async sendNotification(alert, tenantId) {
    try {
      // System log notification
      this.sendToSystemLog(alert, tenantId);

      // Email queue (simulated)
      await this.addToEmailQueue(alert, tenantId);

      // Dashboard alert (simulated)
      await this.addToDashboardAlerts(alert, tenantId);

      // Audit trail
      await this.addToAuditTrail(alert, tenantId);
    } catch (error) {
      console.error('Error sending notification:', error);
      // Continue processing
    }
  }

  /**
   * Helper methods for notification processing
   */
  sendToSystemLog(alert, tenantId) {
    const logLevel =
      alert.alertLevel === 'URGENT' ? 'error' : alert.alertLevel === 'HIGH' ? 'warn' : 'info';

    console[logLevel](`[COMPLIANCE-ALERT] [${tenantId}] ${alert.message}`);
    console[logLevel](`[COMPLIANCE-ACTION] [${tenantId}] ${alert.recommendedAction}`);
  }

  async addToEmailQueue(alert, tenantId) {
    // Simulate email queue - in production, this would integrate with email service
    console.log(
      `[EMAIL-QUEUE] ${alert.alertLevel} alert queued for tenant ${tenantId}: ${alert.message}`
    );
  }

  async addToDashboardAlerts(alert, tenantId) {
    // Simulate dashboard alert - in production, this would update real-time dashboard
    console.log(
      `[DASHBOARD-ALERT] ${alert.alertLevel} alert for tenant ${tenantId}: ${alert.message}`
    );
  }

  async addToAuditTrail(alert, tenantId) {
    // Add to audit trail
    console.log(
      `[AUDIT-TRAIL] Compliance alert logged for tenant ${tenantId}: ${alert.type} - ${alert.message}`
    );
  }

  /**
   * Helper methods for recommendation generation
   */
  generateDeadlineRecommendation(issue, daysUntilDue) {
    if (daysUntilDue <= 1) {
      return `URGENT: Address "${issue.specific_violation}" immediately. Contact assigned user and prioritize resolution.`;
    } else if (daysUntilDue <= 7) {
      return `Schedule immediate review of "${issue.specific_violation}". Ensure adequate resources are allocated.`;
    } else {
      return `Plan resolution activities for "${issue.specific_violation}". Begin preparation and resource allocation.`;
    }
  }

  generateStatusRecommendation(issue, hoursInStatus) {
    if (hoursInStatus > 48) {
      return `Issue blocked for ${hoursInStatus} hours. Review blockers and consider reassignment or escalation.`;
    } else {
      return `Follow up on progress for issue in ${issue.status} status. Ensure adequate support is provided.`;
    }
  }

  generateOverdueRecommendation(issue, daysOverdue) {
    return `IMMEDIATE ACTION REQUIRED: Issue is ${daysOverdue} days overdue. Escalate to management and reallocate resources as needed.`;
  }

  generateNotificationTitle(alert) {
    const titles = {
      DEADLINE_REMINDER: `Upcoming Deadline: ${alert.daysUntilDue} days remaining`,
      STATUS_ALERT: `Status Review Required: ${alert.hoursInStatus} hours`,
      OVERDUE_ALERT: `OVERDUE: ${alert.daysOverdue} days past due`,
      PRIORITY_ESCALATION: `Priority Escalation: ${alert.currentPriority} → ${alert.recommendedPriority}`,
    };

    return titles[alert.type] || `Compliance Alert: ${alert.type}`;
  }

  /**
   * Database setup methods
   */
  async ensureNotificationsTable() {
    await db.query(`
      CREATE TABLE IF NOT EXISTS compliance_notifications (
        id UUID PRIMARY KEY,
        tenant_id VARCHAR(255) NOT NULL,
        issue_id UUID REFERENCES regulatory_validation_issues(id),
        notification_type VARCHAR(50) NOT NULL,
        alert_level VARCHAR(20) NOT NULL,
        title TEXT NOT NULL,
        message TEXT NOT NULL,
        recommended_action TEXT,
        notification_data JSONB,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        processed_at TIMESTAMP WITH TIME ZONE,
        acknowledged_at TIMESTAMP WITH TIME ZONE,
        acknowledged_by VARCHAR(255)
      )
    `);

    // Create indexes for performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_compliance_notifications_tenant 
      ON compliance_notifications(tenant_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_compliance_notifications_issue 
      ON compliance_notifications(issue_id)
    `);
  }

  async createMonitoringSchedule(tenantId) {
    // Create monitoring schedule configuration
    const schedule = {
      tenantId,
      activeRules: 4, // deadline, status, overdue, priority escalation
      monitoringInterval: '1 hour',
      lastRun: new Date(),
      nextRun: new Date(Date.now() + 60 * 60 * 1000), // 1 hour from now
      configuration: {
        deadlineReminders: true,
        statusAlerts: true,
        overdueTracking: true,
        priorityEscalation: true,
      },
    };

    console.log(`Monitoring schedule created for tenant ${tenantId}:`, schedule);
    return schedule;
  }
}

export default new ProactiveComplianceService();
