/**
 * Direct-to-consumer (DTC), genetic-testing, and diagnostics product-liability
 * legal corpus.
 *
 * Extends the core legal entries (LDT, patent eligibility, privacy,
 * reimbursement) with the DTC genetic-testing regulatory model, genetic-privacy
 * statutes beyond HIPAA, and product-liability/contract considerations for
 * diagnostics.
 */

import type { KnowledgeEntry } from '../types';

export const DTC_GENETIC_LEGAL_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'legal.ivd.dtc-genetic-testing',
    domain: 'legal',
    topic: 'dtc-genetic',
    title: 'Direct-to-consumer (DTC) genetic and diagnostic testing — FDA framework',
    jurisdictions: ['US'],
    appliesTo: ['ivd'],
    summary:
      'DTC tests marketed to consumers without a provider order are FDA-regulated devices; FDA distinguishes DTC genetic-health-risk (GHR) tests (which it has authorized via De Novo with special controls) from carrier-screening and from higher-risk diagnostic claims, and polices unauthorized DTC diagnostic claims.',
    detail:
      'When a test is offered directly to consumers and returns health information without a healthcare provider intermediary, FDA treats it as a device subject to premarket requirements. The landmark sequence: FDA\'s 2013 warning letter to 23andMe halted its health reports; FDA subsequently authorized DTC genetic-health-risk (GHR) tests through De Novo classifications with special controls (e.g., requirements for user comprehension studies, analytical/clinical validity, and clear pre-/post-test information), and established a streamlined path (and partial exemption) for subsequent DTC GHR tests meeting those special controls. FDA also authorized certain DTC carrier-screening and pharmacogenetic reports, while cautioning against pharmacogenetic claims that recommend specific drugs/doses without adequate evidence. Higher-risk DTC diagnostic claims (e.g., cancer diagnosis) generally require stricter review. The throughline: DTC status does not exempt a test from device regulation, and the comprehension/communication of results to lay users is itself a regulated performance dimension.',
    keyPoints: [
      'DTC tests returning health info are FDA-regulated devices (no provider safe harbor).',
      'DTC genetic-health-risk tests authorized via De Novo + special controls (post-23andMe).',
      'User-comprehension and clear pre/post-test information are regulated performance elements.',
      'Higher-risk DTC diagnostic claims face stricter review; PGx drug/dose claims are constrained.',
    ],
    pitfalls: [
      'Assuming a consumer-facing wellness framing avoids device regulation.',
      'Making pharmacogenetic drug/dose recommendations without adequate evidence.',
    ],
    citations: [
      { label: 'FDA De Novo + special controls for DTC GHR tests', source: 'FDA' },
      { label: 'FDA 23andMe warning letter (2013) and subsequent authorizations', source: 'FDA' },
    ],
    related: ['fda.ivd.de-novo', 'legal.ivd.genetic-privacy-laws', 'legal.ivd.data-privacy', 'fda.ivd.definition-and-ruo-iuo'],
    tags: ['dtc', 'genetic-testing', 'ghr', '23andme', 'de-novo', 'pgx'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'legal.ivd.genetic-privacy-laws',
    domain: 'legal',
    topic: 'dtc-genetic',
    title: 'Genetic-privacy law beyond HIPAA (GINA, state genetic-privacy statutes, BIPA-style)',
    jurisdictions: ['US'],
    appliesTo: ['ivd'],
    summary:
      'Genetic data is governed by a patchwork beyond HIPAA: GINA restricts employer/insurer use; many states have genetic-privacy statutes (consent, ownership, destruction rights) and DTC-specific laws; biometric statutes and the FTC add further constraints — especially for DTC/consumer genomics outside HIPAA.',
    detail:
      'Genetic information sits under overlapping regimes. Federally, GINA (2008) bars discrimination by health insurers and employers based on genetic information but does not broadly regulate commercial data use; HIPAA applies only to covered entities/business associates (so most DTC genomics falls outside it). States fill the gap: many have genetic-privacy statutes addressing informed consent for collection/testing, individual ownership of genetic data, and rights to access/destroy samples and data; several states have enacted DTC-genetic-testing-specific privacy laws requiring express consent for collection, use, and transfer, plus security and deletion rights. Biometric-information statutes (e.g., Illinois BIPA) and comprehensive state privacy laws (CCPA/CPRA and successors, which treat genetic data as sensitive personal information) impose additional consent/limitation duties, and the FTC pursues deceptive/unfair practices and enforces the Health Breach Notification Rule against non-HIPAA health apps and DTC testers. For an IVD/DTC developer, the compliance posture must be built for the strictest applicable state law and for explicit, granular consent over secondary use, sharing, and research.',
    keyPoints: [
      'GINA: anti-discrimination (insurers/employers), not general data regulation.',
      'HIPAA often does not reach DTC genomics — state law governs.',
      'State genetic-privacy + DTC-specific laws: consent, ownership, deletion rights.',
      'CCPA/CPRA treat genetic data as sensitive; BIPA-style + FTC add duties.',
    ],
    citations: [
      { label: 'Genetic Information Nondiscrimination Act (GINA, 2008)', source: 'US Congress' },
      { label: 'State genetic-privacy and DTC genetic-testing privacy statutes', source: 'US States' },
      { label: 'CCPA/CPRA (sensitive personal information); FTC Health Breach Notification Rule', source: 'California / FTC' },
    ],
    related: ['legal.ivd.data-privacy', 'legal.ivd.dtc-genetic-testing'],
    tags: ['genetic-privacy', 'gina', 'state-law', 'ccpa', 'cpra', 'consent', 'dtc'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'legal.ivd.product-liability',
    domain: 'legal',
    topic: 'liability',
    title: 'Diagnostics product liability, preemption, and the learned-intermediary doctrine',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'IVD manufacturers face product-liability exposure for design/manufacturing defects and failure-to-warn; PMA-approved devices enjoy broad federal preemption (Riegel), 510(k) devices generally do not (Lohr), and the learned-intermediary doctrine channels warnings through the ordering clinician.',
    detail:
      'Diagnostics carry liability risk distinct from their regulatory status. Under product-liability law, claims sound in design defect, manufacturing defect, and failure to warn (inadequate IFU/limitations). Federal preemption turns sharply on pathway: in Riegel v. Medtronic (2008) the Supreme Court held that the Medical Device Amendments expressly preempt state-law claims that would impose requirements "different from, or in addition to" federal requirements for PMA-approved Class III devices, giving strong (though not absolute, per Lohr/parallel-claim doctrine) protection; by contrast, Medtronic v. Lohr (1996) held that 510(k) clearance — being a substantial-equivalence determination, not a safety/effectiveness approval — generally does not preempt state claims. The learned-intermediary doctrine typically directs a manufacturer\'s duty to warn to the ordering healthcare professional rather than the patient (with DTC testing a notable exception that can shift warnings toward the consumer). Practical implications: robust design controls and validated, accurate IFU limitations are both regulatory and liability defenses; erroneous diagnostic results (false negatives/positives) and inadequate limitation warnings are the principal claim drivers; and pathway choice (PMA vs 510(k)) materially affects litigation exposure.',
    keyPoints: [
      'Claims: design defect, manufacturing defect, failure to warn.',
      'PMA devices: broad express preemption (Riegel), subject to parallel-claim exceptions.',
      '510(k) devices: generally no preemption (Lohr) — substantial equivalence ≠ safety approval.',
      'Learned-intermediary doctrine channels warnings via the clinician (DTC shifts to consumer).',
    ],
    citations: [
      { label: 'Riegel v. Medtronic, 552 U.S. 312 (2008)', source: 'US Supreme Court' },
      { label: 'Medtronic v. Lohr, 518 U.S. 470 (1996)', source: 'US Supreme Court' },
      { label: 'Medical Device Amendments §521 (preemption)', source: 'FDA' },
    ],
    related: ['fda.ivd.pma', 'fda.ivd.510k-pathway', 'label.fda.809-10-package-insert', 'ai.bias-equity'],
    tags: ['product-liability', 'preemption', 'riegel', 'lohr', 'learned-intermediary', 'failure-to-warn'],
    lastReviewed: '2026-06-09',
  },
];
