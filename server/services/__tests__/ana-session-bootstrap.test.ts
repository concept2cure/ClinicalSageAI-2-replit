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

  it('recalls project files with their filed location and what each is for', () => {
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      vaultFiles: [
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
    });
    expect(out).toContain('Project files on record');
    expect(out).toContain('28-Day Rat Tox Report');
    expect(out).toContain('module-4 · 4.2.3.2');
    expect(out).toContain('GLP 28-day rat toxicology study report');
  });

  it('says honestly when a file has not been studied or failed extraction', () => {
    const out = formatSessionBootstrap({
      projectAtoms: [],
      clientAtoms: [],
      outcomeLessons: [],
      vaultFiles: [
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
    });
    expect(out).toContain('not yet studied');
    expect(out).toContain('unfiled — needs review');
    expect(out).toContain('extraction FAILED');
    // A file awaiting study must never be presented as understood.
    expect(out).not.toContain('cataloged');
  });
});
