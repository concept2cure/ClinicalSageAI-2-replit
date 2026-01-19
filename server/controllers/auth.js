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
  const { username, email, password } = req.body || {};
  const loginId = username || (email ? email.split('@')[0] : undefined);

  const adminPassword = process.env.ADMIN_PASSWORD || 'admin123';
  const isAdminLogin = loginId === 'admin' && password === adminPassword;

  // Simple authentication logic - would use database in production
  if (isAdminLogin) {
    // Create a user object
    const user = {
      id: 1,
      username: 'admin',
      name: 'Admin User',
      email: 'admin@trialsage.ai',
      role: 'admin',
      subscribed: true,
    };

    const token = process.env.ADMIN_TOKEN || `dev-${Date.now()}`;

    // Set user + token cookies
    res.cookie('user', JSON.stringify(user), {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });

    res.cookie('token', token, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.json({ success: true, user, token });
  }

  // Authentication failed
  res.status(401).json({ success: false, message: 'Invalid credentials' });
}

/**
 * Verify token presence (dev-friendly)
 */
export function verifyAuth(req, res) {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, message: 'Missing token' });
  }
  return res.json({ success: true });
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
