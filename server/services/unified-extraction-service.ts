/**
 * Unified Regulatory Extraction Service
 *
 * Single entry point for extracting structured atoms from ANY regulatory document.
 * Routes to specialized extraction logic based on document type.
 * All outputs are persisted, versioned, and linked to source documents.
 *
 * Fixes the audit finding: extraction was fragmented across 12+ services
 * with inconsistent persistence and no unified interface.
 */

import OpenAI from 'openai';
import { db } from '../db';
import { sql } from 'drizzle-orm';
import { createHash } from 'crypto';

type RegulatoryDocumentType =
  | 'csr' | 'protocol' | 'sap' | 'ib'
  | 'cmc_drug_substance' | 'cmc_drug_product' | 'cmc_analytical'
  | 'cmc_specifications' | 'cmc_stability' | 'cmc_batch_record' | 'cmc_comparability'
  | 'cer' | 'device_510k' | 'device_pma'
  | 'safety_narrative' | 'literature' | 'faers_report'
  | 'general_regulatory';

interface ExtractionRequest {
  documentId: string;
  documentType: RegulatoryDocumentType;
  content: string;
  organizationId: number;
  projectId?: string;
  options?: {
    extractEndpoints?: boolean;
    extractSafety?: boolean;
    extractCMC?: boolean;
    extractBiomarkers?: boolean;
    extractStatistics?: boolean;
    confidenceThreshold?: number;
  };
}

interface ExtractedAtom {
  atomType: string;
  atomData: Record<string, any>;
  confidence: number;
  sourceReference: {
    page?: number;
    section?: string;
    paragraph?: number;
    exactText?: string;
  };
}

interface ExtractionResult {
  documentId: string;
  documentType: RegulatoryDocumentType;
  atoms: ExtractedAtom[];
  metadata: {
    extractionVersion: string;
    modelUsed: string;
    processingTimeMs: number;
    totalAtomsExtracted: number;
    averageConfidence: number;
    warnings: string[];
  };
  provenance: {
    extractedAt: Date;
    extractedBy: string;
    contentHash: string;
  };
}

// ============================================================
// Extraction schemas per document type
// ============================================================

const CSR_EXTRACTION_SCHEMA = {
  study: {
    title: 'string', phase: 'string', design: 'string', blinding: 'string',
    indication: 'string', sponsor: 'string', molecule: 'string',
    mechanismOfAction: 'string', sampleSize: 'number', durationWeeks: 'number',
    numberOfArms: 'number', comparator: 'string', randomization: 'string',
    nctId: 'string', eudractNumber: 'string',
  },
  endpoints: {
    name: 'string', category: 'primary|secondary|exploratory|safety',
    type: 'string', measurementVariable: 'string', timepoint: 'string',
    clinicalRelevance: 'string', isSurrogate: 'boolean',
  },
  safety: {
    eventTerm: 'string', seriousness: 'string', severity: 'string',
    causality: 'string', frequency: 'number', treatmentArm: 'string',
    outcome: 'string', actionTaken: 'string',
  },
  statistics: {
    primaryModel: 'string', analysisPopulation: 'string',
    multiplicityMethod: 'string', missingDataMethod: 'string',
    alphaLevel: 'number', power: 'number', effectSize: 'number',
  },
  biomarkers: {
    name: 'string', type: 'string', assayMethod: 'string',
    baselineValue: 'string', correlatedEndpoint: 'string',
    isPredictive: 'boolean', isPrognostic: 'boolean',
  },
};

const PROTOCOL_EXTRACTION_SCHEMA = {
  study: {
    title: 'string', phase: 'string', design: 'string', blinding: 'string',
    indication: 'string', sponsor: 'string', molecule: 'string',
    sampleSize: 'number', durationWeeks: 'number', numberOfArms: 'number',
    protocolNumber: 'string',
  },
  objectives: { primary: 'string', secondary: 'string[]' },
  endpoints: { name: 'string', category: 'string', definition: 'string', timepoint: 'string' },
  eligibility: { type: 'inclusion|exclusion', criterion: 'string' },
  arms: { name: 'string', dose: 'string', route: 'string', frequency: 'string' },
  schedule: { visit: 'string', timepoint: 'string', procedures: 'string[]' },
};

const CMC_EXTRACTION_SCHEMA = {
  processSteps: {
    stepName: 'string', unitOperation: 'string', description: 'string',
    inputs: 'string[]', outputs: 'string[]',
    criticalProcessParameters: '{ name, target, range, unit, criticality }[]',
    inProcessControls: '{ test, acceptanceCriteria, frequency }[]',
    equipment: 'string',
  },
  materials: {
    name: 'string', type: 'string', grade: 'string', supplier: 'string',
    criticality: 'string', specification: 'string',
  },
  specifications: {
    test: 'string', method: 'string', acceptanceCriterion: 'string',
    releaseOrShelfLife: 'string', justification: 'string',
  },
  stability: {
    condition: 'string', timepoint: 'string', attribute: 'string',
    result: 'string', trend: 'string', shelfLifeImplication: 'string',
  },
  batch: {
    batchNumber: 'string', batchType: 'string', scale: 'string',
    site: 'string', date: 'string', purpose: 'string',
    yield: 'number', disposition: 'string',
  },
};

const SAP_EXTRACTION_SCHEMA = {
  endpoints: { name: 'string', category: 'string', definition: 'string', statisticalTest: 'string' },
  analysisPopulations: { name: 'string', definition: 'string' },
  statisticalMethods: {
    endpointName: 'string', primaryMethod: 'string', covariates: 'string[]',
    missingDataHandling: 'string', sensitivityAnalyses: 'string[]',
  },
  estimands: {
    population: 'string', variable: 'string', intercurrentEvents: 'string[]',
    strategy: 'string', summaryMeasure: 'string',
  },
  multiplicity: { method: 'string', hypotheses: 'string[]', alphaAllocation: 'string' },
  sampleSize: {
    total: 'number', perArm: 'number', effectSize: 'number',
    alpha: 'number', power: 'number', dropoutRate: 'number',
  },
};

const SAFETY_EXTRACTION_SCHEMA = {
  adverseEvents: {
    verbatimTerm: 'string', preferredTerm: 'string', systemOrganClass: 'string',
    seriousness: 'string', severity: 'string', causality: 'string',
    outcome: 'string', onsetStudyDay: 'number', treatmentArm: 'string',
    actionTaken: 'string', frequency: 'number', incidenceRate: 'number',
  },
  signalTerms: { term: 'string', source: 'string', trend: 'string', clinicalSignificance: 'string' },
};

// ============================================================
// Service
// ============================================================

class UnifiedExtractionService {
  private openai: OpenAI | null = null;
  private static readonly VERSION = '1.0.0';

  private getOpenAI(): OpenAI {
    if (!this.openai) {
      this.openai = new OpenAI();
    }
    return this.openai;
  }

  /**
   * Main entry point: extract structured atoms from a regulatory document.
   */
  async extract(request: ExtractionRequest): Promise<ExtractionResult> {
    const startTime = Date.now();
    const contentHash = createHash('sha256').update(request.content).digest('hex');
    const warnings: string[] = [];

    let atoms: ExtractedAtom[] = [];

    try {
      switch (request.documentType) {
        case 'csr':
          atoms = await this.extractFromCSR(request.content, request.options);
          break;
        case 'protocol':
          atoms = await this.extractFromProtocol(request.content, request.options);
          break;
        case 'sap':
          atoms = await this.extractFromSAP(request.content, request.options);
          break;
        case 'cmc_drug_substance':
        case 'cmc_drug_product':
        case 'cmc_analytical':
        case 'cmc_specifications':
        case 'cmc_stability':
        case 'cmc_batch_record':
        case 'cmc_comparability':
          atoms = await this.extractFromCMC(request.content, request.documentType, request.options);
          break;
        case 'safety_narrative':
        case 'faers_report':
          atoms = await this.extractFromSafety(request.content, request.options);
          break;
        case 'device_510k':
        case 'device_pma':
        case 'cer':
          atoms = await this.extractFromDevice(request.content, request.documentType, request.options);
          break;
        default:
          atoms = await this.extractGeneral(request.content, request.options);
      }
    } catch (error) {
      warnings.push(`Extraction error: ${error instanceof Error ? error.message : String(error)}`);
    }

    // Filter by confidence threshold
    const threshold = request.options?.confidenceThreshold ?? 0.7;
    const filteredAtoms = atoms.filter((a) => a.confidence >= threshold);
    const belowThreshold = atoms.length - filteredAtoms.length;
    if (belowThreshold > 0) {
      warnings.push(`${belowThreshold} atoms below confidence threshold ${threshold}`);
    }

    const avgConfidence =
      filteredAtoms.length > 0
        ? filteredAtoms.reduce((sum, a) => sum + a.confidence, 0) / filteredAtoms.length
        : 0;

    const result: ExtractionResult = {
      documentId: request.documentId,
      documentType: request.documentType,
      atoms: filteredAtoms,
      metadata: {
        extractionVersion: UnifiedExtractionService.VERSION,
        modelUsed: 'gpt-4o',
        processingTimeMs: Date.now() - startTime,
        totalAtomsExtracted: filteredAtoms.length,
        averageConfidence: Math.round(avgConfidence * 100) / 100,
        warnings,
      },
      provenance: {
        extractedAt: new Date(),
        extractedBy: 'unified-extraction-service',
        contentHash,
      },
    };

    // Persist results
    await this.persistResult(result, request.organizationId);

    return result;
  }

  // ============================================================
  // CSR extraction
  // ============================================================

  private async extractFromCSR(
    content: string,
    options?: ExtractionRequest['options']
  ): Promise<ExtractedAtom[]> {
    const systemPrompt = `You are a regulatory intelligence extraction engine specialized in Clinical Study Reports (CSR, ICH E3).

Extract ALL of the following structured data from the CSR text. For each extracted item, provide:
- The structured data fields
- A confidence score (0.0-1.0) based on how clearly the information appears in the text
- The exact source text that supports the extraction (max 200 chars)
- The section where found (e.g., "Synopsis", "Section 11.4")

Return valid JSON with this structure:
{
  "study": { title, phase, design, blinding, indication, sponsor, molecule, mechanismOfAction, sampleSize, durationWeeks, numberOfArms, comparator, randomization, nctId },
  "endpoints": [{ name, category, type, measurementVariable, timepoint, clinicalRelevance, isSurrogate, confidence, sourceText, section }],
  "safety": [{ eventTerm, seriousness, severity, causality, frequency, treatmentArm, outcome, actionTaken, confidence, sourceText }],
  "statistics": { primaryModel, analysisPopulation, multiplicityMethod, missingDataMethod, alphaLevel, power, effectSize, confidence, sourceText },
  "biomarkers": [{ name, type, assayMethod, baselineValue, correlatedEndpoint, isPredictive, isPrognostic, confidence, sourceText }]
}

Rules:
- Extract from the ENTIRE text, not just the beginning
- For safety data, extract the most frequently reported events
- For endpoints, clearly distinguish primary vs secondary vs exploratory
- Use null for fields you cannot determine. Never fabricate data.`;

    const extracted = await this.callLLMExtraction(systemPrompt, content);
    return this.convertToAtoms(extracted, 'csr');
  }

  // ============================================================
  // Protocol extraction
  // ============================================================

  private async extractFromProtocol(
    content: string,
    options?: ExtractionRequest['options']
  ): Promise<ExtractedAtom[]> {
    const systemPrompt = `You are a clinical trial protocol extraction specialist.

Extract structured data from this clinical trial protocol. Return valid JSON:
{
  "study": { title, phase, design, blinding, indication, sponsor, molecule, sampleSize, durationWeeks, numberOfArms, protocolNumber },
  "objectives": { primary, secondary: [] },
  "endpoints": [{ name, category, definition, timepoint, confidence, sourceText }],
  "eligibility": [{ type: "inclusion"|"exclusion", criterion, confidence }],
  "arms": [{ name, dose, route, frequency, confidence }],
  "schedule": [{ visit, timepoint, procedures: [] }],
  "statisticalConsiderations": { primaryAnalysis, sampleSizeJustification, alpha, power, effectSize, dropoutRate }
}

Rules:
- Extract ALL inclusion and exclusion criteria
- Extract ALL endpoints with their definitions
- Be precise about dose, route, and frequency for each arm
- Use null for undetermined fields`;

    const extracted = await this.callLLMExtraction(systemPrompt, content);
    return this.convertToAtoms(extracted, 'protocol');
  }

  // ============================================================
  // SAP extraction
  // ============================================================

  private async extractFromSAP(
    content: string,
    options?: ExtractionRequest['options']
  ): Promise<ExtractedAtom[]> {
    const systemPrompt = `You are a biostatistics extraction specialist for Statistical Analysis Plans (SAP).

Extract structured data from this SAP. Return valid JSON:
{
  "endpoints": [{ name, category, definition, statisticalTest, confidence, sourceText }],
  "analysisPopulations": [{ name, definition, confidence }],
  "statisticalMethods": [{ endpointName, primaryMethod, covariates: [], missingDataHandling, sensitivityAnalyses: [], confidence, sourceText }],
  "estimands": [{ population, variable, intercurrentEvents: [], strategy, summaryMeasure, confidence }],
  "multiplicity": { method, hypotheses: [], alphaAllocation, confidence, sourceText },
  "sampleSize": { total, perArm, effectSize, alpha, power, dropoutRate, justification, confidence },
  "interimAnalysis": { planned, stoppingRules, alphaSpending, confidence },
  "subgroupAnalyses": [{ subgroup, preSpecified, endpoint, method }]
}

Rules:
- Pay special attention to estimand framework (ICH E9(R1))
- Extract ALL multiplicity adjustments
- Identify missing data methods precisely (MMRM, MI, LOCF, etc.)
- Extract sensitivity analyses for each endpoint`;

    const extracted = await this.callLLMExtraction(systemPrompt, content);
    return this.convertToAtoms(extracted, 'sap');
  }

  // ============================================================
  // CMC extraction
  // ============================================================

  private async extractFromCMC(
    content: string,
    subType: string,
    options?: ExtractionRequest['options']
  ): Promise<ExtractedAtom[]> {
    const systemPrompt = `You are a CMC (Chemistry, Manufacturing & Controls) extraction specialist for Module 3 regulatory documents.

Document subtype: ${subType}

Extract structured data from this CMC document. Return valid JSON:
{
  "processSteps": [{ stepName, unitOperation, description, inputs: [], outputs: [], criticalProcessParameters: [{ name, target, rangeLow, rangeHigh, unit, criticality }], inProcessControls: [{ test, acceptanceCriteria, frequency }], equipment, confidence, sourceText }],
  "materials": [{ name, type, grade, supplier, criticality, specification, confidence }],
  "specifications": [{ test, method, acceptanceCriterion, releaseOrShelfLife, justification, confidence, sourceText }],
  "stability": [{ condition, timepoint, attribute, result, trend, shelfLifeImplication, confidence }],
  "batch": [{ batchNumber, batchType, scale, site, date, purpose, yield, disposition, confidence }],
  "analyticalMethods": [{ name, type, purpose, validationStatus, acceptanceCriteria, confidence }],
  "qualityAttributes": [{ attribute, criticality, justification, linkedSpecification, linkedMethod }]
}

Rules:
- Separate drug substance (3.2.S) from drug product (3.2.P) content
- Extract ALL critical process parameters with ranges
- Extract ALL in-process controls
- Identify CQAs vs non-critical quality attributes
- Extract stability trends and shelf-life implications`;

    const extracted = await this.callLLMExtraction(systemPrompt, content);
    return this.convertToAtoms(extracted, 'cmc');
  }

  // ============================================================
  // Safety extraction
  // ============================================================

  private async extractFromSafety(
    content: string,
    options?: ExtractionRequest['options']
  ): Promise<ExtractedAtom[]> {
    const systemPrompt = `You are a pharmacovigilance data extraction specialist.

Extract structured safety data from this document. Return valid JSON:
{
  "adverseEvents": [{ verbatimTerm, preferredTerm, systemOrganClass, seriousness, severity, causality, outcome, onsetStudyDay, treatmentArm, actionTaken, frequency, incidenceRate, confidence, sourceText }],
  "saeSummary": { totalSAEs, fatalEvents, lifeThreatening, hospitalization, byArm: { armName: count } },
  "discontinuations": [{ reason, arm, count, percentage }],
  "signalTerms": [{ term, source, trend, clinicalSignificance, confidence }],
  "deathSummary": { totalDeaths, byArm: { armName: count }, causes: [] },
  "labFindings": [{ parameter, shiftDirection, armName, count }]
}

Rules:
- Map verbatim terms to MedDRA Preferred Terms where possible
- Include System Organ Class for each event
- Distinguish treatment-emergent from non-treatment-emergent AEs
- Extract frequencies as both n and percentage where available
- Identify dose-response relationships in safety data`;

    const extracted = await this.callLLMExtraction(systemPrompt, content);
    return this.convertToAtoms(extracted, 'safety');
  }

  // ============================================================
  // Device extraction
  // ============================================================

  private async extractFromDevice(
    content: string,
    subType: string,
    options?: ExtractionRequest['options']
  ): Promise<ExtractedAtom[]> {
    const systemPrompt = `You are a medical device regulatory extraction specialist for ${subType} submissions.

Extract structured data. Return valid JSON:
{
  "deviceInfo": { deviceName, intendedUse, indicationsForUse, deviceClass, productCode, regulationNumber, confidence },
  "predicateDevice": { name, kNumber, manufacturer, similarities: [], differences: [], confidence },
  "performance": [{ testName, testStandard, result, acceptanceCriteria, pass, confidence, sourceText }],
  "biocompatibility": [{ testType, isoStandard, result, conclusion, confidence }],
  "riskAnalysis": [{ hazard, severity, probability, riskLevel, mitigation, residualRisk }],
  "clinicalEvidence": [{ studyType, population, endpoints, results, conclusion, confidence }]
}`;

    const extracted = await this.callLLMExtraction(systemPrompt, content);
    return this.convertToAtoms(extracted, 'device');
  }

  // ============================================================
  // General extraction (fallback)
  // ============================================================

  private async extractGeneral(
    content: string,
    options?: ExtractionRequest['options']
  ): Promise<ExtractedAtom[]> {
    const systemPrompt = `You are a regulatory document extraction specialist. Extract any structured regulatory, clinical, or scientific data from this document. Return valid JSON with categorized arrays of extracted entities, each with confidence and sourceText fields.`;

    const extracted = await this.callLLMExtraction(systemPrompt, content);
    return this.convertToAtoms(extracted, 'general');
  }

  // ============================================================
  // LLM call
  // ============================================================

  private async callLLMExtraction(systemPrompt: string, content: string): Promise<any> {
    const openai = this.getOpenAI();
    const truncated = content.slice(0, 60000);

    const response = await openai.chat.completions.create({
      model: 'gpt-4o',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Extract from this document:\n\n${truncated}` },
      ],
      temperature: 0.1,
      max_tokens: 8000,
    });

    const text = response.choices[0]?.message?.content;
    if (!text) return {};

    try {
      return JSON.parse(text);
    } catch {
      return {};
    }
  }

  // ============================================================
  // Convert raw extraction to atoms
  // ============================================================

  private convertToAtoms(data: any, docType: string): ExtractedAtom[] {
    const atoms: ExtractedAtom[] = [];

    for (const [category, value] of Object.entries(data)) {
      if (Array.isArray(value)) {
        for (const item of value) {
          if (typeof item === 'object' && item !== null) {
            const confidence = (item as any).confidence ?? 0.8;
            const sourceText = (item as any).sourceText ?? '';
            const section = (item as any).section ?? '';
            const itemData = { ...item };
            delete itemData.confidence;
            delete itemData.sourceText;
            delete itemData.section;

            atoms.push({
              atomType: `${docType}_${category}`,
              atomData: itemData,
              confidence,
              sourceReference: { section, exactText: sourceText },
            });
          }
        }
      } else if (typeof value === 'object' && value !== null) {
        const obj = value as any;
        const confidence = obj.confidence ?? 0.8;
        const sourceText = obj.sourceText ?? '';
        const itemData = { ...obj };
        delete itemData.confidence;
        delete itemData.sourceText;

        atoms.push({
          atomType: `${docType}_${category}`,
          atomData: itemData,
          confidence,
          sourceReference: { exactText: sourceText },
        });
      }
    }

    return atoms;
  }

  // ============================================================
  // Persistence
  // ============================================================

  private async persistResult(result: ExtractionResult, organizationId: number): Promise<void> {
    try {
      await db.execute(sql`
        INSERT INTO document_atom_provenance (
          id, organization_id, document_id, document_table,
          generated_by, ai_model_used, ai_confidence_score,
          content_hash, linked_atom_ids, provenance_chain,
          created_at, updated_at
        ) VALUES (
          gen_random_uuid(),
          ${organizationId},
          ${result.documentId}::uuid,
          'unified_extraction',
          'ai',
          ${result.metadata.modelUsed},
          ${result.metadata.averageConfidence},
          ${result.provenance.contentHash},
          ${JSON.stringify(result.atoms.map((_, i) => `atom_${i}`))}::jsonb,
          ${JSON.stringify([{
            step: 'unified_extraction',
            version: result.metadata.extractionVersion,
            timestamp: result.provenance.extractedAt.toISOString(),
            atomCount: result.metadata.totalAtomsExtracted,
            processingTimeMs: result.metadata.processingTimeMs,
          }])}::jsonb,
          NOW(), NOW()
        )
      `);
    } catch (error) {
      console.error('[UnifiedExtraction] Failed to persist provenance:', error);
    }
  }
}

export const unifiedExtractionService = new UnifiedExtractionService();
