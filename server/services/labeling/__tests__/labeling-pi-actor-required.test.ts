/**
 * A label section is written and agency text adopted by a person, never by "system".
 *
 * upsertLabelingPiSection and acceptAgencyText took `String(userId ?? 'system')`
 * as the actor, so a request with no resolvable user approved agency-proposed
 * label text (status 'approved') and authored sections under the name
 * "system". Only the database is replaced; nothing may be written.
 */
import { describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock('../../../db', () => ({ pool: { connect: h.connect, query: vi.fn() } }));
vi.mock('../../../db.js', () => ({ pool: { connect: h.connect, query: vi.fn() } }));

import { acceptAgencyText, upsertLabelingPiSection } from '../labeling-pi-service';

describe('labeling PI writes', () => {
  it('refuses to adopt agency text with no person to attribute it to', async () => {
    await expect(acceptAgencyText(5, '1', { userId: null })).rejects.toThrow(/person/i);
    expect(h.connect).not.toHaveBeenCalled();
  });

  it('refuses to record a section with no author', async () => {
    await expect(upsertLabelingPiSection(5, { sectionNo: '1', label: 'Indications', createdBy: null } as never))
      .rejects.toThrow(/person/i);
    expect(h.connect).not.toHaveBeenCalled();
  });
});
