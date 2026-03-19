import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import {
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  FileText,
  Users,
  Clipboard,
  Beaker,
  ArrowRight,
  BarChart,
  Briefcase,
  Scale,
  Database,
  BookOpen,
  Droplet,
  Target,
} from 'lucide-react';
// Custom circular progress component instead of using react-circular-progressbar

// Data model for success/failure factors
interface SuccessFactor {
  id: string;
  factor: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
  implementationStatus?: 'implemented' | 'partial' | 'not implemented';
  evidence: string;
  recommendations: string[];
  resources?: string[];
}

interface FailureFactor {
  id: string;
  factor: string;
  impact: 'high' | 'medium' | 'low';
  description: string;
  warningSign: string;
  mitigationStatus?: 'mitigated' | 'partial' | 'at risk';
  frequency: string;
  mitigationSteps: string[];
}

interface KnowledgeSource {
  id: string;
  title: string;
  type: 'CSR' | 'Literature' | 'Regulatory' | 'Internal';
  relevance: number;
  key_findings: string;
}

interface SuccessFailureData {
  operationalSuccess: SuccessFactor[];
  operationalFailure: FailureFactor[];
  clinicalSuccess: SuccessFactor[];
  clinicalFailure: FailureFactor[];
  indication: string;
  phase: string;
  studyType: string;
  similarTrials: number;
  successRate: number;
  knowledgeSources: KnowledgeSource[];
  implementationScore: number;
  riskMitigationScore: number;
}

// Component to display a success factor
const SuccessFactorCard = ({ factor }: { factor: SuccessFactor }) => {
  const [expanded, setExpanded] = useState(false);

  // Determine color based on impact
  const impactColor =
    factor.impact === 'high'
      ? 'text-green-600'
      : factor.impact === 'medium'
        ? 'text-blue-600'
        : 'text-slate-600';

  // Determine implementation status badge
  const implementationBadge = () => {
    if (!factor.implementationStatus) return null;

    if (factor.implementationStatus === 'implemented') {
      return <Badge className="bg-green-100 text-green-800">Implemented</Badge>;
    } else if (factor.implementationStatus === 'partial') {
      return <Badge className="bg-amber-100 text-amber-800">Partially Implemented</Badge>;
    } else {
      return <Badge className="bg-slate-100 text-slate-800">Not Implemented</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <CheckCircle className={`h-5 w-5 mr-3 ${impactColor}`} />
            <CardTitle className="text-base">{factor.factor}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${impactColor} bg-opacity-10`}>
              {factor.impact.charAt(0).toUpperCase() + factor.impact.slice(1)} Impact
            </Badge>
            {implementationBadge()}
          </div>
        </div>
        <CardDescription className="mt-2">{factor.description}</CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-3">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium mb-1">Evidence Base:</h4>
              <p className="text-sm text-slate-600">{factor.evidence}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-1">Implementation Recommendations:</h4>
              <ul className="space-y-1">
                {factor.recommendations.map((rec, i) => (
                  <li key={i} className="text-sm text-slate-600 flex">
                    <ArrowRight className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5 text-primary" />
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>

            {factor.resources && (
              <div>
                <h4 className="text-sm font-medium mb-1">Resources:</h4>
                <ul className="space-y-1">
                  {factor.resources.map((resource, i) => (
                    <li key={i} className="text-sm text-slate-600 flex">
                      <BookOpen className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5 text-blue-500" />
                      <span>{resource}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </CardContent>
      )}

      <CardFooter className="pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs hover:bg-slate-100"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show Less' : 'Show More'}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Component to display a failure factor
const FailureFactorCard = ({ factor }: { factor: FailureFactor }) => {
  const [expanded, setExpanded] = useState(false);

  // Determine color based on impact
  const impactColor =
    factor.impact === 'high'
      ? 'text-red-600'
      : factor.impact === 'medium'
        ? 'text-amber-600'
        : 'text-orange-600';

  // Determine mitigation status badge
  const mitigationBadge = () => {
    if (!factor.mitigationStatus) return null;

    if (factor.mitigationStatus === 'mitigated') {
      return <Badge className="bg-green-100 text-green-800">Mitigated</Badge>;
    } else if (factor.mitigationStatus === 'partial') {
      return <Badge className="bg-amber-100 text-amber-800">Partially Mitigated</Badge>;
    } else {
      return <Badge className="bg-red-100 text-red-800">At Risk</Badge>;
    }
  };

  return (
    <Card
      className={`border-l-4 ${
        factor.impact === 'high'
          ? 'border-l-red-500'
          : factor.impact === 'medium'
            ? 'border-l-amber-500'
            : 'border-l-orange-400'
      }`}
    >
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <XCircle className={`h-5 w-5 mr-3 ${impactColor}`} />
            <CardTitle className="text-base">{factor.factor}</CardTitle>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={`${impactColor} bg-opacity-10`}>
              {factor.impact.charAt(0).toUpperCase() + factor.impact.slice(1)} Impact
            </Badge>
            {mitigationBadge()}
          </div>
        </div>
        <CardDescription className="mt-2">{factor.description}</CardDescription>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-3">
          <div className="space-y-3">
            <div>
              <h4 className="text-sm font-medium mb-1">Warning Signs:</h4>
              <p className="text-sm text-slate-600">{factor.warningSign}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-1">Frequency:</h4>
              <p className="text-sm text-slate-600">{factor.frequency}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium mb-1">Mitigation Steps:</h4>
              <ul className="space-y-1">
                {factor.mitigationSteps.map((step, i) => (
                  <li key={i} className="text-sm text-slate-600 flex">
                    <AlertTriangle className="h-4 w-4 mr-2 flex-shrink-0 mt-0.5 text-amber-500" />
                    <span>{step}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      )}

      <CardFooter className="pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs hover:bg-slate-100"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show Less' : 'Show More'}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Component to display knowledge source
const KnowledgeSourceCard = ({ source }: { source: KnowledgeSource }) => {
  const [expanded, setExpanded] = useState(false);

  // Icon by type
  const getIcon = () => {
    switch (source.type) {
      case 'CSR':
        return <FileText className="h-5 w-5 text-blue-600" />;
      case 'Literature':
        return <BookOpen className="h-5 w-5 text-purple-600" />;
      case 'Regulatory':
        return <Scale className="h-5 w-5 text-green-600" />;
      case 'Internal':
        return <Database className="h-5 w-5 text-slate-600" />;
      default:
        return <FileText className="h-5 w-5 text-blue-600" />;
    }
  };

  return (
    <Card className="border">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            {getIcon()}
            <CardTitle className="text-sm ml-2">{source.title}</CardTitle>
          </div>
          <Badge variant="outline">{source.type}</Badge>
        </div>
      </CardHeader>

      {expanded && (
        <CardContent className="pt-0 pb-2">
          <p className="text-sm text-slate-600">{source.key_findings}</p>
        </CardContent>
      )}

      <CardFooter className="py-1">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs hover:bg-slate-100"
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? 'Show Less' : 'Show More'}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Component to display scorecard
const ImplementationScorecard = ({
  implementationScore,
  riskMitigationScore,
}: {
  implementationScore: number;
  riskMitigationScore: number;
}) => {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Success Factor Scorecard</CardTitle>
        <CardDescription>Implementation and risk mitigation status</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col items-center">
            <div style={{ width: 120, height: 120 }} className="relative">
              <svg width="120" height="120" viewBox="0 0 120 120">
                {/* Background circle */}
                <circle cx="60" cy="60" r="50" fill="none" stroke="#e8e6dc" strokeWidth="10" />
                {/* Progress circle - using strokeDasharray and strokeDashoffset */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={`rgba(99, 102, 241, ${implementationScore / 100})`}
                  strokeWidth="10"
                  strokeDasharray={`${2 * Math.PI * 50}`}
                  strokeDashoffset={`${2 * Math.PI * 50 * (1 - implementationScore / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90, 60, 60)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-bold text-2xl">{implementationScore}%</span>
                <span className="text-xs text-slate-500">Implementation</span>
              </div>
            </div>
            <p className="text-sm text-center mt-2">Success factors implemented</p>
          </div>

          <div className="flex flex-col items-center">
            <div style={{ width: 120, height: 120 }} className="relative">
              <svg width="120" height="120" viewBox="0 0 120 120">
                {/* Background circle */}
                <circle cx="60" cy="60" r="50" fill="none" stroke="#e8e6dc" strokeWidth="10" />
                {/* Progress circle - using strokeDasharray and strokeDashoffset */}
                <circle
                  cx="60"
                  cy="60"
                  r="50"
                  fill="none"
                  stroke={`rgba(34, 197, 94, ${riskMitigationScore / 100})`}
                  strokeWidth="10"
                  strokeDasharray={`${2 * Math.PI * 50}`}
                  strokeDashoffset={`${2 * Math.PI * 50 * (1 - riskMitigationScore / 100)}`}
                  strokeLinecap="round"
                  transform="rotate(-90, 60, 60)"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <span className="font-bold text-2xl">{riskMitigationScore}%</span>
                <span className="text-xs text-slate-500">Mitigation</span>
              </div>
            </div>
            <p className="text-sm text-center mt-2">Risk factors mitigated</p>
          </div>
        </div>

        <div className="mt-6">
          <h4 className="text-sm font-medium mb-2">Risk Assessment</h4>
          <div className="flex items-center">
            <div className="w-full bg-gray-200 rounded-full h-4">
              <div
                className={`h-4 rounded-full ${
                  (implementationScore + riskMitigationScore) / 2 > 75
                    ? 'bg-green-500'
                    : (implementationScore + riskMitigationScore) / 2 > 50
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${(implementationScore + riskMitigationScore) / 2}%` }}
              ></div>
            </div>
            <span className="ml-2 text-sm font-medium">
              {((implementationScore + riskMitigationScore) / 2).toFixed(1)}%
            </span>
          </div>
          <div className="flex justify-between text-xs text-slate-500 mt-1">
            <span>High Risk</span>
            <span>Moderate Risk</span>
            <span>Low Risk</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

const SuccessFailureFactors = () => {
  // Fetch data from API
  const { data, isLoading } = useQuery({
    queryKey: ['/api/success-failure-analysis/lmn-0801'],
    initialData: {
      operationalSuccess: [
        {
          id: 'os1',
          factor: 'Centralized Site Coordination',
          impact: 'high' as const,
          description:
            'Centralized study coordination with dedicated site relationship managers reduces site burden and improves efficiency.',
          implementationStatus: 'partial' as const,
          evidence:
            'Analysis of 24 similar trials showed 28% higher enrollment rates and 35% fewer protocol deviations with centralized coordination teams.',
          recommendations: [
            'Assign dedicated site relationship managers with regular check-ins',
            'Implement weekly coordinator calls with standardized agenda',
            'Develop site-specific enrollment plans with regular monitoring',
          ],
          resources: [
            'Site Coordination Toolkit (internal resource)',
            'Best Practices for Site Management in Metabolic Trials (2023)',
          ],
        },
        {
          id: 'os2',
          factor: 'Streamlined EDC System',
          impact: 'medium' as const,
          description:
            'Intuitive EDC with minimal clicks and real-time data validation reduces site burden and improves data quality.',
          implementationStatus: 'implemented' as const,
          evidence:
            'Sites using optimized EDC systems showed 42% reduction in query rates and 64% reduction in time to database lock compared to legacy systems.',
          recommendations: [
            'Configure EDC with conditional logic to minimize unnecessary fields',
            'Implement automatic calculations and cross-form validations',
            'Provide integrated help text and inline field guidance',
          ],
        },
        {
          id: 'os3',
          factor: 'Site Initiation Acceleration',
          impact: 'high' as const,
          description:
            'Parallel site activation processes with pre-planning reduces study startup time and improves site engagement.',
          implementationStatus: 'not implemented' as const,
          evidence:
            'Parallel site activation process reduced median time to first patient in by 45 days across 18 obesity trials reviewed.',
          recommendations: [
            'Pre-identify potential bottlenecks in contracts and budgets',
            'Implement document collection portals prior to site selection',
            'Develop staggered activation waves with shared learnings',
          ],
        },
        {
          id: 'os4',
          factor: 'Participant Engagement Program',
          impact: 'medium' as const,
          description:
            'Structured participant engagement strategy with regular touchpoints reduces dropout rates.',
          implementationStatus: 'partial' as const,
          evidence:
            'Trials with formal engagement programs showed 8.2% dropout rates vs. 16.7% without such programs in weight management studies.',
          recommendations: [
            'Implement mobile app reminders with achievement milestones',
            'Develop transportation assistance program for site visits',
            'Create participant communities for peer support',
          ],
        },
      ],

      operationalFailure: [
        {
          id: 'of1',
          factor: 'Site Selection Misalignment',
          impact: 'high' as const,
          description:
            'Selecting sites primarily based on past performance without assessing specific capabilities for the current protocol.',
          mitigationStatus: 'at risk' as const,
          warningSign:
            'Sites selected have limited experience with target population or assessment techniques required by protocol.',
          frequency: 'Found in 38% of delayed or terminated weight management trials.',
          mitigationSteps: [
            'Implement protocol-specific site capability assessment',
            'Review site performance in similar indication/population studies, not just overall metrics',
            'Conduct pre-selection interviews with site staff who will actually work on the trial',
          ],
        },
        {
          id: 'of2',
          factor: 'Excessive Inclusion/Exclusion Criteria',
          impact: 'high' as const,
          description:
            'Overly restrictive eligibility criteria that significantly limit the available patient pool.',
          mitigationStatus: 'partial' as const,
          warningSign: 'High screen failure rates (>30%) in first month of recruitment.',
          frequency:
            'Identified as a primary contributor to recruitment delays in 52% of obesity trials.',
          mitigationSteps: [
            'Conduct feasibility testing of I/E criteria against actual patient databases',
            'Implement adaptive protocol design allowing criteria adjustment',
            'Establish early data review team to evaluate screen failure patterns',
          ],
        },
        {
          id: 'of3',
          factor: 'Inadequate Site Training',
          impact: 'medium' as const,
          description:
            'Insufficient training on protocol requirements, assessments, and endpoint collection.',
          mitigationStatus: 'mitigated' as const,
          warningSign:
            'High query rates on critical assessments; inconsistent outcome measures between sites.',
          frequency: 'Contributing factor in 41% of trials with high data quality issues.',
          mitigationSteps: [
            'Develop comprehensive training with competency assessments',
            'Create endpoint measurement quick reference guides with visual examples',
            'Implement certification program for key outcome assessments',
          ],
        },
        {
          id: 'of4',
          factor: 'Burdensome Visit Schedule',
          impact: 'medium' as const,
          description:
            'Visit schedule that places excessive burden on participants with lengthy or frequent visits.',
          mitigationStatus: 'partial' as const,
          warningSign:
            'Increasing appointment cancellations and rescheduling after first 1-2 months.',
          frequency:
            'Associated with 47% higher dropout rates in weight management studies lasting >3 months.',
          mitigationSteps: [
            'Map patient journey to identify burden points',
            'Implement telemedicine visits where scientifically valid',
            'Consolidate assessments and minimize unnecessary measures',
          ],
        },
      ],

      clinicalSuccess: [
        {
          id: 'cs1',
          factor: 'Evidence-Based Endpoint Selection',
          impact: 'high' as const,
          description:
            'Primary endpoints selected based on strong evidence of sensitivity to change and clinical relevance.',
          implementationStatus: 'implemented' as const,
          evidence:
            'CSR analysis showed trials using percent weight change at 12 weeks as key secondary endpoint had 34% higher success rates.',
          recommendations: [
            'Select primary endpoints with established correlation to clinical outcomes',
            'Include early timepoint secondary endpoints (12 weeks) to predict long-term outcomes',
            'Use composite endpoints if supported by previous trial data',
          ],
        },
        {
          id: 'cs2',
          factor: 'Inclusion of Patient-Reported Outcomes',
          impact: 'medium' as const,
          description:
            'Integration of validated PROs measuring patient experience and quality of life.',
          implementationStatus: 'not implemented' as const,
          evidence:
            'Trials incorporating quality of life assessments showed 23% higher publication impact factor and increased regulatory acceptance.',
          recommendations: [
            'Select validated PRO measures specific to weight management',
            'Include PROs as secondary endpoints with clear analysis plan',
            'Connect PRO measures to meaningful daily activities',
          ],
        },
        {
          id: 'cs3',
          factor: 'Stratified Randomization Strategy',
          impact: 'high' as const,
          description:
            'Randomization stratified by key baseline factors known to influence treatment response.',
          implementationStatus: 'partial' as const,
          evidence:
            'Obesity trials with stratification by baseline BMI, sex, and comorbidity status showed 29% reduction in outcome variability.',
          recommendations: [
            'Stratify by baseline BMI categories (<35, 35-40, >40)',
            'Consider stratification by presence of metabolic syndrome',
            'Implement adaptive design elements based on stratification factors',
          ],
        },
      ],

      clinicalFailure: [
        {
          id: 'cf1',
          factor: 'Inadequate Control of Background Therapy',
          impact: 'high' as const,
          description:
            'Insufficient standardization or monitoring of background weight management approaches.',
          mitigationStatus: 'at risk' as const,
          warningSign: 'High variability in weight change within placebo/control group.',
          frequency: 'Identified in 44% of failed obesity drug trials as a key confounding factor.',
          mitigationSteps: [
            'Standardize lifestyle intervention component across all sites',
            'Implement monitoring of diet and physical activity compliance',
            'Train sites on consistent delivery of background therapy',
          ],
        },
        {
          id: 'cf2',
          factor: 'Inappropriate Statistical Approach',
          impact: 'high' as const,
          description:
            'Statistical analysis plan that fails to account for patterns specific to weight loss data.',
          mitigationStatus: 'partial' as const,
          warningSign:
            'Sample size calculations not accounting for typical dropout patterns or weight regain.',
          frequency:
            'Contributing factor in 37% of obesity trials that failed to reach statistical significance despite apparent efficacy.',
          mitigationSteps: [
            'Use mixed models for repeated measures with appropriate covariance structure',
            'Account for non-linear weight loss patterns in analysis plan',
            'Implement multiple imputation strategies specific to weight loss trials',
          ],
        },
        {
          id: 'cf3',
          factor: 'Endpoint Timing Mismatch',
          impact: 'medium' as const,
          description:
            'Primary endpoint assessment at timepoint not aligned with mechanism of action.',
          mitigationStatus: 'mitigated' as const,
          warningSign:
            'Mechanism of action suggests peak effect at different timepoint than primary endpoint.',
          frequency:
            'Found in 28% of trials where primary endpoint was not met despite positive secondary endpoints.',
          mitigationSteps: [
            'Map expected physiological responses to endpoint timing',
            'Include multiple timepoints for key assessments',
            'Consider dose-response relationship in endpoint timing',
          ],
        },
        {
          id: 'cf4',
          factor: 'Population Heterogeneity',
          impact: 'medium' as const,
          description:
            'Target population with high heterogeneity in treatment response without adequate subgroup planning.',
          mitigationStatus: 'at risk' as const,
          warningSign: 'High standard deviation in primary outcome measures in similar trials.',
          frequency:
            'Identified in 49% of obesity trials with unexpectedly high outcome variability.',
          mitigationSteps: [
            'Perform responder analyses based on baseline characteristics',
            'Consider adaptive design with sample size re-estimation',
            'Plan pre-specified subgroup analyses with adequate powering',
          ],
        },
      ],

      indication: 'Obesity',
      phase: 'Phase 2',
      studyType: 'Dose-Ranging',
      similarTrials: 28,
      successRate: 62,
      knowledgeSources: [
        {
          id: 'ks1',
          title: 'Meta-Analysis of Weight Management Clinical Trial Success Factors (2023)',
          type: 'Literature' as const,
          relevance: 95,
          key_findings:
            'Comprehensive analysis of 87 weight management trials identified key operational and clinical factors associated with trial success. Highlights importance of site selection, patient engagement, and endpoint selection strategies.',
        },
        {
          id: 'ks2',
          title: 'FDA Guidance on Developing Products for Weight Management (2024)',
          type: 'Regulatory' as const,
          relevance: 90,
          key_findings:
            'Updated guidance emphasizing importance of clinically meaningful weight loss, standardized background therapy, and comprehensive safety monitoring. Provides specific recommendations for efficacy endpoints and trial duration.',
        },
        {
          id: 'ks3',
          title: 'CSR Analysis: CompetitorX Phase 2 Trial in Obesity (2023)',
          type: 'CSR' as const,
          relevance: 85,
          key_findings:
            'Detailed analysis of similar mechanism trial highlighting successful implementation of stratified randomization, early predictive endpoints, and centralized site management. Notable dropout reduction strategies documented.',
        },
        {
          id: 'ks4',
          title: 'TrialSage Internal Analysis: Obesity Trial Success Patterns',
          type: 'Internal' as const,
          relevance: 92,
          key_findings:
            'Proprietary analysis of 42 obesity trials identifying critical operational factors that differentiated successful vs. unsuccessful programs. Quantified impact of site selection, coordinator-to-patient ratios, and protocol complexity.',
        },
      ],
      implementationScore: 63,
      riskMitigationScore: 57,
    },
  });

  if (isLoading) {
    return <div className="p-8 flex justify-center">Loading success/failure analysis...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="p-4 bg-slate-50 rounded-lg border">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold">Success & Failure Analysis</h2>
            <p className="text-slate-600">
              Based on {data.similarTrials} similar {data.indication} {data.phase} trials
            </p>
          </div>

          <div className="flex gap-4 items-center">
            <div>
              <div className="flex items-center">
                <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                <span className="font-medium">{data.successRate}%</span>
              </div>
              <p className="text-xs text-slate-500">Industry Success Rate</p>
            </div>

            <Separator orientation="vertical" className="h-10" />

            <div>
              <div className="flex items-center">
                <Briefcase className="h-5 w-5 text-blue-600 mr-2" />
                <span className="font-medium">
                  {data.operationalSuccess.length + data.clinicalSuccess.length}
                </span>
              </div>
              <p className="text-xs text-slate-500">Success Factors</p>
            </div>

            <Separator orientation="vertical" className="h-10" />

            <div>
              <div className="flex items-center">
                <AlertTriangle className="h-5 w-5 text-amber-600 mr-2" />
                <span className="font-medium">
                  {data.operationalFailure.length + data.clinicalFailure.length}
                </span>
              </div>
              <p className="text-xs text-slate-500">Risk Factors</p>
            </div>
          </div>
        </div>
      </div>

      <Tabs defaultValue="operational">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="operational">
            <Clipboard className="h-4 w-4 mr-2" />
            Operational Factors
          </TabsTrigger>
          <TabsTrigger value="clinical">
            <Beaker className="h-4 w-4 mr-2" />
            Clinical Factors
          </TabsTrigger>
          <TabsTrigger value="knowledge">
            <BookOpen className="h-4 w-4 mr-2" />
            Knowledge Sources
          </TabsTrigger>
        </TabsList>

        {/* Operational Factors Tab */}
        <TabsContent value="operational" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div>
                <div className="flex items-center mb-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                  <h3 className="font-semibold text-lg">Operational Success Factors</h3>
                </div>
                <div className="space-y-4">
                  {data.operationalSuccess.map(factor => (
                    <SuccessFactorCard key={factor.id} factor={factor} />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center mb-3">
                  <XCircle className="h-5 w-5 text-red-600 mr-2" />
                  <h3 className="font-semibold text-lg">Operational Failure Factors</h3>
                </div>
                <div className="space-y-4">
                  {data.operationalFailure.map(factor => (
                    <FailureFactorCard key={factor.id} factor={factor} />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <ImplementationScorecard
                implementationScore={data.implementationScore}
                riskMitigationScore={data.riskMitigationScore}
              />

              <div className="mt-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg">Implementation Priorities</CardTitle>
                    <CardDescription>Based on impact and current status</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {data.operationalSuccess
                        .filter(f => f.implementationStatus !== 'implemented')
                        .sort((a, b) => {
                          const impactValue = { high: 3, medium: 2, low: 1 };
                          return impactValue[b.impact] - impactValue[a.impact];
                        })
                        .slice(0, 3)
                        .map((factor, idx) => (
                          <div key={idx} className="flex items-start">
                            <div className="bg-blue-100 text-blue-800 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5 mr-3">
                              {idx + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{factor.factor}</p>
                              <p className="text-xs text-slate-600 mt-0.5">
                                {factor.recommendations[0]}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>

                    <Separator className="my-4" />

                    <div className="space-y-4">
                      {data.operationalFailure
                        .filter(f => f.mitigationStatus !== 'mitigated')
                        .sort((a, b) => {
                          const impactValue = { high: 3, medium: 2, low: 1 };
                          return impactValue[b.impact] - impactValue[a.impact];
                        })
                        .slice(0, 3)
                        .map((factor, idx) => (
                          <div key={idx} className="flex items-start">
                            <div className="bg-red-100 text-red-800 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5 mr-3">
                              {idx + 1}
                            </div>
                            <div>
                              <p className="font-medium text-sm">{factor.factor}</p>
                              <p className="text-xs text-slate-600 mt-0.5">
                                {factor.mitigationSteps[0]}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Clinical Factors Tab */}
        <TabsContent value="clinical" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <div>
                <div className="flex items-center mb-3">
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                  <h3 className="font-semibold text-lg">Clinical Success Factors</h3>
                </div>
                <div className="space-y-4">
                  {data.clinicalSuccess.map(factor => (
                    <SuccessFactorCard key={factor.id} factor={factor} />
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center mb-3">
                  <XCircle className="h-5 w-5 text-red-600 mr-2" />
                  <h3 className="font-semibold text-lg">Clinical Failure Factors</h3>
                </div>
                <div className="space-y-4">
                  {data.clinicalFailure.map(factor => (
                    <FailureFactorCard key={factor.id} factor={factor} />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Clinical Design Impact</CardTitle>
                  <CardDescription>Critical success factors from evidence</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium text-sm mb-1 flex items-center">
                        <Target className="h-4 w-4 mr-2 text-primary" />
                        Endpoint Selection
                      </h4>
                      <p className="text-sm text-slate-600">
                        Early timepoint effectiveness measures (12 weeks) strongly predict overall
                        trial success (87% correlation) in similar obesity trials.
                      </p>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium text-sm mb-1 flex items-center">
                        <Users className="h-4 w-4 mr-2 text-primary" />
                        Population Definition
                      </h4>
                      <p className="text-sm text-slate-600">
                        Stratification by baseline BMI and metabolic status reduces outcome
                        variability by 29% in similar mechanisms of action.
                      </p>
                    </div>

                    <div className="border rounded-lg p-4">
                      <h4 className="font-medium text-sm mb-1 flex items-center">
                        <Droplet className="h-4 w-4 mr-2 text-primary" />
                        Dose Selection
                      </h4>
                      <p className="text-sm text-slate-600">
                        Including at least 3 dose levels with 2x spacing between doses increased
                        probability of finding optimal dose by 64%.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-lg">Protocol Implementation</CardTitle>
                  <CardDescription>Risk mitigation priorities</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {data.clinicalFailure
                      .filter(f => f.mitigationStatus !== 'mitigated')
                      .sort((a, b) => {
                        const impactValue = { high: 3, medium: 2, low: 1 };
                        return impactValue[b.impact] - impactValue[a.impact];
                      })
                      .slice(0, 3)
                      .map((factor, idx) => (
                        <div key={idx} className="flex items-start">
                          <div className="bg-red-100 text-red-800 rounded-full w-6 h-6 flex items-center justify-center flex-shrink-0 mt-0.5 mr-3">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-medium text-sm">{factor.factor}</p>
                            <p className="text-xs text-slate-600 mt-0.5">
                              {factor.mitigationSteps[0]}
                            </p>
                          </div>
                        </div>
                      ))}
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Knowledge Sources Tab */}
        <TabsContent value="knowledge" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div>
              <h3 className="font-semibold text-lg mb-4">Evidence Base</h3>
              <div className="space-y-3">
                {data.knowledgeSources.map(source => (
                  <KnowledgeSourceCard key={source.id} source={source} />
                ))}
              </div>

              <Card className="mt-6">
                <CardHeader>
                  <CardTitle className="text-sm">Key Success Metrics</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Success Rate in Similar Trials</span>
                      <Badge variant="outline" className="bg-slate-50">
                        {data.successRate}%
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Implementation Score</span>
                      <Badge variant="outline" className="bg-slate-50">
                        {data.implementationScore}/100
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Risk Mitigation Score</span>
                      <Badge variant="outline" className="bg-slate-50">
                        {data.riskMitigationScore}/100
                      </Badge>
                    </div>

                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-600">Similar Trials Analyzed</span>
                      <Badge variant="outline" className="bg-slate-50">
                        {data.similarTrials}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div>
              <h3 className="font-semibold text-lg mb-4">Knowledge Impact Analysis</h3>
              <Card>
                <CardContent className="p-6">
                  <h4 className="font-medium text-base mb-4">Key Insights from Success Patterns</h4>

                  <div className="space-y-4">
                    <div className="border-l-4 border-green-500 pl-4 py-1">
                      <h5 className="font-medium text-sm">Site Performance Differentiation</h5>
                      <p className="text-sm text-slate-600 mt-1">
                        Top performing sites in obesity trials share common characteristics:
                        dedicated study coordinators (1:15 coordinator-to-patient ratio),
                        standardized diet/exercise guidance, and regular investigator engagement.
                      </p>
                    </div>

                    <div className="border-l-4 border-green-500 pl-4 py-1">
                      <h5 className="font-medium text-sm">Patient Retention Strategies</h5>
                      <p className="text-sm text-slate-600 mt-1">
                        Most successful trials implemented structured engagement programs with
                        bi-weekly touchpoints in first 2 months and integrated mobile support -
                        reducing dropout rates by 43% compared to standard approaches.
                      </p>
                    </div>

                    <div className="border-l-4 border-green-500 pl-4 py-1">
                      <h5 className="font-medium text-sm">Protocol Optimization Impact</h5>
                      <p className="text-sm text-slate-600 mt-1">
                        Reduction of non-critical assessments by 22% resulted in 35% lower
                        participant burden scores and 28% improved retention without impacting
                        primary endpoint quality.
                      </p>
                    </div>
                  </div>

                  <h4 className="font-medium text-base mt-6 mb-4">Failure Pattern Learnings</h4>

                  <div className="space-y-4">
                    <div className="border-l-4 border-red-500 pl-4 py-1">
                      <h5 className="font-medium text-sm">Critical Protocol Design Flaws</h5>
                      <p className="text-sm text-slate-600 mt-1">
                        Over-complex inclusion/exclusion criteria was the leading cause of
                        recruitment failure in similar trials (52% cited this as primary factor).
                        Successful trials implemented adaptive I/E criteria with early review.
                      </p>
                    </div>

                    <div className="border-l-4 border-red-500 pl-4 py-1">
                      <h5 className="font-medium text-sm">Statistical Method Mismatch</h5>
                      <p className="text-sm text-slate-600 mt-1">
                        Inappropriate handling of missing data and insufficient analysis of early
                        response patterns resulted in 37% of failed trials despite signals of
                        efficacy. Successful approaches used adaptive designs with interim
                        assessments.
                      </p>
                    </div>

                    <div className="border-l-4 border-red-500 pl-4 py-1">
                      <h5 className="font-medium text-sm">Site Management Gaps</h5>
                      <p className="text-sm text-slate-600 mt-1">
                        Decentralized site management with reactive monitoring contributed to 44%
                        higher protocol deviation rates and 31% longer time to database lock in
                        similar trials.
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SuccessFailureFactors;
