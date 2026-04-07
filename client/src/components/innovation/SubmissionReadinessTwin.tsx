/**
 * Submission Readiness Twin Component
 * 
 * A digital twin showing predictive GA readiness score that factors in
 * document completion, quality metrics, and historical benchmark data.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Activity, AlertTriangle, Award, BarChart3, Calendar,
  CheckCircle, Clock, FileCheck, Gauge, GitBranch,
  RefreshCw, Target, TrendingUp, Zap, ArrowUp, ArrowDown,
  AlertCircle, CircleDot
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface ReadinessAssessment {
  id: string;
  programId: string;
  overallScore: number;
  completenessScore: number;
  qualityScore: number;
  timelinessScore: number;
  riskScore: number;
  predictedApprovalProbability: number;
  predictedReviewDays: number;
  predictedDeficiencyCount: number;
  status: 'on_track' | 'at_risk' | 'critical';
  assessedAt: string;
}

interface DimensionScore {
  dimension: string;
  score: number;
  weight: number;
  weightedScore: number;
  status: 'complete' | 'in_progress' | 'not_started' | 'blocked';
  issues: string[];
}

interface RiskFactor {
  id: string;
  category: string;
  title: string;
  description: string;
  impact: 'high' | 'medium' | 'low';
  probability: 'high' | 'medium' | 'low';
  mitigationSuggestion?: string;
}

interface TrendDataPoint {
  date: string;
  score: number;
  completeness: number;
  quality: number;
}

interface ReadinessCriterion {
  id: string;
  criterionCode: string;
  name: string;
  dimension: string;
  weight: number;
  status: 'met' | 'partial' | 'not_met' | 'not_applicable';
  score: number;
  evidence?: string;
}

export function SubmissionReadinessTwin({ programId }: { programId: string }) {
  const { toast } = useToast();
  const [assessment, setAssessment] = useState<ReadinessAssessment | null>(null);
  const [dimensions, setDimensions] = useState<DimensionScore[]>([]);
  const [risks, setRisks] = useState<RiskFactor[]>([]);
  const [trends, setTrends] = useState<TrendDataPoint[]>([]);
  const [criteria, setCriteria] = useState<ReadinessCriterion[]>([]);
  const [loading, setLoading] = useState(true);
  const [assessing, setAssessing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Load data
  useEffect(() => {
    loadDashboard();
  }, [programId]);

  const loadDashboard = async () => {
    setLoading(true);
    try {
      const [dashboardRes, trendsRes] = await Promise.all([
        fetch(`/api/innovation/readiness-twin/dashboard/${programId}`),
        fetch(`/api/innovation/readiness-twin/trends/${programId}?days=90`)
      ]);

      if (dashboardRes.ok) {
        const data = await dashboardRes.json();
        if (data.data) {
          setAssessment(data.data.latestAssessment);
          setDimensions(data.data.dimensionScores || []);
          setRisks(data.data.riskFactors || []);
          setCriteria(data.data.criteria || []);
        }
      }
      if (trendsRes.ok) {
        const data = await trendsRes.json();
        setTrends(data.data || []);
      }
    } catch (error) {
      console.error('Error loading readiness data:', error);
    } finally {
      setLoading(false);
    }
  };

  const runAssessment = async () => {
    setAssessing(true);
    try {
      const response = await fetch('/api/innovation/readiness-twin/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programId,
          submissionType: 'NDA',
          agency: 'FDA'
        })
      });

      if (response.ok) {
        toast({
          title: 'Assessment Complete',
          description: 'Readiness twin has been updated'
        });
        await loadDashboard();
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to run assessment',
        variant: 'destructive'
      });
    } finally {
      setAssessing(false);
    }
  };

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    if (score >= 40) return 'text-orange-500';
    return 'text-red-500';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/10';
    if (score >= 60) return 'bg-yellow-500/10';
    if (score >= 40) return 'bg-orange-500/10';
    return 'bg-red-500/10';
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'on_track': return 'success';
      case 'at_risk': return 'warning';
      case 'critical': return 'destructive';
      default: return 'default';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'complete': return <CheckCircle className="h-4 w-4 text-green-500" />;
      case 'in_progress': return <Activity className="h-4 w-4 text-blue-500" />;
      case 'blocked': return <AlertTriangle className="h-4 w-4 text-red-500" />;
      default: return <CircleDot className="h-4 w-4 text-muted-foreground" />;
    }
  };

  // Calculate trend direction
  const trendDirection = useMemo(() => {
    if (trends.length < 2) return 0;
    const recent = trends.slice(-7);
    const older = trends.slice(-14, -7);
    if (recent.length === 0 || older.length === 0) return 0;
    
    const recentAvg = recent.reduce((a, b) => a + b.score, 0) / recent.length;
    const olderAvg = older.reduce((a, b) => a + b.score, 0) / older.length;
    return recentAvg - olderAvg;
  }, [trends]);

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-12">
          <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-indigo-500/10 to-purple-500/10">
            <GitBranch className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Submission Readiness Twin</h2>
            <p className="text-muted-foreground">
              Predictive readiness score and approval probability
            </p>
          </div>
        </div>
        <Button onClick={runAssessment} disabled={assessing}>
          {assessing ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          Update Assessment
        </Button>
      </div>

      {/* Main Score Card */}
      {assessment && (
        <div className="grid grid-cols-12 gap-6">
          {/* Primary Score */}
          <Card className="col-span-4">
            <CardContent className="pt-6">
              <div className="text-center">
                <div className={`inline-flex items-center justify-center w-32 h-32 rounded-full ${getScoreBgColor(assessment.overallScore)} mb-4 relative`}>
                  <div className="text-center">
                    <span className={`text-4xl font-bold ${getScoreColor(assessment.overallScore)}`}>
                      {assessment.overallScore}
                    </span>
                    <p className="text-sm text-muted-foreground">/100</p>
                  </div>
                  {/* Trend indicator */}
                  {trendDirection !== 0 && (
                    <div className={`absolute -right-2 top-4 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${
                      trendDirection > 0 ? 'bg-green-500/20 text-green-600' : 'bg-red-500/20 text-red-600'
                    }`}>
                      {trendDirection > 0 ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />}
                      {Math.abs(trendDirection).toFixed(1)}
                    </div>
                  )}
                </div>
                <h3 className="text-lg font-semibold mb-1">Overall Readiness</h3>
                <Badge variant={getStatusColor(assessment.status) as any}>
                  {assessment.status.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </CardContent>
          </Card>

          {/* Predictions */}
          <Card className="col-span-8">
            <CardHeader className="pb-2">
              <CardTitle className="text-lg flex items-center gap-2">
                <Target className="h-5 w-5" />
                Predictions
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-3 gap-6">
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Award className="h-5 w-5 text-green-500" />
                    <span className="text-2xl font-bold text-green-600">
                      {assessment.predictedApprovalProbability}%
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Approval Probability
                  </p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <Clock className="h-5 w-5 text-blue-500" />
                    <span className="text-2xl font-bold text-blue-600">
                      {assessment.predictedReviewDays}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Est. Review Days
                  </p>
                </div>
                <div className="text-center p-4 rounded-lg bg-muted/50">
                  <div className="flex items-center justify-center gap-2 mb-2">
                    <AlertCircle className="h-5 w-5 text-orange-500" />
                    <span className="text-2xl font-bold text-orange-600">
                      {assessment.predictedDeficiencyCount}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    Expected Deficiencies
                  </p>
                </div>
              </div>

              {/* Sub-scores */}
              <div className="grid grid-cols-4 gap-4 mt-6">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">Completeness</span>
                    <span className="font-medium">{assessment.completenessScore}%</span>
                  </div>
                  <Progress value={assessment.completenessScore} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">Quality</span>
                    <span className="font-medium">{assessment.qualityScore}%</span>
                  </div>
                  <Progress value={assessment.qualityScore} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">Timeliness</span>
                    <span className="font-medium">{assessment.timelinessScore}%</span>
                  </div>
                  <Progress value={assessment.timelinessScore} className="h-2" />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm">Risk</span>
                    <span className="font-medium">{100 - assessment.riskScore}%</span>
                  </div>
                  <Progress value={100 - assessment.riskScore} className="h-2" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">
            <BarChart3 className="h-4 w-4 mr-2" />
            Dimensions
          </TabsTrigger>
          <TabsTrigger value="criteria">
            <FileCheck className="h-4 w-4 mr-2" />
            Criteria ({criteria.length})
          </TabsTrigger>
          <TabsTrigger value="risks">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Risks ({risks.length})
          </TabsTrigger>
          <TabsTrigger value="trends">
            <TrendingUp className="h-4 w-4 mr-2" />
            Trends
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            {dimensions.map((dim) => (
              <Card key={dim.dimension}>
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(dim.status)}
                      <h4 className="font-medium">{dim.dimension}</h4>
                    </div>
                    <div className="text-right">
                      <span className={`text-xl font-bold ${getScoreColor(dim.score)}`}>
                        {dim.score}
                      </span>
                      <span className="text-sm text-muted-foreground">/100</span>
                    </div>
                  </div>
                  <Progress value={dim.score} className="h-2 mb-3" />
                  <div className="flex items-center justify-between text-sm text-muted-foreground">
                    <span>Weight: {(dim.weight * 100).toFixed(0)}%</span>
                    <span>Contribution: {dim.weightedScore.toFixed(1)} pts</span>
                  </div>
                  {dim.issues.length > 0 && (
                    <div className="mt-3 pt-3 border-t">
                      <p className="text-xs text-muted-foreground mb-2">Issues:</p>
                      <ul className="space-y-1">
                        {dim.issues.slice(0, 3).map((issue, idx) => (
                          <li key={idx} className="text-sm flex items-start gap-2">
                            <AlertCircle className="h-3 w-3 mt-1 text-orange-500" />
                            {issue}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="criteria" className="space-y-3">
          {criteria.map((criterion) => (
            <Card key={criterion.id}>
              <CardContent className="py-3">
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center ${
                    criterion.status === 'met' ? 'bg-green-500/10' :
                    criterion.status === 'partial' ? 'bg-yellow-500/10' :
                    criterion.status === 'not_applicable' ? 'bg-gray-500/10' :
                    'bg-red-500/10'
                  }`}>
                    {criterion.status === 'met' ? (
                      <CheckCircle className="h-5 w-5 text-green-500" />
                    ) : criterion.status === 'partial' ? (
                      <Activity className="h-5 w-5 text-yellow-500" />
                    ) : criterion.status === 'not_applicable' ? (
                      <CircleDot className="h-5 w-5 text-gray-400" />
                    ) : (
                      <AlertCircle className="h-5 w-5 text-red-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{criterion.name}</span>
                      <Badge variant="outline" className="text-xs">
                        {criterion.criterionCode}
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {criterion.dimension} • Weight: {(criterion.weight * 100).toFixed(0)}%
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`text-lg font-bold ${getScoreColor(criterion.score)}`}>
                      {criterion.score}
                    </span>
                    <span className="text-muted-foreground">/100</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </TabsContent>

        <TabsContent value="risks" className="space-y-3">
          {risks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-lg font-medium">No Active Risk Factors</p>
                <p className="text-muted-foreground">
                  Your submission is on track
                </p>
              </CardContent>
            </Card>
          ) : (
            risks.map((risk) => (
              <Card key={risk.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      risk.impact === 'high' ? 'bg-red-500/10' :
                      risk.impact === 'medium' ? 'bg-orange-500/10' :
                      'bg-yellow-500/10'
                    }`}>
                      <AlertTriangle className={`h-5 w-5 ${
                        risk.impact === 'high' ? 'text-red-500' :
                        risk.impact === 'medium' ? 'text-orange-500' :
                        'text-yellow-500'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-medium">{risk.title}</h4>
                        <Badge variant="outline">{risk.category}</Badge>
                      </div>
                      <p className="text-sm text-muted-foreground">{risk.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-sm">
                        <span>Impact: <strong>{risk.impact}</strong></span>
                        <span>Probability: <strong>{risk.probability}</strong></span>
                      </div>
                      {risk.mitigationSuggestion && (
                        <div className="mt-3 p-3 bg-blue-500/10 rounded-lg">
                          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            Mitigation:
                          </p>
                          <p className="text-sm">{risk.mitigationSuggestion}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="trends">
          <Card>
            <CardContent className="pt-6">
              {trends.length === 0 ? (
                <div className="text-center py-12">
                  <TrendingUp className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
                  <p className="text-muted-foreground">
                    Run multiple assessments to see trends
                  </p>
                </div>
              ) : (
                <div className="h-64">
                  {/* Simple trend visualization */}
                  <div className="flex items-end justify-between h-full gap-1">
                    {trends.slice(-30).map((point, idx) => (
                      <TooltipProvider key={idx}>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <div
                              className={`flex-1 rounded-t ${getScoreBgColor(point.score)}`}
                              style={{ height: `${point.score}%` }}
                            />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p>{new Date(point.date).toLocaleDateString()}</p>
                            <p>Score: {point.score}</p>
                          </TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default SubmissionReadinessTwin;
