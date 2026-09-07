/**
 * Amendment leaves land at the FDA eCTD Module 1 headings the controlled
 * vocabulary names for them (server/services/ectd/controlled-vocab/cv-v4-data).
 */
import { describe, it, expect } from 'vitest';
import { planIndAmendment } from '../ind-amendment-service';

const doc = (category: string, title: string) => ({
  documentId: `doc-${category}`,
  title,
  category: category as never,
  changeKind: 'new' as const,
});

/** The plan prepends an automatic cover letter; find the leaf for the document itself. */
const leafFor = (plan: { leaves: Array<{ documentId?: string | null; sectionCode: string }> }, category: string) =>
  plan.leaves.find((l) => l.documentId === `doc-${category}`)!;

describe('planIndAmendment — Module 1 placement', () => {
  it("files the Investigator's Brochure at m1.14.4.1, not under investigational drug labeling", () => {
    // m1.14.4.1 is the investigator brochure; m1.14.4.2 is investigational drug
    // labeling. An IB revision was filed under labeling.
    const plan = planIndAmendment({ changedDocuments: [doc('investigators_brochure', 'IB v4')] } as never);
    expect(leafFor(plan, 'investigators_brochure').sectionCode).toBe('m1.14.4.1');
  });

  it('files a protocol-amendment summary as cover-letter content, not as pre-IND correspondence', () => {
    // m1.12.1 is pre-IND correspondence.
    const plan = planIndAmendment({ changedDocuments: [doc('protocol_amendment_summary', 'Summary of changes')] } as never);
    expect(leafFor(plan, 'protocol_amendment_summary').sectionCode).toBe('m1.2');
  });

  it("files a new investigator's Form 1572 under forms, not under a request to charge", () => {
    // m1.12.2 is request to charge for a clinical trial.
    const plan = planIndAmendment({ changedDocuments: [doc('new_investigator', 'Form 1572 — Dr Smith')] } as never);
    expect(leafFor(plan, 'new_investigator').sectionCode).toBe('m1.1');
  });
});
