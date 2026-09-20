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

  /*
   * WO-16C #63, follow-up review: the previous version of this test asserted
   *
   *     expect(res.text ?? '').not.toContain('Requirement appears to be addressed');
   *
   * and could not fail on any head. `analyzeProtocolCompliance` computes that
   * `reason` string per requirement and never appends it to `analysisText` —
   * measured on the real service, the phrase is absent from the returned screen
   * for every input. So the assertion pinned a string the route never emitted,
   * on top of a 404 that already made the body Express's own error page. A
   * check that cannot fail is not coverage.
   *
   * What the collision actually changed IS in the payload, and is what the two
   * tests below pin: the SCREEN SUMMARY's matched count. Measured against the
   * real service with the exact placeholder the deleted handler passed
   * (`Section <id>`, 'Phase 2'), over its 14 Phase 2 requirements:
   *
   *     Section 3           -> matched 0
   *     Section consent     -> matched 1
   *     Section safety      -> matched 1
   *     Section monitoring  -> matched 0
   *
   * `extractKeyPhrases` also emits every single word longer than five
   * characters as a phrase, so a sectionId that happens to be requirement
   * vocabulary scores a match against text nobody read — the same screen,
   * differing only by the id in the URL.
   */
  it('the placeholder screen really did score a match on a colliding id', async () => {
    // Not a test of the route — a test of the claim the route's removal rests
    // on. If this stops holding, the two assertions below stop meaning
    // anything, and this is where that shows up.
    const { RegulatoryIntelligenceService } = await import('../../services/regulatory-intelligence-service');
    const svc = new RegulatoryIntelligenceService();
    const screen = (sectionId: string) =>
      (svc as unknown as {
        analyzeProtocolCompliance(t: string, p: string): Promise<string>;
      }).analyzeProtocolCompliance(`Section ${sectionId}`, 'Phase 2');
    const matched = async (sectionId: string) => {
      const m = /matching language detected: (\d+)/.exec(await screen(sectionId));
      return m ? Number(m[1]) : -1;
    };

    expect(await matched('3')).toBe(0);
    expect(await matched('consent')).toBe(1);

    // And the markers the route assertions below look for are strings this
    // screen really produces — which is what makes those `not.toContain`
    // assertions falsifiable rather than decorative. The phrase the previous
    // version of this test pinned is NOT among them.
    const real = await screen('consent');
    for (const marker of ['SCREEN SUMMARY', 'matching language detected', 'Requirements checked']) {
      expect(real, `the service does emit ${marker}`).toContain(marker);
    }
    expect(real).not.toContain('Requirement appears to be addressed');
  });

  it('a sectionId that collides with requirement vocabulary gets no screen either', async () => {
    const res = await request(await app()).get('/api/regulatory/risk/consent');

    expect(res.status).toBe(404);
    const body = typeof res.text === 'string' ? res.text : JSON.stringify(res.body);
    // The strings a screen genuinely emits — including the summary line whose
    // count the collision moved. Each of these appears in the service's real
    // output, so each of these assertions can fail.
    expect(body).not.toContain('SCREEN SUMMARY');
    expect(body).not.toContain('matching language detected');
    expect(body).not.toContain('Requirements checked');
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
