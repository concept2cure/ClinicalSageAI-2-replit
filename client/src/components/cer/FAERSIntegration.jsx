import React, { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { searchFaersEvents, generateEventSummaryReport } from '@/services/faers-api';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/components/ui/toaster';
import {
  Loader2,
  RefreshCw,
  Search,
  FileText,
  CheckSquare,
  AlertTriangle,
  BarChart3,
  PieChart,
} from 'lucide-react';

/**
 * FAERS Integration Component for Clinical Evaluation Reports
 *
 * This component provides a user interface for searching, analyzing,
 * and integrating FDA Adverse Event Reporting System (FAERS) data
 * into clinical evaluation reports.
 */
export function FAERSIntegration({ productName, productId, onDataSelected, onSectionContent }) {
  const [searchTerm, setSearchTerm] = useState(productName || '');
  const [dateRange, setDateRange] = useState({
    startDate: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 year ago
    endDate: new Date().toISOString().split('T')[0], // today
  });
  const [selectedEvents, setSelectedEvents] = useState([]);
  const { toast } = useToast();

  // Search query state
  const [searchParams, setSearchParams] = useState(null);

  // FAERS search query
  const {
    data: searchResults,
    isLoading: isSearching,
    error: searchError,
    refetch: refetchSearch,
  } = useQuery({
    queryKey: ['/api/faers/search', searchParams],
    queryFn: () => (searchParams ? searchFaersEvents(searchParams) : Promise.resolve(null)),
    enabled: searchParams !== null,
  });

  // Summary report generation mutation
  const generateReportMutation = useMutation({
    mutationFn: generateEventSummaryReport,
    onSuccess: data => {
      toast({
        title: 'Report Generated',
        description: 'Adverse event summary report has been generated successfully.',
      });

      if (onSectionContent) {
        onSectionContent('adverse_events', data.reportContent);
      }
    },
    onError: error => {
      toast({
        title: 'Report Generation Failed',
        description: error.message || 'Failed to generate the report. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Handle search submission
  const handleSearch = () => {
    // Check if we have required Health Canada API key
    // In a production app, this would be checked server-side
    checkForHealthCanadaAPIKey();

    const params = {
      product_name: searchTerm,
      start_date: dateRange.startDate,
      end_date: dateRange.endDate,
      limit: 50,
    };

    setSearchParams(params);
  };

  // Function to check if we have the Health Canada API key
  const checkForHealthCanadaAPIKey = () => {
    // In a production environment, this check would be done server-side
    // We'll use a toast to simulate the requirement
    if (!process.env.HEALTH_CANADA_API_KEY) {
      toast({
        title: 'API Key Required',
        description:
          'Health Canada API key is required to access FAERS data. Please configure this key in your environment.',
        variant: 'destructive',
        duration: 5000,
      });
    }
  };

  // Handle event selection
  const toggleEventSelection = event => {
    if (selectedEvents.some(e => e.safetyreportid === event.safetyreportid)) {
      setSelectedEvents(selectedEvents.filter(e => e.safetyreportid !== event.safetyreportid));
    } else {
      setSelectedEvents([...selectedEvents, event]);
    }
  };

  // Handle report generation
  const handleGenerateReport = () => {
    const reportParams = {
      product_name: searchTerm,
      events: selectedEvents.length > 0 ? selectedEvents : searchResults?.results || [],
      start_date: dateRange.startDate,
      end_date: dateRange.endDate,
    };

    generateReportMutation.mutate(reportParams);
  };

  // Handle data integration
  const handleIntegrateData = () => {
    if (onDataSelected) {
      onDataSelected({
        sourceType: 'FAERS',
        data: selectedEvents.length > 0 ? selectedEvents : searchResults?.results || [],
        searchParams: {
          product: searchTerm,
          dateRange,
        },
      });
    }

    toast({
      title: 'Data Integrated',
      description: 'FAERS adverse event data has been added to your report.',
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex items-center">
          <AlertTriangle className="h-5 w-5 mr-2 text-amber-500" />
          FDA Adverse Event Reporting System (FAERS) Integration
        </CardTitle>
        <CardDescription>
          Search for and analyze adverse events related to your product for inclusion in your
          clinical evaluation report.
        </CardDescription>
      </CardHeader>

      <CardContent>
        <Tabs defaultValue="search">
          <TabsList className="mb-4">
            <TabsTrigger value="search">
              <Search className="h-4 w-4 mr-2" />
              Search
            </TabsTrigger>
            <TabsTrigger value="analysis" disabled={!searchResults}>
              <BarChart3 className="h-4 w-4 mr-2" />
              Analysis
            </TabsTrigger>
            <TabsTrigger value="report" disabled={!searchResults}>
              <FileText className="h-4 w-4 mr-2" />
              Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="search">
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="md:col-span-2">
                  <Label htmlFor="product-search">Product Name/Identifier</Label>
                  <Input
                    id="product-search"
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    placeholder="Enter product name or identifier"
                  />
                </div>
                <div>
                  <Label htmlFor="start-date">Start Date</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={dateRange.startDate}
                    onChange={e => setDateRange({ ...dateRange, startDate: e.target.value })}
                  />
                </div>
                <div>
                  <Label htmlFor="end-date">End Date</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={dateRange.endDate}
                    onChange={e => setDateRange({ ...dateRange, endDate: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex justify-end">
                <Button onClick={handleSearch} disabled={isSearching || !searchTerm}>
                  {isSearching ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Searching...
                    </>
                  ) : (
                    <>
                      <Search className="mr-2 h-4 w-4" />
                      Search FAERS
                    </>
                  )}
                </Button>
              </div>

              {searchError && (
                <Alert variant="destructive" className="mt-4">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertTitle>Error</AlertTitle>
                  <AlertDescription>
                    {searchError.message || 'Failed to search FAERS database. Please try again.'}
                  </AlertDescription>
                </Alert>
              )}

              {searchResults && (
                <div className="mt-6">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-medium">
                      Search Results
                      <span className="ml-2 text-sm text-gray-500">
                        ({searchResults.results?.length || 0} events found)
                      </span>
                    </h3>
                    <Button variant="outline" size="sm" onClick={() => refetchSearch()}>
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Refresh
                    </Button>
                  </div>

                  {searchResults.results?.length > 0 ? (
                    <div className="border rounded-md overflow-hidden">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-12"></TableHead>
                            <TableHead>Report ID</TableHead>
                            <TableHead>Event Date</TableHead>
                            <TableHead>Patient Age</TableHead>
                            <TableHead>Event Type</TableHead>
                            <TableHead>Outcome</TableHead>
                            <TableHead>Seriousness</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {searchResults.results.map(event => (
                            <TableRow
                              key={event.safetyreportid}
                              className={
                                selectedEvents.some(e => e.safetyreportid === event.safetyreportid)
                                  ? 'bg-primary/10'
                                  : ''
                              }
                            >
                              <TableCell>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0"
                                  onClick={() => toggleEventSelection(event)}
                                >
                                  <CheckSquare
                                    className={`h-4 w-4 ${selectedEvents.some(e => e.safetyreportid === event.safetyreportid) ? 'text-primary' : 'text-gray-300'}`}
                                  />
                                </Button>
                              </TableCell>
                              <TableCell className="font-medium">{event.safetyreportid}</TableCell>
                              <TableCell>
                                {new Date(event.receiptdate).toLocaleDateString()}
                              </TableCell>
                              <TableCell>{event.patient?.patientonsetage || 'N/A'}</TableCell>
                              <TableCell>
                                {event.reaction?.[0]?.reactionmeddrapt || 'Unknown'}
                              </TableCell>
                              <TableCell>
                                {event.serious === '1' ? (
                                  <span className="text-red-600 font-medium">Serious</span>
                                ) : (
                                  <span>Non-serious</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {event.seriousnessdeath === '1'
                                  ? 'Death'
                                  : event.seriousnesslifethreatening === '1'
                                    ? 'Life-threatening'
                                    : event.seriousnesshospitalization === '1'
                                      ? 'Hospitalization'
                                      : event.seriousnessdisabling === '1'
                                        ? 'Disabling'
                                        : event.seriousnesscongenitalanomali === '1'
                                          ? 'Congenital Anomaly'
                                          : event.seriousnessother === '1'
                                            ? 'Other Serious'
                                            : 'Not Specified'}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  ) : (
                    <div className="text-center py-8 border rounded-md bg-gray-50">
                      <p className="text-gray-500">
                        No adverse events found for the specified criteria.
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="analysis">
            <div className="space-y-6">
              <h3 className="text-lg font-medium">Adverse Event Analysis</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Event Severity Distribution</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 flex items-center justify-center">
                      <PieChart className="h-32 w-32 text-gray-300" />
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">Adverse Event Trends</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="h-64 flex items-center justify-center">
                      <BarChart3 className="h-32 w-32 text-gray-300" />
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="mt-4">
                <h4 className="text-md font-medium mb-2">Most Common Adverse Events</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Event Type</TableHead>
                      <TableHead className="text-right">Count</TableHead>
                      <TableHead className="text-right">% of Total</TableHead>
                      <TableHead>Seriousness</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {/* This would be populated with actual analytics data from the API */}
                    <TableRow>
                      <TableCell className="font-medium">
                        Please integrate with Health Canada API
                      </TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell className="text-right">-</TableCell>
                      <TableCell>-</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="report">
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-medium">Adverse Event Report</h3>

                <div className="flex space-x-2">
                  <Button
                    variant="outline"
                    onClick={handleIntegrateData}
                    disabled={!searchResults || generateReportMutation.isPending}
                  >
                    Integrate Selected Data
                  </Button>
                  <Button
                    onClick={handleGenerateReport}
                    disabled={!searchResults || generateReportMutation.isPending}
                  >
                    {generateReportMutation.isPending ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <FileText className="mr-2 h-4 w-4" />
                        Generate Report
                      </>
                    )}
                  </Button>
                </div>
              </div>

              {generateReportMutation.isSuccess ? (
                <div className="border rounded-md p-4">
                  <h4 className="font-medium mb-2">Report Preview</h4>
                  <div className="prose max-w-none">
                    <div
                      dangerouslySetInnerHTML={{
                        __html:
                          generateReportMutation.data?.reportPreview ||
                          'Report preview not available.',
                      }}
                    />
                  </div>
                </div>
              ) : (
                <div className="text-center py-12 border rounded-md bg-gray-50">
                  <FileText className="h-12 w-12 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-500">
                    Generate a report to preview adverse event analysis for your clinical
                    evaluation.
                  </p>
                </div>
              )}
            </div>
          </TabsContent>
        </Tabs>
      </CardContent>

      <CardFooter className="flex justify-between border-t pt-5">
        <div className="text-sm text-gray-500">
          Data sourced from FDA Adverse Event Reporting System (FAERS) and Health Canada
        </div>
        <Button variant="link" size="sm" onClick={checkForHealthCanadaAPIKey}>
          Check API Access
        </Button>
      </CardFooter>
    </Card>
  );
}
