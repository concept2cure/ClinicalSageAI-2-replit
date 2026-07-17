// @vitest-environment jsdom
/**
 * v2 Labeling surface — live labeling_translations → LabelTranslation mapping.
 *
 * GET /api/mdx/labeling/:id/translations returns raw labeling_translations rows
 * (DB columns: translation_method, back_translation_verified, …). The board
 * renders labelled LabelTranslations. This locks the bridge so an org's real
 * translation set actually loads instead of the surface silently staying on its
 * Sample fixture:
 *   • a real row maps onto the display contract; method/btv/status come straight
 *     from the write-path columns;
 *   • `name` (which has no column) is derived from the language via Intl, the
 *     same display-label role addTrans gives it;
 *   • anything that isn't a well-formed, non-empty translations list maps to
 *     null so the surface fails closed to its honest fixture.
 */
import { describe, it, expect } from 'vitest';
import { mapLabelTranslations } from '../surfaces/Labeling';

// A labeling_translations row as GET .../translations (SELECT *) returns it.
const DB_ROW = {
  id: 91,
  labeling_document_id: 4,
  organization_id: 7,
  language: 'de',
  translator: 'A. Muster',
  translation_method: 'human',
  back_translation_verified: true,
  status: 'approved',
  artifact_id: null,
  metadata: {},
};

describe('mapLabelTranslations — live labeling_translations adoption', () => {
  it('maps a translations row onto the LabelTranslation display contract', () => {
    const out = mapLabelTranslations([DB_ROW]);
    expect(out).not.toBeNull();
    expect(out).toHaveLength(1);
    const t = out![0];
    expect(t.id).toBe('91');
    expect(t.language).toBe('de');
    expect(t.method).toBe('human');
    expect(t.btv).toBe(true);
    expect(t.status).toBe('approved');
  });

  it('derives the display name from the language code via Intl', () => {
    expect(mapLabelTranslations([DB_ROW])![0].name).toBe('German');
    expect(mapLabelTranslations([{ ...DB_ROW, language: 'fr' }])![0].name).toBe('French');
  });

  it('passes an unresolvable language through as its own name (never blank)', () => {
    // A value already stored as a name, or a non-code, round-trips unchanged.
    const r = mapLabelTranslations([{ ...DB_ROW, language: 'Klingon' }])![0];
    expect(r.name).toBe('Klingon');
    expect(r.language).toBe('Klingon');
  });

  it('defaults method and reads btv strictly as a boolean', () => {
    const r = mapLabelTranslations([
      { ...DB_ROW, translation_method: null, back_translation_verified: null },
    ])![0];
    expect(r.method).toBe('machine');
    expect(r.btv).toBe(false);
  });

  // ── fail-closed: anything not a clean translations list → null → keep fixture ──
  it('rejects an empty list', () => {
    expect(mapLabelTranslations([])).toBeNull();
  });

  it('rejects the display fixture shape (has method/btv, not the DB columns)', () => {
    const fixtureRow = { id: 'TR-de', language: 'de', name: 'German', method: 'human', btv: true, status: 'approved' };
    expect(mapLabelTranslations([fixtureRow])).toBeNull();
  });

  it('rejects a row missing the language/status signature', () => {
    expect(mapLabelTranslations([{ translation_method: 'human', back_translation_verified: true }])).toBeNull();
  });

  it('rejects the whole batch if any row is not a translations row', () => {
    expect(mapLabelTranslations([DB_ROW, { language: 'fr' /* no status/columns */ }])).toBeNull();
  });

  it('unwraps the { data } envelope and rejects non-list / nullish payloads', () => {
    expect(mapLabelTranslations({ data: [DB_ROW] })).toHaveLength(1);
    expect(mapLabelTranslations(null)).toBeNull();
    expect(mapLabelTranslations({})).toBeNull();
    expect(mapLabelTranslations('nope')).toBeNull();
  });
});
