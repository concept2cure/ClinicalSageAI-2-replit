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
  // 'added' is the change kind for a new document ('new' is the leaf's
  // lifecycle operation, which the planner derives from it).
  changeKind: 'added' as const,
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

/* P-21 (product decision 2026-10-08): regulated choices start unstated. The
   intake card sent its first category and change kind for selects nobody
   touched ("protocol" / "added"); the planner then placed the document under a
   category nobody chose. An unstated choice is refused, naming it — never
   routed to a default. */
describe('planIndAmendment — a category or change kind nobody stated is refused', () => {
  const refusal = (fn: () => unknown): string => {
    try {
      fn();
      return '';
    } catch (e) {
      return (e as Error).message;
    }
  };

  it('names an unstated category and change kind, and plans nothing', () => {
    const msg = refusal(() => planIndAmendment({ indNumber: '123456', changedDocuments: [{ documentId: 'd1', title: 'Protocol v2' }] } as never));
    expect(msg).toMatch(/^IND_AMENDMENT_UNSTATED: /);
    expect(msg).toContain('"Protocol v2": content category, change kind');
  });

  it('refuses a change kind outside the vocabulary rather than planning a leaf with no lifecycle operation', () => {
    const msg = refusal(() =>
      planIndAmendment({ indNumber: '123456', changedDocuments: [{ documentId: 'd1', title: 'IB v4', category: 'investigators_brochure', changeKind: 'new' }] } as never),
    );
    expect(msg).toMatch(/^IND_AMENDMENT_UNSTATED: /);
    expect(msg).toContain('change kind ("new" is not one of added, revised, appended, withdrawn)');
  });
});
