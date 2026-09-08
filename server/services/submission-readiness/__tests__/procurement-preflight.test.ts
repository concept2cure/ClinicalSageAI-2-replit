import { describe, it, expect } from 'vitest';
import { buildPreflightReport, type PreflightObservation } from '../procurement-preflight';

/**
 * The preflight aggregates three independent readiness sources into one
 * procurement picture. These pin the reporting logic (pure) — that nothing is
 * reported satisfied without being observed, and that each gap says where it
 * goes and what it unblocks.
 */

const EMPTY: PreflightObservation = {
  dtdFilesPresent: [],
  dtdDir: '/assets/ectd-dtd',
  estarFilesPresent: [],
  estarDir: '/assets/estar-templates',
  validators: [
    { id: 'internal', label: 'Internal structural validator', configured: true },
    { id: 'fda_evalidator', label: 'FDA eValidator', configured: false },
  ],
};

describe('buildPreflightReport', () => {
  it('reports not-ready and lists every gap when nothing is vendored', () => {
    const r = buildPreflightReport(EMPTY);
    expect(r.ready).toBe(false);
    expect(r.summary.missing).toBeGreaterThan(0);
    // The always-available internal validator is the one satisfied item.
    expect(r.summary.satisfied).toBe(1);
    expect(r.actions.length).toBe(r.summary.missing);
  });

  it('never reports an artifact satisfied that was not observed', () => {
    const r = buildPreflightReport(EMPTY);
    const dtds = r.items.filter((i) => i.category === 'ectd_dtd');
    expect(dtds.length).toBeGreaterThan(0);
    expect(dtds.every((i) => !i.satisfied)).toBe(true);
  });

  it('matches vendored filenames case-insensitively', () => {
    const r = buildPreflightReport({
      ...EMPTY,
      dtdFilesPresent: ['ICH-ECTD-3-2.DTD'],
    });
    const backbone = r.items.find((i) => i.label === 'ich-ectd-3-2.dtd');
    expect(backbone?.satisfied).toBe(true);
  });

  it('covers all four eCTD regions (US/EU/JP/CA) and dedupes the shared backbone', () => {
    const r = buildPreflightReport(EMPTY);
    const labels = r.items.filter((i) => i.category === 'ectd_dtd').map((i) => i.label);
    expect(labels).toContain('us-regional-v3-3.dtd');
    expect(labels).toContain('eu-regional.dtd');
    expect(labels).toContain('jp-regional.dtd');
    expect(labels).toContain('ca-regional.dtd');
    // The ICH backbone is shared by every region but must appear exactly once.
    expect(labels.filter((l) => l === 'ich-ectd-3-2.dtd')).toHaveLength(1);
  });

  // ── The stylesheets are procurement items too ──────────────────────────────
  // Every index.xml carries <?xml-stylesheet href="util/style/ectd-2-0.xsl"?>
  // and the FDA backbone carries ../../util/style/us-regional.xsl. The preflight
  // built its required set from requiredDtdsForRegion ONLY, so it would report
  // procurement "ready" with both stylesheets still unobtained — and the
  // packager's own gate (assessDtdReadiness, which counts them) would then
  // refuse the production package the preflight had just cleared.
  it('requires the agency STYLESHEETS, not just the DTDs', () => {
    const labels = buildPreflightReport(EMPTY).items.map((i) => i.label);
    expect(labels).toContain('ectd-2-0.xsl');
    expect(labels).toContain('us-regional.xsl');
    // The ICH stylesheet is shared by every region — reported exactly once.
    expect(labels.filter((l) => l === 'ectd-2-0.xsl')).toHaveLength(1);
  });

  it('does not go ready with all five DTDs vendored and the stylesheets absent', () => {
    const r = buildPreflightReport({
      ...EMPTY,
      dtdFilesPresent: [
        'ich-ectd-3-2.dtd',
        'us-regional-v3-3.dtd',
        'eu-regional.dtd',
        'jp-regional.dtd',
        'ca-regional.dtd',
      ],
      estarFilesPresent: [],
      validators: [{ id: 'internal', label: 'Internal', configured: true }],
    });
    expect(r.ready).toBe(false);
    const actions = r.actions.join(' ');
    expect(actions).toContain('ectd-2-0.xsl');
    expect(actions).toContain('us-regional.xsl');
    // …and the five DTDs are correctly reported satisfied (not a blanket fail).
    const dtdGaps = r.items.filter((i) => !i.satisfied && i.label.endsWith('.dtd'));
    expect(dtdGaps).toEqual([]);
  });

  it('tells the maintainer where each missing artifact goes and what it unblocks', () => {
    const r = buildPreflightReport(EMPTY);
    for (const gap of r.items.filter((i) => !i.satisfied)) {
      expect(gap.location.length).toBeGreaterThan(0);
      expect(gap.unblocks.length).toBeGreaterThan(0);
    }
    expect(r.actions[0]).toMatch(/unblocks:/);
  });

  it('goes ready only when every item is satisfied', () => {
    const all = buildPreflightReport(EMPTY);
    const everyArtifact = all.items
      .filter((i) => i.category !== 'agency_validator')
      .map((i) => i.label);
    const r = buildPreflightReport({
      ...EMPTY,
      // assets/ectd-dtd/ is ONE drop-point holding both the .dtd files and the
      // agency .xsl stylesheets (see its README "Required files"), so the
      // observation of that directory carries both. This filtered .dtd only
      // while the preflight required DTDs only.
      dtdFilesPresent: everyArtifact.filter((f) => f.endsWith('.dtd') || f.endsWith('.xsl')),
      estarFilesPresent: everyArtifact.filter((f) => f.endsWith('.pdf')),
      validators: [{ id: 'internal', label: 'Internal', configured: true }],
    });
    expect(r.ready).toBe(true);
    expect(r.summary.missing).toBe(0);
    expect(r.actions).toEqual([]);
  });
});
