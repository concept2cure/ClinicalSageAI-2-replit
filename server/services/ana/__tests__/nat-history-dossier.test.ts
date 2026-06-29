/**
 * Focused tests for the E13 natural-history / external-control evidence-dossier
 * composer (server/services/ana/nat-history-dossier.ts).
 *
 * Covers:
 *   - required_strings derivation (section headers + cited source ids)
 *   - the source-table renderer
 *   - the Part 11 honesty guard (no uncited claim; sample non-exportable)
 *   - dossier assembly (every section + every claim citation present)
 */

import { describe, it, expect } from 'vitest';
import {
  DOSSIER_SECTION_HEADERS,
  deriveRequiredStrings,
  renderSourceTable,
  evaluateHonestyGuard,
  assembleNatHistoryDossier,
  gatherSampleEvidence,
  type NatHistoryDossierRequest,
  type EvidenceSource,
} from '../nat-history-dossier.js';

function liveRequest(overrides: Partial<NatHistoryDossierRequest> = {}): NatHistoryDossierRequest {
  const base = gatherSampleEvidence('Disease X');
  return { ...base, provenance: 'live', ...overrides };
}

describe('deriveRequiredStrings', () => {
  it('includes every mandatory section header and every cited source id', () => {
    const req = liveRequest();
    const out = deriveRequiredStrings(req);
    for (const h of DOSSIER_SECTION_HEADERS) expect(out).toContain(h);
    for (const s of req.sources) expect(out).toContain(s.id);
  });

  it('orders headers first, then source ids, and dedupes', () => {
    const dup: EvidenceSource = {
      id: 'NCT01865084', // same id as a sample source
      role: 'external_control',
      title: 'dup',
      url: 'https://clinicaltrials.gov/study/NCT01865084',
      source: 'x',
    };
    const req = liveRequest({ sources: [...gatherSampleEvidence('Disease X').sources, dup] });
    const out = deriveRequiredStrings(req);
    expect(out.slice(0, DOSSIER_SECTION_HEADERS.length)).toEqual([...DOSSIER_SECTION_HEADERS]);
    // 'NCT01865084' appears exactly once despite the duplicate source.
    expect(out.filter((s) => s === 'NCT01865084')).toHaveLength(1);
  });
});

describe('renderSourceTable', () => {
  it('renders a pipe-delimited table with a header + separator + one row per source', () => {
    const sources = gatherSampleEvidence('Disease X').sources;
    const table = renderSourceTable(sources);
    const rows = table.split('\n');
    expect(rows[0]).toContain('| Identifier |');
    expect(rows[1]).toMatch(/^\|---\|/);
    expect(rows).toHaveLength(2 + sources.length);
    // Each source id + URL is present (the citation ledger).
    for (const s of sources) {
      expect(table).toContain(s.id);
      expect(table).toContain(s.url);
    }
  });

  it('escapes pipes in cell text so the grid is not broken', () => {
    const table = renderSourceTable([
      {
        id: 'NCT1',
        role: 'natural_history',
        title: 'A | B study',
        url: 'https://x/NCT1',
        source: 'S',
      },
    ]);
    expect(table).toContain('A \\| B study');
  });

  it('handles an empty source set without throwing', () => {
    const table = renderSourceTable([]);
    expect(table).toContain('(no sources)');
  });
});

describe('evaluateHonestyGuard', () => {
  it('passes a fully-cited live dossier and marks it sealable + exportable', () => {
    const g = evaluateHonestyGuard(liveRequest());
    expect(g.ok).toBe(true);
    expect(g.uncitedClaims).toHaveLength(0);
    expect(g.sealable).toBe(true);
    expect(g.exportable).toBe(true);
  });

  it('flags a claim whose sourceId resolves to no source', () => {
    const req = liveRequest();
    req.claims = [...req.claims, { kind: 'effect', text: 'orphan claim', sourceId: 'NCT_MISSING' }];
    const g = evaluateHonestyGuard(req);
    expect(g.ok).toBe(false);
    expect(g.uncitedClaims.map((c) => c.sourceId)).toContain('NCT_MISSING');
    expect(g.exportable).toBe(false);
  });

  it('flags a source missing an id or URL', () => {
    const req = liveRequest();
    req.sources = [...req.sources, { id: '', role: 'natural_history', title: 't', url: '', source: 's' }];
    const g = evaluateHonestyGuard(req);
    expect(g.ok).toBe(false);
    expect(g.uncitedSources).toHaveLength(1);
  });

  it('NEVER marks a sample-provenance dossier sealable or exportable, even when fully cited', () => {
    const g = evaluateHonestyGuard(gatherSampleEvidence('Disease X')); // provenance: 'sample'
    expect(g.ok).toBe(true); // claims are all cited
    expect(g.sealable).toBe(false); // but sample → not sealable
    expect(g.exportable).toBe(false);
    expect(g.reasons.join(' ')).toMatch(/sample/i);
  });

  it('treats not_assessed provenance as non-exportable', () => {
    const g = evaluateHonestyGuard(liveRequest({ provenance: 'not_assessed' }));
    expect(g.exportable).toBe(false);
  });
});

describe('assembleNatHistoryDossier', () => {
  it('produces content containing every mandatory section header', () => {
    const out = assembleNatHistoryDossier(liveRequest());
    for (const h of DOSSIER_SECTION_HEADERS) {
      expect(out.content).toContain(h);
      expect(out.requiredStrings).toContain(h);
    }
  });

  it('suffixes every claim with its cited source id inline', () => {
    const req = liveRequest();
    const out = assembleNatHistoryDossier(req);
    for (const c of req.claims) {
      // e.g. "… (NCT01865084)."
      expect(out.content).toContain(`(${c.sourceId}).`);
    }
  });

  it('embeds the source table with every source id and URL', () => {
    const req = liveRequest();
    const out = assembleNatHistoryDossier(req);
    for (const s of req.sources) {
      expect(out.content).toContain(s.id);
      expect(out.content).toContain(s.url);
    }
  });

  it('throws when a claim is uncited (honesty guard fails hard)', () => {
    const req = liveRequest();
    req.claims = [{ kind: 'effect', text: 'no source', sourceId: 'NOPE' }];
    expect(() => assembleNatHistoryDossier(req)).toThrow(/honesty guard/i);
  });

  it('assembles a sample dossier (preview) but reports it non-exportable', () => {
    const out = assembleNatHistoryDossier(gatherSampleEvidence('Disease X'));
    expect(out.content).toContain('Disease Natural History');
    expect(out.honesty.exportable).toBe(false);
  });
});
