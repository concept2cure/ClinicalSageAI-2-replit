/**
 * The package content fingerprint: what a bundle was built from, compared by
 * the transmit gate. Each covered field is shown to CHANGE the fingerprint
 * (a fingerprint blind to a field would pass a drifted bundle), and the DB
 * reader is shown to produce the same rows assemble builds in memory.
 */
import { describe, it, expect } from 'vitest';
import {
  assessPackageContent,
  fingerprintPackageContent,
  isCurrentContentFingerprint,
  readPackageContentRows,
  CONTENT_FINGERPRINT_VERSION,
  type PackageContentRow,
} from '../package-content-fingerprint';

const ROWS: PackageContentRow[] = [
  { sectionDbId: 13, sectionKey: '2.5', artifactDbId: 1, ctdSection: null, content: 'Clinical overview text' },
  { sectionDbId: 14, sectionKey: 'module3_cmc', artifactDbId: 2, ctdSection: '3.2.P.1', content: 'Description' },
  { sectionDbId: 15, sectionKey: 'cover-letter', artifactDbId: null, ctdSection: null, content: null },
];
const fp = (rows: PackageContentRow[]) => fingerprintPackageContent(rows);

describe('fingerprintPackageContent', () => {
  it('is deterministic, order-independent and versioned', () => {
    expect(fp(ROWS)).toBe(fp(ROWS));
    expect(fp([...ROWS].reverse())).toBe(fp(ROWS));
    expect(fp(ROWS)).toMatch(new RegExp(`^${CONTENT_FINGERPRINT_VERSION}:[0-9a-f]{64}$`));
    expect(isCurrentContentFingerprint(fp(ROWS))).toBe(true);
    for (const bad of [undefined, null, '', 'v0:' + 'a'.repeat(64), 'a'.repeat(64), 42]) {
      expect(isCurrentContentFingerprint(bad), String(bad)).toBe(false);
    }
  });

  it('CHANGES for every covered field: artifact content, declared placement, section key, a mapping added or removed, an empty section', () => {
    const base = fp(ROWS);
    const edited = ROWS.map((r) => (r.artifactDbId === 1 ? { ...r, content: 'Clinical overview text (edited)' } : r));
    const replaced = ROWS.map((r) => (r.artifactDbId === 2 ? { ...r, ctdSection: '3.2.P.2' } : r));
    const renamed = ROWS.map((r) => (r.sectionDbId === 14 ? { ...r, sectionKey: 'module3' } : r));
    const unmapped = ROWS.filter((r) => r.artifactDbId !== 2).concat({ sectionDbId: 14, sectionKey: 'module3_cmc', artifactDbId: null, ctdSection: null, content: null });
    const mapped = ROWS.concat({ sectionDbId: 15, sectionKey: 'cover-letter', artifactDbId: 9, ctdSection: null, content: 'Cover letter' });
    const sectionGone = ROWS.filter((r) => r.sectionDbId !== 15);
    const variants = [edited, replaced, renamed, unmapped, mapped, sectionGone].map(fp);
    for (const v of variants) expect(v).not.toBe(base);
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('cannot be forged through a key containing the separator or a newline', () => {
    const a = fp([{ sectionDbId: 1, sectionKey: 'x"]\n["y', artifactDbId: null, ctdSection: null, content: null }]);
    const b = fp([
      { sectionDbId: 1, sectionKey: 'x', artifactDbId: null, ctdSection: null, content: null },
      { sectionDbId: 1, sectionKey: 'y', artifactDbId: null, ctdSection: null, content: null },
    ]);
    expect(a).not.toBe(b);
  });
});

describe('assessPackageContent', () => {
  const sqlRows = (rows: PackageContentRow[]) =>
    rows.map((r) => ({ section_db_id: r.sectionDbId, section_key: r.sectionKey, artifact_db_id: r.artifactDbId, ctd_section: r.ctdSection, content: r.content }));
  const clientFor = (rows: PackageContentRow[]) => {
    const query = async (_sql: string, _params: unknown[]) => ({ rows: sqlRows(rows) });
    const spy = { calls: 0, query: async (sql: string, params: unknown[]) => { spy.calls += 1; return query(sql, params); } };
    return spy;
  };

  it('matches when the package still holds what the bundle was built from, and reports DRIFT with both fingerprints when it does not', async () => {
    const assembled = fp(ROWS);
    expect(await assessPackageContent(clientFor(ROWS), 5, 99, assembled)).toEqual({ state: 'match', current: assembled });
    const edited = ROWS.map((r) => (r.artifactDbId === 1 ? { ...r, content: 'edited' } : r));
    const drift = await assessPackageContent(clientFor(edited), 5, 99, assembled);
    expect(drift).toEqual({ state: 'drift', current: fp(edited), assembled });
  });

  it('is UNPROVEN, without reading anything, for a missing or older-scheme fingerprint', async () => {
    for (const stored of [undefined, null, '', 'v0:' + 'a'.repeat(64), 'a'.repeat(64)]) {
      const client = clientFor(ROWS);
      expect(await assessPackageContent(client, 5, 99, stored), String(stored)).toEqual({ state: 'unproven' });
      expect(client.calls).toBe(0);
    }
  });
});

describe('readPackageContentRows', () => {
  it('reads the package’s sections with this org’s mappings joined to their artifacts, in the shape assemble builds', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return {
          rows: [
            { section_db_id: 13, section_key: '2.5', artifact_db_id: 1, ctd_section: null, content: 'Clinical overview text' },
            { section_db_id: 14, section_key: 'module3_cmc', artifact_db_id: '2', ctd_section: '3.2.P.1', content: 'Description' },
            { section_db_id: 15, section_key: 'cover-letter', artifact_db_id: null, ctd_section: null, content: null },
          ],
        };
      },
    };
    const rows = await readPackageContentRows(client, 5, 99);
    expect(rows).toEqual(ROWS);
    expect(fingerprintPackageContent(rows)).toBe(fp(ROWS));
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual([5, 99]);
    const sql = calls[0].sql;
    expect(sql).toMatch(/s\.package_db_id = \$1/);
    expect(sql).toMatch(/m\.org_id = \$2/);
    expect(sql).toMatch(/LEFT JOIN/); // an unmapped section is still a row
    expect(sql).toMatch(/JOIN concept2cure_artifacts a ON a\.id = m\.artifact_id/); // a mapping without an artifact is skipped
  });
});
