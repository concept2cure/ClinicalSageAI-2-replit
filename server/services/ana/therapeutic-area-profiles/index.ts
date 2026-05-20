/**
 * Therapeutic-area profile registry + prompt renderer (Feature 2.7).
 *
 * Adding a new profile is module-only:
 *   1. Create a new file in this directory exporting a TherapeuticAreaProfile.
 *   2. Add it to PROFILES below.
 *   3. (Optional) extend the TherapeuticAreaId union in types.ts.
 * No migration is needed — projects.therapeutic_area is a free-form
 * string slug that resolves to a profile here at runtime.
 *
 * The renderer turns a profile into a system-prompt context block that
 * can be folded into AnA's prompt assembly. Designed to fit alongside
 * the existing buildMergedContext layers (Global / Local / User /
 * Capabilities / Wisdom / ScopedRules).
 *
 * @module server/services/ana/therapeutic-area-profiles
 */

import { oncologyProfile } from './oncology.js';
import { rareDiseaseProfile } from './rare-disease.js';
import { neurologyProfile } from './neurology.js';
import { immunologyProfile } from './immunology.js';
import type {
  TherapeuticAreaId,
  TherapeuticAreaProfile,
  ContextRule,
  GuidanceRef,
  PathwayHint,
} from './types.js';

export type {
  TherapeuticAreaId,
  TherapeuticAreaProfile,
  ContextRule,
  GuidanceRef,
  PathwayHint,
};

/**
 * Canonical registry. Slug → profile.
 */
const PROFILES: ReadonlyMap<string, TherapeuticAreaProfile> = new Map<
  string,
  TherapeuticAreaProfile
>([
  ['oncology', oncologyProfile],
  ['oncology-hematology', oncologyProfile],
  ['rare-disease', rareDiseaseProfile],
  ['rare', rareDiseaseProfile],
  ['orphan', rareDiseaseProfile],
  ['neurology', neurologyProfile],
  ['cns', neurologyProfile],
  ['neurodegenerative', neurologyProfile],
  ['immunology', immunologyProfile],
  ['autoimmune', immunologyProfile],
]);

/**
 * Resolve a free-form slug to a profile. Case-insensitive, trims spaces,
 * normalizes hyphens. Returns null when the slug isn't registered.
 */
export function getProfile(
  slug: string | null | undefined
): TherapeuticAreaProfile | null {
  if (!slug) return null;
  const normalized = String(slug)
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-');
  return PROFILES.get(normalized) ?? null;
}

/**
 * List every distinct profile (deduplicated by id, since multiple slugs
 * can alias to the same profile).
 */
export function listProfiles(): TherapeuticAreaProfile[] {
  const seen = new Set<TherapeuticAreaId>();
  const out: TherapeuticAreaProfile[] = [];
  for (const profile of PROFILES.values()) {
    if (seen.has(profile.id)) continue;
    seen.add(profile.id);
    out.push(profile);
  }
  return out.sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Return every accepted slug (canonical + aliases). Useful for input
 * validation in routes that set the area on a project.
 */
export function listAcceptedSlugs(): string[] {
  return Array.from(PROFILES.keys()).sort();
}

// ─── Prompt renderer ─────────────────────────────────────────────────

export interface RenderProfileOptions {
  /**
   * Optional CTD section the user is currently authoring. Used to
   * filter section/module-scoped rules to the relevant ones first
   * (others still appear, just lower in the context block).
   */
  activeCtdSection?: string | null;
  /**
   * Optional submission pathway (accelerated_approval, breakthrough_therapy,
   * orphan_drug, ...). When supplied, the matching pathwayHint is bubbled
   * to the top of the context block.
   */
  activePathway?: PathwayHint['pathway'];
  /**
   * Optional limit on bullets per section to keep prompt budget bounded.
   * Default 8.
   */
  maxBulletsPerSection?: number;
}

/**
 * Render a profile as a markdown-ish context block suitable for
 * inclusion in a system prompt. Compact, no decoration, deterministic
 * order. The submission-chat handler + section-generation flows can
 * inject this verbatim.
 */
export function renderProfileForPrompt(
  profile: TherapeuticAreaProfile,
  options: RenderProfileOptions = {}
): string {
  const max = options.maxBulletsPerSection ?? 8;
  const activeSection = options.activeCtdSection?.trim() || null;

  const lines: string[] = [];
  lines.push(
    `## Therapeutic Area Context — ${profile.displayName}`,
    `> ${profile.description}`,
    ''
  );

  // Pathway hint at the top when one is active.
  if (options.activePathway) {
    const hint = profile.pathwayHints.find(
      h => h.pathway === options.activePathway
    );
    if (hint) {
      lines.push(`### Active Pathway: ${hint.pathway}`);
      lines.push(`- Applicability: ${hint.applicability}`);
      lines.push(
        `- Impacted sections: ${hint.impactedSections.join(', ')}`
      );
      lines.push(`- Reviewer notes: ${hint.reviewerNotes}`);
      lines.push('');
    }
  }

  // Context rules — relevant ones first, then the rest.
  const rules = sortContextRules(profile.contextRules, activeSection);
  if (rules.length > 0) {
    lines.push('### Context Rules');
    for (const rule of rules.slice(0, max)) {
      const sevTag = `[${rule.severity}]`;
      const ref = rule.guidanceRef ? ` (${rule.guidanceRef})` : '';
      lines.push(`- ${sevTag} ${rule.instruction}${ref}`);
    }
    lines.push('');
  }

  // Risk factors.
  if (profile.riskFactors.length > 0) {
    lines.push('### Risk Factors');
    for (const r of profile.riskFactors.slice(0, max)) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  // Reviewer expectations — highest-leverage for review-mode authoring.
  if (profile.reviewerExpectations.length > 0) {
    lines.push('### Reviewer Expectations');
    for (const r of profile.reviewerExpectations.slice(0, max)) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  // Statistical considerations — only inject when authoring stat-relevant sections.
  const wantStat =
    !activeSection ||
    /^11\.|^11$|^9\.|^9$|^2\.7\.[34]/.test(activeSection);
  if (wantStat && profile.statisticalConsiderations.length > 0) {
    lines.push('### Statistical Considerations');
    for (const r of profile.statisticalConsiderations.slice(0, max)) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  // Endpoint considerations — same gate.
  if (wantStat && profile.endpointConsiderations.length > 0) {
    lines.push('### Endpoint Considerations');
    for (const r of profile.endpointConsiderations.slice(0, max)) {
      lines.push(`- ${r}`);
    }
    lines.push('');
  }

  // Guidance references — compact list, always include.
  if (profile.guidanceRefs.length > 0) {
    lines.push('### Key Guidance References');
    for (const g of profile.guidanceRefs.slice(0, max)) {
      lines.push(`- [${g.authority}] ${g.code} — ${g.title}`);
      lines.push(`    Why: ${g.why}`);
    }
    lines.push('');
  }

  // Common gaps — terse; full registry is loaded via gap-classifier.
  if (profile.commonGaps.length > 0) {
    lines.push('### Common Gaps in This Therapeutic Area');
    for (const g of profile.commonGaps.slice(0, max)) {
      lines.push(
        `- [${g.severity}] §${g.ctdSection}: ${g.description}`
      );
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd() + '\n';
}

/**
 * Pure: sort context rules so the ones matching the active CTD section
 * (or its module prefix) bubble to the top, then 'always' rules, then
 * the rest. Within each tier, sort critical → info.
 */
export function sortContextRules(
  rules: ContextRule[],
  activeCtdSection: string | null
): ContextRule[] {
  const SEV: Record<string, number> = {
    critical: 0,
    major: 1,
    minor: 2,
    info: 3,
  };

  function tier(rule: ContextRule): number {
    if (!activeCtdSection) {
      return rule.scope === 'always' ? 0 : 1;
    }
    if (rule.scope === 'section' && rule.appliesTo) {
      if (
        activeCtdSection === rule.appliesTo ||
        activeCtdSection.startsWith(rule.appliesTo + '.')
      ) {
        return 0;
      }
    }
    if (rule.scope === 'module' && rule.appliesTo) {
      const moduleNum = rule.appliesTo.replace(/[^\d]/g, '');
      if (activeCtdSection.startsWith(moduleNum)) return 0;
    }
    if (rule.scope === 'always') return 1;
    return 2;
  }

  return [...rules].sort((a, b) => {
    const ta = tier(a);
    const tb = tier(b);
    if (ta !== tb) return ta - tb;
    return SEV[a.severity] - SEV[b.severity];
  });
}

/**
 * Pure: compose extra retrieval keywords from a profile so the citation
 * engine can boost in-area passages. Caller folds these into the
 * embedding-search query.
 */
export function profileRetrievalBoost(
  profile: TherapeuticAreaProfile
): string {
  return profile.retrievalKeywords.slice(0, 12).join(' ');
}
