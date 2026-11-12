/**
 * A device screen asks for a project's filing by the class it is recorded
 * under (P-114 item 4, 2026-11-12).
 *
 * The client's `docClassForPathway` (shared/constants/mdx.ts) is a projection
 * of the server's table of record, PROGRAM_TO_DOC_TYPE. This holds the two
 * together, so a class renamed on one side fails here, not as "No DE_NOVO
 * filing is recorded for this project" in the editor.
 */
import { describe, it, expect } from 'vitest';
import { docClassForPathway } from '../../../../shared/constants/mdx';
import { PROGRAM_TO_DOC_TYPE } from '../document-class';

describe('docClassForPathway', () => {
  it('names the De Novo class as the server records it', () => {
    expect(docClassForPathway('de_novo')).toBe('denovo');
    expect(docClassForPathway('de_novo')).toBe(PROGRAM_TO_DOC_TYPE.de_novo);
  });

  it('leaves the pathways whose class is their own spelling', () => {
    // The kit's pathway keys for the device screens that open a filing section.
    for (const pathway of ['k510', 'pma', 'cer', 'ivdr'] as const) expect(docClassForPathway(pathway)).toBe(pathway);
    expect(PROGRAM_TO_DOC_TYPE['510k']).toBe(docClassForPathway('k510'));
    expect(PROGRAM_TO_DOC_TYPE.pma).toBe(docClassForPathway('pma'));
  });
});
