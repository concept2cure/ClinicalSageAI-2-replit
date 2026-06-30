/**
 * cdxConcordance — E12. CDx claim-concordance across a paired drug + device
 * dossier.
 *
 * A companion diagnostic (CDx) is approved alongside the drug whose use it
 * gates. FDA expects the CDx-related claims — the intended use, the biomarker,
 * and the patient population — to read IDENTICALLY on the drug labeling and in
 * the device submission. A divergence (a biomarker stated one way on the label
 * and another in the IFU, a population that is narrower on one side) is the
 * class of finding that triggers an FDA deficiency on a paired PMA/BLA.
 *
 * This module is the cross-dossier extension of `check_dossier_consistency`
 * (which is single-dossier). Given the CDx claim strings extracted from each
 * side of a `pair_companion_diagnostic` pairing, it reports each claim as
 * CONCORDANT or DISCORDANT.
 *
 * HONESTY CONTRACT (21 CFR Part 11):
 *   - A "match" is a VERBATIM string comparison, never an AI judgment. We
 *     compare the two strings exactly as supplied — no case-folding, no
 *     whitespace collapsing, no stemming, no fuzzy/semantic similarity. If the
 *     drug label says "PD-L1 (≥1%)" and the device IFU says "PD-L1 (>=1%)",
 *     that is DISCORDANT and we say so. Resolving it is the user's call, not
 *     ours.
 *   - A claim present on only one side is DISCORDANT (missing counterpart),
 *     never silently concordant.
 *   - Provenance ("source") is preserved for both sides so the verdict points
 *     back to the exact submission + locator a reviewer can open.
 *
 * Pure + framework-free so it unit-tests in isolation and can later run
 * server-side behind a cross-dossier tool.
 *
 * // INTEGRATION: today the claim strings are supplied by the caller (from a
 * fixture, or — in the live path — joined from the two tenant-linked
 * submissions via the `pair_companion_diagnostic` row). When a server-side
 * cross-dossier extractor lands, it slots in where `extractClaims` is called:
 * it would read the drug labeling artifact and the device IFU/intended-use
 * artifact for the paired dossier and emit these same {category, text, source}
 * records. The diff below does not change.
 */

/** The CDx claim categories that must align across the paired dossiers. */
export type CdxClaimCategory = 'intended_use' | 'biomarker' | 'population';

/** Human label for a claim category — factual, no flourish. */
export const CDX_CLAIM_CATEGORY_LABEL: Record<CdxClaimCategory, string> = {
  intended_use: 'Intended use',
  biomarker: 'Biomarker',
  population: 'Population',
};

/** A pointer back to the artifact a claim string was taken from. */
export interface CdxClaimSource {
  /** Which dossier side this string came from. */
  side: 'drug' | 'device';
  /** Human-readable submission identifier, e.g. "BLA 761234" or "PMA P210000". */
  submission: string;
  /** Where in that submission the string lives, e.g. "Label §1 Indications". */
  locator: string;
}

/** A single CDx claim string drawn from one side of the pairing. */
export interface CdxClaim {
  category: CdxClaimCategory;
  /** The claim text, captured VERBATIM. Never normalized. */
  text: string;
  source: CdxClaimSource;
}

/** The two sides of a paired drug + device dossier, as claim records. */
export interface PairedDossierClaims {
  /** Pairing id from `pair_companion_diagnostic` (cdx_pairings.id). */
  pairingId: string;
  drugClaims: CdxClaim[];
  deviceClaims: CdxClaim[];
}

/** Per-claim concordance verdict. */
export type ClaimConcordanceStatus =
  /** Both sides present the claim string verbatim-identical. */
  | 'concordant'
  /** Both sides present the claim but the strings differ. */
  | 'discordant'
  /** The claim is present on one side and absent on the other. */
  | 'missing_counterpart';

export interface ClaimConcordance {
  category: CdxClaimCategory;
  status: ClaimConcordanceStatus;
  /** The drug-side claim string, or null when that side has no such claim. */
  drugText: string | null;
  /** The device-side claim string, or null when that side has no such claim. */
  deviceText: string | null;
  drugSource: CdxClaimSource | null;
  deviceSource: CdxClaimSource | null;
}

export type ConcordanceVerdict = 'concordant' | 'discordant';

export interface CdxConcordanceReport {
  pairingId: string;
  /** 'concordant' only when EVERY category is concordant. */
  verdict: ConcordanceVerdict;
  claims: ClaimConcordance[];
  concordantCount: number;
  discordantCount: number;
  /**
   * Honesty flag: a verbatim string comparison, never a model judgment. The UI
   * cites this so a reviewer knows the verdict is a literal diff, not an
   * inference. Always true — this engine performs no fuzzy/semantic matching.
   */
  verbatim: true;
}

/** Categories are reported in this fixed, label-reading order. */
const CATEGORY_ORDER: CdxClaimCategory[] = ['intended_use', 'biomarker', 'population'];

/**
 * Compute the cross-dossier CDx claim-concordance report for a paired
 * drug + device dossier.
 *
 * For each claim category we take the drug-side and device-side claim string
 * (if present) and compare them with strict `===` — a VERBATIM comparison.
 * No normalization of any kind is applied, per the honesty contract.
 */
export function computeCdxConcordance(paired: PairedDossierClaims): CdxConcordanceReport {
  const drugByCat = indexByCategory(paired.drugClaims);
  const deviceByCat = indexByCategory(paired.deviceClaims);

  const presentCategories = CATEGORY_ORDER.filter(
    (cat) => drugByCat.has(cat) || deviceByCat.has(cat),
  );

  const claims: ClaimConcordance[] = presentCategories.map((category) => {
    const drug = drugByCat.get(category) ?? null;
    const device = deviceByCat.get(category) ?? null;

    let status: ClaimConcordanceStatus;
    if (drug == null || device == null) {
      status = 'missing_counterpart';
    } else if (drug.text === device.text) {
      // VERBATIM equality — the only thing we will ever call a "match".
      status = 'concordant';
    } else {
      status = 'discordant';
    }

    return {
      category,
      status,
      drugText: drug ? drug.text : null,
      deviceText: device ? device.text : null,
      drugSource: drug ? drug.source : null,
      deviceSource: device ? device.source : null,
    };
  });

  const concordantCount = claims.filter((c) => c.status === 'concordant').length;
  const discordantCount = claims.length - concordantCount;

  return {
    pairingId: paired.pairingId,
    verdict: discordantCount === 0 && claims.length > 0 ? 'concordant' : 'discordant',
    claims,
    concordantCount,
    discordantCount,
    verbatim: true,
  };
}

/**
 * Index claims by category. If a side supplies more than one claim for a
 * category, the first wins — extraction is expected to emit one canonical
 * string per category per side; a duplicate is a data problem upstream, not
 * something we silently merge.
 */
function indexByCategory(claims: CdxClaim[]): Map<CdxClaimCategory, CdxClaim> {
  const map = new Map<CdxClaimCategory, CdxClaim>();
  for (const claim of claims) {
    if (!map.has(claim.category)) map.set(claim.category, claim);
  }
  return map;
}

/**
 * Compose the targeted fix request AnA receives when the user clicks "Ask AnA
 * to resolve" on a discordant concordance report — it cites each discordant
 * category and the two differing strings verbatim so AnA can reconcile them
 * across the paired dossiers and re-check. Pure + exported for testing.
 *
 * Mirrors `composeVerificationFixMessage`: factual, no emoji, names exactly
 * what diverged.
 */
export function composeConcordanceFixMessage(report: CdxConcordanceReport): string {
  const discordant = report.claims.filter((c) => c.status !== 'concordant');
  const parts: string[] = [
    `The companion-diagnostic claims for pairing ${report.pairingId} are not concordant across the drug and device dossiers.`,
  ];
  for (const c of discordant) {
    const label = CDX_CLAIM_CATEGORY_LABEL[c.category];
    if (c.status === 'missing_counterpart') {
      const presentSide = c.drugText != null ? 'drug' : 'device';
      const missingSide = c.drugText != null ? 'device' : 'drug';
      const text = c.drugText ?? c.deviceText ?? '';
      parts.push(
        `${label}: present on the ${presentSide} side ("${text}") but absent on the ${missingSide} side.`,
      );
    } else {
      parts.push(
        `${label}: the drug side states "${c.drugText}" while the device side states "${c.deviceText}".`,
      );
    }
  }
  parts.push(
    'Please reconcile each discordant claim so it reads identically across both submissions, then re-check concordance.',
  );
  return parts.join(' ');
}
