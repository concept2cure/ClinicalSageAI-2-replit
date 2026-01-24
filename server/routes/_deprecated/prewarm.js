/**
 * Server Pre-warming Routes
 *
 * This file contains routes used to pre-warm the server and prevent Replit hibernation.
 */

import express from 'express';
import { handlePrewarm } from '../controllers/prewarm.js';

const router = express.Router();

/**
 * Pre-warm endpoint
 * Simple endpoint to wake up the server when called from the client
 */
router.get('/', handlePrewarm);

export default router;
