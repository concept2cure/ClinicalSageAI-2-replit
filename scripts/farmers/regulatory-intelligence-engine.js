#!/usr/bin/env node
/**
 * ═══════════════════════════════════════════════════════════════════════════
 *                    LUMEN CORTEX: REGULATORY INTELLIGENCE ENGINE
 * ═══════════════════════════════════════════════════════════════════════════
 *
 * The cognitive brain of TrialSage - understands WHY submissions fail and
 * proactively guides users to regulatory success.
 *
 * VISION: Be the defacto go-to intelligence center outside of the actual FDA.
 *
 * CAPABILITIES:
 * 1. Rejection Pattern Analysis - Understands root causes of CRLs, RTFs, holds
 * 2. IND Pyramid Intelligence - From strategic to minutiae-level guidance
 * 3. 510(k) Dossier Mastery - Predicate selection, substantial equivalence
 * 4. BLA/NDA Lifecycle Support - From pre-IND to post-approval
 * 5. Project Memory - Learns from each submission, remembers context
 * 6. Proactive Suggestions - AI-driven recommendations before problems occur
 *
 * DATA SOURCES FOR REJECTION INTELLIGENCE:
 * - FDA Complete Response Letters (CRLs)
 * - FDA Warning Letters
 * - FDA Refuse to File (RTF) Letters
 * - FDA Clinical Holds
 * - FDA 483 Observations
 * - FDA Untitled Letters
 * - CDER/CBER/CDRH guidance documents
 * - Drugs@FDA database
 * - Device database (510k, PMA, De Novo)
 * - Public Advisory Committee transcripts
 *
 * @author TrialSage AI Team
 * @version 2.0.0 - Project Cortex
 */

import dotenv from 'dotenv';
import pg from 'pg';
import axios from 'axios';
import * as cheerio from 'cheerio';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const { Pool } = pg;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Configuration
const PROGRESS_FILE = path.join(__dirname, '../cortex_regulatory_intel_progress.json');

// Database
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

// ═══════════════════════════════════════════════════════════════════════════
//                          REJECTION TAXONOMY
// ═══════════════════════════════════════════════════════════════════════════
/**
 * Comprehensive taxonomy of regulatory rejection reasons
 * Organized by submission type and severity
 */
const REJECTION_TAXONOMY = {
  // IND REJECTIONS - Clinical Hold & Refuse to File Reasons
  ind: {
    clinical_hold: {
      safety: [
        { pattern: /unreasonable.*risk/gi, severity: 'critical', category: 'safety' },
        { pattern: /insufficient.*safety.*data/gi, severity: 'critical', category: 'safety' },
        { pattern: /inadequate.*toxicology/gi, severity: 'critical', category: 'preclinical' },
        { pattern: /carcinogenicity.*concern/gi, severity: 'critical', category: 'safety' },
        { pattern: /genotoxicity/gi, severity: 'high', category: 'safety' },
        { pattern: /teratogenicity/gi, severity: 'high', category: 'safety' },
        { pattern: /dose.?limiting.*toxicit/gi, severity: 'high', category: 'safety' },
        { pattern: /maximum.*tolerated.*dose/gi, severity: 'medium', category: 'safety' },
      ],
      design: [
        { pattern: /inadequate.*protocol/gi, severity: 'high', category: 'protocol' },
        {
          pattern: /insufficient.*scientific.*rationale/gi,
          severity: 'high',
          category: 'scientific',
        },
        { pattern: /inappropriate.*patient.*population/gi, severity: 'high', category: 'protocol' },
        { pattern: /inadequate.*endpoint/gi, severity: 'high', category: 'protocol' },
        { pattern: /statistical.*design.*deficien/gi, severity: 'medium', category: 'statistics' },
        { pattern: /sample.*size.*inadequate/gi, severity: 'medium', category: 'statistics' },
      ],
      cmc: [
        { pattern: /chemistry.*manufacturing.*control/gi, severity: 'high', category: 'cmc' },
        { pattern: /insufficient.*stability.*data/gi, severity: 'high', category: 'cmc' },
        { pattern: /inadequate.*characterization/gi, severity: 'high', category: 'cmc' },
        { pattern: /specification.*deficien/gi, severity: 'medium', category: 'cmc' },
        { pattern: /analytical.*method.*validat/gi, severity: 'medium', category: 'cmc' },
        { pattern: /impurit.*qualification/gi, severity: 'high', category: 'cmc' },
      ],
      investigator: [
        { pattern: /investigator.*qualifica/gi, severity: 'medium', category: 'investigator' },
        { pattern: /inadequate.*facilities/gi, severity: 'medium', category: 'site' },
        { pattern: /informed.*consent.*deficien/gi, severity: 'high', category: 'ethics' },
        { pattern: /irb.*approval/gi, severity: 'high', category: 'ethics' },
      ],
    },
    refuse_to_file: [
      { pattern: /incomplete.*application/gi, severity: 'critical', category: 'administrative' },
      { pattern: /missing.*required.*section/gi, severity: 'critical', category: 'administrative' },
      { pattern: /form.*1571.*deficien/gi, severity: 'high', category: 'administrative' },
      { pattern: /environmental.*assessment/gi, severity: 'medium', category: 'administrative' },
    ],
  },

  // NDA/BLA REJECTIONS - Complete Response Letter Reasons
  nda_bla: {
    efficacy: [
      { pattern: /fail.*demonstrate.*efficacy/gi, severity: 'critical', category: 'efficacy' },
      { pattern: /primary.*endpoint.*not.*met/gi, severity: 'critical', category: 'efficacy' },
      {
        pattern: /insufficient.*evidence.*effectiveness/gi,
        severity: 'critical',
        category: 'efficacy',
      },
      {
        pattern: /clinical.*benefit.*not.*established/gi,
        severity: 'critical',
        category: 'efficacy',
      },
      { pattern: /magnitude.*effect.*insufficient/gi, severity: 'high', category: 'efficacy' },
      { pattern: /clinically.*meaningful.*difference/gi, severity: 'high', category: 'efficacy' },
      {
        pattern: /statistical.*significance.*not.*achiev/gi,
        severity: 'high',
        category: 'statistics',
      },
      { pattern: /multiplicity.*adjustment/gi, severity: 'medium', category: 'statistics' },
    ],
    safety: [
      { pattern: /unacceptable.*safety.*profile/gi, severity: 'critical', category: 'safety' },
      { pattern: /benefit.?risk.*unfavorable/gi, severity: 'critical', category: 'safety' },
      { pattern: /serious.*adverse.*event/gi, severity: 'high', category: 'safety' },
      { pattern: /hepatotoxicity/gi, severity: 'high', category: 'safety' },
      { pattern: /cardiotoxicity/gi, severity: 'high', category: 'safety' },
      { pattern: /nephrotoxicity/gi, severity: 'high', category: 'safety' },
      { pattern: /rems.*required/gi, severity: 'medium', category: 'safety' },
      { pattern: /black.*box.*warning/gi, severity: 'medium', category: 'labeling' },
      { pattern: /mortality.*imbalance/gi, severity: 'critical', category: 'safety' },
    ],
    cmc: [
      { pattern: /manufacturing.*deficien/gi, severity: 'high', category: 'cmc' },
      { pattern: /process.*validation.*inadequate/gi, severity: 'high', category: 'cmc' },
      { pattern: /facility.*inspection.*finding/gi, severity: 'high', category: 'gmp' },
      { pattern: /sterility.*assurance/gi, severity: 'critical', category: 'cmc' },
      { pattern: /container.*closure.*system/gi, severity: 'medium', category: 'cmc' },
      { pattern: /shelf.?life.*insufficient/gi, severity: 'medium', category: 'cmc' },
      { pattern: /extractable.*leachable/gi, severity: 'medium', category: 'cmc' },
      { pattern: /comparability.*study/gi, severity: 'medium', category: 'cmc' },
    ],
    labeling: [
      { pattern: /labeling.*deficien/gi, severity: 'medium', category: 'labeling' },
      { pattern: /indication.*statement/gi, severity: 'medium', category: 'labeling' },
      { pattern: /dosing.*recommendation/gi, severity: 'medium', category: 'labeling' },
      { pattern: /contraindication.*warning/gi, severity: 'medium', category: 'labeling' },
      { pattern: /pediatric.*labeling/gi, severity: 'medium', category: 'labeling' },
    ],
    data_integrity: [
      { pattern: /data.*integrity.*concern/gi, severity: 'critical', category: 'integrity' },
      { pattern: /protocol.*deviation/gi, severity: 'high', category: 'compliance' },
      { pattern: /gcp.*violation/gi, severity: 'critical', category: 'compliance' },
      { pattern: /audit.*finding/gi, severity: 'high', category: 'compliance' },
      { pattern: /source.*document.*discrepanc/gi, severity: 'high', category: 'integrity' },
    ],
  },

  // 510(k) REJECTIONS
  device_510k: {
    substantial_equivalence: [
      { pattern: /not.*substantially.*equivalent/gi, severity: 'critical', category: 'predicate' },
      {
        pattern: /predicate.*device.*inappropriate/gi,
        severity: 'critical',
        category: 'predicate',
      },
      {
        pattern: /different.*technological.*characteristics/gi,
        severity: 'high',
        category: 'technology',
      },
      { pattern: /new.*intended.*use/gi, severity: 'high', category: 'intended_use' },
      { pattern: /raise.*different.*questions.*safety/gi, severity: 'high', category: 'safety' },
      { pattern: /new.*questions.*efficacy/gi, severity: 'high', category: 'efficacy' },
    ],
    performance_testing: [
      { pattern: /insufficient.*performance.*data/gi, severity: 'high', category: 'testing' },
      {
        pattern: /biocompatibility.*testing.*inadequate/gi,
        severity: 'high',
        category: 'biocompat',
      },
      { pattern: /bench.*testing.*deficien/gi, severity: 'medium', category: 'testing' },
      { pattern: /software.*verification/gi, severity: 'high', category: 'software' },
      { pattern: /cybersecurity.*concern/gi, severity: 'high', category: 'cybersecurity' },
      { pattern: /electrical.*safety.*testing/gi, severity: 'medium', category: 'testing' },
      { pattern: /sterilization.*validation/gi, severity: 'high', category: 'sterility' },
      { pattern: /shelf.?life.*testing/gi, severity: 'medium', category: 'stability' },
    ],
    labeling_ifu: [
      { pattern: /labeling.*inadequate/gi, severity: 'medium', category: 'labeling' },
      { pattern: /instructions.*for.*use/gi, severity: 'medium', category: 'labeling' },
      { pattern: /contraindication.*missing/gi, severity: 'medium', category: 'labeling' },
      { pattern: /warning.*precaution/gi, severity: 'medium', category: 'labeling' },
    ],
    clinical_data: [
      { pattern: /clinical.*data.*required/gi, severity: 'high', category: 'clinical' },
      { pattern: /human.*factors.*study/gi, severity: 'medium', category: 'human_factors' },
      { pattern: /usability.*testing/gi, severity: 'medium', category: 'human_factors' },
    ],
  },

  // PMA REJECTIONS
  device_pma: {
    safety_effectiveness: [
      { pattern: /reasonable.*assurance.*safety/gi, severity: 'critical', category: 'safety' },
      {
        pattern: /reasonable.*assurance.*effectiveness/gi,
        severity: 'critical',
        category: 'efficacy',
      },
      { pattern: /clinical.*trial.*design.*flaw/gi, severity: 'critical', category: 'design' },
      { pattern: /primary.*endpoint.*failure/gi, severity: 'critical', category: 'efficacy' },
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//                          IND PYRAMID STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════
/**
 * The IND Pyramid - hierarchical structure of submission requirements
 * From strategic foundations to tactical details
 */
const IND_PYRAMID = {
  foundation: {
    name: 'Scientific Rationale & Target Product Profile',
    level: 1,
    criticality: 'critical',
    elements: [
      'target_product_profile',
      'mechanism_of_action',
      'therapeutic_hypothesis',
      'unmet_medical_need',
      'competitive_landscape',
    ],
    common_failures: [
      'Weak scientific rationale for proposed indication',
      'Unclear mechanism of action',
      'Insufficient differentiation from existing therapies',
      'Target product profile not aligned with clinical development plan',
    ],
  },
  preclinical: {
    name: 'Preclinical & Nonclinical',
    level: 2,
    criticality: 'critical',
    elements: [
      'pharmacology_primary',
      'pharmacology_secondary',
      'safety_pharmacology',
      'pk_adme',
      'toxicology_acute',
      'toxicology_repeat_dose',
      'toxicology_genetic',
      'toxicology_reproductive',
      'toxicology_carcinogenicity',
    ],
    common_failures: [
      'Inadequate duration of repeat-dose toxicity studies',
      'Missing or incomplete safety pharmacology (hERG, CNS, respiratory)',
      'Insufficient species justification for toxicology',
      'Impurity qualification not addressed',
      'Missing NOAEL/NOEL determination',
      'Inadequate exposure margins',
    ],
  },
  cmc: {
    name: 'Chemistry, Manufacturing & Controls',
    level: 3,
    criticality: 'high',
    elements: [
      'drug_substance_characterization',
      'drug_substance_manufacture',
      'drug_substance_controls',
      'drug_substance_stability',
      'drug_product_composition',
      'drug_product_manufacture',
      'drug_product_controls',
      'drug_product_stability',
      'reference_standards',
      'container_closure',
    ],
    common_failures: [
      'Incomplete structural characterization',
      'Insufficient stability data to support proposed shelf life',
      'Analytical method validation incomplete',
      'Impurity profile not fully characterized',
      'Specification limits not scientifically justified',
      'Process validation strategy unclear',
    ],
  },
  clinical: {
    name: 'Clinical Protocol & Design',
    level: 4,
    criticality: 'high',
    elements: [
      'study_objectives',
      'study_design',
      'patient_population',
      'inclusion_exclusion_criteria',
      'endpoints_primary',
      'endpoints_secondary',
      'sample_size_justification',
      'statistical_analysis_plan',
      'dose_selection_rationale',
      'safety_monitoring',
      'stopping_rules',
    ],
    common_failures: [
      'Primary endpoint not clinically meaningful',
      'Sample size inadequate for proposed analysis',
      'Inclusion/exclusion criteria too broad or narrow',
      'Dose selection rationale insufficient',
      'Missing or inadequate stopping rules',
      'Safety monitoring plan insufficient',
      'Multiplicity not addressed',
    ],
  },
  administrative: {
    name: 'Administrative & Regulatory',
    level: 5,
    criticality: 'medium',
    elements: [
      'form_1571',
      'form_1572',
      'form_3674',
      'investigator_brochure',
      'informed_consent',
      'financial_disclosure',
      'environmental_assessment',
      'patent_information',
    ],
    common_failures: [
      'Missing required signatures',
      'Incomplete Form 1571',
      'Outdated Investigator Brochure',
      'Informed consent deficiencies',
      'Missing financial disclosures',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//                        510(k) DOSSIER STRUCTURE
// ═══════════════════════════════════════════════════════════════════════════
const DEVICE_510K_STRUCTURE = {
  administrative: {
    name: 'Administrative Information',
    sections: ['cover_letter', 'eSTAR_submission', 'device_description', 'indications_for_use'],
    common_failures: [
      'Incomplete eSTAR submission',
      'Device description lacks sufficient detail',
      'Indications for use statement too broad',
    ],
  },
  predicate: {
    name: 'Predicate Device Comparison',
    sections: ['predicate_selection', 'comparison_table', 'technological_characteristics'],
    common_failures: [
      'Inappropriate predicate selection',
      'Incomplete comparison to predicate',
      'New technological characteristics not addressed',
      'Multiple predicates without clear rationale',
    ],
  },
  performance: {
    name: 'Performance Testing',
    sections: [
      'bench_testing',
      'biocompatibility',
      'software_verification',
      'electrical_safety',
      'sterilization',
    ],
    common_failures: [
      'Incomplete bench testing protocol',
      'Biocompatibility testing not per ISO 10993',
      'Software documentation incomplete (IEC 62304)',
      'Missing electrical safety testing (IEC 60601)',
      'Sterilization validation inadequate',
    ],
  },
  clinical: {
    name: 'Clinical & Human Factors',
    sections: ['clinical_data', 'human_factors', 'risk_analysis'],
    common_failures: [
      'Clinical data insufficient to support claims',
      'Missing human factors study',
      'Risk analysis incomplete (ISO 14971)',
    ],
  },
  labeling: {
    name: 'Labeling',
    sections: ['device_labeling', 'instructions_for_use', 'promotional_materials'],
    common_failures: [
      'Missing required labeling elements',
      'IFU not user-friendly',
      'Warnings/precautions incomplete',
    ],
  },
};

// ═══════════════════════════════════════════════════════════════════════════
//                      COLOR OUTPUT UTILITIES
// ═══════════════════════════════════════════════════════════════════════════
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
  white: '\x1b[37m',
};

function log(emoji, message, color = colors.reset) {
  const timestamp = new Date().toISOString().slice(11, 19);
  logger.info(
    `${colors.dim}[${timestamp}]${colors.reset} ${color}${emoji} ${message}${colors.reset}`
  );
}

// ═══════════════════════════════════════════════════════════════════════════
//                      DATABASE OPERATIONS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Create a rejection pattern atom with full taxonomy
 */
async function createRejectionAtom(data) {
  const {
    sourceId,
    submissionType,
    rejectionCategory,
    rejectionReason,
    severity,
    context,
    guidance,
    sourceDocument,
    tags = [],
  } = data;

  const atomId = `REJ:${crypto.createHash('md5').update(`${sourceId}-${rejectionReason}`).digest('hex').slice(0, 12)}`;

  try {
    const existing = await pool.query(
      `SELECT id FROM lumen_data_atoms WHERE source_id = $1 AND atom_type = $2`,
      [atomId, 'rejection_pattern']
    );

    const structuredData = {
      submission_type: submissionType,
      category: rejectionCategory,
      reason: rejectionReason,
      severity,
      context,
      guidance,
      source_document: sourceDocument,
      pyramid_level: getRelevantPyramidLevel(rejectionCategory),
    };

    const allTags = ['rejection_pattern', submissionType, rejectionCategory, severity, ...tags];

    if (existing.rows.length > 0) {
      await pool.query(
        `
        UPDATE lumen_data_atoms
        SET content = $1, structured_data = $2, tags = $3, updated_at = NOW()
        WHERE id = $4
      `,
        [rejectionReason, JSON.stringify(structuredData), allTags, existing.rows[0].id]
      );
      return existing.rows[0].id;
    }

    const result = await pool.query(
      `
      INSERT INTO lumen_data_atoms
      (id, organization_id, source_type, source_id, atom_type, title, content,
       structured_data, tags, confidence, status, created_at, updated_at)
      VALUES (gen_random_uuid(), 1, $1, $2, $3, $4, $5, $6, $7, 0.9, 'active', NOW(), NOW())
      RETURNING id
    `,
      [
        'regulatory_intel',
        atomId,
        'rejection_pattern',
        `${submissionType}: ${rejectionReason.substring(0, 100)}`,
        rejectionReason,
        JSON.stringify(structuredData),
        allTags,
      ]
    );
    return result.rows[0]?.id;
  } catch (error) {
    log('⚠️', `Rejection atom error: ${error.message}`, colors.yellow);
    return null;
  }
}

/**
 * Create a guidance atom with proactive recommendations
 */
async function createGuidanceAtom(data) {
  const {
    submissionType,
    pyramidLevel,
    guidanceTitle,
    guidanceContent,
    preventionSteps,
    references,
    tags = [],
  } = data;

  const atomId = `GUIDE:${crypto.createHash('md5').update(guidanceTitle).digest('hex').slice(0, 12)}`;

  try {
    const structuredData = {
      submission_type: submissionType,
      pyramid_level: pyramidLevel,
      prevention_steps: preventionSteps,
      references,
    };

    const allTags = ['guidance', 'proactive', submissionType, pyramidLevel, ...tags];

    const result = await pool.query(
      `
      INSERT INTO lumen_data_atoms
      (id, organization_id, source_type, source_id, atom_type, title, content,
       structured_data, tags, confidence, status, created_at, updated_at)
      VALUES (gen_random_uuid(), 1, $1, $2, $3, $4, $5, $6, $7, 0.95, 'active', NOW(), NOW())
      ON CONFLICT DO NOTHING
      RETURNING id
    `,
      [
        'regulatory_guidance',
        atomId,
        'proactive_guidance',
        guidanceTitle,
        guidanceContent,
        JSON.stringify(structuredData),
        allTags,
      ]
    );
    return result.rows[0]?.id;
  } catch (error) {
    log('⚠️', `Guidance atom error: ${error.message}`, colors.yellow);
    return null;
  }
}

/**
 * Create a project memory entry
 */
async function createProjectMemory(data) {
  const {
    projectId,
    submissionType,
    eventType,
    eventDescription,
    learnings,
    suggestions,
    metadata = {},
  } = data;

  try {
    const result = await pool.query(
      `
      INSERT INTO lumen_data_atoms
      (id, organization_id, source_type, source_id, atom_type, title, content,
       structured_data, tags, confidence, status, created_at, updated_at)
      VALUES (gen_random_uuid(), 1, $1, $2, $3, $4, $5, $6, $7, 0.85, 'active', NOW(), NOW())
      RETURNING id
    `,
      [
        'project_memory',
        `PROJ:${projectId}:${Date.now()}`,
        'project_event',
        `${submissionType} - ${eventType}`,
        eventDescription,
        JSON.stringify({ learnings, suggestions, metadata }),
        ['project_memory', submissionType, eventType],
      ]
    );
    return result.rows[0]?.id;
  } catch (error) {
    log('⚠️', `Project memory error: ${error.message}`, colors.yellow);
    return null;
  }
}

/**
 * Create knowledge graph edge for rejection → guidance relationship
 */
async function linkRejectionToGuidance(rejectionId, guidanceId, relationship) {
  try {
    await pool.query(
      `
      INSERT INTO rag_knowledge_graph
      (id, organization_id, entity_id, entity_type, entity_name,
       relationship_type, related_entity_id, related_entity_type, related_entity_name,
       confidence, direction, created_at, updated_at)
      VALUES (gen_random_uuid(), 1, $1, $2, $3, $4, $5, $6, $7, 0.9, 'outbound', NOW(), NOW())
      ON CONFLICT DO NOTHING
    `,
      [
        rejectionId,
        'rejection_pattern',
        'Rejection Pattern',
        relationship,
        guidanceId,
        'proactive_guidance',
        'Prevention Guidance',
      ]
    );
  } catch (error) {
    // Silently fail
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//                      HELPER FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

function getRelevantPyramidLevel(category) {
  const categoryToLevel = {
    safety: 'preclinical',
    preclinical: 'preclinical',
    cmc: 'cmc',
    protocol: 'clinical',
    statistics: 'clinical',
    efficacy: 'clinical',
    administrative: 'administrative',
    labeling: 'administrative',
    integrity: 'clinical',
    compliance: 'administrative',
  };
  return categoryToLevel[category] || 'foundation';
}

// ═══════════════════════════════════════════════════════════════════════════
//                      FDA DATA SOURCE HARVESTERS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Harvest FDA Warning Letters
 */
async function harvestWarningLetters() {
  log('📋', 'Harvesting FDA Warning Letters...', colors.cyan);

  // FDA Warning Letters endpoint
  const baseUrl = 'https://api.fda.gov/other/warningletter.json';

  try {
    const response = await axios.get(baseUrl, {
      params: {
        search: 'product_type:drugs OR product_type:biologics OR product_type:devices',
        limit: 100,
      },
      timeout: 30000,
    });

    const results = response.data?.results || [];
    log('✅', `Retrieved ${results.length} warning letters`, colors.green);

    let processed = 0;
    for (const letter of results) {
      const violations = letter.subject || '';
      const issueDate = letter.issue_date;
      const company = letter.company_name;

      // Analyze violations against taxonomy
      for (const [submissionType, categories] of Object.entries(REJECTION_TAXONOMY)) {
        if (typeof categories === 'object') {
          for (const [category, patterns] of Object.entries(categories)) {
            if (Array.isArray(patterns)) {
              for (const patternDef of patterns) {
                if (patternDef.pattern.test(violations)) {
                  await createRejectionAtom({
                    sourceId: `WL:${letter.id || issueDate}`,
                    submissionType,
                    rejectionCategory: category,
                    rejectionReason: violations.substring(0, 500),
                    severity: patternDef.severity,
                    context: `Warning letter to ${company} dated ${issueDate}`,
                    guidance: `Review ${category} requirements and ensure compliance`,
                    sourceDocument: 'FDA Warning Letter',
                    tags: ['warning_letter', company?.toLowerCase()?.replace(/\s+/g, '_')].filter(
                      Boolean
                    ),
                  });
                  processed++;
                }
              }
            }
          }
        }
      }
    }

    return { processed, total: results.length };
  } catch (error) {
    log('❌', `Warning Letters API error: ${error.message}`, colors.red);
    return { processed: 0, total: 0, error: error.message };
  }
}

/**
 * Harvest Drugs@FDA for approval/rejection patterns
 */
async function harvestDrugsAtFDA() {
  log('💊', 'Harvesting Drugs@FDA database...', colors.magenta);

  const baseUrl = 'https://api.fda.gov/drug/drugsfda.json';

  try {
    // Search for applications with Complete Response Letters
    const response = await axios.get(baseUrl, {
      params: {
        search: 'submissions.submission_status:"Complete Response"',
        limit: 100,
      },
      timeout: 30000,
    });

    const results = response.data?.results || [];
    log('✅', `Retrieved ${results.length} applications with CRL history`, colors.green);

    let processed = 0;
    for (const app of results) {
      const appNumber = app.application_number;
      const sponsorName = app.sponsor_name;
      const products = app.products || [];

      // Look for CRL submissions
      const submissions = app.submissions || [];
      for (const sub of submissions) {
        if (
          sub.submission_status === 'Complete Response' ||
          sub.submission_status?.includes('Refuse') ||
          sub.submission_status?.includes('Not Approved')
        ) {
          await createRejectionAtom({
            sourceId: `DRUGSFDA:${appNumber}:${sub.submission_number}`,
            submissionType: app.application_number?.startsWith('BLA') ? 'bla' : 'nda',
            rejectionCategory: 'efficacy', // Default - would need deeper analysis
            rejectionReason: `${sub.submission_status} for ${products[0]?.brand_name || appNumber}`,
            severity: 'high',
            context: `Application ${appNumber} by ${sponsorName}`,
            guidance: 'Review submission for specific deficiencies',
            sourceDocument: 'Drugs@FDA Database',
            tags: ['drugsfda', sponsorName?.toLowerCase()?.replace(/\s+/g, '_')].filter(Boolean),
          });
          processed++;
        }
      }
    }

    return { processed, total: results.length };
  } catch (error) {
    log('❌', `Drugs@FDA API error: ${error.message}`, colors.red);
    return { processed: 0, total: 0, error: error.message };
  }
}

/**
 * Harvest FDA 510(k) database for NSE (Not Substantially Equivalent) decisions
 */
async function harvest510kDecisions() {
  log('🏥', 'Harvesting 510(k) NSE decisions...', colors.blue);

  const baseUrl = 'https://api.fda.gov/device/510k.json';

  try {
    // Search for NSE decisions
    const response = await axios.get(baseUrl, {
      params: {
        search: 'decision_description:"Not Substantially Equivalent"',
        limit: 100,
      },
      timeout: 30000,
    });

    const results = response.data?.results || [];
    log('✅', `Retrieved ${results.length} NSE decisions`, colors.green);

    let processed = 0;
    for (const decision of results) {
      const kNumber = decision.k_number;
      const deviceName = decision.device_name;
      const applicant = decision.applicant;
      const productCode = decision.product_code;

      await createRejectionAtom({
        sourceId: `510K:${kNumber}`,
        submissionType: 'device_510k',
        rejectionCategory: 'substantial_equivalence',
        rejectionReason: `Not Substantially Equivalent determination for ${deviceName}`,
        severity: 'critical',
        context: `510(k) ${kNumber} by ${applicant}, Product Code: ${productCode}`,
        guidance: 'Review predicate selection and technological characteristics comparison',
        sourceDocument: 'FDA 510(k) Database',
        tags: ['510k', 'nse', productCode?.toLowerCase()].filter(Boolean),
      });
      processed++;
    }

    return { processed, total: results.length };
  } catch (error) {
    log('❌', `510(k) API error: ${error.message}`, colors.red);
    return { processed: 0, total: 0, error: error.message };
  }
}

/**
 * Seed the knowledge base with foundational regulatory guidance
 */
async function seedFoundationalGuidance() {
  log('📚', 'Seeding foundational regulatory guidance...', colors.cyan);

  const guidanceEntries = [
    // IND Guidance
    {
      submissionType: 'ind',
      pyramidLevel: 'foundation',
      guidanceTitle: 'IND Pre-Submission Strategy',
      guidanceContent:
        'Before submitting an IND, ensure clear scientific rationale linking target, mechanism, and clinical hypothesis. Request a pre-IND meeting (Type B) to align with FDA on development plan.',
      preventionSteps: [
        'Define clear Target Product Profile (TPP)',
        'Establish mechanism of action with supporting data',
        'Document unmet medical need and competitive landscape',
        'Request pre-IND meeting for complex products',
        'Review FDA guidance documents for therapeutic area',
      ],
      references: ['FDA Guidance: IND Applications', 'FDA Guidance: Formal Meetings'],
    },
    {
      submissionType: 'ind',
      pyramidLevel: 'preclinical',
      guidanceTitle: 'IND Nonclinical Requirements',
      guidanceContent:
        'Nonclinical studies must support the proposed clinical trial duration and route of administration. ICH M3(R2) provides guidance on timing of nonclinical studies.',
      preventionSteps: [
        'Conduct pharmacology studies (primary, secondary, safety)',
        'Complete GLP toxicology of appropriate duration',
        'Include hERG/cardiovascular safety assessment',
        'Establish NOAEL with adequate exposure margins',
        'Qualify impurities per ICH guidelines',
        'Document species selection rationale',
      ],
      references: ['ICH M3(R2)', 'ICH S7A/S7B', 'ICH S9 for oncology'],
    },
    {
      submissionType: 'ind',
      pyramidLevel: 'cmc',
      guidanceTitle: 'IND CMC Requirements',
      guidanceContent:
        'CMC information should be appropriate for the phase of development. Phase 1 requires basic characterization; later phases require more comprehensive data.',
      preventionSteps: [
        'Characterize drug substance structure and properties',
        'Document manufacturing process with in-process controls',
        'Develop stability-indicating analytical methods',
        'Provide stability data supporting proposed storage/shelf life',
        'Describe container closure system compatibility',
        'Address impurity identification and control',
      ],
      references: ['FDA Guidance: INDs for Phase 1', 'ICH Q8/Q9/Q10'],
    },
    {
      submissionType: 'ind',
      pyramidLevel: 'clinical',
      guidanceTitle: 'IND Clinical Protocol Design',
      guidanceContent:
        'Protocol design should have clear objectives, appropriate endpoints, justified sample size, and robust safety monitoring. Statistical considerations should be integral to design.',
      preventionSteps: [
        'Define primary endpoint that is clinically meaningful',
        'Justify sample size with statistical assumptions',
        'Specify analysis populations (ITT, PP, Safety)',
        'Include clear stopping rules for safety/futility',
        'Develop comprehensive safety monitoring plan',
        'Address multiplicity if multiple comparisons planned',
        'Consider adaptive design options where appropriate',
      ],
      references: [
        'ICH E6(R2) GCP',
        'ICH E9 Statistical Principles',
        'FDA Guidance: Adaptive Designs',
      ],
    },

    // 510(k) Guidance
    {
      submissionType: 'device_510k',
      pyramidLevel: 'predicate',
      guidanceTitle: '510(k) Predicate Selection Strategy',
      guidanceContent:
        'Predicate device selection is critical to 510(k) success. The predicate must be legally marketed and have the same intended use and similar technological characteristics.',
      preventionSteps: [
        'Search FDA database for cleared devices with same intended use',
        'Evaluate technological characteristics similarity',
        'Consider if new technology raises new safety/effectiveness questions',
        'Document rationale if using multiple predicates',
        'Avoid using recalled or withdrawn predicates',
        'Consider device classification and special controls',
      ],
      references: ['FDA Guidance: 510(k) Program', 'FDA Guidance: Substantial Equivalence'],
    },
    {
      submissionType: 'device_510k',
      pyramidLevel: 'performance',
      guidanceTitle: '510(k) Performance Testing Requirements',
      guidanceContent:
        'Performance testing must demonstrate substantial equivalence to the predicate device. Testing should follow recognized consensus standards where applicable.',
      preventionSteps: [
        'Follow FDA-recognized consensus standards (ISO, ASTM, IEC)',
        'Complete biocompatibility testing per ISO 10993',
        'Validate software per IEC 62304',
        'Conduct electrical safety testing per IEC 60601',
        'Validate sterilization process',
        'Include shelf-life/stability testing',
        'Perform design verification and validation',
      ],
      references: ['FDA Recognized Consensus Standards', 'ISO 10993', 'IEC 62304', 'IEC 60601'],
    },
    {
      submissionType: 'device_510k',
      pyramidLevel: 'clinical',
      guidanceTitle: '510(k) Clinical Data Considerations',
      guidanceContent:
        'Clinical data may be required when bench testing cannot adequately demonstrate substantial equivalence. Human factors studies are increasingly important.',
      preventionSteps: [
        'Evaluate if clinical data is needed based on risks',
        'Conduct human factors study for use-related hazards',
        'Follow FDA guidance for clinical studies',
        'Document risk-benefit analysis per ISO 14971',
        'Consider real-world evidence options',
      ],
      references: [
        'FDA Guidance: When to Submit 510(k)',
        'FDA Guidance: Human Factors',
        'ISO 14971',
      ],
    },

    // BLA/NDA Guidance
    {
      submissionType: 'nda_bla',
      pyramidLevel: 'efficacy',
      guidanceTitle: 'NDA/BLA Efficacy Requirements',
      guidanceContent:
        'Substantial evidence of effectiveness typically requires adequate and well-controlled clinical investigations. The clinical program should demonstrate a favorable benefit-risk profile.',
      preventionSteps: [
        'Design Phase 3 studies to meet FDA endpoints guidance',
        'Pre-specify statistical analysis plan',
        'Address multiplicity in trial design',
        'Demonstrate clinically meaningful effect size',
        'Consider surrogate endpoint pathways if applicable',
        'Request End-of-Phase 2 meeting to align on pivotal trial design',
      ],
      references: [
        'FDA Guidance: Adequate and Well-Controlled Studies',
        'FDA Guidance: Exposure-Response',
      ],
    },
    {
      submissionType: 'nda_bla',
      pyramidLevel: 'safety',
      guidanceTitle: 'NDA/BLA Safety Database Requirements',
      guidanceContent:
        'Safety database should be adequate to characterize the safety profile. ICH E1 provides guidance on population exposure requirements.',
      preventionSteps: [
        'Ensure adequate exposure: 1500 patients, 300-600 for 6 months, 100 for 1 year',
        'Identify and characterize important safety signals',
        'Develop Risk Evaluation and Mitigation Strategy (REMS) if needed',
        'Prepare comprehensive integrated safety summary',
        'Address signals of hepatotoxicity, cardiotoxicity, etc.',
        'Plan post-marketing safety commitments',
      ],
      references: ['ICH E1', 'ICH E2E', 'FDA Guidance: REMS'],
    },
  ];

  let created = 0;
  for (const guidance of guidanceEntries) {
    const atomId = await createGuidanceAtom(guidance);
    if (atomId) created++;
  }

  log('✅', `Seeded ${created} foundational guidance atoms`, colors.green);
  return { created, total: guidanceEntries.length };
}

// ═══════════════════════════════════════════════════════════════════════════
//                      MAIN EXECUTION
// ═══════════════════════════════════════════════════════════════════════════

async function getCortexStats() {
  try {
    const atoms = await pool.query(`SELECT COUNT(*) as count FROM lumen_data_atoms`);
    const rejections = await pool.query(
      `SELECT COUNT(*) as count FROM lumen_data_atoms WHERE atom_type = 'rejection_pattern'`
    );
    const guidance = await pool.query(
      `SELECT COUNT(*) as count FROM lumen_data_atoms WHERE atom_type = 'proactive_guidance'`
    );
    const edges = await pool.query(`SELECT COUNT(*) as count FROM rag_knowledge_graph`);

    return {
      totalAtoms: parseInt(atoms.rows[0]?.count || 0),
      rejectionPatterns: parseInt(rejections.rows[0]?.count || 0),
      guidanceAtoms: parseInt(guidance.rows[0]?.count || 0),
      totalEdges: parseInt(edges.rows[0]?.count || 0),
    };
  } catch (error) {
    return { totalAtoms: 0, rejectionPatterns: 0, guidanceAtoms: 0, totalEdges: 0 };
  }
}

async function main() {
  logger.info(`
╔════════════════════════════════════════════════════════════════════════════╗
║                                                                            ║
║  🧠  ${colors.bright}LUMEN CORTEX: REGULATORY INTELLIGENCE ENGINE${colors.reset}  🧠                    ║
║                                                                            ║
║  ${colors.cyan}"Understanding WHY submissions fail to ensure they succeed"${colors.reset}              ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
  `);

  // Verify database
  try {
    const result = await pool.query('SELECT current_database() as db');
    log('🔗', `Connected to database: ${result.rows[0].db}`, colors.green);
  } catch (error) {
    log('❌', `Database connection failed: ${error.message}`, colors.red);
    process.exit(1);
  }

  const initialStats = await getCortexStats();
  log(
    '📊',
    `Current: ${initialStats.totalAtoms} atoms, ${initialStats.rejectionPatterns} rejection patterns, ${initialStats.guidanceAtoms} guidance atoms`,
    colors.blue
  );

  logger.info('\n' + '═'.repeat(70));
  log(
    '📋',
    `${colors.bright}PHASE 1: Seeding Foundational Regulatory Guidance${colors.reset}`,
    colors.magenta
  );
  logger.info('═'.repeat(70));

  const guidanceResult = await seedFoundationalGuidance();

  logger.info('\n' + '═'.repeat(70));
  log(
    '📋',
    `${colors.bright}PHASE 2: Harvesting FDA Rejection Intelligence${colors.reset}`,
    colors.magenta
  );
  logger.info('═'.repeat(70));

  // Harvest Warning Letters
  logger.info('\n' + '-'.repeat(50));
  const warningResult = await harvestWarningLetters();

  // Harvest Drugs@FDA (CRL patterns)
  logger.info('\n' + '-'.repeat(50));
  const drugsResult = await harvestDrugsAtFDA();

  // Harvest 510(k) NSE decisions
  logger.info('\n' + '-'.repeat(50));
  const deviceResult = await harvest510kDecisions();

  // Final stats
  const finalStats = await getCortexStats();

  logger.info('\n');
  logger.info('╔' + '═'.repeat(68) + '╗');
  logger.info(
    '║' +
      ' '.repeat(20) +
      `${colors.green}INTELLIGENCE HARVEST COMPLETE${colors.reset}` +
      ' '.repeat(19) +
      '║'
  );
  logger.info('╚' + '═'.repeat(68) + '╝');
  logger.info(`
  ${colors.bright}📊 Session Results:${colors.reset}
     • Foundational Guidance Seeded: ${guidanceResult.created}
     • Warning Letter Patterns:      ${warningResult.processed}
     • CRL/Rejection Patterns:       ${drugsResult.processed}
     • 510(k) NSE Patterns:          ${deviceResult.processed}

  ${colors.bright}🧠 Intelligence Cortex Status:${colors.reset}
     • Total Atoms:         ${finalStats.totalAtoms} (+${finalStats.totalAtoms - initialStats.totalAtoms})
     • Rejection Patterns:  ${finalStats.rejectionPatterns} (+${finalStats.rejectionPatterns - initialStats.rejectionPatterns})
     • Guidance Atoms:      ${finalStats.guidanceAtoms} (+${finalStats.guidanceAtoms - initialStats.guidanceAtoms})
     • Knowledge Edges:     ${finalStats.totalEdges}

  ${colors.bright}🎯 Capabilities Enabled:${colors.reset}
     ✓ IND Pyramid Analysis (5 levels)
     ✓ 510(k) Dossier Structure (5 sections)
     ✓ NDA/BLA Rejection Taxonomy
     ✓ Proactive Failure Prevention
     ✓ Project Memory Foundation
  `);

  await pool.end();
}

// Run
main().catch(error => {
  logger.error('Fatal error:', error);
  process.exit(1);
});
