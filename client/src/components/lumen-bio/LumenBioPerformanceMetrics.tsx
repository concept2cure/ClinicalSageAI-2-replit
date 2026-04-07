import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
  LineChart,
  Line,
} from 'recharts';
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
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { HoverCard, HoverCardContent, HoverCardTrigger } from '@/components/ui/hover-card';
import {
  AlertCircle,
  TrendingUp,
  TrendingDown,
  Activity,
  Clock,
  Target,
  BarChart2,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  CheckCircle,
  XCircle,
  Award,
  Calendar,
  Users,
  LogOut,
  Info,
} from 'lucide-react';

// Risk classification component with enhanced gradient colors
const RiskIndicator = ({ level, text }: { level: 'low' | 'medium' | 'high'; text: string }) => {
  // Base colors for each risk level
  const bgColor =
    level === 'low'
      ? 'bg-gradient-to-r from-green-50 to-green-100 border-green-300 text-green-800'
      : level === 'medium'
        ? 'bg-gradient-to-r from-amber-50 to-amber-100 border-amber-300 text-amber-800'
        : 'bg-gradient-to-r from-red-50 to-red-100 border-red-300 text-red-800';

  // Icon for each risk level
  const icon =
    level === 'low' ? (
      <CheckCircle className="h-4 w-4 mr-1" />
    ) : level === 'medium' ? (
      <AlertCircle className="h-4 w-4 mr-1" />
    ) : (
      <AlertTriangle className="h-4 w-4 mr-1" />
    );

  // Hover effects
  const hoverEffect =
    level === 'low'
      ? 'hover:from-green-100 hover:to-green-200 hover:shadow-sm'
      : level === 'medium'
        ? 'hover:from-amber-100 hover:to-amber-200 hover:shadow-sm'
        : 'hover:from-red-100 hover:to-red-200 hover:shadow-sm';

  return (
    <div
      className={`flex items-center px-3 py-1.5 rounded-full text-sm font-medium border transition-all duration-200 ${bgColor} ${hoverEffect}`}
    >
      {icon}
      <span>{text}</span>
    </div>
  );
};

// Enhanced metric component
// Enhanced MetricCard with gradient styling
const MetricCard = ({
  title,
  value,
  prevValue,
  unit = '',
  icon,
  trend = 0,
  target = null,
  trendText = '',
  tooltipContent = '',
}: {
  title: string;
  value: number | string;
  prevValue?: number | string;
  unit?: string;
  icon: React.ReactNode;
  trend?: number;
  target?: number | null;
  trendText?: string;
  tooltipContent?: string;
}) => {
  const getTrendIcon = () => {
    if (trend > 0) return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend < 0) return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

  const getTrendColor = () => {
    if (trend > 0) return 'text-green-600';
    if (trend < 0) return 'text-red-600';
    return 'text-slate-600';
  };

  // Determine status based on target and value
  const getStatus = () => {
    if (target === null || typeof value !== 'number') return 'neutral';
    if (value >= target) return 'success';
    if (value >= target * 0.8) return 'warning';
    return 'danger';
  };

  const status = getStatus();

  // Card gradient styling based on status
  const cardGradient =
    status === 'success'
      ? 'bg-gradient-to-r from-green-50 to-white border-l-4 border-l-green-500'
      : status === 'warning'
        ? 'bg-gradient-to-r from-amber-50 to-white border-l-4 border-l-amber-500'
        : status === 'danger'
          ? 'bg-gradient-to-r from-red-50 to-white border-l-4 border-l-red-500'
          : 'bg-gradient-to-r from-blue-50/40 to-white';

  // Badge styling based on status
  const badgeStyle =
    status === 'success'
      ? 'bg-green-100 text-green-800 border border-green-200'
      : status === 'warning'
        ? 'bg-amber-100 text-amber-800 border border-amber-200'
        : status === 'danger'
          ? 'bg-red-100 text-red-800 border border-red-200'
          : 'bg-blue-100 text-blue-800 border border-blue-200';

  // Title styling based on status
  const titleColor =
    status === 'success'
      ? 'text-green-800'
      : status === 'warning'
        ? 'text-amber-800'
        : status === 'danger'
          ? 'text-red-800'
          : 'text-primary';

  return (
    <Card className={`${cardGradient} transition-all duration-200 hover:shadow-md`}>
      <CardContent className="p-6">
        <div className="flex justify-between items-start">
          <div className={`${status === 'neutral' ? 'bg-primary/10' : ''} p-3 rounded-full`}>
            {icon}
          </div>
          {target !== null && (
            <Badge variant="outline" className={`${badgeStyle} shadow-sm`}>
              Target: {target}
              {unit}
            </Badge>
          )}
        </div>

        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <h3
                className={`text-xl font-semibold mt-4 cursor-help border-b border-dotted border-slate-400 ${titleColor}`}
              >
                {title}
              </h3>
            </TooltipTrigger>
            {tooltipContent && (
              <TooltipContent side="top" className="max-w-xs p-3">
                <p className="text-sm">{tooltipContent}</p>
              </TooltipContent>
            )}
          </Tooltip>
        </TooltipProvider>

        <div className="flex items-end gap-2 mt-2">
          <span className={`text-3xl font-bold ${titleColor}`}>{value}</span>
          {unit && <span className="text-xl text-slate-500">{unit}</span>}
        </div>
        {trend !== 0 && (
          <div className="flex items-center mt-2">
            {getTrendIcon()}
            <span className={`text-sm ml-1 ${getTrendColor()}`}>
              {trend > 0 ? '+' : ''}
              {trend}
              {unit} {trendText}
            </span>
          </div>
        )}
        {prevValue !== undefined && (
          <div className="text-xs text-slate-500 mt-1">
            Previous: {prevValue}
            {unit}
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Risk factor component with enhanced gradients
const RiskFactorCard = ({
  title,
  riskLevel,
  impact,
  mitigationSteps,
  potentialUpside,
  tooltipContent,
}: {
  title: string;
  riskLevel: 'low' | 'medium' | 'high';
  impact: string;
  mitigationSteps: string[];
  potentialUpside?: string;
  tooltipContent?: string;
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Enhanced gradient styling
  const gradientStyle =
    riskLevel === 'low'
      ? 'bg-gradient-to-r from-green-50 to-green-100 border-l-green-500'
      : riskLevel === 'medium'
        ? 'bg-gradient-to-r from-amber-50 to-amber-100 border-l-amber-500'
        : 'bg-gradient-to-r from-red-50 to-red-100 border-l-red-500';

  const headerColor =
    riskLevel === 'low'
      ? 'text-green-800'
      : riskLevel === 'medium'
        ? 'text-amber-800'
        : 'text-red-800';

  return (
    <Card
      className={`
      border-l-4 transition-all duration-200 hover:shadow-md
      ${gradientStyle}
    `}
    >
      <CardHeader className={`pb-2 ${headerColor}`}>
        <div className="flex justify-between items-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <CardTitle className="text-base cursor-help border-b border-dotted border-slate-400">
                  {title}
                </CardTitle>
              </TooltipTrigger>
              {tooltipContent && (
                <TooltipContent side="top" className="max-w-xs p-3">
                  <p className="text-sm">{tooltipContent}</p>
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          <RiskIndicator
            level={riskLevel}
            text={riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1)}
          />
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-sm text-slate-600 mb-2">{impact}</p>
        {isExpanded && (
          <div className="mt-3 space-y-2">
            <div>
              <h4 className="text-sm font-medium">Mitigation Steps:</h4>
              <ul className="mt-1 space-y-1">
                {mitigationSteps.map((step, i) => (
                  <li key={i} className="text-sm text-slate-600 flex items-start">
                    <span className="text-primary mr-2">•</span>
                    {step}
                  </li>
                ))}
              </ul>
            </div>

            {potentialUpside && (
              <div className="mt-2">
                <h4 className="text-sm font-medium">Potential Upside:</h4>
                <p className="text-sm text-slate-600 mt-1">{potentialUpside}</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs hover:bg-slate-100"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Show Less' : 'Show More'}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Insight card component with enhanced gradient styling
const InsightCard = ({
  title,
  insight,
  recommendation,
  supportingEvidence,
  impactLevel = 'medium',
}: {
  title: string;
  insight: string;
  recommendation: string;
  supportingEvidence: string;
  impactLevel?: 'low' | 'medium' | 'high';
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  // Badge styling with enhanced colors
  const impactColors = {
    low: 'bg-gradient-to-r from-blue-50 to-blue-100 text-blue-800 border border-blue-200',
    medium:
      'bg-gradient-to-r from-purple-50 to-purple-100 text-purple-800 border border-purple-200',
    high: 'bg-gradient-to-r from-indigo-50 to-indigo-100 text-indigo-800 border border-indigo-200',
  };

  // Card background gradient based on impact level
  const cardGradient =
    impactLevel === 'low'
      ? 'bg-gradient-to-r from-blue-50/30 to-white'
      : impactLevel === 'medium'
        ? 'bg-gradient-to-r from-purple-50/30 to-white'
        : 'bg-gradient-to-r from-indigo-50/30 to-white';

  // Title color based on impact level
  const titleColor =
    impactLevel === 'low'
      ? 'text-blue-800'
      : impactLevel === 'medium'
        ? 'text-purple-800'
        : 'text-indigo-800';

  return (
    <Card className={`transition-all duration-200 hover:shadow-md ${cardGradient}`}>
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className={`text-base ${titleColor}`}>{title}</CardTitle>
          <Badge className={`${impactColors[impactLevel]} shadow-sm`}>
            {impactLevel.charAt(0).toUpperCase() + impactLevel.slice(1)} Impact
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pb-3">
        <p className="text-sm text-slate-600">{insight}</p>

        {isExpanded && (
          <div className="mt-3 space-y-3">
            <div>
              <h4 className="text-sm font-medium">Recommendation:</h4>
              <p className="text-sm text-slate-600 mt-1">{recommendation}</p>
            </div>

            <div>
              <h4 className="text-sm font-medium">Supporting Evidence:</h4>
              <p className="text-sm text-slate-600 mt-1">{supportingEvidence}</p>
            </div>
          </div>
        )}
      </CardContent>
      <CardFooter className="pt-0">
        <Button
          variant="ghost"
          size="sm"
          className="text-xs hover:bg-slate-100"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {isExpanded ? 'Show Less' : 'Show More'}
        </Button>
      </CardFooter>
    </Card>
  );
};

// Mock API response for CSR-based KPIs
const useCsrPerformanceMetrics = (drugName: string) => {
  return useQuery({
    queryKey: ['/api/csr-intelligence/metrics', drugName],
    initialData: {
      enrollmentMetrics: {
        // Enrollment metrics
        targetEnrollment: 150,
        currentEnrollment: 86,
        enrollmentRate: 5.7, // per week
        averageSiteActivation: 28, // days
        screenFailureRate: 23.5, // percent
        dropoutRate: 12.4, // percent
        projectedCompletion: '2025-08-15',
        enrollmentTrend: [
          { month: 'Jan', enrollment: 12 },
          { month: 'Feb', enrollment: 18 },
          { month: 'Mar', enrollment: 24 },
          { month: 'Apr', enrollment: 32 },
        ],
        // Calculated field
        percentComplete: 57.3,
        enrollmentLastMonth: 32,
        enrollmentPreviousMonth: 24,
        enrollmentChange: 8,
      },

      riskIndicators: {
        protocolDeviations: 12,
        sitePerformance: {
          lowPerforming: 2,
          moderatePerforming: 5,
          highPerforming: 3,
        },
        currentRisks: [
          {
            title: 'Enrollment Rate Below Target',
            level: 'medium' as const,
            impact:
              'Current enrollment rate of 5.7 patients/week is below target of 8 patients/week, potentially delaying study completion.',
            mitigationSteps: [
              'Increase site monitoring at low-performing sites',
              'Add 2 additional sites in high-potential regions',
              'Implement targeted recruitment strategies for key demographics',
            ],
            potentialUpside: 'Successful mitigation could accelerate timeline by up to 4 weeks.',
            tooltipContent:
              'Based on CSR analysis of 28 similar trials, enrollment rates below 70% of target are associated with 85% higher probability of timeline extensions.',
          },
          {
            title: 'Higher Than Expected Screen Failure Rate',
            level: 'high' as const,
            impact:
              'Screen failure rate of 23.5% exceeds the expected 15%, increasing recruitment costs and timeline.',
            mitigationSteps: [
              'Review inclusion/exclusion criteria with investigators',
              'Implement pre-screening questionnaire',
              'Provide additional training to site staff on eligibility assessment',
            ],
            tooltipContent:
              'CSR data shows screening failures above 20% correlate with 40% longer enrollment periods and 18% higher per-patient costs.',
          },
          {
            title: 'Data Entry Delays at Sites',
            level: 'low' as const,
            impact:
              '2 sites showing consistent delays in data entry, potentially affecting interim analysis.',
            mitigationSteps: [
              'Schedule targeted site training sessions',
              'Implement weekly data completion reminders',
              'Consider incentive program for data entry completion',
            ],
            tooltipContent:
              'Timely data entry ensures proper interim analysis. Studies show 25% of protocol amendments result from incomplete data visibility.',
          },
        ],
      },

      csrIntelligence: {
        similarTrials: 28,
        benchmarkMetrics: {
          avgSampleSize: 165,
          avgDuration: 14.2, // months
          avgDropout: 16.7, // percent
          avgSuccess: 62, // percent
        },
        endpointPerformance: [
          { endpoint: 'Weight Loss', avgValue: 5.2, unit: '%', benchmark: 4.8 },
          { endpoint: 'HbA1c Reduction', avgValue: 0.8, unit: '%', benchmark: 1.1 },
          { endpoint: 'Waist Circumference', avgValue: 4.1, unit: 'cm', benchmark: 3.8 },
        ],
        keyInsights: [
          {
            title: 'Endpoint Selection Impact',
            insight:
              'Trials using weight loss at 12 weeks as primary endpoint had 34% higher success rates than those using longer timeframes.',
            recommendation:
              'Consider adding a key secondary endpoint at 12 weeks in addition to primary at 24 weeks.',
            supportingEvidence:
              'Meta-analysis of 12 similar obesity trials shows strong correlation (r=0.78) between 12-week and 24-week outcomes.',
            impactLevel: 'high' as const,
          },
          {
            title: 'Sample Size Optimization',
            insight:
              'Successful similar trials averaged 165 participants, but stratified analysis shows minimal benefit above 140 participants for this mechanism of action.',
            recommendation:
              'Consider optimizing sample size to 140 with appropriate stratification by BMI and baseline characteristics.',
            supportingEvidence:
              'Power analysis based on 28 similar trials indicates 90% power with n=140 when using proposed stratification.',
            impactLevel: 'medium' as const,
          },
          {
            title: 'Dropout Rate Factors',
            insight:
              'Trials with bi-weekly visits in first 8 weeks showed 31% lower dropout rates than those with monthly visits.',
            recommendation:
              'Implement bi-weekly visits during initial 8 weeks, then transition to monthly schedule.',
            supportingEvidence:
              'Analysis of participant retention factors across 18 weight management trials (2023-2025) shows early engagement critically impacts completion rates.',
            impactLevel: 'medium' as const,
          },
        ],
      },

      opportunityAreas: {
        protocolOptimization: [
          {
            area: 'Inclusion/Exclusion Criteria',
            opportunity:
              'Relaxing BMI upper limit from 40 to 45 kg/m² could increase eligible population by ~22% with minimal impact on safety profile.',
            confidence: 85,
          },
          {
            area: 'Visit Schedule',
            opportunity:
              'Telemedicine visits for 50% of follow-ups could reduce burden and improve retention by estimated 18%.',
            confidence: 73,
          },
          {
            area: 'Secondary Endpoints',
            opportunity:
              'Adding quality of life assessment would increase regulatory and publication impact with minimal additional burden.',
            confidence: 91,
          },
        ],
        timelineAcceleration: {
          potentialWeeksSaved: 8.5,
          confidenceLevel: 72,
          accelerationAreas: [
            'Parallel site activation',
            'Centralized recruitment',
            'Streamlined data monitoring',
          ],
        },
      },
    },
  });
};

const LumenBioPerformanceMetrics = () => {
  // In a real implementation, this would be dynamically determined
  const drugName = 'LMN-0801';

  const { data: metrics, isLoading } = useCsrPerformanceMetrics(drugName);

  if (isLoading) {
    return <div className="p-8 flex justify-center">Loading metrics...</div>;
  }

  const { enrollmentMetrics, riskIndicators, csrIntelligence, opportunityAreas } = metrics;

  // Format projected completion date
  const formattedCompletionDate = new Date(
    enrollmentMetrics.projectedCompletion
  ).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  return (
    <div className="space-y-6">
      <Tabs defaultValue="metrics">
        <TabsList className="grid grid-cols-4 w-full">
          <TabsTrigger value="metrics">
            <Activity className="h-4 w-4 mr-2" />
            Performance KPIs
          </TabsTrigger>
          <TabsTrigger value="risks">
            <AlertTriangle className="h-4 w-4 mr-2" />
            Risk Indicators
          </TabsTrigger>
          <TabsTrigger value="insights">
            <BarChart2 className="h-4 w-4 mr-2" />
            CSR Insights
          </TabsTrigger>
          <TabsTrigger value="opportunities">
            <Target className="h-4 w-4 mr-2" />
            Opportunities
          </TabsTrigger>
        </TabsList>

        {/* Performance Metrics Tab */}
        <TabsContent value="metrics" className="pt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            <MetricCard
              title="Enrollment Progress"
              value={enrollmentMetrics.percentComplete}
              unit="%"
              icon={<Activity className="h-6 w-6 text-primary" />}
              trend={enrollmentMetrics.enrollmentChange}
              trendText="vs previous month"
              target={100}
              tooltipContent="Percentage of target enrollment achieved to date. Higher is better and indicates the trial is on track to complete on schedule."
            />

            <MetricCard
              title="Enrollment Rate"
              value={enrollmentMetrics.enrollmentRate}
              unit=" pts/week"
              icon={<TrendingUp className="h-6 w-6 text-primary" />}
              target={8}
              tooltipContent="Average number of participants enrolled per week. Current target is 8 participants/week based on protocol timeline projections."
            />

            <MetricCard
              title="Current Enrollment"
              value={enrollmentMetrics.currentEnrollment}
              prevValue={enrollmentMetrics.targetEnrollment}
              icon={<Users className="h-6 w-6 text-primary" />}
              tooltipContent="Total number of participants currently enrolled compared to the target sample size of 150 participants."
            />

            <MetricCard
              title="Screen Failure Rate"
              value={riskIndicators.screenFailureRate}
              unit="%"
              icon={<XCircle className="h-6 w-6 text-primary" />}
              target={15}
              tooltipContent="Percentage of screened participants who do not meet eligibility criteria. Lower is better. Rates above 15% may indicate overly restrictive inclusion/exclusion criteria."
            />

            <MetricCard
              title="Dropout Rate"
              value={enrollmentMetrics.dropoutRate}
              unit="%"
              icon={<LogOut className="h-6 w-6 text-primary" />}
              target={10}
              tooltipContent="Percentage of enrolled participants who discontinue the study. Lower is better. Target is below 10% to maintain statistical power and data integrity."
            />

            <MetricCard
              title="Projected Completion"
              value={formattedCompletionDate}
              icon={<Calendar className="h-6 w-6 text-primary" />}
              tooltipContent="Estimated completion date based on current enrollment rate and remaining sample size requirements."
            />
          </div>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Enrollment Trend</CardTitle>
              <CardDescription>Monthly recruitment progress vs targets</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart
                    data={enrollmentMetrics.enrollmentTrend}
                    margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                  >
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="month" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="enrollment" fill="#d97757" name="Patients Enrolled" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Risk Indicators Tab */}
        <TabsContent value="risks" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 space-y-4">
              <h3 className="font-semibold text-lg">Current Risk Factors</h3>
              {riskIndicators.currentRisks.map((risk, index) => (
                <RiskFactorCard
                  key={index}
                  title={risk.title}
                  riskLevel={risk.level}
                  impact={risk.impact}
                  mitigationSteps={risk.mitigationSteps}
                  potentialUpside={risk.potentialUpside}
                  tooltipContent={risk.tooltipContent}
                />
              ))}
            </div>

            <div className="space-y-4">
              <h3 className="font-semibold text-lg">Site Performance Distribution</h3>
              <Card>
                <CardContent className="p-6">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={[
                        {
                          name: 'Low',
                          value: riskIndicators.sitePerformance.lowPerforming,
                          fill: '#f87171',
                        },
                        {
                          name: 'Moderate',
                          value: riskIndicators.sitePerformance.moderatePerforming,
                          fill: '#fbbf24',
                        },
                        {
                          name: 'High',
                          value: riskIndicators.sitePerformance.highPerforming,
                          fill: '#34d399',
                        },
                      ]}
                      margin={{ top: 10, right: 10, left: 10, bottom: 10 }}
                    >
                      <XAxis dataKey="name" />
                      <YAxis allowDecimals={false} />
                      <Tooltip />
                      <Bar dataKey="value" name="Sites" />
                    </BarChart>
                  </ResponsiveContainer>

                  <div className="mt-4">
                    <h4 className="font-medium text-sm mb-2">Protocol Deviations</h4>
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-slate-500">
                        Total: {riskIndicators.protocolDeviations}
                      </span>
                      <Badge
                        variant={riskIndicators.protocolDeviations > 15 ? 'destructive' : 'outline'}
                      >
                        {riskIndicators.protocolDeviations > 15 ? 'High' : 'Acceptable'}
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <h3 className="font-semibold text-lg mt-6">Industry Benchmarks</h3>
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">Dropout Rate</span>
                        <div className="flex items-center">
                          <span className="font-medium">{enrollmentMetrics.dropoutRate}%</span>
                          <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-green-100 text-green-800">
                            vs {csrIntelligence.benchmarkMetrics.avgDropout}%
                          </span>
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <Info className="h-3.5 w-3.5 ml-1.5 text-slate-400 cursor-help" />
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80">
                              <div className="space-y-2">
                                <p className="text-sm">
                                  Current dropout rate compared to industry benchmark. Lower is
                                  better. CSR analysis shows that trials with dropout rates below
                                  the benchmark have a 72% higher probability of meeting primary
                                  endpoints.
                                </p>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        </div>
                      </div>
                      <Progress
                        value={
                          (enrollmentMetrics.dropoutRate /
                            csrIntelligence.benchmarkMetrics.avgDropout) *
                          100
                        }
                        className="h-2"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">Sample Size</span>
                        <div className="flex items-center">
                          <span className="font-medium">{enrollmentMetrics.targetEnrollment}</span>
                          <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                            vs {csrIntelligence.benchmarkMetrics.avgSampleSize}
                          </span>
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <Info className="h-3.5 w-3.5 ml-1.5 text-slate-400 cursor-help" />
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80">
                              <div className="space-y-2">
                                <p className="text-sm">
                                  Current planned sample size compared to industry average. CSR
                                  analysis suggests that sample size optimization can be achieved
                                  through adaptive trial design, potentially reducing costs while
                                  maintaining statistical power.
                                </p>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        </div>
                      </div>
                      <Progress
                        value={
                          (enrollmentMetrics.targetEnrollment /
                            csrIntelligence.benchmarkMetrics.avgSampleSize) *
                          100
                        }
                        className="h-2"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-slate-600">Enrollment Rate</span>
                        <div className="flex items-center">
                          <span className="font-medium">
                            {enrollmentMetrics.enrollmentRate}/week
                          </span>
                          <span className="text-xs ml-2 px-1.5 py-0.5 rounded bg-red-100 text-red-800">
                            vs 7.4/week
                          </span>
                          <HoverCard>
                            <HoverCardTrigger asChild>
                              <Info className="h-3.5 w-3.5 ml-1.5 text-slate-400 cursor-help" />
                            </HoverCardTrigger>
                            <HoverCardContent className="w-80">
                              <div className="space-y-2">
                                <p className="text-sm">
                                  Current participant enrollment rate compared to industry average
                                  for similar trials. CSR analysis shows that optimizing site
                                  selection and streamlining screening procedures can improve
                                  enrollment rates by up to 35%.
                                </p>
                              </div>
                            </HoverCardContent>
                          </HoverCard>
                        </div>
                      </div>
                      <Progress
                        value={(enrollmentMetrics.enrollmentRate / 7.4) * 100}
                        className="h-2"
                      />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* CSR Insights Tab */}
        <TabsContent value="insights" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <h3 className="font-semibold text-lg">Key CSR-Derived Insights</h3>
              <div className="space-y-4">
                {csrIntelligence.keyInsights.map((insight, idx) => (
                  <InsightCard
                    key={idx}
                    title={insight.title}
                    insight={insight.insight}
                    recommendation={insight.recommendation}
                    supportingEvidence={insight.supportingEvidence}
                    impactLevel={insight.impactLevel}
                  />
                ))}
              </div>
            </div>

            <div className="space-y-6">
              <h3 className="font-semibold text-lg">Endpoint Performance vs Benchmarks</h3>
              <Card>
                <CardContent className="pt-6">
                  <ResponsiveContainer width="100%" height={200}>
                    <BarChart
                      data={csrIntelligence.endpointPerformance}
                      margin={{ top: 20, right: 30, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="endpoint" />
                      <YAxis />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="avgValue" fill="#d97757" name="Your Trial" />
                      <Bar dataKey="benchmark" fill="#b0aea5" name="Benchmark" />
                    </BarChart>
                  </ResponsiveContainer>
                </CardContent>
              </Card>

              <h3 className="font-semibold text-lg mt-4">Benchmark Comparison</h3>
              <Card>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        <span className="text-sm text-slate-500">Similar CSRs Analyzed</span>
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <Info className="h-3.5 w-3.5 ml-1.5 text-slate-400 cursor-help" />
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80">
                            <div className="space-y-2">
                              <p className="text-sm">
                                Number of clinical study reports analyzed with similar indication
                                and phase. A higher number of reports increases the statistical
                                confidence of benchmarks and recommendations.
                              </p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                        <p className="font-semibold text-lg">{csrIntelligence.similarTrials}</p>
                      </div>
                      <Award className="h-8 w-8 text-amber-500" />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <div className="flex items-center">
                        <span className="text-sm text-slate-500">
                          Success Rate in Similar Trials
                        </span>
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <Info className="h-3.5 w-3.5 ml-1.5 text-slate-400 cursor-help" />
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80">
                            <div className="space-y-2">
                              <p className="text-sm">
                                Percentage of trials in this indication and phase that met their
                                primary endpoints. This metric helps contextualize your trial's
                                potential for success compared to industry standards.
                              </p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                        <p className="font-semibold text-lg">
                          {csrIntelligence.benchmarkMetrics.avgSuccess}%
                        </p>
                      </div>
                      <CheckCircle className="h-8 w-8 text-green-500" />
                    </div>

                    <div className="flex justify-between items-center pt-2">
                      <div className="flex items-center">
                        <span className="text-sm text-slate-500">Avg. Trial Duration</span>
                        <HoverCard>
                          <HoverCardTrigger asChild>
                            <Info className="h-3.5 w-3.5 ml-1.5 text-slate-400 cursor-help" />
                          </HoverCardTrigger>
                          <HoverCardContent className="w-80">
                            <div className="space-y-2">
                              <p className="text-sm">
                                Average duration of similar trials from first patient enrollment to
                                final data lock. Trial duration has significant impact on overall
                                cost and time-to-market considerations.
                              </p>
                            </div>
                          </HoverCardContent>
                        </HoverCard>
                        <p className="font-semibold text-lg">
                          {csrIntelligence.benchmarkMetrics.avgDuration} months
                        </p>
                      </div>
                      <Clock className="h-8 w-8 text-blue-500" />
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Opportunities Tab */}
        <TabsContent value="opportunities" className="pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
            <div className="lg:col-span-3">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center">
                      <CardTitle>Protocol Optimization Opportunities</CardTitle>
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <Info className="h-4 w-4 ml-1.5 text-slate-400 cursor-help" />
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80">
                          <div className="space-y-2">
                            <p className="text-sm">
                              Protocol optimizations are CSR-derived suggestions that can improve
                              study efficiency, lower costs, or increase success probabilities. Each
                              suggestion is assigned a confidence level based on statistical
                              analysis of similar trials.
                            </p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                  </div>
                  <CardDescription>
                    CSR-driven analysis identified these potential improvements
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {opportunityAreas.protocolOptimization.map((item, idx) => (
                      <div key={idx} className="border rounded-lg p-4">
                        <div className="flex justify-between">
                          <div className="flex items-center">
                            <h3 className="font-semibold">{item.area}</h3>
                            <HoverCard>
                              <HoverCardTrigger asChild>
                                <Info className="h-3.5 w-3.5 ml-1.5 text-slate-400 cursor-help" />
                              </HoverCardTrigger>
                              <HoverCardContent className="w-80">
                                <div className="space-y-2">
                                  <p className="text-sm">
                                    This optimization opportunity focuses on{' '}
                                    {item.area.toLowerCase()}. The confidence level represents the
                                    statistical certainty based on similar trial outcomes in our CSR
                                    database.
                                  </p>
                                </div>
                              </HoverCardContent>
                            </HoverCard>
                          </div>
                          <Badge variant="outline" className="bg-green-50 text-green-700">
                            {item.confidence}% Confidence
                          </Badge>
                        </div>
                        <p className="text-sm text-slate-600 mt-2">{item.opportunity}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="lg:col-span-2">
              <Card className="h-full">
                <CardHeader>
                  <div className="flex items-center">
                    <CardTitle>Timeline Acceleration</CardTitle>
                    <HoverCard>
                      <HoverCardTrigger asChild>
                        <Info className="h-4 w-4 ml-1.5 text-slate-400 cursor-help" />
                      </HoverCardTrigger>
                      <HoverCardContent className="w-80">
                        <div className="space-y-2">
                          <p className="text-sm">
                            Timeline acceleration represents the potential time savings identified
                            by analyzing similar clinical trials in the CSR database. These savings
                            are derived from optimizing enrollment strategies, streamlining site
                            selection, and implementing more efficient protocols.
                          </p>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  </div>
                  <CardDescription>
                    Potential speed improvements based on CSR intelligence
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col justify-center items-center pb-6">
                    <div className="relative">
                      <svg viewBox="0 0 100 100" width="160" height="160">
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="#e8e6dc"
                          strokeWidth="10"
                        />
                        <circle
                          cx="50"
                          cy="50"
                          r="45"
                          fill="none"
                          stroke="#d97757"
                          strokeWidth="10"
                          strokeDasharray="283"
                          strokeDashoffset={
                            283 -
                            (283 * opportunityAreas.timelineAcceleration.confidenceLevel) / 100
                          }
                          transform="rotate(-90 50 50)"
                        />
                      </svg>
                      <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-3xl font-bold">
                          {opportunityAreas.timelineAcceleration.potentialWeeksSaved}
                        </span>
                        <span className="text-sm">weeks saved</span>
                      </div>
                    </div>
                    <p className="text-sm text-slate-500 mt-4 text-center">
                      {opportunityAreas.timelineAcceleration.confidenceLevel}% confidence level
                    </p>
                  </div>

                  <div className="border-t pt-4">
                    <div className="flex items-center">
                      <h3 className="font-medium text-sm mb-2">Key Acceleration Areas:</h3>
                      <HoverCard>
                        <HoverCardTrigger asChild>
                          <Info className="h-3.5 w-3.5 ml-1.5 text-slate-400 cursor-help" />
                        </HoverCardTrigger>
                        <HoverCardContent className="w-80">
                          <div className="space-y-2">
                            <p className="text-sm">
                              These are specific areas where time savings can be achieved based on
                              CSR analysis. Each represents a strategic optimization point in the
                              trial planning and execution process with quantified potential time
                              reduction.
                            </p>
                          </div>
                        </HoverCardContent>
                      </HoverCard>
                    </div>
                    <ul className="space-y-2">
                      {opportunityAreas.timelineAcceleration.accelerationAreas.map((area, idx) => (
                        <li key={idx} className="flex items-center text-sm">
                          <ArrowUpRight className="h-4 w-4 text-green-500 mr-2" />
                          {area}
                        </li>
                      ))}
                    </ul>
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

export default LumenBioPerformanceMetrics;
