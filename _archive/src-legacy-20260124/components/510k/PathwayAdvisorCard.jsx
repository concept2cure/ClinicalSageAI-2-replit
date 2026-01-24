import React, { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import {
  Loader2,
  CheckCircle,
  AlertTriangle,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Clock,
  FileBarChart,
  Clock3,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { useTenant } from '@/contexts/TenantContext.tsx';
import { useToast } from '@/hooks/use-toast';
import FDA510kService from '../../services/FDA510kService';

/**
 * Regulatory Pathway Advisor Card Component
 *
 * This component presents AI-powered regulatory pathway recommendations for a 510(k) submission
 * based on the provided device profile. It displays the recommended pathway (Traditional, Abbreviated,
 * or Special 510(k)), along with rationale, timelines, and requirements.
 *
 * @param {Object} props Component properties
 * @param {string} props.projectId The ID of the current 510(k) project
 * @param {Function} props.onConfirm Callback when a pathway is confirmed, receives pathway as parameter
 */
const PathwayAdvisorCard = ({ projectId, onConfirm }) => {
  const [loading, setLoading] = useState(false);
  const [recommendation, setRecommendation] = useState(null);
  const [error, setError] = useState(null);
  const [selectedPathway, setSelectedPathway] = useState(null);
  const [comparisonData, setComparisonData] = useState(null);
  const [successMetrics, setSuccessMetrics] = useState(null);
  const [timelineData, setTimelineData] = useState(null);
  const [showComparison, setShowComparison] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const { toast } = useToast();
  const { tenantId } = useTenant();

  useEffect(() => {
    if (projectId) {
      fetchRecommendation();
    }
  }, [projectId]);

  useEffect(() => {
    if (recommendation && recommendation.recommendedPathway) {
      fetchComparisonData();
    }
  }, [recommendation]);

  const fetchRecommendation = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await FDA510kService.getPathwayRecommendation(projectId);
      setRecommendation(response);
      setSelectedPathway(response.recommendedPathway);
    } catch (err) {
      console.error('Error fetching pathway recommendation:', err);
      setError('Unable to generate pathway recommendation. Please try again later.');
    } finally {
      setLoading(false);
    }
  };

  const fetchComparisonData = async () => {
    try {
      // Get comparison data for different regulatory pathways
      const comparison = await FDA510kService.getPathwayComparisonData();
      if (comparison) {
        setComparisonData(comparison);
      }

      // If we have a recommendation, get detailed timeline for it
      if (recommendation && recommendation.recommendedPathway) {
        try {
          const deviceType = 'Generic Medical Device'; // This would come from your device profile
          const timeline = await FDA510kService.getPathwayTimeline(
            recommendation.recommendedPathway,
            deviceType
          );
          if (timeline) {
            setTimelineData(timeline);
          }
        } catch (timelineErr) {
          console.error('Error fetching timeline data:', timelineErr);
        }

        try {
          // Get success metrics for this device type and class
          const deviceClass = 'II'; // This would come from your device profile
          const metrics = await FDA510kService.getPathwaySuccessMetrics(deviceType, deviceClass);
          if (metrics) {
            setSuccessMetrics(metrics);
          }
        } catch (metricsErr) {
          console.error('Error fetching success metrics:', metricsErr);
        }
      }
    } catch (err) {
      console.error('Error fetching comparison data:', err);
      // We don't set the main error state here since this is supplementary data
      toast({
        title: 'Warning',
        description: 'Additional pathway comparison data could not be loaded.',
        variant: 'warning',
      });
    }
  };

  const handleConfirmPathway = () => {
    if (selectedPathway && onConfirm) {
      onConfirm(selectedPathway);
      toast({
        title: 'Pathway confirmed',
        description: `${selectedPathway} selected as your submission pathway.`,
      });
    }
  };

  const getConfidenceBadge = score => {
    if (score >= 0.8) {
      return <Badge className="bg-green-600">High Confidence</Badge>;
    } else if (score >= 0.5) {
      return <Badge className="bg-yellow-600">Medium Confidence</Badge>;
    } else {
      return <Badge className="bg-red-600">Low Confidence</Badge>;
    }
  };

  const getTimelineEstimate = days => {
    if (days <= 60) {
      return <Badge className="bg-green-600">{days} days (Fast)</Badge>;
    } else if (days <= 120) {
      return <Badge className="bg-yellow-600">{days} days (Standard)</Badge>;
    } else {
      return <Badge className="bg-red-600">{days} days (Extended)</Badge>;
    }
  };

  if (loading) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Regulatory Pathway Advisor</CardTitle>
          <CardDescription>
            Analyzing your device profile to determine the optimal regulatory pathway
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center justify-center py-8">
          <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
          <p className="text-center text-muted-foreground">
            Analyzing device attributes and regulatory requirements...
          </p>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Regulatory Pathway Advisor</CardTitle>
          <CardDescription>There was an issue determining your regulatory pathway</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
          <div className="mt-4 flex justify-center">
            <Button onClick={fetchRecommendation}>Retry Analysis</Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!recommendation) {
    return (
      <Card className="w-full">
        <CardHeader>
          <CardTitle>Regulatory Pathway Advisor</CardTitle>
          <CardDescription>
            Complete your device profile to receive pathway recommendations
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertTitle>No Device Profile Found</AlertTitle>
            <AlertDescription>
              Please complete your device profile with comprehensive technical and intended use
              information to receive accurate regulatory pathway recommendations.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Regulatory Pathway Recommendation</span>
          {getConfidenceBadge(recommendation.confidenceScore)}
        </CardTitle>
        <CardDescription>Based on your device profile and FDA guidelines</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="p-4 border rounded-lg bg-primary/5">
          <h3 className="text-lg font-semibold mb-2 flex items-center">
            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
            Recommended: {recommendation.recommendedPathway}
          </h3>
          <p className="text-muted-foreground">{recommendation.rationale}</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4">
            <div className="p-3 border rounded-md">
              <h4 className="font-medium mb-1">Estimated Timeline</h4>
              <div>{getTimelineEstimate(recommendation.estimatedTimelineInDays)}</div>
            </div>
            <div className="p-3 border rounded-md">
              <h4 className="font-medium mb-1">Submission Complexity</h4>
              <div>
                <Badge
                  className={
                    recommendation.recommendedPathway.includes('Special')
                      ? 'bg-green-600'
                      : recommendation.recommendedPathway.includes('Abbreviated')
                        ? 'bg-yellow-600'
                        : 'bg-orange-600'
                  }
                >
                  {recommendation.recommendedPathway.includes('Special')
                    ? 'Simpler'
                    : recommendation.recommendedPathway.includes('Abbreviated')
                      ? 'Moderate'
                      : 'Complex'}
                </Badge>
              </div>
            </div>
          </div>
        </div>

        {recommendation.alternativePathways && recommendation.alternativePathways.length > 0 && (
          <>
            <Separator />
            <div>
              <h3 className="text-md font-semibold mb-2">Alternative Pathways</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {recommendation.alternativePathways.map((path, index) => (
                  <Button
                    key={index}
                    variant={selectedPathway === path ? 'default' : 'outline'}
                    className="justify-start"
                    onClick={() => setSelectedPathway(path)}
                  >
                    {path}
                    {selectedPathway === path && <CheckCircle className="h-4 w-4 ml-2" />}
                  </Button>
                ))}
              </div>
            </div>
          </>
        )}

        <Separator />

        <div>
          <h3 className="text-md font-semibold mb-2">Key Requirements</h3>
          <ul className="ml-5 list-disc space-y-1">
            {recommendation.requirements.map((req, index) => (
              <li key={index} className="text-muted-foreground">
                {req}
              </li>
            ))}
          </ul>
        </div>

        {/* Pathway Comparison Section */}
        {comparisonData && (
          <>
            <Separator className="my-4" />
            <div>
              <Button
                variant="outline"
                className="flex w-full items-center justify-between py-2"
                onClick={() => setShowComparison(!showComparison)}
              >
                <span className="flex items-center">
                  <FileBarChart className="mr-2 h-4 w-4" />
                  <span>Pathway Comparison Data</span>
                </span>
                {showComparison ? <ChevronUp /> : <ChevronDown />}
              </Button>

              {showComparison && (
                <div className="mt-4 rounded-md border p-4">
                  <Tabs defaultValue="features">
                    <TabsList className="grid w-full grid-cols-3 mb-4">
                      <TabsTrigger value="features">Features</TabsTrigger>
                      <TabsTrigger value="timeline">Timeline</TabsTrigger>
                      <TabsTrigger value="success">Success Rates</TabsTrigger>
                    </TabsList>

                    <TabsContent value="features">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Feature</TableHead>
                            <TableHead>Traditional 510(k)</TableHead>
                            <TableHead>Abbreviated 510(k)</TableHead>
                            <TableHead>Special 510(k)</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {comparisonData?.features?.length > 0 ? (
                            comparisonData.features.map((feature, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-medium">
                                  {feature.name || `Feature ${index + 1}`}
                                </TableCell>
                                <TableCell>{feature.traditional || '-'}</TableCell>
                                <TableCell>{feature.abbreviated || '-'}</TableCell>
                                <TableCell>{feature.special || '-'}</TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="text-center py-4 text-muted-foreground"
                              >
                                No feature comparison data available
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TabsContent>

                    <TabsContent value="timeline">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Pathway</TableHead>
                            <TableHead>Avg. Review Time</TableHead>
                            <TableHead>Prep. Time</TableHead>
                            <TableHead>Total</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {comparisonData?.timelines?.length > 0 ? (
                            comparisonData.timelines.map((item, index) => (
                              <TableRow key={index}>
                                <TableCell className="font-medium">
                                  {item.pathway || `Pathway ${index + 1}`}
                                </TableCell>
                                <TableCell>{item.reviewDays || 0} days</TableCell>
                                <TableCell>{item.prepDays || 0} days</TableCell>
                                <TableCell className="font-semibold">
                                  {(item.reviewDays || 0) + (item.prepDays || 0)} days
                                </TableCell>
                              </TableRow>
                            ))
                          ) : (
                            <TableRow>
                              <TableCell
                                colSpan={4}
                                className="text-center py-4 text-muted-foreground"
                              >
                                No timeline comparison data available
                              </TableCell>
                            </TableRow>
                          )}
                        </TableBody>
                      </Table>
                    </TabsContent>

                    <TabsContent value="success">
                      {successMetrics ? (
                        <div className="space-y-4">
                          <div>
                            <h4 className="text-sm font-medium mb-2">First-Time Success Rates</h4>
                            {successMetrics.successRates &&
                            successMetrics.successRates.length > 0 ? (
                              <div className="grid grid-cols-3 gap-4">
                                {successMetrics.successRates.map((rate, index) => (
                                  <div key={index} className="rounded-md border p-3">
                                    <div className="text-sm text-muted-foreground">
                                      {rate.pathway || `Pathway ${index + 1}`}
                                    </div>
                                    <div className="mt-1 flex items-center gap-2">
                                      <Progress value={rate.percentage || 0} className="h-2" />
                                      <span className="text-sm font-medium">
                                        {rate.percentage || 0}%
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <div className="text-center py-4 text-muted-foreground border rounded-md">
                                No success rate data available
                              </div>
                            )}
                          </div>

                          <div>
                            <h4 className="text-sm font-medium mb-2">Average Cycles to Decision</h4>
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead>Pathway</TableHead>
                                  <TableHead>Avg. Cycles</TableHead>
                                  <TableHead>Range</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {successMetrics.cycleStats &&
                                successMetrics.cycleStats.length > 0 ? (
                                  successMetrics.cycleStats.map((stat, index) => (
                                    <TableRow key={index}>
                                      <TableCell>
                                        {stat.pathway || `Pathway ${index + 1}`}
                                      </TableCell>
                                      <TableCell>{stat.avgCycles || '-'}</TableCell>
                                      <TableCell>{stat.range || '-'}</TableCell>
                                    </TableRow>
                                  ))
                                ) : (
                                  <TableRow>
                                    <TableCell
                                      colSpan={3}
                                      className="text-center py-4 text-muted-foreground"
                                    >
                                      No cycle statistics available
                                    </TableCell>
                                  </TableRow>
                                )}
                              </TableBody>
                            </Table>
                          </div>
                        </div>
                      ) : (
                        <div className="text-center py-6 text-muted-foreground">
                          No success metrics data available for this device type
                        </div>
                      )}
                    </TabsContent>
                  </Tabs>
                </div>
              )}
            </div>
          </>
        )}

        {/* Timeline Visualization */}
        {timelineData && (
          <>
            <Separator className="my-4" />
            <div>
              <Button
                variant="outline"
                className="flex w-full items-center justify-between py-2"
                onClick={() => setShowTimeline(!showTimeline)}
              >
                <span className="flex items-center">
                  <Clock className="mr-2 h-4 w-4" />
                  <span>Detailed Timeline & Milestones</span>
                </span>
                {showTimeline ? <ChevronUp /> : <ChevronDown />}
              </Button>

              {showTimeline && (
                <div className="mt-4 rounded-md border p-4">
                  <div className="mb-3">
                    <h4 className="text-sm font-medium">
                      Estimated Timeline for {timelineData.pathway}
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Based on historical data for similar devices
                    </p>
                  </div>

                  <div className="relative mt-6 mb-6">
                    <div className="absolute left-0 top-1/2 w-full h-1 bg-primary/20 -translate-y-1/2"></div>

                    {timelineData.milestones &&
                      timelineData.milestones.map((milestone, index) => {
                        // Default to a position based on index if dayFromStart or totalDays is missing
                        const totalDays = timelineData.totalDays || 100;
                        const dayFromStart =
                          milestone.dayFromStart ||
                          index * (totalDays / (timelineData.milestones.length || 1));
                        const position = (dayFromStart / totalDays) * 100;

                        return (
                          <div
                            key={index}
                            className="absolute flex flex-col items-center"
                            style={{ left: `${position}%` }}
                          >
                            <div className="w-3 h-3 bg-primary rounded-full z-10"></div>
                            <div
                              className={`absolute top-5 w-40 ${index % 2 === 0 ? '-translate-x-1/4' : '-translate-x-3/4'}`}
                            >
                              <p className="text-xs font-medium">
                                Day {milestone.dayFromStart || '?'}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {milestone.name || `Milestone ${index + 1}`}
                              </p>
                            </div>
                          </div>
                        );
                      })}
                  </div>

                  <div className="mt-16">
                    <h4 className="text-sm font-medium mb-2">Key Milestones</h4>
                    <div className="grid gap-2">
                      {timelineData.milestones &&
                        timelineData.milestones.map((milestone, index) => (
                          <div key={index} className="flex items-start gap-3 text-sm">
                            <div className="flex-shrink-0 mt-0.5">
                              <Clock3 className="h-4 w-4 text-primary" />
                            </div>
                            <div>
                              <div className="font-medium">
                                {milestone.name || `Milestone ${index + 1}`}
                                <span className="text-muted-foreground font-normal">
                                  (Day {milestone.dayFromStart || '?'})
                                </span>
                              </div>
                              <p className="text-muted-foreground">
                                {milestone.description || 'No description available'}
                              </p>
                            </div>
                          </div>
                        ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={fetchRecommendation}>
          Refresh Analysis
        </Button>
        <Button
          className="flex items-center"
          onClick={handleConfirmPathway}
          disabled={!selectedPathway}
        >
          Confirm {selectedPathway} <ArrowRight className="ml-2 h-4 w-4" />
        </Button>
      </CardFooter>
    </Card>
  );
};

export default PathwayAdvisorCard;
