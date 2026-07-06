/**
 * Global-RI catalog FIXTURE — ported verbatim from the kit's globalri-data.jsx.
 *
 * The LIVE catalog comes from GET /api/global-ri/catalog via the existing
 * useGlobalRiCatalog() hook (@shared/types/global-ri-api — the gold-standard
 * contract-ready pattern). This fixture is the offline mirror rendered only
 * behind the SampleTag pill; GLOBAL_RI_RESULTS are representative
 * registry-grounded payloads shown offline in place of live capability runs,
 * each carrying its own caveat text.
 *
 * GENERATED from the kit data file — edit the kit first, then re-port.
 */
import type {
  EnrichedGlobalRiCapability,
  GlobalRiCapability,
  GlobalRiCatalog,
} from '@shared/types/global-ri-api';

export interface GriResultFixture {
  pedigree: string;
  summary: string;
  fields?: { k: string; v: string }[];
  citations?: string[];
  caveats?: string;
}

export interface GriInputSchema {
  properties?: Record<
    string,
    { type?: string; enum?: string[]; description?: string; format?: string }
  >;
  required?: string[];
}

/** Capability as the browser consumes it: the LIVE catalog carries per-tool
 * input schemas (`tools[].inputSchema` — @shared contract); the kit fixture
 * flattens the first tool's schema onto the capability. Both satisfy this. */
export type GriCapability = GlobalRiCapability & {
  inputSchema?: GriInputSchema;
  tools?: EnrichedGlobalRiCapability['tools'];
};

export type GriCatalog = Omit<GlobalRiCatalog, 'capabilities'> & {
  capabilities: GriCapability[];
};

export const GLOBAL_RI_CATALOG_FIXTURE_RAW = {
  total: 41,
  anaToolCount: 26,
  groups: [
    {
      id: 'strategy',
      label: 'Strategy & Pathway',
      order: 1,
      blurb: 'Pathway selection, cross-market strategy brief, dossier legal basis, fees, reliance, ICH guidance, and submission economics.',
    },
    {
      id: 'designations_access',
      label: 'Designations & Access',
      order: 2,
      blurb: 'Expedited/accelerated programs, orphan & pediatric designations, and pre-approval (expanded) access.',
    },
    {
      id: 'clinical',
      label: 'Clinical & Nonclinical',
      order: 3,
      blurb: 'Trial-application requirements, HA meetings, review timelines, nonclinical (ICH M3), bioequivalence, pediatric plans, and evidence standards.',
    },
    {
      id: 'quality_cmc',
      label: 'Quality & CMC',
      order: 4,
      blurb: 'Specifications (Q6), stability (Q1), impurities (Q3), and process validation.',
    },
    {
      id: 'safety_pv',
      label: 'Safety & Pharmacovigilance',
      order: 5,
      blurb: 'Investigational safety reporting (E2), post-approval pharmacovigilance, and GCP essential records (E6).',
    },
    {
      id: 'submissions',
      label: 'Submissions & Format',
      order: 6,
      blurb: 'Module 1, electronic submission format, labeling, post-approval changes, and inspection readiness.',
    },
    {
      id: 'devices_dx',
      label: 'Devices & Diagnostics',
      order: 7,
      blurb: 'Device/IVD classification, combination products, companion diagnostics, and advanced therapies.',
    },
    {
      id: 'lifecycle',
      label: 'Lifecycle & Post-market',
      order: 8,
      blurb: 'Exclusivity/LOE, recurring lifecycle obligations, and clinical-trial disclosure.',
    },
    {
      id: 'commercial_supply',
      label: 'Commercial & Supply Chain',
      order: 9,
      blurb: 'Promotion, controlled substances, establishment registration, and import/export licensing.',
    },
  ],
  byGroup: {
    strategy: 8,
    designations_access: 3,
    clinical: 7,
    quality_cmc: 4,
    safety_pv: 3,
    submissions: 5,
    devices_dx: 4,
    lifecycle: 3,
    commercial_supply: 4,
  },
  capabilities: [
    {
      id: 'regulatory_pathway',
      label: 'Regulatory pathway advisor',
      group: 'strategy',
      deterministic: true,
      description: 'Per-market clinical-trial + marketing-application pathway for a product type.',
      routes: ['POST /pathway'],
      anaTools: ['global_ri_regulatory_pathway'],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          productType: {
            type: 'string',
            enum: ['new_chemical_entity', 'biologic', 'biosimilar', 'generic', 'device', 'ivd', 'combination', 'atmp'],
            description: 'Product type.',
          },
        },
        required: ['market', 'productType'],
      },
    },
    {
      id: 'strategy_brief',
      label: 'Cross-market strategy brief',
      group: 'strategy',
      deterministic: true,
      description: 'One-call cross-market brief: pathway, designations, expedited, meetings, checklists, fees, exclusivity, pediatric + PV obligations.',
      routes: ['POST /strategy-brief'],
      anaTools: ['global_ri_strategy_brief'],
      inputSchema: {
        properties: {
          productType: {
            type: 'string',
            enum: ['new_chemical_entity', 'biologic', 'device', 'ivd'],
            description: 'Product type.',
          },
          markets: { type: 'string', description: 'Target markets, comma-separated (e.g. FDA, EMA, PMDA).' },
        },
        required: ['productType', 'markets'],
      },
    },
    {
      id: 'dossier_classifier',
      label: 'Dossier legal-basis classifier',
      group: 'strategy',
      deterministic: true,
      description: 'FDA 505(b)(1)/(b)(2)/ANDA/351(a)/(k) and EU Article 8(3)/10(x) marketing-application legal basis.',
      routes: ['GET /dossier/legal-bases/:region', 'POST /dossier/classify'],
      anaTools: ['global_ri_dossier_classifier'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          priorApproval: { type: 'boolean', description: 'Relies on a prior/reference approval.' },
        },
        required: ['region'],
      },
    },
    {
      id: 'fee_estimator',
      label: 'Regulatory fee estimator',
      group: 'strategy',
      deterministic: true,
      description: 'Indicative agency fees per market with orphan / small-business waivers.',
      routes: ['GET /fees/schedule/:market', 'POST /fees/estimate'],
      anaTools: ['global_ri_fee_estimate'],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          orphan: { type: 'boolean', description: 'Orphan / small-business waiver applies.' },
        },
        required: ['market'],
      },
    },
    {
      id: 'reliance_pathways',
      label: 'Reliance & work-sharing pathways',
      group: 'strategy',
      deterministic: true,
      description: 'Project Orbis, Access Consortium, EU-M4all, WHO CRP, ASEAN Joint Assessment, Swissmedic MAGHP.',
      routes: ['GET /reliance-pathways', 'GET /reliance-pathways/:id', 'POST /reliance-pathways/recommend'],
      anaTools: ['global_ri_reliance_pathways'],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
        },
        required: ['market'],
      },
    },
    {
      id: 'ich_guidelines',
      label: 'ICH guideline catalog',
      group: 'strategy',
      deterministic: true,
      description: 'Searchable ICH guideline reference catalog.',
      routes: ['GET /ich-guidelines', 'GET /ich-guidelines/:code'],
      anaTools: [],
      inputSchema: { properties: { code: { type: 'string', description: 'ICH code (e.g. Q1A, E6, M3).' } }, required: [] },
    },
    {
      id: 'guidance_map',
      label: 'Regulatory guidance map',
      group: 'strategy',
      deterministic: true,
      description: 'Governing ICH guidelines + regulations for a topic (grounding).',
      routes: ['GET /guidance/topics', 'GET /guidance/:topic'],
      anaTools: [],
      inputSchema: {
        properties: { topic: { type: 'string', description: 'Topic (e.g. stability, bioanalytical validation).' } },
        required: ['topic'],
      },
    },
    {
      id: 'submission_economics',
      label: 'Submission economics',
      group: 'strategy',
      deterministic: true,
      description: 'Combined fee + review-timeline projection for a submission.',
      routes: ['POST /submission-economics'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          submissionType: { type: 'string', enum: ['NDA', 'BLA', 'MAA', '510k', 'PMA', 'IND'], description: 'Submission type.' },
        },
        required: ['market', 'submissionType'],
      },
    },
    {
      id: 'expedited_programs',
      label: 'Expedited / accelerated programs',
      group: 'designations_access',
      deterministic: true,
      description: 'Match a development context to FDA/EMA/PMDA expedited programs.',
      routes: ['GET /expedited-programs', 'POST /expedited-programs/match'],
      anaTools: ['global_ri_expedited_programs'],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          unmetNeed: { type: 'boolean', description: 'Addresses unmet medical need.' },
          seriousCondition: { type: 'boolean', description: 'Serious or life-threatening condition.' },
        },
        required: ['market'],
      },
    },
    {
      id: 'special_designations',
      label: 'Orphan & pediatric designations',
      group: 'designations_access',
      deterministic: true,
      description: 'Orphan + pediatric designation eligibility per market.',
      routes: ['GET /designations/criteria/:market', 'POST /designations/assess'],
      anaTools: ['global_ri_special_designations'],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          prevalence: { type: 'number', description: 'Prevalence per 10,000.' },
        },
        required: ['market'],
      },
    },
    {
      id: 'expanded_access',
      label: 'Expanded access / compassionate use',
      group: 'designations_access',
      deterministic: true,
      description: 'Pre-approval access mechanism by region and population size.',
      routes: ['GET /expanded-access/framework/:region', 'POST /expanded-access/recommend'],
      anaTools: ['global_ri_expanded_access'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          scope: {
            type: 'string',
            enum: ['individual', 'intermediate', 'treatment_protocol'],
            description: 'Access scope.',
          },
        },
        required: ['region'],
      },
    },
    {
      id: 'cta_requirements',
      label: 'Clinical-trial-application requirements',
      group: 'clinical',
      deterministic: true,
      description: 'IND/CTA/CTN component checklist + readiness per market.',
      routes: ['GET /cta/requirements/:market', 'POST /cta/assess'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          phase: { type: 'string', enum: ['Phase 1', 'Phase 2', 'Phase 3'], description: 'Trial phase.' },
        },
        required: ['market'],
      },
    },
    {
      id: 'ha_meetings',
      label: 'Health-authority meetings',
      group: 'clinical',
      deterministic: true,
      description: 'Recommended HA meeting(s) per market + development milestone.',
      routes: ['GET /meetings', 'POST /meetings/recommend'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          milestone: {
            type: 'string',
            enum: ['pre-IND', 'end-of-Phase-2', 'pre-NDA', 'pre-submission'],
            description: 'Development milestone.',
          },
        },
        required: ['market', 'milestone'],
      },
    },
    {
      id: 'review_timeline',
      label: 'Global review-timeline projection',
      group: 'clinical',
      deterministic: true,
      description: 'Review timeline + milestones per region/procedure.',
      routes: ['POST /review-timeline'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          priority: { type: 'boolean', description: 'Priority / accelerated review.' },
        },
        required: ['market'],
      },
    },
    {
      id: 'nonclinical',
      label: 'Nonclinical requirements (ICH M3(R2))',
      group: 'clinical',
      deterministic: true,
      description: 'Nonclinical-to-clinical phasing + repeat-dose tox duration.',
      routes: ['GET /nonclinical/requirements/:phase', 'POST /nonclinical/tox-duration'],
      anaTools: [],
      inputSchema: {
        properties: {
          phase: {
            type: 'string',
            enum: ['Phase 1', 'Phase 2', 'Phase 3', 'marketing'],
            description: 'Development stage.',
          },
        },
        required: ['phase'],
      },
    },
    {
      id: 'bioequivalence',
      label: 'Bioequivalence & BCS biowaivers',
      group: 'clinical',
      deterministic: true,
      description: 'BE acceptance criteria (FDA/EMA) + ICH M9 BCS biowaiver eligibility.',
      routes: ['GET /bioequivalence/criteria/:region', 'GET /bioequivalence/biowaiver/:bcsClass'],
      anaTools: ['global_ri_bioequivalence_criteria', 'global_ri_bcs_biowaiver'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          bcsClass: { type: 'string', enum: ['1', '2', '3', '4'], description: 'BCS class.' },
        },
        required: ['region'],
      },
    },
    {
      id: 'pediatric_plan',
      label: 'Pediatric study-plan obligations',
      group: 'clinical',
      deterministic: true,
      description: 'PREA iPSP / EMA PIP plan obligation, timing, waiver/deferral status.',
      routes: ['GET /pediatric/obligation/:market', 'POST /pediatric/assess'],
      anaTools: ['global_ri_pediatric_plan'],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          adultOnly: { type: 'boolean', description: 'Adult-only condition (waiver candidate).' },
        },
        required: ['market'],
      },
    },
    {
      id: 'clinical_evidence',
      label: 'Clinical evidence standards',
      group: 'clinical',
      deterministic: true,
      description: 'FDA substantial evidence / EU pivotal-trial standard + control types.',
      routes: ['GET /clinical-evidence/standard/:region', 'GET /clinical-evidence/control-types'],
      anaTools: ['global_ri_evidence_standard'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
        },
        required: ['region'],
      },
    },
    {
      id: 'cmc_specifications',
      label: 'CMC specifications (ICH Q6A/Q6B)',
      group: 'quality_cmc',
      deterministic: true,
      description: 'Universal + dosage-form-specific specification test sets.',
      routes: ['GET /cmc/specifications/:productType', 'GET /cmc/universal-tests/:productType'],
      anaTools: ['global_ri_cmc_specifications'],
      inputSchema: {
        properties: { productType: { type: 'string', enum: ['small_molecule', 'biologic'], description: 'Product type.' } },
        required: ['productType'],
      },
    },
    {
      id: 'stability',
      label: 'Stability requirements (ICH Q1A(R2))',
      group: 'quality_cmc',
      deterministic: true,
      description: 'Climatic zones + storage conditions + study design.',
      routes: [
        'GET /stability/zones',
        'GET /stability/zones/:zone',
        'GET /stability/conditions/:storageCondition',
        'GET /stability/study-design',
      ],
      anaTools: ['global_ri_stability_conditions'],
      inputSchema: {
        properties: { zone: { type: 'string', enum: ['I', 'II', 'III', 'IVa', 'IVb'], description: 'ICH climatic zone.' } },
        required: [],
      },
    },
    {
      id: 'impurities',
      label: 'Impurities & limits (ICH Q3A/B/C/D)',
      group: 'quality_cmc',
      deterministic: true,
      description: 'Impurity thresholds, residual-solvent classes, elemental-impurity PDEs.',
      routes: [
        'GET /impurities/drug-substance',
        'GET /impurities/drug-product',
        'GET /impurities/residual-solvents',
        'GET /impurities/residual-solvents/:name',
        'GET /impurities/elemental',
        'GET /impurities/elemental/:element',
      ],
      anaTools: [],
      inputSchema: {
        properties: { maxDailyDoseMg: { type: 'number', description: 'Max daily dose (mg) — sets reporting thresholds.' } },
        required: [],
      },
    },
    {
      id: 'process_validation',
      label: 'Process validation',
      group: 'quality_cmc',
      deterministic: true,
      description: 'FDA 3-stage lifecycle + EU GMP Annex 15 qualification stages.',
      routes: ['GET /process-validation/framework/:region', 'GET /process-validation/stage/:region/:stageId'],
      anaTools: ['global_ri_process_validation'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
        },
        required: ['region'],
      },
    },
    {
      id: 'safety_reporting',
      label: 'Investigational safety reporting (ICH E2)',
      group: 'safety_pv',
      deterministic: true,
      description: 'Expedited reporting classification + timelines (FDA IND / EU SUSAR).',
      routes: ['GET /safety-reporting/timelines/:region', 'POST /safety-reporting/classify'],
      anaTools: ['global_ri_safety_reporting'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          seriousness: {
            type: 'string',
            enum: ['serious_unexpected', 'serious_expected', 'non_serious'],
            description: 'Event seriousness.',
          },
        },
        required: ['region'],
      },
    },
    {
      id: 'pharmacovigilance',
      label: 'Pharmacovigilance obligations',
      group: 'safety_pv',
      deterministic: true,
      description: 'Post-approval PV duties per market + readiness assessment.',
      routes: ['GET /pharmacovigilance/obligations/:market', 'POST /pharmacovigilance/assess'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
        },
        required: ['market'],
      },
    },
    {
      id: 'gcp',
      label: 'GCP essential records (ICH E6)',
      group: 'safety_pv',
      deterministic: true,
      description: 'GCP principles, essential records by trial stage, responsibility split.',
      routes: ['GET /gcp/principles', 'GET /gcp/essential-documents/:stage', 'GET /gcp/responsibilities/:party'],
      anaTools: [],
      inputSchema: {
        properties: { stage: { type: 'string', enum: ['before', 'during', 'after'], description: 'Trial stage.' } },
        required: [],
      },
    },
    {
      id: 'module1',
      label: 'Regional Module 1 requirements',
      group: 'submissions',
      deterministic: true,
      description: 'Per-market Module 1 component checklist + readiness.',
      routes: ['GET /module1/requirements/:market', 'POST /module1/assess'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
        },
        required: ['market'],
      },
    },
    {
      id: 'submission_format',
      label: 'Electronic submission format',
      group: 'submissions',
      deterministic: true,
      description: 'eCTD / gateway / validation profile + readiness per market.',
      routes: ['GET /submission-format/:market', 'POST /submission-format/assess'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
        },
        required: ['market'],
      },
    },
    {
      id: 'labeling',
      label: 'Cross-market labeling',
      group: 'submissions',
      deterministic: true,
      description: 'Required labeling sections (PI / SmPC / package insert) + readiness.',
      routes: ['GET /labeling/requirements/:market', 'POST /labeling/assess'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
        },
        required: ['market'],
      },
    },
    {
      id: 'post_approval_changes',
      label: 'Post-approval changes / variations',
      group: 'submissions',
      deterministic: true,
      description: 'Classify a change into the correct filing vehicle per market.',
      routes: ['GET /changes/vehicles/:market', 'POST /changes/classify'],
      anaTools: ['global_ri_post_approval_change'],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          changeArea: {
            type: 'string',
            enum: ['drug_substance', 'drug_product', 'manufacturing_site', 'specification', 'labeling'],
            description: 'Change area.',
          },
        },
        required: ['market', 'changeArea'],
      },
    },
    {
      id: 'inspection',
      label: 'Inspection readiness (PAI/GMP/BIMO)',
      group: 'submissions',
      deterministic: true,
      description: 'Inspection profile + readiness-domain assessment per market.',
      routes: ['GET /inspection/profile/:market', 'POST /inspection/assess'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
        },
        required: ['market'],
      },
    },
    {
      id: 'device_classification',
      label: 'Device & IVD classification',
      group: 'devices_dx',
      deterministic: true,
      description: 'FDA / EU MDR / EU IVDR risk class + conformity pathway.',
      routes: ['GET /device/framework/:region', 'POST /device/classify'],
      anaTools: ['global_ri_device_classification'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          deviceType: { type: 'string', enum: ['device', 'ivd'], description: 'Device or in-vitro diagnostic.' },
          invasive: { type: 'boolean', description: 'Invasive / implantable.' },
        },
        required: ['region', 'deviceType'],
      },
    },
    {
      id: 'combination_product',
      label: 'Combination-product classification',
      group: 'devices_dx',
      deterministic: true,
      description: 'FDA PMOA lead center + EU MDR Article 117 routing.',
      routes: ['GET /combination/framework/:region', 'POST /combination/classify'],
      anaTools: [],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          constituents: {
            type: 'string',
            enum: ['drug_device', 'biologic_device', 'drug_biologic'],
            description: 'Constituent parts.',
          },
        },
        required: ['region'],
      },
    },
    {
      id: 'companion_diagnostics',
      label: 'Companion diagnostics (CDx)',
      group: 'devices_dx',
      deterministic: true,
      description: 'CDx regulatory framework + co-development checklist.',
      routes: ['GET /companion-diagnostics/framework/:region', 'GET /companion-diagnostics/codevelopment'],
      anaTools: ['global_ri_companion_diagnostic'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
        },
        required: ['region'],
      },
    },
    {
      id: 'advanced_therapies',
      label: 'Advanced therapies (ATMP/cell-gene)',
      group: 'devices_dx',
      deterministic: true,
      description: 'ATMP / cell & gene / regenerative classification + route.',
      routes: ['GET /advanced-therapies/framework/:region', 'POST /advanced-therapies/classify'],
      anaTools: ['global_ri_advanced_therapy'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          atmpType: {
            type: 'string',
            enum: ['gene_therapy', 'somatic_cell', 'tissue_engineered'],
            description: 'ATMP type.',
          },
        },
        required: ['region'],
      },
    },
    {
      id: 'exclusivity',
      label: 'Exclusivity & LOE',
      group: 'lifecycle',
      deterministic: true,
      description: 'Data/market/orphan/pediatric exclusivity + projected loss-of-exclusivity date.',
      routes: ['GET /exclusivity/rules/:market', 'POST /exclusivity/compute'],
      anaTools: ['global_ri_exclusivity'],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
          productClass: {
            type: 'string',
            enum: ['new_chemical_entity', 'biologic', 'orphan', 'pediatric'],
            description: 'Product class for exclusivity rules.',
          },
          approvalDate: { type: 'string', format: 'date', description: 'Approval date (YYYY-MM-DD).' },
        },
        required: ['market', 'productClass'],
      },
    },
    {
      id: 'lifecycle_obligations',
      label: 'Lifecycle obligations calendar',
      group: 'lifecycle',
      deterministic: true,
      description: 'Recurring post-approval obligations projected into a due-date calendar.',
      routes: ['GET /lifecycle/obligations/:market', 'POST /lifecycle/schedule'],
      anaTools: ['global_ri_lifecycle_schedule'],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
        },
        required: ['market'],
      },
    },
    {
      id: 'disclosure',
      label: 'Clinical-trial disclosure',
      group: 'lifecycle',
      deterministic: true,
      description: 'Registration + results-posting obligations & deadlines (CT.gov / CTIS / WHO).',
      routes: ['GET /disclosure/requirements/:market', 'POST /disclosure/deadlines'],
      anaTools: [],
      inputSchema: {
        properties: {
          market: {
            type: 'string',
            enum: ['FDA', 'EMA', 'PMDA', 'Health Canada', 'MHRA', 'TGA', 'NMPA', 'ANVISA'],
            description: 'Regulatory authority / market.',
          },
        },
        required: ['market'],
      },
    },
    {
      id: 'promotional',
      label: 'Promotional compliance',
      group: 'commercial_supply',
      deterministic: true,
      description: 'Prescription-medicine promotion rules + readiness (FDA OPDP / EU Title VIII).',
      routes: ['GET /promotional-compliance/rules/:region', 'POST /promotional-compliance/assess'],
      anaTools: ['global_ri_promotional_compliance'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          materialType: { type: 'string', enum: ['hcp', 'dtc', 'digital'], description: 'Audience / material type.' },
        },
        required: ['region'],
      },
    },
    {
      id: 'controlled_substances',
      label: 'Controlled substances (DEA)',
      group: 'commercial_supply',
      deterministic: true,
      description: 'US DEA schedules I–V + handling/prescription/quota controls.',
      routes: [
        'GET /controlled-substances/schedules',
        'GET /controlled-substances/schedules/:schedule',
        'GET /controlled-substances/handling/:schedule',
      ],
      anaTools: ['global_ri_controlled_substance'],
      inputSchema: {
        properties: { schedule: { type: 'string', enum: ['I', 'II', 'III', 'IV', 'V'], description: 'DEA schedule.' } },
        required: [],
      },
    },
    {
      id: 'establishment',
      label: 'Establishment registration',
      group: 'commercial_supply',
      deterministic: true,
      description: 'Manufacturer/establishment registration & drug listing + readiness.',
      routes: ['GET /establishment/framework/:region', 'POST /establishment/assess'],
      anaTools: ['global_ri_establishment_registration'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          role: {
            type: 'string',
            enum: ['manufacturer', 'importer', 'distributor'],
            description: 'Supply-chain role.',
          },
        },
        required: ['region'],
      },
    },
    {
      id: 'import_export',
      label: 'Import / export licensing',
      group: 'commercial_supply',
      deterministic: true,
      description: 'Import/export authorisation by region + product category.',
      routes: ['GET /import-export/matrix/:region', 'POST /import-export/requirements'],
      anaTools: ['global_ri_import_export'],
      inputSchema: {
        properties: {
          region: {
            type: 'string',
            enum: ['FDA', 'EU', 'PMDA', 'Health Canada', 'MHRA'],
            description: 'Region / authority.',
          },
          direction: { type: 'string', enum: ['import', 'export'], description: 'Trade direction.' },
        },
        required: ['region'],
      },
    },
  ],
};

export const GLOBAL_RI_RESULTS_RAW = {
  exclusivity: {
    pedigree: 'deterministic_registry',
    summary: 'A new chemical entity in the FDA market receives 5 years of data exclusivity from approval; a qualifying new clinical investigation can add 3 years to a changed condition of approval.',
    fields: [
      { k: 'Data exclusivity', v: '5 years (NCE)' },
      { k: 'New clinical study', v: '+3 years (changes only)' },
      { k: 'Pediatric extension', v: '+6 months (BPCA)' },
      { k: 'Projected LOE', v: 'Approval + 5y, then ANDA eligible' },
    ],
    citations: ['21 U.S.C. §355(j)(5)(F)(ii)', '21 CFR §314.108'],
    caveats: 'Exclusivity is distinct from patent term. Orphan exclusivity (7y) runs in parallel where designated.',
  },
  device_classification: {
    pedigree: 'deterministic_registry',
    summary: 'Most IVDs on the FDA market are Class II and clear via 510(k); with no predicate, De Novo applies. Under EU IVDR, classification runs Class A–D by risk rules.',
    fields: [
      { k: 'Risk class', v: 'Class II (FDA) / C (IVDR)' },
      { k: 'Conformity route', v: '510(k) / Notified Body' },
      { k: 'Fallback', v: 'De Novo (no predicate)' },
      { k: 'QMS', v: '21 CFR 820 / ISO 13485' },
    ],
    citations: ['21 CFR §860', 'EU IVDR 2017/746 Annex VIII'],
    caveats: 'Final class depends on intended use; companion diagnostics and high-risk IVDs escalate the route.',
  },
  strategy_brief: {
    pedigree: 'model_assisted',
    summary: 'A lead-market-first strategy (FDA, then EMA centralized) optimizes first-cycle speed while preserving reliance routes (Project Orbis, Access Consortium) for smaller markets.',
    fields: [
      { k: 'Sequence', v: 'FDA → EMA (centralized) → reliance markets' },
      { k: 'Lead cycle', v: '~10 months (priority)' },
      { k: 'Reliance', v: 'Project Orbis · Access Consortium · WHO CRP' },
    ],
    citations: ['EMA centralized procedure (Reg. 726/2004)'],
    caveats: 'Model-assisted narrative — verify sequencing against current program timelines.',
  },
};
export const GLOBAL_RI_CATALOG_FIXTURE = GLOBAL_RI_CATALOG_FIXTURE_RAW as unknown as GriCatalog;
export const GLOBAL_RI_RESULTS: Record<string, GriResultFixture> = GLOBAL_RI_RESULTS_RAW;
