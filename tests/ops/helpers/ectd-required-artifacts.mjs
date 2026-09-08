/**
 * The eCTD supportive-file names the packager actually requires — DERIVED from
 * the single source of truth, `server/services/ectd/dtd-bundler.ts`.
 *
 * Two build-free ops scripts hardcode this same set (scripts/ops/
 * submission-preflight.mjs and scripts/ops/ga-readiness-report.mjs), because
 * both must run with no TypeScript build step. Each hardcoded list is a place
 * the truth can drift: adding an EMA stylesheet to REGIONAL_STYLESHEET would
 * leave both scripts under-counting, reporting "ready to file" and "GA blocker
 * cleared" for a package the packager then refuses to build.
 *
 * This module is the ONE place that parses the TypeScript, so the two ops
 * test-suites derive the expected set instead of restating it. It is
 * deliberately strict: every extraction asserts it found something and that the
 * value has the extension it is supposed to have. A regex that silently matches
 * nothing would turn a drift guard into a guard that passes on an empty set —
 * which is the same fabrication in test clothing.
 *
 * Not a *.test.mjs, so `node --test tests/ops/*.test.mjs` does not run it.
 */

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

/** The source of truth, by repo-relative path (quoted in failure messages). */
export const DTD_BUNDLER_REL = 'server/services/ectd/dtd-bundler.ts';

const SOURCE = readFileSync(path.join(repoRoot, DTD_BUNDLER_REL), 'utf8');

/** The string literal assigned to `const <name>`. Asserts it exists. */
function constString(name, extension) {
  const m = new RegExp(`\\b${name}\\s*=\\s*'([^']+)'`).exec(SOURCE);
  assert.ok(m, `${name} must be declared in ${DTD_BUNDLER_REL}`);
  assert.ok(
    m[1].toLowerCase().endsWith(extension),
    `${name} is '${m[1]}', which does not end in ${extension}`,
  );
  return m[1];
}

/** The body of the object literal assigned to `const <name>`, by brace match. */
function objectLiteralBody(name) {
  const decl = SOURCE.indexOf(`const ${name}`);
  assert.ok(decl >= 0, `${name} must be declared in ${DTD_BUNDLER_REL}`);
  const open = SOURCE.indexOf('{', decl);
  assert.ok(open > decl, `${name} must be an object literal in ${DTD_BUNDLER_REL}`);
  let depth = 0;
  for (let i = open; i < SOURCE.length; i += 1) {
    if (SOURCE[i] === '{') depth += 1;
    else if (SOURCE[i] === '}') {
      depth -= 1;
      if (depth === 0) return SOURCE.slice(open + 1, i);
    }
  }
  assert.fail(`unbalanced braces reading ${name} from ${DTD_BUNDLER_REL}`);
}

/** Every `key: 'value'` in that object literal whose value ends in `extension`.
 *  Asserts the literal declared at least one entry, so a renamed constant or a
 *  reshaped literal fails loudly instead of yielding an empty required set. */
function mapValues(name, extension) {
  const body = objectLiteralBody(name);
  const pairs = [...body.matchAll(/^\s*([A-Za-z0-9_]+)\s*:\s*'([^']+)'/gm)];
  assert.ok(
    pairs.length > 0,
    `${name} in ${DTD_BUNDLER_REL} declared no entries this parser could read`,
  );
  const values = pairs.map((m) => m[2]);
  const wrongExtension = values.filter((v) => !v.toLowerCase().endsWith(extension));
  assert.deepEqual(
    wrongExtension,
    [],
    `${name} entries must all end in ${extension}: ${wrongExtension.join(', ')}`,
  );
  return values;
}

const unique = (xs) => [...new Set(xs)];

/** The ICH backbone DTD + every regional DTD any region's Module 1 references. */
export function requiredDtdNames() {
  return unique([constString('ICH_BACKBONE_DTD', '.dtd'), ...mapValues('REGIONAL_DTD', '.dtd')]);
}

/** The ICH backbone stylesheet + every regional stylesheet a backbone's
 *  <?xml-stylesheet?> PI references. REGIONAL_STYLESHEET is `Partial<>` — only
 *  FDA emits a PI today — so this is 2 names, and grows the moment another
 *  regional builder gains one. */
export function requiredStylesheetNames() {
  return unique([
    constString('ICH_BACKBONE_STYLESHEET', '.xsl'),
    ...mapValues('REGIONAL_STYLESHEET', '.xsl'),
  ]);
}

/** Everything the drop-point (assets/ectd-dtd/ or $ECTD_DTD_DIR) must hold. */
export function requiredSupportiveFileNames() {
  return [...requiredDtdNames(), ...requiredStylesheetNames()];
}
