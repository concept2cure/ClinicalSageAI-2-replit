/**
 * P0-2 (d) / IAM-02 — RFC 7591 dynamic client registration on the connector is
 * bound to an operator allowlist.
 *
 * `POST /register` is served by the MCP SDK's `mcpAuthRouter` because the
 * provider's clientsStore implements `registerClient`. Before this change any
 * caller could register an OAuth client with any name and any `redirect_uris`;
 * the consent page then showed that client to the user. Registration is what
 * lets a Claude connector onboard, so the control is not to close the route
 * but to put a guard in front of the SDK handler:
 *
 *   - every redirect URI must be an absolute URL with no fragment;
 *   - https, unless the loopback exception applies (development/test only);
 *   - when MCP_CLIENT_REDIRECT_ALLOWLIST is set, its origin must be listed;
 *   - a body with no non-empty redirect_uris array is invalid_client_metadata;
 *   - a malformed allowlist refuses to resolve (fail closed);
 *   - production with no allowlist is an explicit, warned state, once, at
 *     router creation.
 *
 * Needs no database: the guard is pure, and the SDK handler behind it writes
 * through the process-wide `pg` mock (tests/setup.ts).
 */

import { describe, it, expect, vi } from 'vitest';
import express, { type Request, type Response } from 'express';
import request from 'supertest';

const PROD_URL = 'https://app.example.test';
const DEV_URL = 'http://localhost:5300';

type Env = Record<string, string | undefined>;

async function mods() {
  const config = await import('../../mcp/config');
  const index = await import('../../mcp/index');
  const { logger } = await import('../../utils/logger');
  return { ...config, ...index, logger };
}

/** The guard mounted the way createMcpRouter mounts it, with a probe standing in for the SDK handler. */
async function guardApp(env: Env) {
  const { resolveMcpConfig, clientRegistrationGuard, clientRegistrationBodyError } = await mods();
  const config = resolveMcpConfig(env);
  const reached = vi.fn();
  const app = express();
  app.post(
    '/register',
    express.json({ limit: '16kb' }),
    clientRegistrationGuard(config),
    (_req: Request, res: Response) => {
      reached();
      res.status(201).json({ reached: 'sdk' });
    },
    clientRegistrationBodyError,
  );
  return { app, reached, config };
}

const PROD_ALLOWLISTED: Env = {
  NODE_ENV: 'production',
  MCP_ENABLED: 'true',
  MCP_PUBLIC_URL: PROD_URL,
  MCP_CLIENT_REDIRECT_ALLOWLIST: 'https://claude.ai, https://Claude.com',
};
const PROD_OPEN: Env = { NODE_ENV: 'production', MCP_ENABLED: 'true', MCP_PUBLIC_URL: PROD_URL };
const DEV_OPEN: Env = { NODE_ENV: 'development', MCP_ENABLED: 'true', MCP_PUBLIC_URL: DEV_URL };

function register(app: express.Express, body: unknown, path = '/register') {
  return request(app).post(path).set('Content-Type', 'application/json').send(JSON.stringify(body));
}

describe('resolveMcpConfig — clientRegistration policy', () => {
  it('parses MCP_CLIENT_REDIRECT_ALLOWLIST as trimmed, lower-cased origins', async () => {
    const { resolveMcpConfig } = await mods();
    const cfg = resolveMcpConfig(PROD_ALLOWLISTED);
    expect(cfg.clientRegistration.redirectOriginAllowlist).toEqual(['https://claude.ai', 'https://claude.com']);
    expect(cfg.clientRegistration.requireHttpsRedirects).toBe(true);
    expect(cfg.clientRegistration.openInProduction).toBe(false);
  });

  it('is null when the variable is unset; production + null is the open state, development + null is not', async () => {
    const { resolveMcpConfig } = await mods();
    const prod = resolveMcpConfig(PROD_OPEN);
    expect(prod.clientRegistration.redirectOriginAllowlist).toBeNull();
    expect(prod.clientRegistration.requireHttpsRedirects).toBe(true);
    expect(prod.clientRegistration.openInProduction).toBe(true);

    const dev = resolveMcpConfig(DEV_OPEN);
    expect(dev.clientRegistration.redirectOriginAllowlist).toBeNull();
    expect(dev.clientRegistration.requireHttpsRedirects).toBe(false);
    expect(dev.clientRegistration.openInProduction).toBe(false);

    const test = resolveMcpConfig({ ...DEV_OPEN, NODE_ENV: 'test' });
    expect(test.clientRegistration.requireHttpsRedirects).toBe(false);
    expect(test.clientRegistration.openInProduction).toBe(false);
  });

  it('throws on a malformed allowlist instead of resolving to an open or partial one (fail closed)', async () => {
    const { resolveMcpConfig } = await mods();
    const bad = [
      'https://claude.ai/callback', // a path is not an origin
      'claude.ai', // no scheme
      'https://claude.ai?x=1', // query
      'https://claude.ai#frag', // fragment
      'ftp://claude.ai', // not a web origin
      'https://claude.ai,,https://claude.com', // an empty entry between two good ones
      'https://claude.ai,not a url',
    ];
    for (const value of bad) {
      expect(
        () => resolveMcpConfig({ ...PROD_OPEN, MCP_CLIENT_REDIRECT_ALLOWLIST: value }),
        `expected "${value}" to be refused`,
      ).toThrow(/MCP_CLIENT_REDIRECT_ALLOWLIST/);
    }
  });

  it('keeps the existing behaviour and shape of the rest of the config', async () => {
    const { resolveMcpConfig } = await mods();
    const cfg = resolveMcpConfig({ ...DEV_OPEN, PORT: '5300' });
    expect(cfg.enabled).toBe(true);
    expect(cfg.publicUrl.href).toBe(`${DEV_URL}/`);
    expect(cfg.resourceUrl.href).toBe(`${DEV_URL}/mcp`);
    expect(cfg.accessTokenTtlSeconds).toBe(3600);
    expect(() => resolveMcpConfig({ MCP_PUBLIC_URL: 'https://app.example.test/path' })).toThrow(/MCP_PUBLIC_URL/);
  });
});

describe('clientRegistrationGuard — the guard alone', () => {
  it('allowlist set + foreign origin → 400 invalid_redirect_uri, the SDK handler never runs, and the body is not logged', async () => {
    const { app, reached } = await guardApp(PROD_ALLOWLISTED);
    const { logger } = await mods();
    const spies = [vi.spyOn(logger, 'info'), vi.spyOn(logger, 'warn'), vi.spyOn(logger, 'error'), vi.spyOn(logger, 'debug')];
    const evil = 'https://attacker.example/steal-the-code';
    const res = await register(app, { client_name: 'Claude', redirect_uris: [evil] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_redirect_uri');
    expect(typeof res.body.error_description).toBe('string');
    expect(reached).not.toHaveBeenCalled();
    const logged = spies.flatMap((s) => s.mock.calls.map((c) => JSON.stringify(c)));
    expect(logged.some((line) => line.includes(evil) || line.includes('attacker.example'))).toBe(false);
  });

  it('allowlist set + a listed origin (any path, host case-insensitive) → next() is called', async () => {
    const { app, reached } = await guardApp(PROD_ALLOWLISTED);
    const res = await register(app, {
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'https://CLAUDE.com/callback?flow=connector'],
    });
    expect(res.status).toBe(201);
    expect(res.body).toEqual({ reached: 'sdk' });
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('matches by origin, never by prefix: a look-alike host or a different port is refused', async () => {
    const { app, reached } = await guardApp(PROD_ALLOWLISTED);
    for (const uri of ['https://claude.ai.attacker.example/cb', 'https://claude.ai:8443/cb', 'https://claude.ai@attacker.example/cb']) {
      const res = await register(app, { redirect_uris: [uri] });
      expect(res.status, uri).toBe(400);
      expect(res.body.error, uri).toBe('invalid_redirect_uri');
    }
    expect(reached).not.toHaveBeenCalled();
  });

  it('one bad entry refuses the whole registration', async () => {
    const { app, reached } = await guardApp(PROD_ALLOWLISTED);
    const res = await register(app, { redirect_uris: ['https://claude.ai/cb', 'https://attacker.example/cb'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_redirect_uri');
    expect(reached).not.toHaveBeenCalled();
  });

});

describe('clientRegistrationGuard — scheme, fragment and shape', () => {
  it('production posture: an http redirect is refused even with no allowlist, and even for loopback', async () => {
    const { app, reached } = await guardApp(PROD_OPEN);
    for (const uri of ['http://claude.ai/cb', 'http://localhost:3000/cb', 'http://127.0.0.1/cb']) {
      const res = await register(app, { redirect_uris: [uri] });
      expect(res.status, uri).toBe(400);
      expect(res.body.error, uri).toBe('invalid_redirect_uri');
    }
    expect(reached).not.toHaveBeenCalled();
    // https with no allowlist passes: that is the open-in-production state, warned at boot (see below).
    const ok = await register(app, { redirect_uris: ['https://anyone.example/cb'] });
    expect(ok.status).toBe(201);
    expect(reached).toHaveBeenCalledTimes(1);
  });

  it('development posture: http://localhost and http://127.0.0.1 pass; any other http host does not', async () => {
    const { app, reached } = await guardApp(DEV_OPEN);
    for (const uri of ['http://localhost:6274/oauth/callback', 'http://127.0.0.1:8080/cb', 'http://[::1]:8080/cb']) {
      const res = await register(app, { redirect_uris: [uri] });
      expect(res.status, uri).toBe(201);
    }
    expect(reached).toHaveBeenCalledTimes(3);
    const res = await register(app, { redirect_uris: ['http://dev.example/cb'] });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_redirect_uri');
    expect(reached).toHaveBeenCalledTimes(3);
  });

  it('a fragment is refused whatever the posture', async () => {
    for (const env of [PROD_ALLOWLISTED, PROD_OPEN, DEV_OPEN]) {
      const { app, reached } = await guardApp(env);
      const res = await register(app, { redirect_uris: ['https://claude.ai/cb#frag'] });
      expect(res.status).toBe(400);
      expect(res.body.error).toBe('invalid_redirect_uri');
      expect(reached).not.toHaveBeenCalled();
    }
  });

  it('not an absolute URL, or not a string → invalid_redirect_uri', async () => {
    const { app, reached } = await guardApp(DEV_OPEN);
    for (const entry of ['/relative/cb', 'claude.ai/cb', 'javascript:alert(1)', 42, null, { href: 'https://claude.ai/cb' }]) {
      const res = await register(app, { redirect_uris: [entry] });
      expect(res.status, JSON.stringify(entry)).toBe(400);
      expect(res.body.error, JSON.stringify(entry)).toBe('invalid_redirect_uri');
    }
    expect(reached).not.toHaveBeenCalled();
  });

  it('missing, empty or non-array redirect_uris, or no JSON object at all → invalid_client_metadata', async () => {
    const { app, reached } = await guardApp(DEV_OPEN);
    for (const body of [{}, { client_name: 'x' }, { redirect_uris: [] }, { redirect_uris: 'https://claude.ai/cb' }, { redirect_uris: null }, [], 'x', 1]) {
      const res = await register(app, body);
      expect(res.status, JSON.stringify(body)).toBe(400);
      expect(res.body.error, JSON.stringify(body)).toBe('invalid_client_metadata');
    }
    // No JSON content type at all: express 5 leaves req.body undefined.
    const raw = await request(app).post('/register').set('Content-Type', 'text/plain').send('redirect_uris=https://claude.ai/cb');
    expect(raw.status).toBe(400);
    expect(raw.body.error).toBe('invalid_client_metadata');
    // Not JSON at all: the parser's refusal is answered in the RFC shape, not by Express's HTML page.
    const broken = await request(app).post('/register').set('Content-Type', 'application/json').send('{"redirect_uris": [');
    expect(broken.status).toBe(400);
    expect(broken.body.error).toBe('invalid_client_metadata');
    expect(broken.text).not.toMatch(/<pre>|at .*\.js:\d+/);
    // Over 16 KB: refused before the guard, same shape.
    const big = await register(app, { redirect_uris: ['https://claude.ai/cb'], client_name: 'x'.repeat(17 * 1024) });
    expect(big.status).toBe(413);
    expect(big.body.error).toBe('invalid_client_metadata');
    expect(reached).not.toHaveBeenCalled();
  });
});

describe('createMcpRouter — the guard sits in front of the SDK router', () => {
  it('installs the /register route layer with the guard BEFORE the SDK router layer', async () => {
    const { createMcpRouter, resolveMcpConfig } = await mods();
    const router = createMcpRouter(resolveMcpConfig(PROD_ALLOWLISTED));
    type Layer = { name: string; route?: { path: string; methods: Record<string, boolean>; stack: Array<{ name: string }> } };
    const stack = (router as unknown as { stack: Layer[] }).stack;
    const registerIdx = stack.findIndex((l) => l.route?.path === '/register' && l.route.methods.post);
    const sdkIdx = stack.findIndex((l) => l.name === 'router');
    expect(registerIdx, 'no POST /register route layer on the connector router').toBeGreaterThanOrEqual(0);
    expect(sdkIdx, 'no SDK router layer on the connector router').toBeGreaterThanOrEqual(0);
    expect(registerIdx).toBeLessThan(sdkIdx);
    const handlers = stack[registerIdx].route!.stack.map((s) => s.name);
    expect(handlers).toContain('mcpClientRegistrationGuard');
    expect(handlers).toContain('jsonParser');
    expect(handlers).toContain('clientRegistrationBodyError');
    expect(handlers.indexOf('jsonParser')).toBeLessThan(handlers.indexOf('mcpClientRegistrationGuard'));
  });

  it('end to end: a foreign origin is refused by the guard; a listed origin reaches the SDK handler and is registered', async () => {
    const { createMcpRouter, resolveMcpConfig } = await mods();
    const app = express();
    app.use(createMcpRouter(resolveMcpConfig(PROD_ALLOWLISTED)));

    const refused = await register(app, { client_name: 'Evil', redirect_uris: ['https://attacker.example/cb'] });
    expect(refused.status).toBe(400);
    expect(refused.body).toEqual({ error: 'invalid_redirect_uri', error_description: expect.any(String) });
    expect(refused.headers['cache-control']).toBe('no-store');

    const ok = await register(app, {
      client_name: 'Claude',
      redirect_uris: ['https://claude.ai/api/mcp/auth_callback'],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
    });
    expect(ok.status).toBe(201);
    expect(typeof ok.body.client_id).toBe('string');
    expect(ok.body.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
  });

  it('no path spelling reaches the SDK handler around the guard', async () => {
    const { createMcpRouter, resolveMcpConfig } = await mods();
    const app = express();
    app.use(createMcpRouter(resolveMcpConfig(PROD_ALLOWLISTED)));
    for (const path of ['/register/', '/REGISTER', '/register?x=1', '/Register/']) {
      const res = await register(app, { redirect_uris: ['https://attacker.example/cb'] }, path);
      expect(res.status, path).not.toBe(201);
      if (res.status === 400) expect(res.body.error, path).toBe('invalid_redirect_uri');
    }
  });

  it('rate-limits registration attempts per IP (20 per hour), counting refused attempts too', async () => {
    const { createMcpRouter, resolveMcpConfig } = await mods();
    const app = express();
    app.use(createMcpRouter(resolveMcpConfig(PROD_ALLOWLISTED)));
    for (let i = 0; i < 20; i++) {
      const res = await register(app, { redirect_uris: ['https://attacker.example/cb'] });
      expect(res.status, `attempt ${i + 1}`).toBe(400);
    }
    const blocked = await register(app, { redirect_uris: ['https://attacker.example/cb'] });
    expect(blocked.status).toBe(429);
  });

  it('production + no allowlist: openInProduction is true and exactly one warning names MCP_CLIENT_REDIRECT_ALLOWLIST, at creation, never per request', async () => {
    const { createMcpRouter, resolveMcpConfig, logger } = await mods();
    const warn = vi.spyOn(logger, 'warn');
    const config = resolveMcpConfig(PROD_OPEN);
    expect(config.clientRegistration.openInProduction).toBe(true);

    const app = express();
    app.use(createMcpRouter(config));
    const atCreation = warn.mock.calls.filter((c) => String(c[0]).includes('MCP_CLIENT_REDIRECT_ALLOWLIST'));
    expect(atCreation).toHaveLength(1);
    const [message, context] = atCreation[0];
    expect(String(message)).toMatch(/registration/i);
    expect(JSON.stringify(context ?? {})).toContain('MCP_CLIENT_REDIRECT_ALLOWLIST');

    for (let i = 0; i < 3; i++) {
      await register(app, { redirect_uris: ['http://attacker.example/cb'] });
      await register(app, { redirect_uris: ['https://anyone.example/cb'] });
    }
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('MCP_CLIENT_REDIRECT_ALLOWLIST'))).toHaveLength(1);
  });

  it('an allowlist, or a non-production posture, emits no such warning', async () => {
    const { createMcpRouter, resolveMcpConfig, logger } = await mods();
    const warn = vi.spyOn(logger, 'warn');
    createMcpRouter(resolveMcpConfig(PROD_ALLOWLISTED));
    createMcpRouter(resolveMcpConfig(DEV_OPEN));
    expect(warn.mock.calls.filter((c) => String(c[0]).includes('MCP_CLIENT_REDIRECT_ALLOWLIST'))).toHaveLength(0);
  });
});
