/**
 * Outcome-Based Template Learning Component
 * 
 * Tracks which templates reduce agency questions over time,
 * improving recommendations based on real-world outcomes.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Award, BarChart3, BookOpen, CheckCircle, Clock,
  FileText, Filter, Lightbulb, RefreshCw, Search,
  Star, TrendingDown, TrendingUp, Trophy, Zap,
  ThumbsUp, MessageSquare, AlertCircle
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface LearningTemplate {
  id: string;
  templateCode: string;
  templateName: string;
  description?: string;
  templateType: 'section' | 'document' | 'response' | 'form';
  submissionType?: string;
  modulePath?: string;
  usageCount: number;
  approvalRate?: number;
  avgReviewDays?: number;
  avgQuestionsReceived?: number;
  effectivenessScore?: number;
  isRecommended: boolean;
  status: 'active' | 'deprecated' | 'archived';
}

interface TemplateRecommendation {
  template: LearningTemplate;
  relevanceScore: number;
  effectivenessScore: number;
  combinedScore: number;
  reason: string;
}

interface EffectivenessReport {
  templateId: string;
  templateName: string;
  totalUsage: number;
  outcomes: {
    approved: number;
    approvedWithConditions: number;
    refuseToFile: number;
    completeResponse: number;
  };
  metrics: {
    approvalRate: number;
    avgReviewDays: number;
    avgQuestions: number;
    avgDeficiencies: number;
  };
  trend: 'improving' | 'stable' | 'declining';
  recommendations: string[];
}

export function OutcomeBasedTemplateLearning({ programId }: { programId?: string }) {
  const { toast } = useToast();
  const [templates, setTemplates] = useState<LearningTemplate[]>([]);
  const [recommendations, setRecommendations] = useState<TemplateRecommendation[]>([]);
  const [topPerforming, setTopPerforming] = useState<LearningTemplate[]>([]);
  const [selectedTemplate, setSelectedTemplate] = useState<LearningTemplate | null>(null);
  const [effectivenessReport, setEffectivenessReport] = useState<EffectivenessReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('recommended');
  const [searchTerm, setSearchTerm] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [submissionType, setSubmissionType] = useState<string>('NDA');

  // Load data
  useEffect(() => {
    loadData();
  }, [submissionType]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [templatesRes, recsRes, topRes] = await Promise.all([
        fetch(`/api/innovation/templates?submissionType=${submissionType}`),
        fetch(`/api/innovation/templates/recommendations?submissionType=${submissionType}`),
        fetch(`/api/innovation/templates/top-performing?submissionType=${submissionType}&limit=5`)
      ]);

      if (templatesRes.ok) {
        const data = await templatesRes.json();
        setTemplates(data.data || []);
      }
      if (recsRes.ok) {
        const data = await recsRes.json();
        setRecommendations(data.data || []);
      }
      if (topRes.ok) {
        const data = await topRes.json();
        setTopPerforming(data.data || []);
      }
    } catch (error) {
      console.error('Error loading template data:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadEffectivenessReport = async (templateId: string) => {
    try {
      const response = await fetch(`/api/innovation/templates/${templateId}/effectiveness`);
      if (response.ok) {
        const data = await response.json();
        setEffectivenessReport(data.data);
      }
    } catch (error) {
      console.error('Error loading effectiveness report:', error);
    }
  };

  const recordUsage = async (templateId: string) => {
    try {
      await fetch('/api/innovation/templates/usage', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          templateId,
          programId,
          usageType: 'direct',
          usedBy: 'user'
        })
      });
      toast({
        title: 'Template Used',
        description: 'Usage recorded for learning'
      });
    } catch (error) {
      console.error('Error recording usage:', error);
    }
  };

  // Filter templates
  const filteredTemplates = useMemo(() => {
    return templates.filter(t => {
      if (searchTerm && !t.templateName.toLowerCase().includes(searchTerm.toLowerCase())) {
        return false;
      }
      if (typeFilter !== 'all' && t.templateType !== typeFilter) {
        return false;
      }
      return true;
    });
  }, [templates, searchTerm, typeFilter]);

  const getScoreColor = (score?: number) => {
    if (!score) return 'text-muted-foreground';
    if (score >= 80) return 'text-green-500';
    if (score >= 60) return 'text-yellow-500';
    return 'text-orange-500';
  };

  const getTrendIcon = (trend?: string) => {
    if (trend === 'improving') return <TrendingUp className="h-4 w-4 text-green-500" />;
    if (trend === 'declining') return <TrendingDown className="h-4 w-4 text-red-500" />;
    return null;
  };

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
          <div className="p-2 rounded-lg bg-gradient-to-br from-yellow-500/10 to-orange-500/10">
            <Lightbulb className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Template Learning</h2>
            <p className="text-muted-foreground">
              AI-powered recommendations based on submission outcomes
            </p>
          </div>
        </div>
        <Select value={submissionType} onValueChange={setSubmissionType}>
          <SelectTrigger className="w-[150px]">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="NDA">NDA</SelectItem>
            <SelectItem value="BLA">BLA</SelectItem>
            <SelectItem value="510k">510(k)</SelectItem>
            <SelectItem value="PMA">PMA</SelectItem>
            <SelectItem value="IND">IND</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Top Performers */}
      {topPerforming.length > 0 && (
        <div className="grid grid-cols-5 gap-4">
          {topPerforming.map((template, idx) => (
            <Card
              key={template.id}
              className="cursor-pointer hover:shadow-md transition-shadow"
              onClick={() => {
                setSelectedTemplate(template);
                loadEffectivenessReport(template.id);
              }}
            >
              <CardContent className="pt-4">
                <div className="flex items-start gap-2 mb-2">
                  {idx === 0 && <Trophy className="h-5 w-5 text-yellow-500" />}
                  {idx === 1 && <Award className="h-5 w-5 text-gray-400" />}
                  {idx === 2 && <Award className="h-5 w-5 text-amber-600" />}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{template.templateName}</p>
                    <p className="text-xs text-muted-foreground">{template.templateType}</p>
                  </div>
                </div>
                <div className="flex items-center justify-between mt-2">
                  <span className={`text-lg font-bold ${getScoreColor(template.effectivenessScore)}`}>
                    {template.effectivenessScore?.toFixed(0) || '—'}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {template.usageCount} uses
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="recommended">
            <Star className="h-4 w-4 mr-2" />
            Recommended
          </TabsTrigger>
          <TabsTrigger value="all">
            <BookOpen className="h-4 w-4 mr-2" />
            All Templates
          </TabsTrigger>
          <TabsTrigger value="analytics">
            <BarChart3 className="h-4 w-4 mr-2" />
            Analytics
          </TabsTrigger>
        </TabsList>

        <TabsContent value="recommended" className="space-y-4">
          {recommendations.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Lightbulb className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-lg font-medium">Building Recommendations</p>
                <p className="text-muted-foreground">
                  Use more templates to receive personalized recommendations
                </p>
              </CardContent>
            </Card>
          ) : (
            recommendations.map((rec) => (
              <Card key={rec.template.id} className="overflow-hidden">
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4">
                    <div className="flex-shrink-0 w-16 h-16 rounded-lg bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center">
                      <span className={`text-2xl font-bold ${getScoreColor(rec.combinedScore * 100)}`}>
                        {(rec.combinedScore * 100).toFixed(0)}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <h4 className="font-semibold">{rec.template.templateName}</h4>
                        {rec.template.isRecommended && (
                          <Badge variant="default" className="bg-green-500">
                            <Star className="h-3 w-3 mr-1" />
                            Recommended
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground mb-2">
                        {rec.template.description || rec.reason}
                      </p>
                      <div className="flex items-center gap-6 text-sm">
                        <div className="flex items-center gap-1">
                          <CheckCircle className="h-4 w-4 text-green-500" />
                          <span>{((rec.template.approvalRate || 0) * 100).toFixed(0)}% approval</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <Clock className="h-4 w-4 text-blue-500" />
                          <span>{rec.template.avgReviewDays?.toFixed(0) || '—'} days avg</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <MessageSquare className="h-4 w-4 text-orange-500" />
                          <span>{rec.template.avgQuestionsReceived?.toFixed(1) || '—'} questions avg</span>
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2">
                      <Button size="sm" onClick={() => recordUsage(rec.template.id)}>
                        <Zap className="h-3 w-3 mr-1" />
                        Use Template
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setSelectedTemplate(rec.template);
                          loadEffectivenessReport(rec.template.id);
                        }}
                      >
                        View Details
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        <TabsContent value="all" className="space-y-4">
          {/* Filters */}
          <div className="flex items-center gap-4">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search templates..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Types</SelectItem>
                <SelectItem value="section">Section</SelectItem>
                <SelectItem value="document">Document</SelectItem>
                <SelectItem value="response">Response</SelectItem>
                <SelectItem value="form">Form</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Template List */}
          <div className="grid grid-cols-2 gap-4">
            {filteredTemplates.map((template) => (
              <Card
                key={template.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => {
                  setSelectedTemplate(template);
                  loadEffectivenessReport(template.id);
                }}
              >
                <CardContent className="pt-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <h4 className="font-medium">{template.templateName}</h4>
                        {template.isRecommended && (
                          <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" />
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {template.templateCode}
                      </p>
                    </div>
                    <Badge variant="outline">{template.templateType}</Badge>
                  </div>
                  {template.effectivenessScore && (
                    <div className="mt-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-muted-foreground">Effectiveness</span>
                        <span className={`font-medium ${getScoreColor(template.effectivenessScore)}`}>
                          {template.effectivenessScore.toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={template.effectivenessScore} className="h-2" />
                    </div>
                  )}
                  <div className="flex items-center justify-between mt-3 text-sm text-muted-foreground">
                    <span>{template.usageCount} uses</span>
                    <span>{template.modulePath || 'General'}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="analytics">
          {selectedTemplate && effectivenessReport ? (
            <div className="grid grid-cols-12 gap-6">
              {/* Main Stats */}
              <Card className="col-span-8">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle>{effectivenessReport.templateName}</CardTitle>
                      <CardDescription>Effectiveness Report</CardDescription>
                    </div>
                    {getTrendIcon(effectivenessReport.trend)}
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-4 gap-4 mb-6">
                    <div className="text-center p-4 rounded-lg bg-green-500/10">
                      <CheckCircle className="h-6 w-6 mx-auto mb-2 text-green-500" />
                      <p className="text-2xl font-bold text-green-600">
                        {(effectivenessReport.metrics.approvalRate * 100).toFixed(0)}%
                      </p>
                      <p className="text-sm text-muted-foreground">Approval Rate</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-blue-500/10">
                      <Clock className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                      <p className="text-2xl font-bold text-blue-600">
                        {effectivenessReport.metrics.avgReviewDays.toFixed(0)}
                      </p>
                      <p className="text-sm text-muted-foreground">Avg Review Days</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-orange-500/10">
                      <MessageSquare className="h-6 w-6 mx-auto mb-2 text-orange-500" />
                      <p className="text-2xl font-bold text-orange-600">
                        {effectivenessReport.metrics.avgQuestions.toFixed(1)}
                      </p>
                      <p className="text-sm text-muted-foreground">Avg Questions</p>
                    </div>
                    <div className="text-center p-4 rounded-lg bg-red-500/10">
                      <AlertCircle className="h-6 w-6 mx-auto mb-2 text-red-500" />
                      <p className="text-2xl font-bold text-red-600">
                        {effectivenessReport.metrics.avgDeficiencies.toFixed(1)}
                      </p>
                      <p className="text-sm text-muted-foreground">Avg Deficiencies</p>
                    </div>
                  </div>

                  {/* Outcome Breakdown */}
                  <div className="space-y-3">
                    <h4 className="font-medium">Outcome Distribution</h4>
                    <div className="space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="w-40 text-sm">Approved</span>
                        <Progress
                          value={(effectivenessReport.outcomes.approved / effectivenessReport.totalUsage) * 100}
                          className="h-3 flex-1"
                        />
                        <span className="w-12 text-sm text-right">{effectivenessReport.outcomes.approved}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-40 text-sm">Approved w/ Conditions</span>
                        <Progress
                          value={(effectivenessReport.outcomes.approvedWithConditions / effectivenessReport.totalUsage) * 100}
                          className="h-3 flex-1"
                        />
                        <span className="w-12 text-sm text-right">{effectivenessReport.outcomes.approvedWithConditions}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-40 text-sm">Refuse to File</span>
                        <Progress
                          value={(effectivenessReport.outcomes.refuseToFile / effectivenessReport.totalUsage) * 100}
                          className="h-3 flex-1"
                        />
                        <span className="w-12 text-sm text-right">{effectivenessReport.outcomes.refuseToFile}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="w-40 text-sm">Complete Response</span>
                        <Progress
                          value={(effectivenessReport.outcomes.completeResponse / effectivenessReport.totalUsage) * 100}
                          className="h-3 flex-1"
                        />
                        <span className="w-12 text-sm text-right">{effectivenessReport.outcomes.completeResponse}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recommendations */}
              <Card className="col-span-4">
                <CardHeader>
                  <CardTitle className="text-base">Improvement Suggestions</CardTitle>
                </CardHeader>
                <CardContent>
                  {effectivenessReport.recommendations.length === 0 ? (
                    <div className="text-center py-8">
                      <ThumbsUp className="h-8 w-8 mx-auto text-green-500 mb-2" />
                      <p className="text-sm text-muted-foreground">
                        This template is performing well!
                      </p>
                    </div>
                  ) : (
                    <ul className="space-y-3">
                      {effectivenessReport.recommendations.map((rec, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <Lightbulb className="h-4 w-4 mt-0.5 text-yellow-500" />
                          <span className="text-sm">{rec}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </div>
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <BarChart3 className="h-12 w-12 text-muted-foreground/20 mb-4" />
                <p className="text-lg font-medium">Select a Template</p>
                <p className="text-muted-foreground">
                  Choose a template to view its effectiveness analytics
                </p>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default OutcomeBasedTemplateLearning;
