/**
 * What AnA is told while she drafts a CTD section is the whole overlay entry,
 * not only its `.guidance` line: buildSectionGenerationPrompt sends
 * authoringGuidance, keyContentElements, commonPitfalls and generationPrompt to
 * the model (server/services/ind/ctd/index.ts), and section-brief prints the
 * pitfalls. ana-ctd-section-truth reads `.guidance` only, so these fields could
 * contradict it and stay green (D2, 2026-10-04,
 * docs/evidence/D2-ANA-DOCUMENT-INTELLIGENCE/2026-10-04-depth/b1-guidance-facts-facts.md):
 *   - 2.7.3 / 2.7.4 prompts said the section "houses" the ISE / ISS, which FDA
 *     places in 5.3.5.3;
 *   - 2.7.4 tied death/SAE narratives to 2.7.6. M4E 2.7.4.2.2: narratives sit
 *     in the study reports (or 5.3.5.3) and their locations are referenced in
 *     2.7.4;
 *   - 2.7.6 told the writer to compile synopses in Module 2. The ICH eCTD
 *     specification: synopses are in the Module 5 CSRs and are hyperlinked,
 *     not repeated;
 *   - 1.9 said PREA never applies to an orphan-designated indication, which
 *     505B(k)(2) reverses for molecularly targeted adult-cancer drugs;
 *   - 1.14.4.1 filed the IB at 1.4.1 (the letter of authorization) and cited
 *     E6 "Section 7", which E6(R3) moved to Appendix A.
 */
import { describe, it, expect } from 'vitest';
import { CTD_AUTHORING_GUIDANCE, buildSectionGenerationPrompt } from '../../server/services/ind/ctd/index';
import type { CtdSection } from '../../server/services/ind/ctd/index';

const G = CTD_AUTHORING_GUIDANCE;

const TEXT_FIELDS = ['guidance', 'authoringGuidance', 'keyContentElements', 'commonPitfalls', 'generationPrompt'] as const;

/** Every prose string an entry carries, field by field. */
function fieldTexts(g: CtdSection): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [k, v] of Object.entries(g)) {
    if (typeof v === 'string') out.push([k, v]);
    else if (Array.isArray(v)) v.filter((x) => typeof x === 'string').forEach((x, i) => out.push([`${k}[${i}]`, x]));
  }
  return out;
}

/** All prose of an entry, joined. */
function allText(g: CtdSection): string {
  return fieldTexts(g)
    .map(([, t]) => t)
    .join('\n');
}

/** Sentences of an entry's prose (array items are sentences of their own). */
function sentences(g: CtdSection): string[] {
  return fieldTexts(g).flatMap(([, t]) => t.split(/(?<=[.;])\s+/));
}

function prompt(code: string): string {
  const p = buildSectionGenerationPrompt(code);
  expect(p, `no drafting prompt for ${code}`).toBeTruthy();
  return p!;
}

describe('2.7.3 / 2.7.4 prompts agree with their own guidance: the ISE / ISS are filed in 5.3.5.3', () => {
  it.each([
    ['2.7.3', '314.50(d)(5)(v)'],
    ['2.7.4', '314.50(d)(5)(vi)'],
  ])('%s drafting prompt does not say the section houses the integrated summary', (code, cfr) => {
    const p = prompt(code);
    expect(p).not.toMatch(/houses the Integrated Summary/i);
    expect(G[code].generationPrompt).toContain('5.3.5.3');
    expect(G[code].generationPrompt).toContain(cfr);
  });
});

describe('2.7.4 references where death / SAE narratives are; it does not send them to 2.7.6', () => {
  // ICH M4E(R2) 2.7.4.2.2: narrative locations "should be referenced here";
  // the narratives are part of the individual study reports, or 5.3.5.3 when
  // there is no such report.
  it('no field ties narratives to 2.7.6', () => {
    expect(allText(G['2.7.4'])).not.toMatch(/narratives[^.]*2\.7\.6/i);
  });

  it('names 2.7.4.2.2 and the study reports as the narratives’ home', () => {
    const t = allText(G['2.7.4']);
    expect(t).toContain('2.7.4.2.2');
    expect(t).toMatch(/study report|CSR/);
    expect(prompt('2.7.4')).toMatch(/narratives[^.]*(CSR|study report)/i);
  });
});

describe('2.7.6 lists the studies and hyperlinks their Module 5 synopses', () => {
  // ICH eCTD specification (FDA-hosted, fda.gov/media/71513): synopses "should
  // not, therefore, be repeated in Module 2"; hyperlinks from the listing suffice.
  it('states that synopses are not repeated in Module 2 in eCTD and are hyperlinked', () => {
    const t = allText(G['2.7.6']);
    expect(t).toMatch(/not(,? therefore,)? be repeated/i);
    expect(t).toMatch(/hyperlink/i);
    expect(prompt('2.7.6')).toMatch(/hyperlink/i);
  });

  it('keeps the EU nuance: copies are also accepted', () => {
    expect(allText(G['2.7.6'])).toMatch(/EU[^.]*(cop(y|ies))/);
  });

  it('no longer routes SAE/death narratives through 2.7.6', () => {
    expect(allText(G['2.7.6'])).not.toMatch(/SAE\/death narratives/i);
  });
});

describe('1.9 PREA: orphan designation does not exempt a molecularly targeted adult-cancer drug', () => {
  // FD&C Act 505B(k)(1)-(2); FDA, FDARA Implementation Guidance for Pediatric
  // Studies of Molecularly Targeted Oncology Drugs (fda.gov/media/133440).
  it('every sentence that says PREA does not apply to orphan indications also states the exception', () => {
    const absolute = sentences(G['1.9']).filter((s) => /PREA[^.]*does not apply[^.]*orphan/i.test(s));
    for (const s of absolute) expect(s, s).toMatch(/505B\(k\)\(2\)|molecularly targeted/);
  });

  it('names the 505B(k)(2) molecular-target exception, and the drafting prompt carries it', () => {
    expect(allText(G['1.9'])).toMatch(/505B\(k\)\(2\)/);
    expect(G['1.9'].generationPrompt).toMatch(/molecularly targeted/);
    expect(prompt('1.9')).toMatch(/molecularly targeted/);
  });

  it('requiredFor stays NDA/BLA: an iPSP is not owed by every IND', () => {
    expect(G['1.9'].requiredFor).toEqual(['NDA', 'BLA']);
  });
});

describe('1.14.4.1 is the Investigator’s Brochure, filed at 1.14.4.1, built to E6(R3) Appendix A', () => {
  const g = G['1.14.4.1'];

  it('no field places the IB at 1.4.1; 1.4.1 appears only named as the letter of authorization', () => {
    for (const field of TEXT_FIELDS) {
      const v = g[field];
      const items = Array.isArray(v) ? v : [v];
      for (const item of items) {
        for (const s of item.split(/(?<=[.;])\s+/)) {
          if (/(?<![\d.])1\.4\.1\b/.test(s)) expect(s, `${field}: ${s}`).toMatch(/letter of authori[sz]ation/i);
        }
      }
    }
  });

  it('cites E6(R3) Appendix A, and "Section 7" only as the E6(R2) location', () => {
    expect(g.authoringGuidance).toMatch(/E6\(R3\) Appendix A/);
    for (const field of TEXT_FIELDS) {
      const v = g[field];
      const t = Array.isArray(v) ? v.join('\n') : v;
      if (/section 7\b/i.test(t)) expect(t, field).toContain('E6(R2)');
    }
  });

  it('reference safety information carries the frequency and nature of expected serious adverse reactions', () => {
    expect(allText(g)).toMatch(/frequency and nature/);
  });

  it('the drafting prompt drafts the IB at 1.14.4.1, not a 1.4.1 reference stub', () => {
    const p = prompt('1.14.4.1');
    expect(p).toContain('1.14.4.1');
    expect(p).not.toContain('Prepare the 1.4.1');
    expect(g.wordCountRange).not.toEqual([300, 800]);
  });
});
