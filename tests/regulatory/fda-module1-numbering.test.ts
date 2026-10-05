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
 * Module 1 document must sit under the heading FDA assigns it. Identity: a
 * node at a heading whose meaning FDA fixes (1.19 Pre-EUA and EUA, 1.14.5
 * Foreign labeling) must carry that meaning. All three are derived from the
 * same CoU descriptions the packager uses, so this test and the packager
 * cannot disagree.
 *
 * The rules themselves (FDA_M1_CODES, PLACEMENT_RULES, HEADING_IDENTITY_RULES,
 * violationsFor) live in tests/regulatory/ctd-contract.ts since 2026-10-05
 * (g-ctd-contract-and-consistency), so every registry consistency test holds
 * its tree to the same copy; their amendments are pinned in
 * ctd-registry-consistency.test.ts.
 *
 * Since 2026-10-05 (D2, g-fda-jnda-rule-pack-m1-v2-2) every live FDA CTD rule
 * pack — ind, nda, bla and anda — is held to the list, not only ind:fda. The
 * NDA/BLA packs had required '1.19 Environmental analysis' (FDA 1.19 is
 * Pre-EUA and EUA; the environmental analysis is 1.12.14), and the ANDA pack
 * filed patent certification under 1.15, FDA's Promotional material heading.
 */
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

import { FDA_M1_CODES, normalize, violationsFor, type TreeNode } from './ctd-contract';
import { getAllINDSections } from '../../services/regulatory/ind-ectd-sections';
import { IND_SECTIONS } from '../../server/services/ind/ind-section-registry';
import { CTD_AUTHORING_GUIDANCE } from '../../server/services/ind/ctd/authoring-guidance';
import { REGIONAL_MODULE1_REQUIREMENTS } from '../../server/services/global-ri/regional-module1-requirements';
import { getRequiredArtifacts } from '../../server/services/regulatory/requiredArtifactMatrix';
import { getModule1Structure, type CtdSectionDef } from '../../server/services/regulatory/ctd-module-structure';
import { FDA_TEMPLATE, type CTDSection } from '../../server/services/regional-ctd-templates';
import { FALLBACK_REQUIRED_MODULES, requiredSectionsFromPack } from '../../server/services/ectd/required-sections';
import { getWorkflow } from '../../server/services/ana-ri/workflow-orchestration';

const ROOT = path.resolve(__dirname, '../..');

/** A rule-pack section: always keyed. */
type PackNode = TreeNode & { code: string };

type SeededPack = { version: string; superseded: boolean; sections: PackNode[]; file: string };

function toNodes(sections: Array<{ key: string; label: string; parent_key?: string | null; mandatory?: boolean }>): PackNode[] {
  return sections.map((s) => ({ code: s.key, title: s.label, parentKey: s.parent_key ?? null, mandatory: !!s.mandatory }));
}

/** The FDA CTD filing types whose live rule pack is held to the FDA heading list. */
type FdaCtdDocType = 'ind' | 'nda' | 'bla' | 'anda';

/** Every <docType>:fda pack one migration file seeds, in the three forms the repo uses. */
function packsSeededBy(sql: string, file: string, docType: FdaCtdDocType): SeededPack[] {
  const found: SeededPack[] = [];
  // Form A — a dollar-quoted JSON array of packs fed to jsonb_to_recordset (20260528).
  for (const m of sql.matchAll(/\$rulepacks\$(\[[\s\S]*?\])\$rulepacks\$/g)) {
    try {
      const packs = JSON.parse(m[1]) as Array<{ doc_type: string; agency: string; version: string; required_sections: Array<{ key: string; label: string }> }>;
      for (const p of packs) {
        if (p.doc_type === docType && p.agency === 'fda') found.push({ version: p.version, superseded: false, file, sections: toNodes(p.required_sections) });
      }
    } catch {
      /* not a rule-pack blob */
    }
  }
  // Form B — a literal tuple with a single-quoted JSON blob: ('<dt>', 'fda', '<v>', '<label>', '[…]'::jsonb, …).
  const formB = new RegExp(String.raw`\(\s*'${docType}'\s*,\s*'fda'\s*,\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*'(\[[\s\S]*?\])'::jsonb`, 'g');
  for (const m of sql.matchAll(formB)) {
    try {
      found.push({ version: m[1], superseded: false, file, sections: toNodes(JSON.parse(m[2].replace(/''/g, "'"))) });
    } catch {
      /* malformed blob — the DB contract test catches that */
    }
  }
  // Form C — a literal tuple with a dollar-quoted JSON blob: ('<dt>', 'fda', '<v>', '<label>', $tag$[…]$tag$::jsonb, …).
  const formC = new RegExp(String.raw`\(\s*'${docType}'\s*,\s*'fda'\s*,\s*'([^']+)'\s*,\s*'[^']*'\s*,\s*\$(\w+)\$(\[[\s\S]*?\])\$\2\$::jsonb`, 'g');
  for (const m of sql.matchAll(formC)) {
    try {
      found.push({ version: m[1], superseded: false, file, sections: toNodes(JSON.parse(m[3])) });
    } catch {
      /* malformed blob — the DB contract test catches that */
    }
  }
  return found;
}

/** The <docType>:fda rule pack as seeded by the live migration set (the one version nothing supersedes). */
function liveFdaPack(docType: FdaCtdDocType): { version: string; sections: PackNode[] } {
  const dir = path.join(ROOT, 'migrations');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const found: SeededPack[] = [];
  const supersededVersions = new Set<string>();
  for (const f of files) {
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    found.push(...packsSeededBy(sql, f, docType));
    const supersede = new RegExp(String.raw`UPDATE c2c_rule_packs SET superseded_by = '[^']+'\s+WHERE doc_type = '${docType}' AND agency = 'fda' AND version = '([^']+)'`, 'g');
    for (const m of sql.matchAll(supersede)) {
      supersededVersions.add(m[1]);
    }
  }
  const live = found.filter((p) => !supersededVersions.has(p.version));
  expect(live.length, `expected exactly one live ${docType}:fda rule pack in migrations, found ${live.map((p) => `${p.version} (${p.file})`).join(', ') || 'none'}`).toBe(1);
  return { version: live[0].version, sections: live[0].sections };
}

/** The Module 1 codes the compile/validate/readiness gates require of a pack. */
function requiredM1(pack: { sections: PackNode[] }): string[] {
  return requiredSectionsFromPack(
    pack.sections.map((n) => ({ key: n.code, parent_key: n.parentKey ?? null, mandatory: n.mandatory })),
  ).find((m) => m.code === 'm1')!.requiredSections;
}

/** Flatten the M1/M2 authoring-surface structure (code/title/children). */
function flattenCtdDefs(defs: CtdSectionDef[]): TreeNode[] {
  return defs.flatMap((d) => [{ code: d.code, title: d.title }, ...flattenCtdDefs(d.children ?? [])]);
}

/** Flatten a regional template's Module 1 (number/title/childSections). */
function flattenTemplateSections(sections: CTDSection[]): TreeNode[] {
  return sections.flatMap((s) => [{ code: s.number, title: s.title }, ...flattenTemplateSections(s.childSections ?? [])]);
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

  it.each(['ind', 'nda', 'bla', 'anda'] as const)(
    'the live %s:fda rule pack (the editor outline and the gates\' required set) files Module 1 where FDA does',
    (docType) => {
      const pack = liveFdaPack(docType);
      const nodes = pack.sections.filter((s) => s.code !== 'M1');
      expect(violationsFor(nodes), `${docType}:fda ${pack.version}`).toEqual([]);
    },
  );

  // What the compile, validate and readiness gates demand of a marketing
  // application is the leaf-most mandatory set of the live pack
  // (server/services/ectd/required-sections.ts). Before 2026-10-05 an NDA that
  // filed its environmental assessment at 1.12.14 read "missing 1.19", and a
  // carton label at 1.14.1.1 read "missing 1.14.4".
  it.each(['nda', 'bla'] as const)('what the gates require of a %s is the FDA Module 1 an application files', (docType) => {
    const pack = liveFdaPack(docType);
    const m1 = requiredM1(pack);
    for (const code of ['1.1', '1.2', '1.3.3', '1.3.4', '1.12.14', '1.14.1.1', '1.14.1.3']) {
      expect(m1, `${docType}:fda ${pack.version} does not require ${code}`).toContain(code);
    }
    for (const code of ['1.19', '1.14.4', '1.14.5', '1.3.1']) {
      expect(m1, `${docType}:fda ${pack.version} requires ${code}`).not.toContain(code);
    }
    expect(violationsFor(m1.map((code) => ({ code, title: code })))).toEqual([]);
  });

  it('what the gates require of an ANDA is patent and exclusivity at 1.3.5.x, never under Promotional material (1.15)', () => {
    const pack = liveFdaPack('anda');
    const m1 = requiredM1(pack);
    expect(m1, `anda:fda ${pack.version}`).toEqual(expect.arrayContaining(['1.3.5.1', '1.3.5.2', '1.3.5.3', '1.12.14']));
    expect(m1.filter((c) => c === '1.15' || c.startsWith('1.15.')), `anda:fda ${pack.version}`).toEqual([]);
    expect(violationsFor(m1.map((code) => ({ code, title: code })))).toEqual([]);
  });

  it('the placement and identity rules catch the misfilings they exist for, and stay ancestor-permissive', () => {
    // The rules are shown failing on the case each one exists to catch.
    expect(violationsFor([{ code: '1.19', title: 'Environmental analysis' }]).join('\n')).toMatch(/1\.12\.14[\s\S]*1\.19 is Pre-EUA and EUA/);
    expect(violationsFor([{ code: '1.14.5', title: 'Structured product labeling (SPL)' }]).join('\n')).toMatch(/files under 1\.14\.1 or 1\.14\.2[\s\S]*Foreign labeling/);
    expect(violationsFor([{ code: '1.14.4', title: 'Label and container labeling' }])).toHaveLength(1);
    // Caught twice since 2026-10-05: field copy files under 1.3.2, and FDA 1.3.5 is patent and exclusivity.
    expect(violationsFor([{ code: '1.3.5', title: 'Field copy certification' }]).join('\n')).toMatch(/files under 1\.3\.2[\s\S]*1\.3\.5 is patent and exclusivity/);
    expect(violationsFor([{ code: '1.15.2', title: 'Patent certification (Paragraph I / II / III / IV)' }])).toHaveLength(1);
    // …and accept what a correct or coarser tree files.
    expect(violationsFor([
      { code: '1.14.1.1', title: 'Draft carton and container labels' },
      { code: '1.14.1.3', title: 'Draft labeling text (USPI in PLR format; SPL)' },
      { code: 'm1.14', title: 'Container/carton labels' },
      { code: '1.14.1', title: 'Draft labeling (prescribing information, carton and container)' },
      { code: '1.3.2', title: 'Field copy certification' },
      { code: '1.19', title: 'Pre-EUA and EUA' },
      { code: '1.14.5', title: 'Foreign labeling' },
    ])).toEqual([]);
  });

  it('the live ind:fda rule pack carries the Module 1 content an initial IND must file', () => {
    const pack = liveFdaPack('ind');
    const codes = new Set(pack.sections.map((s) => normalize(s.code)));
    // 21 CFR 312.23(a)(1)/(3)/(5)/(7)(iv)(e): forms, cover letter, general
    // investigational plan, investigator's brochure, environmental analysis.
    for (const required of ['1.1', '1.2', '1.20', '1.14.4.1', '1.12.14']) {
      const present = [...codes].some((c) => c === required || c.startsWith(`${required}.`));
      expect(present, `ind:fda ${pack.version} has no section at ${required}`).toBe(true);
    }
  });

  // The submission workflows AnA is given every turn a submission type is
  // known (ana-ri/context-enrichment.ts → buildWorkflowContext). Added
  // 2026-10-04 (D2): the IND workflow filed the pre-IND meeting request under
  // 1.1, Form 1572 under 1.3.1 and the IB under 1.14, and paired the cover
  // letter with Form 1571 under one code.
  it('the submission workflows AnA is guided by file Module 1 where FDA does', () => {
    for (const type of ['ind', 'nda', 'bla']) {
      const wf = getWorkflow(type)!;
      const nodes = wf.phases
        .flatMap((p) => p.steps)
        .filter((s) => s.ctdSection)
        .map((s) => ({ code: s.ctdSection as string, title: s.title }));
      expect(violationsFor(nodes), `${type} workflow`).toEqual([]);
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

  it('the required-artifact matrix (IND / NDA / BLA project bootstrap) files Module 1 where FDA does', () => {
    for (const registry of ['US_IND', 'US_IND_AMENDMENT', 'US_NDA', 'US_BLA']) {
      const nodes = getRequiredArtifacts(registry).flatMap((a) =>
        a.sectionCodes.map((code) => ({ code, title: a.label })),
      );
      expect(nodes.length, `${registry} declares no artifacts`).toBeGreaterThan(1);
      expect(violationsFor(nodes), registry).toEqual([]);
    }
  });

  it('the Module 1 authoring-surface structure (M1/M2 build state) files Module 1 where FDA does', () => {
    const nodes = flattenCtdDefs(getModule1Structure('FDA'));
    expect(nodes.length).toBeGreaterThan(10);
    expect(violationsFor(nodes)).toEqual([]);
  });

  it('the FDA regional template (dispatch-readiness required sections) files Module 1 where FDA does', () => {
    const nodes = flattenTemplateSections(FDA_TEMPLATE.module1Sections);
    expect(nodes.length).toBeGreaterThan(10);
    expect(violationsFor(nodes)).toEqual([]);
  });

  it('the FDA regional template requires of an IND only what an IND files, and of an NDA only what an NDA files', () => {
    const all = flattenTemplateSections(FDA_TEMPLATE.module1Sections);
    const requiredFor = (app: string): string[] => {
      const out: string[] = [];
      const walk = (sections: CTDSection[]) => {
        for (const s of sections) {
          if (s.required && (!s.requiredFor || s.requiredFor.includes(app))) out.push(normalize(s.number));
          walk(s.childSections ?? []);
        }
      };
      walk(FDA_TEMPLATE.module1Sections);
      return out;
    };
    expect(all.length).toBeGreaterThan(10);
    const ind = requiredFor('ind');
    const nda = requiredFor('nda');
    // An IND files its plan and brochure; it does not file debarment, financial disclosure or draft labeling.
    expect(ind).toEqual(expect.arrayContaining(['1.20', '1.14.4.1', '1.12.14']));
    expect(ind).not.toContain('1.3.3');
    expect(ind).not.toContain('1.3.4');
    expect(ind).not.toContain('1.14.1');
    // A marketing application is the reverse.
    expect(nda).toEqual(expect.arrayContaining(['1.3.3', '1.3.4', '1.14.1']));
    expect(nda).not.toContain('1.20');
    expect(nda).not.toContain('1.14.4.1');
  });

  it('the compile gate baseline (unknown program type) files Module 1 where FDA does', () => {
    const nodes = FALLBACK_REQUIRED_MODULES.flatMap((m) => m.requiredSections.map((code) => ({ code, title: `${m.name} ${code}` })));
    expect(nodes.length).toBeGreaterThan(5);
    expect(violationsFor(nodes)).toEqual([]);
  });

  it('what the compile gate requires of an IND (the live rule pack) is what the seeded IND tree creates', () => {
    // The compile/validate/readiness gates derive their required set from the
    // live ind:fda pack (services/ectd/required-sections); the project
    // bootstrap seeds the deep IND map. The two must agree, or an
    // outline-complete IND can never read complete.
    const pack = liveFdaPack('ind');
    const required = requiredSectionsFromPack(
      pack.sections.map((n) => ({ key: n.code, parent_key: n.parentKey ?? null, mandatory: n.mandatory })),
    ).flatMap((m) => m.requiredSections);
    expect(required.length).toBeGreaterThan(20);
    expect(violationsFor(required.map((code) => ({ code, title: code })))).toEqual([]);

    const seeded = new Set(getAllINDSections().map((s) => normalize(s.code)));
    const unsatisfiable = required.filter(
      (r) => ![...seeded].some((c) => c === r || c.startsWith(`${r}.`) || r.startsWith(`${c}.`)),
    );
    expect(unsatisfiable, `ind:fda ${pack.version} requires sections the seeded IND tree never creates`).toEqual([]);
  });
});
