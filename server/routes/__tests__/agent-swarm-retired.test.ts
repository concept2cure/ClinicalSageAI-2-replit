/**
 * /api/agent-swarm is retired (row 74, S5c; brief §8).
 *
 * The founder's scope for row 74 (2026-09-27): "/api/agent-swarm is retired in
 * the same change (zero duplication)". What replaces it, by path:
 *   - "AnA runs several agents at once" is `run_agent`
 *     (server/services/ana/agentic-workflow-tools.ts → sub-agent.ts), reached
 *     from the AnA stream and gated by
 *     server/routes/ana-ri/__tests__/stream-run-agent.test.ts,
 *     stream-run-agent-real.test.ts and services/ana/__tests__/sub-agent.test.ts;
 *   - multi-role drafting is `convene_drafting_council`, gated by
 *     services/ana/__tests__/council-tool.test.ts and the inScope entry in
 *     ana-launch-scope.inventory.json (ana-launch-scope.test.ts).
 * `run_agent` is read-only research and verification: it cannot draft, compile
 * or approve, so this is not a like-for-like replacement of the swarm's
 * submission-drafting claim.
 *
 * Defects retired with the route: model calls with no organization (charged to
 * the shared bucket), a process-memory swarm map whose GET listed every
 * tenant's swarms, an approver taken from the request body, and "parallel
 * execution" that was a sequential loop.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..', '..');
const read = (p: string) => readFileSync(join(root, p), 'utf8');

describe('/api/agent-swarm is retired', () => {
  it('its route module is gone', () => {
    expect(existsSync(join(root, 'server/routes/agent-swarm.ts'))).toBe(false);
  });

  it('nothing imports or mounts it', () => {
    expect(read('server/bootstrap/register-advanced-platform-routes.ts')).not.toMatch(/agent-swarm|agentSwarm/);
  });

  it('its unapproved-model-pin baseline entry is gone, and the pin gate passes', () => {
    expect(read('scripts/ci/unapproved-model-pins-baseline.json')).not.toMatch(/agent-swarm/);
    expect(() =>
      execFileSync('npm', ['run', '-s', 'ci:unapproved-model-pins'], { cwd: root, stdio: 'pipe' }),
    ).not.toThrow();
  });

  // A control: true today (the route's last UI callers were deleted in
  // 2026-05), and the one assertion here that would catch a client gaining one.
  it('no client calls it', () => {
    let hits = '';
    try {
      hits = execFileSync('git', ['grep', '-l', 'api/agent-swarm', '--', 'client/'], {
        cwd: root,
        encoding: 'utf8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
    } catch (err) {
      // git grep exits 1 when nothing matches, which is the passing case.
      if ((err as { status?: number }).status !== 1) throw err;
    }
    expect(hits).toBe('');
  }, 30_000);
});
