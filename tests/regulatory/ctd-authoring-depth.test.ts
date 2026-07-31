/**
 * CTD authoring-depth contract.
 *
 * Pins the "usable in real life" bar for the FDA drug lifecycle (IND -> NDA/BLA):
 *   1. every core CTD leaf section carries real, industry-grade authoring guidance
 *      (not a one-line description);
 *   2. the deepened marketing CTD template exposes those leaves so NDA/BLA are
 *      authorable at leaf granularity;
 *   3. the lifecycle document-type registry covers the full spine — Pre-IND /
 *      EOP2 / Pre-NDA / Pre-BLA meetings, IND + amendments, IND safety, annual /
 *      DSUR, NDA, BLA, ISS/ISE, and post-approval supplements;
 *   4. the IND section registry's prompt generator drafts a deep leaf code
 *      against its real guidance.
 */
import { describe, it, expect } from 'vitest';
import {
  CTD_AUTHORING_GUIDANCE,
  getCtdAuthoringGuidance,
  LIFECYCLE_DOCUMENT_TYPES,
  getLifecycleDocumentType,
  resolveCtdSectionsForDocType,
} from '../../server/services/ind/ctd/index';
import { getGenerationPrompt } from '../../server/services/ind/ind-section-registry';
import { buildMarketingAuthorizationBlueprint } from '../../server/services/regulatory/registry/adapters/ctdBlueprintNormalizer';

// The core leaf sections a real IND->NDA/BLA program must be able to author.
const CORE_LEAVES = [
  // M2 summaries
  '2.6.2', '2.6.4', '2.6.6', '2.7.1', '2.7.2', '2.7.3', '2.7.4',
  // M3 quality (CMC) — drug substance + drug product
  '3.2.S.1', '3.2.S.2', '3.2.S.3', '3.2.S.4', '3.2.S.5', '3.2.S.6', '3.2.S.7',
  '3.2.P.1', '3.2.P.2', '3.2.P.3', '3.2.P.4', '3.2.P.5', '3.2.P.6', '3.2.P.7', '3.2.P.8',
  // M4 nonclinical
  '4.2.1.1', '4.2.1.3', '4.2.2.2', '4.2.2.4', '4.2.3.1', '4.2.3.2', '4.2.3.3',
  // M5 clinical (incl. ISS/ISE integrated analyses)
  '5.3.1', '5.3.3', '5.3.5.1', '5.3.5.3',
];

describe('CTD authoring depth — leaf-level guidance', () => {
  it('registers guidance for every core CTD leaf section', () => {
    const missing = CORE_LEAVES.filter((c) => !getCtdAuthoringGuidance(c));
    expect(missing, `missing CTD guidance: ${missing.join(', ')}`).toEqual([]);
  });

  it('every guidance entry is industry-grade (real prose + concrete content elements)', () => {
    for (const code of CORE_LEAVES) {
      const g = getCtdAuthoringGuidance(code)!;
      expect(g, `no guidance for ${code}`).toBeTruthy();
      expect(g.authoringGuidance.length, `${code} authoringGuidance too thin`).toBeGreaterThan(80);
      expect(g.keyContentElements.length, `${code} needs concrete content elements`).toBeGreaterThanOrEqual(3);
      expect(g.guidance.length, `${code} missing regulatory reference`).toBeGreaterThan(0);
      expect(g.generationPrompt.length, `${code} missing generation prompt`).toBeGreaterThan(0);
    }
  });

  it('drug-substance and drug-product sections require CMC across IND/NDA/BLA', () => {
    for (const code of ['3.2.S.1', '3.2.S.4', '3.2.P.1', '3.2.P.5']) {
      const g = getCtdAuthoringGuidance(code)!;
      expect(g.module).toBe(3);
      expect(g.requiredFor).toContain('IND');
      expect(g.requiredFor).toContain('NDA');
    }
  });
});

describe('CTD authoring depth — marketing blueprint is deep', () => {
  it('an NDA blueprint exposes drug-substance and clinical leaves as first-class sections', () => {
    const bp = buildMarketingAuthorizationBlueprint('US_NDA', 'NDA', 'US');
    const codes = new Set(bp.sections.map((s) => s.code));
    for (const c of ['3.2.S.4', '3.2.P.8', '2.7.4', '5.3.5.3']) {
      expect(codes.has(c), `NDA blueprint missing leaf ${c}`).toBe(true);
    }
    // 2.7.* and 5.3.* are required for a marketing application.
    const s274 = bp.sections.find((s) => s.code === '2.7.4');
    expect(s274?.required).toBe(true);
  });
});

describe('CTD authoring depth — lifecycle document types', () => {
  const EXPECTED_IDS = [
    // FDA meeting briefing packages
    'pre_ind_meeting', 'end_of_phase_2_meeting', 'pre_nda_meeting', 'pre_bla_meeting',
    // IND + amendments
    'ind_initial', 'ind_protocol_amendment', 'ind_information_amendment',
    'ind_response_to_clinical_hold',
    // safety + periodic
    'ind_safety_report', 'ind_annual_report', 'dsur', 'nda_bla_annual_report',
    // marketing applications + integrated summaries
    'nda', 'bla', 'iss', 'ise',
    // post-approval supplements
    'nda_pas', 'cbe_30', 'cbe_0',
  ];

  it('covers the full IND->NDA/BLA lifecycle spine', () => {
    const ids = new Set(LIFECYCLE_DOCUMENT_TYPES.map((d) => d.id));
    const missing = EXPECTED_IDS.filter((id) => !ids.has(id));
    expect(missing, `missing lifecycle doc types: ${missing.join(', ')}`).toEqual([]);
  });

  it('every document type carries real components and regulatory basis', () => {
    for (const dt of LIFECYCLE_DOCUMENT_TYPES) {
      expect(dt.description.length, `${dt.id} description too thin`).toBeGreaterThan(40);
      expect(dt.regulatoryBasis.length, `${dt.id} missing regulatory basis`).toBeGreaterThan(0);
      expect(dt.components.length, `${dt.id} has no components`).toBeGreaterThan(0);
    }
  });

  it('the NDA document type resolves deep CTD sections from the shared overlay', () => {
    const nda = getLifecycleDocumentType('nda');
    expect(nda).toBeTruthy();
    const sections = resolveCtdSectionsForDocType(nda!);
    // Pulling whole CTD modules should surface many leaf sections.
    expect(sections.length).toBeGreaterThan(20);
  });

  it('meeting packages are flagged and the ISS/ISE integrated summaries exist', () => {
    const preNda = getLifecycleDocumentType('pre_nda_meeting');
    expect(preNda?.meetingPackage).toBe(true);
    // ISS/ISE surface either as their own doc types or via 5.3.5.3 guidance.
    const has5353 = !!getCtdAuthoringGuidance('5.3.5.3');
    expect(has5353).toBe(true);
  });
});

describe('CTD authoring depth — prompt generation', () => {
  it('drafts a deep leaf code against its real guidance', () => {
    const prompt = getGenerationPrompt('3.2.S.4', {
      productName: 'Testomab',
      indication: 'rheumatoid arthritis',
      sponsor: 'Acme Bio',
      phase: 'Phase 1',
    });
    expect(prompt.length).toBeGreaterThan(200);
    expect(prompt).toContain('3.2.S.4');
    expect(prompt).toContain('Testomab');
  });

  it('every registered guidance code has a non-empty title and module 1-5', () => {
    for (const [code, g] of Object.entries(CTD_AUTHORING_GUIDANCE)) {
      expect(g.title.length, `${code} missing title`).toBeGreaterThan(0);
      expect(g.module).toBeGreaterThanOrEqual(1);
      expect(g.module).toBeLessThanOrEqual(5);
    }
  });
});
