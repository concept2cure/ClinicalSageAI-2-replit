/**
 * Global (ex-US/EU) IVD regulatory intelligence corpus.
 *
 * Citable entries on the major secondary markets and harmonisation frameworks:
 * Health Canada, Japan PMDA/MHLW, China NMPA, Brazil ANVISA, Australia TGA,
 * plus MDSAP and IMDRF. Each entry captures the authority, instrument, local
 * representation, evidence quirks, and how far US/EU work transfers.
 */

import type { KnowledgeEntry } from '../types';

export const GLOBAL_IVD_KNOWLEDGE: KnowledgeEntry[] = [
  {
    id: 'global.ivd.health-canada',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'Canada — Health Canada IVDD licensing (Classes I–IV) and mandatory MDSAP',
    jurisdictions: ['CA'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Health Canada regulates IVDs under the Food and Drugs Act and the Medical Devices Regulations (SOR/98-282), with a four-tier risk classification (I–IV). Class II–IV require a Medical Device Licence (MDL), and an MDSAP (ISO 13485) certificate is mandatory.',
    detail:
      'IVDs are a defined subset of medical devices under the Medical Devices Regulations (SOR/98-282). Classification uses IVD-specific rules to assign Class I (lowest) to Class IV (highest). Class I IVDs are handled through a Medical Device Establishment Licence (MDEL) for the importer/distributor; Class II, III, and IV require a Medical Device Licence (MDL) for the device itself, with escalating safety and effectiveness evidence (labelling, risk assessment, and for III/IV summaries of analytical and clinical performance).\n\nCanada was an early adopter of MDSAP and now requires a valid MDSAP certificate (ISO 13485-based, audited against Canadian requirements) as a condition of an MDL — there is no Canada-only QMS audit route. This makes MDSAP foundational for market entry. Health Canada accepts and references international standards and often aligns with IMDRF; sponsors can leverage much of an FDA/EU technical file, but must map evidence to the Canadian classification and MDL application format and provide bilingual (English/French) labelling.',
    keyPoints: [
      'Medical Devices Regulations SOR/98-282; IVD classes I–IV.',
      'Class II–IV need a Medical Device Licence (MDL); Class I via establishment licence (MDEL).',
      'MDSAP (ISO 13485) certificate is mandatory — no Canada-only QMS audit.',
      'Bilingual EN/FR labelling; evidence largely transferable from FDA/EU files.',
    ],
    citations: [
      { label: 'Medical Devices Regulations (SOR/98-282)', source: 'Health Canada' },
      { label: 'Guidance: Classification of IVDDs', source: 'Health Canada' },
      { label: 'MDSAP requirement for Canadian licences', source: 'Health Canada' },
    ],
    related: ['global.ivd.mdsap', 'std.iso-13485', 'global.ivd.imdrf'],
    tags: ['health-canada', 'mdl', 'mdsap', 'sor-98-282'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.japan-pmda',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'Japan — PMDA/MHLW approval (shōnin/ninshō) under the PMD Act',
    jurisdictions: ['JP'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Japan regulates IVDs under the PMD Act; the PMDA reviews and the MHLW approves. IVDs are risk-classified, with lower-risk certified types going via registered third-party certification (ninshō) and higher-risk/novel types requiring MHLW marketing approval (shōnin). A local Marketing Authorization Holder (MAH/DMAH) is required.',
    detail:
      'The Pharmaceuticals and Medical Devices Act (PMD Act) governs IVDs ("in-vitro diagnostics" are a distinct category). Risk classes map to review routes: many established IVDs with certification standards (ninshō kijun) obtain Third-Party Certification (ninshō) from a Registered Certification Body; novel or higher-risk IVDs require marketing approval (shōnin) reviewed by the PMDA and granted by the MHLW. Some low-risk items only require notification (todokede).\n\nA foreign manufacturer must operate through a local Marketing Authorization Holder (MAH) or appoint a Designated MAH (DMAH); the MAH holds the approval and the QMS/GVP responsibilities. Conformity to the Japanese QMS Ordinance (MHLW Ordinance No. 169, aligned to ISO 13485) is required and is increasingly satisfiable leveraging MDSAP, which Japan accepts to reduce on-site QMS inspection burden. Japan-specific dossier formatting (STED-like), Japanese-language labelling, and sometimes bridging/local data (especially for genetic/CDx tests) are expected. Reimbursement listing (functional category pricing under the national health insurance) is a separate, important step for commercial success.',
    keyPoints: [
      'PMD Act; PMDA reviews, MHLW approves.',
      'Routes: notification (todokede) / third-party certification (ninshō) / approval (shōnin) by risk.',
      'Local MAH/DMAH required; QMS per MHLW Ord. 169 (MDSAP accepted to ease inspection).',
      'Japanese labelling + possible bridging data; separate reimbursement listing.',
    ],
    citations: [
      { label: 'Pharmaceuticals and Medical Devices Act (PMD Act)', source: 'MHLW/PMDA' },
      { label: 'MHLW Ordinance No. 169 (QMS, ISO 13485-aligned)', source: 'MHLW' },
      { label: 'MDSAP acceptance in Japan', source: 'PMDA' },
    ],
    related: ['global.ivd.mdsap', 'std.iso-13485', 'global.ivd.imdrf'],
    tags: ['japan', 'pmda', 'shonin', 'ninsho', 'mah', 'dmah'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.china-nmpa',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'China — NMPA IVD registration, type testing, and local clinical data',
    jurisdictions: ['CN'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'China\'s NMPA classifies IVDs into Class I (filing) and Class II/III (registration). Higher classes typically require type testing at an NMPA-recognised Chinese laboratory and local clinical trial/evaluation data, plus a China-based legal agent — making it the most data-intensive major market.',
    detail:
      'Under the Regulations on the Supervision and Administration of Medical Devices (RSAMD, Decree 739) and IVD-specific rules, IVDs are classified Class I (lowest, record-filing/备案 at municipal level), Class II (provincial registration), and Class III (highest, national NMPA registration). Registration dossiers are extensive and China-specific.\n\nTwo features make China distinctive and burdensome: (1) Type testing — most Class II/III IVDs must undergo registration testing at an NMPA-recognised testing centre in China against applicable national/industry standards (GB/YY standards); (2) Clinical evaluation — many IVDs require clinical trials conducted at Chinese clinical institutions (or, for some, a clinical evaluation via comparison/literature route), with local-population data often expected, particularly for novel markers and CDx. A foreign manufacturer must appoint a China-based legal agent/registrant and an after-sales service entity. Dossiers and labelling are in Chinese. The combination of in-country type testing, local clinical data, and local representation means China typically cannot reuse a US/EU file wholesale and requires the longest, most resource-intensive program of the major markets.',
    keyPoints: [
      'RSAMD (Decree 739); IVD classes I (filing) / II (provincial) / III (national NMPA).',
      'Type testing at an NMPA-recognised Chinese lab against GB/YY standards.',
      'Local clinical trial/evaluation data often required (especially novel markers, CDx).',
      'Mandatory China-based legal agent; Chinese-language dossier/labelling.',
    ],
    pitfalls: [
      'Assuming a US/EU clinical file substitutes for China-local data.',
      'Underestimating type-testing queue times at recognised centres.',
    ],
    citations: [
      { label: 'RSAMD (State Council Decree No. 739)', source: 'NMPA' },
      { label: 'Measures for the Administration of Medical Device Registration', source: 'NMPA' },
      { label: 'GB/YY IVD national/industry standards', source: 'NMPA' },
    ],
    related: ['global.ivd.imdrf', 'fda.ivd.cdx'],
    tags: ['china', 'nmpa', 'type-testing', 'local-clinical-data', 'legal-agent'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.brazil-anvisa',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'Brazil — ANVISA registration/cadastro and MDSAP (B-GMP)',
    jurisdictions: ['BR'],
    appliesTo: ['ivd'],
    summary:
      'ANVISA regulates IVDs by risk class (I–IV); lower classes use a simplified notification (Cadastro) and higher classes full registration (Registro). A local Brazil Registration Holder (BRH) is required, and MDSAP can substitute for the B-GMP inspection.',
    detail:
      'Brazil\'s ANVISA classifies IVDs into risk Classes I–IV under its IVD-specific framework (RDC resolutions). Class I and II commonly follow the simplified Cadastro (notification) route, while Class III and IV require full Registro (registration) with safety/performance evidence. A Brazil Registration Holder (a locally established legal entity, often called the BRH or the legal manufacturer\'s local representative) must hold the registration.\n\nManufacturing quality is assessed against Brazilian Good Manufacturing Practices (B-GMP, RDC 665/2022 and related), historically via ANVISA on-site inspection. Crucially, Brazil is an MDSAP participating country and accepts an MDSAP certificate/report in lieu of (or to expedite) the B-GMP inspection for many device classes, which materially shortens timelines. Dossiers and labelling (the IFU/instructions) must be in Portuguese. Sponsors can leverage US/EU technical files but must reformat to ANVISA requirements and route through the local holder.',
    keyPoints: [
      'ANVISA IVD classes I–IV; Cadastro (notification) vs. Registro (full registration).',
      'Local Brazil Registration Holder required.',
      'MDSAP accepted to substitute/expedite the B-GMP inspection (RDC 665/2022).',
      'Portuguese labelling/IFU; US/EU files reusable after reformatting.',
    ],
    citations: [
      { label: 'ANVISA RDC resolutions (IVD classification/registration)', source: 'ANVISA' },
      { label: 'RDC 665/2022 (B-GMP)', source: 'ANVISA' },
      { label: 'MDSAP participation (Brazil)', source: 'ANVISA' },
    ],
    related: ['global.ivd.mdsap', 'std.iso-13485'],
    tags: ['brazil', 'anvisa', 'cadastro', 'registro', 'b-gmp', 'mdsap'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.australia-tga',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'Australia — TGA ARTG inclusion for IVDs (Classes 1–4)',
    jurisdictions: ['AU'],
    appliesTo: ['ivd'],
    summary:
      'The TGA regulates IVDs under the Therapeutic Goods Act with a GHTF-aligned four-tier classification (Class 1–4). Inclusion in the ARTG requires conformity-assessment evidence (EU/MDSAP often leverageable) and an Australian sponsor.',
    detail:
      'Australia\'s Therapeutic Goods Administration (TGA) regulates IVDs under the Therapeutic Goods Act 1989 and the IVD framework introduced in 2010, using a GHTF/IMDRF-aligned classification: Class 1 (lowest risk) to Class 4 (highest, e.g., tests for transmissible agents in blood/tissue donation). To supply, a product must be included in the Australian Register of Therapeutic Goods (ARTG), which requires (a) conformity-assessment evidence appropriate to class and (b) an Australian sponsor (a locally established entity that holds the ARTG entry and bears post-market responsibilities).\n\nThe TGA accepts a range of comparable overseas conformity-assessment evidence: CE certificates and MDSAP/ISO 13485 evidence can support TGA conformity assessment, reducing duplication, though the TGA may still conduct its own assessment for higher-risk classes and Class 4 in-house IVDs have specific requirements. Class 1 IVDs largely self-declare; Classes 2–4 require increasing TGA scrutiny. Australian labelling and the inclusion of an Australian sponsor are mandatory, and post-market obligations (incident reporting, recalls) follow ARTG inclusion.',
    keyPoints: [
      'Therapeutic Goods Act; GHTF-aligned IVD classes 1–4.',
      'ARTG inclusion + an Australian sponsor are mandatory to supply.',
      'CE/MDSAP/ISO 13485 evidence is leverageable for conformity assessment.',
      'Class 1 largely self-declares; 2–4 escalate TGA scrutiny.',
    ],
    citations: [
      { label: 'Therapeutic Goods Act 1989 + IVD framework', source: 'TGA' },
      { label: 'TGA IVD classification (GHTF-aligned)', source: 'TGA' },
      { label: 'ARTG inclusion requirements', source: 'TGA' },
    ],
    related: ['global.ivd.mdsap', 'std.iso-13485', 'global.ivd.imdrf'],
    tags: ['australia', 'tga', 'artg', 'sponsor'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.mdsap',
    domain: 'regulatory',
    topic: 'harmonisation',
    title: 'MDSAP — one QMS audit recognised by five regulators',
    jurisdictions: ['US', 'CA', 'JP', 'BR', 'AU', 'global'],
    appliesTo: ['ivd', 'device'],
    summary:
      'The Medical Device Single Audit Program lets one ISO 13485-based audit by an authorised auditing organisation satisfy the QMS requirements of Australia, Brazil, Canada, Japan, and the US — mandatory in Canada and leverageable in the others.',
    detail:
      'MDSAP is a program through which a single regulatory audit of a manufacturer\'s quality management system, performed by an MDSAP-recognised Auditing Organisation, satisfies the relevant requirements of the participating regulators: TGA (Australia), ANVISA (Brazil), Health Canada, MHLW/PMDA (Japan), and US FDA. The audit is built on ISO 13485 plus each jurisdiction\'s specific regulatory requirements, organised around a process model (management, design & development, production & service controls, CAPA, and the device marketing-authorisation and reporting linkages).\n\nIts weight differs by country: Health Canada makes MDSAP mandatory for licensing; the US FDA accepts MDSAP audit reports in lieu of routine FDA surveillance inspections; Japan and Brazil accept MDSAP to reduce/replace on-site QMS inspection; Australia accepts it as conformity-assessment evidence. For an IVD manufacturer pursuing multiple markets, achieving MDSAP early is the single highest-leverage QMS investment because it is foundational to Canada, materially eases Japan/Brazil/Australia, and reduces FDA inspection exposure.',
    keyPoints: [
      'One ISO 13485-based audit recognised by AU, BR, CA, JP, US.',
      'Mandatory for Canada; accepted by FDA in lieu of routine inspection; eases JP/BR/AU.',
      'Audited on a five-process model (management, design, production, CAPA, authorisation links).',
      'Highest-leverage early QMS investment for a multi-market IVD.',
    ],
    citations: [
      { label: 'MDSAP program (IMDRF/regulators)', source: 'IMDRF/FDA' },
      { label: 'MDSAP Audit Model (companion document)', source: 'IMDRF' },
    ],
    related: ['global.ivd.health-canada', 'global.ivd.japan-pmda', 'global.ivd.brazil-anvisa', 'global.ivd.australia-tga', 'std.iso-13485'],
    tags: ['mdsap', 'iso-13485', 'qms-audit', 'harmonisation'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.imdrf',
    domain: 'regulatory',
    topic: 'harmonisation',
    title: 'IMDRF — global convergence (SaMD, GMLP, UDI, RPS, essential principles)',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx', 'samd'],
    summary:
      'The International Medical Device Regulators Forum produces the harmonisation documents that national IVD frameworks increasingly adopt: SaMD risk categorisation, Good Machine Learning Practice, UDI, the Regulated Product Submission table of contents, and essential principles.',
    detail:
      'IMDRF (successor to the GHTF) is the voluntary forum of regulators (US, EU, Japan, Canada, Australia, Brazil, China, and others) that authors convergence guidance increasingly referenced in national rules. Documents most relevant to IVDs include: the Essential Principles of Safety and Performance (the common ancestor of GSPRs/special controls); the SaMD framework — definitions, risk categorisation (the "I–IV" significance-of-information × healthcare-situation matrix), and clinical evaluation — which underpins how IVD software/algorithms are risk-tiered; Good Machine Learning Practice (GMLP), co-authored with FDA/Health Canada/MHRA, guiding AI/ML diagnostic development; the UDI system guidance harmonising identifiers; and the Regulated Product Submission (RPS)/non-IVD and IVD table-of-contents formats that standardise dossiers.\n\nFor a manufacturer, IMDRF documents are valuable because aligning a technical file to IMDRF structures (essential principles mapping, SaMD categorisation, GMLP) maximises reuse across FDA, EU, Canada, Japan, Australia, and Brazil, and signals current best practice to reviewers even where not legally binding.',
    keyPoints: [
      'IMDRF = regulator forum (GHTF successor) producing convergence guidance.',
      'Key IVD-relevant outputs: Essential Principles, SaMD risk categorisation, GMLP, UDI, RPS ToC.',
      'SaMD framework underpins risk-tiering of IVD software/algorithms.',
      'Aligning files to IMDRF structures maximises cross-market reuse.',
    ],
    citations: [
      { label: 'IMDRF SaMD framework (N12/N23 etc.)', source: 'IMDRF' },
      { label: 'IMDRF Essential Principles of Safety and Performance', source: 'IMDRF' },
      { label: 'Good Machine Learning Practice (FDA/HC/MHRA)', source: 'IMDRF/FDA' },
    ],
    related: ['global.ivd.mdsap', 'fda.ivd.expedited-programs', 'std.iec-62304'],
    tags: ['imdrf', 'samd', 'gmlp', 'udi', 'essential-principles', 'convergence'],
    lastReviewed: '2026-06-09',
  },
];
