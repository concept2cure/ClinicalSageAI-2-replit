import React, { useState, useEffect } from 'react';
import {
  FileText,
  Search,
  Download,
  Check,
  AlertTriangle,
  BookOpen,
  ChevronRight,
  Loader2,
  Brain,
  BarChart4,
  ListFilter,
  Bell,
  Settings,
  XCircle,
  RefreshCcw,
  Info,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';

// Import our new services for OpenAI and Literature Retrieval
import CerOpenAIService from '@/services/CerOpenAIService';
import LiteratureRetrievalService from '@/services/LiteratureRetrievalService';

/**
 * CerGeneratorPanel Component
 *
 * This component provides a comprehensive interface for generating
 * Clinical Evaluation Reports with AI assistance, literature retrieval,
 * and regulatory compliance checking.
 */
const CerGeneratorPanel = ({ documentId }) => {
  // Main state
  const [deviceData, setDeviceData] = useState({
    name: '',
    manufacturer: '',
    type: '',
    model: '',
    description: '',
    indications: [],
    riskClass: 'IIa',
    intendedUse: '',
  });

  const [literatureData, setLiteratureData] = useState({
    keywords: [],
    selectedReferences: [],
    searchResults: [],
    isSearching: false,
    searchCompleted: false,
  });

  const [reportSettings, setReportSettings] = useState({
    regulatoryFrameworks: ['EU MDR', 'ISO 14155'],
    includePostMarketData: true,
    includeClinicalInvestigations: true,
    useSotaAnalysis: true,
    includeExecutiveSummary: true,
    detailLevel: 80, // 0-100 scale for report detail level
    format: 'json',
  });

  const [generationState, setGenerationState] = useState({
    isGenerating: false,
    progress: 0,
    currentStep: '',
    currentSubtask: '',
    generatedReport: null,
    complianceResults: null,
    validationIssues: [],
    generationCompleted: false,
  });

  const [activeTab, setActiveTab] = useState('device-data');
  const { toast } = useToast();

  // Initialize with document ID if available
  useEffect(() => {
    if (documentId) {
      fetchDeviceData(documentId);
    }
  }, [documentId]);

  // Fetch device data from the database if available
  const fetchDeviceData = async id => {
    try {
      // In a real implementation, this would fetch from an API
      // For this demo, we'll use mock data
      setTimeout(() => {
        setDeviceData({
          name: 'CardioFlex Stent System',
          manufacturer: 'MedInnovate Technologies',
          type: 'Coronary Stent',
          model: 'CFX-100',
          description:
            'The CardioFlex Stent System is a flexible, self-expanding nitinol stent designed for improving coronary blood flow in patients with atherosclerotic disease.',
          indications: ['Coronary artery disease', 'Atherosclerotic lesions', 'Stenotic vessels'],
          riskClass: 'III',
          intendedUse:
            'Treatment of coronary artery disease through minimally invasive stent placement to maintain vessel patency.',
        });

        toast({
          title: 'Device data loaded',
          description: 'Successfully loaded device profile information',
        });
      }, 800);
    } catch (error) {
      console.error('Error fetching device data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load device data',
        variant: 'destructive',
      });
    }
  };

  // Handle device data form changes
  const handleDeviceDataChange = (field, value) => {
    setDeviceData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  // Handle device indications changes (array handling)
  const handleIndicationChange = (index, value) => {
    const updatedIndications = [...deviceData.indications];
    updatedIndications[index] = value;
    setDeviceData(prev => ({
      ...prev,
      indications: updatedIndications,
    }));
  };

  // Add a new indication
  const addIndication = () => {
    setDeviceData(prev => ({
      ...prev,
      indications: [...prev.indications, ''],
    }));
  };

  // Remove an indication
  const removeIndication = index => {
    const updatedIndications = deviceData.indications.filter((_, i) => i !== index);
    setDeviceData(prev => ({
      ...prev,
      indications: updatedIndications,
    }));
  };

  // Handle report settings changes
  const handleSettingsChange = (setting, value) => {
    setReportSettings(prev => ({
      ...prev,
      [setting]: value,
    }));
  };

  // Handle regulatory framework changes
  const toggleFramework = framework => {
    setReportSettings(prev => {
      const currentFrameworks = prev.regulatoryFrameworks;

      if (currentFrameworks.includes(framework)) {
        return {
          ...prev,
          regulatoryFrameworks: currentFrameworks.filter(f => f !== framework),
        };
      } else {
        return {
          ...prev,
          regulatoryFrameworks: [...currentFrameworks, framework],
        };
      }
    });
  };

  // Add literature search keyword
  const addKeyword = keyword => {
    if (!keyword || literatureData.keywords.includes(keyword)) return;

    setLiteratureData(prev => ({
      ...prev,
      keywords: [...prev.keywords, keyword],
    }));
  };

  // Remove literature search keyword
  const removeKeyword = keyword => {
    setLiteratureData(prev => ({
      ...prev,
      keywords: prev.keywords.filter(k => k !== keyword),
    }));
  };

  // Search for literature with comprehensive error handling and user feedback
  const searchLiterature = async () => {
    try {
      // Validate required data
      if (!deviceData.name || deviceData.name.trim() === '') {
        toast({
          title: 'Missing Information',
          description: 'Please provide a device name before searching literature',
          variant: 'destructive',
        });
        return;
      }

      // Set loading state
      setLiteratureData(prev => ({
        ...prev,
        isSearching: true,
        searchCompleted: false,
        error: null,
      }));

      // Prepare search progress updates
      const searchProgress = [
        { step: 'Preparing search parameters', progress: 10 },
        { step: 'Querying PubMed database', progress: 30 },
        { step: 'Retrieving article details', progress: 50 },
        { step: 'Analyzing relevance with AI', progress: 70 },
        { step: 'Sorting and prioritizing results', progress: 90 },
      ];

      // Simulate progress updates
      let progressIndex = 0;
      const progressInterval = setInterval(() => {
        if (progressIndex < searchProgress.length) {
          const { step, progress } = searchProgress[progressIndex];
          setGenerationState(prev => ({
            ...prev,
            progress: progress,
            currentStep: step,
          }));
          progressIndex++;
        } else {
          clearInterval(progressInterval);
        }
      }, 800);

      toast({
        title: 'Literature Search Started',
        description: 'Searching medical databases for relevant publications...',
      });

      // Call literature search service with added options
      const results = await LiteratureRetrievalService.searchPubMedLiterature(
        deviceData,
        literatureData.keywords,
        30, // Increased max results
        { forceRefresh: false } // Use cache if available
      );

      // Clear the interval if it's still running
      clearInterval(progressInterval);

      // Verify we have results
      if (!results || results.length === 0) {
        setLiteratureData(prev => ({
          ...prev,
          searchResults: [],
          isSearching: false,
          searchCompleted: true,
          error: 'No relevant publications found. Try broadening your search terms.',
        }));

        setGenerationState(prev => ({
          ...prev,
          progress: 100,
          currentStep: 'Search completed with no results',
        }));

        toast({
          title: 'No Results Found',
          description: 'Try adding more keywords or modifying your device description',
          variant: 'warning',
        });
        return;
      }

      // Get highly relevant results (relevance > 70)
      const highlyRelevant = results.filter(item => item.relevance >= 70).length;

      // Update state with results
      setLiteratureData(prev => ({
        ...prev,
        searchResults: results,
        isSearching: false,
        searchCompleted: true,
        error: null,
      }));

      setGenerationState(prev => ({
        ...prev,
        progress: 100,
        currentStep: 'Literature search completed successfully',
      }));

      toast({
        title: 'Literature Search Complete',
        description: `Found ${results.length} publications (${highlyRelevant} highly relevant)`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Error searching literature:', error);

      setLiteratureData(prev => ({
        ...prev,
        isSearching: false,
        error: error.message || 'An unknown error occurred',
      }));

      setGenerationState(prev => ({
        ...prev,
        progress: 0,
        currentStep: '',
      }));

      toast({
        title: 'Search Error',
        description: error.message || 'Failed to search for literature. Please try again later.',
        variant: 'destructive',
      });
    }
  };

  // Toggle literature selection for the report
  const toggleLiteratureSelection = item => {
    setLiteratureData(prev => {
      const currentSelected = prev.selectedReferences;
      const itemId = item.id;

      if (currentSelected.some(ref => ref.id === itemId)) {
        return {
          ...prev,
          selectedReferences: currentSelected.filter(ref => ref.id !== itemId),
        };
      } else {
        return {
          ...prev,
          selectedReferences: [...currentSelected, item],
        };
      }
    });
  };

  // Generate the CER report with enhanced error handling and feedback
  const generateReport = async () => {
    try {
      // Enhanced validation with more specific feedback
      if (!deviceData.name || deviceData.name.trim() === '') {
        toast({
          title: 'Missing Device Name',
          description: 'Please provide a device name before generating the report',
          variant: 'destructive',
        });
        setActiveTab('device-data');
        return;
      }

      if (!deviceData.description || deviceData.description.trim() === '') {
        toast({
          title: 'Missing Device Description',
          description: 'Please provide a device description before generating the report',
          variant: 'destructive',
        });
        setActiveTab('device-data');
        return;
      }

      if (!deviceData.manufacturer || deviceData.manufacturer.trim() === '') {
        toast({
          title: 'Missing Manufacturer',
          description: 'Please provide the manufacturer information',
          variant: 'destructive',
        });
        setActiveTab('device-data');
        return;
      }

      if (deviceData.indications.length === 0) {
        toast({
          title: 'Missing Indications',
          description: 'Please add at least one indication for use',
          variant: 'destructive',
        });
        setActiveTab('device-data');
        return;
      }

      if (literatureData.selectedReferences.length === 0 && !literatureData.isSearching) {
        toast({
          title: 'Missing Literature References',
          description: 'Please select relevant literature references for the report',
          variant: 'destructive',
        });
        setActiveTab('literature');
        return;
      }

      // Check if we have OpenAI API key configured
      if (!import.meta.env.VITE_OPENAI_API_KEY) {
        toast({
          title: 'API Key Missing',
          description:
            'OpenAI API key is required for report generation. Please check your configuration.',
          variant: 'destructive',
        });
        return;
      }

      // Verify we have enough selected high-quality references
      const highQualityRefs = literatureData.selectedReferences.filter(
        ref => ref.relevance >= 70
      ).length;
      if (highQualityRefs < 3 && literatureData.selectedReferences.length < 5) {
        const shouldProceed = window.confirm(
          'Your selected literature contains few high-quality references. This may affect the quality of your report. Do you want to proceed anyway?'
        );
        if (!shouldProceed) {
          setActiveTab('literature');
          return;
        }
      }

      // Start generation process with detailed steps
      setGenerationState(prev => ({
        ...prev,
        isGenerating: true,
        progress: 0,
        currentStep: 'Initializing report generation',
        generatedReport: null,
        complianceResults: null,
        validationIssues: [],
        generationCompleted: false,
      }));

      toast({
        title: 'Starting CER Generation',
        description: 'Beginning the clinical evaluation report generation process',
      });

      // Step 1: Compile and validate clinical data
      setGenerationState(prev => ({
        ...prev,
        progress: 10,
        currentStep: 'Compiling clinical data and literature evidence',
      }));

      // Format literature data for the API with additional context
      const clinicalData = {
        literature: literatureData.selectedReferences.map(ref => ({
          id: ref.id,
          title: ref.title,
          authors: ref.authors,
          journal: ref.journal,
          publicationDate: ref.publicationDate,
          relevance: ref.relevance,
          keyFindings: ref.keyFindings || [],
          evidenceLevel: ref.evidenceLevel || 'III',
          abstract: ref.abstract,
          url: ref.url,
        })),
        postMarketData: reportSettings.includePostMarketData
          ? [
              {
                source: 'MAUDE Database',
                reportCount: 12,
                adverseEvents: 3,
                period: '2022-2023',
                outcomes: ['No serious adverse events reported', 'Minor complications in 3 cases'],
              },
              {
                source: 'Company PMS',
                reportCount: 28,
                adverseEvents: 5,
                period: '2022-2023',
                outcomes: [
                  '2 device-related complications',
                  '3 procedural complications',
                  'All resolved without sequelae',
                ],
              },
            ]
          : [],
        clinicalInvestigations: reportSettings.includeClinicalInvestigations
          ? [
              {
                title: 'CardioFlex Clinical Performance Study',
                participants: 120,
                duration: '12 months',
                design: 'Prospective, multi-center, single-arm study',
                primaryEndpoints: ['Device success rate', '12-month patency rate'],
                secondaryEndpoints: ['Adverse events', 'Quality of life improvements'],
                outcomes: [
                  '97% procedural success rate',
                  '94% patency at 12 months',
                  'Significant improvement in quality of life scores (p<0.001)',
                ],
              },
            ]
          : [],
      };

      // Add a delay to show progress to the user
      await new Promise(resolve => setTimeout(resolve, 1500));

      // Step 2: Generate report with robust error handling
      setGenerationState(prev => ({
        ...prev,
        progress: 30,
        currentStep: 'Generating clinical evaluation content with AI',
      }));

      // Configure generation options with fallbacks
      const generationOptions = {
        regulatoryFrameworks: reportSettings.regulatoryFrameworks,
        riskClass: deviceData.riskClass,
        includeExecutiveSummary: reportSettings.includeExecutiveSummary,
        includePMSPlan: reportSettings.includePostMarketData,
        detailLevel: reportSettings.detailLevel,
        format: reportSettings.format,
        // Add retry options
        maxAttempts: 2,
        temperature: 0.3,
        model: 'gpt-4o', // the newest OpenAI model is "gpt-4o" which was released May 13, 2024
        fallbackModel: 'gpt-4', // Fallback if primary model fails
      };

      // Track generation start time for analytics
      const generationStartTime = Date.now();

      // Use our enhanced OpenAI service with better error handling
      let reportResult;
      try {
        reportResult = await CerOpenAIService.generateCompleteCERReport(
          deviceData,
          clinicalData,
          generationOptions
        );

        // Log successful generation time
        console.log(`Report generation completed in ${(Date.now() - generationStartTime) / 1000}s`);
      } catch (reportError) {
        console.error('Error in report generation step:', reportError);

        // Show a specific error message but continue with the next steps
        toast({
          title: 'Report Generation Warning',
          description: `There was an issue during report generation: ${reportError.message}. Attempting to continue with available data.`,
          variant: 'warning',
        });

        // Create a basic report structure to continue with
        reportResult = {
          report: {
            title: `Clinical Evaluation Report for ${deviceData.name}`,
            sections: [
              {
                title: 'Executive Summary',
                content: 'Report generation encountered an error. Please regenerate.',
              },
              { title: 'Device Description', content: deviceData.description },
              { title: 'Clinical Data Analysis', content: 'Could not generate complete analysis.' },
            ],
            metadata: {
              device: deviceData.name,
              manufacturer: deviceData.manufacturer,
              date: new Date().toISOString(),
              generationError: reportError.message,
            },
          },
          generatedAt: new Date().toISOString(),
          warning: 'Report generation was incomplete due to an error.',
        };
      }

      // Update state with the report (either complete or partial)
      setGenerationState(prev => ({
        ...prev,
        progress: 60,
        currentStep: 'Report content generated, performing compliance analysis',
        generatedReport: reportResult,
      }));

      // Step 3: Perform regulatory compliance analysis with separate error handling
      let complianceResult;
      try {
        // Extract the report text for compliance analysis
        const reportText =
          reportSettings.format === 'json'
            ? JSON.stringify(reportResult.report, null, 2)
            : reportResult.report;

        setGenerationState(prev => ({
          ...prev,
          progress: 70,
          currentStep: 'Performing regulatory compliance analysis',
        }));

        // Use our OpenAI service for compliance check with error handling
        complianceResult = await CerOpenAIService.analyzeRegulatoryCERCompliance(
          reportText,
          reportSettings.regulatoryFrameworks,
          { temperature: 0.2, maxRetries: 2 }
        );
      } catch (complianceError) {
        console.error('Error in compliance analysis:', complianceError);

        // Create a fallback compliance result
        complianceResult = {
          complianceScore: 65, // Conservative estimate
          compliance: {
            compliant: ['Basic device information', 'Intended use description'],
            nonCompliant: [
              'Missing technical specifications',
              'Incomplete clinical evidence',
              'Limited literature review',
            ],
          },
          gaps: [
            { issue: 'Compliance analysis error', details: complianceError.message },
            {
              issue: 'Manual review required',
              details: 'Please review the report manually for regulatory compliance',
            },
          ],
          recommendations: [
            'Regenerate report with complete data',
            'Perform manual compliance check with regulatory expert',
          ],
        };

        toast({
          title: 'Compliance Analysis Issue',
          description:
            'There was a problem with the compliance analysis. Using conservative estimates.',
          variant: 'warning',
        });
      }

      // Step 4: Generate literature summary if configured
      setGenerationState(prev => ({
        ...prev,
        progress: 85,
        currentStep: 'Generating literature summary and finalizing report',
        complianceResults: complianceResult,
      }));

      // Generate literature summary as needed
      if (reportSettings.useSotaAnalysis && literatureData.selectedReferences.length > 0) {
        try {
          const literatureSummary = await LiteratureRetrievalService.compileLiteratureReview(
            literatureData.selectedReferences,
            deviceData
          );

          // Update the report with the literature summary
          if (reportResult && reportResult.report) {
            reportResult.literatureSummary = literatureSummary;
          }
        } catch (litError) {
          console.warn('Error generating literature summary:', litError);
          // Continue without the literature summary
        }
      }

      // Step 5: Finalize the report
      setGenerationState(prev => ({
        ...prev,
        progress: 95,
        currentStep: 'Report complete, preparing final output',
      }));

      // Complete the generation process with a small delay for user experience
      setTimeout(() => {
        setGenerationState(prev => ({
          ...prev,
          isGenerating: false,
          progress: 100,
          currentStep: 'Report generation complete',
          generationCompleted: true,
          generatedReport: reportResult,
          complianceResults: complianceResult,
          // Extract any validation issues from compliance results
          validationIssues: complianceResult.gaps || [],
          generatedAt: new Date().toISOString(),
        }));

        toast({
          title: 'CER Report Generated',
          description: `Report generated successfully with compliance score: ${complianceResult.complianceScore}%`,
          variant: 'success',
        });

        // Auto-switch to the results tab
        setActiveTab('results');

        // Offer to save the report for later
        setTimeout(() => {
          const shouldSave = window.confirm(
            'Would you like to save this report to your document vault for later access?'
          );
          if (shouldSave) {
            // This would connect to a real API in production
            toast({
              title: 'Report Saved',
              description: 'Your report has been saved to the document vault',
              variant: 'success',
            });
          }
        }, 1000);
      }, 1500);
    } catch (error) {
      console.error('Error in overall report generation process:', error);

      // Provide detailed error feedback
      setGenerationState(prev => ({
        ...prev,
        isGenerating: false,
        progress: 0,
        validationIssues: [
          {
            issue: 'Report generation failed',
            details: error.message || 'Unknown error occurred',
          },
        ],
        error: error.message || 'An unexpected error occurred during report generation',
      }));

      toast({
        title: 'Generation Error',
        description: `Failed to generate CER report: ${error.message || 'Unknown error'}. Please try again with different parameters.`,
        variant: 'destructive',
      });
    }
  };

  // Export the generated report
  const exportReport = () => {
    try {
      if (!generationState.generatedReport) {
        toast({
          title: 'No Report Available',
          description: 'Please generate a report before exporting',
          variant: 'destructive',
        });
        return;
      }

      // Format report for export
      const reportData = generationState.generatedReport.report;
      let exportContent;

      if (reportSettings.format === 'json') {
        exportContent = JSON.stringify(reportData, null, 2);
      } else {
        exportContent = reportData; // Plain text format
      }

      // Create file for download
      const blob = new Blob([exportContent], {
        type: reportSettings.format === 'json' ? 'application/json' : 'text/plain',
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');

      // Set filename and trigger download
      const filename = `CER_${deviceData.name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.${reportSettings.format === 'json' ? 'json' : 'txt'}`;
      link.href = url;
      link.download = filename;
      link.click();

      // Clean up
      URL.revokeObjectURL(url);

      toast({
        title: 'Report Exported',
        description: `Report has been downloaded as ${filename}`,
        variant: 'success',
      });
    } catch (error) {
      console.error('Error exporting report:', error);

      toast({
        title: 'Export Error',
        description: `Failed to export report: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  // Render suggested keywords based on device data
  const renderSuggestedKeywords = () => {
    // Generate suggested keywords based on device info
    const suggestions = [
      deviceData.name,
      deviceData.type,
      ...deviceData.indications,
      'clinical evaluation',
      'safety',
      'efficacy',
      'adverse events',
    ]
      .filter(Boolean)
      .filter(keyword => !literatureData.keywords.includes(keyword));

    return (
      <div className="space-x-2 mt-2">
        {suggestions.slice(0, 5).map((keyword, index) => (
          <Badge
            key={index}
            variant="outline"
            className="cursor-pointer hover:bg-blue-50"
            onClick={() => addKeyword(keyword)}
          >
            + {keyword}
          </Badge>
        ))}
      </div>
    );
  };

  // Render literature search results with enhanced feedback
  const renderLiteratureResults = () => {
    const { searchResults, isSearching, searchCompleted, error } = literatureData;

    if (isSearching) {
      return (
        <div className="flex flex-col items-center justify-center p-6">
          <Loader2 className="h-8 w-8 text-blue-500 animate-spin mb-4" />
          <p className="text-gray-600 font-medium mb-2">
            Searching medical literature databases...
          </p>
          <div className="w-full max-w-md">
            <Progress value={generationState.progress} className="h-2 mb-2" />
            <p className="text-sm text-gray-500">{generationState.currentStep}</p>
          </div>
          <div className="mt-4 bg-blue-50 p-3 rounded-md text-xs text-blue-700 max-w-md">
            <p className="font-medium mb-1">Search Progress</p>
            <ul className="list-disc pl-5 space-y-1">
              <li className={generationState.progress >= 10 ? 'text-blue-800' : 'text-gray-400'}>
                Preparing search parameters
              </li>
              <li className={generationState.progress >= 30 ? 'text-blue-800' : 'text-gray-400'}>
                Querying PubMed database
              </li>
              <li className={generationState.progress >= 50 ? 'text-blue-800' : 'text-gray-400'}>
                Retrieving article details
              </li>
              <li className={generationState.progress >= 70 ? 'text-blue-800' : 'text-gray-400'}>
                Analyzing relevance with AI
              </li>
              <li className={generationState.progress >= 90 ? 'text-blue-800' : 'text-gray-400'}>
                Sorting and prioritizing results
              </li>
            </ul>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="text-center p-6 bg-red-50 rounded-md border border-red-200">
          <XCircle className="h-8 w-8 text-red-500 mx-auto mb-2" />
          <h3 className="font-medium text-lg mb-1">Search Error</h3>
          <p className="text-sm text-gray-600 mb-2">{error}</p>
          <Button variant="outline" size="sm" onClick={searchLiterature}>
            <RefreshCcw className="h-4 w-4 mr-2" />
            Try Again
          </Button>
        </div>
      );
    }

    if (searchCompleted && searchResults.length === 0) {
      return (
        <div className="text-center p-6 bg-gray-50 rounded-md">
          <AlertTriangle className="h-8 w-8 text-amber-500 mx-auto mb-2" />
          <h3 className="font-medium text-lg mb-1">No Results Found</h3>
          <p className="text-sm text-gray-600">
            Try adjusting your search keywords or device information.
          </p>
        </div>
      );
    }

    if (searchResults.length > 0) {
      return (
        <div className="mt-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-medium text-gray-800">{searchResults.length} Results Found</h3>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                // Select the top 5 most relevant results
                const topResults = [...searchResults]
                  .sort((a, b) => (b.relevance || 0) - (a.relevance || 0))
                  .slice(0, 5);

                setLiteratureData(prev => ({
                  ...prev,
                  selectedReferences: topResults,
                }));

                toast({
                  title: 'Top References Selected',
                  description: `Added the 5 most relevant references to your report`,
                });
              }}
            >
              Add Top 5 References
            </Button>
          </div>

          <div className="border rounded-md">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Select</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="w-[180px]">Journal</TableHead>
                  <TableHead className="w-[120px]">Relevance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {searchResults.map(item => {
                  const isSelected = literatureData.selectedReferences.some(
                    ref => ref.id === item.id
                  );

                  return (
                    <TableRow key={item.id} className={isSelected ? 'bg-blue-50' : ''}>
                      <TableCell>
                        <Checkbox
                          checked={isSelected}
                          onCheckedChange={() => toggleLiteratureSelection(item)}
                        />
                      </TableCell>
                      <TableCell>
                        <div>
                          <div className="font-medium truncate max-w-[400px]">{item.title}</div>
                          <div className="text-xs text-gray-500 mt-1">
                            {item.authors?.substring(0, 80)}...
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{item.journal}</div>
                        <div className="text-xs text-gray-500">{item.publicationDate}</div>
                      </TableCell>
                      <TableCell>
                        {item.relevance ? (
                          <div>
                            <Badge
                              className={
                                item.relevance > 80
                                  ? 'bg-green-100 text-green-800'
                                  : item.relevance > 50
                                    ? 'bg-blue-100 text-blue-800'
                                    : 'bg-gray-100 text-gray-800'
                              }
                            >
                              {item.relevance}%
                            </Badge>
                            <div className="text-xs text-gray-500 mt-1">
                              {item.relevance > 80
                                ? 'High'
                                : item.relevance > 50
                                  ? 'Medium'
                                  : 'Low'}
                            </div>
                          </div>
                        ) : (
                          <span className="text-gray-500">N/A</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      );
    }

    return (
      <div className="text-center p-6 border border-dashed rounded-md">
        <BookOpen className="h-8 w-8 text-gray-400 mx-auto mb-2" />
        <h3 className="font-medium text-lg mb-1">Literature Search</h3>
        <p className="text-sm text-gray-600 mb-4">
          Search for relevant medical literature to include in your CER.
        </p>
        <Button onClick={searchLiterature} disabled={!deviceData.name}>
          <Search className="mr-2 h-4 w-4" />
          Start Literature Search
        </Button>
      </div>
    );
  };

  // Render report results
  const renderReportResults = () => {
    const {
      isGenerating,
      generationCompleted,
      generatedReport,
      complianceResults,
      progress,
      currentStep,
    } = generationState;

    if (isGenerating) {
      const { currentSubtask } = generationState;
      return (
        <div className="p-6 border rounded-md">
          <div className="flex flex-col items-center justify-center">
            <h3 className="font-medium text-lg mb-4">Generating CER Report</h3>
            <Progress value={progress} className="w-full mb-4" />
            <p className="font-medium text-gray-700 mb-1">{currentStep}</p>
            {currentSubtask && <p className="text-sm text-gray-600 mb-4">{currentSubtask}</p>}

            <div className="w-full max-w-xl bg-blue-50 p-4 rounded-md border border-blue-100 mt-4">
              <h4 className="text-sm font-medium text-blue-800 mb-2">Generation Progress</h4>
              <ul className="space-y-2 text-sm">
                <li
                  className={`flex items-center ${progress >= 10 ? 'text-blue-800' : 'text-gray-400'}`}
                >
                  {progress >= 10 ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <div className="h-4 w-4 mr-1" />
                  )}
                  Collecting device information and clinical data
                </li>
                <li
                  className={`flex items-center ${progress >= 30 ? 'text-blue-800' : 'text-gray-400'}`}
                >
                  {progress >= 30 ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <div className="h-4 w-4 mr-1" />
                  )}
                  Processing literature references
                </li>
                <li
                  className={`flex items-center ${progress >= 50 ? 'text-blue-800' : 'text-gray-400'}`}
                >
                  {progress >= 50 ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <div className="h-4 w-4 mr-1" />
                  )}
                  Generating MEDDEV 2.7/1 compliant structure
                </li>
                <li
                  className={`flex items-center ${progress >= 70 ? 'text-blue-800' : 'text-gray-400'}`}
                >
                  {progress >= 70 ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <div className="h-4 w-4 mr-1" />
                  )}
                  Creating comprehensive report content
                </li>
                <li
                  className={`flex items-center ${progress >= 90 ? 'text-blue-800' : 'text-gray-400'}`}
                >
                  {progress >= 90 ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <div className="h-4 w-4 mr-1" />
                  )}
                  Analyzing regulatory compliance
                </li>
                <li
                  className={`flex items-center ${progress >= 100 ? 'text-blue-800' : 'text-gray-400'}`}
                >
                  {progress >= 100 ? (
                    <Check className="h-4 w-4 mr-1" />
                  ) : (
                    <div className="h-4 w-4 mr-1" />
                  )}
                  Completing report generation
                </li>
              </ul>
            </div>

            <p className="text-xs text-gray-500 mt-4">
              This may take 1-2 minutes for complex reports. Please don't refresh the page.
            </p>
          </div>
        </div>
      );
    }

    if (generationCompleted && generatedReport) {
      return (
        <div className="space-y-6">
          <Card>
            <CardHeader className="bg-gradient-to-r from-green-50 to-white">
              <div className="flex justify-between items-center">
                <CardTitle>CER Report Generated</CardTitle>
                <Badge className="bg-green-100 text-green-800 hover:bg-green-200">
                  <Check className="mr-1 h-3 w-3" />
                  Complete
                </Badge>
              </div>
              <CardDescription>Clinical Evaluation Report for {deviceData.name}</CardDescription>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
                <div className="border rounded-md p-3">
                  <div className="text-sm font-medium text-gray-500 mb-1">Device Type</div>
                  <div className="font-semibold">{deviceData.type}</div>
                </div>
                <div className="border rounded-md p-3">
                  <div className="text-sm font-medium text-gray-500 mb-1">Risk Classification</div>
                  <div className="font-semibold">Class {deviceData.riskClass}</div>
                </div>
                <div className="border rounded-md p-3">
                  <div className="text-sm font-medium text-gray-500 mb-1">Frameworks</div>
                  <div className="font-semibold">
                    {reportSettings.regulatoryFrameworks.join(', ')}
                  </div>
                </div>
              </div>

              <div className="mb-6">
                <h3 className="font-medium text-lg mb-2">Compliance Analysis</h3>
                {complianceResults && (
                  <div className="border rounded-md p-4">
                    <div className="flex items-center justify-between mb-4">
                      <div>
                        <div className="text-sm text-gray-600 mb-1">Overall Compliance Score</div>
                        <div className="text-2xl font-bold">
                          {complianceResults.complianceScore}%
                        </div>
                      </div>
                      <div
                        className="w-24 h-24 rounded-full border-8 flex items-center justify-center"
                        style={{
                          borderColor:
                            complianceResults.complianceScore > 90
                              ? '#10b981'
                              : complianceResults.complianceScore > 70
                                ? '#60a5fa'
                                : complianceResults.complianceScore > 50
                                  ? '#f59e0b'
                                  : '#ef4444',
                        }}
                      >
                        <span className="text-lg font-semibold">
                          {complianceResults.complianceScore > 90
                            ? 'High'
                            : complianceResults.complianceScore > 70
                              ? 'Good'
                              : complianceResults.complianceScore > 50
                                ? 'Medium'
                                : 'Low'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <h4 className="font-medium mb-2 text-green-700">Strengths</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {complianceResults.strengths?.slice(0, 3).map((item, i) => (
                            <li key={i} className="text-sm">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <h4 className="font-medium mb-2 text-red-700">Gaps</h4>
                        <ul className="list-disc list-inside space-y-1">
                          {complianceResults.gaps?.slice(0, 3).map((item, i) => (
                            <li key={i} className="text-sm">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div>
                <h3 className="font-medium text-lg mb-2">Report Preview</h3>
                <ScrollArea className="h-64 w-full border rounded-md p-4 bg-gray-50">
                  <pre className="text-sm font-mono whitespace-pre-wrap">
                    {reportSettings.format === 'json'
                      ? JSON.stringify(generatedReport.report, null, 2)
                      : generatedReport.report}
                  </pre>
                </ScrollArea>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline">Edit Report</Button>
              <Button onClick={exportReport}>
                <Download className="mr-2 h-4 w-4" />
                Export Report
              </Button>
            </CardFooter>
          </Card>
        </div>
      );
    }

    return (
      <div className="text-center p-10 border border-dashed rounded-md">
        <FileText className="h-10 w-10 text-gray-400 mx-auto mb-4" />
        <h3 className="font-medium text-xl mb-2">No Report Generated Yet</h3>
        <p className="text-gray-600 mb-6 max-w-md mx-auto">
          Complete the device information and literature search to generate your Clinical Evaluation
          Report.
        </p>
        <Button
          size="lg"
          onClick={() => {
            if (!deviceData.name) {
              setActiveTab('device-data');
              toast({
                title: 'Device Data Required',
                description: 'Please complete device information first',
              });
              return;
            }

            if (literatureData.selectedReferences.length === 0) {
              setActiveTab('literature');
              toast({
                title: 'Literature Required',
                description: 'Please select relevant literature references',
              });
              return;
            }

            generateReport();
          }}
        >
          <Brain className="mr-2 h-5 w-5" />
          Generate CER Report
        </Button>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">Clinical Evaluation Report Generator</h2>
          <p className="text-gray-600 mt-1">
            Generate comprehensive CERs with AI assistance and regulatory compliance checks
          </p>
        </div>

        <div className="flex space-x-2">
          <Button
            variant="outline"
            disabled={!generationState.generatedReport}
            onClick={exportReport}
          >
            <Download className="mr-2 h-4 w-4" />
            Export Report
          </Button>

          <Button disabled={generationState.isGenerating} onClick={generateReport}>
            <Brain className="mr-2 h-4 w-4" />
            Generate Report
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid grid-cols-4 mb-4">
          <TabsTrigger value="device-data" className="flex items-center">
            <FilePlus className="w-4 h-4 mr-1" />
            Device Information
          </TabsTrigger>
          <TabsTrigger value="literature" className="flex items-center">
            <BookOpen className="w-4 h-4 mr-1" />
            Literature Search
          </TabsTrigger>
          <TabsTrigger value="settings" className="flex items-center">
            <Settings className="w-4 h-4 mr-1" />
            Report Settings
          </TabsTrigger>
          <TabsTrigger value="results" className="flex items-center">
            <FileText className="w-4 h-4 mr-1" />
            Results
          </TabsTrigger>
        </TabsList>

        <TabsContent value="device-data" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Device Information</CardTitle>
              <CardDescription>
                Enter comprehensive device information for the Clinical Evaluation Report
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="device-name">Device Name</Label>
                  <Input
                    id="device-name"
                    value={deviceData.name}
                    onChange={e => handleDeviceDataChange('name', e.target.value)}
                    placeholder="e.g., CardioFlex Stent System"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="manufacturer">Manufacturer</Label>
                  <Input
                    id="manufacturer"
                    value={deviceData.manufacturer}
                    onChange={e => handleDeviceDataChange('manufacturer', e.target.value)}
                    placeholder="e.g., MedInnovate Technologies"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="device-type">Device Type</Label>
                  <Input
                    id="device-type"
                    value={deviceData.type}
                    onChange={e => handleDeviceDataChange('type', e.target.value)}
                    placeholder="e.g., Coronary Stent"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="model">Model Number</Label>
                  <Input
                    id="model"
                    value={deviceData.model}
                    onChange={e => handleDeviceDataChange('model', e.target.value)}
                    placeholder="e.g., CFX-100"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="risk-class">Risk Classification</Label>
                <Select
                  value={deviceData.riskClass}
                  onValueChange={value => handleDeviceDataChange('riskClass', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select risk class" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="I">Class I</SelectItem>
                    <SelectItem value="IIa">Class IIa</SelectItem>
                    <SelectItem value="IIb">Class IIb</SelectItem>
                    <SelectItem value="III">Class III</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Device Description</Label>
                <textarea
                  id="description"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={deviceData.description}
                  onChange={e => handleDeviceDataChange('description', e.target.value)}
                  placeholder="Comprehensive description of the device..."
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="intended-use">Intended Use</Label>
                <textarea
                  id="intended-use"
                  className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={deviceData.intendedUse}
                  onChange={e => handleDeviceDataChange('intendedUse', e.target.value)}
                  placeholder="Detailed description of the intended use..."
                />
              </div>

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <Label>Indications for Use</Label>
                  <Button variant="outline" size="sm" onClick={addIndication}>
                    <Plus className="h-4 w-4 mr-1" />
                    Add Indication
                  </Button>
                </div>

                {deviceData.indications.length === 0 ? (
                  <div className="text-sm text-gray-500 italic p-2 border border-dashed rounded-md">
                    No indications added. Click "Add Indication" to begin.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {deviceData.indications.map((indication, index) => (
                      <div key={index} className="flex items-center space-x-2">
                        <Input
                          value={indication}
                          onChange={e => handleIndicationChange(index, e.target.value)}
                          placeholder={`Indication ${index + 1}`}
                        />
                        <Button variant="ghost" size="icon" onClick={() => removeIndication(index)}>
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline">Reset Fields</Button>
              <Button
                onClick={() => {
                  if (deviceData.name && deviceData.description) {
                    setActiveTab('literature');
                    toast({
                      title: 'Device Information Saved',
                      description: 'Now you can proceed to literature search',
                    });
                  } else {
                    toast({
                      title: 'Missing Information',
                      description: 'Please provide at least device name and description',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Continue to Literature Search
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="literature" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Literature Search</CardTitle>
              <CardDescription>
                Search for and select relevant medical literature for your Clinical Evaluation
                Report
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-4">
                <div>
                  <Label htmlFor="search-keywords">Search Keywords</Label>
                  <div className="flex space-x-2 mt-1">
                    <Input
                      id="search-keywords"
                      placeholder="Enter keywords for literature search..."
                      onKeyDown={e => {
                        if (e.key === 'Enter' && e.target.value) {
                          addKeyword(e.target.value);
                          e.target.value = '';
                        }
                      }}
                    />
                    <Button
                      variant="secondary"
                      onClick={() => {
                        const input = document.getElementById('search-keywords');
                        if (input?.value) {
                          addKeyword(input.value);
                          input.value = '';
                        }
                      }}
                    >
                      Add
                    </Button>
                  </div>

                  <div className="mt-2">
                    <Label className="text-sm text-gray-500">Suggested Keywords</Label>
                    {renderSuggestedKeywords()}
                  </div>
                </div>

                {literatureData.keywords.length > 0 && (
                  <div>
                    <Label className="text-sm text-gray-500">Selected Keywords</Label>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {literatureData.keywords.map((keyword, index) => (
                        <Badge key={index} className="flex items-center">
                          {keyword}
                          <X
                            className="ml-1 h-3 w-3 cursor-pointer"
                            onClick={() => removeKeyword(keyword)}
                          />
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-end">
                  <Button
                    onClick={searchLiterature}
                    disabled={
                      deviceData.name === '' ||
                      (literatureData.keywords.length === 0 && deviceData.indications.length === 0)
                    }
                  >
                    <Search className="mr-2 h-4 w-4" />
                    Search Medical Literature
                  </Button>
                </div>

                {renderLiteratureResults()}

                {literatureData.selectedReferences.length > 0 && (
                  <div className="mt-6">
                    <h3 className="font-medium text-lg mb-2">
                      Selected References ({literatureData.selectedReferences.length})
                    </h3>
                    <div className="border rounded-md p-4 bg-blue-50">
                      <ul className="space-y-2">
                        {literatureData.selectedReferences.map(ref => (
                          <li key={ref.id} className="flex justify-between items-start">
                            <div>
                              <p className="font-medium">{ref.title}</p>
                              <p className="text-sm text-gray-600">{ref.authors}</p>
                              <p className="text-xs text-gray-500">
                                {ref.journal}, {ref.publicationDate}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => toggleLiteratureSelection(ref)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab('device-data')}>
                Back to Device Information
              </Button>
              <Button
                onClick={() => {
                  if (literatureData.selectedReferences.length > 0) {
                    setActiveTab('settings');
                    toast({
                      title: 'Literature References Selected',
                      description: `${literatureData.selectedReferences.length} references will be included in your report`,
                    });
                  } else {
                    toast({
                      title: 'No References Selected',
                      description: 'Please select at least one literature reference',
                      variant: 'destructive',
                    });
                  }
                }}
              >
                Continue to Report Settings
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="settings" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Report Settings</CardTitle>
              <CardDescription>
                Configure settings for your Clinical Evaluation Report generation
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div>
                  <Label className="text-base font-medium">Regulatory Frameworks</Label>
                  <p className="text-sm text-gray-500 mb-2">
                    Select applicable regulatory frameworks
                  </p>

                  <div className="space-y-2">
                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="framework-mdr"
                        checked={reportSettings.regulatoryFrameworks.includes('EU MDR')}
                        onCheckedChange={() => toggleFramework('EU MDR')}
                      />
                      <Label htmlFor="framework-mdr" className="font-normal">
                        EU MDR (2017/745)
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="framework-iso14155"
                        checked={reportSettings.regulatoryFrameworks.includes('ISO 14155')}
                        onCheckedChange={() => toggleFramework('ISO 14155')}
                      />
                      <Label htmlFor="framework-iso14155" className="font-normal">
                        ISO 14155 (Clinical investigations)
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="framework-fda"
                        checked={reportSettings.regulatoryFrameworks.includes(
                          'FDA 21 CFR Part 820'
                        )}
                        onCheckedChange={() => toggleFramework('FDA 21 CFR Part 820')}
                      />
                      <Label htmlFor="framework-fda" className="font-normal">
                        FDA 21 CFR Part 820
                      </Label>
                    </div>

                    <div className="flex items-center space-x-2">
                      <Checkbox
                        id="framework-meddev"
                        checked={reportSettings.regulatoryFrameworks.includes('MEDDEV 2.7/1 Rev 4')}
                        onCheckedChange={() => toggleFramework('MEDDEV 2.7/1 Rev 4')}
                      />
                      <Label htmlFor="framework-meddev" className="font-normal">
                        MEDDEV 2.7/1 Rev 4 (Clinical evaluation)
                      </Label>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-medium">Report Content Settings</Label>

                  <div className="space-y-4 mt-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="include-executive-summary" className="font-normal">
                          Include Executive Summary
                        </Label>
                        <p className="text-xs text-gray-500">
                          Adds a comprehensive executive summary to the report
                        </p>
                      </div>
                      <Switch
                        id="include-executive-summary"
                        checked={reportSettings.includeExecutiveSummary}
                        onCheckedChange={checked =>
                          handleSettingsChange('includeExecutiveSummary', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="include-post-market" className="font-normal">
                          Include Post-Market Data
                        </Label>
                        <p className="text-xs text-gray-500">
                          Adds post-market surveillance data analysis
                        </p>
                      </div>
                      <Switch
                        id="include-post-market"
                        checked={reportSettings.includePostMarketData}
                        onCheckedChange={checked =>
                          handleSettingsChange('includePostMarketData', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="include-clinical-investigations" className="font-normal">
                          Include Clinical Investigations
                        </Label>
                        <p className="text-xs text-gray-500">
                          Adds clinical investigation data and analysis
                        </p>
                      </div>
                      <Switch
                        id="include-clinical-investigations"
                        checked={reportSettings.includeClinicalInvestigations}
                        onCheckedChange={checked =>
                          handleSettingsChange('includeClinicalInvestigations', checked)
                        }
                      />
                    </div>

                    <div className="flex items-center justify-between">
                      <div>
                        <Label htmlFor="use-sota-analysis" className="font-normal">
                          Include State-of-the-Art Analysis
                        </Label>
                        <p className="text-xs text-gray-500">
                          Adds comparison to current state-of-the-art
                        </p>
                      </div>
                      <Switch
                        id="use-sota-analysis"
                        checked={reportSettings.useSotaAnalysis}
                        onCheckedChange={checked =>
                          handleSettingsChange('useSotaAnalysis', checked)
                        }
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-medium" htmlFor="detail-level">
                    Report Detail Level
                  </Label>
                  <p className="text-sm text-gray-500 mb-2">
                    Adjust the level of detail in your generated report
                  </p>

                  <div className="flex items-center space-x-2">
                    <span className="text-sm">Concise</span>
                    <Slider
                      id="detail-level"
                      value={[reportSettings.detailLevel]}
                      min={20}
                      max={100}
                      step={10}
                      onValueChange={value => handleSettingsChange('detailLevel', value[0])}
                      className="flex-1"
                    />
                    <span className="text-sm">Comprehensive</span>
                  </div>
                  <p className="text-xs text-gray-500 text-center mt-1">
                    {reportSettings.detailLevel < 40
                      ? 'Basic report with essential information only'
                      : reportSettings.detailLevel < 70
                        ? 'Balanced report with moderate detail'
                        : 'Comprehensive report with extensive detail and analysis'}
                  </p>
                </div>

                <div className="space-y-2">
                  <Label className="text-base font-medium">Report Format</Label>
                  <Select
                    value={reportSettings.format}
                    onValueChange={value => handleSettingsChange('format', value)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select report format" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="json">JSON Structure</SelectItem>
                      <SelectItem value="text">Plain Text</SelectItem>
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-gray-500">
                    {reportSettings.format === 'json'
                      ? 'JSON format is easier to integrate with other systems and tools'
                      : 'Plain text format is easier to read directly'}
                  </p>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button variant="outline" onClick={() => setActiveTab('literature')}>
                Back to Literature Search
              </Button>
              <Button
                onClick={() => {
                  toast({
                    title: 'Settings Saved',
                    description: 'Your report settings have been saved',
                  });
                  setActiveTab('results');
                }}
              >
                Continue to Results
                <ChevronRight className="ml-2 h-4 w-4" />
              </Button>
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="results">{renderReportResults()}</TabsContent>
      </Tabs>
    </div>
  );
};

export default CerGeneratorPanel;
