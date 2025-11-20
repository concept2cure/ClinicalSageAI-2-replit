/**
 * Audit Logs API Routes
 *
 * This module provides routes for querying and managing audit logs.
 * It supports filtering by organization, project, region, date range,
 * user, event type, and more.
 */

import express from 'express';
// Import database connection if needed
// import { db } from '../db.js';

const router = express.Router();

/**
 * @route   GET /api/audit/logs
 * @desc    Get audit logs with optional filters
 * @access  Private (requires authentication)
 */
router.get('/logs', async (req, res) => {
  try {
    const {
      org_id,
      project_id,
      region,
      start_date,
      end_date,
      user_id,
      event_type,
      severity,
      search,
      refresh,
      limit,
      offset,
    } = req.query;

    // Mock data for demonstration - in a real application this would fetch from the database
    const mockAuditLogs = generateMockAuditLogs(100);

    // Apply filters (would be done at the database level in a real app)
    let filteredLogs = [...mockAuditLogs];

    if (org_id) {
      filteredLogs = filteredLogs.filter(log => log.organization_id === org_id);
    }

    if (project_id) {
      filteredLogs = filteredLogs.filter(log => log.project_id === project_id);
    }

    if (region) {
      filteredLogs = filteredLogs.filter(log => log.region === region);
    }

    // Add more filters as needed

    // Pagination
    const limitValue = limit ? parseInt(limit, 10) : 100;
    const offsetValue = offset ? parseInt(offset, 10) : 0;

    const paginatedLogs = filteredLogs.slice(offsetValue, offsetValue + limitValue);

    return res.json({
      logs: paginatedLogs,
      total: filteredLogs.length,
      limit: limitValue,
      offset: offsetValue,
    });
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    return res.status(500).json({ error: 'Failed to fetch audit logs' });
  }
});

/**
 * Generate mock audit logs for demonstration purposes
 * In a real application, this would be replaced with database queries
 */
function generateMockAuditLogs(count) {
  const eventTypes = ['document', 'submission', 'system', 'authentication', 'approval'];
  const severities = ['info', 'warning', 'error', 'success'];
  const actions = [
    'Document uploaded',
    'Document approved',
    'Document rejected',
    'User logged in',
    'User logged out',
    'Submission package created',
    'Submission package sent',
    'QC check completed',
    'System backup completed',
    'User password changed',
    'New user added',
    'Document deleted',
    'Document replaced',
    'API token generated',
    'System update completed',
  ];
  const users = [
    { id: 1, name: 'John Smith' },
    { id: 2, name: 'Jane Doe' },
    { id: 3, name: 'Robert Johnson' },
    { id: 4, name: 'Emily Davis' },
    { id: 5, name: 'Michael Wilson' },
  ];
  const statuses = ['passed', 'failed', 'pending', 'approved', 'rejected', null];
  const documents = [
    { id: 101, title: 'FDA 1571 Form' },
    { id: 102, title: 'Clinical Protocol' },
    { id: 103, title: "Investigator's Brochure" },
    { id: 104, title: 'Safety Report' },
    { id: 105, title: 'CMC Documentation' },
    { id: 106, title: 'Statistical Analysis Plan' },
    { id: 107, title: 'Informed Consent Form' },
    { id: null, title: null },
  ];
  const modules = ['m1', 'm2', 'm3', 'm4', 'm5', null];
  const regions = ['FDA', 'EMA', 'PMDA', 'HC'];

  const logs = [];

  // Create a date 30 days ago for the oldest log
  const oldestDate = new Date();
  oldestDate.setDate(oldestDate.getDate() - 30);

  for (let i = 0; i < count; i++) {
    const eventType = eventTypes[Math.floor(Math.random() * eventTypes.length)];
    const severity = severities[Math.floor(Math.random() * severities.length)];
    const action = actions[Math.floor(Math.random() * actions.length)];
    const user = users[Math.floor(Math.random() * users.length)];
    const status = statuses[Math.floor(Math.random() * statuses.length)];
    const document = documents[Math.floor(Math.random() * documents.length)];
    const module = modules[Math.floor(Math.random() * modules.length)];
    const region = regions[Math.floor(Math.random() * regions.length)];

    // Generate a random date between now and 30 days ago
    const randomTimestamp = new Date(
      oldestDate.getTime() + Math.random() * (Date.now() - oldestDate.getTime())
    );

    logs.push({
      id: i + 1,
      timestamp: randomTimestamp.toISOString(),
      user_id: user.id,
      user_name: user.name,
      action,
      document_id: document.id,
      document_title: document.title,
      status,
      details: getRandomDetails(action, eventType),
      ip_address: getRandomIpAddress(),
      module,
      event_type: eventType,
      severity,
      organization_id: 'org_1',
      project_id: 'proj_1',
      region,
    });
  }

  // Sort by timestamp, newest first
  logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

  return logs;
}

/**
 * Generate random details message based on action and event type
 */
function getRandomDetails(action, eventType) {
  if (action === 'Document uploaded') {
    return 'Document was uploaded through the web interface.';
  } else if (action === 'Document approved') {
    return 'Document was approved after QC checks passed.';
  } else if (action === 'Document rejected') {
    return 'Document was rejected due to QC failure: Content does not meet formatting requirements.';
  } else if (eventType === 'authentication') {
    return 'Authentication performed from recognized IP address.';
  } else if (eventType === 'system') {
    return 'System operation completed successfully.';
  } else if (eventType === 'submission') {
    return 'Submission package was created with all required documents.';
  }

  return null;
}

/**
 * Generate a random IP address
 */
function getRandomIpAddress() {
  return `${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}.${Math.floor(Math.random() * 256)}`;
}

export default router;
