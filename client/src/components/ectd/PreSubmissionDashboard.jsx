import { useState, useEffect } from 'react';
import { 
  Shield, CheckCircle2, XCircle, AlertTriangle, FileCheck, Database, Upload, Download, Play, RefreshCw, ChevronRight, Activity, BarChart3, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

export default function PreSubmissionDashboard({ submissionId, moduleType = 'full' }) {
  const { toast } = useToast();
  const [isValidating, setIsValidating] = useState(false);
  const [validationStatus, setValidationStatus] = useState({
    overall: null,
    categories: {},
    lastRun: null
  });

  // Validation categories with weights
  const validationCategories = [
    {
      id: 'structure',
      name: 'Document Structure',
      description: 'eCTD folder structure and naming conventions',
      weight: 15,
      checks: [
        'Module organization',
        'File naming conventions', 
        'Folder hierarchy',
        'XML backbone structure'
      ]
    },
    {
      id: 'send',
      name: 'SEND Compliance',
      description: 'CDISC SEND data standards for nonclinical studies',
      weight: 25,
      checks: [
        'Required domains present',
        'Variable naming',
        'Controlled terminology',
        'Dataset integrity'
      ]
    },
    {
      id: 'trc',
      name: 'TRC Validation',
      description: 'FDA Technical Rejection Criteria',
      weight: 30,
      checks: [
        'PDF bookmarks',
        'Hyperlinks',
        'File size limits',
        'Define.xml present'
      ]
    },
    {
      id: 'content',
      name: 'Content Completeness',
      description: 'Required sections and mandatory content',
      weight: 20,
      checks: [
        'All required sections',
        'Cross-references',
        'Study reports',
        'Regulatory forms'
      ]
    },
    {
      id: 'metadata',
      name: 'Metadata & Attributes',
      description: 'Document metadata and regulatory attributes',
      weight: 10,
      checks: [
        'Study identifiers',
        'Version information',
        'Author metadata',
        'Submission type'
      ]
    }
  ];

  // Run comprehensive validation
  const runFullValidation = async () => {
    setIsValidating(true);
    const results = {};
    
    try {
      // Simulate validation for each category
      for (const category of validationCategories) {
        // In production, these would be actual API calls
        const score = Math.floor(Math.random() * 30) + 70; // 70-100 score
        const passed = Math.floor(score / 10);
        const failed = 10 - passed;
        
        results[category.id] = {
          score,
          passed,
          failed,
          status: score >= 95 ? 'success' : score >= 80 ? 'warning' : 'error',
          issues: failed > 0 ? generateIssues(category, failed) : []
        };
      }
      
      // Calculate overall score
      const overallScore = Math.round(
        validationCategories.reduce((sum, cat) => {
          return sum + (results[cat.id].score * cat.weight / 100);
        }, 0)
      );
      
      setValidationStatus({
        overall: {
          score: overallScore,
          status: overallScore >= 95 ? 'success' : overallScore >= 80 ? 'warning' : 'error',
          canSubmit: overallScore >= 95
        },
        categories: results,
        lastRun: new Date().toISOString()
      });
      
      toast({
        title: 'Validation Complete',
        description: `Overall compliance score: ${overallScore}%`,
        variant: overallScore >= 95 ? 'default' : 'destructive'
      });
    } catch (error) {
      console.error('Validation error:', error);
      toast({
        title: 'Validation Failed',
        description: 'Unable to complete pre-submission validation',
        variant: 'destructive'
      });
    } finally {
      setIsValidating(false);
    }
  };

  // Generate sample issues for demonstration
  const generateIssues = (category, count) => {
    const issues = {
      structure: [
        'Missing required subfolder in Module 3.2.S',
        'Incorrect file naming in Module 4.2.3',
        'Invalid characters in folder names'
      ],
      send: [
        'DM domain missing required variable USUBJID',
        'Invalid controlled term in SPECIES field',
        'Date format not ISO 8601 compliant'
      ],
      trc: [
        'PDF bookmarks missing in 3 documents',
        'File size exceeds 100MB limit',
        'Broken hyperlinks detected'
      ],
      content: [
        'Missing Section 2.5.3 Clinical Pharmacology',
        'Incomplete study report references',
        'Required Form FDA 1571 not found'
      ],
      metadata: [
        'Study ID mismatch between documents',
        'Version information outdated',
        'Author metadata incomplete'
      ]
    };
    
    return issues[category.id]?.slice(0, count) || [];
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case 'success': return 'text-green-600';
      case 'warning': return 'text-yellow-600';
      case 'error': return 'text-red-600';
      default: return 'text-gray-600';
    }
  };

  // Get status icon
  const getStatusIcon = (status) => {
    switch (status) {
      case 'success': return <CheckCircle2 className="h-5 w-5 text-green-600" />;
      case 'warning': return <AlertTriangle className="h-5 w-5 text-yellow-600" />;
      case 'error': return <XCircle className="h-5 w-5 text-red-600" />;
      default: return <Shield className="h-5 w-5 text-gray-600" />;
    }
  };

  return (
    <div className="space-y-6" data-testid="presubmission-dashboard">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-3xl font-bold">Pre-Submission Validation Dashboard</h1>
          <p className="text-gray-500 mt-1">
            Comprehensive compliance checks before FDA submission
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            onClick={runFullValidation}
            disabled={isValidating}
            size="lg"
            data-testid="button-run-validation"
          >
            {isValidating ? (
              <>
                <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                Validating...
              </>
            ) : (
              <>
                <Play className="h-4 w-4 mr-2" />
                Run Full Validation
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Overall Status Card */}
      {validationStatus.overall && (
        <Card className="border-2" style={{
          borderColor: validationStatus.overall.status === 'success' ? '#10b981' :
                      validationStatus.overall.status === 'warning' ? '#f59e0b' : '#ef4444'
        }}>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Overall Submission Readiness</span>
              {getStatusIcon(validationStatus.overall.status)}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-4xl font-bold" 
                     style={{ color: getStatusColor(validationStatus.overall.status).replace('text-', '#').replace('-600', '') }}>
                    {validationStatus.overall.score}%
                  </p>
                  <p className="text-sm text-gray-500">Compliance Score</p>
                </div>
                <div className="text-right">
                  {validationStatus.overall.canSubmit ? (
                    <Badge variant="success" className="text-lg py-2 px-4">
                      Ready to Submit
                    </Badge>
                  ) : (
                    <Badge variant="destructive" className="text-lg py-2 px-4">
                      Not Ready
                    </Badge>
                  )}
                </div>
              </div>
              
              <Progress 
                value={validationStatus.overall.score} 
                className="h-4"
              />
              
              {!validationStatus.overall.canSubmit && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Action Required</AlertTitle>
                  <AlertDescription>
                    Your submission does not meet FDA requirements. Review and fix all critical errors before submitting.
                  </AlertDescription>
                </Alert>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Breakdown */}
      {validationStatus.categories && Object.keys(validationStatus.categories).length > 0 && (
        <div>
          <h2 className="text-xl font-semibold mb-4">Validation Categories</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {validationCategories.map((category) => {
              const result = validationStatus.categories[category.id];
              if (!result) return null;
              
              return (
                <Card key={category.id} className="hover:shadow-lg transition-shadow">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <CardTitle className="text-base">{category.name}</CardTitle>
                        <p className="text-xs text-gray-500 mt-1">{category.description}</p>
                      </div>
                      {getStatusIcon(result.status)}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-2xl font-bold">{result.score}%</span>
                        <Badge variant={result.status === 'success' ? 'default' : 
                                       result.status === 'warning' ? 'secondary' : 'destructive'}>
                          {result.passed}/{result.passed + result.failed} Passed
                        </Badge>
                      </div>
                      
                      <Progress value={result.score} className="h-2" />
                      
                      {result.issues.length > 0 && (
                        <div className="mt-3 space-y-1">
                          <p className="text-xs font-medium text-red-600">Issues Found:</p>
                          {result.issues.slice(0, 2).map((issue, idx) => (
                            <div key={idx} className="text-xs text-gray-600 flex items-start gap-1">
                              <span className="text-red-400 mt-0.5">•</span>
                              <span>{issue}</span>
                            </div>
                          ))}
                          {result.issues.length > 2 && (
                            <p className="text-xs text-gray-500">
                              +{result.issues.length - 2} more issues
                            </p>
                          )}
                        </div>
                      )}
                      
                      <Button 
                        variant="outline" 
                        size="sm" 
                        className="w-full"
                        data-testid={`button-view-details-${category.id}`}
                      >
                        View Details
                        <ChevronRight className="h-3 w-3 ml-1" />
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Actions */}
      {validationStatus.overall && (
        <Card>
          <CardHeader>
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-2" />
                Export Validation Report
              </Button>
              <Button variant="outline" size="sm">
                <FileCheck className="h-4 w-4 mr-2" />
                View Detailed Issues
              </Button>
              <Button variant="outline" size="sm">
                <Database className="h-4 w-4 mr-2" />
                Generate Define.xml
              </Button>
              <Button variant="outline" size="sm">
                <Activity className="h-4 w-4 mr-2" />
                View Validation History
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Validation History */}
      {validationStatus.lastRun && (
        <div className="text-sm text-gray-500 text-right">
          Last validation run: {new Date(validationStatus.lastRun).toLocaleString()}
        </div>
      )}
    </div>
  );
}