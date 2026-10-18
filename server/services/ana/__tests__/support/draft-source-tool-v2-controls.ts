/** Extra V2 controls share the existing real tool/PGlite fixture, without
 * copying its schema or replacing any handler, authority or persistence path. */
import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { JourneyDb } from '../../../../../tests/golden-journeys/harness';
import type { DraftSourceReferenceV2, DraftSourceSpan } from '../../../../../shared/authoring/draft-source-reference';
import { draftSourceIdentityForText } from '../../draft-source-identity';

interface Controls {
  database(): JourneyDb;
  call(body: Record<string, unknown>, programId?: string): Promise<string>;
  counts(): Promise<unknown>;
  sourceId: string;
  sourceText: string;
  sourcedInput(reference: unknown): Record<string, unknown>;
  reference(span: DraftSourceSpan): DraftSourceReferenceV2;
  programId: string;
  organizationId: number;
}

export function registerDraftSourceToolIdentityControls(c: Controls) {
  describe('draft_authoring_document exact extraction identity', () => {
    it.each(['inside', 'outside'])('refuses a same-length extraction change %s the selected span without authoring writes', async location => {
      const start = c.sourceText.indexOf('endpoint');
      const reference = c.reference({ start, end: c.sourceText.length, totalChars: c.sourceText.length });
      const index = location === 'inside' ? start : 0;
      const changed = c.sourceText.slice(0, index) + 'X' + c.sourceText.slice(index + 1);
      expect(changed.length).toBe(c.sourceText.length);
      const before = await c.counts();
      // tenant-isolation-safe: tampers with THIS suite's own seeded document by primary key,
      // in the in-process PGlite fixture, to prove the tool refuses to draft from a source whose
      // extracted text no longer matches its recorded hash. Restored in the finally below.
      await c.database().pool.query('UPDATE vault.documents SET extracted_text=$1 WHERE id=$2', [changed, c.sourceId]);
      try {
        const out = JSON.parse(await c.call(c.sourcedInput(reference)));
        expect(out.error, JSON.stringify(out)).toMatch(/source references.*could not be verified/i);
        expect(out.saved).toBeUndefined();
        expect(await c.counts()).toEqual(before);
      } finally {
        // tenant-isolation-safe: restores the same fixture document this test tampered with, by
        // the same primary key, in the same throw-away PGlite database.
        await c.database().pool.query('UPDATE vault.documents SET extracted_text=$1 WHERE id=$2', [c.sourceText, c.sourceId]);
      }
    });

    it.each(['version', 'extractedTextSha256', 'spanSha256'])('refuses a new selected reference stripped of %s rather than using historical compatibility', async key => {
      const reference: Record<string, unknown> = { ...c.reference({ start: 0, end: c.sourceText.length, totalChars: c.sourceText.length }) };
      delete reference[key];
      const before = await c.counts();
      const out = JSON.parse(await c.call(c.sourcedInput(reference)));
      expect(out.error, JSON.stringify(out)).toMatch(/source|identity|version/i);
      expect(out.saved).toBeUndefined();
      expect(await c.counts()).toEqual(before);
    });

    it('saves an exact Unicode V2 window beyond 80,000 with unchanged receipt identities', async () => {
      const documentId = randomUUID();
      const prefix = 'Study appendix. '.repeat(6_001);
      const excerpt = 'Observed response 💊 needs investigator review.';
      const text = prefix + excerpt + ' Unselected conclusion.';
      const span = { start: prefix.length, end: prefix.length + excerpt.length, totalChars: text.length };
      const reference = { documentId, contentHash: 'e'.repeat(64), span, ...draftSourceIdentityForText(text, span) };
      expect(span.start).toBeGreaterThan(80_000);
      await c.database().pool.query(`INSERT INTO vault.documents
        (id,program_id,organization_id,document_code,document_title,document_type,file_name,content_hash,extracted_text)
        VALUES ($1::uuid,$2,$3,$1::text,'Large Unicode CSR','csr','large.pdf',$4,$5)`,
      [documentId, c.programId, c.organizationId, reference.contentHash, text]);
      await c.database().pool.query(`INSERT INTO vault.document_catalog
        (document_id,content_hash,catalog_status,extraction_method,char_count)
        VALUES ($1,$2,'extracted','pdf-text',$3)`, [documentId, reference.contentHash, text.length]);
      const out = JSON.parse(await c.call({ title: 'Large-window clinical review', sections: [{ code: '2.5', title: 'Review',
        content: '<p>The investigator should review the response.</p>', sourceReferences: [reference] }] }, c.programId));
      expect(out.saved, JSON.stringify(out)).toBe(true);
      expect(out.projectSourceReferences[0]).toMatchObject({ sourceReferenceVersion: 2,
        sources: [{ ...reference, identityVerification: 'exact_extraction_and_span', completeText: false }] });
      expect(out.projectSourceReferences[0].sources[0]).not.toHaveProperty('text');
      expect(JSON.stringify(out.projectSourceReferences[0].sources)).not.toContain(excerpt);
    });
  });
}
