/**
 * Every shared regulatory basis constant has one home (D2, 2026-10-05, step
 * g-basis-constants-one-home; docs/design/ANA_REGULATORY_RECORD.md §2 items 12
 * and 15, §9, R1b).
 *
 * Before this step the same regulator source was declared twice inside
 * server/services/ind/ctd — ICH M4E(R2) at fda.gov/media/93569 in both
 * submission-chain.ts and fda-technical-rules.ts, and FDA's ISS/ISE placement
 * page in both, under two different names and two different `ref` wordings —
 * so a correction to one copy would leave the other stating the old one. And
 * FDA_E3, which every CSR heading's "ICH E3" citation points at, carried
 * fda.gov/media/84857: FDA's copy of the E3 Questions and Answers (R1), not
 * ICH E3 itself (fda.gov/media/71271).
 *
 * This pins:
 *   - server/services/ind/ctd/regulatory-basis.ts declares each shared basis
 *     constant, plus recall() and practice(), and every one is well formed;
 *   - across ind/ctd, a regulator URL appears in a basis under exactly one
 *     top-level declaration (the gate that fails on the two pairs at HEAD);
 *   - FDA_E3 is ICH E3, and nothing binds the Q&A URL as if it were E3;
 *   - csr-e3-basis.ts keeps only CDISC_CONVENTION and e3SectionBasis;
 *   - no file in ind/ctd keeps a local recall/practice helper;
 *   - the chain, the technical rules and the E3 overlay hold the very objects
 *     regulatory-basis.ts exports, not copies.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { basisProblems, type RegulatoryBasis } from '../../../../../shared/regulatory/regulatory-basis';

const CTD_DIR = path.resolve(__dirname, '..');
const sourceFiles = readdirSync(CTD_DIR)
  .filter((f) => f.endsWith('.ts') && !f.endsWith('.d.ts'))
  .sort();
const read = (f: string) => readFileSync(path.join(CTD_DIR, f), 'utf8');

const FDA_E3_URL = 'https://www.fda.gov/media/71271/download';
const FDA_E3_QA_URL = 'https://www.fda.gov/media/84857/download';

const SHARED_CONSTANTS = [
  'FDA_E3',
  'E3_QA_R1',
  'FDA_PDF_SPECS',
  'FDA_STUDY_DATA_TRC',
  'FDA_SDTCG',
  'CFR_314_50_F',
  'FDA_STF_IG',
  'FDA_OCMQ',
  'M4E_R2',
  'FDA_ISS_ISE_PLACEMENT',
  'FDA_ISE_GUIDANCE',
  'FDA_ECTD_TCG',
  'CFR_314_101',
] as const;

/** Names the duplicated copies went by before this step; none may be declared again. */
const RETIRED_NAMES = ['FDA_ISS_ISE', 'RECALL', 'PRACTICE'];

type Binding = { file: string; name: string; url: string };

/** The top-level declaration name enclosing `node`. */
function topLevelName(node: ts.Node): string | null {
  let n: ts.Node | undefined = node;
  while (n && n.parent && !ts.isSourceFile(n.parent)) n = n.parent;
  if (!n) return null;
  if (ts.isVariableStatement(n)) {
    const d = n.declarationList.declarations[0];
    return d && ts.isIdentifier(d.name) ? d.name.text : null;
  }
  if (ts.isFunctionDeclaration(n) && n.name) return n.name.text;
  return null;
}

/** Top-level `const X = '<string>'` in a file, so `url: X` resolves. */
function stringConsts(sf: ts.SourceFile): Map<string, string> {
  const out = new Map<string, string>();
  for (const st of sf.statements) {
    if (!ts.isVariableStatement(st)) continue;
    for (const d of st.declarationList.declarations) {
      if (ts.isIdentifier(d.name) && d.initializer && ts.isStringLiteralLike(d.initializer)) out.set(d.name.text, d.initializer.text);
    }
  }
  return out;
}

/** Every basis-shaped object literal (has `confidence` and `url`) and the declaration it sits under. */
function basisUrlBindings(): Binding[] {
  const out: Binding[] = [];
  for (const file of sourceFiles) {
    const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
    const consts = stringConsts(sf);
    const visit = (node: ts.Node) => {
      if (ts.isObjectLiteralExpression(node)) {
        const props = new Map<string, ts.Expression>();
        for (const p of node.properties) {
          if (ts.isPropertyAssignment(p) && (ts.isIdentifier(p.name) || ts.isStringLiteral(p.name))) props.set(p.name.text, p.initializer);
        }
        const urlExpr = props.get('url');
        if (props.has('confidence') && urlExpr) {
          const url = ts.isStringLiteralLike(urlExpr)
            ? urlExpr.text
            : ts.isIdentifier(urlExpr)
              ? consts.get(urlExpr.text)
              : undefined;
          const name = topLevelName(node);
          if (url && name) out.push({ file, name, url });
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(sf);
  }
  return out;
}

/** Names declared at top level in a file. */
function declaredNames(file: string): string[] {
  const sf = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true);
  const names: string[] = [];
  for (const st of sf.statements) {
    if (ts.isVariableStatement(st)) {
      for (const d of st.declarationList.declarations) if (ts.isIdentifier(d.name)) names.push(d.name.text);
    } else if (ts.isFunctionDeclaration(st) && st.name) names.push(st.name.text);
  }
  return names;
}

async function loadHome(): Promise<Record<string, unknown> | null> {
  try {
    return (await import('../regulatory-basis')) as Record<string, unknown>;
  } catch {
    return null;
  }
}

describe('one regulator source, one declaration, across ind/ctd', () => {
  it('no regulator URL is bound to two top-level declarations', () => {
    const byUrl = new Map<string, Set<string>>();
    for (const b of basisUrlBindings()) {
      const set = byUrl.get(b.url) ?? new Set<string>();
      set.add(`${b.file}:${b.name}`);
      byUrl.set(b.url, set);
    }
    const duplicated = [...byUrl].filter(([, s]) => s.size > 1).map(([url, s]) => `${url} <- ${[...s].sort().join(', ')}`);
    expect(duplicated).toEqual([]);
  });

  it('each shared constant is declared only in regulatory-basis.ts, and the retired duplicate names nowhere', () => {
    const misplaced: string[] = [];
    for (const file of sourceFiles) {
      for (const name of declaredNames(file)) {
        const shared = (SHARED_CONSTANTS as readonly string[]).includes(name) || name === 'cfr201_57';
        if (shared && file !== 'regulatory-basis.ts') misplaced.push(`${file}:${name}`);
        if (RETIRED_NAMES.includes(name)) misplaced.push(`${file}:${name}`);
      }
    }
    expect(misplaced).toEqual([]);
  });

  it('no file in ind/ctd keeps a local recall()/practice() helper', () => {
    const local = sourceFiles
      .filter((f) => f !== 'regulatory-basis.ts')
      .flatMap((f) => declaredNames(f).filter((n) => /^(recall|practice)$/i.test(n)).map((n) => `${f}:${n}`));
    expect(local).toEqual([]);
  });

  it('csr-e3-basis.ts keeps only the E3-specific CDISC_CONVENTION and e3SectionBasis', () => {
    expect(declaredNames('csr-e3-basis.ts').sort()).toEqual(['CDISC_CONVENTION', 'e3SectionBasis']);
  });
});

describe('server/services/ind/ctd/regulatory-basis.ts', () => {
  it('exports every shared basis constant, well formed under the shared rules', async () => {
    const home = await loadHome();
    expect(home, 'regulatory-basis.ts does not exist').not.toBeNull();
    for (const name of SHARED_CONSTANTS) {
      const b = home?.[name] as RegulatoryBasis | undefined;
      expect(b, name).toBeDefined();
      expect(b?.confidence, name).toBe('regulator-text');
      expect(basisProblems(b as RegulatoryBasis), name).toEqual([]);
    }
  });

  it('cfr201_57, recall and practice build well-formed bases of the stated confidence', async () => {
    const home = await loadHome();
    const cfr201_57 = home?.cfr201_57 as ((p: string) => RegulatoryBasis) | undefined;
    const recall = home?.recall as ((r: string) => RegulatoryBasis) | undefined;
    const practice = home?.practice as ((r: string) => RegulatoryBasis) | undefined;
    expect(typeof cfr201_57).toBe('function');
    expect(typeof recall).toBe('function');
    expect(typeof practice).toBe('function');
    const c = cfr201_57!('(d)(6)');
    expect(c.ref).toBe('21 CFR 201.57(d)(6)');
    expect(basisProblems(c)).toEqual([]);
    expect(recall!('ICH E9 / E9(R1)')).toEqual({ ref: 'ICH E9 / E9(R1)', confidence: 'recall' });
    expect(practice!('Integrated-analysis practice')).toEqual({ ref: 'Integrated-analysis practice', confidence: 'platform-convention' });
  });

  it('FDA_E3 is ICH E3 itself, not FDA’s E3 Q&A (R1)', async () => {
    const home = await loadHome();
    const e3 = home?.FDA_E3 as RegulatoryBasis | undefined;
    expect(e3?.url).toBe(FDA_E3_URL);
    expect(e3?.ref).toMatch(/ICH E3/);
    expect(e3?.ref).not.toMatch(/Q&A|Questions and Answers/);
  });

  it('nothing in ind/ctd binds the E3 Q&A URL to a basis that is not the Q&A', () => {
    const wrong = basisUrlBindings().filter((b) => b.url === FDA_E3_QA_URL && b.name !== 'E3_QA_R1');
    expect(wrong).toEqual([]);
  });
});

describe('readers hold the one object, not a copy', () => {
  it('the submission chain, the technical rules and the E3 overlay cite the exported constants', async () => {
    const home = await loadHome();
    expect(home).not.toBeNull();
    const { SUBMISSION_CHAIN } = await import('../submission-chain');
    const { FDA_TECHNICAL_RULES } = await import('../fda-technical-rules');
    const { E3_APPENDIX_SECTIONS } = await import('../csr-e3-sections-appendices');

    const node = (id: string) => SUBMISSION_CHAIN.find((n) => n.id === id)!;
    expect(node('csr').basis).toContain(home!.FDA_E3);
    expect(node('iss').basis).toContain(home!.FDA_ISS_ISE_PLACEMENT);
    expect(node('ise').basis).toContain(home!.FDA_ISE_GUIDANCE);
    expect(node('m2_5').basis).toContain(home!.M4E_R2);

    const rulesBases = FDA_TECHNICAL_RULES.map((r) => r.basis);
    expect(rulesBases).toContain(home!.M4E_R2);
    expect(rulesBases).toContain(home!.FDA_ISS_ISE_PLACEMENT);
    expect(rulesBases).toContain(home!.FDA_ECTD_TCG);
    expect(rulesBases).toContain(home!.CFR_314_101);

    const s1612 = E3_APPENDIX_SECTIONS.find((s) => s.number === '16.1.12');
    expect(s1612?.basis).toContain(home!.FDA_E3);
  });
});
