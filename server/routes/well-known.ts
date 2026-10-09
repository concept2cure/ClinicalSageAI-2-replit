/**
 * RFC 9116 vulnerability-disclosure endpoint — /.well-known/security.txt
 *
 * A standard, machine-readable pointer to our security contact and policy.
 * Security teams and pentesters check for this when assessing a vendor; it
 * complements the repo SECURITY.md. Public by design (no auth). The Expires
 * field is computed ~1 year out per request so the file never goes stale.
 */

import fs from 'node:fs';
import path from 'node:path';
import { Router, Request, Response } from 'express';

const router = Router();

const SECURITY_CONTACT = process.env.SECURITY_CONTACT_EMAIL || 'security@concept2cure.pro';

/**
 * The origin the file names itself and its policy under. APP_URL is the origin
 * the deployment sets (terraform/stack/main.tf) and the one reset and
 * invitation links are built on; APP_BASE_URL is kept for older environments.
 * Only when neither is set does the request's own host decide, which is fine
 * on a laptop and never the case in production (security audit 2026-09-24,
 * INF-32 / P1-14: Canonical used to follow the Host header there too).
 */
function baseUrl(req: Request): string {
  const configured = process.env.APP_URL || process.env.APP_BASE_URL;
  if (configured) return configured.replace(/\/+$/, '');
  // req.protocol honours X-Forwarded-Proto only from the trusted proxy; the raw
  // forwarded headers this read were whatever the client sent.
  return `${req.protocol}://${req.get('host') ?? 'localhost'}`;
}

/**
 * The disclosure policy the Policy field points at. SECURITY.md is the policy;
 * it is served here when the repository file is present (a checkout, the
 * builder stage) and, in a runtime image that ships only dist/ and server/,
 * as the reporting section reproduced below. Read once per process.
 *
 * Until 2026-09-25 the field pointed at `${base}/SECURITY.md`, a URL nothing
 * served (INF-32).
 */
const POLICY_FALLBACK = [
  '# Security Policy — Concept2Cure.RI',
  '',
  '## Reporting a Vulnerability',
  '',
  'Do not create a public issue for a security vulnerability.',
  `Email ${SECURITY_CONTACT} with a description, steps to reproduce, the potential impact and any suggested fix.`,
  '',
  'Acknowledgment within 48 hours; initial assessment within 5 business days; resolution by severity',
  '(Critical 24-72 hours, High 1-2 weeks, Medium 2-4 weeks, Low next release cycle).',
  '',
  'The full policy, the security measures in place and the known gaps are published as SECURITY.md in the',
  'product repository, together with the independent audit at docs/security/SECURITY_AUDIT_2026-09-24.md.',
  '',
].join('\n');

let policyText: string | null = null;
function securityPolicyText(): string {
  if (policyText !== null) return policyText;
  try {
    const fromRepo = fs.readFileSync(path.resolve(process.cwd(), 'SECURITY.md'), 'utf8');
    policyText = /Reporting a Vulnerability/i.test(fromRepo) ? fromRepo : POLICY_FALLBACK;
  } catch {
    policyText = POLICY_FALLBACK;
  }
  return policyText;
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
    `Policy: ${base}/.well-known/security-policy`,
    '',
  ].join('\n');

  res.type('text/plain').send(body);
});

/** The policy security.txt points at, served as text (RFC 9116 §2.5.15). */
router.get('/security-policy', (_req: Request, res: Response) => {
  res.setHeader('Cache-Control', 'public, max-age=3600');
  res.type('text/markdown; charset=utf-8').send(securityPolicyText());
});

export default router;
