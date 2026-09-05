/**
 * E2B(R3) ICSR composer — maps an intake adverse event to ICH E2B(R3) data
 * elements + an escaped XML projection, and reports completeness/gaps.
 */

import { describe, it, expect } from 'vitest';
import { composeE2bR3Icsr, serializeE2bXml } from '../e2b-icsr-composer';
import type { AdverseEvent, ICSR } from '../../compliance/pharmacovigilanceService';

const baseEvent: AdverseEvent = {
  id: 'ae-123',
  organizationId: 'org-1',
  projectId: 'C2C-001',
  eventType: 'SAE',
  patientId: 'subj-007',
  eventDescription: 'Acute hepatic failure',
  onsetDate: new Date('2026-01-05T00:00:00.000Z'),
  reportDate: new Date('2026-01-06T00:00:00.000Z'),
  seriousnessCriteria: 'life_threatening',
  causality: 'probable',
  outcome: 'not_recovered',
  reporterType: 'investigator',
  countryOfOccurrence: 'US',
  regulatoryReportingDeadline: new Date('2026-01-13T00:00:00.000Z'),
  reportedToAuthorities: false,
  expeditedReportRequired: true,
  reactionPt: 'Hepatic failure',
  reactionPtCode: '10019663',
  suspectProduct: 'C2C-001',
  suspectProductDose: '50 mg',
  suspectProductRoute: 'Oral',
  reporterName: 'Dr. Pat Smith',
  narrative: 'Subject developed jaundice on day 5.',
  createdAt: new Date('2026-01-06T00:00:00.000Z'),
};

const icsrMeta: ICSR = {
  id: 'icsr-1',
  adverseEventId: 'ae-123',
  icsrType: 'initial',
  senderType: 'sponsor',
  receiverType: 'regulatory_authority',
  transmissionDate: new Date('2026-01-07T00:00:00.000Z'),
  e2bVersion: 'R3',
  worldwideUniqueId: 'US-C2C-2026-000123',
  reportType: 'study',
  seriousness: 'life_threatening',
  organizationId: 'org-1',
};

describe('composeE2bR3Icsr', () => {
  it('maps the case admin block with E2B(R3) ids', () => {
    const { icsr } = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta, now: new Date('2026-01-07T12:00:00.000Z') });
    const byId = Object.fromEntries(icsr.caseAdmin.map((e) => [e.id, e.value]));
    expect(byId['C.1.1']).toBe('ae-123');
    expect(byId['C.1.3']).toContain('report from study');
    expect(byId['C.1.7']).toBe('1 (Yes)'); // expeditedReportRequired
    expect(byId['C.1.8.1']).toBe('US-C2C-2026-000123');
  });

  it('maps the reaction block: term, PT code, seriousness flag, and outcome', () => {
    const { icsr } = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    const byId = Object.fromEntries(icsr.reaction.map((e) => [e.id, e.value]));
    expect(byId['E.i.1.1a']).toBe('Hepatic failure');
    expect(byId['E.i.2.1b']).toBe('10019663');
    expect(byId['E.i.3.2b']).toBe('1 (Yes)'); // life_threatening
    expect(byId['E.i.7']).toContain('3'); // not_recovered
  });

  it('maps the reporter qualification (investigator → physician)', () => {
    const { icsr } = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    const qual = icsr.primarySource.find((e) => e.id === 'C.2.r.4');
    expect(qual?.value).toContain('Physician');
  });

  it('composes the H.1 narrative from the shared safety-narrative writer', () => {
    const { icsr } = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    expect(icsr.narrative.id).toBe('H.1');
    expect(icsr.narrative.value).toContain('subj-007');
    expect(icsr.narrative.value).toContain('Hepatic failure');
  });

  it('emits a well-formed, escaped XML projection keyed by E2B ids', () => {
    const { xml } = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true);
    expect(xml).toContain('standard="E2B(R3)"');
    expect(xml).toContain('id="C.1.1"');
    expect(xml).toContain('id="E.i.7"');
    expect(xml).toContain('id="H.1"');
    // No unescaped angle brackets inside values.
    expect(xml).not.toContain('<element id="C.1.1" label="Sender\'s');
  });

  it('escapes XML special characters in values', () => {
    const evt = { ...baseEvent, suspectProduct: 'Drug <X> & "Y"' };
    const { xml } = composeE2bR3Icsr(evt, { icsr: icsrMeta });
    expect(xml).toContain('Drug &lt;X&gt; &amp; &quot;Y&quot;');
    expect(xml).not.toContain('Drug <X>');
  });

  it('reports completeness = 1 and no gaps when all mandatory elements are present', () => {
    const { gaps, completeness } = composeE2bR3Icsr(baseEvent, { icsr: { ...icsrMeta, studyRegistrationNumber: 'IND 123456' } as any });
    expect(gaps).toEqual([]);
    expect(completeness).toBe(1);
  });

  it('flags missing mandatory elements as gaps (no worldwide id, no suspect product)', () => {
    const evt = { ...baseEvent, suspectProduct: null };
    const { gaps, completeness } = composeE2bR3Icsr(evt, { icsr: null });
    const ids = gaps.map((g) => g.id);
    expect(ids).toContain('C.1.8.1'); // worldwide unique id absent (no ICSR)
    expect(ids).toContain('G.k.2.2'); // suspect product absent
    expect(completeness).toBeLessThan(1);
  });

  it('falls back to eventDescription when no MedDRA PT is supplied', () => {
    const evt = { ...baseEvent, reactionPt: null };
    const { icsr } = composeE2bR3Icsr(evt, { icsr: icsrMeta });
    const term = icsr.reaction.find((e) => e.id === 'E.i.1.1a');
    expect(term?.value).toBe('Acute hepatic failure');
  });

  it('accepts ISO-string dates (HTTP path) without throwing', () => {
    const evt = {
      ...baseEvent,
      onsetDate: '2026-01-05T00:00:00.000Z' as unknown as Date,
      reportDate: '2026-01-06T00:00:00.000Z' as unknown as Date,
    };
    const { icsr } = composeE2bR3Icsr(evt, { icsr: icsrMeta });
    const onset = icsr.reaction.find((e) => e.id === 'E.i.4');
    expect(onset?.value).toBe('2026-01-05');
  });

  it('serializeE2bXml is deterministic for the same model', () => {
    const a = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta, now: new Date('2026-01-07T12:00:00.000Z') });
    const b = serializeE2bXml(a.icsr);
    expect(b).toBe(a.xml);
  });
});

describe('composeE2bR3Icsr — report lifecycle (C.1.* admin)', () => {
  it('defaults to an initial report with no C.1.11 nullification elements', () => {
    const { icsr, lifecycle } = composeE2bR3Icsr(baseEvent, { icsr: icsrMeta });
    expect(lifecycle).toBe('initial');
    const ids = icsr.caseAdmin.map((e) => e.id);
    expect(ids).not.toContain('C.1.11.1');
  });

  it('follow_up keeps the worldwide id stable and reflects the most-recent-info date', () => {
    const followUp = { ...icsrMeta, icsrType: 'follow_up' as const };
    const { icsr, lifecycle } = composeE2bR3Icsr(baseEvent, {
      icsr: followUp,
      mostRecentInfoDate: '2026-02-01T00:00:00.000Z',
    });
    expect(lifecycle).toBe('follow_up');
    const byId = Object.fromEntries(icsr.caseAdmin.map((e) => [e.id, e.value]));
    expect(byId['C.1.8.1']).toBe('US-C2C-2026-000123'); // stable across versions
    expect(byId['C.1.5']).toBe('2026-02-01'); // updated information date
  });

  it('nullification emits C.1.11.1 + the reason (C.1.11.2)', () => {
    const nullify = { ...icsrMeta, icsrType: 'nullification' as const };
    const { icsr, lifecycle } = composeE2bR3Icsr(baseEvent, {
      icsr: nullify,
      nullificationReason: 'Case reported in error (duplicate of US-C2C-2026-000100).',
    });
    expect(lifecycle).toBe('nullification');
    const byId = Object.fromEntries(icsr.caseAdmin.map((e) => [e.id, e.value]));
    expect(byId['C.1.11.1']).toContain('Nullification');
    expect(byId['C.1.11.2']).toContain('duplicate');
  });

  it('nullification without a reason is a completeness gap (C.1.11.2)', () => {
    const nullify = { ...icsrMeta, icsrType: 'nullification' as const };
    const { gaps, completeness } = composeE2bR3Icsr(baseEvent, { icsr: nullify });
    expect(gaps.map((g) => g.id)).toContain('C.1.11.2');
    expect(completeness).toBeLessThan(1);
  });

  it('nullification XML carries the nullification flag', () => {
    const nullify = { ...icsrMeta, icsrType: 'nullification' as const };
    const { xml } = composeE2bR3Icsr(baseEvent, { icsr: nullify, nullificationReason: 'Invalid case.' });
    expect(xml).toContain('id="C.1.11.1"');
    expect(xml).toContain('Invalid case.');
  });
});

describe('C.1.3, E.i.9 and C.5.1 come from the case, not from constants', () => {
  const byIdOf = (r: any) => {
    const all = [...r.icsr.caseAdmin, ...r.icsr.primarySource, ...r.icsr.patient, ...r.icsr.reaction, ...r.icsr.drug, r.icsr.narrative];
    return Object.fromEntries(all.map((e: any) => [e.id, e.value])) as Record<string, string>;
  };

  it('maps C.1.3 from icsr.reportType — a spontaneous report is not "report from study"', () => {
    const r = composeE2bR3Icsr(baseEvent, { icsr: { ...icsrMeta, reportType: 'spontaneous' } as any });
    expect(byIdOf(r)['C.1.3']).toBe('1 (spontaneous report)');
    expect(r.gaps.map((g) => g.id)).not.toContain('C.1.3');
  });

  it('an absent report type is a gap, not a default', () => {
    const r = composeE2bR3Icsr(baseEvent, { icsr: { ...icsrMeta, reportType: undefined } as any });
    expect(byIdOf(r)['C.1.3']).toBe('');
    expect(r.gaps.map((g) => g.id)).toContain('C.1.3');
  });

  it('emits the country of occurrence as E.i.9 and never as the reporter country', () => {
    const r = composeE2bR3Icsr({ ...baseEvent, countryOfOccurrence: 'US' }, { icsr: { ...icsrMeta, reportType: 'study', studyRegistrationNumber: 'IND 123456' } as any });
    const ids = byIdOf(r);
    expect(ids['E.i.9']).toBe('US');
    expect(ids['C.2.r.3']).toBe('');
    const withReporter = composeE2bR3Icsr(baseEvent, { icsr: { ...icsrMeta, reportType: 'study', studyRegistrationNumber: 'IND 123456', reporterCountry: 'DE' } as any });
    expect(byIdOf(withReporter)['C.2.r.3']).toBe('DE');
  });

  it('a study report without a study registration number is a C.5.1.r.1 gap', () => {
    const r = composeE2bR3Icsr(baseEvent, { icsr: { ...icsrMeta, reportType: 'study' } as any });
    expect(r.gaps.map((g) => g.id)).toContain('C.5.1.r.1');
    const ok = composeE2bR3Icsr(baseEvent, { icsr: { ...icsrMeta, reportType: 'study', studyRegistrationNumber: 'IND 123456' } as any });
    expect(ok.gaps.map((g) => g.id)).not.toContain('C.5.1.r.1');
    expect(byIdOf(ok)['C.5.1.r.1']).toBe('IND 123456');
  });
});
