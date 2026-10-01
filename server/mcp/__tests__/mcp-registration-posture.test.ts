/**
 * IAM-22 (2026-10-01): with the connector enabled in production and no
 * MCP_CLIENT_REDIRECT_ALLOWLIST, dynamic client registration (POST /register)
 * was open to any https origin and the server only logged a warning. The
 * product decision (ADR-0014, connector) is that production never runs with
 * open registration: server/index.ts builds the router at boot when
 * MCP_ENABLED=true, so building it refuses, and the process does not start.
 */
import { describe, expect, it } from 'vitest';

const BASE = { MCP_PUBLIC_URL: 'https://app.example.test', MCP_ENABLED: 'true' };

async function build(env: Record<string, string>) {
  const { createMcpRouter } = await import('../index');
  const { resolveMcpConfig } = await import('../config');
  return () => createMcpRouter(resolveMcpConfig({ ...BASE, ...env } as NodeJS.ProcessEnv));
}

describe('connector client registration in production (IAM-22)', () => {
  it('refuses to build with no redirect allow-list', async () => {
    const make = await build({ NODE_ENV: 'production' });
    expect(make).toThrow(/MCP_CLIENT_REDIRECT_ALLOWLIST/);
  });

  it('builds with an allow-list', async () => {
    const make = await build({ NODE_ENV: 'production', MCP_CLIENT_REDIRECT_ALLOWLIST: 'https://claude.ai,https://claude.com' });
    expect(make).not.toThrow();
  });

  it('builds outside production without one (development and test are unchanged)', async () => {
    const make = await build({ NODE_ENV: 'test' });
    expect(make).not.toThrow();
  });
});
