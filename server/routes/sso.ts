import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';

import { config } from '../config/environment';

const router = Router();
const isDev = process.env.NODE_ENV !== 'production';

// GET /api/auth/sso/:provider/initiate
router.get('/:provider/initiate', (req: Request, res: Response) => {
  const { provider } = req.params;

  // In dev mode, immediately redirect to our callback with a test code
  if (isDev) {
    const code = 'dev-sso-code';
    const callbackUrl = `/api/auth/sso/${provider}/callback?code=${encodeURIComponent(code)}`;
    return res.redirect(302, callbackUrl);
  }

  // In production, this would redirect to the provider's authorization endpoint
  res.status(501).json({ success: false, error: 'SSO_NOT_IMPLEMENTED', provider });
});

// GET /api/auth/sso/:provider/callback
router.get('/:provider/callback', (req: Request, res: Response) => {
  const { provider } = req.params;
  const { code } = req.query;

  // For dev mode, accept the mock code and return a token + user info
  if (isDev) {
    // Create a simple JWT token
    const token = jwt.sign({ userId: '1', email: 'sso-user@example.com', provider }, config.jwt.secret, {
      expiresIn: '24h',
    });

    return res.json({
      success: true,
      provider,
      code: code || 'dev-sso-code',
      accessToken: token,
      user: {
        id: '1',
        email: 'sso-user@example.com',
        firstName: 'SSO',
        lastName: 'User',
        organizationId: '2',
        organizationName: 'Concept2Cure',
        roles: ['client_user'],
      },
    });
  }

  res.status(501).json({ success: false, error: 'SSO_NOT_IMPLEMENTED' });
});

export default router;
