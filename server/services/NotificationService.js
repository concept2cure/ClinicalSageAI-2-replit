/**
 * NOTIFICATION SERVICE - AI INTELLIGENT ALERTING SYSTEM
 *
 * This service handles intelligent notifications for regulatory commitment management:
 * - AI-driven deadline alerts based on risk assessment
 * - User-specific notification routing
 * - Commitment status change notifications
 * - Predictive compliance alerts
 * - Client portal alert integration
 */

import ClientPortalAlertService from './ClientPortalAlertService.js';

class NotificationService {
  /**
   * Send intelligent alert to assigned user
   * @param {string} tenantId - Tenant identifier
   * @param {string} userId - User identifier for routing
   * @param {string} commitmentId - Commitment identifier
   * @param {string} message - Alert message
   * @param {string} type - Alert type (deadline_alert, risk_alert, status_change)
   * @returns {Object} Notification result
   */
  async sendAlert(tenantId, userId, commitmentId, message, type = 'deadline_alert') {
    console.log(`🚨 AI INTELLIGENT ALERT: [${type.toUpperCase()}]`);
    console.log(`   Tenant: ${tenantId}, User: ${userId}, Commitment: ${commitmentId}`);
    console.log(`   Message: "${message}"`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);

    // --- AI-Enhanced Alert Routing ---
    // Real-world integration points:
    // - Connect to email API (SendGrid, Mailgun)
    // - Connect to Slack/Teams for instant notifications
    // - Store notification history in notifications table
    // - Integrate with mobile push notifications
    // - Connect to regulatory compliance dashboard

    // Simulate intelligent alert processing
    const alertMetadata = {
      alertId: `alert_${Date.now()}`,
      tenantId,
      userId,
      commitmentId,
      type,
      message,
      timestamp: new Date().toISOString(),
      priority: this.calculateAlertPriority(type),
      deliveryChannels: this.getDeliveryChannels(type),
    };

    console.log(`📊 Alert Metadata:`, alertMetadata);

    // --- CREATE CLIENT PORTAL ALERT ---
    // Send alert directly to user's client portal for immediate visibility
    if (userId && userId !== 'system') {
      try {
        const portalAlertResult = await ClientPortalAlertService.createPortalAlert(
          userId,
          commitmentId,
          alertType,
          message,
          alertMetadata.priority
        );

        if (portalAlertResult.success) {
          console.log(`📱 Client portal alert created for user ${userId}`);
        } else {
          console.error(`❌ Failed to create portal alert: ${portalAlertResult.error}`);
        }
      } catch (portalError) {
        console.error('Portal alert creation failed:', portalError.message);
      }
    }

    return {
      success: true,
      message: 'AI Intelligent Alert processed successfully.',
      alertId: alertMetadata.alertId,
      priority: alertMetadata.priority,
      portalAlert: userId !== 'system' ? 'Created' : 'Skipped (system user)',
    };
  }

  /**
   * Calculate alert priority based on type and AI analysis
   * @param {string} type - Alert type
   * @returns {string} Priority level
   */
  calculateAlertPriority(type) {
    const priorityMap = {
      commitment_risk_alert: 'HIGH',
      deadline_alert: 'MEDIUM',
      status_change: 'LOW',
      compliance_alert: 'CRITICAL',
    };
    return priorityMap[type] || 'MEDIUM';
  }

  /**
   * Determine delivery channels based on alert type
   * @param {string} type - Alert type
   * @returns {Array} Delivery channels
   */
  getDeliveryChannels(type) {
    const channelMap = {
      commitment_risk_alert: ['email', 'dashboard', 'mobile'],
      deadline_alert: ['email', 'dashboard'],
      status_change: ['dashboard'],
      compliance_alert: ['email', 'dashboard', 'mobile', 'slack'],
    };
    return channelMap[type] || ['dashboard'];
  }

  /**
   * Send bulk alerts for multiple commitments
   * @param {string} tenantId - Tenant identifier
   * @param {Array} alerts - Array of alert objects
   * @returns {Object} Bulk notification result
   */
  async sendBulkAlerts(tenantId, alerts) {
    console.log(`📢 BULK AI ALERTS: Processing ${alerts.length} alerts for tenant ${tenantId}`);

    const results = [];
    for (const alert of alerts) {
      const result = await this.sendAlert(
        tenantId,
        alert.userId,
        alert.commitmentId,
        alert.message,
        alert.type
      );
      results.push(result);
    }

    return {
      success: true,
      message: `Processed ${results.length} alerts`,
      results,
    };
  }

  /**
   * Generate AI-powered alert message based on commitment data
   * @param {Object} commitment - Commitment object
   * @param {Object} prediction - AI prediction results
   * @returns {string} Generated alert message
   */
  generateIntelligentAlertMessage(commitment, prediction) {
    const riskLevel = commitment.status === 'Overdue' ? 'CRITICAL' : 'HIGH';
    const predictionScore = Math.round(prediction.score * 100);

    return `🚨 ${riskLevel} RISK ALERT: "${commitment.description}" is ${commitment.status} and requires immediate attention. AI Prediction: ${predictionScore}% fulfillment likelihood. Recommended actions: ${prediction.recommendations?.join(', ') || 'Review immediately'}.`;
  }
}

export default new NotificationService();
