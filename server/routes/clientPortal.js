/**
 * Client Portal Routes
 *
 * This module defines routes for the client portal functionality.
 */

import express from 'express';
import { checkAuth } from '../controllers/auth.js';
import { serveClientPortalDirectPage, serveAutoLoginPage } from '../controllers/clientPortal.js';

const router = express.Router();

// Secure client portal route (with auth check)
router.get('/client-portal-direct', checkAuth, serveClientPortalDirectPage);

// Auto-login page route
router.get('/auto-login', serveAutoLoginPage);

export default router;
