/**
 * ValidationEngine Component
 *
 * This component provides comprehensive regulatory compliance validation
 * for Clinical Evaluation Reports against multiple international frameworks
 * using GPT-4o AI-powered analysis.
 *
 * It performs detailed verification of document completeness, reference integrity,
 * and regulatory compliance with EU MDR (MEDDEV 2.7/1 Rev 4), FDA, UKCA,
 * Health Canada, and ICH requirements.
 *
 * The system connects directly to regulatory guidelines without simulated data,
 * ensuring accurate and up-to-date compliance checking.
 */

import React, { useState, useEffect } from 'react';
import { cerApiService } from '@/services/CerAPIService';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCaption, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import {
  AlertCircle, CheckCircle, AlertTriangle, FileCheck, BookOpen, Gauge, RefreshCw, ClipboardList, Shield, Download } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toaster';

const ValidationEngine = ({ documentId, sections = [], onValidationComplete }) => {
  const [validationData, setValidationData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedFramework, setSelectedFramework] = useState('mdr');
  const [cerSections, setCerSections] = useState([]);
  const { toast } = useToast();

  // Update cerSections when sections prop changes
  useEffect(() => {
    setCerSections(sections);
  }, [sections]);

  // Maps validation severities to UI elements
  const severityMap = {
    critical: {
      icon: <AlertCircle className="h-5 w-5 text-red-500" />,
      badge: <Badge variant="destructive">Critical</Badge>,
      color: 'text-red-500',
      bgColor: 'bg-red-50',
    },
    major: {
      icon: <AlertTriangle className="h-5 w-5 text-amber-500" />,
      badge: <Badge variant="warning">Major</Badge>,
      color: 'text-amber-500',
      bgColor: 'bg-amber-50',
    },
    minor: {
      icon: <FileCheck className="h-5 w-5 text-blue-500" />,
      badge: <Badge variant="outline">Minor</Badge>,
      color: 'text-blue-500',
      bgColor: 'bg-blue-50',
    },
  };

  // Maps category names to UI elements
  const categoryMap = {
    regulatory_compliance: {
      name: 'Regulatory Compliance',
      icon: <Shield className="h-5 w-5" />,
    },
    completeness: {
      name: 'Document Completeness',
      icon: <ClipboardList className="h-5 w-5" />,
    },
    references: {
      name: 'Reference Verification',
      icon: <BookOpen className="h-5 w-5" />,
    },
    consistency: {
      name: 'Internal Consistency',
      icon: <FileCheck className="h-5 w-5" />,
    },
  };

  // Framework display names
  const frameworkNames = {
    mdr: 'EU MDR',
    fda: 'US FDA',
    ukca: 'UKCA',
    health_canada: 'Health Canada',
    ich: 'ICH',
  };

  // Run validation when framework changes
  useEffect(() => {
    if (documentId) {
      runValidation();
    }
  }, [documentId, selectedFramework]);

  // Run validation with selected framework
  const runValidation = async () => {
    setLoading(true);
    setError(null);

    try {
      // Pass document sections for comprehensive AI validation
      const data = await cerApiService.validateCERDocument(
        documentId,
        selectedFramework,
        cerSections // Send document sections for AI validation
      );

      setValidationData(data);

      if (onValidationComplete) {
        onValidationComplete(data);
      }

      // Display toast based on validation results and method
      const validationMethod = data.validationMethod === 'ai' ? 'GPT-4o AI-Powered' : 'Standard';

      if (data.summary.criticalIssues > 0) {
        toast({
          title: `${validationMethod} Validation: ${data.summary.criticalIssues} Critical Issues Found`,
          description: 'Your document has critical compliance issues that must be addressed.',
          variant: 'destructive',
        });
      } else if (data.summary.totalIssues === 0) {
        toast({
          title: `${validationMethod} Validation Successful`,
          description:
            'Your document passed all validation checks against the selected regulatory framework.',
          variant: 'default',
        });
      } else {
        toast({
          title: `${validationMethod} Validation: ${data.summary.totalIssues} Issues Found`,
          description: 'Your document has compliance issues that should be reviewed.',
          variant: 'default',
        });
      }
    } catch (err) {
      console.error('Validation error:', err);
      setError(err.message || 'Error running validation');

      toast({
        title: 'Validation Error',
        description: err.message || 'An error occurred while validating your document',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Calculate compliance score display
  const getScoreColor = score => {
    if (score >= 90) return 'text-green-600';
    if (score >= 70) return 'text-amber-600';
    return 'text-red-600';
  };

  // Progress bar color based on status
  const getProgressColor = status => {
    switch (status) {
      case 'success':
        return 'bg-green-500';
      case 'warning':
        return 'bg-amber-500';
      case 'error':
        return 'bg-red-500';
      default:
        return 'bg-blue-500';
    }
  };

  // Rendering loading state
  if (loading) {
    return (
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <Skeleton className="h-8 w-2/3" />
            <Skeleton className="h-6 w-5/6" />
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-5/6" />
              <Skeleton className="h-4 w-4/6" />
            </div>
          </CardContent>
          <CardFooter>
            <Skeleton className="h-10 w-28" />
          </CardFooter>
        </Card>

        <div className="text-center py-8">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-primary mb-4" />
          <p className="text-lg font-medium">
            Validating document against {frameworkNames[selectedFramework]} requirements...
          </p>
          <p className="text-sm text-muted-foreground my-2">
            AI-powered validation with GPT-4o is analyzing your content in real-time
          </p>
          <div className="max-w-md mx-auto mt-6 space-y-2">
            <div className="flex justify-between mb-1">
              <span className="text-xs font-medium text-primary">AI Analysis Progress</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
              <div
                className="bg-primary h-2.5 rounded-full animate-pulse"
                style={{ width: '100%' }}
              ></div>
            </div>
            <ul className="text-xs text-left space-y-2 mt-4 bg-gray-50 p-3 rounded-md border">
              <li className="flex items-center">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 mr-2" />
                <span>Loading document sections</span>
              </li>
              <li className="flex items-center">
                <CheckCircle className="h-3.5 w-3.5 text-green-500 mr-2" />
                <span>Identifying regulatory framework requirements</span>
              </li>
              <li className="flex items-center opacity-70">
                <RefreshCw className="h-3.5 w-3.5 text-primary mr-2 animate-spin" />
                <span>
                  Analyzing content against {frameworkNames[selectedFramework]} requirements
                </span>
              </li>
              <li className="flex items-center opacity-50">
                <div className="h-3.5 w-3.5 rounded-full border border-gray-300 mr-2"></div>
                <span>Generating detailed compliance report</span>
              </li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // Rendering error state
  if (error) {
    return (
      <Card className="border-red-200 bg-red-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-red-700">
            <AlertCircle className="h-5 w-5" />
            Validation Error
          </CardTitle>
          <CardDescription className="text-red-600">
            An error occurred while validating your document
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-red-800 font-mono text-sm bg-red-100 p-3 rounded">{error}</p>
        </CardContent>
        <CardFooter>
          <Button onClick={runValidation} variant="outline" className="gap-2">
            <RefreshCw className="h-4 w-4" />
            Try Again
          </Button>
        </CardFooter>
      </Card>
    );
  }

  // Main validation results rendering
  return (
    <div className="space-y-4">
      {/* Framework selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h2 className="text-xl font-semibold mb-1">Regulatory Validation</h2>
          <p className="text-muted-foreground">
            Validate your CER against international regulatory requirements
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
          <select
            value={selectedFramework}
            onChange={e => setSelectedFramework(e.target.value)}
            className="rounded-md border border-input h-10 px-3 py-2 text-sm"
          >
            <option value="mdr">EU MDR</option>
            <option value="fda">US FDA</option>
            <option value="ukca">UKCA</option>
            <option value="health_canada">Health Canada</option>
            <option value="ich">ICH</option>
          </select>

          <Button onClick={runValidation} className="gap-2 bg-[#0F6CBD]">
            <RefreshCw className="h-4 w-4" />
            Run Validation
          </Button>

          {validationData && (
            <Button
              onClick={() => {
                if (onValidationComplete) {
                  const validationSummary = {
                    title: 'Regulatory Validation Report',
                    type: 'validation-report',
                    content: {
                      framework: frameworkNames[selectedFramework],
                      score: validationData.summary.complianceScore,
                      issues: validationData.issues,
                      summary: validationData.summary,
                    },
                    lastUpdated: new Date().toISOString(),
                  };

                  onValidationComplete(validationSummary, true);

                  toast({
                    title: 'Validation Report Added',
                    description: `Validation report for ${frameworkNames[selectedFramework]} has been added to your CER`,
                    variant: 'default',
                  });
                }
              }}
              variant="outline"
              className="gap-2 border-[#0F6CBD] text-[#0F6CBD]"
            >
              Add to CER
            </Button>
          )}
        </div>
      </div>

      {/* Validation results */}
      {validationData && (
        <div className="space-y-6">
          {/* Summary card */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  Validation Summary
                  {validationData.aiValidated && (
                    <span className="px-2 py-1 rounded-full text-xs bg-[#0F6CBD] text-white">
                      GPT-4o AI Powered
                    </span>
                  )}
                </span>

                <span
                  className={`font-bold ${getScoreColor(validationData.summary.complianceScore)}`}
                >
                  <Gauge className="inline-block mr-2 h-5 w-5" />
                  {validationData.summary.complianceScore}% Compliance
                </span>
              </CardTitle>
              <CardDescription>
                {validationData.summary.totalIssues === 0
                  ? 'Your document passed all validation checks'
                  : `${validationData.summary.totalIssues} issues found during validation`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
                <div className="flex flex-col items-center p-4 rounded-lg border bg-background">
                  <span className="text-3xl font-bold mb-1 text-red-600">
                    {validationData.summary.criticalIssues}
                  </span>
                  <span className="text-sm text-muted-foreground">Critical Issues</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-lg border bg-background">
                  <span className="text-3xl font-bold mb-1 text-amber-600">
                    {validationData.summary.majorIssues}
                  </span>
                  <span className="text-sm text-muted-foreground">Major Issues</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-lg border bg-background">
                  <span className="text-3xl font-bold mb-1 text-blue-600">
                    {validationData.summary.minorIssues}
                  </span>
                  <span className="text-sm text-muted-foreground">Minor Issues</span>
                </div>
                <div className="flex flex-col items-center p-4 rounded-lg border bg-background">
                  <span className="text-3xl font-bold mb-1 text-green-600">
                    {validationData.summary.passedChecks}
                  </span>
                  <span className="text-sm text-muted-foreground">Passed Checks</span>
                </div>
              </div>

              {/* Category progress bars */}
              <div className="space-y-4">
                {Object.entries(validationData.categories).map(([key, category]) => (
                  <div key={key} className="space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {categoryMap[key]?.icon}
                        <span className="font-medium">{categoryMap[key]?.name || key}</span>
                      </div>
                      <div className="text-sm">
                        <span className="text-green-600 font-medium">{category.passed} Passed</span>
                        <span className="mx-1">•</span>
                        <span className="text-red-600 font-medium">{category.failed} Failed</span>
                      </div>
                    </div>
                    <Progress
                      value={(category.passed / (category.passed + category.failed)) * 100}
                      className={`h-2 ${getProgressColor(category.status)}`}
                    />
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter>
              <Button variant="outline" className="gap-2">
                <Download className="h-4 w-4" />
                Export Validation Report
              </Button>
            </CardFooter>
          </Card>

          {/* Issues list */}
          <Card>
            <CardHeader>
              <CardTitle>Validation Issues</CardTitle>
              <CardDescription>
                {validationData.issues.length === 0
                  ? 'No issues were found during validation'
                  : `${validationData.issues.length} issues require attention`}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {validationData.issues.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-3" />
                  <h3 className="text-xl font-medium text-green-700 mb-1">
                    All Validation Checks Passed
                  </h3>
                  <p className="text-muted-foreground">
                    Your document complies with {frameworkNames[selectedFramework]} requirements
                  </p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-[100px]">Severity</TableHead>
                      <TableHead>Issue</TableHead>
                      <TableHead className="w-[120px]">Location</TableHead>
                      <TableHead className="w-[180px]">Category</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {validationData.issues.map(issue => (
                      <TableRow key={issue.id} className={severityMap[issue.severity]?.bgColor}>
                        <TableCell>{severityMap[issue.severity]?.badge}</TableCell>
                        <TableCell>
                          <div className="font-medium">{issue.message}</div>
                          <div className="text-sm text-muted-foreground mt-1">
                            {issue.suggestion}
                          </div>
                        </TableCell>
                        <TableCell>{issue.location}</TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {categoryMap[issue.category]?.icon}
                            <span className="text-sm">
                              {categoryMap[issue.category]?.name || issue.category}
                            </span>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
};

export default ValidationEngine;
