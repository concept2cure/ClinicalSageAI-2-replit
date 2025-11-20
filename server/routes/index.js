// /server/routes/index.js
import express from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default function setupApiRoutes(app) {
  // Import advisor routes directly
  import('./advisor.js')
    .then(advisorModule => {
      const advisorRoutes = advisorModule.default;
      console.log('✅ Advisor routes loaded dynamically');

      // Create directories for advisor metadata if they don't exist
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

      app.use('/api/advisor', advisorRoutes);
      console.log('✅ Mounted advisor routes at /api/advisor');
    })
    .catch(err => {
      console.error('❌ Failed to load advisor routes:', err);
    });

  // Import CER data retrieval routes
  import('./cerDataRetrieval.js')
    .then(cerDataModule => {
      const cerDataRoutes = cerDataModule.default;
      console.log('✅ CER Data Retrieval routes loaded dynamically');

      app.use('/api/cer-data', cerDataRoutes);
      console.log('✅ Mounted CER data retrieval routes at /api/cer-data');
    })
    .catch(err => {
      console.error('❌ Failed to load CER data retrieval routes:', err);
    });
}
