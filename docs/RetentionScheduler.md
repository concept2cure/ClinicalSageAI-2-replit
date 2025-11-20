# Auto-Retention Scheduler Documentation

## Overview

The Auto-Retention Scheduler is a compliance-focused feature that automates document retention according to configurable policies. It helps organizations maintain regulatory compliance by ensuring documents are retained for appropriate periods of time and properly managed throughout their lifecycle.

## Key Features

- **Configurable Retention Policies:** Define custom retention periods based on document types
- **Document Archiving:** Automatically archive documents before deletion
- **Email Notifications:** Receive alerts before documents reach retention limits
- **Audit Logging:** Comprehensive activity trails for compliance verification
- **Manual Override:** Run retention jobs on demand
- **Secure Operations:** Role-based access control for policy management

## Architecture

The Auto-Retention Scheduler consists of several components:

1. **Policy Management Interface:** Web UI for creating and managing retention policies
2. **Scheduled Jobs:** Automated background processes that execute retention operations
3. **Notification System:** Alerts users when documents approach retention limits
4. **Validation Middleware:** Ensures data integrity for all operations
5. **Audit Logging System:** Records all retention-related activities
6. **CLI Tools:** Command-line interface for manual job execution

## Security & Compliance

The Auto-Retention Scheduler was designed with security and compliance as top priorities:

- **21 CFR Part 11 Compliance:** All operations are fully audited with tamper-evident logs
- **Role-Based Access Control:** Only authorized administrators can manage policies
- **Validation Checks:** Input validation for all operations with secure error handling
- **Audit Trail:** SHA-256 integrity hashes ensure log integrity
- **Documentation:** Comprehensive usage documentation and audit reports

## Usage Instructions

### Creating a Retention Policy

1. Navigate to the Retention Settings page
2. Click "Create Policy" button
3. Fill in the required fields:
   - Policy Name: A descriptive name for the policy
   - Document Type: The type of document this policy applies to
   - Retention Period: How long to keep documents before taking action
   - Period Unit: days, months, or years
4. Configure additional options:
   - Archive Before Delete: Whether to archive documents before deletion
   - Notify Before Deletion: Send notifications before documents are deleted
   - Notification Period: How far in advance to send notifications
5. Set policy status (active/inactive)
6. Click "Create Policy" to save

### Managing Existing Policies

1. View all policies in the Policies tab
2. Edit a policy by clicking the edit icon
3. Delete a policy by clicking the delete icon (requires confirmation)
4. Toggle policy status using the active switch

### Running the Retention Job Manually

1. Option 1: Web Interface

   - Navigate to Retention Settings
   - Click "Run Retention Job" button
   - Monitor job progress in the dashboard

2. Option 2: Command Line
   - Open a terminal
   - Run: `node server/bin/run-retention.js`
   - View detailed console output for job progress

### Understanding the Dashboard

The Retention Dashboard provides real-time statistics and visibility:

- **Policy Statistics:** Total policies, active policies, etc.
- **Archive Statistics:** Documents archived in current period
- **Deletion Statistics:** Documents deleted in current period
- **Recent Activity:** Timeline of recent retention operations
- **Upcoming Expirations:** Documents approaching retention limits

## API Reference

The Retention Scheduler exposes several REST API endpoints:

### Policy Management

- `GET /api/retention/policies` - List all retention policies
- `GET /api/retention/policies/:id` - Get a specific retention policy
- `POST /api/retention/policies` - Create a new retention policy
- `PUT /api/retention/policies/:id` - Update an existing policy
- `DELETE /api/retention/policies/:id` - Delete a policy

### Document Types

- `GET /api/retention/document-types` - Get all available document types

### Job Management

- `POST /api/retention/run-job` - Manually trigger the retention job

## Audit Log Structure

All retention operations are logged with the following information:

- Timestamp (UTC)
- User ID & Username
- Action performed
- Entity type & ID
- Operation details
- IP address
- Integrity hash (SHA-256)

## Troubleshooting

### Common Issues

1. **Job appears stuck:** Check for database connection issues or file system permissions
2. **Documents not being archived:** Verify archive storage path exists and is writable
3. **Notifications not received:** Check email configuration and spam filters
4. **Permission errors:** Ensure user has administrator role

### Error Messages

- **"Database error":** Check database connection and schema
- **"Storage error":** Verify storage permissions and paths
- **"Authentication required":** User must be authenticated
- **"This action requires administrator privileges":** User must have admin role

## Best Practices

1. **Regular Testing:** Periodically test retention processes in a non-production environment
2. **Policy Review:** Review retention policies regularly to align with changing regulations
3. **Audit Log Backup:** Maintain backups of retention audit logs for compliance purposes
4. **Document Classification:** Ensure all documents have proper type classification
5. **Notification Recipients:** Configure appropriate notification recipients for each policy

## Compliance Standards

The Auto-Retention Scheduler helps maintain compliance with:

- 21 CFR Part 11
- HIPAA Record Retention Requirements
- GxP Documentation Requirements
- ISO 9001 Documentation Controls
- Pharmaceutical Industry Standards
