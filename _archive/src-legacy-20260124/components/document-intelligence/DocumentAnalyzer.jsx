import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  AlertTriangle,
  FileText,
  CheckCircle2,
  RotateCw,
  Microscope,
  Layers,
  Shield,
  Info,
  Sliders,
  Compare,
  Target,
  Beaker,
  Code,
  Dices,
  Zap,
  Gauge,
  ListFilter,
} from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { documentIntelligenceService } from '@/services/DocumentIntelligenceService';

/**
 * Document Analyzer Component
 *
 * This component allows the user to analyze processed documents
 * and extract structured data from them.
 *
 * @param {Object} props
 * @param {Array} props.processedDocuments - The processed documents to analyze
 * @param {Array} props.documentTypes - The identified document types
 * @param {string} props.regulatoryContext - The regulatory context (510k, cer, etc.)
 * @param {Function} props.onAnalysisComplete - Callback for when analysis is complete
 */
const DocumentAnalyzer = ({
  processedDocuments = [],
  documentTypes = [],
  regulatoryContext = '510k',
  onAnalysisComplete,
}) => {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [extractionMode, setExtractionMode] = useState('enhanced');
  const [validateData, setValidateData] = useState(true);
  const [enableDocumentComparison, setEnableDocumentComparison] = useState(false);
  const [targetedFieldsMode, setTargetedFieldsMode] = useState(false);
  const [targetedFields, setTargetedFields] = useState([
    'deviceName',
    'manufacturer',
    'deviceClass',
    'intendedUse',
  ]);
  const [customTargetField, setCustomTargetField] = useState('');
  const [analysisProgress, setAnalysisProgress] = useState(0);
  const [analysisStatus, setAnalysisStatus] = useState({ stage: '', message: '' });
  const [extractedData, setExtractedData] = useState(null);
  const [activeTab, setActiveTab] = useState('documents');
  const [resultsView, setResultsView] = useState('summary');
  const { toast } = useToast();

  // Add a custom targeted field
  const handleAddTargetedField = () => {
    if (customTargetField.trim() === '') return;

    if (!targetedFields.includes(customTargetField)) {
      setTargetedFields([...targetedFields, customTargetField]);
    }

    setCustomTargetField('');
  };

  // Remove a targeted field
  const handleRemoveTargetedField = field => {
    setTargetedFields(targetedFields.filter(f => f !== field));
  };

  // Start the analysis process
  const handleStartAnalysis = async () => {
    if (processedDocuments.length === 0) {
      toast({
        title: 'No Documents to Analyze',
        description: 'Please upload and process documents before starting analysis.',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);
    setAnalysisProgress(0);
    setAnalysisStatus({ stage: 'initialization', message: 'Initializing document analysis...' });
    setExtractedData(null);

    try {
      // Prepare the options object based on current settings
      const analysisOptions = {
        regulatoryContext,
        extractionMode: targetedFieldsMode ? 'targeted' : extractionMode,
        validateData,
        enableDocumentComparison: enableDocumentComparison && processedDocuments.length > 1,
      };

      // Add targeted fields if in targeted mode
      if (targetedFieldsMode) {
        analysisOptions.targetedFields = targetedFields;
      }

      // Call the document intelligence service to analyze the documents
      const data = await documentIntelligenceService.analyzeDocuments(
        processedDocuments,
        analysisOptions,
        progressUpdate => {
          // Handle the enhanced progress format
          if (typeof progressUpdate === 'object') {
            setAnalysisProgress(progressUpdate.percentage || 0);
            if (progressUpdate.stage) {
              setAnalysisStatus({
                stage: progressUpdate.stage,
                message: progressUpdate.message || '',
              });
            }
          } else {
            // Handle the legacy progress format (simple number)
            setAnalysisProgress(progressUpdate);
          }
        }
      );

      // Update state with the extracted data
      setExtractedData(data);

      // Switch to results tab
      setActiveTab('results');

      // Notify parent component that analysis is complete
      if (onAnalysisComplete) {
        onAnalysisComplete(data);
      }

      toast({
        title: 'Analysis Complete',
        description: `Successfully analyzed ${processedDocuments.length} document(s) using ${targetedFieldsMode ? 'targeted' : extractionMode} mode.`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Error analyzing documents:', error);

      toast({
        title: 'Analysis Failed',
        description: error.message || 'An error occurred during document analysis.',
        variant: 'destructive',
      });
    } finally {
      setIsAnalyzing(false);
      setAnalysisStatus({ stage: 'complete', message: 'Analysis complete' });
    }
  };

  // Get document confidence level class
  const getConfidenceClass = confidence => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.6) return 'text-yellow-600';
    if (confidence >= 0.4) return 'text-orange-600';
    return 'text-red-600';
  };

  // Get document confidence level background class
  const getConfidenceBackgroundClass = confidence => {
    if (confidence >= 0.8) return 'bg-green-100';
    if (confidence >= 0.6) return 'bg-yellow-100';
    if (confidence >= 0.4) return 'bg-orange-100';
    return 'bg-red-100';
  };

  // Get extraction mode description
  const getExtractionModeDescription = mode => {
    const descriptions = {
      basic:
        'Extract essential device information and basic details only. Fast processing with moderate accuracy.',
      enhanced:
        'Extract device information with additional technical details and specifications. Balanced speed and detail.',
      regulatory:
        'Focus on regulatory-specific information and compliance details. Optimized for regulatory submissions.',
      comprehensive:
        'Extract all available information including technical, regulatory, and clinical details. Most thorough but slowest.',
      targeted:
        'Extract only specific fields that you select. Fastest and most focused extraction mode.',
    };

    return descriptions[mode] || 'Custom extraction mode.';
  };

  // Render document cards
  const renderDocumentCards = () => {
    return processedDocuments.map((doc, index) => {
      // Find document type information
      const typeInfo = documentTypes.find(type => type.documentId === doc.id) || {
        type: 'Unknown',
        confidence: 0.5,
        subtype: null,
      };

      return (
        <Card key={doc.id} className="mb-4">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center text-base font-medium">
              <FileText className="h-5 w-5 mr-2" />
              {doc.filename}
            </CardTitle>
            <CardDescription className="flex items-center justify-between">
              <span>
                {doc.fileType}, {doc.pages} pages
              </span>
              <div className="flex gap-2 items-center">
                {typeInfo.subtype && (
                  <Badge variant="outline" className="text-xs">
                    {typeInfo.subtype}
                  </Badge>
                )}
                <Badge
                  variant="outline"
                  className={`${getConfidenceClass(typeInfo.confidence)} ${getConfidenceBackgroundClass(typeInfo.confidence)} border-0`}
                >
                  {typeInfo.type} ({Math.round(typeInfo.confidence * 100)}%)
                </Badge>
              </div>
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-2">
            <div className="text-sm text-muted-foreground max-h-32 overflow-y-auto bg-muted/30 p-3 rounded-md">
              <p className="whitespace-pre-line">
                {doc.textContent
                  ? doc.textContent.substring(0, 300) + '...'
                  : 'No text content available.'}
              </p>
            </div>

            {/* Template Matches */}
            {doc.templateMatches && doc.templateMatches.length > 0 && (
              <div className="mt-3">
                <div className="text-xs font-medium mb-1 flex items-center">
                  <Layers className="h-3 w-3 mr-1" />
                  Template Matches:
                </div>
                <div className="flex flex-wrap gap-1">
                  {doc.templateMatches.slice(0, 2).map((match, idx) => (
                    <Tooltip key={idx}>
                      <TooltipTrigger asChild>
                        <Badge variant="secondary" className="text-xs cursor-help">
                          {match.name.length > 20
                            ? `${match.name.substring(0, 20)}...`
                            : match.name}
                        </Badge>
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <div className="text-xs">
                          <p className="font-medium">{match.name}</p>
                          <p className="text-muted-foreground">
                            Match score: {Math.round(match.score * 100)}%
                          </p>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  ))}
                  {doc.templateMatches.length > 2 && (
                    <Badge variant="outline" className="text-xs">
                      +{doc.templateMatches.length - 2} more
                    </Badge>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      );
    });
  };

  // Render enhanced analysis settings with the new options
  const renderAnalysisSettings = () => {
    return (
      <div className="space-y-6">
        <Accordion type="single" collapsible defaultValue="extraction-mode" className="w-full">
          {/* Extraction Mode Section */}
          <AccordionItem value="extraction-mode">
            <AccordionTrigger className="text-sm font-medium">
              <div className="flex items-center">
                <Sliders className="h-4 w-4 mr-2" />
                Extraction Mode
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-3">
              {/* Targeted Mode Switch */}
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="targeted-mode"
                    checked={targetedFieldsMode}
                    onCheckedChange={setTargetedFieldsMode}
                    disabled={isAnalyzing}
                  />
                  <div>
                    <Label htmlFor="targeted-mode" className="flex items-center">
                      <Target className="h-4 w-4 mr-1" />
                      Targeted Fields Mode
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Extract only specific fields for faster, focused results
                    </p>
                  </div>
                </div>
              </div>

              {/* Targeted Fields List */}
              {targetedFieldsMode && (
                <div className="space-y-3 mb-4 p-3 bg-muted/30 rounded-md">
                  <div className="text-xs font-medium">Selected Fields:</div>
                  <div className="flex flex-wrap gap-2">
                    {targetedFields.map(field => (
                      <Badge key={field} variant="secondary" className="flex items-center gap-1">
                        {field}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-4 w-4 ml-1 hover:bg-red-100 rounded-full"
                          onClick={() => handleRemoveTargetedField(field)}
                        >
                          ×
                        </Button>
                      </Badge>
                    ))}
                  </div>
                  <div className="flex gap-2 mt-2">
                    <Input
                      placeholder="Add custom field"
                      value={customTargetField}
                      onChange={e => setCustomTargetField(e.target.value)}
                      className="h-8 text-xs"
                      onKeyDown={e => e.key === 'Enter' && handleAddTargetedField()}
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-8"
                      onClick={handleAddTargetedField}
                    >
                      Add
                    </Button>
                  </div>
                </div>
              )}

              {/* Standard Extraction Modes */}
              {!targetedFieldsMode && (
                <div className="space-y-3">
                  <Label htmlFor="extraction-mode">Select Extraction Mode</Label>
                  <Select
                    value={extractionMode}
                    onValueChange={setExtractionMode}
                    disabled={isAnalyzing || targetedFieldsMode}
                  >
                    <SelectTrigger id="extraction-mode">
                      <SelectValue placeholder="Select extraction mode" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="basic" className="flex items-center">
                        <div className="flex items-center">
                          <Zap className="h-4 w-4 mr-2 text-blue-500" />
                          Basic
                        </div>
                      </SelectItem>
                      <SelectItem value="enhanced">
                        <div className="flex items-center">
                          <Beaker className="h-4 w-4 mr-2 text-green-500" />
                          Enhanced
                        </div>
                      </SelectItem>
                      <SelectItem value="regulatory">
                        <div className="flex items-center">
                          <Shield className="h-4 w-4 mr-2 text-purple-500" />
                          Regulatory
                        </div>
                      </SelectItem>
                      <SelectItem value="comprehensive">
                        <div className="flex items-center">
                          <Layers className="h-4 w-4 mr-2 text-orange-500" />
                          Comprehensive
                        </div>
                      </SelectItem>
                    </SelectContent>
                  </Select>

                  <div className="rounded-md p-2 bg-muted/40 mt-2">
                    <div className="text-xs text-muted-foreground">
                      {getExtractionModeDescription(
                        targetedFieldsMode ? 'targeted' : extractionMode
                      )}
                    </div>
                  </div>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>

          {/* Advanced Options Section */}
          <AccordionItem value="advanced-options">
            <AccordionTrigger className="text-sm font-medium">
              <div className="flex items-center">
                <Code className="h-4 w-4 mr-2" />
                Advanced Options
              </div>
            </AccordionTrigger>
            <AccordionContent className="pt-3 space-y-4">
              {/* Validation Option */}
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Switch
                    id="validate-data"
                    checked={validateData}
                    onCheckedChange={setValidateData}
                    disabled={isAnalyzing}
                  />
                  <div>
                    <Label htmlFor="validate-data" className="flex items-center">
                      <CheckCircle2 className="h-4 w-4 mr-1" />
                      Validate Extracted Data
                    </Label>
                    <p className="text-xs text-muted-foreground mt-1">
                      Performs additional checks for completeness and consistency
                    </p>
                  </div>
                </div>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-sm">
                      <p className="text-xs">
                        Validation checks ensure that extracted data meets regulatory requirements
                        and is complete. This includes checking for missing required fields and
                        validating field formats.
                      </p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              {/* Document Comparison Option (only if multiple documents) */}
              {processedDocuments.length > 1 && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="document-comparison"
                      checked={enableDocumentComparison}
                      onCheckedChange={setEnableDocumentComparison}
                      disabled={isAnalyzing}
                    />
                    <div>
                      <Label htmlFor="document-comparison" className="flex items-center">
                        <Compare className="h-4 w-4 mr-1" />
                        Compare Across Documents
                      </Label>
                      <p className="text-xs text-muted-foreground mt-1">
                        Identifies conflicts and enhancements between documents
                      </p>
                    </div>
                  </div>
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info className="h-4 w-4 text-muted-foreground cursor-help" />
                      </TooltipTrigger>
                      <TooltipContent className="max-w-sm">
                        <p className="text-xs">
                          Document comparison analyzes multiple documents to identify
                          inconsistencies, conflicts, and potential opportunities to enhance data
                          quality by combining information from multiple sources.
                        </p>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              )}
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  };

  // Render confidence indicator with gauge
  const renderConfidenceIndicator = (confidence, size = 'normal') => {
    let className = 'flex items-center ';

    // Adjust styles based on size
    if (size === 'small') {
      className += 'gap-1 text-xs font-medium ';
    } else {
      className += 'gap-2 ';
    }

    // Add color based on confidence level
    if (confidence >= 0.8) {
      className += 'text-green-600';
    } else if (confidence >= 0.6) {
      className += 'text-yellow-600';
    } else if (confidence >= 0.4) {
      className += 'text-orange-500';
    } else {
      className += 'text-red-600';
    }

    return (
      <div className={className}>
        <Gauge className={size === 'small' ? 'h-3 w-3' : 'h-4 w-4'} />
        <span>{Math.round(confidence * 100)}%</span>
      </div>
    );
  };

  // Render detailed confidence metrics
  const renderDetailedConfidenceMetrics = confidenceMetrics => {
    if (!confidenceMetrics) return null;

    return (
      <div className="grid grid-cols-2 gap-2">
        {Object.entries(confidenceMetrics).map(([key, value]) => {
          // Skip the overall score since we display it separately
          if (key === 'overall') return null;

          // If the value is an object, skip it for now (handled in detailed view)
          if (typeof value === 'object') return null;

          return (
            <div key={key} className="flex items-center justify-between text-xs p-1">
              <span className="capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
              {renderConfidenceIndicator(value, 'small')}
            </div>
          );
        })}
      </div>
    );
  };

  // Render analysis results with the enhanced features
  const renderAnalysisResults = () => {
    if (!extractedData) {
      return (
        <div className="text-center py-8">
          <div className="mb-4">
            <AlertTriangle className="h-12 w-12 text-yellow-500 mx-auto" />
          </div>
          <h3 className="text-lg font-medium mb-2">No Analysis Results</h3>
          <p className="text-muted-foreground max-w-md mx-auto">
            No analysis results are available. Please complete the document analysis process first.
          </p>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {/* Results View Selector */}
        <div className="flex justify-center mb-2">
          <TabsList>
            <TabsTrigger
              value="summary"
              onClick={() => setResultsView('summary')}
              className={resultsView === 'summary' ? 'bg-primary text-primary-foreground' : ''}
            >
              <Layers className="h-4 w-4 mr-2" />
              Summary
            </TabsTrigger>
            <TabsTrigger
              value="confidence"
              onClick={() => setResultsView('confidence')}
              className={resultsView === 'confidence' ? 'bg-primary text-primary-foreground' : ''}
            >
              <Gauge className="h-4 w-4 mr-2" />
              Confidence
            </TabsTrigger>
            {extractedData.comparisonResults && (
              <TabsTrigger
                value="comparison"
                onClick={() => setResultsView('comparison')}
                className={resultsView === 'comparison' ? 'bg-primary text-primary-foreground' : ''}
              >
                <Compare className="h-4 w-4 mr-2" />
                Comparison
              </TabsTrigger>
            )}
            <TabsTrigger
              value="raw"
              onClick={() => setResultsView('raw')}
              className={resultsView === 'raw' ? 'bg-primary text-primary-foreground' : ''}
            >
              <Code className="h-4 w-4 mr-2" />
              Raw Data
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Summary View */}
        {resultsView === 'summary' && (
          <div className="space-y-6">
            {/* Overall Confidence */}
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">Overall Confidence:</span>
              <Badge
                variant="outline"
                className={`${getConfidenceClass(extractedData.confidence)} ${getConfidenceBackgroundClass(extractedData.confidence)} border-0`}
              >
                {Math.round(extractedData.confidence * 100)}%
              </Badge>
            </div>

            {/* Validation Results */}
            {extractedData.validation && (
              <div className="space-y-3">
                <h3 className="text-sm font-medium flex items-center">
                  <Shield className="h-4 w-4 mr-2" />
                  Validation Results:
                </h3>

                <div
                  className={`p-3 rounded-md ${extractedData.validation.valid ? 'bg-green-50' : 'bg-orange-50'}`}
                >
                  {extractedData.validation.valid ? (
                    <div className="flex items-center text-green-600">
                      <CheckCircle2 className="h-4 w-4 mr-2" />
                      <span>All validation checks passed</span>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Completeness Indicator */}
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium">Completeness:</span>
                          {renderConfidenceIndicator(
                            extractedData.validation.completeness,
                            'small'
                          )}
                        </div>
                        <Progress
                          value={extractedData.validation.completeness * 100}
                          className="h-1.5"
                          indicatorClassName={getConfidenceClass(
                            extractedData.validation.completeness
                          )}
                        />
                      </div>

                      {/* Issues */}
                      {extractedData.validation.missingFields?.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-xs font-medium text-red-600">
                            Missing Required Fields:
                          </span>
                          <div className="flex flex-wrap gap-1">
                            {extractedData.validation.missingFields.map(field => (
                              <Badge
                                key={field}
                                variant="outline"
                                className="text-xs text-red-600 border-red-200 bg-red-50"
                              >
                                {field}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Warnings */}
                      {extractedData.validation.warnings?.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-xs font-medium text-yellow-600">Warnings:</span>
                          <ul className="text-xs space-y-1">
                            {extractedData.validation.warnings.map((warning, index) => (
                              <li key={index} className="flex items-start">
                                <AlertTriangle className="h-3 w-3 text-yellow-600 mr-1 mt-0.5 flex-shrink-0" />
                                <span>
                                  <span className="font-medium">{warning.field}: </span>
                                  {warning.issue} - {warning.recommendation}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {/* Suggestions */}
                      {extractedData.validation.suggestions?.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-xs font-medium text-blue-600">Suggestions:</span>
                          <ul className="text-xs space-y-1">
                            {extractedData.validation.suggestions.map((suggestion, index) => (
                              <li key={index} className="flex items-start">
                                <Info className="h-3 w-3 text-blue-600 mr-1 mt-0.5 flex-shrink-0" />
                                <span>
                                  <span className="font-medium">{suggestion.field}: </span>
                                  {suggestion.suggestion}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Extracted Data Summary */}
            <div className="space-y-3">
              <h3 className="text-sm font-medium flex items-center">
                <FileText className="h-4 w-4 mr-2" />
                Extracted Data Summary:
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {
                  Object.entries(extractedData)
                    .filter(
                      ([key]) =>
                        !key.endsWith('Confidence') &&
                        key !== 'validation' &&
                        key !== 'sourceDocuments' &&
                        key !== 'comparisonResults' &&
                        key !== 'confidenceScores'
                    )
                    .map(([key, value]) => {
                      // Skip complex nested objects for the summary view
                      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
                        return null;
                      }

                      // Get confidence score if available
                      const confidenceKey = `${key}Confidence`;
                      const confidenceScore = extractedData[confidenceKey];

                      return (
                        <div key={key} className="bg-muted/30 p-3 rounded-md">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-medium capitalize">
                              {key.replace(/([A-Z])/g, ' $1')}:
                            </h4>
                            {confidenceScore !== undefined &&
                              renderConfidenceIndicator(confidenceScore, 'small')}
                          </div>
                          <div className="text-sm break-all">
                            {Array.isArray(value) ? (
                              <ul className="list-disc pl-4 space-y-1">
                                {value.slice(0, 5).map((item, idx) => (
                                  <li key={idx} className="text-xs">
                                    {typeof item === 'object' ? JSON.stringify(item) : String(item)}
                                  </li>
                                ))}
                                {value.length > 5 && (
                                  <li className="text-xs text-muted-foreground">
                                    +{value.length - 5} more items
                                  </li>
                                )}
                              </ul>
                            ) : (
                              <p className="text-xs">
                                {typeof value === 'object' ? JSON.stringify(value) : String(value)}
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })
                    .filter(Boolean) // Remove null entries
                }
              </div>
            </div>
          </div>
        )}

        {/* Confidence View */}
        {resultsView === 'confidence' && extractedData.confidenceScores && (
          <div className="space-y-6">
            <h3 className="text-sm font-medium flex items-center">
              <Gauge className="h-4 w-4 mr-2" />
              Confidence Analysis:
            </h3>

            <div className="bg-muted/30 p-4 rounded-md">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-medium">Overall Confidence Score</h4>
                <Badge
                  variant="outline"
                  className={`${getConfidenceClass(extractedData.confidence)} ${getConfidenceBackgroundClass(extractedData.confidence)} border-0`}
                >
                  {Math.round(extractedData.confidence * 100)}%
                </Badge>
              </div>

              <Progress
                value={extractedData.confidence * 100}
                className="h-2 mb-4"
                indicatorClassName={getConfidenceClass(extractedData.confidence)}
              />

              <div className="space-y-6">
                {Object.entries(extractedData.confidenceScores).map(([fieldName, scoreData]) => (
                  <div key={fieldName} className="border-t pt-4">
                    <div className="flex items-center justify-between mb-2">
                      <h5 className="text-xs font-medium capitalize">
                        {fieldName.replace(/([A-Z])/g, ' $1')}
                      </h5>
                      {renderConfidenceIndicator(scoreData.overall, 'small')}
                    </div>

                    {scoreData.factors && (
                      <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-2">
                        {Object.entries(scoreData.factors).map(([factorName, factorScore]) => (
                          <div
                            key={factorName}
                            className="flex items-center justify-between text-xs"
                          >
                            <span className="text-muted-foreground capitalize">
                              {factorName.replace(/([A-Z])/g, ' $1')}:
                            </span>
                            <span className={getConfidenceClass(factorScore)}>
                              {Math.round(factorScore * 100)}%
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Comparison View */}
        {resultsView === 'comparison' && extractedData.comparisonResults && (
          <div className="space-y-6">
            <h3 className="text-sm font-medium flex items-center">
              <Compare className="h-4 w-4 mr-2" />
              Document Comparison Results:
            </h3>

            <div className="bg-muted/30 p-4 rounded-md space-y-4">
              {/* Consistency Score */}
              <div className="space-y-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">Cross-Document Consistency:</span>
                  {renderConfidenceIndicator(
                    extractedData.comparisonResults.consistencyScore,
                    'normal'
                  )}
                </div>
                <Progress
                  value={extractedData.comparisonResults.consistencyScore * 100}
                  className="h-2"
                  indicatorClassName={getConfidenceClass(
                    extractedData.comparisonResults.consistencyScore
                  )}
                />
              </div>

              {/* Conflicts */}
              {extractedData.comparisonResults.conflicts &&
                extractedData.comparisonResults.conflicts.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium flex items-center text-orange-600">
                      <AlertTriangle className="h-3 w-3 mr-1" />
                      Conflicts Detected:
                    </h4>

                    <div className="space-y-2">
                      {extractedData.comparisonResults.conflicts.map((conflict, idx) => (
                        <div key={idx} className="bg-orange-50 p-2 rounded text-xs">
                          <div className="flex items-center">
                            <span className="font-medium capitalize mr-1">
                              {conflict.field.replace(/([A-Z])/g, ' $1')}:
                            </span>
                            <Badge variant="outline" className="text-xs ml-auto">
                              {conflict.severity} severity
                            </Badge>
                          </div>
                          <p className="mt-1 text-muted-foreground">{conflict.description}</p>
                          <p className="mt-1 text-xs text-blue-600">{conflict.recommendation}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Enhancements */}
              {extractedData.comparisonResults.enhancements &&
                extractedData.comparisonResults.enhancements.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-medium flex items-center text-blue-600">
                      <Info className="h-3 w-3 mr-1" />
                      Enhancement Opportunities:
                    </h4>

                    <div className="space-y-2">
                      {extractedData.comparisonResults.enhancements.map((enhancement, idx) => (
                        <div key={idx} className="bg-blue-50 p-2 rounded text-xs">
                          <span className="font-medium capitalize">
                            {enhancement.field.replace(/([A-Z])/g, ' $1')}:
                          </span>
                          <p className="mt-1 text-muted-foreground">{enhancement.description}</p>
                          <div className="mt-2 bg-white/50 p-1 rounded">
                            {enhancement.suggestedValue}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

              {/* Document Sources Visualization (only first 5 for clarity) */}
              {extractedData.comparisonResults.documentSources && (
                <div className="space-y-2 mt-4 pt-4 border-t">
                  <h4 className="text-xs font-medium">Data Source Mapping:</h4>
                  <div className="space-y-2">
                    {Object.entries(extractedData.comparisonResults.documentSources)
                      .slice(0, 5)
                      .map(([field, sources]) => (
                        <div key={field} className="text-xs flex items-center">
                          <span className="font-medium capitalize min-w-[120px]">
                            {field.replace(/([A-Z])/g, ' $1')}:
                          </span>
                          <div className="flex flex-wrap gap-1 ml-2">
                            {sources.map((source, idx) => (
                              <Badge key={idx} variant="secondary" className="text-xs">
                                Doc #{idx + 1}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      ))}
                    {Object.keys(extractedData.comparisonResults.documentSources).length > 5 && (
                      <div className="text-xs text-muted-foreground">
                        +{Object.keys(extractedData.comparisonResults.documentSources).length - 5}{' '}
                        more fields...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Raw Data View */}
        {resultsView === 'raw' && (
          <div className="space-y-3">
            <h3 className="text-sm font-medium flex items-center">
              <Code className="h-4 w-4 mr-2" />
              Raw Extracted Data:
            </h3>

            <div className="bg-muted/30 p-3 rounded-md max-h-96 overflow-y-auto">
              <pre className="text-xs whitespace-pre-wrap">
                {JSON.stringify(extractedData, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <Microscope className="h-5 w-5 mr-2" />
            Document Intelligence
          </CardTitle>
          <CardDescription>
            Extract structured data from regulatory documents with advanced intelligence
            capabilities
          </CardDescription>
        </CardHeader>

        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="documents">
                <FileText className="h-4 w-4 mr-2" />
                Documents & Settings
              </TabsTrigger>
              <TabsTrigger value="results" disabled={!extractedData && !isAnalyzing}>
                <Layers className="h-4 w-4 mr-2" />
                Analysis Results
              </TabsTrigger>
            </TabsList>

            <TabsContent value="documents" className="space-y-4 pt-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-medium flex items-center">
                      <FileText className="h-4 w-4 mr-2" />
                      Document List ({processedDocuments.length})
                    </h3>

                    {processedDocuments.length > 0 && (
                      <Badge variant="outline" className="text-xs">
                        {documentTypes.filter(dt => dt.regulatoryRelevance > 0.7).length} relevant
                        documents
                      </Badge>
                    )}
                  </div>

                  {processedDocuments.length > 0 ? (
                    <div className="max-h-[500px] overflow-y-auto pr-2">
                      {renderDocumentCards()}
                    </div>
                  ) : (
                    <div className="text-center py-6 bg-muted/30 rounded-md">
                      <AlertTriangle className="h-8 w-8 text-yellow-500 mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">
                        No documents available for analysis.
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Please upload and process documents first.
                      </p>
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-medium flex items-center">
                    <Sliders className="h-4 w-4 mr-2" />
                    Analysis Settings
                  </h3>
                  {renderAnalysisSettings()}
                </div>
              </div>
            </TabsContent>

            <TabsContent value="results" className="pt-4">
              {renderAnalysisResults()}
            </TabsContent>
          </Tabs>

          {/* Progress Bar with Enhanced Status */}
          {isAnalyzing && (
            <div className="mt-6 space-y-2">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center">
                  <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                  <span className="text-sm font-medium">
                    {analysisStatus.stage === 'initialization'
                      ? 'Initializing analysis...'
                      : analysisStatus.stage === 'extraction'
                        ? 'Extracting data...'
                        : analysisStatus.stage === 'processing'
                          ? 'Processing extracted data...'
                          : analysisStatus.stage === 'confidence'
                            ? 'Calculating confidence scores...'
                            : analysisStatus.stage === 'validation'
                              ? 'Validating results...'
                              : 'Analyzing documents...'}
                  </span>
                </div>
                <span className="text-sm text-muted-foreground">{analysisProgress}%</span>
              </div>
              <Progress value={analysisProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">
                {analysisStatus.message ||
                  (analysisProgress < 25
                    ? 'Initializing document analysis process...'
                    : analysisProgress < 50
                      ? 'Processing document content and extracting information...'
                      : analysisProgress < 75
                        ? 'Building structured data representation...'
                        : analysisProgress < 100
                          ? 'Validating and finalizing results...'
                          : 'Analysis complete!')}
              </p>
            </div>
          )}
        </CardContent>

        <CardFooter className="flex justify-between">
          <div className="flex items-center text-sm text-muted-foreground">
            <Shield className="h-4 w-4 mr-1" />
            {regulatoryContext === '510k' ? 'FDA 510(k) Context' : 'CER Context'}

            {processedDocuments.length > 0 && (
              <span className="ml-3 flex items-center text-xs">
                <Dices className="h-3.5 w-3.5 mr-1" />
                {targetedFieldsMode ? 'Targeted' : extractionMode} extraction mode
              </span>
            )}
          </div>

          <Button
            onClick={handleStartAnalysis}
            disabled={isAnalyzing || processedDocuments.length === 0}
          >
            {isAnalyzing ? (
              <>
                <RotateCw className="h-4 w-4 mr-2 animate-spin" />
                Analyzing...
              </>
            ) : (
              <>
                {processedDocuments.length > 0 ? (
                  <span className="flex items-center">
                    <Microscope className="h-4 w-4 mr-2" />
                    Analyze Documents
                  </span>
                ) : (
                  <>Start Analysis</>
                )}
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default DocumentAnalyzer;
