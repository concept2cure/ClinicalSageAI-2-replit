/**
 * Reasoning Engine — submission structure helper (WO-5 integration)
 *
 * Maps a planner's free-text region / application-type inputs to the deterministic
 * CTD structure (required sections + review clock per region) via the reasoning
 * engine. This is the grounding the LLM planner narrates ON TOP of — the
 * structure is resolved deterministically here, never invented by the model.
 *
 * Pure and fail-safe: unknown regions / application types are reported as
 * `supported: false` with a note (never fabricated).
 */

import { resolve } from './resolve.js';
import type { ApplicationType, Region, RequiredSection, ReviewClock } from './types.js';

const REGION_ALIASES: Record<string, Region> = {
  fda: 'fda', us: 'fda', usa: 'fda', 'united states': 'fda',
  eu: 'eu', ema: 'eu', europe: 'eu', 'european union': 'eu',
  jp: 'jp', japan: 'jp', pmda: 'jp', mhlw: 'jp',
};

const APPTYPE_ALIASES: Record<string, ApplicationType> = {
  ind: 'ind', nda: 'nda', bla: 'bla', maa: 'maa', cta: 'cta', anda: 'anda',
  '510k': '510k', '510(k)': '510k', denovo: '510k', pma: 'pma',
};

export function normalizeRegion(raw: string): Region | null {
  return REGION_ALIASES[raw.trim().toLowerCase()] ?? null;
}

export function normalizeApplicationType(raw: string): ApplicationType | null {
  const key = raw.trim().toLowerCase().replace(/\s+/g, '');
  return APPTYPE_ALIASES[key] ?? null;
}

export interface RegionStructure {
  region: string;
  supported: boolean;
  requiredSections?: RequiredSection[];
  reviewClock?: ReviewClock;
  note?: string;
}

export interface SubmissionStructure {
  applicationType: string;
  resolver: 'reasoning-engine';
  profileVersion: string;
  regions: RegionStructure[];
}

/**
 * Build the deterministic per-region structure for a planned submission. Skips
 * (does not fabricate) regions/application types the rule data does not cover.
 */
export function buildSubmissionStructure(regions: string[], applicationType: string): SubmissionStructure {
  const appType = normalizeApplicationType(applicationType);
  const out: RegionStructure[] = [];
  let profileVersion = '';

  for (const raw of regions) {
    const region = normalizeRegion(raw);
    if (!region || !appType) {
      out.push({
        region: raw,
        supported: false,
        note: !region
          ? `Region "${raw}" is not in the reasoning-engine rule data.`
          : `Application type "${applicationType}" is not in the reasoning-engine rule data.`,
      });
      continue;
    }
    const sections = resolve<RequiredSection[]>({ task: 'required-sections', region, applicationType: appType });
    const clock = resolve<ReviewClock>({ task: 'review-clock', region, applicationType: appType });
    profileVersion = sections.profileVersion;
    out.push({
      region,
      supported: true,
      requiredSections: sections.data,
      reviewClock: clock.data,
    });
  }

  return {
    applicationType,
    resolver: 'reasoning-engine',
    profileVersion,
    regions: out,
  };
}
