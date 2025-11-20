/**
 * FDA Compliance Tracker
 *
 * This module provides a structured mechanism to track the implementation progress
 * of FDA compliance requirements for the 510(k) eSTAR workflow integration.
 *
 * It helps organize the steps needed to achieve full FDA compliance for
 * electronic submissions through the eSTAR program.
 */

interface ImplementationStep {
  id: string;
  title: string;
  description: string;
  completed: boolean;
  dependencies?: string[];
  completedAt?: Date;
  assignedTo?: string;
  blockers?: string[];
}

interface ValidationRule {
  id: string;
  title: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  implemented: boolean;
  implementedAt?: Date;
  sectionId?: string;
}

class FDAComplianceTracker {
  private implementationSteps: ImplementationStep[] = [];
  private validationRules: ValidationRule[] = [];
  private lastUpdated: Date = new Date();

  constructor() {
    this.initializeImplementationSteps();
    this.initializeValidationRules();
  }

  /**
   * Initialize implementation steps for 510(k) eSTAR integration
   */
  private initializeImplementationSteps(): void {
    this.implementationSteps = [
      {
        id: 'pdf-generation',
        title: 'FDA-compliant PDF Generation',
        description:
          'Implement PDF generation system that produces properly formatted FDA-compliant documents',
        completed: true,
        completedAt: new Date('2025-05-10'),
      },
      {
        id: 'estar-validation',
        title: 'eSTAR Validation',
        description: 'Implement validation system for eSTAR packages based on FDA requirements',
        completed: true,
        completedAt: new Date('2025-05-12'),
        dependencies: ['pdf-generation'],
      },
      {
        id: 'workflow-integration',
        title: 'Workflow Integration',
        description: 'Connect eSTAR builder with workflow engine for end-to-end processing',
        completed: true,
        completedAt: new Date('2025-05-14'),
        dependencies: ['estar-validation'],
      },
      {
        id: 'system-testing',
        title: 'System Testing',
        description: 'Implement comprehensive testing for the entire eSTAR integration',
        completed: false,
        dependencies: ['workflow-integration'],
      },
      {
        id: 'deployment',
        title: 'Production Deployment',
        description: 'Deploy the fully validated eSTAR integration to production',
        completed: false,
        dependencies: ['system-testing'],
      },
    ];
  }

  /**
   * Initialize validation rules for 510(k) eSTAR packages
   */
  private initializeValidationRules(): void {
    this.validationRules = [
      {
        id: 'admin-section',
        title: 'Administrative Information',
        description: 'Validate required administrative information in the eSTAR package',
        severity: 'error',
        implemented: true,
        implementedAt: new Date('2025-05-11'),
        sectionId: 'section-a',
      },
      {
        id: 'device-description',
        title: 'Device Description',
        description: 'Validate device description requirements in the eSTAR package',
        severity: 'error',
        implemented: true,
        implementedAt: new Date('2025-05-11'),
        sectionId: 'section-b',
      },
      {
        id: 'substantial-equivalence',
        title: 'Substantial Equivalence',
        description: 'Validate substantial equivalence information in the eSTAR package',
        severity: 'error',
        implemented: true,
        implementedAt: new Date('2025-05-12'),
        sectionId: 'section-c',
      },
      {
        id: 'proposed-labeling',
        title: 'Proposed Labeling',
        description: 'Validate proposed labeling information in the eSTAR package',
        severity: 'error',
        implemented: true,
        implementedAt: new Date('2025-05-12'),
        sectionId: 'section-d',
      },
      {
        id: 'sterilization',
        title: 'Sterilization',
        description: 'Validate sterilization information in the eSTAR package',
        severity: 'error',
        implemented: true,
        implementedAt: new Date('2025-05-13'),
        sectionId: 'section-e',
      },
      {
        id: 'shelf-life',
        title: 'Shelf Life',
        description: 'Validate shelf life information in the eSTAR package',
        severity: 'warning',
        implemented: true,
        implementedAt: new Date('2025-05-13'),
        sectionId: 'section-f',
      },
      {
        id: 'biocompatibility',
        title: 'Biocompatibility',
        description: 'Validate biocompatibility information in the eSTAR package',
        severity: 'error',
        implemented: true,
        implementedAt: new Date('2025-05-13'),
        sectionId: 'section-g',
      },
    ];
  }

  /**
   * Get all implementation steps
   *
   * @returns Array of implementation steps
   */
  getImplementationSteps(): ImplementationStep[] {
    return [...this.implementationSteps];
  }

  /**
   * Get all validation rules
   *
   * @returns Array of validation rules
   */
  getValidationRules(): ValidationRule[] {
    return [...this.validationRules];
  }

  /**
   * Get progress summary
   *
   * @returns Object containing progress statistics
   */
  getProgressSummary() {
    const totalSteps = this.implementationSteps.length;
    const completedSteps = this.implementationSteps.filter(step => step.completed).length;
    const stepPercentage = Math.round((completedSteps / totalSteps) * 100);

    const totalRules = this.validationRules.length;
    const implementedRules = this.validationRules.filter(rule => rule.implemented).length;
    const rulePercentage = Math.round((implementedRules / totalRules) * 100);

    return {
      steps: {
        total: totalSteps,
        completed: completedSteps,
        percentage: stepPercentage,
      },
      validationRules: {
        total: totalRules,
        implemented: implementedRules,
        percentage: rulePercentage,
      },
      overallPercentage: Math.round((stepPercentage + rulePercentage) / 2),
      lastUpdated: this.lastUpdated,
    };
  }

  /**
   * Update implementation step status
   *
   * @param stepId ID of the step to update
   * @param completed Whether the step is completed
   * @returns Updated step if found, undefined otherwise
   */
  updateStepStatus(stepId: string, completed: boolean): ImplementationStep | undefined {
    const step = this.implementationSteps.find(s => s.id === stepId);

    if (step) {
      step.completed = completed;
      step.completedAt = completed ? new Date() : undefined;
      this.lastUpdated = new Date();
      return step;
    }

    return undefined;
  }

  /**
   * Update validation rule implementation status
   *
   * @param ruleId ID of the rule to update
   * @param implemented Whether the rule is implemented
   * @returns Updated rule if found, undefined otherwise
   */
  updateRuleStatus(ruleId: string, implemented: boolean): ValidationRule | undefined {
    const rule = this.validationRules.find(r => r.id === ruleId);

    if (rule) {
      rule.implemented = implemented;
      rule.implementedAt = implemented ? new Date() : undefined;
      this.lastUpdated = new Date();
      return rule;
    }

    return undefined;
  }

  /**
   * Get next steps based on current progress
   *
   * @returns Array of implementation steps that should be focused on next
   */
  getNextSteps(): ImplementationStep[] {
    // Find incomplete steps with all dependencies completed
    return this.implementationSteps.filter(step => {
      // Skip completed steps
      if (step.completed) return false;

      // If no dependencies, include in next steps
      if (!step.dependencies || step.dependencies.length === 0) return true;

      // Check if all dependencies are completed
      return step.dependencies.every(depId => {
        const depStep = this.implementationSteps.find(s => s.id === depId);
        return depStep?.completed === true;
      });
    });
  }
}

// Export singleton instance
export const fdaComplianceTracker = new FDAComplianceTracker();

// Also export the class for potential extension
export default FDAComplianceTracker;
