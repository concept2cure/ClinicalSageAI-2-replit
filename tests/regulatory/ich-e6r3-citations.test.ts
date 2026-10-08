/**
 * The platform cites ICH E6(R3), by a section that exists, wherever it
 * teaches GCP (2026-10-08, D2; founder-directed: "enhance her acumen …
 * protocols, SOPs, IND documentation, BLA").
 *
 * Measured at 6bd6b368 before the change: 91 non-test source files cited
 * ICH E6(R2), superseded on 2025-01-06 (currency fact ich-e6r3-gcp-step4),
 * about 290 times, most with R2 section numbers (4.8, 5.18.4, 6.x, 7, 8.x);
 * and the R3 citations that did exist named sections R3 does not have
 * ("E6(R3) §8", "§5.5.3", "§6.9") or the wrong principle.
 *
 * The rule held here:
 *   - "E6(R2)" (or "E6(R2/R3)") appears only where the text says it is superseded or
 *     historical (a qualifier within the sentence), never as the guideline
 *     in force;
 *   - every "E6(R3)" citation that names a section names one in
 *     shared/regulatory/ich-e6r3.ts.
 * Files another lane held when this ran are listed in HANDED_ON with the
 * count they carried; the count may only fall.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
  E6R3_ANNEX1,
  E6R3_PRINCIPLES,
  isE6R3Section,
  r3ForR2,
  citeE6R3,
  e6r3Ref,
} from '../../shared/regulatory/ich-e6r3';
import { basisProblems, basisLabel } from '../../shared/regulatory/regulatory-basis';

const ROOT = path.resolve(__dirname, '../..');
const RECORD = 'shared/regulatory/ich-e6r3.ts';
const SCAN = ['server', 'shared', 'client/src'];

/** Held by another lane on 2026-10-08; handed on at release. Count may only fall. */
const HANDED_ON: Record<string, number> = {
  'server/services/ai-gateway/gateway.ts': 1,
  'server/services/ana/AnaToolDefinitions.ts': 2,
  'server/services/ana/AnaToolExecutor.ts': 2,
  'server/services/ana/evidence-literature-tool-defs.ts': 2,
};

function sources(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      if (name === 'node_modules' || name === '__tests__' || name.startsWith('.')) continue;
      const p = path.join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.tsx?$/.test(name)) out.push(p);
    }
  };
  SCAN.forEach((d) => walk(path.join(ROOT, d)));
  return out;
}

const FILES = sources().map((p) => ({ rel: path.relative(ROOT, p).split(path.sep).join('/'), text: readFileSync(p, 'utf8') }));
const QUALIFIER = /supersed|introduced in E6\(R2\)|replaced by|formerly|historical|legacy|before 2025|prior (to|version)|was E6\(R2\)|→ ?(ICH )?E6\(R3\)|E6\(R1\)|R2 project|(R2|R2\)) mapping|(R2|R2\)) to (R3|E6\(R3\))|R2→R3|R2 -> R3/i;

function unqualifiedR2(text: string): string[] {
  const hits: string[] = [];
  for (const m of text.matchAll(/E6 ?\(R2(?:\)|\/)|E6R2\b/g)) {
    const window = text.slice(Math.max(0, m.index! - 160), m.index! + 160);
    if (!QUALIFIER.test(window)) hits.push(text.slice(Math.max(0, m.index! - 50), m.index! + 60).replace(/\s+/g, ' '));
  }
  return hits;
}

describe('the record', () => {
  it('has the 11 principles and Annex 1 §1–§4 with the appendices', () => {
    expect(Object.keys(E6R3_PRINCIPLES)).toHaveLength(11);
    for (const s of ['1', '2', '3', '4', '2.8', '3.10', '3.11.4', '3.16', '4.3']) expect(E6R3_ANNEX1).toHaveProperty(s);
    expect(isE6R3Section('Appendix C')).toBe(true);
    expect(isE6R3Section('Annex 1 §8')).toBe(false);
  });

  it('maps R2 sections to where R3 put them, by the most specific prefix', () => {
    expect(e6r3Ref(r3ForR2('4.8.10')![0])).toBe('ICH E6(R3) Annex 1 §2.8 (Informed Consent of Trial Participants)');
    expect(e6r3Ref(r3ForR2('5.18.4')![0])).toMatch(/§3\.11\.4 \(Monitoring\)/);
    expect(e6r3Ref(r3ForR2('8.2')![0])).toMatch(/Appendix C/);
    expect(e6r3Ref(r3ForR2('7')![0])).toMatch(/Appendix A/);
    expect(r3ForR2('5.3.5'), 'no such R2 section; never guessed').toBeUndefined();
  });

  it('every citation is a well-formed recall basis, labelled as unread', () => {
    const b = citeE6R3({ kind: 'annex1', section: '2.8' });
    expect(basisProblems(b)).toEqual([]);
    expect(b.confidence).toBe('recall');
    expect(basisLabel(b)).toMatch(/recall/);
  });
});

describe('the gate catches what it exists to catch', () => {
  it('an R2 citation in force, in either form, is a hit; a qualified one is not', () => {
    expect(unqualifiedR2('Grounded in ICH E6(R2) §5.0 (quality management).')).toHaveLength(1);
    expect(unqualifiedR2('Compliance frameworks: ICH E6(R2/R3) GCP.')).toHaveLength(1);
    expect(unqualifiedR2('ICH (2016) E6(R2), superseded by E6(R3), 2025-01-06.')).toHaveLength(0);
  });
});

describe('what the platform serves', () => {
  it('never cites E6(R2) as the guideline in force', () => {
    const offenders: string[] = [];
    for (const f of FILES) {
      if (f.rel === RECORD) continue; // the crosswalk: R2 sections are its subject
      const hits = unqualifiedR2(f.text);
      const allowed = HANDED_ON[f.rel] ?? 0;
      if (hits.length > allowed) offenders.push(`${f.rel} (${hits.length}${allowed ? `, handed on at ${allowed}` : ''}): ${hits[0]}`);
    }
    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('every E6(R3) citation that names a section names one that exists', () => {
    const bad: string[] = [];
    const re = /E6\(R3\),? (?:Annex 1,? )?(Principle \d+|Annex 1 ?§ ?\d+(?:\.\d+)*|§ ?\d+(?:\.\d+)*|Section \d+(?:\.\d+)*|Appendix [A-Z])/g;
    for (const f of FILES) {
      if (HANDED_ON[f.rel]) continue;
      for (const m of f.text.matchAll(re)) {
        const prefixAnnex = /Annex 1/.test(m[0]);
        const tok = m[1].replace(/^Annex 1 ?§ ?/, 'Annex 1 §').replace(/^(?:§ ?|Section )/, prefixAnnex ? 'Annex 1 §' : 'Annex 1 §');
        if (!isE6R3Section(tok)) bad.push(`${f.rel}: "${m[0]}"`);
      }
    }
    expect(bad, bad.join('\n')).toEqual([]);
  });
});
