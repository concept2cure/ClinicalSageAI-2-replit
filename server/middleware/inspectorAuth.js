/**
 * Inspector Authentication Middleware
 *
 * This middleware validates inspector tokens for the time-boxed read-only
 * inspection portal. It checks:
 * - Token existence
 * - Token validity
 * - Token expiration
 */

import { supabase } from '../lib/supabaseClient.js';
import { logger } from '../utils/logger.js';

export async function inspectorAuth(req, res, next) {
  try {
    // Get token from header or query parameter
    const token = req.headers['x-inspect-token'] || req.query.token;

    // Check if token exists
    if (!token) {
      return res.status(401).json({
        message: 'Inspector token required',
        code: 'MISSING_TOKEN',
      });
    }

    // Validate token from database
    const { data: tokenData, error } = await supabase
      .from('inspector_tokens')
      .select('*')
      .eq('id', token)
      .single();

    if (error || !tokenData) {
      logger.warn(`Invalid inspector token attempt: ${token}`);
      return res.status(401).json({
        message: 'Invalid inspector token',
        code: 'INVALID_TOKEN',
      });
    }

    // Check if token is expired
    if (new Date(tokenData.expires_at) < new Date()) {
      // Log expired token attempt
      await supabase.from('inspector_audit').insert({
        token_id: token,
        action: 'token-expired',
        metadata: {
          ip: req.ip,
          user_agent: req.headers['user-agent'],
          path: req.path,
        },
      });

      logger.warn(`Expired inspector token attempt: ${token}, expired: ${tokenData.expires_at}`);
      return res.status(401).json({
        message: 'Inspector token has expired',
        code: 'EXPIRED_TOKEN',
        expired_at: tokenData.expires_at,
      });
    }

    // Attach inspector info to request
    req.inspector = tokenData;

    // Proceed to next middleware
    next();
  } catch (err) {
    logger.error(`Error in inspector authentication: ${err.message}`, err);
    res.status(500).json({
      message: 'Internal server error during authentication',
      code: 'AUTH_ERROR',
    });
  }
}
