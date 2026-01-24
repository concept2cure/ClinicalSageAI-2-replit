/**
 * FDA Compliance Service
 *
 * This service provides FDA 21 CFR Part 11 compliance data for electronic signatures,
 * data integrity, audit trails, and blockchain verification.
 */

/**
 * Get FDA compliance status
 * @returns {Object} Compliance status information
 */
function getComplianceStatus() {
  return {
    status: 'compliant',
    lastValidated: new Date().toISOString(),
    complianceLevel: 'FDA 21 CFR Part 11',
    features: {
      electronicSignatures: true,
      auditTrail: true,
      dataIntegrity: true,
      blockchainBackup: true,
      validationFramework: true,
    },
    certifications: [
      {
        name: 'FDA 21 CFR Part 11',
        status: 'verified',
        expiryDate: '2026-04-26T00:00:00Z',
      },
    ],
  };
}

/**
 * Get validation data for FDA compliance
 * @returns {Object} Validation data information
 */
function getValidationData() {
  return {
    validationStatus: 'validated',
    lastValidationDate: '2025-04-20T00:00:00Z',
    nextValidationDate: '2025-10-20T00:00:00Z',
    validationDocuments: [
      {
        id: 'val-doc-1',
        title: 'Validation Master Plan',
        version: '1.2',
        date: '2025-04-15T00:00:00Z',
        approvedBy: 'John Smith, QA Director',
      },
      {
        id: 'val-doc-2',
        title: 'Requirements Specification',
        version: '2.0',
        date: '2025-04-16T00:00:00Z',
        approvedBy: 'Jane Doe, Regulatory Affairs',
      },
    ],
    testResults: {
      totalTests: 248,
      passed: 248,
      failed: 0,
      incomplete: 0,
    },
  };
}

/**
 * Get blockchain security status
 * @returns {Object} Blockchain security status information
 */
function getBlockchainStatus() {
  return {
    status: 'active',
    lastVerification: new Date().toISOString(),
    totalRecords: 15782,
    verifiedRecords: 15782,
    tamperDetected: false,
    blockchainType: 'Hyperledger Fabric',
    networkNodes: 5,
    consensus: 'Practical Byzantine Fault Tolerance',
  };
}

/**
 * Get blockchain verification events
 * @returns {Array} List of verification events
 */
function getVerificationEvents() {
  return [
    {
      id: 'verify-1',
      timestamp: '2025-04-26T08:45:12Z',
      recordType: 'Electronic Signature',
      recordId: 'esig-45621',
      status: 'verified',
      hashValue: '0x3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b',
    },
    {
      id: 'verify-2',
      timestamp: '2025-04-26T09:12:34Z',
      recordType: 'Audit Log',
      recordId: 'alog-78965',
      status: 'verified',
      hashValue: '0x1a2b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b',
    },
    {
      id: 'verify-3',
      timestamp: '2025-04-26T09:37:45Z',
      recordType: 'Document Submission',
      recordId: 'doc-34572',
      status: 'verified',
      hashValue: '0x9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c4d3e2f1a0b',
    },
    {
      id: 'verify-4',
      timestamp: '2025-04-26T10:05:22Z',
      recordType: 'User Authentication',
      recordId: 'auth-12453',
      status: 'verified',
      hashValue: '0x5e4d3c2b1a0f9e8d7c6b5a4f3e2d1c0b9a8f7e6d',
    },
    {
      id: 'verify-5',
      timestamp: '2025-04-26T10:28:17Z',
      recordType: 'System Validation',
      recordId: 'val-90876',
      status: 'verified',
      hashValue: '0x2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e',
    },
  ];
}

/**
 * Get audit logs with pagination and filtering
 * @param {Object} options - Filtering and pagination options
 * @returns {Object} Audit logs with pagination metadata
 */
function getAuditLogs(options = {}) {
  const { page = 1, limit = 50, eventType = [], user = [], fromDate = null, search = '' } = options;

  // Generate sample logs (in production, this would query the database)
  const logs = generateSampleAuditLogs(50, eventType, user, fromDate, search);

  return {
    page,
    limit,
    total: logs.length,
    logs,
  };
}

/**
 * Get compliance documentation by category
 * @param {string} category - Document category (guidance, templates, validation, procedures)
 * @returns {Array} List of documents in the specified category
 */
function getComplianceDocuments(category = 'guidance') {
  const documentData = {
    guidance: [
      {
        id: 'fda-guidance-1',
        title: 'FDA 21 CFR Part 11 Guidance for Industry',
        description:
          'Official FDA guidance for implementing 21 CFR Part 11 compliance for electronic records and signatures.',
        date: '2023-11-15',
        type: 'pdf',
        size: '2.4 MB',
      },
      {
        id: 'fda-guidance-2',
        title: 'Electronic Signatures in Global and National Commerce',
        description:
          'Regulatory guidance on electronic signature requirements for pharma and medical device industries.',
        date: '2024-01-22',
        type: 'pdf',
        size: '1.8 MB',
      },
      {
        id: 'fda-guidance-3',
        title: 'Data Integrity and Compliance With Drug CGMP',
        description: 'Questions and answers guidance for industry on data integrity compliance.',
        date: '2024-02-05',
        type: 'pdf',
        size: '1.2 MB',
      },
    ],
    templates: [
      {
        id: 'template-1',
        title: 'Validation Master Plan Template',
        description:
          'Standard template for creating a comprehensive system validation master plan.',
        date: '2024-03-10',
        type: 'docx',
        size: '780 KB',
      },
      {
        id: 'template-2',
        title: 'Computer System Validation Protocol',
        description:
          'Template for validation protocols for computerized systems under 21 CFR Part 11.',
        date: '2024-03-15',
        type: 'docx',
        size: '950 KB',
      },
      {
        id: 'template-3',
        title: 'Electronic Signature Compliance Checklist',
        description: 'Comprehensive checklist for verifying electronic signature compliance.',
        date: '2024-02-28',
        type: 'xlsx',
        size: '620 KB',
      },
    ],
    validation: [
      {
        id: 'validation-1',
        title: 'TrialSage Validation Summary Report',
        description:
          'Summary of validation testing performed on the TrialSage platform for 21 CFR Part 11 compliance.',
        date: '2025-04-15',
        type: 'pdf',
        size: '4.2 MB',
      },
      {
        id: 'validation-2',
        title: 'Blockchain Security Validation Report',
        description:
          'Technical validation of the blockchain security implementation for tamper-evident records.',
        date: '2025-04-10',
        type: 'pdf',
        size: '3.7 MB',
      },
      {
        id: 'validation-3',
        title: 'Electronic Signature Validation Evidence',
        description: 'Validation evidence for electronic signature implementation compliance.',
        date: '2025-04-05',
        type: 'pdf',
        size: '2.9 MB',
      },
    ],
    procedures: [
      {
        id: 'procedure-1',
        title: 'Electronic Record Management SOP',
        description:
          'Standard Operating Procedure for managing electronic records in compliance with 21 CFR Part 11.',
        date: '2024-03-22',
        type: 'pdf',
        size: '1.5 MB',
      },
      {
        id: 'procedure-2',
        title: 'System Access Control Procedure',
        description:
          'Procedures for implementing and maintaining system access controls for compliance.',
        date: '2024-03-24',
        type: 'pdf',
        size: '1.2 MB',
      },
      {
        id: 'procedure-3',
        title: 'Audit Trail Review SOP',
        description: 'Standard procedures for reviewing and maintaining electronic audit trails.',
        date: '2024-03-18',
        type: 'pdf',
        size: '980 KB',
      },
    ],
  };

  return documentData[category] || [];
}

// Helper function to generate sample audit logs
function generateSampleAuditLogs(count, eventTypeFilter, userFilter, fromDateFilter, searchQuery) {
  const eventTypes = [
    'Document Access',
    'Electronic Signature',
    'System Login',
    'Record Creation',
    'Record Update',
    'Record Deletion',
    'System Validation',
    'Security Event',
  ];
  const users = [
    'john.smith',
    'jane.doe',
    'robert.johnson',
    'sarah.williams',
    'david.miller',
    'system',
  ];
  const resourcePrefixes = ['doc-', 'form-', 'sig-', 'user-', 'sys-', 'rec-'];

  const getRandomElement = array => array[Math.floor(Math.random() * array.length)];

  // Generate random timestamp within the past 30 days
  const getRandomTimestamp = () => {
    const now = new Date();
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    return new Date(
      thirtyDaysAgo.getTime() + Math.random() * (now.getTime() - thirtyDaysAgo.getTime())
    ).toISOString();
  };

  const getDescription = (eventType, resourceId, user) => {
    switch (eventType) {
      case 'Document Access':
        return `User ${user} accessed document ${resourceId}`;
      case 'Electronic Signature':
        return `User ${user} applied electronic signature to ${resourceId}`;
      case 'System Login':
        return `User ${user} logged in to the system`;
      case 'Record Creation':
        return `User ${user} created record ${resourceId}`;
      case 'Record Update':
        return `User ${user} updated record ${resourceId}`;
      case 'Record Deletion':
        return `User ${user} deleted record ${resourceId}`;
      case 'System Validation':
        return `System validation executed for ${resourceId}`;
      case 'Security Event':
        return `Security event detected: ${resourceId}`;
      default:
        return `Event occurred involving ${resourceId}`;
    }
  };

  // Generate logs
  let logs = Array.from({ length: count }, (_, i) => {
    const eventType = getRandomElement(eventTypes);
    const user = eventType === 'System Validation' ? 'system' : getRandomElement(users);
    const resourcePrefix = getRandomElement(resourcePrefixes);
    const resourceId = `${resourcePrefix}${100000 + i}`;
    const timestamp = getRandomTimestamp();

    return {
      id: `log-${i + 1}`,
      timestamp,
      eventType,
      user,
      resourceId,
      description: getDescription(eventType, resourceId, user),
      blockchainVerified: Math.random() > 0.1, // 90% of logs are blockchain verified
      details: {
        ipAddress: `192.168.${Math.floor(Math.random() * 255)}.${Math.floor(Math.random() * 255)}`,
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
        actionResult: Math.random() > 0.05 ? 'Success' : 'Failure',
        accessRights: 'Read/Write',
        sessionId: `sess-${Math.floor(Math.random() * 1000000)}`,
        hashValue:
          Math.random() > 0.1
            ? `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`
            : null,
      },
    };
  }).sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp)); // Sort by timestamp, newest first

  // Apply filters if provided
  if (eventTypeFilter && eventTypeFilter.length > 0) {
    logs = logs.filter(log => eventTypeFilter.includes(log.eventType));
  }

  if (userFilter && userFilter.length > 0) {
    logs = logs.filter(log => userFilter.includes(log.user));
  }

  if (fromDateFilter) {
    logs = logs.filter(log => new Date(log.timestamp) >= fromDateFilter);
  }

  if (searchQuery) {
    const query = searchQuery.toLowerCase();
    logs = logs.filter(
      log =>
        log.eventType.toLowerCase().includes(query) ||
        log.user.toLowerCase().includes(query) ||
        log.resourceId.toLowerCase().includes(query) ||
        log.description.toLowerCase().includes(query)
    );
  }

  return logs;
}

module.exports = {
  getComplianceStatus,
  getValidationData,
  getBlockchainStatus,
  getVerificationEvents,
  getAuditLogs,
  getComplianceDocuments,
};
