import React from 'react';
import { Button } from '@/components/ui/button';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Loader2, AlertCircle, Check, X, ArrowRight } from 'lucide-react'

/**
 * DocumentGapAnalysis Component
 *
 * This component displays a gap analysis for the document content,
 * showing missing sections and content completeness.
 *
 * @param {Object} props - Component props
 * @param {boolean} props.isLoading - Whether the analysis is loading
 * @param {Object} props.gapAnalysis - The gap analysis data
 * @param {Function} props.onSectionSelect - Callback when a section is selected
 * @param {Function} props.onRefresh - Callback to refresh the analysis
 */
export const DocumentGapAnalysis = ({
  isLoading = false,
  gapAnalysis,
  onSectionSelect,
  onRefresh,
}) => {
  // Handle section selection
  const handleSectionSelect = section => {
    if (onSectionSelect) {
      onSectionSelect(section);
    }
  };

  // Calculate overall document completeness percentage
  const calculateOverallCompleteness = analysis => {
    if (!analysis || !analysis.sections || analysis.sections.length === 0) {
      return 0;
    }

    const totalSections = analysis.sections.length;
    const completedSections = analysis.sections.filter(s => s.completeness >= 90).length;
    const partialSections = analysis.sections.filter(
      s => s.completeness > 0 && s.completeness < 90
    ).length;

    // Weight completed sections as 1, partial as 0.5
    return Math.round(((completedSections + partialSections * 0.5) / totalSections) * 100);
  };

  // Get color class based on completeness percentage
  const getCompletenessColorClass = percentage => {
    if (percentage >= 90) return 'bg-green-500';
    if (percentage >= 60) return 'bg-yellow-500';
    if (percentage >= 30) return 'bg-orange-500';
    return 'bg-red-500';
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="flex justify-center items-center p-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // No analysis data
  if (!gapAnalysis) {
    return (
      <div className="text-center p-6">
        <p>
          No gap analysis available. Generate an analysis to review your document's completeness.
        </p>
        <Button variant="outline" className="mt-4" onClick={onRefresh}>
          Generate Analysis
        </Button>
      </div>
    );
  }

  const overallCompleteness = calculateOverallCompleteness(gapAnalysis);

  return (
    <div className="space-y-6">
      {/* Overall Completeness Card */}
      <Card>
        <CardHeader>
          <CardTitle>Document Completeness</CardTitle>
          <CardDescription>
            Overall assessment of your document's completeness based on regulatory requirements
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between mb-2">
                <span>Overall Completeness</span>
                <span className="font-medium">{overallCompleteness}%</span>
              </div>
              <Progress
                value={overallCompleteness}
                className={getCompletenessColorClass(overallCompleteness)}
              />
            </div>

            <div className="flex flex-wrap gap-3 mt-4">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-green-500"></div>
                <span className="text-sm">Complete</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
                <span className="text-sm">Partial</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-orange-500"></div>
                <span className="text-sm">Minimal</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-full bg-red-500"></div>
                <span className="text-sm">Missing</span>
              </div>
            </div>

            {gapAnalysis.feedback && (
              <div className="mt-4 p-3 bg-muted rounded-md">
                <p className="text-sm">{gapAnalysis.feedback}</p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Section Gaps Card */}
      <Card>
        <CardHeader>
          <CardTitle>Section Analysis</CardTitle>
          <CardDescription>
            Detailed analysis of each document section's completeness
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {gapAnalysis.sections
                .sort((a, b) => {
                  // Sort by priority first (high > medium > low)
                  const priorityOrder = { high: 0, medium: 1, low: 2 };
                  const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
                  if (priorityDiff !== 0) return priorityDiff;

                  // Then sort by completeness (lowest first)
                  return a.completeness - b.completeness;
                })
                .map((section, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                    onClick={() => handleSectionSelect(section)}
                  >
                    <div className="flex justify-between mb-2">
                      <div className="flex gap-2 items-center">
                        <h3 className="font-medium">{section.title}</h3>
                        {section.priority === 'high' && <Badge>Required</Badge>}
                      </div>
                      <div className="flex items-center">
                        {section.completeness >= 90 ? (
                          <Check className="h-5 w-5 text-green-500" />
                        ) : section.completeness === 0 ? (
                          <X className="h-5 w-5 text-red-500" />
                        ) : (
                          <AlertCircle className="h-5 w-5 text-yellow-500" />
                        )}
                        <span className="ml-2 font-medium">{section.completeness}%</span>
                      </div>
                    </div>

                    <Progress
                      value={section.completeness}
                      className={getCompletenessColorClass(section.completeness)}
                    />

                    <div className="mt-3 text-sm text-muted-foreground">
                      {section.completeness === 0 ? (
                        <div className="flex items-center text-red-600">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          <span>
                            Section is missing. Consider adding this section to your document.
                          </span>
                        </div>
                      ) : section.completeness < 50 ? (
                        <div className="flex items-center text-orange-600">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          <span>Section needs significant improvement.</span>
                        </div>
                      ) : section.completeness < 90 ? (
                        <div className="flex items-center text-yellow-600">
                          <AlertCircle className="h-4 w-4 mr-1" />
                          <span>Section needs some improvement.</span>
                        </div>
                      ) : (
                        <div className="flex items-center text-green-600">
                          <Check className="h-4 w-4 mr-1" />
                          <span>Section is complete.</span>
                        </div>
                      )}
                    </div>

                    {section.gaps && section.gaps.length > 0 && (
                      <div className="mt-3">
                        <p className="text-sm font-medium mb-2">Key Gaps:</p>
                        <ul className="text-sm space-y-1">
                          {section.gaps.map((gap, gapIndex) => (
                            <li key={gapIndex} className="flex items-start">
                              <ArrowRight className="h-4 w-4 mr-1 mt-1 flex-shrink-0" />
                              <span>{gap}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <div className="mt-3 text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={e => {
                          e.stopPropagation();
                          handleSectionSelect(section);
                        }}
                      >
                        Fix Section <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
            </div>
          </ScrollArea>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="text-sm text-muted-foreground">
            {gapAnalysis.sections.filter(s => s.completeness >= 90).length} of{' '}
            {gapAnalysis.sections.length} sections complete
          </div>
          <Button variant="outline" onClick={onRefresh}>
            Refresh Analysis
          </Button>
        </CardFooter>
      </Card>

      {/* Recommendations Card */}
      {gapAnalysis.recommendations && gapAnalysis.recommendations.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Recommendations</CardTitle>
            <CardDescription>
              Suggestions to improve your document's completeness and quality
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              {gapAnalysis.recommendations.map((recommendation, index) => (
                <li key={index} className="flex items-start">
                  <div className="bg-primary/10 p-1 rounded-full mr-2 mt-0.5">
                    <AlertCircle className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p>{recommendation.text}</p>
                    {recommendation.priority === 'high' && (
                      <Badge variant="default" className="mt-1">
                        High Priority
                      </Badge>
                    )}
                    {recommendation.priority === 'medium' && (
                      <Badge variant="secondary" className="mt-1">
                        Medium Priority
                      </Badge>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default DocumentGapAnalysis;
