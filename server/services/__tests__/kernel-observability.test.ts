import { describe, expect, test, vi} from 'vitest';

// vi.hoisted ensures env vars are set BEFORE any ESM imports (including
// transitive ones) are evaluated. Loading the auth/db/config chain at
// module init requires these to be present, or the chain throws.
vi.hoisted(() => {
  process.env.NODE_ENV = process.env.NODE_ENV || 'test';
  process.env.DATABASE_URL =
    process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test';
  process.env.JWT_SECRET =
    process.env.JWT_SECRET || 'stage3-test-secret-padded-to-32-chars-or-more-okay';
  process.env.SKIP_DB_STARTUP_TEST = 'true';
});

import { computeQualityBand } from '../kernel-observability';

describe('kernel-observability', () => {
  test('maps quality scores to expected bands', () => {
    expect(computeQualityBand(0.9)).toBe('strong');
    expect(computeQualityBand(0.7)).toBe('moderate');
    expect(computeQualityBand(0.4)).toBe('weak');
  });
});

