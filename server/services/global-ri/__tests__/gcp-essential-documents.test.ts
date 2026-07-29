/**
 * ICH E6 Good Clinical Practice expert — principles, essential documents, roles.
 */

import { describe, it, expect } from 'vitest';
import {
  getGcpPrinciples,
  getEssentialDocuments,
  getResponsibilities,
  GCP_STAGES,
  GCP_PARTIES,
  type GcpStage,
  type GcpParty,
} from '../gcp-essential-documents';

describe('getGcpPrinciples', () => {
  it('returns at least 10 principles with a truthy citation', () => {
    const r = getGcpPrinciples();
    expect(r.principles.length).toBeGreaterThanOrEqual(10);
    expect(r.citation).toBeTruthy();
    for (const p of r.principles) {
      expect(p.id).toBeTruthy();
      expect(p.statement).toBeTruthy();
    }
  });

  it('includes the Declaration of Helsinki / ethical-principles principle', () => {
    const r = getGcpPrinciples();
    expect(r.principles.some((p) => /Helsinki/i.test(p.statement))).toBe(true);
  });
});

describe('getEssentialDocuments — per stage', () => {
  it('every stage returns at least 5 documents, each with heldBy set', () => {
    for (const stage of GCP_STAGES) {
      const r = getEssentialDocuments(stage);
      expect(r.stage).toBe(stage);
      expect(r.citation).toBeTruthy();
      expect(r.documents.length).toBeGreaterThanOrEqual(5);
      for (const d of r.documents) {
        expect(d.id).toBeTruthy();
        expect(d.title).toBeTruthy();
        expect(['sponsor', 'investigator', 'both']).toContain(d.heldBy);
      }
    }
  });

  it("'before' includes an informed-consent form and IRB/IEC approval", () => {
    const docs = getEssentialDocuments('before').documents;
    expect(docs.some((d) => /informed consent form/i.test(d.title))).toBe(true);
    expect(docs.some((d) => /IRB\/IEC approval/i.test(d.title))).toBe(true);
  });

  it("'after' includes a clinical study report", () => {
    const docs = getEssentialDocuments('after').documents;
    expect(docs.some((d) => /clinical study report/i.test(d.title))).toBe(true);
  });
});

describe('getResponsibilities', () => {
  it("sponsor responsibilities include monitoring", () => {
    const r = getResponsibilities('sponsor');
    expect(r.party).toBe('sponsor');
    expect(r.citation).toBeTruthy();
    expect(r.responsibilities.length).toBeGreaterThanOrEqual(5);
    expect(r.responsibilities.some((x) => /monitor/i.test(x.title))).toBe(true);
  });

  it("investigator responsibilities include informed consent", () => {
    const r = getResponsibilities('investigator');
    expect(r.party).toBe('investigator');
    expect(r.responsibilities.some((x) => /informed consent/i.test(x.title))).toBe(true);
  });
});

describe('errors + determinism', () => {
  it('throws for an unknown stage', () => {
    expect(() => getEssentialDocuments('whenever' as GcpStage)).toThrow();
  });

  it('throws for an unknown party', () => {
    expect(() => getResponsibilities('regulator' as GcpParty)).toThrow();
  });

  it('is deterministic', () => {
    expect(getGcpPrinciples()).toEqual(getGcpPrinciples());
    expect(getEssentialDocuments('during')).toEqual(getEssentialDocuments('during'));
    expect(getResponsibilities('sponsor')).toEqual(getResponsibilities('sponsor'));
  });
});
