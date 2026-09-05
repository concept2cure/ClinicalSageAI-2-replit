import { describe, it, expect } from 'vitest';
import { sectionsToLeaves, type DeviceSectionInput } from '../estar-content-leaves';

const REAL_CONTENT =
  'The device is a Class II electrosurgical generator intended for cutting and coagulation of soft tissue during general surgical procedures, validated against IEC 60601 series standards.';

describe('sectionsToLeaves (authored content → readiness leaves)', () => {
  it('turns only content-bearing sections into leaves (a gap is never invented)', () => {
    const sections: DeviceSectionInput[] = [
      { sectionNumber: '1', sectionTitle: 'Device Description', category: 'device-description', status: 'approved', content: REAL_CONTENT },
      { sectionNumber: '2', sectionTitle: 'Labeling', category: 'labeling', content: '   ' }, // whitespace only → not authored
      { sectionNumber: '3', sectionTitle: 'Biocompatibility', category: 'biocompatibility', status: 'approved', content: null }, // status but no content → not a leaf
    ];
    const leaves = sectionsToLeaves(sections);
    expect(leaves).toHaveLength(1);
    expect(leaves[0]).toMatchObject({ sectionCode: '1', title: 'Device Description', documentType: 'device_description', substantive: true });
  });

  it('honesty fix: a section still in draft/in-review status is built with substantive:false, no matter how long its body is', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '4', sectionTitle: 'Performance Testing', category: 'performance_testing', status: 'draft', content: REAL_CONTENT },
    ]);
    expect(leaf.substantive).toBe(false);
  });

  it.each(['drafting', 'ready_for_review', 'ready-for-review', 'in-review'])(
    'an AI-drafted section with status %s is not substantive',
    (status) => {
      // write_kit_section defaults to 'drafting' and accepts only
      // drafting | ready_for_review | in_review, and rejects bodies under 40
      // characters — the same floor as MIN_SUBSTANTIVE_CONTENT_LENGTH. Only
      // 'in_review' was in DRAFT_STATUSES, so every AI draft fell through to
      // the length branch and passed it by construction: machine-written,
      // unreviewed content marked its eSTAR sections present and drove
      // contentReady / canFileNow true.
      const [leaf] = sectionsToLeaves([
        { sectionNumber: '4', sectionTitle: 'Performance Testing', category: 'performance_testing', status, content: REAL_CONTENT },
      ]);
      expect(leaf.substantive).toBe(false);
    },
  );

  it('honesty fix: a bare placeholder body ("TBD") is built with substantive:false even when status is approved', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '5', sectionTitle: 'Performance Testing', category: 'performance_testing', status: 'approved', content: 'TBD' },
    ]);
    // Still a leaf (content is non-empty) — but honestly marked as not substantive.
    expect(leaf).toBeDefined();
    expect(leaf.substantive).toBe(false);
  });

  it('honesty fix: a short stub with no status signal is not substantive (content-length fallback)', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '6', sectionTitle: 'Performance Testing', category: 'performance_testing', content: 'short stub' },
    ]);
    expect(leaf.substantive).toBe(false);
  });

  it('a finalized status with a real, non-trivial body is substantive', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '7', sectionTitle: 'Performance Testing', category: 'performance_testing', status: 'final', content: REAL_CONTENT },
    ]);
    expect(leaf.substantive).toBe(true);
  });

  it('with no status signal at all, a long real body is still substantive (content-length fallback)', () => {
    const [leaf] = sectionsToLeaves([
      { sectionNumber: '8', sectionTitle: 'Performance Testing', category: 'performance_testing', content: REAL_CONTENT },
    ]);
    expect(leaf.substantive).toBe(true);
  });

  it('normalizes category/key into a canonical documentType token', () => {
    const leaves = sectionsToLeaves([
      { sectionNumber: '5', sectionTitle: 'Perf', category: 'Performance Testing', content: 'x' },
      { sectionNumber: '6', sectionTitle: 'SE', category: 'substantial-equivalence', content: 'y' },
    ]);
    expect(leaves[0].documentType).toBe('performance_testing');
    expect(leaves[1].documentType).toBe('substantial_equivalence');
  });

  it('falls back to sectionKey for code/title/type when fields are missing', () => {
    const leaves = sectionsToLeaves([{ sectionKey: 'cover_letter', content: 'Dear FDA' }]);
    expect(leaves[0]).toMatchObject({ sectionCode: 'cover_letter', title: 'cover_letter', documentType: 'cover_letter' });
  });

  it('the produced leaves drive the eSTAR mapper (real, finalized content → readiness)', async () => {
    // A realistic authored 510(k) section set (finalized, non-placeholder
    // content) → leaves → the 510(k) mapper sees them as present.
    const { mapToEstar } = await import('../estar-mapper');
    const leaves = sectionsToLeaves([
      { sectionNumber: '1', sectionTitle: 'Cover letter', category: 'cover_letter', status: 'approved', content: REAL_CONTENT },
      { sectionNumber: '2', sectionTitle: 'Indications for use', category: 'indications_for_use', status: 'approved', content: REAL_CONTENT },
      { sectionNumber: '3', sectionTitle: 'Device description', category: 'device_description', status: 'approved', content: REAL_CONTENT },
    ]);
    const r = mapToEstar({ leaves, type: '510k' });
    expect(r.sections.find((s) => s.id === 'device-description')?.present).toBe(true);
    expect(r.sections.find((s) => s.id === 'cover-letter')?.present).toBe(true);
  });

  it('honesty fix: a draft-status 510(k) section does NOT drive the eSTAR mapper to present, even though its title matches', async () => {
    const { mapToEstar } = await import('../estar-mapper');
    const leaves = sectionsToLeaves([
      { sectionNumber: '1', sectionTitle: 'Device description', category: 'device_description', status: 'draft', content: REAL_CONTENT },
    ]);
    const r = mapToEstar({ leaves, type: '510k' });
    expect(r.sections.find((s) => s.id === 'device-description')?.present).toBe(false);
  });

  it('handles empty / non-array input safely', () => {
    expect(sectionsToLeaves([])).toEqual([]);
    expect(sectionsToLeaves(undefined as unknown as DeviceSectionInput[])).toEqual([]);
  });
});

// ── ESTAR-01 / ESTAR-02: the governed store, keyed by program ─────────────────
//
// The loaders read only cerv2_510k_sections, org-wide: two device programs in
// one organization shared one content set, and a program authored in the
// governed editor (c2c_documents / c2c_document_sections) was invisible to
// /assemble, /filing-readiness and the draft package. With `programId` the
// governed document of THAT program answers, and the legacy store is never
// touched — the fake below throws if it is.

import { vi } from 'vitest';
import {
  governedSectionsToDeviceSections,
  loadDeviceContentLeaves,
  loadAuthoredDeviceSections,
  deviceContentSource,
  resolveDeviceContentScope,
  type DeviceContentClient,
  type GovernedDeviceSectionRow,
} from '../estar-content-leaves';

vi.mock('../../../../db', () => ({
  db: {
    select: () => {
      throw new Error('the legacy store (cerv2_510k_sections) must not be read for a program-scoped load');
    },
  },
  pool: {
    query: async () => {
      throw new Error('the shared pool must not be used when a client is injected');
    },
  },
}));

const ORG = 7;
const PROGRAM = '2b6d4a80-6a35-4b1e-9f6e-3a9d2c1e5f70';

function governedClient(opts: { document?: string | null; sections?: GovernedDeviceSectionRow[] }): DeviceContentClient & { calls: Array<{ sql: string; params: unknown[] }> } {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (/FROM c2c_documents/.test(sql)) {
        return { rows: opts.document ? [{ id: opts.document }] : [] } as never;
      }
      if (/FROM c2c_document_sections/.test(sql)) {
        return { rows: opts.sections ?? [] } as never;
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

const GOVERNED_ROWS: GovernedDeviceSectionRow[] = [
  { section_key: '3', label: 'Device Description', status: 'approved', content: { text: REAL_CONTENT }, mandatory: true },
  { section_key: '5', label: 'Performance Testing', status: 'drafted', content: { paragraphs: [{ text: REAL_CONTENT }] }, mandatory: true },
  { section_key: '8', label: 'Labeling', status: 'locked', content: { text: REAL_CONTENT }, mandatory: true },
  { section_key: '10', label: 'Software', status: 'todo', content: {}, mandatory: false },
];

describe('governedSectionsToDeviceSections (c2c_document_sections → adapter sections)', () => {
  it('reads the editor content shapes and derives the documentType from the label', () => {
    const sections = governedSectionsToDeviceSections(GOVERNED_ROWS);
    expect(sections.map((s) => s.sectionKey)).toEqual(['3', '5', '8', '10']);
    expect(sections[0]).toMatchObject({ sectionTitle: 'Device Description', category: 'Device Description', status: 'approved', content: REAL_CONTENT });
    expect(sections[1].content).toBe(REAL_CONTENT); // {paragraphs} shape
    expect(sections[3].content).toBe(''); // an empty section is not authored
    const leaves = sectionsToLeaves(sections);
    expect(leaves.map((l) => l.documentType)).toEqual(['device_description', 'performance_testing', 'labeling']);
  });

  it('applies the governed status vocabulary: locked is substantive, drafted/todo are not', () => {
    const leaves = sectionsToLeaves(governedSectionsToDeviceSections(GOVERNED_ROWS));
    expect(leaves.find((l) => l.sectionCode === '8')?.substantive).toBe(true);
    expect(leaves.find((l) => l.sectionCode === '5')?.substantive).toBe(false);
  });
});

describe('loadDeviceContentLeaves / loadAuthoredDeviceSections with a programId', () => {
  it("reads the program's governed document, tenant-scoped, and never the legacy store", async () => {
    const client = governedClient({ document: 'doc_1', sections: GOVERNED_ROWS });
    const leaves = await loadDeviceContentLeaves(ORG, { programId: PROGRAM, client });
    expect(leaves).toHaveLength(3);
    expect(client.calls[0].params).toEqual([ORG, PROGRAM, ['k510', 'denovo', 'pma', 'cer']]);
    expect(client.calls[1].params).toEqual(['doc_1']);

    const authored = await loadAuthoredDeviceSections(ORG, { programId: PROGRAM, client });
    expect(authored.map((a) => a.title)).toEqual(['Device Description', 'Performance Testing', 'Labeling']);
  });

  it('a program with no governed device document yields no leaves — honest, not the org-wide set', async () => {
    const client = governedClient({ document: null });
    expect(await loadDeviceContentLeaves(ORG, { programId: PROGRAM, client })).toEqual([]);
    expect(await loadAuthoredDeviceSections(ORG, { programId: PROGRAM, client })).toEqual([]);
    expect(client.calls).toHaveLength(2); // one document lookup per load; no section query
  });

  it('resolveDeviceContentScope: a program with authored governed content reads the governed store', async () => {
    const client = governedClient({ document: 'doc_1', sections: GOVERNED_ROWS });
    const r = await resolveDeviceContentScope(ORG, { programId: PROGRAM, documentId: 4, client });
    expect(r.source).toBe('governed_program');
    expect(r.scope.programId).toBe(PROGRAM);
    expect(r.scope.documentId).toBeUndefined();
  });

  it('resolveDeviceContentScope: a program whose governed document is empty or absent falls back to the legacy store, and says so', async () => {
    const empty = await resolveDeviceContentScope(ORG, { programId: PROGRAM, client: governedClient({ document: 'doc_1', sections: [GOVERNED_ROWS[3]] }) });
    expect(empty).toMatchObject({ source: 'legacy_org_wide', scope: { documentId: undefined } });
    expect(empty.scope.programId).toBeUndefined();

    const none = await resolveDeviceContentScope(ORG, { programId: PROGRAM, documentId: 4, client: governedClient({ document: null }) });
    expect(none).toMatchObject({ source: 'legacy_document', scope: { documentId: 4 } });
  });

  /*
   * THE TWO LOADERS' OWN HONESTY RULE, WHICH NOTHING PINNED.
   *
   * `loadDeviceContentLeaves` and `loadAuthoredDeviceSections` each document
   * that a failed read surfaces rather than reading as "the tenant authored
   * nothing" — the whole reason /build stopped answering 422 NO_AUTHORED_CONTENT
   * ("author section content before exporting") over a read that had failed, and
   * /filing-readiness stopped reporting 0% with every section missing.
   *
   * That rule lived in a comment inside a try/catch that only rethrew, and the
   * one test named for it covers `resolveDeviceContentScope`, a different
   * function. Swallowing the error in either loader — the exact regression the
   * comment warned about — broke nothing. Now it does.
   */
  it('loadDeviceContentLeaves: a failed governed read throws — it is never an empty content set', async () => {
    const failing = {
      async query() {
        throw new Error('connection reset while reading c2c_documents');
      },
    } as unknown as DeviceContentClient;
    await expect(
      loadDeviceContentLeaves(ORG, { programId: PROGRAM, client: failing }),
    ).rejects.toThrow(/connection reset/);
  });

  it('loadAuthoredDeviceSections: a failed governed read throws — it is never an empty section set', async () => {
    const failing = {
      async query() {
        throw new Error('connection reset while reading c2c_document_sections');
      },
    } as unknown as DeviceContentClient;
    await expect(
      loadAuthoredDeviceSections(ORG, { programId: PROGRAM, client: failing }),
    ).rejects.toThrow(/connection reset/);
  });

  it('the section read failing after the document resolved still surfaces', async () => {
    // The two-query shape means the failure can land on either call. A document
    // that resolves and a section read that then dies is the case a single
    // top-level try/catch would have flattened into "no content".
    const halfFailing = {
      async query(sql: string) {
        if (/FROM c2c_documents/.test(sql)) return { rows: [{ id: 'doc_1' }] } as never;
        throw new Error('statement timeout reading sections');
      },
    } as unknown as DeviceContentClient;
    await expect(
      loadDeviceContentLeaves(ORG, { programId: PROGRAM, client: halfFailing }),
    ).rejects.toThrow(/statement timeout/);
    await expect(
      loadAuthoredDeviceSections(ORG, { programId: PROGRAM, client: halfFailing }),
    ).rejects.toThrow(/statement timeout/);
  });

  it('a FAILED governed read is not an empty one: it surfaces, never falls back org-wide', async () => {
    // The catch here set authored=false, and the fallback then returned the
    // LEGACY scope with documentId undefined — every cerv2_510k_sections row in
    // the organization. A timeout while assembling program A's package
    // assembled it from every device in the org instead, and /build's success
    // response does not echo deviceContentSource, so nothing showed it.
    const failing = {
      async query() {
        throw new Error('connection reset while reading c2c_documents');
      },
    } as unknown as DeviceContentClient;
    await expect(
      resolveDeviceContentScope(ORG, { programId: PROGRAM, documentId: 4, client: failing }),
    ).rejects.toThrow(/connection reset/);
  });

  it('names the store that answered', () => {
    expect(deviceContentSource({ programId: PROGRAM })).toBe('governed_program');
    expect(deviceContentSource({ documentId: 4 })).toBe('legacy_document');
    expect(deviceContentSource({})).toBe('legacy_org_wide');
  });
});

// ── PMA_ASSEMBLY: the governed document's class travels with the scope ────────
//
// /build must choose its renderer and package label from the governed
// document's doc_type (a PMA is not a six-slot 510(k) package). The class comes
// from the SAME org-scoped c2c_documents lookup the loader already runs —
// never a second, unscoped lookup by document id.

function governedClientWithType(opts: { document?: { id: string; doc_type: string } | null; sections?: GovernedDeviceSectionRow[] }): DeviceContentClient & { calls: Array<{ sql: string; params: unknown[] }> } {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  return {
    calls,
    async query(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      if (/FROM c2c_documents/.test(sql)) {
        return { rows: opts.document ? [opts.document] : [] } as never;
      }
      if (/FROM c2c_document_sections/.test(sql)) {
        return { rows: opts.sections ?? [] } as never;
      }
      throw new Error(`unexpected query: ${sql}`);
    },
  };
}

describe('resolveDeviceContentScope reports the governed document class', () => {
  it("a governed PMA program resolves docType 'pma' from the org-scoped document lookup", async () => {
    const client = governedClientWithType({ document: { id: 'doc_pma', doc_type: 'pma' }, sections: GOVERNED_ROWS });
    const r = await resolveDeviceContentScope(ORG, { programId: PROGRAM, client });
    expect(r.source).toBe('governed_program');
    expect(r.docType).toBe('pma');
    // Tenant scoping: the class came from the same org/program-scoped query.
    const docLookups = client.calls.filter((c) => /FROM c2c_documents/.test(c.sql));
    expect(docLookups).toHaveLength(1);
    expect(docLookups[0].params).toEqual([ORG, PROGRAM, ['k510', 'denovo', 'pma', 'cer']]);
    expect(docLookups[0].sql).toMatch(/doc_type/);
  });

  it('a 510(k) program resolves its own class, and the legacy fallback carries none', async () => {
    const k510 = await resolveDeviceContentScope(ORG, { programId: PROGRAM, client: governedClientWithType({ document: { id: 'doc_k', doc_type: 'k510' }, sections: GOVERNED_ROWS }) });
    expect(k510.docType).toBe('k510');

    const none = await resolveDeviceContentScope(ORG, { programId: PROGRAM, client: governedClientWithType({ document: null }) });
    expect(none.source).toBe('legacy_org_wide');
    expect(none.docType).toBeUndefined();
  });

  it('governed authored sections carry their rule-pack key as sectionCode for package file naming', async () => {
    const client = governedClientWithType({ document: { id: 'doc_pma', doc_type: 'pma' }, sections: GOVERNED_ROWS });
    const authored = await loadAuthoredDeviceSections(ORG, { programId: PROGRAM, client });
    expect(authored.map((a) => a.sectionCode)).toEqual(['3', '5', '8']);
  });
});
