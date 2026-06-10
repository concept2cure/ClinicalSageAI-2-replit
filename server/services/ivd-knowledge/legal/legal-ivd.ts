/**
 * IVD legal intelligence corpus.
 *
 * Deep, citable entries on the legal landscape that shapes IVD strategy:
 * the laboratory-developed test (LDT) regulatory-authority fight and the 2024
 * FDA rule + its 2025 vacatur, diagnostic patent-subject-matter eligibility
 * (Mayo/Myriad/Athena), data-privacy law for diagnostic/genomic data (HIPAA,
 * GINA, GDPR), U.S. reimbursement law (PAMA/CLFS, CPT/PLA/MAAA, NCD/LCD,
 * MolDX), and the legal lens on design changes.
 *
 * NOTE: This is regulatory/legal intelligence, not legal advice; verify current
 * status before relying on it (the LDT entry in particular is fast-moving).
 */

import type { KnowledgeEntry } from '../types';

export const LEGAL_IVD_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'legal.ivd.ldt-rule',
    domain: 'legal',
    topic: 'ldt',
    title: 'Laboratory-developed tests (LDTs): the 2024 FDA rule and its 2025 vacatur',
    jurisdictions: ['US'],
    appliesTo: ['ldt', 'ivd'],
    summary:
      'LDTs are tests designed, manufactured, and used within a single CLIA lab. FDA historically exercised enforcement discretion. In May 2024 FDA finalized a rule to phase out that discretion and regulate LDTs as devices; in March 2025 a federal court vacated the rule, holding FDA lacks that authority — leaving LDTs governed by CLIA pending appeal/legislation.',
    detail:
      'An LDT is an in-vitro diagnostic designed, manufactured, and used within a single laboratory certified under CLIA for high-complexity testing. For decades FDA asserted that LDTs are "devices" subject to its authority but exercised "enforcement discretion," so labs validated LDTs under CLIA (CMS) rather than obtaining FDA clearance/approval.\n\nOn 6 May 2024 FDA published a final rule amending its regulations to make explicit that IVDs are devices "including when the manufacturer is a laboratory," and announced a phaseout of general enforcement discretion over roughly four years in five stages: Stage 1 (~May 2025) MDR, correction/removal, and complaint-handling; Stage 2 (~May 2026) registration, listing, labeling, and investigational-use requirements; Stage 3 (~May 2027) quality system (QS/QMSR) requirements; Stage 4 (~Nov 2027) premarket review for high-risk tests; Stage 5 (~May 2028) premarket review for moderate/low-risk tests — with several carve-outs (e.g., certain currently-marketed LDTs, 1976-type LDTs, HLA, forensic, and some others).\n\nThe American Clinical Laboratory Association and the Association for Molecular Pathology sued in the U.S. District Court for the Eastern District of Texas. On 31 March 2025 the court granted summary judgment for the plaintiffs and vacated the LDT rule, holding that the FD&C Act does not give FDA authority over LDTs, which are professional testing services regulated under CLIA, not manufactured "devices." As of the knowledge cutoff the rule is vacated and not in effect; LDTs continue under the CLIA framework, while the prospect of an FDA appeal and/or federal legislation (the long-pending VALID Act, which would create a distinct in-vitro clinical test category) remains unresolved. Strategy implication: monitor closely — a successful appeal or VALID-style legislation would reintroduce FDA-style obligations for labs.',
    keyPoints: [
      'LDT = test designed/made/used within one CLIA high-complexity lab.',
      '2024 FDA final rule: phase out enforcement discretion in 5 stages (2025–2028).',
      'March 2025: E.D. Texas vacated the rule (FDA lacks LDT authority; LDTs are services).',
      'As of cutoff: rule not in effect; LDTs under CLIA; appeal/VALID Act unresolved.',
    ],
    pitfalls: [
      'Treating the 2024 rule\'s phaseout dates as currently operative — it was vacated.',
      'Ignoring that a successful appeal or VALID Act would reverse this.',
    ],
    citations: [
      { label: 'FDA Final Rule, 89 Fed. Reg. 37286 (May 6, 2024)', source: 'FDA' },
      { label: 'ACLA v. FDA / AMP v. FDA (E.D. Tex., vacated Mar 31, 2025)', source: 'US District Court (E.D. Tex.)' },
      { label: 'VALID Act (proposed legislation)', source: 'US Congress' },
      { label: 'CLIA (42 USC 263a; 42 CFR 493)', source: 'CMS' },
    ],
    related: ['fda.ivd.clia-categorization', 'fda.ivd.definition-and-ruo-iuo', 'legal.ivd.reimbursement'],
    tags: ['ldt', 'enforcement-discretion', 'valid-act', 'clia', 'vacatur', 'fast-moving'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'legal.ivd.patent-eligibility',
    domain: 'legal',
    topic: 'intellectual-property',
    title: 'Diagnostic patent-subject-matter eligibility (Mayo, Myriad, Athena)',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'A line of Supreme Court and Federal Circuit cases sharply narrowed patent eligibility for diagnostics under 35 USC §101: laws of nature, natural phenomena, and isolated natural products are unpatentable, so claims that merely correlate a biomarker with a condition are frequently invalidated.',
    detail:
      'Three decisions define the U.S. diagnostic IP landscape. Mayo Collaborative Services v. Prometheus Laboratories (2012) held that claims reciting a natural correlation (metabolite level → drug dosing) plus conventional measurement steps are ineligible "laws of nature." Association for Molecular Pathology v. Myriad Genetics (2013) held that isolated naturally-occurring DNA (BRCA1/2) is an unpatentable product of nature, though cDNA is patent-eligible. Building on Mayo, the Federal Circuit in Athena Diagnostics v. Mayo (2019) invalidated a claim to detecting MuSK autoantibodies (a diagnostic correlation); the en banc court declined rehearing with multiple judges urging the Supreme Court or Congress to fix §101, and the Supreme Court denied certiorari (2020).\n\nThe practical effect: "method of diagnosing/detecting" claims that hinge on a natural correlation are highly vulnerable, while eligibility is more defensible for novel treatment-method claims, specific non-conventional measurement techniques, engineered reagents/compositions, and new laboratory apparatus/processes. Strategy: protect the assay technology and compositions rather than the bare correlation; consider trade-secret protection for algorithms/cut-offs; and watch the proposed Patent Eligibility Restoration Act, which would legislatively narrow the judicial exceptions. (Europe and other jurisdictions handle diagnostic-method patentability differently — e.g., EPC Art. 53(c) excludes diagnostic methods practiced on the body but allows in-vitro methods.)',
    keyPoints: [
      '§101 judicial exceptions: laws of nature, natural phenomena, natural products.',
      'Mayo (2012): natural correlation + conventional steps = ineligible.',
      'Myriad (2013): isolated DNA ineligible; cDNA eligible.',
      'Athena (2019, cert. denied 2020): diagnostic-correlation claim invalid.',
      'Protect technology/compositions/algorithms, not the bare correlation.',
    ],
    citations: [
      { label: 'Mayo v. Prometheus, 566 U.S. 66 (2012)', source: 'US Supreme Court' },
      { label: 'AMP v. Myriad, 569 U.S. 576 (2013)', source: 'US Supreme Court' },
      { label: 'Athena Diagnostics v. Mayo, 915 F.3d 743 (Fed. Cir. 2019); cert. denied (2020)', source: 'US Court of Appeals (Fed. Cir.)' },
      { label: '35 USC §101; Patent Eligibility Restoration Act (proposed)', source: 'US Congress' },
    ],
    related: ['legal.ivd.ldt-rule', 'sci.ivd.scientific-validity'],
    tags: ['patent', 'section-101', 'mayo', 'myriad', 'athena', 'subject-matter-eligibility'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'legal.ivd.data-privacy',
    domain: 'legal',
    topic: 'data-privacy',
    title: 'Data privacy for diagnostic & genomic data (HIPAA, GINA, GDPR)',
    jurisdictions: ['US', 'EU'],
    appliesTo: ['ivd', 'cdx', 'samd'],
    summary:
      'Diagnostic results are protected health information under HIPAA in the US and "special category" health/genetic data under GDPR in the EU; genetic data carries extra protection (GINA in the US; GDPR Art. 9). IVD developers handling identifiable results must address consent, security, breach notification, and cross-border transfer.',
    detail:
      'In the US, diagnostic test results held by covered entities (labs, providers, plans) and their business associates are Protected Health Information under HIPAA (45 CFR Parts 160/164), triggering the Privacy Rule (permitted uses/disclosures, minimum necessary), the Security Rule (administrative/physical/technical safeguards for ePHI), and the Breach Notification Rule. The Genetic Information Nondiscrimination Act (GINA) restricts use of genetic information by employers and health insurers. Note that CLIA also confers patient access rights to completed test reports. Direct-to-consumer testing outside HIPAA may instead fall under FTC Act unfairness/deception and the FTC Health Breach Notification Rule, plus state laws (e.g., CCPA/CPRA, and genetic-privacy statutes).\n\nIn the EU, health data and genetic data are "special categories" under GDPR Art. 9, processable only on a valid Art. 9 condition (explicit consent, or specific health/research bases) atop an Art. 6 lawful basis, with heightened obligations: data-protection impact assessments, purpose limitation, data minimisation, and strict rules on international transfers (adequacy decisions or safeguards such as SCCs). IVDR clinical performance studies that process personal data must also comply with GDPR. For developers, the practical mandates are: lawful basis + appropriate consent for secondary/research use, de-identification/pseudonymisation where feasible, strong security and breach response, and a defensible cross-border data-transfer mechanism — especially for cloud-hosted or AI-driven diagnostics that aggregate patient data.',
    keyPoints: [
      'US: results = PHI under HIPAA (Privacy/Security/Breach rules); GINA guards genetic info.',
      'CLIA grants patients access to their completed test reports.',
      'DTC tests outside HIPAA: FTC Act + Health Breach Notification Rule + state laws.',
      'EU: health/genetic data = GDPR Art. 9 special category; needs Art. 9 + Art. 6 basis, DPIA, transfer safeguards.',
    ],
    citations: [
      { label: 'HIPAA Privacy/Security/Breach Rules (45 CFR 160/164)', source: 'HHS' },
      { label: 'Genetic Information Nondiscrimination Act (GINA)', source: 'US Congress' },
      { label: 'GDPR Arts. 6 & 9 (lawful basis; special categories)', source: 'EU' },
      { label: 'FTC Health Breach Notification Rule', source: 'FTC' },
    ],
    related: ['legal.ivd.ldt-rule', 'global.ivd.imdrf'],
    tags: ['privacy', 'hipaa', 'gdpr', 'gina', 'genomic-data', 'consent'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'legal.ivd.reimbursement',
    domain: 'legal',
    topic: 'reimbursement',
    title: 'US diagnostics reimbursement law (PAMA/CLFS, CPT/PLA/MAAA, NCD/LCD, MolDX)',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Clearance is not coverage. US lab-test payment runs through the Clinical Laboratory Fee Schedule (reset to market-based rates by PAMA 2014), CPT/PLA/MAAA coding, Medicare coverage via national (NCD) or local (LCD) determinations administered by MACs, and the MolDX program (Z-codes) for molecular tests.',
    detail:
      'Four interacting systems determine whether and how a US lab test is paid. (1) Coding — the AMA CPT code set, including category-I codes, MAAA codes (multianalyte assays with algorithmic analyses), and PLA codes (Proprietary Laboratory Analyses, test-specific codes a manufacturer/lab can request); a code is a prerequisite to billing. (2) Payment — most lab tests are paid under the Clinical Laboratory Fee Schedule (CLFS). PAMA (Protecting Access to Medicare Act of 2014) replaced historical CLFS rates with market-based rates derived from private-payer data reported by "applicable laboratories," and created the Advanced Diagnostic Laboratory Test (ADLT) category, which lets certain unique single-lab tests receive initial actual-list-charge pricing. New codes are priced by crosswalk (to an existing code) or gapfill (MAC-derived). (3) Coverage — Medicare coverage is set nationally via National Coverage Determinations (NCDs) or, more commonly for novel tests, locally via Local Coverage Determinations (LCDs) issued by Medicare Administrative Contractors (MACs); coverage requires the test be "reasonable and necessary." (4) MolDX — a program (administered by Palmetto GBA and adopted by several MACs) that assigns unique test identifiers (Z-codes), requires technical assessment/dossier submission, and governs molecular-diagnostic coverage and claims.\n\nStrategy implication: a market-access plan must run in parallel with the regulatory plan — secure coding (often a PLA code), engage MolDX for molecular tests, and build the clinical-utility evidence dossier that LCD/NCD coverage and private payers demand (analytical + clinical validity plus clinical utility, which is a higher bar than FDA clearance).',
    keyPoints: [
      'Clearance ≠ coverage ≠ payment — three separate hurdles.',
      'Coding: CPT category-I, MAAA, and PLA (proprietary) codes.',
      'Payment: CLFS, reset to market-based rates by PAMA; ADLT pricing; crosswalk/gapfill for new codes.',
      'Coverage: NCD (national) or LCD (MAC-local), "reasonable and necessary"; MolDX Z-codes for molecular.',
      'Payers demand clinical utility — a higher evidence bar than FDA clearance.',
    ],
    pitfalls: [
      'Assuming FDA clearance secures Medicare/payer coverage.',
      'No clinical-utility evidence for LCD/MolDX/private-payer dossiers.',
    ],
    citations: [
      { label: 'Protecting Access to Medicare Act of 2014 (PAMA) — CLFS reform', source: 'CMS' },
      { label: 'CMS Medicare Coverage (NCD/LCD) framework; MACs', source: 'CMS' },
      { label: 'AMA CPT / PLA / MAAA code sets', source: 'AMA' },
      { label: 'MolDX program (Palmetto GBA) — Z-codes', source: 'CMS/MolDX' },
    ],
    related: ['legal.ivd.ldt-rule', 'fda.ivd.cdx', 'sci.ivd.clinical-study-design'],
    tags: ['reimbursement', 'pama', 'clfs', 'cpt', 'pla', 'maaa', 'ncd', 'lcd', 'moldx', 'adlt'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'legal.ivd.change-significant',
    domain: 'regulatory',
    topic: 'change-management',
    title: 'Change control law — FDA "when to submit a new 510(k)" and EU significant change',
    jurisdictions: ['US', 'EU'],
    appliesTo: ['ivd', 'cdx', 'samd'],
    summary:
      'Post-market changes are governed by decision frameworks: FDA\'s guidance on deciding when a device/software change needs a new 510(k) (vs. a documented Letter-to-File), and the EU\'s "significant change" criteria (MDCG 2020-3 / IVDR transitional rules) that can forfeit legacy/transition status or require new conformity assessment.',
    detail:
      'In the US, not every change requires a new submission. FDA\'s guidances "Deciding When to Submit a 510(k) for a Change to an Existing Device" (2017) and the companion software-change guidance provide flowcharts: a change to indications/intended use, or one that could significantly affect safety or effectiveness (e.g., new operating principle, new patient-contacting materials, or a software change that introduces/modifies a risk control), generally requires a new 510(k); changes whose effects are verified/validated to not significantly affect safety/effectiveness can be documented in a Letter-to-File under design controls. The manufacturer must perform and retain a risk-based assessment for each change; PMA devices instead use the supplement hierarchy.\n\nIn the EU, the analogous concept is the "significant change." Under the transitional provisions (IVDR Art. 110, as amended) a legacy device may continue to be placed on the market only if there is no "significant change in design or intended purpose." MDCG 2020-3 (written for MDR but applied by analogy) sets criteria — changes to intended purpose, design/performance outside the original specification, sterilisation, or software beyond corrective/security updates can be "significant," triggering loss of transition benefit and/or new notified-body conformity assessment. Practical mandate: run a documented change assessment against both frameworks before implementing any change, because a misjudged change can either invalidate a CE/transition status or constitute marketing an uncleared modified device.',
    keyPoints: [
      'FDA: intended-use change or significant S&E effect ⇒ new 510(k); otherwise documented Letter-to-File.',
      'Each change needs a retained, risk-based assessment under design controls (PMA uses supplements).',
      'EU: a "significant change" (MDCG 2020-3 criteria) can forfeit legacy/transition status or force new conformity assessment.',
      'Assess every change against both frameworks before implementing.',
    ],
    citations: [
      { label: 'FDA Guidance: Deciding When to Submit a 510(k) for a Change (2017)', source: 'FDA' },
      { label: 'FDA Guidance: Deciding When to Submit a 510(k) for a Software Change (2017)', source: 'FDA' },
      { label: 'MDCG 2020-3 (significant change)', source: 'EU (MDCG)' },
      { label: 'IVDR Art. 110 (transitional provisions, as amended)', source: 'EU' },
    ],
    related: ['eu.ivdr.transition-timeline', 'fda.ivd.510k-pathway', 'fda.ivd.pma'],
    tags: ['change-control', 'letter-to-file', 'significant-change', 'mdcg-2020-3', '510k-change'],
    lastReviewed: '2026-06-09',
  },
];
