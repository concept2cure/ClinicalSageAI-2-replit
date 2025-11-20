/**
 * HuggingFace Models Configuration
 *
 * This file defines the models used for various NLP and ML tasks throughout the TrialSage platform.
 * We use HuggingFace's Inference API for all AI tasks to maintain control and ownership
 * of our intelligence pipeline and to avoid dependencies on proprietary models.
 */

interface HuggingFaceModelConfig {
  // Text generation and summarization
  textGeneration: string;
  summarization: string;
  questionAnswering: string;

  // Text embeddings and similarity
  textEmbeddings: string;
  semanticSearch: string;

  // Entity extraction and classification
  namedEntityRecognition: string;
  relationExtraction: string;
  textClassification: string;

  // Domain-specific models
  biomedicalNER: string;
  biomedicalRelationExtraction: string;
  clinicalOutcomePrediction: string;
  studyDesignGeneration: string;
  regulatoryComplianceAnalysis: string;
  trialSuccessPrediction: string;

  // Document processing
  documentSegmentation: string;
  tableExtraction: string;
  pdfTextExtraction: string;

  // Multimodal
  imageCaption: string;
  imageClassification: string;
}

export function getHuggingfaceModels(): HuggingFaceModelConfig {
  return {
    // Text generation and summarization models
    textGeneration: 'mistralai/Mistral-7B-Instruct-v0.2',
    summarization: 'facebook/bart-large-cnn',
    questionAnswering: 'deepset/roberta-base-squad2',

    // Text embeddings and similarity models
    textEmbeddings: 'sentence-transformers/all-MiniLM-L6-v2',
    semanticSearch: 'sentence-transformers/multi-qa-mpnet-base-dot-v1',

    // Entity extraction and classification
    namedEntityRecognition: 'dslim/bert-base-NER',
    relationExtraction: 'Babelscape/rebel-large',
    textClassification: 'ProsusAI/finbert',

    // Domain-specific models
    biomedicalNER: 'allenai/scibert_scivocab_uncased',
    biomedicalRelationExtraction: 'microsoft/BiomedNLP-PubMedBERT-base-uncased-abstract',
    clinicalOutcomePrediction: 'allenai/scibert_scivocab_uncased',
    studyDesignGeneration: 'meta-llama/Llama-2-7b-chat-hf',
    regulatoryComplianceAnalysis: 'sentence-transformers/all-MiniLM-L12-v2',
    trialSuccessPrediction: 'allenai/scibert_scivocab_uncased',

    // Document processing
    documentSegmentation: 'facebook/bart-large',
    tableExtraction: 'microsoft/table-transformer-detection',
    pdfTextExtraction: 'facebook/bart-large',

    // Multimodal
    imageCaption: 'Salesforce/blip-image-captioning-large',
    imageClassification: 'google/vit-base-patch16-224',
  };
}

/**
 * Get the appropriate model for a specific task with region-specific intelligence
 * @param task - The task for which a model is needed
 * @param region - Optional regulatory region (FDA, EMA, PMDA, NMPA)
 */
export function getModelForTask(task: keyof HuggingFaceModelConfig, region?: string): string {
  const models = getHuggingfaceModels();
  const baseModel = models[task];

  // For region-specific intelligence, we could have different fine-tuned models
  // This is a placeholder for future enhancement
  if (region) {
    switch (region.toUpperCase()) {
      case 'FDA':
      case 'EMA':
      case 'PMDA':
      case 'NMPA':
        // In the future, we could return region-specific fine-tuned models here
        break;
      default:
        break;
    }
  }

  return baseModel;
}

/**
 * Generate a system prompt that includes region-specific context for AI operations
 * @param task - The specific task being performed
 * @param region - Optional regulatory region (FDA, EMA, PMDA, NMPA)
 */
export function generateSystemPrompt(task: string, region?: string): string {
  let basePrompt = 'You are TrialSage, an expert in clinical trial analysis and protocol design.';

  // Add task-specific context
  switch (task) {
    case 'summarization':
      basePrompt += ' Provide concise, accurate summaries of clinical trial protocols and results.';
      break;
    case 'regulation':
      basePrompt += ' Analyze protocols for regulatory compliance and suggest improvements.';
      break;
    case 'design':
      basePrompt +=
        ' Generate optimal clinical trial designs based on historical data and scientific evidence.';
      break;
    case 'prediction':
      basePrompt +=
        ' Predict trial outcomes based on protocol design elements and historical patterns.';
      break;
    default:
      basePrompt +=
        ' Analyze clinical trial information with scientific accuracy and attention to detail.';
  }

  // Add region-specific context if provided
  if (region) {
    switch (region.toUpperCase()) {
      case 'FDA':
        basePrompt +=
          ' Focus specifically on FDA regulations and requirements for US-based clinical trials.';
        break;
      case 'EMA':
        basePrompt +=
          ' Focus specifically on EMA regulations and requirements for European clinical trials, including EU Clinical Trial Regulation.';
        break;
      case 'PMDA':
        basePrompt +=
          ' Focus specifically on PMDA regulations and requirements for Japanese clinical trials, with attention to ethnic factors.';
        break;
      case 'NMPA':
        basePrompt +=
          ' Focus specifically on NMPA regulations and requirements for clinical trials in China, including requirements for Chinese patient representation.';
        break;
      default:
        basePrompt += ' Consider global regulatory requirements while providing insights.';
    }
  }

  basePrompt +=
    ' Always provide evidence-based recommendations supported by data from our CSR database.';

  return basePrompt;
}
