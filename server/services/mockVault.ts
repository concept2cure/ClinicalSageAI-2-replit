/**
 * Mock Vault Service – in-memory fallback when DB is unavailable.
 *
 * Provides sample editor JSON (TipTap format) for 510k, PMA, and CER doc types
 * so export/render flows work offline in development.
 */

// ── Helpers ────────────────────────────────────────────────────────────────────

function heading(level: number, text: string) {
  return {
    type: 'heading',
    attrs: { level },
    content: [{ type: 'text', text }],
  };
}

function paragraph(text: string) {
  return {
    type: 'paragraph',
    content: [{ type: 'text', text }],
  };
}

function bulletList(items: string[]) {
  return {
    type: 'bulletList',
    content: items.map(item => ({
      type: 'listItem',
      content: [paragraph(item)],
    })),
  };
}

// ── 510(k) Mock Content ────────────────────────────────────────────────────────

const mock510kContent = {
  type: 'doc',
  content: [
    heading(1, 'Cover Letter'),
    paragraph(
      'This 510(k) premarket notification is being submitted to the U.S. Food and Drug Administration (FDA) in accordance with Section 510(k) of the Federal Food, Drug, and Cosmetic Act for the CardioMonitor Pro continuous cardiac monitoring system.'
    ),
    paragraph(
      'The submitter, MedTech Innovations Inc., respectfully requests a determination of substantial equivalence to the legally marketed predicate device K192345.'
    ),

    heading(1, '510(k) Summary'),
    paragraph(
      'The CardioMonitor Pro is a Class II, non-invasive continuous cardiac monitoring system intended for use in clinical and ambulatory settings. The device records, stores, and analyzes electrocardiographic (ECG) data from adult patients suspected of having cardiac arrhythmias.'
    ),
    paragraph(
      'Product Code: DPS. Regulation Number: 21 CFR 870.2340. Classification: Class II with Special Controls.'
    ),
    bulletList([
      'Intended Use: Continuous ECG monitoring for arrhythmia detection',
      'Target Population: Adults (18+) suspected of cardiac rhythm disorders',
      'Use Environment: Hospital, clinic, and ambulatory settings',
      'Single-use adhesive electrode patches with reusable recorder unit',
    ]),

    heading(1, 'Device Description'),
    paragraph(
      'The CardioMonitor Pro system consists of three primary components: (1) a wearable recorder unit measuring 65mm × 42mm × 12mm weighing 28g, (2) single-use adhesive electrode patches, and (3) a cloud-based analysis platform accessible via web browser.'
    ),
    paragraph(
      'The recorder unit features a 3-axis accelerometer, Bluetooth 5.0 connectivity, and a rechargeable lithium-polymer battery providing up to 14 days of continuous recording. ECG signals are sampled at 256 Hz with 16-bit resolution.'
    ),

    heading(1, 'Predicate Devices'),
    paragraph(
      'The primary predicate device is the HeartTrack 3000 (K192345), a continuous cardiac monitoring system manufactured by CardioTech Systems LLC. The reference predicate is the ECGPatch Pro (K183456).'
    ),
    bulletList([
      'HeartTrack 3000 (K192345) – Same intended use, similar technology, Class II / DPS',
      'ECGPatch Pro (K183456) – Similar form factor, adhesive patch design, ambulatory use',
    ]),

    heading(1, 'Substantial Equivalence Discussion'),
    paragraph(
      'The CardioMonitor Pro is substantially equivalent to the predicate device HeartTrack 3000 (K192345) with respect to intended use, technological characteristics, and performance specifications.'
    ),
    paragraph(
      'The subject device shares the same intended use as the predicate: continuous ECG monitoring for detection of cardiac arrhythmias in adult patients. Both devices use single-lead ECG detection with comparable sampling rates (256 Hz vs 250 Hz) and signal processing algorithms.'
    ),
    paragraph(
      'Differences include: (1) reduced form factor (28g vs 35g), (2) extended battery life (14 days vs 10 days), and (3) addition of cloud-based analysis. These differences do not raise new questions of safety or effectiveness.'
    ),

    heading(1, 'Performance Testing (Bench/Clinical)'),
    paragraph(
      'Bench testing was conducted per applicable FDA-recognized consensus standards including AAMI EC11, EC13, IEC 60601-1, IEC 60601-1-2 (EMC), and IEC 62133 (battery safety).'
    ),
    bulletList([
      'Electrical Safety: Compliant with IEC 60601-1:2005+A1:2012 (3rd Edition)',
      'EMC: Compliant with IEC 60601-1-2:2014 (4th Edition)',
      'Biocompatibility: ISO 10993 series testing completed (cytotoxicity, sensitization, irritation)',
      'Software Validation: IEC 62304 lifecycle, SIL-B classification',
      'Clinical Performance: Sensitivity 98.2%, Specificity 97.8% (N=247 subjects)',
    ]),

    heading(1, 'Labeling'),
    paragraph(
      "Proposed labeling includes: Instructions for Use (IFU), Quick Start Guide, Physician's Guide to Interpretation, Patient Information Sheet, and packaging labels. All labeling complies with 21 CFR 801 requirements."
    ),

    heading(1, 'Conclusion'),
    paragraph(
      'Based on the comparison of intended use, technological characteristics, and performance data, the CardioMonitor Pro is substantially equivalent to the predicate device HeartTrack 3000 (K192345) and should be cleared for commercial distribution in the United States.'
    ),
  ],
};

// ── PMA Mock Content ───────────────────────────────────────────────────────────

const mockPmaContent = {
  type: 'doc',
  content: [
    heading(1, 'Summary and General Information'),
    paragraph(
      "This Premarket Approval (PMA) application is submitted for the NeuroStim Adaptive DBS System, a Class III implantable deep brain stimulation device intended for the treatment of medication-refractory Parkinson's disease."
    ),
    paragraph(
      'Applicant: NeuroTech Medical Corp., 500 Innovation Drive, San Jose, CA 95112. Device Classification: Class III – Product Code: GZB. Regulation: 21 CFR 882.5805.'
    ),
    bulletList([
      'Device Trade Name: NeuroStim Adaptive DBS System',
      'Common Name: Implantable Deep Brain Stimulation System',
      "Intended Use: Treatment of symptoms of advanced, levodopa-responsive Parkinson's disease",
      'Target Population: Adults aged 22+ with disease duration ≥ 4 years',
    ]),

    heading(1, 'Nonclinical Laboratory Studies'),
    paragraph(
      'Comprehensive nonclinical testing was performed to evaluate the safety and performance of the NeuroStim system. Testing included benchtop characterization, biocompatibility (ISO 10993), electrical safety (IEC 60601-1), EMC (IEC 60601-1-2), MRI conditional testing (ASTM F2052, F2182, F2119, F2213), and accelerated lifetime testing.'
    ),
    paragraph(
      'Stimulation parameter range: 0.1–10.0 mA amplitude, 10–450 Hz frequency, 20–450 µs pulse width. The implantable pulse generator (IPG) demonstrated a battery life of 4.8–6.2 years under typical stimulation parameters.'
    ),
    bulletList([
      'Corrosion Testing: ASTM F2129 – No pitting or crevice corrosion after 90 days',
      'Fatigue Testing: 400 million cycles completed without lead fracture',
      'Hermeticity: Per MIL-STD-883 – Leak rate < 1×10⁻⁸ atm·cc/sec',
      'Sterilization Validation: EO per ISO 11135 – SAL 10⁻⁶',
    ]),

    heading(1, 'Clinical Investigations'),
    paragraph(
      'The ADAPT-PD pivotal trial was a prospective, randomized, double-blind, sham-controlled, multi-center study enrolling 310 subjects at 24 sites across the United States and Europe.'
    ),
    paragraph(
      'Primary endpoint: Change in UPDRS Part III (motor examination) score at 12 months in the medication-off state. Results: Active group achieved a mean improvement of 14.2 points (SD 8.1) vs. 3.1 points (SD 6.4) in the control group (p < 0.001). Responder rate (≥30% improvement): 72.3% active vs. 18.5% control.'
    ),
    paragraph(
      'Adverse events: Infection rate 2.6% (8/310), lead migration 1.3% (4/310), stimulation-related side effects (dysarthria, paresthesia) in 8.7% – all resolved with parameter adjustment.'
    ),

    heading(1, 'Manufacturing and Quality Systems'),
    paragraph(
      "The NeuroStim system is manufactured at NeuroTech Medical's ISO 13485:2016 certified facility in San Jose, CA. The facility is also compliant with 21 CFR Part 820 Quality System Regulation. All critical suppliers are qualified under a documented supplier management program."
    ),

    heading(1, 'Labeling'),
    paragraph(
      "Proposed labeling includes: Physician's Manual, Patient's Manual, MRI Guidelines, Programming Guide, and Surgical Technique Guide. Labeling includes required Class III warnings, precautions, and a detailed summary of clinical trial results."
    ),

    heading(1, 'Risk/Benefit Determination'),
    paragraph(
      'The benefits of the NeuroStim Adaptive DBS System significantly outweigh the risks for the intended patient population. The pivotal trial demonstrated clinically meaningful and statistically significant improvement in motor function with an acceptable safety profile consistent with established DBS systems.'
    ),

    heading(1, 'Post-Approval Study / PMS'),
    paragraph(
      'A post-approval study (PAS) is proposed to monitor long-term safety and effectiveness over 5 years in 500 patients across 30 sites. Annual interim reports will be submitted. Additionally, a post-market surveillance plan including complaint trending, MDR analysis, and periodic safety update reports will be maintained.'
    ),
  ],
};

// ── CER Mock Content ───────────────────────────────────────────────────────────

const mockCerContent = {
  type: 'doc',
  content: [
    heading(1, 'State of the Art'),
    paragraph(
      'This Clinical Evaluation Report (CER) is prepared in accordance with EU MDR 2017/745 Article 61 and Annex XIV, following MEDDEV 2.7/1 rev. 4 methodology for the GlucoSense Continuous Glucose Monitor (CGM) System.'
    ),
    paragraph(
      'Current state of the art for continuous glucose monitoring involves minimally invasive subcutaneous sensors with a typical accuracy of MARD 9–12%, wear time of 10–14 days, and real-time connectivity to mobile applications. Leading devices include the Dexcom G7 (MARD 8.2%), Abbott FreeStyle Libre 3 (MARD 7.9%), and Medtronic Guardian 4 (MARD 8.7%).'
    ),
    bulletList([
      'Applicable Standards: EN ISO 15197:2015, IEC 62304, IEC 60601-1, EN ISO 14708 (where applicable)',
      'Clinical Benefit: Real-time glucose data reduces HbA1c and hypoglycemic events',
      'Alternative Treatments: Self-monitoring blood glucose (SMBG), flash glucose monitoring',
      'Unmet Need: Factory-calibrated CGM with extended 21-day wear and integrated insulin dose calculator',
    ]),

    heading(1, 'Device / Intended Purpose'),
    paragraph(
      'The GlucoSense CGM is a Class IIb medical device (Rule 11 – active device intended to supply energy or substances) consisting of: (1) a factory-calibrated electrochemical biosensor inserted subcutaneously, (2) a wireless transmitter, and (3) a companion mobile application (iOS/Android).'
    ),
    paragraph(
      'Intended Purpose: Continuous measurement of interstitial fluid glucose levels in adults (18+) with Type 1 or Type 2 diabetes mellitus. The system provides real-time glucose readings, trend data, and configurable alerts for hypo/hyperglycemia. Sensor wear duration: up to 21 days.'
    ),

    heading(1, 'Clinical Data Set (Literature + Studies)'),
    paragraph(
      'A systematic literature review was conducted following MEDDEV 2.7/1 rev. 4 Appendix A10. Databases searched: PubMed, Embase, Cochrane Library. Search dates: January 2010 – December 2024. Initial results: 2,847 articles; after screening: 186 articles included for full appraisal.'
    ),
    paragraph(
      'Direct Clinical Evidence: The SENSE-21 pivotal study (N=412, multi-center, prospective, single-arm) demonstrated overall MARD of 8.4% with 99.1% of readings in Zone A/B of the Consensus Error Grid. Mean absolute difference (MAD) in the hypoglycemic range (< 70 mg/dL) was 8.7 mg/dL.'
    ),
    bulletList([
      'SENSE-21 Pivotal Study: N=412, 14 sites, MARD 8.4%, 21-day sensor accuracy',
      'SENSE-Pediatric Extension: N=78 (ages 6-17), MARD 9.1%, favorable safety',
      'Equivalent Device Literature: 42 studies on Dexcom G6/G7, 38 studies on FreeStyle Libre 2/3',
      'Post-Market Data: 24-month registry (N=2,340), device complaint rate 1.2%',
    ]),

    heading(1, 'Critical Appraisal & Weighting'),
    paragraph(
      'Each identified study was appraised per MEDDEV 2.7/1 rev. 4 criteria: scientific validity, relevance to the device, and methodological quality. The SENSE-21 pivotal study was rated as high-quality direct evidence (prospective, multi-center, adequate sample size, pre-specified endpoints). Equivalent device literature was weighted based on demonstrated similarity in design, materials, and intended purpose.'
    ),

    heading(1, 'Benefit–Risk Determination'),
    paragraph(
      'Benefits: Real-time glucose monitoring reduces HbA1c by 0.4–0.8% (established by meta-analysis of CGM trials), reduces time in hypoglycemia by 38%, and improves quality of life (measured by DQoL and DTSQ questionnaires). The 21-day wear time reduces sensor insertions by 33% compared to 14-day devices.'
    ),
    paragraph(
      'Risks: Sensor site reactions (erythema 4.2%, edema 1.1%), rare infections (0.3%), sensor detachment (2.8%). All risks are consistent with established CGM devices and are mitigated by clear IFU instructions and biocompatible materials.'
    ),
    paragraph(
      'Conclusion: The benefit-risk profile is favorable. Benefits of improved glycemic control and reduced hypoglycemia significantly outweigh the mild, transient risks identified.'
    ),

    heading(1, 'GSPR Mapping'),
    paragraph(
      'General Safety and Performance Requirements (GSPRs) per MDR Annex I have been systematically mapped to supporting evidence. All 23 applicable GSPRs are addressed with references to nonclinical test reports, clinical data, risk management documentation, and labeling.'
    ),
    bulletList([
      'GSPR 1 (Safety and performance): Addressed by SENSE-21 clinical data + IEC 60601-1 testing',
      'GSPR 8 (Biocompatibility): ISO 10993 test reports for all patient-contacting materials',
      'GSPR 17 (Electronic programmable systems): IEC 62304 software lifecycle + cybersecurity assessment',
      'GSPR 23 (Labeling): IFU, Quick Start Guide, and companion app conform to Annex I Chapter III',
    ]),

    heading(1, 'PMS Plan / PMCF'),
    paragraph(
      'A Post-Market Surveillance (PMS) plan and Post-Market Clinical Follow-up (PMCF) plan have been established in accordance with MDR Articles 83–86 and Annex XIV Part B.'
    ),
    paragraph(
      'PMCF activities include: (1) ongoing real-world performance registry targeting 5,000 patients over 3 years, (2) user surveys at 6-month intervals, (3) complaint and incident trending with quarterly review, and (4) periodic safety update report (PSUR) annually.'
    ),

    heading(1, 'Conclusions & Recommendations'),
    paragraph(
      'Based on the clinical evaluation performed in accordance with MEDDEV 2.7/1 rev. 4, the GlucoSense CGM meets the relevant General Safety and Performance Requirements of MDR 2017/745. The clinical data demonstrate acceptable safety and performance for the intended purpose. The benefit-risk profile is favorable.'
    ),
    paragraph(
      'Recommendation: The GlucoSense CGM is suitable for CE marking under EU MDR 2017/745. The clinical evaluation should be updated at least annually or when significant new clinical data becomes available.'
    ),
  ],
};

// ── Mock Vault Store ───────────────────────────────────────────────────────────

export type MockDocument = {
  id: string;
  documentType: string;
  title: string;
  content: any;
  createdAt: string;
  updatedAt: string;
  version: number;
};

const store = new Map<string, MockDocument>();

function initializeDefaults() {
  if (store.size > 0) return;

  const now = new Date().toISOString();
  const defaults: MockDocument[] = [
    {
      id: 'mock-510k-001',
      documentType: 'cerv2_510k',
      title: 'CardioMonitor Pro 510(k) Submission',
      content: mock510kContent,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    {
      id: 'mock-pma-001',
      documentType: 'cerv2_pma',
      title: 'NeuroStim Adaptive DBS PMA Application',
      content: mockPmaContent,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
    {
      id: 'mock-cer-001',
      documentType: 'cerv2_cer',
      title: 'GlucoSense CGM Clinical Evaluation Report',
      content: mockCerContent,
      createdAt: now,
      updatedAt: now,
      version: 1,
    },
  ];

  for (const doc of defaults) {
    store.set(doc.id, doc);
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export const mockVault = {
  /** Initialize default mock documents if not already loaded. */
  init() {
    initializeDefaults();
  },

  /** List all documents, optionally filtered by docType. */
  list(docType?: string): MockDocument[] {
    initializeDefaults();
    const all = Array.from(store.values());
    if (docType) return all.filter(d => d.documentType === docType);
    return all;
  },

  /** Get a single document by ID. */
  get(id: string): MockDocument | undefined {
    initializeDefaults();
    return store.get(id);
  },

  /** Get mock content for a specific doc type (first matching document). */
  getContentByType(docType: string): any | undefined {
    initializeDefaults();
    const doc = Array.from(store.values()).find(d => d.documentType === docType);
    return doc?.content;
  },

  /** Save / update a document (upsert). */
  save(id: string, data: Partial<MockDocument>): MockDocument {
    initializeDefaults();
    const existing = store.get(id);
    const now = new Date().toISOString();
    const doc: MockDocument = {
      id,
      documentType: data.documentType || existing?.documentType || 'cerv2_510k',
      title: data.title || existing?.title || 'Untitled Document',
      content: data.content ?? existing?.content ?? { type: 'doc', content: [] },
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      version: (existing?.version || 0) + 1,
    };
    store.set(id, doc);
    return doc;
  },

  /** Delete a document. */
  delete(id: string): boolean {
    return store.delete(id);
  },

  /** Reset store to defaults (useful for tests). */
  reset() {
    store.clear();
    initializeDefaults();
  },

  /** Get the raw mock editor JSON for a doc type (for export simulation). */
  getMockEditorJson(docType: string): any {
    if (docType === 'cerv2_510k') return mock510kContent;
    if (docType === 'cerv2_pma') return mockPmaContent;
    if (docType === 'cerv2_cer') return mockCerContent;
    return mock510kContent;
  },
};
