/**
 * IVD labeling content-rules corpus (US + EU).
 *
 * Deep, citable entries on what must appear on/with an IVD: the FDA 21 CFR
 * 809.10 package-insert content model, UDI labeling, symbols, RUO/IUO label
 * statements, and the EU IVDR Annex I Chapter III label + instructions-for-use
 * requirements (including electronic IFU and language rules).
 */

import type { KnowledgeEntry } from '../types';

export const LABELING_RULES_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'label.fda.809-10-package-insert',
    domain: 'regulatory',
    topic: 'labeling-content',
    title: 'FDA 21 CFR 809.10 — IVD label and package-insert content',
    jurisdictions: ['US'],
    appliesTo: ['ivd'],
    summary:
      '21 CFR 809.10 prescribes the content of IVD labels and package inserts: §809.10(a) governs the outer label, §809.10(b) the package insert with a fixed set of sections including intended use, principle, reagents, procedure, quality control, limitations, and specific performance characteristics.',
    detail:
      '21 CFR 809.10 is the IVD-specific labeling rule. §809.10(a) (the container/outer label) requires the proprietary/established name, "in vitro diagnostic use" statement, manufacturer details, lot number, expiration date, storage conditions, quantity/contents, and any warnings/precautions. §809.10(b) (the package insert / instructions for use) requires a defined section set: (1) proprietary and established name, intended use; (2) summary and explanation of the test; (3) principle of the procedure; (4) reagents (with warnings/precautions, e.g., labeling for hazardous components); (5) instruments; (6) specimen collection and preparation; (7) procedure; (8) results/interpretation; (9) limitations of the procedure; (10) expected values/reference intervals; and (11) specific performance characteristics — accuracy, precision, analytical sensitivity and specificity (interferences), and, where applicable, clinical performance. The "limitations" and "specific performance characteristics" sections are where analytical/clinical validation results and IFU warnings (interferences, hook effect, specimen constraints) are surfaced to the user.',
    keyPoints: [
      '§809.10(a) = outer label; §809.10(b) = package insert with a fixed section set.',
      'Performance characteristics (accuracy, precision, sensitivity/specificity) are mandatory insert content.',
      'Limitations section carries interference/hook/specimen warnings from validation.',
      'Expected values/reference intervals are a required section.',
    ],
    pitfalls: [
      'Omitting quantitative performance data that 809.10(b)(12) requires.',
      'Burying interference/limitation findings instead of stating them as labeled limitations.',
    ],
    citations: [
      { label: '21 CFR 809.10 (IVD labeling)', source: 'FDA', url: 'https://www.ecfr.gov/current/title-21/section-809.10' },
    ],
    related: ['fda.ivd.definition-and-ruo-iuo', 'label.symbols-15223', 'sci.ivd.interference', 'sci.ivd.reference-intervals'],
    tags: ['labeling', '809.10', 'package-insert', 'ifu', 'fda'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'label.fda.udi',
    domain: 'regulatory',
    topic: 'labeling-content',
    title: 'FDA UDI labeling and GUDID (21 CFR 801 subpart B / Part 830)',
    jurisdictions: ['US'],
    appliesTo: ['ivd'],
    summary:
      'FDA\'s UDI rule requires most devices to bear a Unique Device Identifier (a device identifier + production identifier) in both plain-text and AccessGS1/HIBCC/ICCBBA machine-readable form, with the device identifier and attributes submitted to the Global UDI Database (GUDID).',
    detail:
      'Under 21 CFR Part 830 and the labeling requirements in 21 CFR 801 subpart B, a UDI comprises a Device Identifier (DI — the mandatory, fixed portion identifying the labeler and version/model) and a Production Identifier (PI — conditional, variable data such as lot/batch, serial number, expiration date, manufacturing date). The UDI must appear on the label and package in plain text and AIDC (automatic identification and data capture, e.g., barcode), issued under an FDA-accredited agency (GS1, HIBCC, ICCBBA). The labeler submits the DI record and a defined set of attributes to the Global UDI Database (GUDID). For IVDs, UDI supports traceability, postmarket surveillance (MAUDE/recall linkage), and is the US analogue to the EU Basic UDI-DI/UDI system.',
    keyPoints: [
      'UDI = Device Identifier (fixed) + Production Identifier (variable: lot/serial/expiry).',
      'Plain-text + AIDC (barcode) on label/package; issued via GS1/HIBCC/ICCBBA.',
      'DI + attributes submitted to GUDID.',
      'Underpins traceability and MAUDE/recall linkage.',
    ],
    citations: [
      { label: '21 CFR Part 830 (UDI); 21 CFR 801 subpart B', source: 'FDA' },
      { label: 'GUDID (Global UDI Database)', source: 'FDA' },
    ],
    related: ['eu.ivdr.notified-bodies', 'label.fda.809-10-package-insert'],
    tags: ['udi', 'gudid', 'di', 'pi', 'aidc', 'fda'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'label.symbols-15223',
    domain: 'regulatory',
    topic: 'labeling-content',
    title: 'Labeling symbols — ISO 15223-1 and FDA use-of-symbols rule',
    jurisdictions: ['US', 'EU'],
    appliesTo: ['ivd'],
    summary:
      'ISO 15223-1 defines standardized symbols for device/IVD labels (manufacturer, IVD, lot, expiry, temperature limits, "consult IFU", etc.); FDA\'s 21 CFR 801.15(c) permits standalone use of recognized standard symbols without adjacent text, and EU IVDR labeling relies heavily on them.',
    detail:
      'ISO 15223-1:2021 specifies symbols used to convey information on medical-device/IVD labels — manufacturer, authorized representative, IVD device, batch/lot code, serial number, use-by date, temperature limits, biological-risk, "consult instructions for use," CE-relevant symbols, and many IVD-specific symbols (e.g., for controls, calibrators, specimen types). In the US, FDA\'s 2016 symbols rule (21 CFR 801.15(c)) allows use of standalone symbols from FDA-recognized standards (such as ISO 15223-1) without adjacent explanatory text, provided a symbols glossary is available. The EU relies on ISO 15223-1 symbols extensively to satisfy IVDR Annex I Chapter III label requirements and to manage multi-language labeling efficiently. A symbols glossary in the IFU is expected in both regions.',
    keyPoints: [
      'ISO 15223-1 = standardized device/IVD label symbols.',
      'FDA 21 CFR 801.15(c) permits standalone recognized symbols (with a glossary).',
      'EU IVDR labeling relies heavily on ISO 15223-1 symbols.',
      'Provide a symbols glossary in the IFU.',
    ],
    citations: [
      { label: 'ISO 15223-1:2021', source: 'ISO' },
      { label: '21 CFR 801.15(c) (use of symbols in labeling)', source: 'FDA' },
    ],
    related: ['std.iso-18113', 'label.fda.809-10-package-insert', 'label.eu.ivdr-annex-i-ch3'],
    tags: ['symbols', 'iso-15223-1', '801.15', 'labeling'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'label.fda.ruo-iuo-statements',
    domain: 'regulatory',
    topic: 'labeling-content',
    title: 'RUO/IUO label statements and promotional limits',
    jurisdictions: ['US'],
    appliesTo: ['ivd', 'ruo'],
    summary:
      'Products in research or investigational phases must bear the exact statutory statements — "For Research Use Only. Not for use in diagnostic procedures." (RUO) or "For Investigational Use Only..." (IUO) — and avoid any clinical/diagnostic claims that would convert them into unapproved IVDs.',
    detail:
      'Under 21 CFR 809.10(c), products not yet ready for clinical diagnostic use carry prescribed labels: RUO products must be labeled "For Research Use Only. Not for use in diagnostic procedures."; IUO products (in the product-development/clinical-investigation phase) must be labeled "For Investigational Use Only. The performance characteristics of this product have not been established." The 2013 FDA guidance makes clear that beyond the statement itself, the manufacturer\'s promotion and support must be consistent with the stated phase — providing clinical interpretation, performance claims, or assistance integrating the product into clinical testing can render the RUO/IUO label false/misleading and the product an adulterated/misbranded unapproved IVD. This is the labeling-side counterpart to the LDT/RUO enforcement risk.',
    keyPoints: [
      'Exact RUO/IUO statements are required by 21 CFR 809.10(c).',
      'Promotion/support must match the declared research/investigational phase.',
      'Clinical claims on an RUO/IUO product can make it an unapproved IVD.',
    ],
    pitfalls: [
      'Pairing the RUO statement with clinical performance/interpretation claims.',
    ],
    citations: [
      { label: '21 CFR 809.10(c) (RUO/IUO labeling)', source: 'FDA' },
      { label: 'Guidance: Distribution of IVDs Labeled RUO/IUO (2013)', source: 'FDA' },
    ],
    related: ['fda.ivd.definition-and-ruo-iuo', 'legal.ivd.ldt-rule'],
    tags: ['ruo', 'iuo', 'labeling', 'promotion', '809.10c'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'label.eu.ivdr-annex-i-ch3',
    domain: 'regulatory',
    topic: 'labeling-content',
    title: 'EU IVDR Annex I Chapter III — label and instructions-for-use content',
    jurisdictions: ['EU'],
    appliesTo: ['ivd'],
    summary:
      'IVDR Annex I Section 20 specifies the information on the label and Section 20.4 the instructions for use: identity, intended purpose, intended user, performance characteristics, warnings/limitations, traceability of calibrators, and Basic UDI-DI — in languages accepted by the member states where the device is sold.',
    detail:
      'IVDR Annex I Chapter III sets the "information supplied with the device." Section 20.2 lists required label elements (device name, manufacturer and, if applicable, authorized representative, intended purpose, UDI carrier, lot/serial, use-by date, storage/handling conditions, warnings/precautions, indication of IVD and self-test/near-patient where relevant). Section 20.4 lists the instructions-for-use content: intended purpose (analyte/marker, function such as screening/diagnosis/monitoring, intended user, specimen types, intended population), the assay principle, performance characteristics (analytical and clinical), metrological traceability of assigned values, warnings/limitations/interferences, and residual-risk information. Languages must be those accepted in each member state where the device is made available (often necessitating multi-language IFUs and reliance on ISO 15223-1 symbols). For professional-use devices, electronic instructions for use (eIFU) are permitted under Regulation (EU) 2021/2226, subject to conditions (paper on request, website availability).',
    keyPoints: [
      'Annex I §20.2 (label) and §20.4 (IFU) define required content.',
      'IFU must state intended purpose, performance, traceability, and limitations.',
      'Languages per each member state of sale (drives multi-language IFUs + symbols).',
      'eIFU allowed for professional use under Reg. (EU) 2021/2226 (with conditions).',
    ],
    citations: [
      { label: 'IVDR Annex I Chapter III, Section 20 (label & IFU)', source: 'EU' },
      { label: 'Regulation (EU) 2021/2226 (electronic instructions for use)', source: 'EU' },
      { label: 'ISO 15223-1 (symbols) / ISO 18113 (IVD information supplied)', source: 'ISO' },
    ],
    related: ['eu.ivdr.gspr', 'std.iso-18113', 'label.symbols-15223', 'sci.ivd.traceability'],
    tags: ['labeling', 'ivdr', 'annex-i', 'ifu', 'eifu', 'language'],
    lastReviewed: '2026-06-09',
  },
];
