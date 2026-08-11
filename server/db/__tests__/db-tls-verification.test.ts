/**
 * Database TLS certificate verification is on by default.
 *
 * ── What this is defending ──────────────────────────────────────────────────
 * Two connection sites disabled certificate verification, and one did it in the
 * worst possible direction:
 *
 *   server/scripts/run-sql.js
 *     ssl: NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
 *
 * Verification off SPECIFICALLY IN PRODUCTION, no TLS at all elsewhere — the
 * single environment where the connection can be intercepted is the one that
 * accepted any certificate, on a script that executes arbitrary SQL files.
 *
 *   server/db/ensureCoreTables.ts
 *     ssl: isNeonDb ? { rejectUnauthorized: false } : false
 *
 * Neon serves a publicly-trusted chain, so verification cost nothing there;
 * switching it off bought no compatibility and removed the only thing that made
 * the provisioning connection's identity mean anything.
 *
 * Both now verify, with one deliberate, documented escape hatch:
 * DB_SSL_ALLOW_UNVERIFIED=1. The rule these tests exist to hold is that the
 * insecure mode is never the DEFAULT and never INFERRED — inferring it from
 * NODE_ENV is precisely how the inversion above happened.
 *
 * ── No test doubles in this file ────────────────────────────────────────────
 * No vi.mock, no fake pg, no stubbed process. The predicate is a pure function
 * of one environment variable, so the tests set that variable and call it. The
 * run-sql.js half is read as source because it is a standalone CLI script with
 * top-level side effects (it opens a pool at import); asserting on its text is
 * a weaker check than the predicate test above it, and it is labelled as such
 * rather than presented as equivalent.
 */

import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { allowUnverifiedDbTls } from '../ensureCoreTables';

const ORIGINAL = process.env.DB_SSL_ALLOW_UNVERIFIED;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.DB_SSL_ALLOW_UNVERIFIED;
  else process.env.DB_SSL_ALLOW_UNVERIFIED = ORIGINAL;
});

describe('allowUnverifiedDbTls — the opt-out is explicit or it is off', () => {
  it('is off when the variable is unset', () => {
    delete process.env.DB_SSL_ALLOW_UNVERIFIED;
    expect(allowUnverifiedDbTls()).toBe(false);
  });

  it('is on only for the exact opt-in value', () => {
    process.env.DB_SSL_ALLOW_UNVERIFIED = '1';
    expect(allowUnverifiedDbTls()).toBe(true);
  });

  it('does not accept the near-misses an operator might reach for', () => {
    // 'true'/'yes' returning false is deliberate: a half-typed opt-out must
    // fail CLOSED (verification stays on), never open.
    for (const value of ['true', 'yes', 'on', '0', '', 'TRUE']) {
      process.env.DB_SSL_ALLOW_UNVERIFIED = value;
      expect(allowUnverifiedDbTls(), `value ${JSON.stringify(value)}`).toBe(false);
    }
  });

  it('is not influenced by NODE_ENV', () => {
    // The whole defect was deriving TLS posture from the environment name.
    const priorNodeEnv = process.env.NODE_ENV;
    delete process.env.DB_SSL_ALLOW_UNVERIFIED;
    try {
      for (const env of ['production', 'staging', 'development', 'test']) {
        process.env.NODE_ENV = env;
        expect(allowUnverifiedDbTls(), `NODE_ENV=${env}`).toBe(false);
      }
    } finally {
      process.env.NODE_ENV = priorNodeEnv;
    }
  });
});

describe('the two connection sites verify by default', () => {
  // nosemgrep: javascript.lang.security.audit.path-traversal.path-join-resolve-traversal.path-join-resolve-traversal
  // -- `p` is never external input. This is a vitest-only helper and every call
  // site below passes a hardcoded repo-relative literal (e.g.
  // 'server/db/ensureCoreTables.ts'); the test reads its own repo's source to
  // assert on the shape of the `ssl:` assignment. No request, argv, env or file
  // content reaches this argument, and nothing here ships to a runtime.
  const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '..', '..', '..', p), 'utf8');

  it('ensureCoreTables derives rejectUnauthorized from the predicate', () => {
    // USE, not mention: both files quote the old expression in a comment so a
    // reader meets the defect, so only the `ssl:` assignment lines are checked.
    const sslLines = (src: string) =>
      src.split('\n').filter(l => /^\s*ssl:/.test(l));
    const src = read('server/db/ensureCoreTables.ts');
    expect(sslLines(src)).toHaveLength(1);
    expect(sslLines(src)[0]).toContain('rejectUnauthorized: !allowUnverifiedDbTls()');
    expect(sslLines(src)[0]).not.toContain('rejectUnauthorized: false');
  });

  it('run-sql.js no longer disables verification in production', () => {
    // Source-text, and weaker than the predicate tests above — this file opens
    // a pool at import time, so it cannot be loaded to be interrogated. The
    // specific string being absent is the point: it is the inverted posture.
    const src = read('server/scripts/run-sql.js');
    const ssl = src.split('\n').filter(l => /^\s*ssl:/.test(l));
    expect(ssl).toHaveLength(1);
    expect(ssl[0]).not.toContain('rejectUnauthorized: false');
    expect(ssl[0]).toContain('rejectUnauthorized: !allowUnverifiedDbTls');
  });

  it('uses one opt-out variable name across both sites', () => {
    for (const f of ['server/db/ensureCoreTables.ts', 'server/scripts/run-sql.js']) {
      expect(read(f), f).toContain('DB_SSL_ALLOW_UNVERIFIED');
    }
  });
});
