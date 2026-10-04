/**
 * Hardened container argv — tested directly on the pure builder (no Docker,
 * no mocks). These assertions are the security contract for the container
 * isolation profile.
 */
import { describe, it, expect, afterAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { buildDockerRunArgs, collectOutputFiles, type ContainerExecConfig } from '../containerExec';

const baseConfig: ContainerExecConfig = {
  enabled: true,
  allowNetwork: false,
  image: 'python:3.11-slim',
  memory: '1g',
  cpus: '1',
  pidsLimit: 256,
  workTmpfsMb: 512,
  user: '1000:1000',
};

function argsFor(over: Partial<ContainerExecConfig>) {
  return buildDockerRunArgs({
    config: { ...baseConfig, ...over },
    containerName: 'ana-exec-test',
    hostWorkdir: '/tmp/ana-work',
  });
}

describe('buildDockerRunArgs — isolation contract', () => {
  it('closes the network by default', () => {
    const a = argsFor({ allowNetwork: false });
    const i = a.indexOf('--network');
    expect(a[i + 1]).toBe('none');
  });

  it('opens the network only when explicitly allowed', () => {
    const a = argsFor({ allowNetwork: true });
    const i = a.indexOf('--network');
    expect(a[i + 1]).toBe('bridge');
  });

  it('drops all capabilities and forbids privilege escalation', () => {
    const a = argsFor({});
    expect(a).toContain('--cap-drop');
    expect(a[a.indexOf('--cap-drop') + 1]).toBe('ALL');
    expect(a).toContain('--security-opt');
    expect(a[a.indexOf('--security-opt') + 1]).toBe('no-new-privileges');
  });

  it('mounts a read-only root filesystem and runs as non-root', () => {
    const a = argsFor({});
    expect(a).toContain('--read-only');
    expect(a[a.indexOf('--user') + 1]).toBe('1000:1000');
  });

  it('applies memory, cpu, and pid limits', () => {
    const a = argsFor({ memory: '512m', cpus: '2', pidsLimit: 64 });
    expect(a[a.indexOf('--memory') + 1]).toBe('512m');
    expect(a[a.indexOf('--cpus') + 1]).toBe('2');
    expect(a[a.indexOf('--pids-limit') + 1]).toBe('64');
  });

  it('mounts the host workdir read-write at /work and runs the entry script', () => {
    const a = argsFor({});
    expect(a).toContain('-v');
    expect(a[a.indexOf('-v') + 1]).toBe('/tmp/ana-work:/work:rw');
    expect(a[a.indexOf('-w') + 1]).toBe('/work');
    expect(a[a.length - 2]).toBe('bash');
    expect(a[a.length - 1]).toBe('/work/__entry.sh');
  });

  it('auto-removes the container', () => {
    expect(argsFor({})).toContain('--rm');
  });
});

/*
 * INJ-PATH-002. The work directory is a bind mount the container writes into,
 * and output collection ran on the HOST with `stat`, which follows links: a
 * script's `ln -s /etc/passwd out` came back as the script's output file.
 */
describe('collectOutputFiles — the host reads only what the container wrote', () => {
  const made: string[] = [];
  const workdir = () => {
    const d = fs.mkdtempSync(path.join(os.tmpdir(), 'ana-collect-'));
    made.push(d);
    return d;
  };
  afterAll(() => made.forEach(d => fs.rmSync(d, { recursive: true, force: true })));

  it('returns a regular file the script produced', async () => {
    const d = workdir();
    fs.writeFileSync(path.join(d, 'result.csv'), 'a,b\n1,2\n');
    const out = await collectOutputFiles(d, new Set());
    expect(Buffer.from(out['result.csv'], 'base64').toString()).toBe('a,b\n1,2\n');
  });

  it('does not follow a symlink to a host file or to another directory', async () => {
    const d = workdir();
    const secret = path.join(workdir(), 'other-tenant.docx');
    fs.writeFileSync(secret, 'not yours');
    fs.symlinkSync(secret, path.join(d, 'stolen.docx'));
    fs.symlinkSync('/etc/hostname', path.join(d, 'host.txt'));
    const out = await collectOutputFiles(d, new Set());
    expect(Object.keys(out)).toEqual([]);
  });

  it('skips a FIFO instead of blocking on it', async () => {
    const d = workdir();
    const mk = spawnSync('mkfifo', [path.join(d, 'pipe')]);
    if (mk.status !== 0) return; // no mkfifo on this runner
    const out = await collectOutputFiles(d, new Set());
    expect(Object.keys(out)).toEqual([]);
  }, 5_000);

  it('leaves out the entry script and the inputs', async () => {
    const d = workdir();
    fs.writeFileSync(path.join(d, '__entry.sh'), 'echo');
    fs.writeFileSync(path.join(d, 'in.csv'), 'x');
    fs.writeFileSync(path.join(d, 'out.csv'), 'y');
    const out = await collectOutputFiles(d, new Set(['__entry.sh', 'in.csv']));
    expect(Object.keys(out)).toEqual(['out.csv']);
  });
});
