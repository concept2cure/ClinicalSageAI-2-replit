import React, { useState, useEffect } from 'react';
import { useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';

// UI Components
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Progress } from '@/components/ui/progress';
import { Switch } from '@/components/ui/switch';

// Icons
import {
  AlertCircle,
  CheckCircle,
  Loader2,
  FileSearch,
  ListFilter,
  AlertTriangle,
  Search,
  Eye,
  XCircle,
  Info,
  Lightbulb,
  Edit,
  RefreshCw,
  Check,
  Table,
  UserCheck,
  FlaskConical,
  Pencil,
  Zap,
  HeartPulse,
  SkipForward,
} from 'lucide-react';

/**
 * Regulatory QA Assistant Component
 *
 * This component handles:
 * 1. Checking for incomplete placeholders
 * 2. Identifying table mismatches
 * 3. Finding unreferenced AE/SAE statements
 * 4. Checking for overuse of passive language
 * 5. Displaying issues in sidebar with quick fixes
 */
const RegulatoryQAAssistant = ({
  documentContent,
  documentType = 'cer',
  framework = 'mdr',
  onIssueFixed,
}) => {
  const [issues, setIssues] = useState([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysisComplete, setAnalysisComplete] = useState(false);
  const [complianceScore, setComplianceScore] = useState(null);
  const [filterOptions, setFilterOptions] = useState({
    showPlaceholders: true,
    showTableIssues: true,
    showReferenceIssues: true,
    showLanguageIssues: true,
    showCriticalOnly: false,
  });
  const { toast } = useToast();

  // Issue types with icons and descriptions
  const issueTypes = {
    placeholder: {
      icon: <XCircle className="h-4 w-4" />,
      label: 'Placeholder Text',
      description: 'Incomplete or unfinished placeholder text',
    },
    table_mismatch: {
      icon: <Table className="h-4 w-4" />,
      label: 'Table Mismatch',
      description: "Table references that don't match actual tables",
    },
    unreferenced_ae: {
      icon: <HeartPulse className="h-4 w-4" />,
      label: 'Unreferenced AE',
      description: 'Adverse events mentioned without proper references',
    },
    passive_language: {
      icon: <Pencil className="h-4 w-4" />,
      label: 'Passive Language',
      description: 'Overuse of passive voice construction',
    },
    missing_section: {
      icon: <SkipForward className="h-4 w-4" />,
      label: 'Missing Section',
      description: 'Required section is missing or incomplete',
    },
    citation_needed: {
      icon: <FileSearch className="h-4 w-4" />,
      label: 'Citation Needed',
      description: 'Statement requires supporting citation',
    },
    inconsistent_term: {
      icon: <AlertTriangle className="h-4 w-4" />,
      label: 'Inconsistent Term',
      description: 'Terminology used inconsistently throughout document',
    },
    regulatory_conflict: {
      icon: <AlertCircle className="h-4 w-4" />,
      label: 'Regulatory Conflict',
      description: 'Content conflicts with regulatory guidelines',
    },
  };

  // Analyze document with AI-powered QA
  const analysisMutation = useMutation({
    mutationFn: async data => {
      setIsAnalyzing(true);
      const response = await apiRequest('POST', '/api/cer/qa/analyze', data);
      return response.json();
    },
    onSuccess: data => {
      setIssues(data.issues || []);
      setComplianceScore(data.complianceScore || null);
      setAnalysisComplete(true);

      toast({
        title: 'Analysis complete',
        description: `Found ${data.issues?.length || 0} potential issues to review`,
      });

      setIsAnalyzing(false);
    },
    onError: error => {
      console.error('Error analyzing document:', error);
      toast({
        title: 'Analysis failed',
        description: 'There was a problem analyzing the document. Please try again.',
        variant: 'destructive',
      });
      setIsAnalyzing(false);
    },
  });

  // Start analysis when component mounts
  useEffect(() => {
    if (documentContent && !analysisComplete && !isAnalyzing) {
      handleStartAnalysis();
    }
  }, [documentContent]);

  // Handle starting document analysis
  const handleStartAnalysis = () => {
    analysisMutation.mutate({
      documentContent,
      documentType,
      framework,
    });
  };

  // Handle applying a fix
  const handleApplyFix = (issueId, fixText) => {
    // In a real implementation, this would modify the document content
    // For now, mark the issue as fixed
    setIssues(prev =>
      prev.map(issue => (issue.id === issueId ? { ...issue, fixed: true } : issue))
    );

    // Notify parent component
    if (onIssueFixed) {
      onIssueFixed(issueId, fixText);
    }

    toast({
      title: 'Fix applied',
      description: 'The suggested change has been applied to the document',
    });
  };

  // Handle ignoring an issue
  const handleIgnoreIssue = issueId => {
    setIssues(prev =>
      prev.map(issue => (issue.id === issueId ? { ...issue, ignored: true } : issue))
    );

    toast({
      title: 'Issue ignored',
      description: 'This issue will no longer appear in the list',
    });
  };

  // Handle filter option changes
  const handleFilterChange = (option, value) => {
    setFilterOptions(prev => ({
      ...prev,
      [option]: value,
    }));
  };

  // Filter issues based on current filter options
  const filteredIssues = issues.filter(issue => {
    if (issue.ignored) return false;
    if (filterOptions.showCriticalOnly && issue.severity !== 'critical') return false;
    if (!filterOptions.showPlaceholders && issue.type === 'placeholder') return false;
    if (!filterOptions.showTableIssues && issue.type === 'table_mismatch') return false;
    if (!filterOptions.showReferenceIssues && issue.type === 'unreferenced_ae') return false;
    if (!filterOptions.showLanguageIssues && issue.type === 'passive_language') return false;
    return true;
  });

  // Severity levels styling
  const getSeverityStyle = severity => {
    switch (severity) {
      case 'critical':
        return {
          badge: 'bg-red-100 text-red-800 hover:bg-red-100 border-red-200',
          icon: <AlertCircle className="h-3 w-3 mr-1 text-red-600" />,
        };
      case 'major':
        return {
          badge: 'bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200',
          icon: <AlertTriangle className="h-3 w-3 mr-1 text-amber-600" />,
        };
      case 'minor':
        return {
          badge: 'bg-blue-100 text-blue-800 hover:bg-blue-100 border-blue-200',
          icon: <Info className="h-3 w-3 mr-1 text-blue-600" />,
        };
      default:
        return {
          badge: 'bg-gray-100 text-gray-800 hover:bg-gray-100 border-gray-200',
          icon: <Info className="h-3 w-3 mr-1 text-gray-600" />,
        };
    }
  };

  // Calculate the compliance level based on score
  const getComplianceLevel = score => {
    if (score >= 90) return { text: 'High', color: 'text-green-600' };
    if (score >= 70) return { text: 'Moderate', color: 'text-amber-600' };
    return { text: 'Low', color: 'text-red-600' };
  };

  // Calculate progress bar value based on fixed issues
  const getProgressValue = () => {
    if (issues.length === 0) return 100;
    const fixedCount = issues.filter(issue => issue.fixed || issue.ignored).length;
    return Math.round((fixedCount / issues.length) * 100);
  };

  return (
    <div className="w-full">
      <h2 className="text-xl font-semibold flex items-center mb-4">
        <FileSearch className="mr-2 h-5 w-5 text-blue-600" />
        Regulatory QA Assistant
      </h2>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex justify-between items-start">
            <div>
              <CardTitle>Document Analysis</CardTitle>
              <CardDescription>AI-powered regulatory compliance analysis</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartAnalysis}
              disabled={isAnalyzing}
            >
              {isAnalyzing ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
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
        </CardHeader>

        {isAnalyzing ? (
          <CardContent className="pb-6">
            <div className="text-center py-12">
              <Loader2 className="h-12 w-12 mx-auto mb-4 text-blue-600 animate-spin" />
              <h3 className="text-lg font-medium text-gray-900 mb-1">Analyzing Your Document</h3>
              <p className="text-gray-500 max-w-md mx-auto mb-6">
                Our AI is thoroughly checking your document against regulatory requirements and best
                practices...
              </p>
              <Progress value={45} className="w-2/3 mx-auto" />
            </div>
          </CardContent>
        ) : (
          <>
            {analysisComplete && (
              <>
                <CardContent className="pb-4 space-y-4">
                  {/* Summary Panel */}
                  <div className="flex flex-col sm:flex-row sm:space-x-4 space-y-4 sm:space-y-0">
                    {/* Compliance Score */}
                    <div className="flex-1 border rounded-lg p-4 bg-gray-50">
                      <div className="flex items-start">
                        {complianceScore >= 90 ? (
                          <CheckCircle className="h-8 w-8 text-green-500 mr-3 mt-0.5" />
                        ) : complianceScore >= 70 ? (
                          <AlertTriangle className="h-8 w-8 text-amber-500 mr-3 mt-0.5" />
                        ) : (
                          <AlertCircle className="h-8 w-8 text-red-500 mr-3 mt-0.5" />
                        )}
                        <div>
                          <p className="text-sm text-gray-500">Compliance Score</p>
                          <h3 className="text-2xl font-bold">{complianceScore}%</h3>
                          <p
                            className={`text-sm font-medium ${getComplianceLevel(complianceScore).color}`}
                          >
                            {getComplianceLevel(complianceScore).text} Compliance
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Issues Summary */}
                    <div className="flex-1 border rounded-lg p-4 bg-gray-50">
                      <p className="text-sm text-gray-500 mb-1">Issues Found</p>
                      <h3 className="text-2xl font-bold mb-1">{issues.length}</h3>
                      <div className="flex items-center space-x-2">
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-1">
                            <AlertCircle className="h-3 w-3 text-red-500" />
                            <span className="text-xs text-gray-600">
                              {issues.filter(i => i.severity === 'critical').length} Critical
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <AlertTriangle className="h-3 w-3 text-amber-500" />
                            <span className="text-xs text-gray-600">
                              {issues.filter(i => i.severity === 'major').length} Major
                            </span>
                          </div>
                        </div>
                        <div className="flex flex-col">
                          <div className="flex items-center space-x-1">
                            <Info className="h-3 w-3 text-blue-500" />
                            <span className="text-xs text-gray-600">
                              {issues.filter(i => i.severity === 'minor').length} Minor
                            </span>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Check className="h-3 w-3 text-green-500" />
                            <span className="text-xs text-gray-600">
                              {issues.filter(i => i.fixed || i.ignored).length} Resolved
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="flex-1 border rounded-lg p-4 bg-gray-50">
                      <p className="text-sm text-gray-500 mb-1">Resolution Progress</p>
                      <h3 className="text-2xl font-bold mb-2">{getProgressValue()}%</h3>
                      <Progress value={getProgressValue()} className="h-2" />
                      <p className="text-xs text-gray-500 mt-2">
                        {issues.filter(i => i.fixed || i.ignored).length} of {issues.length} issues
                        resolved
                      </p>
                    </div>
                  </div>

                  {/* Filter Options */}
                  <div className="border rounded-lg p-3 bg-blue-50 border-blue-100">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-sm font-medium text-blue-800 mb-1">Filter Options</h4>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="criticalOnly"
                            checked={filterOptions.showCriticalOnly}
                            onCheckedChange={checked =>
                              handleFilterChange('showCriticalOnly', checked)
                            }
                          />
                          <Label htmlFor="criticalOnly" className="text-xs text-blue-700">
                            Critical Only
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="placeholders"
                            checked={filterOptions.showPlaceholders}
                            onCheckedChange={checked =>
                              handleFilterChange('showPlaceholders', checked)
                            }
                          />
                          <Label htmlFor="placeholders" className="text-xs text-blue-700">
                            Placeholders
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="tableIssues"
                            checked={filterOptions.showTableIssues}
                            onCheckedChange={checked =>
                              handleFilterChange('showTableIssues', checked)
                            }
                          />
                          <Label htmlFor="tableIssues" className="text-xs text-blue-700">
                            Table Issues
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="references"
                            checked={filterOptions.showReferenceIssues}
                            onCheckedChange={checked =>
                              handleFilterChange('showReferenceIssues', checked)
                            }
                          />
                          <Label htmlFor="references" className="text-xs text-blue-700">
                            Reference Issues
                          </Label>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Switch
                            id="language"
                            checked={filterOptions.showLanguageIssues}
                            onCheckedChange={checked =>
                              handleFilterChange('showLanguageIssues', checked)
                            }
                          />
                          <Label htmlFor="language" className="text-xs text-blue-700">
                            Language Issues
                          </Label>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Issues List */}
                  <div>
                    <h3 className="text-sm font-medium mb-2 flex items-center">
                      <ListFilter className="h-4 w-4 mr-1 text-gray-500" />
                      <span>Issues ({filteredIssues.length})</span>
                    </h3>

                    {filteredIssues.length === 0 ? (
                      <div className="text-center py-8 border rounded-lg">
                        <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                        <h3 className="text-gray-700 font-medium mb-1">No Issues Found</h3>
                        <p className="text-sm text-gray-500 max-w-md mx-auto">
                          {issues.length > 0
                            ? 'All issues have been resolved or are filtered out by current settings.'
                            : 'Your document looks good! No compliance issues detected.'}
                        </p>
                      </div>
                    ) : (
                      <ScrollArea className="h-[400px] border rounded-lg">
                        <div className="p-1">
                          {filteredIssues.map(issue => {
                            const severityStyle = getSeverityStyle(issue.severity);
                            const issueTypeInfo = issueTypes[issue.type] || {
                              icon: <Info className="h-4 w-4" />,
                              label: 'Other Issue',
                              description: 'Miscellaneous regulatory issue',
                            };

                            return (
                              <div
                                key={issue.id}
                                className={`border rounded-lg p-3 mb-2 ${
                                  issue.fixed ? 'bg-green-50 border-green-100' : 'bg-white'
                                }`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex items-start space-x-3">
                                    <div
                                      className={`rounded-full p-1 ${
                                        issue.fixed ? 'bg-green-100 text-green-600' : 'bg-gray-100'
                                      }`}
                                    >
                                      {issue.fixed ? (
                                        <CheckCircle className="h-4 w-4" />
                                      ) : (
                                        React.cloneElement(issueTypeInfo.icon, {
                                          className: 'h-4 w-4',
                                        })
                                      )}
                                    </div>
                                    <div>
                                      <div className="flex items-center space-x-2">
                                        <h4 className="font-medium text-sm">
                                          {issue.title || issueTypeInfo.label}
                                        </h4>
                                        <Badge variant="outline" className={severityStyle.badge}>
                                          {severityStyle.icon}
                                          {issue.severity}
                                        </Badge>
                                        <Badge
                                          variant="outline"
                                          className="bg-gray-50 text-gray-700 text-xs"
                                        >
                                          {issue.location || 'Document'}
                                        </Badge>
                                      </div>

                                      <p className="text-sm text-gray-600 mt-1">
                                        {issue.description}
                                      </p>

                                      {issue.context && (
                                        <div className="bg-gray-50 p-2 rounded-md mt-2 text-xs font-mono border border-gray-200">
                                          <p className="text-gray-800">{issue.context}</p>
                                        </div>
                                      )}

                                      {issue.suggestion && !issue.fixed && (
                                        <div className="bg-blue-50 p-2 rounded-md mt-2 border border-blue-100">
                                          <div className="flex items-center mb-1">
                                            <Lightbulb className="h-3 w-3 text-blue-600 mr-1" />
                                            <span className="text-xs font-medium text-blue-700">
                                              Suggestion
                                            </span>
                                          </div>
                                          <p className="text-xs text-blue-800">
                                            {issue.suggestion}
                                          </p>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div>
                                    {!issue.fixed && (
                                      <div className="space-y-1">
                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="outline"
                                                size="sm"
                                                className="w-full"
                                                onClick={() =>
                                                  handleApplyFix(issue.id, issue.fixText)
                                                }
                                              >
                                                <Zap className="h-3 w-3 mr-1" />
                                                Apply Fix
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>Apply the suggested fix</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>

                                        <TooltipProvider>
                                          <Tooltip>
                                            <TooltipTrigger asChild>
                                              <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full text-gray-500"
                                                onClick={() => handleIgnoreIssue(issue.id)}
                                              >
                                                <XCircle className="h-3 w-3 mr-1" />
                                                Ignore
                                              </Button>
                                            </TooltipTrigger>
                                            <TooltipContent>
                                              <p>Ignore this issue</p>
                                            </TooltipContent>
                                          </Tooltip>
                                        </TooltipProvider>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </ScrollArea>
                    )}
                  </div>
                </CardContent>
                <CardFooter className="bg-gray-50 border-t text-xs text-gray-500 flex justify-between">
                  <p className="flex items-center">
                    <Info className="h-3 w-3 mr-1" />
                    Analysis is based on regulatory guidelines for {framework.toUpperCase()}
                  </p>
                  <p className="text-blue-600 font-medium cursor-pointer hover:underline">
                    View Full Compliance Report
                  </p>
                </CardFooter>
              </>
            )}
          </>
        )}
      </Card>
    </div>
  );
};

export default RegulatoryQAAssistant;
