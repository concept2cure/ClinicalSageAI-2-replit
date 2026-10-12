/**
 * The agency a programme files with, as positions a person can take
 * (founder's directive, 2026-10-12: *"make this consistent and subject matter
 * intelligent across all medical device and diagnostics scenarios and all
 * Biotech scenarios"*).
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `primary_regulatory_agency` is the field the rest of the platform keys on.
 * The region it names decides the Module 1 backbone, the validation profile,
 * the submission gateway, the dossier standard and which filings exist at all.
 * The engine declared it as an `agency_select`, no renderer ever implemented
 * that type, and the question therefore reached the person as a **free-text
 * box**: the one answer everything downstream depends on was typed prose, and
 * nothing could be keyed to it.
 *
 * ── What this module is, and is not ─────────────────────────────────────────
 * It is not a new list of agencies. The platform already holds twelve
 * regions in two governed modules that must agree:
 *
 *   `region-profiles.ts`   the agency, its full name, the country and the
 *       dossier standard — what a person reads.
 *   `region-identity.ts`   the canonical code and the four vocabularies the
 *       subsystems speak, plus whether this platform holds that region's
 *       Module 1 checklist (7 of 12) and its own validation rules (6 of 12).
 *
 * The position's VALUE is the canonical region code, because that is what the
 * platform keys on; its label comes from the profile; and what taking it
 * commits the programme to is **derived from those two rows**, including what
 * AnA does *not* hold for that agency. A sponsor choosing Singapore is told,
 * before they choose, that there is no Module 1 checklist and no validation
 * rule set for it — which is the honest thing to say and nowhere else said.
 *
 * WHO prequalification is deliberately not here: it is not a national filing
 * and this platform configures no region for it. The flow that offers it says
 * so in the option itself rather than letting it sit among the twelve as if it
 * were one of them.
 *
 * @module shared/regulatory/agency-positions
 */

import { REGION_IDENTITY, canonicalRegionOf, type CanonicalRegion } from './region-identity.js';
import { REGION_PROFILES } from './region-profiles.js';

export interface AgencyPosition {
  /** The canonical region code — what the platform keys on. */
  value: CanonicalRegion;
  /** The agency and its country, as the governed profile names them. */
  label: string;
  /** What filing here commits the programme to, including what AnA does not hold. */
  commits: string;
}

/** 'Health_Canada' → 'Health Canada'. The registry's own spelling, read aloud. */
function spoken(agency: string): string {
  return agency.replace(/_/g, ' ');
}

/**
 * What filing with this agency commits the programme to. Derived from the two
 * governed rows, never written per agency, so a region the platform gains or
 * loses capability for cannot keep saying the old thing.
 */
function commitsFor(region: CanonicalRegion): string {
  const profile = REGION_PROFILES.find(p => p.region === region);
  const identity = REGION_IDENTITY[region];
  const name = profile?.agencyFullName ?? spoken(String(identity.agency));
  const standard = profile?.dossierStandard ?? 'eCTD';
  const module1 = identity.market
    ? 'AnA holds this agency’s Module 1 requirements'
    : 'AnA holds no Module 1 checklist for this agency';
  const rules = identity.ruleRegion
    ? 'and validates against its own rule set.'
    : 'and has no region-specific validation rules for it, so anything drafted for it is unvalidated here.';
  return `${name}. Submissions are ${standard}. ${module1}, ${rules}`;
}

/** The twelve agencies this platform configures, in the profiles' own order. */
export function agencyPositions(): AgencyPosition[] {
  return REGION_PROFILES.filter(p => p.region in REGION_IDENTITY).map(profile => {
    const region = profile.region as CanonicalRegion;
    return {
      value: region,
      label: `${spoken(String(profile.agency))} — ${profile.country}`,
      commits: commitsFor(region),
    };
  });
}

/** The positions as a question's options, the shape a flow puts in a field. */
export function agencyOptions(): Array<{ value: string; label: string; commits: string }> {
  return agencyPositions().map(position => ({ ...position, value: String(position.value) }));
}

/**
 * The regions a set of answers names, in any of the platform's vocabularies
 * and in any order, de-duplicated. A value that belongs to no region — WHO
 * prequalification, a position written in the person's own words — resolves to
 * nothing rather than to a guess.
 */
export function regionsNamed(values: readonly unknown[]): CanonicalRegion[] {
  const out: CanonicalRegion[] = [];
  for (const value of values) {
    const region = canonicalRegionOf(typeof value === 'string' ? value : null);
    if (region && !out.includes(region)) out.push(region);
  }
  return out;
}

/** The agency that speaks for a region, read aloud ('CA' → 'Health Canada'). */
export function agencyFor(region: CanonicalRegion): string {
  return spoken(String(REGION_IDENTITY[region].agency));
}
