/**
 * Global IVD market-access corpus — wave 2.
 *
 * Additional jurisdictions beyond the wave-1 set (US/EU/CA/JP/CN/BR/AU): the
 * post-Brexit UK, Switzerland, South Korea, India, Saudi Arabia, and Singapore —
 * each with authority, instrument, local-representation, and reliance/leverage.
 */

import type { KnowledgeEntry } from '../types';

export const GLOBAL_IVD_KNOWLEDGE_2: KnowledgeEntry[] = [
  {
    id: 'global.ivd.uk-mhra',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'United Kingdom — MHRA, UKCA marking, and the post-Brexit IVD framework',
    jurisdictions: ['UK'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Post-Brexit Great Britain regulates IVDs under the UK MDR 2002 (as amended) with the UKCA mark and MHRA registration; CE-marked IVDs remain accepted for a transition period, new UK regulations (incl. an IVD-specific regime and IDAP) are phasing in, and Northern Ireland follows EU IVDR under the Windsor Framework.',
    detail:
      'Great Britain (England, Wales, Scotland) regulates medical devices/IVDs under the Medical Devices Regulations 2002 (as amended), overseen by the MHRA, with conformity shown by the UKCA mark and mandatory MHRA registration (a UK Responsible Person is required for non-UK manufacturers). To avoid disruption, the MHRA has extended acceptance of CE-marked devices (including EU IVDR-compliant IVDs) for defined periods, while developing new UK regulations — post-market surveillance requirements came into force first (2024–2025), with broader pre-market and an IVD-specific framework following, plus the Innovative Devices Access Pathway (IDAP) and reliance on comparable-regulator approvals. Northern Ireland, under the Windsor Framework, continues to apply EU IVDR and uses CE (and UKNI) marking. Practically, manufacturers can leverage their EU IVDR technical file for the UK, layered with UK registration, a UK Responsible Person, and UK-specific PMS obligations.',
    keyPoints: [
      'GB: UK MDR 2002 (amended), MHRA, UKCA mark + MHRA registration.',
      'CE/EU IVDR devices accepted during a transition; new UK + IVD-specific rules phasing in.',
      'Non-UK manufacturers need a UK Responsible Person; PMS rules came first.',
      'Northern Ireland follows EU IVDR (Windsor Framework); reliance routes/IDAP available.',
    ],
    citations: [
      { label: 'UK Medical Devices Regulations 2002 (as amended); MHRA guidance', source: 'MHRA' },
      { label: 'MHRA roadmap / PMS Regulations 2024; Windsor Framework', source: 'MHRA' },
    ],
    related: ['eu.ivdr.overview', 'global.ivd.imdrf', 'global.ivd.mdsap'],
    tags: ['uk', 'mhra', 'ukca', 'brexit', 'windsor-framework', 'idap'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.switzerland',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'Switzerland — Swissmedic, IvDO, and loss of EU MRA recognition',
    jurisdictions: ['EU'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'Switzerland regulates IVDs under its Ordinance on In-vitro Diagnostic Medical Devices (IvDO), aligned to EU IVDR; since the EU-Swiss MRA lapsed, Switzerland is a third country requiring a Swiss Authorised Representative (CH-REP) and registration, while accepting CE-marked IVDs.',
    detail:
      'Swiss IVD regulation (the IvDO/IvDV) mirrors EU IVDR requirements (classification, performance evaluation, technical documentation). However, the Mutual Recognition Agreement (MRA) between Switzerland and the EU was not updated for the MDR/IVDR, so Switzerland became a "third country": EU manufacturers selling into Switzerland must appoint a Swiss Authorised Representative (CH-REP) and import via a Swiss importer, with registration to Swissmedic, and vice-versa for Swiss manufacturers selling into the EU (who need an EU AR). Switzerland accepts CE-marked IVDs (notified-body certificates) under transitional timelines aligned to the EU. The practical effect is added local-representation and registration burden on top of an essentially EU-equivalent technical file.',
    keyPoints: [
      'IvDO is EU-IVDR-aligned (classification, performance evaluation, tech doc).',
      'EU-Swiss MRA lapsed → Switzerland is a third country.',
      'Need a Swiss Authorised Representative (CH-REP) + importer + Swissmedic registration.',
      'CE-marked IVDs accepted on EU-aligned transitional timelines.',
    ],
    citations: [
      { label: 'Swiss Ordinance on IVD Medical Devices (IvDO); Swissmedic guidance', source: 'Swissmedic' },
    ],
    related: ['eu.ivdr.overview', 'eu.ivdr.notified-bodies'],
    tags: ['switzerland', 'swissmedic', 'ivdo', 'ch-rep', 'mra'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.south-korea-mfds',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'South Korea — MFDS IVD licensing and local clinical/technical requirements',
    jurisdictions: ['global'],
    appliesTo: ['ivd', 'cdx'],
    summary:
      'South Korea\'s MFDS regulates IVDs under a dedicated IVD Act with risk-based classes (1–4); higher classes require technical review and often local clinical evaluation, a Korea License Holder/importer, KGMP quality certification, and Korean-language documentation.',
    detail:
      'Following the enactment of a dedicated In Vitro Diagnostic Medical Devices Act, the Korean Ministry of Food and Drug Safety (MFDS) regulates IVDs separately from other devices, with four risk classes. Lower-risk devices may be notified/certified, while higher-risk (Class 3–4) require MFDS approval with technical documentation review and frequently clinical performance evaluation, including consideration of Korean-population data for novel markers. A local entity (license holder/importer) is required, manufacturers must hold Korea GMP (KGMP) certification (for which MDSAP/ISO 13485 evidence can support but not fully replace the audit), and submissions/labeling are in Korean. MFDS participates in international harmonization (IMDRF) and offers expedited routes for innovative devices.',
    keyPoints: [
      'Dedicated IVD Act; MFDS; risk classes 1–4.',
      'Class 3–4: technical review + often local clinical evaluation.',
      'Korea license holder/importer + KGMP certification required.',
      'Korean documentation; MDSAP/ISO 13485 supports KGMP; IMDRF-aligned.',
    ],
    citations: [
      { label: 'Korea IVD Medical Devices Act; MFDS guidance', source: 'MFDS' },
    ],
    related: ['global.ivd.mdsap', 'global.ivd.imdrf', 'global.ivd.china-nmpa'],
    tags: ['south-korea', 'mfds', 'kgmp', 'ivd-act'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.india-cdsco',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'India — CDSCO under the Medical Devices Rules 2017 (risk classes A–D)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'India\'s CDSCO regulates IVDs under the Medical Devices Rules 2017 with four risk classes (A–D); registration/licensing scales with class, requires an authorised Indian agent and import licence, and notified IVDs increasingly require mandatory registration.',
    detail:
      'Under the Medical Devices Rules 2017 (and the phased notification bringing all devices/IVDs under regulation), India\'s Central Drugs Standard Control Organisation (CDSCO) classifies IVDs into Classes A (low) to D (high). Class A/B are largely handled by State Licensing Authorities; Class C/D by the Central Licensing Authority. Foreign manufacturers must appoint an Indian Authorised Agent holding the import licence (Form MD-14/MD-15 process), submit a device master file and plant master file, and meet labeling requirements. India recognizes approvals from certain reference regulators and ISO 13485, which can streamline review, though some local testing/clinical data may be required for higher-risk or novel IVDs. A voluntary-to-mandatory registration transition has progressively expanded coverage.',
    keyPoints: [
      'Medical Devices Rules 2017; CDSCO; IVD classes A–D.',
      'Class A/B via State, C/D via Central Licensing Authority.',
      'Indian Authorised Agent + import licence (MD-14/MD-15); DMF/PMF.',
      'Reference-regulator approvals + ISO 13485 streamline; some local data for high-risk.',
    ],
    citations: [
      { label: 'India Medical Devices Rules 2017; CDSCO guidance', source: 'CDSCO' },
    ],
    related: ['global.ivd.imdrf', 'std.iso-13485'],
    tags: ['india', 'cdsco', 'mdr-2017', 'authorised-agent'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.saudi-sfda',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'Saudi Arabia — SFDA Medical Device Marketing Authorization (reliance-friendly)',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Saudi Arabia\'s SFDA requires a Medical Device Marketing Authorization (MDMA) and an Authorized Representative; it operates a reliance model accepting approvals/certificates from founding GHTF/reference jurisdictions (US/EU/Canada/Japan/Australia) to expedite licensing.',
    detail:
      'The Saudi Food and Drug Authority (SFDA) regulates IVDs with a GHTF/IMDRF-aligned risk classification and requires a Medical Device Marketing Authorization (MDMA) plus a locally licensed Authorized Representative (and an establishment licence for the AR/importer). SFDA is notably reliance-friendly: it accepts marketing approvals/certificates (e.g., FDA clearance/approval, EU CE certificates, Health Canada, TGA, PMDA) and ISO 13485/MDSAP evidence to streamline its review, with a shorter pathway for devices already approved by recognized regulators. Arabic labeling and the local AR are mandatory. This makes SFDA one of the faster secondary-market entries when a strong US/EU file already exists.',
    keyPoints: [
      'SFDA MDMA + locally licensed Authorized Representative required.',
      'Reliance model: accepts US/EU/CA/JP/AU approvals + ISO 13485/MDSAP.',
      'Faster pathway for devices already approved by reference regulators.',
      'Arabic labeling mandatory.',
    ],
    citations: [
      { label: 'SFDA Medical Devices Interim Regulation; MDMA guidance', source: 'SFDA' },
    ],
    related: ['global.ivd.imdrf', 'global.ivd.mdsap'],
    tags: ['saudi-arabia', 'sfda', 'mdma', 'reliance'],
    lastReviewed: '2026-06-09',
  },
  {
    id: 'global.ivd.singapore-hsa',
    domain: 'regulatory',
    topic: 'global-market-access',
    title: 'Singapore — HSA registration with abridged/reliance evaluation routes',
    jurisdictions: ['global'],
    appliesTo: ['ivd'],
    summary:
      'Singapore\'s HSA regulates IVDs under the Health Products Act with risk classes A–D; it offers full, abridged, and immediate registration routes that leverage prior approvals from reference regulators, requiring a local Registrant.',
    detail:
      'The Health Sciences Authority (HSA) regulates IVDs under the Health Products Act and its medical-device regulations, with GHTF-aligned classes A–D. A key feature is tiered evaluation routes: a full evaluation for novel devices, and abridged/expedited/immediate routes for devices already approved by reference regulators (the US FDA, EU notified bodies, Health Canada, TGA, PMDA), substantially reducing review time and data burden. A locally based Registrant (and dealer\'s licence for importers/manufacturers) is required, and the device is listed on the Singapore Medical Device Register (SMDR). HSA aligns with IMDRF and accepts ISO 13485/MDSAP for QMS. This makes Singapore an efficient ASEAN entry point and a common regional hub.',
    keyPoints: [
      'Health Products Act; HSA; GHTF classes A–D.',
      'Full vs abridged/immediate routes leveraging reference-regulator approvals.',
      'Local Registrant + dealer licence; listing on SMDR.',
      'IMDRF-aligned; ISO 13485/MDSAP accepted; efficient ASEAN hub.',
    ],
    citations: [
      { label: 'Singapore Health Products Act; HSA medical device guidance', source: 'HSA' },
    ],
    related: ['global.ivd.imdrf', 'global.ivd.mdsap', 'global.ivd.australia-tga'],
    tags: ['singapore', 'hsa', 'smdr', 'abridged-route', 'asean'],
    lastReviewed: '2026-06-09',
  },
];
