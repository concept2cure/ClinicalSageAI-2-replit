/**
 * 510(k) Compliance Checker Component
 *
 * This component provides an automated pre-submission quality check
 * to verify that a 510(k) submission complies with FDA regulations and
 * contains all required information.
 */

import React, { useState, useEffect } from 'react';
import {
  FaCheckCircle,
  FaExclamationCircle,
  FaExclamationTriangle,
  FaFilePdf,
  FaFileExcel,
  FaMagic,
  FaSpinner,
  FaRedo,
  FaDownload,
  FaClipboardCheck,
  FaChevronDown,
  FaChevronRight,
} from 'react-icons/fa';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import fda510kService from '../../services/FDA510kService';

// Status badge component
const StatusBadge = ({ status }) => {
  if (status === 'passed') {
    return (
      <Badge
        variant="outline"
        className="bg-green-50 text-green-700 hover:bg-green-100 hover:text-green-800 border-green-200"
      >
        <FaCheckCircle className="mr-1.5" />
        Passed
      </Badge>
    );
  } else if (status === 'warning') {
    return (
      <Badge
        variant="outline"
        className="bg-yellow-50 text-yellow-700 hover:bg-yellow-100 hover:text-yellow-800 border-yellow-200"
      >
        <FaExclamationTriangle className="mr-1.5" />
        Warning
      </Badge>
    );
  } else if (status === 'failed') {
    return (
      <Badge
        variant="outline"
        className="bg-red-50 text-red-700 hover:bg-red-100 hover:text-red-800 border-red-200"
      >
        <FaExclamationCircle className="mr-1.5" />
        Failed
      </Badge>
    );
  }
  return null;
};

const ComplianceChecker = ({ projectId }) => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const [applyingFix, setApplyingFix] = useState({ status: false, checkId: null });
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const { toast } = useToast();

  // Fetch initial compliance results
  useEffect(() => {
    if (projectId) {
      fetchComplianceResults();
    }
  }, [projectId]);

  // Fetch compliance results
  const fetchComplianceResults = async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await fda510kService.getComplianceCheckResults(projectId);
      setResults(data);
    } catch (err) {
      console.error('Error fetching compliance results:', err);
      setError('Failed to load compliance check results. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Run new compliance check
  const runComplianceCheck = async () => {
    setChecking(true);
    setError(null);

    try {
      const data = await fda510kService.runComplianceCheck(projectId);
      setResults(data);
      toast({
        title: 'Compliance Check Complete',
        description: `Overall score: ${data.overallScore}/100 with ${data.criticalIssues} critical issues found`,
      });
    } catch (err) {
      console.error('Error running compliance check:', err);
      setError('Failed to run compliance check. Please try again.');
      toast({
        title: 'Error Running Check',
        description: 'There was a problem running the compliance check',
        variant: 'destructive',
      });
    } finally {
      setChecking(false);
    }
  };

  // Apply automatic fix for a compliance issue
  const applyAutoFix = async (sectionId, checkId) => {
    setApplyingFix({ status: true, checkId });
    setError(null);

    try {
      await fda510kService.applyAutoFix(projectId, sectionId, checkId);
      // Refresh compliance results after applying fix
      await fetchComplianceResults();
      toast({
        title: 'Auto-Fix Applied',
        description: 'The compliance issue has been automatically fixed',
      });
    } catch (err) {
      console.error('Error applying auto-fix:', err);
      setError('Failed to apply automatic fix. Please try again.');
      toast({
        title: 'Auto-Fix Failed',
        description: 'The compliance issue could not be automatically fixed',
        variant: 'destructive',
      });
    } finally {
      setApplyingFix({ status: false, checkId: null });
    }
  };

  // Export compliance report
  const exportReport = async format => {
    setExporting(true);
    setError(null);
    setExportDropdownOpen(false);

    try {
      const result = await fda510kService.exportComplianceReport(projectId, format);

      // Create a download link
      const link = document.createElement('a');
      link.href = result.downloadUrl;
      link.setAttribute('download', result.fileName);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: `${format.toUpperCase()} Report Generated`,
        description: `Your compliance report has been downloaded`,
      });
    } catch (err) {
      console.error('Error exporting report:', err);
      setError('Failed to export compliance report. Please try again.');
      toast({
        title: 'Export Failed',
        description: `Could not generate the ${format.toUpperCase()} report`,
        variant: 'destructive',
      });
    } finally {
      setExporting(false);
    }
  };

  // Toggle section visibility
  const toggleSection = sectionId => {
    if (activeSection === sectionId) {
      setActiveSection(null);
    } else {
      setActiveSection(sectionId);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center py-12">
            <FaSpinner className="animate-spin text-primary mr-3 text-2xl" />
            <span className="text-muted-foreground text-lg">
              Loading compliance check results...
            </span>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Compliance Data</CardTitle>
          <CardDescription>
            We encountered a problem while fetching compliance check results
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-destructive mb-6 p-4 bg-destructive/10 rounded-md">{error}</div>
          <Button
            onClick={() => {
              fetchComplianceResults();
              toast({
                title: 'Retrying',
                description: 'Attempting to fetch compliance results again',
              });
            }}
            variant="default"
            className="gap-2"
          >
            <FaRedo className="h-4 w-4" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="shadow-md border-0 overflow-hidden">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 text-white">
        <h3 className="text-lg font-medium flex items-center">
          <FaClipboardCheck className="h-5 w-5 mr-2" />
          Pre-Submission Compliance Check
        </h3>
        <p className="text-blue-100 text-sm mt-1">
          Step 3: Validate that your 510(k) submission meets all FDA requirements
        </p>
      </div>

      <CardHeader>
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <CardDescription className="text-gray-600">
              Automated regulatory validation for your 510(k) submission
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              onClick={runComplianceCheck}
              disabled={checking}
              variant="default"
              className="gap-2"
            >
              {checking ? (
                <>
                  <FaSpinner className="animate-spin h-4 w-4" />
                  Running Check...
                </>
              ) : (
                <>
                  <FaRedo className="h-4 w-4" />
                  Run Check
                </>
              )}
            </Button>

            <DropdownMenu open={exportDropdownOpen} onOpenChange={setExportDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button disabled={exporting || !results} variant="outline" className="gap-2">
                  {exporting ? (
                    <>
                      <FaSpinner className="animate-spin h-4 w-4" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <FaDownload className="h-4 w-4" />
                      Export
                    </>
                  )}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuItem
                  onClick={() => exportReport('pdf')}
                  disabled={exporting}
                  className="cursor-pointer"
                >
                  <FaFilePdf className="mr-2 text-red-500 h-4 w-4" />
                  <span>Export as PDF</span>
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => exportReport('excel')}
                  disabled={exporting}
                  className="cursor-pointer"
                >
                  <FaFileExcel className="mr-2 text-green-500 h-4 w-4" />
                  <span>Export as Excel</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </CardHeader>

      <CardContent>
        {results ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
              <Card className="bg-white/50">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Overall Score</div>
                  <div className="text-3xl font-bold text-primary mt-1">
                    {results.overallScore}/100
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/50">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Completed Sections</div>
                  <div className="text-3xl font-bold text-green-600 mt-1">
                    {results.completedSections}/{results.totalSections}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/50">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Critical Issues</div>
                  <div className="text-3xl font-bold text-destructive mt-1">
                    {results.criticalIssues}
                  </div>
                </CardContent>
              </Card>
              <Card className="bg-white/50">
                <CardContent className="pt-6">
                  <div className="text-sm text-muted-foreground">Warnings</div>
                  <div className="text-3xl font-bold text-amber-500 mt-1">{results.warnings}</div>
                </CardContent>
              </Card>
            </div>

            <div className="mb-6">
              <div className="text-sm text-muted-foreground mb-2">Overall Progress</div>
              <Progress
                value={(results.completedSections / results.totalSections) * 100}
                className="h-2"
              />
            </div>

            <div className="space-y-4 mt-8">
              {results.sections.map(section => (
                <Collapsible
                  key={section.id}
                  open={activeSection === section.id}
                  onOpenChange={() => toggleSection(section.id)}
                  className="border rounded-md overflow-hidden"
                >
                  <CollapsibleTrigger className="w-full">
                    <div
                      className={`flex justify-between items-center p-4 ${
                        section.status === 'passed'
                          ? 'bg-green-50 hover:bg-green-100'
                          : section.status === 'warning'
                            ? 'bg-amber-50 hover:bg-amber-100'
                            : 'bg-red-50 hover:bg-red-100'
                      } transition-colors`}
                    >
                      <div className="flex items-center">
                        <StatusBadge status={section.status} />
                        <h3 className="ml-3 font-semibold text-foreground">{section.name}</h3>
                      </div>
                      <div className="text-muted-foreground">
                        {activeSection === section.id ? (
                          <FaChevronDown className="h-4 w-4" />
                        ) : (
                          <FaChevronRight className="h-4 w-4" />
                        )}
                      </div>
                    </div>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-white p-4">
                      <ul className="space-y-4">
                        {section.checks.map(check => (
                          <li
                            key={check.id}
                            className="flex flex-col md:flex-row justify-between border-b border-border pb-4 last:border-0 last:pb-0"
                          >
                            <div className="flex-1">
                              <div className="flex items-center">
                                {check.status === 'passed' ? (
                                  <FaCheckCircle className="text-green-500 mr-2 h-4 w-4 shrink-0" />
                                ) : check.status === 'warning' ? (
                                  <FaExclamationTriangle className="text-amber-500 mr-2 h-4 w-4 shrink-0" />
                                ) : (
                                  <FaExclamationCircle className="text-destructive mr-2 h-4 w-4 shrink-0" />
                                )}
                                <span className="font-medium">{check.description}</span>
                              </div>
                              <p className="text-sm text-muted-foreground mt-1 ml-6">
                                {check.message}
                              </p>
                            </div>

                            {check.autoFixAvailable && (
                              <Button
                                onClick={e => {
                                  e.stopPropagation();
                                  applyAutoFix(section.id, check.id);
                                }}
                                disabled={applyingFix.status}
                                variant="outline"
                                className="mt-2 md:mt-0 md:ml-6 gap-1 h-8"
                                size="sm"
                              >
                                {applyingFix.status && applyingFix.checkId === check.id ? (
                                  <>
                                    <FaSpinner className="animate-spin h-3.5 w-3.5" />
                                    <span>Applying...</span>
                                  </>
                                ) : (
                                  <>
                                    <FaMagic className="h-3.5 w-3.5" />
                                    <span>Auto-Fix</span>
                                  </>
                                )}
                              </Button>
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          </>
        ) : (
          <div className="text-center py-12">
            <FaClipboardCheck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No Compliance Checks Run</h3>
            <p className="text-muted-foreground mb-6 max-w-md mx-auto">
              Run a compliance check to verify that your 510(k) submission meets all FDA
              requirements and identify any issues that need to be fixed.
            </p>
            <Button
              onClick={runComplianceCheck}
              disabled={checking}
              variant="default"
              className="gap-2"
            >
              {checking ? (
                <>
                  <FaSpinner className="animate-spin h-4 w-4" />
                  Running Check...
                </>
              ) : (
                <>
                  <FaRedo className="h-4 w-4" />
                  Run Compliance Check
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>

      {results && (
        <CardFooter>
          <Alert>
            <FaClipboardCheck className="h-4 w-4" />
            <AlertTitle>About Compliance Checks</AlertTitle>
            <AlertDescription>
              This automated compliance checker verifies that your 510(k) submission meets FDA
              requirements. It checks for completeness, consistency, and adherence to FDA
              guidelines. Address all critical issues before submission to increase chances of
              acceptance.
            </AlertDescription>
          </Alert>
        </CardFooter>
      )}
    </Card>
  );
};

export default ComplianceChecker;
