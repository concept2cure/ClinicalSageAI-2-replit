/** A2.9: project creation and its dispatch indirections belong to canonical intake. */
import { describe, expect, it, vi } from 'vitest';
vi.mock('../../db', () => ({ db: {} }));
vi.mock('../auditService.js', () => ({ default: { logAction: vi.fn() } }));
import { anaPlatformController } from '../ana-platform-controller';

describe('AnA platform controller has no alternate project creation entry', () => {
  it.each(['createProject', 'onboardOrganization', 'executeAction'])('%s cannot be called outside the canonical wizard/API', name => {
    expect(name in anaPlatformController).toBe(false);
  });
});
