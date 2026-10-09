/**
 * run_python_script runs AnA's code in the hardened container, or not at all
 * (INJ-PATH-002).
 *
 * It used to exec() the model's Python on the application host, as the
 * server's user, with the whole filesystem — every organization's uploads, and
 * the server's own environment under /proc. The replacement for that host path
 * is services/compute/containerExec.ts (runInContainer), the executor
 * run_in_container already uses; these cases prove the tool reaches it, and
 * refuses rather than falling back when it is not enabled.
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';

const container = vi.hoisted(() => ({
  enabled: false,
  runInContainer: vi.fn(async () => ({
    ok: true,
    exitCode: 0,
    stdout: 'done 4\n',
    stderr: '',
    outputFiles: { 'out.txt': Buffer.from('hello').toString('base64'), '../../escape.txt': Buffer.from('x').toString('base64') },
    network: 'none' as const,
    timedOut: false,
  })),
}));
vi.mock('../../compute/containerExec.js', () => ({
  getContainerExecConfig: () => ({ enabled: container.enabled }),
  runInContainer: container.runInContainer,
}));

// A confirmed write runs only for an editor role (writeRoleRefusal); stubbed
// so no database is needed, as in direct-mutator-confirm-gate.test.ts.
const { resolveSignerOrgRole } = vi.hoisted(() => ({ resolveSignerOrgRole: vi.fn(async () => 'member') }));
vi.mock('../../part11/resolve-signer-role', () => ({ resolveSignerOrgRole }));
vi.mock('../../part11/resolve-signer-role.js', () => ({ resolveSignerOrgRole }));

import { getToolHandler } from '../AnaToolExecutor.js';

const ORG = 990011;
const CTX = { organizationId: ORG, userId: 3, humanConfirmed: true };
const run = async (input: Record<string, unknown>) =>
  JSON.parse(await getToolHandler('run_python_script')!(input, CTX as never));

afterAll(() => fs.rmSync(path.resolve(process.cwd(), 'tmp', 'ana-scripts', `org-${ORG}`), { recursive: true, force: true }));

beforeEach(() => container.runInContainer.mockClear());

describe('run_python_script', () => {
  it('does not run anywhere when container execution is not enabled', async () => {
    container.enabled = false;
    const out = await run({ code: "print(open('/etc/passwd').read())" });
    expect(out).toMatchObject({ ok: false, available: false });
    expect(out.error).toMatch(/Nothing was run/);
    expect(container.runInContainer).not.toHaveBeenCalled();
  });

  it('runs the code in the container, as a file in its own work directory', async () => {
    container.enabled = true;
    const code = 'print("done", 2 + 2)';
    const out = await run({ code, input_files: { 'data.csv': Buffer.from('a').toString('base64') } });

    expect(container.runInContainer).toHaveBeenCalledTimes(1);
    const call = (container.runInContainer.mock.calls as unknown as Array<[{ script: string; inputFiles: Record<string, string> }]>)[0][0];
    expect(call.script).toBe('exec python3 /work/__script.py');
    expect(Buffer.from(call.inputFiles['__script.py'], 'base64').toString()).toBe(code);
    expect(call.inputFiles['data.csv']).toBeDefined();
    expect(out).toMatchObject({ ok: true, network: 'none' });
    expect(out.stdout).toContain('done 4');
  });

  it("keeps what the script produced in this tenant's scratch area, under a safe name", async () => {
    container.enabled = true;
    const out = await run({ code: 'x' });
    const root = path.resolve(process.cwd(), 'tmp', 'ana-scripts', `org-${ORG}`) + path.sep;
    for (const f of out.outputFiles as Array<{ path: string }>) {
      expect(f.path.startsWith(root), f.path).toBe(true);
    }
  });
});
