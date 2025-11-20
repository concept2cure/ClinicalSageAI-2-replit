import { academicKnowledgeTracker } from './academic-knowledge-tracker';
import { AcademicDocument } from 'shared/schema';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Academic Knowledge Service
 *
 * This service provides higher-level knowledge management capabilities including:
 * - Document analysis and knowledge extraction
 * - Vector embedding generation
 * - Regulatory and academic knowledge fusion
 * - Citation and reference management
 * - Smart academic knowledge retrieval
 */
export class AcademicKnowledgeService {
  /**
   * Initialize academic knowledge from existing files
   *
   * @param directoryPath Path to academic resources
   * @returns Summary of imported knowledge
   */
  async initializeFromExistingFiles(directoryPath: string): Promise<{
    processed: number;
    skipped: number;
    errors: string[];
  }> {
    const result = {
      processed: 0,
      skipped: 0,
      errors: [] as string[],
    };

    try {
      if (!fs.existsSync(directoryPath)) {
        console.error(`Directory does not exist: ${directoryPath}`);
        result.errors.push(`Directory does not exist: ${directoryPath}`);
        return result;
      }

      const files = fs.readdirSync(directoryPath);
      const pdfFiles = files.filter(file => file.toLowerCase().endsWith('.pdf'));

      console.log(`Found ${pdfFiles.length} PDF files to process`);

      for (const file of pdfFiles) {
        try {
          const filePath = path.join(directoryPath, file);
          const fileName = path.basename(file);

          // Check if already in the database
          const existingResources = await academicKnowledgeTracker.getTrackedResources({
            query: fileName,
          });

          if (existingResources.resources.some(r => r.title === fileName)) {
            console.log(`Skipping already processed file: ${fileName}`);
            result.skipped++;
            continue;
          }

          // Process new file
          console.log(`Processing ${fileName}...`);

          // For now, just add basic metadata, a more sophisticated processor would extract text, etc.
          const resource = await academicKnowledgeTracker.addResource({
            title: fileName,
            authors: 'Unknown', // Would be extracted in a full implementation
            resourceType: 'academic_paper',
            source: 'imported',
            url: filePath,
            category: 'clinical_trials',
            summary: `Imported from ${fileName}`,
            publishedDate: null, // Would be extracted in a full implementation
          });

          result.processed++;
        } catch (error) {
          console.error(`Error processing file ${file}:`, error);
          result.errors.push(
            `Error processing ${file}: ${error instanceof Error ? error.message : String(error)}`
          );
        }
      }

      return result;
    } catch (error) {
      console.error('Error initializing academic knowledge:', error);
      result.errors.push(
        `Error initializing academic knowledge: ${error instanceof Error ? error.message : String(error)}`
      );
      return result;
    }
  }

  /**
   * Process and import a single academic document
   *
   * @param document Academic document to process
   * @returns Processed resource ID
   */
  async processAcademicDocument(document: AcademicDocument): Promise<number> {
    try {
      // 1. Extract metadata and store resource
      const resource = await academicKnowledgeTracker.addResource({
        title: document.title,
        authors: document.authors,
        resourceType: document.resourceType,
        source: document.source,
        url: document.url || null,
        category: document.category,
        summary: document.summary || null,
        publishedDate: document.publishedDate ? new Date(document.publishedDate) : null,
      });

      // 2. In a full implementation, we would:
      // - Extract full text content
      // - Generate embeddings
      // - Extract key insights
      // - Process citations and references
      // - Store embeddings using academicKnowledgeTracker.storeEmbedding()

      return resource.id;
    } catch (error) {
      console.error('Error processing academic document:', error);
      throw new Error(
        `Failed to process academic document: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Retrieve relevant knowledge for a specific topic
   *
   * @param query Search query
   * @param embeddings Vector embeddings for the query
   * @param filter Optional filters
   * @returns Relevant academic resources
   */
  async retrieveKnowledge(
    query: string,
    embeddings: number[],
    filter?: {
      resourceType?: string;
      category?: string;
      similarityThreshold?: number;
      limit?: number;
    }
  ) {
    try {
      // Perform semantic search in the knowledge base
      const results = await academicKnowledgeTracker.searchKnowledge(
        query,
        embeddings,
        filter?.similarityThreshold || 0.7,
        filter?.limit || 10
      );

      return results;
    } catch (error) {
      console.error('Error retrieving academic knowledge:', error);
      throw new Error(
        `Failed to retrieve academic knowledge: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Get academic knowledge statistics
   *
   * @returns Statistical summary of academic knowledge
   */
  async getKnowledgeStatistics() {
    try {
      return await academicKnowledgeTracker.getKnowledgeStats();
    } catch (error) {
      console.error('Error getting academic knowledge statistics:', error);
      throw new Error(
        `Failed to get academic knowledge statistics: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  /**
   * Delete an academic resource
   *
   * @param resourceId ID of the resource to delete
   * @returns Success status
   */
  async deleteResource(resourceId: number): Promise<boolean> {
    try {
      return await academicKnowledgeTracker.deleteResource(resourceId);
    } catch (error) {
      console.error('Error deleting academic resource:', error);
      throw new Error(
        `Failed to delete academic resource: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }
}

export const academicKnowledgeService = new AcademicKnowledgeService();
