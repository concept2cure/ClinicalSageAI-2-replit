/**
 * Every route the auth client calls is a route the auth router serves.
 *
 * P-25 (2026-10-08): authService carried five MFA methods that called
 * /mfa/methods, /mfa/totp/setup, /mfa/totp/verify, DELETE /mfa/:method and
 * /mfa/backup-codes, none of which exists, and `updateProfile`, which called
 * PATCH /profile, which does not exist either. Nothing called them, so nothing
 * failed; a screen that did would have got a 404 for a feature the client
 * advertised. This reads both files and holds them to each other.
 *
 * Textual on purpose, like the repo's other contract checks: the extraction
 * must find every `this.api.<verb>(` call in the client, so a call written in a
 * shape this cannot read fails here instead of being skipped.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = path.resolve(__dirname, '../../../../..');
const read = (rel: string) => readFileSync(path.join(ROOT, rel), 'utf8');

const CLIENT = read('client/src/services/portal/authService.tsx');
const ROUTER = read('server/routes/auth.ts');
const MOUNTS = read('server/bootstrap/register-platform-routes.ts');

/** `METHOD /path` for each `this.api.<verb><T>?(\`${this.baseUrl}/path\`` in the client. */
function clientCalls(src: string): string[] {
  const re = /this\.api\.(get|post|put|patch|delete)\s*(?:<[^()]*?>)?\(\s*`\$\{this\.baseUrl\}(\/[^`]*)`/g;
  return [...src.matchAll(re)].map((m) => `${m[1].toUpperCase()} ${m[2]}`);
}

/** `METHOD /path` for each `router.<verb>('/path'` the auth router registers. */
function routerRoutes(src: string): Set<string> {
  const re = /router\.(get|post|put|patch|delete)\(\s*'([^']+)'/g;
  return new Set([...src.matchAll(re)].map((m) => `${m[1].toUpperCase()} ${m[2]}`));
}

describe('the auth client calls only routes the auth router serves', () => {
  it('the client singleton addresses /api/v1/auth, where the auth router is mounted', () => {
    expect(CLIENT).toMatch(/new AuthService\('\/api\/v1\/auth'\)/);
    expect(MOUNTS).toMatch(/app\.use\('\/api\/v1\/auth',[^)]*\bauthRouter\)/);
  });

  it('reads every api call in the client (none is skipped for its shape)', () => {
    const everyCall = CLIENT.match(/this\.api\.(get|post|put|patch|delete)\b/g) ?? [];
    expect(everyCall.length).toBeGreaterThan(0);
    expect(clientCalls(CLIENT)).toHaveLength(everyCall.length);
  });

  it('each one is registered on server/routes/auth.ts', () => {
    const served = routerRoutes(ROUTER);
    const missing = clientCalls(CLIENT).filter((call) => !served.has(call));
    expect(missing, 'authService calls a route the auth router does not serve').toEqual([]);
  });
});
