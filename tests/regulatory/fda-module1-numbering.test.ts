/**
 * FDA Module 1 numbering contract — every IND tree files where FDA files.
 *
 * ── Why this exists ───────────────────────────────────────────────────────────
 * The platform carries several US IND section trees, each read by a different
 * surface:
 *
 *   services/regulatory/ind-ectd-sections.ts         project bootstrap, readiness,
 *                                                     checklist, sequence validation,
 *                                                     Module 3 placement
 *   server/services/ind/ind-section-registry.ts      AnA authoring plans, citation
 *                                                     coverage, guidance scanner, chat
 *   server/services/ind/ctd/authoring-guidance.ts    AnA section drafting prompts
 *   c2c_rule_packs ind:fda (migrations)              the editor's filing outline
 *   global-ri/regional-module1-requirements.ts       Module 1 readiness aid
 *   templates/ectd/fda_template.xml                  the reference backbone
 *
 * The eCTD packager places every Module 1 leaf under the FDA heading element
 * derived from its section code (server/services/ectd/controlled-vocab/
 * fda-regional-sections.ts, built from the FDA-published context-of-use list in
 * cv-v4-data.ts). So a tree that numbers the Investigator's Brochure "1.7"
 * files it under Fast Track, "1.9 Environmental Assessment" lands under
 * Pediatric, and "1.15 Debarment" lands under Promotional Materials. The
 * package validates structurally and is wrong in the way an agency notices.
 *
 * This test holds every tree to the one FDA-published list. Structure: a
 * Module 1 code must be a published heading, an ancestor of one, or a
 * descendant of one. Placement: content whose title names a well-known
 * Module 1 document must sit under the heading FDA assigns it. Both rules are
 * derived from the same CoU descriptions the packager uses, so this test and
 * the packager cannot disagree.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { CV_CONTEXT_OF_USE } from '../../server/services/ectd/controlled-vocab/cv-v4-data';
import { getAllINDSections } from '../../services/regulatory/ind-ectd-sections';
import { IND_SECTIONS } from '../../server/services/ind/ind-section-registry';
import { CTD_AUTHORING_GUIDANCE } from '../../server/services/ind/ctd/authoring-guidance';
import { REGIONAL_MODULE1_REQUIREMENTS } from '../../server/services/global-ri/regional-module1-requirements';

const ROOT = path.resolve(__dirname, '../..');

/** The FDA-published US regional Module 1 headings, as plain section codes. */
const FDA_M1_CODES: string[] = CV_CONTEXT_OF_USE.codes
  .map((c) => c.code)
  .filter((c) => c.startsWith('us_1'))
  .map((c) => c.replace(/^us_/, ''));

function normalize(code: string): string {
  return String(code ?? '').trim().replace(/^m/i, '');
}

function isModule1(code: string): boolean {
  const c = normalize(code);
  return c === '1' || c.startsWith('1.');
}

/** A published heading, an ancestor of one, or a descendant of one. */
function isFdaModule1Placement(code: string): boolean {
  const c = normalize(code);
  if (c === '1') return true;
  if (FDA_M1_CODES.includes(c)) return true;
  if (FDA_M1_CODES.some((k) => k.startsWith(`${c}.`))) return true; // ancestor
  if (FDA_M1_CODES.some((k) => c.startsWith(`${k}.`))) return true; // descendant
  return false;
}

/**
 * Where FDA files well-known Module 1 content. Each rule: a title pattern and
 * the heading prefix the content must sit under (or `null` when the content is
 * not a Module 1 heading at all in eCTD).
 */
const PLACEMENT_RULES: Array<{ label: string; title: RegExp; under: string | null }> = [
  { label: 'cover letter', title: /\bcover letter/i, under: '1.2' },
  { label: 'FDA transmittal form', title: /\b(1571|1572|356h|3674|3397|2253)\b/i, under: '1.1' },
  { label: 'financial certification / disclosure (3454/3455)', title: /\b(3454|3455)\b|financial (certification|disclosure)/i, under: '1.3.4' },
  { label: 'debarment certification', title: /debarment/i, under: '1.3.3' },
  { label: 'patent information / certification', title: /\bpatent/i, under: '1.3.5' },
  { label: 'letter of authorization', title: /letter of authorization/i, under: '1.4.1' },
  { label: 'right of reference', title: /right of reference/i, under: '1.4.2' },
  { label: 'meeting materials', title: /\bmeeting\b|briefing (book|document|package)/i, under: '1.6' },
  { label: 'pediatric plan / PREA', title: /pediatric|paediatric|PREA/i, under: '1.9' },
  { label: 'environmental assessment / categorical exclusion', title: /environmental/i, under: '1.12.14' },
  { label: 'annual report / DSUR', title: /annual report|DSUR|development safety update/i, under: '1.13' },
  { label: "investigator's brochure", title: /investigator'?s?\s+brochure/i, under: '1.14.4.1' },
  { label: 'labeling', title: /labell?ing|package insert|prescribing information|medication guide|carton|container label/i, under: '1.14' },
  { label: 'promotional material', title: /promotional/i, under: '1.15' },
  { label: 'REMS / risk management', title: /\bREMS\b|risk management/i, under: '1.16' },
  { label: 'general investigational plan', title: /general investigational plan/i, under: '1.20' },
  // Not Module 1 headings in FDA eCTD: the XML backbone is the table of
  // contents, and previous human experience is clinical content (M2.5 / M5).
  { label: 'table of contents (the backbone is the TOC)', title: /table of contents/i, under: null },
  { label: 'previous human experience (Module 2.5 / 5.3.5)', title: /previous human experience/i, under: null },
];

interface TreeNode {
  code: string;
  title: string;
}

function violationsFor(nodes: TreeNode[]): string[] {
  const out: string[] = [];
  for (const n of nodes) {
    const code = normalize(n.code);
    if (!isModule1(code)) continue;
    if (!isFdaModule1Placement(code)) {
      out.push(`${n.code} "${n.title}" is not an FDA Module 1 heading (nor an ancestor/descendant of one)`);
    }
    for (const rule of PLACEMENT_RULES) {
      if (!rule.title.test(n.title)) continue;
      if (rule.under === null) {
        out.push(`${n.code} "${n.title}" — ${rule.label} is not filed as a Module 1 section in FDA eCTD`);
      } else if (code !== rule.under && !code.startsWith(`${rule.under}.`)) {
        out.push(`${n.code} "${n.title}" — ${rule.label} files under ${rule.under}`);
      }
    }
  }
  return out;
}

type SeededPack = { version: string; superseded: boolean; sections: TreeNode[]; file: string };

function toNodes(sections: Array<{ key: string; label: string }>): TreeNode[] {
  return sections.map((s) => ({ code: s.key, title: s.label }));
}

/** Every ind:fda pack one migration file seeds, in the three forms the repo uses. */
function packsSeededBy(sql: string, file: string): SeededPack[] {
  const found: SeededPack[] = [];
  // Form A — a dollar-quoted JSON array of packs fed to jsonb_to_recordset (20260528).
  for (const m of sql.matchAll(/\$rulepacks\$(\[[\s\S]*?\])\$rulepacks\$/g)) {
    try {
      const packs = JSON.parse(m[1]) as Array<{ doc_type: string; agency: string; version: string; required_sections: Array<{ key: string; label: string }> }>;
      for (const p of packs) {
        if (p.doc_type === 'ind' && p.agency === 'fda') found.push({ version: p.version, superseded: false, file, sections: toNodes(p.required_sections) });
      }
    } catch {
      /* not a rule-pack blob */
    }
  }
  // Form B — a literal tuple with a single-quoted JSON blob: ('ind', 'fda', '<v>', '<label>', '[…]'::jsonb, …).
  for (const m of sql.matchAll(/\(\s*'ind'\s*,\s*'fda'\s*,\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*'(\[[\s\S]*?\])'::jsonb/g)) {
    try {
      found.push({ version: m[1], superseded: false, file, sections: toNodes(JSON.parse(m[2].replace(/''/g, "'"))) });
    } catch {
      /* malformed blob — the DB contract test catches that */
    }
  }
  // Form C — a literal tuple with a dollar-quoted JSON blob: ('ind', 'fda', '<v>', '<label>', $tag$[…]$tag$::jsonb, …).
  for (const m of sql.matchAll(/\(\s*'ind'\s*,\s*'fda'\s*,\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*\$(\w+)\$(\[[\s\S]*?\])\$\2\$::jsonb/g)) {
    try {
      found.push({ version: m[1], superseded: false, file, sections: toNodes(JSON.parse(m[3])) });
    } catch {
      /* malformed blob — the DB contract test catches that */
    }
  }
  return found;
}

/** The ind:fda rule pack as seeded by the live migration set (latest version wins). */
function liveIndFdaRulePack(): { version: string; sections: TreeNode[] } {
  const dir = path.join(ROOT, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const found: SeededPack[] = [];
  const supersededVersions = new Set<string>();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    found.push(...packsSeededBy(sql, f));
    for (const m of sql.matchAll(/UPDATE c2c_rule_packs SET superseded_by = '[^']+'\s+WHERE doc_type = 'ind' AND agency = 'fda' AND version = '([^']+)'/g)) {
      supersededVersions.add(m[1]);
    }
  }
  const live = found.filter((p) => !supersededVersions.has(p.version));
  expect(live.length, `expected exactly one live ind:fda rule pack in migrations, found ${live.map((p) => `${p.version} (${p.file})`).join(', ') || 'none'}`).toBe(1);
  return { version: live[0].version, sections: live[0].sections };
}

/** Module 1 heading elements in the reference FDA backbone template. */
function fdaTemplateModule1(): TreeNode[] {
  const xml = fs.readFileSync(path.join(ROOT, 'templates/ectd/fda_template.xml'), 'utf8');
  const nodes: TreeNode[] = [];
  for (const m of xml.matchAll(/<m1(-[0-9]+)+\s+title="([^"]*)"/g)) {
    const code = m[0].match(/<m(1(?:-[0-9]+)+)/)![1].replace(/-/g, '.');
    nodes.push({ code, title: m[2] });
  }
  return nodes;
}

describe('FDA Module 1 numbering — one published heading list, every tree agrees', () => {
  it('the FDA context-of-use list carries the Module 1 headings this contract is derived from', () => {
    for (const c of ['1.1', '1.2', '1.3.3', '1.3.4', '1.4.1', '1.12.14', '1.13.15', '1.14.4.1', '1.20']) {
      expect(FDA_M1_CODES, `FDA CoU list is missing ${c}`).toContain(c);
    }
  });

  it('the deep IND eCTD map (project bootstrap / readiness / checklist) files Module 1 where FDA does', () => {
    const nodes = getAllINDSections().map((s) => ({ code: s.code, title: s.title }));
    expect(violationsFor(nodes)).toEqual([]);
  });

  it('the IND section registry (AnA plans, coverage, chat) files Module 1 where FDA does', () => {
    const nodes = IND_SECTIONS.map((s) => ({ code: s.code, title: s.title }));
    expect(violationsFor(nodes)).toEqual([]);
  });

  it('the CTD authoring guidance (AnA drafting prompts) files Module 1 where FDA does', () => {
    const nodes = Object.values(CTD_AUTHORING_GUIDANCE)
      .filter((g) => g.module === 1)
      .map((g) => ({ code: g.code, title: g.title }));
    expect(nodes.length).toBeGreaterThan(5);
    expect(violationsFor(nodes)).toEqual([]);
  });

  it('the live ind:fda rule pack (the editor outline) files Module 1 where FDA does', () => {
    const pack = liveIndFdaRulePack();
    const nodes = pack.sections.filter((s) => s.code !== 'M1');
    expect(violationsFor(nodes), `ind:fda ${pack.version}`).toEqual([]);
  });

  it('the live ind:fda rule pack carries the Module 1 content an initial IND must file', () => {
    const pack = liveIndFdaRulePack();
    const codes = new Set(pack.sections.map((s) => normalize(s.code)));
    // 21 CFR 312.23(a)(1)/(3)/(5)/(7)(iv)(e): forms, cover letter, general
    // investigational plan, investigator's brochure, environmental analysis.
    for (const required of ['1.1', '1.2', '1.20', '1.14.4.1', '1.12.14']) {
      const present = [...codes].some((c) => c === required || c.startsWith(`${required}.`));
      expect(present, `ind:fda ${pack.version} has no section at ${required}`).toBe(true);
    }
  });

  it('the global-RI FDA Module 1 requirements file where FDA does', () => {
    const nodes = REGIONAL_MODULE1_REQUIREMENTS.FDA.map((c) => ({ code: c.section, title: c.label }));
    expect(violationsFor(nodes)).toEqual([]);
  });

  it('the reference FDA backbone template files Module 1 where FDA does', () => {
    const nodes = fdaTemplateModule1();
    expect(nodes.length).toBeGreaterThan(3);
    expect(violationsFor(nodes)).toEqual([]);
  });

  it('the seeded IND tree can satisfy the eCTD compile gate for Module 1', () => {
    // ECTD_MODULE_DEFS is module-private to the compile route; read the list
    // from the source so the two cannot drift apart silently.
    const src = fs.readFileSync(path.join(ROOT, 'server/routes/ectd-compile.ts'), 'utf8');
    const m = src.match(/m1:\s*\{[\s\S]*?requiredSections:\s*\[([^\]]+)\]/);
    expect(m, 'compile route no longer declares Module 1 required sections').toBeTruthy();
    const required = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1]).filter((c) => c.startsWith('1'));
    expect(required.length).toBeGreaterThan(3);

    const seeded = new Set(getAllINDSections().map((s) => normalize(s.code)));
    const unsatisfiable = required.filter(
      (r) => ![...seeded].some((c) => c === r || c.startsWith(`${r}.`)),
    );
    expect(unsatisfiable, 'compile requires Module 1 sections the seeded IND tree never creates').toEqual([]);
  });
});
