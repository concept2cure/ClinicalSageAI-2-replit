/**
 * No reference chip in a conversation opens a screen outside the release (slice 0 of
 * .design/client-journey/INFORMATION_ARCHITECTURE.md, "AnA's navigation").
 *
 * A turn's reference chips (ConversationThread, `turn.links`) open the screen CT_LINKMAP
 * names for their kind. "evidence" opened `evidence-search` and "module" opened
 * `dossier-map`, both outside the release, so the chip ended on "not in this release".
 * Evidence is read in the project's Vault, and module completion is shown on the project
 * (Author's module completion, `ProjectDossier`).
 *
 * No production path sets `turn.links` today; the chips render only when a turn carries
 * them. This pins the map so the first producer cannot open a lock.
 */
import { describe, expect, it } from 'vitest';

import { LAUNCH_SHELL_SURFACES, LAUNCH_SURFACE_IDS } from '@shared/constants/launch-scope';
import { CT_LINKMAP } from '../fixtures/conversation-thread-data';
import { DEEP_LINK_ALIASES } from '../registryModel';

describe('conversation reference chips', () => {
  it('every chip kind opens a screen in the release', () => {
    const locked = Object.entries(CT_LINKMAP)
      .map(([kind, target]) => [kind, DEEP_LINK_ALIASES[target] ?? target] as const)
      .filter(([, surface]) => !LAUNCH_SURFACE_IDS.has(surface) && !(surface in LAUNCH_SHELL_SURFACES))
      .map(([kind, surface]) => `${kind} → ${surface}`);
    expect(locked).toEqual([]);
  });

  it('evidence opens the Vault and a module opens the project', () => {
    expect(CT_LINKMAP.evidence).toBe('vault');
    expect(CT_LINKMAP.module).toBe('project-home');
  });
});
