import { describe, expect, it } from 'vitest';
import { withCaughtErrors } from '../document-tools-shared.js';

describe('catalog error transport privacy and receipt truth', () => {
  it.each(['catalog_project_document', 'read_project_document', 'list_project_documents', 'search_project_documents'])(
    'keeps private SQL/storage failures out of %s results', async name => {
      const handler = withCaughtErrors(name, async () => {
        throw new Error('password=private-fixture-value; /private/customer/location; SELECT clinical_secret FROM vault.documents');
      }, { safeOutcome: true });
      const encoded = await handler({});
      expect(JSON.parse(encoded)).toMatchObject({ ok: false, code: 'DOCUMENT_REQUEST_FAILED', outcome: 'unconfirmed' });
      expect(encoded).not.toMatch(/private-fixture-value|customer\/location|clinical_secret|SELECT/);
    },
  );
  it('does not claim rollback when an exception occurs after a persistence receipt', async () => {
    const committed: string[] = [];
    const handler = withCaughtErrors('catalog_project_document', async () => {
      committed.push('synthetic receipt');
      throw new Error('serialization failed after completion');
    }, { safeOutcome: true });
    const result = JSON.parse(await handler({}));
    expect(committed).toEqual(['synthetic receipt']);
    expect(result.outcome).toBe('unconfirmed');
    expect(result.persisted).toBeUndefined();
    expect(result.error).not.toMatch(/nothing (?:was )?(?:changed|saved)|rolled back/i);
  });
  it('passes an explicit structured refusal through unchanged', async () => {
    const refusal = JSON.stringify({ ok: false, code: 'SOURCE_FACT_BINDING_FAILED', persisted: false });
    expect(await withCaughtErrors('catalog_project_document', async () => refusal, { safeOutcome: true })({})).toBe(refusal);
  });
});
