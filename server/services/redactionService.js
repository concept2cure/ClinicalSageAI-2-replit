/**
 * Advanced Document Redaction Service
 *
 * Provides configurable redaction capabilities using
 * patterns defined in the database for various document types.
 */

import { supabase } from '../lib/supabaseClient.js';
import { logger } from '../utils/logger.js';
import nlp from 'compromise';
import PDFParser from 'pdf-parse';

class RedactionService {
  constructor() {
    // Default redaction patterns - used as fallback if DB patterns fail
    this.defaultPatterns = [
      // SSN pattern
      { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, replacement: '[REDACTED-SSN]' },
      // US Phone Number
      { pattern: /\b\(\d{3}\)\s?\d{3}[-]?\d{4}\b/g, replacement: '[REDACTED-PHONE]' },
      { pattern: /\b\d{3}[-]?\d{3}[-]?\d{4}\b/g, replacement: '[REDACTED-PHONE]' },
      // Email
      {
        pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
        replacement: '[REDACTED-EMAIL]',
      },
      // Names pattern (simplified, would use NER in production)
      { pattern: /Dr\.\s[A-Z][a-z]+ [A-Z][a-z]+/g, replacement: '[REDACTED-NAME]' },
      { pattern: /Patient ID: [A-Z0-9-]+/g, replacement: 'Patient ID: [REDACTED-ID]' },
    ];

    // Cache for redaction patterns
    this.patternCache = new Map();
    this.cacheTTL = 60 * 60 * 1000; // 1 hour cache TTL
  }

  /**
   * Get redaction patterns for a document
   *
   * @param {number} documentId - The document ID
   * @param {string} documentType - The document type
   * @param {string} documentSubtype - The document subtype
   * @param {string} tenantId - The tenant ID
   * @returns {Promise<Array>} - Array of redaction patterns
   */
  async getRedactionPatterns(documentId, documentType, documentSubtype, tenantId) {
    const cacheKey = `${documentId}-${documentType}-${documentSubtype}-${tenantId}`;

    // Check cache first
    if (this.patternCache.has(cacheKey)) {
      const cached = this.patternCache.get(cacheKey);
      if (cached.timestamp > Date.now() - this.cacheTTL) {
        return cached.patterns;
      }
      // Cache expired, remove it
      this.patternCache.delete(cacheKey);
    }

    try {
      // Try to get patterns from the database function
      const { data, error } = await supabase.rpc('get_document_redaction_patterns', {
        doc_id: documentId,
      });

      if (error) {
        logger.error(`Error fetching redaction patterns: ${error.message}`, error);
        throw error;
      }

      if (!data || data.length === 0) {
        logger.warn(`No redaction patterns found for document ${documentId}, using defaults`);
        // No patterns found, use defaults
        const patterns = this.defaultPatterns.map(p => ({
          pattern: p.pattern.source,
          replacement: p.replacement,
          priority: 100,
          is_regex: true,
          is_global: true,
          case_sensitive: false,
        }));

        // Cache the patterns
        this.patternCache.set(cacheKey, {
          timestamp: Date.now(),
          patterns,
        });

        return patterns;
      }

      // Format patterns for use
      const patterns = data.map(p => ({
        pattern: p.pattern,
        replacement: p.replacement,
        priority: p.priority,
        is_regex: p.is_regex,
        is_global: p.is_global,
        case_sensitive: p.case_sensitive,
      }));

      // Sort patterns by priority (lower number = higher priority)
      patterns.sort((a, b) => a.priority - b.priority);

      // Cache the patterns
      this.patternCache.set(cacheKey, {
        timestamp: Date.now(),
        patterns,
      });

      return patterns;
    } catch (err) {
      logger.error(`Failed to get redaction patterns: ${err.message}`, err);

      // Return default patterns as fallback
      return this.defaultPatterns.map(p => ({
        pattern: p.pattern.source,
        replacement: p.replacement,
        priority: 100,
        is_regex: true,
        is_global: true,
        case_sensitive: false,
      }));
    }
  }

  /**
   * Apply redaction to text content
   *
   * @param {string} text - Text to redact
   * @param {Array} patterns - Redaction patterns to apply
   * @returns {Object} - Redacted text and stats
   */
  redactText(text, patterns) {
    let redactedText = text;
    let matchesFound = 0;

    // Apply each pattern in priority order
    for (const pattern of patterns) {
      try {
        // Create a regex from the pattern
        const flags = (pattern.is_global ? 'g' : '') + (pattern.case_sensitive ? '' : 'i');

        const regex = pattern.is_regex
          ? new RegExp(pattern.pattern, flags)
          : new RegExp(pattern.pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), flags);

        // Count matches before replacing
        const matches = redactedText.match(regex);
        if (matches) {
          matchesFound += matches.length;
        }

        // Apply the redaction
        redactedText = redactedText.replace(regex, pattern.replacement);
      } catch (err) {
        logger.error(`Error applying redaction pattern: ${err.message}`, err);
        // Continue with next pattern
      }
    }

    return {
      redactedText,
      matchesFound,
      patternsApplied: patterns.length,
    };
  }

  /**
   * Redact a document based on its content type
   *
   * @param {Buffer} fileBuffer - The document file buffer
   * @param {string} contentType - MIME type of the document
   * @param {Object} document - Document information
   * @param {string} inspectorTokenId - Inspector token ID
   * @param {string} inspectorIp - Inspector IP address
   * @param {string} inspectorUserAgent - Inspector user agent
   * @returns {Promise<Object>} - Redaction result with buffer and stats
   */
  async redactDocument(
    fileBuffer,
    contentType,
    document,
    inspectorTokenId,
    inspectorIp,
    inspectorUserAgent
  ) {
    const startTime = Date.now();

    try {
      // Get redaction patterns for this document
      const patterns = await this.getRedactionPatterns(
        document.id,
        document.document_type_id,
        document.document_subtype_id,
        document.tenant_id
      );

      // For text-based documents
      if (contentType.includes('text/plain')) {
        const text = fileBuffer.toString('utf8');
        const { redactedText, matchesFound, patternsApplied } = this.redactText(text, patterns);

        // Log redaction activity
        await this.logRedactionActivity(
          document.id,
          null, // no version ID for this example
          inspectorTokenId,
          patternsApplied,
          matchesFound,
          Date.now() - startTime,
          inspectorIp,
          inspectorUserAgent
        );

        return {
          buffer: Buffer.from(redactedText, 'utf8'),
          matchesFound,
          patternsApplied,
          executionTime: Date.now() - startTime,
        };
      }

      // For PDF documents
      if (contentType.includes('application/pdf')) {
        // Extract text from PDF
        const pdfData = await PDFParser(fileBuffer);
        const text = pdfData.text;

        // Redact the text
        const { redactedText, matchesFound, patternsApplied } = this.redactText(text, patterns);

        // TODO: For a real implementation, we would need to rebuild the PDF
        // with the redacted text. This is complex and would require a PDF
        // manipulation library.

        // Log redaction activity
        await this.logRedactionActivity(
          document.id,
          null, // no version ID for this example
          inspectorTokenId,
          patternsApplied,
          matchesFound,
          Date.now() - startTime,
          inspectorIp,
          inspectorUserAgent
        );

        // In a real implementation, we would return a new PDF buffer
        // For now, we'll just return a text file with the redacted content
        return {
          buffer: Buffer.from(redactedText, 'utf8'),
          matchesFound,
          patternsApplied,
          executionTime: Date.now() - startTime,
          contentType: 'text/plain', // Change content type since we're returning text
          message: 'PDF redaction is returning plain text for demo purposes',
        };
      }

      // Handle other document types...

      // For unsupported file types, return original with warning
      logger.warn(`Redaction not supported for file type: ${contentType}`);
      return {
        buffer: fileBuffer,
        matchesFound: 0,
        patternsApplied: 0,
        executionTime: Date.now() - startTime,
        warning: 'Redaction not supported for this file type',
      };
    } catch (err) {
      logger.error(`Error in redactDocument: ${err.message}`, err);
      throw err;
    }
  }

  /**
   * Redact structured JSON data
   *
   * @param {Object} data - JSON data to redact
   * @param {Array} patterns - Redaction patterns to apply
   * @param {Array} sensitiveFields - Field names that should be completely redacted
   * @returns {Object} - Redacted data and stats
   */
  redactJsonData(data, patterns, sensitiveFields = []) {
    let matchesFound = 0;
    const redactedData = { ...data };

    // Helper function to recursively process object properties
    const processObject = obj => {
      if (!obj || typeof obj !== 'object') return obj;

      const result = Array.isArray(obj) ? [...obj] : { ...obj };

      for (const key in result) {
        // Skip if property doesn't exist
        if (!Object.prototype.hasOwnProperty.call(result, key)) continue;

        // Check if this is a sensitive field that should be completely redacted
        if (sensitiveFields.includes(key)) {
          result[key] = '[REDACTED]';
          matchesFound++;
          continue;
        }

        // Handle nested objects/arrays recursively
        if (result[key] && typeof result[key] === 'object') {
          result[key] = processObject(result[key]);
          continue;
        }

        // Only process string values
        if (typeof result[key] === 'string') {
          const { redactedText, matchesFound: matches } = this.redactText(result[key], patterns);
          result[key] = redactedText;
          matchesFound += matches;
        }
      }

      return result;
    };

    // Process the root object
    const processedData = processObject(redactedData);

    return {
      redactedData: processedData,
      matchesFound,
    };
  }

  /**
   * Apply named entity recognition (NER) based redaction
   * This provides more intelligent redaction of names, organizations, etc.
   *
   * @param {string} text - Text to redact
   * @returns {string} - Redacted text
   */
  applyNerRedaction(text) {
    try {
      // Use compromise NLP for basic NER
      const doc = nlp(text);

      // Redact people's names
      const people = doc.people().out('array');
      let redactedText = text;

      people.forEach(person => {
        redactedText = redactedText.replace(new RegExp(person, 'g'), '[REDACTED-PERSON]');
      });

      // Redact organizations
      const orgs = doc.organizations().out('array');
      orgs.forEach(org => {
        redactedText = redactedText.replace(new RegExp(org, 'g'), '[REDACTED-ORGANIZATION]');
      });

      // Redact places
      const places = doc.places().out('array');
      places.forEach(place => {
        redactedText = redactedText.replace(new RegExp(place, 'g'), '[REDACTED-LOCATION]');
      });

      return redactedText;
    } catch (err) {
      logger.error(`Error in NER redaction: ${err.message}`, err);
      return text; // Return original text if NER fails
    }
  }

  /**
   * Log redaction activity in the database
   *
   * @param {number} documentId - Document ID
   * @param {string} versionId - Document version ID
   * @param {string} inspectorTokenId - Inspector token ID
   * @param {number} patternsApplied - Number of patterns applied
   * @param {number} matchesFound - Number of matches found
   * @param {number} executionTime - Execution time in ms
   * @param {string} inspectorIp - Inspector IP address
   * @param {string} inspectorUserAgent - Inspector user agent
   * @returns {Promise<void>}
   */
  async logRedactionActivity(
    documentId,
    versionId,
    inspectorTokenId,
    patternsApplied,
    matchesFound,
    executionTime,
    inspectorIp,
    inspectorUserAgent
  ) {
    try {
      await supabase.from('redaction_logs').insert({
        document_id: documentId,
        version_id: versionId,
        inspector_token_id: inspectorTokenId,
        patterns_applied: patternsApplied,
        matches_found: matchesFound,
        execution_time_ms: executionTime,
        inspector_ip: inspectorIp,
        inspector_user_agent: inspectorUserAgent,
      });

      await supabase.from('inspector_audit').insert({
        token_id: inspectorTokenId,
        action: 'document-redaction',
        metadata: {
          document_id: documentId,
          version_id: versionId,
          patterns_applied: patternsApplied,
          matches_found: matchesFound,
          execution_time_ms: executionTime,
        },
      });
    } catch (err) {
      logger.error(`Failed to log redaction activity: ${err.message}`, err);
      // Don't throw error here, just log it
    }
  }
}

export default new RedactionService();
