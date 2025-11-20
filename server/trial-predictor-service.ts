/**
 * Trial Predictor Service
 *
 * This service provides AI-powered predictions for clinical trial success
 * probability based on key trial parameters.
 */

// Create a simple prediction model for demonstration purposes
export interface PredictionResult {
  probability: number;
  featureContributions: Record<string, number>;
}

export class TrialPredictorService {
  /**
   * Predict the success probability of a clinical trial based on key parameters
   *
   * @param sampleSize - Number of participants
   * @param durationWeeks - Trial duration in weeks
   * @param dropoutRate - Expected dropout rate (0-1)
   * @returns Prediction result with success probability and feature contributions
   */
  async predictTrialSuccess(
    sampleSize: number,
    durationWeeks: number,
    dropoutRate: number
  ): Promise<PredictionResult> {
    // Base success rate for an average trial
    const baseProbability = 0.5;

    // Success rate adjustments based on parameters
    const sampleSizeContribution = this.getSampleSizeContribution(sampleSize);
    const durationContribution = this.getDurationContribution(durationWeeks);
    const dropoutContribution = this.getDropoutContribution(dropoutRate);

    // Calculate total probability with max/min bounds
    let probability =
      baseProbability + sampleSizeContribution + durationContribution + dropoutContribution;
    probability = Math.max(0.05, Math.min(0.95, probability)); // Keep between 5% and 95%

    return {
      probability,
      featureContributions: {
        'Sample Size': sampleSizeContribution,
        Duration: durationContribution,
        'Dropout Rate': dropoutContribution,
      },
    };
  }

  /**
   * Get contribution to success probability from sample size
   */
  private getSampleSizeContribution(sampleSize: number): number {
    if (sampleSize < 50) {
      return -0.15; // Small sample sizes reduce success probability
    } else if (sampleSize < 100) {
      return -0.05;
    } else if (sampleSize < 200) {
      return 0.05;
    } else if (sampleSize < 500) {
      return 0.1;
    } else {
      return 0.15; // Large sample sizes increase success probability
    }
  }

  /**
   * Get contribution to success probability from duration
   */
  private getDurationContribution(durationWeeks: number): number {
    if (durationWeeks < 12) {
      return 0.05; // Shorter trials have less time for adverse events
    } else if (durationWeeks < 26) {
      return 0.02;
    } else if (durationWeeks < 52) {
      return 0;
    } else if (durationWeeks < 104) {
      return -0.05;
    } else {
      return -0.1; // Very long trials have more time for adverse events
    }
  }

  /**
   * Get contribution to success probability from dropout rate
   */
  private getDropoutContribution(dropoutRate: number): number {
    if (dropoutRate < 0.05) {
      return 0.15; // Very low dropout is positive
    } else if (dropoutRate < 0.1) {
      return 0.1;
    } else if (dropoutRate < 0.15) {
      return 0.05;
    } else if (dropoutRate < 0.25) {
      return -0.05;
    } else if (dropoutRate < 0.4) {
      return -0.15;
    } else {
      return -0.25; // Very high dropout is negative
    }
  }

  /**
   * Check if the model is ready (always returns true for this implementation)
   */
  modelExists(): boolean {
    return true;
  }

  /**
   * Get feature importance for the model
   */
  getFeatureImportance(): Record<string, number> {
    return {
      'Sample Size': 0.35,
      Duration: 0.25,
      'Dropout Rate': 0.4,
    };
  }
}

export const trialPredictorService = new TrialPredictorService();
