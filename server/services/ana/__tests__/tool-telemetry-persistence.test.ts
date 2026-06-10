/**
 * Tool-telemetry persistence — file backend + boot wiring tests.
 * Uses a real temp file (deterministic, sandbox-safe). No schema/DB.
 */
import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  createFileTelemetryBackend,
  initToolTelemetryPersistence,
} from '../tool-telemetry-persistence';
import {
  resetToolTelemetry,
  recordToolOutcome,
  getToolReliability,
  setTelemetryBackend,
  isTelemetryPersistenceEnabled,
  persistTelemetry,
  type TelemetrySnapshot,
} from '../tool-telemetry';

let tmpFile: string;

beforeEach(async () => {
  resetToolTelemetry();
  setTelemetryBackend(null);
  tmpFile = path.join(await fs.mkdtemp(path.join(os.tmpdir(), 'ana-tel-')), 'telemetry.json');
});

afterEach(async () => {
  setTelemetryBackend(null);
  delete process.env.ANA_TELEMETRY_PERSIST_PATH;
  await fs.rm(path.dirname(tmpFile), { recursive: true, force: true });
});

describe('createFileTelemetryBackend', () => {
  it('returns null when the file is missing or corrupt', async () => {
    const be = createFileTelemetryBackend(tmpFile);
    expect(await be.load()).toBeNull();
    await fs.writeFile(tmpFile, 'not json{');
    expect(await be.load()).toBeNull();
    await fs.writeFile(tmpFile, JSON.stringify({ version: 2, tools: [] })); // wrong version
    expect(await be.load()).toBeNull();
  });

  it('round-trips a snapshot (atomic write, no stray temp files)', async () => {
    const be = createFileTelemetryBackend(tmpFile);
    const snap: TelemetrySnapshot = {
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      tools: [
        { tool: 'search_crm', calls: 3, successes: 2, degraded: 1, failures: 0, consecutiveFailures: 0, avgLatencyMs: 42, lastError: 'x', lastUsedAt: 'old', contractViolations: 0 },
      ],
    };
    await be.save(snap);
    const loaded = await be.load();
    expect(loaded).toEqual(snap);

    const dirEntries = await fs.readdir(path.dirname(tmpFile));
    expect(dirEntries.filter(f => f.endsWith('.tmp'))).toHaveLength(0); // temp renamed away
  });
});

describe('initToolTelemetryPersistence', () => {
  it('is a no-op (persistence off) when ANA_TELEMETRY_PERSIST_PATH is unset', async () => {
    expect(await initToolTelemetryPersistence()).toBe(false);
    expect(isTelemetryPersistenceEnabled()).toBe(false);
  });

  it('enables persistence, hydrates prior history, and round-trips through the file', async () => {
    // Seed a prior snapshot on disk.
    await createFileTelemetryBackend(tmpFile).save({
      version: 1,
      savedAt: '2026-01-01T00:00:00Z',
      tools: [
        { tool: 'search_device_recalls', calls: 7, successes: 7, degraded: 0, failures: 0, consecutiveFailures: 0, avgLatencyMs: 88, lastError: null, lastUsedAt: 'old', contractViolations: 0 },
      ],
    });

    process.env.ANA_TELEMETRY_PERSIST_PATH = tmpFile;
    const enabled = await initToolTelemetryPersistence();
    expect(enabled).toBe(true);
    expect(isTelemetryPersistenceEnabled()).toBe(true);

    // Prior history was hydrated.
    expect(getToolReliability().find(t => t.tool === 'search_device_recalls')?.calls).toBe(7);

    // New activity persists back to the same file.
    recordToolOutcome('search_drug_labels', 'success', 30);
    await persistTelemetry();
    const reloaded = await createFileTelemetryBackend(tmpFile).load();
    expect(reloaded?.tools.map(t => t.tool).sort()).toEqual(['search_device_recalls', 'search_drug_labels']);
  });
});
