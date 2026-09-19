/**
 * eCTD DTD bundling + readiness (audit gap P0-1: self-containment).
 *
 * The regional packager's backbones reference DTDs by DOCTYPE
 * (e.g. `util/dtd/ich-ectd-3-2.dtd`), but a package is only DTD-validatable
 * when those files actually ship inside it. The DTD files are vendored agency
 * artifacts (see `assets/ectd-dtd/README.md` "Vendoring policy"): committed
 * once acquired, pinned by checksums, or supplied via `ECTD_DTD_DIR`.
 *
 * This module is the code half of that gap: it lists the vendored DTDs, knows
 * which DTDs each region's backbone references, and evaluates a readiness gate
 * so a production package can fail closed when required DTDs are missing —
 * the same opt-in pattern as the PDF/A gate. It NEVER throws on a missing
 * directory; absence is reported, not fatal, so dev/staging keep flowing.
 *
 * SELF-CONTAINMENT IS NOT CONFORMANCE — read `selfContained` for exactly what it
 * says. It answers "does the package ship the grammar its DOCTYPEs point at",
 * and NOTHING about whether the XML is written to that grammar. Eleven of the
 * twelve regional Module 1 backbones are not (see regional-backbone-readiness.ts:
 * only FDA is built to its agency's Module 1 heading table), so vendoring the
 * licensed DTDs turns "cannot be validated" into "fails validation" for those
 * eleven. It is worth saying here because this is where the two get conflated:
 * `dtdStatus.selfContained` is read as a fitness signal by the compile surface,
 * and the DTD procurement is described everywhere as the thing that unblocks
 * eCTD. It unblocks self-containment. Pinned by __tests__/dtd-bundler.test.ts
 * ("a fully vendored drop-point clears the DTD gate WITHOUT making a region
 * conformant").
 *
 * @module server/services/ectd/dtd-bundler
 */

import { promises as fs } from 'fs';
import * as path from 'path';

/** Every region the canonical packager can build a backbone for. Kept in sync
 *  with regional-packager.ts backboneByRegion so `region as DtdRegion` at the
 *  packager's readiness call site is an exact widening, not a lie. */
export type DtdRegion =
  | 'fda'
  | 'ema'
  | 'pmda'
  | 'ca'
  | 'uk'
  | 'ch'
  | 'au'
  | 'cn'
  | 'br'
  | 'in'
  | 'kr'
  | 'sg';

/** A vendored DTD read from the drop-point directory. */
export interface VendoredDtd {
  fileName: string;
  bytes: Buffer;
}

/** The ICH backbone DTD every region's index.xml references. */
export const ICH_BACKBONE_DTD = 'ich-ectd-3-2.dtd';

/** The ICH stylesheet index.xml references via <?xml-stylesheet?> (util/style/). */
export const ICH_BACKBONE_STYLESHEET = 'ectd-2-0.xsl';

/** Region → the regional stylesheet its Module 1 backbone references. Only the
 *  FDA backbone emits a stylesheet processing instruction today
 *  (`../../util/style/us-regional.xsl`); the other regional builders emit none,
 *  so requiring a stylesheet they never reference would over-block. Extend this
 *  map in the same change that adds a PI to another backbone. */
const REGIONAL_STYLESHEET: Partial<Record<DtdRegion, string>> = {
  fda: 'us-regional.xsl',
};

/** Region → the regional backbone DTD its m1 references (plus the ICH backbone).
 *  FDA is `us-regional-v3-3.dtd` — the current FDA eCTD Backbone Files
 *  Specification for Module 1 (DTD version 3.3) referenced by buildFdaBackbone.
 *
 *  MIRRORS regional-packager.ts backboneByRegion. The eight widened regions
 *  (uk/ch/au/cn/br/in/kr/sg) all build Module 1 via buildEmaBackbone, whose
 *  DOCTYPE is `eu-regional.dtd`, so they require THAT regional DTD to be
 *  self-contained — not merely the ICH backbone. Omitting it (as an
 *  ICH-backbone-only mapping did) makes assessDtdReadiness clear a production
 *  package that references a regional DTD it does not actually contain — the
 *  exact failure the P0-1 self-containment gate exists to prevent. */
const REGIONAL_DTD: Record<DtdRegion, string> = {
  fda: 'us-regional-v3-3.dtd',
  ema: 'eu-regional.dtd',
  pmda: 'jp-regional.dtd',
  ca: 'ca-regional.dtd',
  uk: 'eu-regional.dtd',
  ch: 'eu-regional.dtd',
  au: 'eu-regional.dtd',
  cn: 'eu-regional.dtd',
  br: 'eu-regional.dtd',
  in: 'eu-regional.dtd',
  kr: 'eu-regional.dtd',
  sg: 'eu-regional.dtd',
};

/** Resolve the DTD drop-point directory (ECTD_DTD_DIR or assets/ectd-dtd). */
export function resolveDtdDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ECTD_DTD_DIR || path.resolve(process.cwd(), 'assets/ectd-dtd');
}

/** The DTD filenames a region's package must contain to be self-contained.
 *  A region without a mapped regional DTD (e.g. an ICH-aligned region that reuses
 *  the EMA backbone) requires only the ICH backbone DTD — never returns an
 *  `undefined` entry (which previously crashed assessDtdReadiness). */
export function requiredDtdsForRegion(region: DtdRegion): string[] {
  const regional = REGIONAL_DTD[region];
  return regional ? [ICH_BACKBONE_DTD, regional] : [ICH_BACKBONE_DTD];
}

/** The stylesheet filenames a region's package must contain under util/style/
 *  for every <?xml-stylesheet?> its backbones emit to resolve. */
export function requiredStylesheetsForRegion(region: DtdRegion): string[] {
  const regional = REGIONAL_STYLESHEET[region];
  return regional ? [ICH_BACKBONE_STYLESHEET, regional] : [ICH_BACKBONE_STYLESHEET];
}

/**
 * List the vendored `*.dtd` files in the drop-point directory. Returns [] when
 * the directory is absent or empty — never throws (graceful by design).
 */
async function listVendored(dir: string, extension: string): Promise<VendoredDtd[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: VendoredDtd[] = [];
  for (const name of names.sort()) {
    if (!name.toLowerCase().endsWith(extension)) continue;
    try {
      out.push({ fileName: name, bytes: await fs.readFile(path.join(dir, name)) });
    } catch {
      // Unreadable entry — skip; treated as absent by the readiness check.
    }
  }
  return out;
}

export async function listVendoredDtds(dir: string = resolveDtdDir()): Promise<VendoredDtd[]> {
  return listVendored(dir, '.dtd');
}

/** List the vendored `*.xsl` stylesheets in the same drop-point. Same contract:
 *  [] when absent, never throws. */
export async function listVendoredStylesheets(dir: string = resolveDtdDir()): Promise<VendoredDtd[]> {
  return listVendored(dir, '.xsl');
}

export interface DtdReadinessInput {
  region: DtdRegion;
  /** Filenames actually present in the package's util/dtd/. */
  present: string[];
  /** Filenames actually present in the package's util/style/. Optional so
   *  existing callers keep compiling — but absent means NONE: a caller that
   *  forgets it cannot clear the gate by omission. */
  presentStylesheets?: string[];
  environment: 'staging' | 'production';
  /** Wire from `ECTD_REQUIRE_DTD`; false ⇒ report-only (never blocks). */
  requireDtd: boolean;
}

export interface DtdReadinessResult {
  required: string[];
  present: string[];
  missing: string[];
  /** Stylesheets the region's backbones reference (util/style/). */
  requiredStylesheets: string[];
  presentStylesheets: string[];
  missingStylesheets: string[];
  /** True when every required DTD AND stylesheet for the region is present. */
  selfContained: boolean;
  cleared: boolean;
  blockers: string[];
}

/**
 * Evaluate self-containment of a region's package: every DTD its DOCTYPEs
 * reference (util/dtd/) AND every stylesheet its <?xml-stylesheet?> PIs
 * reference (util/style/) must ship inside the package. Blocks only when
 * required AND production AND something is missing — the "do not ship a
 * production eCTD that references files it doesn't contain" rule. Staging and
 * `requireDtd:false` never block (they report for visibility). One flag,
 * ECTD_REQUIRE_DTD, governs both kinds of supportive file.
 */
export function assessDtdReadiness(input: DtdReadinessInput): DtdReadinessResult {
  const required = requiredDtdsForRegion(input.region);
  const presentSet = new Set(input.present.map((p) => p.toLowerCase()));
  const missing = required.filter((r) => !presentSet.has(r.toLowerCase()));

  const requiredStylesheets = requiredStylesheetsForRegion(input.region);
  const presentStylesheets = input.presentStylesheets ?? [];
  const presentStyleSet = new Set(presentStylesheets.map((p) => p.toLowerCase()));
  const missingStylesheets = requiredStylesheets.filter((r) => !presentStyleSet.has(r.toLowerCase()));

  const selfContained = missing.length === 0 && missingStylesheets.length === 0;
  const blockers: string[] = [];

  if (input.requireDtd && input.environment === 'production' && !selfContained) {
    const absent = [...missing, ...missingStylesheets];
    blockers.push(
      `${absent.length} required eCTD supportive file(s) missing from the package (${absent.join(', ')}). ` +
        `A production submission must be self-contained: its backbones reference util/dtd/*.dtd and ` +
        `util/style/*.xsl, so the package must ship them. Place the agency files in assets/ectd-dtd/ ` +
        `(or set ECTD_DTD_DIR), or clear ECTD_REQUIRE_DTD for non-submission builds. See assets/ectd-dtd/README.md.`
    );
  }

  return {
    required,
    present: input.present,
    missing,
    requiredStylesheets,
    presentStylesheets,
    missingStylesheets,
    selfContained,
    cleared: blockers.length === 0,
    blockers,
  };
}

/** Read the opt-in DTD enforcement flag from the environment. */
export function dtdRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.ECTD_REQUIRE_DTD ?? '').toLowerCase() === 'true';
}

export default {
  ICH_BACKBONE_DTD,
  ICH_BACKBONE_STYLESHEET,
  resolveDtdDir,
  requiredDtdsForRegion,
  requiredStylesheetsForRegion,
  listVendoredDtds,
  listVendoredStylesheets,
  assessDtdReadiness,
  dtdRequiredFromEnv,
};
