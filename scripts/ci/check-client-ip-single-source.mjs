#!/usr/bin/env node
/**
 * check-client-ip-single-source.mjs — a request's client address has one source.
 *
 * Express resolves req.ip from the socket and the X-Forwarded-For entries the
 * trusted proxies appended (server/config/trust-proxy.ts), and
 * server/utils/client-ip.ts is the one reader of it. Until 2026-09-23 about
 * twenty places parsed X-Forwarded-For by hand and took its left-most entry —
 * the one every client writes — into electronic_signatures, QMS approvals,
 * financial-disclosure signatures, the §11.10(e) trail and the enterprise
 * sign-in limit's key (D6). Two answers for one request in one Part 11 trail,
 * one of them the signer's choice.
 *
 * This gate fails on, in server/ and shared/ code (tests excluded, comments
 * stripped):
 *   - a read of a forwarding header by name: X-Forwarded-For, X-Real-IP,
 *     X-Forwarded-Host, X-Forwarded-Proto, Forwarded — written as a string
 *     literal ('x-forwarded-for', "X-Real-IP", …), which is how Node exposes
 *     them (req.headers[…], req.get(…), req.header(…));
 *   - `trust proxy` set to true, which trusts the left-most entry;
 *   - `trust proxy` set anywhere but server/index.ts, which applies the
 *     resolved hop count once, before any middleware reads req.ip.
 *
 * There is no baseline: at the time it was written, nothing violates it.
 *
 * Usage:
 *   node scripts/ci/check-client-ip-single-source.mjs
 *   node scripts/ci/check-client-ip-single-source.mjs --self-test
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'coverage', '.git', '__tests__', '__mocks__']);
const ROOTS = ['server', 'shared'];
/** The one place trust proxy is applied. */
const TRUST_PROXY_HOME = 'server/index.ts';

const FORWARDING_HEADER = /['"`](?:x-forwarded-(?:for|host|proto)|x-real-ip)['"`]/i;
/** `Forwarded` (RFC 7239) only where it is read as a header: 'forwarded' alone is also a word. */
const FORWARDED_HEADER = /(?:headers\s*\[|\.(?:get|header)\(\s*)['"`]forwarded['"`]/i;
const TRUST_PROXY_SET = /\.(?:set|enable)\(\s*['"`]trust proxy['"`]\s*(?:,\s*([^)]*))?\)/;

function isExcluded(rel) {
  return /\.(test|spec|dbtest)\.[cm]?[jt]sx?$/.test(rel) || /\.d\.ts$/.test(rel);
}

/** Remove block and line comments, keeping line numbers. */
function codeOnly(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:\\])\/\/[^\n]*/g, (m, lead) => lead + ' '.repeat(m.length - lead.length));
}

/** Every violation under root, as "file:line — what". */
export function findViolations(root) {
  const out = [];
  const walk = (dir) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full);
        continue;
      }
      if (!/\.[cm]?[jt]sx?$/.test(e.name)) continue;
      const rel = path.relative(root, full).split(path.sep).join('/');
      if (isExcluded(rel)) continue;
      codeOnly(fs.readFileSync(full, 'utf8'))
        .split('\n')
        .forEach((text, i) => {
          const at = `${rel}:${i + 1}`;
          if (FORWARDING_HEADER.test(text) || FORWARDED_HEADER.test(text)) {
            out.push(`${at} — reads a forwarding header; use clientIpOf / req.ip / req.protocol`);
          }
          const tp = text.match(TRUST_PROXY_SET);
          if (tp) {
            const value = (tp[1] ?? '').trim();
            if (/\.enable\(/.test(tp[0]) || value === 'true') {
              out.push(`${at} — trust proxy set to true, which trusts the entry every client writes`);
            } else if (rel !== TRUST_PROXY_HOME) {
              out.push(`${at} — trust proxy set outside ${TRUST_PROXY_HOME}`);
            }
          }
        });
    }
  };
  for (const r of ROOTS) walk(path.join(root, r));
  return out;
}

function checkRepo() {
  const violations = findViolations(REPO_ROOT);
  if (violations.length === 0) {
    console.log('✓ client-ip-single-source: no forwarding-header reads and no stray trust proxy in server/ or shared/');
    return 0;
  }
  console.error(`✗ client-ip-single-source: ${violations.length} violation(s)\n`);
  for (const v of violations) console.error(`  ${v}`);
  console.error(
    '\nThe client address is req.ip, resolved by the trust-proxy hop count\n' +
      '(server/config/trust-proxy.ts) and read through server/utils/client-ip.ts.\n' +
      "A forwarding header's left-most entry is whatever the client sent.",
  );
  return 1;
}

function selfTest() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'client-ip-'));
  const put = (rel, body) => {
    fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), body);
  };
  const cases = [
    ['control — the helper', () => put('server/routes/a.ts', 'const ip = clientIpOf(req);\n'), 0],
    ['control — req.ip and req.protocol', () => put('server/routes/a.ts', 'const u = `${req.protocol}://${req.get("host")}`; const ip = req.ip;\n'), 0],
    ['control — prose in a comment', () => put('server/routes/a.ts', "// the left-most 'x-forwarded-for' entry\n/* req.headers['x-forwarded-for'] */\nconst a = 1;\n"), 0],
    ['control — a test file', () => put('server/routes/__tests__/a.test.ts', "req.headers['x-forwarded-for'];\n"), 0],
    ['control — a hop count in server/index.ts', () => put('server/index.ts', "app.set('trust proxy', resolveTrustProxy().hops);\n"), 0],
    ['the left-most X-Forwarded-For entry', () => put('server/routes/sign.ts', "const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0];\n"), 1],
    ['X-Forwarded-For through req.get', () => put('server/routes/sign.ts', "const ip = req.get('X-Forwarded-For');\n"), 1],
    ['X-Real-IP', () => put('server/lib/rl.ts', "const ip = req.headers[\"x-real-ip\"];\n"), 1],
    ['X-Forwarded-Host', () => put('server/routes/scim.ts', "const host = req.headers['x-forwarded-host'];\n"), 1],
    ['X-Forwarded-Proto through req.header', () => put('server/middleware/https.ts', "if (req.header('x-forwarded-proto') !== 'https') {}\n"), 1],
    ['control — the word forwarded as a value', () => put('server/routes/mail.ts', "const status = 'forwarded';\n"), 0],
    ['the Forwarded header', () => put('shared/ip.ts', "const f = headers['forwarded'];\n"), 1],
    ['the Forwarded header through req.get', () => put('server/routes/a.ts', "const f = req.get('Forwarded');\n"), 1],
    ['a JavaScript file', () => put('server/api/x.js', "req.ipAddress = req.headers['x-forwarded-for'];\n"), 1],
    ['trust proxy true', () => put('server/index.ts', "app.set('trust proxy', true);\n"), 1],
    ['trust proxy enabled', () => put('server/index.ts', "app.enable('trust proxy');\n"), 1],
    ['trust proxy set on a second app', () => put('server/metrics.ts', "metricsApp.set('trust proxy', 1);\n"), 1],
  ];
  let failures = 0;
  for (const [name, setup, expect] of cases) {
    fs.rmSync(root, { recursive: true, force: true });
    fs.mkdirSync(root, { recursive: true });
    setup();
    const flagged = findViolations(root).length > 0 ? 1 : 0;
    const ok = flagged === expect;
    if (!ok) failures += 1;
    console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : expect ? '  — NOT CAUGHT' : '  — false positive'}`);
  }
  fs.rmSync(root, { recursive: true, force: true });
  if (failures) {
    console.error(`\n✗ self-test: ${failures} case(s) wrong`);
    return 1;
  }
  console.log(`\n✓ self-test: ${cases.length} cases, every violation caught and the controls clean`);
  return 0;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes('--self-test') ? selfTest() : checkRepo());
}
