/**
 * The package content fingerprint: what a bundle was built from, compared by
 * the transmit gate. Each covered field is shown to CHANGE the fingerprint
 * (a fingerprint blind to a field would pass a drifted bundle), and the DB
 * reader is shown to produce the same rows assemble builds in memory — with a
 * SQL-side content digest, so transmit never transports artifact content.
 */
import { describe, it, expect } from 'vitest';
import {
  assessPackageContent,
  fingerprintPackageContent,
  isCurrentContentFingerprint,
  readPackageContentRows,
  sha256Hex,
  CONTENT_FINGERPRINT_VERSION,
  type PackageContentRow,
} from '../package-content-fingerprint';

const ROWS: PackageContentRow[] = [
  { sectionDbId: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', artifactDbId: 1, title: 'Clinical overview', version: 1, ctdSection: null, contentSha256: sha256Hex('Clinical overview text') },
  { sectionDbId: 14, sectionKey: 'module3_cmc', sectionLabel: 'Module 3', artifactDbId: 2, title: 'Description', version: 3, ctdSection: '3.2.P.1', contentSha256: sha256Hex('Description') },
  { sectionDbId: 15, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null },
];
const fp = (rows: PackageContentRow[]) => fingerprintPackageContent(rows);
const sqlRows = (rows: PackageContentRow[]) =>
  rows.map((r) => ({
    section_db_id: r.sectionDbId, section_key: r.sectionKey, section_label: r.sectionLabel,
    artifact_db_id: r.artifactDbId, title: r.title, version: r.version, ctd_section: r.ctdSection, content_sha256: r.contentSha256,
  }));

describe('fingerprintPackageContent', () => {
  it('is deterministic, order-independent and versioned', () => {
    expect(fp(ROWS)).toBe(fp(ROWS));
    expect(fp([...ROWS].reverse())).toBe(fp(ROWS));
    expect(CONTENT_FINGERPRINT_VERSION).toBe('v2');
    expect(fp(ROWS)).toMatch(new RegExp(`^${CONTENT_FINGERPRINT_VERSION}:[0-9a-f]{64}$`));
    expect(isCurrentContentFingerprint(fp(ROWS))).toBe(true);
    for (const bad of [undefined, null, '', 'v1:' + 'a'.repeat(64), 'v0:' + 'a'.repeat(64), 'a'.repeat(64), 42]) {
      expect(isCurrentContentFingerprint(bad), String(bad)).toBe(false);
    }
  });

  it('CHANGES for every covered field: content, title, version, declared placement, section key, section label, a mapping added or removed, an empty section', () => {
    const base = fp(ROWS);
    const edit = (id: number, patch: Partial<PackageContentRow>) => ROWS.map((r) => (r.artifactDbId === id ? { ...r, ...patch } : r));
    const variants = [
      edit(1, { contentSha256: sha256Hex('Clinical overview text (edited)') }),          // content
      edit(1, { title: 'Clinical overview, renamed' }),                                  // leaf title (index.xml, PDF heading)
      edit(1, { version: 2 }),                                                           // version (leaf heading)
      edit(2, { ctdSection: '3.2.P.2' }),                                                // declared placement
      ROWS.map((r) => (r.sectionDbId === 14 ? { ...r, sectionKey: 'module3' } : r)),    // section key (placement)
      ROWS.map((r) => (r.sectionDbId === 14 ? { ...r, sectionLabel: 'Module 3 CMC' } : r)), // section label (leaf title)
      ROWS.filter((r) => r.artifactDbId !== 2).concat({ sectionDbId: 14, sectionKey: 'module3_cmc', sectionLabel: 'Module 3', artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null }), // unmapped
      ROWS.concat({ sectionDbId: 15, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', artifactDbId: 9, title: 'Cover', version: 1, ctdSection: null, contentSha256: sha256Hex('Cover letter') }), // mapped
      ROWS.filter((r) => r.sectionDbId !== 15),                                          // section gone
    ].map(fp);
    for (const v of variants) expect(v).not.toBe(base);
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('cannot be forged through a key containing the separator or a newline', () => {
    const row = (sectionKey: string): PackageContentRow =>
      ({ sectionDbId: 1, sectionKey, sectionLabel: 'x', artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null });
    expect(fp([row('x"]\n["y')])).not.toBe(fp([row('x'), row('y')]));
  });
});

describe('assessPackageContent', () => {
  const clientFor = (rows: PackageContentRow[]) => {
    const spy = { calls: 0, query: async (_sql: string, _params: unknown[]) => { spy.calls += 1; return { rows: sqlRows(rows) }; } };
    return spy;
  };

  it('matches when the package still holds what the bundle was built from, and reports DRIFT with both fingerprints when it does not', async () => {
    const assembled = fp(ROWS);
    expect(await assessPackageContent(clientFor(ROWS), 5, 99, assembled)).toEqual({ state: 'match', current: assembled });
    const edited = ROWS.map((r) => (r.artifactDbId === 1 ? { ...r, contentSha256: sha256Hex('edited') } : r));
    const drift = await assessPackageContent(clientFor(edited), 5, 99, assembled);
    expect(drift).toEqual({ state: 'drift', current: fp(edited), assembled });
  });

  it('is UNPROVEN, without reading anything, for a missing or older-scheme fingerprint', async () => {
    for (const stored of [undefined, null, '', 'v1:' + 'a'.repeat(64), 'a'.repeat(64)]) {
      const client = clientFor(ROWS);
      expect(await assessPackageContent(client, 5, 99, stored), String(stored)).toEqual({ state: 'unproven' });
      expect(client.calls).toBe(0);
    }
  });
});

describe('readPackageContentRows', () => {
  it('reads the package’s sections with this org’s mappings joined to their artifacts, in the shape assemble builds, transporting a content DIGEST rather than content', async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        // pg returns integer columns as numbers but a driver may hand back strings; both are normalised.
        return { rows: sqlRows(ROWS).map((r, i) => (i === 1 ? { ...r, artifact_db_id: '2', version: '3' } : r)) };
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
    // The digest is computed in the database over the same bytes JS hashes;
    // the content itself never travels to the transmit step.
    expect(sql).toMatch(/encode\(sha256\(convert_to\(coalesce\(a\.content, ''\), 'UTF8'\)\), 'hex'\) AS content_sha256/);
    // The only reference to the content column is inside that digest expression.
    expect(sql.match(/\ba\.content\b/g)).toHaveLength(1);
    expect(sql).not.toMatch(/\bma\.content\b(?!_sha256)/);
  });
});
