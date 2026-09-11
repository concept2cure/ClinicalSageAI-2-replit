/**
 * WO-16C finding 63 — GET /api/regulatory/risk/:sectionId answered a
 * regulatory deficiency verdict about a section it never read.
 *
 * Both handlers (`/risk/:sectionId` and its verbatim duplicate
 * `/regulatory/risk/:sectionId`) loaded no section content. They passed the
 * literal two-word string `Section <id>` — plus a hardcoded 'Phase 2' — into
 * `RegulatoryIntelligenceService.analyzeProtocolCompliance`, whose screen is a
 * substring match of keyword phrases pulled from each requirement. No
 * requirement text contains the token "section", so every requirement scored
 * non-compliant and every caller, for every sectionId, received the identical
 * maximal deficiency report: all 11 mandatory Phase 2 requirements under
 * "CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION:" with agency, guideline and
 * document reference. The METHOD paragraph disclaimed the heuristic; nothing
 * disclosed that the input was a placeholder rather than the section.
 *
 * No section-content source is wired to this router and no caller exists
 * (zero hits in client/src, no test pinned the route), so there is no truthful
 * version to relabel into: the surface is removed rather than captioned.
 *
 * No failure is injected here — the defect was a hardcoded placeholder, not a
 * swallowed dependency error. The real service therefore runs unmocked, so on
 * the pre-fix head the assertions below saw the genuine fabricated payload
 * (200 + "CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION:") instead of a 404.
 */
import express from 'express';
import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../middleware/auth.js', () => ({
  authenticate: (req: any, _res: any, next: any) => {
    req.user = { id: 1, organizationId: 1, role: 'admin' };
    next();
  },
}));

vi.mock('../../db', () => ({
  db: { select: vi.fn(), insert: vi.fn() },
}));

vi.mock('@shared/schema', () => ({
  regulatoryCalendar: {},
  regulatorySubmissions: {},
}));

async function app() {
  const router = (await import('../regulatoryRoutes')).default;
  const a = express();
  a.use(express.json());
  a.use('/api/regulatory', router);
  return a;
}

const FABRICATION_MARKERS = [
  'CRITICAL ISSUES REQUIRING IMMEDIATE ATTENTION',
  'Regulatory Requirement Screen',
  'RECOMMENDED IMPROVEMENTS',
  'SCREEN SUMMARY',
];

describe('regulatory risk-by-section screen (WO-16C #63)', () => {
  for (const routePath of ['/api/regulatory/risk/3', '/api/regulatory/regulatory/risk/3']) {
    it(`GET ${routePath} does not answer a screen for a section it never read`, async () => {
      const res = await request(await app()).get(routePath);

      expect(res.status).toBe(404);
      const body = typeof res.text === 'string' ? res.text : JSON.stringify(res.body);
      for (const marker of FABRICATION_MARKERS) {
        expect(body).not.toContain(marker);
      }
    });
  }

  it('a sectionId that collides with requirement vocabulary gets no screen either', async () => {
    // Pre-fix, `/risk/consent` flipped exactly one requirement to "compliant"
    // because the placeholder happened to contain a requirement keyword — a
    // spurious pass on text that was never read.
    const res = await request(await app()).get('/api/regulatory/risk/consent');

    expect(res.status).toBe(404);
    expect(res.text ?? '').not.toContain('Requirement appears to be addressed');
  });

  it('the router no longer screens a placeholder through analyzeProtocolCompliance', () => {
    // Comment lines are stripped first: the removal is documented in place,
    // and that note names both the call and the placeholder it used to pass.
    const code = fs
      .readFileSync(path.resolve(__dirname, '../regulatoryRoutes.ts'), 'utf8')
      .split('\n')
      .filter(line => !line.trim().startsWith('//'))
      .join('\n');

    expect(code).not.toContain('analyzeProtocolCompliance');
    expect(code).not.toContain('Section ${sectionId}');
    expect(code).not.toContain("risk/:sectionId");
  });
});
