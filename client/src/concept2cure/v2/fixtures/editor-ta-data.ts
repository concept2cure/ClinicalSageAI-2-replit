/**
 * Therapeutic Areas and TA Group metadata -- ported verbatim from concept2cure-v2:
 *   app/editor-ta-templates.jsx -> REG_TA, REG_TA_GROUPS
 *
 * GENERATED from the kit data file -- edit the kit first, then re-port.
 */

/* ---- Interfaces ---- */

export interface TherapeuticArea {
  readonly id: string;
  readonly label: string;
  readonly group: string;
  readonly agencies: string;
}

export interface TherapeuticAreaGroup {
  readonly id: string;
  readonly label: string;
  readonly icon: string;
}

/* ---- Therapeutic Areas ---- */

export const REG_TA: readonly TherapeuticArea[] = [
  /* Drug / small molecule (FDA CDER division-aligned) */
  { id: 'onc',        label: 'Oncology — solid tumors',             group: 'Drug',     agencies: 'FDA OND · EMA COMP · PMDA · NMPA · TGA · HC' },
  { id: 'hemonc',     label: 'Oncology — hematologic malignancies', group: 'Drug',     agencies: 'FDA OND · EMA · PMDA' },
  { id: 'cv',         label: 'Cardiovascular',                      group: 'Drug',     agencies: 'FDA DCVRM · EMA CHMP · PMDA · NMPA' },
  { id: 'renal',      label: 'Nephrology & renal',                  group: 'Drug',     agencies: 'FDA DCVRM · EMA · PMDA' },
  { id: 'neuro',      label: 'Neurology',                           group: 'Drug',     agencies: 'FDA DN · EMA · PMDA · NMPA' },
  { id: 'psych',      label: 'Psychiatry',                          group: 'Drug',     agencies: 'FDA DP · EMA CHMP · PMDA' },
  { id: 'imm',        label: 'Immunology & inflammation',           group: 'Drug',     agencies: 'FDA DAIDP · EMA · PMDA · NMPA' },
  { id: 'autoimmune', label: 'Autoimmune & transplant',             group: 'Drug',     agencies: 'FDA · EMA · PMDA' },
  { id: 'id',         label: 'Infectious disease — antivirals',     group: 'Drug',     agencies: 'FDA DAVP · EMA · PMDA · NMPA' },
  { id: 'abx',        label: 'Infectious disease — antibacterials', group: 'Drug',     agencies: 'FDA DAIP · EMA (CHMP Art 58)' },
  { id: 'antifung',   label: 'Infectious disease — antifungals & antiparasitics', group: 'Drug', agencies: 'FDA DAIP · EMA' },
  { id: 'met',        label: 'Metabolic & endocrine — diabetes',    group: 'Drug',     agencies: 'FDA DMEP · EMA · PMDA · NMPA' },
  { id: 'obesity',    label: 'Metabolic — obesity & lipids',        group: 'Drug',     agencies: 'FDA DMEP · EMA' },
  { id: 'thyroid',    label: 'Endocrine — thyroid & bone',          group: 'Drug',     agencies: 'FDA DMEP · EMA' },
  { id: 'resp',       label: 'Respiratory — asthma & COPD',         group: 'Drug',     agencies: 'FDA DPARP · EMA · PMDA' },
  { id: 'cf',         label: 'Respiratory — cystic fibrosis & rare pulmonary', group: 'Drug', agencies: 'FDA DPARP · EMA OD' },
  { id: 'gi',         label: 'Gastroenterology',                    group: 'Drug',     agencies: 'FDA DGIEP · EMA · PMDA' },
  { id: 'hepat',      label: 'Hepatology',                          group: 'Drug',     agencies: 'FDA DGIEP · EMA · PMDA' },
  { id: 'derm',       label: 'Dermatology',                         group: 'Drug',     agencies: 'FDA DDP · EMA · PMDA' },
  { id: 'ophtho',     label: 'Ophthalmology',                       group: 'Drug',     agencies: 'FDA · EMA · PMDA' },
  { id: 'rheum',      label: 'Rheumatology & musculoskeletal',      group: 'Drug',     agencies: 'FDA · EMA · PMDA' },
  { id: 'pain',       label: 'Pain & anesthesiology',               group: 'Drug',     agencies: 'FDA DAAAP · EMA · PMDA' },
  { id: 'repro',      label: 'Reproductive & women\'s health',      group: 'Drug',     agencies: 'FDA DRUP · EMA · PMDA' },
  { id: 'uro',        label: 'Urology',                             group: 'Drug',     agencies: 'FDA DRUP · EMA · PMDA' },
  { id: 'hema',       label: 'Hematology (non-oncology)',           group: 'Drug',     agencies: 'FDA OHT · EMA · PMDA' },
  { id: 'rare',       label: 'Rare / orphan disease',               group: 'Drug',     agencies: 'FDA OOPD · EMA OD · PMDA Sakigake · NMPA' },
  { id: 'peds',       label: 'Pediatrics (cross-cutting)',          group: 'Drug',     agencies: 'FDA OPT · EMA PDCO · PMDA · HC' },
  { id: 'geri',       label: 'Geriatrics (cross-cutting)',          group: 'Drug',     agencies: 'FDA · EMA GerMed · PMDA' },
  { id: 'otc',        label: 'OTC / consumer health',               group: 'Drug',     agencies: 'FDA OTC Monograph · HC NHP · TGA AUST-L' },
  { id: 'controlled', label: 'Controlled substances & cannabis',    group: 'Drug',     agencies: 'FDA · DEA Schedule · HC Cannabis · TGA SAS' },

  /* Biologics (FDA CBER-aligned) */
  { id: 'vacc',       label: 'Vaccines — prophylactic',             group: 'Biologic', agencies: 'FDA OVRR · EMA · PMDA · WHO PQ' },
  { id: 'vaccther',   label: 'Vaccines — therapeutic',              group: 'Biologic', agencies: 'FDA OVRR · EMA' },
  { id: 'blood',      label: 'Blood products & transfusion',        group: 'Biologic', agencies: 'FDA OBRR · EMA' },
  { id: 'gene',       label: 'Gene therapy',                        group: 'Biologic', agencies: 'FDA OTAT · EMA CAT · PMDA Saisei' },
  { id: 'cell',       label: 'Cell therapy & tissue engineering',   group: 'Biologic', agencies: 'FDA OTAT · EMA CAT · PMDA Saisei' },
  { id: 'atmp',       label: 'Advanced therapy medicinal products (ATMPs)', group: 'Biologic', agencies: 'EMA CAT · PMDA SAKIGAKE' },
  { id: 'allergen',   label: 'Allergenics',                         group: 'Biologic', agencies: 'FDA OVRR · EMA' },
  { id: 'biosim',     label: 'Biosimilars',                         group: 'Biologic', agencies: 'FDA OBE · EMA · PMDA · HC · TGA · ANVISA' },
  { id: 'plasma',     label: 'Plasma-derived products',             group: 'Biologic', agencies: 'FDA OBRR · EMA · PMDA' },

  /* Medical Devices (FDA CDRH / EU MDR / PMDA / NMPA) */
  { id: 'cvdevice',   label: 'Cardiovascular devices',              group: 'Device',   agencies: 'CDRH · NB (EU MDR) · PMDA · NMPA' },
  { id: 'ortho',      label: 'Orthopedic & spine devices',          group: 'Device',   agencies: 'CDRH · NB (EU MDR) · PMDA' },
  { id: 'neurodev',   label: 'Neurological devices',                group: 'Device',   agencies: 'CDRH · NB (EU MDR) · PMDA' },
  { id: 'ophtdev',    label: 'Ophthalmic devices',                  group: 'Device',   agencies: 'CDRH · NB (EU MDR)' },
  { id: 'genplast',   label: 'General & plastic surgery devices',   group: 'Device',   agencies: 'CDRH · NB (EU MDR)' },
  { id: 'dental',     label: 'Dental devices',                      group: 'Device',   agencies: 'CDRH · NB (EU MDR) · PMDA' },
  { id: 'ent',        label: 'ENT devices',                         group: 'Device',   agencies: 'CDRH · NB (EU MDR)' },
  { id: 'wound',      label: 'Wound care & dermatological devices', group: 'Device',   agencies: 'CDRH · NB (EU MDR)' },
  { id: 'radiol',     label: 'Radiological & imaging devices',      group: 'Device',   agencies: 'CDRH · NB (EU MDR) · PMDA' },
  { id: 'implant',    label: 'Active implantable devices',          group: 'Device',   agencies: 'CDRH · NB (EU MDR / AIMD)' },
  { id: 'combi',      label: 'Combination products',                group: 'Device',   agencies: 'FDA OCP · NB (EU MDR Art 1(8-9)) · PMDA' },

  /* In Vitro Diagnostics */
  { id: 'dx',         label: 'In vitro diagnostics — general',      group: 'IVD',      agencies: 'CDRH · NB (EU IVDR) · PMDA' },
  { id: 'molecdx',    label: 'Molecular diagnostics & NGS',         group: 'IVD',      agencies: 'CDRH · NB (IVDR Class C/D) · PMDA' },
  { id: 'cdxta',      label: 'Companion diagnostics',               group: 'IVD',      agencies: 'CDRH · NB (IVDR) · PMDA' },
  { id: 'poct',       label: 'Point-of-care testing',               group: 'IVD',      agencies: 'CDRH CLIA waiver · NB (IVDR)' },
  { id: 'ldtta',      label: 'Laboratory-developed tests (LDTs)',   group: 'IVD',      agencies: 'FDA (VALID Act) · CLIA' },
  { id: 'microb',     label: 'Microbiology & antimicrobial susceptibility', group: 'IVD', agencies: 'CDRH · NB (IVDR)' },

  /* Digital Health & SaMD */
  { id: 'samdta',     label: 'Software as a Medical Device (SaMD)',  group: 'Digital',  agencies: 'FDA (PCCP) · NB (EU MDR/IVDR) · PMDA · HC' },
  { id: 'dtx',        label: 'Digital therapeutics (DTx)',           group: 'Digital',  agencies: 'FDA (De Novo) · NB · NICE MTEP · DiGA' },
  { id: 'aiml',       label: 'AI/ML-based medical devices',         group: 'Digital',  agencies: 'FDA (PCCP/GMLP) · NB (EU MDR) · PMDA' },
  { id: 'mhealth',    label: 'Mobile health & wearables',           group: 'Digital',  agencies: 'FDA (enforcement discretion) · NB · PMDA' },
  { id: 'telehealth', label: 'Telehealth & remote monitoring',      group: 'Digital',  agencies: 'FDA · CMS · NB' },

  /* Region-specific */
  { id: 'kampo',      label: 'Kampo (traditional Japanese)',         group: 'Regional', agencies: 'PMDA' },
  { id: 'tcm',        label: 'Traditional Chinese Medicine (TCM)',   group: 'Regional', agencies: 'NMPA · CDE' },
  { id: 'herbal',     label: 'Herbal / traditional medicines',      group: 'Regional', agencies: 'EMA HMPC · PMDA · TGA AUST-L · ANVISA' },
  { id: 'radioph',    label: 'Radiopharmaceuticals & nuclear medicine', group: 'Regional', agencies: 'FDA · EMA · PMDA · NMPA' },

  /* Cross-cutting (not body-system specific) */
  { id: 'cmc',        label: 'Chemistry, Manufacturing & Controls',  group: 'Cross',    agencies: 'All agencies — Module 3 / Quality' },
  { id: 'device',     label: 'Medical devices (general)',            group: 'Cross',    agencies: 'CDRH · NB · PMDA · NMPA · TGA · MHRA · HC · Swissmedic · ANVISA' },
  { id: 'cross',      label: 'Cross-therapeutic (platform trials)',  group: 'Cross',    agencies: 'All agencies' },
  { id: 'emergency',  label: 'Emergency / pandemic preparedness',   group: 'Cross',    agencies: 'FDA EUA · EMA Art 5(3) · WHO EUL · HC IO' },
  { id: 'pharma',     label: 'Pharmaceuticals (general)',           group: 'Cross',    agencies: 'All drug agencies' },
];

/* ---- Group Metadata ---- */

export const REG_TA_GROUPS: readonly TherapeuticAreaGroup[] = [
  { id: 'Drug',     label: 'Drug / Small Molecule',  icon: 'beaker' },
  { id: 'Biologic', label: 'Biologics',              icon: 'atom' },
  { id: 'Device',   label: 'Medical Devices',        icon: 'stethoscope' },
  { id: 'IVD',      label: 'In Vitro Diagnostics',   icon: 'microscope' },
  { id: 'Digital',  label: 'Digital Health & SaMD',   icon: 'cpu' },
  { id: 'Regional', label: 'Region-Specific',         icon: 'globe' },
  { id: 'Cross',    label: 'Cross-Cutting',           icon: 'network' },
];
