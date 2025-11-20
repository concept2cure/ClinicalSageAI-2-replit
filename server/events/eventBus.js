/**
 * Event Bus for IND Wizard
 *
 * Provides a publish-subscribe mechanism for events across the application,
 * supporting both internal application events and real-time client notifications.
 *
 * Features:
 * - Supabase Realtime channel for persistence and cross-server support
 * - In-memory event subscription for local processing
 * - Support for webhook notifications
 * - Event filtering by type and payload properties
 */

import { createClient } from '@supabase/supabase-js';
import logger from '../utils/logger.js';

// Initialize clients
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

// In-memory subscribers
const subscribers = [];

/**
 * Event Bus class providing pub/sub functionality
 */
class EventBus {
  constructor() {
    this.supabase = supabase;
    this.channel = null;
    this.initialized = false;

    // Initialize Supabase channel
    this.initialize();
  }

  /**
   * Initialize the Supabase realtime channel
   */
  async initialize() {
    if (this.initialized) return;

    try {
      this.channel = this.supabase
        .channel('ind_events')
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'ind_events' },
          payload => this.handleDatabaseEvent(payload.new)
        )
        .subscribe((status, err) => {
          if (status === 'SUBSCRIBED') {
            logger.info('EventBus: Supabase realtime channel subscribed');
            this.initialized = true;
          } else if (status === 'CHANNEL_ERROR') {
            logger.error(`EventBus: Supabase channel error: ${err?.message || 'Unknown error'}`);
          }
        });
    } catch (error) {
      logger.error(`EventBus: Failed to initialize Supabase channel: ${error.message}`);

      // Fallback to in-memory only mode
      this.initialized = true;
      logger.warn('EventBus: Operating in in-memory mode only');
    }
  }

  /**
   * Handle events received from the database
   *
   * @param {Object} event - Event data from database
   */
  handleDatabaseEvent(event) {
    // Notify all subscribers
    this.notifySubscribers(event);
  }

  /**
   * Subscribe to events
   *
   * @param {Object} options - Subscription options
   * @param {Function} callback - Function to call with events
   * @returns {Object} - Subscription object with unsubscribe method
   */
  subscribe(options, callback) {
    const subscription = {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2),
      options,
      callback,
    };

    subscribers.push(subscription);

    // Return unsubscribe method
    return {
      id: subscription.id,
      unsubscribe: () => this.unsubscribe(subscription.id),
    };
  }

  /**
   * Unsubscribe from events
   *
   * @param {string} subscriptionId - ID of subscription to remove
   * @returns {boolean} - Success indicator
   */
  unsubscribe(subscriptionId) {
    const index = subscribers.findIndex(sub => sub.id === subscriptionId);

    if (index !== -1) {
      subscribers.splice(index, 1);
      return true;
    }

    return false;
  }

  /**
   * Publish an event
   *
   * @param {Object} event - Event data
   * @returns {Promise<boolean>} - Success indicator
   */
  async publish(event) {
    try {
      // Ensure event has required properties
      const normalizedEvent = {
        type: event.type || 'unknown',
        payload: event.payload || {},
        timestamp: event.timestamp || new Date().toISOString(),
      };

      // Store in database
      const { error } = await this.supabase.from('ind_events').insert({
        event_type: normalizedEvent.type,
        payload: normalizedEvent.payload,
        ts: normalizedEvent.timestamp,
      });

      if (error) {
        logger.error(`EventBus: Error storing event in database: ${error.message}`);
        // Continue anyway to notify in-memory subscribers
      }

      // Notify all subscribers immediately (don't wait for database callback)
      this.notifySubscribers(normalizedEvent);

      return true;
    } catch (error) {
      logger.error(`EventBus: Error publishing event: ${error.message}`);
      return false;
    }
  }

  /**
   * Notify all relevant subscribers of an event
   *
   * @param {Object} event - Event data
   */
  notifySubscribers(event) {
    subscribers.forEach(subscriber => {
      try {
        const { options, callback } = subscriber;

        // Check if subscriber is interested in this event type
        if (options.type && options.type !== event.type) {
          return;
        }

        // Check if subscriber is interested in this submission ID
        if (
          options.submissionId &&
          event.payload.submission_id !== options.submissionId &&
          event.payload.submissionId !== options.submissionId
        ) {
          return;
        }

        // Call the subscriber callback
        callback(event);
      } catch (error) {
        logger.error(`EventBus: Error notifying subscriber: ${error.message}`);
      }
    });
  }

  /**
   * Get recent events
   *
   * @param {Object} options - Query options
   * @returns {Promise<Array>} - Array of events
   */
  async getRecentEvents(options = {}) {
    try {
      let query = this.supabase.from('ind_events').select('*');

      // Apply filters
      if (options.type) {
        query = query.eq('event_type', options.type);
      }

      if (options.submissionId) {
        query = query.eq('payload->submission_id', options.submissionId);
      }

      if (options.limit) {
        query = query.limit(options.limit);
      }

      // Order by timestamp descending (newest first)
      query = query.order('ts', { ascending: false });

      const { data, error } = await query;

      if (error) {
        throw new Error(`Error fetching events: ${error.message}`);
      }

      return data;
    } catch (error) {
      logger.error(`EventBus: Error getting recent events: ${error.message}`);
      return [];
    }
  }
}

// Create and export a singleton instance
export const eventBus = new EventBus();

// Export a simplified listener function for backward compatibility
export function listenEvents(callback) {
  return eventBus.subscribe({}, callback);
}

// Export a simplified publish function for backward compatibility
export async function publish(event) {
  return eventBus.publish(event);
}

export default {
  eventBus,
  listenEvents,
  publish,
};
