/**
 * Authentication Controller
 *
 * Handles authentication logic for the Concept2Cure platform using Neon database.
 */

import * as authService from '../services/authService.js';

/**
 * Check Authentication Middleware
 * Verifies JWT token and attaches user to request
 */
export function checkAuth(req, res, next) {
  // Get token from Authorization header
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ 
      success: false, 
      message: 'Authentication required' 
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    // Verify and decode token
    const decoded = authService.verifyAccessToken(token);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ 
      success: false, 
      message: error.message || 'Invalid or expired token'
    });
  }
}

/**
 * Handle user registration
 */
export async function handleRegister(req, res) {
  try {
    const { email, username, password } = req.body;

    if (!email || !username || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email, username, and password are required',
      });
    }

    const user = await authService.register(email, username, password);

    res.status(201).json({
      success: true,
      message: 'User registered successfully',
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
      },
    });
  } catch (error) {
    console.error('Registration error:', error);
    
    if (error.message.includes('already')) {
      return res.status(409).json({
        success: false,
        message: error.message,
      });
    }

    res.status(500).json({
      success: false,
      message: 'Registration failed',
    });
  }
}

/**
 * Handle user login
 */
export async function handleLogin(req, res) {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        success: false,
        message: 'Email and password are required',
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.login(email, password, ipAddress, userAgent);

    res.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      user: {
        id: result.user.id,
        email: result.user.email,
        username: result.user.username,
      },
    });
  } catch (error) {
    console.error('Login error:', error);
    
    res.status(401).json({
      success: false,
      message: error.message || 'Login failed',
    });
  }
}

/**
 * Handle user logout
 */
export async function handleLogout(req, res) {
  try {
    const { refreshToken } = req.body;

    await authService.logout(refreshToken);

    res.json({
      success: true,
      message: 'Logged out successfully',
    });
  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      success: false,
      message: 'Logout failed',
    });
  }
}

/**
 * Handle token refresh
 */
export async function handleRefresh(req, res) {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token is required',
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];

    const result = await authService.refresh(refreshToken, ipAddress, userAgent);

    res.json({
      success: true,
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
    });
  } catch (error) {
    console.error('Token refresh error:', error);
    
    res.status(401).json({
      success: false,
      message: error.message || 'Token refresh failed',
    });
  }
}

/**
 * Handle password reset request
 */
export async function handleForgotPassword(req, res) {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email is required',
      });
    }

    const ipAddress = req.ip || req.connection.remoteAddress;
    const resetToken = await authService.requestPasswordReset(email, ipAddress);

    // In production, send this token via email
    // For now, we'll return it in the response (DO NOT DO THIS IN PRODUCTION!)
    // TODO: Integrate with email service to send reset link

    res.json({
      success: true,
      message: 'If the email exists, a password reset link will be sent',
      // TODO: Remove this in production
      resetToken: process.env.NODE_ENV === 'development' ? resetToken : undefined,
    });
  } catch (error) {
    console.error('Password reset request error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Password reset request failed',
    });
  }
}

/**
 * Handle password reset
 */
export async function handleResetPassword(req, res) {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Reset token and new password are required',
      });
    }

    await authService.resetPassword(token, newPassword);

    res.json({
      success: true,
      message: 'Password reset successfully',
    });
  } catch (error) {
    console.error('Password reset error:', error);
    
    res.status(400).json({
      success: false,
      message: error.message || 'Password reset failed',
    });
  }
}

/**
 * Get current user profile
 */
export async function handleGetProfile(req, res) {
  try {
    const userId = req.user.id;
    const user = await authService.getUserById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Get profile error:', error);
    
    res.status(500).json({
      success: false,
      message: 'Failed to get user profile',
    });
  }
}
