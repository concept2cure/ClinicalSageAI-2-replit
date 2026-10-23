import { describe, expect, it } from 'vitest';
import { pickDossierDocument } from '../useDossier';

describe('dossier document identity', () => {
  const project = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const row = (id: string, doc_type: string, project_id = project) => ({ id, doc_type, project_id });

  it('does not relabel the primary filing as an absent secondary CER or IVDR document', () => {
    const docs = [row('primary', 'k510')];
    expect(pickDossierDocument(docs, 'cer', project)).toBeNull();
    expect(pickDossierDocument(docs, 'ivd', project)).toBeNull();
  });

  it('uses exact pathway classes rather than partial name matches', () => {
    const docs = [row('mdr-technical-file', 'mdr'), row('cer', 'cer'), row('ivdr', 'ivdr'), row('primary', 'k510')];
    expect(pickDossierDocument(docs, 'cer', project)?.id).toBe('cer');
    expect(pickDossierDocument(docs, 'ivd', project)?.id).toBe('ivdr');
    expect(pickDossierDocument(docs, 'k510', project)?.id).toBe('primary');
  });

  it('rejects an unrelated or missing project identity even when the document type matches', () => {
    expect(pickDossierDocument([row('private', 'cer', other)], 'cer', project)).toBeNull();
    expect(pickDossierDocument([{ id: 'unanchored', doc_type: 'cer' }], 'cer', project)).toBeNull();
    expect(pickDossierDocument([row('other', 'k510_extra')], 'k510', project)).toBeNull();
  });
});
