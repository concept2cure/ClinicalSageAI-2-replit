import { describe, expect, it, vi } from 'vitest';
import { getAllINDSections, getSectionByCode, type INDSection } from '../../../../services/regulatory/ind-ectd-sections';
import { ICH_M11_PROTOCOL_SECTIONS } from '../../../../shared/regulatory/protocol-m11';
import { ICH_E3_GUIDANCE } from '../../ind/ctd/csr-e3-guidance';
import { NONCLINICAL_STUDY_REPORT_STRUCTURE } from '../nonclinical-study-report-structure';

const initialization = vi.hoisted(() => vi.fn());
vi.mock('../../../lib/unified-ai-client.js', () => { initialization(); throw new Error('Outline projection cannot initialize model infrastructure'); });
import { buildModule4Or5Outline } from '../ind-template-outlines-m4-m5';

function section(code: string): INDSection {
  const record = getSectionByCode(code);
  if (!record) throw new Error(`Missing canonical fixture ${code}`);
  return record;
}

describe('Module 4 working outlines preserve the single recorded study report structure', () => {
  it.each(getAllINDSections().filter(s => s.module === 'M4' && s.depth > 0).map(s => s.code))(
    'offers recorded evidence requirements without filling the original study: %s', code => {
      const record = section(code);
      const rows = buildModule4Or5Outline(record);
      expect(rows.map(row => row.title)).toEqual(NONCLINICAL_STUDY_REPORT_STRUCTURE.map(row => row.title));
      expect(rows).toHaveLength(7);
      expect(rows.every(row => row.content === '')).toBe(true);
      expect(rows.map(row => row.code)).toEqual(Array.from({ length: 7 }, (_, i) => `${code}:work:${i + 1}`));
      expect(rows.every(row => row.guidance.guidance_text.includes('not a CTD filing node'))).toBe(true);
      expect(rows[3].guidance.compliance_checklist).toContain('Verify the recorded dose groups against the original study report.');
      expect(rows[0].guidance.common_pitfalls.join(' ')).toMatch(/unverified GLP/);
    },
  );

  it('does not execute model initialization through the pure record projection', () => {
    buildModule4Or5Outline(section('m4.2.3.2'));
    buildModule4Or5Outline(section('m5.3.5.1'));
    expect(initialization).not.toHaveBeenCalled();
  });
});

describe('Module 5 uses the actual report or protocol record', () => {
  it.each(['m5.3.5.1', 'm5.3.5.2'])('retains the complete deep ICH E3 heading tree for %s', code => {
    const rows = buildModule4Or5Outline(section(code));
    expect(rows).toHaveLength(ICH_E3_GUIDANCE.length);
    expect(rows.map(row => row.title)).toEqual(ICH_E3_GUIDANCE.map(row => `${row.number} ${row.title}`));
    expect(rows.some(row => row.title.startsWith('12.3.2 '))).toBe(true);
    expect(rows.some(row => row.title.startsWith('16.2.8 '))).toBe(true);
    expect(rows.every(row => row.content === '')).toBe(true);
    expect(new Set(rows.map(row => row.code)).size).toBe(rows.length);
    expect(rows[0].guidance.compliance_checklist.some(line => line.startsWith('Verify source records (platform practice):'))).toBe(true);
    expect(rows[0].guidance.regulatory_references.join(' ')).toMatch(/recall|regulator-text/);
  });

  it('never infers a protocol from the filing code or shared pyramid task', () => {
    const rows = buildModule4Or5Outline({ ...section('m5.3.5.1'), pyramidTaskId: 'phase5.protocol_finalize' });
    expect(rows.some(row => row.title.startsWith('9.8 Changes in the Conduct'))).toBe(true);
    expect(rows.some(row => row.guidance.source_reference.startsWith('shared/regulatory/protocol-m11'))).toBe(false);
  });

  it('projects current M11 only for an explicit protocol document type', () => {
    const rows = buildModule4Or5Outline({ ...section('m5.3.5.1'), title: 'Final clinical protocol' });
    expect(rows.map(row => row.title)).toEqual(ICH_M11_PROTOCOL_SECTIONS.map(row => row.number ? `${row.number} ${row.title}` : row.title));
    expect(rows.every(row => row.content === '')).toBe(true);
    expect(rows[0].guidance.common_pitfalls.join(' ')).toMatch(/not.*every possible assessment|do not require every possible assessment/);
    expect(rows.some(row => row.title.startsWith('8.7 Immunogenicity Assessments'))).toBe(true);
  });

  it('uses targeted E3 analysis requirements for pooled studies without inventing a trial execution report', () => {
    const rows = buildModule4Or5Outline(section('m5.3.5.3'));
    expect(rows.some(row => row.title.startsWith('11.1 Data Sets'))).toBe(true);
    expect(rows.some(row => row.title.startsWith('11.4 Efficacy Results'))).toBe(true);
    expect(rows.some(row => row.title.startsWith('9.7 Statistical Methods'))).toBe(true);
    expect(rows.some(row => row.title.startsWith('9.3 Selection of Study Population'))).toBe(false);
  });

  it('keeps previous human experience distinct and names actual withdrawals and evidence gaps', () => {
    const rows = buildModule4Or5Outline(section('m5.3.5.4'));
    expect(rows.map(row => row.title)).toContain('Safety, effectiveness and withdrawals');
    expect(rows.some(row => row.guidance.guidance_text.includes('Do not imply the absence of a concern from missing evidence'))).toBe(true);
    expect(rows.every(row => row.content === '')).toBe(true);
  });

  it.each(['m5.3.7', 'm5.4'])('loads %s as source preparation without fabricating forms or literature', code => {
    const rows = buildModule4Or5Outline(section(code));
    expect(rows.map(row => row.title)).toEqual(['Original source inventory', 'Applicability and completeness', 'Verified extraction and reconciliation', 'Review and outstanding actions']);
    expect(rows.every(row => row.content === '')).toBe(true);
    expect(rows[0].guidance.common_pitfalls.join(' ')).toMatch(/official form, dataset, signed report/);
  });

  it('does not supply another module through this builder', () => {
    expect(buildModule4Or5Outline(section('m2.5'))).toEqual([]);
  });
});
