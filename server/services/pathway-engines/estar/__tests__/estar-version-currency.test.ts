/**
 * eSTAR version currency (g-estar-version-currency).
 *
 * The version table is the one place the platform says which eSTAR FDA wants
 * today. It said nIVD/IVD 7.0 and PreSTAR 3.0 long after FDA's eSTAR Program
 * page moved to 7.1 / 3.1, it recorded no date or source, so nobody could see
 * it decay, and filing readiness never compared the template on file with the
 * version FDA currently publishes: a 7.0 PDF reported "Can file now".
 *
 * These assertions pin:
 *   (a) every row carries its provenance (lastVerified, sourceUrl, confidence);
 *   (b) a vendored template that is not FDA's current version blocks filing,
 *       with a sentence naming both versions;
 *   (c) the gate is not stuck closed: a matching version files;
 *   (d) an absent or unpinned vendored version fails closed;
 *   (e) the table's age reuses the currency registry's arithmetic;
 *   (f) the human-factors slot cites FDA's final HF content guidance.
 */
import { describe, it, expect } from 'vitest';
import {
  ESTAR_VERSIONS,
  currentVersionFor,
  getVersionRecord,
  versionLifecycleAsOf,
  versionTableAgeDays,
  isVersionTableStale,
  templateVersionCurrency,
} from '../estar-versions';
import { assessEstarFilingReadiness, type FilingLeaf } from '../estar-filing-readiness';
import { assessEstarTemplateReadiness, descriptorFor } from '../estar-template-registry';
import { estarSlots } from '../estar-mapper';
import type { EstarClientRegistration } from '../estar-registration';
import {
  verificationAgeDays,
  VERIFICATION_MAX_AGE_DAYS,
  type RegulatoryFact,
} from '../../../regulatory-currency/currency-registry';

const ESTAR_PROGRAM_URL = 'https://www.fda.gov/medical-devices/how-study-and-market-your-device/estar-program';

const ALL_REGISTERED: EstarClientRegistration = {
  clientId: 'org-1',
  satisfied: ['fda_esg_account', 'cdrh_portal_account', 'organization_identity', 'mdufa_fee_account'],
};

const leaf = (sectionCode: string, title: string, documentType: string): FilingLeaf => ({
  sectionCode,
  title,
  documentType,
  substantive: true,
});

const COMPLETE_510K: FilingLeaf[] = [
  leaf('1', 'Cover letter', 'cover_letter'),
  leaf('1b', 'CDRH cover sheet 3514', 'cdrh_cover_sheet'),
  leaf('1c', 'MDUFA user fee cover sheet 3601', 'user_fee'),
  leaf('2', 'Indications for use', 'indications_for_use'),
  leaf('2b', 'Truthful and accurate statement', 'truthful_accurate'),
  leaf('3', 'Device description', 'device_description'),
  leaf('4', 'Proposed labeling', 'labeling'),
  leaf('4b', 'Risk management file', 'risk_management'),
  leaf('5', 'Biocompatibility', 'biocompatibility'),
  leaf('6', 'Performance testing', 'performance_testing'),
  leaf('7', 'Substantial equivalence', 'substantial_equivalence'),
  leaf('8', '510(k) Summary', '510k_summary'),
];

const PLAIN_DEVICE = {
  combinationProduct: false,
  softwareAiMl: false,
  cyberDevice: false,
  sterile: false,
  implantable: false,
  cliaWaived: false,
  clinicalData: false,
} as const;

/** Every other gate passes; only the template version varies. */
function assess510k(vendoredTemplateVersion: string | undefined, asOf?: string) {
  return assessEstarFilingReadiness({
    catalogKey: '510k',
    variant: 'device',
    registration: ALL_REGISTERED,
    leaves: COMPLETE_510K,
    deviceFlags: PLAIN_DEVICE,
    templateAvailable: true,
    fieldMapPopulated: true,
    vendoredTemplateVersion,
    asOf,
  })!;
}

describe('(a) every eSTAR version row carries its provenance', () => {
  it('has an ISO lastVerified, an fda.gov sourceUrl and a confidence on every row', () => {
    for (const v of ESTAR_VERSIONS) {
      expect(v.lastVerified, `${v.family} ${v.version}`).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(v.sourceUrl, `${v.family} ${v.version}`).toBe(ESTAR_PROGRAM_URL);
      expect(['regulator-text', 'recall'], `${v.family} ${v.version}`).toContain(v.confidence);
    }
  });

  it('names nIVD 7.1, IVD 7.1 and PreSTAR 3.1 current, labelled recall until a verbatim read is filed', () => {
    expect(currentVersionFor('nivd')?.version).toBe('7.1');
    expect(currentVersionFor('ivd')?.version).toBe('7.1');
    expect(currentVersionFor('prestar')?.version).toBe('3.1');
    for (const f of ['nivd', 'ivd', 'prestar'] as const) {
      expect(currentVersionFor(f)?.confidence).toBe('recall');
    }
  });

  it('demotes 7.0 / 3.0 to retiring without inventing a retirement date', () => {
    for (const [family, version] of [['nivd', '7.0'], ['ivd', '7.0'], ['prestar', '3.0']] as const) {
      const r = getVersionRecord(family, version)!;
      expect(r.status).toBe('retiring');
      expect(r.retirementDate).toBeNull();
      expect(r.note).toMatch(/retirement date .*not (found|verified)/i);
      // A null date on a retiring version is not "current" and not a guessed state.
      expect(versionLifecycleAsOf(r, '2026-10-05')).toBe('retiring-date-unverified');
    }
  });
});

describe('(b)-(d) filing readiness compares the template on file with FDA\'s current version', () => {
  it('(b) a 7.0 template against current 7.1 cannot file, and the blocker names both versions', () => {
    const r = assess510k('7.0');
    expect(r.contentReady).toBe(true);
    expect(r.officialTemplateProducible).toBe(true);
    expect(r.templateVersionCurrent).toBe(false);
    expect(r.canFileNow).toBe(false);
    expect(r.blockers).toContain("Official template on file is eSTAR v7.0; FDA's current version is v7.1.");
  });

  it('(c) a template matching FDA\'s current version files — the gate is not stuck closed', () => {
    const r = assess510k('7.1');
    expect(r.templateVersionCurrent).toBe(true);
    expect(r.canFileNow).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('(d) an absent or unpinned template version fails closed', () => {
    for (const v of [undefined, 'unset', '']) {
      const r = assess510k(v);
      expect(r.templateVersionCurrent).toBe(false);
      expect(r.canFileNow).toBe(false);
      expect(r.blockers.some((b) => /current version is v7\.1/.test(b))).toBe(true);
    }
  });

  it('the shared comparison is the one the template registry reports, from the manifest version', () => {
    const d = descriptorFor('510k', 'device')!;
    expect(d.version).toBe('7.0'); // what is vendored today
    const t = assessEstarTemplateReadiness({
      type: '510k',
      variant: 'device',
      present: [d.expectedFileName],
      environment: 'staging',
      requireTemplate: false,
    });
    expect(t.programVersion).toBe('7.1');
    expect(t.vendoredVersion).toBe('7.0');
    expect(t.versionCurrent).toBe(false);
    expect(templateVersionCurrency('nivd', d.version).blocker).toBe(
      "Official template on file is eSTAR v7.0; FDA's current version is v7.1.",
    );
  });
});

describe('(e) the table\'s age reuses the currency registry', () => {
  it('ages from the oldest row with verificationAgeDays, and is stale past the registry maximum', () => {
    const oldest = ESTAR_VERSIONS.map((v) => v.lastVerified).sort()[0];
    const asOf = '2026-12-01';
    expect(versionTableAgeDays(asOf)).toBe(
      verificationAgeDays({ lastVerified: oldest } as RegulatoryFact, asOf),
    );
    expect(isVersionTableStale(oldest)).toBe(false);
    const past = new Date(Date.parse(`${oldest}T00:00:00Z`) + (VERIFICATION_MAX_AGE_DAYS + 1) * 86_400_000)
      .toISOString()
      .slice(0, 10);
    expect(isVersionTableStale(past)).toBe(true);
    // An unreadable date is not "fresh".
    expect(isVersionTableStale('not-a-date')).toBe(true);
  });

  it('reports versionTableStale on the readiness result, failing closed without an as-of date', () => {
    const oldest = ESTAR_VERSIONS.map((v) => v.lastVerified).sort()[0];
    expect(assess510k('7.1', oldest).versionTableStale).toBe(false);
    expect(assess510k('7.1', '2030-01-01').versionTableStale).toBe(true);
    expect(assess510k('7.1').versionTableStale).toBe(true);
  });
});

describe('(f) the human-factors slot cites FDA\'s final HF content guidance', () => {
  it('names IEC 62366-1 and "Content of Human Factors Information in Medical Device Marketing Submissions"', () => {
    for (const variant of ['device', 'ivd'] as const) {
      const hf = estarSlots('510k', variant).find((s) => s.id === 'human-factors');
      if (!hf) continue; // the IVD registry may not carry the slot
      expect(hf.authority).toMatch(/IEC 62366-1/);
      expect(hf.authority).toMatch(/Content of Human Factors Information in Medical Device Marketing Submissions/);
      expect(hf.authority).toMatch(/HF Submission Categor(y|ies) 1/);
    }
    expect(estarSlots('510k', 'device').some((s) => s.id === 'human-factors')).toBe(true);
  });
});
