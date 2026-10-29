/**
 * An information amendment says what it contains (21 CFR 312.31(b)), as a
 * protocol amendment already says its 312.30(d) title (CSR path review,
 * 2026-10-29).
 *
 * 312.31(b) requires an information amendment "to bear prominent
 * identification of its contents (e.g., 'Information Amendment: Chemistry,
 * Manufacturing, and Control', 'Information Amendment:
 * Pharmacology-Toxicology', 'Information Amendment: Clinical')". The planner
 * derived only the protocol-amendment titles, had no category for a clinical
 * study report, and the cover letter titled every information amendment plain
 * "Information Amendment" with no gap. A sponsor filing a CSR to its IND, as
 * the LMN-201 prospect would, got a letter that did not say "Clinical".
 */
import { describe, expect, it } from 'vitest';
import { planIndAmendment } from '../ind-amendment-service';
import { assembleCoverLetter } from '../ind-cover-letter-service';

const doc = (category: string, title: string) => ({
  documentId: `doc-${category}`, title, category: category as never, changeKind: 'added' as const,
});
const plan = (...docs: ReturnType<typeof doc>[]) => planIndAmendment({ changedDocuments: docs } as never);
const letter = (extra: Record<string, unknown>) => assembleCoverLetter({
  sponsorName: 'Sponsor Inc.', drugName: 'Drug X', fdaCenter: 'CBER', indNumber: '123456',
  signatoryName: 'A. Signatory', submissionType: 'information_amendment', ...extra,
});

describe('the amendment plan names its 312.31(b) contents', () => {
  it('a clinical study report is an information amendment: Clinical, filed in Module 5.3 with its placement to confirm', () => {
    const p = plan(doc('clinical_study_report', 'CSR LMN-201-CDI02'));
    const leaf = p.leaves.find(l => l.documentId === 'doc-clinical_study_report')!;
    expect(leaf.sectionCode).toBe('m5.3.5.1');
    expect(leaf.amendmentClass).toBe('information');
    expect(p.informationAmendmentTitles).toEqual(['Information Amendment: Clinical']);
    expect(p.warnings.join(' ')).toMatch(/5\.3/);
  });

  it('each content category gives its own title, once, and a protocol amendment gives none', () => {
    expect(plan(doc('cmc', 'Stability update'), doc('pharmacology_toxicology', '13-week tox'), doc('clinical_summary', '2.7 update'))
      .informationAmendmentTitles).toEqual([
      'Information Amendment: Chemistry, Manufacturing, and Control',
      'Information Amendment: Clinical',
      'Information Amendment: Pharmacology-Toxicology',
    ]);
    expect(plan(doc('protocol', 'Protocol v3')).informationAmendmentTitles).toEqual([]);
  });
});

describe('the cover letter identifies an information amendment by its contents', () => {
  it('says "Information Amendment: Clinical" when the plan says so', () => {
    const r = letter({ informationAmendmentTitles: ['Information Amendment: Clinical'] });
    expect(r.body).toContain('Information Amendment: Clinical');
    expect(r.gaps.join(' ')).not.toMatch(/312\.31\(b\)/);
  });

  it('names the gap when no contents are stated, and accepts no title the regulation does not give', () => {
    const r = letter({ informationAmendmentTitles: ['Information Amendment: Everything'] });
    expect(r.body).not.toContain('Everything');
    expect(r.gaps.join(' ')).toMatch(/312\.31\(b\)/);
  });
});
