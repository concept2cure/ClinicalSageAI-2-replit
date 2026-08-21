/**
 * Resolve Playwright and a Chromium binary for the visual-QA scripts.
 *
 * ── Why this file exists ──────────────────────────────────────────────────────
 * The three scripts in this directory each began with a hard-coded absolute
 * import of `playwright-core` out of a scratch directory, because that is where
 * it happened to be installed when they were written. Committed, that is a
 * script that runs on exactly one machine and throws `ERR_MODULE_NOT_FOUND` for
 * everyone else — including the same machine after a restart. The scripts were
 * real and their findings were real; the import line made them unrunnable.
 *
 * Playwright is deliberately NOT a dependency of this repository. These are
 * deep-audit tools run on demand (contrast needs real layout and a real cascade,
 * which jsdom cannot provide), not part of `npm test` or CI, and adding a
 * browser download to every install to serve three manual scripts is a bad
 * trade. So resolution is attempted, and failure is explained rather than
 * thrown as a stack trace about a missing module.
 *
 * Resolution order, most-specific first:
 *   1. $PLAYWRIGHT_CORE  — explicit path to a playwright-core entry point
 *   2. `playwright-core` or `playwright` on the normal module path
 *
 * The browser binary is looked up the same way: $PLAYWRIGHT_CHROMIUM, else the
 * pre-installed Chromium this environment ships, else Playwright's own default
 * (passing no executablePath), which is correct on a machine that ran
 * `playwright install`.
 *
 * @module scripts/visual-qa/playwright
 */

import fs from 'node:fs';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

/** Chromium locations to try, in order. `null` means "let Playwright decide". */
const CHROMIUM_CANDIDATES = [
  process.env.PLAYWRIGHT_CHROMIUM,
  '/opt/pw-browsers/chromium',
];

const HELP = [
  'Playwright is not installed, and it is not a dependency of this repo on purpose —',
  'these are on-demand audit scripts, not CI.',
  '',
  'To run them, either:',
  '  npm i --no-save playwright-core',
  'or point at an existing copy:',
  '  PLAYWRIGHT_CORE=/path/to/playwright-core/index.mjs node scripts/visual-qa/<script>.mjs',
  '',
  'If Chromium is somewhere non-standard, set PLAYWRIGHT_CHROMIUM=/path/to/chromium.',
].join('\n');

/**
 * Pull the `chromium` launcher off a module namespace, whichever entry point
 * resolution landed on.
 *
 * `playwright-core`'s package main is CommonJS (`index.js`), and its ESM
 * exports are a re-export of that object rather than named bindings the
 * CJS lexer can see. So `await import()` on the main entry gives a namespace
 * whose `chromium` is undefined and whose `default` holds everything, while
 * `index.mjs` gives real named exports. Reading only `mod.chromium` therefore
 * failed for the exact command this file's own help text tells you to run —
 * `npm i --no-save playwright-core` installs it and the loader still reported
 * "Playwright is not installed".
 *
 * @param {Record<string, unknown>} mod
 * @returns {unknown} the launcher, or undefined if this module has none.
 */
function pickChromium(mod) {
  return mod?.chromium ?? mod?.default?.chromium;
}

/**
 * Load Playwright's `chromium` launcher.
 *
 * @returns {Promise<import('playwright-core').BrowserType>}
 * @throws {Error} with instructions, not a module-resolution stack trace.
 */
export async function loadChromium() {
  const explicit = process.env.PLAYWRIGHT_CORE;
  if (explicit) {
    if (!fs.existsSync(explicit)) {
      throw new Error(`PLAYWRIGHT_CORE points at a path that does not exist: ${explicit}`);
    }
    const mod = await import(pathToFileURL(explicit).href);
    const chromium = pickChromium(mod);
    if (!chromium) {
      throw new Error(`PLAYWRIGHT_CORE resolved but exports no \`chromium\`: ${explicit}`);
    }
    return chromium;
  }

  const require = createRequire(import.meta.url);
  for (const name of ['playwright-core', 'playwright']) {
    let entry;
    try {
      entry = require.resolve(name);
    } catch {
      continue; // not installed here — try the next candidate
    }
    const mod = await import(pathToFileURL(entry).href);
    const chromium = pickChromium(mod);
    if (chromium) return chromium;
  }

  throw new Error(HELP);
}

/**
 * Launch a headless Chromium, resolving the binary the same way.
 *
 * `--no-sandbox` is required in the containers these scripts run in. That is a
 * real relaxation, and it is acceptable here for one specific reason: the pages
 * loaded are this repository's own built assets and locally-generated markup,
 * never remote content. Do not reuse this launcher for anything that browses
 * the open web.
 *
 * @param {Record<string, unknown>} [options] merged over the defaults.
 */
export async function launchChromium(options = {}) {
  const chromium = await loadChromium();
  const executablePath = CHROMIUM_CANDIDATES.find((p) => p && fs.existsSync(p));
  return chromium.launch({
    args: ['--no-sandbox'],
    ...(executablePath ? { executablePath } : {}),
    ...options,
  });
}
