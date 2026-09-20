/**
 * The audit-outcome headers must be readable by the client they were added for.
 *
 * WO-16C #133. Five conversions in this work report the §11.10(e) outcome ONLY
 * through response headers, because their handlers had nowhere else to put it:
 *
 *   server/routes/predicate-intelligence.ts  a transparent proxy — the body is the
 *                                            upstream payload, forwarded verbatim
 *   server/routes/submissions.ts             DELETE …/leaves/:leafId answers 204
 *   server/routes/device-projects.ts         "
 *   server/routes/ivd-assessments.ts         "
 *   server/routes/client-branding.ts         three sites
 *
 * A reviewer of the client-branding conversion found the hole: `corsMiddleware`
 * sets `Access-Control-Expose-Headers` to `X-Request-Id, X-RateLimit-Remaining`,
 * and `config.allowedOrigins` explicitly admits separate app origins
 * (app.trialsage.com, app.concept2cure-ri.ai, app.clinicalsage.ai). For a browser
 * client on one of those calling the API host, `res.headers.get(...)` on anything
 * outside the expose list returns null. The header reached Express and stopped
 * there — so those five conversions were, for the consumer class they were written
 * for, exactly as observable as the discarded `await auditService.logAction(…)`
 * they replaced. Carried and then dropped, with the drop in the CORS layer.
 *
 * This pins the expose list so the same silence cannot come back by omission.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(__dirname, '../../..');

/**
 * Every header this repository uses to carry an audit-write OUTCOME to a browser.
 *
 * Deliberately narrower than "every X-Audit-* header". `X-Audit-Next-Cursor`
 * (server/routes/admin/audit-siem.ts:152) is the pagination cursor for the SIEM
 * feed, whose documented consumers are server-side log shippers — Splunk,
 * Microsoft Sentinel, Elastic, Vector, Filebeat. Those are not subject to CORS,
 * so leaving it unexposed is correct, and adding it would imply a browser
 * consumer that does not exist. The `X-Audit-Row-*` pair is different: its
 * consumer class IS the browser, which is the whole reason the second test below
 * exists.
 *
 * `X-Audit-Row-Count` shares the prefix and is NOT one of these either: it is one
 * of five integrity headers on GET /api/audit/export
 * (audit-trail-routes.ts:557-563, alongside X-Audit-Export-Id, X-Audit-Data-Hash,
 * X-Audit-Signature and X-Audit-Chain-Status) that carry a signed export's
 * manifest with the download. None of the five is exposed, and that is not
 * currently a defect: no browser client calls that route. The surface that
 * downloads a signed export calls /api/audit/export/signed instead
 * (AdminSurfaces.tsx:915), which returns the manifest and signature in the JSON
 * BODY. Worth knowing if a browser consumer of /audit/export is ever added — the
 * manifest would silently stop travelling with it.
 */
const AUDIT_OUTCOME_HEADERS = ['X-Audit-Row-Persisted', 'X-Audit-Row-Code'];

function exposeList(): string[] {
  const src = readFileSync(path.join(ROOT, 'server/middleware/enterprise-security.ts'), 'utf8');
  const m = /Access-Control-Expose-Headers['"]\s*,\s*['"]([^'"]+)['"]/.exec(src);
  expect(m, 'corsMiddleware no longer sets Access-Control-Expose-Headers').toBeTruthy();
  return m![1].split(',').map(s => s.trim()).filter(Boolean);
}

describe('Access-Control-Expose-Headers covers the audit-outcome carriers', () => {
  it('exposes every audit-outcome header', () => {
    const exposed = exposeList();
    for (const h of AUDIT_OUTCOME_HEADERS) {
      expect(
        exposed,
        `${h} is set by route handlers but not exposed, so a cross-origin browser client cannot read it`,
      ).toContain(h);
    }
  });

  it('every audit-outcome header actually set by a route is in the list above', () => {
    // Guards the other direction: a new carrier added in a handler and not added
    // here would pass the first test vacuously.
    const { execSync } = require('node:child_process') as typeof import('node:child_process');
    // `-- server/routes` rather than a `**` glob: git grep does not expand the
    // glob here and silently matched nothing, which made this test pass
    // vacuously the first time it ran.
    const hits = execSync(
      String.raw`git grep -ohE "set(Header)?\('X-Audit-Row-(Persisted|Code)'" -- server/routes || true`,
      { cwd: ROOT, encoding: 'utf8' },
    );
    const used = new Set(
      [...hits.matchAll(/'(X-Audit-Row-(?:Persisted|Code))'/g)].map(m => m[1]),
    );
    expect(
      used.size,
      'no X-Audit-Row-* header found in server/routes — has the outcome carrier been renamed?',
    ).toBeGreaterThan(0);
    for (const h of used) {
      expect(AUDIT_OUTCOME_HEADERS, `${h} is used by a route but not listed in this test`).toContain(h);
    }
  });
});
