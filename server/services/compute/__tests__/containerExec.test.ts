/**
 * Hardened container argv — tested directly on the pure builder (no Docker,
 * no mocks). These assertions are the security contract for the container
 * isolation profile.
 */
import { describe, it, expect } from 'vitest';
import { buildDockerRunArgs, type ContainerExecConfig } from '../containerExec';

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
