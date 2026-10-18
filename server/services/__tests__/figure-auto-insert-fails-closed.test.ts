/**
 * A figure analysis that did not run is not "no figures to insert".
 *
 * autoInsertFigures caught every failure — the model call, an unreadable
 * answer — and returned [], which its route answered as success with no
 * figures. The database and the model client are the only things replaced.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const S = vi.hoisted(() => ({ chat: vi.fn() }));
vi.mock('../../db.js', () => ({ pool: { query: async () => ({ rows: [] }) } }));
vi.mock('../auditService', () => ({ default: { logAction: async () => undefined } }));
vi.mock('../provenance/artifact-provenance', () => ({ recordArtifactProvenance: async () => undefined }));
vi.mock('../../lib/unified-ai-client', () => ({ ai: { chat: S.chat } }));

import { autoInsertFigures } from '../figureGenerationService';

const PARAMS = { projectId: 5, organizationId: 9, userId: 1, sectionCode: '2.7.3', sectionContent: 'ORR was 41% vs 12%.' };

// Braces: a function returned from beforeEach is run as its teardown.
beforeEach(() => {
  S.chat.mockReset();
});

describe('autoInsertFigures', () => {
  it('fails when the analysis call fails', async () => {
    S.chat.mockRejectedValue(new Error('model gateway unavailable'));
    await expect(autoInsertFigures(PARAMS)).rejects.toThrow(/model gateway unavailable/);
  });

  it('fails when the analysis answer cannot be read', async () => {
    S.chat.mockResolvedValue({ content: 'Sure! Here are some figures you might add…' });
    await expect(autoInsertFigures(PARAMS)).rejects.toThrow(/no readable suggestions/);
  });

  it('answers [] only when the analysis ran and suggested nothing', async () => {
    S.chat.mockResolvedValue({ content: JSON.stringify({ figures: [] }) });
    await expect(autoInsertFigures(PARAMS)).resolves.toEqual([]);
  });
});
