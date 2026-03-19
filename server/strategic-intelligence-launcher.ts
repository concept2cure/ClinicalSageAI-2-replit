/**
 * Strategic Intelligence Launcher Service
 *
 * This service provides pre-configured use case scenarios for different roles in the
 * clinical trial ecosystem. Each use case includes:
 *
 * 1. Strategic Challenge - Real-world problem statement tied to specific roles
 * 2. Concept2Cure Intelligence Solution - Set of features and modules activated
 * 3. Downloadable Output Bundle - Pregenerated insights and reports
 * 4. Interactive Workflow - Prepopulated Concept2Cure workflow
 * 5. ROI Scoreboard - Value metrics for the solution
 */

import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';
import { protocolOptimizerService } from './protocol-optimizer-service';
import { trialPredictorService } from './trial-predictor-service';
import { academicKnowledgeTracker } from './academic-knowledge-tracker';
import { generateSAP } from './utils/generate_sap_snippet';

// Define the use case scenario type
export interface UseCase {
  id: string;
  title: string;
  role: string;
  challenge: string;
  features: {
    csrSearch: boolean;
    riskModel: boolean;
    sapGenerator: boolean;
    dossierExport: boolean;
    protocolOptimizer: boolean;
    benchmarkComparison: boolean;
    regulatoryAlignment: boolean;
  };
  prefillData: {
    indication: string;
    phase: string;
    sample_size: number;
    duration_weeks: number;
    endpoint_primary: string;
    dropout_rate: number;
    [key: string]: any;
  };
  roi: {
    failureRiskReduction: number;
    timeSaved: number;
    precedentMatchScore: number;
    generationTime: number;
  };
  description: string;
}

// Define our base use cases
const useCaseLibrary: UseCase[] = [
  {
    id: 'biotech-founder-phase1',
    title: 'Biotech Founder – First-in-Human Phase 1',
    role: 'Chief Medical Officer / Founder',
    challenge:
      'Your early-stage biotech is preparing for its first Phase 1 trial. You need to design a protocol that balances safety with data collection efficiency to support series B funding and FDA engagement.',
    features: {
      csrSearch: true,
      riskModel: true,
      sapGenerator: true,
      dossierExport: true,
      protocolOptimizer: true,
      benchmarkComparison: true,
      regulatoryAlignment: true,
    },
    prefillData: {
      indication: 'Oncology',
      phase: 'Phase 1',
      sample_size: 24,
      duration_weeks: 16,
      endpoint_primary: 'Safety and tolerability',
      dropout_rate: 0.15,
      secondary_endpoints: ['Pharmacokinetics', 'Preliminary efficacy signals'],
      patient_population: 'Advanced solid tumors',
    },
    roi: {
      failureRiskReduction: 18,
      timeSaved: 24,
      precedentMatchScore: 86,
      generationTime: 2,
    },
    description:
      'Optimize your Phase 1 first-in-human protocol using CSR intelligence from similar compounds, ensuring it meets both scientific and investor scrutiny while accelerating your timeline to clinic.',
  },
  {
    id: 'vc-protocol-risk',
    title: 'VC – Protocol Risk Scoring Before Funding',
    role: 'Venture Capital Investor',
    challenge:
      "You're conducting due diligence on a biotech with a novel Phase 2 program. Their protocol has ambitious endpoints and a complex design. You need to assess if their trial design carries reasonable risk and has precedent for success.",
    features: {
      csrSearch: true,
      riskModel: true,
      sapGenerator: false,
      dossierExport: true,
      protocolOptimizer: true,
      benchmarkComparison: true,
      regulatoryAlignment: true,
    },
    prefillData: {
      indication: 'Metabolic Disease',
      phase: 'Phase 2',
      sample_size: 120,
      duration_weeks: 24,
      endpoint_primary: 'HbA1c reduction',
      dropout_rate: 0.2,
      randomization: 'Stratified block randomization',
      blinding: 'Double-blind',
    },
    roi: {
      failureRiskReduction: 24,
      timeSaved: 36,
      precedentMatchScore: 78,
      generationTime: 5,
    },
    description:
      'Perform rapid, data-driven diligence on clinical trial protocols prior to investment, identifying risk factors and success probabilities based on historical precedent and design optimization.',
  },
  {
    id: 'regulatory-endpoint',
    title: 'Regulatory Team – Endpoint Acceptability Report',
    role: 'Regulatory Affairs Director',
    challenge:
      'Your team is proposing a novel endpoint for a rare disease that lacks established outcome measures. You need to build a case with the FDA that your endpoint is clinically meaningful and has precedent in related conditions.',
    features: {
      csrSearch: true,
      riskModel: false,
      sapGenerator: true,
      dossierExport: true,
      protocolOptimizer: false,
      benchmarkComparison: true,
      regulatoryAlignment: true,
    },
    prefillData: {
      indication: 'Rare Disease',
      phase: 'Phase 3',
      sample_size: 80,
      duration_weeks: 52,
      endpoint_primary: 'Composite functional assessment score',
      dropout_rate: 0.1,
      regulatory_strategy: 'Accelerated approval pathway',
      biomarker_validation: true,
    },
    roi: {
      failureRiskReduction: 32,
      timeSaved: 48,
      precedentMatchScore: 92,
      generationTime: 8,
    },
    description:
      'Develop a regulatory-ready endpoint acceptability report backed by CSR precedent data, historical endpoint usage patterns, and regulatory success rates across similar conditions.',
  },
];

/**
 * Strategic Intelligence Launcher Service Class
 */
class StrategicIntelligenceLauncherService {
  private useCases: UseCase[];
  private readonly tempDir: string;
  private readonly reportsDir: string;

  constructor() {
    this.useCases = [...useCaseLibrary];

    // Create necessary directories
    this.tempDir = path.join(process.cwd(), 'temp');
    if (!fs.existsSync(this.tempDir)) {
      fs.mkdirSync(this.tempDir, { recursive: true });
    }

    this.reportsDir = path.join(process.cwd(), 'data/reports/usecases');
    if (!fs.existsSync(this.reportsDir)) {
      fs.mkdirSync(this.reportsDir, { recursive: true });
    }
  }

  /**
   * Get all available use cases
   */
  getAllUseCases(): UseCase[] {
    return this.useCases;
  }

  /**
   * Get a specific use case by ID
   */
  getUseCase(id: string): UseCase | undefined {
    return this.useCases.find(useCase => useCase.id === id);
  }

  /**
   * Create a new custom use case
   */
  createUseCase(useCase: Omit<UseCase, 'id'>): UseCase {
    const id = `custom-${Date.now()}`;
    const newUseCase: UseCase = {
      id,
      ...useCase,
    };

    this.useCases.push(newUseCase);
    return newUseCase;
  }

  /**
   * Launch a use case and prepare all necessary data
   */
  async launchUseCase(id: string): Promise<{
    useCase: UseCase;
    predictionResults: any;
    sapContent: string;
    benchmarkData: any;
    reportPath?: string;
  }> {
    const useCase = this.getUseCase(id);
    if (!useCase) {
      throw new Error(`Use case with ID ${id} not found`);
    }

    // Generate all the intelligence data for this use case
    const predictionResults = await this.generatePrediction(useCase);
    const sapContent = this.generateSAP(useCase);
    const benchmarkData = await this.generateBenchmarks(useCase);

    // Generate downloadable report bundle
    const reportPath = await this.generateReportBundle(
      useCase,
      predictionResults,
      sapContent,
      benchmarkData
    );

    return {
      useCase,
      predictionResults,
      sapContent,
      benchmarkData,
      reportPath,
    };
  }

  /**
   * Generate trial success prediction for the use case
   */
  private async generatePrediction(useCase: UseCase): Promise<any> {
    // Use the trial predictor service
    const { sample_size, duration_weeks, dropout_rate } = useCase.prefillData;

    try {
      const result = await trialPredictorService.predictTrialSuccess(
        sample_size,
        duration_weeks,
        dropout_rate
      );

      return {
        ...result,
        useCase,
      };
    } catch (error) {
      console.error('Error generating prediction:', error);
      return {
        probability: 0.65, // Fallback for demo
        riskFactors: [
          { factor: 'Sample size', impact: 'Medium' },
          { factor: 'Duration', impact: 'Low' },
          { factor: 'Dropout rate', impact: 'Medium' },
        ],
      };
    }
  }

  /**
   * Generate SAP content for the use case
   */
  private generateSAP(useCase: UseCase): string {
    if (!useCase.features.sapGenerator) {
      return '';
    }

    try {
      return generateSAP(useCase.prefillData);
    } catch (error) {
      console.error('Error generating SAP:', error);
      return 'Statistical Analysis Plan could not be generated.';
    }
  }

  /**
   * Generate benchmark data for the use case
   */
  private async generateBenchmarks(useCase: UseCase): Promise<any> {
    if (!useCase.features.benchmarkComparison) {
      return {};
    }

    try {
      // We can generate more sophisticated benchmarks in the future
      const { indication, phase } = useCase.prefillData;

      // Would normally query the database for real benchmarks
      return {
        avgSampleSize: useCase.prefillData.sample_size * 1.2,
        avgDuration: useCase.prefillData.duration_weeks * 1.1,
        avgDropoutRate: useCase.prefillData.dropout_rate * 0.9,
        successRate: 0.7,
        regulatoryApprovalRate: 0.6,
        endpointPrecedent: true,
        similarTrials: [
          { id: 'NCT12345678', phase, indication, outcome: 'Success' },
          { id: 'NCT23456789', phase, indication, outcome: 'Failure' },
          { id: 'NCT34567890', phase, indication, outcome: 'Success' },
        ],
      };
    } catch (error) {
      console.error('Error generating benchmarks:', error);
      return {};
    }
  }

  /**
   * Generate a downloadable report bundle for the use case
   */
  private async generateReportBundle(
    useCase: UseCase,
    predictionResults: any,
    sapContent: string,
    benchmarkData: any
  ): Promise<string> {
    const timestamp = Date.now();
    const reportId = `${useCase.id}_${timestamp}`;
    const reportDir = path.join(this.reportsDir, reportId);

    if (!fs.existsSync(reportDir)) {
      fs.mkdirSync(reportDir, { recursive: true });
    }

    // Create the report data
    const reportData = {
      useCase,
      predictionResults,
      sapContent,
      benchmarkData,
      timestamp,
      generatedDate: new Date().toISOString(),
    };

    // Save the report data as JSON
    const reportJsonPath = path.join(reportDir, 'report_data.json');
    fs.writeFileSync(reportJsonPath, JSON.stringify(reportData, null, 2));

    // If the SAP generator is enabled, save the SAP content
    if (useCase.features.sapGenerator && sapContent) {
      const sapPath = path.join(reportDir, 'statistical_analysis_plan.txt');
      fs.writeFileSync(sapPath, sapContent);
    }

    // Generate PDF report using Python script (if available)
    try {
      const pythonProcess = spawn('python3', [
        'scripts/generate_usecase_report.py',
        reportJsonPath,
        reportDir,
      ]);

      return new Promise((resolve, reject) => {
        let resultData = '';
        let errorData = '';

        pythonProcess.stdout.on('data', data => {
          resultData += data.toString();
        });

        pythonProcess.stderr.on('data', data => {
          errorData += data.toString();
          console.error(`Report generation error: ${data}`);
        });

        pythonProcess.on('close', code => {
          if (code !== 0) {
            console.error(`Report generation failed: ${errorData}`);
            resolve(reportDir); // Still return the report directory even if PDF fails
          } else {
            resolve(resultData.trim() || reportDir);
          }
        });
      });
    } catch (error) {
      console.error('Error generating PDF report:', error);
      return reportDir;
    }
  }
}

export const strategicIntelligenceLauncherService = new StrategicIntelligenceLauncherService();
