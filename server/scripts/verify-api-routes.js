// /server/scripts/verify-api-routes.js

import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create directories if they don't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
  console.log(`✅ Created uploads directory at ${uploadsDir}`);
}

// Create metadata.json if it doesn't exist
const metadataPath = path.join(uploadsDir, 'metadata.json');
if (!fs.existsSync(metadataPath)) {
  fs.writeFileSync(metadataPath, JSON.stringify([]), 'utf8');
  console.log(`✅ Created empty metadata.json at ${metadataPath}`);
}

// Create a small test Express app to verify route mounting
const app = express();

// Import the advisor routes
import advisorRoutes from '../routes/advisor.js';

// Verify advisor routes
console.log('✅ Advisor routes imported successfully');
console.log('✅ Route stack length:', advisorRoutes.stack?.length || 0);

// Mount the advisor routes
app.use('/api/advisor', advisorRoutes);
console.log('✅ Mounted advisor routes at /api/advisor');

// List all the advisor routes
const routes = [];
advisorRoutes.stack.forEach(layer => {
  if (layer.route) {
    const path = layer.route.path;
    const methods = Object.keys(layer.route.methods).map(method => method.toUpperCase());
    routes.push({ path, methods });
  }
});

console.log('All advisor routes:');
routes.forEach(route => {
  console.log(`- [${route.methods.join(', ')}] ${route.path}`);
});

console.log('\n✅ API route verification complete');
