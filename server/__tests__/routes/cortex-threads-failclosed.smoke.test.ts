import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

describe('cortex threads fail-closed route contract', () => {
  const repoRoot = path.resolve(__dirname, '../../..');
  const routeFile = path.join(repoRoot, 'server/routes/cortex-unified.ts');

  it('requires authenticated user for GET /threads', () => {
    // The route now delegates the auth response to
    // requireAuthenticatedUserId(req, res, 'CORTEX_THREADS_AUTH_REQUIRED')
    // rather than spelling out the `code:` envelope inline. The contract
    // — the threads endpoint fails closed with this code on missing auth
    // — is intact; just check the helper call.
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain("'CORTEX_THREADS_AUTH_REQUIRED'");
  });

  it('fails closed on storage/query errors for GET /threads', () => {
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain("code: 'CORTEX_THREADS_FETCH_FAILED'");
    expect(content).toContain('Failed to load cortex threads');
    expect(content).not.toContain('fail-open so UI doesn\'t break');
  });

  it('clamps offset to non-negative values', () => {
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain('Math.max(Number(req.query.offset) || 0, 0)');
    expect(content).toContain('Math.min(Math.max(Number(req.query.limit) || 50, 1), 100)');
  });

  it('requires authentication for GET /threads/:threadId', () => {
    // Same helper-delegation pattern as above.
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain("'CORTEX_THREAD_AUTH_REQUIRED'");
  });

  it('enforces thread ownership and denies cross-user access', () => {
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain("code: 'CORTEX_THREAD_ACCESS_DENIED'");
    expect(content).toContain('threadOwnerId');
    expect(content).toContain('Thread access denied');
  });

  it('returns explicit fail-closed code for GET /threads/:threadId errors', () => {
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain("code: 'CORTEX_THREAD_FETCH_FAILED'");
  });

  it('requires auth for create/update/delete thread mutations', () => {
    // Same helper-delegation pattern: requireAuthenticatedUserId(...)
    // emits the envelope. Match the bare auth-required strings.
    const content = fs.readFileSync(routeFile, 'utf8');
    expect(content).toContain("'CORTEX_THREAD_CREATE_AUTH_REQUIRED'");
    expect(content).toContain("'CORTEX_THREAD_UPDATE_AUTH_REQUIRED'");
    expect(content).toContain("'CORTEX_THREAD_DELETE_AUTH_REQUIRED'");
  });
});
