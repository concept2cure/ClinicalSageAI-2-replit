import { HuggingFaceInference } from '@langchain/community/llms/hf';

// Supported languages for translation
export const supportedLanguages = [
  { code: 'en', name: 'English' },
  { code: 'es', name: 'Spanish' },
  { code: 'fr', name: 'French' },
  { code: 'de', name: 'German' },
  { code: 'zh', name: 'Chinese' },
  { code: 'ja', name: 'Japanese' },
  { code: 'ko', name: 'Korean' },
  { code: 'pt', name: 'Portuguese' },
  { code: 'ru', name: 'Russian' },
];

/**
 * Translation service using open-source models
 */
export class TranslationService {
  private isModelAvailable: boolean;

  constructor() {
    // Check if we're in a production environment with access to models
    this.isModelAvailable = !!process.env.HF_API_KEY;
  }

  /**
   * Translate text from one language to another
   */
  async translateText(
    text: string,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<string> {
    // Don't translate if source and target are the same
    if (sourceLanguage === targetLanguage) {
      return text;
    }

    if (this.isModelAvailable) {
      try {
        // Use HuggingFace Inference model if API key is available
        const model = new HuggingFaceInference({
          model: 'Helsinki-NLP/opus-mt-' + sourceLanguage + '-' + targetLanguage,
          apiKey: process.env.HF_API_KEY,
        });

        return await model._call(text, {});
      } catch (error) {
        console.error('Translation model error:', error);
        // Fall back to mock implementation if model fails
        return this.mockTranslate(text, targetLanguage);
      }
    } else {
      // Use mock implementation if model is not available
      return this.mockTranslate(text, targetLanguage);
    }
  }

  /**
   * Mock translation for demo purposes
   */
  private mockTranslate(text: string, targetLanguage: string): string {
    const targetLang =
      supportedLanguages.find(l => l.code === targetLanguage)?.name || targetLanguage;
    return `[${targetLang} Translation] ${text}`;
  }

  /**
   * Translate CSR details from one language to another
   */
  async translateCsrDetails(
    details: any,
    sourceLanguage: string,
    targetLanguage: string
  ): Promise<any> {
    // Don't translate if source and target are the same
    if (sourceLanguage === targetLanguage) {
      return details;
    }

    const translatedDetails = { ...details };

    // Translate string fields
    for (const field of [
      'studyDesign',
      'primaryObjective',
      'studyDescription',
      'inclusionCriteria',
      'exclusionCriteria',
      'studyDuration',
    ]) {
      if (details[field]) {
        translatedDetails[field] = await this.translateText(
          details[field],
          sourceLanguage,
          targetLanguage
        );
      }
    }

    // Translate treatment arms
    if (details.treatmentArms && Array.isArray(details.treatmentArms)) {
      translatedDetails.treatmentArms = await Promise.all(
        details.treatmentArms.map(async (arm: any) => {
          return {
            ...arm,
            arm: await this.translateText(arm.arm, sourceLanguage, targetLanguage),
            intervention: await this.translateText(
              arm.intervention,
              sourceLanguage,
              targetLanguage
            ),
            dosingRegimen: await this.translateText(
              arm.dosingRegimen,
              sourceLanguage,
              targetLanguage
            ),
          };
        })
      );
    }

    // Translate endpoints
    if (details.endpoints) {
      translatedDetails.endpoints = {
        primary: await this.translateText(
          details.endpoints.primary,
          sourceLanguage,
          targetLanguage
        ),
        secondary: await Promise.all(
          details.endpoints.secondary?.map((endpoint: string) =>
            this.translateText(endpoint, sourceLanguage, targetLanguage)
          ) || []
        ),
      };
    }

    // Translate results
    if (details.results) {
      translatedDetails.results = {
        primaryResults: await this.translateText(
          details.results.primaryResults,
          sourceLanguage,
          targetLanguage
        ),
        secondaryResults: await this.translateText(
          details.results.secondaryResults,
          sourceLanguage,
          targetLanguage
        ),
        biomarkerResults: await this.translateText(
          details.results.biomarkerResults,
          sourceLanguage,
          targetLanguage
        ),
      };
    }

    // Translate safety data
    if (details.safety) {
      translatedDetails.safety = {
        overallSafety: await this.translateText(
          details.safety.overallSafety,
          sourceLanguage,
          targetLanguage
        ),
      };

      // Translate optional safety fields if they exist
      for (const field of ['ariaResults', 'commonAEs', 'severeEvents', 'discontinuationRates']) {
        if (details.safety[field]) {
          translatedDetails.safety[field] = await this.translateText(
            details.safety[field],
            sourceLanguage,
            targetLanguage
          );
        }
      }
    }

    return translatedDetails;
  }

  /**
   * Translate regulatory text and guidelines
   */
  async translateRegulatoryGuidance(guidance: string, targetLanguage: string): Promise<string> {
    if (this.isModelAvailable) {
      try {
        // Use HuggingFace Inference model if API key is available
        const model = new HuggingFaceInference({
          model: 'Helsinki-NLP/opus-mt-en-' + targetLanguage,
          apiKey: process.env.HF_API_KEY,
        });

        const prompt = `
          Translate the following regulatory guidance from English to ${targetLanguage}.
          Use appropriate regulatory terminology and preserve all procedural, compliance,
          and technical requirements.

          Original guidance:
          ${guidance}
        `;

        return await model._call(prompt, {});
      } catch (error) {
        console.error('Regulatory translation error:', error);
        // Fall back to mock implementation if model fails
        return this.mockRegulatoryTranslate(guidance, targetLanguage);
      }
    } else {
      // Use mock implementation if model is not available
      return this.mockRegulatoryTranslate(guidance, targetLanguage);
    }
  }

  /**
   * Mock regulatory translation for demo purposes
   */
  private mockRegulatoryTranslate(guidance: string, targetLanguage: string): string {
    const targetLang =
      supportedLanguages.find(l => l.code === targetLanguage)?.name || targetLanguage;
    return `[${targetLang} Regulatory Translation] ${guidance}`;
  }
}

// Singleton instance
export const translationService = new TranslationService();
