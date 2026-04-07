/**
 * 510(k) Cross-Format Harmonizer Compliance Checker Component
 *
 * This component provides an automated pre-submission quality check
 * to verify that submissions comply with multiple regulatory formats:
 * FDA 510(k), EU MDR, and Health Canada requirements.
 */

import React, { useState, useEffect, useMemo } from 'react';
import {
  CheckCircle as FaCheckCircle,
  AlertCircle as FaExclamationCircle,
  AlertTriangle as FaExclamationTriangle,
  FileText as FaFilePdf,
  FileSpreadsheet as FaFileExcel,
  Wand2 as FaMagic,
  Loader2 as FaSpinner,
  RotateCw as FaRedo,
  Download as FaDownload,
  ClipboardCheck as FaClipboardCheck,
  ChevronDown as FaChevronDown,
  ChevronRight as FaChevronRight,
  Globe as FaGlobe,
  Scale as FaBalanceScale,
  ShieldCheck as FaShieldAlt,
} from 'lucide-react';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/toaster';
import fda510kService from '../../services/FDA510kService';

// Cross-Format Harmonizer: Regional compliance frameworks
const REGIONAL_FRAMEWORKS = {
  FDA_510K: {
    name: 'FDA 510(k)',
    flag: '🇺🇸',
    color: 'blue',
    sections: [
      { id: 'device_description', name: 'Device Description', weight: 20 },
      { id: 'intended_use', name: 'Intended Use Statement', weight: 15 },
      { id: 'substantial_equivalence', name: 'Substantial Equivalence', weight: 25 },
      { id: 'performance_data', name: 'Performance Data', weight: 20 },
      { id: 'labeling', name: 'Labeling', weight: 10 },
      { id: 'risk_analysis', name: 'Risk Analysis', weight: 10 },
    ],
    requiredFields: ['deviceName', 'deviceType', 'deviceClass', 'intendedUse', 'description'],
    criticalChecks: ['predicate_device', 'substantial_equivalence', 'performance_testing'],
  },
  EU_MDR: {
    name: 'EU MDR',
    flag: '🇪🇺',
    color: 'green',
    sections: [
      { id: 'device_description', name: 'Device Description', weight: 15 },
      { id: 'intended_purpose', name: 'Intended Purpose', weight: 15 },
      { id: 'clinical_evaluation', name: 'Clinical Evaluation', weight: 30 },
      { id: 'risk_management', name: 'Risk Management', weight: 20 },
      { id: 'technical_documentation', name: 'Technical Documentation', weight: 15 },
      { id: 'post_market_surveillance', name: 'Post-Market Surveillance', weight: 5 },
    ],
    requiredFields: [
      'deviceName',
      'deviceType',
      'mdrClassification',
      'intendedPurpose',
      'description',
      'authorizedRepresentative',
    ],
    criticalChecks: [
      'clinical_evidence',
      'conformity_assessment',
      'ce_marking',
      'authorized_representative',
    ],
  },
  HEALTH_CANADA: {
    name: 'Health Canada',
    flag: '🇨🇦',
    color: 'red',
    sections: [
      { id: 'device_description', name: 'Device Description', weight: 18 },
      { id: 'intended_use', name: 'Intended Use', weight: 15 },
      { id: 'safety_effectiveness', name: 'Safety & Effectiveness', weight: 25 },
      { id: 'quality_system', name: 'Quality System', weight: 20 },
      { id: 'labeling', name: 'Labeling', weight: 12 },
      { id: 'canadian_requirements', name: 'Canadian-Specific Requirements', weight: 10 },
    ],
    requiredFields: [
      'deviceName',
      'deviceType',
      'healthCanadaClass',
      'intendedUse',
      'description',
      'licenseeInformation',
    ],
    criticalChecks: ['canadian_licensee', 'quality_system', 'safety_effectiveness'],
  },
};

// Cross-Format Harmonizer: Compliance gap categories
const GAP_CATEGORIES = {
  MISSING_FIELD: 'Missing Required Field',
  FORMAT_MISMATCH: 'Format Mismatch',
  REGULATORY_SPECIFIC: 'Region-Specific Requirement',
  CROSS_REFERENCE: 'Cross-Regional Inconsistency',
  VALIDATION_ERROR: 'Validation Error',
};

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

const ComplianceChecker = ({ projectId, deviceProfile, targetMarkets = ['FDA_510K'] }) => {
  const [loading, setLoading] = useState(false);
  const [checking, setChecking] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [activeSection, setActiveSection] = useState(null);
  const [applyingFix, setApplyingFix] = useState({ status: false, checkId: null });
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);

  // Cross-Format Harmonizer state
  const [selectedRegion, setSelectedRegion] = useState('FDA_510K');
  const [multiRegionalResults, setMultiRegionalResults] = useState({});
  const [complianceGaps, setComplianceGaps] = useState([]);
  const [harmonizationMode, setHarmonizationMode] = useState('single'); // 'single' or 'multi'
  const [gapAnalysisResults, setGapAnalysisResults] = useState(null);

  const { toast } = useToast();

  // Cross-Format Harmonizer: Multi-regional compliance validation
  const validateMultiRegionalCompliance = async (profile, regions) => {
    const results = {};
    const allGaps = [];

    for (const region of regions) {
      const framework = REGIONAL_FRAMEWORKS[region];
      if (!framework) continue;

      const regionResult = {
        region,
        framework: framework.name,
        overallScore: 0,
        sectionScores: {},
        gaps: [],
        criticalIssues: 0,
        warnings: 0,
        timestamp: new Date().toISOString(),
      };

      // Validate required fields
      const missingFields = framework.requiredFields.filter(
        field => !profile[field] || profile[field].toString().trim() === ''
      );

      missingFields.forEach(field => {
        const gap = {
          id: `missing_${field}_${region}`,
          category: GAP_CATEGORIES.MISSING_FIELD,
          region,
          severity: 'critical',
          field,
          message: `Missing required field '${field}' for ${framework.name}`,
          recommendation: `Please provide the ${field} information as required by ${framework.name}`,
        };
        regionResult.gaps.push(gap);
        allGaps.push(gap);
        regionResult.criticalIssues++;
      });

      // Validate section completeness
      let totalScore = 0;
      framework.sections.forEach(section => {
        const sectionScore = calculateSectionScore(profile, section, region);
        regionResult.sectionScores[section.id] = sectionScore;
        totalScore += sectionScore * (section.weight / 100);

        if (sectionScore < 70) {
          const gap = {
            id: `incomplete_${section.id}_${region}`,
            category: GAP_CATEGORIES.VALIDATION_ERROR,
            region,
            severity: sectionScore < 50 ? 'critical' : 'warning',
            section: section.name,
            score: sectionScore,
            message: `${section.name} section incomplete for ${framework.name} (${sectionScore}% complete)`,
            recommendation: `Complete the ${section.name} documentation to meet ${framework.name} requirements`,
          };
          regionResult.gaps.push(gap);
          allGaps.push(gap);

          if (sectionScore < 50) {
            regionResult.criticalIssues++;
          } else {
            regionResult.warnings++;
          }
        }
      });

      regionResult.overallScore = Math.round(totalScore);
      results[region] = regionResult;
    }

    // Detect cross-regional inconsistencies
    const crossRegionalGaps = detectCrossRegionalInconsistencies(profile, regions, results);
    allGaps.push(...crossRegionalGaps);

    return {
      results,
      totalGaps: allGaps.length,
      gaps: allGaps,
      avgScore: Math.round(
        Object.values(results).reduce((sum, r) => sum + r.overallScore, 0) / regions.length
      ),
      timestamp: new Date().toISOString(),
    };
  };

  // Calculate section completeness score
  const calculateSectionScore = (profile, section, region) => {
    // Basic scoring logic - can be enhanced with more sophisticated rules
    const framework = REGIONAL_FRAMEWORKS[region];
    let score = 0;

    // Check if required fields for this section are present
    const sectionFields = getSectionFields(section.id, region);
    const completedFields = sectionFields.filter(
      field => profile[field] && profile[field].toString().trim() !== ''
    );

    score = sectionFields.length > 0 ? (completedFields.length / sectionFields.length) * 100 : 100;

    return Math.round(score);
  };

  // Get fields associated with a section
  const getSectionFields = (sectionId, region) => {
    const fieldMap = {
      device_description: ['deviceName', 'deviceType', 'description', 'technicalCharacteristics'],
      intended_use: ['intendedUse'],
      intended_purpose: ['intendedPurpose'],
      substantial_equivalence: ['performanceData'],
      clinical_evaluation: ['clinicalEvidence'],
      risk_management: ['riskManagement'],
      performance_data: ['performanceData'],
      safety_effectiveness: ['performanceData', 'materials'],
      quality_system: ['qualityAssurance', 'manufacturingProcess'],
      labeling: ['deviceName', 'intendedUse'],
      canadian_requirements: ['licenseeInformation'],
      technical_documentation: ['technicalCharacteristics', 'materials'],
      post_market_surveillance: ['postMarketSurveillance'],
    };

    return fieldMap[sectionId] || [];
  };

  // Detect inconsistencies across regions
  const detectCrossRegionalInconsistencies = (profile, regions, results) => {
    const gaps = [];

    // Check for classification inconsistencies
    if (regions.length > 1) {
      const classifications = {};
      regions.forEach(region => {
        if (region === 'FDA_510K' && profile.deviceClass) {
          classifications[region] = profile.deviceClass;
        } else if (region === 'EU_MDR' && profile.mdrClassification) {
          classifications[region] = profile.mdrClassification;
        } else if (region === 'HEALTH_CANADA' && profile.healthCanadaClass) {
          classifications[region] = profile.healthCanadaClass;
        }
      });

      // Add cross-regional gap if classifications don't align
      const classValues = Object.values(classifications);
      if (classValues.length > 1 && new Set(classValues).size > 1) {
        gaps.push({
          id: 'cross_regional_classification',
          category: GAP_CATEGORIES.CROSS_REFERENCE,
          region: 'multi-regional',
          severity: 'warning',
          message: 'Device classifications are inconsistent across regions',
          recommendation: 'Review and align device classifications for regulatory consistency',
          details: classifications,
        });
      }
    }

    return gaps;
  };

  // Enhanced compliance check with multi-regional support
  const runMultiRegionalCompliance = async () => {
    setChecking(true);
    setError(null);

    try {
      if (!deviceProfile) {
        throw new Error('Device profile is required for compliance checking');
      }

      const regions = harmonizationMode === 'multi' ? targetMarkets : [selectedRegion];
      const analysisResult = await validateMultiRegionalCompliance(deviceProfile, regions);

      setMultiRegionalResults(analysisResult.results);
      setComplianceGaps(analysisResult.gaps);
      setGapAnalysisResults(analysisResult);

      // Set traditional results format for compatibility
      const primaryRegion = regions[0];
      const primaryResult = analysisResult.results[primaryRegion];

      setResults({
        overallScore: analysisResult.avgScore,
        completedSections: Object.values(analysisResult.results).reduce(
          (sum, r) => sum + Object.values(r.sectionScores).filter(score => score >= 70).length,
          0
        ),
        totalSections: Object.values(analysisResult.results).reduce(
          (sum, r) => sum + Object.keys(r.sectionScores).length,
          0
        ),
        criticalIssues: analysisResult.gaps.filter(g => g.severity === 'critical').length,
        warnings: analysisResult.gaps.filter(g => g.severity === 'warning').length,
        sections: Object.values(analysisResult.results).flatMap(result =>
          Object.entries(result.sectionScores).map(([sectionId, score]) => ({
            id: `${sectionId}_${result.region}`,
            name: `${sectionId.replace('_', ' ').toUpperCase()} (${REGIONAL_FRAMEWORKS[result.region].name})`,
            status: score >= 70 ? 'passed' : score >= 50 ? 'warning' : 'failed',
            checks: result.gaps
              .filter(gap => gap.section && gap.section.toLowerCase().includes(sectionId))
              .map(gap => ({
                id: gap.id,
                description: gap.message,
                message: gap.recommendation,
                status: gap.severity === 'critical' ? 'failed' : 'warning',
                autoFixAvailable: false,
              })),
          }))
        ),
      });

      toast({
        title: 'Multi-Regional Compliance Check Complete',
        description: `Checked ${regions.length} region(s) with ${analysisResult.totalGaps} gap(s) detected`,
      });
    } catch (err) {
      console.error('Error running multi-regional compliance check:', err);
      setError('Failed to run multi-regional compliance check. Please try again.');
      toast({
        title: 'Error Running Check',
        description: 'There was a problem running the compliance check',
        variant: 'destructive',
      });
    } finally {
      setChecking(false);
    }
  };

  // Fetch initial compliance results
  useEffect(() => {
    if (projectId) {
      fetchComplianceResults();
    }
  }, [projectId]);

  // Auto-run multi-regional compliance when device profile changes
  useEffect(() => {
    if (deviceProfile && targetMarkets.length > 0) {
      runMultiRegionalCompliance();
    }
  }, [deviceProfile, targetMarkets, harmonizationMode, selectedRegion]);

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

  // Legacy compliance check (maintain compatibility)
  const runComplianceCheck = async () => {
    if (harmonizationMode === 'multi' || deviceProfile) {
      // Use enhanced multi-regional compliance
      return runMultiRegionalCompliance();
    }

    // Fallback to legacy single-region check
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
      <div className="bg-gradient-to-r from-blue-600 to-indigo-700 px-6 py-4 text-white">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2 bg-white/20 rounded-lg">
              <FaGlobe className="h-5 w-5 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-medium">Multi-Regional Compliance Validator</h3>
              <p className="text-blue-100 text-sm mt-1">
                Cross-Format Harmonizer: Validate across FDA 510(k), EU MDR, and Health Canada
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {gapAnalysisResults && (
              <Badge variant="outline" className="bg-white/20 text-white border-white/30">
                <FaBalanceScale className="h-3 w-3 mr-1" />
                {gapAnalysisResults.totalGaps} Gap{gapAnalysisResults.totalGaps !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Cross-Format Harmonizer: Regional Compliance Controls */}
      <div className="px-6 py-4 bg-gray-50 border-b">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div>
            <label className="text-sm font-medium text-gray-700 mb-2 block">Compliance Mode</label>
            <Select
              value={harmonizationMode}
              onValueChange={setHarmonizationMode}
              data-testid="select-compliance-mode"
            >
              <SelectTrigger className="bg-white">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="single">
                  <span className="flex items-center space-x-2">
                    <FaShieldAlt className="h-3 w-3" />
                    <span>Single Region</span>
                  </span>
                </SelectItem>
                <SelectItem value="multi">
                  <span className="flex items-center space-x-2">
                    <FaGlobe className="h-3 w-3" />
                    <span>Multi-Regional Harmonization</span>
                  </span>
                </SelectItem>
              </SelectContent>
            </Select>
          </div>

          {harmonizationMode === 'single' && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Target Region</label>
              <Select
                value={selectedRegion}
                onValueChange={setSelectedRegion}
                data-testid="select-single-region"
              >
                <SelectTrigger className="bg-white">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(REGIONAL_FRAMEWORKS).map(([key, framework]) => (
                    <SelectItem key={key} value={key}>
                      <span className="flex items-center space-x-2">
                        <span>{framework.flag}</span>
                        <span>{framework.name}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {harmonizationMode === 'multi' && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">
                Target Markets ({targetMarkets.length})
              </label>
              <div className="flex flex-wrap gap-1">
                {targetMarkets.map(market => {
                  const framework = REGIONAL_FRAMEWORKS[market];
                  return framework ? (
                    <Badge key={market} variant="outline" className="text-xs">
                      {framework.flag} {framework.name}
                    </Badge>
                  ) : null;
                })}
              </div>
            </div>
          )}

          <div className="flex items-end">
            <Button
              onClick={runMultiRegionalCompliance}
              disabled={checking}
              variant="default"
              className="w-full"
              data-testid="button-run-compliance"
            >
              {checking ? (
                <>
                  <FaSpinner className="animate-spin h-4 w-4 mr-2" />
                  Validating...
                </>
              ) : (
                <>
                  <FaBalanceScale className="h-4 w-4 mr-2" />
                  {harmonizationMode === 'multi' ? 'Validate All Regions' : 'Run Validation'}
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      <CardHeader>
        <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
          <div>
            <CardDescription className="text-gray-600">
              Automated {harmonizationMode === 'multi' ? 'multi-regional' : 'regulatory'} validation
              with Cross-Format Harmonizer
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <DropdownMenu open={exportDropdownOpen} onOpenChange={setExportDropdownOpen}>
              <DropdownMenuTrigger asChild>
                <Button
                  disabled={exporting || !results}
                  variant="outline"
                  className="gap-2"
                  data-testid="button-export"
                >
                  {exporting ? (
                    <>
                      <FaSpinner className="animate-spin h-4 w-4" />
                      Exporting...
                    </>
                  ) : (
                    <>
                      <FaDownload className="h-4 w-4" />
                      Export Report
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
            {/* Cross-Format Harmonizer: Multi-Regional Compliance Summary */}
            {gapAnalysisResults && harmonizationMode === 'multi' && (
              <Alert className="mb-6 bg-gradient-to-r from-blue-50 to-indigo-50 border-blue-200">
                <FaGlobe className="h-4 w-4" />
                <AlertTitle className="text-blue-900">Multi-Regional Analysis Complete</AlertTitle>
                <AlertDescription className="text-blue-800">
                  Validated across {Object.keys(multiRegionalResults).length} regulatory frameworks
                  with
                  {gapAnalysisResults.totalGaps} compliance gaps detected. Average compliance score:{' '}
                  {gapAnalysisResults.avgScore}%
                </AlertDescription>
              </Alert>
            )}

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

            {/* Cross-Format Harmonizer: Compliance Gaps Display */}
            {complianceGaps.length > 0 && (
              <div className="mb-6">
                <h3 className="text-lg font-medium mb-4 flex items-center">
                  <FaExclamationTriangle className="h-5 w-5 text-amber-500 mr-2" />
                  Compliance Gaps ({complianceGaps.length})
                </h3>
                <div className="space-y-3">
                  {complianceGaps.slice(0, 5).map((gap, index) => (
                    <Alert
                      key={gap.id}
                      className={`${
                        gap.severity === 'critical'
                          ? 'border-red-200 bg-red-50'
                          : 'border-amber-200 bg-amber-50'
                      }`}
                    >
                      <div className="flex items-start space-x-3">
                        {gap.severity === 'critical' ? (
                          <FaExclamationCircle className="h-4 w-4 text-red-600 mt-0.5" />
                        ) : (
                          <FaExclamationTriangle className="h-4 w-4 text-amber-600 mt-0.5" />
                        )}
                        <div className="flex-grow">
                          <div className="flex items-center justify-between">
                            <AlertTitle
                              className={`text-sm font-medium ${
                                gap.severity === 'critical' ? 'text-red-800' : 'text-amber-800'
                              }`}
                            >
                              {gap.message}
                            </AlertTitle>
                            <div className="flex items-center space-x-2">
                              {gap.region !== 'multi-regional' && (
                                <Badge variant="outline" className="text-xs">
                                  {REGIONAL_FRAMEWORKS[gap.region]?.flag}{' '}
                                  {REGIONAL_FRAMEWORKS[gap.region]?.name}
                                </Badge>
                              )}
                              <Badge
                                variant={gap.severity === 'critical' ? 'destructive' : 'secondary'}
                                className="text-xs"
                              >
                                {gap.category}
                              </Badge>
                            </div>
                          </div>
                          <AlertDescription
                            className={`text-xs mt-1 ${
                              gap.severity === 'critical' ? 'text-red-700' : 'text-amber-700'
                            }`}
                          >
                            {gap.recommendation}
                          </AlertDescription>
                        </div>
                      </div>
                    </Alert>
                  ))}
                  {complianceGaps.length > 5 && (
                    <div className="text-center py-2">
                      <Button variant="outline" size="sm" className="text-gray-600">
                        View {complianceGaps.length - 5} more gaps
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            )}

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
