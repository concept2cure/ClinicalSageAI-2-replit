/**
 * IND dispatch-snapshot schema — validates the drizzle-zod insert shape. No DB.
 */

import { describe, it, expect } from 'vitest';
import {
  insertIndDispatchSnapshotSchema,
  IND_DISPATCH_SNAPSHOT_TABLES,
} from '@shared/schema/ind-dispatch-snapshots';

describe('insertIndDispatchSnapshotSchema', () => {
  it('accepts a well-formed snapshot insert', () => {
    const parsed = insertIndDispatchSnapshotSchema.safeParse({
      organizationId: 1,
      submissionId: 7,
      sequenceId: 42,
      sequenceNumber: '0001',
      canDispatch: false,
      blockerCount: 2,
      warningCount: 0,
      blockerCodes: ['MISSING_CHECKSUMS', 'EMPTY_SEQUENCE'],
      verdict: { canDispatch: false, blockers: [], warnings: [], summary: {} },
    });
    expect(parsed.success).toBe(true);
  });

  it('rejects an empty sequenceNumber', () => {
    const parsed = insertIndDispatchSnapshotSchema.safeParse({
      organizationId: 1,
      submissionId: 7,
      sequenceId: 42,
      sequenceNumber: '',
      canDispatch: true,
      verdict: {},
    });
    expect(parsed.success).toBe(false);
  });

  it('exposes the table name', () => {
    expect(IND_DISPATCH_SNAPSHOT_TABLES).toContain('ind_dispatch_snapshots');
  });
});
