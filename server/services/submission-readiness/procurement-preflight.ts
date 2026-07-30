/**
 * Submission procurement preflight — one answer to "what do we still need to
 * obtain before this platform can file for real?"
 *
 * Three things gate live submission, and NONE of them is code: they are licensed
 * agency artifacts and agency credentials that a maintainer must obtain and drop
 * in. Each already has its own readiness check, but they lived in three places,
 * so nobody could see the whole procurement picture at once:
 *
 *   1. eCTD DTDs            → assets/ectd-dtd/       (dtd-bundler)
 *   2. FDA eSTAR templates  → assets/estar-templates/ (estar-template-registry)
 *   3. Agency validators    → *_VALIDATOR_URL env     (validator-registry)
 *
 * This aggregates them into one report with, for each gap, exactly WHAT is
 * missing, WHERE it goes, and WHAT it unblocks — so the work is actionable by
 * someone who did not write the code.
 *
 * HONEST-BY-CONSTRUCTION: it reports only what it can observe on disk / in env.
 * It never downloads, never fabricates, and never reports a gap as satisfied.
 * The pure `buildPreflightReport` is separated from the filesystem/env probes so
 * the reporting logic is unit-testable.
 *
 * @module server/services/submission-readiness/procurement-preflight
 */

import { promises as fs } from 'fs';
import * as path from 'path';

import {
  resolveDtdDir,
  requiredDtdsForRegion,
  ICH_BACKBONE_DTD,
  type DtdRegion,
} from '../ectd/dtd-bundler';
import {
  ESTAR_TEMPLATE_MANIFEST,
  resolveEstarTemplateDir,
} from '../pathway-engines/estar/estar-template-registry';
import { listValidators } from '../submission-gateways/validator-registry';

/** Every region whose eCTD Module 1 backbone the packager can build. */
export const DTD_REGIONS: DtdRegion[] = ['fda', 'ema', 'pmda', 'ca'];

export type PreflightCategory = 'ectd_dtd' | 'estar_template' | 'agency_validator';

export interface PreflightItem {
  category: PreflightCategory;
  /** Human label for the thing that must be obtained. */
  label: string;
  /** True when it is present/configured. */
  satisfied: boolean;
  /** Where the maintainer must put it (path) or set it (env var). */
  location: string;
  /** What stays blocked while it is missing. */
  unblocks: string;
}

export interface PreflightReport {
  /** True only when every item is satisfied. */
  ready: boolean;
  items: PreflightItem[];
  summary: {
    total: number;
    satisfied: number;
    missing: number;
    byCategory: Record<PreflightCategory, { total: number; missing: number }>;
  };
  /** Missing items rendered as actionable one-liners, ordered by category. */
  actions: string[];
}

export interface PreflightObservation {
  /** Filenames present in the DTD drop-point directory. */
  dtdFilesPresent: string[];
  dtdDir: string;
  /** Filenames present in the eSTAR template drop-point directory. */
  estarFilesPresent: string[];
  estarDir: string;
  /** Validator providers and whether each is configured. */
  validators: { id: string; label: string; configured: boolean }[];
}

/**
 * Build the report from an observation. PURE — no filesystem, no env — so the
 * "what is missing and what does it unblock" logic is testable directly.
 */
export function buildPreflightReport(obs: PreflightObservation): PreflightReport {
  const items: PreflightItem[] = [];
  const present = new Set(obs.dtdFilesPresent.map((f) => f.toLowerCase()));

  // 1. eCTD DTDs — the shared ICH backbone plus each region's Module 1 DTD.
  //    Deduped across regions so a shared file is reported once.
  const requiredDtds = new Set<string>([ICH_BACKBONE_DTD]);
  for (const region of DTD_REGIONS) {
    for (const f of requiredDtdsForRegion(region)) requiredDtds.add(f);
  }
  for (const file of [...requiredDtds].sort()) {
    items.push({
      category: 'ectd_dtd',
      label: file,
      satisfied: present.has(file.toLowerCase()),
      location: path.join(obs.dtdDir, file),
      unblocks: 'DTD-self-contained eCTD packages (ECTD_REQUIRE_DTD gate)',
    });
  }

  // 2. Official FDA eSTAR / PreSTAR templates, one per manifest descriptor.
  const estarPresent = new Set(obs.estarFilesPresent.map((f) => f.toLowerCase()));
  const seenTemplates = new Set<string>();
  for (const d of ESTAR_TEMPLATE_MANIFEST) {
    if (seenTemplates.has(d.expectedFileName)) continue;
    seenTemplates.add(d.expectedFileName);
    items.push({
      category: 'estar_template',
      label: d.expectedFileName,
      satisfied: estarPresent.has(d.expectedFileName.toLowerCase()),
      location: path.join(obs.estarDir, d.expectedFileName),
      unblocks: `official eSTAR production for ${d.type}/${d.variant}`,
    });
  }

  // 3. Agency validators — the only agency-grade validation available.
  for (const v of obs.validators) {
    // The in-process structural validator is always available; it is not a
    // procurement item, so it is reported as satisfied rather than omitted.
    items.push({
      category: 'agency_validator',
      label: v.label,
      satisfied: v.configured,
      location: v.id === 'internal' ? '(built in)' : `${v.id.toUpperCase()}_VALIDATOR_URL env var`,
      unblocks: 'agency-grade validation findings before transmit',
    });
  }

  const byCategory: Record<PreflightCategory, { total: number; missing: number }> = {
    ectd_dtd: { total: 0, missing: 0 },
    estar_template: { total: 0, missing: 0 },
    agency_validator: { total: 0, missing: 0 },
  };
  for (const i of items) {
    byCategory[i.category].total += 1;
    if (!i.satisfied) byCategory[i.category].missing += 1;
  }

  const missingItems = items.filter((i) => !i.satisfied);
  const actions = missingItems.map(
    (i) => `[${i.category}] ${i.label} → ${i.location} (unblocks: ${i.unblocks})`,
  );

  return {
    ready: missingItems.length === 0,
    items,
    summary: {
      total: items.length,
      satisfied: items.length - missingItems.length,
      missing: missingItems.length,
      byCategory,
    },
    actions,
  };
}

/** List filenames in a directory; [] when absent (never throws). */
async function listDir(dir: string): Promise<string[]> {
  try {
    return await fs.readdir(dir);
  } catch {
    return [];
  }
}

/** Observe the real drop-points + env, then build the report. */
export async function runProcurementPreflight(
  env: NodeJS.ProcessEnv = process.env,
): Promise<PreflightReport> {
  const dtdDir = resolveDtdDir(env);
  const estarDir = resolveEstarTemplateDir(env);
  const [dtdFilesPresent, estarFilesPresent] = await Promise.all([
    listDir(dtdDir),
    listDir(estarDir),
  ]);
  return buildPreflightReport({
    dtdFilesPresent,
    dtdDir,
    estarFilesPresent,
    estarDir,
    validators: listValidators(),
  });
}

export default { runProcurementPreflight, buildPreflightReport, DTD_REGIONS };
