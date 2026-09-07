/**
 * Accepted machine drafts in span lineage — END-TO-END against in-process
 * PGlite with the real migrations.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * Every governed write re-derives all clause spans of the saved content and
 * records each one as an `author_assertion` by the human actor — including the
 * clauses AnA drafted and the human merely accepted. The AI-draft accept path
 * did the same for every clause it could not tie to a Data Room source. So the
 * Data Origins panel and its PDF said "Author assertion · Asserted by the
 * author" for prose a model produced, and the §11.10(e) record named a human as
 * the author of words they never wrote. The revision ledger already knew better
 * (`origin: 'ai-draft-accept'`, `draft_source: 'ana'`) — at save grain. This is
 * the same fact at clause grain, which is the grain the lineage table exists
 * to state.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • a clause verbatim in the accepted machine text is recorded as
 *     `accepted_machine_draft`: the machine author AND the human who accepted
 *     it, both named; every other clause stays the human's assertion;
 *   • a later save by someone else that moves the clause carries the
 *     attribution forward — to the ORIGINAL acceptor, not the later saver;
 *   • the moment a human edits the clause's words, it is theirs;
 *   • text that is not in the content attributes nothing (the client cannot
 *     fabricate a machine claim about words that were never saved);
 *   • accepting an AI draft the author partly edited splits three ways:
 *     verified quote → source, unedited model clause → machine, edited clause
 *     → author;
 *   • FALSIFIABLE: without the migration the database refuses the new kind, so
 *     the tests above cannot be passing by accident.
 *
 * One PGlite instance for the file; the falsifiability case boots its own.
 */

import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let pglite: PGlite;
function execFor(db: () => PGlite) {
  return {
    query: async <R = any>(sql: string, params?: unknown[]): Promise<{ rows: R[]; rowCount: number }> => {
      const r = await db().query(sql, params as unknown[]);
      return {
        rows: r.rows as R[],
        rowCount: (r as { affectedRows?: number }).affectedRows ?? (r.rows as unknown[]).length,
      };
    },
  };
}
const exec = execFor(() => pglite);
vi.mock('../../../db', () => ({ pool: { query: (s: string, p?: unknown[]) => exec.query(s, p) } }));

import { enforceAuthorLineage, enforceSourceAndAuthorLineage } from '../lineage-gate';
import * as lineage from '../span-lineage.service';

const ORG = 711;
const AUTHOR = '4242';
const REVIEWER = '9001';
const TABLE = 'authoring_sections';

// Each is ONE clause to the detector (no clause punctuation, no conjunction).
const HUMAN = 'These findings were consistent across every prespecified subgroup we examined.';
const MACHINE = 'The primary endpoint was met at week twelve in the intent-to-treat population.';
const MACHINE_SAFETY = 'No new safety signals emerged during the treatment period.';
const REVIEWER_LINE = 'A new opening sentence was added by the reviewer.';

const SPINE = 'db/migrations/20260724_clinical_regulatory_evidence_spine.sql';
const LINEAGE = 'db/migrations/20260803_document_span_lineage.sql';
const MACHINE_KIND = 'migrations/20260907_span_lineage_accepted_machine_draft.sql';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function boot(withMachineKind: boolean): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await db.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a');`);
  await db.exec(migration(SPINE));
  await db.exec(migration(LINEAGE));
  if (withMachineKind) await db.exec(migration(MACHINE_KIND));
  return db;
}

async function makeSource(checksum: string, title = 'csr.pdf'): Promise<number> {
  const { rows } = await exec.query(
    `INSERT INTO cre_evidence_sources
       (organization_id, visibility_class, source_type, title, checksum,
        ingestion_status, extraction_status)
     VALUES ($1, 'tenant_private', 'client_document', $2, $3, 'ingested', 'extracted')
     RETURNING id`,
    [ORG, title, checksum],
  );
  return (rows[0] as { id: number }).id;
}

const ref = (documentId: string) => ({ documentTable: TABLE, documentId });
const spansOf = (documentId: string) => lineage.listDocumentSpans(ORG, ref(documentId));
const textOf = (content: string, s: { charStart: number; charEnd: number }) => content.slice(s.charStart, s.charEnd);

beforeAll(async () => {
  pglite = await boot(true);
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('enforceAuthorLineage with accepted machine text', () => {
  it('records the accepted AnA clause as the machine\'s, accepted by the author; the rest stays the author\'s', async () => {
    const r = ref('sec-machine-1');
    const content = `${HUMAN} ${MACHINE}`;
    await enforceAuthorLineage(exec, ORG, r, content, AUTHOR, {
      acceptedMachineText: [{ authorId: 'ana', text: MACHINE }],
    });

    const spans = await spansOf(r.documentId);
    const machine = spans.filter((s) => s.provenanceKind === 'accepted_machine_draft');
    const human = spans.filter((s) => s.provenanceKind === 'author_assertion');

    expect(machine.map((s) => textOf(content, s))).toEqual([MACHINE]);
    expect(machine[0].machineAuthorId).toBe('ana');
    expect(machine[0].assertedBy).toBe(AUTHOR);
    expect(machine[0].state).toBe('current');
    expect(human.map((s) => textOf(content, s))).toEqual([HUMAN]);
    expect(human[0].assertedBy).toBe(AUTHOR);

    // The panel's read counts it as what it is.
    const origins = await lineage.getSelectionOrigins(ORG, r, 0, content.length);
    expect(origins.counts.machineDrafted).toBe(1);
    expect(origins.counts.authorAsserted).toBe(1);
    // The selection read counts the separator between clauses as uncovered
    // (the gate does not: whitespace asserts nothing). What must hold is that
    // nothing with words in it is unaccounted for.
    expect(origins.uncovered.every((u) => content.slice(u.charStart, u.charEnd).trim() === '')).toBe(true);
  });

  it('carries the attribution forward to the ORIGINAL acceptor when a later save by someone else moves the clause', async () => {
    const r = ref('sec-machine-2');
    const v1 = `${HUMAN} ${MACHINE}`;
    await enforceAuthorLineage(exec, ORG, r, v1, AUTHOR, {
      acceptedMachineText: [{ authorId: 'ana', text: MACHINE }],
    });

    // The reviewer adds a sentence at the top: every offset below it moves.
    // This save carries no accepted text — the reviewer accepted nothing.
    const v2 = `${REVIEWER_LINE} ${HUMAN} ${MACHINE}`;
    await enforceAuthorLineage(exec, ORG, r, v2, REVIEWER);

    const spans = await spansOf(r.documentId);
    const machine = spans.filter((s) => s.provenanceKind === 'accepted_machine_draft');
    expect(machine.map((s) => textOf(v2, s))).toEqual([MACHINE]);
    expect(machine[0].assertedBy, 'the later saver must not become the acceptor').toBe(AUTHOR);
    expect(machine[0].machineAuthorId).toBe('ana');

    const reviewers = spans.filter(
      (s) => s.provenanceKind === 'author_assertion' && s.assertedBy === REVIEWER,
    );
    expect(reviewers.map((s) => textOf(v2, s))).toContain(REVIEWER_LINE);

    // The stale row at the old offsets is retired, not left answering.
    const live = await exec.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE organization_id = $1 AND document_table = $2 AND document_id = $3
          AND provenance_kind = 'accepted_machine_draft' AND deleted_at IS NULL`,
      [ORG, TABLE, r.documentId],
    );
    expect(Number(live.rows[0].n)).toBe(1);
  });

  it('returns the clause to the human the moment they edit its words', async () => {
    const r = ref('sec-machine-3');
    const v1 = `${HUMAN} ${MACHINE}`;
    await enforceAuthorLineage(exec, ORG, r, v1, AUTHOR, {
      acceptedMachineText: [{ authorId: 'ana', text: MACHINE }],
    });

    const edited = MACHINE.replace('week twelve', 'week sixteen');
    const v2 = `${HUMAN} ${edited}`;
    await enforceAuthorLineage(exec, ORG, r, v2, REVIEWER);

    const spans = await spansOf(r.documentId);
    expect(spans.filter((s) => s.provenanceKind === 'accepted_machine_draft')).toEqual([]);
    const editedSpan = spans.find((s) => textOf(v2, s) === edited);
    expect(editedSpan?.provenanceKind).toBe('author_assertion');
    expect(editedSpan?.assertedBy).toBe(REVIEWER);
  });

  it('attributes nothing to a machine for text that is not in the content, and ignores empty text', async () => {
    const r = ref('sec-machine-4');
    await enforceAuthorLineage(exec, ORG, r, HUMAN, AUTHOR, {
      acceptedMachineText: [
        { authorId: 'ana', text: MACHINE },
        { authorId: 'ana', text: '   ' },
      ],
    });
    const spans = await spansOf(r.documentId);
    expect(spans.map((s) => s.provenanceKind)).toEqual(['author_assertion']);
  });

  it('still covers the content — the gate passes with both kinds present', async () => {
    const r = ref('sec-machine-5');
    const content = `${MACHINE} ${HUMAN} ${MACHINE_SAFETY}`;
    await expect(
      enforceAuthorLineage(exec, ORG, r, content, AUTHOR, {
        acceptedMachineText: [{ authorId: 'ana', text: `${MACHINE} ${MACHINE_SAFETY}` }],
      }),
    ).resolves.toBeUndefined();
    const spans = await spansOf(r.documentId);
    expect(spans.filter((s) => s.provenanceKind === 'accepted_machine_draft').map((s) => textOf(content, s)))
      .toEqual([MACHINE, MACHINE_SAFETY]);
    expect(spans.filter((s) => s.provenanceKind === 'author_assertion').map((s) => textOf(content, s)))
      .toEqual([HUMAN]);
  });
});

describe('enforceSourceAndAuthorLineage — accepting an AI draft the author partly edited', () => {
  it('splits three ways: verified quote → source, unedited model clause → machine, edited clause → author', async () => {
    const r = ref('sec-machine-accept-1');
    const QUOTED = MACHINE;
    const sourceId = await makeSource('sha-accept-1');
    const sourceText = `Clinical study report. ${QUOTED} Additional narrative detail follows here.`;

    const generated = `${QUOTED} ${HUMAN} ${MACHINE_SAFETY}`;
    const editedSafety = MACHINE_SAFETY.replace('treatment period', 'extended follow-up period');
    const accepted = `${QUOTED} ${HUMAN} ${editedSafety}`;

    const result = await enforceSourceAndAuthorLineage(
      exec, ORG, r, accepted, AUTHOR,
      [{ sourceId, content: sourceText, title: 'csr.pdf' }],
      { acceptedMachineText: [{ authorId: 'ana', text: generated }] },
    );

    const spans = await spansOf(r.documentId);
    const kindOf = (text: string) => spans.find((s) => textOf(accepted, s) === text)?.provenanceKind;
    expect(kindOf(QUOTED)).toBe('cre_evidence_source');
    expect(kindOf(HUMAN)).toBe('accepted_machine_draft');
    expect(kindOf(editedSafety)).toBe('author_assertion');
    expect(result.machineSpans).toBe(1);
    expect(result.authorSpans).toBe(1);
    expect(result.quotedSpans).toBe(1);
  });
});

describe('the guard is falsifiable', () => {
  it('without the 20260907 migration the database refuses a machine span', async () => {
    const bare = await boot(false);
    const bareExec = execFor(() => bare);
    try {
      await expect(
        lineage.recordMachineSpan(
          ORG,
          {
            documentTable: TABLE,
            documentId: 'sec-bare',
            charStart: 0,
            charEnd: MACHINE.length,
            spanText: MACHINE,
            machineAuthorId: 'ana',
            assertedBy: AUTHOR,
          },
          bareExec,
        ),
      ).rejects.toThrow(/kind_valid|machine_author_id|check constraint/i);
    } finally {
      await bare.close();
    }
  }, 90_000);
});
