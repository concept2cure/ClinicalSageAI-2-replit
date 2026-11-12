/**
 * A filing's paperwork is not a design record (P-114 item 2, 2026-11-09,
 * decided under the founder's delegation; MDX journey M16).
 *
 * Engineering's design-history list is the project's own document sections
 * (P-60), and it tagged every one "DHF": the cover letter, the FDA forms, the
 * truthful and accurate statement, the financial certification and the 510(k)
 * summary included. Under the QMSR (21 CFR 820, incorporating ISO 13485:2016
 * §7.3.10) the design and development file holds design inputs and outputs,
 * verification, validation, reviews, transfer, changes and risk records.
 *
 * The governed FDA device outlines name their own "Administrative" group (A)
 * in every version; the indications for use statement is Form FDA 3881
 * wherever an outline files it.
 */
import { describe, it, expect } from 'vitest';
import { designFileStanding } from '../design-controls-trace';

const k510 = (label: string, groupLabel: string | null) => designFileStanding({ docType: 'k510', label, groupLabel });

describe('designFileStanding', () => {
  it("marks a section of the outline's Administrative group as filing content", () => {
    for (const label of [
      'Cover letter',
      'Submitter, applicant and correspondent information',
      'Consensus standards and declarations of conformity',
      '510(k) summary or 510(k) statement (21 CFR 807.92 / 807.93)',
      'Truthful and accuracy statement (21 CFR 807.87(k))',
      'Financial certification or disclosure (21 CFR Part 54), where clinical data are relied on',
      'MDUFA user fee — Form FDA 3601 and payment',
    ]) expect(k510(label, 'Administrative'), label).toBe('filing-content');
  });

  it('reads the PMA outline\'s group by its own label, and the group heading itself', () => {
    const pmaGroup = 'A · Administrative information (21 CFR 814.20(b)(1)–(2))';
    expect(designFileStanding({ docType: 'pma', label: 'FDA Form 3514 — CDRH cover sheet', groupLabel: pmaGroup })).toBe('filing-content');
    expect(designFileStanding({ docType: 'pma', label: pmaGroup, groupLabel: null })).toBe('filing-content');
  });

  it('marks the indications for use statement (Form FDA 3881) wherever the outline files it', () => {
    expect(k510('Indications for use statement', 'Device description')).toBe('filing-content');
    expect(designFileStanding({ docType: 'denovo', label: 'Indications for use', groupLabel: 'Administrative' })).toBe('filing-content');
  });

  it('leaves the design and performance sections in the design file', () => {
    expect(k510('Device description and principles of operation', 'Device description')).toBe('design-file');
    expect(k510('Bench performance testing', 'Performance and safety testing')).toBe('design-file');
    expect(k510('Benefits, risks and mitigation measures — risk management (ISO 14971)', 'Design, manufacturing and labeling')).toBe('design-file');
    expect(designFileStanding({ docType: 'pma', label: 'Device description summary', groupLabel: 'B · Summary of safety and effectiveness data (21 CFR 814.20(b)(3))' })).toBe('design-file');
  });

  it('decides nothing for a document that is not an FDA device filing, or whose class is unknown', () => {
    expect(designFileStanding({ docType: 'ivdr', label: 'EU declaration of conformity — Annex IV', groupLabel: 'Conformity assessment and registration' })).toBe('design-file');
    expect(designFileStanding({ docType: 'cer', label: 'Administrative', groupLabel: null })).toBe('design-file');
    expect(designFileStanding({ docType: null, label: 'Cover letter', groupLabel: 'Administrative' })).toBe('design-file');
  });

  it('does not take a word inside a label for the group', () => {
    expect(k510('Manufacturing site administrative controls', 'Design, manufacturing and labeling')).toBe('design-file');
  });
});
