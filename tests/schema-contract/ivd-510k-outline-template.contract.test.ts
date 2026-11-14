import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { listXfaFields, listXfaPackets } from '../../server/services/forms/fill-official-pdf';
import { getApplicationType } from '../../shared/regulatory/global-document-registry';
import { getSectionBlueprintForEntry } from '../../shared/regulatory/project-bootstrap';
import { getRegistryDocumentTemplate } from '../../server/services/market-specs/document-template-library';
import { governedSectionsToDeviceSections, sectionsToLeaves } from '../../server/services/pathway-engines/estar/estar-content-leaves';
import { mapToEstar } from '../../server/services/pathway-engines/estar/estar-mapper';

const blueprint = () => getSectionBlueprintForEntry(getApplicationType('US_510K_IVD')!);

describe('the existing US IVD 510(k) template reaches its FDA filing outline', () => {
  it('retains FDA administrative, substantial-equivalence and labeling keys, and adds analytical performance', () => {
    const sections = blueprint().sections;
    expect(sections).toHaveLength(47);
    expect(sections.find(s => s.code === 'A1')?.title).toBe('Cover letter');
    expect(sections.find(s => s.code === 'C2')?.title).toContain('Substantial equivalence');
    expect(sections.find(s => s.code === 'D2')?.title).toContain('labeling');
    expect(sections.find(s => s.code === 'E9')?.title).toContain('Analytical performance');
    expect(sections.filter(s => ['E5', 'E6'].includes(s.code))).toHaveLength(2);
    expect(sections.filter(s => ['E5', 'E6'].includes(s.code)).every(s => !s.required)).toBe(true);
  });

  it('serves US content through the existing template library, without EU IVDR citations', async () => {
    const template = await getRegistryDocumentTemplate('US_510K_IVD');
    expect(template).toBeDefined();
    expect(template!.sections.map(s => s.number)).toEqual(blueprint().sections.map(s => s.code));
    expect(JSON.stringify(template)).not.toMatch(/IVDR|Annex XIII|Article 56/);
    expect(template!.sections.find(s => s.number === 'E9')?.purpose).toContain('FDA IVD eSTAR');
  });

  it('holds content readiness without the existing biocompatibility review, even for an IVD', () => {
    const rows = blueprint().sections.filter(s => s.code !== 'E1').map((s, i) => ({
      id: i + 1, section_key: s.code, label: s.title,
      status: 'approved', content: 'Sponsor source-linked evidence reviewed for this section. '.repeat(20),
    }));
    const leaves = sectionsToLeaves(governedSectionsToDeviceSections(rows as never) as never);
    const result = mapToEstar({ type: '510k', variant: 'ivd', leaves, flags: {} });
    expect(result.summary.ready).toBe(false);
    expect(result.summary.missingRequired).toEqual(['biocompatibility']);
  });

  it('finished content in the actual template supplies every required IVD mapper slot', () => {
    const rows = blueprint().sections.map((s, i) => ({
      id: i + 1, section_key: s.code, label: s.title,
      status: 'approved', content: 'Sponsor source-linked evidence reviewed for this section. '.repeat(20),
    }));
    const leaves = sectionsToLeaves(governedSectionsToDeviceSections(rows as never) as never);
    const result = mapToEstar({ type: '510k', variant: 'ivd', leaves, flags: {} });
    expect(result.summary.missingRequired).toEqual([]);
    expect(result.sections.find(s => s.id === 'ivd-analytical-performance')?.present).toBe(true);
  });
});

// Inspect the actual retained official form, not a hand-built field catalogue.

describe('the IVD outline is matched to the pinned FDA IVD eSTAR 7.1', () => {
  it('retains all existing non-performance key meanings and retains conditional bench/animal keys', () => {
    const sql = readFileSync('migrations/20261005c_k510_denovo_estar_outline_v1_1.sql', 'utf8');
    const generic = JSON.parse([...sql.matchAll(/\$pack\$([\s\S]*?)\$pack\$/g)][0][1]) as Array<{ key: string; label: string; mandatory: boolean }>;
    const ivd = new Map(blueprint().sections.map(s => [s.code, s]));
    for (const node of generic.filter(n => !n.key.startsWith('E'))) {
      expect(ivd.get(node.key)).toMatchObject({ title: node.label, required: node.mandatory });
    }
    for (const key of ['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8']) {
      expect(ivd.get(key)?.title).toBe(generic.find(n => n.key === key)?.label);
    }
    expect(ivd.get('E5')?.required).toBe(false);
    expect(ivd.get('E6')?.required).toBe(false);
    expect(ivd.get('E1')?.required).toBe(true);
    expect(ivd.get('E9')?.required).toBe(true);
  });

  it('finds the actual analytical, comparison, expected-values and conditional tissue-contact questions', async () => {
    const bytes = readFileSync('assets/estar-templates/eSTAR-510k-ivd.pdf');
    expect(createHash('sha256').update(bytes).digest('hex')).toBe('df5e31dcbbe60e55b93c6006c4771c01df75a9d1c21e4b473605e20dfacce1e1');
    const fields = await listXfaFields(bytes);
    const byPath = new Map(fields.map(f => [f.somPath, f]));
    const assay = 'root.PerformanceTesting.AnalyticalPerformance.AssayPerformance.';
    for (const [path, caption] of [
      [`${assay}PTDropDownList110`, 'Precision (Repeatability/Reproducibility)'],
      ['root.PerformanceTesting.AnalyticalPerformance.InstrumentPerformance.PTDropDownList200', 'Instrument Accuracy'],
      ['root.PerformanceTesting.ComparisonStudies.PTDropDownList260', 'Method Comparison'],
      ['root.PerformanceTesting.ComparisonStudies.PTDropDownList270', 'Specimens/Matrix Comparison'],
      ['root.PerformanceTesting.ReferenceRange.PTDropDownList510', 'Reference Range/Expected Values'],
      [`${assay}PTDropDownList210`, 'Stability of Sample'],
      [`${assay}PTDropDownList170`, 'Traceability'],
      [`${assay}PTDropDownList160`, 'Assay Cut-Off'],
      [`${assay}PTDropDownList185`, 'Carry-Over'],
      [`${assay}PTDropDownList240`, 'High Dose Hook Effect'],
      ['root.Biocompatibility.PatientMaterials.BCDropDownList105', 'How many tissue contacting'],
      ['root.DeviceDescription.GeneralCharacteristics.DDDropDownList120', 'Are there any direct or indirect tissue contacting components?'],
    ]) expect(byPath.get(path)?.caption).toContain(caption);
    expect(fields.some(f => f.somPath.includes('root.PerformanceTesting.ClinicalStudies.'))).toBe(true);
    expect(byPath.get('root.PerformanceTesting.BenchTesting.PTDropDownList410')?.caption).toBe('Do you have Bench Testing to include in this submission?');
    expect(byPath.get('root.PerformanceTesting.AnimalTesting.PTDropDownList610')?.caption).toBe('Do you have Animal Testing to include in this submission?');
    const template = (await listXfaPackets(bytes)).find(p => p.name === 'template');
    expect(template).toBeDefined();
    const xml = Buffer.from(template!.bytes).toString('utf8');
    // A field existing in the international PDF does not make it an FDA
    // requirement: inspect the script's actual jurisdiction owner as well.
    const document = new DOMParser().parseFromString(xml, 'application/xml');
    const radioScript = (name: string, jurisdiction: string) => {
      const radio = Array.from(document.getElementsByTagName('exclGroup'))
        .find(node => node.getAttribute('name') === name);
      expect(radio?.parentNode?.nodeName).toBe('subform');
      expect((radio?.parentNode as { getAttribute(name: string): string | null })?.getAttribute('name')).toBe(jurisdiction);
      const event = Array.from(radio!.getElementsByTagName('event'))
        .find(node => node.getAttribute('activity') === 'change');
      return event?.getElementsByTagName('script')[0]?.textContent ?? '';
    };
    const usa = radioScript('ATRadioButton110', 'USA');
    const canada = radioScript('ATRadioButton120', 'CDN');
    expect(usa).toMatch(/PerformanceTesting\.BenchTesting\.presence\s*=\s*"hidden"/);
    expect(usa).toMatch(/PerformanceTesting\.AnimalTesting\.presence\s*=\s*"visible"/);
    expect(canada).toMatch(/PerformanceTesting\.BenchTesting\.presence\s*=\s*"visible"/);
    expect(canada).toMatch(/PerformanceTesting\.AnimalTesting\.presence\s*=\s*"hidden"/);
    const choices = xml.match(/<field name="BCDropDownList105"[\s\S]*?<items\b[^>]*>([\s\S]*?)<\/items\s*>/)?.[1];
    expect(choices).toMatch(/<text\s*>0<\/text\s*>/);
  });
});
