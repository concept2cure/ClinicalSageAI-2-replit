/**
 * Session-bootstrap ranking + formatting — pure functions, no DB, no mocks.
 */
import { describe, it, expect } from 'vitest';
import {
  bootstrapAtomScore,
  rankBootstrapAtoms,
  formatSessionBootstrap,
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
