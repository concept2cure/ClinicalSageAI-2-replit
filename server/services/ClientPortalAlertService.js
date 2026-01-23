/**
 * CLIENT PORTAL ALERT SERVICE
 *
 * This service handles real-time alerts that appear in the client portal
 * when users sign in or navigate the platform. Integrates with the AI
 * intelligent alerting system to deliver notifications directly to users.
 */

import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_NEON_NEW_SECRET || process.env.DATABASE_URL,
});

class ClientPortalAlertService {
  /**
   * Create portal alert for a specific user
   * @param {string} userId - Target user ID
   * @param {string} commitmentId - Related commitment ID
   * @param {string} alertType - Type of alert
   * @param {string} message - Alert message
   * @param {string} priority - Alert priority (CRITICAL, HIGH, MEDIUM, LOW)
   * @returns {Object} Created alert
   */
  async createPortalAlert(userId, commitmentId, alertType, message, priority = 'MEDIUM') {
    try {
      const query = `
        INSERT INTO portal_alerts (
          user_id, 
          commitment_id, 
          alert_type, 
          message, 
          priority, 
          is_read, 
          created_at
        ) VALUES ($1, $2, $3, $4, $5, false, NOW())
        RETURNING *
      `;

      const values = [userId, commitmentId, alertType, message, priority];
      const result = await pool.query(query, values);

      console.log(
        `📱 PORTAL ALERT CREATED: User ${userId}, Type: ${alertType}, Priority: ${priority}`
      );

      return {
        success: true,
        alert: result.rows[0],
        message: 'Portal alert created successfully',
      };
    } catch (error) {
      console.error('Error creating portal alert:', error);
      return {
        success: false,
        error: 'Failed to create portal alert',
        details: error.message,
      };
    }
  }

  /**
   * Get unread alerts for a user (for sign-in notifications)
   * @param {string} userId - User ID
   * @returns {Array} List of unread alerts
   */
  async getUnreadAlertsForUser(userId) {
    try {
      const query = `
        SELECT 
          pa.*,
          rc.description as commitment_description,
          rc.due_date as commitment_due_date,
          rc.status as commitment_status
        FROM portal_alerts pa
        LEFT JOIN regulatory_commitments rc ON pa.commitment_id = rc.id
        WHERE pa.user_id = $1 AND pa.is_read = false
        ORDER BY pa.created_at DESC
      `;

      const result = await pool.query(query, [userId]);

      console.log(`📬 Retrieved ${result.rows.length} unread alerts for user ${userId}`);

      return {
        success: true,
        alerts: result.rows,
        count: result.rows.length,
      };
    } catch (error) {
      console.error('Error fetching user alerts:', error);
      return {
        success: false,
        error: 'Failed to fetch alerts',
        alerts: [],
      };
    }
  }

  /**
   * Mark alert as read
   * @param {string} alertId - Alert ID
   * @param {string} userId - User ID (for security)
   * @returns {Object} Update result
   */
  async markAlertAsRead(alertId, userId) {
    try {
      const query = `
        UPDATE portal_alerts 
        SET is_read = true, read_at = NOW()
        WHERE id = $1 AND user_id = $2
        RETURNING *
      `;

      const result = await pool.query(query, [alertId, userId]);

      return {
        success: true,
        message: 'Alert marked as read',
        alert: result.rows[0],
      };
    } catch (error) {
      console.error('Error marking alert as read:', error);
      return {
        success: false,
        error: 'Failed to mark alert as read',
      };
    }
  }

  /**
   * Get alert statistics for dashboard widget
   * @param {string} userId - User ID
   * @returns {Object} Alert statistics
   */
  async getAlertStats(userId) {
    try {
      const query = `
        SELECT 
          COUNT(*) as total_alerts,
          COUNT(CASE WHEN is_read = false THEN 1 END) as unread_count,
          COUNT(CASE WHEN priority = 'CRITICAL' AND is_read = false THEN 1 END) as critical_unread,
          COUNT(CASE WHEN priority = 'HIGH' AND is_read = false THEN 1 END) as high_unread
        FROM portal_alerts 
        WHERE user_id = $1
      `;

      const result = await pool.query(query, [userId]);
      const stats = result.rows[0];

      return {
        success: true,
        stats: {
          totalAlerts: parseInt(stats.total_alerts),
          unreadCount: parseInt(stats.unread_count),
          criticalUnread: parseInt(stats.critical_unread),
          highUnread: parseInt(stats.high_unread),
        },
      };
    } catch (error) {
      console.error('Error fetching alert stats:', error);
      return {
        success: false,
        error: 'Failed to fetch alert statistics',
        stats: { totalAlerts: 0, unreadCount: 0, criticalUnread: 0, highUnread: 0 },
      };
    }
  }

  /**
   * Create portal alert table if it doesn't exist
   */
  async ensurePortalAlertsTable() {
    try {
      const createTableQuery = `
        CREATE TABLE IF NOT EXISTS portal_alerts (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL REFERENCES users(id),
          commitment_id INTEGER REFERENCES regulatory_commitments(id),
          alert_type VARCHAR(50) NOT NULL,
          message TEXT NOT NULL,
          priority VARCHAR(20) DEFAULT 'MEDIUM',
          is_read BOOLEAN DEFAULT false,
          read_at TIMESTAMP,
          created_at TIMESTAMP DEFAULT NOW(),
          updated_at TIMESTAMP DEFAULT NOW()
        );
        
        CREATE INDEX IF NOT EXISTS idx_portal_alerts_user_id ON portal_alerts(user_id);
        CREATE INDEX IF NOT EXISTS idx_portal_alerts_unread ON portal_alerts(user_id, is_read);
      `;

      await pool.query(createTableQuery);
      console.log('✅ Portal alerts table ensured');

      return { success: true };
    } catch (error) {
      console.error('Error creating portal alerts table:', error);
      return { success: false, error: error.message };
    }
  }
}

export default new ClientPortalAlertService();
