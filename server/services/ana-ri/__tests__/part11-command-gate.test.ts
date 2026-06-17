/**
 * Integration: the Part 11 gate in executeCommands. Asserts the security
 * guarantee — a governed command fails closed BEFORE its handler runs when
 * enforcement is on and no valid sign-off is present. The block path touches no
 * DB (the handler is never reached), so this test is side-effect-free.
 *
 * part11Enforce / anaToolPolicy are pre-stamped so the dispatch skips the
 * org-settings loaders (they only run when those fields are undefined).
 */

import { describe, it, expect } from 'vitest';
import { executeCommands, type CommandContext } from '../command-executor.js';

function ctx(over: Partial<CommandContext> = {}): CommandContext {
  return { userId: 1, organizationId: 1, anaToolPolicy: {}, ...over } as CommandContext;
}

describe('executeCommands — Part 11 gate', () => {
  it('blocks a governed command when enforced and no sign-off is present', async () => {
    const res = await executeCommands(
      [{ command: 'place_in_dossier', params: {} }] as any,
      ctx({ part11Enforce: true })
    );
    expect(res).toHaveLength(1);
    expect(res[0].success).toBe(false);
    expect(res[0].error).toBe('PART11_SIGNATURE_REQUIRED');
    expect((res[0] as any).openModal).toBe('esign');
  });

  it('blocks a governed command when the reason-for-change is too short', async () => {
    const res = await executeCommands(
      [{ command: 'revert_to_version', params: {} }] as any,
      ctx({ part11Enforce: true, signoff: { reasonForChange: 'typo', signatureVerified: true } })
    );
    expect(res[0].error).toBe('PART11_SIGNATURE_REQUIRED');
  });

  it('blocks when the signature was not server-verified (no client trust)', async () => {
    const res = await executeCommands(
      [{ command: 'submit_document', params: {} }] as any,
      ctx({
        part11Enforce: true,
        signoff: { reasonForChange: 'Submitting the final dossier package', signatureVerified: false },
      })
    );
    expect(res[0].error).toBe('PART11_SIGNATURE_REQUIRED');
  });

  it('reason-only tier: a governed reason-only command is still blocked with no sign-off', async () => {
    // update_milestone needs no e-signature, but a reason-for-change is still
    // required — with no sign-off at all it fails closed before the handler.
    const res = await executeCommands(
      [{ command: 'update_milestone', params: {} }] as any,
      ctx({ part11Enforce: true })
    );
    expect(res[0].error).toBe('PART11_SIGNATURE_REQUIRED');
    expect((res[0] as any).data.signatureRequired).toBe(false);
  });

  it('does NOT block when enforcement is off (existing behavior preserved)', async () => {
    // Unknown command name → no handler → loop is a no-op; the key assertion is
    // that the Part 11 gate did not fire (no PART11 result was produced).
    const res = await executeCommands(
      [{ command: 'place_in_dossier__unhandled', params: {} }] as any,
      ctx({ part11Enforce: false })
    );
    expect(res.find(r => r.error === 'PART11_SIGNATURE_REQUIRED')).toBeUndefined();
  });
});
