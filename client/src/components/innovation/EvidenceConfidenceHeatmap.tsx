/**
 * Evidence Confidence Heatmap Component
 * 
 * Live scoring showing which document sections have weak citations,
 * sparse references, or unsupported claims.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Activity, AlertTriangle, CheckCircle, FileText, Grid3X3,
  Info, RefreshCw, TrendingDown, TrendingUp, Zap, BookOpen,
  Link2, Clock, Award, BarChart3
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

// Types
interface SectionAssessment {
  sectionPath: string;
  sectionTitle: string;
  overallScore: number;
  citationDensityScore: number;
  citationQualityScore: number;
  recencyScore: number;
  authorityScore: number;
  consistencyScore: number;
  claimCount: number;
  citationCount: number;
  unsupportedClaims: number;
}

interface EvidenceGap {
  id: string;
  sectionPath: string;
  gapType: 'missing_citation' | 'weak_evidence' | 'outdated_reference' | 'conflicting_sources' | 'unsupported_claim';
  severity: 'high' | 'medium' | 'low';
  description: string;
  claimText?: string;
  suggestedAction?: string;
  status: 'open' | 'addressed' | 'accepted';
}

interface HeatmapCell {
  section: string;
  score: number;
  level: 'strong' | 'adequate' | 'weak' | 'critical';
}

interface Assessment {
  id: string;
  documentId: string;
  overallScore: number;
  totalSections: number;
  strongSections: number;
  weakSections: number;
  criticalSections: number;
  totalClaims: number;
  supportedClaims: number;
  completedAt: string;
}

export function EvidenceConfidenceHeatmap({ documentId, programId }: { documentId: string; programId: string }) {
  const { toast } = useToast();
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [sections, setSections] = useState<SectionAssessment[]>([]);
  const [gaps, setGaps] = useState<EvidenceGap[]>([]);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [viewMode, setViewMode] = useState<'heatmap' | 'list' | 'gaps'>('heatmap');
  const [sortBy, setSortBy] = useState<'path' | 'score'>('path');

  // Load data
  useEffect(() => {
    if (documentId) {
      loadAssessment();
    }
  }, [documentId]);

  const loadAssessment = async () => {
    setLoading(true);
    try {
      // Check for existing assessment
      const response = await fetch(`/api/innovation/evidence-heatmap/assessment/latest?documentId=${documentId}`);
      if (response.ok) {
        const data = await response.json();
        if (data.data) {
          setAssessment(data.data.assessment);
          setSections(data.data.sections || []);
          setGaps(data.data.gaps || []);
        }
      }
    } catch (error) {
      console.error('Error loading assessment:', error);
    } finally {
      setLoading(false);
    }
  };

  const runAssessment = async () => {
    setAnalyzing(true);
    try {
      const response = await fetch('/api/innovation/evidence-heatmap/assess', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId, programId })
      });

      if (response.ok) {
        const data = await response.json();
        setAssessment(data.data.assessment);
        setSections(data.data.sections || []);
        
        // Load gaps
        const gapsResponse = await fetch(`/api/innovation/evidence-heatmap/gaps/${data.data.assessment.id}`);
        if (gapsResponse.ok) {
          const gapsData = await gapsResponse.json();
          setGaps(gapsData.data || []);
        }

        toast({
          title: 'Assessment Complete',
          description: `Analyzed ${data.data.sections?.length || 0} sections`
        });
      }
    } catch (error) {
      toast({
        title: 'Error',
        description: 'Failed to run evidence assessment',
        variant: 'destructive'
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Sort sections
  const sortedSections = useMemo(() => {
    return [...sections].sort((a, b) => {
      if (sortBy === 'score') {
        return a.overallScore - b.overallScore;
      }
      return a.sectionPath.localeCompare(b.sectionPath);
    });
  }, [sections, sortBy]);

  // Generate heatmap data
  const heatmapData = useMemo(() => {
    return sections.map(s => ({
      section: s.sectionTitle,
      score: s.overallScore,
      level: s.overallScore >= 80 ? 'strong' :
             s.overallScore >= 60 ? 'adequate' :
             s.overallScore >= 40 ? 'weak' : 'critical'
    }));
  }, [sections]);

  const getScoreColor = (score: number) => {
    if (score >= 80) return 'bg-green-500';
    if (score >= 60) return 'bg-yellow-500';
    if (score >= 40) return 'bg-orange-500';
    return 'bg-red-500';
  };

  const getScoreBgColor = (score: number) => {
    if (score >= 80) return 'bg-green-500/10';
    if (score >= 60) return 'bg-yellow-500/10';
    if (score >= 40) return 'bg-orange-500/10';
    return 'bg-red-500/10';
  };

  const getGapSeverityColor = (severity: string) => {
    switch (severity) {
      case 'high': return 'destructive';
      case 'medium': return 'warning';
      case 'low': return 'secondary';
      default: return 'default';
    }
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
          <div className="p-2 rounded-lg bg-gradient-to-br from-blue-500/10 to-purple-500/10">
            <Grid3X3 className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-2xl font-bold">Evidence Confidence Heatmap</h2>
            <p className="text-muted-foreground">
              Live scoring of citation quality and evidence support
            </p>
          </div>
        </div>
        <Button onClick={runAssessment} disabled={analyzing}>
          {analyzing ? (
            <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <Zap className="h-4 w-4 mr-2" />
          )}
          Analyze Document
        </Button>
      </div>

      {/* Summary Cards */}
      {assessment && (
        <div className="grid grid-cols-5 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-center">
                <div className={`inline-flex items-center justify-center w-16 h-16 rounded-full ${getScoreBgColor(assessment.overallScore)} mb-2`}>
                  <span className="text-2xl font-bold">{assessment.overallScore}</span>
                </div>
                <p className="text-sm text-muted-foreground">Overall Score</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <CheckCircle className="h-5 w-5 text-green-500" />
                <span className="text-2xl font-bold">{assessment.strongSections}</span>
              </div>
              <p className="text-sm text-muted-foreground">Strong Sections</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <AlertTriangle className="h-5 w-5 text-orange-500" />
                <span className="text-2xl font-bold">{assessment.weakSections}</span>
              </div>
              <p className="text-sm text-muted-foreground">Weak Sections</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <AlertTriangle className="h-5 w-5 text-red-500" />
                <span className="text-2xl font-bold">{assessment.criticalSections}</span>
              </div>
              <p className="text-sm text-muted-foreground">Critical Sections</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6 text-center">
              <div className="flex items-center justify-center gap-2 mb-1">
                <BookOpen className="h-5 w-5 text-blue-500" />
                <span className="text-2xl font-bold">
                  {assessment.supportedClaims}/{assessment.totalClaims}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">Claims Supported</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* View Controls */}
      <div className="flex items-center justify-between">
        <Tabs value={viewMode} onValueChange={(v) => setViewMode(v as any)}>
          <TabsList>
            <TabsTrigger value="heatmap">
              <Grid3X3 className="h-4 w-4 mr-2" />
              Heatmap
            </TabsTrigger>
            <TabsTrigger value="list">
              <BarChart3 className="h-4 w-4 mr-2" />
              Details
            </TabsTrigger>
            <TabsTrigger value="gaps">
              <AlertTriangle className="h-4 w-4 mr-2" />
              Gaps ({gaps.length})
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {viewMode === 'list' && (
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="w-[150px]">
              <SelectValue placeholder="Sort by" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="path">By Section</SelectItem>
              <SelectItem value="score">By Score</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Main Content */}
      {viewMode === 'heatmap' && (
        <Card>
          <CardContent className="pt-6">
            {heatmapData.length === 0 ? (
              <div className="text-center py-12">
                <Grid3X3 className="h-12 w-12 mx-auto text-muted-foreground/20 mb-4" />
                <p className="text-muted-foreground">
                  Run an assessment to generate the heatmap
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-2">
                <TooltipProvider>
                  {heatmapData.map((cell, idx) => (
                    <Tooltip key={idx}>
                      <TooltipTrigger asChild>
                        <div
                          className={`p-4 rounded-lg cursor-pointer transition-all hover:scale-105 ${getScoreBgColor(cell.score)}`}
                        >
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-medium truncate">{cell.section}</span>
                            <span className="text-lg font-bold">{cell.score}</span>
                          </div>
                          <Progress value={cell.score} className="h-1" />
                        </div>
                      </TooltipTrigger>
                      <TooltipContent>
                        <p>{cell.section}</p>
                        <p className="text-muted-foreground">Score: {cell.score}/100</p>
                        <p className="text-muted-foreground">Level: {cell.level}</p>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                </TooltipProvider>
              </div>
            )}

            {/* Legend */}
            <div className="flex items-center justify-center gap-6 mt-6 pt-6 border-t">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-green-500" />
                <span className="text-sm">Strong (80+)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-yellow-500" />
                <span className="text-sm">Adequate (60-79)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-orange-500" />
                <span className="text-sm">Weak (40-59)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-red-500" />
                <span className="text-sm">Critical (&lt;40)</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {viewMode === 'list' && (
        <div className="space-y-3">
          {sortedSections.map((section) => (
            <Card key={section.sectionPath} className="overflow-hidden">
              <CardContent className="pt-4">
                <div className="flex items-start gap-4">
                  <div className={`flex-shrink-0 w-14 h-14 rounded-lg flex items-center justify-center ${getScoreBgColor(section.overallScore)}`}>
                    <span className="text-xl font-bold">{section.overallScore}</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <h4 className="font-medium">{section.sectionTitle}</h4>
                      <span className="text-sm text-muted-foreground">({section.sectionPath})</span>
                    </div>
                    <div className="grid grid-cols-5 gap-4 mt-3">
                      <div className="flex items-center gap-2">
                        <Link2 className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Citations</p>
                          <p className="font-medium">{section.citationCount}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <BookOpen className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Claims</p>
                          <p className="font-medium">{section.claimCount}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Award className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Quality</p>
                          <p className="font-medium">{section.citationQualityScore}%</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Clock className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Recency</p>
                          <p className="font-medium">{section.recencyScore}%</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Activity className="h-4 w-4 text-muted-foreground" />
                        <div>
                          <p className="text-xs text-muted-foreground">Consistency</p>
                          <p className="font-medium">{section.consistencyScore}%</p>
                        </div>
                      </div>
                    </div>
                    {section.unsupportedClaims > 0 && (
                      <div className="flex items-center gap-2 mt-3 text-orange-600">
                        <AlertTriangle className="h-4 w-4" />
                        <span className="text-sm">
                          {section.unsupportedClaims} unsupported claim{section.unsupportedClaims !== 1 ? 's' : ''}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {viewMode === 'gaps' && (
        <div className="space-y-3">
          {gaps.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <CheckCircle className="h-12 w-12 text-green-500 mb-4" />
                <p className="text-lg font-medium">No Evidence Gaps Found</p>
                <p className="text-muted-foreground">
                  All claims are well-supported with citations
                </p>
              </CardContent>
            </Card>
          ) : (
            gaps.map((gap) => (
              <Card key={gap.id}>
                <CardContent className="pt-4">
                  <div className="flex items-start gap-4">
                    <div className={`p-2 rounded-lg ${
                      gap.severity === 'high' ? 'bg-red-500/10' :
                      gap.severity === 'medium' ? 'bg-orange-500/10' :
                      'bg-yellow-500/10'
                    }`}>
                      <AlertTriangle className={`h-4 w-4 ${
                        gap.severity === 'high' ? 'text-red-500' :
                        gap.severity === 'medium' ? 'text-orange-500' :
                        'text-yellow-500'
                      }`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge variant={getGapSeverityColor(gap.severity) as any}>
                          {gap.severity}
                        </Badge>
                        <Badge variant="outline">
                          {gap.gapType.replace(/_/g, ' ')}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {gap.sectionPath}
                        </span>
                      </div>
                      <p className="font-medium">{gap.description}</p>
                      {gap.claimText && (
                        <blockquote className="mt-2 pl-4 border-l-2 text-sm text-muted-foreground italic">
                          "{gap.claimText}"
                        </blockquote>
                      )}
                      {gap.suggestedAction && (
                        <div className="mt-3 p-3 bg-blue-500/10 rounded-lg">
                          <p className="text-sm font-medium text-blue-700 dark:text-blue-300">
                            Suggested Action:
                          </p>
                          <p className="text-sm">{gap.suggestedAction}</p>
                        </div>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      )}
    </div>
  );
}

export default EvidenceConfidenceHeatmap;
