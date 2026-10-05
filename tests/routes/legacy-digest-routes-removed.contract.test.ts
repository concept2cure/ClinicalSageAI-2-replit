/**
 * The legacy digest routes stay gone (D3, 2026-10-04; evidence
 * docs/evidence/D3/2026-10-04-digest-routes/).
 *
 * server/routes/notification_routes.ts registered five authenticated routes that
 * took their target user from the request: any signed-in person wrote another
 * user's digest preferences (to a local file whose name came from that input,
 * `../` included), read them back with a digest of that user's export logs, and
 * had the server mail any address — reported "sent" outside production, where
 * the mailer only logged. No client called any of them. The outcomes they claimed
 * live in the canonical paths: the proactive digest (services/digest/), its
 * org-level preferences (services/digest/digest-preferences.ts), and a person's
 * own notification preferences (GET/PATCH /api/users/me/notifications).
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const LEGACY_PATHS = [
  '/api/notify/send-weekly-digest',
  '/api/digest/get-data',
  '/api/user/save-digest-prefs',
  '/api/notify/send-comparison-notification',
];

function serverSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '__tests__') continue;
    const p = join(dir, name);
    if (statSync(p).isDirectory()) serverSources(p, out);
    else if (/\.(ts|js|mjs)$/.test(name) && !/\.test\./.test(name)) out.push(p);
  }
  return out;
}

describe('the legacy digest routes stay removed (D3)', () => {
  it('the module and its file-backed logger are gone', () => {
    expect(existsSync('server/routes/notification_routes.ts')).toBe(false);
    expect(existsSync('server/export_logger.ts')).toBe(false);
  });

  it('no server source registers a route that takes the target user from the request on these paths', () => {
    const hits: string[] = [];
    for (const file of serverSources('server')) {
      const text = readFileSync(file, 'utf8');
      for (const path of LEGACY_PATHS) if (text.includes(`'${path}'`)) hits.push(`${file}: ${path}`);
      if (/notification_routes/.test(text)) hits.push(`${file}: imports notification_routes`);
    }
    expect(hits).toEqual([]);
  });
});
