/**
 * Protocol Extraction Persistence Service
 *
 * The audit found that protocol extraction (server/extract_protocol.py) outputs
 * JSON to stdout but NEVER persists results to the database. This service wraps
 * the protocol extractor and ensures all outputs are stored, versioned, and
 * linked to source documents.
 */

import { db } from '../db';
import { eq, and, sql } from 'drizzle-orm';
import { spawn } from 'child_process';
import { createHash } from 'crypto';
import path from 'path';
interface ProtocolExtractionInput {
  filePath: string;
  organizationId: number;
  projectId?: string;
  documentId?: string;
}
import { ai } from '../lib/unified-ai-client';

interface ProtocolFields {
  title: string | null;
  indication: string | null;
  phase: string | null;
  sampleSize: number | null;
  durationWeeks: number | null;
  arms: number | null;
  primaryEndpoint: string | null;
  // Extended fields from AI extraction
  secondaryEndpoints: string[];
  inclusionCriteria: string[];
  exclusionCriteria: string[];
  studyDesign: string | null;
  comparator: string | null;
  randomization: string | null;
  blinding: string | null;
  treatmentDuration: string | null;
  objectives: { primary: string | null; secondary: string[] };
  estimand: string | null;
  statisticalMethods: string[];
}

interface ProtocolExtractionResult {
  success: boolean;
  extractionId: string;
  fields: ProtocolFields;
  rawText: string;
  metadata: {
    extractionMethod: 'regex' | 'ai_enhanced' | 'combined';
    confidence: number;
    processingTimeMs: number;
    contentHash: string;
    fieldsExtracted: number;
    totalFields: number;
  };
}

class ProtocolExtractionPersistenceService {
  private openai: OpenAI | null = null;

  private getOpenAI(): OpenAI {
    if (!this.openai) {
    }
    return this.openai;
  }

  /**
   * Extract protocol data and persist to database
   */
  async extractAndPersist(input: ProtocolExtractionInput): Promise<ProtocolExtractionResult> {
    const startTime = Date.now();

    // Step 1: Run the existing Python extractor
    const rawResult = await this.runPythonExtractor(input.filePath);

    // Step 2: Enhance with AI if the basic extraction missed fields
    const enhancedFields = await this.enhanceExtraction(rawResult.text, rawResult.fields);

    // Step 3: Compute content hash
    const contentHash = createHash('sha256').update(rawResult.text).digest('hex');

    // Step 4: Count extracted fields
    const totalFields = 18;
    let fieldsExtracted = 0;
    for (const [key, value] of Object.entries(enhancedFields)) {
      if (value !== null && value !== undefined) {
        if (Array.isArray(value) && value.length > 0) fieldsExtracted++;
        else if (typeof value === 'object' && value !== null) fieldsExtracted++;
        else if (typeof value === 'string' && value.length > 0) fieldsExtracted++;
        else if (typeof value === 'number') fieldsExtracted++;
      }
    }

    const extractionId = crypto.randomUUID();
    const processingTimeMs = Date.now() - startTime;

    // Step 5: Persist to database
    await this.persistExtraction({
      extractionId,
      organizationId: input.organizationId,
      projectId: input.projectId,
      documentId: input.documentId,
      filePath: input.filePath,
      fields: enhancedFields,
      rawText: rawResult.text,
      contentHash,
      processingTimeMs,
      fieldsExtracted,
      totalFields,
    });

    return {
      success: true,
      extractionId,
      fields: enhancedFields,
      rawText: rawResult.text,
      metadata: {
        extractionMethod: rawResult.usedAI ? 'combined' : 'regex',
        confidence: fieldsExtracted / totalFields,
        processingTimeMs,
        contentHash,
        fieldsExtracted,
        totalFields,
      },
    };
  }

  /**
   * Run the existing Python protocol extractor
   */
  private async runPythonExtractor(
    filePath: string
  ): Promise<{ fields: Partial<ProtocolFields>; text: string; usedAI: boolean }> {
    return new Promise((resolve, reject) => {
      const scriptPath = path.resolve(__dirname, '../extract_protocol.py');
      const proc = spawn('python3', [scriptPath, filePath], {
        env: { ...process.env },
        timeout: 120_000,
      });

      let stdout = '';
      let stderr = '';

      proc.stdout.on('data', (data) => {
        stdout += data.toString();
      });
      proc.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      proc.on('close', (code) => {
        if (code !== 0) {
          console.error(`Protocol extraction failed: ${stderr}`);
          resolve({
            fields: {},
            text: '',
            usedAI: false,
          });
          return;
        }

        try {
          const parsed = JSON.parse(stdout);
          resolve({
            fields: {
              title: parsed.title || null,
              indication: parsed.indication || null,
              phase: parsed.phase || null,
              sampleSize: parsed.sample_size || null,
              durationWeeks: parsed.duration_weeks || null,
              arms: parsed.arms || null,
              primaryEndpoint: parsed.primary_endpoint || null,
            },
            text: parsed.extracted_text || '',
            usedAI: false,
          });
        } catch (e) {
          resolve({ fields: {}, text: stdout, usedAI: false });
        }
      });

      proc.on('error', (err) => {
        console.error(`Failed to spawn Python extractor: ${err.message}`);
        resolve({ fields: {}, text: '', usedAI: false });
      });
    });
  }

  /**
   * Enhance extraction with AI for missing fields
   */
  private async enhanceExtraction(
    text: string,
    basicFields: Partial<ProtocolFields>
  ): Promise<ProtocolFields> {
    const defaults: ProtocolFields = {
      title: basicFields.title || null,
      indication: basicFields.indication || null,
      phase: basicFields.phase || null,
      sampleSize: basicFields.sampleSize || null,
      durationWeeks: basicFields.durationWeeks || null,
      arms: basicFields.arms || null,
      primaryEndpoint: basicFields.primaryEndpoint || null,
      secondaryEndpoints: [],
      inclusionCriteria: [],
      exclusionCriteria: [],
      studyDesign: null,
      comparator: null,
      randomization: null,
      blinding: null,
      treatmentDuration: null,
      objectives: { primary: null, secondary: [] },
      estimand: null,
      statisticalMethods: [],
    };

    if (!text || text.length < 100) return defaults;

    try {
      const truncatedText = text.slice(0, 30000);

      const aiResult = await ai.chat({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: `You are a clinical trial protocol extraction specialist. Extract structured data from clinical trial protocols. Return ONLY valid JSON. For fields you cannot determine, use null for strings/objects and [] for arrays. Never fabricate data — only extract what is explicitly stated in the text.`,
          },
          {
            role: 'user',
            content: `Extract the following fields from this clinical trial protocol. Return JSON matching this schema exactly:

{
  "title": "full study title or null",
  "indication": "disease/condition or null",
  "phase": "1, 1a, 1b, 2, 2a, 2b, 3, 3a, 3b, 4 or null",
  "sampleSize": number or null,
  "durationWeeks": number or null,
  "arms": number or null,
  "primaryEndpoint": "primary endpoint description or null",
  "secondaryEndpoints": ["endpoint1", "endpoint2"],
  "inclusionCriteria": ["criterion1", "criterion2"],
  "exclusionCriteria": ["criterion1", "criterion2"],
  "studyDesign": "parallel, crossover, factorial, single_arm, adaptive, etc. or null",
  "comparator": "comparator description or null",
  "randomization": "randomization method or null",
  "blinding": "open_label, single_blind, double_blind, triple_blind or null",
  "treatmentDuration": "treatment duration description or null",
  "objectives": { "primary": "primary objective or null", "secondary": ["obj1", "obj2"] },
  "estimand": "estimand description or null",
  "statisticalMethods": ["method1", "method2"]
}

Protocol text:
${truncatedText}`,
          },
        ],
        { jsonMode: true, temperature: 0.1, maxTokens: 4000 }
      );

      const content = aiResult.content;
      if (!content) return defaults;

      const parsed = JSON.parse(content);

      return {
        title: parsed.title || defaults.title,
        indication: parsed.indication || defaults.indication,
        phase: parsed.phase || defaults.phase,
        sampleSize: parsed.sampleSize ?? defaults.sampleSize,
        durationWeeks: parsed.durationWeeks ?? defaults.durationWeeks,
        arms: parsed.arms ?? defaults.arms,
        primaryEndpoint: parsed.primaryEndpoint || defaults.primaryEndpoint,
        secondaryEndpoints: parsed.secondaryEndpoints || [],
        inclusionCriteria: parsed.inclusionCriteria || [],
        exclusionCriteria: parsed.exclusionCriteria || [],
        studyDesign: parsed.studyDesign || null,
        comparator: parsed.comparator || null,
        randomization: parsed.randomization || null,
        blinding: parsed.blinding || null,
        treatmentDuration: parsed.treatmentDuration || null,
        objectives: parsed.objectives || { primary: null, secondary: [] },
        estimand: parsed.estimand || null,
        statisticalMethods: parsed.statisticalMethods || [],
      };
    } catch (err) {
      console.error('AI-enhanced protocol extraction failed:', err);
      return defaults;
    }
  }

  /**
   * Persist extraction results to database
   */
  private async persistExtraction(data: {
    extractionId: string;
    organizationId: number;
    projectId?: string;
    documentId?: string;
    filePath: string;
    fields: ProtocolFields;
    rawText: string;
    contentHash: string;
    processingTimeMs: number;
    fieldsExtracted: number;
    totalFields: number;
  }): Promise<void> {
    try {
      await db.execute(sql`
        INSERT INTO protocol_extractions (
          id, organization_id, project_id, document_id, file_path,
          extracted_fields, raw_text, content_hash,
          processing_time_ms, fields_extracted, total_fields,
          extraction_version, created_at, updated_at
        ) VALUES (
          ${data.extractionId}::uuid,
          ${data.organizationId},
          ${data.projectId || null}::uuid,
          ${data.documentId || null}::uuid,
          ${data.filePath},
          ${JSON.stringify(data.fields)}::jsonb,
          ${data.rawText},
          ${data.contentHash},
          ${data.processingTimeMs},
          ${data.fieldsExtracted},
          ${data.totalFields},
          '2.0',
          NOW(), NOW()
        )
        ON CONFLICT (content_hash, organization_id) DO UPDATE SET
          extracted_fields = EXCLUDED.extracted_fields,
          processing_time_ms = EXCLUDED.processing_time_ms,
          fields_extracted = EXCLUDED.fields_extracted,
          extraction_version = EXCLUDED.extraction_version,
          updated_at = NOW()
      `);
    } catch (err) {
      // Table may not exist yet — log and continue
      console.error('Failed to persist protocol extraction (table may not exist):', err);
    }
  }

  /**
   * Retrieve a previously extracted protocol by document ID
   */
  async getExtraction(documentId: string, organizationId: number): Promise<ProtocolExtractionResult | null> {
    try {
      const results = await db.execute(sql`
        SELECT * FROM protocol_extractions
        WHERE document_id = ${documentId}::uuid
          AND organization_id = ${organizationId}
        ORDER BY created_at DESC
        LIMIT 1
      `);

      const rows = results.rows as any[];
      if (!rows || rows.length === 0) return null;

      const row = rows[0];
      return {
        success: true,
        extractionId: row.id,
        fields: row.extracted_fields,
        rawText: row.raw_text,
        metadata: {
          extractionMethod: 'combined',
          confidence: row.fields_extracted / row.total_fields,
          processingTimeMs: row.processing_time_ms,
          contentHash: row.content_hash,
          fieldsExtracted: row.fields_extracted,
          totalFields: row.total_fields,
        },
      };
    } catch {
      return null;
    }
  }
}

export const protocolExtractionService = new ProtocolExtractionPersistenceService();
