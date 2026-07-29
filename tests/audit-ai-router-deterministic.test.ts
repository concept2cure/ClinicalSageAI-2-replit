/**
 * Forensic audit (LOW) — deterministic provider routing for auditability
 *
 * The round_robin strategy used Math.random(), making provider selection
 * non-reproducible in the audit trail. It now uses a deterministic cursor.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const src = fs.readFileSync(
  path.resolve(__dirname, '../server/services/aiProviderRouter.ts'),
  'utf8'
);

describe('aiProviderRouter round-robin is deterministic', () => {
  it('selects via a cursor, not Math.random()', () => {
    const branch = src.slice(src.indexOf("case 'round_robin':"));
    const body = branch.slice(0, branch.indexOf('break;'));
    expect(body).not.toContain('Math.random');
    expect(body).toContain('roundRobinCursor');
  });
});
