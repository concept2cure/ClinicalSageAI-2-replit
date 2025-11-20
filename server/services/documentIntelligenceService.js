/**
 * Document Intelligence Service
 *
 * This service provides advanced document processing capabilities for regulatory documents,
 * including specialized document type recognition, multi-layer extraction, and regulatory
 * validation of extracted information.
 */
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');
const readFileAsync = promisify(fs.readFile);
const axios = require('axios');
const { Configuration, OpenAIApi } = require('openai');
const openai = require('openai');

// Initialize OpenAI client if API key is available
let openaiClient = null;
try {
  if (process.env.OPENAI_API_KEY) {
    openaiClient = new openai.OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }
} catch (error) {
  console.error('Error initializing OpenAI client:', error);
}

/**
 * Analyze and classify a document to determine its type and extract basic metadata
 *
 * @param {string} filePath Path to the document file
 * @param {string} regulatoryContext Regulatory context for classification ('510k', 'cer', etc.)
 * @returns {Promise<Object>} Document classification results
 */
async function classifyDocument(filePath, regulatoryContext) {
  try {
    // Get file extension and basic metadata
    const ext = path.extname(filePath).toLowerCase();
    const fileName = path.basename(filePath);
    const stats = await fs.promises.stat(filePath);

    // Initialize classification result with defaults
    let classification = {
      documentType: 'Unknown Document',
      confidence: 0.5,
      processingTimeMs: 0,
      contentStatistics: {
        totalPages: 1,
        extractedTextLength: 0,
        tableCount: 0,
        figureCount: 0,
        sectionCount: 0,
      },
    };

    // Start processing timer
    const startTime = Date.now();

    // Simple document type classification based on file name and extension
    // In a real implementation, this would use ML-based document classification

    // PDF-specific processing
    if (ext === '.pdf') {
      // Simulate PDF processing
      // In a real implementation, this would extract text and analyze PDF structure
      classification.contentStatistics.totalPages = Math.floor(Math.random() * 50) + 1;
      classification.contentStatistics.tableCount = Math.floor(Math.random() * 10);
      classification.contentStatistics.figureCount = Math.floor(Math.random() * 15);
      classification.contentStatistics.sectionCount = Math.floor(Math.random() * 20) + 5;
      classification.contentStatistics.extractedTextLength =
        Math.floor(Math.random() * 100000) + 5000;
    }

    // Classify document type based on regulatory context
    if (regulatoryContext === '510k') {
      const fileName_lower = fileName.toLowerCase();
      if (
        fileName_lower.includes('510') ||
        fileName_lower.includes('k') ||
        fileName_lower.includes('submission')
      ) {
        classification.documentType = '510(k) Submission';
        classification.confidence = 0.85;
      } else if (
        fileName_lower.includes('predicate') ||
        fileName_lower.includes('substantial equivalence')
      ) {
        classification.documentType = 'Predicate Device Information';
        classification.confidence = 0.9;
      } else if (fileName_lower.includes('test') || fileName_lower.includes('study')) {
        classification.documentType = 'Test Report';
        classification.confidence = 0.8;
      } else if (fileName_lower.includes('spec') || fileName_lower.includes('technical')) {
        classification.documentType = 'Technical Specifications';
        classification.confidence = 0.75;
      } else if (fileName_lower.includes('ifu') || fileName_lower.includes('instructions')) {
        classification.documentType = 'Instructions for Use';
        classification.confidence = 0.8;
      } else if (fileName_lower.includes('quality') || fileName_lower.includes('system')) {
        classification.documentType = 'Quality System Documentation';
        classification.confidence = 0.7;
      } else {
        // If no specific match, default to this
        classification.documentType = '510(k) Related Document';
        classification.confidence = 0.6;
      }
    } else if (regulatoryContext === 'cer') {
      const fileName_lower = fileName.toLowerCase();
      if (fileName_lower.includes('cer') || fileName_lower.includes('clinical evaluation')) {
        classification.documentType = 'Clinical Evaluation Report';
        classification.confidence = 0.9;
      } else if (
        fileName_lower.includes('clinical') &&
        (fileName_lower.includes('data') || fileName_lower.includes('study'))
      ) {
        classification.documentType = 'Clinical Data';
        classification.confidence = 0.85;
      } else if (fileName_lower.includes('literature') || fileName_lower.includes('review')) {
        classification.documentType = 'Literature Review';
        classification.confidence = 0.8;
      } else if (fileName_lower.includes('post') && fileName_lower.includes('market')) {
        classification.documentType = 'Post-Market Surveillance';
        classification.confidence = 0.85;
      } else if (fileName_lower.includes('risk')) {
        classification.documentType = 'Risk Analysis';
        classification.confidence = 0.75;
      } else {
        // If no specific match, default to this
        classification.documentType = 'CER Related Document';
        classification.confidence = 0.6;
      }
    }

    // For advanced classification, we would use OpenAI's API to analyze the document content
    // This is just mock functionality for now

    // End processing timer
    classification.processingTimeMs = Date.now() - startTime;

    return classification;
  } catch (error) {
    console.error('Error classifying document:', error);
    throw new Error(`Document classification failed: ${error.message}`);
  }
}

/**
 * Extract data from processed documents
 *
 * @param {Array} processedDocuments Array of processed document metadata
 * @param {string} regulatoryContext Regulatory context for extraction
 * @param {string} extractionMode Extraction detail level
 * @param {Object} options Additional options for extraction
 * @returns {Promise<Object>} Extracted data
 */
async function extractDataFromDocument(
  processedDocuments,
  regulatoryContext,
  extractionMode = 'comprehensive',
  options = {}
) {
  try {
    // In a real implementation, this would use the OpenAI API to extract structured data
    // from the document content, or other document parsing libraries

    // Create base data that will be present in all contexts
    const baseData = {
      deviceName: 'Advanced Medical Device X1',
      manufacturer: 'MedTech Innovations, Inc.',
      modelNumber: 'MDX-100',
      deviceClass: 'Class II',
      regulatoryStatus: 'Pending FDA Clearance',
      intendedUse:
        'For diagnostic and therapeutic use in clinical settings, specifically for monitoring and treatment of cardiac conditions in adult patients.',
      extractionTimestamp: new Date().toISOString(),
      extractionMode: extractionMode,
      extractionConfidence: 0.92,
      documentSources: processedDocuments.map(doc => ({
        id: doc.id,
        name: doc.name,
        type: doc.recognizedType,
        contributionScore: parseFloat((Math.random() * 0.5 + 0.5).toFixed(2)),
      })),
    };

    // Add context-specific data
    if (regulatoryContext === '510k') {
      return {
        ...baseData,
        predicateDevices: [
          {
            name: 'CardioMonitor X500',
            manufacturer: 'MedSystems Corp',
            k_number: 'K123456',
            clearanceDate: '2023-03-15',
            productCode: 'DQY',
            confidence: 0.95,
          },
          {
            name: 'HeartTrack Pro',
            manufacturer: 'Cardiovascular Devices Inc',
            k_number: 'K987654',
            clearanceDate: '2022-11-20',
            productCode: 'DQY',
            confidence: 0.89,
          },
        ],
        deviceSpecifications: {
          dimensions: '12 x 8 x 3 cm',
          weight: '280g',
          powerSupply: 'Rechargeable Li-ion battery, 3.7V, 2500mAh',
          connectivity: 'Bluetooth 5.0, WiFi 802.11ac',
          displayType: 'LCD Touch Screen, 4.5 inch diagonal',
          storageCapacity: '32GB internal flash storage',
          operatingTemperature: '10°C to 40°C',
          waterResistance: 'IPX4 rated',
        },
        productCode: 'DQY',
        regulatoryControls: {
          regulationNumber: '870.2300',
          classificationName: 'Cardiac Monitor (including cardiotachometer and rate alarm)',
          deviceClass: 'II',
          reviewPanel: 'Cardiovascular',
          productCode: 'DQY',
          lifeSustaining: false,
          implantable: false,
        },
        testingData: {
          biocompatibility: {
            performed: true,
            standards: ['ISO 10993-1', 'ISO 10993-5', 'ISO 10993-10'],
            results: 'All tests passed acceptance criteria',
          },
          softwareVerification: {
            performed: true,
            level: 'Moderate (Level of Concern)',
            standards: ['IEC 62304', 'FDA Software Validation Guidelines'],
            results: 'Software validation complete with no critical issues',
          },
          electricalSafety: {
            performed: true,
            standards: ['IEC 60601-1'],
            results: 'Passed all electrical safety requirements',
          },
          performance: {
            performed: true,
            standards: ['ISO 80601-2-61'],
            description:
              'Performance testing included accuracy, precision, and reproducibility of readings',
            results: 'Device met all performance requirements',
          },
        },
        substantialEquivalenceNarrative:
          'The Advanced Medical Device X1 is substantially equivalent to the predicate devices (CardioMonitor X500 and HeartTrack Pro) in terms of intended use, technological characteristics, and safety and effectiveness. Differences in the devices do not raise new questions of safety or effectiveness.',
      };
    } else if (regulatoryContext === 'cer') {
      return {
        ...baseData,
        clinicalData: {
          clinicalInvestigations: {
            totalStudies: 3,
            totalParticipants: 450,
            summary:
              'Three clinical investigations were conducted with a total of 450 participants to evaluate safety and performance.',
          },
          literatureReview: {
            totalReferences: 42,
            relevantReferences: 28,
            summary:
              '42 literature references were identified, of which 28 were deemed relevant to the clinical evaluation.',
          },
          postMarketData: {
            surveillancePeriod: '24 months',
            totalComplaints: 15,
            seriousIncidents: 0,
            summary:
              'Post-market surveillance data covering 24 months shows 15 non-serious complaints and no serious incidents.',
          },
        },
        benefitRiskAnalysis: {
          benefits: [
            'Improved diagnostic accuracy compared to predicate devices',
            'Non-invasive monitoring capabilities',
            'Real-time data transmission to healthcare providers',
            'Extended battery life enabling longer monitoring periods',
          ],
          risks: [
            'Potential for skin irritation at electrode contact points',
            'Possible data transmission interruptions in areas with poor connectivity',
            'Minimal risk of electrical safety issues',
          ],
          conclusion:
            'The clinical evaluation demonstrates that the benefits of the device significantly outweigh the risks when used as intended.',
        },
        standardsCompliance: [
          {
            standard: 'ISO 14971:2019',
            title: 'Medical devices — Application of risk management to medical devices',
            compliant: true,
          },
          {
            standard: 'ISO 13485:2016',
            title: 'Medical devices — Quality management systems',
            compliant: true,
          },
          {
            standard: 'IEC 60601-1',
            title:
              'Medical electrical equipment — General requirements for basic safety and essential performance',
            compliant: true,
          },
          {
            standard: 'IEC 62304:2006',
            title: 'Medical device software — Software life cycle processes',
            compliant: true,
          },
        ],
        stateOfTheArt: {
          currentTechnology:
            'Current cardiac monitoring technology typically utilizes digital signal processing with machine learning algorithms for arrhythmia detection.',
          deviceAdvantages:
            'The device incorporates more advanced noise reduction algorithms and improved battery efficiency compared to existing technologies.',
          medicalAlternatives:
            'Alternative approaches include implantable cardiac monitors, which are more invasive, and traditional Holter monitors, which offer less real-time data capabilities.',
        },
      };
    } else {
      // Generic extraction for other contexts
      return baseData;
    }
  } catch (error) {
    console.error('Error extracting data from documents:', error);
    throw new Error(`Data extraction failed: ${error.message}`);
  }
}

/**
 * Validate extracted data against regulatory requirements
 *
 * @param {Object} extractedData The extracted data to validate
 * @param {string} regulatoryContext Regulatory context for validation
 * @returns {Promise<Object>} Validation results
 */
async function validateExtractedData(extractedData, regulatoryContext) {
  try {
    // In a real implementation, this would check the extracted data against
    // regulatory requirements for the given context

    // Generate basic validation result
    const validationResult = {
      isValid: true,
      validationTimestamp: new Date().toISOString(),
      regulatoryContext,
      overallScore: 0.86,
      missingRequiredFields: [],
      warnings: [],
      errors: [],
      suggestions: [
        {
          field: 'intendedUse',
          message:
            'Consider expanding intended use description with more specific clinical contexts',
          severity: 'suggestion',
        },
      ],
      validatedFields: [],
    };

    // Validate common fields
    const commonFields = [
      { field: 'deviceName', required: true },
      { field: 'manufacturer', required: true },
      { field: 'deviceClass', required: true },
      { field: 'intendedUse', required: true },
      { field: 'modelNumber', required: false },
      { field: 'regulatoryStatus', required: false },
    ];

    // Add context-specific required fields
    if (regulatoryContext === '510k') {
      commonFields.push(
        { field: 'productCode', required: true },
        { field: 'predicateDevices', required: true },
        { field: 'substantialEquivalenceNarrative', required: true }
      );
    } else if (regulatoryContext === 'cer') {
      commonFields.push(
        { field: 'clinicalData', required: true },
        { field: 'benefitRiskAnalysis', required: true },
        { field: 'standardsCompliance', required: true }
      );
    }

    // Validate each field
    for (const field of commonFields) {
      const fieldName = field.field;
      const value = extractedData[fieldName];
      const valid = field.required ? !!value : true;

      // If required field is missing, add to missing fields list
      if (field.required && !valid) {
        validationResult.missingRequiredFields.push(fieldName);
      }

      // Calculate confidence score for the field (mock values for now)
      const score = valid ? Math.random() * 0.3 + 0.7 : Math.random() * 0.5;

      // Add to validated fields
      validationResult.validatedFields.push({
        field: fieldName,
        valid,
        score,
        required: field.required,
      });
    }

    // Update overall validation status based on missing required fields
    validationResult.isValid = validationResult.missingRequiredFields.length === 0;

    return validationResult;
  } catch (error) {
    console.error('Error validating extracted data:', error);
    throw new Error(`Data validation failed: ${error.message}`);
  }
}

module.exports = {
  classifyDocument,
  extractDataFromDocument,
  validateExtractedData,
};
