/**
 * The device draft cache: unsaved section text RichSectionEditor keeps in
 * localStorage, so a reload or a crash does not lose it. It is not the record
 * and never leaves the device.
 *
 * Keyed by the signed-in account as well as the section, and purged at
 * sign-out. Until 2026-09-28 it was keyed by the section alone and outlived
 * sign-out, so the next person on the same browser was offered the previous
 * person's unsaved, unreasoned text, and one click and a save put it in the
 * record under their name (periodic review 2026-09-28, editor family,
 * SEC-A-5 / SEC-B-6 / SEC-C-6).
 */
export const DEVICE_DRAFT_PREFIX = 'dc::';

export function deviceDraftKey(ownerId: string | number | null | undefined, storageKey: string): string {
  return `${DEVICE_DRAFT_PREFIX}${ownerId ?? 'anonymous'}::${storageKey}`;
}

/** Remove every device draft on this browser, whatever key shape wrote it. */
export function purgeDeviceDrafts(): void {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(DEVICE_DRAFT_PREFIX)) keys.push(key);
    }
    for (const key of keys) localStorage.removeItem(key);
  } catch {
    /* storage unavailable — there is nothing to purge */
  }
}
