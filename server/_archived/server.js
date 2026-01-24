// /server/server.js

import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import projectsStatusRoutes from './routes/projectsStatus.js';
import indAssemblerRoutes from './routes/indAssembler.js';
import indWizardAPIRoutes from './routes/indWizardAPI.js';
import documentsRoutes from './routes/documents.js';
import vaultUploadRoutes from './routes/vaultUpload.js';
// We'll import advisor routes dynamically in routes/index.js

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middleware for JSON and CORS
app.use(express.json());

// Serve static files from the public directory
app.use('/static', express.static(path.join(__dirname, '../public/static')));

// Import security middleware
import securityHeaders from './middleware/securityHeaders.js';

// Apply security headers
app.use(securityHeaders);

// Add CORS middleware to allow cross-origin requests
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization, X-Tenant-Id'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Request Logger for API monitoring (moved to top for better visibility)
app.use((req, res, next) => {
  console.log(`[API] ${req.method} ${req.originalUrl}`);
  next();
});

// Import AI routes
import aiRoutes from './routes/ai-routes.js';
import coauthorRoutes from './routes/coauthor.js';
import timelineRoutes from './routes/timeline.js';
import coauthorCanvasRoutes from './routes/coauthorCanvas.js';
import protocolRoutes from './routes/protocol.js';
import csrRoutes from './routes/csr.js';
import cmcRoutes from './routes/cmc.js';
import cerRoutes from './routes/cer.js';
import blueprintRoutes from './routes/blueprint.js';
import citationRoutes from './routes/citation.js';
import pubmedRoutes from './routes/pubmed.js';
import openFDARoutes from './routes/openfda.js';
import templateRoutes from './routes/template.js';
import ectdValidatorRoutes from './routes/ectdValidator.js';
import submissionRoutes from './routes/submission.js';
// Removed conflicting processRoutes import - using CMC process routes instead
import doeRoutes from './routes/doe.js';
import qbdRoutes from './routes/qbd.js';
import analyticalRoutes from './routes/analytical.js';
import comparabilityRoutes from './routes/comparability.js';
import stabilityRoutes from './routes/stability.js';
import arrheniusRoutes from './routes/arrhenius.js';

// Direct test endpoint for coauthor generate
app.post('/api/coauthor/generate/test', (req, res) => {
  console.log('📝 Direct test endpoint for coauthor generate called');
  console.log('Request body:', JSON.stringify(req.body, null, 2));

  return res.json({
    success: true,
    draft: `This is a test response from the direct endpoint in server.js. Your request included: ${req.body.moduleId || 'unknown'}/${req.body.sectionId || 'unknown'}`,
  });
});

// API Routes
app.use('/api/projects', projectsStatusRoutes);
app.use('/api/ind', indAssemblerRoutes);
app.use('/api/ind/wizard', indWizardAPIRoutes);
app.use('/api/docs', documentsRoutes);
app.use('/api/vault', vaultUploadRoutes);
app.use('/api/ai', aiRoutes);
app.use('/api/coauthor', coauthorRoutes);
app.use('/api/coauthor/canvas', coauthorCanvasRoutes);
app.use('/api/timeline', timelineRoutes);
app.use('/api/protocol', protocolRoutes);
app.use('/api/csr', csrRoutes);
app.use('/api/cmc', cmcRoutes);
app.use('/api/cer', cerRoutes);
app.use('/api/blueprint', blueprintRoutes);
app.use('/api/citation', citationRoutes);
app.use('/api/pubmed', pubmedRoutes);
app.use('/api/openfda', openFDARoutes);
app.use('/api/templates', templateRoutes);
app.use('/api/ectd', ectdValidatorRoutes);
app.use('/api/submission', submissionRoutes);

// Analytical Control & Method Management Routes (moved to index.ts for working implementation)
// app.use('/api/analytical', analyticalRoutes);
app.use('/api/comparability', comparabilityRoutes);

// Process & Formulation Development Routes
app.use('/api/doe', doeRoutes);
app.use('/api/qbd', qbdRoutes);

// Stability Study Management Routes
app.use('/api/stability', stabilityRoutes);
app.use('/api/arrhenius', arrheniusRoutes);

// Import route modules
import advisorRoutes from './routes/advisor.js';
import { registerDiagnostics } from './diagnostics.js';

// Register diagnostics routes first (for troubleshooting)
registerDiagnostics(app);

// Mount advisor routes with explicit console logging for debugging
console.log('✅ Preparing to mount advisor routes at /api/advisor');
app.use('/api/advisor', advisorRoutes);
console.log('✅ Advisor routes imported and mounted at /api/advisor');

// Mount documents routes
console.log('✅ Mounting documents routes at /api/docs');
app.use('/api/docs', documentsRoutes);
console.log('✅ Documents routes mounted at /api/docs');

// CMC Process routes - MOUNTED BEFORE STATIC FILES
import cmcProcessRoutes from './routes/cmc-process.js';
app.use('/api/process', cmcProcessRoutes);
console.log('✅ CMC Process management routes mounted successfully at /api/process');

// Serve React App
const clientBuildPath = path.join(__dirname, '../client/build');
app.use(express.static(clientBuildPath));

// Serve the vault test HTML page
app.get('/vault-test', (req, res) => {
  res.sendFile(path.join(__dirname, '../client/vault-test.html'));
});

// Custom 404 Handler for API routes only
app.use('/api/*', (req, res, next) => {
  // This only runs if no other route handled the request
  console.log(`⚠️ Unhandled API route: ${req.originalUrl}`);
  res.status(404).json({
    message: 'API endpoint not found',
    path: req.originalUrl,
    availablePaths: [
      '/api/advisor/check-readiness',
      '/api/health',
      '/api/diagnostics/routes',
      '/api/diagnostics/echo',
      '/api/diagnostics/advisor-test',
      '/api/ai/retrieve',
    ],
  });
});

// Import and set up static routes for marketing pages
import { setupStaticRoutes } from './static-routes.js';

// Set up static routes for marketing pages before the React fallback
console.log('✅ Setting up static routes for marketing pages');
setupStaticRoutes(app);
console.log('✅ Static routes set up successfully');

// React Router fallback - serve React index.html for client routes
app.get('*', (req, res) => {
  // Frontend route - serve React app
  console.log(`🔄 Serving React app for: ${req.originalUrl}`);
  res.sendFile(path.join(clientBuildPath, 'index.html'));
});

// Start Server
const PORT = process.env.PORT || 5000; // Changed to match port 5000 that's actually being used
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('🚀 CoAuthor API available at: /api/coauthor/generate');
  console.log('🧪 Test endpoint available at: /api/coauthor/generate/test');
});
