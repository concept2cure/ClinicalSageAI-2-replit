/**
 * Authentication Controller
 *
 * This module handles authentication logic for the TrialSage platform.
 */

/**
 * Check Authentication Middleware
 * Verifies if the user is authenticated via token or user cookie
 */
export function checkAuth(req, res, next) {
  // Check for token in cookie or authorization header
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];

  // If no token, also check if there's a user cookie (our simplified auth)
  const userCookie = req.cookies?.user;

  if (!token && !userCookie) {
    console.log('[AUTH] Auth check failed - redirecting to login');
    return res.redirect('/login');
  }

  // For now just check existence, in production verify JWT signature
  console.log('[AUTH] User authenticated successfully');
  next();
}

/**
 * Handle Login
 * Process login requests and set authentication tokens
 */
export function handleLogin(req, res) {
  const { username, password } = req.body;

  // Simple authentication logic - would use database in production
  if (username === 'admin' && password === 'admin') {
    // Create a user object
    const user = {
      id: 1,
      username: 'admin',
      name: 'Admin User',
      email: 'admin@trialsage.ai',
      role: 'admin',
      subscribed: true,
    };

    // Set user cookie
    res.cookie('user', JSON.stringify(user), {
      httpOnly: false, // Allow JavaScript access for client-side auth checks
      secure: process.env.NODE_ENV === 'production', // Use secure in production
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    });

    return res.json({ success: true, user });
  }

  // Authentication failed
  res.status(401).json({ success: false, message: 'Invalid credentials' });
}

/**
 * Handle Logout
 * Clear authentication tokens and cookies
 */
export function handleLogout(req, res) {
  // Clear cookies
  res.clearCookie('user');
  res.clearCookie('token');

  // Redirect to login page
  res.redirect('/login');
}
