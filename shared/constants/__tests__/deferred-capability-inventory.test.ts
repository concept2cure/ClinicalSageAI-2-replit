import { describe, expect, it } from 'vitest';
import { DEFERRED_CAPABILITY_INVENTORY } from '../deferred-capability-inventory';
import { getSurface } from '../ui-surface-registry';
import { isLaunchSurface } from '../launch-scope';

describe('deferred surface convergence claims', () => {
  it('keeps each retained capability fenced and gives an implemented canonical launch destination', () => {
    // 11 since ana-memory folded into the conversation, 10 since ectd-publishing
    // folded into eCTD Compile (D2, 2026-10-29).
    expect(DEFERRED_CAPABILITY_INVENTORY).toHaveLength(10);
    for (const entry of DEFERRED_CAPABILITY_INVENTORY) {
      const surface = getSurface(entry.surfaceId);
      expect(surface, entry.surfaceId).toBeTruthy();
      expect(isLaunchSurface(entry.surfaceId), entry.surfaceId).toBe(false);
      expect(surface!.notes).toBe(entry.description);
      expect(surface!.notes).toMatch(/Deferred/);
      expect(entry.implementedParts.length).toBeGreaterThan(10);
      expect(entry.completionNeeded.length).toBeGreaterThan(10);
      for (const destination of entry.canonicalSurfaces) expect(isLaunchSurface(destination), destination).toBe(true);
    }
  });
});
