/**
 * Contract: no surface may depend on a `window.*` global that nothing assigns.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Six ui-v2 surfaces reached for `window.C2C_API` — the design kit's global
 * fetch bridge. Measured across the whole repository: 12 reads, ZERO writes. Not
 * in index.html, not via a vite `define`, not anywhere. So every action behind it
 * silently did nothing:
 *
 *   LicensingSurface.tsx  4 billing methods, all taking `: Promise.reject(new
 *                         Error('offline'))` — Stripe checkout and the customer
 *                         portal have never been reachable from this surface
 *   AnaVerbs.tsx:244      `api?.connected?.()` optional-chained to undefined.
 *                         Note this one had TWO dead dependencies: its sibling
 *                         `authoring?.streamDraft` reads window.C2C_AUTHORING,
 *                         also never assigned. Porting C2C_API fixes one blocker,
 *                         not the path — see FENCED below.
 *   PdevInd.tsx           (retired) originally read `typeof api.post === 'function'`
 *                         which was never true → returned the PDEV_DRAFT fixture
 *                         without asking the server. Superseded by the Phase 7
 *                         PDEV kit at client/src/concept2cure/pdev/ which fetches
 *                         through useFetchJson (never touched the ghost).
 *   ReportEngine.tsx:272  always fell through to the local analyzer
 *   EctdCoauthor.tsx:203  returned null before issuing a request, and the panel
 *                         reported "unavailable" for a reason unrelated to the server
 *   AnaMemory.tsx:140     the verify POST never fired — and the toast said
 *                         "Verified" regardless
 *
 * This is the same shape as the rest of this change set: a control wired to
 * nothing, whose output nobody can act on. It is worse than a missing feature
 * because the fallback path makes it look deliberate.
 *
 * ── The same defect wearing a storage key ─────────────────────────────────────
 * A ghost does not have to live on `window`. Three "Open in editor" buttons
 * (Biostatistics, ReportEngine, CmcModule) wrote `{title, md}` into
 * localStorage['c2c_biostat_doc'] and navigated to `document-authoring`. Nothing
 * has ever read that key — no getItem, in any file, in any commit — so the named
 * document never travelled and the editor opened on whatever it would have
 * opened on anyway. Two of the three also toasted "opened in editor" for that
 * non-event (deleted in f018695, leaving a button that navigated and claimed
 * nothing).
 *
 * That key is now gone, and the buttons do the work the note was pretending to
 * do: POST /api/authoring/docs, POST /api/authoring/sections with the markdown
 * body, and only then navigate — the same two endpoints AuthoringCreateExport
 * already uses. ELIMINATED_STORAGE below keeps the shortcut from coming back;
 * the `hands off through the governed store` block keeps the POSTs from being
 * deleted while the navigation stays.
 *
 * ── The boundary of this contract, stated plainly ─────────────────────────────
 * Everything here is guaranteed by NAME. `readersOf` is only ever called with
 * keys from the lists below, so a channel nobody has listed — a new
 * `window.C2C_DOC`, say — is invisible to this file until someone adds it. That
 * is why the "Open in editor" fix introduces NO runtime channel at all: the
 * editor already selects the most recently updated draft in scope (GET
 * /api/authoring/docs orders by d.updated_at DESC; DocumentAuthoring's loadDocs
 * takes the first row), so a document created a moment earlier is the one it
 * opens. A sender that wrote an id nothing consumed would be the original defect
 * again, and this contract could not have caught it.
 *
 * ── Why the fix was a port, not a polyfill ────────────────────────────────────
 * Assigning `window.C2C_API` would have been the smaller diff and the wrong one.
 * dataConnect.tsx's own header states the rule: the kit's global "collapses onto"
 * apiRequest + getAuthToken on port — "do not introduce a second fetch
 * convention" (INSTALL_TARGET_AUDIT §4). The surfaces still reading it were
 * un-ported leftovers. EctdCoauthor proved it: its compliance read had already
 * been ported to liveGetOrNull while its validate action still called the ghost,
 * both in one file.
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const CLIENT = path.join(REPO_ROOT, 'client/src');

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== 'node_modules' && e.name !== '__tests__') out.push(...walk(full));
    } else if (/\.(ts|tsx)$/.test(e.name) && !/\.(test|spec)\.tsx?$/.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

/** Source with comments stripped — the fix keeps comments naming the ghost. */
const codeOf = (p: string) =>
  fs.readFileSync(p, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const FILES = walk(CLIENT);

/**
 * Ghosts that are now fully gone. Any read is a regression.
 */
const ELIMINATED = ['C2C_API', 'C2C_SIGNED'];

/**
 * Ghosts that still exist, confined to files that DECLARE them and degrade
 * honestly. These are not fixed — they are fenced.
 *
 * window.C2C_AUTHORING (streamDraft / batchDraft / saveSection) and
 * window.__C2C_DOC_ID are the design kit's runtime channels. BatchDraft.tsx:7-9
 * declares both in a `declare global` block and states plainly that "the offline
 * fallbacks below stay honest until those modules port". That is scaffolding
 * that tells the truth, which is different in kind from C2C_API, whose call
 * sites presented it as a working bridge.
 *
 * Porting them needs a real streaming provider and the batch-draft/accept
 * endpoints wired end to end — a separate change. What this test guarantees
 * meanwhile is that the blast radius cannot grow: exactly these files, no more.
 * Shrink the list when a channel is ported; never extend it.
 */
const FENCED: Record<string, string[]> = {
  /* BatchDraft left this fence. Its `window.C2C_AUTHORING.batchDraft` branch
     was the offline path that FABRICATED regulatory prose when the drafting
     service was unreachable — and the channel is assigned nowhere in this
     repository, so that branch was dead in every build while still being the
     second caller of the fabricator. Both went. The file's remaining mentions
     are comments recording that, which `codeOf` strips.

     A fence must shrink when a reader leaves, or it stops describing anything:
     the entry that outlives its reader silently re-authorises the next one. */
  C2C_AUTHORING: ['client/src/concept2cure/v2/surfaces/AnaVerbs.tsx'],
  /* `__C2C_DOC_ID` has no readers at all now, so it is not fenced — it is
     GONE, and `ghosts that stay gone` below is what holds it there. */
};

/**
 * Storage keys that are now fully gone. A write is as much a regression as a
 * read: the whole point of retiring `c2c_biostat_doc` is that a write with no
 * reader is a lie about where the user's work went.
 */
const ELIMINATED_STORAGE = ['c2c_biostat_doc'];

const storageUsesOf = (key: string, verb: 'setItem' | 'getItem') =>
  FILES.filter(f =>
    new RegExp(`(?:local|session)Storage\\.${verb}\\(\\s*['"\`]${key}['"\`]`).test(codeOf(f)),
  ).map(f => path.relative(REPO_ROOT, f)).sort();

const readersOf = (ghost: string) =>
  FILES.filter(f => {
    const code = codeOf(f);
    return new RegExp(`window[^\\n]{0,20}\\.${ghost}\\b`).test(code)
      || new RegExp(`\\bwindow\\.${ghost}\\b`).test(code)
      || new RegExp(`\\b${ghost}\\?:`).test(code);
  }).map(f => path.relative(REPO_ROOT, f)).sort();

describe('the client walker sees the real tree', () => {
  it('found a substantial number of source files', () => {
    expect(FILES.length).toBeGreaterThan(200);
  });

  it('includes the surfaces that carried the defect', () => {
    // PdevInd.tsx was retired alongside the Phase 7 PDEV kit landing at
    // client/src/concept2cure/pdev/. That kit uses useFetchJson and never
    // touched the ghost, so the guarantee holds by construction.
    for (const name of [
      'LicensingSurface.tsx', 'ReportEngine.tsx',
      'EctdCoauthor.tsx', 'AnaMemory.tsx', 'AnaVerbs.tsx',
    ]) {
      expect(FILES.some(f => f.endsWith(name)), `${name} not walked`).toBe(true);
    }
  });
});

describe('eliminated ghosts stay eliminated', () => {
  it.each(ELIMINATED)('%s has no remaining reads anywhere', (ghost) => {
    const readers = readersOf(ghost);
    expect(readers, `${ghost} is read again by: ${readers.join(', ')}`).toEqual([]);
  });

  it.each(ELIMINATED)('%s is not assigned either — it stays a non-thing', (ghost) => {
    // If someone later decides the global IS the right answer, they must remove
    // it from ELIMINATED deliberately rather than reintroduce the split-brain.
    const writers = FILES.filter(f =>
      new RegExp(`\\.${ghost}\\s*=[^=]`).test(codeOf(f)),
    ).map(f => path.relative(REPO_ROOT, f));
    expect(writers).toEqual([]);
  });
});

describe('eliminated storage notes stay eliminated', () => {
  it.each(ELIMINATED_STORAGE)('%s is never written', (key) => {
    const writers = storageUsesOf(key, 'setItem');
    expect(writers, `${key} is written again by: ${writers.join(', ')}`).toEqual([]);
  });

  it.each(ELIMINATED_STORAGE)('%s is never read either — it stays a non-thing', (key) => {
    // It never had a reader. Adding one would resurrect the shortcut instead of
    // the handoff: a document that exists only in this browser's localStorage is
    // not in the governed store, has no revision, and no audit row.
    const readers = storageUsesOf(key, 'getItem');
    expect(readers, `${key} is read by: ${readers.join(', ')}`).toEqual([]);
  });
});

describe('the "Open in editor" buttons hand off through the governed store', () => {
  /*
   * The reverse regression this guards: deleting the POSTs and keeping the
   * navigation gives back a button that changes screens and saves nothing. A
   * surface must create the document AND the section that holds its markdown —
   * a document with no section is an empty file with a title.
   *
   * This used to grep each surface for the two URL literals. That check was
   * tied to the duplication rather than to the property: the sequence lived
   * three times, so it asserted the strings appeared three times. Now that it
   * lives once in `authoringHandoff.ts`, the same assertion would demand the
   * copies be put back.
   *
   * So it is split. The URLs are checked where they are; the surfaces are
   * checked for the thing that actually protects the user's work — that they
   * route through the shared handoff and do NOT navigate unless it succeeded.
   * `authoringHandoff.spec.ts` covers the failure semantics behaviourally, with
   * a mocked transport, which is a stronger check than any source scan.
   */
  const HANDOFF = 'client/src/concept2cure/v2/authoringHandoff.ts';
  const senders = [
    'client/src/concept2cure/v2/surfaces/Biostatistics.tsx',
    'client/src/concept2cure/v2/surfaces/ReportEngine.tsx',
    'client/src/concept2cure/v2/surfaces/CmcModule.tsx',
  ];

  it('the shared handoff POSTs a document and a section', () => {
    const code = codeOf(path.join(REPO_ROOT, HANDOFF));
    expect(code, 'the handoff navigates to the editor without creating a document')
      .toMatch(/'\/api\/authoring\/docs'/);
    expect(code, 'the handoff creates a document but never a section to hold the text')
      .toMatch(/'\/api\/authoring\/sections'/);
  });

  it.each(senders)('%s hands off through saveToAuthoring', (file) => {
    const code = codeOf(path.join(REPO_ROOT, file));
    expect(code, `${file} no longer routes its "Open in editor" through the governed handoff`)
      .toMatch(/\bsaveToAuthoring\s*\(/);
  });

  it.each(senders)('%s does not navigate when the handoff failed', (file) => {
    const code = codeOf(path.join(REPO_ROOT, file));
    // The early return on a failed handoff. Without it the surface would send
    // the user to an editor holding a document whose text never saved — the
    // exact way work gets lost, and the reason the result is a union rather
    // than a thrown error.
    expect(
      code,
      `${file} calls saveToAuthoring but has no early return on failure — ` +
        'it can navigate away from unsaved work',
    ).toMatch(/if\s*\(\s*!\s*\w+\.ok\s*\)/);
  });
});

describe('fenced ghosts cannot spread', () => {
  it.each(Object.keys(FENCED))('%s is read only where it is declared', (ghost) => {
    const readers = readersOf(ghost);
    const allowed = [...FENCED[ghost]].sort();
    const escaped = readers.filter(r => !allowed.includes(r));
    expect(escaped, `${ghost} escaped its fence into: ${escaped.join(', ')}`).toEqual([]);
  });

  it.each(Object.keys(FENCED))('%s is still assigned nowhere', (ghost) => {
    const writers = FILES.filter(f =>
      new RegExp(`window[^\\n]{0,20}\\.${ghost}\\s*=[^=]`).test(codeOf(f)),
    ).map(f => path.relative(REPO_ROOT, f));
    // Fencing is not a fix. If this ever becomes non-empty the channel was
    // provided, and the ghost should move out of FENCED entirely.
    expect(writers).toEqual([]);
  });

  /* Was: "BatchDraft still says out loud that these are unported", asserting
     the file carried a disclosure sentence. That assertion was correct while
     BatchDraft READ a ghost it could not provide. It no longer does, so the
     sentence would now be a disclosure about nothing — and a gate satisfied by
     a comment is satisfied by deleting the code and keeping the comment.

     What replaces it is the stronger statement the change actually earned. */
  it('BatchDraft reads no ghost channel at all', () => {
    const code = codeOf(
      path.join(REPO_ROOT, 'client/src/concept2cure/v2/surfaces/BatchDraft.tsx'),
    );
    for (const ghost of ['C2C_AUTHORING', '__C2C_DOC_ID']) {
      expect(code, `BatchDraft is reading ${ghost} again`).not.toMatch(
        new RegExp(`\\b${ghost}\\b`),
      );
    }
  });

  it('__C2C_DOC_ID is read nowhere, so it needs no fence', () => {
    expect(readersOf('__C2C_DOC_ID')).toEqual([]);
  });
});

describe('the ported surfaces use the sanctioned convention', () => {
  const ported: ReadonlyArray<[file: string, needle: RegExp]> = [
    ['client/src/concept2cure/v2/surfaces/LicensingSurface.tsx', /liveMutateOrNull</],
    // PdevInd.tsx retired — Phase 7 PDEV kit at client/src/concept2cure/pdev/
    // is the source of truth and uses useFetchJson; no shim required.
    ['client/src/concept2cure/v2/surfaces/ReportEngine.tsx', /liveMutateOrNull</],
    ['client/src/concept2cure/v2/surfaces/EctdCoauthor.tsx', /liveMutateOrNull</],
    ['client/src/concept2cure/v2/surfaces/AnaMemory.tsx', /liveMutateOrNull\(/],
    ['client/src/concept2cure/v2/surfaces/AnaVerbs.tsx', /\bconnected\(\)/],
  ];

  it.each(ported)('%s goes through dataConnect', (file, needle) => {
    expect(codeOf(path.join(REPO_ROOT, file))).toMatch(needle);
  });

  it('liveMutateOrNull exists and returns null rather than a fixture', () => {
    const dc = fs.readFileSync(
      path.join(REPO_ROOT, 'client/src/concept2cure/v2/dataConnect.tsx'), 'utf8',
    );
    expect(dc).toMatch(/export async function liveMutateOrNull</);
    // A failed mutation must not be indistinguishable from a successful one.
    const fn = dc.slice(dc.indexOf('export async function liveMutateOrNull'));
    expect(fn.slice(0, 900)).toMatch(/data:\s*null/);
  });

  it('AnaMemory reports what actually happened instead of always claiming success', () => {
    // The old line fired "Verified — AnA will weight this memory more."
    // unconditionally, including when the POST never left the browser.
    const code = codeOf(path.join(REPO_ROOT, 'client/src/concept2cure/v2/surfaces/AnaMemory.tsx'));
    expect(code).toMatch(/Could not verify/);
  });
});
