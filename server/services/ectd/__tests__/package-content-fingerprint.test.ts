/**
 * The package content fingerprint: what a bundle was built from, compared by
 * the transmit gate. Each covered field is shown to CHANGE the fingerprint
 * (a fingerprint blind to a field would pass a drifted bundle), and the DB
 * reader is shown to produce the same rows assemble builds in memory — with a
 * SQL-side content digest, so transmit never transports artifact content.
 */
import { describe, it, expect } from 'vitest';
import {
  artifactApproval,
  assessPackageContent,
  fingerprintPackageContent,
  isCurrentContentFingerprint,
  readPackageContentRows,
  sha256Hex,
  unprovenMessage,
  CONTENT_FINGERPRINT_VERSION,
  type PackageContentRow,
} from '../package-content-fingerprint';

const ROWS: PackageContentRow[] = [
  { sectionDbId: 13, sectionKey: '2.5', sectionLabel: 'Clinical Overview', sortOrder: 0, artifactDbId: 1, title: 'Clinical overview', version: 1, ctdSection: null, contentSha256: sha256Hex('Clinical overview text'), filable: true },
  { sectionDbId: 14, sectionKey: 'module3_cmc', sectionLabel: 'Module 3', sortOrder: 0, artifactDbId: 2, title: 'Description', version: 3, ctdSection: '3.2.P.1', contentSha256: sha256Hex('Description'), filable: true },
  { sectionDbId: 15, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0, artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null, filable: null },
];
const fp = (rows: PackageContentRow[]) => fingerprintPackageContent(rows);
/** The columns the reader selects. 2026-09-23 (W5/D7, round-2 skeptic): the
 *  approval facts are read too — a filable row is approved AT its current
 *  version (what the status route records), an unfilable one is in review. */
const sqlRows = (rows: PackageContentRow[]) =>
  rows.map((r) => ({
    section_db_id: r.sectionDbId, section_key: r.sectionKey, section_label: r.sectionLabel, sort_order: r.sortOrder,
    artifact_db_id: r.artifactDbId, title: r.title, version: r.version, ctd_section: r.ctdSection, content_sha256: r.contentSha256,
    status: r.filable == null ? null : r.filable ? 'approved' : 'review',
    approved_version_id: r.filable ? r.version : null,
    published_version_id: null,
  }));

describe('fingerprintPackageContent', () => {
  it('is deterministic, independent of the order rows ARRIVE in, and versioned', () => {
    expect(fp(ROWS)).toBe(fp(ROWS));
    // Independent of row arrival order — which is not the same as being blind
    // to the sortOrder VALUE (covered below).
    expect(fp([...ROWS].reverse())).toBe(fp(ROWS));
    // v4 (2026-09-23, W5/D7, round-2 skeptic): each artifact's approval is covered.
    expect(CONTENT_FINGERPRINT_VERSION).toBe('v4');
    expect(fp(ROWS)).toMatch(new RegExp(`^${CONTENT_FINGERPRINT_VERSION}:[0-9a-f]{64}$`));
    expect(isCurrentContentFingerprint(fp(ROWS))).toBe(true);
    // Every earlier scheme reads as unproven, never as a match or a drift.
    for (const bad of [undefined, null, '', 'v3:' + 'a'.repeat(64), 'v2:' + 'a'.repeat(64), 'v1:' + 'a'.repeat(64), 'v0:' + 'a'.repeat(64), 'a'.repeat(64), 42]) {
      expect(isCurrentContentFingerprint(bad), String(bad)).toBe(false);
    }
  });

  it('CHANGES for every covered field: content, title, version, declared placement, section key, section label, section order, a mapping added or removed, an empty section', () => {
    const base = fp(ROWS);
    const edit = (id: number, patch: Partial<PackageContentRow>) => ROWS.map((r) => (r.artifactDbId === id ? { ...r, ...patch } : r));
    const variants = [
      edit(1, { contentSha256: sha256Hex('Clinical overview text (edited)') }),          // content
      edit(1, { title: 'Clinical overview, renamed' }),                                  // leaf title (index.xml, PDF heading)
      edit(1, { version: 2 }),                                                           // version (leaf heading)
      edit(2, { ctdSection: '3.2.P.2' }),                                                // declared placement
      edit(1, { filable: false }),                                                       // approval revoked (2026-09-23, W5/D7, round-2 skeptic)
      ROWS.map((r) => (r.sectionDbId === 14 ? { ...r, sectionKey: 'module3' } : r)),    // section key (placement)
      ROWS.map((r) => (r.sectionDbId === 14 ? { ...r, sectionLabel: 'Module 3 CMC' } : r)), // section label (leaf title)
      ROWS.map((r) => (r.sectionDbId === 14 ? { ...r, sortOrder: 5 } : r)),                // section order (leaf order in index.xml)
      ROWS.filter((r) => r.artifactDbId !== 2).concat({ sectionDbId: 14, sectionKey: 'module3_cmc', sectionLabel: 'Module 3', sortOrder: 0, artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null, filable: null }), // unmapped
      ROWS.concat({ sectionDbId: 15, sectionKey: 'cover-letter', sectionLabel: 'Cover Letter', sortOrder: 0, artifactDbId: 9, title: 'Cover', version: 1, ctdSection: null, contentSha256: sha256Hex('Cover letter'), filable: true }), // mapped
      ROWS.filter((r) => r.sectionDbId !== 15),                                          // section gone
    ].map(fp);
    for (const v of variants) expect(v).not.toBe(base);
    expect(new Set(variants).size).toBe(variants.length);
  });

  it('cannot be forged through a key containing the separator or a newline', () => {
    const row = (sectionKey: string): PackageContentRow =>
      ({ sectionDbId: 1, sectionKey, sectionLabel: 'x', sortOrder: 0, artifactDbId: null, title: null, version: null, ctdSection: null, contentSha256: null, filable: null });
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

  it('is UNPROVEN, without reading anything, for a missing or older-scheme fingerprint — and says WHICH', async () => {
    // A version bump makes every stored descriptor unproven at once, so "no
    // fingerprint" and "a fingerprint this build cannot compare" must not be
    // reported in the same words: only one of them is true of those bundles.
    for (const stored of [undefined, null, '', 'a'.repeat(64), 42]) {
      const client = clientFor(ROWS);
      expect(await assessPackageContent(client, 5, 99, stored), String(stored)).toEqual({ state: 'unproven', reason: 'absent' });
      expect(client.calls).toBe(0);
    }
    // 'v3' is every bundle assembled before approval was covered (2026-09-23,
    // W5/D7, round-2 skeptic): it reads as older-scheme — refused where
    // descriptor trust is enforced, with the re-assemble remedy — never as a
    // spurious drift and never as a match.
    for (const stored of ['v1:' + 'a'.repeat(64), 'v2:' + 'b'.repeat(64), 'v3:' + 'c'.repeat(64)]) {
      const client = clientFor(ROWS);
      expect(await assessPackageContent(client, 5, 99, stored), stored).toEqual({ state: 'unproven', reason: 'older-scheme' });
      expect(client.calls).toBe(0);
    }
  });

  it('the two unproven wordings each say what is actually true of the bundle', () => {
    expect(unprovenMessage('absent')).toMatch(/records no content fingerprint/);
    expect(unprovenMessage('older-scheme')).toMatch(/fingerprinted under an older scheme than v4/);
    for (const reason of ['absent', 'older-scheme'] as const) {
      expect(unprovenMessage(reason)).toMatch(/UNKNOWN/);
      expect(unprovenMessage(reason)).toMatch(/re-assemble the package before transmitting/);
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
        return { rows: sqlRows(ROWS).map((r, i) => (i === 1 ? { ...r, artifact_db_id: '2', version: '3', approved_version_id: '3' } : r)) };
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
    // The approval facts the filability rule reads (2026-09-23, W5/D7, round-2 skeptic).
    expect(sql).toMatch(/a\.status/);
    expect(sql).toMatch(/a\.approved_version_id/);
    expect(sql).toMatch(/a\.published_version_id/);
  });

  it('reads an approval revoked, or an approved artifact edited, as a different row — so the transmit recompute reports DRIFT', async () => {
    const withArtifact1 = (patch: Record<string, unknown>) => ({
      query: async () => ({ rows: sqlRows(ROWS).map((r) => (r.artifact_db_id === 1 ? { ...r, ...patch } : r)) }),
    });
    const assembled = fp(ROWS);
    expect((await assessPackageContent(withArtifact1({}), 5, 99, assembled)).state).toBe('match');
    // approved → review, no content change.
    expect((await assessPackageContent(withArtifact1({ status: 'review' }), 5, 99, assembled)).state).toBe('drift');
    // locked → draft.
    expect((await assessPackageContent(withArtifact1({ status: 'draft' }), 5, 99, assembled)).state).toBe('drift');
    // approved → locked at the SAME version is still the approved content: no spurious drift.
    expect((await assessPackageContent(withArtifact1({ status: 'locked', published_version_id: 1 }), 5, 99, assembled)).state).toBe('match');
  });
});

/* 2026-09-23 (W5/D7, round-2 skeptic). concept2cure_artifacts.status alone does
 * not say the current content was approved: PUT …/artifacts/:id refuses edits
 * only when 'locked', and rollback, the AnA vault content update and the AnA
 * draft-version store bump `version` without touching status. The status route
 * records the version it approved (approved_version_id) and the version it
 * locked (published_version_id); filable means the current version IS that one. */
describe('artifactApproval — the one filability rule for a concept2cure artifact', () => {
  const facts = (status: string | null, version: number, approvedVersionId: number | null, publishedVersionId: number | null = null) =>
    artifactApproval({ status, version, approvedVersionId, publishedVersionId });

  it('is filable only when approved at its approved version, or locked at the version that was both approved and locked', () => {
    expect(facts('approved', 1, 1)).toEqual({ filable: true });
    // 2026-09-23 (W5/D7, round-2 skeptic): this line read facts('locked', 2, 1, 2)
    // → filable and so pinned the defect — approved v1, edited to v2 (status
    // stays 'approved'), then locked at v2 — as correct. See the lock case below.
    expect(facts('locked', 2, 2, 2)).toEqual({ filable: true });
    // Values as a driver may hand them back.
    expect(artifactApproval({ status: 'APPROVED', version: '3', approvedVersionId: '3', publishedVersionId: null })).toEqual({ filable: true });
  });

  it('an approved artifact edited after approval is NOT filable, and says so with both versions', () => {
    const a = facts('approved', 2, 1);
    expect(a.filable).toBe(false);
    if (a.filable) return;
    expect(a.reason).toBe('edited-after-approval');
    expect(a.problem).toMatch(/edited after approval/);
    expect(a.problem).toMatch(/v2/);
    expect(a.problem).toMatch(/v1/);
    // A locked artifact is bound to the version it was LOCKED at, not approved at.
    const l = facts('locked', 3, 3, 2);
    expect(l.filable).toBe(false);
    if (!l.filable) expect(l.reason).toBe('edited-after-approval');
  });

  /* 2026-09-23 (W5/D7, round-2 skeptic). The status route and the
   * authoring-actions lock both allow approved → locked after checking only
   * status === 'approved', and both record publishedVersionId = the CURRENT
   * version. So approved v1 → PUT edit to v2 (status stays 'approved') → lock
   * records published v2, and a rule that judged a locked artifact by
   * publishedVersionId alone called the never-reviewed v2 filable. */
  it('approved v1, edited to v2, then LOCKED at v2 is NOT filable: the locked version was never approved', () => {
    const l = facts('locked', 2, 1, 2);
    expect(l.filable).toBe(false);
    if (l.filable) return;
    expect(l.reason).toBe('edited-after-approval');
    expect(l.problem).toMatch(/approved version is v1/);
    expect(l.problem).toMatch(/locked at v2/);
    // Its remedy is the full path back: unlock, review, approve, lock again.
    expect(l.remedy).toMatch(/locked → draft/);
    expect(l.remedy).toMatch(/review → approved/);
    expect(l.remedy).toMatch(/approved → locked/);
    // A lock with no recorded approval is no proof either.
    const n = facts('locked', 2, null, 2);
    expect(n.filable).toBe(false);
    if (!n.filable) expect(n.reason).toBe('no-approved-version');
  });

  /* 2026-09-23 (W5/D7, round-2 skeptic). 'approved → approved' is not a valid
   * transition, so "approve it again" alone is not an action an operator can
   * take: the remedy names the demotion first. */
  it('names a remedy an operator can actually perform, per reason', () => {
    const edited = facts('approved', 2, 1);
    const unrecorded = facts('approved', 1, null);
    const draft = facts('draft', 1, null);
    for (const a of [edited, unrecorded]) {
      expect(a.filable).toBe(false);
      if (a.filable) continue;
      expect(a.remedy).toMatch(/approved → review/);
      expect(a.remedy).toMatch(/review → approved/);
    }
    expect(draft.filable).toBe(false);
    if (!draft.filable) {
      expect(draft.remedy).toMatch(/review/);
      expect(draft.remedy).not.toMatch(/approved → review/);
    }
  });

  it('an approval that recorded no version cannot be shown to cover the current content: not filable', () => {
    const a = facts('approved', 1, null);
    expect(a.filable).toBe(false);
    if (!a.filable) {
      expect(a.reason).toBe('no-approved-version');
      expect(a.problem).toMatch(/no approved version is recorded/);
    }
    const l = facts('locked', 1, 1, null);
    expect(l.filable).toBe(false);
    if (!l.filable) expect(l.reason).toBe('no-approved-version');
  });

  it('any status outside approved | locked is not filable, whatever the versions say', () => {
    for (const s of ['draft', 'review', 'archived', 'published', '', null]) {
      const a = facts(s, 1, 1, 1);
      expect(a.filable, String(s)).toBe(false);
      if (!a.filable) expect(a.reason).toBe('not-approved');
    }
  });
});
