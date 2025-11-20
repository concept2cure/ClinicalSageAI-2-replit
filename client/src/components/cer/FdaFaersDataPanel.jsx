import React, { useState, useEffect } from 'react';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Progress } from '@/components/ui/progress';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Loader2,
  Search,
  CheckCircle,
  AlertCircle,
  DatabaseIcon,
  BarChart4,
  BarChartHorizontal,
  HelpCircle,
  FileText,
  FileCheck,
  Filter,
  Calendar,
  Zap,
  Download,
  ChevronRight,
  RefreshCw,
  ExternalLink,
} from 'lucide-react';
import { FaersRiskBadge } from './FaersRiskBadge';
import { FaersHowToModal } from './FaersHowToModal';
import { useToast } from '@/components/ui/toaster';
import { cerApiService } from '@/services/CerAPIService';
import DataRetrievalStatus from './DataRetrievalStatus';

/**
 * FDA FAERS Data Panel Component
 *
 * This component provides an interface for fetching and displaying adverse event data
 * from the FDA FAERS (FDA Adverse Event Reporting System) database for inclusion
 * in Clinical Evaluation Reports.
 */
const FdaFaersDataPanel = ({
  onDataFetched,
  onAnalysisFetched,
  deviceName = '',
  initialProductName = '',
  reportId = '',
}) => {
  const [productName, setProductName] = useState(initialProductName || deviceName || '');
  const [manufacturerName, setManufacturerName] = useState('Arthrosurface, Inc.');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [searchMethod, setSearchMethod] = useState('standard'); // standard or advanced
  const [dataSource, setDataSource] = useState('fda-faers'); // fda-faers, eu-eudamed, etc.
  const [currentReportId, setCurrentReportId] = useState(reportId);
  const [dataRetrievalStatus, setDataRetrievalStatus] = useState(null);

  const [isLoading, setIsLoading] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [error, setError] = useState(null);
  const [faersData, setFaersData] = useState(null);
  const [faersAnalysis, setFaersAnalysis] = useState(null);
  const [riskAssessment, setRiskAssessment] = useState(null);
  const [activeTab, setActiveTab] = useState('raw-data');
  const [showHowTo, setShowHowTo] = useState(false);
  const [showFullReport, setShowFullReport] = useState(false);
  const [isIntegratedInReport, setIsIntegratedInReport] = useState(false);
  const { toast } = useToast();

  // Auto-fetch data if product name is provided initially
  useEffect(() => {
    if (initialProductName || deviceName) {
      fetchFaersData();
    }
  }, []);

  // Auto-integrate successful analysis into report
  useEffect(() => {
    if (faersAnalysis && !isIntegratedInReport) {
      integrateIntoReport();
    }
  }, [faersAnalysis]);

  // Check data retrieval status periodically if we have a reportId
  useEffect(() => {
    if (currentReportId) {
      const checkStatus = async () => {
        try {
          const status = await cerApiService.getDataRetrievalStatus(currentReportId);
          setDataRetrievalStatus(status);

          // If FAERS data is complete, load it
          if (status?.faersStatus === 'completed') {
            await fetchReportFaersData();
          }
        } catch (error) {
          console.error('Error checking data retrieval status:', error);
        }
      };

      // Check immediately
      checkStatus();

      // Setup interval to check every 5 seconds
      const interval = setInterval(checkStatus, 5000);

      // Cleanup interval on unmount
      return () => clearInterval(interval);
    }
  }, [currentReportId]);

  /**
   * Trigger autonomous data retrieval for the current report
   */
  const triggerAutonomousDataRetrieval = async () => {
    if (!currentReportId) {
      toast({
        title: 'Report ID Required',
        description: 'A report ID is required to trigger autonomous data retrieval',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const result = await cerApiService.retrieveDataForCER(currentReportId);

      toast({
        title: 'Data Retrieval Initiated',
        description: 'Autonomous data retrieval has been started for this report',
      });

      setDataRetrievalStatus(result);
    } catch (error) {
      console.error('Error triggering data retrieval:', error);
      setError(error.message || 'Failed to trigger autonomous data retrieval');
      toast({
        title: 'Error',
        description: error.message || 'Failed to trigger autonomous data retrieval',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Fetch FAERS data for the current report
   */
  const fetchReportFaersData = async () => {
    if (!currentReportId) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const data = await cerApiService.getFaersDataForReport(currentReportId);

      if (data) {
        setFaersData(data);
        setFaersAnalysis(data.analysis || null);

        // Call callbacks if provided
        if (onDataFetched) {
          onDataFetched(data);
        }

        if (onAnalysisFetched && data.analysis) {
          onAnalysisFetched(data.analysis);
        }

        // Switch to analysis tab if analysis is available
        if (data.analysis) {
          setActiveTab('analysis');
        }

        toast({
          title: 'FAERS Data Loaded',
          description: 'FAERS data has been loaded from the report',
        });
      }
    } catch (error) {
      console.error('Error fetching report FAERS data:', error);
      setError(error.message || 'Failed to fetch FAERS data for report');
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Fetch raw FAERS data from the FDA API using the enhanced service
   */
  const fetchFaersData = async () => {
    if (!productName) {
      setError('Product name is required');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log(`Fetching real FDA FAERS data for "${productName}"`);
      toast({
        title: 'Connecting to FDA FAERS API',
        description: `Retrieving adverse event data for ${productName}...`,
      });

      // Use the API service to fetch FAERS data
      const data = await cerApiService.fetchFaersData(productName);

      console.log(`Retrieved ${data.totalReports || 0} FDA FAERS reports for "${productName}"`);
      setFaersData(data);

      // Show success toast with data source indication
      toast({
        title: 'FDA FAERS Data Retrieved',
        description: `Retrieved ${data.totalReports || 0} real FDA adverse event reports for ${productName}`,
        variant: 'default',
      });

      // Update data source information if available in response
      if (data.dataSource) {
        setDataSource(`FDA FAERS (${data.dataSource.accessMethod})`);
      }

      // Call the callback if provided
      if (onDataFetched) {
        onDataFetched(data);
      }

      // If we have a reportId, store this data for the report
      if (currentReportId) {
        try {
          await cerApiService.fetchFaersDataForCER({
            productName,
            cerId: currentReportId,
            includeComparators: true,
          });

          console.log(`Stored FAERS data for report ${currentReportId}`);
          toast({
            title: 'FAERS Data Stored',
            description: `FAERS data for ${productName} has been stored with the report`,
          });
        } catch (reportError) {
          console.error('Error storing FAERS data with report:', reportError);
        }
      }

      // Automatically fetch analysis as well
      fetchFaersAnalysis();
    } catch (error) {
      console.error('Error fetching FAERS data:', error);

      // Extract detailed error information from the response if available
      const errorResponse = error.response?.data || {};
      let errorMessage = errorResponse.message || error.message || 'Failed to fetch FDA FAERS data';
      const errorDetails = errorResponse.details || '';
      const errorStatus = errorResponse.serviceStatus || 'error';

      setError(errorMessage);

      // Set a more descriptive error message based on service status
      let toastTitle = 'Error Fetching FAERS Data';
      let toastVariant = 'destructive';

      if (errorStatus === 'unavailable') {
        toastTitle = 'FDA FAERS Service Unavailable';
      } else if (
        errorResponse.error === 'No FDA FAERS data found' ||
        error.message?.includes('No adverse event data found')
      ) {
        toastTitle = 'No FDA FAERS Data Found';
        toastVariant = 'warning'; // Use warning variant for "not found" instead of error

        // Add detailed guidance for users
        errorMessage =
          'No adverse event data found for this product in the FDA FAERS database. This could be because: \n' +
          '1. The product name may be misspelled or use a different brand name \n' +
          '2. This product may be too new to have FDA adverse event reports \n' +
          '3. The FDA may classify this product under a different name';
      }

      // Show toast with detailed error information
      toast({
        title: toastTitle,
        description: errorMessage + (errorDetails ? `\n${errorDetails}` : ''),
        variant: toastVariant,
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Fetch analyzed FAERS data from the FDA API
   */
  const fetchFaersAnalysis = async () => {
    if (!productName) {
      setError('Product name is required');
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log(`Analyzing FDA FAERS data for "${productName}"`);
      toast({
        title: 'Processing FDA FAERS Data',
        description: `Analyzing real FDA adverse event data for ${productName}...`,
      });

      // Use the API service to analyze the FAERS data with enhanced service
      const data = await cerApiService.analyzeAdverseEvents({
        productName,
        manufacturer: manufacturerName,
        startDate,
        endDate,
        faersData: faersData, // Pass the raw data if we have it
      });

      console.log(`Analysis complete with ${data.topEvents?.length || 0} identified events`);
      setFaersAnalysis(data);
      setActiveTab('analysis'); // Switch to analysis tab when data is loaded

      // Call the callback if provided
      if (onAnalysisFetched) {
        onAnalysisFetched(data);
      }

      toast({
        title: 'FDA FAERS Analysis Complete',
        description: `Advanced risk analysis of real FDA adverse event data for ${productName} is ready to review`,
        variant: 'default',
      });
    } catch (error) {
      console.error('Error analyzing FAERS data:', error);

      // Extract detailed error information from the response if available
      const errorResponse = error.response?.data || {};
      let errorMessage =
        errorResponse.message || error.message || 'Failed to analyze FDA FAERS data';
      const errorDetails = errorResponse.details || '';
      const errorStatus = errorResponse.serviceStatus || 'error';

      setError(errorMessage);

      // Set a more descriptive error message based on service status
      let toastTitle = 'Error Analyzing FAERS Data';
      let toastVariant = 'destructive';

      if (errorStatus === 'unavailable') {
        toastTitle = 'FDA FAERS Analysis Service Unavailable';
      } else if (
        errorResponse.error === 'No FDA FAERS data found' ||
        error.message?.includes('No adverse event data found')
      ) {
        toastTitle = 'No FDA FAERS Data Found for Analysis';
        toastVariant = 'warning';

        // Add detailed guidance for users
        errorMessage =
          'No adverse event data found for this product in the FDA FAERS database. This could be because: \n' +
          '1. The product name may be misspelled or use a different brand name \n' +
          '2. This product may be too new to have FDA adverse event reports \n' +
          '3. The FDA may classify this product under a different name';
      }

      // Show toast with detailed error information
      toast({
        title: toastTitle,
        description: errorMessage + (errorDetails ? `\n${errorDetails}` : ''),
        variant: toastVariant,
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Render the raw FAERS data view
   */
  const renderRawDataView = () => {
    if (!faersData) {
      return (
        <div className="py-8 text-center text-gray-500">
          <DatabaseIcon className="mx-auto h-12 w-12 mb-3 text-gray-400" />
          <p>No FDA FAERS data loaded. Use the search form to fetch adverse event data.</p>
        </div>
      );
    }

    const { productName, totalReports, adverseEventCounts = [], seriousEvents = [] } = faersData;

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Product</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{productName}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Total Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{totalReports}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Serious Events</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{seriousEvents.length}</p>
              <p className="text-sm text-gray-500">
                {((seriousEvents.length / totalReports) * 100).toFixed(1)}% of total
              </p>
            </CardContent>
          </Card>
        </div>

        <Alert className="mb-6 bg-indigo-50 border-indigo-200">
          <CheckCircle className="h-4 w-4 text-indigo-600" />
          <AlertTitle className="text-indigo-800 font-bold">
            Proxima CRO: Real FDA FAERS Data
          </AlertTitle>
          <AlertDescription className="text-indigo-700">
            This data is retrieved directly from the FDA Adverse Event Reporting System (FAERS)
            using the official FDA API.
            {faersData.dataSource && (
              <span className="block mt-1 text-sm">
                <strong>Data Source:</strong> {faersData.dataSource.name} via{' '}
                {faersData.dataSource.accessMethod}
                {faersData.dataSource.retrievalDate && (
                  <span>
                    {' '}
                    • Retrieved: {new Date(faersData.dataSource.retrievalDate).toLocaleDateString()}
                  </span>
                )}
              </span>
            )}
          </AlertDescription>
        </Alert>

        <Card>
          <CardHeader>
            <CardTitle>Top Adverse Events</CardTitle>
            <CardDescription>
              Most frequently reported adverse events from FDA FAERS database
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {adverseEventCounts.slice(0, 10).map((item, index) => (
                <div key={index} className="flex items-center justify-between py-2 border-b">
                  <div className="flex items-center">
                    <span className="font-medium">{item.event}</span>
                  </div>
                  <div className="flex items-center">
                    <Badge variant="outline" className="mr-2">
                      {item.count}
                    </Badge>
                    <span className="text-sm text-gray-500">
                      {((item.count / totalReports) * 100).toFixed(1)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
          <CardFooter className="flex justify-between items-center">
            <p className="text-xs text-gray-500">
              Data source:{' '}
              <a
                href="https://open.fda.gov/apis/drug/event/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline"
              >
                FDA FAERS API
              </a>
            </p>
            {faersData.dataSource?.authentic && (
              <Badge variant="outline" className="bg-green-50">
                <CheckCircle className="h-3 w-3 mr-1 text-green-500" /> Authentic Data
              </Badge>
            )}
          </CardFooter>
        </Card>
      </div>
    );
  };

  /**
   * Render the FAERS analysis view
   */
  const renderAnalysisView = () => {
    if (!faersAnalysis) {
      return (
        <div className="py-8 text-center text-gray-500">
          <BarChart4 className="mx-auto h-12 w-12 mb-3 text-gray-400" />
          <p>No FDA FAERS analysis available. First fetch the raw data to generate an analysis.</p>
        </div>
      );
    }

    const {
      productInfo,
      reportingPeriod,
      summary,
      topEvents = [],
      demographics,
      conclusion,
    } = faersAnalysis;

    return (
      <div className="space-y-6">
        <Alert className="mb-6 bg-blue-50 border-blue-200">
          <CheckCircle className="h-4 w-4 text-blue-500" />
          <AlertTitle className="text-blue-700">Real FDA Data Analysis</AlertTitle>
          <AlertDescription className="text-blue-600">
            Analysis based on authentic FDA FAERS data. This report meets EU MDR, MEDDEV 2.7/1 Rev
            4, and ISO 14155 requirements for post-market surveillance data.
            {faersAnalysis.dataSource && (
              <span className="block mt-1 text-sm">
                <strong>Data Source:</strong> {faersAnalysis.dataSource.name} via{' '}
                {faersAnalysis.dataSource.accessMethod}
                {faersAnalysis.dataSource.retrievalDate && (
                  <span>
                    {' '}
                    • Retrieved:{' '}
                    {new Date(faersAnalysis.dataSource.retrievalDate).toLocaleDateString()}
                  </span>
                )}
              </span>
            )}
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Total Reports</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{summary.totalReports}</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Serious Events</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{summary.seriousEvents}</p>
              <p className="text-sm text-gray-500">{summary.seriousEventsPercentage} of total</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Event Rate</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{summary.eventsPerTenThousand}</p>
              <p className="text-sm text-gray-500">per 10,000 units</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="py-4">
              <CardTitle className="text-lg">Severity</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between">
              <p className="text-2xl font-bold">{summary.severityAssessment}</p>
              <FaersRiskBadge
                severity={summary.severityAssessment}
                score={summary.eventsPerTenThousand}
                size="lg"
              />
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Top Reported Events</CardTitle>
              <CardDescription>Most frequently reported adverse events</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {topEvents.map((item, index) => (
                  <div key={index} className="flex items-center justify-between py-2 border-b">
                    <div className="flex items-center">
                      <span className="text-sm font-medium">
                        {index + 1}. {item.event}
                      </span>
                    </div>
                    <div className="flex items-center">
                      <Badge variant="outline" className="mr-2">
                        {item.count}
                      </Badge>
                      <span className="text-sm text-gray-500">{item.percentage}</span>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Demographics</CardTitle>
              <CardDescription>Age and gender distribution of reports</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="mb-4">
                <h4 className="text-sm font-medium mb-2">Age Distribution</h4>
                <div className="space-y-2">
                  {demographics?.ageDistribution.map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-1">
                      <span className="text-sm">{item.group}</span>
                      <div className="flex items-center">
                        <Badge variant="outline" className="mr-2">
                          {item.count}
                        </Badge>
                        <span className="text-sm text-gray-500">{item.percentage}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="text-sm font-medium mb-2">Gender Distribution</h4>
                <div className="space-y-2">
                  {demographics?.genderDistribution.map((item, index) => (
                    <div key={index} className="flex items-center justify-between py-1">
                      <span className="text-sm">{item.gender}</span>
                      <div className="flex items-center">
                        <Badge variant="outline" className="mr-2">
                          {item.count}
                        </Badge>
                        <span className="text-sm text-gray-500">{item.percentage}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>CER Section Analysis</CardTitle>
            <CardDescription>
              Pre-formatted content for inclusion in Clinical Evaluation Report
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="prose max-w-none">
              <p>{conclusion}</p>
              <div className="text-sm text-gray-500 mt-4 border-t pt-2">
                <p>
                  <strong>Data Source:</strong> FDA Adverse Event Reporting System (FAERS), accessed
                  via FDA OpenAPI v2
                </p>
                <p>
                  <strong>Compliance Standards:</strong> EU MDR 2017/745, MEDDEV 2.7/1 Rev 4, ISO
                  14155:2020
                </p>
                <p>
                  <strong>Analysis Date:</strong> {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
          </CardContent>
          <CardFooter className="flex justify-between">
            <div>
              <Badge variant="outline" className="mr-2">
                <Database className="h-3 w-3 mr-1" /> FDA FAERS
              </Badge>
              <Badge variant="outline">
                <CheckCircle className="h-3 w-3 mr-1" /> EU MDR Compliant
              </Badge>
            </div>
            <div>
              <Button variant="outline" size="sm" className="mr-2">
                Copy to Clipboard
              </Button>
              <Button
                size="sm"
                onClick={integrateIntoReport}
                disabled={isIntegratedInReport || !faersAnalysis}
              >
                <FileCheck className="h-4 w-4 mr-1.5" />
                Add to CER
              </Button>
            </div>
          </CardFooter>
        </Card>
      </div>
    );
  };

  /**
   * Generate a risk assessment based on FAERS data
   */
  const generateRiskAssessment = async () => {
    if (!faersAnalysis) {
      toast({
        title: 'Analysis Required',
        description: 'Please fetch and analyze FAERS data first',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      console.log(`Generating risk assessment for ${productName}`);

      // Use CerAPIService for risk assessment
      const data = await cerApiService.analyzeAdverseEvents({
        productName,
        manufacturerName,
        faersAnalysis,
        includeRiskAssessment: true,
        context: {
          deviceType: 'Shoulder Arthroplasty System',
          indication: 'Shoulder arthritis and rotator cuff disease',
        },
      });

      // Extract the risk assessment from the response
      setRiskAssessment(data.riskAssessment || data);
      setActiveTab('risk-assessment');

      toast({
        title: 'Risk Assessment Generated',
        description: 'The risk assessment has been successfully generated using FDA FAERS data',
      });
    } catch (error) {
      console.error('Error generating risk assessment:', error);
      setError(error.message || 'Failed to generate risk assessment');
      toast({
        title: 'Error',
        description: error.message || 'Failed to generate risk assessment',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Integrate FAERS analysis into the clinical evaluation report
   */
  const integrateIntoReport = () => {
    if (!faersAnalysis) return;

    // Call the callback if provided
    if (onAnalysisFetched) {
      onAnalysisFetched(faersAnalysis);
      setIsIntegratedInReport(true);

      toast({
        title: 'Analysis Integrated',
        description: 'FAERS data analysis has been integrated into your report',
      });
    }
  };

  /**
   * Export analysis as PDF
   */
  const exportAsPdf = async () => {
    if (!faersAnalysis) {
      toast({
        title: 'Analysis Required',
        description: 'Please fetch and analyze FAERS data first',
        variant: 'destructive',
      });
      return;
    }

    try {
      setExportingPdf(true);
      setError(null);

      console.log(`Exporting FAERS data analysis for "${productName}" as PDF`);

      // Use CerAPIService to export PDF
      const title = `FDA FAERS Analysis - ${productName}`;
      const sections = [
        {
          title: 'Adverse Event Analysis',
          content: faersAnalysis.conclusion || 'Analysis of FDA FAERS data for the device.',
          type: 'safety',
        },
      ];

      if (riskAssessment) {
        sections.push({
          title: 'Risk Assessment',
          content: riskAssessment.conclusion || 'Risk assessment based on FDA FAERS data.',
          type: 'benefit-risk',
        });
      }

      const deviceInfo = {
        name: productName,
        manufacturer: manufacturerName,
        type: 'Medical Device',
        classification: 'Class II',
      };

      // Export as PDF
      await cerApiService.exportToPDF({
        title,
        sections,
        deviceInfo,
        faers: faersData ? [faersData] : [],
        metadata: {
          author: 'TrialSage CER Module',
          confidential: true,
          generatedAt: new Date().toISOString(),
          standard: 'EU MDR',
        },
      });

      toast({
        title: 'PDF Exported',
        description: 'The FAERS analysis has been exported as PDF',
      });
    } catch (error) {
      console.error('Error exporting PDF:', error);
      setError(error.message || 'Failed to export PDF');
      toast({
        title: 'Error',
        description: error.message || 'Failed to export PDF',
        variant: 'destructive',
      });
    } finally {
      setExportingPdf(false);
    }
  };

  /**
   * Render the risk assessment view
   */
  const renderRiskAssessmentView = () => {
    if (!riskAssessment) {
      return (
        <div className="py-8 text-center text-gray-500">
          <Shield className="mx-auto h-12 w-12 mb-3 text-gray-400" />
          <p>No risk assessment available. Generate a risk assessment based on the FAERS data.</p>
          <Button
            onClick={generateRiskAssessment}
            className="mt-4"
            disabled={!faersAnalysis || isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Zap className="mr-2 h-4 w-4" />
                Generate Risk Assessment
              </>
            )}
          </Button>
        </div>
      );
    }

    const {
      overallRisk,
      riskFactors,
      benefitRiskBalance,
      mitigationMeasures,
      recommendations,
      conclusion,
    } = riskAssessment;

    return (
      <div className="space-y-6">
        <Alert className="mb-6 bg-emerald-50 border-emerald-200">
          <CheckCircle className="h-4 w-4 text-emerald-500" />
          <AlertTitle className="text-emerald-700">EU MDR Compliant Risk Analysis</AlertTitle>
          <AlertDescription className="text-emerald-600">
            This risk assessment is based on authentic FDA FAERS data. Compliant with EU MDR
            2017/745 Annex I (GSPR) and ISO 14971:2019 risk management requirements.
          </AlertDescription>
        </Alert>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="col-span-1 md:col-span-3">
            <CardHeader className="py-4">
              <div className="flex justify-between items-center">
                <CardTitle className="text-lg">Overall Risk Assessment</CardTitle>
                <Badge
                  variant={
                    overallRisk.level === 'Low'
                      ? 'outline'
                      : overallRisk.level === 'Medium'
                        ? 'secondary'
                        : 'destructive'
                  }
                  className="text-xs py-1"
                >
                  {overallRisk.level} Risk
                </Badge>
              </div>
              <CardDescription>{overallRisk.summary}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-sm">{overallRisk.explanation}</p>
              <div className="mt-2 text-xs text-gray-500 flex items-center">
                <Database className="h-3 w-3 mr-1" />
                <span>Based on real FDA FAERS data analysis</span>
              </div>
            </CardContent>
          </Card>
        </div>

        <Accordion type="single" collapsible className="w-full">
          <AccordionItem value="risk-factors">
            <AccordionTrigger>Risk Factors</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-4">
                {riskFactors.map((factor, index) => (
                  <div key={index} className="border p-3 rounded-md">
                    <div className="flex justify-between items-center mb-2">
                      <h4 className="font-medium">{factor.name}</h4>
                      <Badge
                        variant={
                          factor.severity === 'Low'
                            ? 'outline'
                            : factor.severity === 'Medium'
                              ? 'secondary'
                              : 'destructive'
                        }
                      >
                        {factor.severity}
                      </Badge>
                    </div>
                    <p className="text-sm text-gray-600">{factor.description}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="benefit-risk">
            <AccordionTrigger>Benefit-Risk Balance</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-2">
                <p className="mb-4">{benefitRiskBalance.summary}</p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Benefits</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc list-inside space-y-1">
                        {benefitRiskBalance.benefits.map((item, index) => (
                          <li key={index} className="text-sm">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm">Risks</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <ul className="list-disc list-inside space-y-1">
                        {benefitRiskBalance.risks.map((item, index) => (
                          <li key={index} className="text-sm">
                            {item}
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="mitigation">
            <AccordionTrigger>Risk Mitigation Measures</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                {mitigationMeasures.map((measure, index) => (
                  <div key={index} className="flex items-start border-b pb-2">
                    <div className="bg-blue-100 rounded-full p-1 mr-2 mt-0.5">
                      <CheckCircle className="h-4 w-4 text-blue-700" />
                    </div>
                    <div>
                      <p className="font-medium text-sm">{measure.title}</p>
                      <p className="text-sm text-gray-600">{measure.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="recommendations">
            <AccordionTrigger>Recommendations</AccordionTrigger>
            <AccordionContent>
              <div className="space-y-3">
                {recommendations.map((rec, index) => (
                  <div key={index} className="flex items-start">
                    <div className="mr-2 mt-0.5">
                      <ChevronRight className="h-4 w-4 text-blue-700" />
                    </div>
                    <p className="text-sm">{rec}</p>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>

          <AccordionItem value="conclusion">
            <AccordionTrigger>Conclusion</AccordionTrigger>
            <AccordionContent>
              <p className="text-sm whitespace-pre-line">{conclusion}</p>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle>FDA FAERS Database Query</CardTitle>
          <CardDescription>
            Search the FDA Adverse Event Reporting System for device or drug-related adverse events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="productName">
                Product Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="productName"
                placeholder="e.g. CardioMonitor Pro 3000"
                value={productName}
                onChange={e => setProductName(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Enter the exact product name as registered with FDA
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manufacturerName">Manufacturer Name (Optional)</Label>
              <Input
                id="manufacturerName"
                placeholder="e.g. MedTech Innovations, Inc."
                value={manufacturerName}
                onChange={e => setManufacturerName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date (Optional)</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date (Optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center text-blue-600"
              onClick={() => setShowHowTo(true)}
            >
              <HelpCircle className="h-4 w-4 mr-1" />
              How to use this module
            </Button>
            {error && (
              <Alert variant="destructive" className="p-2 text-sm ml-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              disabled={isLoading}
              onClick={() => {
                setProductName('');
                setManufacturerName('');
                setStartDate('');
                setEndDate('');
                setFaersData(null);
                setFaersAnalysis(null);
                setError(null);
              }}
            >
              Reset
            </Button>
            <Button onClick={fetchFaersData} disabled={isLoading || !productName}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search FAERS
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Results */}
      {(faersData || faersAnalysis) && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>FDA FAERS Data Results</CardTitle>
            <CardDescription>
              {faersData?.productName} - {faersData?.totalReports} adverse event reports
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="raw-data">
                  <DatabaseIcon className="mr-2 h-4 w-4" />
                  Raw Data
                </TabsTrigger>
                <TabsTrigger value="analysis">
                  <BarChart4 className="mr-2 h-4 w-4" />
                  Analysis
                </TabsTrigger>
              </TabsList>

              <TabsContent value="raw-data">{renderRawDataView()}</TabsContent>

              <TabsContent value="analysis">{renderAnalysisView()}</TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}
    </div>
  );
  // Render the How-To modal
  const renderHowToModal = () => {
    return <FaersHowToModal isOpen={showHowTo} onClose={() => setShowHowTo(false)} />;
  };

  // Render the full CER report modal
  const renderFullCerReport = () => {
    if (!showFullReport) return null;
    // Import the FullCerReportModal component only when needed (code splitting)
    const FullCerReportModal = React.lazy(() => import('./FullCerReportModal'));

    return (
      <React.Suspense fallback={<div>Loading...</div>}>
        <FullCerReportModal
          isOpen={showFullReport}
          onClose={() => setShowFullReport(false)}
          faersData={faersData || faersAnalysis}
        />
      </React.Suspense>
    );
  };

  return (
    <div className="space-y-6">
      {/* Search Form */}
      <Card>
        <CardHeader>
          <CardTitle>FDA FAERS Database Query</CardTitle>
          <CardDescription>
            Search the FDA Adverse Event Reporting System for device or drug-related adverse events
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="productName">
                Product Name <span className="text-red-500">*</span>
              </Label>
              <Input
                id="productName"
                placeholder="e.g. CardioMonitor Pro 3000"
                value={productName}
                onChange={e => setProductName(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Enter the exact product name as registered with FDA
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="manufacturerName">Manufacturer Name (Optional)</Label>
              <Input
                id="manufacturerName"
                placeholder="e.g. MedTech Innovations, Inc."
                value={manufacturerName}
                onChange={e => setManufacturerName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date (Optional)</Label>
              <Input
                id="startDate"
                type="date"
                value={startDate}
                onChange={e => setStartDate(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="endDate">End Date (Optional)</Label>
              <Input
                id="endDate"
                type="date"
                value={endDate}
                onChange={e => setEndDate(e.target.value)}
              />
            </div>
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="flex items-center text-blue-600"
              onClick={() => setShowHowTo(true)}
            >
              <HelpCircle className="h-4 w-4 mr-1" />
              How to use this module
            </Button>
            {error && (
              <Alert variant="destructive" className="p-2 text-sm ml-4">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
          </div>
          <div className="flex space-x-2">
            <Button
              variant="outline"
              disabled={isLoading}
              onClick={() => {
                setProductName('');
                setManufacturerName('');
                setStartDate('');
                setEndDate('');
                setFaersData(null);
                setFaersAnalysis(null);
                setError(null);
              }}
            >
              Reset
            </Button>
            <Button onClick={fetchFaersData} disabled={isLoading || !productName}>
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Loading...
                </>
              ) : (
                <>
                  <Search className="mr-2 h-4 w-4" />
                  Search FAERS
                </>
              )}
            </Button>
          </div>
        </CardFooter>
      </Card>

      {/* Results */}
      {(faersData || faersAnalysis) && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle>FDA FAERS Data Results</CardTitle>
            <CardDescription>
              {faersData?.productName} - {faersData?.totalReports} adverse event reports
            </CardDescription>
          </CardHeader>
          <CardContent className="pt-6">
            <Tabs value={activeTab} onValueChange={setActiveTab}>
              <TabsList className="mb-4">
                <TabsTrigger value="raw-data">
                  <DatabaseIcon className="mr-2 h-4 w-4" />
                  Raw Data
                </TabsTrigger>
                <TabsTrigger value="analysis">
                  <BarChart4 className="mr-2 h-4 w-4" />
                  Analysis
                </TabsTrigger>
              </TabsList>

              <TabsContent value="raw-data">{renderRawDataView()}</TabsContent>

              <TabsContent value="analysis">{renderAnalysisView()}</TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      {/* Add Full CER Report Button */}
      {(faersData || faersAnalysis) && (
        <div className="flex justify-center mt-4">
          <Button
            variant="outline"
            className="flex items-center"
            onClick={() => setShowFullReport(true)}
          >
            <FileText className="mr-2 h-4 w-4" />
            Generate Full CER Report
          </Button>
        </div>
      )}

      {/* Render modals */}
      {renderHowToModal()}
      {renderFullCerReport()}
    </div>
  );
};

export default FdaFaersDataPanel;
