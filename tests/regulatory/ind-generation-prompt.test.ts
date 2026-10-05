/**
 * The IND drafting prompt briefs the section that was asked for.
 *
 * buildSectionGenerationPrompt feeds POST /api/ind-generation/generate-section
 * and the knowledge-base auto-draft loop (both through getGenerationPrompt).
 * It resolved a code through getCtdAuthoringGuidance, whose parent branch
 * returns the FIRST DESCENDANT. Eight of the nineteen IND sections are parents
 * in the overlay (2.6, 2.7, 3.2.S, 3.2.P, 4.2.1, 4.2.2, 4.2.3, 5.3), so a
 * request for 4.2.3 Toxicology was drafted as "4.2.3.1 Single-Dose Toxicity",
 * with only the single-dose study's must-contain list.
 *
 * It now resolves through resolveSectionBriefSource (section-brief.ts), the
 * same resolution the section playbook uses: an exact or ancestor entry is
 * briefed from that entry and named by the requested code; a parent names
 * itself and lists the sections it contains; anything else gets no prompt.
 */
import { describe, expect, it } from 'vitest';
import {
  buildSectionGenerationPrompt,
  CTD_AUTHORING_GUIDANCE,
  resolveSectionBriefSource,
} from '../../server/services/ind/ctd/index';
import { IND_SECTIONS, getGenerationPrompt } from '../../server/services/ind/ind-section-registry';

/** The CTD code the prompt says it is authoring (first paragraph). */
function titledCode(prompt: string): string | undefined {
  const first = prompt.split('\n\n')[0];
  return /authoring CTD section ([0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)/.exec(first)?.[1];
}

/** The heading lines a parent prompt lists: code, title and indentation depth. */
function listedHeadings(prompt: string): { code: string; title: string; depth: number }[] {
  return prompt
    .split('\n')
    .map((l) => /^( *)- ([0-9][0-9A-Za-z]*(?:\.[0-9A-Za-z]+)+)(?: (.*))?$/.exec(l))
    .filter((m): m is RegExpExecArray => !!m)
    .map((m) => ({ code: m[2], title: m[3] ?? '', depth: m[1].length / 2 }));
}

describe('a parent code is briefed as the parent, never as its first child', () => {
  it('4.2.3 is titled 4.2.3, not "4.2.3.1 Single-Dose Toxicity"', () => {
    const p = buildSectionGenerationPrompt('4.2.3');
    expect(p).toBeTruthy();
    expect(titledCode(p!)).toBe('4.2.3');
    expect(p!.split('\n\n')[0]).not.toContain('Single-Dose Toxicity');
  });

  it('4.2.3 lists every registered section it contains, 4.2.3.1 through 4.2.3.7, with canonical titles', () => {
    const p = buildSectionGenerationPrompt('4.2.3')!;
    for (const code of ['4.2.3.1', '4.2.3.2', '4.2.3.3', '4.2.3.4', '4.2.3.5', '4.2.3.6', '4.2.3.7']) {
      const g = CTD_AUTHORING_GUIDANCE[code];
      expect(g, `${code} is registered`).toBeDefined();
      expect(p).toContain(`${code} ${g.title}`);
    }
  });

  it("a parent prompt carries no single child's must-contain list", () => {
    for (const code of ['2.6', '2.7', '3.2.S', '3.2.P', '4.2.1', '4.2.2', '4.2.3', '5.3']) {
      const src = resolveSectionBriefSource(code);
      expect(src?.kind, code).toBe('parent');
      const p = buildSectionGenerationPrompt(code)!;
      expect(p).not.toMatch(/The section MUST cover:/);
      const first = src!.children![0];
      for (const el of first.keyContentElements) {
        expect(p, `${code} carries ${first.code}'s "${el}"`).not.toContain(el);
      }
    }
  });

  it('every one of the 19 IND sections is titled with its own code', () => {
    expect(IND_SECTIONS.length).toBe(19);
    const wrong: string[] = [];
    for (const s of IND_SECTIONS) {
      const p = buildSectionGenerationPrompt(s.code);
      expect(p, `no prompt for ${s.code}`).toBeTruthy();
      const t = titledCode(p!);
      if (t !== s.code) wrong.push(`${s.code} → ${t}`);
    }
    expect(wrong).toEqual([]);
  });

  it('every listed heading sits under the requested code or another listed heading (no orphaned children)', () => {
    const orphaned: string[] = [];
    for (const code of ['2.6', '2.7', '3.2.S', '3.2.P', '4.2.1', '4.2.2', '4.2.3', '5.3']) {
      const lines = listedHeadings(buildSectionGenerationPrompt(code)!);
      const listed = new Set(lines.map((l) => l.code));
      for (const l of lines) {
        const parent = l.code.split('.').slice(0, -1).join('.');
        if (parent !== code && !listed.has(parent)) orphaned.push(`${code}: ${l.code}`);
        // indentation is the true depth below the requested code
        expect(l.depth, `${code}: ${l.code} depth`).toBe(l.code.split('.').length - code.split('.').length - 1);
      }
    }
    expect(orphaned).toEqual([]);
  });

  it('5.3 lists 5.3.5 (by code only, no invented title) before 5.3.5.1, and nests 5.3.5.x under it, not under 5.3.4', () => {
    expect(CTD_AUTHORING_GUIDANCE['5.3.5'], 'premise: 5.3.5 has no overlay entry').toBeUndefined();
    const lines = listedHeadings(buildSectionGenerationPrompt('5.3')!);
    const codes = lines.map((l) => l.code);
    const i535 = codes.indexOf('5.3.5');
    expect(i535).toBeGreaterThan(codes.indexOf('5.3.4'));
    expect(i535).toBeLessThan(codes.indexOf('5.3.5.1'));
    expect(lines[i535].title).toBe('');
    expect(lines[i535].depth).toBe(0);
  });

  it("headings carry no platform qualifier (' — Overview', a trailing bracketed disambiguation)", () => {
    const p32s = buildSectionGenerationPrompt('3.2.S')!;
    expect(p32s).not.toContain('— Overview');
    expect(p32s).toMatch(/^\s*- 3\.2\.S\.2 Manufacture$/m);
    expect(p32s).toMatch(/^\s*- 3\.2\.S\.4 Control of Drug Substance$/m);
    expect(p32s).toMatch(/^\s*- 3\.2\.S\.7 Stability$/m);
    expect(p32s).toMatch(/^\s*- 3\.2\.S\.2\.1 Manufacturer\(s\)$/m); // part of the title, kept
    expect(buildSectionGenerationPrompt('2.6')!).toMatch(/^- 2\.6\.1 Introduction$/m);
    expect(buildSectionGenerationPrompt('5.3')!).toMatch(/^\s*- 5\.3\.5\.3 Reports of Analyses of Data from More Than One Study$/m);
  });

  it('a section the material says does not apply may be stated not applicable with its reason; a placeholder is for unknown data', () => {
    const p = buildSectionGenerationPrompt('4.2.3')!;
    expect(p).toMatch(/not applicable/i);
    expect(p).toMatch(/placeholder/);
  });

  it('the auto-draft and route path (getGenerationPrompt) is titled with the requested code too', () => {
    const p = getGenerationPrompt('4.2.3', { productName: 'BX-099' });
    expect(titledCode(p)).toBe('4.2.3');
    expect(p).toContain('BX-099');
  });
});

describe('exact, ancestor and unknown codes', () => {
  it('an exact entry is briefed from that entry, with its title and must-contain list', () => {
    const p = buildSectionGenerationPrompt('2.7.3')!;
    const g = CTD_AUTHORING_GUIDANCE['2.7.3'];
    expect(titledCode(p)).toBe('2.7.3');
    expect(p).toContain(`"${g.title}"`);
    expect(p).toContain('The section MUST cover:');
    expect(p).toContain(g.keyContentElements[0]);
  });

  it("a code deeper than any entry names the open section and says whose requirements follow", () => {
    expect(resolveSectionBriefSource('2.7.3.1')?.kind).toBe('ancestor');
    const p = buildSectionGenerationPrompt('2.7.3.1')!;
    expect(titledCode(p)).toBe('2.7.3.1');
    expect(p).toContain(`within 2.7.3 "${CTD_AUTHORING_GUIDANCE['2.7.3'].title}"`);
    expect(p).toContain('The section MUST cover:');
  });

  it('a code nothing registers gets no prompt', () => {
    expect(buildSectionGenerationPrompt('9.9')).toBeNull();
    expect(buildSectionGenerationPrompt('')).toBeNull();
  });

  it('project context is still interpolated', () => {
    const p = buildSectionGenerationPrompt('2.7.3', { productName: 'Testomab' })!;
    expect(p).not.toMatch(/\{\{PRODUCT_NAME\}\}/);
  });
});
