/**
 * What AnA is told a CTD section is, while she drafts it, is what ICH M4 and
 * FDA's Module 1 say it is.
 *
 * Three hand-kept copies told her otherwise (D2, 2026-10-04,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04/):
 *   - ana-ri/orchestrator.ts SECTION_GUIDANCE, the "Section Requirements" of
 *     every turn with a section open: 2.7.3 "Summary of Clinical
 *     Pharmacodynamics", 2.7.4 efficacy, 2.7.5 safety, 1.14 "Environmental
 *     Assessment". ICH M4E: 2.7.3 efficacy, 2.7.4 safety, 2.7.5 literature
 *     references. FDA Module 1: 1.14 labeling, 1.12.14 environmental analysis.
 *   - lumen-context/sections.ts, the stream's section playbook: 1.1 "Cover
 *     Letter / FDA Form 1571", 1.2 "Table of Contents", 1.3.1 "FDA Form 1572",
 *     1.3.3 "Investigator's Brochure", 5.3.5.1 "Clinical Protocol". FDA Module 1:
 *     1.1 forms, 1.2 cover letter, 1.3.3 debarment certification, 1.14.4.1 IB;
 *     5.3.5.1 is the reports of controlled clinical studies.
 *   - ana-ri/document-templates.ts, the template injected when a message names
 *     a document: "Summary of Clinical Efficacy (2.7.4)", "Summary of Clinical
 *     Safety (2.7.5)", and "section 2.7.4" detected as the efficacy summary.
 *
 * The canonical overlay (CTD_AUTHORING_GUIDANCE) is already held by the
 * authoring-depth and citation-accuracy suites, so every assertion here is
 * against it rather than against a second list of titles.
 */
import { describe, it, expect } from 'vitest';
import { CTD_AUTHORING_GUIDANCE } from '../../server/services/ind/ctd/index';
import { getSectionGuidance } from '../../server/services/ana-ri/orchestrator';
import { buildSectionSpecificPrompt } from '../../server/services/lumen-context/sections';
import { detectDocumentTemplate, DOCUMENT_TEMPLATES } from '../../server/services/ana-ri/document-templates';

const CANONICAL = Object.values(CTD_AUTHORING_GUIDANCE);

/** "Quality Overall Summary (QOS)" → "Quality Overall Summary". */
const coreTitle = (title: string) => title.replace(/\s*\(.*?\)\s*/g, ' ').split(' — ')[0].trim();

describe("the orchestrator's section line names the section ICH M4 / FDA Module 1 names", () => {
  it.each([
    ['2.7.3', 'Summary of Clinical Efficacy', /pharmacodynamic/i],
    ['2.7.4', 'Summary of Clinical Safety', /summary of clinical efficacy/i],
    ['2.7.5', 'Literature References', /summary of clinical safety/i],
    ['1.2', 'Cover Letter', /table of contents/i],
    ['1.12.14', 'Environmental Assessment', /^$/],
  ])('%s is %s', (code, title, wrong) => {
    const line = getSectionGuidance(code);
    expect(line, `no section line for ${code}`).toBeTruthy();
    expect(line!).toContain(title);
    if (String(wrong) !== '/^$/') expect(line!).not.toMatch(wrong);
  });

  it('1.14 is labeling, not the environmental assessment', () => {
    const line = getSectionGuidance('1.14');
    expect(line, 'no section line for 1.14').toBeTruthy();
    expect(line!).toMatch(/label/i);
    expect(line!).not.toMatch(/environmental/i);
  });

  it('a sub-section is briefed as its nearest registered section, and says so', () => {
    const line = getSectionGuidance('2.7.3.1');
    expect(line).toContain('2.7.3');
    expect(line).toContain('Summary of Clinical Efficacy');
  });

  it('a parent is briefed by the sections it contains, not as its first child', () => {
    const line = getSectionGuidance('2.7');
    expect(line).toContain('2.7.3 Summary of Clinical Efficacy');
    expect(line).toContain('2.7.4 Summary of Clinical Safety');
  });

  it('a code nothing registers gets no line rather than a guessed one', () => {
    expect(getSectionGuidance('9.9.9')).toBeNull();
    expect(getSectionGuidance('not a code')).toBeNull();
  });

  it('agrees with the canonical overlay on every registered code', () => {
    for (const g of CANONICAL) {
      const line = getSectionGuidance(g.code);
      expect(line, `no section line for ${g.code}`).toBeTruthy();
      expect(line!.startsWith(`${g.code} ${g.title}`), `${g.code}: "${line!.slice(0, 80)}"`).toBe(true);
    }
  });
});

describe("the stream's section playbook names the section ICH M4 / FDA Module 1 names", () => {
  it.each([
    ['1.1', 'Form FDA 1571', /cover letter/i],
    ['1.2', 'Cover Letter', /table of contents/i],
    ['1.3.3', 'Debarment Certification', /investigator'?s brochure/i],
    ['1.14.4.1', "Investigator's Brochure", /^$/],
    ['5.2', 'Tabular Listing', /per ICH E3/i],
  ])('%s carries %s', (code, expected, wrong) => {
    const prompt = buildSectionSpecificPrompt(code);
    expect(prompt, `no playbook for ${code}`).toBeTruthy();
    expect(prompt!).toContain(expected);
    if (String(wrong) !== '/^$/') expect(prompt!).not.toMatch(wrong);
  });

  it('5.3.5.1 holds the reports of controlled clinical studies, not a protocol playbook', () => {
    const prompt = buildSectionSpecificPrompt('5.3.5.1')!;
    expect(prompt).toContain(CTD_AUTHORING_GUIDANCE['5.3.5.1'].title);
    expect(prompt).not.toMatch(/Clinical Protocol/);
  });

  it('opens with the canonical code and title for every registered code', () => {
    for (const g of CANONICAL) {
      const prompt = buildSectionSpecificPrompt(g.code);
      expect(prompt, `no playbook for ${g.code}`).toBeTruthy();
      const firstLine = prompt!.split('\n')[0];
      expect(firstLine, g.code).toContain(`${g.code} — ${g.title}`);
    }
  });

  it('keeps the module playbooks the overlay does not model', () => {
    expect(buildSectionSpecificPrompt('2.7')).toContain('**2.7.3**: Summary of Clinical Efficacy');
    expect(buildSectionSpecificPrompt('SAP')).toContain('Statistical Analysis Plan');
  });
});

describe('the template injected for a named document is the document the overlay files at its code', () => {
  it.each([
    ['summary of clinical efficacy', '2.7.3'],
    ['draft section 2.7.3', '2.7.3'],
    ['summary of clinical safety', '2.7.4'],
    ['section 2.7.4', '2.7.4'],
    ['section 2.7.4 summary of clinical safety', '2.7.4'],
  ])('"%s" → %s', (message, code) => {
    const hit = detectDocumentTemplate(message);
    expect(hit, `nothing detected for "${message}"`).toBeTruthy();
    expect(hit!.template.primaryCode).toBe(code);
  });

  it('every template with a CTD primary code is named for that code', () => {
    for (const t of Object.values(DOCUMENT_TEMPLATES)) {
      const g = t.primaryCode ? CTD_AUTHORING_GUIDANCE[t.primaryCode] : undefined;
      if (!g) continue;
      expect(t.displayName, t.id).toContain(coreTitle(g.title));
      expect(t.draftingInstructions, t.id).toContain(t.primaryCode!);
    }
  });

  it('every coded 2.5.x / 2.7.x sub-heading carries its ICH M4E title', () => {
    for (const t of Object.values(DOCUMENT_TEMPLATES)) {
      for (const s of t.sections) {
        const g = s.code && /^2\.(5|7)\./.test(s.code) ? CTD_AUTHORING_GUIDANCE[s.code] : undefined;
        if (!g) continue;
        expect(s.heading, `${t.id} ${s.code}`).toContain(g.title);
      }
    }
  });
});

describe('2.7.3 and 2.7.4 summarise; the ISE and ISS are the analyses filed in 5.3.5.3', () => {
  // FDA, "Placement of Integrated Summaries of Safety and Effectiveness
  // (ISS/ISE) in Applications Submitted in the eCTD Format": 5.3.5.3 is the
  // location; a narrative portion suitable for 2.7.3 / 2.7.4 is placed once
  // there and referenced from 5.3.5.3. FDA, Integrated Summary of
  // Effectiveness (2015): 2.7.3 provides "data summaries, not a complete
  // exposition". The overlay said 2.7.3 / 2.7.4 is "where the ISE / ISS
  // narrative lives" and "houses" the integrated analyses 314.50(d)(5) requires.
  it.each([
    ['2.7.3', 'ISE', '314.50(d)(5)(v)'],
    ['2.7.4', 'ISS', '314.50(d)(5)(vi)'],
  ])('%s does not claim to be the %s', (code, summary, cfr) => {
    const g = CTD_AUTHORING_GUIDANCE[code].guidance;
    expect(g).not.toMatch(new RegExp(`is where the .*\\(${summary}\\) narrative lives`));
    expect(g).not.toMatch(/houses the integrated/);
    expect(g).toContain('5.3.5.3');
    expect(g).toContain(cfr);
  });

  it('2.7.3 states FDA’s own description of the summary', () => {
    expect(CTD_AUTHORING_GUIDANCE['2.7.3'].guidance).toContain('data summaries, not a complete exposition');
  });
});
