/**
 * Seal a seeded authoring document the way the authoring router seals one.
 *
 * 2026-09-23 (W5/D7, co-author final pass). "Place into filing" files an
 * APPROVED document as 'approved' only while its saved sections are the ones
 * its latest seal recorded (server/services/coauthor/coauthor-snapshot.ts).
 * Two GA-demo seeds claimed an approval without the router's seal:
 * 112-ind-authoring-doc.mjs wrote none (placement refused, SOURCE_NOT_SEALED)
 * and 99-doc-journey.mjs wrote one of its own shape. Both call this instead,
 * so the demo journey the founder's human-testing script walks
 * (docs/reports/wo9-phase1-ectd-unblock-2026-09-03.md §17) places the
 * document as the product would.
 *
 * The format is the router's, byte for byte in structure
 * (server/routes/authoring.router.ts, POST /docs/:docId/freeze and the
 * APPROVER / workflow auto-freeze):
 *   frozen_content = JSON.stringify({ document, sections, ..., frozenAt })
 *     document  = SELECT * FROM authoring_documents (the row)
 *     sections  = SELECT id, doc_id, code, title, content, order_index,
 *                 track_changes, created_at, updated_at, tenant_id
 *                 ... ORDER BY order_index, created_at, id
 *   content_hash = sha256(frozen_content)
 * An approval seal (`approvedBy` given) also carries the approval handlers'
 * approvedBy and documentHash — sha256 over `code:content` of each section
 * joined by '|||' (computeDocHash, server/services/authoring/authoring-export.ts).
 * The router's handlers are Express closures and cannot be imported
 * from a seed (seeds run as plain node on a laptop, never on deploy — CLAUDE.md
 * RULE 1 corollary), so this is the one seed-side writer of the format;
 * server/routes/__tests__/coauthorSnapshotSeeds.test.ts pins it against the
 * rows it seals and against the real placement.
 *
 * Not a ga-demo.d module: it lives beside that directory so the seed runner
 * (scripts/seed-ga-demo.mjs, which imports every ga-demo.d/*.mjs) does not run
 * it as a seed of its own.
 */
import crypto from 'node:crypto';

/**
 * @param {{ query: (sql: string, params?: unknown[]) => Promise<{ rows: any[] }> }} client
 * @param {{ docId: string, tenantId: number, version: string, frozenBy: string,
 *           reason: string | null, frozenAt: string | Date, approvedBy?: string }} seal
 * @returns {Promise<{ contentHash: string }>}
 */
export async function sealAuthoringDocument(client, { docId, tenantId, version, frozenBy, reason, frozenAt, approvedBy }) {
  const doc = await client.query('SELECT * FROM authoring_documents WHERE id = $1 AND tenant_id = $2', [docId, tenantId]);
  if (doc.rows.length !== 1) throw new Error(`authoring-seal: document ${docId} not found for tenant ${tenantId}`);
  const sections = await client.query(
    'SELECT id, doc_id, code, title, content, order_index, track_changes, created_at, updated_at, tenant_id ' +
      'FROM authoring_sections WHERE doc_id = $1 AND tenant_id = $2 ORDER BY order_index, created_at, id',
    [docId, tenantId],
  );
  if (sections.rows.length === 0) throw new Error(`authoring-seal: document ${docId} has no sections to seal`);
  const at = frozenAt instanceof Date ? frozenAt.toISOString() : new Date(frozenAt).toISOString();
  const approval = approvedBy
    ? {
        approvedBy,
        documentHash: crypto
          .createHash('sha256')
          .update(sections.rows.map((x) => `${x.code}:${x.content}`).join('|||'))
          .digest('hex'),
      }
    : {};
  const frozenContent = JSON.stringify({
    document: doc.rows[0],
    sections: sections.rows,
    ...approval,
    frozenAt: at,
  });
  const contentHash = crypto.createHash('sha256').update(frozenContent).digest('hex');
  await client.query(
    `INSERT INTO frozen_documents
       (document_id, version, frozen_content, content_hash, frozen_by, frozen_reason, tenant_id, frozen_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [docId, version, frozenContent, contentHash, frozenBy, reason, tenantId, at],
  );
  return { contentHash };
}
