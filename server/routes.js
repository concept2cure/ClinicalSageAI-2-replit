/**
 * TrialSage API Routes
 *
 * This module defines the core API routes for the TrialSage platform
 */

const { createServer } = require('http');
const fdaComplianceRoutes = require('./routes/fda-compliance-routes');

// Import our new API routes
const projectRoutes = require('./routes/projects');
const actionsRoutes = require('./routes/actions');
const vaultRoutes = require('./routes/vault');
const analyticsRoutes = require('./routes/analytics');
const retrieveRoutes = require('./routes/ai/common/retrieve');
const documentRoutes = require('./routes/documentRoutes');
const { router: sseRoutes, sendEventToJob } = require('./routes/sseRoutes');
const cerGenerationRoutes = require('./routes/cerGenerationRoutes');
const discoveryRoutes = require('./routes/discovery');
const documentAssemblyRoutes = require('./routes/document-assembly');
const sharedTemplatesRoutes = require('./routes/shared-templates');
const semanticSearchRoutes = require('./api/semantic-search').default;

/**
 * Register routes on the Express app
 *
 * @param {Express} app - The Express app instance
 * @returns {http.Server} - The HTTP server instance
 */
function registerRoutes(app) {
  // Health check route
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'healthy',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

  // Version information route
  app.get('/api/version', (req, res) => {
    res.json({
      version: '1.0.0',
      build: 'BL-20250426-FDA',
      compliance: '21 CFR Part 11',
      fdaStatusVersion: '1.2.0',
      engineVersion: '3.1.4',
    });
  });

  // Register FDA compliance routes - make sure the path is correct
  console.log('Registering FDA compliance routes');
  app.use('/api/fda-compliance', fdaComplianceRoutes);

  // Register our new API routes
  console.log('Registering project routes');
  app.use('/api/projects', projectRoutes);

  console.log('Registering next actions routes');
  app.use('/api/next-actions', actionsRoutes);

  console.log('Registering vault routes');
  app.use('/api/vault', vaultRoutes);

  console.log('Registering analytics routes');
  app.use('/api/analytics', analyticsRoutes);

  console.log('Registering AI retrieval routes');
  app.use('/api/ai/retrieve', retrieveRoutes);

  console.log('Registering document management routes');
  app.use('/api/documents', documentRoutes);

  console.log('Registering SSE routes for real-time updates');
  app.use('/api', sseRoutes);

  // Register enhanced eCTD routes
  console.log('Registering enhanced eCTD routes');
  try {
    const ectdEnhancedRoutes = require('./routes/ectd-enhanced');
    app.use('/api/ectd', ectdEnhancedRoutes);
  } catch (error) {
    console.warn('Could not load enhanced eCTD routes:', error.message);
  }

  console.log('Registering CER generation routes');
  app.use('/api/cer', cerGenerationRoutes);

  // Register unified discovery routes for both CER and 510(k) modules
  console.log('Registering unified discovery routes');
  app.use('/api/discovery', discoveryRoutes);

  // Register document assembly routes for formatted regulatory submissions
  console.log('Registering document assembly routes');
  app.use('/api/document-assembly', documentAssemblyRoutes);

  console.log('Registering shared templates routes');
  app.use('/api/templates', sharedTemplatesRoutes);

  console.log('Registering semantic search routes');
  app.use('/api/semantic', semanticSearchRoutes);

  // Log all routes for debugging
  app._router.stack.forEach(function (r) {
    if (r.route && r.route.path) {
      console.log(`Route registered: ${Object.keys(r.route.methods)} ${r.route.path}`);
    } else if (r.name === 'router' && r.handle.stack) {
      // This is a router middleware
      console.log(`Router middleware: ${r.regexp}`);
      r.handle.stack.forEach(function (r) {
        if (r.route) {
          const methods = Object.keys(r.route.methods).join(',');
          console.log(`  - ${methods} ${r.route.path}`);
        }
      });
    }
  });

  // Mock audit logs route for development
  app.get('/api/audit-logs', (req, res) => {
    const { page = 1, pageSize = 10 } = req.query;

    // Generate mock audit logs for development
    const auditLogs = [
      {
        id: 'AUDIT-1681234567-123',
        userId: 'john.smith',
        action: 'CREATE',
        resourceType: 'DOCUMENT',
        resourceId: 'DOC-001',
        timestamp: '2025-04-26T09:15:23.456Z',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: {
          documentName: 'Clinical Study Report',
          documentType: 'CSR',
        },
        hash: 'f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8',
      },
      {
        id: 'AUDIT-1681234789-456',
        userId: 'jane.doe',
        action: 'UPDATE',
        resourceType: 'DOCUMENT',
        resourceId: 'DOC-001',
        timestamp: '2025-04-26T10:30:45.789Z',
        ipAddress: '192.168.1.2',
        userAgent: 'Mozilla/5.0',
        details: {
          documentName: 'Clinical Study Report',
          documentType: 'CSR',
          changedFields: ['status', 'version'],
        },
        hash: 'a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b',
      },
      {
        id: 'AUDIT-1681235012-789',
        userId: 'robert.johnson',
        action: 'SIGNATURE',
        resourceType: 'DOCUMENT',
        resourceId: 'DOC-001',
        timestamp: '2025-04-26T11:45:12.345Z',
        ipAddress: '192.168.1.3',
        userAgent: 'Mozilla/5.0',
        details: {
          documentName: 'Clinical Study Report',
          documentType: 'CSR',
          signatureType: 'APPROVAL',
          signatureId: 'SIG-001',
        },
        hash: 'b9c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c',
      },
      {
        id: 'AUDIT-1681236234-012',
        userId: 'susan.williams',
        action: 'VIEW',
        resourceType: 'DOCUMENT',
        resourceId: 'DOC-001',
        timestamp: '2025-04-26T12:30:34.567Z',
        ipAddress: '192.168.1.4',
        userAgent: 'Mozilla/5.0',
        details: {
          documentName: 'Clinical Study Report',
          documentType: 'CSR',
        },
        hash: 'c0d1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d',
      },
      {
        id: 'AUDIT-1681237456-345',
        userId: 'john.smith',
        action: 'EXPORT',
        resourceType: 'DOCUMENT',
        resourceId: 'DOC-001',
        timestamp: '2025-04-26T13:15:56.789Z',
        ipAddress: '192.168.1.1',
        userAgent: 'Mozilla/5.0',
        details: {
          documentName: 'Clinical Study Report',
          documentType: 'CSR',
          exportFormat: 'PDF',
        },
        hash: 'd1e2f3a4b5c6d7e8f9a0b1c2d3e4f5a6b7c8d9e0f1a2b3c4d5e6f7a8b9c0d1e',
      },
    ];

    // Apply pagination
    const start = (page - 1) * pageSize;
    const end = start + pageSize;
    const paginatedLogs = auditLogs.slice(start, end);

    res.json({
      logs: paginatedLogs,
      totalCount: auditLogs.length,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
      totalPages: Math.ceil(auditLogs.length / pageSize),
    });
  });

  // Create HTTP server
  const httpServer = createServer(app);

  return httpServer;
}

module.exports = {
  registerRoutes,
  sendEventToJob,
};
