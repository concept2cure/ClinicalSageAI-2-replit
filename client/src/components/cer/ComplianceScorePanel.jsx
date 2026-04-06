import React, { useState, useEffect } from 'react';
import { cerApiService } from '@/services/CerAPIService';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  CardFooter,
} from '@/components/ui/card';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toaster';
import {
  Info,
  CheckCircle,
  AlertCircle,
  RefreshCw,
  FileText,
  Sparkles,
  Zap,
  XCircle,
  Plus,
  Shield,
  BarChart4,
  ArrowRight,
  ExternalLink,
  FileCheck,
  BookOpen,
} from 'lucide-react';

export default function ComplianceScorePanel({
  sections,
  title = 'Clinical Evaluation Report',
  onComplianceChange,
  onStatusChange,
}) {
  const [analyzing, setAnalyzing] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState(null);
  const [complianceData, setComplianceData] = useState(null);
  const [improvingSection, setImprovingSection] = useState(null);
  const [selectedStandard, setSelectedStandard] = useState(null);
  const [isImproving, setIsImproving] = useState(false);
  const [improvedContent, setImprovedContent] = useState('');
  const { toast } = useToast();

  // Update parent component with compliance data if callback provided
  useEffect(() => {
    if (complianceData && onComplianceChange) {
      onComplianceChange(complianceData);

      // Update status based on score if callback provided
      if (onStatusChange && complianceData.overallScore >= 0.8) {
        onStatusChange('ready-for-review');
      }
    }
  }, [complianceData, onComplianceChange, onStatusChange]);

  // Various regulatory standards for compliance analysis
  const availableStandards = [
    { id: 'EU_MDR', name: 'EU MDR 2017/745', description: 'European Medical Device Regulation' },
    {
      id: 'ISO_14155',
      name: 'ISO 14155:2020',
      description: 'Clinical investigation of medical devices',
    },
    {
      id: 'FDA_21CFR812',
      name: 'FDA 21 CFR 812',
      description: 'Investigational Device Exemptions',
    },
    { id: 'ISO_13485', name: 'ISO 13485:2016', description: 'Quality management systems' },
    { id: 'MEDDEV_271', name: 'MEDDEV 2.7/1 Rev 4', description: 'Clinical evaluation guidance' },
    { id: 'IVDR_2017746', name: 'EU IVDR 2017/746', description: 'In Vitro Diagnostic Regulation' },
    { id: 'FDA_21CFR820', name: 'FDA 21 CFR 820', description: 'Quality System Regulation' },
    {
      id: 'IMDRF_MDCE',
      name: 'IMDRF MDCE',
      description: 'Medical Device Clinical Evaluation guidance',
    },
  ];

  // Selected regulatory standards (default to EU MDR, ISO 14155, and FDA)
  const [selectedStandards, setSelectedStandards] = useState([
    'EU_MDR',
    'ISO_14155',
    'FDA_21CFR812',
  ]);

  // Function to run compliance analysis with optional custom sections
  const runComplianceAnalysis = async (customSections = null) => {
    try {
      setAnalyzing(true);
      setError(null);

      // Use provided sections or current sections prop
      const sectionsToAnalyze = customSections || sections;

      if (!sectionsToAnalyze || sectionsToAnalyze.length === 0) {
        setError('No sections to analyze');
        setAnalyzing(false);
        return;
      }

      console.log(
        `Running compliance analysis for ${sectionsToAnalyze.length} sections against ${selectedStandards.length} standards`
      );

      // Map standard IDs to full names for API call
      const standardNames = selectedStandards.map(id => {
        const standard = availableStandards.find(s => s.id === id);
        return standard ? standard.name : id;
      });

      // Call the compliance score API
      const scoreData = await cerApiService.getComplianceScore({
        sections: sectionsToAnalyze,
        title,
        standards: standardNames,
      });

      setComplianceData(scoreData);

      toast({
        title: 'Compliance Analysis Complete',
        description: `Overall compliance score: ${(scoreData.overall * 100).toFixed(1)}%`,
        variant: scoreData.overall >= 0.8 ? 'default' : 'destructive',
      });
    } catch (error) {
      console.error('Error running compliance analysis:', error);
      setError(error.message || 'Failed to analyze compliance');

      toast({
        title: 'Analysis Failed',
        description: error.message || 'Could not complete compliance analysis',
        variant: 'destructive',
      });
    } finally {
      setAnalyzing(false);
    }
  };

  // Function to handle section improvement requests
  const handleImproveSectionRequest = async (section, standard) => {
    try {
      setImprovingSection(section);
      setSelectedStandard(standard);
      setIsImproving(true);
      setImprovedContent('');
      setError(null);

      console.log(
        `Requesting AI improvement for "${section.title}" section using ${standard} standard`
      );

      // Call the service to improve compliance
      const result = await cerApiService.improveSectionCompliance({
        section,
        standard,
        cerTitle: title,
      });

      setImprovedContent(result.improvedContent || result.content);

      toast({
        title: 'Section Improvement Complete',
        description: `Successfully enhanced section for ${standard} compliance`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error improving section:', error);
      setError(error.message || 'Failed to improve section');

      toast({
        title: 'Improvement Failed',
        description: error.message || 'Could not improve section compliance',
        variant: 'destructive',
      });
    } finally {
      setIsImproving(false);
    }
  };

  // Function to handle applying improved content to a section
  const handleApplyImprovedContent = () => {
    if (!improvingSection || !improvedContent) return;

    // Create a copy of the sections array
    const updatedSections = sections.map(section => {
      // Find the section being improved
      if (
        section.id === improvingSection.id ||
        (section.type === improvingSection.type && section.title === improvingSection.title)
      ) {
        // Return a new section object with updated content
        return {
          ...section,
          content: improvedContent,
          lastUpdated: new Date().toISOString(),
          complianceUpdated: true,
          appliedStandard: selectedStandard,
        };
      }
      return section;
    });

    // Update parent component with new sections if callback provided
    if (onComplianceChange) {
      // Create a new compliance data object with updated sections
      const updatedComplianceData = {
        ...complianceData,
        sections: updatedSections,
      };
      onComplianceChange(updatedComplianceData);
    }

    // Reset dialog state
    setImprovingSection(null);
    setSelectedStandard(null);
    setImprovedContent('');

    toast({
      title: 'Compliance Improved',
      description: `Section updated with ${selectedStandard} compliant content`,
      variant: 'default',
    });

    // Run a new compliance analysis with the updated sections
    runComplianceAnalysis(updatedSections);
  };
  // Function to export compliance report as PDF
  const handleExportPDF = async () => {
    if (!complianceData) return;

    try {
      setExporting(true);
      const blob = await cerApiService.exportCompliancePDF(complianceData);

      // Create a download link
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'compliance_scorecard.pdf';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export PDF error:', err);
      setError(err.message || 'Failed to export compliance report');
    } finally {
      setExporting(false);
    }
  };

  // Format percentage for display
  const formatPercent = value => `${Math.round(value * 100)}%`;

  // MS365 color helpers
  const getScoreColorClass = score => {
    if (score >= 0.8) return 'text-[#788c5d]';
    if (score >= 0.6) return 'text-[#986F0B]';
    return 'text-[#4a7399]';
  };

  const getScoreBgClass = score => {
    if (score >= 0.8) return 'bg-[#e4ebd8]';
    if (score >= 0.6) return 'bg-[#FFFCE5]';
    return 'bg-[#FDE7E9]';
  };

  const getScoreBorderClass = score => {
    if (score >= 0.8) return 'border-[#788c5d]';
    if (score >= 0.6) return 'border-[#F2C811]';
    return 'border-[#4a7399]';
  };

  return (
    <div className="space-y-4">
      {/* Compliance Analysis Panel */}
      <div className="bg-white p-4 border border-[#e8e6dc] rounded">
        <div className="flex items-center justify-between border-b border-[#e8e6dc] pb-3 mb-3">
          <div>
            <h3 className="text-base font-semibold text-[#141413]">
              Regulatory Compliance Analysis
            </h3>
            <p className="text-xs text-[#616161] mt-1">
              Proxima CRO regulatory compliance analysis against EU MDR, ISO 14155, FDA 21 CFR 812
              standards
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Dialog>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 border-[#e8e6dc] text-[#141413] hover:bg-[#F5F5F5] text-xs"
                >
                  <Shield className="h-3.5 w-3.5 mr-1.5 text-[#5585b3]" />
                  <span>Standards</span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px]">
                <DialogHeader>
                  <DialogTitle>Select Regulatory Standards</DialogTitle>
                  <DialogDescription>
                    Choose the standards to check your CER against. Select multiple standards for a
                    comprehensive analysis.
                  </DialogDescription>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  {availableStandards.map(standard => (
                    <div key={standard.id} className="flex items-center space-x-2">
                      <input
                        type="checkbox"
                        id={standard.id}
                        checked={selectedStandards.includes(standard.id)}
                        onChange={e => {
                          if (e.target.checked) {
                            setSelectedStandards([...selectedStandards, standard.id]);
                          } else {
                            // Don't allow deselecting all standards
                            if (selectedStandards.length > 1) {
                              setSelectedStandards(
                                selectedStandards.filter(id => id !== standard.id)
                              );
                            }
                          }
                        }}
                        className="h-4 w-4 rounded border-gray-300 text-[#5585b3] focus:ring-[#5585b3]"
                      />
                      <Label
                        htmlFor={standard.id}
                        className="text-sm font-medium cursor-pointer flex-grow"
                      >
                        {standard.name}
                        <span className="text-xs text-[#616161] block">{standard.description}</span>
                      </Label>
                    </div>
                  ))}
                </div>
                <DialogFooter>
                  <Button
                    type="button"
                    className="bg-[#5585b3] hover:bg-[#4a7399] text-white"
                    onClick={() =>
                      document
                        .querySelector('[role="dialog"]')
                        ?.querySelector('[role="button"][aria-label="Close"]')
                        ?.click()
                    }
                  >
                    Done
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Button
              onClick={runComplianceAnalysis}
              disabled={analyzing || sections.length === 0}
              className="bg-[#5585b3] hover:bg-[#4a7399] text-white"
              size="sm"
            >
              {analyzing ? (
                <>
                  <RefreshCw className="mr-2 h-3.5 w-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <BarChart4 className="h-3.5 w-3.5 mr-1.5" />
                  Check Compliance
                </>
              )}
            </Button>
          </div>
        </div>

        {error && (
          <div className="p-3 my-3 bg-[#FDE7E9] border border-[#4a7399] rounded">
            <div className="flex">
              <AlertCircle className="h-5 w-5 text-[#4a7399] mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-[#141413]">Analysis Failed</p>
                <p className="text-xs text-[#616161] mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {!complianceData && !analyzing && !error && (
          <div className="p-3 my-3 bg-[#faf0ec] border border-[#5585b3] rounded">
            <div className="flex">
              <Info className="h-5 w-5 text-[#5585b3] mr-2 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-[#141413]">Regulatory Compliance Check</p>
                <p className="text-xs text-[#616161] mt-1">
                  Click "Check Compliance" to analyze your report against EU MDR, FDA, and ISO 14155
                  standards. This will evaluate content quality, completeness, and alignment with
                  regulatory requirements.
                </p>
              </div>
            </div>
          </div>
        )}

        {analyzing && (
          <div className="space-y-4 my-3">
            <p className="text-sm text-[#616161]">
              Analyzing regulatory compliance against standards...
            </p>
            <div className="space-y-3">
              <Skeleton className="h-6 w-full" />
              <Skeleton className="h-24 w-full" />
              <div className="grid grid-cols-3 gap-4">
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
                <Skeleton className="h-28" />
              </div>
              <Skeleton className="h-40 w-full" />
            </div>
          </div>
        )}

        {complianceData && (
          <div className="space-y-5">
            {/* Overall Score */}
            <div className="p-4 border border-[#e8e6dc] rounded bg-white">
              <div className="flex justify-between items-start mb-3">
                <div>
                  <h4 className="text-sm font-semibold text-[#141413]">Overall Compliance</h4>
                  <p className="text-xs text-[#616161] mt-0.5">Regulatory readiness assessment</p>
                </div>
                <Badge
                  variant="outline"
                  className={`text-xs border px-2 py-0.5 ${getScoreBgClass(complianceData.overallScore)} ${getScoreColorClass(complianceData.overallScore)} ${getScoreBorderClass(complianceData.overallScore)}`}
                >
                  {complianceData.overallScore >= 0.8
                    ? 'Compliant'
                    : complianceData.overallScore >= 0.6
                      ? 'Needs Improvement'
                      : 'Non-compliant'}
                </Badge>
              </div>

              <div className="space-y-3">
                <div>
                  <div className="flex justify-between mb-1">
                    <span className="text-xs font-medium text-[#616161]">Compliance Score</span>
                    <span
                      className={`text-sm font-semibold ${getScoreColorClass(complianceData.overallScore)}`}
                    >
                      {formatPercent(complianceData.overallScore)}
                    </span>
                  </div>
                  <Progress
                    value={complianceData.overallScore * 100}
                    className={`h-2 ${getScoreBgClass(complianceData.overallScore)}`}
                  />
                </div>

                <div className="flex justify-between items-start">
                  <p className="text-xs text-[#616161] flex-grow pr-4">
                    {complianceData.summary ||
                      `This report has an overall compliance score of ${formatPercent(complianceData.overallScore)} against regulatory standards. ${complianceData.overallScore >= 0.8 ? 'The document meets regulatory requirements and is ready for submission.' : complianceData.overallScore >= 0.6 ? 'Some improvements are recommended before submission.' : 'Significant improvements are needed to meet regulatory requirements.'}`}
                  </p>
                  <Button
                    onClick={handleExportPDF}
                    disabled={exporting}
                    variant="outline"
                    size="sm"
                    className="h-8 border-[#5585b3] text-[#5585b3] text-xs hover:bg-[#faf0ec]"
                  >
                    {exporting ? (
                      <RefreshCw className="h-3 w-3 mr-1.5 animate-spin" />
                    ) : (
                      <FileText className="h-3 w-3 mr-1.5" />
                    )}
                    <span>{exporting ? 'Exporting...' : 'Export Report'}</span>
                  </Button>
                </div>
              </div>
            </div>

            {/* Standards Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {Object.entries(complianceData.standards || {}).map(([standard, data]) => (
                <div key={standard} className="p-4 border border-[#e8e6dc] rounded bg-white">
                  <h4 className="text-sm font-semibold text-[#141413] mb-2">{standard}</h4>
                  <div className="text-xl font-bold text-[#141413] flex items-center gap-2">
                    {formatPercent(data.overallScore)}
                    <Badge
                      variant="outline"
                      className={`text-xs border px-2 py-0.5 ${getScoreBgClass(data.overallScore)} ${getScoreColorClass(data.overallScore)} ${getScoreBorderClass(data.overallScore)}`}
                    >
                      {data.overallScore >= 0.8
                        ? 'Pass'
                        : data.overallScore >= 0.6
                          ? 'Needs Work'
                          : 'Non-compliant'}
                    </Badge>
                  </div>
                  <p className="text-xs text-[#616161] mt-1">
                    {Object.keys(data.sectionScores || {}).length} sections analyzed
                  </p>
                </div>
              ))}
            </div>

            {/* Section Breakdown by Framework */}
            {Object.entries(complianceData.standards || {}).map(([framework, frameworkData]) => (
              <div key={framework} className="p-4 border border-[#e8e6dc] rounded bg-white">
                <h4 className="text-sm font-semibold text-[#141413] mb-1">
                  {framework} Section Analysis
                </h4>
                <p className="text-xs text-[#616161] mb-3">
                  Detailed compliance analysis by section
                </p>

                <Accordion
                  type="single"
                  collapsible
                  className="border border-[#e8e6dc] rounded-sm divide-y divide-[#e8e6dc]"
                >
                  {Object.entries(frameworkData.sectionScores || {}).map(([sectionType, score]) => {
                    // Find matching section in generated sections
                    const matchingSection = sections.find(s => s.type === sectionType);
                    if (!matchingSection) return null;

                    // Get the standard name to use when improving
                    const standardName = framework; // Using the framework name directly

                    return (
                      <AccordionItem value={sectionType} key={sectionType} className="border-0">
                        <AccordionTrigger className="hover:no-underline py-2.5 px-3">
                          <div className="flex items-center justify-between w-full pr-2">
                            <span className="text-sm text-[#141413]">{matchingSection.title}</span>
                            <span className={`${getScoreColorClass(score)} font-medium text-sm`}>
                              {formatPercent(score)}
                            </span>
                          </div>
                        </AccordionTrigger>
                        <AccordionContent className="px-3 pb-3 pt-0">
                          <div className="pt-1">
                            <div
                              className={`p-3 rounded ${getScoreBgClass(score)} border ${getScoreBorderClass(score)}`}
                            >
                              <h5 className="font-medium mb-1.5 text-sm text-[#141413]">
                                Compliance Analysis
                              </h5>
                              <p className="text-xs text-[#616161]">
                                {score >= 0.8
                                  ? `This section meets ${framework} requirements and is compliant.`
                                  : score >= 0.6
                                    ? `This section needs some improvements to fully meet ${framework} requirements.`
                                    : `This section requires significant revisions to meet ${framework} requirements.`}
                              </p>

                              {score < 0.8 && (
                                <div className="mt-2">
                                  <h6 className="text-xs font-medium mb-1 text-[#141413]">
                                    Improvement Suggestions:
                                  </h6>
                                  <ul className="list-disc list-outside text-xs space-y-1 text-[#616161] ml-3">
                                    {score < 0.6 && (
                                      <li>
                                        Add more detailed information specific to {framework}{' '}
                                        requirements
                                      </li>
                                    )}
                                    <li>
                                      Enhance content with specific references to {framework}{' '}
                                      standards
                                    </li>
                                    <li>Include more quantitative data and analysis</li>
                                  </ul>

                                  <Button
                                    size="sm"
                                    onClick={() => {
                                      setImprovingSection(matchingSection);
                                      setSelectedStandard(framework);
                                    }}
                                    className="mt-2 h-8 bg-[#5585b3] hover:bg-[#4a7399] text-white text-xs"
                                  >
                                    <Sparkles className="h-3 w-3 mr-1.5" />
                                    <span>AI-Improve Section</span>
                                  </Button>
                                </div>
                              )}
                            </div>
                          </div>
                        </AccordionContent>
                      </AccordionItem>
                    );
                  })}
                </Accordion>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* AI-Powered Improvement Dialog */}
      {improvingSection && (
        <Dialog
          open={!!improvingSection}
          onOpenChange={open => {
            if (!open) {
              setImprovingSection(null);
              setSelectedStandard(null);
              setImprovedContent('');
            }
          }}
        >
          <DialogContent className="sm:max-w-[700px]">
            <DialogHeader>
              <DialogTitle className="text-[#141413] flex items-center">
                <Sparkles className="h-4 w-4 mr-2 text-[#5585b3]" />
                AI-Powered Compliance Improvement
              </DialogTitle>
              <DialogDescription className="text-[#616161]">
                Automatically enhance the "{improvingSection?.title}" section to increase{' '}
                {selectedStandard} compliance.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 py-4">
              {!improvedContent ? (
                <div className="p-4 bg-[#faf0ec] border border-[#5585b3] rounded">
                  <h4 className="text-sm font-medium text-[#141413] mb-2">
                    How AI Improvement Works
                  </h4>
                  <p className="text-xs text-[#616161] mb-3">
                    Our AI will analyze your current content against {selectedStandard} requirements
                    and suggest improvements to:
                  </p>
                  <ul className="list-disc list-inside text-xs text-[#616161] space-y-1.5 mb-3">
                    <li>Add missing regulatory references</li>
                    <li>Enhance compliance with {selectedStandard} guidelines</li>
                    <li>Improve structure and completeness</li>
                    <li>Maintain your original content while enhancing regulatory aspects</li>
                  </ul>

                  <Button
                    onClick={async () => {
                      try {
                        setIsImproving(true);
                        const result = await cerApiService.getComplianceImprovements({
                          section: improvingSection,
                          complianceData:
                            complianceData?.standards?.[selectedStandard]?.sectionScores || {},
                          standard: selectedStandard,
                        });
                        setImprovedContent(result.improvedContent || result.content);

                        toast({
                          title: 'Improvement Generated',
                          description:
                            'Review the AI-suggested improvements and apply them if satisfied.',
                          variant: 'default',
                        });
                      } catch (error) {
                        console.error('Error improving content:', error);
                        toast({
                          title: 'Improvement Failed',
                          description: error.message || 'Failed to generate improvements',
                          variant: 'destructive',
                        });
                      } finally {
                        setIsImproving(false);
                      }
                    }}
                    className="bg-[#5585b3] hover:bg-[#4a7399] text-white text-sm w-full"
                    disabled={isImproving}
                  >
                    {isImproving ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Generating Improvements...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Generate Compliant Version
                      </>
                    )}
                  </Button>
                </div>
              ) : (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="improved-content" className="text-[#141413] flex items-center">
                      <CheckCircle className="h-3.5 w-3.5 text-[#788c5d] mr-1.5" />
                      AI-Enhanced Content
                    </Label>
                    <Textarea
                      id="improved-content"
                      value={improvedContent}
                      onChange={e => setImprovedContent(e.target.value)}
                      className="h-48 text-sm border-[#e8e6dc] focus:border-[#5585b3] focus:ring-[#5585b3]"
                    />
                    <p className="text-xs text-[#616161]">
                      You can further edit the content before applying it to your report.
                    </p>
                  </div>

                  <div className="space-y-2 p-3 border border-[#e8e6dc] rounded bg-[#faf9f5]">
                    <h5 className="text-xs font-medium text-[#141413] mb-1">
                      Compliance Improvements
                    </h5>
                    <ul className="list-disc list-inside text-xs text-[#616161] space-y-1">
                      <li>Added specific {selectedStandard} regulatory references</li>
                      <li>Enhanced compliance language</li>
                      <li>Structured content according to regulatory guidelines</li>
                      <li>Added necessary technical detail and precision</li>
                    </ul>
                  </div>
                </>
              )}
            </div>

            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => {
                  setImprovingSection(null);
                  setSelectedStandard(null);
                  setImprovedContent('');
                }}
                className="border-[#e8e6dc] text-[#616161]"
              >
                <XCircle className="h-3.5 w-3.5 mr-1.5" />
                Cancel
              </Button>

              {improvedContent && (
                <Button
                  onClick={() => {
                    // Find and update the target section with improved content
                    const updatedSections = sections.map(section => {
                      if (section.id === improvingSection.id) {
                        return {
                          ...section,
                          content: improvedContent,
                        };
                      }
                      return section;
                    });

                    // Update sections through callback
                    if (onComplianceChange) {
                      // Re-run compliance check with updated content
                      runComplianceAnalysis(updatedSections);
                    }

                    toast({
                      title: 'Section Updated',
                      description: `"${improvingSection.title}" has been updated with improved content.`,
                      variant: 'default',
                    });

                    // Close dialog
                    setImprovingSection(null);
                    setSelectedStandard(null);
                    setImprovedContent('');
                  }}
                  className="bg-[#5585b3] hover:bg-[#4a7399] text-white"
                >
                  <Plus className="h-3.5 w-3.5 mr-1.5" />
                  Apply Improvements
                </Button>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
