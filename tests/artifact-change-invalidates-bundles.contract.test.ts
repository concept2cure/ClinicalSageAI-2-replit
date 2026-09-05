/**
 * Every artifact route that changes what a submission bundle was built FROM
 * must invalidate the packages the artifact is mapped into.
 *
 * A stored bundle is derived state: the zip embeds the artifact's text, its
 * title and version (the index.xml leaf title and the PDF heading) and files it
 * at its declared CTD section. Editing any of those through the artifact routes
 * changes nothing on a package row, so without an explicit invalidation the
 * package kept offering a zip built from superseded content until the transmit
 * gate recomputed the content fingerprint.
 *
 * What this pins is the WIRING — that each mutating route calls the canonical
 * invalidation, with the cause an auditor would need. The behaviour of that
 * invalidation (what it clears, what it records, how it reports a failure) is
 * proven in server/services/ectd/__tests__/package-content-change.test.ts, and
 * the transmit-time backstop in
 * tests/mdx-submission-gateway-transmit-bundle-guard.test.ts. A route added
 * later that changes artifact content and is not listed here is exactly what
 * this test cannot see — the fingerprint gate remains the catch-all.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const SRC = readFileSync(join(process.cwd(), 'server/routes/c2c/artifacts.ts'), 'utf8');

/** The mutating routes, and the cause each records. */
const WIRED: Array<{ route: string; anchor: RegExp; cause: 'content' | 'placement' | 'rollback' }> = [
  { route: "PUT /projects/:projectId/artifacts/:artifactId", anchor: /router\.put\('\/projects\/:projectId\/artifacts\/:artifactId'/, cause: 'content' },
  { route: "PUT .../artifacts/:artifactId/placement", anchor: /'\/projects\/:projectId\/artifacts\/:artifactId\/placement'/, cause: 'placement' },
  { route: "PUT .../artifacts/:artifactId/ctd-section", anchor: /'\/projects\/:projectId\/artifacts\/:artifactId\/ctd-section'/, cause: 'placement' },
  { route: "POST .../artifacts/:artifactId/rollback", anchor: /'\/projects\/:projectId\/artifacts\/:artifactId\/rollback'/, cause: 'rollback' },
];

/** The source of a route handler: from its anchor to the next router.<verb>(. */
function handlerSource(anchor: RegExp): string {
  const start = SRC.search(anchor);
  expect(start, `route anchor ${anchor} not found in artifacts.ts`).toBeGreaterThan(-1);
  const rest = SRC.slice(start + 1);
  const next = rest.search(/\nrouter\.(get|put|post|patch|delete)\(/);
  return next === -1 ? rest : rest.slice(0, next);
}

describe('artifact routes invalidate the bundles built from what they change', () => {
  it('imports the CANONICAL invalidation, not a local copy of the rule', () => {
    expect(SRC).toMatch(
      /import \{ markPackagesContentChangedForArtifact \} from '\.\.\/\.\.\/services\/ectd\/package-content-change'/,
    );
    // No second implementation: the route file must not clear a bundle or bump
    // a revision by hand.
    expect(SRC).not.toMatch(/contentRevision/);
    expect(SRC).not.toMatch(/c2c_submission_packages/);
  });

  for (const { route, anchor, cause } of WIRED) {
    it(`${route} invalidates every package the artifact is mapped into, with cause '${cause}'`, () => {
      const body = handlerSource(anchor);
      expect(body).toMatch(/markPackagesContentChangedForArtifact\(/);
      const call = body.match(/markPackagesContentChangedForArtifact\([\s\S]{0,200}?\)\s*;/)?.[0] ?? '';
      expect(call).toMatch(new RegExp(`cause:\\s*'${cause}'`));
      // The org and the acting person are named — the audit row is written
      // against the package, and it must say who.
      expect(call).toMatch(/organizationId/);
      expect(call).toMatch(/userId/);
      // The outcome reaches the caller rather than being discarded: an
      // invalidation that failed must not read as a clean edit.
      expect(body).toMatch(/bundleInvalidation/);
    });
  }
});
