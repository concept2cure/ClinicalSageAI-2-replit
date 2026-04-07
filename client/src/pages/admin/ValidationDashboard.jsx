import React, { useState, useEffect } from 'react';
import { useToast } from '@/hooks/use-toast';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { FileUploader } from '@/components/FileUploader';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
// Custom SVG icons instead of Radix UI icons
const InfoCircledIcon = props => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="12" y1="16" x2="12" y2="12" />
    <line x1="12" y1="8" x2="12.01" y2="8" />
  </svg>
);

const CheckCircledIcon = props => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const CrossCircledIcon = props => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <line x1="15" y1="9" x2="9" y2="15" />
    <line x1="9" y1="9" x2="15" y2="15" />
  </svg>
);

const QuestionMarkCircledIcon = props => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    {...props}
  >
    <circle cx="12" cy="12" r="10" />
    <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);
import {
  validateDocument,
  getModuleValidationRules,
  getCtdSectionMapping,
} from '../../services/ectdValidationService';
import * as openaiService from '../../services/openaiService';

// Severity Icons
const SeverityIcon = ({ severity }) => {
  switch (severity) {
    case 'critical':
      return <CrossCircledIcon className="w-5 h-5 text-red-600" />;
    case 'major':
      return <InfoCircledIcon className="w-5 h-5 text-amber-600" />;
    case 'minor':
      return <QuestionMarkCircledIcon className="w-5 h-5 text-blue-600" />;
    default:
      return <CheckCircledIcon className="w-5 h-5 text-green-600" />;
  }
};

// Severity Badge
const SeverityBadge = ({ severity }) => {
  const variantMap = {
    critical: 'destructive',
    major: 'warning',
    minor: 'secondary',
    info: 'outline',
  };

  return (
    <Badge variant={variantMap[severity] || 'default'}>
      {severity.charAt(0).toUpperCase() + severity.slice(1)}
    </Badge>
  );
};

const ValidationDashboard = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('overview');
  const [moduleType, setModuleType] = useState('module2');
  const [section, setSection] = useState('clinical_overview');
  const [documentContent, setDocumentContent] = useState('');
  const [validationResults, setValidationResults] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [availableSections, setAvailableSections] = useState([]);

  // Update available sections when module type changes
  useEffect(() => {
    const moduleRules = getModuleValidationRules(moduleType);
    if (moduleRules && moduleRules.requiredSections) {
      setAvailableSections(moduleRules.requiredSections);
      // Set default section if current selection is not valid for this module
      if (!moduleRules.requiredSections.includes(section)) {
        setSection(moduleRules.requiredSections[0]);
      }
    } else {
      setAvailableSections([]);
    }
  }, [moduleType]);

  // Handle document upload
  const handleDocumentUpload = files => {
    if (files && files.length > 0) {
      const file = files[0];
      const reader = new FileReader();

      reader.onload = e => {
        try {
          setDocumentContent(e.target.result);
          toast({
            title: 'Document Uploaded',
            description: `${file.name} has been loaded for validation.`,
          });
        } catch (error) {
          toast({
            title: 'Upload Error',
            description: 'Failed to process the document. Please try again.',
            variant: 'destructive',
          });
        }
      };

      reader.onerror = () => {
        toast({
          title: 'Upload Error',
          description: 'Failed to read the document file. Please try again.',
          variant: 'destructive',
        });
      };

      reader.readAsText(file);
    }
  };

  // Handle validation
  const handleValidate = async () => {
    if (!documentContent) {
      toast({
        title: 'Validation Error',
        description: 'Please upload or enter document content before validating.',
        variant: 'destructive',
      });
      return;
    }

    setIsValidating(true);
    setValidationResults(null);

    try {
      // Perform local validation
      const results = await validateDocument(documentContent, moduleType, section);

      // Enhance with OpenAI regulatory compliance analysis if available
      try {
        const aiResults = await openaiService.analyzeRegulatoryCompliance(
          documentContent,
          moduleType,
          section
        );

        // Merge AI results with local results if available
        if (aiResults && aiResults.issues) {
          // Remove any duplicates by ID
          const existingIssueIds = results.issues.map(issue => issue.id);
          const newAiIssues = aiResults.issues.filter(
            issue => !existingIssueIds.includes(issue.id)
          );

          results.issues = [...results.issues, ...newAiIssues];
          results.suggestions = [...(results.suggestions || []), ...(aiResults.suggestions || [])];
          results.aiEnhanced = true;
        }
      } catch (aiError) {
        console.error('AI enhancement failed:', aiError);
        // Continue with basic validation results if AI enhancement fails
        results.aiEnhanced = false;
      }

      setValidationResults(results);

      if (results.overallResult === 'passed') {
        toast({
          title: 'Validation Passed',
          description: 'Your document meets all validation criteria!',
        });
      } else if (results.overallResult === 'warning') {
        toast({
          title: 'Validation Warnings',
          description: 'Your document passed with warnings. Review the issues tab.',
          variant: 'warning',
        });
      } else {
        toast({
          title: 'Validation Failed',
          description: 'Your document has critical issues. See the issues tab for details.',
          variant: 'destructive',
        });
      }

      // Switch to issues tab if there are issues
      if (results.issues && results.issues.length > 0) {
        setActiveTab('issues');
      }
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: 'Validation Error',
        description: 'An error occurred during validation. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Calculate compliance score and statistics
  const getComplianceStats = () => {
    if (!validationResults || !validationResults.issues) {
      return {
        score: 0,
        criticalCount: 0,
        majorCount: 0,
        minorCount: 0,
        totalIssues: 0,
      };
    }

    const issues = validationResults.issues;
    const criticalCount = issues.filter(i => i.severity === 'critical').length;
    const majorCount = issues.filter(i => i.severity === 'major').length;
    const minorCount = issues.filter(i => i.severity === 'minor').length;
    const totalIssues = issues.length;

    // Calculate score (100 - deductions)
    const criticalDeduction = criticalCount * 15;
    const majorDeduction = majorCount * 5;
    const minorDeduction = minorCount * 1;
    const score = Math.max(0, 100 - criticalDeduction - majorDeduction - minorDeduction);

    return {
      score,
      criticalCount,
      majorCount,
      minorCount,
      totalIssues,
    };
  };

  const stats = getComplianceStats();

  return (
    <div className="container mx-auto p-4 space-y-6">
      <h1 className="text-3xl font-bold mb-6">eCTD Validation Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        {/* Document Selection */}
        <Card>
          <CardHeader>
            <CardTitle>Document Settings</CardTitle>
            <CardDescription>Select the eCTD module and section for validation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label htmlFor="module-select">eCTD Module</Label>
              <Select value={moduleType} onValueChange={setModuleType}>
                <SelectTrigger id="module-select">
                  <SelectValue placeholder="Select Module" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="module1">Module 1 - Administrative</SelectItem>
                  <SelectItem value="module2">Module 2 - Summaries</SelectItem>
                  <SelectItem value="module3">Module 3 - Quality</SelectItem>
                  <SelectItem value="module4">Module 4 - Nonclinical</SelectItem>
                  <SelectItem value="module5">Module 5 - Clinical</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="section-select">Section</Label>
              <Select
                value={section}
                onValueChange={setSection}
                disabled={availableSections.length === 0}
              >
                <SelectTrigger id="section-select">
                  <SelectValue placeholder="Select Section" />
                </SelectTrigger>
                <SelectContent>
                  {availableSections.map(sectionItem => (
                    <SelectItem key={sectionItem} value={sectionItem}>
                      {sectionItem.replace(/_/g, ' ')}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label>CTD Section Number</Label>
              <div className="p-2 bg-muted rounded text-center">
                {getCtdSectionMapping()[section] || 'N/A'}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Document Upload */}
        <Card>
          <CardHeader>
            <CardTitle>Document Content</CardTitle>
            <CardDescription>Upload or paste the document content for validation</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <FileUploader
              onFilesSelected={handleDocumentUpload}
              acceptedFileTypes=".txt,.md,.docx,.doc"
              label="Drop document here or click to upload"
            />

            <Label htmlFor="document-content">Or paste document content</Label>
            <Textarea
              id="document-content"
              placeholder="Paste document content here..."
              className="min-h-[150px]"
              value={documentContent}
              onChange={e => setDocumentContent(e.target.value)}
            />
          </CardContent>
          <CardFooter>
            <Button
              onClick={handleValidate}
              disabled={isValidating || !documentContent}
              className="w-full"
            >
              {isValidating ? 'Validating...' : 'Validate Document'}
            </Button>
          </CardFooter>
        </Card>

        {/* Summary Card */}
        <Card>
          <CardHeader>
            <CardTitle>Validation Summary</CardTitle>
            <CardDescription>
              {validationResults
                ? `Last validated: ${new Date(validationResults.timestamp).toLocaleString()}`
                : 'No validation performed yet'}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {validationResults ? (
              <>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <span>Compliance Score</span>
                    <span className="font-bold">{stats.score}%</span>
                  </div>
                  <Progress value={stats.score} className="h-2" />
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div className="flex flex-col items-center p-2 bg-red-50 rounded">
                    <span className="text-xs text-red-700">Critical</span>
                    <span className="text-lg font-bold text-red-700">{stats.criticalCount}</span>
                  </div>
                  <div className="flex flex-col items-center p-2 bg-amber-50 rounded">
                    <span className="text-xs text-amber-700">Major</span>
                    <span className="text-lg font-bold text-amber-700">{stats.majorCount}</span>
                  </div>
                  <div className="flex flex-col items-center p-2 bg-blue-50 rounded">
                    <span className="text-xs text-blue-700">Minor</span>
                    <span className="text-lg font-bold text-blue-700">{stats.minorCount}</span>
                  </div>
                </div>

                <Alert
                  className={
                    validationResults.overallResult === 'passed'
                      ? 'bg-green-50 border-green-200'
                      : validationResults.overallResult === 'warning'
                        ? 'bg-amber-50 border-amber-200'
                        : 'bg-red-50 border-red-200'
                  }
                >
                  <AlertTitle
                    className={
                      validationResults.overallResult === 'passed'
                        ? 'text-green-700'
                        : validationResults.overallResult === 'warning'
                          ? 'text-amber-700'
                          : 'text-red-700'
                    }
                  >
                    {validationResults.overallResult === 'passed'
                      ? 'Validation Passed'
                      : validationResults.overallResult === 'warning'
                        ? 'Passed with Warnings'
                        : 'Validation Failed'}
                  </AlertTitle>
                  <AlertDescription className="text-sm">
                    {validationResults.overallResult === 'passed'
                      ? 'Document meets all validation criteria.'
                      : validationResults.overallResult === 'warning'
                        ? 'Document has some issues that should be addressed.'
                        : 'Document has critical issues that must be fixed.'}
                  </AlertDescription>
                </Alert>

                {validationResults.aiEnhanced && (
                  <Badge
                    variant="outline"
                    className="bg-purple-50 text-purple-700 border-purple-200"
                  >
                    AI-Enhanced Validation
                  </Badge>
                )}
              </>
            ) : (
              <div className="flex flex-col items-center justify-center h-full py-12 text-center text-muted-foreground">
                <span className="text-4xl mb-4">📋</span>
                <p>No validation results yet.</p>
                <p className="text-xs">Upload a document and run validation to see results here.</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {validationResults && (
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className="grid grid-cols-3">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="issues">Issues ({stats.totalIssues})</TabsTrigger>
            <TabsTrigger value="suggestions">
              Suggestions ({validationResults.suggestions?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Validation Overview</CardTitle>
                <CardDescription>
                  Summary of compliance with eCTD requirements for{' '}
                  {moduleType.replace('module', 'Module ')} {section.replace(/_/g, ' ')}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <h3 className="text-lg font-medium mb-2">Document Information</h3>
                      <ul className="space-y-2">
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Module:</span>
                          <span>{moduleType.replace('module', 'Module ')}</span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Section:</span>
                          <span>{section.replace(/_/g, ' ')}</span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">CTD Number:</span>
                          <span>{getCtdSectionMapping()[section] || 'N/A'}</span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Content Length:</span>
                          <span>{documentContent.length.toLocaleString()} characters</span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Word Count:</span>
                          <span>{documentContent.split(/\s+/).length.toLocaleString()} words</span>
                        </li>
                      </ul>
                    </div>

                    <div>
                      <h3 className="text-lg font-medium mb-2">Validation Results</h3>
                      <ul className="space-y-2">
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Compliance Score:</span>
                          <span className="font-bold">{stats.score}%</span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Status:</span>
                          <SeverityBadge
                            severity={
                              validationResults.overallResult === 'passed'
                                ? 'info'
                                : validationResults.overallResult === 'warning'
                                  ? 'major'
                                  : 'critical'
                            }
                          />
                        </li>
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Critical Issues:</span>
                          <span className="text-red-600 font-bold">{stats.criticalCount}</span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Major Issues:</span>
                          <span className="text-amber-600 font-bold">{stats.majorCount}</span>
                        </li>
                        <li className="flex justify-between">
                          <span className="text-muted-foreground">Minor Issues:</span>
                          <span className="text-blue-600 font-bold">{stats.minorCount}</span>
                        </li>
                      </ul>
                    </div>
                  </div>

                  <Alert>
                    <CheckCircledIcon className="w-4 h-4 mr-2" />
                    <AlertTitle>Validation Completed</AlertTitle>
                    <AlertDescription>
                      {validationResults.overallResult === 'passed'
                        ? 'Congratulations! Your document meets all validation criteria. You can view any suggestions for further improvements.'
                        : 'Review the issues and suggestions tabs to improve your document compliance.'}
                    </AlertDescription>
                  </Alert>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="issues" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Validation Issues</CardTitle>
                <CardDescription>
                  {stats.totalIssues === 0
                    ? 'No issues found in your document'
                    : `Found ${stats.totalIssues} issues that need attention`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {stats.totalIssues === 0 ? (
                  <Alert className="bg-green-50 border-green-200">
                    <CheckCircledIcon className="w-4 h-4 mr-2 text-green-600" />
                    <AlertTitle className="text-green-700">No Issues Found</AlertTitle>
                    <AlertDescription className="text-green-700">
                      Great job! Your document passed all validation checks.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-4">
                    {/* Critical Issues */}
                    {stats.criticalCount > 0 && (
                      <div>
                        <h3 className="text-lg font-medium text-red-600 mb-2">Critical Issues</h3>
                        <div className="space-y-2">
                          {validationResults.issues
                            .filter(issue => issue.severity === 'critical')
                            .map((issue, index) => (
                              <Card key={`critical-${index}`} className="border-red-200">
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-3">
                                    <SeverityIcon severity="critical" />
                                    <div>
                                      <h4 className="font-medium">{issue.message}</h4>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        {issue.details}
                                      </p>
                                      <div className="flex items-center gap-2 mt-2">
                                        <Badge variant="outline" className="text-xs">
                                          {issue.location}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Major Issues */}
                    {stats.majorCount > 0 && (
                      <div>
                        <h3 className="text-lg font-medium text-amber-600 mb-2">Major Issues</h3>
                        <div className="space-y-2">
                          {validationResults.issues
                            .filter(issue => issue.severity === 'major')
                            .map((issue, index) => (
                              <Card key={`major-${index}`} className="border-amber-200">
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-3">
                                    <SeverityIcon severity="major" />
                                    <div>
                                      <h4 className="font-medium">{issue.message}</h4>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        {issue.details}
                                      </p>
                                      <div className="flex items-center gap-2 mt-2">
                                        <Badge variant="outline" className="text-xs">
                                          {issue.location}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                        </div>
                      </div>
                    )}

                    {/* Minor Issues */}
                    {stats.minorCount > 0 && (
                      <div>
                        <h3 className="text-lg font-medium text-blue-600 mb-2">Minor Issues</h3>
                        <div className="space-y-2">
                          {validationResults.issues
                            .filter(issue => issue.severity === 'minor')
                            .map((issue, index) => (
                              <Card key={`minor-${index}`} className="border-blue-200">
                                <CardContent className="p-4">
                                  <div className="flex items-start gap-3">
                                    <SeverityIcon severity="minor" />
                                    <div>
                                      <h4 className="font-medium">{issue.message}</h4>
                                      <p className="text-sm text-muted-foreground mt-1">
                                        {issue.details}
                                      </p>
                                      <div className="flex items-center gap-2 mt-2">
                                        <Badge variant="outline" className="text-xs">
                                          {issue.location}
                                        </Badge>
                                      </div>
                                    </div>
                                  </div>
                                </CardContent>
                              </Card>
                            ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="suggestions" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Improvement Suggestions</CardTitle>
                <CardDescription>
                  {(validationResults.suggestions?.length || 0) === 0
                    ? 'No suggestions available'
                    : `${validationResults.suggestions.length} suggestions to improve your document`}
                </CardDescription>
              </CardHeader>
              <CardContent>
                {(validationResults.suggestions?.length || 0) === 0 ? (
                  <Alert>
                    <InfoCircledIcon className="w-4 h-4 mr-2" />
                    <AlertTitle>No Suggestions Available</AlertTitle>
                    <AlertDescription>
                      There are no specific suggestions for improving this document.
                    </AlertDescription>
                  </Alert>
                ) : (
                  <div className="space-y-3">
                    {validationResults.suggestions.map((suggestion, index) => (
                      <Card key={`suggestion-${index}`} className="border-blue-100">
                        <CardContent className="p-4">
                          <div className="flex items-start gap-3">
                            <InfoCircledIcon className="w-5 h-5 text-blue-600 mt-0.5" />
                            <div>
                              <h4 className="font-medium">{suggestion.title}</h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                {suggestion.description}
                              </p>
                              <div className="flex items-center gap-2 mt-2">
                                <Badge
                                  variant="outline"
                                  className={`text-xs ${
                                    suggestion.priority === 'high'
                                      ? 'border-red-200 text-red-600'
                                      : suggestion.priority === 'medium'
                                        ? 'border-amber-200 text-amber-600'
                                        : 'border-blue-200 text-blue-600'
                                  }`}
                                >
                                  {suggestion.priority} priority
                                </Badge>
                              </div>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
};

export default ValidationDashboard;
