/**
 * Every sign-in mints its session through openSession, which registers the
 * session against the account's concurrent-session limit (security audit
 * 2026-09-24, IAM-06; plan P1-1). A mint that calls newSessionClaims directly
 * would open a session the limit never sees, so the routes may not call it.
 *
 * And every access token the server signs, wherever it is signed, carries the
 * session claims (plan P1-38, the IAM-02 / IAM-06 residuals of the 2026-09-26
 * lens): a `jwt.sign` whose payload says `type: 'access'` must spread a session
 * — the one openSession or openConnectorSession opened, or the one
 * continuedSessionClaims carries through a refresh, a rotation or an
 * organisation switch. A bare access mint holds no slot, has no idle window
 * and no lifetime, and is refused here by name. The first two found that way
 * were the first-run setup token (routes/setup.ts) and the connector token
 * (mcp/auth/platform-token.ts).
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const here = dirname(fileURLToPath(import.meta.url));
const serverRoot = join(here, '..', '..');
const read = (file: string) => readFileSync(join(here, '..', file), 'utf8');

/** Every server source file that is not a test. */
function* sourceFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__' || entry.name === 'dist') continue;
      yield* sourceFiles(path);
    } else if (/\.(?:[cm]?js|ts)$/.test(entry.name) && !/\.(?:test|spec|dbtest)\.[cm]?[jt]s$/.test(entry.name)) {
      yield path;
    }
  }
}

interface Mint {
  file: string;
  line: number;
  /** The payload's text: the first argument's object literal, or null when it is not a literal. */
  payload: string | null;
}

/** Every `jwt.sign(` call in the file with its payload literal. */
function mintsIn(file: string, source: string): Mint[] {
  const mints: Mint[] = [];
  const call = /\bjwt\.sign\(/g;
  for (let m = call.exec(source); m; m = call.exec(source)) {
    let i = m.index + m[0].length;
    // Whitespace and comments between the call and its payload.
    for (;;) {
      if (/\s/.test(source[i] ?? '')) i += 1;
      else if (source.startsWith('//', i)) i = source.indexOf('\n', i) + 1 || source.length;
      else if (source.startsWith('/*', i)) {
        const close = source.indexOf('*/', i);
        i = close === -1 ? source.length : close + 2;
      } else break;
    }
    const line = source.slice(0, m.index).split('\n').length;
    if (source[i] !== '{') {
      mints.push({ file, line, payload: null });
      continue;
    }
    let depth = 0;
    let end = i;
    for (; end < source.length; end += 1) {
      if (source[end] === '{') depth += 1;
      else if (source[end] === '}' && (depth -= 1) === 0) break;
    }
    mints.push({ file, line, payload: source.slice(i, end + 1) });
  }
  return mints;
}

const ACCESS = /\btype\s*:\s*['"]access['"]/;
/** A session spread: `...session`, `...devSession`, `...(await openSession(…))`, `...continuedSessionClaims(…)`. */
const SESSION_SPREAD = /\.\.\.\s*(?:\(\s*await\s+)?(?:open(?:Connector)?Session\(|continuedSessionClaims\(|[\w$]*[sS]ession[\w$]*\b)/;
const SESSION_SOURCE = /\b(?:openSession|openConnectorSession|continuedSessionClaims)\(/;

describe('sign-in mints register their session', () => {
  it('no route mints session claims without registering them', () => {
    for (const file of ['auth.ts', 'authEnterprise.ts', 'sso.ts']) {
      expect(read(file), `${file} mints a session the concurrent-session limit never sees`).not.toMatch(/\bnewSessionClaims\(/);
    }
  });

  it('each sign-in door opens its session through openSession', () => {
    // auth.ts: the dev sign-in, the sign-in, the sign-up, the MFA completion.
    expect(read('auth.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(4);
    // authEnterprise.ts: the MFA completion.
    expect(read('authEnterprise.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
    // sso.ts: the SAML callback and the development callback.
    expect(read('sso.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
    // setup.ts: the first-run bootstrap token.
    expect(read('setup.ts').match(/\bopenSession\(/g)?.length ?? 0).toBeGreaterThanOrEqual(1);
  });
});

describe('every access token the server signs carries a session (P1-38)', () => {
  const mints: Mint[] = [];
  const sources = new Map<string, string>();
  for (const file of sourceFiles(serverRoot)) {
    const source = readFileSync(file, 'utf8');
    if (!source.includes('jwt.sign(')) continue;
    sources.set(file, source);
    mints.push(...mintsIn(file, source));
  }
  const name = (m: Mint) => `${relative(serverRoot, m.file)}:${m.line}`;

  it('finds the mints (the scan is not empty and every payload is a literal it can read)', () => {
    expect(mints.length).toBeGreaterThanOrEqual(12);
    expect(mints.filter(m => m.payload === null).map(name), 'a jwt.sign whose payload is not an object literal cannot be checked here').toEqual([]);
  });

  it('a type:access payload spreads the session openSession, openConnectorSession or continuedSessionClaims gave it', () => {
    const access = mints.filter(m => m.payload !== null && ACCESS.test(m.payload));
    expect(access.length).toBeGreaterThanOrEqual(12);
    const bare = access.filter(m => !SESSION_SPREAD.test(m.payload as string));
    expect(bare.map(name), 'access tokens minted outside openSession / openConnectorSession: no slot, no idle window, no lifetime').toEqual([]);
  });

  it('a file that mints an access token gets its session from the service, never from newSessionClaims', () => {
    for (const [file, source] of sources) {
      if (!mintsIn(file, source).some(m => m.payload !== null && ACCESS.test(m.payload))) continue;
      const rel = relative(serverRoot, file);
      expect(source, `${rel} mints an access token without opening or continuing a session`).toMatch(SESSION_SOURCE);
      expect(source, `${rel} mints a session the concurrent-session limit never sees`).not.toMatch(/\bnewSessionClaims\(/);
    }
  });
});
