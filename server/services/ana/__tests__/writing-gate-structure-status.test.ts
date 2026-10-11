/**
 * Writing Precision Gate — the structure check says when it did not run.
 *
 * At 9ccf42b3, structureDimension returned 0 missing for any documentType that
 * medical-writing.ts does not index, and reviewMedicalWriting's "Unknown document
 * type" message was discarded. So critique_draft with documentType
 * 'clinical_study_report', '2.7.4' or 'iss' returned verdict 'pass' and
 * metrics.missingSections 0 — a pass over a structure nobody checked. The same
 * path served verify_revision and critique_document.
 *
 * These pin the fail-closed behaviour: the report carries a structure status
 * ('checked' | 'not-checked' | 'not-applicable'), an unindexed type is a
 * located 'structure not checked' finding that forces 'revise', and all three
 * tools surface it.
 */

import { describe, it, expect } from 'vitest';

import { critiqueDraft, critiqueDocument, verifyRevision, buildRevisionBrief } from '../writing-precision-gate';
import { CRITIQUE_DRAFT, VERIFY_REVISION, CRITIQUE_DOCUMENT } from '../writingQualityTools';
import { getToolHandler } from '../AnaToolExecutor';
import { getDocumentTypeStandard, listMedicalWritingCatalog } from '../medical-writing';

/** Passes every other dimension (see writing-precision-gate.test.ts "passes a coherent two-section document"). */
const CLEAN = 'All 186 subjects were analyzed for efficacy, per the SAP and the protocol.';

const notice = (type: string) =>
  // nosemgrep: detect-non-literal-regexp -- a test: type is a literal document type, its dots escaped
  new RegExp(`structure not checked: '${type.replace(/\./g, '\\.')}' is not an indexed document type`, 'i');

describe('critiqueDraft — an unindexed documentType is never a silent pass', () => {
  it('the clean text passes when no documentType is asked for, and says structure was not applicable', () => {
    const r = critiqueDraft({ text: CLEAN });
    expect(r.verdict).toBe('pass');
    expect(r.structure).toEqual({ status: 'not-applicable', reason: expect.stringMatching(/no documentType/i) });
    expect(r.metrics.structureChecked).toBe(false);
    expect(r.metrics.missingSections).toBeNull();
    expect(r.findings.filter(f => f.category === 'structure')).toEqual([]);
  });

  it.each(['clinical_study_report', '2.7.4', 'iss'])('%s → not-checked, a located notice, verdict revise', type => {
    const r = critiqueDraft({ text: CLEAN, documentType: type });
    expect(r.structure.status).toBe('not-checked');
    expect(r.structure.reason).toMatch(notice(type));
    expect(r.metrics.structureChecked).toBe(false);
    expect(r.metrics.missingSections).toBeNull();
    const f = r.findings.filter(x => x.category === 'structure');
    expect(f).toHaveLength(1);
    expect(f[0].severity).toBe('high');
    expect(f[0].message).toMatch(notice(type));
    // tells the writer what would be checked: the indexed whole-document types
    expect(f[0].message).toMatch(/\bcsr\b/);
    expect(f[0].evidence).toEqual([type]);
    expect(r.verdict).toBe('revise');
    expect(buildRevisionBrief(r)).toMatch(notice(type));
  });

  it('an indexed type with text is checked', () => {
    const r = critiqueDraft({ text: CLEAN, documentType: 'csr' });
    expect(r.structure.status).toBe('checked');
    expect(r.metrics.structureChecked).toBe(true);
    expect(typeof r.metrics.missingSections).toBe('number');
    expect(r.metrics.missingSections).toBeGreaterThan(0);
  });

  it('an indexed type with no text is not checked, and does not pass', () => {
    const r = critiqueDraft({ text: '   ', documentType: 'csr' });
    expect(r.structure.status).toBe('not-checked');
    expect(r.structure.reason).toMatch(/no text/i);
    expect(r.metrics.structureChecked).toBe(false);
    expect(r.verdict).toBe('revise');
  });
});

describe('verifyRevision and critiqueDocument carry the structure status', () => {
  it('verifyRevision never reports passesNow over an unchecked structure', () => {
    const v = verifyRevision({ text: CLEAN, documentType: 'iss' }, { text: CLEAN, documentType: 'iss' });
    expect(v.passesNow).toBe(false);
    expect(v.structure.status).toBe('not-checked');
    expect(v.structure.reason).toMatch(notice('iss'));
  });

  it('critiqueDocument puts the notice in crossSectionFindings and does not pass', () => {
    const doc = critiqueDocument(
      [
        { title: 'Methods', text: 'A total of 186 subjects were randomized to treatment according to the protocol.' },
        { title: 'Results', text: CLEAN },
      ],
      { documentType: 'clinical_study_report' },
    );
    expect(doc.structure.status).toBe('not-checked');
    expect(doc.crossSectionFindings.some(f => f.category === 'structure' && notice('clinical_study_report').test(f.message))).toBe(true);
    expect(doc.verdict).toBe('revise');
  });

  it('critiqueDocument without a documentType reports not-applicable and still passes a clean document', () => {
    const doc = critiqueDocument([{ title: 'Results', text: CLEAN }]);
    expect(doc.structure.status).toBe('not-applicable');
    expect(doc.verdict).toBe('pass');
  });

  it('uses existing separately held section titles as whole-document heading evidence', () => {
    const headings = getDocumentTypeStandard('manuscript')!.structure;
    const doc = critiqueDocument(headings.map(title => ({ title, text: CLEAN })), { documentType: 'manuscript' });
    expect(doc.structure.status).toBe('checked');
    expect(doc.crossSectionFindings.filter(f => f.category === 'structure')).toEqual([]);
    const draft = critiqueDraft({ text: CLEAN, documentType: 'manuscript', knownHeadings: headings });
    expect(draft.metrics.missingSections).toBe(0);
  });

  it('does not accept prose heading keywords or partial authoring titles as structure', () => {
    const r = critiqueDraft({ text: 'The abstract introduction discusses methods, results, discussion, limitations, conclusions, declarations and references.', documentType: 'manuscript' });
    expect(r.metrics.missingSections).toBe(getDocumentTypeStandard('manuscript')!.structure.length);
    const doc = critiqueDocument([{ title: 'Methods planned', text: CLEAN }], { documentType: 'manuscript' });
    expect(doc.crossSectionFindings.some(f => f.category === 'structure' && /Methods/.test(f.message))).toBe(true);
  });
});

describe('the three tools surface the notice', () => {
  it('critique_draft returns structureChecked false, the finding, a revise verdict and the notice in the brief', async () => {
    const out = JSON.parse(await getToolHandler('critique_draft')!({ text: CLEAN, documentType: '2.7.4' }, {}));
    expect(out.verdict).toBe('revise');
    expect(out.metrics.structureChecked).toBe(false);
    expect(out.findings.some((f: { message: string }) => notice('2.7.4').test(f.message))).toBe(true);
    expect(out.revisionBrief).toMatch(notice('2.7.4'));
  });

  it('verify_revision returns the status in result', async () => {
    const out = JSON.parse(
      await getToolHandler('verify_revision')!({ originalText: CLEAN, revisedText: CLEAN, documentType: 'iss' }, {}),
    );
    expect(out.result.passesNow).toBe(false);
    expect(out.result.structure.reason).toMatch(notice('iss'));
  });

  it('critique_document returns the notice in crossSectionFindings', async () => {
    const out = JSON.parse(
      await getToolHandler('critique_document')!(
        { sections: [{ title: 'Results', text: CLEAN }], documentType: 'clinical_study_report' },
        {},
      ),
    );
    expect(out.verdict).toBe('revise');
    expect(
      out.crossSectionFindings.some((f: { message: string }) => notice('clinical_study_report').test(f.message)),
    ).toBe(true);
  });
});

describe('the tool contracts say what documentType checks', () => {
  const ids = listMedicalWritingCatalog().documentTypes.map(d => d.id);
  const describeType = (tool: typeof CRITIQUE_DRAFT) =>
    (tool.input_schema.properties as Record<string, { description?: string }>).documentType?.description ?? '';

  it('critique_draft: the type is checked as a whole document; a single section omits it', () => {
    const d = describeType(CRITIQUE_DRAFT);
    expect(d).toMatch(/whole document/i);
    expect(d).toMatch(/single section/i);
  });

  it.each([
    ['critique_draft', CRITIQUE_DRAFT],
    ['verify_revision', VERIFY_REVISION],
    ['critique_document', CRITIQUE_DOCUMENT],
  ] as const)('%s lists every indexed type and says an unindexed one is reported not checked', (_n, tool) => {
    const d = describeType(tool);
    for (const id of ids) expect(d).toContain(id);
    expect(d).toMatch(/not checked/i);
  });
});
