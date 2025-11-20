/**
 * Utility functions for managing session IDs across the application
 */
import React from 'react';

/**
 * Validates if a session ID is properly formatted and non-empty
 * @param {string} sessionId - The session ID to validate
 * @returns {boolean} - Whether the session ID is valid
 */
export function isValidSessionId(sessionId) {
  // Basic validation to ensure session ID is:
  // 1. A non-empty string
  // 2. At least 5 characters long (for security)
  // 3. Contains only alphanumeric characters, dashes, and underscores
  if (!sessionId || typeof sessionId !== 'string') {
    return false;
  }

  if (sessionId.length < 5) {
    return false;
  }

  // Match alphanumeric characters, dashes, and underscores
  const validSessionIdPattern = /^[a-zA-Z0-9_-]+$/;
  return validSessionIdPattern.test(sessionId);
}

/**
 * Generates a unique session ID for a new study
 * @returns {string} - A new unique session ID
 */
export function generateSessionId() {
  // Generate a random session ID with a timestamp prefix for uniqueness
  const timestamp = Date.now().toString(36);
  const randomPart = Math.random().toString(36).substring(2, 10);
  return `${timestamp}-${randomPart}`;
}

/**
 * Stores a session ID in local storage
 * @param {string} sessionId - The session ID to store
 */
export function storeSessionId(sessionId) {
  localStorage.setItem('currentSessionId', sessionId);
}

/**
 * Retrieves the currently active session ID from local storage
 * @returns {string|null} - The current session ID or null if none exists
 */
export function getCurrentSessionId() {
  return localStorage.getItem('currentSessionId');
}

/**
 * Clears the current session ID from local storage
 */
export function clearSessionId() {
  localStorage.removeItem('currentSessionId');
}

/**
 * Adds a session ID to the history of recent sessions
 * @param {string} sessionId - The session ID to add to history
 * @param {Object} metadata - Optional metadata about the session
 */
export function addSessionToHistory(sessionId, metadata = {}) {
  try {
    // Get existing history
    const historyString = localStorage.getItem('sessionHistory');
    const history = historyString ? JSON.parse(historyString) : [];

    // Add new session to history with timestamp
    const sessionEntry = {
      id: sessionId,
      timestamp: new Date().toISOString(),
      ...metadata,
    };

    // Add to the beginning of the array (most recent first)
    history.unshift(sessionEntry);

    // Keep only the most recent 10 sessions
    const trimmedHistory = history.slice(0, 10);

    // Save updated history
    localStorage.setItem('sessionHistory', JSON.stringify(trimmedHistory));
  } catch (error) {
    console.error('Error saving session to history:', error);
  }
}

/**
 * Gets the history of recent session IDs
 * @returns {Array} - An array of recent session objects
 */
export function getSessionHistory() {
  try {
    const historyString = localStorage.getItem('sessionHistory');
    return historyString ? JSON.parse(historyString) : [];
  } catch (error) {
    console.error('Error retrieving session history:', error);
    return [];
  }
}

/**
 * Hook to manage the current session ID in a component
 * @returns {Object} - Object containing current session ID and functions to manage it
 */
export function useCurrentSession() {
  const [sessionId, setSessionIdState] = React.useState(getCurrentSessionId());

  // Set a new session ID and store it
  const setSessionId = newSessionId => {
    if (isValidSessionId(newSessionId)) {
      storeSessionId(newSessionId);
      setSessionIdState(newSessionId);
      // Optionally add to history
      addSessionToHistory(newSessionId);
    }
  };

  // Generate and set a new session ID
  const createNewSession = (metadata = {}) => {
    const newId = generateSessionId();
    storeSessionId(newId);
    setSessionIdState(newId);
    addSessionToHistory(newId, metadata);
    return newId;
  };

  // Clear the current session
  const clearSession = () => {
    clearSessionId();
    setSessionIdState(null);
  };

  return {
    sessionId,
    setSessionId,
    createNewSession,
    clearSession,
    isValidSession: sessionId ? isValidSessionId(sessionId) : false,
  };
}

/**
 * Logs a user action or insight to the system
 * @param {string} sessionId - The current session ID
 * @param {string} title - Title of the insight
 * @param {string} description - Description of the insight
 * @param {string} status - Status of the insight (active, resolved, etc.)
 * @returns {Promise<boolean>} - Whether the log was successful
 */
export async function logInsight(sessionId, title, description, status = 'active') {
  if (!isValidSessionId(sessionId)) {
    console.error('Cannot log insight: Invalid session ID');
    return false;
  }

  try {
    const res = await fetch('/api/session/insight', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        title,
        description,
        status,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      console.error('Insight logging error:', data.message || 'Unknown error');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to log insight:', error);
    return false;
  }
}

/**
 * Logs a wisdom trace entry for the session
 * @param {string} sessionId - The current session ID
 * @param {string} action - The action being performed
 * @param {string[]} reasoning - Array of reasoning steps
 * @param {string} conclusion - The conclusion of the trace
 * @returns {Promise<boolean>} - Whether the log was successful
 */
export async function logWisdomTrace(sessionId, action, reasoning = [], conclusion = '') {
  if (!isValidSessionId(sessionId)) {
    console.error('Cannot log wisdom trace: Invalid session ID');
    return false;
  }

  try {
    const res = await fetch('/api/session/wisdom-trace', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        action,
        reasoning,
        conclusion,
      }),
    });

    if (!res.ok) {
      const data = await res.json();
      console.error('Wisdom trace logging error:', data.message || 'Unknown error');
      return false;
    }

    return true;
  } catch (error) {
    console.error('Failed to log wisdom trace:', error);
    return false;
  }
}
