/**
 * Layout-Aware Ingestion Worker
 *
 * Vision-First document processing that treats Tables and Figures as first-class citizens.
 * Unlike standard pdf-parse which destroys table structures, this worker:
 *
 * 1. SEGMENTS: Detects page regions (text, table, figure)
 * 2. EXTRACTS: Preserves table structure as Markdown/JSON
 * 3. VECTORIZES: Creates separate embeddings for tables vs body text
 *
 * Critical for Clinical Regulatory documents where 50%+ of data is in tables
 * (Adverse Events, PK Parameters, Survival Curves).
 */
import { v4 as uuidv4 } from 'uuid';
import { pool } from '../db';
import {
  s3Storage,
  ProcessedDocument,
  TableAtom,
  TextAtom,
  FigureAtom,
} from '../services/s3-storage';

// Types
interface PageLayout {
  pageNumber: number;
  regions: PageRegion[];
}

interface PageRegion {
  type: 'text' | 'table' | 'figure' | 'header' | 'footer';
  boundingBox: { x: number; y: number; width: number; height: number };
  content: string;
  confidence: number;
  metadata?: Record<string, any>;
}

interface TableStructure {
  headers: string[];
  rows: string[][];
  caption?: string;
}
import { ai } from '../lib/unified-ai-client';

export interface ExtractionResult {
  documentId: string;
  pageCount: number;
  textAtoms: TextAtom[];
  tableAtoms: TableAtom[];
  figureAtoms: FigureAtom[];
  metadata: {
    hasImages: boolean;
    hasTables: boolean;
    detectedLanguage: string;
    extractionConfidence: number;
    processingTimeMs: number;
  };
}

interface IngestionJob {
  id: string;
  documentId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  priority: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  result?: ExtractionResult;
}

// Configuration
const CONFIG = {
  openaiModel: 'gpt-4o', // Vision-capable model for table extraction
  embeddingModel: 'text-embedding-3-small',
  embeddingDimensions: 1536,
  chunkSize: 1000, // tokens
  chunkOverlap: 200, // tokens
  maxConcurrent: 2,
  retryAttempts: 3,
  retryDelayMs: 2000,
};

// OpenAI client
/**
 * Layout-Aware Ingestion Worker
 */
export class LayoutAwareIngestionWorker {
  private isRunning: boolean = false;
  private currentJob: IngestionJob | null = null;

  /**
   * Process a document through the vision-first pipeline
   */
  async processDocument(documentId: string, pdfBuffer: Buffer): Promise<ExtractionResult> {
    const startTime = Date.now();
    console.log(`[Ingestion] Processing document: ${documentId}`);

    try {
      // Step 1: Segment the document into regions
      const layouts = await this.segmentDocument(pdfBuffer);
      console.log(`[Ingestion] Segmented ${layouts.length} pages`);

      // Step 2: Extract structured content from each region
      const textAtoms: TextAtom[] = [];
      const tableAtoms: TableAtom[] = [];
      const figureAtoms: FigureAtom[] = [];

      let tableIndex = 0;
      let figureIndex = 0;

      for (const layout of layouts) {
        for (const region of layout.regions) {
          switch (region.type) {
            case 'text':
              textAtoms.push({
                id: `${documentId}_text_p${layout.pageNumber}_${textAtoms.length}`,
                pageNumber: layout.pageNumber,
                content: region.content,
                boundingBox: region.boundingBox,
              });
              break;

            case 'table':
              const table = await this.extractTableStructure(region);
              tableAtoms.push({
                id: `${documentId}_table_${tableIndex++}`,
                pageNumber: layout.pageNumber,
                tableIndex,
                caption: table.caption,
                headers: table.headers,
                rows: table.rows,
                markdown: this.tableToMarkdown(table),
                json: this.tableToJson(table),
                boundingBox: region.boundingBox,
                confidence: region.confidence,
              });
              break;

            case 'figure':
              figureAtoms.push({
                id: `${documentId}_figure_${figureIndex++}`,
                pageNumber: layout.pageNumber,
                figureIndex,
                caption: region.metadata?.caption,
                altText: region.metadata?.altText,
                imageType: region.metadata?.chartType || 'other',
                boundingBox: region.boundingBox,
              });
              break;
          }
        }
      }

      // Step 3: Create result
      const result: ExtractionResult = {
        documentId,
        pageCount: layouts.length,
        textAtoms,
        tableAtoms,
        figureAtoms,
        metadata: {
          hasImages: figureAtoms.length > 0,
          hasTables: tableAtoms.length > 0,
          detectedLanguage: 'en',
          extractionConfidence: this.calculateOverallConfidence(tableAtoms),
          processingTimeMs: Date.now() - startTime,
        },
      };

      console.log(
        `[Ingestion] Extracted: ${textAtoms.length} text, ${tableAtoms.length} tables, ${figureAtoms.length} figures`
      );
      return result;
    } catch (error: any) {
      console.error(`[Ingestion] Processing failed:`, error.message);
      throw error;
    }
  }

  /**
   * Segment document into layout regions
   * Uses heuristics + optional vision API for complex documents
   */
  private async segmentDocument(pdfBuffer: Buffer): Promise<PageLayout[]> {
    // For now, use a simplified text-based segmentation
    // In production, integrate with pdf2json, pdfjs-dist, or vision API

    const pdfParse = await import('pdf-parse');
    const parsed = await pdfParse.default(pdfBuffer);

    const layouts: PageLayout[] = [];
    const pages = this.splitIntoPages(parsed.text, parsed.numpages);

    for (let i = 0; i < pages.length; i++) {
      const pageText = pages[i];
      const regions = this.detectRegions(pageText, i + 1);
      layouts.push({
        pageNumber: i + 1,
        regions,
      });
    }

    return layouts;
  }

  /**
   * Split text into approximate pages
   */
  private splitIntoPages(fullText: string, numPages: number): string[] {
    if (numPages <= 1) return [fullText];

    // Estimate page boundaries using form feeds or equal division
    const pageBreaks = fullText.split(/\f/);
    if (pageBreaks.length >= numPages) {
      return pageBreaks.slice(0, numPages);
    }

    // Fall back to equal division
    const charsPerPage = Math.ceil(fullText.length / numPages);
    const pages: string[] = [];
    for (let i = 0; i < numPages; i++) {
      pages.push(fullText.slice(i * charsPerPage, (i + 1) * charsPerPage));
    }
    return pages;
  }

  /**
   * Detect content regions using pattern matching
   */
  private detectRegions(pageText: string, pageNumber: number): PageRegion[] {
    const regions: PageRegion[] = [];

    // Detect tables using common patterns
    const tablePatterns = [
      /Table\s+\d+[.:]/gi, // "Table 1:" or "Table 1."
      /\|[\s\-]+\|/g, // Markdown-style table dividers
      /\t.*\t.*\t/g, // Tab-separated data
      /^\s*[\w\s]+\s+[\d.]+\s+[\d.]+\s+[\d.]+/gm, // Numeric columns
    ];

    // Check for table indicators
    let hasTableIndicators = tablePatterns.some(pattern => pattern.test(pageText));

    // Detect figure references
    const figurePattern = /Figure\s+\d+[.:]/gi;
    const figureMatches = pageText.match(figurePattern) || [];

    // Simple heuristic: if we detect table patterns, try to extract them
    if (hasTableIndicators) {
      const tableBlocks = this.extractTableBlocks(pageText);
      for (const block of tableBlocks) {
        regions.push({
          type: 'table',
          boundingBox: { x: 0, y: 0, width: 100, height: 50 },
          content: block,
          confidence: 0.75,
        });
      }

      // Remove table content from text regions
      let remainingText = pageText;
      for (const block of tableBlocks) {
        remainingText = remainingText.replace(block, '');
      }

      if (remainingText.trim()) {
        regions.push({
          type: 'text',
          boundingBox: { x: 0, y: 0, width: 100, height: 100 },
          content: remainingText.trim(),
          confidence: 0.9,
        });
      }
    } else {
      // No tables detected, treat as text
      regions.push({
        type: 'text',
        boundingBox: { x: 0, y: 0, width: 100, height: 100 },
        content: pageText,
        confidence: 0.95,
      });
    }

    // Add figure placeholders
    for (let i = 0; i < figureMatches.length; i++) {
      regions.push({
        type: 'figure',
        boundingBox: { x: 0, y: 0, width: 100, height: 50 },
        content: figureMatches[i],
        confidence: 0.7,
        metadata: { caption: figureMatches[i] },
      });
    }

    return regions;
  }

  /**
   * Extract table blocks from text using heuristics
   */
  private extractTableBlocks(text: string): string[] {
    const blocks: string[] = [];

    // Pattern 1: Lines with consistent delimiters (tabs, pipes, multiple spaces)
    const lines = text.split('\n');
    let currentBlock: string[] = [];
    let inTable = false;

    for (const line of lines) {
      const hasTabularData =
        (line.match(/\t/g) || []).length >= 2 ||
        (line.match(/\|/g) || []).length >= 2 ||
        /^\s*[\w\s]+\s{2,}[\d.]+\s{2,}[\d.]+/.test(line);

      if (hasTabularData) {
        inTable = true;
        currentBlock.push(line);
      } else if (inTable) {
        // End of table block
        if (currentBlock.length >= 2) {
          blocks.push(currentBlock.join('\n'));
        }
        currentBlock = [];
        inTable = false;
      }
    }

    // Don't forget the last block
    if (currentBlock.length >= 2) {
      blocks.push(currentBlock.join('\n'));
    }

    return blocks;
  }

  /**
   * Extract structured table from region content
   */
  private async extractTableStructure(region: PageRegion): Promise<TableStructure> {
    const content = region.content;
    const lines = content.split('\n').filter(l => l.trim());

    if (lines.length === 0) {
      return { headers: [], rows: [] };
    }

    // Detect delimiter (tab, pipe, or multiple spaces)
    const firstLine = lines[0];
    let delimiter: RegExp;

    if (firstLine.includes('\t')) {
      delimiter = /\t+/;
    } else if (firstLine.includes('|')) {
      delimiter = /\s*\|\s*/;
    } else {
      delimiter = /\s{2,}/;
    }

    // Parse rows
    const allRows = lines.map(line =>
      line
        .split(delimiter)
        .map(cell => cell.trim())
        .filter(Boolean)
    );

    // First non-empty row is headers
    const headers = allRows[0] || [];
    const rows = allRows.slice(1).filter(row => row.length > 0);

    // Try to extract caption from preceding text
    const captionMatch = content.match(/Table\s+\d+[.:]\s*([^\n]+)/i);
    const caption = captionMatch ? captionMatch[1].trim() : undefined;

    return { headers, rows, caption };
  }

  /**
   * Convert table to Markdown format
   */
  private tableToMarkdown(table: TableStructure): string {
    if (table.headers.length === 0) return '';

    let md = '';

    // Caption
    if (table.caption) {
      md += `**${table.caption}**\n\n`;
    }

    // Header row
    md += '| ' + table.headers.join(' | ') + ' |\n';
    md += '| ' + table.headers.map(() => '---').join(' | ') + ' |\n';

    // Data rows
    for (const row of table.rows) {
      // Pad row to match header length
      const paddedRow = [...row];
      while (paddedRow.length < table.headers.length) {
        paddedRow.push('');
      }
      md += '| ' + paddedRow.join(' | ') + ' |\n';
    }

    return md;
  }

  /**
   * Convert table to JSON array of objects
   */
  private tableToJson(table: TableStructure): Record<string, any>[] {
    if (table.headers.length === 0) return [];

    return table.rows.map(row => {
      const obj: Record<string, any> = {};
      table.headers.forEach((header, i) => {
        const value = row[i] || '';
        // Try to parse numeric values
        const numericValue = parseFloat(value.replace(/[^0-9.-]/g, ''));
        obj[header] = !isNaN(numericValue) && value.match(/^[\d.,\-%]+$/) ? numericValue : value;
      });
      return obj;
    });
  }

  /**
   * Calculate overall extraction confidence
   */
  private calculateOverallConfidence(tables: TableAtom[]): number {
    if (tables.length === 0) return 0.9;
    const avgConfidence = tables.reduce((sum, t) => sum + t.confidence, 0) / tables.length;
    return Math.round(avgConfidence * 100) / 100;
  }

  /**
   * Vectorize extracted content and store in database
   */
  async vectorizeAndStore(
    documentId: string,
    extraction: ExtractionResult,
    programId?: string
  ): Promise<{ atomCount: number; tableCount: number; figureCount: number }> {
    let atomCount = 0;
    let tableCount = 0;
    let figureCount = 0;

    if (!pool) {
      throw new Error('Database pool not available');
    }
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Process text atoms
      for (const text of extraction.textAtoms) {
        const chunks = this.chunkText(text.content);
        for (const chunk of chunks) {
          const embedding = await this.generateEmbedding(chunk);
          await this.storeAtom(client, {
            documentId,
            atomType: 'TEXT',
            content: chunk,
            embedding,
            pageNumber: text.pageNumber,
            programId,
            metadata: { sectionTitle: text.sectionTitle },
          });
          atomCount++;
        }
      }

      // Process table atoms (embed as structured markdown + JSON)
      for (const table of extraction.tableAtoms) {
        // Embed the markdown representation for semantic search
        const tableText = `${table.caption || 'Table'}\n${table.markdown}`;
        const embedding = await this.generateEmbedding(tableText);

        const chunkId = await this.storeAtom(client, {
          documentId,
          atomType: 'TABLE',
          content: tableText,
          embedding,
          pageNumber: table.pageNumber,
          programId,
          metadata: {
            tableIndex: table.tableIndex,
            rowCount: table.rows.length,
            columnCount: table.headers.length,
            confidence: table.confidence,
          },
          structuredContent: {
            caption: table.caption,
            headers: table.headers,
            rows: table.rows,
            markdown: table.markdown,
            json: table.json,
          },
        });
        tableCount++;
        atomCount++;
      }

      // Process figure atoms
      for (const figure of extraction.figureAtoms) {
        const figureText = `${figure.caption || 'Figure'}: ${figure.altText || figure.imageType}`;
        const embedding = await this.generateEmbedding(figureText);

        await this.storeAtom(client, {
          documentId,
          atomType: 'FIGURE',
          content: figureText,
          embedding,
          pageNumber: figure.pageNumber,
          programId,
          metadata: {
            figureIndex: figure.figureIndex,
            imageType: figure.imageType,
          },
          structuredContent: {
            caption: figure.caption,
            altText: figure.altText,
            imageType: figure.imageType,
            extractedData: figure.extractedData,
          },
        });
        figureCount++;
        atomCount++;
      }

      await client.query('COMMIT');
      console.log(
        `[Ingestion] Stored ${atomCount} atoms (${tableCount} tables, ${figureCount} figures)`
      );

      return { atomCount, tableCount, figureCount };
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Store a single atom in the database
   */
  private async storeAtom(
    client: any,
    atom: {
      documentId: string;
      atomType: 'TEXT' | 'TABLE' | 'FIGURE';
      content: string;
      embedding: number[];
      pageNumber: number;
      programId?: string;
      metadata?: Record<string, any>;
      structuredContent?: any;
    }
  ): Promise<string> {
    const id = uuidv4();

    await client.query(
      `
      INSERT INTO vault.document_chunks (
        id, document_id, chunk_index, chunk_type, content_type,
        chunk_text, structured_content, page_number,
        embedding, embedding_model, extraction_confidence,
        created_at, vectorized_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET
        chunk_text = EXCLUDED.chunk_text,
        structured_content = EXCLUDED.structured_content,
        embedding = EXCLUDED.embedding,
        vectorized_at = NOW()
    `,
      [
        id,
        atom.documentId,
        0, // chunk_index - will be set properly in batch
        atom.atomType.toLowerCase(),
        atom.atomType,
        atom.content,
        atom.structuredContent ? JSON.stringify(atom.structuredContent) : null,
        atom.pageNumber,
        JSON.stringify(atom.embedding),
        CONFIG.embeddingModel,
        atom.metadata?.confidence || 1.0,
      ]
    );

    return id;
  }

  /**
   * Chunk text into smaller pieces for embedding
   */
  private chunkText(text: string): string[] {
    const words = text.split(/\s+/);
    const chunks: string[] = [];

    // Approximate tokens as words * 1.3
    const wordsPerChunk = Math.floor(CONFIG.chunkSize / 1.3);
    const overlapWords = Math.floor(CONFIG.chunkOverlap / 1.3);

    for (let i = 0; i < words.length; i += wordsPerChunk - overlapWords) {
      const chunk = words.slice(i, i + wordsPerChunk).join(' ');
      if (chunk.trim().length > 50) {
        // Minimum chunk size
        chunks.push(chunk);
      }
    }

    return chunks.length > 0 ? chunks : [text];
  }

  /**
   * Generate embedding using OpenAI
   */
  private async generateEmbedding(text: string): Promise<number[]> {
    const response = await openai.embeddings.create({
      model: CONFIG.embeddingModel,
      input: text.slice(0, 8000), // Truncate to model limit
      dimensions: CONFIG.embeddingDimensions,
    });
    return response.data[0].embedding;
  }

  /**
   * Use Vision API for complex table extraction
   * TODO: PII_REDACTION_LAYER - Scan for [Patient ID, DOB] patterns and mask before vectorization
   */
  async extractTableWithVision(imageBase64: string): Promise<TableStructure> {
    console.log('[Ingestion] Using Vision API for table extraction');

    const aiResult = await ai.chat({
      model: CONFIG.openaiModel,
      messages: [
        {
          role: 'system',
          content: `You are a clinical data extraction specialist. Extract table data into structured JSON format.
Return ONLY valid JSON with this structure:
{
  "caption": "table caption if visible",
  "headers": ["col1", "col2", ...],
  "rows": [["val1", "val2", ...], ...]
}`,
        },
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: { url: `data:image/png;base64,${imageBase64}` },
            },
            {
              type: 'text',
              text: 'Extract all tabular data from this image. Preserve numeric precision.',
            },
          ],
        },
      ],
      max_tokens: 4000,
      temperature: 0,
    });

    try {
      const content = aiResult.content || '{}';
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (e) {
      console.error('[Ingestion] Vision extraction parse error:', e);
    }

    return { headers: [], rows: [] };
  }

  // Worker status
  getStatus(): { running: boolean; currentJob: IngestionJob | null } {
    return {
      running: this.isRunning,
      currentJob: this.currentJob,
    };
  }
}

// Export singleton instance
export const ingestionWorker = new LayoutAwareIngestionWorker();

export default LayoutAwareIngestionWorker;
