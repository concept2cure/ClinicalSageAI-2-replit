// Toast notification system upgraded to SecureToast

import React, { useState, useEffect } from 'react';
import { useLocation, useRoute } from 'wouter';
import { useToast } from '../App';
import {
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  RefreshCw,
  Loader2,
  FileText,
  Shield,
  List,
  BarChart,
  ExternalLink,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
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
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const RiskLevelColors = {
  LOW: {
    bg: 'bg-emerald-50/60',
    text: 'text-emerald-800',
    border: 'border-emerald-200/70',
    badgeBg: 'bg-emerald-100/70',
  },
  MEDIUM: {
    bg: 'bg-amber-50/60',
    text: 'text-amber-800',
    border: 'border-amber-200/70',
    badgeBg: 'bg-amber-100/70',
  },
  HIGH: {
    bg: 'bg-rose-50/60',
    text: 'text-rose-800',
    border: 'border-rose-200/70',
    badgeBg: 'bg-rose-100/70',
  },
};

const RiskLevelIcons = {
  LOW: <CheckCircle className="h-6 w-6 text-emerald-600" />,
  MEDIUM: <AlertTriangle className="h-6 w-6 text-amber-600" />,
  HIGH: <AlertCircle className="h-6 w-6 text-rose-600" />,
};

interface RiskAnalysis {
  risk_level: string;
  risk_details: {
    color: string;
    label: string;
    description: string;
  };
  ai_analysis: {
    risk_level: string;
    critical_issues: string[];
    major_issues: string[];
    common_patterns: string[];
    action_items: string[];
    reasoning: string;
  };
  qc_assessment: {
    issue_counts: {
      critical: number;
      major: number;
      minor: number;
      total: number;
      passed: number;
      failed: number;
    };
    problematic_documents: Array<{
      id: number;
      document_name: string;
      issues: string[];
      severity: string;
    }>;
  };
  validator_assessment: {
    issue_counts: {
      error: number;
      warning: number;
      info: number;
      total: number;
    };
    issues: Array<{
      category: string;
      message: string;
      severity: string;
      location: string;
      code: string;
    }>;
  };
  region: string;
  timestamp: string;
  submission_id: number;
}

interface InitialAssessment {
  risk_level: string;
  qc_issues: {
    critical: number;
    major: number;
    minor: number;
    total: number;
    passed: number;
    failed: number;
  };
  validator_issues: {
    error: number;
    warning: number;
    info: number;
    total: number;
  };
  region: string;
}

async function fetchJson(url: string) {
  const res = await fetch(url);
  return res.json();
}

async function postJson(url: string, data: any) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  return res.json();
}

export default function RiskAnalysis() {
  const [match, params] = useRoute('/risk-analysis/:submissionId');
  const [, navigate] = useLocation();
  const submissionId = match ? params.submissionId : null;

  const [loading, setLoading] = useState(true);
  const [initialLoading, setInitialLoading] = useState(true);
  const [analysisInProgress, setAnalysisInProgress] = useState(false);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [initialAssessment, setInitialAssessment] = useState<InitialAssessment | null>(null);
  const [analysis, setAnalysis] = useState<RiskAnalysis | null>(null);
  const [region, setRegion] = useState('FDA');
  const [activeTab, setActiveTab] = useState('overview');

  // Start risk analysis
  const startAnalysis = async () => {
    if (!submissionId) {
      useToast().showToast('No submission ID provided', 'error');
      return;
    }

    setAnalysisInProgress(true);
    try {
      // Fetch QC results and validator results for the submission
      const qcResults = await fetchJson(`/api/documents/qc-results?submission_id=${submissionId}`);
      const validatorResults = await fetchJson(
        `/api/validation/results?submission_id=${submissionId}`
      );

      // Start the risk analysis
      const response = await postJson('/api/risk/analyze_submission', {
        submission_id: Number(submissionId),
        qc_results: qcResults,
        validator_results: validatorResults,
        region,
      });

      if (response.task_id) {
        setTaskId(response.task_id);
        setInitialAssessment(response.initial_assessment);
        setInitialLoading(false);
        setPolling(true);
        pollForResults(response.task_id);
      } else {
        throw new Error('No task ID received from risk analysis');
      }
    } catch (error) {
      console.error('Error starting risk analysis:', error);
      useToast().showToast('Failed to start risk analysis', 'error');
      setAnalysisInProgress(false);
    }
  };

  // Poll for analysis results
  const pollForResults = async (tid: string) => {
    try {
      const result = await fetchJson(`/api/risk/${tid}`);

      if (result.status === 'processing') {
        // Continue polling every 2 seconds
        setTimeout(() => pollForResults(tid), 2000);
      } else if (result.status === 'error') {
        useToast().showToast(`Analysis error: ${result.error}`, 'error');
        setPolling(false);
        setAnalysisInProgress(false);
      } else {
        // Analysis complete
        setAnalysis(result);
        setPolling(false);
        setAnalysisInProgress(false);
        setLoading(false);
        useToast().showToast('Risk analysis complete', 'success');
      }
    } catch (error) {
      console.error('Error polling for results:', error);
      useToast().showToast('Failed to retrieve analysis results', 'error');
      setPolling(false);
      setAnalysisInProgress(false);
    }
  };

  // Change region handler
  const handleRegionChange = (newRegion: string) => {
    setRegion(newRegion);
    // Reset analysis when region changes
    setAnalysis(null);
    setInitialAssessment(null);
    setTaskId(null);
    setLoading(true);
    setInitialLoading(true);
  };

  // Auto-start analysis on component mount if submission ID is provided
  useEffect(() => {
    if (submissionId && !taskId && !analysisInProgress) {
      startAnalysis();
    } else if (!submissionId) {
      useToast().showToast('No submission ID provided', 'error');
      navigate('/submissions');
    }
  }, [submissionId, region]);

  // Format date for display
  const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleString();
  };

  // Helper to calculate risk score
  const calculateRiskScore = (): number => {
    if (!analysis) return 0;

    const { qc_assessment, validator_assessment } = analysis;

    // Calculate a score from 0-100 where lower is better
    const qcScore =
      qc_assessment.issue_counts.critical * 20 +
      qc_assessment.issue_counts.major * 5 +
      qc_assessment.issue_counts.minor * 1;

    const validatorScore =
      validator_assessment.issue_counts.error * 15 +
      validator_assessment.issue_counts.warning * 3 +
      validator_assessment.issue_counts.info * 0.5;

    // Combine and normalize to 0-100
    const combinedScore = Math.min(qcScore + validatorScore, 100);

    return 100 - combinedScore; // Invert so higher is better
  };

  // Render loading state
  if (initialLoading && !initialAssessment) {
    return (
      <div className="container py-8">
        <h1 className="text-3xl font-bold mb-6">Submission Risk Analysis</h1>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Analyzing Submission Risks
            </CardTitle>
            <CardDescription>
              Performing initial assessment of submission #{submissionId}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-2/3" />
              <div className="flex justify-center my-8">
                <Loader2 className="h-16 w-16 animate-spin text-slate-500" />
              </div>
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-3/4" />
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="container py-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Submission Risk Analysis</h1>

        <div className="flex items-center space-x-3">
          <Select value={region} onValueChange={handleRegionChange}>
            <SelectTrigger className="w-32 bg-white/80 border-slate-200/70">
              <SelectValue placeholder="Select Region" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="FDA">FDA (US)</SelectItem>
              <SelectItem value="EMA">EMA (EU)</SelectItem>
              <SelectItem value="PMDA">PMDA (JP)</SelectItem>
            </SelectContent>
          </Select>

          <Button
            variant="outline"
            onClick={() => {
              setAnalysis(null);
              setInitialAssessment(null);
              setTaskId(null);
              setLoading(true);
              setInitialLoading(true);
              startAnalysis();
            }}
            disabled={analysisInProgress}
            className="border-slate-200/70 bg-white/80 text-slate-700 hover:bg-slate-50"
          >
            {analysisInProgress ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                Analyzing...
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Analysis
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Initial Assessment Card */}
      {initialAssessment && !analysis && (
        <Card
          className={`mb-6 ${RiskLevelColors[initialAssessment.risk_level].bg} ${RiskLevelColors[initialAssessment.risk_level].border} border`}
        >
          <CardHeader>
            <CardTitle className="flex items-center">
              {RiskLevelIcons[initialAssessment.risk_level]}
              <span className="ml-2">Initial Assessment: {initialAssessment.risk_level} Risk</span>
              {polling && (
                <Badge variant="outline" className="ml-3 bg-slate-100/70 text-slate-700">
                  <Loader2 className="h-3 w-3 animate-spin mr-1" />
                  Detailed Analysis in Progress
                </Badge>
              )}
            </CardTitle>
            <CardDescription className={RiskLevelColors[initialAssessment.risk_level].text}>
              Preliminary analysis of submission #{submissionId} for {initialAssessment.region}{' '}
              compliance
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* QC Issues */}
              <div className="border border-slate-200/70 rounded-md p-4 bg-white/80">
                <h3 className="font-medium mb-2">QC Assessment</h3>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Failed Documents:</span>
                    <Badge variant="outline" className="bg-rose-50/70 text-rose-800">
                      {initialAssessment.qc_issues.failed} of {initialAssessment.qc_issues.total}
                    </Badge>
                  </div>
                  {initialAssessment.qc_issues.critical > 0 && (
                    <div className="flex justify-between">
                      <span>Critical Issues:</span>
                      <Badge variant="outline" className="bg-rose-50/70 text-rose-800">
                        {initialAssessment.qc_issues.critical}
                      </Badge>
                    </div>
                  )}
                  {initialAssessment.qc_issues.major > 0 && (
                    <div className="flex justify-between">
                      <span>Major Issues:</span>
                      <Badge variant="outline" className="bg-amber-50/70 text-amber-800">
                        {initialAssessment.qc_issues.major}
                      </Badge>
                    </div>
                  )}
                </div>
              </div>

              {/* Validator Issues */}
              <div className="border border-slate-200/70 rounded-md p-4 bg-white/80">
                <h3 className="font-medium mb-2">Validator Assessment</h3>
                <div className="space-y-2">
                  {initialAssessment.validator_issues.error > 0 && (
                    <div className="flex justify-between">
                      <span>Errors:</span>
                      <Badge variant="outline" className="bg-rose-50/70 text-rose-800">
                        {initialAssessment.validator_issues.error}
                      </Badge>
                    </div>
                  )}
                  {initialAssessment.validator_issues.warning > 0 && (
                    <div className="flex justify-between">
                      <span>Warnings:</span>
                      <Badge variant="outline" className="bg-amber-50/70 text-amber-800">
                        {initialAssessment.validator_issues.warning}
                      </Badge>
                    </div>
                  )}
                  <div className="flex justify-between">
                    <span>Info:</span>
                    <Badge variant="outline" className="bg-slate-100/70 text-slate-700">
                      {initialAssessment.validator_issues.info}
                    </Badge>
                  </div>
                </div>
              </div>
            </div>

            {polling && (
              <div className="mt-6">
                <p className="text-sm text-center mb-2">Performing comprehensive analysis...</p>
                <Progress className="h-2" value={undefined} />
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Full Analysis Results */}
      {analysis && (
        <>
          {/* Summary Card */}
          <Card
            className={`mb-6 ${RiskLevelColors[analysis.risk_level].bg} ${RiskLevelColors[analysis.risk_level].border} border`}
          >
            <CardHeader>
              <div className="flex justify-between">
                <div>
                  <CardTitle className="flex items-center">
                    {RiskLevelIcons[analysis.risk_level]}
                    <span className="ml-2">{analysis.risk_level} RISK</span>
                  </CardTitle>
                  <CardDescription className={RiskLevelColors[analysis.risk_level].text}>
                    {analysis.risk_details.description}
                  </CardDescription>
                </div>
                <div className="text-right">
                  <div className="text-sm text-slate-500">Analysis completed</div>
                  <div className="text-sm font-medium">{formatDate(analysis.timestamp)}</div>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Risk Score */}
                <div className="border border-slate-200/70 rounded-md p-4 bg-white/80 text-center">
                  <h3 className="font-medium mb-1">Risk Score</h3>
                  <div className="flex justify-center items-center">
                    <div
                      className={`text-4xl font-bold ${
                        calculateRiskScore() > 80
                          ? 'text-emerald-600'
                          : calculateRiskScore() > 60
                            ? 'text-amber-600'
                            : 'text-rose-600'
                      }`}
                    >
                      {calculateRiskScore()}%
                    </div>
                  </div>
                  <p className="text-sm mt-2 text-slate-600">
                    {calculateRiskScore() > 80
                      ? 'Good standing'
                      : calculateRiskScore() > 60
                        ? 'Needs attention'
                        : 'Critical issues'}
                  </p>
                </div>

                {/* Critical Issues */}
                <div className="border border-slate-200/70 rounded-md p-4 bg-white/80">
                  <h3 className="font-medium mb-2">Critical Issues</h3>
                  {analysis.ai_analysis.critical_issues.length > 0 ? (
                    <div className="space-y-1">
                      {analysis.ai_analysis.critical_issues.slice(0, 3).map((issue, i) => (
                        <div key={i} className="flex items-start">
                          <AlertCircle className="h-4 w-4 text-rose-500 mt-1 mr-2 flex-shrink-0" />
                          <span className="text-sm">{issue}</span>
                        </div>
                      ))}
                      {analysis.ai_analysis.critical_issues.length > 3 && (
                        <div className="text-sm text-slate-600 mt-1">
                          + {analysis.ai_analysis.critical_issues.length - 3} more issues
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-sm text-emerald-600">No critical issues found</div>
                  )}
                </div>

                {/* QC & Validator Summary */}
                <div className="border border-slate-200/70 rounded-md p-4 bg-white/80">
                  <h3 className="font-medium mb-2">Validation Summary</h3>
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span>Failed QC:</span>
                      <Badge
                        variant={
                          analysis.qc_assessment.issue_counts.failed > 0 ? 'destructive' : 'outline'
                        }
                      >
                        {analysis.qc_assessment.issue_counts.failed} /{' '}
                        {analysis.qc_assessment.issue_counts.total}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Validator Errors:</span>
                      <Badge
                        variant={
                          analysis.validator_assessment.issue_counts.error > 0
                            ? 'destructive'
                            : 'outline'
                        }
                      >
                        {analysis.validator_assessment.issue_counts.error}
                      </Badge>
                    </div>
                    <div className="flex justify-between">
                      <span>Validator Warnings:</span>
                      <Badge
                        variant={
                          analysis.validator_assessment.issue_counts.warning > 0
                            ? 'destructive'
                            : 'outline'
                        }
                      >
                        {analysis.validator_assessment.issue_counts.warning}
                      </Badge>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Detailed Tabs */}
          <Tabs defaultValue="overview" value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-4 bg-white/80 border border-slate-200/70">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="qc-issues">QC Issues</TabsTrigger>
              <TabsTrigger value="validator-issues">Validator Issues</TabsTrigger>
              <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
            </TabsList>

            {/* Overview Tab */}
            <TabsContent value="overview">
              <Card className="bg-white/80 border-slate-200/70 shadow-sm">
                <CardHeader>
                  <CardTitle>Submission Risk Overview</CardTitle>
                  <CardDescription>
                    AI-generated analysis of submission risks for {analysis.region} regulatory
                    requirements
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* AI Analysis */}
                    <div className="p-4 border border-slate-200/70 rounded-md bg-slate-50/70">
                      <h3 className="font-semibold mb-3">AI Risk Analysis</h3>
                      <p className="whitespace-pre-line mb-4">{analysis.ai_analysis.reasoning}</p>

                      {/* Common Patterns */}
                      {analysis.ai_analysis.common_patterns.length > 0 && (
                        <div className="mt-4">
                          <h4 className="font-medium mb-2">Common Rejection Patterns Identified</h4>
                          <ul className="list-disc pl-5 space-y-1">
                            {analysis.ai_analysis.common_patterns.map((pattern, i) => (
                              <li key={i} className="text-sm">
                                {pattern}
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>

                    {/* Issues Summary */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Critical Issues */}
                      <div className="border border-slate-200/70 rounded-md p-4 bg-white/80">
                        <h3 className="font-medium mb-3 flex items-center">
                          <AlertCircle className="h-5 w-5 text-rose-500 mr-2" />
                          Critical Issues
                        </h3>
                        {analysis.ai_analysis.critical_issues.length > 0 ? (
                          <ul className="space-y-2">
                            {analysis.ai_analysis.critical_issues.map((issue, i) => (
                              <li key={i} className="flex items-start">
                                <span className="bg-rose-100/70 text-rose-800 w-6 h-6 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                                  {i + 1}
                                </span>
                                <span>{issue}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-emerald-600">No critical issues found</p>
                        )}
                      </div>

                      {/* Major Issues */}
                      <div className="border border-slate-200/70 rounded-md p-4 bg-white/80">
                        <h3 className="font-medium mb-3 flex items-center">
                          <AlertTriangle className="h-5 w-5 text-amber-500 mr-2" />
                          Major Issues
                        </h3>
                        {analysis.ai_analysis.major_issues.length > 0 ? (
                          <ul className="space-y-2">
                            {analysis.ai_analysis.major_issues.map((issue, i) => (
                              <li key={i} className="flex items-start">
                                <span className="bg-amber-100/70 text-amber-800 w-6 h-6 rounded-full flex items-center justify-center mr-2 flex-shrink-0">
                                  {i + 1}
                                </span>
                                <span>{issue}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-emerald-600">No major issues found</p>
                        )}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* QC Issues Tab */}
            <TabsContent value="qc-issues">
              <Card className="bg-white/80 border-slate-200/70 shadow-sm">
                <CardHeader>
                  <CardTitle>Document QC Issues</CardTitle>
                  <CardDescription>
                    Issues identified during document quality control checks
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.qc_assessment.problematic_documents.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="text-sm text-slate-500">
                          {analysis.qc_assessment.issue_counts.failed} of{' '}
                          {analysis.qc_assessment.issue_counts.total} documents failed QC
                        </div>
                        <div className="flex space-x-2">
                          <Badge variant="outline" className="bg-rose-50/70 text-rose-800">
                            Critical: {analysis.qc_assessment.issue_counts.critical}
                          </Badge>
                          <Badge variant="outline" className="bg-amber-50/70 text-amber-800">
                            Major: {analysis.qc_assessment.issue_counts.major}
                          </Badge>
                          <Badge variant="outline" className="bg-slate-100/70 text-slate-700">
                            Minor: {analysis.qc_assessment.issue_counts.minor}
                          </Badge>
                        </div>
                      </div>

                      <Accordion type="single" collapsible className="w-full">
                        {analysis.qc_assessment.problematic_documents.map((doc, i) => (
                          <AccordionItem value={`doc-${doc.id}`} key={i}>
                            <AccordionTrigger>
                              <div className="flex items-center">
                                <div
                                  className={`mr-2 w-2 h-2 rounded-full ${
                                    doc.severity === 'critical'
                                      ? 'bg-rose-500'
                                      : doc.severity === 'major'
                                        ? 'bg-amber-500'
                                        : 'bg-slate-500'
                                  }`}
                                />
                                <span className="font-medium">{doc.document_name}</span>
                                <Badge className="ml-3" variant="outline">
                                  {doc.issues.length} {doc.issues.length === 1 ? 'issue' : 'issues'}
                                </Badge>
                              </div>
                            </AccordionTrigger>
                            <AccordionContent>
                              <div className="pl-5 border-l-2 border-slate-200/70 ml-2">
                                <ul className="space-y-2">
                                  {doc.issues.map((issue, j) => (
                                    <li key={j} className="text-sm">
                                      {issue}
                                    </li>
                                  ))}
                                </ul>
                                <div className="mt-3 flex justify-end">
                                  <Button variant="outline" size="sm">
                                    <FileText className="h-4 w-4 mr-2" />
                                    View Document
                                  </Button>
                                </div>
                              </div>
                            </AccordionContent>
                          </AccordionItem>
                        ))}
                      </Accordion>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
                      <h3 className="text-xl font-medium text-slate-900">All Documents Passed QC</h3>
                      <p className="text-slate-500 mt-2">No document quality issues found</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Validator Issues Tab */}
            <TabsContent value="validator-issues">
              <Card className="bg-white/80 border-slate-200/70 shadow-sm">
                <CardHeader>
                  <CardTitle>eValidator Issues</CardTitle>
                  <CardDescription>
                    Issues identified by the {analysis.region} eValidator
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {analysis.validator_assessment.issues.length > 0 ? (
                    <div className="space-y-4">
                      <div className="flex justify-between items-center">
                        <div className="text-sm text-slate-500">
                          {analysis.validator_assessment.issues.length} issues identified
                        </div>
                        <div className="flex space-x-2">
                          <Badge variant="outline" className="bg-rose-50/70 text-rose-800">
                            Errors: {analysis.validator_assessment.issue_counts.error}
                          </Badge>
                          <Badge variant="outline" className="bg-amber-50/70 text-amber-800">
                            Warnings: {analysis.validator_assessment.issue_counts.warning}
                          </Badge>
                          <Badge variant="outline" className="bg-slate-100/70 text-slate-700">
                            Info: {analysis.validator_assessment.issue_counts.info}
                          </Badge>
                        </div>
                      </div>

                      <div className="border border-slate-200/70 rounded-md overflow-hidden">
                        <table className="w-full">
                          <thead>
                            <tr className="bg-slate-50/70">
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Severity
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Category
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Message
                              </th>
                              <th className="px-4 py-3 text-left text-xs font-medium text-slate-500 uppercase tracking-wider">
                                Location
                              </th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-200/70">
                            {analysis.validator_assessment.issues.map((issue, i) => (
                              <tr key={i}>
                                <td className="px-4 py-2">
                                  <Badge
                                    variant="outline"
                                    className={`
                                      ${
                                        issue.severity === 'error'
                                          ? 'bg-rose-50/70 text-rose-800'
                                          : issue.severity === 'warning'
                                            ? 'bg-amber-50/70 text-amber-800'
                                            : 'bg-slate-100/70 text-slate-700'
                                      }
                                    `}
                                  >
                                    {issue.severity}
                                  </Badge>
                                </td>
                                <td className="px-4 py-2 text-sm">{issue.category}</td>
                                <td className="px-4 py-2 text-sm">{issue.message}</td>
                                <td className="px-4 py-2 text-sm">{issue.location || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-12">
                      <CheckCircle className="h-12 w-12 text-emerald-500 mb-4" />
                      <h3 className="text-xl font-medium text-slate-900">No Validator Issues</h3>
                      <p className="text-slate-500 mt-2">
                        The submission passed all validation checks
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Recommendations Tab */}
            <TabsContent value="recommendations">
              <Card className="bg-white/80 border-slate-200/70 shadow-sm">
                <CardHeader>
                  <CardTitle>Recommended Actions</CardTitle>
                  <CardDescription>
                    AI-generated action items to resolve identified issues
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-6">
                    {/* Action Items */}
                    <div className="border border-slate-200/70 rounded-md p-4 bg-white/80">
                      <h3 className="font-medium mb-3 flex items-center">
                        <List className="h-5 w-5 text-slate-600 mr-2" />
                        Priority Action Items
                      </h3>
                      {analysis.ai_analysis.action_items.length > 0 ? (
                        <ol className="list-decimal pl-5 space-y-3">
                          {analysis.ai_analysis.action_items.map((action, i) => (
                            <li key={i} className="pl-2">
                              <div className="font-medium">{action}</div>
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <p className="text-emerald-600">No action items required</p>
                      )}
                    </div>

                    {/* Regulatory Reference */}
                    <div className="bg-slate-50/70 rounded-md p-4 border border-slate-200/60">
                      <h3 className="font-medium mb-3">Regulatory References</h3>
                      <div className="space-y-3">
                        {analysis.region === 'FDA' && (
                          <div>
                            <a
                              href="https://www.fda.gov/regulatory-information/search-fda-guidance-documents"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-700 hover:underline flex items-center"
                            >
                              FDA Guidance Documents
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </div>
                        )}
                        {analysis.region === 'EMA' && (
                          <div>
                            <a
                              href="https://www.ema.europa.eu/en/human-regulatory/marketing-authorisation/submission-approval/ectd-electronic-common-technical-document"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-700 hover:underline flex items-center"
                            >
                              EMA eCTD Guidelines
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </div>
                        )}
                        {analysis.region === 'PMDA' && (
                          <div>
                            <a
                              href="https://www.pmda.go.jp/english/review-services/outline/0001.html"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-slate-700 hover:underline flex items-center"
                            >
                              PMDA Review Services
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </a>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Risk Mitigation */}
                    <div className="border border-slate-200/70 rounded-md p-4 bg-white/80">
                      <h3 className="font-medium mb-3 flex items-center">
                        <Shield className="h-5 w-5 text-emerald-600 mr-2" />
                        Risk Mitigation Strategy
                      </h3>
                      <div className="space-y-3">
                        <p>
                          Based on the analysis, we recommend the following risk mitigation
                          approach:
                        </p>
                        <div className="pl-4 border-l-2 border-emerald-200/70">
                          <ol className="list-decimal pl-5 space-y-2">
                            {analysis.risk_level === 'HIGH' && (
                              <>
                                <li>
                                  Pause submission preparation and address all critical issues
                                  immediately
                                </li>
                                <li>
                                  Perform comprehensive revalidation after fixing critical issues
                                </li>
                                <li>Schedule a regulatory expert review before proceeding</li>
                              </>
                            )}
                            {analysis.risk_level === 'MEDIUM' && (
                              <>
                                <li>Address major issues before proceeding with submission</li>
                                <li>
                                  Verify all document cross-references and fix inconsistencies
                                </li>
                                <li>Consider additional internal review of problematic sections</li>
                              </>
                            )}
                            {analysis.risk_level === 'LOW' && (
                              <>
                                <li>Verify minor issues have been addressed</li>
                                <li>Proceed with final submission preparation</li>
                                <li>
                                  Document any remaining minor items for post-submission follow-up
                                </li>
                              </>
                            )}
                          </ol>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
                <CardFooter className="border-t pt-6">
                  <div className="flex flex-col w-full">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <BarChart className="h-5 w-5 text-slate-600 mr-2" />
                        <span className="font-medium">Overall Risk Status:</span>
                      </div>
                      <Badge
                        className={`${RiskLevelColors[analysis.risk_level].badgeBg} ${RiskLevelColors[analysis.risk_level].text}`}
                      >
                        {analysis.risk_level} RISK
                      </Badge>
                    </div>
                    <div className="mt-4 flex justify-end space-x-3">
                      <Button variant="outline">Export Report</Button>
                      <Button>Create Action Plan</Button>
                    </div>
                  </div>
                </CardFooter>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  );
}
