/**
 * Session-bootstrap ranking + formatting — pure functions, no DB, no mocks.
 */
import { describe, it, expect } from 'vitest';
import {
  bootstrapAtomScore,
  rankBootstrapAtoms,
  formatSessionBootstrap,
  shouldAutoBootstrap,
  type BootstrapAtom,
} from '../ana-session-bootstrap-format';

const atom = (over: Partial<BootstrapAtom>): BootstrapAtom => ({
  title: 'T',
  content: 'C',
  importance: 'medium',
  isVerified: false,
  confidence: 0.5,
  ...over,
});

/**
 * The scope for a listing that IS complete — nothing withheld, nothing
 * outstanding. Cases about the per-file line say so once here rather than
 * restating six zeroes each; cases about the scope line set their own.
 */
const WHOLE_SCOPE = {
  total: 1,
  withheld: 0,
  notYetStudied: 0,
  extractionFailed: 0,
  unfiled: 0,
};

describe('bootstrapAtomScore', () => {
  it('rewards importance, verification, and confidence', () => {
    const low = atom({ importance: 'low', isVerified: false, confidence: 0 });
    const high = atom({ importance: 'critical', isVerified: true, confidence: 1 });
    expect(bootstrapAtomScore(high)).toBeGreaterThan(bootstrapAtomScore(low));
  });

  it('defaults unknown importance to a middle weight', () => {
    const unknown = atom({ importance: 'weird', isVerified: false, confidence: 0 });
    const known = atom({ importance: 'medium', isVerified: false, confidence: 0 });
    // 1.5 default vs 2 for medium
    expect(bootstrapAtomScore(unknown)).toBeLessThan(bootstrapAtomScore(known));
  });
});

describe('rankBootstrapAtoms', () => {
  it('orders by score then recency and respects the limit', () => {
    const ranked = rankBootstrapAtoms(
      [
        atom({ title: 'low', importance: 'low', confidence: 0 }),
        atom({ title: 'critical', importance: 'critical', isVerified: true, confidence: 1 }),
        atom({ title: 'medium', importance: 'medium', confidence: 0.5 }),
      ],
      2
    );
    expect(ranked.map(a => a.title)).toEqual(['critical', 'medium']);
  });

  it('breaks ties by createdAt recency', () => {
    const older = atom({ title: 'older', createdAt: '2024-01-01T00:00:00Z' });
    const newer = atom({ title: 'newer', createdAt: '2025-01-01T00:00:00Z' });
    const ranked = rankBootstrapAtoms([older, newer], 2);
    expect(ranked[0].title).toBe('newer');
  });
});

describe('shouldAutoBootstrap', () => {
  it('fires only at session start with an org', () => {
    expect(shouldAutoBootstrap({ priorMessageCount: 0, organizationId: 1 })).toBe(true);
  });
  it('does not fire mid-conversation', () => {
    expect(shouldAutoBootstrap({ priorMessageCount: 3, organizationId: 1 })).toBe(false);
  });
  it('does not fire without an org', () => {
    expect(shouldAutoBootstrap({ priorMessageCount: 0, organizationId: null })).toBe(false);
  });
  it('respects the disable flag', () => {
    expect(shouldAutoBootstrap({ priorMessageCount: 0, organizationId: 1, disabled: true })).toBe(false);
  });
});

describe('formatSessionBootstrap', () => {
  it('renders all sections when present', () => {
    const out = formatSessionBootstrap({
      workingMemorySummary: 'We agreed on the primary endpoint.',
      projectAtoms: [atom({ title: 'Endpoint', content: 'ORR primary', category: 'endpoint', importance: 'high' })],
      clientAtoms: [atom({ title: 'Sponsor', content: 'Concept2Cure', category: 'persona' })],
      outcomeLessons: [
        { capabilityKey: 'draft-csr', outcome: 'failure', documentType: 'csr', lessonsLearned: 'Cite the SAP version.' },
      ],
    });
    expect(out).toContain('Session memory');
    expect(out).toContain('Where we left off');
    expect(out).toContain('Project memory');
    expect(out).toContain('Client memory');
    expect(out).toContain('What I learned on past work here');
    expect(out).toContain('Cite the SAP version.');
  });

  it('returns empty string when there is nothing to recall', () => {
    expect(
      formatSessionBootstrap({ projectAtoms: [], clientAtoms: [], outcomeLessons: [] })
    ).toBe('');
  });

  it('omits lessons with no lessonsLearned text', () => {
    const out = formatSessionBootstrap({
      projectAtoms: [atom({ title: 'X', content: 'y' })],
      clientAtoms: [],
      outcomeLessons: [{ capabilityKey: 'k', outcome: 'success', lessonsLearned: null }],
    });
    expect(out).not.toContain('What I learned');
  });

});

describe("formatSessionBootstrap — the client's files", () => {
  it('recalls project files with their filed location and what each is for', () => {
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      vaultFiles: {
        ...WHOLE_SCOPE,
        files: [
        {
          fileName: 'tox-28day.pdf',
          documentTitle: '28-Day Rat Tox Report',
          programName: 'AZR-110 IND',
          folderId: 'module-4',
          ctdSection: '4.2.3.2',
          placementStatus: 'confirmed',
          catalogStatus: 'cataloged',
          documentKind: 'GLP 28-day rat toxicology study report',
          purpose: 'Supports Module 4 repeat-dose tox.',
        },
      ],
      },
    });
    expect(out).toContain('Project files on record');
    expect(out).toContain('28-Day Rat Tox Report');
    expect(out).toContain('module-4 · 4.2.3.2');
    expect(out).toContain('GLP 28-day rat toxicology study report');
  });

  it('recalls files the client sent in past conversations, with the id that reopens them', () => {
    // A chat upload has no vault row, so it carried no filed location and no
    // comprehension record — and was therefore absent from session recall
    // entirely, which is the "she doesn't remember the file is there" this
    // block exists to end.
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      chatUploads: { hasMore: false, uploads: [{ fileName: 'batch-record-23-104.pdf', fileId: 'file_1712345678_ab12cd' }] },
    });
    expect(out).toContain('Files the client sent in past conversations');
    expect(out).toContain('batch-record-23-104.pdf');
    expect(out).toContain('file_1712345678_ab12cd');
    // It says what is true of them — reachable, not filed — and how to fix that.
    expect(out).toContain('not filed into the vault');
    expect(out).toContain('file_chat_upload_to_vault');
  });

  it('says honestly when a file has not been studied or failed extraction', () => {
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      vaultFiles: {
        ...WHOLE_SCOPE, total: 2, notYetStudied: 1, extractionFailed: 1, unfiled: 1,
        files: [
        {
          fileName: 'coa-batch-23-104.pdf',
          documentTitle: 'CoA batch 23-104',
          placementStatus: 'unfiled',
          catalogStatus: 'extracted',
        },
        {
          fileName: 'scan-blurry.pdf',
          documentTitle: 'Scanned protocol',
          placementStatus: 'suggested',
          folderId: 'module-5',
          catalogStatus: 'extraction_failed',
        },
      ],
      },
    });
    expect(out).toContain('not yet studied');
    expect(out).toContain('unfiled — needs review');
    expect(out).toContain('extraction FAILED');
    // A file awaiting study must never be presented as understood.
    expect(out).not.toContain('cataloged');
  });
});

describe('formatSessionBootstrap — a sample is not the scope', () => {
  /* ── The sample is not the scope ────────────────────────────────────────
     Recall lists the twelve newest files. An org with more than twelve had
     the rest silently dropped — the OLDEST ones, which are exactly the files
     a client assumes AnA still knows about. Nothing in the block said so, so
     the only honest answer available to the model ("I only see twelve of your
     files") was one it had no way to give, and the answer it gave instead was
     "there is no such document". These cases pin the sentence that fixes it;
     with formatVaultScopeLine removed from the renderer they fail. */
  it('says how many files it is NOT showing, and forbids answering from the sample', () => {
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      vaultFiles: {
        files: [
          {
            fileName: 'newest.pdf',
            documentTitle: 'Newest',
            placementStatus: 'confirmed',
            catalogStatus: 'cataloged',
          },
        ],
        total: 40,
        withheld: 39,
        notYetStudied: 19,
        extractionFailed: 0,
        unfiled: 4,
      },
    });
    expect(out).toContain('Showing 1 of 40 files on record');
    expect(out).toContain('39 older one(s) are NOT listed above');
    expect(out).toContain('no such document');
    expect(out).toContain('list_project_documents');
  });

  it('counts what needs attention across the whole scope, not across the sample', () => {
    // The sample is one cataloged, filed file. Saying "nothing to do" from it
    // would be the page reported as the total, one level up.
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      vaultFiles: {
        files: [
          {
            fileName: 'newest.pdf',
            documentTitle: 'Newest',
            placementStatus: 'confirmed',
            catalogStatus: 'cataloged',
          },
        ],
        total: 40,
        withheld: 39,
        notYetStudied: 19,
        extractionFailed: 2,
        unfiled: 4,
      },
    });
    expect(out).toContain('19 not yet studied');
    expect(out).toContain('4 unfiled');
    expect(out).toContain('2 with failed extraction');
    expect(out).toContain('not just the ones above');
  });

});

describe('formatSessionBootstrap — completeness is claimed only when earned', () => {
  it('claims completeness only when the listing really is complete', () => {
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      vaultFiles: {
        files: [
          {
            fileName: 'only.pdf',
            documentTitle: 'Only file',
            placementStatus: 'confirmed',
            catalogStatus: 'cataloged',
          },
        ],
        total: 1,
        withheld: 0,
        notYetStudied: 0,
        extractionFailed: 0,
        unfiled: 0,
      },
    });
    expect(out).toContain('1 file(s) on record — this is all of them.');
    expect(out).not.toContain('NOT listed above');
  });

  it('says when more chat uploads were attached than it is showing', () => {
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      chatUploads: {
        uploads: [{ fileName: 'a.pdf', fileId: 'file_a' }],
        hasMore: true,
      },
    });
    expect(out).toContain('More than these 1 were attached');
  });

  it('does not invent a "there is more" claim when there is not', () => {
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      chatUploads: {
        uploads: [{ fileName: 'a.pdf', fileId: 'file_a' }],
        hasMore: false,
      },
    });
    expect(out).not.toContain('were attached — list_project_documents');
  });
});

