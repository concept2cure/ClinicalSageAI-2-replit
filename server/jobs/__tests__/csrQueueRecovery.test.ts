/**
 * The CSR queue boot sweep is reached: server/index.ts starts it once the
 * server listens, and it stays off in tests and when disabled
 * (jobs/csrQueueRecovery.ts; the sweep itself is proven in
 * services/csr/__tests__/csr-queue-recovery.pglite.test.ts).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { startCsrQueueRecovery } from '../csrQueueRecovery';

describe('CSR queue boot recovery wiring', () => {
  it('is started by the server once it listens', () => {
    const index = readFileSync(path.resolve(__dirname, '../../index.ts'), 'utf8');
    const listen = index.indexOf('httpServer.listen(');
    expect(listen).toBeGreaterThan(0);
    expect(index.indexOf('startCsrQueueRecovery();', listen)).toBeGreaterThan(listen);
  });

  it('does not run in tests', () => {
    expect(startCsrQueueRecovery()).toBe(false);
  });
});
