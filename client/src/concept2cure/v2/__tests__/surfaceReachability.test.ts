/**
 * Every registered surface is reachable from somewhere.
 *
 * ── The defect this pins against ─────────────────────────────────────────────
 *
 * `navigationReachability.test.ts` checks one direction: every governed
 * navigation target lands on a real surface. Nothing checked the other — a
 * surface registered in SURFACE_VIEWS that no rail entry, menu item, alias or
 * link ever names. It renders correctly, it is fully tested, and no human can
 * get to it.
 *
 * That is not hypothetical. The org-admin access-request queue shipped exactly
 * like this: `AccessRequests.tsx` was written, registered and covered by its own
 * suite, while the only instruction pointing at it — the lock panel's "ask an
 * administrator" — led to a queue the administrator had no way to open. The
 * member's request was recorded and nobody could ever see it. Every existing
 * test passed.
 *
 * ── What "reachable" means here, and why a plain string search was not it ────
 *
 * The first version of this gate counted the id as reachable if it appeared
 * anywhere in the client outside its own registration. It passed, and it was
 * worthless: removing the account-menu entry — recreating the exact orphan
 * described above — did not fail it, because `MasterLicensing.tsx` happens to
 * name a TAB `access-requests` and that unrelated string satisfied the search.
 * A gate satisfied by a coincidence is a gate that reports safety it has not
 * checked.
 *
 * So a reference only counts in a NAVIGATION-SHAPED position: a menu or rail
 * entry (`to: 'id'`), an explicit navigation call (`onNav('id')` and friends),
 * or a declaration in the shared navigation contract / deep-link alias map.
 * A tab id, an API path fragment, a CSS class or a comment does not.
 *
 * This is still a reference check rather than a route trace — proving a person
 * can actually click through would mean modelling the rail, the palette, the
 * aliases and every call site, and a gate that elaborate goes stale faster than
 * what it guards. It catches the failure that actually happens: somebody adds a
 * surface, registers it, and forgets the one line that puts it in front of a
 * user. References from test files do not count, so a surface reachable only
 * from its own suite is still an orphan.
 */
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const REGISTRATION = 'client/src/concept2cure/v2/surfaceViews.ts';

/**
 * The navigation-shaped occurrences in a file, joined.
 *
 * `to:` covers the account menu and rail entries; the call forms cover a button
 * that navigates directly. Everything else in the file is discarded before the
 * id is looked for, which is what stops an unrelated tab id or an API path from
 * vouching for a surface nothing links to.
 */
const NAV_REFERENCE =
  /\b(?:to|navTo):\s*['"][a-z0-9-]+['"]|\b(?:onNav|goSurface|navigate|setSurface|openSurface)\(\s*['"][a-z0-9-]+['"]/g;

/**
 * Files that DECLARE reachability, where any mention of the id counts.
 *
 * `shared/constants/ui-surface-registry*` is the rail itself — a surface with an
 * entry there is on the navigation, and that is the most common way a surface is
 * reached. Missing it was the first strict version's other bug: it reported
 * `ectd-publishing`, `investigator-brochure` and `labeling-smpc` as orphans when
 * all three sit in the rail.
 */
function isNavDeclaration(file: string): boolean {
  return (
    file.startsWith('shared/navigation/') ||
    file.startsWith('shared/constants/ui-surface-registry') ||
    file.endsWith('registryModel.ts')
  );
}

/**
 * Reachable by a mechanism this syntactic check cannot see, each verified by
 * hand. Listed with the mechanism rather than silently skipped, because an
 * unexplained allowlist is how a real orphan hides.
 */
const REACHED_ANOTHER_WAY: Record<string, string> = {
  // The four workstream surfaces are opened by PdevSurfaces.tsx's workstream
  // cards, which navigate to an id taken from a list rather than written as a
  // literal at the call site.
  'pdev-cmc': 'PdevSurfaces workstream card (computed id)',
  'pdev-clinical': 'PdevSurfaces workstream card (computed id)',
  'pdev-nonclinical': 'PdevSurfaces workstream card (computed id)',
  'pdev-regulatory': 'PdevSurfaces workstream card (computed id)',
  'pdev-contradictions': 'PdevSurfaces workstream card (computed id)',
  'pdev-fda-interactions': 'PdevSurfaces workstream card (computed id)',
  'pdev-ind-assembly': 'PdevSurfaces workstream card (computed id)',
  // Reached by URL, not by an in-app navigation call: client_user /
  // client_admin are redirected to it at sign-in (auth/redirectUtils.ts).
  'client-portal': 'sign-in redirect by role (URL route)',
};

function navReferences(text: string): string {
  return (text.match(NAV_REFERENCE) ?? []).join('\n');
}

describe('surface reachability', () => {
  it('no surface is registered and then named nowhere else', () => {
    const registration = readFileSync(REGISTRATION, 'utf8');
    // An allowlist entry for a surface that no longer exists is dead weight that
    // could later excuse a genuine orphan of the same name.
    const registered = new Set(
      [...registration.matchAll(/^\s*'([a-z0-9-]+)':\s*\{\s*component:/gm)].map((m) => m[1]),
    );
    expect(Object.keys(REACHED_ANOTHER_WAY).filter((id) => !registered.has(id))).toEqual([]);
    const ids = [...registration.matchAll(/^\s*'([a-z0-9-]+)':\s*\{\s*component:/gm)].map(
      (m) => m[1],
    );
    // If the registration shape changes, this must fail loudly rather than
    // silently checking an empty list and reporting success.
    expect(ids.length).toBeGreaterThan(50);

    const files = execSync(
      "git ls-files 'client/src/**/*.ts' 'client/src/**/*.tsx' 'shared/**/*.ts'",
      { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
    )
      .split('\n')
      .filter(Boolean)
      // Its own registration cannot vouch for it, and neither can a test — a
      // surface reachable only from its own suite is still unreachable.
      .filter((f) => f !== REGISTRATION)
      .filter((f) => !/__tests__|\.test\.tsx?$|\.spec\.tsx?$/.test(f));

    const corpus = files
      .map((f) => {
        try {
          const text = readFileSync(f, 'utf8');
          // The shared navigation contract and the deep-link alias map are
          // declarations of reachability by definition, so any mention in them
          // counts. Everywhere else has to look like navigation.
          return isNavDeclaration(f) ? text : navReferences(text);
        } catch {
          return '';
        }
      })
      .join('\n');

    const orphans = ids.filter(
      (id) =>
        !(id in REACHED_ANOTHER_WAY) &&
        !corpus.includes(`'${id}'`) &&
        !corpus.includes(`"${id}"`),
    );

    expect(orphans).toEqual([]);
  });
});
