/**
 * AnA container execution — a real Linux container with bash, Python, and file
 * manipulation, run via `docker run` with a hardened, safe-by-default profile.
 *
 * Posture (chosen for a regulated product): the capability is GATED OFF by
 * default and, even when enabled, runs with `--network none`, all Linux
 * capabilities dropped, no-new-privileges, a read-only root filesystem, a
 * resource-limited writable work mount, a non-root user, and a wall-clock
 * timeout. Outbound network is a SEPARATE explicit opt-in
 * (ANA_CONTAINER_ALLOW_NETWORK=true) because egress is the single biggest
 * GxP/data-exfiltration surface.
 *
 * The security-critical argv construction (buildDockerRunArgs) is a pure
 * function so the isolation flags are directly unit-testable. Actual execution
 * requires Docker to be available in the runtime.
 */

import { Buffer } from 'node:buffer';
import fs from 'node:fs/promises';
import { constants as fsConstants } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';

export interface ContainerExecConfig {
  /** Master switch. When false, the tool refuses to run. Default false. */
  enabled: boolean;
  /** Allow outbound network (`--network bridge`). Default false (`--network none`). */
  allowNetwork: boolean;
  /** Container image. Default a slim python+bash image. */
  image: string;
  /** Memory cap, e.g. "1g". */
  memory: string;
  /** CPU cap, e.g. "1". */
  cpus: string;
  /** Max process count. */
  pidsLimit: number;
  /** tmpfs size for the writable work dir in MB. */
  workTmpfsMb: number;
  /** uid:gid the container process runs as. */
  user: string;
}

export function getContainerExecConfig(): ContainerExecConfig {
  return {
    enabled: process.env.ANA_ENABLE_CONTAINER_EXEC === 'true',
    allowNetwork: process.env.ANA_CONTAINER_ALLOW_NETWORK === 'true',
    image: process.env.ANA_CONTAINER_IMAGE || 'python:3.11-slim',
    memory: process.env.ANA_CONTAINER_MEMORY || '1g',
    cpus: process.env.ANA_CONTAINER_CPUS || '1',
    pidsLimit: Number(process.env.ANA_CONTAINER_PIDS_LIMIT || '256'),
    workTmpfsMb: Number(process.env.ANA_CONTAINER_WORK_TMPFS_MB || '512'),
    user: process.env.ANA_CONTAINER_USER || '1000:1000',
  };
}

export interface DockerRunArgsInput {
  config: ContainerExecConfig;
  containerName: string;
  /** Absolute host path mounted read-write at /work (the container cwd). */
  hostWorkdir: string;
}

/**
 * Build the hardened `docker run` argv. PURE — no I/O — so the isolation flags
 * are unit-testable. Network is `none` unless allowNetwork is explicitly set.
 */
export function buildDockerRunArgs(input: DockerRunArgsInput): string[] {
  const { config, containerName, hostWorkdir } = input;
  const args = [
    'run',
    '--rm',
    '--name', containerName,
    // Network: closed by default; only opened on explicit opt-in.
    '--network', config.allowNetwork ? 'bridge' : 'none',
    // Drop every Linux capability and forbid privilege escalation.
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    // Immutable root fs; only the mounted work dir is writable.
    '--read-only',
    // Resource limits.
    '--memory', config.memory,
    '--cpus', config.cpus,
    '--pids-limit', String(config.pidsLimit),
    // Non-root.
    '--user', config.user,
    // Writable, size-bounded work mount = container cwd.
    '-v', `${hostWorkdir}:/work:rw`,
    '--tmpfs', `/tmp:rw,size=${config.workTmpfsMb}m`,
    '-w', '/work',
    config.image,
    // Run the entry script written into the work dir (avoids arg injection).
    'bash', '/work/__entry.sh',
  ];
  return args;
}

export interface ContainerExecInput {
  /** Bash script (or any shell) to run inside the container. */
  script: string;
  /** Optional input files (filename → base64) written into the work dir. */
  inputFiles?: Record<string, string>;
  /** Wall-clock timeout in ms (Node-enforced; default 60s, max 300s). */
  timeoutMs?: number;
}

export interface ContainerExecResult {
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  outputFiles: Record<string, string>;
  network: 'none' | 'bridge';
  timedOut: boolean;
}

const DEFAULT_TIMEOUT_MS = 60_000;
const MAX_TIMEOUT_MS = 300_000;
const MAX_OUTPUT_FILE_BYTES = 5_000_000;

/**
 * Run a bash script inside a hardened container. Throws if the capability is
 * disabled (callers should surface a friendly message). Requires Docker.
 */
export async function runInContainer(input: ContainerExecInput): Promise<ContainerExecResult> {
  const config = getContainerExecConfig();
  if (!config.enabled) {
    throw new Error(
      'Container execution is disabled. Set ANA_ENABLE_CONTAINER_EXEC=true (and, for egress, ANA_CONTAINER_ALLOW_NETWORK=true) to enable it.'
    );
  }

  const timeoutMs = Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
  const hostWorkdir = await fs.mkdtemp(path.join(os.tmpdir(), 'ana-container-'));
  const containerName = `ana-exec-${path.basename(hostWorkdir)}`;

  try {
    // Entry script + input files into the work dir.
    await fs.writeFile(path.join(hostWorkdir, '__entry.sh'), input.script, { mode: 0o755 });
    for (const [name, b64] of Object.entries(input.inputFiles ?? {})) {
      const safe = path.basename(name);
      await fs.writeFile(path.join(hostWorkdir, safe), Buffer.from(b64, 'base64'));
    }

    const args = buildDockerRunArgs({ config, containerName, hostWorkdir });
    const { stdout, stderr, exitCode, timedOut } = await spawnDocker(args, containerName, timeoutMs);

    // Collect files the script produced (excluding the entry script + inputs).
    const reserved = new Set(['__entry.sh', ...Object.keys(input.inputFiles ?? {}).map(n => path.basename(n))]);
    const outputFiles = await collectOutputFiles(hostWorkdir, reserved);

    return {
      ok: exitCode === 0 && !timedOut,
      exitCode,
      stdout,
      stderr,
      outputFiles,
      network: config.allowNetwork ? 'bridge' : 'none',
      timedOut,
    };
  } finally {
    await fs.rm(hostWorkdir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * The regular files the container left in its work directory, as base64.
 *
 * The work directory is a bind mount, and the script inside the container
 * writes whatever it likes into it — including a SYMLINK. Collected with
 * `stat`, `out -> /etc/passwd` (or `-> <cwd>/uploads/org-2/…`) was followed on
 * the HOST, and the host file came back as the script's output: the container
 * boundary crossed by one `ln -s` (INJ-PATH-002). Every file is now opened with
 * O_NOFOLLOW, which refuses a symlink at the last component, and the open
 * handle — not the name, which the script could swap — is checked to be a
 * regular file before a byte is read. Names are
 * directory entries of the work directory itself, so no other component can be
 * a link.
 */
export async function collectOutputFiles(
  hostWorkdir: string,
  reserved: ReadonlySet<string>,
): Promise<Record<string, string>> {
  const outputFiles: Record<string, string> = {};
  for (const name of await fs.readdir(hostWorkdir)) {
    if (reserved.has(name)) continue;
    const handle = await fs
      // O_NONBLOCK: a FIFO the script left would otherwise block this open
      // until something wrote to it, and hang the request. It opens at once,
      // and the isFile check below skips it.
      .open(path.join(hostWorkdir, name), fsConstants.O_RDONLY | fsConstants.O_NOFOLLOW | fsConstants.O_NONBLOCK)
      .catch(() => null);
    if (!handle) continue;
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > MAX_OUTPUT_FILE_BYTES) continue;
      outputFiles[name] = (await handle.readFile()).toString('base64');
    } finally {
      await handle.close();
    }
  }
  return outputFiles;
}

function spawnDocker(
  args: string[],
  containerName: string,
  timeoutMs: number
): Promise<{ stdout: string; stderr: string; exitCode: number | null; timedOut: boolean }> {
  return new Promise(resolve => {
    const proc = spawn('docker', args, { stdio: 'pipe' });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    proc.stdout.on('data', d => {
      stdout += d.toString();
    });
    proc.stderr.on('data', d => {
      stderr += d.toString();
    });
    const timer = setTimeout(() => {
      timedOut = true;
      // Best-effort: stop the container, then kill the client.
      spawn('docker', ['kill', containerName], { stdio: 'ignore' });
      proc.kill('SIGKILL');
    }, timeoutMs);
    proc.on('error', err => {
      clearTimeout(timer);
      resolve({ stdout, stderr: `${stderr}\n${err.message}`, exitCode: null, timedOut });
    });
    proc.on('exit', code => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code, timedOut });
    });
  });
}
