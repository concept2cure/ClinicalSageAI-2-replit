/**
 * RIM Pattern Persistence — verifies the file-based durable storage for learned
 * RIM patterns. Tests cover the round-trip (write then read), graceful handling
 * of missing files, and resilience to write errors.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { persistPatterns, loadPersistedPatterns } from '../rim-pattern-persistence';
import type { RimPattern } from '../rim-pattern-store';

const TEST_DIR = path.resolve(process.cwd(), 'data', 'rim-patterns');

function makePattern(overrides: Partial<RimPattern> = {}): RimPattern {
  return {
    id: '101::csr::deficiency::missing primary endpoint',
    orgId: 101,
    domain: 'csr',
    signalType: 'deficiency',
    observation: 'Missing primary endpoint',
    confidence: 60,
    occurrences: 3,
    firstSeen: '2025-01-01T00:00:00.000Z',
    lastSeen: '2025-06-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('rim-pattern-persistence', () => {
  const testOrgId = '__test_persistence_org_999__';
  const testFilePath = path.join(TEST_DIR, `${testOrgId}.json`);

  afterEach(() => {
    // Clean up test files
    try {
      fs.unlinkSync(testFilePath);
    } catch {
      // File may not exist — that's fine.
    }
  });

  describe('persistPatterns + loadPersistedPatterns round-trip', () => {
    it('writes patterns to file and reads them back', async () => {
      const patterns = [
        makePattern(),
        makePattern({
          id: '101::csr::risk_signal::elevated liver enzymes',
          signalType: 'risk_signal',
          observation: 'Elevated liver enzymes',
          confidence: 75,
          occurrences: 5,
        }),
      ];

      persistPatterns(testOrgId, patterns);

      const loaded = await loadPersistedPatterns(testOrgId);
      expect(loaded).toEqual(patterns);
      expect(loaded).toHaveLength(2);
    });

    it('overwrites previous patterns on re-persist', async () => {
      const firstBatch = [makePattern()];
      persistPatterns(testOrgId, firstBatch);

      const secondBatch = [
        makePattern({ confidence: 80, occurrences: 10 }),
      ];
      persistPatterns(testOrgId, secondBatch);

      const loaded = await loadPersistedPatterns(testOrgId);
      expect(loaded).toHaveLength(1);
      expect(loaded[0].confidence).toBe(80);
      expect(loaded[0].occurrences).toBe(10);
    });
  });

  describe('loadPersistedPatterns — missing file', () => {
    it('returns [] for a nonexistent org', async () => {
      const loaded = await loadPersistedPatterns('__nonexistent_org_12345__');
      expect(loaded).toEqual([]);
    });
  });

  describe('loadPersistedPatterns — invalid data', () => {
    it('returns [] when file contains non-array JSON', async () => {
      fs.mkdirSync(TEST_DIR, { recursive: true });
      fs.writeFileSync(testFilePath, JSON.stringify({ not: 'an array' }), 'utf-8');

      const loaded = await loadPersistedPatterns(testOrgId);
      expect(loaded).toEqual([]);
    });

    it('returns [] when file contains invalid JSON', async () => {
      fs.mkdirSync(TEST_DIR, { recursive: true });
      fs.writeFileSync(testFilePath, '{ broken json', 'utf-8');

      const loaded = await loadPersistedPatterns(testOrgId);
      expect(loaded).toEqual([]);
    });
  });

  describe('persistPatterns — write error resilience', () => {
    it('does not throw when writing to an invalid path', () => {
      // Use a path that will fail (null byte in filename is invalid on all OSes).
      // persistPatterns should catch the error and not throw.
      const badOrgId = '\0invalid';
      expect(() => persistPatterns(badOrgId, [makePattern()])).not.toThrow();
    });
  });
});
