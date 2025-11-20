/**
 * Event Bus Module
 *
 * This module provides a lightweight publish-subscribe pattern
 * for event handling across the application.
 *
 * For production deployments, this could be replaced with Redis pub/sub
 * to support horizontal scaling across multiple instances.
 */

// Libraries for unique ID generation
import { randomUUID } from 'crypto';

// Store for subscribers
const subscribers = new Map();

// Map of channels to their latest events (for new subscribers)
const latestEvents = new Map();

/**
 * Generate a unique event ID
 *
 * @returns {string} A unique ID
 */
function generateEventId() {
  return randomUUID();
}

/**
 * Subscribe to a channel
 *
 * @param {string} channel - The channel to subscribe to
 * @param {Function} callback - The callback to call when an event is published
 * @returns {Function} A function to unsubscribe
 */
export function subscribe(channel, callback) {
  const subscriberId = randomUUID();

  if (!subscribers.has(channel)) {
    subscribers.set(channel, new Map());
  }

  subscribers.get(channel).set(subscriberId, callback);

  // Send the latest event to the new subscriber if available
  if (latestEvents.has(channel)) {
    callback(latestEvents.get(channel));
  }

  // Return unsubscribe function
  return () => {
    if (subscribers.has(channel)) {
      subscribers.get(channel).delete(subscriberId);

      // Clean up empty channels
      if (subscribers.get(channel).size === 0) {
        subscribers.delete(channel);
      }
    }
  };
}

/**
 * Subscribe to multiple channels at once
 *
 * @param {string[]} channels - The channels to subscribe to
 * @param {Function} callback - The callback to call when an event is published
 * @returns {Function} A function to unsubscribe from all channels
 */
export function subscribeToMany(channels, callback) {
  const unsubscribers = channels.map(channel => subscribe(channel, callback));

  // Return a function that unsubscribes from all channels
  return () => {
    unsubscribers.forEach(unsubscribe => unsubscribe());
  };
}

/**
 * Publish an event to a channel
 *
 * @param {string} channel - The channel to publish to
 * @param {any} data - The event data
 * @returns {object} The published event
 */
export function publish(channel, data) {
  const event = {
    id: generateEventId(),
    channel,
    data,
    timestamp: new Date().toISOString(),
  };

  // Store the latest event for the channel
  latestEvents.set(channel, event);

  // Notify subscribers
  if (subscribers.has(channel)) {
    subscribers.get(channel).forEach(callback => {
      try {
        callback(event);
      } catch (error) {
        console.error(`Error in subscriber for channel ${channel}:`, error);
      }
    });
  }

  return event;
}

/**
 * Get the number of subscribers for a channel
 *
 * @param {string} channel - The channel to check
 * @returns {number} The number of subscribers
 */
export function getSubscriberCount(channel) {
  if (!subscribers.has(channel)) {
    return 0;
  }

  return subscribers.get(channel).size;
}

/**
 * Get all channels with subscribers
 *
 * @returns {string[]} The active channels
 */
export function getActiveChannels() {
  return Array.from(subscribers.keys());
}

export default {
  subscribe,
  subscribeToMany,
  publish,
  getSubscriberCount,
  getActiveChannels,
};
