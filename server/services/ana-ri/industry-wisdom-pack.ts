/**
 * Industry wisdom pack — the experiential lore AnA draws on to reason like a
 * veteran, not a guideline index.
 *
 * Her regulatory-brain knowledge (persona.ts) covers what the rules ARE. This
 * pack covers what experience teaches: the mistake first-time sponsors make,
 * what actually triggers a refuse-to-file, what separates a fundable program
 * from a stalled one. Each heuristic is structured as:
 *
 *     situation  → the pattern a veteran recognizes
 *     consequence → what it costs the program if ignored
 *     veteranMove → what someone who has done this before does instead
 *     basis       → the precedent / guidance / pattern it rests on
 *
 * Keyed by client segment (mdx / biotech / pharma) and lifecycle stage so the
 * enrichment layer injects only the slice that bears on the user's situation.
 *
 * Read by:
 *   - context-enrichment.ts (/wisdom command + natural-language triggers; picks
 *     a segment + stage and emits the relevant heuristics)
 *
 * NOT a prompt template. This is structured data; the builder emits Markdown.
 *
 * Tone floor (enforced by ana-ri.test.ts): no emoji, no exclamation marks.
 * This copy is the source of AnA's voice — it must read like a reviewer-grade
 * colleague, not a marketing deck.
 *
 * @module server/services/ana-ri/industry-wisdom-pack
 */

// ─── Segments & stages ───────────────────────────────────────────────────────

/** The three client segments AnA serves. */
export type ClientSegment = 'mdx' | 'biotech' | 'pharma';

/** Program lifecycle stages, shared across segments. */
export type LifecycleStage =
  | 'strategy'          // pathway selection, target product profile, funding case
  | 'nonclinical_cmc'   // tox, manufacturing, analytical, comparability
  | 'clinical'          // trial design, endpoints, conduct
  | 'pre_submission'    // Pre-Sub / pre-IND / pre-NDA, readiness, gap closure
  | 'submission'        // compile, validate, transmit
  | 'agency_interaction'// HAQs, deficiency letters, meetings, commitments
  | 'lifecycle';        // post-approval, variations, pharmacovigilance, expansion

export const LIFECYCLE_STAGES: LifecycleStage[] = [
  'strategy',
  'nonclinical_cmc',
  'clinical',
  'pre_submission',
  'submission',
  'agency_interaction',
  'lifecycle',
];

export const SEGMENT_LABELS: Record<ClientSegment, string> = {
  mdx: 'Medical device / IVD',
  biotech: 'Biotech (biologics, cell & gene therapy)',
  pharma: 'Pharma (small molecule, lifecycle)',
};

// ─── Heuristic shape ─────────────────────────────────────────────────────────

export interface WisdomHeuristic {
  id: string;
  /** null = cross-cutting wisdom that applies to every segment. */
  segment: ClientSegment | null;
  stage: LifecycleStage;
  /** Short title a human would recognize. */
  title: string;
  /** The pattern a veteran spots. */
  situation: string;
  /** What it costs the program if ignored. */
  consequence: string;
  /** What an experienced operator does instead. */
  veteranMove: string;
  /** Precedent / guidance / pattern the heuristic rests on. */
  basis: string;
}

// ─── Cross-cutting wisdom (applies to all segments) ──────────────────────────

const CROSS_CUTTING: WisdomHeuristic[] = [
  {
    id: 'x-presub-cheapest-risk',
    segment: null,
    stage: 'pre_submission',
    title: 'A pre-submission meeting is the cheapest risk reduction you will buy',
    situation:
      'A team skips a Pre-Sub, pre-IND, or pre-NDA meeting to save calendar time, and files on assumptions the agency never agreed to.',
    consequence:
      'A disagreement that a 75-day meeting would have surfaced instead surfaces as a refuse-to-file, a clinical hold, or a review-cycle deficiency — each of which costs months, not weeks.',
    veteranMove:
      'Bank a meeting against any genuine uncertainty: a novel endpoint, an unagreed test method, an ambiguous predicate, a surrogate endpoint. Walk in with a specific question list and your own position on each, not open-ended asks.',
    basis: 'FDA Q-Submission program; pre-IND (21 CFR 312.82) and Type B/C meeting practice.',
  },
  {
    id: 'x-summaries-carry-the-argument',
    segment: null,
    stage: 'submission',
    title: 'The reviewer reads the summary, not your heart',
    situation:
      'A team pours effort into Module 4/5 study reports and treats the Module 2 summaries (2.4, 2.5, 2.7) as a formatting exercise.',
    consequence:
      'The primary reviewer forms their view from the summaries. A strong dataset behind a weak 2.5 still draws questions, because the argument the reviewer can see is the weak one.',
    veteranMove:
      'Write the summaries as the persuasive spine of the submission. Make the benefit-risk conclusion in 2.5.6 follow inevitably from the evidence you have actually presented above it.',
    basis: 'ICH M4; CTD design intent — summaries are the reviewer-facing argument layer.',
  },
  {
    id: 'x-cross-module-consistency-is-graded',
    segment: null,
    stage: 'submission',
    title: 'Numbers that do not reconcile generate health-authority questions',
    situation:
      'Patient counts, effect sizes, or analysis populations differ between the protocol, the SAP, the CSR, and the Module 2 summary because they were written by different people at different times.',
    consequence:
      'Reviewers cross-check. Every unexplained discrepancy becomes an information request, each of which can stop the clock and erode confidence in the rest of the file.',
    veteranMove:
      'Reconcile the load-bearing numbers across protocol, SAP, CSR, and summaries before filing. Where a number legitimately changed, state why once, visibly, rather than letting the reviewer find it.',
    basis: 'Recurring HAQ / deficiency pattern across FDA and EMA review cycles.',
  },
  {
    id: 'x-fundable-vs-stalled',
    segment: null,
    stage: 'strategy',
    title: 'What gets a program funded is a credible dated path, not a longer asset list',
    situation:
      'A team pitches breadth — more indications, more data, more optionality — when an investor or board is deciding whether to fund the next milestone.',
    consequence:
      'Optionality without a sequenced regulatory path reads as the absence of a decision. Capital follows de-risking milestones with dates, not a wider surface area.',
    veteranMove:
      'Lead with one credible pathway, the next two de-risking milestones, their dates, and the specific regulatory risk each one retires. Name what would change the plan.',
    basis: 'Due-diligence pattern; expedited-pathway sequencing (Fast Track, Breakthrough, Accelerated Approval).',
  },
  {
    id: 'x-designation-is-not-a-data-discount',
    segment: null,
    stage: 'strategy',
    title: 'An expedited designation speeds interaction; it does not lower the evidence bar',
    situation:
      'A team treats Breakthrough, Fast Track, PRIME, or SAKIGAKE as a shortcut that reduces how much evidence the approval needs.',
    consequence:
      'The program plans against a discount that does not exist, under-builds the evidence package, and meets the same approval standard late.',
    veteranMove:
      'Use the designation for what it gives you — rolling review, more frequent FDA contact, senior reviewer attention — and build the evidence as if the designation were not there.',
    basis: 'FDA expedited programs guidance (2014); EMA PRIME; PMDA SAKIGAKE.',
  },
  {
    id: 'x-minutes-are-the-record',
    segment: null,
    stage: 'agency_interaction',
    title: 'The official minutes are the record, not what you remember hearing',
    situation:
      'A team leaves a meeting confident the agency agreed to something, but the agreement never makes it into the official minutes, or the team accepts the agency minutes without correcting an error.',
    consequence:
      'A verbal understanding that is not in the minutes does not bind the agency. Months later the reviewer holds you to what the minutes say, not what you recall.',
    veteranMove:
      'Submit your own minutes or formally request corrections within the comment window. Treat anything material that is not in the written record as not agreed.',
    basis: 'FDA formal meeting procedures (PDUFA); EMA scientific advice letters as the binding record.',
  },
  {
    id: 'x-answer-the-question-asked',
    segment: null,
    stage: 'agency_interaction',
    title: 'Answer the question the agency asked, not the one you wish they had',
    situation:
      'Facing a deficiency or information request, a team responds with the argument it prefers rather than the specific evidence the reviewer asked for.',
    consequence:
      'A non-responsive answer reads as evasive, extends the review cycle, and often draws a sharper repeat of the same question.',
    veteranMove:
      'Restate the question, answer it directly with the evidence requested, and only then add context. If you cannot meet the request, say so plainly and propose what you can provide.',
    basis: 'Recurring pattern in FDA information-request and EMA major-objection cycles.',
  },
  {
    id: 'x-confirmatory-evidence-before-you-need-it',
    segment: null,
    stage: 'clinical',
    title: 'Decide what would change your mind before the data arrive',
    situation:
      'A team designs a pivotal without pre-specifying how it will read a borderline or mixed result, then argues the interpretation after unblinding.',
    consequence:
      'Post-hoc interpretation of a borderline result is the weakest position in front of a reviewer, and a poorly pre-specified secondary analysis cannot rescue a missed primary.',
    veteranMove:
      'Pre-specify the estimand, the success criterion, and the multiplicity strategy. Decide before unblinding what result would and would not support the claim.',
    basis: 'ICH E9(R1) estimand framework; pre-specification expectations at FDA and EMA.',
  },
];

// ─── Medical device / IVD wisdom ─────────────────────────────────────────────

const MDX_WISDOM: WisdomHeuristic[] = [
  {
    id: 'mdx-predicate-inherits-scrutiny',
    segment: 'mdx',
    stage: 'strategy',
    title: 'Your predicate inherits its own regulatory history',
    situation:
      'A team anchors a 510(k) on the most similar-looking predicate without checking whether that predicate or its lineage has a refuse-to-file, recall, or split-predicate history.',
    consequence:
      'A predicate with a troubled history pulls extra scrutiny onto your substantial-equivalence argument, and a split-predicate or NSE-prone lineage can force performance testing you did not budget for.',
    veteranMove:
      'Run a predicate toxicity check before committing. Prefer a clean, recently cleared predicate with the same intended use over a closer technological match with a problematic record.',
    basis: '21 CFR 807.92; FDA "Evaluating Substantial Equivalence in 510(k)" (2014).',
  },
  {
    id: 'mdx-estar-completeness-is-binary',
    segment: 'mdx',
    stage: 'submission',
    title: 'eSTAR completeness is a binary gate, independent of your science',
    situation:
      'A team treats a missing eSTAR field as a minor formatting gap on an otherwise strong submission.',
    consequence:
      'A single unpopulated required field triggers an RTA hold regardless of how strong the underlying evidence is. The clock does not start.',
    veteranMove:
      'Run the eSTAR validator to a clean pass before transmit and treat any RTA risk as a checklist failure to close, not a scientific judgment to argue.',
    basis: 'FDA eSTAR mandatory for 510(k) since Oct 2023; RTA policy.',
  },
  {
    id: 'mdx-presub-novel-method',
    segment: 'mdx',
    stage: 'pre_submission',
    title: 'File a Pre-Sub on any novel test method or predicate ambiguity',
    situation:
      'A device uses a performance test method, sample size, or acceptance criterion FDA has not previously agreed to, and the team files the 510(k) blind to save time.',
    consequence:
      'FDA disputes the method in an Additional Information letter, the testing has to be redone, and the response cycle costs far more than the 75-day Pre-Sub would have.',
    veteranMove:
      'Use a Pre-Sub to get FDA agreement on the test method and acceptance criteria before running the pivotal bench or clinical testing — not after.',
    basis: 'FDA Q-Submission program (Sep 2023 rev).',
  },
  {
    id: 'mdx-mdr-is-not-a-510k-copy',
    segment: 'mdx',
    stage: 'strategy',
    title: 'An EU MDR CER is not a translated 510(k)',
    situation:
      'A team plans to reuse the US substantial-equivalence story as the EU clinical evaluation, assuming the equivalence route will clear the device under MDR.',
    consequence:
      'MDR demands demonstrated clinical-evidence sufficiency and PMCF; the equivalence route now requires contractual access to the equivalent device data and is hard to sustain. The CER becomes the critical path to CE marking.',
    veteranMove:
      'Plan EU clinical evidence and a PMCF strategy early as a distinct workstream. Do not assume literature plus equivalence will carry a Class IIb/III device.',
    basis: 'EU MDR 2017/745 Annex XIV; MDCG 2020-5/2020-6.',
  },
  {
    id: 'mdx-samd-needs-a-pccp',
    segment: 'mdx',
    stage: 'clinical',
    title: 'An ML-enabled device that will change needs a predetermined change control plan',
    situation:
      'A software/AI device is built to be retrained or updated post-clearance, but the submission locks a single static version with no plan for change.',
    consequence:
      'Every model update then requires a new submission, or the team ships changes the clearance does not cover — a compliance exposure.',
    veteranMove:
      'File a Predetermined Change Control Plan describing the modifications you anticipate and the methods that bound them, so in-scope updates do not each need a new 510(k).',
    basis: 'FDA PCCP guidance (2024); IEC 62304 for software lifecycle.',
  },
  {
    id: 'mdx-commitments-resurface',
    segment: 'mdx',
    stage: 'agency_interaction',
    title: 'Open Pre-Sub commitments re-surface as submission deficiencies',
    situation:
      'A team captures FDA feedback and commitments from a Pre-Sub, then files without rolling every commitment into the dossier.',
    consequence:
      'Each unaddressed commitment returns as a deficiency in the marketing-submission review, now on the critical path instead of months ahead of it.',
    veteranMove:
      'Track every commitment to either rolled-in or explicitly deferred-with-justification, and confirm none is open within two weeks of transmit.',
    basis: 'Q-Submission feedback practice; recurring AI-letter pattern.',
  },
  {
    id: 'mdx-pms-is-not-paperwork',
    segment: 'mdx',
    stage: 'lifecycle',
    title: 'Under MDR, post-market surveillance feeds the clinical evidence — it is not filing-and-forgetting',
    situation:
      'After CE marking, a team treats the PMS plan, PMCF, and PSUR as a compliance archive rather than a live input to the clinical evaluation.',
    consequence:
      'Notified Body surveillance audits check that PMS and PMCF actually update the CER and risk file. A dormant PMS system is a common finding that can suspend the certificate.',
    veteranMove:
      'Wire PMS and PMCF outputs back into the CER and risk management file on the planned cadence, and keep the PSUR current for Class IIa and above.',
    basis: 'EU MDR 2017/745 Articles 83-86, Annex XIV Part B; MDCG PMS guidance.',
  },
  {
    id: 'mdx-ivdr-transition-underestimated',
    segment: 'mdx',
    stage: 'strategy',
    title: 'IVDR reclassified most assays into Notified-Body territory',
    situation:
      'An IVD team assumes the legacy IVDD self-certification path still applies, or underestimates how many products IVDR pushes into Class B/C/D requiring a Notified Body.',
    consequence:
      'Under IVDR the large majority of assays now need Notified Body involvement and performance evidence the IVDD never required; capacity constraints make this a multi-year timeline, not a paperwork update.',
    veteranMove:
      'Classify each assay under the IVDR rules early, secure Notified Body capacity, and budget the performance-evaluation evidence the new class demands.',
    basis: 'EU IVDR 2017/746 classification rules (Annex VIII); staggered transition timelines.',
  },
];

// ─── Biotech wisdom (biologics, cell & gene) ─────────────────────────────────

const BIOTECH_WISDOM: WisdomHeuristic[] = [
  {
    id: 'bio-cmc-is-the-critical-path',
    segment: 'biotech',
    stage: 'nonclinical_cmc',
    title: 'For a biologic, CMC is the silent critical path to BLA',
    situation:
      'Clinical hits the gas while CMC is under-resourced; comparability and stability are treated as a late, mechanical task.',
    consequence:
      'Module 3 becomes the rate-limiter at BLA. A late process or scale change forces a comparability exercise that the clinical timeline has no room for.',
    veteranMove:
      'Start the comparability and stability programs at IND, not Phase 3. Lock the intended commercial process before the pivotal trial, or budget explicitly for a bridging comparability study.',
    basis: 'ICH Q5E, Q1A; common BLA review finding.',
  },
  {
    id: 'bio-potency-assay-early',
    segment: 'biotech',
    stage: 'nonclinical_cmc',
    title: 'A gene or cell therapy lives or dies on its potency assay',
    situation:
      'A team defers locking a potency assay strategy, assuming a placeholder will mature into the commercial assay later.',
    consequence:
      'CBER expects a validated, mechanism-relevant potency assay; an immature one draws a clinical hold or a BLA deficiency, and re-bridging lots to a new assay late is expensive.',
    veteranMove:
      'Define the potency-assay strategy early and build the matrix of assays toward a mechanism-relevant measure. Pair it with a biodistribution plan and the long-term follow-up the modality requires.',
    basis: 'FDA CGT CMC and potency guidance; ICH S12 biodistribution; 15-year LTFU expectation for integrating vectors.',
  },
  {
    id: 'bio-supplier-change-before-pivotal',
    segment: 'biotech',
    stage: 'nonclinical_cmc',
    title: 'Changing a drug-substance supplier before the pivotal can cost you a bridging study',
    situation:
      'A team switches DS supplier or manufacturing site for cost or capacity reasons late in development, near or during the pivotal trial.',
    consequence:
      'If the material in the pivotal is not the commercial material, you may owe a comparability bridge, and in the worst case a clinical bridge, to show the change did not alter safety or efficacy.',
    veteranMove:
      'Freeze the commercial process and supplier before the pivotal where possible. If a change is unavoidable, scope the comparability bridge up front rather than discovering it at BLA.',
    basis: 'ICH Q5E comparability; FDA/EMA post-change expectations.',
  },
  {
    id: 'bio-accelerated-needs-confirmatory',
    segment: 'biotech',
    stage: 'clinical',
    title: 'Accelerated approval on a surrogate now requires the confirmatory trial underway',
    situation:
      'A team plans an accelerated-approval filing on a surrogate endpoint and treats the confirmatory trial as a post-approval problem to solve later.',
    consequence:
      'FDA increasingly expects the confirmatory trial to be enrolling at the time of accelerated approval; a vague post-marketing plan weakens the filing and invites a delay.',
    veteranMove:
      'Design and ideally start the confirmatory trial before the accelerated filing. Tie the surrogate to the clinical benefit with a defensible mechanistic and statistical argument.',
    basis: '21 CFR 314 Subpart H / 601 Subpart E; FDORA 2022 confirmatory-trial provisions.',
  },
  {
    id: 'bio-comparability-after-formulation-change',
    segment: 'biotech',
    stage: 'clinical',
    title: 'Immunogenicity is the question behind most biologic comparability concerns',
    situation:
      'A formulation, container-closure, or process change is assessed only on analytical and PK comparability, treating immunogenicity risk as covered.',
    consequence:
      'A change that shifts aggregation or post-translational profile can alter immunogenicity, which analytical comparability alone does not rule out — and reviewers will ask.',
    veteranMove:
      'Frame comparability around the immunogenicity risk explicitly: characterize aggregates and critical quality attributes, and pre-specify whether an immunogenicity bridge is needed.',
    basis: 'ICH Q5E, Q6B; FDA/EMA immunogenicity guidance.',
  },
  {
    id: 'bio-orphan-strategy-sequencing',
    segment: 'biotech',
    stage: 'strategy',
    title: 'Orphan designation, pediatric obligations, and the adult filing have to be sequenced together',
    situation:
      'A team pursues orphan designation and an adult indication without mapping the pediatric plan, assuming pediatric obligations come later.',
    consequence:
      'A missing or late iPSP/PIP can delay or block the adult NDA/MAA; orphan status changes — but does not remove — the pediatric calculus in the EU.',
    veteranMove:
      'Map orphan designation, the iPSP/PIP timeline, and the adult filing as one sequence. File pediatric plans at end of Phase 2, not at submission.',
    basis: 'FDA PREA / iPSP timing; EU Paediatric Regulation; orphan exemptions and their limits.',
  },
  {
    id: 'bio-crl-is-a-roadmap',
    segment: 'biotech',
    stage: 'agency_interaction',
    title: 'A complete response letter is a roadmap, not a verdict',
    situation:
      'A team reacts to a CRL by resubmitting piecemeal fixes to the deficiencies it finds easiest, or by relitigating the agency\'s judgment.',
    consequence:
      'A response that leaves any cited deficiency unaddressed restarts the review clock without resolving the file, and arguing the science the agency already weighed rarely lands.',
    veteranMove:
      'Request a Type A meeting to confirm the path, address every deficiency in the letter, and align the resubmission class with the work actually required rather than the timeline you wish for.',
    basis: '21 CFR 314.110 / 601.3; FDA Type A post-action meeting practice.',
  },
  {
    id: 'bio-cgt-manufacturing-is-the-product',
    segment: 'biotech',
    stage: 'lifecycle',
    title: 'For an advanced therapy, the manufacturing process effectively is the product',
    situation:
      'A cell or gene therapy team plans a post-approval process change, site transfer, or scale-up as if it were a conventional CMC variation.',
    consequence:
      'Because the process defines the product, even a modest change can require comparability that approaches a new characterization package, and an unplanned change can put supply or the license at risk.',
    veteranMove:
      'Treat any process change as a comparability exercise scoped to the modality, plan changes against the approved control strategy, and use the established-conditions framework to bound what is reportable.',
    basis: 'ICH Q5E; FDA CGT CMC expectations; ICH Q12 established conditions.',
  },
];

// ─── Pharma wisdom (small molecule, lifecycle) ───────────────────────────────

const PHARMA_WISDOM: WisdomHeuristic[] = [
  {
    id: 'pharma-nonclinical-long-pole',
    segment: 'pharma',
    stage: 'nonclinical_cmc',
    title: 'The 2-year carcinogenicity study is the long pole nobody schedules early enough',
    situation:
      'A team paces nonclinical to the clinical program and discovers late that the rodent carcinogenicity, full reproductive-tox, or chronic-tox package will not be ready for the NDA.',
    consequence:
      'A multi-year study cannot be compressed. It becomes the gating item for the NDA date, stranding an otherwise ready clinical and CMC package.',
    veteranMove:
      'Map the nonclinical critical path against the NDA date years out. Start the long-duration carcinogenicity and chronic-tox studies on the schedule the filing needs, not the schedule the clinic implies.',
    basis: 'ICH S1A/S1B (carcinogenicity), S4 (chronic tox), S5(R3) (reproductive).',
  },
  {
    id: 'pharma-qt-ddi-early',
    segment: 'pharma',
    stage: 'clinical',
    title: 'QT and drug-interaction liabilities are labeling problems if you find them late',
    situation:
      'A team defers the thorough QT / concentration-QTc analysis and the dedicated DDI studies until late development.',
    consequence:
      'A late QT or DDI signal lands directly in the label, can drive a REMS or a contraindication, and may force additional studies that move the filing.',
    veteranMove:
      'Plan the C-QTc analysis and the DDI program early so the liability is characterized and managed before it is a labeling negotiation.',
    basis: 'ICH E14(R3) and M12 (drug interaction studies).',
  },
  {
    id: 'pharma-variation-category',
    segment: 'pharma',
    stage: 'lifecycle',
    title: 'Filing a post-approval change in the wrong variation category cuts both ways',
    situation:
      'A team defaults every CMC post-approval change to the most conservative category, or conversely under-files a change that needed prior approval.',
    consequence:
      'Over-filing as a prior-approval supplement strands a change that could have moved under a lower category; under-filing is a compliance finding. Both cost time or trust.',
    veteranMove:
      'Use ICH Q12 established conditions and the established-conditions concept to right-size each change, and define the reporting category deliberately rather than by reflex.',
    basis: 'ICH Q12; FDA CBE-30 / prior-approval supplement framework; EU variation classification.',
  },
  {
    id: 'pharma-psur-cadence',
    segment: 'pharma',
    stage: 'lifecycle',
    title: 'PSUR/PBRER cadence is driven by the birth date, not your calendar',
    situation:
      'A team tracks periodic safety reporting against an internal calendar rather than the international birth date and the EU reference date list.',
    consequence:
      'A missed or misaligned PBRER cycle is a GVP non-compliance finding, independent of the underlying safety profile.',
    veteranMove:
      'Anchor the PBRER cycle to the IBD and check the EURD list for harmonized dates and data-lock points. Treat the cadence as a hard regulatory obligation.',
    basis: 'ICH E2C(R2); EU GVP Module VII; EURD list.',
  },
  {
    id: 'pharma-mrct-regional-data',
    segment: 'pharma',
    stage: 'clinical',
    title: 'Global data does not automatically transfer to Japan or China',
    situation:
      'A team assumes a single global dataset will satisfy PMDA and NMPA without planning for regional representation or bridging.',
    consequence:
      'PMDA and NMPA expect adequate local or bridging data; a global trial with thin regional enrollment forces a separate bridging study and a later Asian filing.',
    veteranMove:
      'Design the pivotal as a multi-regional trial under ICH E17 with pre-agreed regional sample sizes, or plan the bridging study explicitly into the Asia strategy.',
    basis: 'ICH E5(R1), E17; PMDA and NMPA local-data expectations.',
  },
  {
    id: 'pharma-pediatric-blocks-adult',
    segment: 'pharma',
    stage: 'strategy',
    title: 'The pediatric plan can hold the adult filing hostage',
    situation:
      'A small-molecule team treats the pediatric study plan as a downstream obligation decoupled from the adult NDA/MAA.',
    consequence:
      'A missing iPSP or an unagreed PIP can block acceptance of the adult MAA in the EU and create a PREA gap at FDA.',
    veteranMove:
      'File the iPSP and agree the PIP on the regulator timeline — typically end of Phase 2 — so pediatric obligations do not stall the adult submission.',
    basis: 'FDA PREA; EU Paediatric Regulation (PIP required for MAA validation).',
  },
  {
    id: 'pharma-label-is-decided-late-cycle',
    segment: 'pharma',
    stage: 'agency_interaction',
    title: 'The label is negotiated in the late-cycle review, not after approval',
    situation:
      'A team goes quiet during the review and treats labeling as a post-approval formality, deferring to whatever the agency drafts.',
    consequence:
      'The indication wording, contraindications, and boxed-warning decisions are largely settled in the late-cycle meeting and labeling negotiations. A passive sponsor inherits a narrower or more cautious label than the data support.',
    veteranMove:
      'Prepare the labeling argument with the same rigor as the efficacy case, engage actively in mid- and late-cycle communications, and bring the evidence for each contested label element.',
    basis: 'FDA review program (Program for Enhanced Review Transparency); late-cycle meeting practice.',
  },
  {
    id: 'pharma-pre-nda-meeting-sets-the-filing',
    segment: 'pharma',
    stage: 'pre_submission',
    title: 'The pre-NDA meeting is where you confirm the filing will be accepted, not just reviewed',
    situation:
      'A team uses the pre-NDA meeting to discuss strategy in the abstract rather than to confirm the dataset, analyses, and format the agency expects to see.',
    consequence:
      'A filing that surprises the reviewer on content or structure risks a refuse-to-file or an early information request, costing the very time the meeting was meant to protect.',
    veteranMove:
      'Use the pre-NDA meeting to lock the contents of the application, the primary analyses, the integrated summaries scope, and any waivers — so the filing holds no surprises.',
    basis: 'FDA pre-NDA/pre-BLA meeting guidance; refuse-to-file criteria (21 CFR 314.101).',
  },
];

// ─── Global / cross-market strategy ──────────────────────────────────────────

const GLOBAL_STRATEGY: WisdomHeuristic[] = [
  {
    id: 'x-global-mrct-once',
    segment: null,
    stage: 'strategy',
    title: 'Build one multi-regional trial, not a stack of regional ones',
    situation:
      'A team plans separate pivotal trials per region to satisfy each agency individually, treating Japan, China and the West as different programs.',
    consequence:
      'Cost and timeline multiply, and the inconsistencies between near-identical trials become questions reviewers raise in every region.',
    veteranMove:
      'Anchor the program on one ICH E17-compliant multi-regional trial and a single CTD, sized to support a regional consistency assessment, then localise only Module 1 per market.',
    basis: 'ICH E17; ICH M4 (CTD); PMDA/NMPA acceptance of MRCT data.',
  },
  {
    id: 'x-reliance-leverage',
    segment: null,
    stage: 'strategy',
    title: 'A strong reference-market approval is an asset in every reliance market',
    situation:
      'A team files each market from scratch, ignoring that many regulators run reliance or recognition routes off a trusted reference decision.',
    consequence:
      'The team pays full review time and cost in markets that would have accepted a reliance pathway off an existing FDA/EMA decision.',
    veteranMove:
      'Sequence the reference filing first where its decision and label strengthen later reviews, then use reliance/recognition routes (MHRA IRP, TGA COR, Swiss/Brazil reliance, WHO collaborative registration) downstream.',
    basis: 'WHO/ICMRA reliance frameworks; MHRA IRP; TGA comparable-overseas-regulator pathways.',
  },
  {
    id: 'pharma-nitrosamine-early',
    segment: 'pharma',
    stage: 'nonclinical_cmc',
    title: 'A nitrosamine risk assessment is now table stakes, not an afterthought',
    situation:
      'A small-molecule program leaves mutagenic-impurity (nitrosamine) evaluation until late, assuming the route of synthesis is clean.',
    consequence:
      'A late finding can force a control strategy change, additional testing, or a recall, and a missing assessment is a predictable global deficiency.',
    veteranMove:
      'Run the ICH M7 (Q)SAR / TTC assessment across API, excipients and process early, document control limits against published acceptable intakes, and confirm by testing where flagged.',
    basis: 'ICH M7(R2); FDA/EMA nitrosamine guidance.',
  },
  {
    id: 'biotech-comparability-before-pivotal',
    segment: 'biotech',
    stage: 'nonclinical_cmc',
    title: 'Lock the process before the pivotal, or carry a comparability burden into the filing',
    situation:
      'A biologics team changes scale, site or formulation after the pivotal trial has started, expecting comparability to be a formality.',
    consequence:
      'A material post-pivotal change can require a comparability package, bridging data, or even a bridging study that delays the filing.',
    veteranMove:
      'Freeze the commercial process before the pivotal where feasible, and design an ICH Q5E comparability strategy for any change you cannot avoid.',
    basis: 'ICH Q5E; ICH Q11.',
  },
  {
    id: 'x-accelerated-confirmatory',
    segment: null,
    stage: 'strategy',
    title: 'Accelerated / conditional approval is a promise to confirm, not a shortcut to stop',
    situation:
      'A team treats accelerated or conditional approval as the finish line and defers planning the confirmatory trial.',
    consequence:
      'The confirmatory obligation becomes the critical path, and a failed or slow confirmation risks withdrawal of the approval.',
    veteranMove:
      'Design and start enrolling the confirmatory trial before filing for accelerated/conditional approval, and agree its design with the agency up front.',
    basis: 'FDA Accelerated Approval (21 CFR 314 Subpart H / 601 Subpart E); EMA conditional MA (Reg 507/2006).',
  },
  {
    id: 'biotech-orphan-sequence',
    segment: 'biotech',
    stage: 'strategy',
    title: 'Orphan designation is a development and commercial lever — file it early',
    situation:
      'A rare-disease program treats orphan designation as a late administrative step rather than a strategic decision.',
    consequence:
      'The team forgoes early protocol assistance, fee relief and the exclusivity clock advantages that shape the whole development plan.',
    veteranMove:
      'Seek orphan designation (FDA and EU) early to unlock scientific advice / protocol assistance and fee reductions, and factor the exclusivity into the lifecycle plan.',
    basis: 'US Orphan Drug Act (21 CFR 316); EU Regulation (EC) 141/2000.',
  },
];

// ─── Registry ────────────────────────────────────────────────────────────────

export const INDUSTRY_WISDOM: WisdomHeuristic[] = [
  ...CROSS_CUTTING,
  ...MDX_WISDOM,
  ...BIOTECH_WISDOM,
  ...PHARMA_WISDOM,
  ...GLOBAL_STRATEGY,
];

// ─── Segment inference ───────────────────────────────────────────────────────

/**
 * Map a submission type to the segment whose wisdom is most relevant.
 * Devices/IVD → mdx; biologics/CGT → biotech; small-molecule drug → pharma.
 * Returns null when the submission type is ambiguous (e.g. IND, MAA), which
 * can belong to either biotech or pharma.
 */
export function inferSegmentFromSubmissionType(submissionType?: string): ClientSegment | null {
  if (!submissionType) return null;
  const t = submissionType.toLowerCase();
  if (/510|pma|de.?novo|hde|ide|mdr|ivdr|\bcer\b|device/.test(t)) return 'mdx';
  if (/bla|351|biosimilar|biologic|gene|cell|cgt|advanced therapy|atmp/.test(t)) return 'biotech';
  if (/nda|anda|small.?molecule/.test(t)) return 'pharma';
  return null;
}

const SEGMENT_KEYWORDS: Record<ClientSegment, RegExp> = {
  mdx: /\b(?:device|510\(?k\)?|predicate|substantial equivalence|de novo|pma|eu mdr|ivdr|estar|companion diagnostic|cdx|ivd)\b/i,
  biotech: /\b(?:biologic|biosimilar|351\(?k\)?|bla|gene therapy|cell therapy|cgt|atmp|vector|potency assay|comparability|orphan)\b/i,
  pharma: /\b(?:small molecule|nda|anda|carcinogenicity|generic|tablet|capsule|oral|variation|psur|pbrer|lifecycle)\b/i,
};

/**
 * Infer segment from the user's free-text message when no submission type is
 * available. Returns null when nothing distinctive is present.
 */
export function inferSegmentFromMessage(message: string): ClientSegment | null {
  for (const seg of ['mdx', 'biotech', 'pharma'] as ClientSegment[]) {
    if (SEGMENT_KEYWORDS[seg].test(message)) return seg;
  }
  return null;
}

const STAGE_KEYWORDS: Record<LifecycleStage, RegExp> = {
  strategy: /\b(?:strategy|pathway|target product profile|tpp|designation|fundable|funding|board|investor|de.?risk)\b/i,
  nonclinical_cmc: /\b(?:cmc|manufacturing|comparability|stability|tox|carcinogenicity|potency|analytical|module 3|drug substance)\b/i,
  clinical: /\b(?:trial|endpoint|protocol|pivotal|phase [123]|enroll|surrogate|qt|ddi|immunogenicity)\b/i,
  pre_submission: /\b(?:pre.?sub|pre.?ind|pre.?nda|readiness|gap|are we ready|before (?:we )?file)\b/i,
  submission: /\b(?:submit|file|compile|transmit|ectd|estar|dossier|summary|module 2)\b/i,
  agency_interaction: /\b(?:haq|deficiency|complete response|crl|refuse to file|rtf|information request|commitment|meeting minutes)\b/i,
  lifecycle: /\b(?:post.?approval|variation|supplement|psur|pbrer|pharmacovigilance|label|expansion|cbe)\b/i,
};

/** Infer the most likely lifecycle stage from the user's message. */
export function inferStageFromMessage(message: string): LifecycleStage | null {
  for (const stage of LIFECYCLE_STAGES) {
    if (STAGE_KEYWORDS[stage].test(message)) return stage;
  }
  return null;
}

// ─── Selection & rendering ───────────────────────────────────────────────────

/**
 * Select the heuristics that bear on a given segment + stage. Always includes
 * cross-cutting heuristics for the stage. When no stage is given, returns the
 * segment's heuristics across all stages (plus cross-cutting).
 */
export function selectWisdom(opts: {
  segment?: ClientSegment | null;
  stage?: LifecycleStage | null;
  limit?: number;
}): WisdomHeuristic[] {
  const { segment, stage, limit } = opts;
  const matches = INDUSTRY_WISDOM.filter((h) => {
    const segOk = h.segment === null || !segment || h.segment === segment;
    const stageOk = !stage || h.stage === stage;
    return segOk && stageOk;
  });
  // Cross-cutting first when a stage is in focus (they frame the segment ones).
  matches.sort((a, b) => {
    if (a.segment === null && b.segment !== null) return -1;
    if (a.segment !== null && b.segment === null) return 1;
    return 0;
  });
  return typeof limit === 'number' ? matches.slice(0, limit) : matches;
}

/**
 * Render selected wisdom as a Markdown block for the system prompt. Returns ''
 * when nothing matches, so the caller can skip the section.
 */
export function buildIndustryWisdomBlock(opts: {
  segment?: ClientSegment | null;
  stage?: LifecycleStage | null;
  submissionType?: string;
  message?: string;
  limit?: number;
} = {}): string {
  const segment =
    opts.segment ??
    inferSegmentFromSubmissionType(opts.submissionType) ??
    (opts.message ? inferSegmentFromMessage(opts.message) : null);
  const stage = opts.stage ?? (opts.message ? inferStageFromMessage(opts.message) : null);

  const selected = selectWisdom({ segment, stage, limit: opts.limit ?? 6 });
  if (selected.length === 0) return '';

  const segLabel = segment ? SEGMENT_LABELS[segment] : 'all segments';
  const stageLabel = stage ? stage.replace(/_/g, ' ') : 'general';

  const lines = selected.map((h) => {
    const scope = h.segment === null ? 'all segments' : SEGMENT_LABELS[h.segment];
    return (
      `### ${h.title}\n` +
      `_${scope} · ${h.stage.replace(/_/g, ' ')}_\n` +
      `- **Pattern:** ${h.situation}\n` +
      `- **Consequence:** ${h.consequence}\n` +
      `- **What veterans do:** ${h.veteranMove}\n` +
      `- **Basis:** ${h.basis}`
    );
  });

  return (
    `\n\n## Industry wisdom — ${segLabel}, ${stageLabel}\n` +
    `Experiential judgment that bears on this situation. Use it as a senior colleague would: ` +
    `apply the relevant heuristic to the user's actual context, flag the consequence before they hit it, ` +
    `and recommend the veteran move. Do not recite the list — reason with it.\n\n` +
    lines.join('\n\n')
  );
}

// ─── Lookups ─────────────────────────────────────────────────────────────────

export function getHeuristic(id: string): WisdomHeuristic | null {
  return INDUSTRY_WISDOM.find((h) => h.id === id) ?? null;
}

export function listWisdomForSegment(segment: ClientSegment): WisdomHeuristic[] {
  return INDUSTRY_WISDOM.filter((h) => h.segment === segment || h.segment === null);
}
