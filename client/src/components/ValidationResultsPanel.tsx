import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { CheckCircle, XCircle, AlertTriangle, AlertCircle, Info } from 'lucide-react';
import { InlineAIButton } from '../concept2cure/components/ui/InlineAIButton';

// Define types for validation results
export interface ValidationIssue {
  id: string;
  code: string;
  message: string;
  description: string;
  severity: 'error' | 'warning' | 'info';
  location?: string;
  guideline?: string;
}

export interface ValidationResults {
  region: string;
  profile: string;
  timestamp: string;
  status: 'valid' | 'invalid' | 'pending';
  passed: boolean;
  issues: ValidationIssue[];
  warnings: ValidationIssue[];
  metadata?: {
    total: number;
    processed: number;
    passed: number;
    failed: number;
  };
}

interface ValidationResultsPanelProps {
  results: ValidationResults | null;
  isLoading?: boolean;
}

const ValidationResultsPanel: React.FC<ValidationResultsPanelProps> = ({
  results,
  isLoading = false,
}) => {
  // If still loading, show a loading state
  if (isLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Validation Results</CardTitle>
          <CardDescription>Processing validation checks...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center items-center p-6">
            <div className="animate-spin h-8 w-8 border-4 border-primary border-t-transparent rounded-full"></div>
          </div>
        </CardContent>
      </Card>
    );
  }

  // If no results yet, show an empty state
  if (!results) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Validation Results</CardTitle>
          <CardDescription>No validation has been performed yet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col items-center justify-center py-6 text-center">
            <AlertCircle className="h-12 w-12 text-muted-foreground mb-2" />
            <p>
              Click "Validate All" to check documents against the selected region's requirements.
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Get total number of issues
  const totalIssues = (results.issues?.length || 0) + (results.warnings?.length || 0);

  // Determine overall status
  const getStatusDisplay = () => {
    if (results.status === 'pending') {
      return {
        icon: <AlertCircle className="h-5 w-5 text-primary" />,
        title: 'Validation in Progress',
        description: "Documents are being validated against the selected region's requirements.",
        variant: 'default',
      };
    } else if (results.status === 'valid' || results.passed) {
      return {
        icon: <CheckCircle className="h-5 w-5 text-success" />,
        title: 'Validation Passed',
        description:
          totalIssues === 0
            ? `All documents meet ${results.region} requirements.`
            : `Documents meet ${results.region} requirements with ${results.warnings?.length || 0} warnings.`,
        variant: 'default',
      };
    } else {
      return {
        icon: <XCircle className="h-5 w-5 text-destructive" />,
        title: 'Validation Failed',
        description: `${results.issues?.length || 0} issues found that require attention.`,
        variant: 'destructive',
      };
    }
  };

  const status = getStatusDisplay();

  return (
    <Card>
      <CardHeader>
        <div className="flex justify-between items-center">
          <div>
            <CardTitle className="flex items-center gap-2">
              Validation Results
              <Badge>{results.region}</Badge>
              <Badge variant="outline">{results.profile}</Badge>
            </CardTitle>
            <CardDescription>
              {results.timestamp
                ? `Last validated: ${new Date(results.timestamp).toLocaleString()}`
                : ''}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert variant={status.variant as any}>
          {status.icon}
          <AlertTitle>{status.title}</AlertTitle>
          <AlertDescription>{status.description}</AlertDescription>
        </Alert>

        {/* AI: Refine All findings button */}
        {totalIssues > 0 && (
          <div className="flex justify-end">
            <InlineAIButton
              actionType="refine_with_validation_findings"
              content={`Validation results for ${results.region} (${results.profile}): ${results.issues?.length || 0} errors, ${results.warnings?.length || 0} warnings`}
              findings={(results.issues || []).concat(results.warnings || []).map(f => ({
                id: f.id,
                code: f.code,
                message: f.message,
                severity: f.severity,
                location: f.location,
              }))}
              projectId={1}
              label="Refine All Findings"
              size="md"
            />
          </div>
        )}

        <Tabs defaultValue="errors" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="errors">
              Errors {results.issues?.length > 0 && `(${results.issues.length})`}
            </TabsTrigger>
            <TabsTrigger value="warnings">
              Warnings {results.warnings?.length > 0 && `(${results.warnings.length})`}
            </TabsTrigger>
            <TabsTrigger value="summary">Summary</TabsTrigger>
          </TabsList>

          {/* Errors Tab */}
          <TabsContent value="errors" className="space-y-4">
            {!results.issues || results.issues.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle className="h-12 w-12 text-success mx-auto mb-2" />
                <p className="text-muted-foreground">No validation errors found</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {results.issues.map((issue, index) => (
                  <Alert key={index} variant="destructive">
                    <div className="flex items-start">
                      <XCircle className="h-4 w-4 mt-0.5 mr-2" />
                      <div className="flex-1">
                        <AlertTitle>
                          {issue.code} - {issue.message}
                        </AlertTitle>
                        <AlertDescription>
                          {issue.description}
                          {issue.location && (
                            <div className="text-xs mt-1">
                              <strong>Location:</strong> {issue.location}
                            </div>
                          )}
                          {issue.guideline && (
                            <div className="text-xs mt-1">
                              <strong>Guideline:</strong> {issue.guideline}
                            </div>
                          )}
                        </AlertDescription>
                      </div>
                      <div className="ml-2 shrink-0">
                        <InlineAIButton
                          actionType="explain_selection"
                          content={`${issue.code}: ${issue.message}. ${issue.description}${issue.location ? ` Location: ${issue.location}` : ''}${issue.guideline ? ` Guideline: ${issue.guideline}` : ''}`}
                          projectId={1}
                          label="Explain"
                          size="sm"
                        />
                      </div>
                    </div>
                  </Alert>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Warnings Tab */}
          <TabsContent value="warnings" className="space-y-4">
            {!results.warnings || results.warnings.length === 0 ? (
              <div className="text-center py-6">
                <CheckCircle className="h-12 w-12 text-success mx-auto mb-2" />
                <p className="text-muted-foreground">No validation warnings found</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto">
                {results.warnings.map((warning, index) => (
                  <Alert key={index}>
                    <div className="flex items-start">
                      <AlertTriangle className="h-4 w-4 mt-0.5 mr-2 text-warning" />
                      <div className="flex-1">
                        <AlertTitle>
                          {warning.code} - {warning.message}
                        </AlertTitle>
                        <AlertDescription>
                          {warning.description}
                          {warning.location && (
                            <div className="text-xs mt-1">
                              <strong>Location:</strong> {warning.location}
                            </div>
                          )}
                          {warning.guideline && (
                            <div className="text-xs mt-1">
                              <strong>Guideline:</strong> {warning.guideline}
                            </div>
                          )}
                        </AlertDescription>
                      </div>
                      <div className="ml-2 shrink-0">
                        <InlineAIButton
                          actionType="explain_selection"
                          content={`${warning.code}: ${warning.message}. ${warning.description}${warning.location ? ` Location: ${warning.location}` : ''}${warning.guideline ? ` Guideline: ${warning.guideline}` : ''}`}
                          projectId={1}
                          label="Explain"
                          size="sm"
                        />
                      </div>
                    </div>
                  </Alert>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Summary Tab */}
          <TabsContent value="summary">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="border rounded-md p-4">
                  <h3 className="text-sm font-medium mb-2">Validation Profile</h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Region:</dt>
                      <dd className="font-medium">{results.region}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Profile:</dt>
                      <dd className="font-medium">{results.profile}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Timestamp:</dt>
                      <dd className="font-medium">
                        {new Date(results.timestamp).toLocaleString()}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="border rounded-md p-4">
                  <h3 className="text-sm font-medium mb-2">Statistics</h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Total Errors:</dt>
                      <dd className="font-medium text-destructive">
                        {results.issues?.length || 0}
                      </dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Total Warnings:</dt>
                      <dd className="font-medium text-warning">{results.warnings?.length || 0}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Status:</dt>
                      <dd className="font-medium">
                        {results.status === 'valid' || results.passed ? (
                          <span className="text-success">Passed</span>
                        ) : results.status === 'pending' ? (
                          <span className="text-primary">Pending</span>
                        ) : (
                          <span className="text-destructive">Failed</span>
                        )}
                      </dd>
                    </div>
                  </dl>
                </div>
              </div>

              {results.metadata && (
                <div className="border rounded-md p-4">
                  <h3 className="text-sm font-medium mb-2">Processing Information</h3>
                  <dl className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Total Documents:</dt>
                      <dd className="font-medium">{results.metadata.total}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Processed:</dt>
                      <dd className="font-medium">{results.metadata.processed}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Passed:</dt>
                      <dd className="font-medium text-success">{results.metadata.passed}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-muted-foreground">Failed:</dt>
                      <dd className="font-medium text-destructive">{results.metadata.failed}</dd>
                    </div>
                  </dl>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
};

export default ValidationResultsPanel;
