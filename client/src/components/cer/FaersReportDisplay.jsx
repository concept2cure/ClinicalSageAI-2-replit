import React, { useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, AlertCircle, CheckCircle, Filter, Download } from 'lucide-react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { FaersRiskBadge } from './FaersRiskBadge';
import { useFetchFAERS } from '@/hooks/useFetchFAERS';

/**
 * FAERS Report Display component
 * Shows FDA FAERS data with import capability, table view, and risk assessment
 */
export function FaersReportDisplay({ cerId }) {
  const {
    productName,
    reports,
    riskScore,
    riskAssessment,
    isLoading,
    error,
    success,
    summary,
    setProductName,
    fetchFaersData,
    resetFaersData,
    prepareForCerInclusion,
  } = useFetchFAERS('', cerId);

  const [activeTab, setActiveTab] = useState('summary');
  const [productInput, setProductInput] = useState('');
  const [selectedReports, setSelectedReports] = useState([]);
  const [includeInProgress, setIncludeInProgress] = useState(false);

  // Handle product name input
  const handleProductInputChange = e => {
    setProductInput(e.target.value);
  };

  // Handle import button click
  const handleImport = () => {
    if (productInput) {
      setProductName(productInput);
      fetchFaersData(productInput, cerId);
    }
  };

  // Handle include in CER button click
  const handleIncludeInCer = async () => {
    setIncludeInProgress(true);
    try {
      const analysisData = await prepareForCerInclusion();
      // In a real implementation, this would update the parent component
      // or trigger a state change to include the data in the CER
      console.log('Data prepared for CER inclusion:', analysisData);
      // Call a callback or update parent state
    } catch (err) {
      console.error('Error including data in CER:', err);
    } finally {
      setIncludeInProgress(false);
    }
  };

  // Toggle report selection
  const toggleReportSelection = reportId => {
    setSelectedReports(prev => {
      if (prev.includes(reportId)) {
        return prev.filter(id => id !== reportId);
      } else {
        return [...prev, reportId];
      }
    });
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle className="flex justify-between items-center">
          <span>FDA FAERS Data</span>
          {riskAssessment !== 'Unknown' && (
            <FaersRiskBadge riskLevel={riskAssessment.toLowerCase()} score={riskScore} />
          )}
        </CardTitle>
        <CardDescription>
          Import and analyze FDA Adverse Event Reporting System data for regulatory documents
        </CardDescription>
      </CardHeader>

      <CardContent>
        {/* Product import form */}
        <div className="flex mb-6 space-x-2">
          <input
            type="text"
            className="flex-1 px-3 py-2 border rounded-md"
            placeholder="Enter product/device name"
            value={productInput}
            onChange={handleProductInputChange}
          />
          <Button onClick={handleImport} disabled={!productInput || isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Importing...
              </>
            ) : (
              'Import from FAERS'
            )}
          </Button>
        </div>

        {/* Error message */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-md flex items-start">
            <AlertCircle className="h-5 w-5 text-red-500 mr-2 flex-shrink-0 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        {/* Success message */}
        {success && summary && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-md flex items-start">
            <CheckCircle className="h-5 w-5 text-green-500 mr-2 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-green-700 font-medium">
                Successfully imported FAERS data for {productName}
              </p>
              <p className="text-sm text-green-600 mt-1">
                Found {summary.totalReports} reports with {summary.seriousEvents} serious events.
              </p>
            </div>
          </div>
        )}

        {/* Results tabs */}
        {success && summary && (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="mt-4">
            <TabsList className="mb-4">
              <TabsTrigger value="summary">Summary</TabsTrigger>
              <TabsTrigger value="reports">Reports ({reports.length})</TabsTrigger>
              <TabsTrigger value="demographics">Demographics</TabsTrigger>
            </TabsList>

            {/* Summary tab */}
            <TabsContent value="summary">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                <div className="p-4 border rounded-md bg-gray-50">
                  <h3 className="font-medium text-gray-900 mb-2">Risk Assessment</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Risk Score:</span>
                      <span className="font-medium">{riskScore.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Assessment:</span>
                      <span className="font-medium">{riskAssessment}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Serious Events:</span>
                      <span className="font-medium">{summary.seriousEvents}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Total Reports:</span>
                      <span className="font-medium">{summary.totalReports}</span>
                    </div>
                  </div>
                </div>

                <div className="p-4 border rounded-md bg-gray-50">
                  <h3 className="font-medium text-gray-900 mb-2">Product Information</h3>
                  <div className="space-y-2">
                    <div className="flex justify-between">
                      <span className="text-gray-600">Name:</span>
                      <span className="font-medium">{productName}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">CER ID:</span>
                      <span className="font-medium">{cerId}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-gray-600">Included in CER:</span>
                      <span className="font-medium">
                        {summary.associatedWithCer ? 'Yes' : 'No'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-4">
                <Button onClick={handleIncludeInCer} disabled={includeInProgress}>
                  {includeInProgress ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processing...
                    </>
                  ) : (
                    'Include in CER'
                  )}
                </Button>
              </div>
            </TabsContent>

            {/* Reports tab */}
            <TabsContent value="reports">
              <div className="rounded-md border mb-4">
                <div className="flex justify-between p-2 bg-gray-50 border-b">
                  <div className="flex items-center space-x-2">
                    <Filter className="h-4 w-4 text-gray-500" />
                    <span className="text-sm font-medium">Filter Options</span>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm">
                      <Download className="h-4 w-4 mr-1" />
                      Export
                    </Button>
                  </div>
                </div>

                <div className="overflow-x-auto max-h-96">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12">Serious</TableHead>
                        <TableHead>Adverse Event</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead>Age</TableHead>
                        <TableHead>Sex</TableHead>
                        <TableHead>Report Date</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {reports.map((report, index) => (
                        <TableRow key={index}>
                          <TableCell>
                            {report.is_serious ? (
                              <Badge variant="destructive" className="rounded-full">
                                Yes
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="rounded-full">
                                No
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="font-medium">{report.reaction}</TableCell>
                          <TableCell>{report.outcome}</TableCell>
                          <TableCell>{report.age || 'Unknown'}</TableCell>
                          <TableCell>
                            {report.sex === '1'
                              ? 'Male'
                              : report.sex === '2'
                                ? 'Female'
                                : 'Unknown'}
                          </TableCell>
                          <TableCell>
                            {report.report_date
                              ? new Date(report.report_date).toLocaleDateString()
                              : 'Unknown'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </TabsContent>

            {/* Demographics tab */}
            <TabsContent value="demographics">
              <div className="p-4 border border-stone-200 rounded-md bg-stone-50">
                <h3 className="text-sm font-medium text-stone-900 mb-2">Demographic analysis</h3>
                <p className="text-xs text-stone-500">
                  Age and gender distributions for affected patients appear here once FAERS data
                  is loaded for this device class. Ask the AI assistant to summarize demographic
                  signals from the available reports.
                </p>
              </div>
            </TabsContent>
          </Tabs>
        )}
      </CardContent>

      <CardFooter className="flex justify-between">
        <Button variant="outline" onClick={resetFaersData} disabled={isLoading || !success}>
          Reset
        </Button>
      </CardFooter>
    </Card>
  );
}
