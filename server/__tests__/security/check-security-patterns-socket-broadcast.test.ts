/**
 * Regression tests for the `socket-global-broadcast` rule in
 * scripts/check-security-patterns.ts (CI gate: `npm run check:security-patterns`).
 *
 * The rule blocks reintroduction of the namespace-global Socket.IO publish
 * primitives, which is how C2C-COLLAB-003 leaked org A's task, notification,
 * compliance and timer payloads to every authenticated socket in every other
 * organization. The interesting half of the contract is the NEGATIVE half: the
 * regex must not fire on ordinary EventEmitter publishes such as
 * `smartFieldLinking.emit('fieldUpdated', …)`, or the gate would be unusable
 * and would get switched off.
 *
 * The checker is exercised as a subprocess (standalone script with a
 * process.exit()-ing main), pointed at throwaway fixture dirs.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';

const SCRIPT = join(process.cwd(), 'scripts', 'check-security-patterns.ts');

function runChecker(dir: string): { code: number; output: string } {
  const relDir = relative(process.cwd(), dir);
  try {
    const stdout = execFileSync('npx', ['tsx', SCRIPT, relDir], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, output: stdout };
  } catch (err: any) {
    return {
      code: typeof err.status === 'number' ? err.status : -1,
      output: `${err.stdout ?? ''}${err.stderr ?? ''}`,
    };
  }
}

let root: string;

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'sec-check-socket-'));
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});

function fixtureDir(name: string, contents: string[]): string {
  const dir = join(root, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'handler.ts'), contents.join('\n') + '\n');
  return dir;
}

describe('check-security-patterns: socket-global-broadcast', () => {
  it('flags a namespace-global broadcast off a socket', () => {
    const dir = fixtureDir('broadcast', [
      "socket.on('task-created', (task) => {",
      "  socket.broadcast.emit('task-created', task);",
      '});',
    ]);
    const { code, output } = runChecker(dir);
    expect(code).toBe(1);
    expect(output).toMatch(/socket-global-broadcast/);
  });

  it('flags a publish straight off the Socket.IO server handle', () => {
    const dir = fixtureDir('server-handle', [
      "export function broadcastToAll(event, data) { io.emit(event, data); }",
      "export function alsoBad(event, data) { ioInstance.emit(event, data); }",
      "export function optional(event, data) { io?.emit(event, data); }",
    ]);
    const { code, output } = runChecker(dir);
    expect(code).toBe(1);
    expect(output).toMatch(/socket-global-broadcast/);
    expect(output).toMatch(/3 violation\(s\)/);
  });

  it('does NOT flag ordinary EventEmitter publishes or already-scoped sends', () => {
    const dir = fixtureDir('clean', [
      "import { emitToOrgPeers, orgRoom } from '../socket/tenantBroadcast';",
      "smartFieldLinking.emit('fieldUpdated', update);",
      "this.emit('validation-complete', { sessionId });",
      "engine.emit({ event: 'task_completed' });",
      "socket.emit('field-update-success', { field });",
      "io.to(String(job.id)).emit('progress', { progress });",
      "socket.to(orgRoom(orgId)).emit('task-created', task);",
      "emitToOrgPeers(socket, 'task-created', task);",
      "studio.emit('n');",
      "radio.emit('n');",
      "portfolio.emit('n');",
    ]);
    const { code, output } = runChecker(dir);
    expect(code).toBe(0);
    expect(output).toMatch(/0 violations/);
  });

  it('honors an audited security-allow escape hatch', () => {
    const dir = fixtureDir('allowed', [
      '// security-allow: deployment-wide maintenance banner, carries no tenant data.',
      "io.emit('server-maintenance', { at });",
    ]);
    const { code } = runChecker(dir);
    expect(code).toBe(0);
  });
});
