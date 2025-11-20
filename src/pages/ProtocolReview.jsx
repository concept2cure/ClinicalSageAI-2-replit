import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Upload,
  FileText,
  RefreshCw,
  Download,
  Sparkles,
  Microscope,
  ClipboardList,
  BookOpen,
  ArrowRight,
  CheckCircle,
  BarChart4,
  XCircle,
  Clock,
  AlertCircle,
  Info,
  Scale,
  Check,
  Plus,
  ChevronRight,
  ArrowUpDown,
  ChevronDown,
  Loader2,
  HelpCircle,
  ShieldCheck,
  Beaker,
  BookMarked,
  Copy,
  LineChart,
  Users,
} from 'lucide-react';

// Import the subcomponents we created
import ProtocolBlueprintGenerator from '../components/protocol/ProtocolBlueprintGenerator';
import AdaptiveDesignSimulator from '../components/protocol/AdaptiveDesignSimulator';
import IntelligentEndpointAdvisor from '../components/protocol/IntelligentEndpointAdvisor';
import AdvancedSimulationTools from '../components/protocol/AdvancedSimulationTools';
import StatisticalDesign from '../components/protocol/StatisticalDesign';

/**
 * Protocol Review Page Component
 *
 * Provides a comprehensive interface for analyzing protocol drafts against
 * CSR libraries, regulatory guidelines, and academic best practices.
 */
const ProtocolReview = () => {
  const [activeTab, setActiveTab] = useState('upload');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [analysisResults, setAnalysisResults] = useState(null);
  const [activeResultTab, setActiveResultTab] = useState('overview');
  const [detailsDialogOpen, setDetailsDialogOpen] = useState(false);
  const [currentSection, setCurrentSection] = useState({ key: '', score: 0 });

  const { toast } = useToast();

  // Handle viewing detailed alignment information for a section
  const handleViewDetails = (key, score) => {
    setCurrentSection({ key, score });
    setDetailsDialogOpen(true);
  };

  // Handle file upload
  const handleFileUpload = e => {
    const file = e.target.files[0];
    if (file) {
      if (
        file.type === 'application/pdf' ||
        file.type === 'application/msword' ||
        file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ) {
        setUploadedFile(file);
        toast({
          title: 'File uploaded successfully',
          description: `"${file.name}" has been uploaded and is ready for analysis.`,
          variant: 'default',
        });
      } else {
        toast({
          title: 'Invalid file format',
          description: 'Please upload a PDF or Word document (.doc, .docx).',
          variant: 'destructive',
        });
      }
    }
  };

  // Start protocol analysis
  const startAnalysis = () => {
    if (!uploadedFile) {
      toast({
        title: 'No file uploaded',
        description: 'Please upload a protocol document first.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);

    // Simulate progress updates
    const progressInterval = setInterval(() => {
      setAnalysisProgress(prev => {
        if (prev >= 95) {
          clearInterval(progressInterval);
          return 95;
        }
        return prev + Math.floor(Math.random() * 5) + 1;
      });
    }, 500);

    // Simulate analysis completion after 8 seconds
    setTimeout(() => {
      clearInterval(progressInterval);
      setAnalysisProgress(100);

      // Generate mock analysis results
      const mockResults = generateMockAnalysisResults();

      setTimeout(() => {
        setAnalysisResults(mockResults);
        setIsAnalyzing(false);
        setAnalysisComplete(true);
        setActiveTab('results');

        toast({
          title: 'Protocol analysis complete',
          description:
            'Your protocol has been analyzed against our comprehensive database of clinical trials and regulatory guidance.',
          variant: 'default',
        });
      }, 500);
    }, 8000);
  };

  // Reset the analysis
  const resetAnalysis = () => {
    setUploadedFile(null);
    setIsAnalyzing(false);
    setAnalysisProgress(0);
    setAnalysisComplete(false);
    setAnalysisResults(null);
    setActiveTab('upload');

    toast({
      title: 'Analysis reset',
      description: 'You can now upload a new protocol for analysis.',
      variant: 'default',
    });
  };

  // Generate an optimized protocol section using advanced scientific and regulatory intelligence
  const [optimizedSectionDialogOpen, setOptimizedSectionDialogOpen] = useState(false);
  const [optimizedSection, setOptimizedSection] = useState({
    key: '',
    content: '',
    isGenerating: false,
    changes: [],
    acceptedChanges: [],
    rejectedChanges: [],
  });

  const generateOptimizedProtocolSection = sectionKey => {
    setOptimizedSection({
      key: sectionKey,
      content: '',
      isGenerating: true,
      changes: [],
      acceptedChanges: [],
      rejectedChanges: [],
    });
    setOptimizedSectionDialogOpen(true);

    // Simulate generation of an optimized protocol section with advanced methods
    const generationTime = Math.floor(Math.random() * 3000) + 2000; // 2-5 seconds

    setTimeout(() => {
      const sectionLower = sectionKey.toLowerCase();
      let content = '';

      if (sectionLower.includes('inclusion_criteria')) {
        content = `# INCLUSION CRITERIA

**1. Demographic Criteria**
* Age ≥18 to ≤75 years (inclusive)
* Body Mass Index (BMI): 18.5-35.0 kg/m² (inclusive)
* Able to provide written informed consent

**2. Diagnostic Criteria**
* Confirmed diagnosis of [indication] according to [diagnostic criteria] for ≥6 months
* Disease severity score of ≥4 on the [validated scale]
* Documented inadequate response to ≥8 weeks of standard therapy with [first-line treatment]

**3. Laboratory Parameters**
* Hepatic function: AST and ALT ≤2.5× ULN; total bilirubin ≤1.5× ULN
* Renal function: eGFR ≥60 mL/min/1.73m² (CKD-EPI formula)
* Hematology parameters:
  * Hemoglobin ≥10 g/dL
  * Absolute neutrophil count ≥1.5 × 10⁹/L
  * Platelet count ≥100 × 10⁹/L

**4. Reproductive Considerations**
* Women of childbearing potential must use highly effective contraception from screening through 90 days after last dose
* Negative serum pregnancy test at screening (for women of childbearing potential)
* Men with partners of childbearing potential must use effective contraception from Day 1 through 90 days after last dose

**Innovative Adaptive Eligibility Feature:**
This protocol implements adaptive eligibility criteria with objective stratification parameters for key biological variables that have demonstrated high inter-subject variability in previous trials. Participants who meet core safety requirements but fall outside standard laboratory parameters may be enrolled into a dedicated exploratory "expanded eligibility" cohort with specialized monitoring (constituting ≤15% of total enrollment) to enhance population representativeness.`;
      } else if (sectionLower.includes('exclusion_criteria')) {
        content = `# EXCLUSION CRITERIA

**1. Medical History**
* History of significant cardiovascular disease, including:
  * Myocardial infarction, unstable angina, stroke, or TIA within 6 months
  * NYHA Class III-IV heart failure
  * Uncontrolled hypertension (BP >160/100 mmHg despite medication)
* Active or latent tuberculosis (positive QuantiFERON-TB Gold or T-SPOT.TB test)
* History of malignancy within 5 years (except adequately treated basal/squamous cell skin cancer or cervical carcinoma in situ)
* Major surgery within 8 weeks prior to randomization or planned during study period

**2. Concomitant Conditions**
* Clinically significant abnormality on 12-lead ECG at screening
* Current or chronic history of liver disease, or known hepatic impairment (Child-Pugh Class B or C)
* History of significant neurological disorders including epilepsy or seizures within 3 years
* Active infection requiring systemic antimicrobial therapy

**3. Prior/Concomitant Therapy**
* Treatment with any investigational drug within 30 days or 5 half-lives (whichever is longer)
* Current use of prohibited medications:
  * Strong CYP3A4 inhibitors or inducers (washout period: 14 days)
  * Live or attenuated vaccines within 30 days prior to randomization
* Previous exposure to [study drug] or similar mechanism agents

**4. Laboratory Abnormalities**
* Positive test for hepatitis B surface antigen, hepatitis C antibody, or HIV
* Serum creatinine >1.5× ULN or creatinine clearance <60 mL/min
* Any clinically significant laboratory abnormality that would affect interpretation of study data

**Advanced Risk-Based Approach:**
This protocol implements a novel risk-stratification algorithm that dynamically adjusts exclusion thresholds based on comorbidity patterns rather than applying universal cutoffs. This approach utilizes Bayesian network modeling based on 3,217 similar trial participants to optimize the benefit-risk profile across diverse patient populations.`;
      } else if (sectionLower.includes('endpoint')) {
        content = `# PRIMARY AND SECONDARY ENDPOINTS

## Primary Endpoint
Change from baseline to Week 24 in [disease-specific validated score], assessed using a mixed model for repeated measures (MMRM) analysis including all post-baseline observations.

## Key Secondary Endpoints
1. Proportion of patients achieving clinical response (defined as ≥50% improvement from baseline in [disease-specific score]) at Week 24
2. Change from baseline in [functional assessment tool] score at Week 24
3. Time to first disease worsening event (composite endpoint)
4. Patient-reported outcome: change from baseline in [PRO instrument] total score at Week 24

## Exploratory Endpoints
1. Biomarker analyses: changes in [biomarker panel] from baseline to Weeks 4, 12, and 24
2. Pharmacokinetic/pharmacodynamic modeling of exposure-response relationship
3. Digital health measure: continuous activity monitoring via wearable device
4. Correlation between [biomarker] levels and clinical response

## Novel Endpoints with Digital Integration
* **Digital Adherence Tracking:** Real-time medication adherence monitoring with timestamped verification and correlation with outcome measures
* **Machine Learning-Enhanced Outcome Prediction:** Analysis of multi-modal data streams to identify early response predictors by Week 4
* **Patient-Centric Functional Outcomes:** Novel BYOD (bring your own device) capture of patient function in real-world settings using validated digital assessment instruments
* **Adaptive Endpoint Weighting:** Implementation of response-adaptive statistical methodology that enhances assessment precision based on interim disease behavior patterns

## Advanced Analysis Methods
This protocol integrates causal inference methodology to distinguish direct treatment effects from indirect effects, accounting for intercurrent events according to the ICH E9(R1) estimand framework. Digital endpoints are processed through validated algorithms with sensitivity analyses comparing conventional versus digital assessment concordance.`;
      } else if (sectionLower.includes('statistical')) {
        content = `# STATISTICAL METHODOLOGY

## Sample Size Determination
Based on previous studies, a clinically meaningful difference in the primary endpoint is 4.5 points with an estimated standard deviation of 9.2. With 90% power, two-sided alpha of 0.05, and accounting for 15% dropout rate, 178 patients per arm (356 total) will be required. This calculation incorporates a Bayesian predictive probability framework to account for uncertainty in variance estimates from previous studies.

## Analysis Populations
* **Intent-to-Treat (ITT):** All randomized patients
* **Modified ITT (mITT):** All randomized patients who receive ≥1 dose of study treatment
* **Per Protocol (PP):** All mITT patients without major protocol deviations
* **Safety Population:** All patients who receive ≥1 dose of study treatment

## Primary Endpoint Analysis
The primary analysis will use a Mixed Model for Repeated Measures (MMRM) including treatment, visit, treatment-by-visit interaction, stratification factors, and baseline value as covariates. The model will use an unstructured covariance matrix to account for within-subject correlation.

## Handling of Missing Data
The primary analysis using MMRM implicitly handles missing data under the Missing at Random (MAR) assumption. Sensitivity analyses will include:
* Multiple imputation approaches with delta adjustment to evaluate Missing Not at Random (MNAR) scenarios
* Pattern-mixture models stratifying by patterns of missingness
* Tipping point analysis to identify the conditions under which conclusions would change

## Multiplicity Adjustment
A graphical approach for multiple testing will be implemented to control the family-wise error rate (FWER) at 0.05 for the primary and key secondary endpoints. Sequential testing will follow a pre-specified order with alpha recycling.

## Interim Analysis
One interim analysis for efficacy and futility will be conducted after 50% of participants complete the Week 12 assessment. The analysis will use a Lan-DeMets spending function with O'Brien-Fleming boundaries. An independent Data Monitoring Committee will review unblinded results.

## Subgroup Analyses
Pre-specified subgroup analyses will include stratification factors, demographic characteristics, and baseline disease severity. Forest plots will be used to visualize treatment effects across subgroups.

## Innovative Methods
* **Bayesian Hierarchical Modeling** to leverage historical data for enhanced precision
* **Machine Learning-Based Predictive Modeling** for identification of heterogeneous treatment effects
* **Time-to-event analyses using Joint Frailty Models** to account for competing risks
* **Functional Data Analysis** for continuous monitoring endpoints
* **Causal Inference Methods** aligning with ICH E9(R1) estimand framework

## Supplementary Analyses
* Exposure-response modeling using plasma concentration data
* Biomarker-based responder analyses with receptor occupancy thresholds
* Digital endpoint validation with sensitivity and specificity characterization`;
      } else if (sectionLower.includes('safety')) {
        content = `# SAFETY ASSESSMENT PLAN

## Safety Parameters
* **Adverse Events (AEs):** Monitored continuously and graded using CTCAE v5.0
* **Laboratory Assessments:** Hematology, chemistry, urinalysis at screening, Days 1, 7, 14, 28, then every 4 weeks
* **Vital Signs:** Blood pressure, pulse, temperature, respiratory rate, and oxygen saturation at each visit
* **Electrocardiograms (ECGs):** 12-lead ECGs at screening, Days 1, 14, 28, then every 8 weeks
* **Physical Examinations:** Complete examination at screening and end of study; targeted examinations at all other visits
* **Columbia-Suicide Severity Rating Scale (C-SSRS):** Administered at each visit

## Enhanced Monitoring Parameters
* **Advanced Cardiovascular Assessment:** Continuous cardiac monitoring via wearable ECG patch for first 14 days in a subset of 100 patients
* **Immune System Monitoring:** Flow cytometry panel at baseline, Weeks 4, 12, and 24
* **Novel Biomarkers of Organ Toxicity:** Plasma proteomics and metabolomics panel at baseline, Weeks 4, 12, and 24
* **Digital Symptom Monitoring:** Participant-reported symptom tracking via mobile application with daily active monitoring for first 28 days
* **Real-time Laboratory Alert System:** Automated detection of parameter deviations with graded notification protocol

## Safety Oversight
* **Independent Data Monitoring Committee (IDMC):** Reviewing unblinded safety data every 3 months
* **Adjudication Committee:** Evaluating cardiovascular and thrombotic events
* **Specialized Protocol-Specific Monitoring:** [Organ]-specific monitoring based on preclinical signal
* **Adaptive Safety Monitoring:** Intensity of monitoring adjusted based on emerging safety signals

## Stopping Rules
**Individual Patient Discontinuation:**
* ALT or AST >5× ULN, or >3× ULN with total bilirubin >2× ULN
* QTcF increase >60 ms from baseline or absolute QTcF >500 ms
* Grade 4 laboratory abnormality deemed clinically significant
* Any Grade 4 adverse event related to study drug

**Study-Level Stopping Rules:**
* Serious adverse event of similar nature occurring in >5% of active treatment patients
* Evidence of severe organ toxicity occurring in >2% of active treatment patients
* Prespecified imbalance in serious infections or malignancies

## Advanced Safety Analysis Methods
* **Bayesian hierarchical models** for rare event detection and safety signal characterization
* **Multivariate modeling** of laboratory parameter trajectories to detect patterns predictive of adverse outcomes
* **Machine learning algorithms** for automated signal detection and adverse event clustering
* **Quantitative benefit-risk assessment** updated in real-time as new safety data becomes available
* **Augmented pharmacovigilance** with real-world data integration from similar compounds

## Specialized Monitoring for Novel Mechanism
Due to the [mechanism] of action, specialized monitoring includes [specific assessments] at [frequency] to detect early signs of [expected toxicity] before clinical manifestation. This approach incorporates translational biomarkers validated to predict [specific toxicity] with 87% sensitivity based on preclinical models.`;
      } else if (sectionLower.includes('dosing')) {
        content = `# DOSING STRATEGY

## Dose Selection Rationale
The dosing strategy is based on comprehensive Phase 1 data demonstrating:
* Target receptor occupancy >90% at proposed dose levels
* PK parameters: T₁/₂ = 28±4 hours supporting once-daily dosing
* Exposure-response modeling showing plateau of efficacy measures at doses ≥[X] mg
* Safety margin of >10-fold between therapeutic exposure and NOAEL in toxicology studies

## Dosing Regimen
**Treatment Arms:**
* **Arm A (Active):** [X] mg administered orally once daily with food
* **Arm B (Active):** [Y] mg administered orally once daily with food
* **Arm C (Placebo):** Matching placebo administered orally once daily with food

## Innovative Adaptive Dosing Features
* **PK-Guided Dose Individualization:** Week 2 plasma concentration assessment with algorithm-based dose optimization
* **Response-Adaptive Randomization:** Modification of randomization ratio at pre-specified interim analysis based on emerging dose-response data
* **Exposure-Matching Approach:** For patients with factors affecting drug metabolism (identified through PGx screening), doses will be adjusted to achieve target exposure ranges

## Special Populations
* **Hepatic Impairment:** 
  * Mild (Child-Pugh A): No dose adjustment
  * Moderate (Child-Pugh B): 50% dose reduction
  * Severe (Child-Pugh C): Not recommended
* **Renal Impairment:**
  * Mild-Moderate (eGFR 30-89 mL/min/1.73m²): No dose adjustment
  * Severe (eGFR <30 mL/min/1.73m²): 50% dose reduction
* **Elderly (≥65 years):** No initial dose adjustment; careful monitoring
* **Body Weight Extremes:** No dose adjustment for patients <50 kg or >120 kg based on population PK modeling

## Dose Modifications
**For Treatment-Related Toxicity:**
* **Grade 1:** Continue treatment at current dose with monitoring
* **Grade 2:** Interrupt until resolved to Grade ≤1, then resume at same dose
* **Grade 3:** Interrupt until resolved to Grade ≤1, then resume with 50% dose reduction
* **Grade 4:** Discontinue study treatment permanently

**Specific Adverse Events of Interest:**
* **Hepatic enzyme elevation:** Custom algorithm with more conservative thresholds
* **Cytopenia:** Separate management pathway with specialized monitoring
* **[Mechanism-specific toxicity]:** Preemptive biomarker threshold triggering dose interruption

## Advanced Dosing Technology
* **Digital Medication Event Monitoring:** Electronic tracking of dosing events
* **Physiologically-Based PK Modeling (PBPK):** Real-time prediction of PK parameters
* **Artificial Intelligence Dose Optimization:** Machine learning algorithm integrating PK, PD, and safety data to recommend individualized dose adjustments
* **Exposure-Response Biomarker Integration:** Continuous adjustment based on target engagement metrics

This dosing strategy incorporates advanced precision medicine principles to ensure optimal drug exposure while maintaining favorable safety profile across diverse patient populations.`;
      } else if (sectionLower.includes('population')) {
        content = `# STUDY POPULATION

## Target Population
Adult patients (≥18 years) with [indication] of moderate to severe intensity, as defined by [specific diagnostic criteria], who have had inadequate response to conventional therapy.

## Demographic and Geographic Considerations
* **Age Distribution:** Stratified enrollment ensuring ≥25% of participants are ≥65 years
* **Sex Balance:** Targeted enrollment of approximately 50% female participants
* **Racial/Ethnic Diversity:** Minimum thresholds for historically underrepresented groups with site selection and recruitment strategies designed to achieve representative enrollment
* **Geographic Diversity:** Multi-regional clinical trial design with enrollment targets distributed across North America (40%), Europe (30%), Asia (20%), and Rest of World (10%)

## Innovative Population Approaches
* **Inclusion of Expanded Eligibility Cohort:** Dedicated subset of patients (15% of total sample) with controlled comorbidities typically excluded from traditional trials
* **Real-World Bridging Substudy:** Parallel observational cohort of non-randomized patients ineligible for main study
* **Prospective genetic screening substudy:** For genetically-defined response predictors
* **Patient preference assessment:** Incorporation of preferences for outcomes into stratification
* **Diversity Enrollment Strategy:** Community-based recruitment with specialized engagement for underrepresented populations

## Stratification Factors
* Baseline disease severity ([specific score]: moderate vs. severe)
* Prior treatment history (biologic-naïve vs. biologic-experienced)
* Geographic region
* Age group (18-40, 41-65, >65 years)
* Key biomarker status ([specific biomarker]: positive vs. negative)

## Advanced Selection Methods
* **Biomarker-Based Enrichment:** [Specific biomarker] testing for potential predictive enrichment
* **Digital Phenotyping:** Use of digital biomarkers from 2-week run-in period to characterize disease subtypes
* **Precision Eligibility Algorithm:** Machine learning-derived algorithm incorporating multiple variables to identify optimal trial candidates with highest likelihood of discriminating treatment effect
* **Distributed Recruitment Model:** Hybrid site structure with academic centers paired with community practices to enhance population diversity
* **International Harmonization:** Aligned eligibility across global sites with cultural adaptation of assessment tools

## Study Within A Trial (SWAT)
Embedded methodological substudy evaluating the impact of decentralized trial elements on population representativeness compared to traditional site-based recruitment.

## Subpopulation Analytics Plan
Pre-specified analyses of treatment effect heterogeneity across key demographic and clinical factors using causal forest methodology to identify potential subgroups with enhanced response while controlling for multiple testing.

This population framework is designed to maximize both internal validity and external generalizability while incorporating FDA diversity guidance (FDORA 2022) and ICH E8(R1) principles for representative trial populations.`;
      } else {
        content = `# OPTIMIZED PROTOCOL SECTION

## Advanced Design Considerations
[This section would contain optimized protocol content for the specific section selected, incorporating cutting-edge methodologies and regulatory considerations]

## Implementation Guidance
* Detailed operational considerations
* Regulatory alignment rationale
* Scientific justification with references
* Implementation timeline and milestones

## Key Innovation Elements
* Novel methodological approaches
* Enhanced scientific rigor metrics
* Operational feasibility assessment
* Digital integration touchpoints

## Regulatory Concordance
* Alignment with ICH guidelines
* FDA/EMA submission considerations
* Recent precedent examples
* Presubmission meeting strategy

The optimized content would be tailored specifically to the selected protocol section, incorporating the latest scientific advances while maintaining regulatory defensibility.`;
      }

      // Generate 3-5 suggested changes for the protocol
      const numChanges = Math.floor(Math.random() * 3) + 3; // 3-5 changes
      const changes = [];

      for (let i = 0; i < numChanges; i++) {
        let change = {
          id: `change-${i + 1}`,
          type:
            i === 0
              ? 'addition'
              : i === 1
                ? 'modification'
                : i === 2
                  ? 'removal'
                  : Math.random() > 0.5
                    ? 'addition'
                    : 'modification',
          section: sectionKey.replace(/_/g, ' '),
          originalText: '',
          suggestedText: '',
          rationale: '',
          regulatoryReference: '',
          confidence: Math.floor(Math.random() * 30) + 70, // 70-99% confidence
        };

        // Create different change suggestions based on section type
        if (sectionLower.includes('inclusion_criteria')) {
          if (change.type === 'addition') {
            change.originalText = '';
            change.suggestedText =
              '* Advanced biomarker-based entry criteria allowing stratified enrollment based on [specific biomarker panel]';
            change.rationale =
              'Precision medicine approach will enhance statistical power by reducing heterogeneity in treatment response through biomarker-based stratification.';
            change.regulatoryReference =
              'FDA Biomarker Qualification Program and FDA-NIH BEST Resource';
          } else if (change.type === 'modification') {
            change.originalText = '* Age ≥18 to ≤75 years (inclusive)';
            change.suggestedText =
              '* Age ≥18 to ≤85 years (inclusive), with participants >75 years enrolled in specialized geriatric assessment sub-study';
            change.rationale =
              'Enhanced geriatric representation aligns with FDA FDORA 2022 diversity requirements while maintaining safety through dedicated monitoring.';
            change.regulatoryReference =
              'FDA Guidance on Enhancing the Diversity of Clinical Trial Populations';
          } else {
            change.originalText = '* Body Mass Index (BMI): 18.5-35.0 kg/m² (inclusive)';
            change.suggestedText = '';
            change.rationale =
              'Removal of restrictive BMI criteria will improve population representativeness and accelerate enrollment while still maintaining patient safety.';
            change.regulatoryReference =
              'FDA Guidance on Enhancing the Diversity of Clinical Trial Populations (December 2020)';
          }
        } else if (sectionLower.includes('statistical')) {
          if (change.type === 'addition') {
            change.originalText = '';
            change.suggestedText =
              '## Estimand Framework\nAligned with ICH E9(R1), we define the following estimands for the primary objective:\n1. Treatment effect regardless of adherence (treatment policy strategy)\n2. Treatment effect if all patients remained adherent (hypothetical strategy)\n3. Treatment effect up to discontinuation (while on treatment strategy)';
            change.rationale =
              'Implementing ICH E9(R1) estimand framework enhances regulatory alignment and provides more precise definition of treatment effects.';
            change.regulatoryReference =
              'ICH E9(R1) Addendum on Estimands and Sensitivity Analysis in Clinical Trials';
          } else if (change.type === 'modification') {
            change.originalText =
              'The primary analysis will use a Mixed Model for Repeated Measures (MMRM) including treatment, visit, treatment-by-visit interaction, stratification factors, and baseline value as covariates.';
            change.suggestedText =
              'The primary analysis will use a Mixed Model for Repeated Measures (MMRM) incorporating treatment, visit, treatment-by-visit interaction, stratification factors, baseline value, and key prognostic factors identified in previous trials as covariates. Restricted maximum likelihood (REML) estimation will be used with Kenward-Roger degrees of freedom.';
            change.rationale =
              'Enhanced statistical model with prognostic covariates improves precision and power while maintaining Type I error control through appropriate degrees of freedom adjustment.';
            change.regulatoryReference =
              'FDA Statistical Review and Evaluation guidance (2017) and EMA Points to Consider on Adjustment for Baseline Covariates';
          } else {
            change.originalText =
              'Pre-specified subgroup analyses will include stratification factors, demographic characteristics, and baseline disease severity.';
            change.suggestedText = '';
            change.rationale =
              'Removing pre-specified subgroup analyses reduces risk of spurious findings and post-hoc interpretations, while focused interaction tests can still be performed for key stratification factors.';
            change.regulatoryReference =
              'EMA Guideline on the Investigation of Subgroups in Confirmatory Clinical Trials (2019)';
          }
        } else if (sectionLower.includes('endpoint')) {
          if (change.type === 'addition') {
            change.originalText = '';
            change.suggestedText =
              '## Objective Digital Endpoints\n* Continuous activity monitoring via wrist-worn accelerometer with proprietary validated algorithm\n* Sleep quality assessment using polysomnography-validated consumer device\n* Medication adherence verification through electronic monitoring system';
            change.rationale =
              'Incorporating objective digital endpoints provides continuous real-world data on patient function and reduces reliance on episodic clinical assessments.';
            change.regulatoryReference =
              'FDA Guidance on Digital Health Technologies for Remote Data Acquisition in Clinical Investigations';
          } else if (change.type === 'modification') {
            change.originalText =
              'Change from baseline to Week 24 in [disease-specific validated score], assessed using a mixed model for repeated measures (MMRM) analysis including all post-baseline observations.';
            change.suggestedText =
              'Change from baseline to Week 24 in [disease-specific validated score], with additional sensitivity analysis using a novel composite responder definition requiring both clinically meaningful improvement in primary scale AND no worsening in functional status.';
            change.rationale =
              'Composite responder definition better reflects clinically meaningful benefit by requiring both symptom improvement and functional stability.';
            change.regulatoryReference =
              "FDA Patient-Focused Drug Development Guidance Series for Enhancing the Incorporation of the Patient's Voice";
          } else {
            change.originalText =
              'Patient-reported outcome: change from baseline in [PRO instrument] total score at Week 24';
            change.suggestedText = '';
            change.rationale =
              'Removal of redundant PRO endpoint that overlaps with other measures and has shown poor construct validity in recent validation studies.';
            change.regulatoryReference = 'FDA Guidance on Patient-Reported Outcome Measures (2009)';
          }
        } else {
          if (change.type === 'addition') {
            change.originalText = '';
            change.suggestedText =
              '* Digital biomarker monitoring with real-time alerting system for early safety signal detection';
            change.rationale =
              'Continuous digital monitoring enables earlier detection of safety signals before they become clinically significant adverse events.';
            change.regulatoryReference =
              'FDA Guidance on Use of Electronic Health Record Data in Clinical Investigations';
          } else if (change.type === 'modification') {
            change.originalText =
              'Independent Data Monitoring Committee (IDMC): Reviewing unblinded safety data every 3 months';
            change.suggestedText =
              'Independent Data Monitoring Committee (IDMC): Reviewing unblinded safety data every 6 weeks for the first 24 weeks, then quarterly thereafter, with enhanced monitoring of key safety parameters';
            change.rationale =
              'More frequent early IDMC reviews enhances safety monitoring during the highest risk period while maintaining efficient oversight in later phases.';
            change.regulatoryReference =
              'FDA Guidance on Establishment and Operation of Clinical Trial Data Monitoring Committees';
          } else {
            change.originalText =
              '* Advanced Cardiovascular Assessment: Continuous cardiac monitoring via wearable ECG patch for first 14 days in a subset of 100 patients';
            change.suggestedText = '';
            change.rationale =
              'Removing this specialized assessment reduces patient burden and study complexity without compromising safety based on Phase 1 cardiac safety data.';
            change.regulatoryReference =
              'ICH E14 Clinical Evaluation of QT/QTc Interval Prolongation';
          }
        }

        changes.push(change);
      }

      setOptimizedSection({
        key: sectionKey,
        content: content,
        isGenerating: false,
        changes: changes,
        acceptedChanges: [],
        rejectedChanges: [],
      });
    }, generationTime);
  };

  // Render dialog for optimized protocol section
  const renderOptimizedProtocolDialog = () => {
    const { key, content, isGenerating } = optimizedSection;

    return (
      <Dialog open={optimizedSectionDialogOpen} onOpenChange={setOptimizedSectionDialogOpen}>
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center">
              <Sparkles className="h-5 w-5 mr-2 text-blue-500" />
              <span className="capitalize">Optimized {key.replace(/_/g, ' ')} Protocol</span>
            </DialogTitle>
            <DialogDescription>
              AI-generated protocol section incorporating advanced scientific methods and regulatory
              intelligence
            </DialogDescription>
          </DialogHeader>

          {isGenerating ? (
            <div className="py-12 flex flex-col items-center justify-center">
              <Loader2 className="h-12 w-12 animate-spin text-blue-500 mb-4" />
              <h3 className="text-lg font-medium text-center mb-2">
                Generating Optimized Protocol Section
              </h3>
              <p className="text-sm text-gray-600 text-center max-w-md">
                Analyzing regulatory requirements, similar studies, and scientific literature to
                create an optimized protocol section...
              </p>
            </div>
          ) : (
            <div className="space-y-6 mt-4">
              <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
                <div className="flex items-center text-blue-800 mb-2">
                  <Info className="h-5 w-5 mr-2" />
                  <span className="font-medium">About this optimized protocol section</span>
                </div>
                <p className="text-sm text-gray-700">
                  This protocol section was generated using advanced natural language processing
                  trained on 3,217+ clinical study reports, 450+ regulatory guidance documents, and
                  12,000+ published scientific articles. It incorporates the latest scientific
                  methods, regulatory expectations, and operational best practices.
                </p>
              </div>

              <div className="border rounded-lg p-5 bg-white">
                <pre className="text-sm whitespace-pre-wrap font-mono">{content}</pre>
              </div>

              <div className="flex flex-col space-y-3">
                <h3 className="text-md font-medium">Protocol Innovation Elements</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-gray-50 p-3 rounded-md border">
                    <div className="flex items-center">
                      <Beaker className="h-4 w-4 text-purple-600 mr-2" />
                      <span className="font-medium text-sm">Novel Scientific Methodologies</span>
                    </div>
                    <p className="text-xs text-gray-700 mt-1">
                      Incorporates cutting-edge approaches including adaptive design elements,
                      precision eligibility criteria, and advanced analytical methods aligned with
                      current scientific consensus.
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md border">
                    <div className="flex items-center">
                      <Scale className="h-4 w-4 text-green-600 mr-2" />
                      <span className="font-medium text-sm">Regulatory Alignment</span>
                    </div>
                    <p className="text-xs text-gray-700 mt-1">
                      Designed to meet or exceed requirements from FDA, EMA, PMDA and other global
                      regulatory bodies, with specific attention to recent guidance changes and
                      precedent approvals.
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md border">
                    <div className="flex items-center">
                      <LineChart className="h-4 w-4 text-blue-600 mr-2" />
                      <span className="font-medium text-sm">Statistical Robustness</span>
                    </div>
                    <p className="text-xs text-gray-700 mt-1">
                      Employs state-of-the-art statistical approaches aligned with ICH E9(R1)
                      estimand framework and contemporary methods for handling missing data and
                      multiplicity.
                    </p>
                  </div>
                  <div className="bg-gray-50 p-3 rounded-md border">
                    <div className="flex items-center">
                      <Users className="h-4 w-4 text-orange-600 mr-2" />
                      <span className="font-medium text-sm">Enhanced Diversity & Inclusion</span>
                    </div>
                    <p className="text-xs text-gray-700 mt-1">
                      Designed to improve population representativeness through strategic enrollment
                      approaches and flexible eligibility criteria, aligned with FDORA 2022
                      requirements.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          )}

          <DialogFooter className="flex items-center justify-between mt-6">
            <div className="text-xs text-gray-500">
              Generated with TrialSage™ Protocol Intelligence v2.5
            </div>
            <div className="flex space-x-2">
              {!isGenerating && (
                <Button variant="outline" onClick={() => navigator.clipboard.writeText(content)}>
                  <Copy className="h-4 w-4 mr-2" />
                  Copy to Clipboard
                </Button>
              )}
              <Button onClick={() => setOptimizedSectionDialogOpen(false)}>Close</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // Get regulatory guidance reference based on section
  const getRegulatoryReference = sectionKey => {
    const sectionLower = sectionKey.toLowerCase();
    if (sectionLower.includes('exclusion_criteria')) {
      return {
        title: 'ICH E6(R2) Good Clinical Practice',
        section: '4.3.3 - Exclusion Criteria',
        description:
          'A comprehensive list of the exclusion criteria for participant selection and criteria for withdrawal.',
        url: 'https://database.ich.org/sites/default/files/E6_R2_Addendum.pdf',
      };
    } else if (sectionLower.includes('inclusion_criteria')) {
      return {
        title: 'ICH E6(R2) Good Clinical Practice',
        section: '4.3.3 - Inclusion Criteria',
        description:
          'A specific list of inclusion criteria that subjects must satisfy to be eligible for the study.',
        url: 'https://database.ich.org/sites/default/files/E6_R2_Addendum.pdf',
      };
    } else if (sectionLower.includes('safety')) {
      return {
        title: 'ICH E2A Clinical Safety Data Management',
        section: '2.4 - Safety Monitoring and Reporting',
        description: 'Definitions and standards for expedited reporting of adverse drug reactions.',
        url: 'https://database.ich.org/sites/default/files/E2A_Guideline.pdf',
      };
    } else if (sectionLower.includes('endpoint')) {
      return {
        title: 'ICH E9 Statistical Principles for Clinical Trials',
        section: '2.2.2 - Primary and Secondary Variables',
        description:
          'Guidelines for selecting, defining, and measuring primary and secondary endpoints.',
        url: 'https://database.ich.org/sites/default/files/E9_Guideline.pdf',
      };
    } else if (sectionLower.includes('dosing')) {
      return {
        title: 'ICH E4 Dose-Response Information',
        section: '2 - Guidelines for Dose Selection and Design',
        description:
          'Principles for dose selection including strategies for obtaining dose-response information.',
        url: 'https://database.ich.org/sites/default/files/E4_Guideline.pdf',
      };
    } else if (sectionLower.includes('population')) {
      return {
        title: 'ICH E9 Statistical Principles for Clinical Trials',
        section: '3.2 - Study Population',
        description: 'Guidelines for defining and documenting the appropriate study population.',
        url: 'https://database.ich.org/sites/default/files/E9_Guideline.pdf',
      };
    } else if (sectionLower.includes('statistical')) {
      return {
        title: 'ICH E9 Statistical Principles for Clinical Trials',
        section: '5 - Statistical Analysis',
        description:
          'Statistical design considerations, strategies for controlling bias, and analytical approaches.',
        url: 'https://database.ich.org/sites/default/files/E9_Guideline.pdf',
      };
    } else if (sectionLower.includes('duration')) {
      return {
        title: 'ICH E8 General Considerations for Clinical Trials',
        section: '3.1.8 - Study Design',
        description: 'Considerations for determination of trial duration and follow-up procedures.',
        url: 'https://database.ich.org/sites/default/files/E8_Guideline.pdf',
      };
    }
    return {
      title: 'ICH Guidelines',
      section: 'General Regulatory Guidance',
      description:
        'Applicable guidelines from International Council for Harmonisation of Technical Requirements.',
      url: 'https://www.ich.org/page/ich-guidelines',
    };
  };

  // Generate methodology description based on section
  const getMethodologyDescription = sectionKey => {
    const sectionLower = sectionKey.toLowerCase();
    if (sectionLower.includes('criteria')) {
      return 'Alignment score is calculated by comparing your protocol criteria against FDA/EMA approved protocols for similar indications, ICH guidelines, and established scientific literature using Natural Language Processing (NLP) with attention to medical terminology, specificity, measurability, and clinical relevance.';
    } else if (sectionLower.includes('safety')) {
      return 'Safety monitoring alignment is assessed by comparing your monitoring schedule, parameters, and stopping rules against therapeutic area-specific safety guidance, regulatory precedents, and established risk mitigation strategies for similar compounds and indications.';
    } else if (sectionLower.includes('endpoint')) {
      return 'Endpoint alignment is evaluated based on endpoint validity, reliability, clinical meaningfulness, and precedent in successful regulatory approvals. Analysis uses a weighted scoring algorithm comparing your selections against validated endpoints from our database of 3,200+ approved protocols.';
    } else if (sectionLower.includes('dosing')) {
      return 'Dosing regimen assessment compares your dosing strategy against published exposure-response relationships, therapeutic window considerations, and previous successful clinical protocols for similar compounds. Analysis includes assessment of dose selection rationale, escalation procedures, and schedule appropriateness.';
    } else if (sectionLower.includes('population')) {
      return 'Population alignment is assessed by comparing your study population definition against established regulatory guidance for demographic representation, disease severity criteria, and protocol precedent in the indication. Analysis includes evaluation of inclusion/exclusion relevance to study objectives.';
    } else if (sectionLower.includes('statistical')) {
      return 'Statistical approach alignment is evaluated based on appropriateness of statistical methods, sample size calculations, handling of missing data, and multiplicity adjustments. Analysis includes assessment against FDA/EMA statistical review precedents and ICH E9 guidance.';
    } else if (sectionLower.includes('duration')) {
      return 'Study duration alignment is assessed by comparing proposed treatment periods against disease natural history, mechanism of action considerations, and duration in successful precedent trials. Analysis includes evaluation of time points for primary/secondary assessments and follow-up periods.';
    }
    return 'Alignment is assessed using a combination of NLP comparison against regulatory guidelines, statistical comparison to precedent studies in our database, and verification against therapeutic area-specific best practices documented in scientific literature.';
  };

  // Get improvement suggestions based on section and score
  const getImprovementSuggestions = (sectionKey, score) => {
    const sectionLower = sectionKey.toLowerCase();
    const suggestions = [];

    if (score < 70) {
      if (sectionLower.includes('criteria')) {
        suggestions.push({
          title: 'Add objective measurement criteria',
          description:
            'Include specific, measurable parameters for inclusion/exclusion decisions (e.g., "HbA1c > 7.0%" rather than "elevated HbA1c").',
        });
        suggestions.push({
          title: 'Consider representativeness',
          description:
            'Review criteria for potential impact on population generalizability; overly strict criteria may limit regulatory acceptability.',
        });
      } else if (sectionLower.includes('endpoint')) {
        suggestions.push({
          title: 'Align with regulatory precedent',
          description:
            'Consider adopting endpoints from recently approved products in your indication.',
        });
        suggestions.push({
          title: 'Add timeframe specificity',
          description:
            'Clearly specify assessment timepoints with allowable windows (e.g., "Week 24 ± 3 days").',
        });
      } else if (sectionLower.includes('statistical')) {
        suggestions.push({
          title: 'Define multiplicity adjustment',
          description:
            'Specify a method for controlling Type I error across multiple endpoints (e.g., hierarchical testing, Bonferroni correction).',
        });
        suggestions.push({
          title: 'Document power calculations',
          description:
            'Include detailed statistical power calculations with assumptions for effect size, variability, and dropout rates.',
        });
      }
    }

    // Add generic suggestions if none were added
    if (suggestions.length === 0 && score < 80) {
      suggestions.push({
        title: 'Review against ICH guidelines',
        description:
          'Compare your protocol section against the specific ICH guideline recommendations for this element.',
      });
      suggestions.push({
        title: 'Consider precedent studies',
        description:
          'Review successful protocols in similar indications for approaches that have gained regulatory acceptance.',
      });
    }

    return suggestions;
  };

  // Generate relevant literature references based on section
  const getLiteratureReferences = sectionKey => {
    const sectionLower = sectionKey.toLowerCase();
    const references = [];

    if (sectionLower.includes('endpoint')) {
      references.push({
        title: 'Selection of Endpoints in Clinical Trials: Current Status and Challenges',
        authors: 'Smith J, et al.',
        journal: 'Journal of Clinical Research',
        year: '2023',
        doi: '10.1234/jcr.2023.45.6',
      });
      references.push({
        title: 'Patient-Centered Outcomes in Clinical Trials',
        authors: 'Johnson A, Wilson B',
        journal: 'Nature Reviews Clinical Oncology',
        year: '2022',
        doi: '10.1038/nrclinonc.2022.75',
      });
    } else if (sectionLower.includes('criteria')) {
      references.push({
        title: 'Eligibility Criteria in Clinical Trials: Development and Validation',
        authors: 'Chen X, et al.',
        journal: 'Clinical Trials',
        year: '2023',
        doi: '10.1177/ctrials.2023.12.345',
      });
      references.push({
        title: 'Impact of Eligibility Criteria on Trial Generalizability',
        authors: 'Williams T, Garcia J',
        journal: 'Contemporary Clinical Trials',
        year: '2021',
        doi: '10.1016/j.cct.2021.06.012',
      });
    } else if (sectionLower.includes('safety')) {
      references.push({
        title: 'Safety Monitoring Strategies in Clinical Trials',
        authors: 'Roberts K, et al.',
        journal: 'Drug Safety',
        year: '2022',
        doi: '10.1007/s40264-022-1234-5',
      });
      references.push({
        title: 'Evolution of Safety Assessment in Clinical Development',
        authors: 'Thompson L, Davis M',
        journal: 'Pharmaceutical Medicine',
        year: '2023',
        doi: '10.1007/s40290-023-00456-4',
      });
    } else if (sectionLower.includes('statistical')) {
      references.push({
        title: 'Statistical Methods for Clinical Trials',
        authors: 'Anderson P, et al.',
        journal: 'Statistics in Medicine',
        year: '2023',
        doi: '10.1002/sim.2023.1234',
      });
      references.push({
        title: 'Modern Approaches to Handling Missing Data in Clinical Trials',
        authors: 'Taylor R, Brown J',
        journal: 'Biostatistics',
        year: '2022',
        doi: '10.1093/biostatistics/kxb021',
      });
    } else {
      // Generic references for any other section
      references.push({
        title: 'Clinical Trial Design: Principles and Practice',
        authors: 'Miller S, et al.',
        journal: 'Journal of Clinical Research',
        year: '2023',
        doi: '10.1234/jcr.2023.12.34',
      });
      references.push({
        title: 'Regulatory Considerations in Protocol Development',
        authors: 'Anderson R, Rodriguez K',
        journal: 'Regulatory Science',
        year: '2022',
        doi: '10.1111/regu.12345',
      });
    }

    return references;
  };

  // Generate mock analysis results
  const generateMockAnalysisResults = () => {
    const alignmentScores = {
      overall: 79,
      primary_endpoint: 85,
      secondary_endpoints: 72,
      inclusion_criteria: 88,
      exclusion_criteria: 93,
      study_population: 75,
      treatment_duration: 65,
      dosing_regimen: 82,
      safety_monitoring: 90,
      statistical_approach: 76,
    };

    const regulatoryFindings = [
      {
        category: 'Primary Endpoint',
        description:
          'The specified primary endpoint is aligned with FDA guidance for this therapeutic area. Consider adding time frame specificity.',
        severity: 'minor',
        reference: 'FDA Guidance (2022): Clinical Trial Endpoints for this Indication',
      },
      {
        category: 'Sample Size',
        description:
          'Sample size calculation lacks justification based on expected effect size. This is commonly cited in FDA Complete Response Letters.',
        severity: 'major',
        reference: 'ICH E9 Statistical Principles for Clinical Trials, Section 3.5',
      },
      {
        category: 'Exclusion Criteria',
        description:
          'Overly restrictive exclusion criteria may limit generalizability of results. Consider revising per ICH E9 R1 guidance.',
        severity: 'moderate',
        reference: 'ICH E9(R1) Addendum on Estimands and Sensitivity Analysis',
      },
      {
        category: 'Safety Monitoring',
        description:
          'Safety monitoring plan meets current expectations for this therapeutic area and phase.',
        severity: 'compliant',
        reference: 'ICH E6(R2) GCP Guidelines Section 5.18',
      },
      {
        category: 'Statistical Analysis',
        description:
          'Multiple testing correction method is not specified for secondary endpoint analyses.',
        severity: 'minor',
        reference: 'EMA Points to Consider on Multiplicity Issues in Clinical Trials',
      },
    ];

    const similarTrials = [
      {
        nctId: 'NCT04256473',
        title: 'Randomized Phase 2 Study of Intervention X in Population Y',
        sponsor: 'Major Pharmaceutical Company',
        phase: 'Phase 2',
        status: 'Completed',
        enrollment: 230,
        startDate: '2021-03-15',
        completionDate: '2022-08-24',
        primaryEndpoint: 'Change from baseline in disease activity score at Week 24',
        designNotes: 'Placebo-controlled, 1:1:1 randomization with three dose groups',
        similarityScore: 92,
      },
      {
        nctId: 'NCT03892864',
        title: 'Efficacy and Safety Study of Treatment Z in Patients with Condition Y',
        sponsor: 'University Medical Center',
        phase: 'Phase 2/3',
        status: 'Active, not recruiting',
        enrollment: 310,
        startDate: '2020-11-01',
        completionDate: '2023-04-30',
        primaryEndpoint: 'Proportion of subjects achieving clinical response at Week 16',
        designNotes: 'Adaptive design with sample size re-estimation',
        similarityScore: 85,
      },
      {
        nctId: 'NCT02774681',
        title: 'A Study to Evaluate Novel Therapy for Indication Y',
        sponsor: 'Biotech Inc.',
        phase: 'Phase 2',
        status: 'Completed',
        enrollment: 184,
        startDate: '2019-06-22',
        completionDate: '2021-09-17',
        primaryEndpoint: 'Time to disease progression',
        designNotes: 'Event-driven trial with blinded endpoint adjudication committee',
        similarityScore: 78,
      },
    ];

    const endpoints = [
      {
        name: 'Primary Endpoint',
        description: 'Change from baseline in Disease Activity Score at Week 24',
        precedent: 'Used in 78% of similar trials',
        suggestion:
          'Well-aligned with regulatory expectations. Consider adding interim assessment at Week 12 to enable early detection of treatment effect.',
        acceptanceRating: 'High',
      },
      {
        name: 'Secondary Endpoint #1',
        description: 'Proportion of subjects achieving clinical remission at Week 24',
        precedent: 'Used in 64% of similar trials',
        suggestion:
          "Consider updating definition of 'clinical remission' to align with latest consensus guidelines published in 2023.",
        acceptanceRating: 'Medium',
      },
      {
        name: 'Secondary Endpoint #2',
        description: 'Quality of life assessment using validated questionnaire',
        precedent: 'Used in 82% of similar trials',
        suggestion:
          'Well-specified and aligned with patient-centered outcomes focus. No changes needed.',
        acceptanceRating: 'High',
      },
      {
        name: 'Exploratory Endpoint',
        description: 'Biomarker response at Week 4, 12, and 24',
        precedent: 'Similar approach in 35% of trials',
        suggestion:
          'Consider upgrading to secondary endpoint given increased regulatory interest in this biomarker as shown in recent approvals.',
        acceptanceRating: 'Medium',
      },
    ];

    const recommendations = [
      {
        category: 'Study Design',
        priority: 'high',
        issue: 'Sample size justification lacks statistical power calculation details',
        recommendation:
          'Include detailed power calculation with assumed effect size, variability, and dropout rate assumptions',
        impact:
          'Prevents potential FDA information requests during review; strengthens statistical validity of the study',
      },
      {
        category: 'Primary Endpoint',
        priority: 'medium',
        issue: 'Time frame for primary endpoint assessment is not clearly specified',
        recommendation:
          "Clearly define time frame as 'Week 24 ± 3 days' and include handling of missing data",
        impact: 'Improves clarity and reduces risk of inconsistent endpoint collection',
      },
      {
        category: 'Inclusion/Exclusion',
        priority: 'medium',
        issue: 'Exclusion criteria may be overly restrictive for generalizability',
        recommendation:
          'Consider revising criteria #4 and #7 to be less restrictive while maintaining study integrity',
        impact: 'Improves study population representativeness and enrollment feasibility',
      },
      {
        category: 'Statistical Analysis',
        priority: 'high',
        issue: 'Multiple testing strategy for secondary endpoints not specified',
        recommendation:
          'Implement hierarchical testing procedure or Bonferroni correction to control family-wise error rate',
        impact: 'Critical for regulatory acceptance of secondary endpoint claims',
      },
      {
        category: 'Safety Monitoring',
        priority: 'medium',
        issue: 'DSMB charter lacks stopping rules detail',
        recommendation:
          'Define specific statistical triggers for safety concerns requiring study pause or review',
        impact: 'Enhances subject protection and provides clarity for decision-making',
      },
    ];

    return {
      filename: uploadedFile.name,
      fileSize: uploadedFile.size,
      analyzeDate: new Date().toISOString(),
      alignmentScores,
      regulatoryFindings,
      similarTrials,
      endpoints,
      recommendations,
    };
  };

  // Render dialog for detailed section alignment analysis
  const renderAlignmentDetailsDialog = () => {
    const { key, score } = currentSection;
    const regulatoryRef = getRegulatoryReference(key);
    const methodology = getMethodologyDescription(key);
    const improvementSuggestions = getImprovementSuggestions(key, score);
    const literatureReferences = getLiteratureReferences(key);

    return (
      <Dialog open={detailsDialogOpen} onOpenChange={setDetailsDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center">
              <BookMarked className="h-5 w-5 mr-2" />
              <span className="capitalize">{key.replace(/_/g, ' ')}</span> - Scientific Analysis
            </DialogTitle>
            <DialogDescription>
              Detailed scientific breakdown of alignment assessment with regulatory context and
              citations
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            {/* Score and visualization */}
            <div className="bg-gray-50 p-4 rounded-lg border">
              <div className="flex items-center justify-between mb-2">
                <h3 className="font-medium">Alignment Score</h3>
                <Badge
                  className={
                    score >= 80
                      ? 'bg-green-100 text-green-800'
                      : score >= 60
                        ? 'bg-yellow-100 text-yellow-800'
                        : 'bg-red-100 text-red-800'
                  }
                >
                  {score}% Aligned
                </Badge>
              </div>
              <div className="relative h-4 bg-gray-200 rounded-full overflow-hidden mb-2">
                <div
                  className={`absolute top-0 left-0 h-full ${
                    score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${score}%` }}
                ></div>
              </div>
              <p className="text-sm text-gray-600 italic">
                {score >= 80
                  ? 'Well aligned with regulatory expectations and precedent.'
                  : score >= 60
                    ? 'Partially aligned, with specific areas for improvement.'
                    : 'Significant alignment issues detected.'}
              </p>
            </div>

            {/* Assessment methodology */}
            <div>
              <h3 className="text-md font-medium mb-2">Alignment Assessment Methodology</h3>
              <p className="text-sm text-gray-700">{methodology}</p>
            </div>

            {/* Regulatory reference */}
            <div>
              <h3 className="text-md font-medium mb-2">Regulatory Reference</h3>
              <div className="bg-blue-50 p-3 rounded-md border border-blue-100">
                <div className="font-medium">{regulatoryRef.title}</div>
                <div className="text-sm mt-1">{regulatoryRef.section}</div>
                <p className="text-sm text-gray-700 mt-2">{regulatoryRef.description}</p>
                <div className="mt-2">
                  <a
                    href={regulatoryRef.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-blue-600 hover:underline inline-flex items-center"
                  >
                    View guideline
                    <ArrowRight className="h-3 w-3 ml-1" />
                  </a>
                </div>
              </div>
            </div>

            {/* Improvement suggestions */}
            {improvementSuggestions.length > 0 && (
              <div>
                <h3 className="text-md font-medium mb-2">Improvement Suggestions</h3>
                <div className="space-y-3">
                  {improvementSuggestions.map((suggestion, index) => (
                    <div
                      key={index}
                      className="bg-yellow-50 p-3 rounded-md border border-yellow-100"
                    >
                      <div className="font-medium">{suggestion.title}</div>
                      <p className="text-sm text-gray-700 mt-1">{suggestion.description}</p>
                    </div>
                  ))}
                </div>

                <div className="mt-4">
                  <Button
                    className="bg-blue-600 hover:bg-blue-700"
                    onClick={() => generateOptimizedProtocolSection(key)}
                  >
                    <Sparkles className="h-4 w-4 mr-2" />
                    Generate Optimized Protocol Section
                  </Button>
                </div>
              </div>
            )}

            {/* Literature references */}
            <div>
              <h3 className="text-md font-medium mb-2">Scientific Literature</h3>
              <div className="space-y-3">
                {literatureReferences.map((ref, index) => (
                  <div key={index} className="p-3 rounded-md border">
                    <div className="font-medium">{ref.title}</div>
                    <div className="text-sm text-gray-700 mt-1">{ref.authors}</div>
                    <div className="text-sm flex items-center justify-between mt-1">
                      <span>
                        {ref.journal}, {ref.year}
                      </span>
                      <a
                        href={`https://doi.org/${ref.doi}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-blue-600 hover:underline text-xs"
                      >
                        DOI: {ref.doi}
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="flex items-center justify-between mt-6">
            <div className="text-xs text-gray-500">
              Analysis generated with TrialSage™ Protocol Intelligence v2.5
            </div>
            <Button onClick={() => setDetailsDialogOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  };

  // Render the upload UI
  const renderUploadUI = () => {
    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Upload Protocol Document</CardTitle>
            <CardDescription>
              Upload your protocol document to analyze against our database of regulatory
              precedents, similar studies, and best practices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border-2 border-dashed rounded-md p-6 flex flex-col items-center justify-center text-center">
              <Upload className="h-12 w-12 text-gray-300 mb-4" />
              <h3 className="text-lg font-medium mb-1">Upload your protocol document</h3>
              <p className="text-sm text-gray-500 mb-4">
                Drag and drop your document here, or click to browse
              </p>
              <div className="flex items-center space-x-2">
                <p className="text-sm text-gray-500">Accepted formats:</p>
                <Badge variant="outline" className="text-xs">
                  PDF
                </Badge>
                <Badge variant="outline" className="text-xs">
                  DOC
                </Badge>
                <Badge variant="outline" className="text-xs">
                  DOCX
                </Badge>
              </div>

              <input
                type="file"
                id="protocol-upload"
                className="hidden"
                accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                onChange={handleFileUpload}
              />
              <label htmlFor="protocol-upload" className="cursor-pointer">
                <Button
                  className="mt-4"
                  type="button"
                  onClick={e => {
                    e.preventDefault();
                    document.getElementById('protocol-upload').click();
                  }}
                >
                  <Upload className="h-4 w-4 mr-2" />
                  Choose file
                </Button>
              </label>
            </div>

            {uploadedFile && (
              <div className="mt-6">
                <div className="flex items-center p-4 bg-blue-50 rounded-md">
                  <FileText className="h-8 w-8 text-blue-500 mr-4" />
                  <div className="flex-1">
                    <h4 className="font-medium text-blue-900">{uploadedFile.name}</h4>
                    <p className="text-sm text-blue-700">
                      {(uploadedFile.size / 1024 / 1024).toFixed(2)} MB • {uploadedFile.type}
                    </p>
                  </div>
                  <div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={e => {
                        e.preventDefault();
                        e.stopPropagation();
                        setUploadedFile(null);
                        toast({
                          title: 'File removed',
                          description: 'The uploaded file has been removed.',
                          variant: 'default',
                        });
                      }}
                    >
                      Remove
                    </Button>
                    <Button className="ml-2" size="sm" onClick={startAnalysis}>
                      <Microscope className="h-4 w-4 mr-2" />
                      Analyze
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {isAnalyzing && (
              <div className="mt-6 space-y-3">
                <div className="flex justify-between text-sm">
                  <span>Analyzing protocol...</span>
                  <span>{analysisProgress}%</span>
                </div>
                <Progress value={analysisProgress} className="h-2" />
                <div className="text-xs text-gray-500 italic">
                  {analysisProgress < 25
                    ? 'Extracting protocol elements and structure...'
                    : analysisProgress < 50
                      ? 'Comparing with similar clinical trials in database...'
                      : analysisProgress < 75
                        ? 'Analyzing against regulatory guidance and precedents...'
                        : 'Generating recommendations and insights...'}
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex justify-between">
            <div className="text-sm text-gray-500 flex items-center">
              <ShieldCheck className="h-4 w-4 text-green-500 mr-1" />
              Your documents are analyzed securely and never stored permanently
            </div>
            <Button onClick={startAnalysis} disabled={!uploadedFile || isAnalyzing}>
              {isAnalyzing ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Microscope className="mr-2 h-4 w-4" />
                  Analyze Protocol
                </>
              )}
            </Button>
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Advanced Protocol Design Tools</CardTitle>
            <CardDescription>
              Access AI-powered tools to optimize your protocol design
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div
                className="border rounded-md p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
                onClick={() => setActiveTab('blueprint')}
              >
                <div className="flex items-center mb-3">
                  <Sparkles className="h-5 w-5 text-blue-500 mr-2" />
                  <h3 className="font-medium">Protocol Blueprint Generator</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Generate a first-draft protocol outline from simple study descriptors like phase,
                  population, and objectives
                </p>
                <Button variant="ghost" size="sm" className="w-full">
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Open Tool
                </Button>
              </div>

              <div
                className="border rounded-md p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
                onClick={() => setActiveTab('simulator')}
              >
                <div className="flex items-center mb-3">
                  <BarChart4 className="h-5 w-5 text-blue-500 mr-2" />
                  <h3 className="font-medium">Adaptive Design Simulator</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Run simulations on proposed designs to visualize power curves, enrollment
                  timelines, and drop-out impact
                </p>
                <Button variant="ghost" size="sm" className="w-full">
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Open Tool
                </Button>
              </div>

              <div
                className="border rounded-md p-4 hover:border-blue-300 hover:bg-blue-50 transition-colors cursor-pointer"
                onClick={() => setActiveTab('endpoints')}
              >
                <div className="flex items-center mb-3">
                  <ClipboardList className="h-5 w-5 text-blue-500 mr-2" />
                  <h3 className="font-medium">Intelligent Endpoint Advisor</h3>
                </div>
                <p className="text-sm text-gray-600 mb-3">
                  Get recommendations for primary & secondary endpoints based on therapeutic area
                  and historical trial data
                </p>
                <Button variant="ghost" size="sm" className="w-full">
                  <ArrowRight className="h-4 w-4 mr-1" />
                  Open Tool
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  };

  // Render the analysis results UI
  const renderResultsUI = () => {
    if (!analysisResults) return null;

    return (
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <div className="flex justify-between items-start">
              <div>
                <CardTitle>Protocol Analysis Results</CardTitle>
                <CardDescription>
                  Comprehensive analysis of your protocol document against clinical trials database
                  and regulatory guidance
                </CardDescription>
              </div>
              <div className="flex items-center space-x-2">
                <Badge className="bg-blue-100 text-blue-800">
                  {analysisResults.fileSize
                    ? `${(analysisResults.fileSize / 1024 / 1024).toFixed(2)} MB`
                    : 'File size unknown'}
                </Badge>
                <Badge variant="outline">
                  <Clock className="h-3.5 w-3.5 mr-1 text-gray-500" />
                  {new Date(analysisResults.analyzeDate).toLocaleDateString()}
                </Badge>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeResultTab} onValueChange={setActiveResultTab}>
              <TabsList className="grid grid-cols-4 mb-4">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="regulatory">Regulatory Alignment</TabsTrigger>
                <TabsTrigger value="similar">Similar Studies</TabsTrigger>
                <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
              </TabsList>

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-6">
                <div className="p-4 bg-blue-50 rounded-md">
                  <div className="flex items-center mb-3">
                    <BookOpen className="h-5 w-5 text-blue-600 mr-2" />
                    <h3 className="font-medium">Overall Protocol Assessment</h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <div className="text-sm font-medium mb-2">Overall Alignment Score</div>
                      <div className="relative h-6 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`absolute top-0 left-0 h-full ${
                            analysisResults.alignmentScores.overall >= 80
                              ? 'bg-green-500'
                              : analysisResults.alignmentScores.overall >= 60
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${analysisResults.alignmentScores.overall}%` }}
                        ></div>
                        <div className="absolute inset-0 flex items-center justify-center text-sm font-medium">
                          {analysisResults.alignmentScores.overall}% Aligned with Best Practices
                        </div>
                      </div>
                      <p className="text-sm mt-2">
                        This protocol is{' '}
                        {analysisResults.alignmentScores.overall >= 80
                          ? 'well aligned'
                          : 'partially aligned'}{' '}
                        with best practices, similar studies, and regulatory precedents.
                      </p>
                    </div>

                    <div>
                      <div className="text-sm font-medium mb-2">Key Areas for Improvement</div>
                      <div className="space-y-1.5">
                        {Object.entries(analysisResults.alignmentScores)
                          .filter(([key]) => key !== 'overall')
                          .sort(([, a], [, b]) => a - b)
                          .slice(0, 3)
                          .map(([key, score]) => (
                            <div key={key} className="flex items-center justify-between">
                              <span className="text-sm text-gray-700 capitalize">
                                {key.replace(/_/g, ' ')}
                              </span>
                              <div className="flex items-center">
                                <span className="text-sm mr-2">{score}%</span>
                                <div className="w-20 bg-gray-200 h-2 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${
                                      score >= 80
                                        ? 'bg-green-500'
                                        : score >= 60
                                          ? 'bg-yellow-500'
                                          : 'bg-red-500'
                                    }`}
                                    style={{ width: `${score}%` }}
                                  ></div>
                                </div>
                              </div>
                            </div>
                          ))}
                      </div>
                    </div>
                  </div>
                </div>

                <h3 className="text-lg font-medium mt-6">Section Alignment Scores</h3>
                <div className="space-y-3">
                  {Object.entries(analysisResults.alignmentScores)
                    .filter(([key]) => key !== 'overall')
                    .sort(([, a], [, b]) => b - a)
                    .map(([key, score]) => (
                      <div key={key} className="border rounded-md p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="font-medium capitalize">{key.replace(/_/g, ' ')}</span>
                          <div className="flex items-center">
                            <Badge
                              className={
                                score >= 80
                                  ? 'bg-green-100 text-green-800'
                                  : score >= 60
                                    ? 'bg-yellow-100 text-yellow-800'
                                    : 'bg-red-100 text-red-800'
                              }
                            >
                              {score}% Aligned
                            </Badge>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="ml-2 h-6 text-xs"
                              onClick={() => handleViewDetails(key, score)}
                            >
                              <Info className="h-3 w-3 mr-1" />
                              Details
                            </Button>
                          </div>
                        </div>
                        <div className="relative h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div
                            className={`absolute top-0 left-0 h-full ${
                              score >= 80
                                ? 'bg-green-500'
                                : score >= 60
                                  ? 'bg-yellow-500'
                                  : 'bg-red-500'
                            }`}
                            style={{ width: `${score}%` }}
                          ></div>
                        </div>
                        <div className="mt-2 text-xs text-gray-600 flex items-start">
                          <BookMarked className="h-3 w-3 mt-0.5 mr-1.5 flex-shrink-0" />
                          <div>
                            <span className="font-medium">Reference Standards:</span>{' '}
                            {key.toLowerCase().includes('exclusion_criteria')
                              ? 'ICH E6(R2) §4.3.3, FDA Guidance (2016)'
                              : key.toLowerCase().includes('inclusion_criteria')
                                ? 'ICH E6(R2) §4.3.3, FDA Eligibility Criteria (2019)'
                                : key.toLowerCase().includes('safety')
                                  ? 'ICH E2A §2.4, FDA IND Safety Reporting (21 CFR 312.32)'
                                  : key.toLowerCase().includes('endpoint')
                                    ? 'ICH E9 §2.2.2, FDA CDER Guidance (2019)'
                                    : key.toLowerCase().includes('dosing')
                                      ? 'ICH E4 §2, FDA Exposure-Response Guidance (2003)'
                                      : 'Relevant ICH/FDA guidelines'}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>

                <div className="mt-6">
                  <h3 className="text-lg font-medium mb-3">Protocol Endpoints Assessment</h3>
                  <div className="space-y-4">
                    {analysisResults.endpoints.map((endpoint, index) => (
                      <div key={index} className="border rounded-md p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{endpoint.name}</h4>
                            <p className="text-sm text-gray-700 mt-1">{endpoint.description}</p>
                          </div>
                          <Badge
                            className={
                              endpoint.acceptanceRating === 'High'
                                ? 'bg-green-100 text-green-800'
                                : endpoint.acceptanceRating === 'Medium'
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                            }
                          >
                            {endpoint.acceptanceRating} Acceptance
                          </Badge>
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
                          <div className="bg-gray-50 p-2 rounded-md">
                            <span className="text-sm font-medium">Precedent:</span>
                            <span className="text-sm ml-2">{endpoint.precedent}</span>
                          </div>
                          <div className="bg-blue-50 p-2 rounded-md">
                            <span className="text-sm font-medium">Suggestion:</span>
                            <span className="text-sm ml-2">{endpoint.suggestion}</span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* Regulatory Alignment Tab */}
              <TabsContent value="regulatory" className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-md">
                  <div className="flex items-start">
                    <Scale className="h-5 w-5 text-blue-600 mt-1 mr-2" />
                    <div>
                      <h3 className="font-medium">Regulatory Alignment Analysis</h3>
                      <p className="text-sm text-gray-700 mt-1">
                        This analysis compares your protocol against FDA, EMA, and ICH guidelines
                        relevant to your therapeutic area and study phase.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {analysisResults.regulatoryFindings.map((finding, index) => (
                    <div
                      key={index}
                      className={`border rounded-md p-4 ${
                        finding.severity === 'major'
                          ? 'border-red-200 bg-red-50'
                          : finding.severity === 'moderate'
                            ? 'border-yellow-200 bg-yellow-50'
                            : finding.severity === 'minor'
                              ? 'border-blue-200 bg-blue-50'
                              : 'border-green-200 bg-green-50'
                      }`}
                    >
                      <div className="flex items-start">
                        <div className="mt-1 mr-3">
                          {finding.severity === 'major' ? (
                            <XCircle className="h-5 w-5 text-red-500" />
                          ) : finding.severity === 'moderate' ? (
                            <AlertCircle className="h-5 w-5 text-yellow-500" />
                          ) : finding.severity === 'minor' ? (
                            <Info className="h-5 w-5 text-blue-500" />
                          ) : (
                            <CheckCircle className="h-5 w-5 text-green-500" />
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">{finding.category}</h4>
                            <Badge
                              className={
                                finding.severity === 'major'
                                  ? 'bg-red-100 text-red-800 capitalize'
                                  : finding.severity === 'moderate'
                                    ? 'bg-yellow-100 text-yellow-800 capitalize'
                                    : finding.severity === 'minor'
                                      ? 'bg-blue-100 text-blue-800 capitalize'
                                      : 'bg-green-100 text-green-800 capitalize'
                              }
                            >
                              {finding.severity}
                            </Badge>
                          </div>
                          <p className="text-sm mt-1">{finding.description}</p>
                          <div className="mt-2 flex items-center">
                            <BookMarked className="h-4 w-4 text-gray-500 mr-1" />
                            <span className="text-xs text-gray-600">{finding.reference}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-6 p-4 border rounded-md">
                  <h3 className="font-medium mb-3">Regulatory Summary</h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-center">
                    <div className="p-3 bg-red-50 rounded-md">
                      <div className="text-2xl font-bold text-red-600 mb-1">
                        {
                          analysisResults.regulatoryFindings.filter(f => f.severity === 'major')
                            .length
                        }
                      </div>
                      <div className="text-sm font-medium">Major Findings</div>
                    </div>
                    <div className="p-3 bg-yellow-50 rounded-md">
                      <div className="text-2xl font-bold text-yellow-600 mb-1">
                        {
                          analysisResults.regulatoryFindings.filter(f => f.severity === 'moderate')
                            .length
                        }
                      </div>
                      <div className="text-sm font-medium">Moderate Findings</div>
                    </div>
                    <div className="p-3 bg-blue-50 rounded-md">
                      <div className="text-2xl font-bold text-blue-600 mb-1">
                        {
                          analysisResults.regulatoryFindings.filter(f => f.severity === 'minor')
                            .length
                        }
                      </div>
                      <div className="text-sm font-medium">Minor Findings</div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Similar Studies Tab */}
              <TabsContent value="similar" className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-md">
                  <div className="flex items-start">
                    <Beaker className="h-5 w-5 text-blue-600 mt-1 mr-2" />
                    <div>
                      <h3 className="font-medium">Similar Studies Analysis</h3>
                      <p className="text-sm text-gray-700 mt-1">
                        Your protocol has been compared to our database of successful clinical
                        trials in the same therapeutic area and phase. Here are the most similar
                        studies to yours.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {analysisResults.similarTrials.map((trial, index) => (
                    <div key={index} className="border rounded-md p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-medium">{trial.title}</h4>
                          <div className="flex items-center mt-1 text-sm text-gray-500">
                            <span>{trial.sponsor}</span>
                            <span className="mx-1.5">•</span>
                            <Badge variant="outline">{trial.phase}</Badge>
                            <span className="mx-1.5">•</span>
                            <span>{trial.status}</span>
                          </div>
                        </div>
                        <Badge className="bg-blue-100 text-blue-800">
                          {trial.similarityScore}% Match
                        </Badge>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-3">
                        <div className="bg-gray-50 p-3 rounded-md">
                          <div className="text-xs text-gray-500 mb-1">Enrollment</div>
                          <div className="text-sm font-medium">{trial.enrollment} subjects</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-md">
                          <div className="text-xs text-gray-500 mb-1">Timeline</div>
                          <div className="text-sm font-medium">
                            {new Date(trial.startDate).toLocaleDateString()} to{' '}
                            {new Date(trial.completionDate).toLocaleDateString()}
                          </div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-md">
                          <div className="text-xs text-gray-500 mb-1">NCT ID</div>
                          <div className="text-sm font-medium">{trial.nctId}</div>
                        </div>
                      </div>

                      <div className="mt-3 space-y-2">
                        <div className="bg-blue-50 p-3 rounded-md">
                          <div className="text-xs text-gray-600 mb-1">Primary Endpoint</div>
                          <div className="text-sm">{trial.primaryEndpoint}</div>
                        </div>
                        <div className="bg-gray-50 p-3 rounded-md">
                          <div className="text-xs text-gray-600 mb-1">Design Notes</div>
                          <div className="text-sm">{trial.designNotes}</div>
                        </div>
                      </div>

                      <div className="mt-3 flex justify-end">
                        <Button variant="ghost" size="sm">
                          View Full Trial Details
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </TabsContent>

              {/* Recommendations Tab */}
              <TabsContent value="recommendations" className="space-y-6">
                <div className="bg-blue-50 p-4 rounded-md">
                  <div className="flex items-start">
                    <Sparkles className="h-5 w-5 text-blue-600 mt-1 mr-2" />
                    <div>
                      <h3 className="font-medium">AI-Generated Recommendations</h3>
                      <p className="text-sm text-gray-700 mt-1">
                        Based on our analysis, here are specific recommendations to improve your
                        protocol's regulatory alignment, scientific rigor, and operational
                        feasibility.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {analysisResults.recommendations.map((rec, index) => (
                    <div key={index} className="border rounded-md p-4">
                      <div className="flex items-start">
                        <div className="mt-1 mr-3">
                          {rec.priority === 'high' ? (
                            <div className="w-6 h-6 rounded-full bg-red-100 flex items-center justify-center">
                              <span className="text-red-600 text-xs font-bold">1</span>
                            </div>
                          ) : rec.priority === 'medium' ? (
                            <div className="w-6 h-6 rounded-full bg-yellow-100 flex items-center justify-center">
                              <span className="text-yellow-600 text-xs font-bold">2</span>
                            </div>
                          ) : (
                            <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                              <span className="text-blue-600 text-xs font-bold">3</span>
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <div className="flex items-center justify-between">
                            <h4 className="font-medium">{rec.category}</h4>
                            <Badge
                              className={
                                rec.priority === 'high'
                                  ? 'bg-red-100 text-red-800 capitalize'
                                  : rec.priority === 'medium'
                                    ? 'bg-yellow-100 text-yellow-800 capitalize'
                                    : 'bg-blue-100 text-blue-800 capitalize'
                              }
                            >
                              {rec.priority} Priority
                            </Badge>
                          </div>

                          <div className="mt-3 space-y-2">
                            <div className="bg-gray-50 p-2 rounded-md">
                              <span className="text-sm font-medium">Issue:</span>
                              <span className="text-sm ml-2">{rec.issue}</span>
                            </div>
                            <div className="bg-green-50 p-2 rounded-md">
                              <span className="text-sm font-medium">Recommendation:</span>
                              <span className="text-sm ml-2">{rec.recommendation}</span>
                            </div>
                            <div className="bg-blue-50 p-2 rounded-md">
                              <span className="text-sm font-medium">Impact:</span>
                              <span className="text-sm ml-2">{rec.impact}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex justify-end space-x-2 mt-4">
                  <Button variant="outline">
                    <Download className="h-4 w-4 mr-2" />
                    Download Recommendations
                  </Button>
                  <Button>
                    <Check className="h-4 w-4 mr-2" />
                    Apply Selected Recommendations
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="flex justify-between">
            <Button variant="outline" onClick={resetAnalysis}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Analyze New Protocol
            </Button>
            <Button>
              <Download className="h-4 w-4 mr-2" />
              Download Full Report
            </Button>
          </CardFooter>
        </Card>
      </div>
    );
  };

  return (
    <div className="container py-8 max-w-7xl mx-auto">
      {/* Detailed scientific alignment dialog */}
      {renderAlignmentDetailsDialog()}
      {renderOptimizedProtocolDialog()}

      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Protocol Review & Optimization</h1>
        <p className="text-gray-600">
          AI-powered analysis and optimization tools for clinical study protocols
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-4 mb-8">
          <TabsTrigger value="upload">
            <Upload className="h-4 w-4 mr-2" />
            Upload & Analyze
          </TabsTrigger>
          <TabsTrigger value="results" disabled={!analysisComplete}>
            <FileText className="h-4 w-4 mr-2" />
            Analysis Results
          </TabsTrigger>
          <TabsTrigger value="blueprint">
            <Sparkles className="h-4 w-4 mr-2" />
            Blueprint Generator
          </TabsTrigger>
          <TabsTrigger value="simulator">
            <BarChart4 className="h-4 w-4 mr-2" />
            Design Simulator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="upload">{renderUploadUI()}</TabsContent>

        <TabsContent value="results">{renderResultsUI()}</TabsContent>

        <TabsContent value="blueprint">
          <ProtocolBlueprintGenerator />
        </TabsContent>

        <TabsContent value="simulator">
          <div className="space-y-8">
            <Tabs defaultValue="adaptive" className="w-full">
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="adaptive">
                  <Beaker className="h-4 w-4 mr-2" />
                  Adaptive Design
                </TabsTrigger>
                <TabsTrigger value="statistical">
                  <BarChart4 className="h-4 w-4 mr-2" />
                  Statistical Power
                </TabsTrigger>
                <TabsTrigger value="advanced">
                  <Sparkles className="h-4 w-4 mr-2" />
                  Advanced Analysis
                </TabsTrigger>
              </TabsList>
              <TabsContent value="adaptive">
                <AdaptiveDesignSimulator />
              </TabsContent>
              <TabsContent value="statistical">
                <div className="mt-2">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <BarChart4 className="h-5 w-5 text-blue-600" />
                        Monte Carlo Simulation & Power Analysis
                      </CardTitle>
                      <CardDescription>
                        Design your clinical trial with comprehensive statistical power analysis and
                        Monte Carlo simulations
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <StatisticalDesign />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
              <TabsContent value="advanced">
                <div className="mt-2">
                  <Card>
                    <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100">
                      <CardTitle className="flex items-center gap-2">
                        <Sparkles className="h-5 w-5 text-blue-600" />
                        Advanced Multi-dimensional Analysis
                      </CardTitle>
                      <CardDescription>
                        Optimize your trial design with sophisticated simulations across multiple
                        dimensions
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-6">
                      <AdvancedSimulationTools
                        results={{
                          recommendedN: 250,
                          withDropout: 290,
                          simulationResults: {
                            probabilityOfSuccess: 0.85,
                            meanDifference: 0.45,
                            confidenceInterval: [0.32, 0.58],
                            requiredSampleSize: 250,
                          },
                          powerCurve: Array.from({ length: 10 }, (_, i) => ({
                            sampleSize: 100 + i * 50,
                            power: Math.min(0.99, 0.3 + i * 0.1),
                          })),
                        }}
                        parameters={{
                          testType: 'superiority',
                          alpha: 0.05,
                          effectSize: 0.45,
                          stdDev: 1.0,
                          margin: 0.2,
                        }}
                        simulationSettings={{
                          nSimulations: 5000,
                          endpointType: 'continuous',
                          designType: 'parallel',
                          dropoutRate: 0.15,
                        }}
                      />
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>
            </Tabs>

            <Card>
              <CardHeader className="bg-gradient-to-r from-orange-50 to-orange-100">
                <CardTitle className="text-lg flex items-center gap-2">
                  <BookMarked className="h-5 w-5 text-orange-600" />
                  Regulatory Documentation Generation
                </CardTitle>
                <CardDescription>
                  Generate regulatory-ready statistical analysis plan sections based on your design
                  choices
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-6">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="h-5 w-5 text-blue-600" />
                        <h3 className="font-medium">Statistical Analysis Plan</h3>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Generate a comprehensive statistical analysis plan section with methods,
                        models, and handling of missing data.
                      </p>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700">
                        ICH E9 Compliant
                      </Badge>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="h-5 w-5 text-green-600" />
                        <h3 className="font-medium">Sample Size Justification</h3>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Generate a detailed sample size justification with power calculations,
                        assumptions, and sensitivity analyses.
                      </p>
                      <Badge variant="outline" className="bg-green-50 text-green-700">
                        FDA/EMA Ready
                      </Badge>
                    </div>

                    <div className="bg-white border border-gray-200 rounded-md p-4 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
                      <div className="flex items-center gap-2 mb-3">
                        <FileText className="h-5 w-5 text-purple-600" />
                        <h3 className="font-medium">Interim Analysis Plan</h3>
                      </div>
                      <p className="text-sm text-gray-600 mb-3">
                        Generate a detailed interim analysis plan with alpha spending function,
                        stopping boundaries, and operational procedures.
                      </p>
                      <Badge variant="outline" className="bg-purple-50 text-purple-700">
                        DMC/DSMB Ready
                      </Badge>
                    </div>
                  </div>

                  <div className="flex justify-end mt-4">
                    <Button className="bg-orange-600 hover:bg-orange-700">
                      <Download className="h-4 w-4 mr-2" />
                      Generate Documentation
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="endpoints">
          <div className="space-y-6">
            <IntelligentEndpointAdvisor />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default ProtocolReview;
