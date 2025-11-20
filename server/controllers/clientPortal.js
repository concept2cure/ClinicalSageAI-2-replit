/**
 * Client Portal Controller
 *
 * This module handles serving the client portal pages.
 */

import path from 'path';

/**
 * Serve the client portal direct page
 * This page requires authentication
 */
export function serveClientPortalDirectPage(req, res) {
  // In production you might want to log access attempts
  console.log('[PORTAL] Serving authenticated client portal to user');

  // Send the client portal page
  res.sendFile(path.resolve('./client/public/client-portal-direct.html'));
}

/**
 * Serve the auto-login page
 * This page handles automatic redirection to the client portal with token
 */
export function serveAutoLoginPage(req, res) {
  res.sendFile(path.resolve('./client/public/auto-login.html'));
}
