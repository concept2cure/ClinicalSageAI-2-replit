/**
 * Official FDA eSTAR template registry + readiness gate (Device eSTAR Slice 1, B1).
 *
 * CDRH ingests the *official FDA eSTAR interactive PDF*, not a ZIP of rendered
 * section PDFs. To produce a real 510(k)/De Novo submission the platform must
 * fill that official template — which means the template file has to be present.
 * The official eSTAR PDFs are distributed by FDA and are NOT committed to the
 * repo (see `assets/estar-templates/README.md`); a maintainer drops the current
 * versions into `assets/estar-templates/` or points `ESTAR_TEMPLATE_DIR` at a
 * directory that holds them.
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

import type { EstarType } from './estar-mapper';

/** Whether the device is an in-vitro diagnostic — FDA ships a distinct IVD eSTAR. */
export type EstarTemplateVariant = 'device' | 'ivd';

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
  type: EstarType;
  variant: EstarTemplateVariant;
  expectedFileName: string;
  version: string;
}

/**
 * The official-template manifest. Filenames/versions are placeholders pending
 * the procurement drop — keep them in sync with the files in
 * `assets/estar-templates/` and the README. Do NOT regenerate FDA's form.
 */
export const ESTAR_TEMPLATE_MANIFEST: EstarTemplateDescriptor[] = [
  { id: '510k-device', type: '510k', variant: 'device', expectedFileName: 'eSTAR-510k-non-ivd.pdf', version: 'unset' },
  { id: '510k-ivd', type: '510k', variant: 'ivd', expectedFileName: 'eSTAR-510k-ivd.pdf', version: 'unset' },
  { id: 'de_novo-device', type: 'de_novo', variant: 'device', expectedFileName: 'eSTAR-denovo-non-ivd.pdf', version: 'unset' },
  { id: 'de_novo-ivd', type: 'de_novo', variant: 'ivd', expectedFileName: 'eSTAR-denovo-ivd.pdf', version: 'unset' },
];

/** Resolve the template drop-point directory (ESTAR_TEMPLATE_DIR or assets/estar-templates). */
export function resolveEstarTemplateDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.ESTAR_TEMPLATE_DIR || path.resolve(process.cwd(), 'assets/estar-templates');
}

/** The manifest descriptor for a given pathway + variant, or undefined if none. */
export function descriptorFor(type: EstarType, variant: EstarTemplateVariant): EstarTemplateDescriptor | undefined {
  return ESTAR_TEMPLATE_MANIFEST.find((d) => d.type === type && d.variant === variant);
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
  type: EstarType;
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
    present: input.present,
    available,
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
  listVendoredTemplates,
  assessEstarTemplateReadiness,
  estarTemplateRequiredFromEnv,
};
