/**
 * OpenAI Orchestrator Service
 * Implements Responses API with Structured Outputs (strict: true)
 * For Facts Graph, CMC integration, and eCTD Co-Author
 */

import { ai } from '../../lib/unified-ai-client';
import { v4 as uuid } from 'uuid';
import { pool } from '../../db';
import { getIntelligencePrefix } from '../lumen-context-builder.js';

// Database pool for Facts Graph
const db = pool;

// JSON Schemas for Structured Outputs (strict: true)
export const FactSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'Fact',
  type: 'object',
  required: ['id', 'source_uri', 'ctd_path', 'fact_type', 'created_at'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    source_uri: { type: 'string', format: 'uri' },
    ctd_path: {
      type: 'string',
      description: "e.g., 'm2.6.6', 'm3.2.P.5', 'm4', 'm5'",
      pattern: '^[mM][1-5](\\.[0-9A-Za-z]+)*$',
    },
    cv_terms: { type: 'array', items: { type: 'string' }, default: [] },
    fact_type: {
      type: 'string',
      enum: ['measurement', 'method_summary', 'table', 'figure', 'dataset_link', 'claim'],
    },
    label: { type: 'string' },
    value_text: { type: 'string' },
    numeric_value: { type: 'number' },
    units: { type: 'string' },
    lot: { type: 'string' },
    method_ref: { type: 'string' },
    dataset_ref: { type: 'string' },
    effective_date: { type: 'string', format: 'date' },
    created_at: { type: 'string', format: 'date-time' },
    status: { type: 'string', enum: ['draft', 'approved', 'retired'], default: 'approved' },
  },
};

export const CMCSpecSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'CMC_Spec',
  type: 'object',
  required: ['id', 'cqa', 'parameter', 'status', 'range', 'method_ref'],
  additionalProperties: false,
  properties: {
    id: { type: 'string', format: 'uuid' },
    cqa: { type: 'string' },
    parameter: { type: 'string' },
    status: { type: 'string', enum: ['draft', 'qualified', 'approved', 'retired'] },
    range: {
      type: 'object',
      required: ['units'],
      additionalProperties: false,
      properties: {
        min: { type: 'number' },
        max: { type: 'number' },
        target: { type: 'number' },
        units: { type: 'string' },
        acceptance_criteria: { type: 'string' },
      },
    },
    method_ref: { type: 'string' },
    rationale: { type: 'string' },
    notes: { type: 'string' },
    effective_date: { type: 'string', format: 'date' },
  },
};

export const LeafPatchSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  title: 'LeafPatch',
  type: 'object',
  required: ['leaf_id', 'patches', 'citations'],
  additionalProperties: false,
  properties: {
    leaf_id: { type: 'string' },
    patches: {
      type: 'array',
      items: {
        type: 'object',
        required: ['op', 'path', 'value'],
        additionalProperties: false,
        properties: {
          op: { type: 'string', enum: ['add', 'replace', 'remove'] },
          path: { type: 'string' },
          value: { type: 'string' },
          value_type: { type: 'string', enum: ['text', 'table', 'figure'], default: 'text' },
        },
      },
    },
    citations: {
      type: 'array',
      items: {
        type: 'object',
        required: ['fact_id', 'source_uri'],
        additionalProperties: false,
        properties: {
          fact_id: { type: 'string', format: 'uuid' },
          source_uri: { type: 'string', format: 'uri' },
        },
      },
    },
    rationale: { type: 'string' },
    generated_at: { type: 'string', format: 'date-time' },
  },
};

/**
 * Helper to call OpenAI Responses API with Structured Outputs (strict)
 * Guarantees schema-true JSON responses
 */
export async function responsesJson<T>(args: {
  system: string;
  user: string;
  jsonSchemaName: string;
  jsonSchema: any;
  tools?: any[];
  fileSearch?: { max_results?: number };
  webSearch?: { enable?: boolean };
  organizationId?: number;
  projectId?: number | string;
}): Promise<T> {
  const { system, user, jsonSchemaName, jsonSchema, tools = [], fileSearch } = args;

  try {
    // Inject client/project intelligence so orchestrator reads SKILL/.MD context
    const intelligencePrefix = await getIntelligencePrefix(args.organizationId, args.projectId).catch(() => '');
    const enrichedSystem = intelligencePrefix + system;

    // Use unified AI client with JSON mode for structured outputs
    const result = await ai.complete(
      [
        { role: 'system', content: enrichedSystem },
        { role: 'user', content: user },
      ],
      {
        maxTokens: 4000,
        temperature: 0.3, // Lower temperature for more consistent outputs
        jsonMode: true,
        jsonSchema: jsonSchema,
        callerModule: 'openai-orchestrator/responsesJson',
      }
    );

    return JSON.parse(result || '{}') as T;
  } catch (error) {
    console.error('[OpenAI Orchestrator] Error calling AI API:', error);
    throw error;
  }
}

/**
 * Extract Facts from evidence documents
 * Returns schema-true Fact[] with provenance
 */
export async function extractFactsFromEvidence(
  fileContent: string,
  fileName: string
): Promise<any[]> {
  const system = `You are a regulatory evidence extractor for FDA IND submissions.
    Extract structured facts from documents following eCTD v4.0/M1 standards.
    Return an array of Facts per the schema. Each fact must have:
    - Unique UUID
    - source_uri pointing to the original file
    - Appropriate CTD path (m2, m3, m4, m5)
    - Controlled vocabulary terms
    - Normalized units and values`;

  const user = `Extract all regulatory facts from this document: ${fileName}
    Content: ${fileContent.substring(0, 10000)}`;

  const response = await responsesJson<{ facts: any[] }>({
    system,
    user,
    jsonSchemaName: 'FactExtraction',
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['facts'],
      properties: {
        facts: {
          type: 'array',
          items: FactSchema,
        },
      },
    },
  });

  // Store facts in database
  for (const fact of response.facts) {
    await db.query(
      `INSERT INTO facts (id, source_uri, ctd_path, fact_type, label, value_text,
        numeric_value, units, lot, method_ref, dataset_ref, effective_date, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO UPDATE SET status = $13`,
      [
        fact.id,
        fact.source_uri,
        fact.ctd_path,
        fact.fact_type,
        fact.label,
        fact.value_text,
        fact.numeric_value,
        fact.units,
        fact.lot,
        fact.method_ref,
        fact.dataset_ref,
        fact.effective_date,
        fact.status,
        fact.created_at,
      ]
    );
  }

  return response.facts;
}

/**
 * Generate CMC Comparability Plan (ICH Q5E) with LeafPatch
 */
export async function generateComparabilityPlan(
  preChangeData: any,
  postChangeData: any,
  leafId: string
): Promise<{ plan: any; patch: any }> {
  const system = `You are a CMC regulatory writer specializing in ICH Q5E comparability.
    Generate a comparability plan and propose updates to eCTD leaves.
    Follow KASA/PQ-CMC structure for summaries.
    All outputs must be schema-true per strict JSON schemas.`;

  const user = `Create a Q5E comparability plan for:
    Pre-change: ${JSON.stringify(preChangeData)}
    Post-change: ${JSON.stringify(postChangeData)}
    Target leaf: ${leafId}`;

  const ComparabilityPlanSchema = {
    type: 'object',
    required: ['id', 'change_summary', 'pre_change', 'post_change', 'analytics', 'sampling_plan'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      change_summary: { type: 'string' },
      scope: { type: 'string', enum: ['drug_substance', 'drug_product', 'both'] },
      pre_change: { type: 'array', items: { type: 'string' } },
      post_change: { type: 'array', items: { type: 'string' } },
      analytics: {
        type: 'array',
        items: {
          type: 'object',
          required: ['test', 'acceptance_criteria'],
          additionalProperties: false,
          properties: {
            test: { type: 'string' },
            acceptance_criteria: { type: 'string' },
            method_ref: { type: 'string' },
          },
        },
      },
      sampling_plan: {
        type: 'object',
        required: ['lots', 'timepoints'],
        additionalProperties: false,
        properties: {
          lots: { type: 'array', items: { type: 'string' } },
          timepoints: { type: 'array', items: { type: 'string' } },
        },
      },
    },
  };

  return responsesJson<{ plan: any; patch: any }>({
    system,
    user,
    jsonSchemaName: 'ComparabilityOutput',
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['plan', 'patch'],
      properties: {
        plan: ComparabilityPlanSchema,
        patch: LeafPatchSchema,
      },
    },
  });
}

/**
 * Generate IND Safety Update per 21 CFR 312.32
 */
export async function generateSafetyUpdate(saeData: any): Promise<any> {
  const system = `You are a safety/PV specialist for FDA IND submissions.
    Apply 21 CFR 312.32 SUSAR logic.
    Generate safety narratives and determine reporting timelines (7-day or 15-day).
    All outputs must be schema-true.`;

  const user = `Analyze this SAE and generate IND safety update:
    ${JSON.stringify(saeData)}`;

  const SafetyUpdateSchema = {
    type: 'object',
    required: ['id', 'event_type', 'reporting_timeline', 'narrative', 'actions'],
    additionalProperties: false,
    properties: {
      id: { type: 'string', format: 'uuid' },
      event_type: { type: 'string', enum: ['SUSAR', 'SAE', 'UADE', 'Other'] },
      reporting_timeline: { type: 'string', enum: ['7-day', '15-day', 'annual', 'none'] },
      narrative: { type: 'string' },
      investigator_notification: { type: 'string' },
      fda_notification: { type: 'string' },
      actions: {
        type: 'array',
        items: {
          type: 'object',
          required: ['action', 'deadline'],
          additionalProperties: false,
          properties: {
            action: { type: 'string' },
            deadline: { type: 'string', format: 'date-time' },
            completed: { type: 'boolean', default: false },
          },
        },
      },
    },
  };

  return responsesJson<any>({
    system,
    user,
    jsonSchemaName: 'SafetyUpdate',
    jsonSchema: SafetyUpdateSchema,
  });
}

/**
 * Validate eCTD structure against v4.0/M1 rules
 */
export async function validateECTDStructure(leafData: any): Promise<any[]> {
  const system = `You are an eCTD v4.0/M1 validator.
    Check for structure violations, controlled vocabulary errors, and lifecycle issues.
    Return validation findings per schema.`;

  const user = `Validate this eCTD leaf:
    ${JSON.stringify(leafData)}`;

  const ValidationFindingSchema = {
    type: 'object',
    required: ['code', 'severity', 'message'],
    additionalProperties: false,
    properties: {
      code: { type: 'string' },
      severity: { type: 'string', enum: ['error', 'warning', 'info'] },
      location: { type: 'string' },
      message: { type: 'string' },
      fix_hint: { type: 'string' },
      references: { type: 'array', items: { type: 'string' } },
    },
  };

  const response = await responsesJson<{ findings: any[] }>({
    system,
    user,
    jsonSchemaName: 'ValidationFindings',
    jsonSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['findings'],
      properties: {
        findings: {
          type: 'array',
          items: ValidationFindingSchema,
        },
      },
    },
  });

  return response.findings;
}

/**
 * Initialize Facts Graph database tables
 */
export async function initializeFactsGraph(): Promise<void> {
  const queries = [
    `CREATE TABLE IF NOT EXISTS facts (
      id UUID PRIMARY KEY,
      source_uri TEXT NOT NULL,
      ctd_path TEXT NOT NULL,
      fact_type TEXT NOT NULL,
      label TEXT,
      value_text TEXT,
      numeric_value DOUBLE PRECISION,
      units TEXT,
      lot TEXT,
      method_ref TEXT,
      dataset_ref TEXT,
      effective_date DATE,
      status TEXT DEFAULT 'approved',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS cmc_specs (
      id UUID PRIMARY KEY,
      cqa TEXT NOT NULL,
      parameter TEXT NOT NULL,
      status TEXT NOT NULL,
      range_min DOUBLE PRECISION,
      range_max DOUBLE PRECISION,
      range_target DOUBLE PRECISION,
      range_units TEXT,
      acceptance_criteria TEXT,
      method_ref TEXT,
      rationale TEXT,
      notes TEXT,
      effective_date DATE
    )`,

    `CREATE TABLE IF NOT EXISTS leaves (
      id TEXT PRIMARY KEY,
      ctd_path TEXT NOT NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft',
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS leaf_citations (
      id BIGSERIAL PRIMARY KEY,
      leaf_id TEXT REFERENCES leaves(id) ON DELETE CASCADE,
      fact_id UUID REFERENCES facts(id) ON DELETE SET NULL,
      source_uri TEXT NOT NULL
    )`,

    `CREATE TABLE IF NOT EXISTS submissions (
      id UUID PRIMARY KEY,
      sequence_no INT NOT NULL,
      region TEXT NOT NULL,
      zip_uri TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'created',
      esg_submission_id TEXT,
      fda_receipt_ts TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`,

    `CREATE TABLE IF NOT EXISTS validation_findings (
      id BIGSERIAL PRIMARY KEY,
      submission_id UUID REFERENCES submissions(id) ON DELETE CASCADE,
      leaf_id TEXT,
      code TEXT,
      severity TEXT,
      location TEXT,
      message TEXT,
      fix_hint TEXT,
      references TEXT[]
    )`,
  ];

  for (const query of queries) {
    try {
      await db.query(query);
    } catch (error) {
      console.error('[Facts Graph] Error creating table:', error);
    }
  }

  console.log('[Facts Graph] Database tables initialized');
}

// Initialize on module load
initializeFactsGraph().catch(console.error);
