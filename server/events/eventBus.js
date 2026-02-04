/**
 * Event Bus for IND Wizard
 *
 * Provides a publish-subscribe mechanism for events across the application,
 * supporting both internal application events and database persistence.
 *
 * Features:
 * - Database persistence for event tracking
 * - In-memory event subscription for local processing
 * - Support for webhook notifications
 * - Event filtering by type and payload properties
 */

import { query } from '../lib/db.js';
import logger from '../utils/logger.js';

// In-memory subscribers
const subscribers = [];

/**
 * Event Bus class providing pub/sub functionality
 */
class EventBus {
  constructor() {
    this.initialized = false;
    this.initialize();
  }

  /**
   * Initialize the event bus
   */
  async initialize() {
    if (this.initialized) return;

    try {
      // Ensure ind_events table exists
      await query(`
        CREATE TABLE IF NOT EXISTS ind_events (
          id SERIAL PRIMARY KEY,
          event_type VARCHAR(255) NOT NULL,
          payload JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          processed BOOLEAN DEFAULT FALSE
        )
      `);
      
      this.initialized = true;
      logger.info('Event bus initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize event bus:', error);
    }
  }

  /**
   * Publish an event
   * @param {string} eventType - Type of the event
   * @param {Object} payload - Event data
   */
  async publish(eventType, payload) {
    try {
      // Store event in database
      const result = await query(
        'INSERT INTO ind_events (event_type, payload) VALUES ($1, $2) RETURNING *',
        [eventType, JSON.stringify(payload)]
      );

      const event = {
        eventType,
        payload,
        timestamp: new Date().toISOString(),
      };

      // Notify in-memory subscribers
      this.notifySubscribers(event);

      logger.info(\`Event published: \${eventType}\`, { id: result.rows[0].id });
      return result.rows[0];
    } catch (error) {
      logger.error(\`Failed to publish event: \${eventType}\`, error);
      throw error;
    }
  }

  /**
   * Subscribe to events
   * @param {string|Array<string>} eventTypes - Event type(s) to subscribe to
   * @param {Function} callback - Function to call when event occurs
   * @param {Object} filter - Optional filter for payload properties
   * @returns {Function} Unsubscribe function
   */
  subscribe(eventTypes, callback, filter = null) {
    const types = Array.isArray(eventTypes) ? eventTypes : [eventTypes];
    const subscriber = {
      eventTypes: types,
      callback,
      filter,
    };

    subscribers.push(subscriber);
    logger.info(\`Subscribed to events: \${types.join(', ')}\`);

    // Return unsubscribe function
    return () => {
      const index = subscribers.indexOf(subscriber);
      if (index > -1) {
        subscribers.splice(index, 1);
        logger.info(\`Unsubscribed from events: \${types.join(', ')}\`);
      }
    };
  }

  /**
   * Notify subscribers of an event
   * @param {Object} event - Event object
   */
  notifySubscribers(event) {
    for (const subscriber of subscribers) {
      try {
        // Check if subscriber is interested in this event type
        if (!subscriber.eventTypes.includes('*') && !subscriber.eventTypes.includes(event.eventType)) {
          continue;
        }

        // Apply filter if provided
        if (subscriber.filter && !this.matchesFilter(event.payload, subscriber.filter)) {
          continue;
        }

        // Call subscriber callback
        subscriber.callback(event);
      } catch (error) {
        logger.error(\`Error in event subscriber for \${event.eventType}:\`, error);
      }
    }
  }

  /**
   * Check if payload matches filter
   * @param {Object} payload - Event payload
   * @param {Object} filter - Filter criteria
   * @returns {boolean}
   */
  matchesFilter(payload, filter) {
    for (const [key, value] of Object.entries(filter)) {
      if (payload[key] !== value) {
        return false;
      }
    }
    return true;
  }

  /**
   * Get recent events
   * @param {string} eventType - Optional event type filter
   * @param {number} limit - Maximum number of events to return
   * @returns {Promise<Array>} Array of events
   */
  async getEvents(eventType = null, limit = 100) {
    try {
      let sql = 'SELECT * FROM ind_events';
      const params = [];
      
      if (eventType) {
        sql += ' WHERE event_type = $1';
        params.push(eventType);
      }
      
      sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1);
      params.push(limit);

      const result = await query(sql, params);
      return result.rows;
    } catch (error) {
      logger.error('Failed to get events:', error);
      throw error;
    }
  }
}

// Export singleton instance
const eventBus = new EventBus();
export default eventBus;
