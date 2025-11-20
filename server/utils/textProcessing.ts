/**
 * Text Processing Utilities for Lumen AI Agent
 * Provides robust text cleaning, segmentation, and enhancement capabilities
 */

interface TextSegment {
  type: 'header' | 'paragraph' | 'list' | 'table' | 'code' | 'citation';
  content: string;
  metadata?: {
    level?: number; // For headers
    language?: string; // For code blocks
    reference?: string; // For citations
  };
}

interface ProcessedText {
  originalLength: number;
  cleanedLength: number;
  segments: TextSegment[];
  extractedEntities: {
    regulatoryTerms: string[];
    medicalTerms: string[];
    dates: string[];
    organizations: string[];
    drugNames: string[];
    studyIdentifiers: string[];
  };
  statistics: {
    wordCount: number;
    sentenceCount: number;
    averageWordLength: number;
    readabilityScore: number;
  };
}

export class TextProcessor {
  private static readonly REGULATORY_PATTERNS = {
    FDA_REGULATIONS: /\b(21\s*CFR\s*\d+(\.\d+)?|FDA\s*(Part|Section)\s*\d+)\b/gi,
    EMA_REGULATIONS: /\b(EMA\/\d+\/\d+|MDR\s*2017\/745|Directive\s*\d+\/\d+\/EC)\b/gi,
    ICH_GUIDELINES: /\b(ICH\s*[A-Z]\d+(\([A-Z]\d+\))?)\b/gi,
    ISO_STANDARDS: /\b(ISO\s*\d+(-\d+)?)\b/gi,
  };

  private static readonly MEDICAL_PATTERNS = {
    CLINICAL_PHASES: /\b(Phase\s*(I{1,3}|[1-4])[a-b]?)\b/gi,
    ADVERSE_EVENTS: /\b(adverse\s*event|AE|SAE|serious\s*adverse\s*event)\b/gi,
    ENDPOINTS: /\b(primary\s*endpoint|secondary\s*endpoint|efficacy\s*endpoint)\b/gi,
    STATISTICAL_TERMS: /\b(p-value|confidence\s*interval|CI|hazard\s*ratio|HR)\b/gi,
  };

  private static readonly NOISE_PATTERNS = [
    /\[[\s\d]+\]/g, // Remove reference numbers like [1], [2, 3]
    /\s+/g, // Normalize whitespace
    /[^\S\r\n]+/g, // Remove non-breaking spaces
    /\u200B/g, // Remove zero-width spaces
  ];

  /**
   * Main text cleaning function
   */
  static cleanText(text: string): string {
    if (!text || typeof text !== 'string') return '';

    let cleaned = text;

    // Remove control characters except newlines and tabs
    cleaned = cleaned.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');

    // Normalize Unicode characters
    cleaned = cleaned.normalize('NFKC');

    // Fix common OCR errors
    cleaned = this.fixOCRErrors(cleaned);

    // Remove excessive whitespace while preserving structure
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n'); // Max 2 consecutive newlines
    cleaned = cleaned.replace(/[ \t]+/g, ' '); // Normalize spaces
    cleaned = cleaned.trim();

    return cleaned;
  }

  /**
   * Fix common OCR errors in regulatory documents
   */
  private static fixOCRErrors(text: string): string {
    const corrections: Record<string, string> = {
      l0: '10',
      O0: '00',
      lCH: 'ICH',
      'FD A': 'FDA',
      'EM A': 'EMA',
      '2l CFR': '21 CFR',
      Clinlcal: 'Clinical',
      trlal: 'trial',
      protoco1: 'protocol',
    };

    let fixed = text;
    for (const [error, correction] of Object.entries(corrections)) {
      fixed = fixed.replace(new RegExp(error, 'g'), correction);
    }

    return fixed;
  }

  /**
   * Segment text into structured components
   */
  static segmentText(text: string): TextSegment[] {
    const segments: TextSegment[] = [];
    const lines = text.split('\n');
    let currentParagraph = '';

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        if (currentParagraph) {
          segments.push({
            type: 'paragraph',
            content: currentParagraph.trim(),
          });
          currentParagraph = '';
        }
        continue;
      }

      // Detect headers (lines that are all caps or numbered sections)
      if (this.isHeader(trimmed)) {
        if (currentParagraph) {
          segments.push({
            type: 'paragraph',
            content: currentParagraph.trim(),
          });
          currentParagraph = '';
        }
        segments.push({
          type: 'header',
          content: trimmed,
          metadata: { level: this.getHeaderLevel(trimmed) },
        });
        continue;
      }

      // Detect list items
      if (this.isListItem(trimmed)) {
        if (currentParagraph) {
          segments.push({
            type: 'paragraph',
            content: currentParagraph.trim(),
          });
          currentParagraph = '';
        }
        segments.push({
          type: 'list',
          content: trimmed,
        });
        continue;
      }

      // Detect tables (simple heuristic)
      if (this.isTableRow(trimmed)) {
        segments.push({
          type: 'table',
          content: trimmed,
        });
        continue;
      }

      // Detect citations
      if (this.isCitation(trimmed)) {
        segments.push({
          type: 'citation',
          content: trimmed,
          metadata: { reference: this.extractCitationReference(trimmed) },
        });
        continue;
      }

      // Otherwise, accumulate as paragraph
      currentParagraph += (currentParagraph ? ' ' : '') + trimmed;
    }

    // Don't forget the last paragraph
    if (currentParagraph) {
      segments.push({
        type: 'paragraph',
        content: currentParagraph.trim(),
      });
    }

    return segments;
  }

  /**
   * Extract regulatory and medical entities from text
   */
  static extractEntities(text: string) {
    const entities = {
      regulatoryTerms: new Set<string>(),
      medicalTerms: new Set<string>(),
      dates: new Set<string>(),
      organizations: new Set<string>(),
      drugNames: new Set<string>(),
      studyIdentifiers: new Set<string>(),
    };

    // Extract regulatory terms
    for (const [key, pattern] of Object.entries(this.REGULATORY_PATTERNS)) {
      const matches = text.match(pattern) || [];
      matches.forEach(match => entities.regulatoryTerms.add(match));
    }

    // Extract medical terms
    for (const [key, pattern] of Object.entries(this.MEDICAL_PATTERNS)) {
      const matches = text.match(pattern) || [];
      matches.forEach(match => entities.medicalTerms.add(match));
    }

    // Extract dates (various formats)
    const datePatterns = [
      /\b\d{1,2}[-\/]\d{1,2}[-\/]\d{2,4}\b/g,
      /\b\d{4}[-\/]\d{1,2}[-\/]\d{1,2}\b/g,
      /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b/gi,
      /\b\d{1,2}\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+\d{4}\b/gi,
    ];
    datePatterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => entities.dates.add(match));
    });

    // Extract organization names (simple heuristic - capitalized multi-word phrases)
    const orgPattern =
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4}(?:\s+(?:Inc|LLC|Ltd|Corporation|Corp|Company|Co|Pharmaceuticals|Pharma|Biotech|Medical|Healthcare|Therapeutics|Sciences|Research|Institute|University|Hospital|Center|Centre|Agency|Administration|Authority|Board|Commission|Committee|Department|Division|Office))?)\b/g;
    const orgMatches = text.match(orgPattern) || [];
    orgMatches.forEach(match => {
      if (match.length > 10) {
        // Filter out short matches
        entities.organizations.add(match);
      }
    });

    // Extract drug names (pattern for common drug naming conventions)
    const drugPattern =
      /\b[A-Z][a-z]+(?:mab|nib|ib|ab|cept|vir|ase|tide|platin|mycin|cillin|azole|pril|sartan|statin|prazole|ine|one)\b/g;
    const drugMatches = text.match(drugPattern) || [];
    drugMatches.forEach(match => entities.drugNames.add(match));

    // Extract study identifiers
    const studyPattern =
      /\b(NCT\d{8}|ISRCTN\d{8}|EUDRACT\s*\d{4}-\d{6}-\d{2}|Protocol\s*[A-Z0-9-]+)\b/gi;
    const studyMatches = text.match(studyPattern) || [];
    studyMatches.forEach(match => entities.studyIdentifiers.add(match));

    return {
      regulatoryTerms: Array.from(entities.regulatoryTerms),
      medicalTerms: Array.from(entities.medicalTerms),
      dates: Array.from(entities.dates),
      organizations: Array.from(entities.organizations),
      drugNames: Array.from(entities.drugNames),
      studyIdentifiers: Array.from(entities.studyIdentifiers),
    };
  }

  /**
   * Calculate text statistics
   */
  static calculateStatistics(text: string) {
    const words = text.split(/\s+/).filter(word => word.length > 0);
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);

    const wordCount = words.length;
    const sentenceCount = sentences.length;
    const totalWordLength = words.reduce((sum, word) => sum + word.length, 0);
    const averageWordLength = wordCount > 0 ? totalWordLength / wordCount : 0;

    // Simple readability score (Flesch Reading Ease approximation)
    const averageSentenceLength = wordCount / Math.max(sentenceCount, 1);
    const readabilityScore = Math.max(
      0,
      Math.min(100, 206.835 - 1.015 * averageSentenceLength - 84.6 * (averageWordLength / 4.7))
    );

    return {
      wordCount,
      sentenceCount,
      averageWordLength: Math.round(averageWordLength * 10) / 10,
      readabilityScore: Math.round(readabilityScore),
    };
  }

  /**
   * Main processing function that combines all capabilities
   */
  static processText(text: string): ProcessedText {
    const cleaned = this.cleanText(text);
    const segments = this.segmentText(cleaned);
    const extractedEntities = this.extractEntities(cleaned);
    const statistics = this.calculateStatistics(cleaned);

    return {
      originalLength: text.length,
      cleanedLength: cleaned.length,
      segments,
      extractedEntities,
      statistics,
    };
  }

  // Helper methods
  private static isHeader(line: string): boolean {
    // Check for numbered sections (e.g., "1.2.3 Title")
    if (/^\d+(\.\d+)*\s+[A-Z]/.test(line)) return true;

    // Check for all caps headers (min 3 chars, max 100)
    if (line.length >= 3 && line.length <= 100 && line === line.toUpperCase() && /[A-Z]/.test(line))
      return true;

    // Check for markdown-style headers
    if (/^#{1,6}\s+/.test(line)) return true;

    return false;
  }

  private static getHeaderLevel(line: string): number {
    // Numbered sections
    const numberedMatch = line.match(/^(\d+(?:\.\d+)*)/);
    if (numberedMatch) {
      return numberedMatch[1].split('.').length;
    }

    // Markdown headers
    const markdownMatch = line.match(/^(#{1,6})\s+/);
    if (markdownMatch) {
      return markdownMatch[1].length;
    }

    // Default level for other headers
    return 1;
  }

  private static isListItem(line: string): boolean {
    return (
      /^[\s]*[-•*◦▪▫◘○●]\s+/.test(line) ||
      /^[\s]*\d+[.)]\s+/.test(line) ||
      /^[\s]*[a-zA-Z][.)]\s+/.test(line)
    );
  }

  private static isTableRow(line: string): boolean {
    // Simple heuristic: contains multiple pipe characters or tabs
    return line.split('|').length > 2 || line.split('\t').length > 2;
  }

  private static isCitation(line: string): boolean {
    return /^\[\d+\]/.test(line) || /^[A-Z][a-z]+.*\(\d{4}\)/.test(line);
  }

  private static extractCitationReference(line: string): string {
    const match = line.match(/^\[(\d+)\]/) || line.match(/\((\d{4})\)/);
    return match ? match[1] : '';
  }
}

export default TextProcessor;
