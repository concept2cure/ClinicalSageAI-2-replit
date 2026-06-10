/**
 * RFC 9116 vulnerability-disclosure endpoint — /.well-known/security.txt
 *
 * A standard, machine-readable pointer to our security contact and policy.
 * Security teams and pentesters check for this when assessing a vendor; it
 * complements the repo SECURITY.md. Public by design (no auth). The Expires
 * field is computed ~1 year out per request so the file never goes stale.
 */

import { Router, Request, Response } from 'express';

const router = Router();

const SECURITY_CONTACT = process.env.SECURITY_CONTACT_EMAIL || 'security@concept2cure.pro';

function baseUrl(req: Request): string {
  if (process.env.APP_BASE_URL) return process.env.APP_BASE_URL.replace(/\/$/, '');
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'https';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
  return `${proto}://${host}`;
}

router.get('/security.txt', (req: Request, res: Response) => {
  const base = baseUrl(req);
  const expires = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const body = [
    '# Vulnerability disclosure — please report responsibly.',
    `Contact: mailto:${SECURITY_CONTACT}`,
    `Expires: ${expires}`,
    'Preferred-Languages: en',
    `Canonical: ${base}/.well-known/security.txt`,
    `Policy: ${base}/SECURITY.md`,
    '',
  ].join('\n');

  res.type('text/plain').send(body);
});

export default router;
