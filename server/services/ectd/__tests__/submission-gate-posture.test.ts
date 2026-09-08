/**
 * THE RECORDED POSTURE OF EVERY SUBMISSION GATE.
 *
 * THE DEFECT THIS CLOSES. `ECTD_REQUIRE_DTD`, `ECTD_REQUIRE_RPS_SCHEMA` and
 * `ESTAR_REQUIRE_TEMPLATE` are unset in every environment, so all three gates
 * are report-only. That is the correct posture while the licensed artifacts are
 * absent — but it was an ACCIDENT, not a decision: no file said what the
 * intended production posture was, what each gate would block if switched on
 * today, or what has to become true before it is switched on. An unset variable
 * and a deliberately-off gate are indistinguishable from the outside, so nobody
 * could tell whether "report-only" was a plan or an oversight, and a default
 * could have flipped in either direction with nothing failing.
 *
 * This file is the record, and the enforcement of the record:
 *
 *   1. COMPLETENESS  — every `*_REQUIRE_*`-shaped flag NAMED in non-comment
 *      source under SCAN_ROOTS (the eCTD and eSTAR gate modules AND
 *      server/services/submission-gateways, where these gates are enforced)
 *      must appear in GATE_POSTURE. The scan matches the name in any read form
 *      — `env.X`, `env['X']`, a destructured `const { X } = env`, a name passed
 *      as a string — not only the literal `env.X` it used to require. Read the
 *      note above SCAN_ROOTS for exactly what that claim does and does not
 *      cover: it is scoped to those roots and to that naming shape.
 *   2. THE DEFAULT IS THE RECORDED ONE — each reader's value on an empty
 *      environment must equal `enforcedByDefault`. A default that changes
 *      silently, in EITHER direction, fails.
 *   3. THE SWITCH EXISTS — each reader honours `<VAR>=true`, so "report-only"
 *      is a posture rather than an unimplemented gate.
 *   4. THE PRECONDITION IS STILL UNMET — for the three ASSET-GATED gates, what
 *      the gate would do TODAY is computed from the repo's real drop-point
 *      directories and compared with the recorded expectation. When the
 *      licensed artifacts land, this fails ON PURPOSE: the precondition the
 *      posture rests on has changed and the posture must be re-decided rather
 *      than left where it was by inertia. The probe uses each MODULE'S OWN
 *      lister, so it answers the gate's question the gate's way.
 *   5. A MISPLACED ARTIFACT IS NOT AN ABSENT ONE — a licensed file dropped into
 *      a SUBDIRECTORY of a drop-point is invisible to the gate's (non-recursive)
 *      lister, so the precondition is genuinely still unmet; but that state must
 *      not be indistinguishable from "not acquired yet", so it fails its own
 *      check, naming the file.
 *
 * It does NOT switch a gate on. Every one of these is enforcement-off today,
 * and turning one on before its precondition is met would block real transmits.
 *
 * Human-readable half: docs/reports/ectd-gate-posture-2026-09-08.md.
 */
import { describe, it, expect } from 'vitest';
import { promises as fs } from 'fs';
import * as path from 'path';

import {
  dtdRequiredFromEnv,
  assessDtdReadiness,
  requiredDtdsForRegion,
  listVendoredDtds,
  listVendoredStylesheets,
} from '../dtd-bundler';
import { schemaRequiredFromEnv, assessSchemaReadiness, listVendoredSchemas } from '../schema-bundler';
import { pdfaRequiredFromEnv } from '../pdfa-readiness';
import { xrefRequiredFromEnv } from '../cross-reference-resolver';
import { regionalBackboneRequiredFromEnv } from '../regional-backbone-readiness';
import { evalidatorRequiredFromEnv } from '../external-validator';
import {
  estarTemplateRequiredFromEnv,
  assessEstarTemplateReadiness,
  listVendoredTemplates,
  ESTAR_TEMPLATE_MANIFEST,
} from '../../pathway-engines/estar/estar-template-registry';

const REPO = process.cwd();

/** A gate whose precondition is a licensed file that must be dropped into the repo. */
interface AssetGate {
  /** The drop-point whose contents decide whether the gate would block today. */
  dir: string;
  /**
   * THE GATE'S OWN DISCOVERY, not a reimplementation of it.
   *
   * This used to be a bare `fs.readdir` in the test. That is a second copy of
   * the rule for what counts as "vendored", and a second copy is a second thing
   * to drift: if the module ever changed how it finds its artifacts, the probe
   * would keep answering the old question while claiming to report what the
   * gate would do. Calling the module's exported lister makes the probe wrong
   * only when the gate is wrong.
   */
  list: (dir: string) => Promise<string[]>;
  /**
   * The file extensions that ARE the licensed artifact for this gate. Used by
   * the misplacement check below — a `.dtd` sitting one level down is not a met
   * precondition (the lister is not recursive, and neither is the gate), but it
   * is also not "not acquired yet", and it must not read as one.
   */
  artifactExtensions: string[];
  /** True when switching the gate on TODAY would block a production build. */
  blocksProductionToday: boolean;
  /** Computed from the real directory: what the gate would do if switched on now. */
  probe: (filesPresent: string[]) => { wouldBlock: boolean; detail: string };
}

interface GatePosture {
  envVar: string;
  /** The module that owns the flag. */
  module: string;
  read: (env: NodeJS.ProcessEnv) => boolean;
  /** The intended production posture TODAY. All are report-only; see `flipWhen`. */
  enforcedByDefault: false;
  /** What the gate refuses when it is on. */
  gates: string;
  /** What must become true before this is switched on in production. */
  flipWhen: string;
  /** Present only for gates whose precondition is a checked-in licensed artifact. */
  asset?: AssetGate;
}

/**
 * THE RECORD. Every entry states the posture and the precondition; an entry
 * with an empty `flipWhen` is the thing this file exists to prevent, so that is
 * asserted too.
 */
const GATE_POSTURE: GatePosture[] = [
  {
    envVar: 'ECTD_REQUIRE_DTD',
    module: 'server/services/ectd/dtd-bundler.ts',
    read: dtdRequiredFromEnv,
    enforcedByDefault: false,
    gates: 'a production eCTD package that references util/dtd/*.dtd or util/style/*.xsl files it does not contain',
    flipWhen:
      'the licensed ICH + regional DTDs and stylesheets are vendored into assets/ectd-dtd/ (or ECTD_DTD_DIR) for every region in use. ' +
      'NOTE: vendoring them makes packages self-contained and DTD-VALIDATABLE — it does not make eleven of the twelve regional Module 1 ' +
      'backbones DTD-VALID. See docs/reports/ectd-region-conformance-2026-09-08.md.',
    asset: {
      dir: path.join(REPO, 'assets/ectd-dtd'),
      list: async (dir) => [
        ...(await listVendoredDtds(dir)).map((d) => d.fileName),
        ...(await listVendoredStylesheets(dir)).map((d) => d.fileName),
      ],
      artifactExtensions: ['.dtd', '.xsl'],
      blocksProductionToday: true,
      probe: (present) => {
        // FDA is the region with the most complete build; if even FDA cannot be
        // made self-contained, no region can.
        const r = assessDtdReadiness({
          region: 'fda',
          present: present.filter((f) => f.toLowerCase().endsWith('.dtd')),
          presentStylesheets: present.filter((f) => f.toLowerCase().endsWith('.xsl')),
          environment: 'production',
          requireDtd: true,
        });
        return {
          wouldBlock: r.blockers.length > 0,
          detail: `fda requires ${requiredDtdsForRegion('fda').join(' + ')} (+ stylesheets); missing ${[...r.missing, ...r.missingStylesheets].join(', ') || 'nothing'}`,
        };
      },
    },
  },
  {
    envVar: 'ECTD_REQUIRE_RPS_SCHEMA',
    module: 'server/services/ectd/schema-bundler.ts',
    read: schemaRequiredFromEnv,
    enforcedByDefault: false,
    gates: 'a production eCTD v4.0 package that is not schema-validatable (v3.2.2 requires no XSD, so the gate is a no-op there)',
    flipWhen: 'the licensed ICH RPS message schema (rps-message.xsd) is vendored into assets/ectd-schema/ (or ECTD_SCHEMA_DIR).',
    asset: {
      dir: path.join(REPO, 'assets/ectd-schema'),
      list: async (dir) => (await listVendoredSchemas(dir)).map((d) => d.fileName),
      artifactExtensions: ['.xsd'],
      blocksProductionToday: true,
      probe: (present) => {
        const r = assessSchemaReadiness({
          version: 'v4.0',
          present: present.filter((f) => f.toLowerCase().endsWith('.xsd')),
          environment: 'production',
          requireSchema: true,
        });
        return { wouldBlock: r.blockers.length > 0, detail: `v4.0 missing ${r.missing.join(', ') || 'nothing'}` };
      },
    },
  },
  {
    envVar: 'ESTAR_REQUIRE_TEMPLATE',
    module: 'server/services/pathway-engines/estar/estar-template-registry.ts',
    read: estarTemplateRequiredFromEnv,
    enforcedByDefault: false,
    gates: 'a production device build whose official FDA eSTAR/PreSTAR template is not vendored',
    flipWhen:
      'every template in ESTAR_TEMPLATE_MANIFEST is vendored into assets/estar-templates/ (or ESTAR_TEMPLATE_DIR). ' +
      'PARTIAL TODAY: the two 510(k) eSTAR templates are present; the three PreSTAR templates are not.',
    asset: {
      dir: path.join(REPO, 'assets/estar-templates'),
      list: async (dir) => (await listVendoredTemplates(dir)).map((d) => d.fileName),
      artifactExtensions: ['.pdf'],
      blocksProductionToday: true,
      probe: (present) => {
        const blocked = ESTAR_TEMPLATE_MANIFEST.filter(
          (d) =>
            assessEstarTemplateReadiness({
              type: d.type,
              variant: d.variant,
              present: present.filter((f) => f.toLowerCase().endsWith('.pdf')),
              environment: 'production',
              requireTemplate: true,
            }).blockers.length > 0,
        );
        return {
          wouldBlock: blocked.length > 0,
          detail: blocked.length ? `would block ${blocked.map((d) => d.id).join(', ')}` : 'every manifest pathway clears',
        };
      },
    },
  },
  {
    envVar: 'ECTD_REQUIRE_PDFA',
    module: 'server/services/ectd/pdfa-readiness.ts',
    read: pdfaRequiredFromEnv,
    enforcedByDefault: false,
    gates: 'a production package whose PDF leaves are not PDF/A',
    flipWhen:
      'Ghostscript + veraPDF are present in the deploy image so conversion and verification can actually run. ' +
      'Not asset-gated: the precondition is a runtime binary, not a checked-in file, so it cannot be probed from the repo.',
  },
  {
    envVar: 'ECTD_REQUIRE_XREF',
    module: 'server/services/ectd/cross-reference-resolver.ts',
    read: xrefRequiredFromEnv,
    enforcedByDefault: false,
    gates: 'a production package with dangling or withdrawn-target cross-references',
    flipWhen:
      'declared cross-references are authored on the paths that build production packages, so an unresolved link means a real defect ' +
      'rather than an unused feature. Not asset-gated: the precondition is package content.',
  },
  {
    envVar: 'ECTD_REQUIRE_EVALIDATOR',
    module: 'server/services/ectd/external-validator/config.ts',
    read: evalidatorRequiredFromEnv,
    enforcedByDefault: false,
    gates: 'a production transmit with no agency-grade external validation report',
    flipWhen:
      'a licensed agency-grade validator is configured (<PROVIDER>_VALIDATOR_URL) and reachable from the deploy environment. ' +
      'Not asset-gated: the precondition is a configured service, not a checked-in file.',
  },
  {
    envVar: 'ECTD_REQUIRE_REGIONAL_BACKBONE',
    module: 'server/services/ectd/regional-backbone-readiness.ts',
    read: regionalBackboneRequiredFromEnv,
    enforcedByDefault: false,
    gates: 'a production transmit whose regional Module 1 backbone is not built to the agency structure (eleven of twelve regions today)',
    flipWhen:
      'the EMA / PMDA / Health Canada builders file Module 1 under the agency heading tables, and the eight widened regions get their own ' +
      'backbone instead of reusing the EMA one. This is ENGINEERING, not procurement: vendoring the DTDs does not close it — it only makes ' +
      'the non-conformance detectable. See docs/reports/ectd-region-conformance-2026-09-08.md.',
  },
];

/* ─── The completeness scan ────────────────────────────────────────────────
 *
 * WHAT IT CLAIMS, EXACTLY: every identifier of the shape `<PREFIX>_REQUIRE_<REST>`
 * — the naming every submission gate flag uses — that appears in NON-COMMENT
 * source under SCAN_ROOTS has a recorded posture. It is a claim about those
 * roots and that naming shape, and about names rather than data flow; it does
 * not claim to find a gate flag read outside the roots or named some other way.
 *
 * WHAT IT USED TO CLAIM, AND WHY THAT WAS TOO NARROW. The scan matched only the
 * literal `env.<NAME>`, so `process.env['ECTD_REQUIRE_X']`, a destructured
 * `const { ECTD_REQUIRE_X } = env`, and a name passed as a string all evaded
 * it; and it walked only the two modules that DEFINE the readers, leaving
 * pre-transmit-check.ts — where three of these gates actually turn into
 * production blockers — outside the scan entirely. Both are fixed: the match is
 * on the name wherever it appears in code, and submission-gateways is a root.
 *
 * FALSE POSITIVES ARE SAFE HERE, FALSE NEGATIVES ARE THE DEFECT. Matching a
 * name that is mentioned but not read forces someone to record a posture for
 * it, which is the outcome this file wants. Missing a real gate is what let the
 * accident happen in the first place. `REQUIRED`-containing constants
 * (BLA_REQUIRED_SECTIONS, MISSING_REQUIRED_SECTION) are excluded by requiring
 * the underscore on BOTH sides of REQUIRE, which every env gate has and no such
 * constant does.
 */
const SCAN_ROOTS = [
  'server/services/ectd',
  'server/services/pathway-engines/estar',
  // The ENFORCEMENT site: where dtd / pdfa / regional-backbone gates become blockers.
  'server/services/submission-gateways',
];

/** Source with comments removed, so a name mentioned only in prose does not count. */
function stripComments(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')      // block comments
    .replace(/(^|[^:])\/\/.*$/gm, '$1');      // line comments, but not the // in a URL
}

/** The gate-flag-shaped names in one source file's CODE. */
function gateFlagsIn(src: string): Set<string> {
  const out = new Set<string>();
  for (const m of stripComments(src).matchAll(/\b([A-Z][A-Z0-9]*(?:_[A-Z0-9]+)*_REQUIRE_[A-Z0-9_]+)\b/g)) out.add(m[1]);
  return out;
}

/** name → the repo-relative files that name it, plus how many files were read. */
async function scanGateFlags(): Promise<{ found: Map<string, string[]>; filesScanned: number }> {
  const found = new Map<string, string[]>();
  let filesScanned = 0;
  const walk = async (dir: string): Promise<void> => {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) { await walk(p); continue; }
      if (!entry.name.endsWith('.ts')) continue;
      filesScanned += 1;
      const rel = path.relative(REPO, p);
      for (const name of gateFlagsIn(await fs.readFile(p, 'utf8'))) {
        found.set(name, [...(found.get(name) ?? []), rel]);
      }
    }
  };
  for (const r of SCAN_ROOTS) await walk(path.join(REPO, r));
  return { found, filesScanned };
}

/**
 * Every file under a drop-point, repo-relative, INCLUDING subdirectories.
 *
 * Used only by the misplacement check — never to decide whether a precondition
 * is met. Making the probe recursive when the gate is not would be the fail-open
 * move: it would report "the licensed artifacts have landed" for files the gate
 * cannot see and would still block on.
 */
async function listDeep(dir: string, base = dir): Promise<string[]> {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await listDeep(p, base)));
    else out.push(path.relative(base, p));
  }
  return out;
}

describe('submission gate posture — recorded, not accidental', () => {
  it('every gate flag named in the gate modules OR at the enforcement site has a recorded posture', async () => {
    const { found, filesScanned } = await scanGateFlags();
    expect(filesScanned, 'the completeness scan walked no files — it would pass vacuously').toBeGreaterThan(20);
    // The scan must actually reach the ENFORCEMENT site, not just the modules
    // that define the readers. pre-transmit-check.ts is where three of these
    // gates turn into blockers, and it was outside the old scan roots.
    expect([...found.get('ECTD_REQUIRE_DTD') ?? []], 'the scan does not reach the pre-transmit enforcement site')
      .toContain('server/services/submission-gateways/pre-transmit-check.ts');

    const recorded = new Set(GATE_POSTURE.map((g) => g.envVar));
    const unrecorded = [...found.keys()].filter((v) => !recorded.has(v)).sort();
    expect(unrecorded, 'a gate flag appears in code with no recorded production posture — add it to GATE_POSTURE').toEqual([]);
    // And the record must not describe gates that no longer exist. This is also
    // what catches an over-aggressive comment strip: a reader the scan stopped
    // seeing shows up here as stale rather than silently shrinking coverage.
    const stale = [...recorded].filter((v) => !found.has(v)).sort();
    expect(stale, 'GATE_POSTURE records a gate flag nothing names any more').toEqual([]);
  });

  it('the completeness scan catches the read forms that evade `env.<NAME>` — proven on synthetic sources', () => {
    // The old scan matched only the literal `env.<NAME>`. These four forms are
    // all real reads of a gate flag and all invisible to it. Asserted on
    // strings rather than by planting a file, so the check is deterministic.
    const evasive = [
      "const on = process.env['ECTD_REQUIRE_SMUGGLED'] === 'true';",
      'const { ECTD_REQUIRE_SMUGGLED } = process.env;',
      "const on = readFlag(env, 'ECTD_REQUIRE_SMUGGLED');",
      'const on = env?.ECTD_REQUIRE_SMUGGLED === "true";',
    ];
    for (const src of evasive) {
      expect(/\benv\.([A-Z0-9_]*REQUIRE[A-Z0-9_]*)\b/.test(src), `the OLD scan should miss: ${src}`).toBe(false);
      expect([...gateFlagsIn(src)], `the widened scan misses: ${src}`).toEqual(['ECTD_REQUIRE_SMUGGLED']);
    }
    // …and a mention that is ONLY prose still does not count, so a comment
    // cannot conjure a phantom gate the record then has to carry.
    expect([...gateFlagsIn('// ECTD_REQUIRE_SMUGGLED would gate X\nconst a = 1;')]).toEqual([]);
    expect([...gateFlagsIn('/* ECTD_REQUIRE_SMUGGLED is not read here */\nconst a = 1;')]).toEqual([]);
    // A URL is not a line comment — the strip must not eat the code after it.
    expect([...gateFlagsIn('const u = "https://x/y"; const on = env.ECTD_REQUIRE_SMUGGLED;')]).toEqual(['ECTD_REQUIRE_SMUGGLED']);
    // Names that merely contain REQUIRED are constants, not env gates.
    expect([...gateFlagsIn('const BLA_REQUIRED_SECTIONS = []; const M = MISSING_REQUIRED_SECTION;')]).toEqual([]);
  });

  it('each entry states what it gates and what would have to be true to switch it on', () => {
    for (const g of GATE_POSTURE) {
      expect(g.gates.length, `${g.envVar}: no statement of what it gates`).toBeGreaterThan(20);
      expect(g.flipWhen.length, `${g.envVar}: no recorded precondition for switching it on`).toBeGreaterThan(20);
    }
  });

  it('the DEFAULT in code is the recorded default — report-only for every gate, deliberately', () => {
    for (const g of GATE_POSTURE) {
      expect(g.read({} as NodeJS.ProcessEnv), `${g.envVar}: unset no longer means ${g.enforcedByDefault}`).toBe(g.enforcedByDefault);
      expect(g.read({ [g.envVar]: '' } as NodeJS.ProcessEnv), `${g.envVar}: empty string is not the default`).toBe(g.enforcedByDefault);
    }
    // Stated once, positively: nothing is enforced by default today.
    expect(GATE_POSTURE.filter((g) => g.read({} as NodeJS.ProcessEnv)).map((g) => g.envVar)).toEqual([]);
  });

  it('every gate HAS a switch — report-only is a posture, not a missing feature', () => {
    for (const g of GATE_POSTURE) {
      expect(g.read({ [g.envVar]: 'true' } as NodeJS.ProcessEnv), `${g.envVar}=true does not enable it`).toBe(true);
      expect(g.read({ [g.envVar]: 'TRUE' } as NodeJS.ProcessEnv), `${g.envVar} is case-sensitive`).toBe(true);
      expect(g.read({ [g.envVar]: 'false' } as NodeJS.ProcessEnv)).toBe(false);
    }
  });

  it('the asset-gated preconditions are still unmet — switching these on today would block production', async () => {
    for (const g of GATE_POSTURE) {
      if (!g.asset) continue;
      // The GATE's own discovery, so "what the gate would do" is computed the
      // way the gate computes it — not by a second readdir in this file.
      const present = await g.asset.list(g.asset.dir);
      const { wouldBlock, detail } = g.asset.probe(present);
      // When this fails because wouldBlock became FALSE, the licensed artifacts
      // have landed: the recorded precondition is met and the posture must be
      // re-decided (switch the gate on) rather than left off by inertia.
      expect(
        wouldBlock,
        `${g.envVar}: recorded as blocking-today=${g.asset.blocksProductionToday}, observed ${wouldBlock} in ${path.relative(REPO, g.asset.dir)} — ${detail}. ` +
          `Re-decide the posture and update GATE_POSTURE + the posture report.`,
      ).toBe(g.asset.blocksProductionToday);
    }
  });

  it('no licensed artifact is sitting in a SUBDIRECTORY of a drop-point where the gate cannot see it', async () => {
    /* THE SILENT-MISS THIS CLOSES, AND THE ONE IT REFUSES TO CREATE.
     *
     * `assets/ectd-dtd/` already contains a `fixtures/` subdirectory, so a
     * vendored DTD could plausibly be dropped one level down. The gate's lister
     * is NOT recursive (dtd-bundler.ts listVendored → a single fs.readdir), so
     * a DTD in `fixtures/` is genuinely NOT a met precondition — the gate would
     * still block, and the test above staying green is honest, not a miss.
     *
     * What WOULD be dishonest is leaving that state indistinguishable from "the
     * licensed files have not been acquired yet". So a misplaced artifact fails
     * HERE, loudly, naming the file — while the precondition probe above keeps
     * answering the gate's question with the gate's own discovery. Making that
     * probe recursive instead would invert the error: it would report the
     * precondition MET for files the gate cannot load.
     */
    for (const g of GATE_POSTURE) {
      if (!g.asset) continue;
      // listDeep() returns [] for a directory that is not there, which would
      // make this check pass vacuously if a drop-point were renamed or moved.
      // The drop-point must exist (README + checksums.txt live in each one).
      const all = await listDeep(g.asset.dir);
      expect(all.length, `${g.envVar}: drop-point ${path.relative(REPO, g.asset.dir)} is missing or empty — the misplacement check would pass vacuously`).toBeGreaterThan(0);
      const misplaced = all.filter(
        (rel) => rel.includes(path.sep) && g.asset!.artifactExtensions.some((x) => rel.toLowerCase().endsWith(x)),
      );
      expect(
        misplaced,
        `${g.envVar}: ${misplaced.join(', ')} is inside ${path.relative(REPO, g.asset.dir)} but not at its top level. ` +
          `The gate's lister is not recursive, so this file is invisible to it — move it to the drop-point root ` +
          `(and add its checksum) or it will never satisfy the precondition.`,
      ).toEqual([]);
    }
  });

  it('eSTAR is PARTIALLY unblocked: the 510(k) templates are vendored, the PreSTAR ones are not', async () => {
    // The posture is not uniform across pathways, and recording it as "blocks
    // everything" would be as wrong as recording it as "blocks nothing": a
    // 510(k) build would clear the gate today, a Q-Sub would not.
    const present = (await listVendoredTemplates(path.join(REPO, 'assets/estar-templates'))).map((t) => t.fileName);
    const verdict = (type: '510k' | 'q_sub', variant: 'device' | 'prestar') =>
      assessEstarTemplateReadiness({ type, variant, present, environment: 'production', requireTemplate: true });
    expect(verdict('510k', 'device').available).toBe(true);
    expect(verdict('510k', 'device').blockers).toEqual([]);
    expect(verdict('q_sub', 'prestar').available).toBe(false);
    expect(verdict('q_sub', 'prestar').blockers).toHaveLength(1);
  });
});
