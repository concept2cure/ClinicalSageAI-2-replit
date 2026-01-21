/**
 * Authentication Routes
 * 
 * This module defines authentication routes for the TrialSage platform.
 */

import express from 'express';
import axios from 'axios';
import jwt from 'jsonwebtoken';
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
import { loginWithSsoProfile } from '../services/authService.js';

const router = express.Router();

const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const MICROSOFT_AUTHORITY = 'https://login.microsoftonline.com';
const GOOGLE_SCOPES = 'openid email profile';
const MICROSOFT_SCOPES = 'openid profile email';

const buildBaseUrl = req => `${req.protocol}://${req.get('host')}`;

const signState = (provider) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign({ provider }, process.env.JWT_SECRET, { expiresIn: '10m' });
};

const verifyState = (state) => {
  if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.verify(state, process.env.JWT_SECRET);
};

// Public routes (no authentication required)
router.post('/register', handleRegister);
router.post('/login', handleLogin);
router.post('/forgot-password', handleForgotPassword);
router.post('/reset-password', handleResetPassword);

// SSO configuration status (no secrets)
router.get('/sso/status', (req, res) => {
  const baseUrl = buildBaseUrl(req);
  const googleConfigured = Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
  const microsoftConfigured = Boolean(
    (process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID) &&
      (process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET)
  );

  return res.json({
    googleConfigured,
    microsoftConfigured,
    callbacks: {
      google: `${baseUrl}/api/auth/sso/google/callback`,
      microsoft: `${baseUrl}/api/auth/sso/microsoft/callback`,
    },
  });
});

// SSO routes (Microsoft & Google)
router.get('/sso/:provider/url', (req, res) => {
  try {
    const provider = req.params.provider?.toLowerCase();
    const state = signState(provider);
    const baseUrl = buildBaseUrl(req);

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const redirectUri = `${baseUrl}/api/auth/sso/google/callback`;

      if (!clientId || !process.env.GOOGLE_CLIENT_SECRET) {
        return res.status(500).json({ message: 'Google SSO is not configured.' });
      }

      const url = new URL(GOOGLE_AUTH_URL);
      url.searchParams.append('client_id', clientId);
      url.searchParams.append('redirect_uri', redirectUri);
      url.searchParams.append('response_type', 'code');
      url.searchParams.append('scope', GOOGLE_SCOPES);
      url.searchParams.append('access_type', 'offline');
      url.searchParams.append('prompt', 'consent');
      url.searchParams.append('state', state);

      return res.json({ authUrl: url.toString() });
    }

    if (provider === 'microsoft') {
      const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID;
      const tenantId = process.env.MICROSOFT_TENANT_ID || process.env.AZURE_TENANT_ID || 'common';
      const redirectUri = `${baseUrl}/api/auth/sso/microsoft/callback`;

      if (!clientId || !(process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET)) {
        return res.status(500).json({ message: 'Microsoft SSO is not configured.' });
      }

      const url = new URL(`${MICROSOFT_AUTHORITY}/${tenantId}/oauth2/v2.0/authorize`);
      url.searchParams.append('client_id', clientId);
      url.searchParams.append('response_type', 'code');
      url.searchParams.append('redirect_uri', redirectUri);
      url.searchParams.append('response_mode', 'query');
      url.searchParams.append('scope', MICROSOFT_SCOPES);
      url.searchParams.append('state', state);

      return res.json({ authUrl: url.toString() });
    }

    return res.status(400).json({ message: 'Unsupported SSO provider.' });
  } catch (error) {
    console.error('SSO URL error:', error);
    return res.status(500).json({ message: 'Failed to create SSO URL.' });
  }
});

router.get('/sso/:provider/callback', async (req, res) => {
  const provider = req.params.provider?.toLowerCase();
  const { code, state } = req.query;

  if (!code || !state) {
    return res.redirect('/login?error=missing_oauth_params');
  }

  try {
    verifyState(state);
  } catch (error) {
    console.error('SSO state verification failed:', error);
    return res.redirect('/login?error=invalid_state');
  }

  try {
    const baseUrl = buildBaseUrl(req);
    const ipAddress = req.ip || req.connection?.remoteAddress;
    const userAgent = req.headers['user-agent'];

    if (provider === 'google') {
      const clientId = process.env.GOOGLE_CLIENT_ID;
      const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
      const redirectUri = `${baseUrl}/api/auth/sso/google/callback`;

      const tokenResponse = await axios.post(
        GOOGLE_TOKEN_URL,
        new URLSearchParams({
          code: code.toString(),
          client_id: clientId,
          client_secret: clientSecret,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const accessToken = tokenResponse.data.access_token;
      const profileResponse = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const profile = profileResponse.data;
      const authResult = await loginWithSsoProfile(
        { email: profile.email, name: profile.name, provider: 'google' },
        ipAddress,
        userAgent
      );

      return res.redirect(
        `/login?token=${encodeURIComponent(authResult.accessToken)}&refreshToken=${encodeURIComponent(authResult.refreshToken)}`
      );
    }

    if (provider === 'microsoft') {
      const clientId = process.env.MICROSOFT_CLIENT_ID || process.env.AZURE_CLIENT_ID;
      const clientSecret = process.env.MICROSOFT_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET;
      const tenantId = process.env.MICROSOFT_TENANT_ID || process.env.AZURE_TENANT_ID || 'common';
      const redirectUri = `${baseUrl}/api/auth/sso/microsoft/callback`;

      const tokenResponse = await axios.post(
        `${MICROSOFT_AUTHORITY}/${tenantId}/oauth2/v2.0/token`,
        new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          code: code.toString(),
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
          scope: MICROSOFT_SCOPES,
        }),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const accessToken = tokenResponse.data.access_token;
      const profileResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      const profile = profileResponse.data;
      const email = profile.mail || profile.userPrincipalName;
      const authResult = await loginWithSsoProfile(
        { email, name: profile.displayName, provider: 'microsoft' },
        ipAddress,
        userAgent
      );

      return res.redirect(
        `/login?token=${encodeURIComponent(authResult.accessToken)}&refreshToken=${encodeURIComponent(authResult.refreshToken)}`
      );
    }

    return res.redirect('/login?error=unsupported_provider');
  } catch (error) {
    console.error('SSO callback error:', error.response?.data || error.message);
    return res.redirect('/login?error=sso_failed');
  }
});

// Protected routes (authentication required)
router.post('/logout', checkAuth, handleLogout);
router.post('/refresh', handleRefresh); // Refresh uses refresh token, not access token
router.get('/profile', checkAuth, handleGetProfile);

export default router;
