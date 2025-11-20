/**
 * Document Intelligence Service
 *
 * This service provides the core functionality for the document intelligence system,
 * including document processing, document type identification, analysis, and data enhancement.
 *
 * Enhanced version with:
 * - Batch processing capabilities
 * - Template matching
 * - Improved confidence scoring
 * - Document comparison
 * - Specialized extraction modes
 */

// No API import needed for the demo implementation

class DocumentIntelligenceService {
  constructor() {
    // Template library for matching uploaded documents against known formats
    this.templates = {
      '510k': [
        { id: 'tmpl-510k-full', name: '510(k) Full Submission', matchScore: 0.92 },
        { id: 'tmpl-510k-trad', name: '510(k) Traditional Format', matchScore: 0.89 },
        { id: 'tmpl-510k-abbr', name: '510(k) Abbreviated Format', matchScore: 0.85 },
        { id: 'tmpl-510k-spec', name: '510(k) Special Format', matchScore: 0.87 },
      ],
      cer: [
        { id: 'tmpl-cer-mdr', name: 'CER MDR Format', matchScore: 0.94 },
        { id: 'tmpl-cer-meddev', name: 'CER MEDDEV 2.7/1 Rev 4', matchScore: 0.91 },
        { id: 'tmpl-cer-lit', name: 'CER Literature-Based', matchScore: 0.88 },
      ],
      ifu: [
        { id: 'tmpl-ifu-pro', name: 'IFU Professional Use', matchScore: 0.95 },
        { id: 'tmpl-ifu-pat', name: 'IFU Patient Use', matchScore: 0.93 },
      ],
      technical: [
        { id: 'tmpl-tech-file', name: 'Technical File', matchScore: 0.9 },
        { id: 'tmpl-tech-dossier', name: 'Technical Design Dossier', matchScore: 0.87 },
      ],
    };
  }

  /**
   * Process documents for analysis with enhanced batch processing capabilities
   *
   * @param {Array} files - The files to process
   * @param {string} regulatoryContext - The regulatory context (510k, cer, etc.)
   * @param {Function} progressCallback - Callback for progress updates
   * @param {Object} options - Additional processing options
   * @param {boolean} options.enableOCR - Whether to use OCR for image-based documents
   * @param {boolean} options.extractMetadata - Whether to extract metadata
   * @param {string} options.processingPriority - Processing priority (high, normal, low)
   * @returns {Promise<Array>} - Array of processed document objects
   */
  async processDocuments(files, regulatoryContext, progressCallback, options = {}) {
    try {
      const { enableOCR = true, extractMetadata = true, processingPriority = 'normal' } = options;

      // For demo purposes, we'll simulate processing without actual file upload
      // In a real implementation, this would upload files to the server
      const processedDocuments = [];

      // Organize files for batch processing
      const fileGroups = this._organizeFilesForBatchProcessing(files);

      // Process each batch group
      let processedCount = 0;
      const totalFiles = files.length;

      for (const [groupName, groupFiles] of Object.entries(fileGroups)) {
        // Update progress with batch information
        if (progressCallback) {
          progressCallback({
            percentage: Math.round((processedCount / totalFiles) * 90),
            currentBatch: groupName,
            totalFiles,
            processedFiles: processedCount,
          });
        }

        // Process files in current batch
        for (const file of groupFiles) {
          // Simulate processing delay based on priority and size
          const delay = this._calculateProcessingDelay(file.size, processingPriority);
          await new Promise(resolve => setTimeout(resolve, delay));

          // Extract document features
          const { textContent, documentFeatures } = await this._extractDocumentContent(
            file,
            enableOCR
          );

          // Find matching template if available
          const templateMatches = await this._findMatchingTemplates(
            file.name,
            textContent,
            regulatoryContext
          );

          // Create processed document object
          const processedDocument = {
            id: `doc-${Date.now()}-${processedCount}`,
            filename: file.name,
            fileType: this._getFileType(file.name),
            fileSize: file.size,
            pages: this._estimatePageCount(file.size),
            textContent,
            documentFeatures,
            templateMatches,
            processed: true,
            processingGroup: groupName,
            ocr: enableOCR,
            metadata: extractMetadata ? this._extractDocumentMetadata(file) : null,
            regulatoryContext,
            processingTimestamp: new Date().toISOString(),
          };

          processedDocuments.push(processedDocument);
          processedCount++;

          // Update progress for individual file
          if (progressCallback) {
            progressCallback({
              percentage: Math.round((processedCount / totalFiles) * 90),
              currentBatch: groupName,
              totalFiles,
              processedFiles: processedCount,
              currentFile: file.name,
            });
          }
        }
      }

      // Complete progress
      if (progressCallback) {
        progressCallback({
          percentage: 100,
          totalFiles,
          processedFiles: processedCount,
          completed: true,
        });
      }

      return processedDocuments;
    } catch (error) {
      console.error('Error processing documents:', error);
      throw new Error('Failed to process documents: ' + (error.message || 'Unknown error'));
    }
  }

  /**
   * Identify the types of documents that have been uploaded with enhanced confidence metrics
   *
   * @param {Array} processedDocuments - Array of processed document objects
   * @param {string} regulatoryContext - The regulatory context (510k, cer, etc.)
   * @param {Object} options - Additional identification options
   * @param {boolean} options.detailedAnalysis - Whether to perform detailed analysis
   * @param {boolean} options.useTemplateMatching - Whether to use template matching
   * @returns {Promise<Array>} - Array of document type objects with confidence metrics
   */
  async identifyDocumentTypes(processedDocuments, regulatoryContext, options = {}) {
    try {
      const { detailedAnalysis = true, useTemplateMatching = true } = options;

      // For demo purposes, we'll simulate document type identification
      // In a real implementation, this would call a server API
      const documentTypes = [];

      for (const doc of processedDocuments) {
        // Simulate processing delay
        await new Promise(resolve => setTimeout(resolve, 300));

        // Determine document type based on filename, content, and optional template matching
        const filename = doc.filename.toLowerCase();
        const textContent = doc.textContent || '';

        // Initial type identification
        let typeInfo = this._identifyDocumentTypeFromContent(
          filename,
          textContent,
          regulatoryContext
        );

        // Enhanced confidence metrics
        let confidenceMetrics = {
          overall: typeInfo.confidence,
          contentMatch: this._calculateContentMatchConfidence(textContent, typeInfo.type),
          filenameMatch: this._calculateFilenameMatchConfidence(filename, typeInfo.type),
          structureMatch: 0.75 + Math.random() * 0.2, // Simulated structure match
        };

        // Use template matching if enabled
        if (useTemplateMatching && doc.templateMatches && doc.templateMatches.length > 0) {
          // Get best template match
          const bestMatch = doc.templateMatches[0];

          // Enhance type identification with template match
          if (bestMatch.score > 0.85) {
            typeInfo.type = this._refineTypeBasedOnTemplate(bestMatch.template, typeInfo.type);
            typeInfo.confidence = Math.max(typeInfo.confidence, bestMatch.score);
            confidenceMetrics.templateMatch = bestMatch.score;
            confidenceMetrics.overall = this._calculateOverallConfidence(confidenceMetrics);
          }
        }

        // Perform detailed analysis if enabled
        if (detailedAnalysis) {
          const detailedResults = this._performDetailedTypeAnalysis(
            textContent,
            typeInfo.type,
            regulatoryContext
          );
          typeInfo = {
            ...typeInfo,
            ...detailedResults,
            confidence: Math.max(typeInfo.confidence, detailedResults.confidence || 0),
          };

          confidenceMetrics = {
            ...confidenceMetrics,
            contentDetails: detailedResults.confidenceFactors || {},
            overall: this._calculateOverallConfidence({
              ...confidenceMetrics,
              detailedAnalysis: detailedResults.confidence || 0,
            }),
          };
        }

        documentTypes.push({
          documentId: doc.id,
          filename: doc.filename,
          type: typeInfo.type,
          subtype: typeInfo.subtype || null,
          confidence: confidenceMetrics.overall,
          confidenceMetrics,
          description: typeInfo.description,
          regulatoryRelevance: this._calculateRegulatoryRelevance(typeInfo.type, regulatoryContext),
          regulatoryContext,
          keyContentSections: typeInfo.keyContentSections || [],
          templateMatches: doc.templateMatches || [],
        });
      }

      return documentTypes;
    } catch (error) {
      console.error('Error identifying document types:', error);
      throw new Error('Failed to identify document types: ' + (error.message || 'Unknown error'));
    }
  }

  /**
   * Analyze documents to extract structured data with enhanced extraction modes
   *
   * @param {Array} processedDocuments - Array of processed document objects
   * @param {Object} options - Analysis options
   * @param {string} options.regulatoryContext - The regulatory context (510k, cer, etc.)
   * @param {string} options.extractionMode - The extraction mode (basic, enhanced, regulatory, comprehensive, targeted)
   * @param {Array} options.targetedFields - Fields to target for extraction in targeted mode
   * @param {boolean} options.validateData - Whether to validate the extracted data
   * @param {boolean} options.enableDocumentComparison - Whether to compare data across documents
   * @param {Function} progressCallback - Callback for progress updates
   * @returns {Promise<Object>} - Extracted data object with confidence metrics
   */
  async analyzeDocuments(processedDocuments, options, progressCallback) {
    try {
      const {
        regulatoryContext,
        extractionMode = 'enhanced',
        targetedFields = [],
        validateData = true,
        enableDocumentComparison = false,
      } = options;

      // For demo purposes, we'll simulate document analysis
      // In a real implementation, this would call a server API

      // Update progress
      if (progressCallback) {
        progressCallback({
          percentage: 10,
          stage: 'initialization',
          message: 'Initializing document analysis...',
        });
      }

      // Simulate analysis delay based on extraction mode
      const delayTime =
        {
          basic: 1000,
          enhanced: 2000,
          regulatory: 2500,
          comprehensive: 3000,
          targeted: 1500,
        }[extractionMode] || 1500;

      await new Promise(resolve => setTimeout(resolve, delayTime));

      // Update progress
      if (progressCallback) {
        progressCallback({
          percentage: 30,
          stage: 'extraction',
          message: `Extracting data using ${extractionMode} mode...`,
        });
      }

      // Generate extracted data based on mode
      let extractedData;

      if (extractionMode === 'targeted' && targetedFields.length > 0) {
        // Targeted extraction mode - extract only specified fields
        extractedData = this._generateTargetedExtractionData(
          processedDocuments,
          regulatoryContext,
          targetedFields
        );
      } else {
        // Standard extraction modes
        extractedData = this._generateExtractedData(
          processedDocuments,
          regulatoryContext,
          extractionMode
        );
      }

      // Update progress
      if (progressCallback) {
        progressCallback({
          percentage: 60,
          stage: 'processing',
          message: 'Processing extracted data...',
        });
      }

      // If document comparison is enabled, compare data across documents
      if (enableDocumentComparison && processedDocuments.length > 1) {
        extractedData.comparisonResults = await this._compareDataAcrossDocuments(
          processedDocuments,
          extractedData
        );
      }

      // Validate data if requested
      if (validateData) {
        extractedData.validation = this._validateExtractedData(extractedData, regulatoryContext);
      }

      // Update progress
      if (progressCallback) {
        progressCallback({
          percentage: 80,
          stage: 'confidence',
          message: 'Calculating confidence scores...',
        });
      }

      // Add detailed confidence scores for each field
      extractedData.confidenceScores = {};

      Object.keys(extractedData).forEach(key => {
        if (
          key !== 'validation' &&
          key !== 'confidence' &&
          key !== 'sourceDocuments' &&
          key !== 'confidenceScores' &&
          key !== 'comparisonResults' &&
          !key.endsWith('Confidence')
        ) {
          const confidenceScore = this._generateDetailedConfidenceScore(key, extractedData[key]);
          extractedData.confidenceScores[key] = confidenceScore;
          extractedData[`${key}Confidence`] = confidenceScore.overall;
        }
      });

      // Simulate final processing delay
      await new Promise(resolve => setTimeout(resolve, 500));

      // Complete progress
      if (progressCallback) {
        progressCallback({
          percentage: 100,
          stage: 'complete',
          message: 'Analysis complete',
        });
      }

      return extractedData;
    } catch (error) {
      console.error('Error analyzing documents:', error);
      throw new Error('Failed to analyze documents: ' + (error.message || 'Unknown error'));
    }
  }

  /**
   * Enhance extracted data with AI-powered insights
   *
   * @param {Object} extractedData - The data extracted from documents
   * @param {string} regulatoryContext - The regulatory context (510k, cer, etc.)
   * @returns {Promise<Object>} - Enhanced data object
   */
  async enhanceExtractedData(extractedData, regulatoryContext) {
    try {
      // For demo purposes, we'll simulate data enhancement
      // In a real implementation, this would call a server API

      // Simulate enhancement delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Start with the original data
      const enhancedData = { ...extractedData };

      // Enhance existing fields
      if (enhancedData.description) {
        enhancedData.description = this._enhanceDescription(enhancedData.description);
        enhancedData.descriptionConfidence = Math.min(
          1,
          (enhancedData.descriptionConfidence || 0) + 0.15
        );
      }

      if (enhancedData.intendedUse) {
        enhancedData.intendedUse = this._enhanceIntendedUse(enhancedData.intendedUse);
        enhancedData.intendedUseConfidence = Math.min(
          1,
          (enhancedData.intendedUseConfidence || 0) + 0.1
        );
      }

      // Add new fields based on regulatory context
      if (regulatoryContext === '510k') {
        if (!enhancedData.substEquivalence) {
          enhancedData.substEquivalence = this._generateSubstantialEquivalence(enhancedData);
          enhancedData.substEquivalenceConfidence = 0.78;
        }

        if (!enhancedData.riskLevel) {
          enhancedData.riskLevel = this._determineRiskLevel(enhancedData);
          enhancedData.riskLevelConfidence = 0.82;
        }
      } else if (regulatoryContext === 'cer') {
        if (!enhancedData.clinicalEvaluation) {
          enhancedData.clinicalEvaluation = this._generateClinicalEvaluation(enhancedData);
          enhancedData.clinicalEvaluationConfidence = 0.75;
        }

        if (!enhancedData.benefitRiskAssessment) {
          enhancedData.benefitRiskAssessment = this._generateBenefitRiskAssessment(enhancedData);
          enhancedData.benefitRiskAssessmentConfidence = 0.79;
        }
      }

      // Update overall confidence
      enhancedData.confidence = Math.min(1, (enhancedData.confidence || 0) + 0.1);

      return enhancedData;
    } catch (error) {
      console.error('Error enhancing data:', error);
      throw new Error('Failed to enhance data: ' + (error.message || 'Unknown error'));
    }
  }

  /**
   * Get compatible document types for a regulatory context
   *
   * @param {string} regulatoryContext - The regulatory context (510k, cer, etc.)
   * @returns {Promise<Array>} - Array of compatible document type objects
   */
  async getCompatibleDocumentTypes(regulatoryContext) {
    try {
      // For demo purposes, we'll return hardcoded compatible document types
      // In a real implementation, this would call a server API

      const commonTypes = [
        {
          name: 'Technical Documentation',
          description: 'Device specifications, engineering details, and technical characteristics',
        },
        {
          name: 'Instructions For Use (IFU)',
          description: 'User manuals and instructions for using the device',
        },
      ];

      const contextSpecificTypes = {
        '510k': [
          {
            name: '510(k) Submission',
            description: 'Premarket notification submission for FDA clearance',
          },
          {
            name: 'Predicate Device Information',
            description: 'Documentation about predicate devices for substantial equivalence claims',
          },
          {
            name: 'Substantial Equivalence Report',
            description: 'Report demonstrating equivalence to predicate devices',
          },
        ],
        cer: [
          {
            name: 'Clinical Evaluation Report',
            description: 'Comprehensive evaluation of clinical data for CE marking',
          },
          {
            name: 'Clinical Study Report',
            description: 'Documentation of clinical investigations and their results',
          },
          {
            name: 'Literature Review',
            description: 'Systematic review of published scientific literature',
          },
        ],
        // Add more contexts as needed
      };

      return [...(contextSpecificTypes[regulatoryContext] || []), ...commonTypes];
    } catch (error) {
      console.error('Error getting compatible document types:', error);
      throw new Error(
        'Failed to get compatible document types: ' + (error.message || 'Unknown error')
      );
    }
  }

  /**
   * Organize files into logical batch groups for processing
   * @private
   */
  _organizeFilesForBatchProcessing(files) {
    // Group files by type for more efficient batch processing
    const fileGroups = {
      pdf: [],
      word: [],
      excel: [],
      text: [],
      other: [],
    };

    files.forEach(file => {
      const extension = file.name.split('.').pop().toLowerCase();

      if (extension === 'pdf') {
        fileGroups.pdf.push(file);
      } else if (['doc', 'docx'].includes(extension)) {
        fileGroups.word.push(file);
      } else if (['xls', 'xlsx'].includes(extension)) {
        fileGroups.excel.push(file);
      } else if (['txt', 'text', 'md', 'csv'].includes(extension)) {
        fileGroups.text.push(file);
      } else {
        fileGroups.other.push(file);
      }
    });

    // Remove empty groups
    Object.keys(fileGroups).forEach(key => {
      if (fileGroups[key].length === 0) {
        delete fileGroups[key];
      }
    });

    return fileGroups;
  }

  /**
   * Calculate processing delay based on file size and priority
   * @private
   */
  _calculateProcessingDelay(fileSize, priority) {
    // Base delay in milliseconds
    const baseDelay = 300;

    // Size factor (larger files take longer)
    const sizeFactor = Math.min(3, Math.log(fileSize / (1024 * 1024) + 1) + 1);

    // Priority multiplier
    const priorityMultiplier =
      {
        high: 0.5,
        normal: 1,
        low: 1.5,
      }[priority] || 1;

    return baseDelay * sizeFactor * priorityMultiplier;
  }

  /**
   * Extract document content and features
   * @private
   */
  async _extractDocumentContent(file, useOcr) {
    // For demo purposes, this simulates document content extraction
    const extension = file.name.split('.').pop().toLowerCase();
    const textContent = await this._extractTextContent(file);

    // Extract document features
    const documentFeatures = {
      // Structure features
      sectionCount: Math.floor(3 + Math.random() * 8),
      tableCount: ['pdf', 'doc', 'docx', 'xls', 'xlsx'].includes(extension)
        ? Math.floor(Math.random() * 5)
        : 0,
      figureCount: ['pdf', 'doc', 'docx'].includes(extension) ? Math.floor(Math.random() * 3) : 0,

      // Content features
      hasExecSummary: Math.random() > 0.3,
      hasTOC: ['pdf', 'doc', 'docx'].includes(extension) && Math.random() > 0.5,
      hasAppendices: Math.random() > 0.7,

      // Metadata features
      hasMetadata: ['pdf', 'doc', 'docx'].includes(extension) && Math.random() > 0.4,
      wordCount: textContent.split(/\s+/).length,

      // OCR-specific features
      ocrConfidence: useOcr ? 0.8 + Math.random() * 0.15 : null,
      scannedDocument: useOcr && Math.random() > 0.7,
    };

    return { textContent, documentFeatures };
  }

  /**
   * Extract metadata from document
   * @private
   */
  _extractDocumentMetadata(file) {
    // For demo purposes, this simulates metadata extraction
    const extension = file.name.split('.').pop().toLowerCase();

    if (['pdf', 'doc', 'docx'].includes(extension)) {
      return {
        title: file.name.split('.')[0].replace(/[-_]/g, ' '),
        author: 'Document Author',
        creationDate: this._randomDate(new Date(2020, 0, 1), new Date()),
        lastModified: this._randomDate(new Date(2023, 0, 1), new Date()),
        keywords: ['medical', 'device', 'regulatory', 'submission'],
        pageCount: this._estimatePageCount(file.size),
      };
    } else if (['xls', 'xlsx'].includes(extension)) {
      return {
        title: file.name.split('.')[0].replace(/[-_]/g, ' '),
        author: 'Spreadsheet Author',
        creationDate: this._randomDate(new Date(2020, 0, 1), new Date()),
        lastModified: this._randomDate(new Date(2023, 0, 1), new Date()),
        sheetCount: Math.floor(1 + Math.random() * 5),
      };
    } else {
      return {
        title: file.name.split('.')[0].replace(/[-_]/g, ' '),
        lastModified: this._randomDate(new Date(2023, 0, 1), new Date()),
        encoding: Math.random() > 0.5 ? 'UTF-8' : 'UTF-16',
      };
    }
  }

  /**
   * Find matching templates for a document
   * @private
   */
  async _findMatchingTemplates(filename, content, regulatoryContext) {
    // For demo purposes, this simulates template matching
    const matches = [];

    // Get relevant templates for the context
    const relevantTemplates = [];

    // Check all template categories that might apply
    Object.keys(this.templates).forEach(category => {
      // If category matches context directly or is a general category
      if (category === regulatoryContext || ['ifu', 'technical'].includes(category)) {
        relevantTemplates.push(...this.templates[category]);
      }
    });

    // Check filename and content for matches
    for (const template of relevantTemplates) {
      // Calculate match score based on filename and content
      const filenameScore = this._calculateTemplateFilenameMatch(filename, template.id);
      const contentScore = this._calculateTemplateContentMatch(content, template.id);

      // Calculate weighted score (content matters more than filename)
      const score = 0.3 * filenameScore + 0.7 * contentScore;

      // If score is above threshold, add to matches
      if (score > 0.5) {
        matches.push({
          template: template.id,
          name: template.name,
          score: score,
          scoreDetails: {
            filename: filenameScore,
            content: contentScore,
          },
        });
      }
    }

    // Sort matches by score (descending)
    matches.sort((a, b) => b.score - a.score);

    return matches;
  }

  /**
   * Calculate template match score based on filename
   * @private
   */
  _calculateTemplateFilenameMatch(filename, templateId) {
    // For demo purposes, this simulates template filename matching
    const lowerFilename = filename.toLowerCase();
    const templateTokens = templateId.split('-');

    // Count matching tokens
    let matchCount = 0;

    templateTokens.forEach(token => {
      if (lowerFilename.includes(token)) {
        matchCount++;
      }
    });

    // Calculate score based on matching tokens
    return Math.min(1, matchCount / templateTokens.length + 0.3);
  }

  /**
   * Calculate template match score based on content
   * @private
   */
  _calculateTemplateContentMatch(content, templateId) {
    // For demo purposes, this simulates template content matching
    const matchMap = {
      'tmpl-510k-full': ['510(k)', 'submission', 'substantial equivalence', 'predicate'],
      'tmpl-510k-trad': ['traditional', '510(k)', 'FDA', 'predicate device'],
      'tmpl-510k-abbr': ['abbreviated', '510(k)', 'summary'],
      'tmpl-510k-spec': ['special', '510(k)', 'guidance'],
      'tmpl-cer-mdr': ['MDR', 'clinical evaluation', 'EU', 'MEDDEV'],
      'tmpl-cer-meddev': ['MEDDEV', '2.7/1', 'clinical'],
      'tmpl-cer-lit': ['literature', 'PMCF', 'clinical'],
      'tmpl-ifu-pro': ['instructions', 'professional', 'clinician'],
      'tmpl-ifu-pat': ['instructions', 'patient', 'user'],
      'tmpl-tech-file': ['technical', 'specifications', 'design'],
      'tmpl-tech-dossier': ['dossier', 'design', 'technical'],
    };

    const terms = matchMap[templateId] || [];
    const lowerContent = content.toLowerCase();

    // Count matching terms
    let matchCount = 0;

    terms.forEach(term => {
      if (lowerContent.includes(term)) {
        matchCount++;
      }
    });

    // Calculate score based on matching terms
    return Math.min(1, matchCount / terms.length + Math.random() * 0.2);
  }

  /**
   * Identify document type from content
   * @private
   */
  _identifyDocumentTypeFromContent(filename, content, regulatoryContext) {
    // For demo purposes, this simulates document type identification from content
    const lowerFilename = filename.toLowerCase();
    const lowerContent = content.toLowerCase();

    // Initial type identification based on filename
    let type, confidence, description, subtype;

    if (
      lowerFilename.includes('510k') ||
      lowerContent.includes('510(k)') ||
      lowerContent.includes('substantial equivalence')
    ) {
      type = '510(k) Submission';
      confidence = 0.95;
      description =
        'A 510(k) submission document containing device details, intended use, and regulatory information.';

      // Identify subtype
      if (lowerContent.includes('traditional')) {
        subtype = 'Traditional 510(k)';
      } else if (lowerContent.includes('abbreviated')) {
        subtype = 'Abbreviated 510(k)';
      } else if (lowerContent.includes('special')) {
        subtype = 'Special 510(k)';
      }
    } else if (
      lowerFilename.includes('technical') ||
      lowerFilename.includes('spec') ||
      lowerContent.includes('specifications') ||
      lowerContent.includes('technical design')
    ) {
      type = 'Technical File';
      confidence = 0.87;
      description =
        'Technical documentation containing specifications, performance data, and engineering details.';

      // Identify subtype
      if (lowerContent.includes('dossier')) {
        subtype = 'Design Dossier';
      } else if (lowerContent.includes('risk')) {
        subtype = 'Risk Management File';
      }
    } else if (
      lowerFilename.includes('clinical') ||
      lowerFilename.includes('study') ||
      lowerContent.includes('clinical investigation') ||
      lowerContent.includes('study protocol')
    ) {
      type = 'Clinical Study Report';
      confidence = 0.92;
      description =
        'Clinical investigation documentation containing study protocols, results, and analysis.';

      // Identify subtype
      if (lowerContent.includes('protocol')) {
        subtype = 'Study Protocol';
      } else if (lowerContent.includes('result')) {
        subtype = 'Study Results';
      }
    } else if (
      lowerFilename.includes('instruction') ||
      lowerFilename.includes('ifu') ||
      lowerFilename.includes('manual') ||
      lowerContent.includes('instructions for use')
    ) {
      type = 'Instructions For Use';
      confidence = 0.89;
      description = 'Instructions for use document describing how to properly use the device.';

      // Identify subtype
      if (lowerContent.includes('patient') || lowerContent.includes('user')) {
        subtype = 'Patient IFU';
      } else if (lowerContent.includes('professional') || lowerContent.includes('clinician')) {
        subtype = 'Professional IFU';
      }
    } else if (
      lowerFilename.includes('predicate') ||
      lowerFilename.includes('comparison') ||
      lowerContent.includes('predicate') ||
      lowerContent.includes('substantial equivalence')
    ) {
      type = 'Predicate Device Information';
      confidence = 0.91;
      description =
        'Documentation about predicate devices used for substantial equivalence claims.';
    } else if (
      lowerFilename.includes('cer') ||
      lowerContent.includes('clinical evaluation report') ||
      lowerContent.includes('clinical evaluation')
    ) {
      type = 'Clinical Evaluation Report';
      confidence = 0.94;
      description = 'Systematic evaluation of clinical data pertaining to the medical device.';

      // Identify subtype
      if (lowerContent.includes('mdr')) {
        subtype = 'MDR CER';
      } else if (lowerContent.includes('meddev')) {
        subtype = 'MEDDEV 2.7/1 CER';
      }
    } else {
      // Default to a generic regulatory document
      type = 'Regulatory Document';
      confidence = 0.65;
      description =
        'A regulatory document with unspecified content type. Further analysis required.';
    }

    return {
      type,
      subtype,
      confidence,
      description,
      keyContentSections: this._identifyKeyContentSections(content, type, regulatoryContext),
    };
  }

  /**
   * Identify key content sections within a document
   * @private
   */
  _identifyKeyContentSections(content, documentType, regulatoryContext) {
    // For demo purposes, this simulates identification of key sections
    const sections = [];

    // Add sections based on document type
    switch (documentType) {
      case '510(k) Submission':
        sections.push(
          { name: 'Device Description', confidence: 0.95 },
          { name: 'Intended Use', confidence: 0.96 },
          { name: 'Substantial Equivalence', confidence: 0.92 },
          { name: 'Predicate Devices', confidence: 0.9 },
          { name: 'Performance Testing', confidence: 0.85 }
        );
        break;
      case 'Technical File':
        sections.push(
          { name: 'Design Specifications', confidence: 0.93 },
          { name: 'Performance Characteristics', confidence: 0.91 },
          { name: 'Materials', confidence: 0.89 },
          { name: 'Manufacturing Process', confidence: 0.86 }
        );
        break;
      case 'Clinical Study Report':
        sections.push(
          { name: 'Study Objectives', confidence: 0.94 },
          { name: 'Methodology', confidence: 0.92 },
          { name: 'Results', confidence: 0.9 },
          { name: 'Conclusion', confidence: 0.95 }
        );
        break;
      case 'Instructions For Use':
        sections.push(
          { name: 'Indications for Use', confidence: 0.96 },
          { name: 'Warnings and Precautions', confidence: 0.97 },
          { name: 'Operating Instructions', confidence: 0.94 },
          { name: 'Maintenance', confidence: 0.85 }
        );
        break;
      case 'Clinical Evaluation Report':
        sections.push(
          { name: 'Clinical Data Evaluation', confidence: 0.93 },
          { name: 'Literature Review', confidence: 0.91 },
          { name: 'Risk Analysis', confidence: 0.89 },
          { name: 'Benefit-Risk Profile', confidence: 0.92 }
        );
        break;
      default:
        sections.push(
          { name: 'Executive Summary', confidence: 0.85 },
          { name: 'Regulatory Information', confidence: 0.82 }
        );
    }

    return sections;
  }

  /**
   * Calculate content match confidence
   * @private
   */
  _calculateContentMatchConfidence(content, documentType) {
    // For demo purposes, this simulates content match confidence calculation
    // More sophisticated implementations would use NLP and pattern matching

    const typeKeywords = {
      '510(k) Submission': ['510(k)', 'submission', 'substantial', 'equivalence', 'predicate'],
      'Technical File': ['technical', 'specification', 'design', 'material', 'manufacturing'],
      'Clinical Study Report': ['clinical', 'study', 'protocol', 'results', 'investigation'],
      'Instructions For Use': ['instructions', 'use', 'warnings', 'precautions', 'indications'],
      'Predicate Device Information': ['predicate', 'device', 'comparison', 'equivalence'],
      'Clinical Evaluation Report': ['clinical', 'evaluation', 'literature', 'data', 'assessment'],
      'Regulatory Document': ['regulatory', 'compliance', 'standards', 'requirements'],
    };

    const keywords = typeKeywords[documentType] || [];
    const lowerContent = content.toLowerCase();

    // Count keyword matches
    let matches = 0;
    keywords.forEach(keyword => {
      if (lowerContent.includes(keyword)) {
        matches++;
      }
    });

    // Calculate confidence (base + match percentage)
    return 0.6 + 0.4 * (matches / keywords.length);
  }

  /**
   * Calculate filename match confidence
   * @private
   */
  _calculateFilenameMatchConfidence(filename, documentType) {
    // For demo purposes, this simulates filename match confidence calculation
    const typeParts = documentType.toLowerCase().split(/\s+/);
    const filenameParts = filename.toLowerCase().split(/[_\-\s.]/);

    // Count matching parts
    let matches = 0;
    typeParts.forEach(part => {
      if (part.length > 2 && filenameParts.some(filePart => filePart.includes(part))) {
        matches++;
      }
    });

    // Calculate confidence (base + match percentage)
    return 0.5 + 0.5 * Math.min(1, matches / typeParts.length);
  }

  /**
   * Calculate overall confidence from multiple confidence metrics
   * @private
   */
  _calculateOverallConfidence(confidenceMetrics) {
    // For demo purposes, this calculates a weighted average of confidence metrics
    const {
      contentMatch = 0,
      filenameMatch = 0,
      structureMatch = 0,
      templateMatch = 0,
      detailedAnalysis = 0,
    } = confidenceMetrics;

    // Define weights for each factor
    const weights = {
      contentMatch: 0.4,
      filenameMatch: 0.2,
      structureMatch: 0.2,
      templateMatch: templateMatch > 0 ? 0.3 : 0,
      detailedAnalysis: detailedAnalysis > 0 ? 0.3 : 0,
    };

    // Normalize weights to sum to 1
    const totalWeight = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    const normalizedWeights = {};
    Object.entries(weights).forEach(([key, weight]) => {
      normalizedWeights[key] = weight / totalWeight;
    });

    // Calculate weighted average
    let overallConfidence = 0;
    Object.entries(normalizedWeights).forEach(([key, weight]) => {
      if (key in confidenceMetrics && confidenceMetrics[key] > 0) {
        overallConfidence += confidenceMetrics[key] * weight;
      }
    });

    return Math.min(1, Math.max(0, overallConfidence));
  }

  /**
   * Perform detailed type analysis on document content
   * @private
   */
  _performDetailedTypeAnalysis(content, documentType, regulatoryContext) {
    // For demo purposes, this simulates detailed document analysis
    // In a real implementation, this would use more sophisticated NLP techniques

    // Create detail analysis object
    const detailAnalysis = {
      keyPhrases: this._extractKeyPhrases(content, documentType),
      regulatoryReferences: this._extractRegulatoryReferences(content, regulatoryContext),
      confidence: 0.85,
      confidenceFactors: {
        phraseRelevance: 0.87,
        structuralElements: 0.83,
        regulatoryAlignment: 0.88,
      },
    };

    return detailAnalysis;
  }

  /**
   * Extract key phrases from content
   * @private
   */
  _extractKeyPhrases(content, documentType) {
    // For demo purposes, this simulates key phrase extraction
    // In a real implementation, this would use NLP techniques

    // Create simple key phrases
    return [
      'medical device',
      'intended for use in clinical settings',
      'continuous monitoring',
      'regulatory compliance',
      'safety and performance',
    ];
  }

  /**
   * Extract regulatory references from content
   * @private
   */
  _extractRegulatoryReferences(content, regulatoryContext) {
    // For demo purposes, this simulates regulatory reference extraction

    if (regulatoryContext === '510k') {
      return [
        { reference: '21 CFR 807.92', confidence: 0.92 },
        { reference: '21 CFR 870.2300', confidence: 0.88 },
      ];
    } else if (regulatoryContext === 'cer') {
      return [
        { reference: 'MEDDEV 2.7/1 Rev 4', confidence: 0.94 },
        { reference: 'MDR 2017/745', confidence: 0.91 },
      ];
    }

    return [];
  }

  /**
   * Calculate regulatory relevance score
   * @private
   */
  _calculateRegulatoryRelevance(documentType, regulatoryContext) {
    // For demo purposes, this calculates relevance of document type to context

    const relevanceMap = {
      '510k': {
        '510(k) Submission': 1.0,
        'Predicate Device Information': 0.95,
        'Technical File': 0.85,
        'Instructions For Use': 0.75,
        'Clinical Study Report': 0.8,
        'Clinical Evaluation Report': 0.6,
        'Regulatory Document': 0.5,
      },
      cer: {
        'Clinical Evaluation Report': 1.0,
        'Clinical Study Report': 0.95,
        'Technical File': 0.8,
        'Instructions For Use': 0.7,
        '510(k) Submission': 0.5,
        'Predicate Device Information': 0.4,
        'Regulatory Document': 0.5,
      },
    };

    return (
      (relevanceMap[regulatoryContext] && relevanceMap[regulatoryContext][documentType]) || 0.3
    );
  }

  /**
   * Refine document type based on template match
   * @private
   */
  _refineTypeBasedOnTemplate(templateId, initialType) {
    // For demo purposes, this refines document type based on template

    const templateTypeMap = {
      'tmpl-510k-full': '510(k) Submission',
      'tmpl-510k-trad': '510(k) Submission',
      'tmpl-510k-abbr': '510(k) Submission',
      'tmpl-510k-spec': '510(k) Submission',
      'tmpl-cer-mdr': 'Clinical Evaluation Report',
      'tmpl-cer-meddev': 'Clinical Evaluation Report',
      'tmpl-cer-lit': 'Clinical Evaluation Report',
      'tmpl-ifu-pro': 'Instructions For Use',
      'tmpl-ifu-pat': 'Instructions For Use',
      'tmpl-tech-file': 'Technical File',
      'tmpl-tech-dossier': 'Technical File',
    };

    return templateTypeMap[templateId] || initialType;
  }

  /**
   * Generate targeted extraction data
   * @private
   */
  _generateTargetedExtractionData(processedDocuments, regulatoryContext, targetedFields) {
    // For demo purposes, this generates extraction data for specified fields
    const baseData = {
      confidence: 0.88,
      sourceDocuments: processedDocuments.map(doc => doc.id),
    };

    // Add targeted fields
    targetedFields.forEach(field => {
      switch (field) {
        case 'deviceName':
          baseData.deviceName = 'CardioMonitor 2000';
          break;
        case 'manufacturer':
          baseData.manufacturer = 'MedTech Innovations';
          break;
        case 'productCode':
          baseData.productCode = 'DRT';
          break;
        case 'deviceClass':
          baseData.deviceClass = 'II';
          break;
        case 'intendedUse':
          baseData.intendedUse =
            'Continuous monitoring of cardiac rhythm and vital signs in clinical settings';
          break;
        case 'description':
          baseData.description = 'A medical device designed for diagnostic procedures';
          break;
        case 'regulatoryClass':
          baseData.regulatoryClass = 'II';
          break;
        case 'modelNumber':
          baseData.modelNumber = 'CM2000-X1';
          break;
        case 'standards':
          baseData.standards = ['IEC 60601-1', 'IEC 60601-1-2', 'IEC 60601-2-27'];
          break;
        case 'technicalSpecifications':
          baseData.technicalSpecifications = {
            dimensions: '12.5" x 8.3" x 3.2"',
            weight: '2.4 kg',
            display: '10.1" color touchscreen',
            batteryLife: '8 hours',
            connectivity: 'Wi-Fi, Bluetooth, Ethernet',
            storageCapacity: '64 GB',
          };
          break;
        // Add other fields as needed
      }
    });

    return baseData;
  }

  /**
   * Compare data across multiple documents
   * @private
   */
  async _compareDataAcrossDocuments(processedDocuments, extractedData) {
    // For demo purposes, this simulates comparing data across documents

    // Initialize comparison results structure
    const comparisonResults = {
      consistencyScore: 0,
      conflicts: [],
      enhancements: [],
      documentSources: {},
    };

    // Simulate field sources by document
    const fieldSourceMap = {};
    const fields = Object.keys(extractedData).filter(
      key =>
        key !== 'confidence' &&
        key !== 'sourceDocuments' &&
        key !== 'validation' &&
        key !== 'confidenceScores' &&
        key !== 'comparisonResults' &&
        !key.endsWith('Confidence')
    );

    // Assign documents as sources for various fields
    processedDocuments.forEach(doc => {
      // Randomly assign 2-5 fields to each document
      const fieldCount = 2 + Math.floor(Math.random() * 4);
      const docFields = this._getRandomItems(fields, fieldCount);

      docFields.forEach(field => {
        if (!fieldSourceMap[field]) {
          fieldSourceMap[field] = [];
        }
        fieldSourceMap[field].push(doc.id);
      });
    });

    // Record document sources for each field
    fields.forEach(field => {
      comparisonResults.documentSources[field] = fieldSourceMap[field] || [
        processedDocuments[0]?.id,
      ];
    });

    // Simulate conflict fields (fields with data from multiple docs that might conflict)
    const potentialConflictFields = fields.filter(
      field => fieldSourceMap[field] && fieldSourceMap[field].length > 1
    );

    // Generate simulated conflicts for 1-3 fields
    const conflictCount = Math.min(
      potentialConflictFields.length,
      1 + Math.floor(Math.random() * 2)
    );
    const conflictFields = this._getRandomItems(potentialConflictFields, conflictCount);

    conflictFields.forEach(field => {
      const sources = fieldSourceMap[field];

      comparisonResults.conflicts.push({
        field,
        severity: Math.random() > 0.5 ? 'high' : 'medium',
        description: `Different values for ${field} found across documents`,
        sources,
        recommendation: `Verify ${field} against primary source documentation`,
      });
    });

    // Generate enhancement opportunities
    const nonConflictFields = fields.filter(field => !conflictFields.includes(field));
    const enhancementCount = 1 + Math.floor(Math.random() * 2);
    const enhancementFields = this._getRandomItems(nonConflictFields, enhancementCount);

    enhancementFields.forEach(field => {
      comparisonResults.enhancements.push({
        field,
        source: fieldSourceMap[field]?.[0] || processedDocuments[0]?.id,
        description: `Additional ${field} details available from other documents`,
        suggestedValue: `Enhanced ${extractedData[field]}`,
      });
    });

    // Calculate overall consistency score (higher with fewer conflicts)
    comparisonResults.consistencyScore = 1 - (conflictCount / Math.max(fields.length, 1)) * 0.5;

    return comparisonResults;
  }

  /**
   * Get random items from an array
   * @private
   */
  _getRandomItems(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, Math.min(count, array.length));
  }

  /**
   * Generate a random date between two dates
   * @private
   */
  _randomDate(start, end) {
    return new Date(start.getTime() + Math.random() * (end.getTime() - start.getTime()));
  }

  /**
   * Generate detailed confidence score for a field
   * @private
   */
  _generateDetailedConfidenceScore(fieldName, fieldValue) {
    // For demo purposes, this generates a detailed confidence score

    // Base confidence score between 0.75 and 0.98
    const baseScore = 0.75 + Math.random() * 0.23;

    // Create confidence factors
    const factors = {
      textMatch: 0.7 + Math.random() * 0.25,
      contextAlignment: 0.75 + Math.random() * 0.25,
      consistencyScore: 0.8 + Math.random() * 0.2,
    };

    // Adjust based on field type
    if (typeof fieldValue === 'object' && fieldValue !== null) {
      factors.structureValidity = 0.85 + Math.random() * 0.15;
    }

    if (Array.isArray(fieldValue)) {
      factors.arrayCompleteness = 0.7 + Math.random() * 0.3;
    }

    // Calculate overall score (weighted average)
    const overallScore =
      Object.values(factors).reduce((sum, score) => sum + score, 0) / Object.keys(factors).length;

    return {
      overall: Math.min(0.98, overallScore),
      factors,
    };
  }

  /**
   * Validate extracted data against regulatory requirements
   * @private
   */
  _validateExtractedData(extractedData, regulatoryContext) {
    // For demo purposes, this validates extracted data against regulatory requirements

    const validation = {
      valid: true,
      completeness: 0.9,
      regulatoryCompliance: 0.85,
      missingFields: [],
      warnings: [],
      suggestions: [],
    };

    // Check for missing required fields
    const requiredFields =
      {
        '510k': ['deviceName', 'manufacturer', 'intendedUse', 'deviceClass', 'productCode'],
        cer: ['deviceName', 'manufacturer', 'intendedUse', 'clinicalEvaluation'],
      }[regulatoryContext] || [];

    requiredFields.forEach(field => {
      if (!extractedData[field]) {
        validation.valid = false;
        validation.missingFields.push(field);
        validation.completeness -= 0.15;
      }
    });

    // Add warnings for low confidence fields
    Object.keys(extractedData).forEach(key => {
      if (key.endsWith('Confidence') && extractedData[key] < 0.7) {
        const baseField = key.replace('Confidence', '');
        validation.warnings.push({
          field: baseField,
          issue: `Low confidence score (${Math.round(extractedData[key] * 100)}%)`,
          recommendation: 'Verify this field manually',
        });
      }
    });

    // Add suggestions for improvements
    if (regulatoryContext === '510k' && !extractedData.standards) {
      validation.suggestions.push({
        field: 'standards',
        suggestion: 'Consider adding applicable standards to strengthen the submission',
      });
    }

    if (!extractedData.riskAnalysis) {
      validation.suggestions.push({
        field: 'riskAnalysis',
        suggestion: 'Consider including risk analysis information',
      });
    }

    return validation;
  }

  /**
   * Estimate page count based on file size
   * @private
   */
  _estimatePageCount(fileSize) {
    // Rough estimate: 100 KB per page for PDFs
    return Math.max(1, Math.round(fileSize / (100 * 1024)));
  }

  /**
   * Get file type based on filename
   * @private
   */
  _getFileType(filename) {
    const extension = filename.split('.').pop().toLowerCase();

    const typeMap = {
      pdf: 'PDF Document',
      doc: 'Word Document',
      docx: 'Word Document',
      xls: 'Excel Spreadsheet',
      xlsx: 'Excel Spreadsheet',
      txt: 'Text File',
      xml: 'XML File',
      json: 'JSON File',
    };

    return typeMap[extension] || 'Unknown File Type';
  }

  /**
   * Extract text content from a file
   * @private
   */
  async _extractTextContent(file) {
    // For demo purposes, we'll return a placeholder text based on file type
    // In a real implementation, this would extract actual text from the file
    const extension = file.name.split('.').pop().toLowerCase();

    if (['pdf', 'doc', 'docx'].includes(extension)) {
      return `[Extracted text content from ${file.name}]\n\nThis device is designed for continuous monitoring of cardiac rhythm and vital signs in clinical settings. The CardioMonitor 2000 is a Class II medical device with product code DRT, manufactured by MedTech Innovations. It provides real-time monitoring of heart rate, ECG, blood pressure, and oxygen saturation levels.\n\nThe device is intended for use in hospitals, clinics, and other healthcare facilities under the supervision of healthcare professionals. It features advanced algorithms for arrhythmia detection and provides audible and visual alerts for abnormal vital signs.`;
    } else if (['xls', 'xlsx'].includes(extension)) {
      return `[Tabular data extracted from ${file.name}]\n\nSpecification Value\nDimensions 12.5" x 8.3" x 3.2"\nWeight 2.4 kg\nDisplay 10.1" color touchscreen\nBattery life 8 hours\nWireless connectivity Wi-Fi, Bluetooth\nMemory capacity 64 GB\nSampling rate 250 Hz`;
    } else {
      return `[Text content from ${file.name}]\n\nThis is simulated content for demonstration purposes. In a real implementation, the actual content of the file would be extracted and processed using OCR for images or direct text extraction for text-based files.`;
    }
  }

  /**
   * Generate extracted data based on processed documents
   * @private
   */
  _generateExtractedData(processedDocuments, regulatoryContext, extractionMode) {
    // Base data for demonstration
    const baseData = {
      deviceName: 'CardioMonitor 2000',
      manufacturer: 'MedTech Innovations',
      productCode: 'DRT',
      deviceClass: 'II',
      intendedUse: 'Continuous monitoring of cardiac rhythm and vital signs in clinical settings',
      description: 'A medical device designed for diagnostic procedures',
      regulatoryClass: 'II',
      status: 'active',
      confidence: 0.82,
      sourceDocuments: processedDocuments.map(doc => doc.id),
    };

    // Add fields based on extraction mode
    if (extractionMode === 'basic') {
      return baseData;
    }

    if (
      extractionMode === 'enhanced' ||
      extractionMode === 'regulatory' ||
      extractionMode === 'comprehensive'
    ) {
      const enhancedData = {
        ...baseData,
        modelNumber: 'CM2000-X1',
        softwareVersion: '3.2.1',
        powerSource: 'Rechargeable lithium-ion battery and AC power',
        standards: ['IEC 60601-1', 'IEC 60601-1-2', 'IEC 60601-2-27'],
        confidence: 0.85,
      };

      if (extractionMode === 'regulatory' || extractionMode === 'comprehensive') {
        const regulatoryData = {
          ...enhancedData,
          regulatoryPath:
            regulatoryContext === '510k' ? '510(k) Premarket Notification' : 'CE Marking (MDR)',
          classification:
            regulatoryContext === '510k' ? 'Class II (21 CFR 870.2300)' : 'Class IIa (Rule 10)',
          reviewPanel: 'Cardiovascular',
          confidence: 0.88,
        };

        if (extractionMode === 'comprehensive') {
          return {
            ...regulatoryData,
            technicalSpecifications: {
              dimensions: '12.5" x 8.3" x 3.2"',
              weight: '2.4 kg',
              display: '10.1" color touchscreen',
              batteryLife: '8 hours',
              connectivity: 'Wi-Fi, Bluetooth, Ethernet',
              storageCapacity: '64 GB',
            },
            performance: {
              ecgChannels: 12,
              samplingRate: '250 Hz',
              filterSettings: '0.5-40 Hz',
              temperatureRange: '10-40°C',
              alarmCategories: ['Physiological', 'Technical'],
            },
            adverseEvents: [
              'No serious adverse events reported',
              'Minor skin irritation from electrodes (0.2%)',
            ],
            confidence: 0.92,
          };
        }

        return regulatoryData;
      }

      return enhancedData;
    }

    return baseData;
  }

  /**
   * Validate extracted data
   * @private
   */
  _validateExtractedData(data, regulatoryContext) {
    const issues = [];
    const warnings = [];

    // Check required fields based on regulatory context
    const requiredFields = {
      '510k': ['deviceName', 'manufacturer', 'productCode', 'deviceClass', 'intendedUse'],
      cer: ['deviceName', 'manufacturer', 'regulatoryClass', 'intendedUse', 'description'],
    }[regulatoryContext] || ['deviceName', 'manufacturer'];

    // Check for missing required fields
    requiredFields.forEach(field => {
      if (!data[field]) {
        issues.push({
          field,
          message: `Required field '${field}' is missing.`,
        });
      }
    });

    // Check for low confidence scores
    Object.keys(data).forEach(key => {
      if (key.endsWith('Confidence') && data[key] < 0.6) {
        const field = key.replace('Confidence', '');
        warnings.push({
          field,
          message: `Low confidence score (${Math.round(data[key] * 100)}%) for field '${field}'.`,
        });
      }
    });

    // Check for specific field validations
    if (data.deviceClass && !['I', 'II', 'III'].includes(data.deviceClass)) {
      warnings.push({
        field: 'deviceClass',
        message: `Unusual device class '${data.deviceClass}'. Expected 'I', 'II', or 'III'.`,
      });
    }

    return {
      valid: issues.length === 0,
      issues,
      warnings,
    };
  }

  /**
   * Generate a random confidence score
   * @private
   */
  _generateConfidenceScore() {
    // Generate a random score between 0.6 and 0.98
    return Math.round((0.6 + Math.random() * 0.38) * 100) / 100;
  }

  /**
   * Enhance a device description
   * @private
   */
  _enhanceDescription(description) {
    return `${description}. The CardioMonitor 2000 is an advanced cardiac monitoring system that provides real-time ECG monitoring, arrhythmia detection, and vital signs tracking. It features a high-resolution touchscreen display and wireless connectivity for seamless integration with hospital information systems.`;
  }

  /**
   * Enhance intended use statement
   * @private
   */
  _enhanceIntendedUse(intendedUse) {
    return `${intendedUse}. It is specifically designed for use in intensive care units, cardiac care units, and emergency departments where continuous monitoring of patient vital signs is essential. The device is not intended for home use or ambulatory monitoring outside of clinical environments.`;
  }

  /**
   * Generate substantial equivalence information
   * @private
   */
  _generateSubstantialEquivalence(data) {
    return {
      predicateDevices: [
        {
          name: 'CardioTrack X5',
          manufacturer: 'MedSystems, Inc.',
          k510Number: 'K123456',
          clearanceDate: '2022-05-15',
        },
      ],
      equivalenceStatement: `The CardioMonitor 2000 is substantially equivalent to the predicate device CardioTrack X5 in terms of intended use, technological characteristics, and performance specifications. Any differences between the subject device and the predicate device do not raise new questions of safety or effectiveness.`,
      comparisonTable: {
        intendedUse: 'Same',
        patientPopulation: 'Same',
        environmentOfUse: 'Same',
        measuredParameters: 'Subject device adds SpO2 monitoring',
        alarmFeatures: 'Same',
        userInterface: 'Subject device has larger touchscreen display',
        dataStorage: 'Subject device has increased capacity',
      },
    };
  }

  /**
   * Determine risk level based on device data
   * @private
   */
  _determineRiskLevel(data) {
    const deviceClass = data.deviceClass || '';

    if (deviceClass === 'III') {
      return 'High';
    } else if (deviceClass === 'II') {
      return 'Moderate';
    } else {
      return 'Low';
    }
  }

  /**
   * Generate clinical evaluation information
   * @private
   */
  _generateClinicalEvaluation(data) {
    return {
      evaluationMethod: 'Literature review and clinical investigation',
      clinicalData: {
        studies: 2,
        totalPatients: 248,
        duration: '12 months',
        primaryEndpoint: 'Accuracy of cardiac rhythm detection compared to standard 12-lead ECG',
      },
      conclusion: `Clinical evaluation demonstrates that the ${data.deviceName || 'device'} performs as intended and the benefits outweigh the risks. The device meets applicable safety and performance requirements.`,
    };
  }

  /**
   * Generate benefit-risk assessment
   * @private
   */
  _generateBenefitRiskAssessment(data) {
    return {
      benefits: [
        'Continuous monitoring of cardiac rhythm',
        'Early detection of cardiac arrhythmias',
        'Real-time alerts for deteriorating vital signs',
        'Integration with hospital information systems',
      ],
      risks: [
        'Potential for false alarms',
        'Minor skin irritation from electrodes',
        'Misinterpretation of data if device is improperly used',
      ],
      mitigations: [
        'Comprehensive user training',
        'Clear labeling and instructions for use',
        'Advanced alarm management system',
        'Regular software updates',
      ],
      conclusion:
        'The benefits of the device significantly outweigh the identified risks when the device is used as intended.',
    };
  }
}

// Create and export singleton instance
export const documentIntelligenceService = new DocumentIntelligenceService();
