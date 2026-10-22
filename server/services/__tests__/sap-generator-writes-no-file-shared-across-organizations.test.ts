/**
 * The SAP generator writes no file into a directory every organization shares.
 *
 * Until 2026-10-15 generateSAP wrote data/sap/<protocol_id>_sap.txt — one
 * directory for every tenant, keyed by protocol id alone — and returned the path
 * as sapPath; getSapByProtocolId / getSapSegmentsByProtocolId read the file back
 * by protocol id alone. Nothing read it: no module called either reader, and the
 * continuum stored sapPath in its snapshot and never read it back. A generated
 * SAP is kept as the continuum thread's sapSnapshot.content.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

vi.mock('../../db', () => {
  const chain = { select: () => chain, from: () => chain, where: () => chain, limit: async () => [] };
  return { db: chain, pool: { query: async () => ({ rows: [], rowCount: 0 }) } };
});

const REQUIRED = {
  indication: 'Type 2 diabetes',
  phase: 'Phase 3',
  sample_size: 400,
  primary_endpoint: 'HbA1c change from baseline at week 24',
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.resetModules();
});

describe('generateSAP', () => {
  it('writes no file and returns no path, whatever protocol it is filed under', async () => {
    const write = vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    const { default: SapGenerator } = await import('../sap-generator-service');
    const r = await SapGenerator.generateSAP({ ...REQUIRED, protocol_id: '5' });
    expect(write.mock.calls.map(([file]) => String(file)), 'the SAP was written under data/sap by protocol id alone').toEqual([]);
    expect(r).not.toHaveProperty('sapPath');
  });

  it('creates no shared data/sap directory when it loads', async () => {
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    const mkdir = vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    await import('../sap-generator-service');
    expect(mkdir.mock.calls.map(([dir]) => String(dir)).filter((dir) => dir.endsWith(path.join('data', 'sap')))).toEqual([]);
  });

  it('offers no reader of a SAP by protocol id alone', async () => {
    const { default: SapGenerator } = await import('../sap-generator-service');
    expect('getSapByProtocolId' in SapGenerator, 'a reader by protocol id alone is still offered').toBe(false);
    expect('getSapSegmentsByProtocolId' in SapGenerator).toBe(false);
  });
});
