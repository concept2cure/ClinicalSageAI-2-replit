/**
 * CER Routes Integration
 *
 * This file integrates the Clinical Evaluation Report (CER) routes into the Express application.
 */

import cerRoutes from './routes/cer-routes.js';

/**
 * Register CER routes with the Express application
 * @param {import('express').Express} app - The Express application
 */
export function registerCerRoutes(app) {
  // Mount the CER routes under the /api/cer prefix
  app.use('/api/cer', cerRoutes);

  // Log successful registration
  console.log('CER routes registered successfully');
}
