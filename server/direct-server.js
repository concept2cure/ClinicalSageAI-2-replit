// server/direct-server.js
// This is a simplified server file to confirm API routes are working

import express from 'express';
import advisorRoutes from './routes/advisor.js';

const app = express();

// Basic middleware
app.use(express.json());

// CORS middleware
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header(
    'Access-Control-Allow-Headers',
    'Origin, X-Requested-With, Content-Type, Accept, Authorization'
  );

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }

  next();
});

// Request Logger
app.use((req, res, next) => {
  console.log(`🔍 [Request] ${req.method} ${req.originalUrl}`);
  next();
});

// Only mount advisor routes
app.use('/api/advisor', advisorRoutes);
console.log('✅ Mounting advisor routes at /api/advisor');

// Default 404 for API routes
app.get('*', (req, res) => {
  console.log(`❌ Unhandled route: ${req.originalUrl}`);
  res.status(404).json({ error: `Route not found: ${req.originalUrl}` });
});

// Start Server
const PORT = 5001;
app.listen(PORT, () => {
  console.log(`✅ Direct Advisor API server running on port ${PORT}`);
  console.log(
    `✅ Try: curl http://localhost:${PORT}/api/advisor/check-readiness?playbook=Fast%20IND%20Playbook`
  );
});
