/**
 * A revised source is linked to the one it replaces — END-TO-END against PGlite.
 *
 * WHAT WAS WRONG (ledger L21). `cre_evidence_sources.checksum` is written once
 * at ingest and never rewritten. A revised document is therefore ingested as a
 * wholly NEW row: different bytes, different hash, `findSourceByChecksum`
 * misses, fresh identity created, and nothing points back at what it replaced.
 *
 * That reached a surface. `authoring_citations.payload_sha256` holds the
 * source's checksum AT CITE TIME, so the freshness comparison
 * `citedChecksum === currentChecksum` compares an immutable value with itself
 * and can never be false. The Source Tracer's "changed" branch was unreachable
 * and every citation read "content unchanged since cited" forever — including
 * citations whose document had genuinely been revised, which is the one case
 * the check exists for.
 *
 * These tests apply the REAL migrations, including
 * 20260829_cre_source_versioning.sql, so the columns under test are the ones a
 * deploy creates. The chain proved here is the whole point: cite a source,
 * ingest a revision, and the citation must stop reporting itself current.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
const query = async (sql: string, params?: unknown[]) => {
  const r = await pglite.query(sql, params as unknown[]);
  return {
    rows: r.rows as unknown[],
    rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
  };
};

// The pool mock carries `connect` as well as `query`, because
// createSupersedingSource runs its two writes in ONE transaction — retiring the
// predecessor and inserting the successor have to land together or not at all.
// A mock with only `query` would not exercise that at all.
vi.mock('../../../db', () => ({
  pool: {
    query: (s: string, p?: unknown[]) => query(s, p),
    connect: async () => ({ query: (s: string, p?: unknown[]) => query(s, p), release: () => {} }),
  },
}));

import * as spine from '../evidence-spine.service';
import * as usage from '../source-usage.service';
import { searchFindings } from '../index';

const ORG = 711;
const PROGRAM = '55555555-5555-4555-8555-555555555555';
const ACTOR = 'user-1';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

const doc = (checksum: string, over: Record<string, unknown> = {}) => ({
  sourceType: 'client_document' as const,
  visibilityClass: 'project_private' as const,
  clientProgramId: PROGRAM,
  title: 'protocol.pdf',
  checksum,
  ingestionStatus: 'ingested' as const,
  extractionStatus: 'extracted' as const,
  ...over,
});

async function makeSection(code: string): Promise<string> {
  const docId = crypto.randomUUID();
  const sectionId = crypto.randomUUID();
  await query(
    `INSERT INTO authoring_documents (id, title, module, status, created_by, tenant_id)
     VALUES ($1, 'Protocol', 'M3', 'draft', $2, $3)`,
    [docId, ACTOR, ORG],
  );
  await query(
    `INSERT INTO authoring_sections (id, doc_id, code, title, content, tenant_id)
     VALUES ($1, $2, $3, $4, '', $5)`,
    [sectionId, docId, code, 'Section ' + code, ORG],
  );
  return sectionId;
}

beforeAll(async () => {
  pglite = new PGlite();
  await pglite.exec(migration('db/migrations/20260724_clinical_regulatory_evidence_spine.sql'));
  await pglite.exec(migration('migrations/20260726_cre_source_program_scope.sql'));
  await pglite.exec(migration('db/migrations/20260725_authoring_document_loop_tables.sql'));
  // ALTER-closure: the loop-tables migration above creates authoring_comments,
  // user_pins and doc_revisions; every applier file that ALTERs those tables
  // must be applied here too, or this harness builds a schema no deployment has
  // (see tests/schema-contract/authoring-migration-list-closure.contract.test.ts).
  await pglite.exec(migration('db/migrations/20260730_authoring_comments_router_columns.sql'));
  await pglite.exec(migration('db/migrations/20260817_doc_revisions_immutable_ledger.sql'));
  await pglite.exec(migration('migrations/20260726_authoring_citation_source_usage.sql'));
  // The migration under test.
  await pglite.exec(migration('migrations/20260829_cre_source_versioning.sql'));
}, 120_000);

afterAll(async () => { await pglite?.close(); });

describe('source versioning — a citation stops calling itself current', () => {
  it('a cited source that is superseded reports SUPERSEDED, not current', async () => {
    const v1 = await spine.createSource(ORG, doc('sha-v1'));
    const sectionId = await makeSection('3.2.S.1');
    await usage.citeSource(ORG, {
      sectionId, sourceId: v1.id, createdBy: ACTOR, citationText: 'cited from v1',
    });

    // Before the revision the citation is legitimately current.
    const before = await usage.listSectionSources(ORG, sectionId);
    expect(before[0].state).toBe('current');

    // The revision arrives: new bytes, so a NEW row — linked to what it replaces.
    const { source: v2, supersededId } = await spine.createSupersedingSource(
      ORG, doc('sha-v2'), v1.id,
    );
    expect(supersededId).toBe(v1.id);

    const after = await usage.listSectionSources(ORG, sectionId);
    // The checksums STILL match — v1 keeps its bytes and its hash forever — so
    // a checksum comparison alone would report this citation as current. The
    // recorded successor is what makes the truth visible.
    expect(after[0].citedChecksum).toBe('sha-v1');
    expect(after[0].source?.checksum).toBe('sha-v1');
    expect(after[0].state).toBe('superseded');

    // And the lineage is navigable in both directions.
    const { rows } = await query(
      `SELECT id, previous_version_id, is_current FROM cre_evidence_sources WHERE id = ANY($1::int[]) ORDER BY id`,
      [[v1.id, v2.id]],
    );
    const [a, b] = rows as Array<{ id: number; previous_version_id: number | null; is_current: boolean }>;
    expect(a.is_current).toBe(false);
    expect(b.previous_version_id).toBe(v1.id);
    expect(b.is_current).toBe(true);
  }, 60_000);

  it('refuses to fork a lineage: a source can be superseded only once', async () => {
    const v1 = await spine.createSource(ORG, doc('sha-fork-1', { title: 'fork.pdf' }));
    await spine.createSupersedingSource(ORG, doc('sha-fork-2', { title: 'fork.pdf' }), v1.id);
    // Two successors would read as two different "current" versions of one
    // document — the ambiguity this linkage exists to remove.
    await expect(
      spine.createSupersedingSource(ORG, doc('sha-fork-3', { title: 'fork.pdf' }), v1.id),
    ).rejects.toThrow(/not a current source|Refusing to fork/i);
  }, 60_000);

  it('does not retire a source belonging to another tenant', async () => {
    const mine = await spine.createSource(ORG, doc('sha-tenant', { title: 'tenant.pdf' }));
    await expect(
      spine.createSupersedingSource(ORG + 1, doc('sha-tenant-2', { title: 'tenant.pdf' }), mine.id),
    ).rejects.toThrow(/not a current source/i);
    const { rows } = await query(`SELECT is_current FROM cre_evidence_sources WHERE id = $1`, [mine.id]);
    expect((rows[0] as { is_current: boolean }).is_current).toBe(true);
  }, 60_000);
});

describe('findSupersededCandidate — declines to guess', () => {
  it('finds the single current same-name document in the project', async () => {
    const v1 = await spine.createSource(ORG, doc('sha-cand-1', { title: 'unique-name.pdf' }));
    const found = await spine.findSupersededCandidate(ORG, {
      title: 'unique-name.pdf', sourceType: 'client_document', programId: PROGRAM,
    });
    expect(found?.id).toBe(v1.id);
  }, 60_000);

  it('returns null when TWO documents in the project share the name', async () => {
    await spine.createSource(ORG, doc('sha-dup-1', { title: 'duplicate.pdf' }));
    await spine.createSource(ORG, doc('sha-dup-2', { title: 'duplicate.pdf' }));
    // Ambiguity is where "this is a revision" becomes a guess, and a wrong one
    // retires a live source and tells a reviewer their citation is stale on the
    // strength of a filename. Declining is the honest answer.
    const found = await spine.findSupersededCandidate(ORG, {
      title: 'duplicate.pdf', sourceType: 'client_document', programId: PROGRAM,
    });
    expect(found).toBeNull();
  }, 60_000);

  it('returns null with no project scope — a filename alone is not identity', async () => {
    await spine.createSource(ORG, doc('sha-unscoped', { title: 'unscoped.pdf' }));
    const found = await spine.findSupersededCandidate(ORG, {
      title: 'unscoped.pdf', sourceType: 'client_document',
    });
    expect(found).toBeNull();
  }, 60_000);

  it('does not offer an already-superseded source as a candidate', async () => {
    const v1 = await spine.createSource(ORG, doc('sha-old-1', { title: 'chain.pdf' }));
    await spine.createSupersedingSource(ORG, doc('sha-old-2', { title: 'chain.pdf' }), v1.id);
    // The successor is the current one; a third upload must supersede IT, not
    // the already-retired original.
    const found = await spine.findSupersededCandidate(ORG, {
      title: 'chain.pdf', sourceType: 'client_document', programId: PROGRAM,
    });
    expect(found?.id).not.toBe(v1.id);
    expect(found?.checksum).toBe('sha-old-2');
  }, 60_000);
});

describe('the version column carries what was observed, and nothing else (L21)', () => {
  it('round-trips a declared version into cre_evidence_sources.version', async () => {
    // Until this row landed, `version` had no writer at all: the column existed
    // and every value in it was NULL. Proving the pass-through works is the
    // difference between "the ingest computes a version" and "the version
    // reaches the database".
    const src = await spine.createSource(ORG, doc('sha-ver-1', {
      title: 'versioned.pdf', version: '3.2',
    }));
    const { rows } = await query(`SELECT version FROM cre_evidence_sources WHERE id = $1`, [src.id]);
    expect((rows[0] as { version: string | null }).version).toBe('3.2');
    expect((await spine.getSource(ORG, src.id))?.version).toBe('3.2');
  }, 60_000);

  it('leaves the column NULL when the caller records no version', async () => {
    // No default, at any layer. A source whose version is unknown must read as
    // unknown from the database, not as 1.
    const src = await spine.createSource(ORG, doc('sha-ver-2', { title: 'unversioned.pdf' }));
    const { rows } = await query(`SELECT version FROM cre_evidence_sources WHERE id = $1`, [src.id]);
    expect((rows[0] as { version: string | null }).version).toBeNull();
  }, 60_000);

  it('carries the version across a supersession without renumbering it', async () => {
    // The tempting fix for L21 is `version = position in the chain`. It is
    // wrong: the successor here declares 4.0, not 2, and the chain must not
    // overwrite what the document says about itself.
    const v1 = await spine.createSource(ORG, doc('sha-chain-a', {
      title: 'chain-version.pdf', version: '3.2',
    }));
    const { source: v2 } = await spine.createSupersedingSource(
      ORG, doc('sha-chain-b', { title: 'chain-version.pdf', version: '4.0' }), v1.id,
    );
    expect(v2.version).toBe('4.0');
    expect((await spine.getSource(ORG, v1.id))?.version).toBe('3.2');
  }, 60_000);
});

describe('SourceRef.version reports a label it can carry, or none', () => {
  /** A global-public source + one finding on it, so searchFindings resolves a SourceRef. */
  async function findingOnSourceWithVersion(version: string | null): Promise<number | null> {
    const { rows: srcRows } = await query(
      `INSERT INTO cre_evidence_sources
         (organization_id, visibility_class, source_type, agency, application_type,
          application_number, title, version, ingestion_status, extraction_status)
       VALUES (NULL, 'global_public', 'fda_crl', 'FDA', 'BLA', $1, 'CRL', $2, 'ingested', 'extracted')
       RETURNING id`,
      ['BLA-' + (version ?? 'none') + '-' + Math.floor(Math.random() * 1e6), version],
    );
    const sourceId = (srcRows[0] as { id: number }).id;
    await query(
      `INSERT INTO cre_regulatory_findings
         (organization_id, visibility_class, source_id, finding_domain, finding_text,
          explicit_or_inferred, verification_status)
       VALUES (NULL, 'global_public', $1, 'clinical', 'Efficacy package insufficient.',
               'explicit', 'unverified')`,
      [sourceId],
    );
    const res = await searchFindings({ organizationId: ORG });
    const hit = res.findings.find((f) => f.source.sourceId === String(sourceId));
    expect(hit, 'finding for source ' + sourceId).toBeDefined();
    return hit!.source.version;
  }

  it('reports an integer label as that integer', async () => {
    expect(await findingOnSourceWithVersion('3')).toBe(3);
  }, 60_000);

  it('reports a dotted label as NOT RECORDED rather than truncating it', async () => {
    // `parseInt('3.2')` is 3. Rendering "v3" for a document that says 3.2 puts a
    // number in a provenance field that is not the document's version and that
    // a reader cannot tell apart from one that is — the same fabrication as
    // defaulting the column, arriving from the read side instead.
    expect(await findingOnSourceWithVersion('3.2')).toBeNull();
    expect(await findingOnSourceWithVersion('2b')).toBeNull();
  }, 60_000);

  it('reports an absent version as absent', async () => {
    expect(await findingOnSourceWithVersion(null)).toBeNull();
  }, 60_000);
});
