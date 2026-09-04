/**
 * Official FDA eSTAR template registry + readiness gate (Device eSTAR Slice 1, B1).
 *
 * CDRH ingests the *official FDA eSTAR interactive PDF*, not a ZIP of rendered
 * section PDFs. To produce a real 510(k)/De Novo submission the platform must
 * fill that official template — which means the template file has to be present.
 * The official eSTAR PDFs are distributed by FDA and vendored verbatim under
 * `assets/estar-templates/`, pinned by its checksums.txt (see the README there);
 * `ESTAR_TEMPLATE_DIR` can point at another directory that holds them.
 *
 * This module is the code half of that gap, mirroring `ectd/dtd-bundler.ts`:
 * it knows which official template each pathway needs, lists the vendored
 * templates, and evaluates a fail-closed readiness gate so a production eSTAR
 * build refuses to claim "official eSTAR produced" when the template is missing.
 * It NEVER throws on a missing directory — absence is reported, not fatal, so
 * dev/staging keep flowing (same opt-in pattern as the DTD and PDF/A gates).
 *
 * @module server/services/pathway-engines/estar/estar-template-registry
 */

import { promises as fs } from 'fs';
import * as path from 'path';

import {
  currentVersionFor,
  type EstarProgramSubmissionType,
  type EstarTemplateFamily,
} from './estar-versions';

/**
 * The submission types a template can carry. Superset of the 510(k)/De Novo
 * mapper's `EstarType`: adds PMA (nIVD/IVD eSTAR) and the PreSTAR request types
 * (Q-Sub, IDE, 513(g)) so the registry covers the whole eSTAR program.
 */
export type EstarTemplateType = EstarProgramSubmissionType;

/**
 * Which FDA template a submission is filed on. `device`/`ivd` select the nIVD vs
 * IVD eSTAR; `prestar` is the cross-cutting Early Submission Requests template
 * (PreSTAR2), which serves both nIVD and IVD for Q-Sub/IDE/513(g).
 */
export type EstarTemplateVariant = 'device' | 'ivd' | 'prestar';

/** A vendored official eSTAR template read from the drop-point directory. */
export interface VendoredEstarTemplate {
  fileName: string;
  bytes: Buffer;
}

/**
 * Logical template descriptor. `expectedFileName` is the version-pinned name a
 * maintainer is expected to drop in; a new FDA eSTAR release is a manifest +
 * asset change, not a code change. `version` tracks the FDA template revision
 * so a bump forces a re-validation.
 */
export interface EstarTemplateDescriptor {
  id: string;
  type: EstarTemplateType;
  variant: EstarTemplateVariant;
  /** FDA template family (nIVD/IVD/PreSTAR) — links to the version registry. */
  family: EstarTemplateFamily;
  expectedFileName: string;
  /**
   * The vendored template revision this descriptor is pinned to. Stays `'unset'`
   * until a maintainer drops the licensed FDA PDF in and pins it; the *program*
   * version (e.g. nIVD 7.0) is looked up from the version registry via `family`.
   */
  version: string;
}

/**
 * The official-template manifest — every FDA eSTAR template the platform fills.
 * Keep filenames/versions in sync with the files in `assets/estar-templates/`
 * (pinned in its checksums.txt) and the README. Do NOT regenerate FDA's form.
 *
 * FDA distributes the marketing pathways as ONE nIVD eSTAR PDF and ONE IVD eSTAR
 * PDF (v7.0), each carrying 510(k), De Novo AND PMA — the pathway is chosen inside
 * the form (`root.ApplicationType.USA.ATRadioButton110`), not by downloading a
 * different file (see the family table in assets/estar-templates/README.md). So
 * the six marketing descriptors resolve to two physical files: the three nIVD
 * descriptors (510k/de_novo/pma × device) share `eSTAR-510k-non-ivd.pdf` and the
 * three IVD descriptors share `eSTAR-510k-ivd.pdf`. The descriptor ids stay
 * distinct because each pathway carries its OWN field map (the 510(k) Summary
 * page and predicate fields are 510(k)-only). The PreSTAR2 (v3.0) descriptors
 * stay `'unset'`: that template is not vendored.
 */
export const ESTAR_TEMPLATE_MANIFEST: EstarTemplateDescriptor[] = [
  // nIVD / IVD eSTAR — marketing pathways
  { id: '510k-device', type: '510k', variant: 'device', family: 'nivd', expectedFileName: 'eSTAR-510k-non-ivd.pdf', version: '7.0' },
  { id: '510k-ivd', type: '510k', variant: 'ivd', family: 'ivd', expectedFileName: 'eSTAR-510k-ivd.pdf', version: '7.0' },
  // De Novo and PMA are filed on the SAME vendored nIVD/IVD PDFs as 510(k) (FDA ships one file per family).
  { id: 'de_novo-device', type: 'de_novo', variant: 'device', family: 'nivd', expectedFileName: 'eSTAR-510k-non-ivd.pdf', version: '7.0' },
  { id: 'de_novo-ivd', type: 'de_novo', variant: 'ivd', family: 'ivd', expectedFileName: 'eSTAR-510k-ivd.pdf', version: '7.0' },
  { id: 'pma-device', type: 'pma', variant: 'device', family: 'nivd', expectedFileName: 'eSTAR-510k-non-ivd.pdf', version: '7.0' },
  { id: 'pma-ivd', type: 'pma', variant: 'ivd', family: 'ivd', expectedFileName: 'eSTAR-510k-ivd.pdf', version: '7.0' },
  // PreSTAR2 — Early Submission Requests (serves both nIVD and IVD). Not vendored; stays 'unset'.
  { id: 'q_sub-prestar', type: 'q_sub', variant: 'prestar', family: 'prestar', expectedFileName: 'PreSTAR-q-sub.pdf', version: 'unset' },
  { id: 'ide-prestar', type: 'ide', variant: 'prestar', family: 'prestar', expectedFileName: 'PreSTAR-ide.pdf', version: 'unset' },
  { id: '513g-prestar', type: '513g', variant: 'prestar', family: 'prestar', expectedFileName: 'PreSTAR-513g.pdf', version: 'unset' },
];

/** Resolve the template drop-point directory (ESTAR_TEMPLATE_DIR or assets/estar-templates). */
export function resolveEstarTemplateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ESTAR_TEMPLATE_DIR || path.resolve(process.cwd(), 'assets/estar-templates');
}

/** The manifest descriptor for a given pathway + variant, or undefined if none. */
export function descriptorFor(type: EstarTemplateType, variant: EstarTemplateVariant): EstarTemplateDescriptor | undefined {
  return ESTAR_TEMPLATE_MANIFEST.find((d) => d.type === type && d.variant === variant);
}

/** All descriptors for a template family (nIVD/IVD/PreSTAR). */
export function descriptorsForFamily(family: EstarTemplateFamily): EstarTemplateDescriptor[] {
  return ESTAR_TEMPLATE_MANIFEST.filter((d) => d.family === family);
}

/**
 * List the vendored `*.pdf` templates in the drop-point directory. Returns []
 * when the directory is absent or empty — never throws (graceful by design).
 */
export async function listVendoredTemplates(
  dir: string = resolveEstarTemplateDir(),
): Promise<VendoredEstarTemplate[]> {
  let names: string[];
  try {
    names = await fs.readdir(dir);
  } catch {
    return [];
  }
  const out: VendoredEstarTemplate[] = [];
  for (const name of names.sort()) {
    if (!name.toLowerCase().endsWith('.pdf')) continue;
    try {
      out.push({ fileName: name, bytes: await fs.readFile(path.join(dir, name)) });
    } catch {
      // Unreadable entry — skip; treated as absent by the readiness check.
    }
  }
  return out;
}

export interface EstarTemplateReadinessInput {
  type: EstarTemplateType;
  variant: EstarTemplateVariant;
  /** Template filenames actually present in the drop-point directory. */
  present: string[];
  environment: 'staging' | 'production';
  /** Wire from `ESTAR_REQUIRE_TEMPLATE`; false ⇒ report-only (never blocks). */
  requireTemplate: boolean;
}

export interface EstarTemplateReadinessResult {
  /** The descriptor required for this pathway+variant, if the manifest knows it. */
  descriptor?: EstarTemplateDescriptor;
  requiredFileName?: string;
  /** The current FDA program version recommended for this family (e.g. "7.0"). */
  programVersion?: string;
  present: string[];
  /** True when the required official template is available to fill. */
  available: boolean;
  cleared: boolean;
  blockers: string[];
}

/**
 * Evaluate whether the official eSTAR template for a pathway+variant is present
 * so the platform can fill it. Blocks only when a template is required AND the
 * build is for production AND the required template is missing — the "do not
 * claim a submittable eSTAR when you cannot produce the official PDF" rule.
 * Staging and `requireTemplate:false` never block (they report for visibility).
 */
export function assessEstarTemplateReadiness(
  input: EstarTemplateReadinessInput,
): EstarTemplateReadinessResult {
  const descriptor = descriptorFor(input.type, input.variant);
  const presentSet = new Set(input.present.map((p) => p.toLowerCase()));
  const requiredFileName = descriptor?.expectedFileName;
  const available = !!requiredFileName && presentSet.has(requiredFileName.toLowerCase());
  const blockers: string[] = [];

  if (input.requireTemplate && input.environment === 'production' && !available) {
    const what = requiredFileName
      ? `the official eSTAR template "${requiredFileName}"`
      : `an official eSTAR template for ${input.type}/${input.variant} (none is registered in the manifest)`;
    blockers.push(
      `Cannot produce a submittable eSTAR: ${what} is missing. ` +
        `Place the licensed FDA eSTAR template in assets/estar-templates/ ` +
        `(or set ESTAR_TEMPLATE_DIR), or clear ESTAR_REQUIRE_TEMPLATE for non-submission builds. ` +
        `See assets/estar-templates/README.md.`,
    );
  }

  return {
    descriptor,
    requiredFileName,
    programVersion: descriptor ? currentVersionFor(descriptor.family)?.version : undefined,
    present: input.present,
    // `available` is the TRUTH signal — whether the official FDA eSTAR template
    // is actually present so the platform can produce the official PDF. Every
    // consumer deciding "official eSTAR producible" MUST gate on `available`.
    available,
    // `cleared` reflects POLICY ENFORCEMENT ONLY (blockers.length === 0), which
    // fires solely when requireTemplate is set AND the build is production. It
    // is `true` by default (requireTemplate off) even when the template is
    // ABSENT — so `cleared` must NOT be read as "the template exists / official
    // eSTAR is producible". Use `available` for that.
    cleared: blockers.length === 0,
    blockers,
  };
}

/** Read the opt-in eSTAR template enforcement flag from the environment. */
export function estarTemplateRequiredFromEnv(env: NodeJS.ProcessEnv = process.env): boolean {
  return String(env.ESTAR_REQUIRE_TEMPLATE ?? '').toLowerCase() === 'true';
}

export default {
  ESTAR_TEMPLATE_MANIFEST,
  resolveEstarTemplateDir,
  descriptorFor,
  descriptorsForFamily,
  listVendoredTemplates,
  assessEstarTemplateReadiness,
  estarTemplateRequiredFromEnv,
};
