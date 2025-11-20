/**
 * Audit Logging Utility
 *
 * This module provides standardized audit logging capabilities for
 * capturing user actions for compliance with 21 CFR Part 11 and other
 * regulatory requirements.
 */

import fs from 'fs';
import path from 'path';
import { createHash } from 'crypto';

// Ensure log directory exists
const LOG_DIR = path.join(process.cwd(), 'logs');
if (!fs.existsSync(LOG_DIR)) {
  fs.mkdirSync(LOG_DIR, { recursive: true });
}

const AUDIT_LOG_PATH = path.join(LOG_DIR, 'audit.log');

/**
 * Generate a SHA-256 hash of the log entry for integrity verification
 *
 * @param {Object} entry - Log entry data
 * @returns {string} - SHA-256 hash of the entry
 */
function generateHash(entry) {
  const data = JSON.stringify(entry);
  return createHash('sha256').update(data).digest('hex');
}

/**
 * Write an entry to the audit log file
 *
 * @param {Object} entry - The log entry to write
 */
function writeToLog(entry) {
  const timestamp = new Date().toISOString();
  const hash = generateHash({ ...entry, timestamp });

  const logEntry = {
    ...entry,
    timestamp,
    integrity_hash: hash,
  };

  // Append to log file
  fs.appendFileSync(AUDIT_LOG_PATH, JSON.stringify(logEntry) + '\\n', { encoding: 'utf8' });

  // Also log to console in development
  if (process.env.NODE_ENV !== 'production') {
    console.log('[AUDIT]', JSON.stringify(logEntry));
  }
}

/**
 * Log a user action to the audit log
 *
 * @param {Object} options - Audit log options
 * @param {string} options.action - The action performed (e.g., 'document.create')
 * @param {string} options.userId - ID of the user performing the action
 * @param {string} options.username - Username of the user performing the action
 * @param {string} options.entityType - Type of entity being acted upon (e.g., 'document')
 * @param {string} options.entityId - ID of the entity being acted upon
 * @param {Object} options.details - Additional details about the action
 * @param {string} options.ipAddress - IP address of the user
 * @param {string} options.userAgent - User agent of the request
 */
export function logAction({
  action,
  userId,
  username,
  entityType,
  entityId,
  details,
  ipAddress,
  userAgent,
}) {
  try {
    writeToLog({
      action,
      userId,
      username,
      entityType,
      entityId,
      details,
      ipAddress,
      userAgent,
      application: 'TrialSage Vault',
      version: process.env.APP_VERSION || '1.0.0',
    });
  } catch (error) {
    console.error('[AUDIT LOG ERROR]', error);
    // Even if logging fails, don't stop the application flow
  }
}

/**
 * Log a security event to the audit log
 *
 * @param {Object} options - Security event options
 * @param {string} options.event - The security event type
 * @param {string} options.userId - ID of the user (if authenticated)
 * @param {string} options.username - Username (if authenticated)
 * @param {string} options.severity - Severity level (info, warning, critical)
 * @param {Object} options.details - Additional details about the event
 * @param {string} options.ipAddress - IP address related to the event
 */
export function logSecurityEvent({
  event,
  userId,
  username,
  severity = 'info',
  details,
  ipAddress,
}) {
  try {
    writeToLog({
      action: 'security',
      event,
      userId: userId || 'unauthenticated',
      username: username || 'unauthenticated',
      severity,
      details,
      ipAddress,
      application: 'TrialSage Vault',
      version: process.env.APP_VERSION || '1.0.0',
    });
  } catch (error) {
    console.error('[SECURITY LOG ERROR]', error);
    // Even if logging fails, don't stop the application flow
  }
}

/**
 * Log a system event to the audit log
 *
 * @param {Object} options - System event options
 * @param {string} options.event - The system event type
 * @param {string} options.component - The system component name
 * @param {string} options.severity - Severity level (info, warning, critical)
 * @param {Object} options.details - Additional details about the event
 */
export function logSystemEvent({ event, component, severity = 'info', details }) {
  try {
    writeToLog({
      action: 'system',
      event,
      component,
      severity,
      details,
      application: 'TrialSage Vault',
      version: process.env.APP_VERSION || '1.0.0',
    });
  } catch (error) {
    console.error('[SYSTEM LOG ERROR]', error);
    // Even if logging fails, don't stop the application flow
  }
}

export default {
  logAction,
  logSecurityEvent,
  logSystemEvent,
};
