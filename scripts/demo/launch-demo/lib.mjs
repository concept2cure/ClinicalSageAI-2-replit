/**
 * launch-demo/lib.mjs — the ONE way demo data enters a Concept2Cure database.
 *
 * Every record is created through the product's own HTTP API as a real signed-in
 * user, so it is validated, tenant-scoped, audited and hash-chained exactly like
 * a customer's work. Nothing here writes to a table directly, and nothing here
 * runs on deploy (CLAUDE.md Rule 1: reference data reaches a deployed database
 * only through a migration; this is an operator command against a running
 * server — laptop, staging, or a demo tenant in production).
 *
 * Idempotency is by NAME: every demo record's title starts with the pack's
 * DEMO_PREFIX, and a pack looks its records up before creating them, so the
 * command can be re-run after a partial failure. `purge` removes by the same
 * prefix through the API's own delete/archive paths, never by SQL.
 *
 * Reuses the validation harness's API client and PDF fixture (tests/validation/
 * lib) — one client, one rate-limit strategy, one PDF writer.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApiClient, devLogin } from '../../../tests/validation/lib/harness.mjs';
import { makePdfBuffer, sha256 } from '../../../tests/validation/lib/fixtures.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = path.resolve(HERE, '..', '..', '..');
export const MANIFEST_ROOT = path.join(REPO_ROOT, 'docs', 'evidence', 'DEMO');

/** Prefix on every demo record's title. A customer never sees it unless they run the seed. */
export const DEMO_PREFIX = { biotech: '[Demo · Biotech]', mdx: '[Demo · MDX]' };

export { makePdfBuffer, sha256 };

/**
 * Sign in and return an API client bound to that identity.
 *   token   — a bearer token for the target server (staging/production demo tenant)
 *   email   — dev-login email (local only; server must run ALLOW_DEV_AUTH=1)
 * The token wins when both are present. Refuses when neither is usable.
 */
export async function connect({ baseUrl, email, token, onRecord } = {}) {
  const base = (baseUrl || process.env.DEMO_BASE_URL || 'http://localhost:5200').replace(/\/$/, '');
  const auth = await bearerFor(base, { email, token });
  const api = createApiClient({ baseUrl: base, accessToken: auth.accessToken, onRecord: onRecord || (() => {}) });
  const me = await api('GET', '/api/auth/me');
  if (me.status !== 200) throw new Error(`could not resolve the signed-in user (${me.status}): ${String(me.text ?? '').slice(0, 200)}`);
  return { api, baseUrl: base, identity: identityOf(me.json, auth.identity) };
}

/** A bearer token: the one given (DEMO_SEED_TOKEN) or a local dev-login. */
async function bearerFor(base, { email, token }) {
  const given = token || process.env.DEMO_SEED_TOKEN || null;
  if (given) return { accessToken: given, identity: {} };
  const who = email || process.env.DEMO_SEED_EMAIL || 'jonmichaelpsmith@gmail.com';
  const auth = await devLogin(base, who);
  return { accessToken: auth.accessToken, identity: { email: who } };
}

/** The signed-in identity from /api/auth/me, whichever envelope the route uses. */
function identityOf(body, fallback) {
  const u = body?.user ?? body?.data ?? body ?? {};
  return {
    email: u.email ?? fallback.email ?? null,
    userId: u.id ?? null,
    organizationId: u.organizationId ?? u.organization_id ?? u.defaultOrganizationId ?? null,
  };
}

/** Throw with the response when a call did not answer one of the accepted statuses. */
export function must(res, accepted, what) {
  const ok = Array.isArray(accepted) ? accepted.includes(res.status) : res.status === accepted;
  if (!ok) throw new Error(`${what}: HTTP ${res.status} ${String(res.text ?? '').slice(0, 400)}`);
  return res.json ?? {};
}

/** A step runner that prints progress and collects a manifest of what exists after the run. */
export function makeRun(pack) {
  const manifest = { pack, prefix: DEMO_PREFIX[pack], startedAt: new Date().toISOString(), records: {}, notes: [] };
  return {
    manifest,
    async step(title, fn) {
      process.stdout.write(`  • ${title} … `);
      try {
        const out = await fn();
        process.stdout.write(`ok${out ? ` — ${typeof out === 'string' ? out : ''}` : ''}\n`);
        return out;
      } catch (err) {
        process.stdout.write(`FAILED\n`);
        throw err;
      }
    },
    record(key, value) {
      manifest.records[key] = value;
    },
    note(text) {
      manifest.notes.push(text);
    },
    write() {
      const dir = path.join(MANIFEST_ROOT, pack);
      fs.mkdirSync(dir, { recursive: true });
      manifest.finishedAt = new Date().toISOString();
      fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
      return path.join(dir, 'manifest.json');
    },
  };
}

/** Title helper: `${prefix} ${name}`. Packs use it for every record they create. */
export function demoTitle(pack, name) {
  return `${DEMO_PREFIX[pack]} ${name}`;
}

/** Find a record whose title/name starts with the pack prefix and matches `name` exactly. */
export function findDemo(rows, pack, name, field = 'name') {
  const want = demoTitle(pack, name);
  return (rows || []).find((r) => String(r?.[field] ?? r?.title ?? '') === want) || null;
}
