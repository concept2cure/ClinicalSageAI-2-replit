/**
 * PathwayAdvisor
 *
 * This service implements a rules-based expert system to recommend
 * appropriate regulatory pathways for medical devices based on
 * their characteristics and predicate device history.
 */

interface DeviceProfile {
  id?: string;
  name: string;
  model?: string;
  version?: string;
  manufacturer: string;
  productCode?: string;
  deviceClass?: string;
  intendedUse: string;
  indicationsForUse?: string;
  medicalSpecialty?: string;
  predicates?: Array<{
    id: string;
    name: string;
    manufacturer: string;
    clearanceDate: string;
  }>;
  regulatoryHistory?: Array<{
    type: string;
    number: string;
    date: string;
    description: string;
  }>;
  technologicalCharacteristics?: Array<{
    name: string;
    description: string;
    value: string;
  }>;
  keywords?: string[];
  organizationId?: string;
}

interface PredicateDevice {
  id: string;
  name: string;
  manufacturer: string;
  clearanceDate: string;
  productCode?: string;
  deviceClass?: string;
  decisionSummaryURL?: string;
}

interface PathwayRecommendation {
  recommendedPathway: string;
  confidenceLevel: number; // 0-1 scale
  rationale: string;
  alternativePathways: Array<{
    pathway: string;
    rationale: string;
  }>;
  additionalDocumentationNeeded: string[];
  regulatoryRisks: Array<{
    risk: string;
    severity: 'low' | 'medium' | 'high';
    mitigationStrategy: string;
  }>;
  estimatedTimeline: {
    preparation: string;
    review: string;
    total: string;
  };
}

class PathwayAdvisor {
  /**
   * Analyze device information and recommend appropriate regulatory pathway
   *
   * @param deviceProfile Device profile information
   * @param predicateDevices Array of potential predicate devices
   * @returns Pathway recommendation with rationale
   */
  async analyzeRegulatoryPathway(
    deviceProfile: DeviceProfile,
    predicateDevices: PredicateDevice[] = []
  ): Promise<PathwayRecommendation> {
    // Default recommendation template
    const recommendation: PathwayRecommendation = {
      recommendedPathway: '',
      confidenceLevel: 0,
      rationale: '',
      alternativePathways: [],
      additionalDocumentationNeeded: [],
      regulatoryRisks: [],
      estimatedTimeline: {
        preparation: '',
        review: '',
        total: '',
      },
    };

    // Device classification is a key factor in determining pathway
    const deviceClass = deviceProfile.deviceClass;

    // Check for existing predicates or regulatory history
    const hasPredicates =
      predicateDevices.length > 0 ||
      (deviceProfile.predicates && deviceProfile.predicates.length > 0);
    const hasRegulatoryHistory =
      deviceProfile.regulatoryHistory && deviceProfile.regulatoryHistory.length > 0;

    // Get the most suitable predicates from the combined list
    const allPredicates = [...(deviceProfile.predicates || []), ...predicateDevices];

    if (deviceClass === 'I') {
      // Class I devices generally require 510(k) only if they're not exempt
      if (this.isLikelyExempt(deviceProfile, allPredicates)) {
        recommendation.recommendedPathway = 'Class I Exempt';
        recommendation.confidenceLevel = 0.85;
        recommendation.rationale =
          'This device appears to fall under Class I exempt categories based on its characteristics. Most Class I devices are exempt from premarket notification.';
        recommendation.alternativePathways.push({
          pathway: 'Traditional 510(k)',
          rationale:
            'If the device does not qualify for exemption, a Traditional 510(k) would be required.',
        });
        recommendation.estimatedTimeline = {
          preparation: '1-2 months',
          review: 'N/A for exempt devices',
          total: '1-2 months',
        };
      } else {
        recommendation.recommendedPathway = 'Traditional 510(k)';
        recommendation.confidenceLevel = 0.78;
        recommendation.rationale =
          'This Class I device appears to require premarket notification. A Traditional 510(k) is recommended.';
        recommendation.estimatedTimeline = {
          preparation: '3-6 months',
          review: '3-6 months',
          total: '6-12 months',
        };
      }
    } else if (deviceClass === 'II') {
      // Class II devices generally require 510(k)
      // Determine if Special, Abbreviated, or Traditional is appropriate
      if (hasPredicates && this.isSameManufacturer(deviceProfile, allPredicates)) {
        recommendation.recommendedPathway = 'Special 510(k)';
        recommendation.confidenceLevel = 0.82;
        recommendation.rationale =
          'Device modifications to a previously cleared device by the same manufacturer suggest a Special 510(k) pathway.';
        recommendation.alternativePathways.push({
          pathway: 'Traditional 510(k)',
          rationale:
            'If the modifications affect the intended use or fundamental scientific technology, a Traditional 510(k) would be required.',
        });
        recommendation.estimatedTimeline = {
          preparation: '2-3 months',
          review: '30-60 days',
          total: '3-5 months',
        };
      } else if (hasPredicates && this.isWellEstablishedType(deviceProfile, allPredicates)) {
        recommendation.recommendedPathway = 'Abbreviated 510(k)';
        recommendation.confidenceLevel = 0.75;
        recommendation.rationale =
          'Device appears to be of a well-established type that may benefit from using recognized standards or special controls in an Abbreviated 510(k).';
        recommendation.alternativePathways.push({
          pathway: 'Traditional 510(k)',
          rationale:
            'If the device does not fully conform to recognized standards, a Traditional 510(k) would be required.',
        });
        recommendation.estimatedTimeline = {
          preparation: '3-5 months',
          review: '2-4 months',
          total: '5-9 months',
        };
      } else {
        recommendation.recommendedPathway = 'Traditional 510(k)';
        recommendation.confidenceLevel = 0.88;
        recommendation.rationale =
          'As a Class II device without clear eligibility for Special or Abbreviated pathways, a Traditional 510(k) is the most appropriate option.';
        recommendation.estimatedTimeline = {
          preparation: '4-6 months',
          review: '3-6 months',
          total: '7-12 months',
        };
      }
    } else if (deviceClass === 'III') {
      // Class III devices generally require PMA
      // Check if De Novo or PMA is appropriate based on novelty and risk
      if (!hasPredicates) {
        recommendation.recommendedPathway = 'De Novo';
        recommendation.confidenceLevel = 0.7;
        recommendation.rationale =
          'Device appears to be novel with no predicates, but may be of low to moderate risk suited for De Novo classification.';
        recommendation.alternativePathways.push({
          pathway: 'PMA',
          rationale:
            'If the device presents high risk, a PMA would be required rather than De Novo.',
        });
        recommendation.estimatedTimeline = {
          preparation: '6-12 months',
          review: '9-12 months',
          total: '15-24 months',
        };
      } else {
        recommendation.recommendedPathway = 'PMA';
        recommendation.confidenceLevel = 0.9;
        recommendation.rationale =
          'As a Class III device, this product will require a Premarket Approval (PMA) application with clinical data to demonstrate safety and effectiveness.';
        recommendation.estimatedTimeline = {
          preparation: '12-24 months',
          review: '180-360 days',
          total: '2-3 years',
        };
      }
    } else {
      // If device class is not specified or unknown
      // Make a best guess based on predicates and device characteristics
      if (hasPredicates) {
        const predicateClass = this.getPredicateClass(allPredicates);
        if (predicateClass) {
          recommendation.recommendedPathway =
            predicateClass === 'III' ? 'PMA' : 'Traditional 510(k)';
          recommendation.confidenceLevel = 0.65;
          recommendation.rationale = `Based on predicate devices that appear to be Class ${predicateClass}, a ${recommendation.recommendedPathway} is likely required. However, formal classification should be confirmed.`;
        } else {
          recommendation.recommendedPathway = 'Traditional 510(k)';
          recommendation.confidenceLevel = 0.6;
          recommendation.rationale =
            'Without confirmed device classification, a Traditional 510(k) is the most common pathway for devices with predicates. Formal classification should be confirmed.';
        }
      } else {
        recommendation.recommendedPathway = 'Request for Classification';
        recommendation.confidenceLevel = 0.5;
        recommendation.rationale =
          'Unable to determine appropriate pathway with certainty. An FDA Request for Classification is recommended before proceeding.';
        recommendation.alternativePathways.push({
          pathway: 'De Novo',
          rationale:
            'If the device is novel but presents low to moderate risk, De Novo may be appropriate.',
        });
        recommendation.alternativePathways.push({
          pathway: 'Traditional 510(k)',
          rationale:
            'If substantially equivalent predicates can be identified, a Traditional 510(k) may be appropriate.',
        });
      }

      recommendation.estimatedTimeline = {
        preparation: '3-6 months',
        review: 'Varies by pathway',
        total: '6-18 months',
      };
    }

    // Add common documentation requirements
    this.addDocumentationRequirements(recommendation, deviceProfile);

    // Add relevant regulatory risks
    this.addRegulatoryRisks(recommendation, deviceProfile, allPredicates);

    return recommendation;
  }

  /**
   * Determine if a device is likely exempt from 510(k) requirements
   *
   * @param deviceProfile Device profile information
   * @param predicates Array of potential predicate devices
   * @returns Whether the device is likely exempt
   */
  private isLikelyExempt(deviceProfile: DeviceProfile, predicates: any[]): boolean {
    // This is a simplified check - in reality, exemption is determined
    // by specific product codes and regulations (21 CFR)

    // If we have the product code, we could perform a lookup against
    // a database of exempt product codes

    // For this implementation, we'll use some heuristics
    const lowRiskIndicators = [
      'dental',
      'manual',
      'non-powered',
      'examination',
      'general',
      'glove',
      'bandage',
      'dressing',
      'holder',
      'forceps',
    ];

    // Check device name and intended use for low-risk indicators
    const deviceText = `${deviceProfile.name} ${deviceProfile.intendedUse}`.toLowerCase();

    for (const indicator of lowRiskIndicators) {
      if (deviceText.includes(indicator)) {
        return true;
      }
    }

    // Check predicates for exempt status
    for (const predicate of predicates) {
      // If any predicate has "exempt" in its name or was cleared as exempt
      if (predicate.name && predicate.name.toLowerCase().includes('exempt')) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if the device is from the same manufacturer as its predicates
   *
   * @param deviceProfile Device profile information
   * @param predicates Array of potential predicate devices
   * @returns Whether the device is from the same manufacturer as its predicates
   */
  private isSameManufacturer(deviceProfile: DeviceProfile, predicates: any[]): boolean {
    if (!deviceProfile.manufacturer || predicates.length === 0) {
      return false;
    }

    const deviceManufacturer = deviceProfile.manufacturer.toLowerCase();

    for (const predicate of predicates) {
      if (predicate.manufacturer && predicate.manufacturer.toLowerCase() === deviceManufacturer) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if the device is of a well-established type that may qualify for Abbreviated 510(k)
   *
   * @param deviceProfile Device profile information
   * @param predicates Array of potential predicate devices
   * @returns Whether the device is of a well-established type
   */
  private isWellEstablishedType(deviceProfile: DeviceProfile, predicates: any[]): boolean {
    // This would ideally check against a database of device types
    // that have recognized standards or special controls

    // Check if there are multiple predicates with similar names
    if (predicates.length >= 2) {
      return true;
    }

    const wellEstablishedCategories = [
      'catheter',
      'syringe',
      'stent',
      'pacemaker',
      'defibrillator',
      'ventilator',
      'infusion pump',
      'surgical',
      'diagnostic',
    ];

    const deviceText = `${deviceProfile.name} ${deviceProfile.intendedUse}`.toLowerCase();

    for (const category of wellEstablishedCategories) {
      if (deviceText.includes(category)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Get the device class from predicate devices
   *
   * @param predicates Array of potential predicate devices
   * @returns The most prevalent device class among predicates
   */
  private getPredicateClass(predicates: any[]): string | null {
    if (predicates.length === 0) {
      return null;
    }

    const classCount: Record<string, number> = {
      I: 0,
      II: 0,
      III: 0,
    };

    for (const predicate of predicates) {
      if (predicate.deviceClass && ['I', 'II', 'III'].includes(predicate.deviceClass)) {
        classCount[predicate.deviceClass]++;
      }
    }

    // Return the most common class
    if (classCount.III > 0) {
      return 'III'; // If any predicates are Class III, assume highest risk
    } else if (classCount.II > 0) {
      return 'II';
    } else if (classCount.I > 0) {
      return 'I';
    }

    return null;
  }

  /**
   * Add documentation requirements to the recommendation
   *
   * @param recommendation Pathway recommendation object
   * @param deviceProfile Device profile information
   */
  private addDocumentationRequirements(
    recommendation: PathwayRecommendation,
    deviceProfile: DeviceProfile
  ): void {
    // Common documentation for all submissions
    const commonDocs = [
      'Device Description',
      'Indications for Use',
      'Substantial Equivalence Discussion',
      'Proposed Labeling',
    ];

    recommendation.additionalDocumentationNeeded = [...commonDocs];

    // Add pathway-specific documentation
    if (recommendation.recommendedPathway.includes('510(k)')) {
      recommendation.additionalDocumentationNeeded.push(
        'Performance Testing Data',
        'Software Documentation (if applicable)',
        'Sterilization Information (if applicable)',
        'Biocompatibility Information (if applicable)'
      );

      if (recommendation.recommendedPathway === 'Special 510(k)') {
        recommendation.additionalDocumentationNeeded.push(
          'Design Control Documentation',
          'Risk Analysis',
          'Declaration of Conformity to Design Controls'
        );
      }

      if (recommendation.recommendedPathway === 'Abbreviated 510(k)') {
        recommendation.additionalDocumentationNeeded.push(
          'Declaration of Conformity to Recognized Standards',
          'Summary of Testing to Standards'
        );
      }
    } else if (recommendation.recommendedPathway === 'De Novo') {
      recommendation.additionalDocumentationNeeded.push(
        'Risk-Benefit Analysis',
        'Device Specific Classification Proposal',
        'Proposed Special Controls',
        'Summary of Non-Clinical Testing',
        'Clinical Data (if applicable)'
      );
    } else if (recommendation.recommendedPathway === 'PMA') {
      recommendation.additionalDocumentationNeeded.push(
        'Clinical Study Data',
        'Manufacturing Information',
        'Quality System Documentation',
        'Bibliography of Published Reports',
        'Risk Analysis and Risk Management Plan',
        'Software Validation and Verification (if applicable)'
      );
    }

    // Filter out documentation that's not applicable based on device characteristics
    // For example, if it's not a software device, remove software documentation
    // This would be more sophisticated in a real implementation
  }

  /**
   * Add regulatory risks to the recommendation
   *
   * @param recommendation Pathway recommendation object
   * @param deviceProfile Device profile information
   * @param predicates Array of potential predicate devices
   */
  private addRegulatoryRisks(
    recommendation: PathwayRecommendation,
    deviceProfile: DeviceProfile,
    predicates: any[]
  ): void {
    recommendation.regulatoryRisks = [];

    // Check for risks common to all submission types
    if (!deviceProfile.intendedUse) {
      recommendation.regulatoryRisks.push({
        risk: 'Incomplete intended use statement',
        severity: 'high',
        mitigationStrategy:
          'Develop comprehensive intended use statement with specific indications',
      });
    }

    if (predicates.length === 0 && recommendation.recommendedPathway.includes('510(k)')) {
      recommendation.regulatoryRisks.push({
        risk: 'No identified predicate devices',
        severity: 'high',
        mitigationStrategy: 'Identify suitable predicates or consider De Novo pathway instead',
      });
    }

    // Pathway-specific risks
    if (recommendation.recommendedPathway === 'Special 510(k)') {
      recommendation.regulatoryRisks.push({
        risk: 'Modifications may affect intended use',
        severity: 'medium',
        mitigationStrategy:
          'Conduct thorough risk analysis to demonstrate that modifications do not affect intended use',
      });
    } else if (recommendation.recommendedPathway === 'De Novo') {
      recommendation.regulatoryRisks.push({
        risk: 'FDA may determine the device to be Class III',
        severity: 'high',
        mitigationStrategy:
          'Prepare robust risk/benefit analysis with supporting data for lower classification',
      });
    } else if (recommendation.recommendedPathway === 'PMA') {
      recommendation.regulatoryRisks.push({
        risk: 'Insufficient clinical data',
        severity: 'high',
        mitigationStrategy:
          'Design and conduct a pivotal clinical trial with sufficient statistical power',
      });
    }

    // Add additional risks based on device characteristics
    if (
      deviceProfile.deviceClass === 'II' &&
      (!deviceProfile.technologicalCharacteristics ||
        deviceProfile.technologicalCharacteristics.length === 0)
    ) {
      recommendation.regulatoryRisks.push({
        risk: 'Insufficient technological characteristics documentation',
        severity: 'medium',
        mitigationStrategy:
          'Document detailed technological characteristics for comparison with predicates',
      });
    }
  }
}

export default new PathwayAdvisor();
