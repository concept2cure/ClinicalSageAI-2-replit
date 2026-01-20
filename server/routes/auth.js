/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import { 
  handleRegister,
  handleLogin, 
  handleLogout, 
  handleRefresh,
  handleForgotPassword,
  handleResetPassword,
  handleGetProfile,
  checkAuth 
} from '../controllers/auth.js';

const router = express.Router();

// Public routes (no authentication required)
router.post('/register', handleRegister);
router.post('/login', handleLogin);
router.post('/forgot-password', handleForgotPassword);
router.post('/reset-password', handleResetPassword);

// Protected routes (authentication required)
router.post('/logout', checkAuth, handleLogout);
router.post('/refresh', handleRefresh); // Refresh uses refresh token, not access token
router.get('/profile', checkAuth, handleGetProfile);

export default router;
