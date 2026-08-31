/**
 * Device analysis lenses for the precedent board.
 *
 * ── Why this file exists ─────────────────────────────────────────────────────
 * The precedent board offered four analysis lenses — CRL triggers, RTF
 * triggers, EMA Day-120/180 question patterns, Advisory Committee risk — and
 * showed all four on a 510(k) search. Three are drug concepts on their face.
 * The fourth is not the exception the work order took it for: `analyzeRTFTriggers`
 * checks Form FDA 356h, Orange Book patent certification under 21 CFR 314.101,
 * CTD Modules 1/2.5/2.7/3/4, CDISC SDTM/ADaM datasets, a pediatric study plan
 * and REMS — fifteen items, none of which exist in a 510(k). A device submitter
 * was being shown "Patent Certification (Para I–IV)" as a refusal trigger for
 * their device (MDX_WORK_ORDER W2-8).
 *
 * ── What is computed here and what is shipped knowledge ──────────────────────
 * Two of these lenses are COMPUTED, and neither computation is written here:
 *
 *   predicate  scorePredicateAdequacy() — the repo's existing deterministic
 *              rubric — run over the FDA registry clearances the search
 *              actually returned. Real precedents, real scores, and factors the
 *              board cannot know are reported as unknown rather than assumed
 *              favourable, which is that engine's own contract.
 *
 *   nse        DERIVED from evaluateSubstantialEquivalence() by driving the
 *              canonical flowchart across its whole input space and keeping the
 *              paths that terminate NSE. The routes and their rationales are
 *              not restated here — they are read out of the engine that owns
 *              them, so if the flowchart changes this lens changes with it.
 *              This is deliberate: a second hand-written copy of the SE
 *              decision tree is exactly the duplication the house forbids.
 *
 * The other three (rta, ai, panel) are curated rule-based libraries with their
 * authority cited inline — the same construction as the CRL and RTF pattern
 * libraries already in precedent-engine.ts, and labelled as such. They are
 * shipped regulatory knowledge, not findings about the user's device, and
 * nothing here is presented as a rate, a probability or a precedent.
 *
 * @module server/services/precedent/device-lenses
 */
import {
  evaluateSubstantialEquivalence,
  type SubstantialEquivalenceInput,
} from '../regulatory/substantial-equivalence';
import {
  scorePredicateAdequacy,
  type PredicateCandidateInput,
} from '../regulatory/predicate-adequacy';
import type { PrecedentRecord } from '../precedent-engine';

/** The display shape the board renders for every lens. */
export interface LensAnalysis {
  title: string;
  rate: string;
  items: string[];
}

/** Lens keys, in the order the board presents them. */
export const DEVICE_LENS_KEYS = ['rta', 'ai', 'nse', 'predicate', 'panel'] as const;
export const DRUG_LENS_KEYS = ['crl', 'rtf', 'ema', 'adcomm'] as const;

export type DeviceLensKey = (typeof DEVICE_LENS_KEYS)[number];

/**
 * Device pathways, as the surface spells them and as the registry bridge
 * normalises them. A pathway not listed here is a drug pathway and keeps the
 * CRL/EMA/AdComm lenses — this screen serves both lanes, so the fix is to
 * choose the right set, not to delete one of them.
 */
const DEVICE_PATHWAYS = new Set([
  '510(k)', '510k', 'De Novo', 'De_Novo', 'DE_NOVO', 'PMA', 'IDE', 'HDE',
]);

export function isDevicePathway(submissionType: string): boolean {
  return DEVICE_PATHWAYS.has(String(submissionType ?? '').trim());
}

/** Which lens keys apply to a submission type, in display order. */
export function lensKeysFor(submissionType: string): readonly string[] {
  return isDevicePathway(submissionType) ? DEVICE_LENS_KEYS : DRUG_LENS_KEYS;
}

/* ── 1. Acceptance review ─────────────────────────────────────────────────────
 *
 * A 510(k) is refused ACCEPTANCE (RTA); a PMA is refused FILING (RTF). The two
 * are different gates under different authorities and the board was calling the
 * device one by the drug one's name. The checklist below is the acceptance
 * review's own content — 21 CFR 807.87 (what a 510(k) must contain), 807.92/93
 * (summary or statement), 807.94 (Class III certification), 21 CFR 54
 * (financial disclosure) — not a restatement of what a reviewer might want.
 */
const RTA_510K: string[] = [
  'Medical Device User Fee cover sheet (Form FDA 3601) and payment — an unpaid submission is not accepted, and no substantive review begins',
  'CDRH Premarket Review Submission Cover Sheet (Form FDA 3514)',
  'Indications for Use statement on Form FDA 3881, matching the indications used throughout the submission',
  '510(k) Summary per 21 CFR 807.92, or a 510(k) Statement per 807.93 — one or the other is required',
  'Truthful and Accurate Statement per 21 CFR 807.87(k)',
  'Class III Summary and Certification per 21 CFR 807.94, where the device is class III',
  'Financial Certification or Disclosure (Form FDA 3454/3455) where clinical data are included — 21 CFR 54',
  'Device description with the significant physical and performance characteristics — 21 CFR 807.87(f)',
  'Proposed labeling, including instructions for use — 21 CFR 807.87(e)',
  'Substantial-equivalence discussion with a characteristic-by-characteristic predicate comparison',
  'Sterilization method, validation and shelf life, where the device is supplied sterile',
  'Biocompatibility for the correct ISO 10993-1 contact category and duration, where the device is patient-contacting',
  'Software documentation at the level the device risk requires, where the device contains software',
  'Cybersecurity documentation, where the device is cyber-capable — FD&C Act §524B',
  'Electrical safety and electromagnetic compatibility, where the device is electrically powered',
  'Performance testing — bench, animal, and clinical as applicable — with protocols and acceptance criteria',
];

const RTF_PMA: string[] = [
  'Complete PMA per 21 CFR 814.20, including all required sections in the order the regulation sets out',
  'Medical Device User Fee cover sheet and payment',
  'Summary of safety and effectiveness data — 21 CFR 814.20(b)(3)',
  'Complete device description, manufacturing methods, facilities and controls — 814.20(b)(4)',
  'All non-clinical laboratory study reports, with a GLP compliance statement — 21 CFR 58',
  'All clinical investigation reports, favourable and unfavourable, with the case report forms the regulation requires',
  'Financial Certification or Disclosure for clinical investigators — 21 CFR 54',
  'Proposed labeling — 21 CFR 814.20(b)(10)',
  'An environmental assessment or a claim of categorical exclusion — 21 CFR 25',
  'Bibliography of published and unpublished information known to the applicant — 814.20(b)(8)',
];

/* ── 2. Additional Information requests ───────────────────────────────────────
 *
 * An AI request stops the review clock and is the single most common reason a
 * device submission takes longer than its MDUFA goal. These are the DRIVERS —
 * what the deficiency letters ask for. Deliberately not expressed as a
 * likelihood: the board holds no data on this device from which one could be
 * computed, and a fabricated percentage on a regulatory screen is worse than
 * no number at all.
 */
const AI_DRIVERS: string[] = [
  'Predicate comparison presented as prose rather than a characteristic-by-characteristic table, leaving the reviewer to construct the comparison',
  'Performance testing that does not map to the differences claimed as equivalent — testing the device rather than the difference',
  'Biocompatibility endpoints not matched to the ISO 10993-1 contact category and duration actually claimed',
  'Software documentation level below what the device risk requires, or a missing hazard analysis traceable to mitigations',
  'Cybersecurity documentation short of the §524B expectations — SBOM, threat model, patch plan',
  'Sterilisation validation or shelf-life data absent, or supplied for a different configuration than the one filed',
  'Human factors validation missing for a device with critical tasks, or run on the wrong user population',
  'Clinical data offered where a recognised standard would have sufficed, or omitted where the indication requires it',
  'Labeling inconsistent with the Indications for Use statement or with the performance actually demonstrated',
];

/* ── 5. Panel-track and advisory review ───────────────────────────────────────
 *
 * PMA supplement types are set by 21 CFR 814.39. A panel-track supplement is
 * the one that carries an advisory-panel risk, so this lens is about which
 * changes fall into that bucket.
 */
const PANEL_TRACK: string[] = [
  'A new indication for use — the change type 21 CFR 814.39(a) treats as panel-track, generally requiring clinical data',
  'A significant change in device design or performance beyond what the approved PMA covers',
  'A technology not previously reviewed for this device type, where FDA has no established evaluation approach',
  'A change for which clinical data are necessary to support continued safety and effectiveness',
  'A first-of-a-kind device or indication, where an advisory panel is more likely to be convened',
  'Post-approval study findings that materially change the benefit-risk profile relied on at approval',
];

const PANEL_510K: string[] = [
  'A 510(k) does not go to an advisory panel; escalation here means the submission leaves the 510(k) pathway',
  'An NSE determination sends the device to De Novo (if low-to-moderate risk) or to PMA',
  'A De Novo request may be referred to a panel where the risk classification is genuinely novel',
  'A product code reclassification changes the pathway for every device under it',
];

/**
 * The NSE routes, read out of the canonical SE flowchart rather than restated.
 *
 * The flowchart is a pure function, so its NSE-terminating paths can simply be
 * enumerated: drive it across the whole input space and keep what comes back
 * NSE. What the reader sees is the engine's own rationale text, in the engine's
 * own words, with the alternative pathway it recommends.
 */
function nseRoutes(): string[] {
  const bools = [true, false];
  const tri: Array<boolean | undefined> = [true, false, undefined];
  const perf: Array<boolean | null> = [true, false, null];
  const seen = new Map<string, string>();

  for (const sameIntendedUse of bools) {
    for (const sameTechnologicalCharacteristics of bools) {
      for (const differencesRaiseNewQuestions of tri) {
        for (const performanceDataSupportsEquivalence of perf) {
          const input: SubstantialEquivalenceInput = {
            sameIntendedUse,
            sameTechnologicalCharacteristics,
            differencesRaiseNewQuestions,
            performanceDataSupportsEquivalence,
          };
          const out = evaluateSubstantialEquivalence(input);
          if (out.determination !== 'NSE') continue;
          const text =
            out.rationale +
            (out.recommendedPathway ? ` Alternative pathway: ${out.recommendedPathway}.` : '');
          if (!seen.has(out.rationale)) seen.set(out.rationale, text);
        }
      }
    }
  }
  return [...seen.values()];
}

/**
 * Score the precedents the search returned through the canonical adequacy
 * rubric.
 *
 * Only what the registry actually carries is supplied. Intended-use and
 * technological-characteristics alignment need a reading of both device
 * descriptions, which the board does not have — they are left unset, and the
 * rubric reports them as unknown rather than scoring them favourably. That is
 * why the resulting band is honest even though the inputs are thin.
 */
function predicateLens(input: { productCode?: string }, precedents: PrecedentRecord[]): LensAnalysis {
  const candidates: PredicateCandidateInput[] = precedents
    .filter((p) => p.clearanceNumber)
    .slice(0, 10)
    .map((p) => {
      const year = Number(String(p.decisionDate ?? '').slice(0, 4));
      return {
        identifier: p.clearanceNumber as string,
        deviceName: p.deviceName ?? undefined,
        sameProductCode: input.productCode ? true : undefined,
        clearanceYear: Number.isFinite(year) && year > 1975 ? year : undefined,
        decision: p.decisionOutcome === 'CLEARED' ? ('SE' as const) : ('unknown' as const),
      };
    });

  if (candidates.length === 0) {
    return {
      title: 'Predicate adequacy',
      rate: '—',
      items: [
        'No candidate predicate has been returned for these criteria, so there is nothing to score. This is not a finding that no adequate predicate exists.',
      ],
    };
  }

  const scored = scorePredicateAdequacy({ candidates });

  /* ── Why the band is withheld here, and only here ───────────────────────────
     The rubric scores an unknown factor as 0 rather than assuming it
     favourable — correct, and the reason its output is trustworthy. But
     intended-use and technological-characteristics alignment together carry 55
     of the 100 points, and the board holds neither: it has not read the two
     device descriptions. So every registry predicate lands in the low 40s and
     is banded "inadequate", including predicates that are in fact strong.

     That band is a verdict on OUR INPUTS wearing the costume of a verdict on
     the predicate, which is the more dangerous direction for a regulatory tool
     to be wrong in — a user talked out of a good predicate cannot tell that
     the reason was our missing data. So while the dominant factors are
     unassessed the score is reported as partial and the band is not shown at
     all. Supply the two alignments and the band appears. */
  const DOMINANT = ['intendedUseAlignment', 'technologyAlignment'];
  const items = scored.ranked.map((r) => {
    const missingDominant = DOMINANT.filter((f) => r.unknownFactors.includes(f));
    const name = `${r.identifier}${r.deviceName ? ` — ${r.deviceName}` : ''}`;
    if (missingDominant.length) {
      return (
        `${name}: ${r.score}/100 from the factors the registry carries. Not yet ranked — ` +
        `intended-use and technological-characteristics alignment need a reading of both ` +
        `device descriptions, and together they carry most of the score.`
      );
    }
    return `${name}: ${r.score}/100, ${r.band}.`;
  });
  items.push(scored.disclaimer);

  const anyRanked = scored.ranked.some(
    (r) => !DOMINANT.some((f) => r.unknownFactors.includes(f)),
  );
  return {
    title: 'Predicate adequacy',
    rate: anyRanked && scored.recommended ? `strongest: ${scored.recommended}` : 'partial — see below',
    items,
  };
}

/**
 * The device lens set for one search.
 *
 * `precedents` are the records the search returned — the predicate lens scores
 * them; the others do not depend on them.
 */
export function buildDeviceLenses(
  input: { submissionType: string; productCode?: string },
  precedents: PrecedentRecord[],
): Record<DeviceLensKey, LensAnalysis> {
  const isPma = String(input.submissionType).trim() === 'PMA';

  return {
    rta: isPma
      ? { title: 'Refuse-to-File (PMA)', rate: `${RTF_PMA.length} filing-review items`, items: RTF_PMA }
      : { title: 'Refuse-to-Accept (510(k))', rate: `${RTA_510K.length} acceptance-review items`, items: RTA_510K },
    ai: {
      title: 'Additional Information request drivers',
      rate: 'clock-stopping',
      items: AI_DRIVERS,
    },
    nse: {
      title: 'Not-substantially-equivalent routes',
      rate: 'FDA 510(k) SE flowchart',
      items: nseRoutes(),
    },
    predicate: predicateLens(input, precedents),
    panel: isPma
      ? { title: 'Panel-track triggers', rate: '21 CFR 814.39(a)', items: PANEL_TRACK }
      : { title: 'Pathway escalation', rate: 'no panel in 510(k)', items: PANEL_510K },
  };
}
