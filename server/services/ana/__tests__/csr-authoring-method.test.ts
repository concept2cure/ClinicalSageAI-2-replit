import { describe, expect, it } from 'vitest';
import { composeMedicalWritingGuidance } from '../medical-writing';
import { csrWritingBrief, csrWritingGuidance } from '../medical-writing-csr';
import { getSkillLibrary } from '../skills/library/index';
import { selectSkills } from '../skills/selector';
import { buildSelectableSkills, renderSkillsBlock } from '../skills/turn-skills';

function selectedWritingMethod(message: string) {
  const library = getSkillLibrary();
  const { skills } = buildSelectableSkills(library.skills, [], new Map());
  const selected = selectSkills(skills, {
    message, documentType: 'ICH_CSR', surfaceId: 'document-authoring', segments: ['pharma'],
    invokedKeys: ['medical-writing', 'clinical.study-report'],
  });
  return { selected, prompt: renderSkillsBlock(selected) };
}

describe('AnA CSR authoring instruction delivered to the turn', () => {
  it.each([
    'Help me write the CSR statistical methods section.',
    'Revise the CSR efficacy discussion without losing its limitations.',
  ])('loads a versioned, section-purpose writing and revision method: %s', message => {
    const { selected, prompt } = selectedWritingMethod(message);
    expect(selected.selected.map(s => s.skill.key)).toEqual(expect.arrayContaining(['medical-writing', 'clinical.study-report']));
    expect(prompt).not.toContain('Each section opens with its conclusion');
    expect(prompt).toMatch(/section purpose/i);
    expect(prompt).toMatch(/source map/i);
    expect(prompt).toMatch(/read the (?:existing|current|saved) draft/i);
    expect(prompt).toMatch(/preserve.*(?:qualifier|limitation)/i);
    for (const entry of selected.selected.filter(s => ['medical-writing', 'clinical.study-report'].includes(s.skill.key))) {
      expect(entry.skill.version).toBeGreaterThan(1);
      expect(entry.skill.reviewState).toBe('unreviewed');
      expect(entry.skill.contentHash).toMatch(/^[a-f0-9]{64}$/);
    }
    expect(prompt).toMatch(/not yet reviewed against its sources/i);
  });

  it('preserves the current study-evidence claims and sole canvas/editor authoring route', () => {
    const { prompt } = selectedWritingMethod('Write this project’s clinical study report.');
    expect(prompt).toContain('get_csr_section_evidence');
    expect(prompt).toContain('claims with that digest');
    expect(prompt).toContain('list_authoring_outline');
    expect(prompt).toContain('draft_authoring_document');
    expect(prompt).toContain('Build from the study');
    expect(prompt).toContain('Saving a draft is not approving it');
  });

  it('does not force every result through a superiority-only narration tool', () => {
    const { prompt } = selectedWritingMethod('Draft a Bayesian CSR efficacy section.');
    expect(prompt).not.toContain('State each result through');
    expect(prompt).toMatch(/non.inferiority.*equivalence.*Bayesian/i);
    expect(prompt).toMatch(/(?:unsupported|unassessed|descriptive)/i);
    expect(prompt).toMatch(/prespecifi|pre.specifi/i);
  });
});

describe('the canonical CSR brief teaches composition and controlled revision', () => {
  it('keeps the universal craft rules compatible with methods and genuinely different analyses', () => {
    const guidance = composeMedicalWritingGuidance({ documentType: 'csr', section: '9.7' });
    const rules = guidance.globalStyleRules.join(' ');
    expect(rules).not.toContain('Lead with the conclusion');
    expect(rules).not.toContain('a value, term, or claim must be identical everywhere');
    expect(rules).toMatch(/same.*(?:population|analysis|context)/i);
    expect(rules).toMatch(/traceability alone.*not.*verification/i);
  });
  it.each(['9.7', '11.4.1', '13'])('carries the shared writing method with §%s guidance', section => {
    const brief = csrWritingBrief(csrWritingGuidance(section), null);
    expect(brief).toMatch(/section purpose/i);
    expect(brief).toMatch(/source map/i);
    expect(brief).toMatch(/methods.*(?:conduct|done)/i);
    expect(brief).toMatch(/results.*(?:observ|finding)/i);
    expect(brief).toMatch(/revise|revision/i);
    expect(brief).toMatch(/preserve.*(?:qualifier|limitation)/i);
  });

  it('uses retained client evidence for trial claims and external sources only for background or craft', () => {
    const brief = composeMedicalWritingGuidance({ documentType: 'csr', section: '11.4.1' }).brief;
    expect(brief).not.toContain('Ground every clinical claim in retrieved evidence: use search_literature');
    expect(brief).toMatch(/retained.*(?:protocol|SAP)/i);
    expect(brief).toMatch(/external.*(?:background|craft)/i);
    expect(brief).toMatch(/not.*(?:source|evidence).*client.*(?:results|findings)/i);
  });

  it('does not teach a cardiology author to invent adjudication', () => {
    const brief = composeMedicalWritingGuidance({ documentType: 'csr', therapeuticArea: 'cardiology' }).brief;
    expect(brief).not.toContain('say it was adjudicated by the clinical events committee');
    expect(brief).toMatch(/adjudicat.*only.*(?:record|source)|only.*(?:record|source).*adjudicat/i);
    expect(brief).toMatch(/adjudicat.*(?:missing|unavailable|not recorded)/i);
  });


  it('uses recorded oncology survival methods and confidence levels in delivered guidance', () => {
    const guidance = composeMedicalWritingGuidance({ documentType: 'csr', therapeuticArea: 'oncology', section: '11.4.1' });
    const convention = guidance.therapeuticArea?.reportingConventions.find(rule => /Kaplan|Cox/.test(rule));
    expect(convention).toBeDefined();
    expect(guidance.brief).toContain(convention!);
    expect(convention).toMatch(/retained.*SAP.*analysis outputs/i);
    expect(convention).toMatch(/recorded.*confidence level.*outputs/i);
    expect(convention).toMatch(/never supply a default method or confidence level/i);
    expect(convention).not.toContain('median + 95% CI and HR (Cox)');
  });

  it('takes the oncology death observation window from the study instead of supplying a fixed window', () => {
    const brief = composeMedicalWritingGuidance({ documentType: 'csr', therapeuticArea: 'oncology' }).brief;
    expect(brief).not.toContain('deaths within 30 days of last dose');
    expect(brief).toMatch(/death.*(?:window|period).*(?:protocol|SAP|retained)/i);
    expect(brief).toMatch(/(?:window|period).*not.*(?:assume|invent)|not.*(?:assume|invent).*(?:window|period)/i);
  });
});


describe('the shared CSR craft retains existing exemplar controls', () => {
  it('keeps external example scope and structured numerical claim receipts', () => {
    const brief = composeMedicalWritingGuidance({ documentType: 'csr', section: '11.4.1' }).brief;
    expect(brief).toContain('full CSR, redacted CSR, synopsis, regulatory review');
    expect(brief).toContain('structured claim-to-evidence receipt');
    expect(brief).toContain('A prose citation alone does not prove numerical reconciliation');
    expect(brief).toContain('withhold review-ready status');
    expect(brief).toContain('Retain source originals and derivatives');
  });
});
