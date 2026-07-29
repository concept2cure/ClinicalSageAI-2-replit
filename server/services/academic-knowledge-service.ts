import { huggingFaceService, HFModel } from '../huggingface-service';
import fs from 'fs';
import path from 'path';
import { createScopedLogger } from '../utils/logger.js';

const log = createScopedLogger('academic-knowledge');

interface AcademicPaper {
  id: string;
  title: string;
  authors: string[];
  abstract: string;
  publication: string;
  year: number;
  doi?: string;
  keywords: string[];
  fullText?: string;
  extractedInsights?: string[];
}

interface AcademicResource {
  id: string;
  title: string;
  type: 'paper' | 'guideline' | 'book' | 'report' | 'other';
  source: string;
  year: number;
  content: string;
  metadata: Record<string, any>;
}

interface SearchQuery {
  text: string;
  filters?: {
    yearRange?: [number, number];
    types?: string[];
    keywords?: string[];
  };
  limit?: number;
}

interface SearchResult {
  resource: AcademicResource;
  relevance: number;
  snippets: string[];
}

/**
 * Service for managing and querying academic knowledge
 */
export class AcademicKnowledgeService {
  private resources: AcademicResource[] = [];
  private resourcesIndexed: boolean = false;
  private academicDocsDir: string;

  constructor() {
    // Define the directory where academic resources are stored
    this.academicDocsDir = path.join(process.cwd(), 'academic_resources');

    // Create the directory if it doesn't exist
    if (!fs.existsSync(this.academicDocsDir)) {
      fs.mkdirSync(this.academicDocsDir, { recursive: true });
    }
  }

  /**
   * Initialize the academic knowledge base
   */
  async initialize(): Promise<void> {
    if (this.resourcesIndexed) {
      return;
    }

    try {
      log.debug('Initializing academic knowledge service...');

      // Load resources from the academic_resources directory
      await this.loadResourcesFromDisk();

      this.resourcesIndexed = true;
      log.debug(`Academic knowledge service initialized with ${this.resources.length} resources`);
    } catch (error) {
      log.error('Error initializing academic knowledge service:', error);
      throw error;
    }
  }

  /**
   * Load academic resources from the disk
   */
  private async loadResourcesFromDisk(): Promise<void> {
    try {
      // Check if the directory exists
      if (!fs.existsSync(this.academicDocsDir)) {
        log.debug('Academic resources directory not found, creating it...');
        fs.mkdirSync(this.academicDocsDir, { recursive: true });
        return;
      }

      // Read all files in the directory
      const files = fs.readdirSync(this.academicDocsDir);
      log.debug(`Found ${files.length} files in academic resources directory`);

      // Process each file
      for (const file of files) {
        const filePath = path.join(this.academicDocsDir, file);

        // Skip directories
        if (fs.statSync(filePath).isDirectory()) {
          continue;
        }

        // Only process JSON files
        if (path.extname(file) !== '.json') {
          continue;
        }

        try {
          // Read and parse the file
          const data = fs.readFileSync(filePath, 'utf8');
          const resource = JSON.parse(data) as AcademicResource;

          // Add to resources array
          this.resources.push(resource);
        } catch (fileError) {
          log.error(`Error processing academic resource file ${file}:`, fileError);
        }
      }

      log.debug(`Loaded ${this.resources.length} academic resources`);
    } catch (error) {
      log.error('Error loading academic resources from disk:', error);
      throw error;
    }
  }

  /**
   * Add a new academic resource
   */
  async addResource(resource: AcademicResource): Promise<string> {
    try {
      // Generate ID if not provided
      if (!resource.id) {
        resource.id = `resource_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
      }

      // Save to memory
      this.resources.push(resource);

      // Save to disk
      const filePath = path.join(this.academicDocsDir, `${resource.id}.json`);
      fs.writeFileSync(filePath, JSON.stringify(resource, null, 2));

      return resource.id;
    } catch (error) {
      log.error('Error adding academic resource:', error);
      throw error;
    }
  }

  /**
   * Search for academic resources
   */
  async search(query: SearchQuery): Promise<SearchResult[]> {
    try {
      // Ensure service is initialized
      if (!this.resourcesIndexed) {
        await this.initialize();
      }

      // Rank resources by keyword overlap with the query. This is a small,
      // curated corpus loaded from disk, so a local term-overlap score is
      // sufficient — no separate vector index is needed.
      const terms = query.text
        .toLowerCase()
        .split(/\s+/)
        .filter(w => w.length > 2);

      const ranked = this.resources
        .map(resource => {
          const haystack = `${resource.title} ${resource.content}`.toLowerCase();
          let matches = 0;
          for (const term of terms) {
            if (haystack.includes(term)) matches += 1;
          }
          const relevance = terms.length > 0 ? matches / terms.length : 0;
          return { resource, relevance };
        })
        .filter(r => r.relevance > 0)
        .sort((a, b) => b.relevance - a.relevance)
        .slice(0, query.limit || 10);

      // Process and filter results
      const results: SearchResult[] = [];

      for (const result of ranked) {
        const resource = result.resource;

        // Apply filters
        if (query.filters) {
          // Year range filter
          if (query.filters.yearRange) {
            const [minYear, maxYear] = query.filters.yearRange;
            if (resource.year < minYear || resource.year > maxYear) {
              continue;
            }
          }

          // Type filter
          if (query.filters.types && query.filters.types.length > 0) {
            if (!query.filters.types.includes(resource.type)) {
              continue;
            }
          }

          // Keywords filter
          if (query.filters.keywords && query.filters.keywords.length > 0) {
            const resourceKeywords = resource.metadata.keywords || [];
            const hasKeyword = query.filters.keywords.some(keyword =>
              resourceKeywords.includes(keyword.toLowerCase())
            );

            if (!hasKeyword) {
              continue;
            }
          }
        }

        // Extract relevant snippets
        const snippets = this.extractSnippets(resource.content, query.text, 3);

        // Add to results
        results.push({
          resource,
          relevance: result.relevance,
          snippets,
        });
      }

      return results;
    } catch (error) {
      log.error('Error searching academic resources:', error);
      throw error;
    }
  }

  /**
   * Extract relevant snippets from content based on query
   */
  private extractSnippets(content: string, query: string, count: number = 3): string[] {
    // Split content into sentences
    const sentences = content
      .split(/[.!?]+/g)
      .map(s => s.trim())
      .filter(s => s.length > 0);

    // Score sentences based on keyword matches
    const keywords = query
      .toLowerCase()
      .split(/\s+/)
      .filter(w => w.length > 3);

    const scoredSentences = sentences.map(sentence => {
      const lowerSentence = sentence.toLowerCase();
      let score = 0;

      keywords.forEach(keyword => {
        if (lowerSentence.includes(keyword)) {
          score += 1;
        }
      });

      return { sentence, score };
    });

    // Sort by score and take top results
    const topSentences = scoredSentences
      .sort((a, b) => b.score - a.score)
      .slice(0, count)
      .map(s => s.sentence);

    return topSentences;
  }

  /**
   * Get resource by ID
   */
  getResourceById(id: string): AcademicResource | null {
    return this.resources.find(r => r.id === id) || null;
  }

  /**
   * Get all resources
   */
  getAllResources(): AcademicResource[] {
    return [...this.resources];
  }

  /**
   * Generate insights from academic resources for a specific query
   */
  async generateInsights(query: string): Promise<string> {
    try {
      // Search for relevant resources
      const searchResults = await this.search({
        text: query,
        limit: 5,
      });

      if (searchResults.length === 0) {
        return 'No relevant academic resources found.';
      }

      // Prepare context for AI
      let context = 'RELEVANT ACADEMIC RESOURCES:\n\n';

      searchResults.forEach((result, index) => {
        context += `RESOURCE ${index + 1}: ${result.resource.title} (${result.resource.year})\n`;
        context += `Type: ${result.resource.type}\n`;
        context += `Source: ${result.resource.source}\n\n`;

        if (result.snippets.length > 0) {
          context += 'Key Excerpts:\n';
          result.snippets.forEach(snippet => {
            context += `- ${snippet}\n`;
          });
          context += '\n';
        } else {
          context += 'Content Summary:\n';
          const contentPreview = result.resource.content.substring(0, 300) + '...';
          context += contentPreview + '\n\n';
        }
      });

      // Request AI analysis
      const prompt = `
You are a Clinical Research Consultant who is an expert in interpreting academic literature. Analyze the following academic resources and provide evidence-based insights relevant to this query:

QUERY: ${query}

${context}

Based on the academic resources above, provide:
1. A synthesis of the key findings relevant to the query
2. Evidence-based recommendations supported by the literature
3. Important considerations for clinical trial design
4. Any conflicting evidence or areas of uncertainty

Format your response as a concise, structured analysis (max 400 words).
`;

      const aiResponse = await huggingFaceService.queryHuggingFace(
        prompt,
        HFModel.MISTRAL_LATEST,
        1000,
        0.4
      );

      return aiResponse;
    } catch (error) {
      log.error('Error generating academic insights:', error);
      return 'Error generating insights from academic resources.';
    }
  }

  /**
   * Get statistics about the academic knowledge base
   */
  getStats() {
    // Count resources by type
    const typeCount: Record<string, number> = {};
    this.resources.forEach(resource => {
      const type = resource.type || 'unknown';
      typeCount[type] = (typeCount[type] || 0) + 1;
    });

    // Find date range
    let oldestYear = 3000;
    let newestYear = 0;
    this.resources.forEach(resource => {
      if (resource.year < oldestYear) oldestYear = resource.year;
      if (resource.year > newestYear) newestYear = resource.year;
    });

    // Get unique sources
    const uniqueSources = new Set(this.resources.map(r => r.source));

    return {
      totalResources: this.resources.length,
      resourceTypes: typeCount,
      yearRange: [oldestYear !== 3000 ? oldestYear : null, newestYear !== 0 ? newestYear : null],
      uniqueSources: Array.from(uniqueSources),
      isInitialized: this.resourcesIndexed,
    };
  }
}

// Export a singleton instance for convenience
export const academicKnowledgeService = new AcademicKnowledgeService();
