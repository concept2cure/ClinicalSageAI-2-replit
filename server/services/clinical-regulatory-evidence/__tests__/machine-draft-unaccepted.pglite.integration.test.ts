/**
 * Machine drafts nobody has accepted — END-TO-END against in-process PGlite
 * with the real migrations.
 *
 * ── The defect ────────────────────────────────────────────────────────────────
 * `accepted_machine_draft` (migrations/20260907) fixed the case where a human
 * accepted a suggestion. It left the worse one untouched: AnA's own tool writes,
 * where NO human has accepted anything at all.
 *
 *   • write_q_sub_section inserts the row with `draft_source = 'ana'`,
 *     `accepted_at = NULL`, and returns "Awaiting human accept" — and then
 *     recorded every clause as an `author_assertion` by the requesting user,
 *     in the SAME transaction. One transaction, two records, flatly
 *     contradicting each other about whether a person had stood behind the
 *     words.
 *   • save_document_to_vault / update_vault_document write an artifact
 *     provenance row saying `ai_generate`, then recorded the same prose as the
 *     user's assertion.
 *   • AnA's own drafting writeback (artifactVersionStore, via the AnA-RI
 *     post-processing stream) saves a draft the user has not seen yet.
 *
 * A person asking AnA to draft a section is not the same as that person
 * asserting its contents. `machine_draft` says the true thing: the machine
 * drafted it, the requester is recorded as having requested it (created_by),
 * and `asserted_by` is NULL because nobody has yet stood behind it.
 *
 * ── What is asserted ──────────────────────────────────────────────────────────
 *   • a whole-content machine draft records every clause as `machine_draft`
 *     with NO asserted_by — an unaccepted draft cannot name an asserter;
 *   • the requester is still recorded, as created_by, because who asked is a
 *     real fact and a different one from who asserted;
 *   • an unaccepted draft stays unaccepted across a later save that does not
 *     touch it — a human saving the document is not a human accepting each
 *     clause;
 *   • a human editing a clause takes it, exactly as before;
 *   • ACCEPTING the draft upgrades those clauses to `accepted_machine_draft`
 *     and names the acceptor — the one transition that may add an asserter;
 *   • the database refuses a machine_draft row that names an asserter, so the
 *     "unaccepted" half cannot be quietly overwritten by a later caller;
 *   • FALSIFIABLE: without the migration the kind is refused outright.
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

import { enforceAuthorLineage } from '../lineage-gate';
import * as lineage from '../span-lineage.service';

const ORG = 733;
const REQUESTER = '5150';
const ACCEPTOR = '9001';
const TABLE = 'q_sub_section_bodies';

const DRAFT_A = 'The device is intended for continuous monitoring of intraocular pressure.';
const DRAFT_B = 'No new safety signals emerged during the verification testing campaign.';
const HUMAN = 'We will confirm the sterilisation validation before the pre-submission meeting.';

const SPINE = 'db/migrations/20260724_clinical_regulatory_evidence_spine.sql';
const LINEAGE = 'db/migrations/20260803_document_span_lineage.sql';
const ACCEPTED_KIND = 'migrations/20260907_span_lineage_accepted_machine_draft.sql';
const DRAFT_KIND = 'migrations/20260908_span_lineage_machine_draft.sql';

function migration(rel: string): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return fs.readFileSync(path.resolve(here, '../../../../', rel), 'utf8');
}

async function boot(withDraftKind: boolean): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`CREATE TABLE IF NOT EXISTS organizations (id SERIAL PRIMARY KEY, name TEXT);`);
  await db.exec(`INSERT INTO organizations (id, name) VALUES (${ORG},'a');`);
  await db.exec(migration(SPINE));
  await db.exec(migration(LINEAGE));
  await db.exec(migration(ACCEPTED_KIND));
  if (withDraftKind) await db.exec(migration(DRAFT_KIND));
  return db;
}

const ref = (documentId: string) => ({ documentTable: TABLE, documentId });
const spansOf = (documentId: string) => lineage.listDocumentSpans(ORG, ref(documentId));
const textOf = (content: string, s: { charStart: number; charEnd: number }) =>
  content.slice(s.charStart, s.charEnd);

beforeAll(async () => {
  pglite = await boot(true);
}, 90_000);

afterAll(async () => {
  await pglite?.close();
});

describe('a machine draft nobody has accepted', () => {
  it('records every clause as the machine\'s, with NO asserter, and the requester as created_by', async () => {
    const r = ref('qsub-1');
    const content = `${DRAFT_A} ${DRAFT_B}`;
    await enforceAuthorLineage(exec, ORG, r, content, REQUESTER, {
      machineDraft: { authorId: 'ana' },
    });

    const spans = await spansOf(r.documentId);
    expect(spans.map((s) => s.provenanceKind)).toEqual(['machine_draft', 'machine_draft']);
    expect(spans.map((s) => textOf(content, s))).toEqual([DRAFT_A, DRAFT_B]);
    for (const s of spans) {
      expect(s.machineAuthorId).toBe('ana');
      expect(s.assertedBy, 'an unaccepted draft must not name an asserter').toBeNull();
      expect(s.assertedAt).toBeNull();
    }

    // Who ASKED is a real fact, and a different one from who asserted.
    const raw = await exec.query<{ created_by: string; asserted_by: string | null }>(
      `SELECT created_by, asserted_by FROM document_span_lineage
        WHERE organization_id = $1 AND document_id = $2 AND deleted_at IS NULL`,
      [ORG, r.documentId],
    );
    expect(raw.rows.every((x) => x.created_by === REQUESTER)).toBe(true);
    expect(raw.rows.every((x) => x.asserted_by === null)).toBe(true);

    // The panel read counts it as its own thing, not as an author assertion.
    const origins = await lineage.getSelectionOrigins(ORG, r, 0, content.length);
    expect(origins.counts.machineDraftedUnaccepted).toBe(2);
    expect(origins.counts.authorAsserted).toBe(0);
    expect(origins.counts.machineDrafted).toBe(0);
  });

  it('stays unaccepted across a later save that does not touch it — saving is not accepting', async () => {
    const r = ref('qsub-2');
    const v1 = `${DRAFT_A} ${DRAFT_B}`;
    await enforceAuthorLineage(exec, ORG, r, v1, REQUESTER, { machineDraft: { authorId: 'ana' } });

    // A human adds their own sentence and saves. They did not accept AnA's.
    const v2 = `${HUMAN} ${DRAFT_A} ${DRAFT_B}`;
    await enforceAuthorLineage(exec, ORG, r, v2, ACCEPTOR);

    const spans = await spansOf(r.documentId);
    const drafts = spans.filter((s) => s.provenanceKind === 'machine_draft');
    expect(drafts.map((s) => textOf(v2, s))).toEqual([DRAFT_A, DRAFT_B]);
    for (const s of drafts) expect(s.assertedBy).toBeNull();

    const mine = spans.filter((s) => s.provenanceKind === 'author_assertion');
    expect(mine.map((s) => textOf(v2, s))).toEqual([HUMAN]);
    expect(mine[0].assertedBy).toBe(ACCEPTOR);
  });

  it('returns a clause to the human the moment they edit its words', async () => {
    const r = ref('qsub-3');
    await enforceAuthorLineage(exec, ORG, r, `${DRAFT_A} ${DRAFT_B}`, REQUESTER, {
      machineDraft: { authorId: 'ana' },
    });

    const edited = DRAFT_A.replace('continuous', 'intermittent');
    const v2 = `${edited} ${DRAFT_B}`;
    await enforceAuthorLineage(exec, ORG, r, v2, ACCEPTOR);

    const spans = await spansOf(r.documentId);
    expect(spans.find((s) => textOf(v2, s) === edited)?.provenanceKind).toBe('author_assertion');
    expect(spans.find((s) => textOf(v2, s) === DRAFT_B)?.provenanceKind).toBe('machine_draft');
  });

  it('is UPGRADED to accepted_machine_draft, naming the acceptor, when a human accepts it', async () => {
    const r = ref('qsub-4');
    const content = `${DRAFT_A} ${DRAFT_B}`;
    await enforceAuthorLineage(exec, ORG, r, content, REQUESTER, { machineDraft: { authorId: 'ana' } });

    // The accept path carries the text the human accepted.
    await enforceAuthorLineage(exec, ORG, r, content, ACCEPTOR, {
      acceptedMachineText: [{ authorId: 'ana', text: content }],
    });

    const spans = await spansOf(r.documentId);
    expect(spans.map((s) => s.provenanceKind)).toEqual([
      'accepted_machine_draft',
      'accepted_machine_draft',
    ]);
    for (const s of spans) {
      expect(s.machineAuthorId).toBe('ana');
      expect(s.assertedBy, 'acceptance must name the acceptor').toBe(ACCEPTOR);
    }
    // The unaccepted rows are retired, not left answering alongside.
    const live = await exec.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM document_span_lineage
        WHERE organization_id = $1 AND document_id = $2
          AND provenance_kind = 'machine_draft' AND deleted_at IS NULL`,
      [ORG, r.documentId],
    );
    expect(Number(live.rows[0].n)).toBe(0);
  });

  it('the database refuses a machine_draft that names an asserter', async () => {
    await expect(
      exec.query(
        `INSERT INTO document_span_lineage (
           document_table, document_id, char_start, char_end, span_text_sha256,
           provenance_kind, machine_author_id, asserted_by, asserted_at,
           usage, organization_id
         ) VALUES ('q_sub_section_bodies','forged',0,10,'hash',
           'machine_draft','ana','someone',NOW(),'asserted',$1)`,
        [ORG],
      ),
    ).rejects.toThrow(/kind_shape|check constraint/i);
  });
});

describe('the guard is falsifiable', () => {
  it('without the 20260908 migration the database refuses the machine_draft kind', async () => {
    const bare = await boot(false);
    const bareExec = execFor(() => bare);
    try {
      await expect(
        lineage.recordMachineSpan(
          ORG,
          {
            documentTable: TABLE,
            documentId: 'bare',
            charStart: 0,
            charEnd: DRAFT_A.length,
            spanText: DRAFT_A,
            machineAuthorId: 'ana',
            createdBy: REQUESTER,
          },
          bareExec,
        ),
      ).rejects.toThrow(/kind_valid|kind_shape|check constraint/i);
    } finally {
      await bare.close();
    }
  }, 90_000);
});
