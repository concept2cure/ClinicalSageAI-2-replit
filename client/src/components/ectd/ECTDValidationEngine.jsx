import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter 
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { 
  CheckCircle, AlertTriangle, XCircle, FileCode, FileText, ShieldCheck, Activity, Play, RefreshCw, Download, Search } from 'lucide-react'

export default function ECTDValidationEngine({ projectId, documents = [] }) {
  const [isValidating, setIsValidating] = useState(false);
  const [validationProgress, setValidationProgress] = useState(0);
  const [validationStatus, setValidationStatus] = useState('idle'); // idle, running, complete, error
  const [results, setResults] = useState(null);
  const [activeTab, setActiveTab] = useState('summary');

  // Mock validation rules
  const validationRules = [
    { id: 'XML-001', category: 'XML Backbone', severity: 'Error', description: 'index.xml DTD version check' },
    { id: 'XML-002', category: 'XML Backbone', severity: 'Error', description: 'Regional XML schema validation' },
    { id: 'FILE-001', category: 'File Naming', severity: 'Warning', description: 'eCTD file naming convention' },
    { id: 'PDF-001', category: 'PDF Compliance', severity: 'Error', description: 'PDF version 1.4-1.7 check' },
    { id: 'PDF-002', category: 'PDF Compliance', severity: 'Warning', description: 'Hyperlink validation' },
    { id: 'PDF-003', category: 'PDF Compliance', severity: 'Error', description: 'Bookmark structure check' },
    { id: 'MD5-001', category: 'Integrity', severity: 'Error', description: 'MD5 Checksum verification' },
  ];

  const runValidation = () => {
    setIsValidating(true);
    setValidationStatus('running');
    setValidationProgress(0);
    setResults(null);

    // Simulate validation process
    let progress = 0;
    const interval = setInterval(() => {
      progress += 5;
      setValidationProgress(progress);

      if (progress >= 100) {
        clearInterval(interval);
        setIsValidating(false);
        setValidationStatus('complete');
        generateResults();
      }
    }, 100);
  };

  const generateResults = () => {
    // Mock results generation
    const mockIssues = [
      { 
        id: 1, 
        ruleId: 'FILE-001', 
        message: 'File "clinical_overview_final.pdf" does not match eCTD naming convention (expected: "clinical-overview.pdf")', 
        severity: 'Warning',
        location: 'm2/25-clin-over'
      },
      { 
        id: 2, 
        ruleId: 'PDF-002', 
        message: 'Broken hyperlink in "summary-clin-efficacy.pdf" (Page 12)', 
        severity: 'Warning',
        location: 'm2/27-clin-sum'
      },
      { 
        id: 3, 
        ruleId: 'XML-002', 
        message: 'Missing "application-set" attribute in us-regional.xml', 
        severity: 'Error',
        location: 'util/dtd'
      }
    ];

    setResults({
      score: 92,
      passed: 45,
      warnings: 2,
      errors: 1,
      issues: mockIssues,
      timestamp: new Date().toLocaleString()
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-6 w-6 text-blue-600" />
                eCTD Validation Engine
              </CardTitle>
              <CardDescription>
                Comprehensive technical validation for eCTD compliance (XML, PDF, Naming)
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setResults(null)} disabled={isValidating}>
                <RefreshCw className="mr-2 h-4 w-4" /> Reset
              </Button>
              <Button onClick={runValidation} disabled={isValidating}>
                {isValidating ? (
                  <>
                    <RefreshCw className="mr-2 h-4 w-4 animate-spin" /> Validating...
                  </>
                ) : (
                  <>
                    <Play className="mr-2 h-4 w-4" /> Run Validation
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isValidating && (
            <div className="space-y-2 mb-6">
              <div className="flex justify-between text-sm">
                <span>Running validation checks...</span>
                <span>{validationProgress}%</span>
              </div>
              <Progress value={validationProgress} className="h-2" />
              <p className="text-xs text-muted-foreground">Checking XML backbone and file integrity...</p>
            </div>
          )}

          {validationStatus === 'idle' && !isValidating && (
            <div className="text-center py-12 border-2 border-dashed rounded-lg bg-slate-50">
              <Activity className="h-12 w-12 mx-auto text-slate-300 mb-4" />
              <h3 className="text-lg font-medium text-slate-900">Ready to Validate</h3>
              <p className="text-slate-500 max-w-md mx-auto mt-2">
                Run a full validation check on your eCTD submission package. This includes XML backbone verification, file naming conventions, and PDF compliance checks.
              </p>
              <Button onClick={runValidation} className="mt-6">
                Start Validation
              </Button>
            </div>
          )}

          {validationStatus === 'complete' && results && (
            <div className="space-y-6">
              {/* Summary Cards */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <Card className="bg-slate-50">
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl font-bold text-blue-600">{results.score}%</div>
                    <div className="text-sm text-slate-600">Compliance Score</div>
                  </CardContent>
                </Card>
                <Card className="bg-green-50 border-green-200">
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl font-bold text-green-600">{results.passed}</div>
                    <div className="text-sm text-green-700">Checks Passed</div>
                  </CardContent>
                </Card>
                <Card className="bg-yellow-50 border-yellow-200">
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl font-bold text-yellow-600">{results.warnings}</div>
                    <div className="text-sm text-yellow-700">Warnings</div>
                  </CardContent>
                </Card>
                <Card className="bg-red-50 border-red-200">
                  <CardContent className="pt-6 text-center">
                    <div className="text-3xl font-bold text-red-600">{results.errors}</div>
                    <div className="text-sm text-red-700">Errors</div>
                  </CardContent>
                </Card>
              </div>

              {/* Detailed Results */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                <TabsList className="grid w-full grid-cols-3">
                  <TabsTrigger value="summary">Issues Summary</TabsTrigger>
                  <TabsTrigger value="rules">Rules Checked</TabsTrigger>
                  <TabsTrigger value="report">Full Report</TabsTrigger>
                </TabsList>

                <TabsContent value="summary" className="mt-4">
                  <ScrollArea className="h-[300px] rounded-md border p-4">
                    {results.issues.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full text-green-600">
                        <CheckCircle className="h-12 w-12 mb-2" />
                        <p>No issues found!</p>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        {results.issues.map((issue) => (
                          <Alert 
                            key={issue.id} 
                            variant={issue.severity === 'Error' ? 'destructive' : 'default'}
                            className={issue.severity === 'Warning' ? 'border-yellow-500 bg-yellow-50' : ''}
                          >
                            {issue.severity === 'Error' ? (
                              <XCircle className="h-4 w-4" />
                            ) : (
                              <AlertTriangle className="h-4 w-4 text-yellow-600" />
                            )}
                            <AlertTitle className="flex justify-between items-center">
                              <span>{issue.severity}: {issue.ruleId}</span>
                              <Badge variant="outline" className="font-normal">
                                {issue.location}
                              </Badge>
                            </AlertTitle>
                            <AlertDescription className="mt-2">
                              {issue.message}
                              <div className="mt-2">
                                <Button size="sm" variant="outline" className="h-7 text-xs">
                                  Fix Issue
                                </Button>
                              </div>
                            </AlertDescription>
                          </Alert>
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="rules" className="mt-4">
                  <ScrollArea className="h-[300px] rounded-md border p-4">
                    <div className="space-y-2">
                      {validationRules.map((rule) => (
                        <div key={rule.id} className="flex items-center justify-between p-3 bg-white border rounded-lg hover:bg-slate-50">
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-slate-100 rounded-full">
                              {rule.category === 'XML Backbone' && <FileCode className="h-4 w-4 text-blue-500" />}
                              {rule.category === 'File Naming' && <FileText className="h-4 w-4 text-purple-500" />}
                              {rule.category === 'PDF Compliance' && <FileText className="h-4 w-4 text-red-500" />}
                              {rule.category === 'Integrity' && <ShieldCheck className="h-4 w-4 text-green-500" />}
                            </div>
                            <div>
                              <div className="font-medium text-sm">{rule.id}</div>
                              <div className="text-xs text-slate-500">{rule.description}</div>
                            </div>
                          </div>
                          <Badge variant="outline">{rule.category}</Badge>
                        </div>
                      ))}
                    </div>
                  </ScrollArea>
                </TabsContent>

                <TabsContent value="report" className="mt-4">
                  <div className="p-6 border rounded-lg bg-slate-50 text-center">
                    <FileText className="h-12 w-12 mx-auto text-slate-400 mb-4" />
                    <h3 className="font-medium mb-2">Validation Report Available</h3>
                    <p className="text-sm text-slate-500 mb-6">
                      Download the full technical validation report in PDF or XML format.
                    </p>
                    <div className="flex justify-center gap-4">
                      <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" /> Download PDF
                      </Button>
                      <Button variant="outline">
                        <Download className="mr-2 h-4 w-4" /> Download XML
                      </Button>
                    </div>
                  </div>
                </TabsContent>
              </Tabs>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
