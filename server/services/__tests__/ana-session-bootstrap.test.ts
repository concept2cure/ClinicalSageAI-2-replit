/**
 * Session-bootstrap ranking + formatting — pure functions, no DB, no mocks.
 */
import { describe, it, expect } from 'vitest';
import {
  bootstrapAtomScore,
  rankBootstrapAtoms,
  formatVaultFileLine,
  formatSessionBootstrap,
  shouldAutoBootstrap,
  type BootstrapAtom,
  type SessionBootstrapParts,
} from '../ana-session-bootstrap-format';

const atom = (over: Partial<BootstrapAtom>): BootstrapAtom => ({
  title: 'T',
  content: 'C',
  importance: 'medium',
  isVerified: false,
  confidence: 0.5,
  ...over,
});

describe('catalog recall verification scope', () => {
  it.each(['suggested', 'confirmed', 'corrected'])('preserves %s provenance and discloses unrecorded scientific context', state => {
    const text = formatVaultFileLine({ fileName: 'assay.pdf', documentTitle: 'Assay report',
      placementStatus: 'confirmed', catalogStatus: 'cataloged', catalogState: state });
    expect(text).toContain('legacy value-presence check');
    expect(text).toContain('label/context verification is not recorded');
    expect(text).toContain('scientific qualification is unassessed');
    if (state === 'confirmed') expect(text).toContain('confirmed by a person');
    if (state === 'corrected') expect(text).toContain('corrected by a person');
    if (state === 'suggested') expect(text).toContain('your suggestion, not yet confirmed');
  });
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

describe('formatSessionBootstrap — complete memory within the prompt budget', () => {
  const empty = { projectAtoms: [], clientAtoms: [], outcomeLessons: [] };
  const heading = '## Session memory — picking up where we left off';
  const workingHeading = '### Where we left off';
  const omission = /memory.*omitted.*budget.*history is incomplete/i;

  it('keeps trailing qualifications in working, project, client and lesson records when they fit together', () => {
    const working = `${'The retained results need independent review. '.repeat(29)}Do not describe the study as successful.`;
    const title = `${'Review of study results '.repeat(6)}— still provisional`;
    const project = `${'The draft currently cites the frozen analysis. '.repeat(6)}Exclude the exploratory subgroup claim.`;
    const client = `${'The sponsor requested a source-based draft. '.repeat(6)}Do not infer sponsor approval.`;
    const lesson = `${'Check the source version before using a result. '.repeat(5)}Never substitute a model estimate.`;
    const out = formatSessionBootstrap({
      workingMemorySummary: working,
      projectAtoms: [atom({ title, content: project })],
      clientAtoms: [atom({ title: 'Sponsor direction', content: client })],
      outcomeLessons: [{ capabilityKey: 'draft-csr', outcome: 'failure', lessonsLearned: lesson }],
    });
    for (const whole of [working, title, project, client, lesson]) expect(out).toContain(whole);
    expect(out.length).toBeLessThanOrEqual(4500);
    expect(out).not.toMatch(omission);
    expect(out).not.toContain('…');
  });

  it('omits an oversized working summary and still considers later memory', () => {
    const working = `The primary endpoint was achieved. ${'Source review pending. '.repeat(240)}That claim is unconfirmed and must not be used.`;
    const out = formatSessionBootstrap({ ...empty, workingMemorySummary: working,
      projectAtoms: [atom({ title: 'Current task', content: 'Reconcile the analysis before drafting.' })],
      outcomeLessons: [{ capabilityKey: 'review', outcome: 'failure', lessonsLearned: 'Keep the original source.' }],
    });
    expect(out).not.toContain('The primary endpoint was achieved.');
    expect(out).not.toContain(workingHeading);
    expect(out).toContain('Reconcile the analysis before drafting.');
    expect(out).toContain('Keep the original source.');
    expect(out).toMatch(omission);
    expect(out.length).toBeLessThanOrEqual(4500);
  });

  it.each(['project', 'client', 'lesson'] as const)('skips an oversized %s record without losing a later complete record', kind => {
    const content = `Unqualified ${kind} claim. ${'Retain the source context. '.repeat(200)}Do not use that claim.`;
    const parts: SessionBootstrapParts = { ...empty };
    if (kind === 'lesson') {
      parts.outcomeLessons = [
        { capabilityKey: 'oversized-lesson', outcome: 'failure', lessonsLearned: content },
        { capabilityKey: 'later-lesson', outcome: 'failure', lessonsLearned: 'Ask for the saved protocol.' },
      ];
    } else {
      parts[kind === 'project' ? 'projectAtoms' : 'clientAtoms'] = [
        atom({ title: `Oversized ${kind}`, content, importance: 'critical' }),
        atom({ title: `Later ${kind}`, content: 'Ask for the saved protocol.', importance: 'low' }),
      ];
    }
    const out = formatSessionBootstrap(parts);
    expect(out).not.toContain(`Unqualified ${kind} claim.`);
    expect(out).not.toContain(kind === 'lesson' ? 'oversized-lesson' : `Oversized ${kind}`);
    expect(out).toContain('Ask for the saved protocol.');
    expect(out).toMatch(omission);
    expect(out.length).toBeLessThanOrEqual(4500);
  });

  it('budgets full titles, categories and lesson labels as part of each record', () => {
    const out = formatSessionBootstrap({ ...empty,
      projectAtoms: [
        atom({ title: `Title ${'T'.repeat(4500)}`, content: 'Omit the long-title record.', importance: 'critical' }),
        atom({ title: 'Long category', category: 'C'.repeat(4500), content: 'Omit the long-category record.', importance: 'high' }),
        atom({ title: 'Fits', content: 'This full record remains.', importance: 'low' }),
      ],
      outcomeLessons: [{ capabilityKey: 'K'.repeat(4500), outcome: 'failure', lessonsLearned: 'Omit the long-label record.' }],
    });
    expect(out).toContain('This full record remains.');
    expect(out).not.toContain('Omit the long-');
    expect(out).not.toContain('What I learned on past work here');
    expect(out).toMatch(omission);
    expect(out.length).toBeLessThanOrEqual(4500);
  });

  it('admits a complete summary exactly at the rendered budget without an omission notice', () => {
    const summary = 'S'.repeat(4500 - heading.length - workingHeading.length - 2);
    const out = formatSessionBootstrap({ ...empty, workingMemorySummary: summary });
    expect(out).toBe([heading, workingHeading, summary].join('\n'));
    expect(out.length).toBe(4500);
    expect(out).not.toMatch(omission);
  });

  it('reserves room for the omission notice before admitting complete records', () => {
    const prefix = 'Do not drop this qualification. ';
    const summary = prefix + 'S'.repeat(4500 - heading.length - workingHeading.length - 2 - prefix.length);
    const out = formatSessionBootstrap({ ...empty, workingMemorySummary: summary,
      projectAtoms: [atom({ title: 'Later record', content: 'Read the saved decision.' })] });
    expect(out).not.toContain('Do not drop this qualification.');
    expect(out).not.toContain(workingHeading);
    expect(out).toContain('Read the saved decision.');
    expect(out).toMatch(omission);
    expect(out.length).toBeLessThanOrEqual(4500);
  });

  it('reports an incomplete history when all candidates are omitted, without empty section headings', () => {
    const out = formatSessionBootstrap({ ...empty, workingMemorySummary: 'W'.repeat(4600),
      projectAtoms: [atom({ title: 'P', content: 'P'.repeat(4600) })],
      clientAtoms: [atom({ title: 'C', content: 'C'.repeat(4600) })],
      outcomeLessons: [{ capabilityKey: 'k', outcome: 'failure', lessonsLearned: 'L'.repeat(4600) }],
    });
    expect(out).toMatch(omission);
    expect(out).not.toContain('###');
    expect(out.length).toBeLessThanOrEqual(4500);
    expect(formatSessionBootstrap({ ...empty, workingMemorySummary: ' \n\t ' })).toBe('');
  });

  it('preserves ordinary short output, section order, ranking and count limits', () => {
    const out = formatSessionBootstrap({ workingMemorySummary: '  Resume\nreview.  ', atomLimit: 2,
      projectAtoms: [
        atom({ title: 'Low', content: 'Do not include.', importance: 'low' }),
        atom({ title: 'High', content: 'Check the source.', category: 'decision', importance: 'high' }),
        atom({ title: 'Critical', content: 'Keep the qualifier.', importance: 'critical' }),
      ],
      clientAtoms: [atom({ title: 'Client', content: 'Ask the sponsor.' })],
      outcomeLessons: Array.from({ length: 6 }, (_, i) => ({ capabilityKey: 'review', outcome: 'failure', lessonsLearned: `Lesson ${i}.` })),
    });
    expect(out).toBe([
      heading, workingHeading, 'Resume review.',
      '### Project memory (most important)', '- **Critical**: Keep the qualifier.', '- **High** _(decision)_: Check the source.',
      '### Client memory (most important)', '- **Client**: Ask the sponsor.',
      '### What I learned on past work here',
      ...Array.from({ length: 5 }, (_, i) => `- (review, failure) Lesson ${i}.`),
    ].join('\n'));
  });

  it('leaves Vault and chat preview text and access notices outside the memory budget', () => {
    const files: Pick<SessionBootstrapParts, 'vaultFiles' | 'chatUploads'> = {
      vaultFiles: { ...WHOLE_SCOPE, total: 12, actorFiltered: true, sourceAccessNotice: 'Only currently accessible records are listed.',
        files: Array.from({ length: 12 }, (_, i) => ({ fileName: `source-${i}.pdf`, documentTitle: `Source ${i}`,
          placementStatus: 'confirmed', catalogStatus: 'cataloged', catalogState: 'confirmed',
          documentKind: 'Governed source', purpose: 'Source detail. '.repeat(20) })),
      },
      chatUploads: { uploads: [{ fileName: 'earlier-source.pdf', fileId: 'file_source' }], hasMore: true, actorFiltered: true,
        sourceAccessNotice: 'Chat files are scoped to the current actor.' },
    };
    const previews = formatSessionBootstrap({ ...empty, ...files }).slice(heading.length + 1);
    const content = `${'Keep all of this memory. '.repeat(14)}Do not state a definitive conclusion.`;
    const out = formatSessionBootstrap({ ...empty, ...files,
      projectAtoms: [atom({ title: 'Draft boundary', content })],
      outcomeLessons: [{ capabilityKey: 'review', outcome: 'failure', lessonsLearned: 'Read the complete source.' }],
    });
    expect(out).toContain(previews);
    expect(out).toContain(content);
    expect(out).toContain('Read the complete source.');
    expect(out.length).toBeGreaterThan(4500); // File previews have their own established limits.
    expect(out).not.toMatch(omission);
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

  it('discloses an unmeasured actor scope total for a bounded chat page', () => {
    const out = formatSessionBootstrap({ projectAtoms: [], clientAtoms: [], outcomeLessons: [],
      chatUploads: { uploads: [{ fileName: 'a.pdf', fileId: 'file_a' }], hasMore: true, actorFiltered: true } });
    expect(out).toContain('Showing 1 chat file(s) from your accessible source scope');
    expect(out).toContain('scope total was not measured');
    expect(out).toContain('More than these 1 were attached');
    expect(out).not.toContain('1 chat file(s) in your accessible source scope at this recall check');
  });

  it('retains a measured scope total when an exhausted actor page supplies it', () => {
    const out = formatSessionBootstrap({ projectAtoms: [], clientAtoms: [], outcomeLessons: [],
      chatUploads: { uploads: [{ fileName: 'a.pdf', fileId: 'file_a' }], hasMore: false, actorFiltered: true, total: 1 } });
    expect(out).toContain('1 chat file(s) in your accessible source scope at this recall check');
    expect(out).not.toContain('scope total was not measured');
    expect(out).not.toContain('More than these');
  });
});
