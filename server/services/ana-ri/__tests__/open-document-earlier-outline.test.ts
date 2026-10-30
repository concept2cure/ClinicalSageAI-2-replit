/**
 * A saved document built from an earlier version of its template is not
 * described as if today's outline were its own (review finding, 2026-10-18).
 *
 * The PAS, CBE, IND annual report and meeting outlines changed under the same
 * builtin template id and version. A PAS document saved before the change holds
 * the old CTD headings, and AnA was told "What it contains: PAS-COVER …,
 * PAS-SUMMARY …" and "Answer for this document type". The recorded snapshot
 * (templateSource.sha256) says which outline the document was built from.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../db.js', () => ({ pool: { query: vi.fn() } }));

import { renderOpenDocumentBlock, resolveOpenDocument } from '../open-document';
import { builtinTemplateSource } from '../../authoring/authoring-template-sections';
import { builtinAuthoringTemplateId, getBuiltinAuthoringTemplate } from '../../authoring/builtin-authoring-templates';
import { pg, DOCUMENT, PROGRAM } from '../../ana/__tests__/_saved-document-critique-fixture';

const EARLIER = /built from an earlier version of its template/;

async function opened(sha256: (current: string) => string) {
  const id = builtinAuthoringTemplateId('registry:US_NDA_SUPP');
  const source = builtinTemplateSource(await getBuiltinAuthoringTemplate(id))!;
  const provenance = { templateSource: { ...source, sha256: sha256(source.sha256) } };
  await pg.query('UPDATE authoring_documents SET template_id=$1,provenance=$2 WHERE id=$3', [id, provenance, DOCUMENT]);
  const result = await resolveOpenDocument({
    authoringContext: { artifactId: DOCUMENT }, organizationId: 7,
    access: { getClient: () => ({ query: (sql, params) => pg.query(sql, params) }), userId: 7,
      project: { programId: PROGRAM, projectRef: PROGRAM, projectId: 11 } },
  });
  return { result, block: renderOpenDocumentBlock(result) };
}

describe('the open document and the outline it was built from', () => {
  it('a document whose recorded snapshot is not the current one is told so', async () => {
    const { result, block } = await opened(() => 'b'.repeat(64));
    expect(result.document?.registryId).toBe('US_NDA_SUPP');
    expect(result.document?.builtFromEarlierOutline).toBe(true);
    expect(block).toMatch(EARLIER);
  });

  it('a document built from the current outline carries no such line', async () => {
    const { result, block } = await opened((current) => current);
    expect(result.document?.builtFromEarlierOutline).toBeUndefined();
    expect(block).not.toMatch(EARLIER);
    expect(block).toMatch(/registry US_NDA_SUPP/);
  });
});
