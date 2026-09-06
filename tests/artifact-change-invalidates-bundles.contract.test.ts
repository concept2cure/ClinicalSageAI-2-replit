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
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

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
    // Prospective guards, not evidence of this change: the route file has never
    // cleared a bundle or bumped a revision by hand, and must not start.
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

/* ─── The census of writers ──────────────────────────────────────────
 *
 * `concept2cure_artifacts.content`, `.title`, `.version` and `.ctd_section` are
 * exactly the columns a bundle's content fingerprint covers, and they are
 * written from more places than the four routes above. Every one of those
 * writers is safe at transmit — governed transmit recomputes the fingerprint
 * from the database and refuses a bundle the package has moved past, whichever
 * code changed it. What differs is WHEN the operator finds out: a wired writer
 * invalidates at the edit, a baselined one is caught at the transmit gate.
 *
 * This census makes that set explicit and closed. A new writer of those columns
 * fails here until it is either wired to the canonical invalidation or added to
 * BACKSTOP_ONLY with the same deliberate choice — so the honest limit stated in
 * docs/runbooks/ectd-transmit-path.md cannot quietly grow.
 */

/** Writers that invalidate at write time (the human-facing artifact routes). */
const WIRED_FILES = [
  'server/routes/c2c/artifacts.ts',
  'server/routes/c2c/haq-sessions.ts',
  'server/services/ai-actions/handlers/refine-with-validation.ts',
];

/**
 * Writers that rely on the transmit-time fingerprint backstop. Wiring these
 * would mean threading the artifact row id, the org and a cause through nine
 * subsystems; the guarantee that no drifted bundle ships holds either way, so
 * they are listed rather than swept. The list may shrink, never grow silently.
 */
const BACKSTOP_ONLY = [
  // GDPR Art.17 erasure, org-wide by author. It must complete as a legal
  // obligation whatever else is stored, and the fingerprint gate then refuses
  // every bundle built from an erased artifact — which is the required
  // outcome, not a degraded one.
  'server/routes/global-compliance.ts',
  'server/services/ana-ri/command-executor.ts',
  'server/services/ana/AnaToolExecutor.ts',
  'server/services/ana/artifactVersionStore.ts',
  'server/services/ana/document-spine.ts',
  'server/services/ana/submission-chat-apply-rewrite.ts',
  'server/services/artifact-tagger.ts',
  'server/services/module3-convergence-service.ts',
];

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === '__tests__' || entry.startsWith('.')) continue;
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.ts$/.test(entry) && !/\.test\.ts$/.test(entry)) out.push(p);
  }
  return out;
}

/** Files that assign a fingerprint-covered column of concept2cure_artifacts. */
function censusOfWriters(): string[] {
  const found = new Set<string>();
  const UPDATE_FORMS = /UPDATE\s+concept2cure_artifacts|\.update\((?:schema\.)?concept2cureArtifacts\)/g;
  // Raw SQL `content = $1`, drizzle `content: value` — version bumps included.
  const COVERED = /(?:\bcontent\s*=|\btitle\s*=|\bversion\s*=|\bctd_section\s*=|^\s*content\s*:|^\s*title\s*:|^\s*version\s*:|^\s*ctdSection\s*:)/m;
  for (const file of walk(join(process.cwd(), 'server'))) {
    const src = readFileSync(file, 'utf8');
    for (const m of src.matchAll(UPDATE_FORMS)) {
      // The statement body: everything up to the WHERE / .where( that ends it.
      const after = src.slice(m.index!, m.index! + 900);
      const body = after.split(/\bWHERE\b|\.where\(/)[0];
      if (COVERED.test(body)) { found.add(relative(process.cwd(), file)); break; }
    }
  }
  return [...found].sort();
}

describe('every writer of a fingerprint-covered artifact column is accounted for', () => {
  it('is exactly the wired routes plus the baselined backstop-only writers', () => {
    const census = censusOfWriters();
    const accounted = new Set([...WIRED_FILES, ...BACKSTOP_ONLY]);
    const unaccounted = census.filter((f) => !accounted.has(f));
    expect(
      unaccounted,
      'A new writer of concept2cure_artifacts.{content,title,version,ctd_section} changes what an ' +
        'assembled bundle was built from. Either call markPackagesContentChangedForArtifact ' +
        '(services/ectd/package-content-change) so packages are invalidated at the edit, or add the ' +
        'file to BACKSTOP_ONLY here to record that it relies on the transmit-time content fingerprint.',
    ).toEqual([]);

    // The baseline may only shrink: a listed file that no longer writes those
    // columns must be removed from the list, not left as cover for a new one.
    const stale = BACKSTOP_ONLY.filter((f) => !census.includes(f));
    expect(stale, 'BACKSTOP_ONLY lists files that no longer write those columns; remove them').toEqual([]);
    expect(WIRED_FILES.every((f) => census.includes(f))).toBe(true);
  });
});
