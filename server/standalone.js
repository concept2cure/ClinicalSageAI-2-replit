/**
 * Standalone landing page server
 *
 * This file sets up a simple Express route to serve the standalone landing page
 * without relying on problematic frontend dependencies.
 */

const express = require('express');
const path = require('path');
const fs = require('fs');

// Function to inject landing page route into main server
function injectStandaloneLandingPage(app) {
  // Keep track of whether we're serving the main app or standalone
  let useStandalone = true;

  // Route to toggle between standalone and regular app
  app.get('/toggle-landing', (req, res) => {
    useStandalone = !useStandalone;
    res.send(`Landing page mode set to: ${useStandalone ? 'standalone' : 'integrated'}`);
  });

  // Route to check current mode
  app.get('/landing-mode', (req, res) => {
    res.send(`Current landing page mode: ${useStandalone ? 'standalone' : 'integrated'}`);
  });

  // Route to serve the standalone landing page at the root URL
  app.use('/', (req, res, next) => {
    // If the path is exactly '/' and we're in standalone mode, serve our custom landing page
    if (req.path === '/' && useStandalone) {
      try {
        const htmlPath = path.join(process.cwd(), 'standalone_landing_page.html');

        if (fs.existsSync(htmlPath)) {
          return res.sendFile(htmlPath);
        } else {
          console.error('[Standalone] Landing page HTML not found at:', htmlPath);
          // Fall through to next handler if file not found
        }
      } catch (error) {
        console.error('[Standalone] Error serving landing page:', error);
        // Fall through to next handler on error
      }
    }

    // For all other routes, continue to next middleware
    next();
  });

  console.log('[Standalone] Standalone landing page route registered');
}

module.exports = {
  injectStandaloneLandingPage,
};
