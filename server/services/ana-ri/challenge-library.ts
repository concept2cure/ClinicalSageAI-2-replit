/**
 * Constructive-challenge library — AnA's polite-pushback reflexes.
 *
 * The industry-wisdom pack is reference lore AnA reasons WITH. This module is
 * the interactive counterpart: it recognizes when a client is ASSERTING a
 * risky plan or premise in their own words, and primes AnA to push back —
 * politely, once, grounded in precedent, with a better path. It is the
 * operational arm of the persona's "Constructive Dissent" doctrine.
 *
 * Each pattern is:
 *
 *     claim     → the risky assertion a client commonly voices
 *     triggers  → how to recognize the client is making it
 *     risk      → why it is risky (the substance of the objection)
 *     challenge → how AnA voices the pushback: polite, one line, not reflexive
 *     reframe   → the better path AnA offers after the challenge
 *     basis     → the precedent / guidance the objection rests on
 *
 * Patterns mirror the wisdom heuristics (linked via relatedHeuristic) so the
 * advice AnA gives proactively and the advice she gives reactively agree.
 *
 * Read by:
 *   - context-enrichment.ts (/challenge command + automatic detection of
 *     challengeable assertions in the user's message)
 *
 * NOT a prompt template. Structured data; the builder emits Markdown.
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 *
 * @module server/services/ana-ri/challenge-library
 */

import type { ClientSegment, LifecycleStage } from './industry-wisdom-pack.js';
import { SEGMENT_LABELS } from './industry-wisdom-pack.js';

// ─── Pattern shape ───────────────────────────────────────────────────────────

export interface ChallengePattern {
  id: string;
  /** null = applies across all segments. */
  segment: ClientSegment | null;
  stage: LifecycleStage;
  /** The risky assertion, in the client's own framing. */
  claim: string;
  /** Phrases that signal the client is asserting this. */
  triggers: RegExp[];
  /** Why the assertion is risky — the substance of the objection. */
  risk: string;
  /** How AnA should voice the pushback: polite, grounded, one line. */
  challenge: string;
  /** The better framing AnA offers after the challenge. */
  reframe: string;
  /** Precedent / guidance the objection rests on. */
  basis: string;
  /** Linked wisdom heuristic id, when there is one. */
  relatedHeuristic?: string;
}

// ─── Cross-cutting challenges ────────────────────────────────────────────────

const CROSS_CUTTING: ChallengePattern[] = [
  {
    id: 'c-skip-presub',
    segment: null,
    stage: 'pre_submission',
    claim: 'We will skip the pre-submission meeting to save time.',
    triggers: [
      /\b(?:skip|skipping|forgo|forego|drop|no need for|don.?t need|without)\b[^.?!]{0,40}\b(?:pre.?sub|pre.?ind|pre.?nda|q.?sub|meeting with (?:fda|ema))/i,
      /\b(?:pre.?sub|pre.?ind|q.?sub)\b[^.?!]{0,30}\b(?:waste|not worth|skip|too slow|save time)/i,
    ],
    risk:
      'A disagreement a 75-day meeting would have surfaced instead surfaces as a refuse-to-file, a clinical hold, or a review-cycle deficiency — months, not weeks.',
    challenge:
      'I would push back on skipping the meeting. The clock you save now is usually smaller than the clock a deficiency costs later.',
    reframe:
      'If there is a genuine uncertainty — a novel endpoint, an unagreed test method, an ambiguous predicate — bank a meeting on exactly that, with a tight question list and your own position on each.',
    basis: 'FDA Q-Submission program; pre-IND 21 CFR 312.82.',
    relatedHeuristic: 'x-presub-cheapest-risk',
  },
  {
    id: 'c-fix-cmc-later',
    segment: null,
    stage: 'nonclinical_cmc',
    claim: 'We will sort out CMC / manufacturing later; clinical comes first.',
    triggers: [
      /\b(?:cmc|manufacturing|comparability|stability)\b[^.?!]{0,30}\b(?:later|after|once|down the (?:road|line)|not (?:yet|now)|deal with.*later)/i,
      /\b(?:focus on|prioriti[sz]e)\b[^.?!]{0,20}\bclinical\b[^.?!]{0,30}\b(?:cmc|manufacturing|later)/i,
    ],
    risk:
      'CMC becomes the silent critical path. A late process or scale change forces a comparability exercise the clinical timeline has no room for.',
    challenge:
      'I would challenge sequencing CMC behind clinical. Module 3 is the part that most often slips the filing date, precisely because it is treated as a late task.',
    reframe:
      'Start comparability and stability at IND, and lock the intended commercial process before the pivotal — or budget the bridging study explicitly now.',
    basis: 'ICH Q5E, Q1A.',
    relatedHeuristic: 'bio-cmc-is-the-critical-path',
  },
  {
    id: 'c-file-and-respond',
    segment: null,
    stage: 'submission',
    claim: 'We will just file and respond to deficiencies as they come.',
    triggers: [
      /\b(?:just|simply)?\s*file\b[^.?!]{0,30}\b(?:respond|deal with|fix|address)\b[^.?!]{0,20}\bdeficien/i,
      /\bfile (?:it )?now\b[^.?!]{0,30}\b(?:sort|fix|clean).*(?:later|after)/i,
    ],
    risk:
      'A deficiency on the critical path costs a full review cycle. Filing into known gaps converts months of preventable rework into review-clock delay and reviewer distrust.',
    challenge:
      'I would push back on filing into known gaps. A deficiency you could have closed pre-file becomes a review-cycle delay once the clock is running.',
    reframe:
      'Run a readiness pass and close the critical gaps first. File when the known issues are resolved, not when the calendar says so.',
    basis: 'FDA refuse-to-file / complete-response patterns.',
  },
  {
    id: 'c-designation-discount',
    segment: null,
    stage: 'strategy',
    claim: 'Breakthrough / Fast Track means we need less data.',
    triggers: [
      /\b(?:breakthrough|fast.?track|prime|sakigake|rmat|accelerated)\b[^.?!]{0,40}\b(?:less data|lower bar|shortcut|don.?t need|fewer (?:studies|patients)|skip)/i,
      /\b(?:designation|expedited)\b[^.?!]{0,30}\b(?:means|so) (?:we )?(?:need )?less\b/i,
    ],
    risk:
      'The program plans against a discount that does not exist, under-builds the evidence, and meets the same approval standard late.',
    challenge:
      'I would gently correct that. An expedited designation speeds interaction — rolling review, more FDA contact — but it does not lower the evidence bar.',
    reframe:
      'Use the designation for the access it gives you, and build the evidence package as if the designation were not there.',
    basis: 'FDA expedited programs guidance (2014); EMA PRIME.',
    relatedHeuristic: 'x-designation-is-not-a-data-discount',
  },
  {
    id: 'c-summaries-formatting',
    segment: null,
    stage: 'submission',
    claim: 'The Module 2 summaries are just formatting; the study reports carry the weight.',
    triggers: [
      /\b(?:summaries|module 2|2\.5|2\.7)\b[^.?!]{0,30}\b(?:just|only|merely)\b[^.?!]{0,20}\b(?:formatting|format|boilerplate|admin)/i,
      /\b(?:don.?t (?:over)?invest|skip|rush)\b[^.?!]{0,20}\bsummaries\b/i,
    ],
    risk:
      'The reviewer forms their view from the summaries. A strong dataset behind a weak 2.5 still draws questions, because the visible argument is the weak one.',
    challenge:
      'I would push back there. The summaries are the argument the reviewer actually reads first, not a formatting layer.',
    reframe:
      'Write 2.5 and 2.7 as the persuasive spine, so the benefit-risk conclusion follows inevitably from the evidence presented above it.',
    basis: 'ICH M4; CTD design intent.',
    relatedHeuristic: 'x-summaries-carry-the-argument',
  },
  {
    id: 'c-reconcile-later',
    segment: null,
    stage: 'submission',
    claim: 'We can reconcile the numbers across documents at the end.',
    triggers: [
      /\b(?:reconcile|align|match)\b[^.?!]{0,25}\b(?:numbers|counts|figures|data)\b[^.?!]{0,20}\b(?:later|at the end|before (?:we )?(?:file|submit)|eventually)/i,
    ],
    risk:
      'Reviewers cross-check protocol, SAP, CSR, and summaries. Every unexplained discrepancy becomes an information request that can stop the clock.',
    challenge:
      'I would challenge leaving reconciliation to the end. Discrepancies between the SAP, CSR, and summaries are one of the most reliable sources of health-authority questions.',
    reframe:
      'Reconcile the load-bearing numbers as you go, and where a number legitimately changed, state why once, visibly.',
    basis: 'Recurring HAQ pattern across FDA and EMA.',
    relatedHeuristic: 'x-cross-module-consistency-is-graded',
  },
];

// ─── Medical device / IVD challenges ─────────────────────────────────────────

const MDX_CHALLENGES: ChallengePattern[] = [
  {
    id: 'c-closest-predicate-best',
    segment: 'mdx',
    stage: 'strategy',
    claim: 'Our predicate is the closest technological match, so it is the best choice.',
    triggers: [
      /\b(?:closest|most similar|best)\b[^.?!]{0,20}\bpredicate\b/i,
      /\bpredicate\b[^.?!]{0,20}\b(?:closest|most similar) (?:match|technolog)/i,
    ],
    risk:
      'A predicate with a refuse-to-file, recall, or split-predicate history pulls extra scrutiny onto your substantial-equivalence argument, and can force testing you did not budget for.',
    challenge:
      'I would push back on choosing by similarity alone. The predicate inherits its own regulatory history, and the closest match is sometimes the one carrying the most baggage.',
    reframe:
      'Run a predicate toxicity check first. A clean, recently cleared predicate with the same intended use usually beats a closer match with a troubled record.',
    basis: '21 CFR 807.92; FDA SE guidance (2014).',
    relatedHeuristic: 'mdx-predicate-inherits-scrutiny',
  },
  {
    id: 'c-mdr-equals-510k',
    segment: 'mdx',
    stage: 'strategy',
    claim: 'We will reuse the 510(k) equivalence story for the EU MDR CER.',
    triggers: [
      /\b(?:reuse|same|copy|translate|port)\b[^.?!]{0,30}\b(?:510\(?k\)?|se|equivalence)\b[^.?!]{0,30}\b(?:mdr|cer|eu|europe)/i,
      /\b(?:literature|equivalence)\b[^.?!]{0,25}\b(?:clear|cover|enough|sufficient)\b[^.?!]{0,20}\bmdr\b/i,
    ],
    risk:
      'MDR demands demonstrated clinical-evidence sufficiency and PMCF; the equivalence route now needs contractual access to the equivalent device data and is hard to sustain for a higher-risk class.',
    challenge:
      'I would push back on porting the US story to the EU. An MDR CER is not a translated 510(k); the equivalence route is far narrower under MDR.',
    reframe:
      'Plan EU clinical evidence and PMCF as a distinct workstream, and engage a Notified Body early for capacity.',
    basis: 'EU MDR 2017/745 Annex XIV; MDCG 2020-5/2020-6.',
    relatedHeuristic: 'mdx-mdr-is-not-a-510k-copy',
  },
  {
    id: 'c-estar-minor',
    segment: 'mdx',
    stage: 'submission',
    claim: 'The missing eSTAR field is minor; the science is strong.',
    triggers: [
      /\b(?:missing|empty|incomplete|skip)\b[^.?!]{0,25}\bestar\b/i,
      /\bestar\b[^.?!]{0,25}\b(?:minor|not important|later|good enough)/i,
    ],
    risk:
      'eSTAR completeness is a binary gate. A single unpopulated required field triggers an RTA hold regardless of how strong the evidence is — the clock never starts.',
    challenge:
      'I would push back on treating the eSTAR gap as minor. Completeness is a hard gate, independent of the science.',
    reframe:
      'Run the eSTAR validator to a clean pass before transmit, and treat any RTA risk as a checklist item to close.',
    basis: 'FDA eSTAR mandatory for 510(k) since Oct 2023; RTA policy.',
    relatedHeuristic: 'mdx-estar-completeness-is-binary',
  },
];

// ─── Biotech challenges ──────────────────────────────────────────────────────

const BIOTECH_CHALLENGES: ChallengePattern[] = [
  {
    id: 'c-potency-later',
    segment: 'biotech',
    stage: 'nonclinical_cmc',
    claim: 'We will mature the potency assay later; a placeholder is fine for now.',
    triggers: [
      /\bpotency (?:assay|test)\b[^.?!]{0,30}\b(?:later|placeholder|mature|after|not yet|good enough)/i,
      /\b(?:defer|postpone|delay)\b[^.?!]{0,20}\bpotency\b/i,
    ],
    risk:
      'CBER expects a validated, mechanism-relevant potency assay. An immature one draws a clinical hold or a BLA deficiency, and re-bridging lots to a new assay late is expensive.',
    challenge:
      'I would push back on deferring the potency assay. For an advanced therapy it is the single attribute most likely to draw a clinical hold if it is immature.',
    reframe:
      'Define the potency-assay strategy now and build the assay matrix toward a mechanism-relevant measure, paired with biodistribution and long-term follow-up.',
    basis: 'FDA CGT potency guidance; ICH S12.',
    relatedHeuristic: 'bio-potency-assay-early',
  },
  {
    id: 'c-supplier-swap',
    segment: 'biotech',
    stage: 'nonclinical_cmc',
    claim: 'We will switch the drug-substance supplier before the pivotal; it is fine.',
    triggers: [
      /\b(?:switch|change|swap|move)\b[^.?!]{0,30}\b(?:supplier|site|manufacturer|cdmo|cmo)\b[^.?!]{0,30}\b(?:before|during|ahead of)\b[^.?!]{0,15}\bpivotal/i,
      /\b(?:new|different)\b[^.?!]{0,15}\b(?:supplier|site)\b[^.?!]{0,25}\bpivotal\b/i,
    ],
    risk:
      'If the pivotal material is not the commercial material, you may owe a comparability bridge — and in the worst case a clinical bridge — to show the change did not alter safety or efficacy.',
    challenge:
      'I would push back on a supplier change right before the pivotal. The cost is usually a comparability bridge you have not scoped.',
    reframe:
      'Freeze the commercial process and supplier before the pivotal where you can. If the change is unavoidable, scope the comparability bridge now, not at BLA.',
    basis: 'ICH Q5E comparability.',
    relatedHeuristic: 'bio-supplier-change-before-pivotal',
  },
  {
    id: 'c-accelerated-confirmatory-later',
    segment: 'biotech',
    stage: 'clinical',
    claim: 'We will run the confirmatory trial after accelerated approval.',
    triggers: [
      /\bconfirmatory (?:trial|study)\b[^.?!]{0,30}\b(?:after|post|later|once approved|following)\b/i,
      /\baccelerated\b[^.?!]{0,30}\bconfirmatory\b[^.?!]{0,20}\blater\b/i,
    ],
    risk:
      'FDA increasingly expects the confirmatory trial to be enrolling at the time of accelerated approval. A vague post-marketing plan weakens the filing and invites delay.',
    challenge:
      'I would push back on leaving the confirmatory trial for after approval. The expectation now is that it is already underway.',
    reframe:
      'Design and ideally start the confirmatory trial before the accelerated filing, with a defensible link between the surrogate and clinical benefit.',
    basis: '21 CFR 314 Subpart H / 601 Subpart E; FDORA 2022.',
    relatedHeuristic: 'bio-accelerated-needs-confirmatory',
  },
];

// ─── Pharma challenges ───────────────────────────────────────────────────────

const PHARMA_CHALLENGES: ChallengePattern[] = [
  {
    id: 'c-carc-later',
    segment: 'pharma',
    stage: 'nonclinical_cmc',
    claim: 'The carcinogenicity / chronic-tox study can start later.',
    triggers: [
      /\b(?:carcinogenicity|carc|chronic.?tox|2.?year (?:rat|rodent))\b[^.?!]{0,30}\b(?:later|after|wait|not yet|once|down the (?:road|line))/i,
      /\b(?:defer|postpone|delay)\b[^.?!]{0,20}\b(?:carcinogenicity|chronic.?tox)/i,
    ],
    risk:
      'A multi-year study cannot be compressed. Started late, it becomes the gating item for the NDA, stranding an otherwise ready clinical and CMC package.',
    challenge:
      'I would push back on deferring the carcinogenicity work. It is the long pole — start it late and it dictates your NDA date.',
    reframe:
      'Map the nonclinical critical path against the NDA date now, and start the long-duration studies on the schedule the filing needs.',
    basis: 'ICH S1A/S1B, S4.',
    relatedHeuristic: 'pharma-nonclinical-long-pole',
  },
  {
    id: 'c-qt-ddi-later',
    segment: 'pharma',
    stage: 'clinical',
    claim: 'We will defer the QT and drug-interaction studies until late.',
    triggers: [
      /\b(?:qt|tqt|c.?qtc|ddi|drug.?interaction)\b[^.?!]{0,30}\b(?:later|defer|after|not yet|end of)/i,
      /\b(?:skip|postpone)\b[^.?!]{0,20}\b(?:qt|ddi|drug.?interaction)/i,
    ],
    risk:
      'A late QT or DDI signal lands directly in the label, can drive a REMS or contraindication, and may force additional studies that move the filing.',
    challenge:
      'I would push back on deferring QT and DDI. Found late, these become labeling negotiations rather than design choices.',
    reframe:
      'Plan the concentration-QTc analysis and the DDI program early so the liability is characterized and managed before it is a label problem.',
    basis: 'ICH E14(R3), M12.',
    relatedHeuristic: 'pharma-qt-ddi-early',
  },
  {
    id: 'c-global-data-asia',
    segment: 'pharma',
    stage: 'strategy',
    claim: 'Our global dataset will be enough for Japan and China.',
    triggers: [
      /\b(?:global|existing|same) (?:data|dataset|trial)\b[^.?!]{0,35}\b(?:enough|sufficient|cover|work|fine)\b[^.?!]{0,20}\b(?:japan|china|pmda|nmpa|asia)/i,
      /\b(?:japan|china|pmda|nmpa)\b[^.?!]{0,25}\b(?:reuse|same|global) data\b/i,
    ],
    risk:
      'PMDA and NMPA expect adequate local or bridging data. A global trial with thin regional enrollment forces a separate bridging study and a later Asian filing.',
    challenge:
      'I would push back on assuming global data transfers. Both PMDA and NMPA generally expect adequate local or bridging data.',
    reframe:
      'Either design the pivotal as a multi-regional trial under ICH E17 with pre-agreed regional sample sizes, or plan the bridging study explicitly into the Asia strategy.',
    basis: 'ICH E5(R1), E17; PMDA and NMPA expectations.',
    relatedHeuristic: 'pharma-mrct-regional-data',
  },
  {
    id: 'c-pediatric-after-approval',
    segment: 'pharma',
    stage: 'strategy',
    claim: 'The pediatric plan can wait until after the adult approval.',
    triggers: [
      /\b(?:pediatric|paediatric|ipsp|pip|prea)\b[^.?!]{0,30}\b(?:later|after (?:approval|the nda|the maa)|wait|downstream|not yet)/i,
    ],
    risk:
      'A missing or late iPSP/PIP can block acceptance of the adult MAA in the EU and create a PREA gap at FDA.',
    challenge:
      'I would push back on deferring the pediatric plan. It can hold the adult filing hostage rather than waiting politely behind it.',
    reframe:
      'File the iPSP and agree the PIP on the regulator timeline — typically end of Phase 2 — so pediatric obligations do not stall the adult submission.',
    basis: 'FDA PREA; EU Paediatric Regulation.',
    relatedHeuristic: 'pharma-pediatric-blocks-adult',
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

export const CHALLENGE_PATTERNS: ChallengePattern[] = [
  ...CROSS_CUTTING,
  ...MDX_CHALLENGES,
  ...BIOTECH_CHALLENGES,
  ...PHARMA_CHALLENGES,
];

// ─── Detection ───────────────────────────────────────────────────────────────

/**
 * Detect challengeable assertions in the user's message. Returns the patterns
 * whose triggers match, optionally narrowed to a segment (cross-cutting
 * patterns always remain eligible).
 */
export function detectChallengeableClaims(
  message: string,
  segment?: ClientSegment | null,
): ChallengePattern[] {
  return CHALLENGE_PATTERNS.filter((p) => {
    const segOk = p.segment === null || !segment || p.segment === segment;
    if (!segOk) return false;
    return p.triggers.some((t) => t.test(message));
  });
}

// ─── Rendering ───────────────────────────────────────────────────────────────

/**
 * Build a Markdown block priming AnA to push back on the detected assertions.
 * Returns '' when nothing is challengeable, so the caller can skip the section.
 */
export function buildChallengeBlock(opts: {
  message: string;
  segment?: ClientSegment | null;
  limit?: number;
}): string {
  const matched = detectChallengeableClaims(opts.message, opts.segment).slice(0, opts.limit ?? 3);
  if (matched.length === 0) return '';

  const lines = matched.map((p) => {
    const scope = p.segment === null ? 'all segments' : SEGMENT_LABELS[p.segment];
    return (
      `### The user appears to be asserting: "${p.claim}"\n` +
      `_${scope} · ${p.stage.replace(/_/g, ' ')}_\n` +
      `- **Why it is risky:** ${p.risk}\n` +
      `- **How to challenge (politely, once):** ${p.challenge}\n` +
      `- **The better path to offer:** ${p.reframe}\n` +
      `- **Ground it in:** ${p.basis}`
    );
  });

  return (
    `\n\n## Constructive challenge — push back, politely\n` +
    `The user's message contains an assertion that experience says is risky. Apply your Constructive Dissent doctrine: ` +
    `acknowledge what is right in their thinking first, then state the objection once and plainly, ground it in the basis below, ` +
    `and offer the better path. Do not lecture, and do not relitigate if they hear you and still choose their route — ` +
    `note the residual risk for the record and move on. If their plan is actually sound in context, say so instead of inventing a disagreement.\n\n` +
    lines.join('\n\n')
  );
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getChallengePattern(id: string): ChallengePattern | null {
  return CHALLENGE_PATTERNS.find((p) => p.id === id) ?? null;
}

export function listChallengesForSegment(segment: ClientSegment): ChallengePattern[] {
  return CHALLENGE_PATTERNS.filter((p) => p.segment === segment || p.segment === null);
}
