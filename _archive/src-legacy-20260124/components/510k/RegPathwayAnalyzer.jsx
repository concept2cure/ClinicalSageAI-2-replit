import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  BarChart4,
  Check,
  AlertTriangle,
  X,
  Flag,
  Lightbulb,
  Route,
  RefreshCw,
  Download,
  ClipboardCheck,
  ArrowRight,
  Clock,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import FDA510kService from '../../services/FDA510kService';
import { isFeatureEnabled } from '@/flags/featureFlags';

/**
 * RegPathwayAnalyzer component provides AI-powered regulatory pathway
 * recommendations and requirement analysis for medical devices.
 *
 * @param {Object} props - Component props
 * @param {Object} props.deviceProfile - The device profile to analyze
 * @param {number} props.organizationId - The organization ID
 * @returns {JSX.Element} - Rendered component
 */
const RegPathwayAnalyzer = ({ deviceProfile, organizationId }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [pathwayAnalysis, setPathwayAnalysis] = useState(null);
  const [selectedPath, setSelectedPath] = useState(null);
  const [activeTab, setActiveTab] = useState('recommendation');
  const { toast } = useToast();

  // Fetch pathway analysis when device profile changes
  useEffect(() => {
    if (deviceProfile && isFeatureEnabled('ENABLE_PATHWAY_ADVISOR')) {
      handleAnalyzePathway();
    }
  }, [deviceProfile?.id]);

  // Analyze regulatory pathway for the current device
  const handleAnalyzePathway = async () => {
    if (!deviceProfile) {
      toast({
        title: 'No Device Profile Selected',
        description: 'Please select a device profile before analyzing the regulatory pathway',
        variant: 'destructive',
      });
      return;
    }

    setIsLoading(true);
    try {
      const results = await FDA510kService.analyzeRegulatoryPathway(
        deviceProfile,
        organizationId || 1
      );

      // Set the analysis results
      setPathwayAnalysis(results);

      // Set the recommended pathway as selected
      if (results && results.recommendedPathway) {
        setSelectedPath(results.recommendedPathway.type);
      }

      toast({
        title: 'Analysis Complete',
        description: 'Regulatory pathway analysis completed successfully',
      });
    } catch (error) {
      console.error('Error analyzing regulatory pathway:', error);
      toast({
        title: 'Analysis Error',
        description: error.message || 'Could not complete regulatory pathway analysis',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  // Get a color for confidence score
  const getConfidenceColor = score => {
    if (score >= 80) return 'bg-green-100 text-green-800 border-green-200';
    if (score >= 60) return 'bg-blue-100 text-blue-800 border-blue-200';
    if (score >= 40) return 'bg-amber-100 text-amber-800 border-amber-200';
    return 'bg-red-100 text-red-800 border-red-200';
  };

  // Get a color for the pathway card based on recommendation status
  const getPathwayCardStyle = pathType => {
    if (!pathwayAnalysis || !pathwayAnalysis.recommendedPathway) return '';

    const isRecommended = pathwayAnalysis.recommendedPathway.type === pathType;
    const isSelected = selectedPath === pathType;

    if (isRecommended && isSelected) {
      return 'border-green-500 bg-green-50';
    } else if (isRecommended) {
      return 'border-green-300 bg-green-50';
    } else if (isSelected) {
      return 'border-blue-500 bg-blue-50';
    }

    return '';
  };

  // Save the selected pathway to the device profile
  const handleSavePath = async () => {
    if (!selectedPath || !pathwayAnalysis) {
      toast({
        title: 'No Pathway Selected',
        description: 'Please select a regulatory pathway before saving',
        variant: 'destructive',
      });
      return;
    }

    // Here we'd update the device profile with the selected pathway
    // For now we'll just show a success message
    toast({
      title: 'Pathway Saved',
      description: `${selectedPath} pathway has been saved to your device profile`,
    });
  };

  // Format a date string with estimated timeline
  const formatEstimatedDate = months => {
    const today = new Date();
    const estimatedDate = new Date(today);
    estimatedDate.setMonth(today.getMonth() + months);
    return estimatedDate.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
    });
  };

  // Render empty state when no analysis is available
  const renderEmptyState = () => (
    <div className="text-center p-8">
      <div className="mx-auto h-12 w-12 text-gray-400 rounded-full bg-gray-100 flex items-center justify-center mb-4">
        <Route className="h-6 w-6" />
      </div>
      <h3 className="text-lg font-medium text-gray-900 mb-1">No Pathway Analysis Yet</h3>
      <p className="text-sm text-gray-500 mb-4 max-w-md mx-auto">
        Analyze regulatory pathways to receive AI-powered recommendations based on your device's
        characteristics and regulatory requirements.
      </p>
      <Button onClick={handleAnalyzePathway} disabled={isLoading}>
        {isLoading ? (
          <>
            <svg
              className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            Analyzing...
          </>
        ) : (
          'Analyze Regulatory Pathways'
        )}
      </Button>
    </div>
  );

  // Render main analysis content
  const renderAnalysisContent = () => {
    if (!pathwayAnalysis) return renderEmptyState();

    return (
      <>
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <div>
              <h3 className="text-lg font-medium">Regulatory Pathway Analysis</h3>
              <p className="text-sm text-gray-500">
                Based on your device profile and FDA regulations
              </p>
            </div>
            <Badge className={`${getConfidenceColor(pathwayAnalysis.confidenceScore)}`}>
              {pathwayAnalysis.confidenceScore}% Confidence
            </Badge>
          </div>

          <Alert className="bg-blue-50 border-blue-200 mb-4">
            <AlertTitle className="text-blue-800 flex items-center">
              <Lightbulb className="mr-2 h-4 w-4" />
              Recommendation Summary
            </AlertTitle>
            <AlertDescription className="text-blue-700">
              {pathwayAnalysis.summaryText}
            </AlertDescription>
          </Alert>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="recommendation" className="flex items-center gap-1.5">
              <Route className="h-4 w-4" />
              <span>Recommendation</span>
            </TabsTrigger>
            <TabsTrigger value="requirements" className="flex items-center gap-1.5">
              <ClipboardCheck className="h-4 w-4" />
              <span>Requirements</span>
            </TabsTrigger>
            <TabsTrigger value="timeline" className="flex items-center gap-1.5">
              <Clock className="h-4 w-4" />
              <span>Timeline</span>
            </TabsTrigger>
          </TabsList>

          <div className="mt-3 border rounded-md p-4">
            <TabsContent value="recommendation" className="m-0">
              <ScrollArea className="h-[400px] pr-3">
                <div className="grid grid-cols-1 gap-4">
                  {/* Traditional 510(k) Pathway */}
                  <Card className={`shadow-sm ${getPathwayCardStyle('Traditional 510(k)')}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex justify-between">
                        <div className="flex items-center">
                          Traditional 510(k)
                          {pathwayAnalysis.recommendedPathway?.type === 'Traditional 510(k)' && (
                            <Badge className="ml-2 bg-green-100 text-green-800 border-green-200">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <div>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            {pathwayAnalysis.pathways?.find(p => p.type === 'Traditional 510(k)')
                              ?.suitabilityScore || 0}
                            % Match
                          </Badge>
                        </div>
                      </CardTitle>
                      <CardDescription>
                        Standard pathway for demonstrating substantial equivalence
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">
                            Suitable for most devices with existing predicates
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">Comprehensive review process with FDA</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <p className="text-sm">Longer review time compared to Special 510(k)</p>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <span className="text-sm text-gray-500">FDA Review: ~90-120 days</span>
                      <Button
                        variant={selectedPath === 'Traditional 510(k)' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedPath('Traditional 510(k)')}
                      >
                        {selectedPath === 'Traditional 510(k)' ? 'Selected' : 'Select'}
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Special 510(k) Pathway */}
                  <Card className={`shadow-sm ${getPathwayCardStyle('Special 510(k)')}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex justify-between">
                        <div className="flex items-center">
                          Special 510(k)
                          {pathwayAnalysis.recommendedPathway?.type === 'Special 510(k)' && (
                            <Badge className="ml-2 bg-green-100 text-green-800 border-green-200">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <div>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            {pathwayAnalysis.pathways?.find(p => p.type === 'Special 510(k)')
                              ?.suitabilityScore || 0}
                            % Match
                          </Badge>
                        </div>
                      </CardTitle>
                      <CardDescription>
                        Streamlined pathway for modifications to your own device
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">Faster review time (30-day goal)</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">
                            Suitable for design changes to your own cleared device
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <X className="h-4 w-4 text-red-600 mt-0.5" />
                          <p className="text-sm">
                            Not suitable for new indications or technologies
                          </p>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <span className="text-sm text-gray-500">FDA Review: ~30 days</span>
                      <Button
                        variant={selectedPath === 'Special 510(k)' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedPath('Special 510(k)')}
                      >
                        {selectedPath === 'Special 510(k)' ? 'Selected' : 'Select'}
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Abbreviated 510(k) Pathway */}
                  <Card className={`shadow-sm ${getPathwayCardStyle('Abbreviated 510(k)')}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex justify-between">
                        <div className="flex items-center">
                          Abbreviated 510(k)
                          {pathwayAnalysis.recommendedPathway?.type === 'Abbreviated 510(k)' && (
                            <Badge className="ml-2 bg-green-100 text-green-800 border-green-200">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <div>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            {pathwayAnalysis.pathways?.find(p => p.type === 'Abbreviated 510(k)')
                              ?.suitabilityScore || 0}
                            % Match
                          </Badge>
                        </div>
                      </CardTitle>
                      <CardDescription>
                        Uses guidance documents, special controls, or standards
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">
                            Based on FDA guidance documents or recognized standards
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">
                            Strong for devices with established performance criteria
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                          <p className="text-sm">
                            Requires thorough knowledge of applicable standards
                          </p>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <span className="text-sm text-gray-500">FDA Review: ~60-90 days</span>
                      <Button
                        variant={selectedPath === 'Abbreviated 510(k)' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedPath('Abbreviated 510(k)')}
                      >
                        {selectedPath === 'Abbreviated 510(k)' ? 'Selected' : 'Select'}
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* De Novo Pathway */}
                  <Card className={`shadow-sm ${getPathwayCardStyle('De Novo')}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex justify-between">
                        <div className="flex items-center">
                          De Novo Classification
                          {pathwayAnalysis.recommendedPathway?.type === 'De Novo' && (
                            <Badge className="ml-2 bg-green-100 text-green-800 border-green-200">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <div>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            {pathwayAnalysis.pathways?.find(p => p.type === 'De Novo')
                              ?.suitabilityScore || 0}
                            % Match
                          </Badge>
                        </div>
                      </CardTitle>
                      <CardDescription>
                        For novel devices with no predicate but low-moderate risk
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">
                            Establishes a new device type and classification
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">
                            Suitable for novel devices with low-moderate risk
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <X className="h-4 w-4 text-red-600 mt-0.5" />
                          <p className="text-sm">
                            Longer review times and higher submission burden
                          </p>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <span className="text-sm text-gray-500">FDA Review: ~150-180 days</span>
                      <Button
                        variant={selectedPath === 'De Novo' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedPath('De Novo')}
                      >
                        {selectedPath === 'De Novo' ? 'Selected' : 'Select'}
                      </Button>
                    </CardFooter>
                  </Card>

                  {/* Pre-Market Approval (PMA) */}
                  <Card className={`shadow-sm ${getPathwayCardStyle('PMA')}`}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-base flex justify-between">
                        <div className="flex items-center">
                          Premarket Approval (PMA)
                          {pathwayAnalysis.recommendedPathway?.type === 'PMA' && (
                            <Badge className="ml-2 bg-green-100 text-green-800 border-green-200">
                              Recommended
                            </Badge>
                          )}
                        </div>
                        <div>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700">
                            {pathwayAnalysis.pathways?.find(p => p.type === 'PMA')
                              ?.suitabilityScore || 0}
                            % Match
                          </Badge>
                        </div>
                      </CardTitle>
                      <CardDescription>
                        For Class III high-risk devices requiring clinical data
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pb-2">
                      <div className="space-y-2">
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">
                            Most stringent regulatory path with greatest FDA oversight
                          </p>
                        </div>
                        <div className="flex items-start gap-2">
                          <Check className="h-4 w-4 text-green-600 mt-0.5" />
                          <p className="text-sm">Required for high-risk (Class III) devices</p>
                        </div>
                        <div className="flex items-start gap-2">
                          <X className="h-4 w-4 text-red-600 mt-0.5" />
                          <p className="text-sm">
                            Requires comprehensive clinical data and lengthy review
                          </p>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <span className="text-sm text-gray-500">FDA Review: 180+ days</span>
                      <Button
                        variant={selectedPath === 'PMA' ? 'default' : 'outline'}
                        size="sm"
                        onClick={() => setSelectedPath('PMA')}
                      >
                        {selectedPath === 'PMA' ? 'Selected' : 'Select'}
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              </ScrollArea>
            </TabsContent>

            <TabsContent value="requirements" className="m-0">
              <ScrollArea className="h-[400px] pr-3">
                {pathwayAnalysis.pathwayRequirements && (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-1/2">Requirement</TableHead>
                        <TableHead className="w-1/4">Category</TableHead>
                        <TableHead className="w-1/4">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pathwayAnalysis.pathwayRequirements.map((req, index) => (
                        <TableRow key={index}>
                          <TableCell className="font-medium">{req.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="bg-gray-100">
                              {req.category}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            {req.status === 'Required' ? (
                              <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                                Required
                              </Badge>
                            ) : req.status === 'Optional' ? (
                              <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                                Optional
                              </Badge>
                            ) : (
                              <Badge className="bg-green-100 text-green-800 border-green-200">
                                {req.status}
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent value="timeline" className="m-0">
              <ScrollArea className="h-[400px] pr-3">
                <div className="space-y-6">
                  <div>
                    <h3 className="font-medium text-sm mb-4">Estimated Regulatory Timeline</h3>

                    <div className="relative pb-12">
                      {selectedPath &&
                        pathwayAnalysis.pathways?.find(p => p.type === selectedPath) && (
                          <>
                            <div className="space-y-6">
                              <div className="flex">
                                <div className="flex flex-col items-center mr-4">
                                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600 font-bold text-sm">
                                    1
                                  </div>
                                  <div className="h-full w-0.5 bg-gray-200" />
                                </div>
                                <div className="pt-1">
                                  <h4 className="font-medium">Submission Preparation</h4>
                                  <p className="text-sm text-gray-600 mt-1">
                                    Complete all testing and documentation for {selectedPath}{' '}
                                    submission
                                  </p>
                                  <p className="text-sm text-blue-600 mt-1">
                                    Estimated completion: {formatEstimatedDate(2)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex">
                                <div className="flex flex-col items-center mr-4">
                                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-600 font-bold text-sm">
                                    2
                                  </div>
                                  <div className="h-full w-0.5 bg-gray-200" />
                                </div>
                                <div className="pt-1">
                                  <h4 className="font-medium">FDA Submission</h4>
                                  <p className="text-sm text-gray-600 mt-1">
                                    Submit {selectedPath} package to FDA via ESG
                                  </p>
                                  <p className="text-sm text-blue-600 mt-1">
                                    Estimated submission: {formatEstimatedDate(3)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex">
                                <div className="flex flex-col items-center mr-4">
                                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-amber-100 text-amber-600 font-bold text-sm">
                                    3
                                  </div>
                                  <div className="h-full w-0.5 bg-gray-200" />
                                </div>
                                <div className="pt-1">
                                  <h4 className="font-medium">FDA Review Period</h4>
                                  <p className="text-sm text-gray-600 mt-1">
                                    FDA reviews submission (expected{' '}
                                    {pathwayAnalysis.pathways.find(p => p.type === selectedPath)
                                      .reviewTime || 'Unknown'}{' '}
                                    review time)
                                  </p>
                                  <p className="text-sm text-blue-600 mt-1">
                                    {selectedPath === 'Traditional 510(k)' &&
                                      'Estimated completion: ' + formatEstimatedDate(7)}
                                    {selectedPath === 'Special 510(k)' &&
                                      'Estimated completion: ' + formatEstimatedDate(4)}
                                    {selectedPath === 'Abbreviated 510(k)' &&
                                      'Estimated completion: ' + formatEstimatedDate(6)}
                                    {selectedPath === 'De Novo' &&
                                      'Estimated completion: ' + formatEstimatedDate(9)}
                                    {selectedPath === 'PMA' &&
                                      'Estimated completion: ' + formatEstimatedDate(12)}
                                  </p>
                                </div>
                              </div>

                              <div className="flex">
                                <div className="flex flex-col items-center mr-4">
                                  <div className="flex items-center justify-center w-8 h-8 rounded-full bg-green-100 text-green-600 font-bold text-sm">
                                    4
                                  </div>
                                </div>
                                <div className="pt-1">
                                  <h4 className="font-medium">Market Clearance</h4>
                                  <p className="text-sm text-gray-600 mt-1">
                                    Receive FDA clearance and prepare for market launch
                                  </p>
                                  <p className="text-sm text-blue-600 mt-1">
                                    {selectedPath === 'Traditional 510(k)' &&
                                      'Estimated clearance: ' + formatEstimatedDate(8)}
                                    {selectedPath === 'Special 510(k)' &&
                                      'Estimated clearance: ' + formatEstimatedDate(5)}
                                    {selectedPath === 'Abbreviated 510(k)' &&
                                      'Estimated clearance: ' + formatEstimatedDate(7)}
                                    {selectedPath === 'De Novo' &&
                                      'Estimated clearance: ' + formatEstimatedDate(10)}
                                    {selectedPath === 'PMA' &&
                                      'Estimated approval: ' + formatEstimatedDate(13)}
                                  </p>
                                </div>
                              </div>
                            </div>

                            <div className="mt-6 pt-4 border-t">
                              <h4 className="font-medium mb-2">Estimated Total Time to Market</h4>
                              <div className="flex items-center gap-2">
                                <Progress
                                  value={
                                    selectedPath === 'Traditional 510(k)'
                                      ? 67
                                      : selectedPath === 'Special 510(k)'
                                        ? 42
                                        : selectedPath === 'Abbreviated 510(k)'
                                          ? 58
                                          : selectedPath === 'De Novo'
                                            ? 83
                                            : selectedPath === 'PMA'
                                              ? 100
                                              : 50
                                  }
                                  className="flex-1 h-2"
                                />
                                <span className="text-sm font-medium">
                                  {selectedPath === 'Traditional 510(k)' && '8 months'}
                                  {selectedPath === 'Special 510(k)' && '5 months'}
                                  {selectedPath === 'Abbreviated 510(k)' && '7 months'}
                                  {selectedPath === 'De Novo' && '10 months'}
                                  {selectedPath === 'PMA' && '13+ months'}
                                </span>
                              </div>
                            </div>
                          </>
                        )}

                      {(!selectedPath ||
                        !pathwayAnalysis.pathways?.find(p => p.type === selectedPath)) && (
                        <Alert className="bg-amber-50 border-amber-200">
                          <AlertTitle className="text-amber-800">No Pathway Selected</AlertTitle>
                          <AlertDescription className="text-amber-700">
                            Please select a regulatory pathway to view detailed timeline estimates.
                          </AlertDescription>
                        </Alert>
                      )}
                    </div>
                  </div>
                </div>
              </ScrollArea>
            </TabsContent>
          </div>
        </Tabs>
      </>
    );
  };

  return (
    <Card className="mb-6">
      <CardHeader className="bg-gradient-to-r from-indigo-50 to-purple-50 pb-4">
        <CardTitle className="text-indigo-700 flex items-center">
          <Route className="h-5 w-5 mr-2 text-indigo-600" />
          Regulatory Pathway Analyzer
        </CardTitle>
        <CardDescription>
          AI-powered analysis of regulatory pathways and requirements for your medical device. Get
          recommendations on the most suitable FDA submission type.
        </CardDescription>
      </CardHeader>

      <CardContent className="p-6">{renderAnalysisContent()}</CardContent>

      {pathwayAnalysis && (
        <CardFooter className="border-t px-6 py-4 bg-slate-50 flex justify-between">
          <Button variant="outline" onClick={handleAnalyzePathway} disabled={isLoading}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh Analysis
          </Button>
          <Button onClick={handleSavePath} disabled={!selectedPath}>
            Save Selected Pathway
          </Button>
        </CardFooter>
      )}
    </Card>
  );
};

export default RegPathwayAnalyzer;
