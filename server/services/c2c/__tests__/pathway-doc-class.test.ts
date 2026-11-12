/**
 * A device screen asks for a project's filing by the class it is recorded
 * under (P-114 item 4, 2026-11-12).
 *
 * The client's `docClassForPathway` (shared/constants/mdx.ts) is a projection
 * of the server's table of record, PROGRAM_TO_DOC_TYPE. This holds the two
 * together, so a class renamed on one side fails here, not as "No DE_NOVO
 * filing is recorded for this project" in the editor.
 *
 * `euTechnicalFileRegulation` (P-114 item 3, 2026-11-12) is held to the same
 * table: a screen assembles an EU technical file, and stops offering the FDA
 * eSTAR, for exactly the projects whose governed document is `mdr` or `ivdr`.
 */
import { describe, it, expect } from 'vitest';
import { docClassForPathway, euTechnicalFileRegulation } from '../../../../shared/constants/mdx';
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

describe('euTechnicalFileRegulation', () => {
  it('names the regulation for exactly the program types whose document class is an EU technical file', () => {
    const named: string[] = [];
    for (const [programType, docType] of Object.entries(PROGRAM_TO_DOC_TYPE)) {
      const expected = docType === 'mdr' || docType === 'ivdr' ? docType : null;
      expect(euTechnicalFileRegulation(programType), programType).toBe(expected);
      if (expected) named.push(programType);
    }
    expect(named.sort()).toEqual(['ivdr', 'mdr']);
  });

  it('reads the type as the programs route sends it', () => {
    expect(euTechnicalFileRegulation('IVDR')).toBe('ivdr');
    expect(euTechnicalFileRegulation(' MDR ')).toBe('mdr');
  });

  it('is null for a CER, an FDA route, a generic IVD and an unrecorded filing', () => {
    // A CER project files its report; a generic `ivd` names no pathway (document-class.ts).
    for (const type of ['cer', '510k', 'de_novo', 'pma', 'ivd', 'device', '', null, undefined]) {
      expect(euTechnicalFileRegulation(type), String(type)).toBeNull();
    }
  });
});
