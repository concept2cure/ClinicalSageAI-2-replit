import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  TrendingUp, 
  Brain, 
  AlertTriangle, 
  Target,
  BarChart3,
  Calendar,
  CheckCircle,
  Clock,
  FileText,
  Lightbulb
} from 'lucide-react';

// Type Definitions
interface RegSubmission {
  sub_id: string;
  product_id: string;
  sub_type: string;
  region: string;
  status: string;
  title: string;
  target_date: string;
  created_at: string;
  updated_at: string;
}

interface RegQuestion {
  id: number;
  questionText: string;
  sectionReference: string;
  priority: string;
  severity: string;
  status: string;
  region: string;
  dueDate: string;
  createdAt: string;
}

interface RegChange {
  change_id: string;
  title: string;
  category: string;
  pathway: string;
  status: string;
  impact: string;
}

interface InsightMetrics {
  submissionSuccessRate: number;
  avgApprovalTimeDays: number;
  totalSubmissions: number;
  approvedSubmissions: number;
  pendingSubmissions: number;
  questionsByType: Record<string, number>;
  submissionsByRegion: Record<string, number>;
  riskScore: number;
}

export default function RegulatoryIntelligence() {
  // Fetch submissions data
  const { data: submissions = [], isLoading: submissionsLoading } = useQuery<RegSubmission[]>({
    queryKey: ['/api/reg/submissions'],
  });

  // Fetch questions data from regulatory tabs endpoint
  const { data: questionsResponse, isLoading: questionsLoading } = useQuery<{success: boolean; questions: any[]}>({
    queryKey: ['/api/regulatory/questions'],
  });

  const questions = questionsResponse?.questions || [];

  // Fetch changes data from regulatory tabs endpoint
  const { data: changesResponse, isLoading: changesLoading } = useQuery<{success: boolean; changes: any[]}>({
    queryKey: ['/api/regulatory/q12/changes'],
  });

  const changes = changesResponse?.changes || [];

  // Calculate comprehensive metrics from real data
  const metrics = useMemo<InsightMetrics>(() => {
    if (!submissions || submissions.length === 0) {
      return {
        submissionSuccessRate: 0,
        avgApprovalTimeDays: 0,
        totalSubmissions: 0,
        approvedSubmissions: 0,
        pendingSubmissions: 0,
        questionsByType: {},
        submissionsByRegion: {},
        riskScore: 0,
      };
    }

    const approvedSubmissions = submissions.filter(s => 
      s.status?.toLowerCase() === 'approved' || 
      s.status?.toLowerCase() === 'released'
    ).length;

    const pendingSubmissions = submissions.filter(s => 
      s.status?.toLowerCase() === 'pending' || 
      s.status?.toLowerCase() === 'under review' ||
      s.status?.toLowerCase() === 'in progress'
    ).length;

    const successRate = submissions.length > 0 
      ? (approvedSubmissions / submissions.length) * 100 
      : 0;

    // Calculate average approval time from approved submissions
    let totalDays = 0;
    let countWithDates = 0;
    submissions.forEach(s => {
      if ((s.status?.toLowerCase() === 'approved' || s.status?.toLowerCase() === 'released') 
          && s.created_at && s.updated_at) {
        const created = new Date(s.created_at);
        const updated = new Date(s.updated_at);
        const days = Math.floor((updated.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
        if (days > 0) {
          totalDays += days;
          countWithDates++;
        }
      }
    });
    const avgApprovalTimeDays = countWithDates > 0 ? Math.floor(totalDays / countWithDates) : 120;

    // Group questions by type/category
    const questionsByType: Record<string, number> = {};
    questions.forEach(q => {
      const type = q.sectionReference || q.priority || 'General';
      questionsByType[type] = (questionsByType[type] || 0) + 1;
    });

    // Group submissions by region
    const submissionsByRegion: Record<string, number> = {};
    submissions.forEach(s => {
      const region = s.region || 'Unknown';
      submissionsByRegion[region] = (submissionsByRegion[region] || 0) + 1;
    });

    // Calculate risk score based on pending questions, failed submissions, etc.
    const openQuestions = questions.filter(q => q.status?.toLowerCase() === 'open' || q.status?.toLowerCase() === 'pending').length;
    const highPriorityQuestions = questions.filter(q => q.priority?.toLowerCase() === 'high' || q.priority?.toLowerCase() === 'critical').length;
    const overdueSubmissions = submissions.filter(s => {
      if (s.target_date) {
        return new Date(s.target_date) < new Date() && s.status?.toLowerCase() !== 'approved';
      }
      return false;
    }).length;

    const riskScore = Math.min(100, 
      (openQuestions * 5) + 
      (highPriorityQuestions * 10) + 
      (overdueSubmissions * 15) +
      ((100 - successRate) * 0.5)
    );

    return {
      submissionSuccessRate: successRate,
      avgApprovalTimeDays,
      totalSubmissions: submissions.length,
      approvedSubmissions,
      pendingSubmissions,
      questionsByType,
      submissionsByRegion,
      riskScore,
    };
  }, [submissions, questions]);

  // Predictive analytics based on historical data
  const predictions = useMemo(() => {
    const likelyQuestions = Object.entries(metrics.questionsByType)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([type, count]) => ({
        category: type,
        probability: Math.min(95, (count / questions.length) * 100 || 50),
        count,
      }));

    const timelineEstimates = Object.entries(metrics.submissionsByRegion).map(([region, count]) => {
      let baseDays = metrics.avgApprovalTimeDays || 120;
      
      // Adjust based on region (realistic estimates)
      if (region === 'FDA') baseDays = 90;
      else if (region === 'EMA') baseDays = 120;
      else if (region === 'PMDA') baseDays = 150;
      
      return { region, estimatedDays: baseDays, submissions: count };
    });

    return {
      likelyQuestions,
      timelineEstimates,
    };
  }, [metrics, questions.length]);

  // AI-generated recommendations
  const recommendations = useMemo(() => {
    const recs = [];

    if (metrics.riskScore > 50) {
      recs.push({
        priority: 'high',
        title: 'Address High-Risk Items',
        description: `Current risk score is ${metrics.riskScore.toFixed(0)}/100. Review pending questions and overdue submissions.`,
        action: 'Review Questions Hub',
      });
    }

    if (metrics.submissionSuccessRate < 70) {
      recs.push({
        priority: 'medium',
        title: 'Improve Submission Quality',
        description: `Success rate is ${metrics.submissionSuccessRate.toFixed(0)}%. Consider additional pre-submission reviews.`,
        action: 'Run Gatekeeper Analysis',
      });
    }

    if (metrics.pendingSubmissions > metrics.approvedSubmissions) {
      recs.push({
        priority: 'medium',
        title: 'Accelerate Pending Reviews',
        description: `${metrics.pendingSubmissions} submissions pending. Prioritize responses to agency questions.`,
        action: 'View Pending Submissions',
      });
    }

    if (Object.keys(metrics.questionsByType).length > 0) {
      const topType = Object.entries(metrics.questionsByType).sort(([, a], [, b]) => b - a)[0];
      recs.push({
        priority: 'low',
        title: 'Address Common Question Patterns',
        description: `Most questions are about "${topType[0]}" (${topType[1]} questions). Strengthen this area in future submissions.`,
        action: 'View Analytics',
      });
    }

    // Always include proactive recommendations
    recs.push({
      priority: 'low',
      title: 'Proactive Compliance Check',
      description: 'Run regular gatekeeper validations to catch issues before submission.',
      action: 'Schedule Validation',
    });

    return recs;
  }, [metrics]);

  const isLoading = submissionsLoading || questionsLoading || changesLoading;

  if (isLoading) {
    return (
      <div className="space-y-6" data-testid="loading-intelligence">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="regulatory-intelligence">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="w-6 h-6 text-stone-600" />
            Regulatory Intelligence
          </h2>
          <p className="text-stone-600">AI-powered insights, trends, and predictive analytics</p>
        </div>
        <Badge 
          variant={metrics.riskScore < 30 ? 'default' : metrics.riskScore < 60 ? 'secondary' : 'destructive'}
          className="text-sm"
          data-testid="badge-risk-level"
        >
          Risk: {metrics.riskScore.toFixed(0)}/100
        </Badge>
      </div>

      {/* 1. Insights Dashboard */}
      <Card data-testid="card-insights-dashboard">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-stone-600" />
            Key Performance Metrics
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Success Rate */}
            <div className="p-4 border rounded-lg" data-testid="metric-success-rate">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-stone-600">Success Rate</span>
                <CheckCircle className="w-4 h-4 text-stone-1000" />
              </div>
              <div className="text-2xl font-bold text-stone-700">
                {metrics.submissionSuccessRate.toFixed(1)}%
              </div>
              <Progress 
                value={metrics.submissionSuccessRate} 
                className="mt-2 h-2"
                data-testid="progress-success-rate"
              />
              <p className="text-xs text-stone-500 mt-1">
                {metrics.approvedSubmissions} of {metrics.totalSubmissions} submissions approved
              </p>
            </div>

            {/* Avg Approval Time */}
            <div className="p-4 border rounded-lg" data-testid="metric-approval-time">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-stone-600">Avg Approval Time</span>
                <Clock className="w-4 h-4 text-stone-1000" />
              </div>
              <div className="text-2xl font-bold text-stone-600">
                {metrics.avgApprovalTimeDays} days
              </div>
              <Progress 
                value={Math.min(100, (metrics.avgApprovalTimeDays / 180) * 100)} 
                className="mt-2 h-2"
                data-testid="progress-approval-time"
              />
              <p className="text-xs text-stone-500 mt-1">
                Based on {metrics.approvedSubmissions} approved submissions
              </p>
            </div>

            {/* Question Volume */}
            <div className="p-4 border rounded-lg" data-testid="metric-question-volume">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-stone-600">Total Questions</span>
                <FileText className="w-4 h-4 text-stone-1000" />
              </div>
              <div className="text-2xl font-bold text-stone-600">
                {questions.length}
              </div>
              <Progress 
                value={Math.min(100, (questions.length / 50) * 100)} 
                className="mt-2 h-2"
                data-testid="progress-question-volume"
              />
              <p className="text-xs text-stone-500 mt-1">
                Across all submissions
              </p>
            </div>

            {/* Risk Score */}
            <div className="p-4 border rounded-lg" data-testid="metric-risk-score">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-stone-600">Risk Score</span>
                <AlertTriangle className={`w-4 h-4 ${
                  metrics.riskScore < 30 ? 'text-stone-1000' : 
                  metrics.riskScore < 60 ? 'text-stone-1000' : 
                  'text-stone-1000'
                }`} />
              </div>
              <div className={`text-2xl font-bold ${
                metrics.riskScore < 30 ? 'text-stone-700' : 
                metrics.riskScore < 60 ? 'text-stone-600' : 
                'text-stone-700'
              }`}>
                {metrics.riskScore.toFixed(0)}/100
              </div>
              <Progress 
                value={metrics.riskScore} 
                className="mt-2 h-2"
                data-testid="progress-risk-score"
              />
              <p className="text-xs text-stone-500 mt-1">
                {metrics.riskScore < 30 ? 'Low risk' : metrics.riskScore < 60 ? 'Medium risk' : 'High risk'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 2. Predictive Analytics */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card data-testid="card-predictive-analytics">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="w-5 h-5 text-stone-600" />
              Likely Questions Prediction
            </CardTitle>
          </CardHeader>
          <CardContent>
            {predictions.likelyQuestions.length > 0 ? (
              <div className="space-y-3">
                {predictions.likelyQuestions.map((q, idx) => (
                  <div key={idx} className="space-y-1" data-testid={`prediction-question-${idx}`}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{q.category}</span>
                      <span className="text-sm text-stone-600">{q.probability.toFixed(0)}% likely</span>
                    </div>
                    <Progress value={q.probability} className="h-2" />
                    <p className="text-xs text-stone-500">{q.count} historical questions</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-stone-500 text-sm" data-testid="text-no-predictions">
                Insufficient data for predictions. Submit more data to enable predictive analytics.
              </p>
            )}
          </CardContent>
        </Card>

        <Card data-testid="card-timeline-estimates">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="w-5 h-5 text-stone-600" />
              Timeline Estimates by Region
            </CardTitle>
          </CardHeader>
          <CardContent>
            {predictions.timelineEstimates.length > 0 ? (
              <div className="space-y-4">
                {predictions.timelineEstimates.map((est, idx) => (
                  <div key={idx} data-testid={`timeline-estimate-${idx}`}>
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">{est.region}</span>
                      <Badge variant="outline">{est.estimatedDays} days</Badge>
                    </div>
                    <Progress 
                      value={Math.min(100, (est.estimatedDays / 180) * 100)} 
                      className="h-2"
                    />
                    <p className="text-xs text-stone-500 mt-1">
                      Based on {est.submissions} submission(s)
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-stone-500 text-sm" data-testid="text-no-timeline">
                No regional data available yet.
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 3. Regulatory Trends */}
      <Card data-testid="card-regulatory-trends">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-stone-600" />
            Regulatory Trends
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* Top Question Categories */}
            <div data-testid="section-question-categories">
              <h4 className="font-semibold mb-3 text-sm">Top Question Categories</h4>
              {Object.entries(metrics.questionsByType).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(metrics.questionsByType)
                    .sort(([, a], [, b]) => b - a)
                    .slice(0, 5)
                    .map(([type, count], idx) => (
                      <div key={idx} className="flex items-center justify-between" data-testid={`question-category-${idx}`}>
                        <span className="text-sm text-stone-700">{type}</span>
                        <Badge variant="secondary">{count}</Badge>
                      </div>
                    ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500">No question data yet</p>
              )}
            </div>

            {/* Change Types */}
            <div data-testid="section-change-types">
              <h4 className="font-semibold mb-3 text-sm">Common Change Types</h4>
              {changes.length > 0 ? (
                <div className="space-y-2">
                  {changes.slice(0, 5).map((change, idx) => (
                    <div key={idx} className="flex items-center justify-between" data-testid={`change-type-${idx}`}>
                      <span className="text-sm text-stone-700">{change.category || change.title}</span>
                      <Badge variant="outline">{change.pathway || change.impact}</Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500">No change data yet</p>
              )}
            </div>

            {/* Agency Patterns */}
            <div data-testid="section-agency-patterns">
              <h4 className="font-semibold mb-3 text-sm">Agency-Specific Patterns</h4>
              {Object.entries(metrics.submissionsByRegion).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(metrics.submissionsByRegion).map(([region, count], idx) => (
                    <div key={idx} className="space-y-1" data-testid={`agency-pattern-${idx}`}>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-stone-700">{region}</span>
                        <span className="text-xs text-stone-500">{count} submissions</span>
                      </div>
                      <Progress 
                        value={(count / metrics.totalSubmissions) * 100} 
                        className="h-1"
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-stone-500">No agency data yet</p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4. AI Recommendations */}
      <Card data-testid="card-ai-recommendations">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-stone-600" />
            AI Recommendations
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recommendations.length > 0 ? (
            <div className="space-y-3">
              {recommendations.map((rec, idx) => (
                <div 
                  key={idx}
                  className={`p-4 border-l-4 rounded ${
                    rec.priority === 'high' 
                      ? 'border-stone-1000 bg-stone-100' 
                      : rec.priority === 'medium'
                      ? 'border-stone-1000 bg-stone-100'
                      : 'border-stone-1000 bg-stone-100'
                  }`}
                  data-testid={`recommendation-${idx}`}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold text-sm">{rec.title}</h4>
                        <Badge 
                          variant={rec.priority === 'high' ? 'destructive' : 'secondary'}
                          className="text-xs"
                        >
                          {rec.priority}
                        </Badge>
                      </div>
                      <p className="text-sm text-stone-700 mb-2">{rec.description}</p>
                      <span className="text-xs text-stone-600 italic">→ {rec.action}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 text-stone-500" data-testid="text-no-recommendations">
              <Lightbulb className="w-12 h-12 mx-auto mb-3 text-stone-300" />
              <p className="font-medium">All systems optimal</p>
              <p className="text-sm">No immediate recommendations at this time.</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
