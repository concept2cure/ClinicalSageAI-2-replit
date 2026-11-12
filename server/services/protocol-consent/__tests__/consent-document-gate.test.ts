/**
 * P-102 (founder, 2026-11-05): "informed consent is one record". The 21 CFR
 * 50.25 checklist is the one editor's check for an informed-consent document.
 *
 * Before this, the gate (evaluateConsentCompleteness) ran only over the
 * structured form behind /api/protocol-consent, which no screen can write. A
 * consent document drafted in the editor was checked against nothing: no file
 * in the editor or server/services/authoring mentioned 50.25.
 *
 * The document's check is the same gate, read over the document's sections.
 */
import { describe, expect, it } from 'vitest';
import { builtinAuthoringTemplateId } from '../../authoring/builtin-authoring-templates';
import { CONSENT_TEMPLATE_IDS, consentApprovalVerdict, consentDocumentGate, consentElementTemplates, isConsentTemplateId } from '../protocol-consent-logic';

const TEXT: Record<string, string> = {
  '1': 'This study involves research. Its purpose is to test the drug; you will take part for 12 weeks.',
  '2': 'You will have blood drawn at each visit. The study drug is experimental.',
  '3': 'You may have headache or nausea.',
  '4': 'You may not benefit directly.',
  '5': 'You may choose standard treatment instead.',
  '6': 'Your records will be kept confidential. The Food and Drug Administration may inspect the records of this study.',
  '7': 'If you are injured, medical treatment is available.',
  '8': 'Taking part is voluntary. You may withdraw at any time without penalty or loss of benefits.',
  '9': 'Call Dr. Lee at 555-0100 with questions.',
  '11': 'A description of this clinical trial will be available on http://www.ClinicalTrials.gov, as required by U.S. Law.',
};
const doc = (over: Record<string, string | null> = {}) =>
  Object.entries({ ...TEXT, ...over }).filter(([, t]) => t !== null).map(([code, text]) => ({ code, text: text as string }));

describe('an informed-consent document is recognised by its template', () => {
  it('both built-in consent templates, and nothing else', () => {
    expect([...CONSENT_TEMPLATE_IDS].sort()).toEqual(
      [builtinAuthoringTemplateId('component:informed_consent'), builtinAuthoringTemplateId('registry:ICH_ICF')].sort(),
    );
    expect(isConsentTemplateId(CONSENT_TEMPLATE_IDS[0].toUpperCase())).toBe(true);
    expect(isConsentTemplateId(builtinAuthoringTemplateId('component:clinical_study_report'))).toBe(false);
    expect(isConsentTemplateId(null)).toBe(false);
  });
});

describe('the document is held to the same gate as the consent record', () => {
  it('every required element is drafted in a section of the consent outline', () => {
    const g = consentDocumentGate(doc());
    const required = consentElementTemplates().filter((t) => t.required).map((t) => t.elementKey);
    expect(g.elements.filter((e) => e.required).map((e) => e.key)).toEqual(required);
    expect(g.elements.filter((e) => e.required).every((e) => /^\d+$/.test(e.section))).toBe(true);
  });

  it('a complete document passes', () => {
    const g = consentDocumentGate(doc());
    expect(g.readyToApprove).toBe(true);
    expect(g.requiredComplete).toBe(g.requiredTotal);
    expect(g.findings).toEqual([]);
  });

  it('confidentiality that does not say FDA may inspect the records is incomplete', () => {
    const g = consentDocumentGate(doc({ '6': 'Your records will be kept confidential.' }));
    expect(g.readyToApprove).toBe(false);
    expect(g.elements.find((e) => e.key === 'confidentiality')).toMatchObject({ complete: false, section: '6' });
    expect(g.findings.join(' ')).toMatch(/Food and Drug Administration may inspect[\s\S]*21 CFR 50\.25\(a\)\(5\)/);
    // A person reads the element's title, not its key.
    expect(g.findings.join(' ')).not.toMatch(/"confidentiality"/);
  });

  it('an empty section and a section the document does not have are each incomplete', () => {
    const g = consentDocumentGate(doc({ '3': '   ', '11': null }));
    expect(g.elements.find((e) => e.key === 'risks')!.complete).toBe(false);
    expect(g.elements.find((e) => e.key === 'clinicaltrials_gov')!.complete).toBe(false);
    expect(g.requiredComplete).toBe(g.requiredTotal - 2);
  });

  it('a document with no sections is not assessed as complete', () => {
    const g = consentDocumentGate([]);
    expect(g.readyToApprove).toBe(false);
    expect(g.requiredComplete).toBe(0);
  });
});

/*
 * P-102, slice 2 (2026-11-12): the gate decides the approval. An element
 * 21 CFR 50.25(a) requires cannot be approved over: there is no override. The
 * ClinicalTrials.gov statement (50.25(c)) is required for an applicable
 * clinical trial; nothing records a study's status, so the approver is asked,
 * and a stated "not an applicable clinical trial" is recorded on the approval.
 */
describe('what the gate means for an approval', () => {
  it('a complete document is clear', () => {
    expect(consentApprovalVerdict(consentDocumentGate(doc()), false)).toEqual({ kind: 'clear' });
  });

  it('a missing 50.25(a) element refuses, names it by title, and no statement lifts it', () => {
    for (const stated of [false, true]) {
      const v = consentApprovalVerdict(consentDocumentGate(doc({ '6': 'Your records will be kept confidential.', '3': '' })), stated);
      expect(v.kind).toBe('refused');
      if (v.kind !== 'refused') return;
      expect(v.code).toBe('CONSENT_INCOMPLETE');
      expect(v.message).toMatch(/^Not approved — this informed consent form does not yet meet 2 required elements of informed consent \(21 CFR 50\.25\(a\)\)/);
      expect(v.message).toContain('Reasonably foreseeable risks or discomforts');
      expect(v.message).toContain('Extent of confidentiality of records');
      expect(v.message).toMatch(/Nothing was signed\.$/);
      expect(v.elements).toEqual(['risks', 'confidentiality']);
    }
  });

  it('with the ClinicalTrials.gov statement also missing, the refusal says it is owed only by an applicable clinical trial', () => {
    const v = consentApprovalVerdict(consentDocumentGate(doc({ '3': '', '11': null })), false);
    expect(v.kind === 'refused' && v.code).toBe('CONSENT_INCOMPLETE');
    expect(v.kind === 'refused' && v.message).toMatch(/ClinicalTrials\.gov statement is also missing/);
  });

  it('only the ClinicalTrials.gov statement missing asks whether the study is an applicable clinical trial', () => {
    const v = consentApprovalVerdict(consentDocumentGate(doc({ '11': null })), false);
    expect(v.kind).toBe('refused');
    if (v.kind !== 'refused') return;
    expect(v.code).toBe('CONSENT_TRIAL_STATUS_REQUIRED');
    expect(v.message).toMatch(/21 CFR 50\.25\(c\)/);
    expect(v.message).toMatch(/recorded with your approval/);
    expect(v.message).toMatch(/Nothing was signed\.$/);
  });

  it('stated not an applicable clinical trial, the same document approves and the statement is to be recorded', () => {
    expect(consentApprovalVerdict(consentDocumentGate(doc({ '11': null })), true)).toEqual({ kind: 'stated_not_applicable' });
    // A statement that is present but lacks the prescribed wording is the same case.
    expect(consentApprovalVerdict(consentDocumentGate(doc({ '11': 'Results will be posted.' })), true)).toEqual({ kind: 'stated_not_applicable' });
  });

  it('a stated "not applicable" on a complete document records nothing', () => {
    expect(consentApprovalVerdict(consentDocumentGate(doc()), true)).toEqual({ kind: 'clear' });
  });
});
