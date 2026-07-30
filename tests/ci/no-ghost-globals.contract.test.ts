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
 *   PdevInd.tsx:176       `typeof api.post === 'function'` never true → returned
 *                         the PDEV_DRAFT fixture without asking the server
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
  C2C_AUTHORING: [
    'client/src/concept2cure/v2/surfaces/AnaVerbs.tsx',
    'client/src/concept2cure/v2/surfaces/BatchDraft.tsx',
  ],
  __C2C_DOC_ID: ['client/src/concept2cure/v2/surfaces/BatchDraft.tsx'],
};

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
    for (const name of [
      'LicensingSurface.tsx', 'PdevInd.tsx', 'ReportEngine.tsx',
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

  it('BatchDraft still says out loud that these are unported', () => {
    // The fence is only defensible while the file is honest about degrading.
    const raw = fs.readFileSync(
      path.join(REPO_ROOT, 'client/src/concept2cure/v2/surfaces/BatchDraft.tsx'), 'utf8',
    );
    expect(raw).toMatch(/no typed provider yet|until those modules port/i);
  });
});

describe('the ported surfaces use the sanctioned convention', () => {
  const ported: ReadonlyArray<[file: string, needle: RegExp]> = [
    ['client/src/concept2cure/v2/surfaces/LicensingSurface.tsx', /liveMutateOrNull</],
    ['client/src/concept2cure/v2/surfaces/PdevInd.tsx', /liveMutateOrNull</],
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
