/**
 * Enhanced Ingestion Pipeline
 * 
 * Upgrades the standard document ingestion to extract ENTITIES, not just text.
 * This is the bridge between document content and the Semantic Knowledge Graph.
 * 
 * Pipeline:
 * 1. Parse document (PDF/text)
 * 2. Extract text chunks as atoms
 * 3. Extract structured entities (LLM + regex patterns)
 * 4. Store entities linked to atoms
 * 5. Create graph edges for relationships
 */

import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';
import { ingestionWorker, ExtractionResult } from './layout-aware-ingestion';
import { 
  EntityExtractionWorker, 
  getEntityExtractionWorker, 
  ExtractedEntity 
} from './entity-extraction-worker';

export interface EnhancedIngestionResult extends ExtractionResult {
  entities: ExtractedEntity[];
  graphEdgesCreated: number;
  atomsCreated: number;
}

export class EnhancedIngestionPipeline {
  private pool: Pool;
  private entityExtractor: EntityExtractionWorker;

  constructor(pool: Pool) {
    this.pool = pool;
    this.entityExtractor = getEntityExtractionWorker(pool);
  }

  /**
   * Process document with full neuro-symbolic enrichment
   */
  async processDocument(
    documentId: string, 
    pdfBuffer: Buffer,
    metadata: {
      title?: string;
      documentType?: string;
      programId?: string;
      userId?: string;
    } = {}
  ): Promise<EnhancedIngestionResult> {
    console.log(`[EnhancedIngestion] Starting processing for ${documentId}`);
    const startTime = Date.now();

    // Step 1: Standard document extraction
    const baseResult = await ingestionWorker.processDocument(documentId, pdfBuffer);
    console.log(`[EnhancedIngestion] Base extraction complete: ${baseResult.textAtoms.length} text atoms`);

    // Step 2: Create data atoms in the database
    const atomIds: string[] = [];
    const combinedContent = baseResult.textAtoms.map(a => a.content).join('\n\n');

    // Create main document atom
    const mainAtomId = await this.createDataAtom({
      title: metadata.title || `Document ${documentId}`,
      content: combinedContent,
      atomType: 'DOCUMENT',
      sourceDocumentId: documentId,
      metadata: {
        pageCount: baseResult.pageCount,
        hasImages: baseResult.metadata.hasImages,
        hasTables: baseResult.metadata.hasTables,
        documentType: metadata.documentType,
      }
    });
    atomIds.push(mainAtomId);

    // Create table atoms
    for (const table of baseResult.tableAtoms) {
      const tableAtomId = await this.createDataAtom({
        title: table.caption || `Table ${table.tableIndex}`,
        content: table.markdown,
        atomType: 'TABLE',
        sourceDocumentId: documentId,
        parentAtomId: mainAtomId,
        metadata: {
          pageNumber: table.pageNumber,
          headers: table.headers,
          rowCount: table.rows.length,
        }
      });
      atomIds.push(tableAtomId);

      // Create PART_OF edge
      await this.createGraphEdge(tableAtomId, mainAtomId, 'PART_OF');
    }

    // Step 3: Extract entities from combined content
    console.log(`[EnhancedIngestion] Extracting entities...`);
    const extractionResult = await this.entityExtractor.extractEntities(mainAtomId, combinedContent);
    console.log(`[EnhancedIngestion] Extracted ${extractionResult.entities.length} entities`);

    // Step 4: Also extract with regex patterns for high-confidence matches
    const patternEntities = await this.entityExtractor.extractWithPatterns(combinedContent);
    console.log(`[EnhancedIngestion] Pattern extraction found ${patternEntities.length} additional entities`);

    // Merge and store pattern entities
    for (const entity of patternEntities) {
      await this.storeEntity(mainAtomId, entity);
    }

    // Step 5: Create graph edges based on entity relationships
    let edgesCreated = 0;
    
    // Link atoms that share the same NCT ID
    const nctIds = extractionResult.entities.filter(e => e.entityType === 'NCT_ID');
    for (const nct of nctIds) {
      // Find other atoms with the same NCT ID
      const relatedAtoms = await this.findAtomsByEntity('NCT_ID', nct.entityValue);
      for (const relatedAtom of relatedAtoms) {
        if (relatedAtom.atomId !== mainAtomId) {
          await this.createGraphEdge(mainAtomId, relatedAtom.atomId, 'RELATED_TO', {
            evidenceText: `Shared NCT ID: ${nct.entityValue}`
          });
          edgesCreated++;
        }
      }
    }

    // Create DERIVED_FROM edges for protocol amendments
    const amendments = extractionResult.entities.filter(e => e.entityType === 'AMENDMENT');
    for (const amendment of amendments) {
      // Try to find the parent protocol
      const protocols = await this.findAtomsByEntity('PROTOCOL_VERSION', amendment.entityValue);
      for (const protocol of protocols) {
        await this.createGraphEdge(mainAtomId, protocol.atomId, 'AMENDMENT_OF', {
          evidenceText: `Amendment of ${amendment.entityValue}`
        });
        edgesCreated++;
      }
    }

    const processingTimeMs = Date.now() - startTime;
    console.log(`[EnhancedIngestion] Complete in ${processingTimeMs}ms. Created ${atomIds.length} atoms, ${edgesCreated} edges`);

    return {
      ...baseResult,
      entities: [...extractionResult.entities, ...patternEntities],
      graphEdgesCreated: edgesCreated,
      atomsCreated: atomIds.length,
      metadata: {
        ...baseResult.metadata,
        processingTimeMs,
      }
    };
  }

  /**
   * Create a data atom in the lumen schema
   */
  private async createDataAtom(params: {
    title: string;
    content: string;
    atomType: string;
    sourceDocumentId: string;
    parentAtomId?: string;
    metadata?: Record<string, any>;
  }): Promise<string> {
    const atomId = uuidv4();
    
    await this.pool.query(
      `INSERT INTO lumen.data_atoms (
        id, title, content, atom_type, source_path, 
        metadata, content_hash, created_at
      ) VALUES ($1, $2, $3, $4, $5, $6, md5($3), NOW())`,
      [
        atomId,
        params.title,
        params.content,
        params.atomType,
        params.sourceDocumentId,
        params.metadata ? JSON.stringify(params.metadata) : '{}'
      ]
    );

    // Create parent relationship if specified
    if (params.parentAtomId) {
      await this.createGraphEdge(atomId, params.parentAtomId, 'PART_OF');
    }

    return atomId;
  }

  /**
   * Store an entity in the database
   */
  private async storeEntity(atomId: string, entity: ExtractedEntity): Promise<void> {
    await this.pool.query(
      `INSERT INTO lumen.entity_extractions (
        atom_id, entity_type, entity_value, normalized_value,
        confidence_score, source_span, numeric_value, unit,
        extraction_method
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'PATTERN')
      ON CONFLICT DO NOTHING`,
      [
        atomId,
        entity.entityType,
        entity.entityValue,
        entity.normalizedValue,
        entity.confidenceScore,
        entity.sourceSpan ? JSON.stringify(entity.sourceSpan) : null,
        entity.numericValue,
        entity.unit
      ]
    );
  }

  /**
   * Create a graph edge between atoms
   */
  private async createGraphEdge(
    sourceAtomId: string, 
    targetAtomId: string, 
    relationshipType: string,
    options: { evidenceText?: string; strength?: number } = {}
  ): Promise<void> {
    await this.pool.query(
      `INSERT INTO lumen.atom_relationships (
        source_atom_id, target_atom_id, relationship_type,
        strength, evidence_text, extraction_method
      ) VALUES ($1, $2, $3, $4, $5, 'INFERRED')
      ON CONFLICT (source_atom_id, target_atom_id, relationship_type) 
      WHERE is_active = TRUE DO NOTHING`,
      [
        sourceAtomId,
        targetAtomId,
        relationshipType,
        options.strength ?? 1.0,
        options.evidenceText
      ]
    );
  }

  /**
   * Find atoms by entity type and value
   */
  private async findAtomsByEntity(
    entityType: string, 
    entityValue: string
  ): Promise<{ atomId: string }[]> {
    const result = await this.pool.query(
      `SELECT DISTINCT atom_id FROM lumen.entity_extractions
       WHERE entity_type = $1 
       AND (entity_value = $2 OR normalized_value = $2)`,
      [entityType, entityValue]
    );
    return result.rows.map(r => ({ atomId: r.atom_id }));
  }
}

// Factory function
export function createEnhancedIngestionPipeline(pool: Pool): EnhancedIngestionPipeline {
  return new EnhancedIngestionPipeline(pool);
}
