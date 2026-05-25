/**
 * CSR Training Service for Concept2Cure
 *
 * This service handles the training and fine-tuning of models
 * on clinical study reports (CSRs) to extract structured data.
 */

import fs from 'fs';
import path from 'path';
import { db } from './db';
import { csrReports, csrDetails } from '../shared/schema';
import { sql } from 'drizzle-orm';
import { queryHuggingFace, trainCustomModel } from './huggingface-service';
import { huggingFaceService } from './huggingface-service';

// Export service functions as a single object
export const csrTrainingService = {
  processBatchForTraining,
  extractStructuredData,
  trainModels,
  makePrediction,
};

// Constants
const UPLOADS_DIR = path.join(process.cwd(), 'uploads');
const TRAINING_DIR = path.join(UPLOADS_DIR, 'training');
const DATASET_DIR = path.join(TRAINING_DIR, 'datasets');

// Ensure directories exist
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
if (!fs.existsSync(TRAINING_DIR)) {
  fs.mkdirSync(TRAINING_DIR, { recursive: true });
}
if (!fs.existsSync(DATASET_DIR)) {
  fs.mkdirSync(DATASET_DIR, { recursive: true });
}

// Model domains for different extraction tasks
const MODEL_DOMAINS = {
  ENDPOINTS: 'endpoints',
  TREATMENT_ARMS: 'treatment_arms',
  ELIGIBILITY: 'eligibility',
  STUDY_DESIGN: 'study_design',
  RESULTS: 'results',
  SAFETY: 'safety',
};

/**
 * Extract structured data from a CSR document using AI models
 *
 * @param csrText The raw text of the CSR document
 * @param reportId The ID of the CSR report
 * @returns Extracted structured data
 */
export async function extractStructuredData(csrText: string, reportId: number): Promise<any> {
  try {
    console.log(`Extracting structured data for report ID ${reportId}`);

    // Get report metadata
    const report = await db
      .select()
      .from(csrReports)
      .where(sql`${csrReports.id} = ${reportId}`)
      .limit(1);

    if (report.length === 0) {
      throw new Error(`Report with ID ${reportId} not found`);
    }

    const reportData = report[0];

    // Prepare context for the extraction
    const context = `
    REPORT TITLE: ${reportData.title}
    INDICATION: ${reportData.indication}
    SPONSOR: ${reportData.sponsor}
    PHASE: ${reportData.phase}
    STUDY ID: ${reportData.studyId || 'Unknown'}
    `;

    // Extract each type of structured data
    const [
      extractedEndpoints,
      extractedTreatmentArms,
      extractedEligibility,
      extractedStudyDesign,
      extractedSafety,
    ] = await Promise.all([
      extractEndpoints(csrText, context),
      extractTreatmentArms(csrText, context),
      extractEligibilityCriteria(csrText, context),
      extractStudyDesign(csrText, context),
      extractSafetyData(csrText, context),
    ]);

    // Combine all extracted data
    const structuredData = {
      reportId,
      studyDesign: extractedStudyDesign.studyDesign,
      primaryObjective: extractedStudyDesign.primaryObjective,
      studyDescription: extractedStudyDesign.description,
      inclusionCriteria: extractedEligibility.inclusionCriteria,
      exclusionCriteria: extractedEligibility.exclusionCriteria,
      treatmentArms: extractedTreatmentArms,
      endpoints: extractedEndpoints,
      safety: extractedSafety,
      results: {},
      processed: true,
      processingStatus: 'completed',
    };

    return structuredData;
  } catch (error: any) {
    console.error('Error extracting structured data:', error);
    throw new Error(`Failed to extract structured data: ${error.message}`);
  }
}

/**
 * Extract endpoints from CSR text
 *
 * @param csrText The raw text of the CSR document
 * @param context Additional context for the extraction
 * @returns Extracted endpoints
 */
async function extractEndpoints(csrText: string, context: string): Promise<any[]> {
  // Create a prompt for endpoint extraction
  const prompt = `
  ${context}
  
  TASK: Extract all the endpoints from the following clinical study report text. 
  For each endpoint, provide:
  1. The name of the endpoint
  2. Whether it is primary, secondary, or exploratory
  3. The specific measurement or assessment used
  4. The timepoints when it was assessed (if available)
  
  FORMAT YOUR RESPONSE AS JSON ARRAY:
  [
    {
      "name": "endpoint name",
      "type": "primary|secondary|exploratory",
      "measurement": "measurement method",
      "timepoints": ["timepoint1", "timepoint2"]
    }
  ]
  
  CSR TEXT:
  ${csrText.substring(0, 5000)}
  `;

  try {
    const response = await queryHuggingFace(prompt);

    // Extract JSON from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no JSON found, try to parse the whole response
    try {
      return JSON.parse(response);
    } catch (e) {
      console.warn('Could not parse endpoint JSON response:', e);
      return [];
    }
  } catch (error: any) {
    console.error('Error extracting endpoints:', error);
    return [];
  }
}

/**
 * Extract treatment arms from CSR text
 *
 * @param csrText The raw text of the CSR document
 * @param context Additional context for the extraction
 * @returns Extracted treatment arms
 */
async function extractTreatmentArms(csrText: string, context: string): Promise<any[]> {
  // Create a prompt for treatment arm extraction
  const prompt = `
  ${context}
  
  TASK: Extract all the treatment arms from the following clinical study report text.
  For each treatment arm, provide:
  1. The name of the arm
  2. Description of the treatment
  3. The type of arm (e.g., experimental, active comparator, placebo)
  4. Dosage information if available
  
  FORMAT YOUR RESPONSE AS JSON ARRAY:
  [
    {
      "name": "arm name",
      "description": "treatment description",
      "type": "experimental|active comparator|placebo|etc",
      "dosage": "dosage information"
    }
  ]
  
  CSR TEXT:
  ${csrText.substring(0, 5000)}
  `;

  try {
    const response = await queryHuggingFace(prompt);

    // Extract JSON from the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no JSON found, try to parse the whole response
    try {
      return JSON.parse(response);
    } catch (e) {
      console.warn('Could not parse treatment arms JSON response:', e);
      return [];
    }
  } catch (error: any) {
    console.error('Error extracting treatment arms:', error);
    return [];
  }
}

/**
 * Extract eligibility criteria from CSR text
 *
 * @param csrText The raw text of the CSR document
 * @param context Additional context for the extraction
 * @returns Extracted eligibility criteria
 */
async function extractEligibilityCriteria(
  csrText: string,
  context: string
): Promise<{ inclusionCriteria: string[]; exclusionCriteria: string[] }> {
  // Create a prompt for eligibility criteria extraction
  const prompt = `
  ${context}
  
  TASK: Extract all eligibility criteria from the following clinical study report text.
  Split them into inclusion and exclusion criteria.
  
  FORMAT YOUR RESPONSE AS JSON:
  {
    "inclusionCriteria": ["criterion 1", "criterion 2", ...],
    "exclusionCriteria": ["criterion 1", "criterion 2", ...]
  }
  
  CSR TEXT:
  ${csrText.substring(0, 5000)}
  `;

  try {
    const response = await queryHuggingFace(prompt);

    // Extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no JSON found, try to parse the whole response
    try {
      return JSON.parse(response);
    } catch (e) {
      console.warn('Could not parse eligibility criteria JSON response:', e);
      return { inclusionCriteria: [], exclusionCriteria: [] };
    }
  } catch (error: any) {
    console.error('Error extracting eligibility criteria:', error);
    return { inclusionCriteria: [], exclusionCriteria: [] };
  }
}

/**
 * Extract study design information from CSR text
 *
 * @param csrText The raw text of the CSR document
 * @param context Additional context for the extraction
 * @returns Extracted study design information
 */
async function extractStudyDesign(
  csrText: string,
  context: string
): Promise<{ studyDesign: string; primaryObjective: string; description: string }> {
  // Create a prompt for study design extraction
  const prompt = `
  ${context}
  
  TASK: Extract the study design information from the following clinical study report text.
  Include:
  1. The overall study design (e.g., randomized, double-blind, placebo-controlled)
  2. The primary objective of the study
  3. A short description of the study
  
  FORMAT YOUR RESPONSE AS JSON:
  {
    "studyDesign": "study design description",
    "primaryObjective": "primary objective statement",
    "description": "brief study description"
  }
  
  CSR TEXT:
  ${csrText.substring(0, 5000)}
  `;

  try {
    const response = await queryHuggingFace(prompt);

    // Extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no JSON found, try to parse the whole response
    try {
      return JSON.parse(response);
    } catch (e) {
      console.warn('Could not parse study design JSON response:', e);
      return {
        studyDesign: '',
        primaryObjective: '',
        description: '',
      };
    }
  } catch (error: any) {
    console.error('Error extracting study design:', error);
    return {
      studyDesign: '',
      primaryObjective: '',
      description: '',
    };
  }
}

/**
 * Extract safety data from CSR text
 *
 * @param csrText The raw text of the CSR document
 * @param context Additional context for the extraction
 * @returns Extracted safety data
 */
async function extractSafetyData(csrText: string, context: string): Promise<any> {
  // Create a prompt for safety data extraction
  const prompt = `
  ${context}
  
  TASK: Extract safety data from the following clinical study report text.
  Include:
  1. Common adverse events (AEs)
  2. Serious adverse events (SAEs)
  3. Discontinuations due to AEs
  4. Deaths, if any
  
  FORMAT YOUR RESPONSE AS JSON:
  {
    "commonAEs": [{"event": "event name", "frequency": "number or percentage"}],
    "seriousAEs": [{"event": "event name", "frequency": "number or percentage"}],
    "discontinuations": [{"reason": "reason description", "count": "number"}],
    "deaths": {"count": "number", "details": "description if available"}
  }
  
  CSR TEXT:
  ${csrText.substring(0, 5000)}
  `;

  try {
    const response = await queryHuggingFace(prompt);

    // Extract JSON from the response
    const jsonMatch = response.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }

    // If no JSON found, try to parse the whole response
    try {
      return JSON.parse(response);
    } catch (e) {
      console.warn('Could not parse safety data JSON response:', e);
      return {
        commonAEs: [],
        seriousAEs: [],
        discontinuations: [],
        deaths: { count: 0, details: '' },
      };
    }
  } catch (error: any) {
    console.error('Error extracting safety data:', error);
    return {
      commonAEs: [],
      seriousAEs: [],
      discontinuations: [],
      deaths: { count: 0, details: '' },
    };
  }
}

/**
 * Process a batch of CSR documents for training data
 *
 * @param reportIds Array of report IDs to process
 * @returns Status summary
 */
export async function processBatchForTraining(reportIds: number[]): Promise<any> {
  const results = {
    total: reportIds.length,
    processed: 0,
    failed: 0,
    datasetPath: '',
  };

  // Create a dataset file for training
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const datasetPath = path.join(DATASET_DIR, `training_dataset_${timestamp}.jsonl`);
  const datasetStream = fs.createWriteStream(datasetPath);

  for (const reportId of reportIds) {
    try {
      // Get the report data
      const report = await db
        .select()
        .from(csrReports)
        .where(sql`${csrReports.id} = ${reportId}`)
        .limit(1);

      if (report.length === 0) {
        console.warn(`Report with ID ${reportId} not found`);
        results.failed++;
        continue;
      }

      // Get the details data
      const details = await db
        .select()
        .from(csrDetails)
        .where(sql`${csrDetails.reportId} = ${reportId}`)
        .limit(1);

      if (details.length === 0) {
        console.warn(`Details for report ID ${reportId} not found`);
        results.failed++;
        continue;
      }

      // Create training examples for different extraction tasks
      const reportData = report[0];
      const detailsData = details[0];

      // Check if the file exists
      if (detailsData.filePath && fs.existsSync(detailsData.filePath)) {
        const fileContent = fs.readFileSync(detailsData.filePath, 'utf8');

        // Create training examples
        createEndpointTrainingExample(fileContent, detailsData, datasetStream);
        createTreatmentArmsTrainingExample(fileContent, detailsData, datasetStream);
        createEligibilityTrainingExample(fileContent, detailsData, datasetStream);
        createStudyDesignTrainingExample(fileContent, detailsData, datasetStream);

        results.processed++;
      } else {
        console.warn(`File not found for report ID ${reportId}`);
        results.failed++;
      }
    } catch (error: any) {
      console.error(`Error processing report ID ${reportId}:`, error);
      results.failed++;
    }
  }

  datasetStream.end();
  results.datasetPath = datasetPath;

  return results;
}

/**
 * Create a training example for endpoint extraction
 */
function createEndpointTrainingExample(text: string, details: any, outputStream: fs.WriteStream) {
  if (!details.endpoints || details.endpoints.length === 0) {
    return;
  }

  const example = {
    domain: MODEL_DOMAINS.ENDPOINTS,
    input: text.substring(0, 5000),
    output: JSON.stringify(details.endpoints),
  };

  outputStream.write(JSON.stringify(example) + '\n');
}

/**
 * Create a training example for treatment arms extraction
 */
function createTreatmentArmsTrainingExample(
  text: string,
  details: any,
  outputStream: fs.WriteStream
) {
  if (!details.treatmentArms || details.treatmentArms.length === 0) {
    return;
  }

  const example = {
    domain: MODEL_DOMAINS.TREATMENT_ARMS,
    input: text.substring(0, 5000),
    output: JSON.stringify(details.treatmentArms),
  };

  outputStream.write(JSON.stringify(example) + '\n');
}

/**
 * Create a training example for eligibility criteria extraction
 */
function createEligibilityTrainingExample(
  text: string,
  details: any,
  outputStream: fs.WriteStream
) {
  if (!details.inclusionCriteria && !details.exclusionCriteria) {
    return;
  }

  const eligibility = {
    inclusionCriteria: details.inclusionCriteria || [],
    exclusionCriteria: details.exclusionCriteria || [],
  };

  const example = {
    domain: MODEL_DOMAINS.ELIGIBILITY,
    input: text.substring(0, 5000),
    output: JSON.stringify(eligibility),
  };

  outputStream.write(JSON.stringify(example) + '\n');
}

/**
 * Create a training example for study design extraction
 */
function createStudyDesignTrainingExample(
  text: string,
  details: any,
  outputStream: fs.WriteStream
) {
  if (!details.studyDesign && !details.primaryObjective) {
    return;
  }

  const studyDesign = {
    studyDesign: details.studyDesign || '',
    primaryObjective: details.primaryObjective || '',
    description: details.studyDescription || '',
  };

  const example = {
    domain: MODEL_DOMAINS.STUDY_DESIGN,
    input: text.substring(0, 5000),
    output: JSON.stringify(studyDesign),
  };

  outputStream.write(JSON.stringify(example) + '\n');
}

/**
 * Train models on the generated datasets
 *
 * @param datasetPath Path to the training dataset
 * @returns Training status
 */
export async function trainModels(datasetPath: string): Promise<any> {
  try {
    if (!fs.existsSync(datasetPath)) {
      throw new Error(`Dataset file not found: ${datasetPath}`);
    }

    // Read the dataset and split by domain
    const dataset = fs
      .readFileSync(datasetPath, 'utf8')
      .split('\n')
      .filter(line => line.trim().length > 0)
      .map(line => JSON.parse(line));

    // Group examples by domain
    const domainExamples: Record<string, any[]> = {};

    for (const example of dataset) {
      if (!domainExamples[example.domain]) {
        domainExamples[example.domain] = [];
      }

      domainExamples[example.domain].push(example);
    }

    // Train models for each domain
    const trainingResults: Record<string, { examples: number; modelName: string; status: any }> =
      {};

    for (const domain of Object.keys(domainExamples)) {
      const examples = domainExamples[domain];

      if (examples.length < 10) {
        console.warn(
          `Not enough examples (${examples.length}) for domain ${domain}, skipping training`
        );
        continue;
      }

      // Create a domain-specific dataset file
      const domainDatasetPath = path.join(DATASET_DIR, `${domain}_dataset.jsonl`);
      const domainDatasetStream = fs.createWriteStream(domainDatasetPath);

      for (const example of examples) {
        domainDatasetStream.write(JSON.stringify(example) + '\n');
      }

      domainDatasetStream.end();

      // Train a model for this domain
      const modelName = `trialsage-${domain}-extractor`;
      const result = await trainCustomModel(domainDatasetPath, modelName);

      trainingResults[domain] = {
        examples: examples.length,
        modelName,
        status: result,
      };
    }

    return {
      totalExamples: dataset.length,
      domains: Object.keys(domainExamples).length,
      trainingResults,
    };
  } catch (error: any) {
    console.error('Error training models:', error);
    throw new Error(`Failed to train models: ${error.message}`);
  }
}

/**
 * Make predictions using the trained models
 *
 * @param text The text to make predictions on
 * @param domain The domain to use for predictions
 * @returns Prediction results
 */
export async function makePrediction(text: string, domain: string): Promise<any> {
  // Validate domain
  if (!Object.values(MODEL_DOMAINS).includes(domain)) {
    throw new Error(
      `Invalid domain: ${domain}. Valid domains: ${Object.values(MODEL_DOMAINS).join(', ')}`
    );
  }

  try {
    // Create a prompt based on the domain
    let prompt = '';

    switch (domain) {
      case MODEL_DOMAINS.ENDPOINTS:
        prompt = `
        TASK: Extract all the endpoints from the following clinical study report text. 
        For each endpoint, provide:
        1. The name of the endpoint
        2. Whether it is primary, secondary, or exploratory
        3. The specific measurement or assessment used
        4. The timepoints when it was assessed (if available)
        
        FORMAT YOUR RESPONSE AS JSON ARRAY:
        [
          {
            "name": "endpoint name",
            "type": "primary|secondary|exploratory",
            "measurement": "measurement method",
            "timepoints": ["timepoint1", "timepoint2"]
          }
        ]
        
        CSR TEXT:
        ${text.substring(0, 5000)}
        `;
        break;

      case MODEL_DOMAINS.TREATMENT_ARMS:
        prompt = `
        TASK: Extract all the treatment arms from the following clinical study report text.
        For each treatment arm, provide:
        1. The name of the arm
        2. Description of the treatment
        3. The type of arm (e.g., experimental, active comparator, placebo)
        4. Dosage information if available
        
        FORMAT YOUR RESPONSE AS JSON ARRAY:
        [
          {
            "name": "arm name",
            "description": "treatment description",
            "type": "experimental|active comparator|placebo|etc",
            "dosage": "dosage information"
          }
        ]
        
        CSR TEXT:
        ${text.substring(0, 5000)}
        `;
        break;

      case MODEL_DOMAINS.ELIGIBILITY:
        prompt = `
        TASK: Extract all eligibility criteria from the following clinical study report text.
        Split them into inclusion and exclusion criteria.
        
        FORMAT YOUR RESPONSE AS JSON:
        {
          "inclusionCriteria": ["criterion 1", "criterion 2", ...],
          "exclusionCriteria": ["criterion 1", "criterion 2", ...]
        }
        
        CSR TEXT:
        ${text.substring(0, 5000)}
        `;
        break;

      case MODEL_DOMAINS.STUDY_DESIGN:
        prompt = `
        TASK: Extract the study design information from the following clinical study report text.
        Include:
        1. The overall study design (e.g., randomized, double-blind, placebo-controlled)
        2. The primary objective of the study
        3. A short description of the study
        
        FORMAT YOUR RESPONSE AS JSON:
        {
          "studyDesign": "study design description",
          "primaryObjective": "primary objective statement",
          "description": "brief study description"
        }
        
        CSR TEXT:
        ${text.substring(0, 5000)}
        `;
        break;

      default:
        prompt = `
        Extract structured information from the following clinical study report text
        relating to ${domain}.
        
        FORMAT YOUR RESPONSE AS JSON.
        
        CSR TEXT:
        ${text.substring(0, 5000)}
        `;
    }

    // Use custom model or fall back to default model
    try {
      const modelName = `trialsage-${domain}-extractor`;
      const response = await queryHuggingFace(prompt, modelName);

      // Try to parse the response as JSON
      try {
        const jsonMatch = response.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(response);
      } catch (e) {
        console.warn(
          `Could not parse JSON from custom model response, falling back to default model`
        );
        const fallbackResponse = await queryHuggingFace(prompt);

        const jsonMatch = fallbackResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        return JSON.parse(fallbackResponse);
      }
    } catch (error: any) {
      console.error(`Error using custom model for ${domain}:`, error);

      // Fall back to default model
      const fallbackResponse = await queryHuggingFace(prompt);

      const jsonMatch = fallbackResponse.match(/\{[\s\S]*\}|\[[\s\S]*\]/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
      try {
        return JSON.parse(fallbackResponse);
      } catch (e) {
        console.error('Could not parse JSON from response:', e);
        return { error: 'Could not parse prediction result' };
      }
    }
  } catch (error: any) {
    console.error('Error making prediction:', error);
    throw new Error(`Failed to make prediction: ${error.message}`);
  }
}
