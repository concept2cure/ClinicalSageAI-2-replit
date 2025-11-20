import React, { useState } from 'react';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Separator } from '@/components/ui/separator';
import { Info, Download, CheckCircle, RefreshCw } from 'lucide-react';

/**
 * ReportGenerationPanel - A component to generate and download reports
 * This component provides UI for document generation for 510(k) and CER reports
 */
const ReportGenerationPanel = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [generatedReport, setGeneratedReport] = useState(null);
  const [reportType, setReportType] = useState('510k');
  const [format, setFormat] = useState('html');

  /**
   * Generate an example report based on the selected type and format
   */
  const generateExampleReport = async () => {
    setLoading(true);
    setError(null);
    setGeneratedReport(null);

    try {
      const response = await axios.get(
        `/api/document-assembly/example/${reportType}?format=${format}`
      );

      // Create a blob from the response
      const blob = new Blob([response.data], {
        type:
          format === 'html'
            ? 'text/html'
            : 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      });

      // Create a URL for the blob
      const url = URL.createObjectURL(blob);

      setGeneratedReport({
        url,
        fileName: `Example_${reportType}_Report.${format}`,
        blob,
      });
    } catch (err) {
      console.error('Error generating report:', err);
      setError(err.response?.data?.message || 'Failed to generate report. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  /**
   * Download the generated report
   */
  const downloadReport = () => {
    if (!generatedReport) return;

    // Create a temporary anchor element
    const a = document.createElement('a');
    a.href = generatedReport.url;
    a.download = generatedReport.fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  /**
   * View the generated report in a new tab
   */
  const viewReport = () => {
    if (!generatedReport) return;
    window.open(generatedReport.url, '_blank');
  };

  return (
    <Card className="w-full shadow-md">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center">
          <Download className="mr-2 h-5 w-5" />
          Report Generation
        </CardTitle>
        <CardDescription>
          Generate FDA-compliant reports for 510(k) submissions and clinical evaluations
        </CardDescription>
      </CardHeader>

      <Separator />

      <CardContent className="pt-6">
        <Tabs value={reportType} onValueChange={setReportType} className="w-full">
          <TabsList className="w-full mb-6">
            <TabsTrigger value="510k" className="flex-1">
              510(k) Submission
            </TabsTrigger>
            <TabsTrigger value="cer" className="flex-1">
              Clinical Evaluation Report
            </TabsTrigger>
          </TabsList>

          <TabsContent value="510k" className="space-y-4">
            <div className="rounded-lg bg-blue-50 p-4">
              <h3 className="text-sm font-medium flex items-center text-blue-900">
                <Info className="h-4 w-4 mr-2" />
                510(k) Submission Report
              </h3>
              <p className="text-sm text-blue-800 mt-1">
                Generate a complete 510(k) submission with device information, substantial
                equivalence comparison, and FDA-compliant formatting.
              </p>
            </div>

            <div className="flex space-x-4 mt-4">
              <Button
                variant="outline"
                className={`flex-1 ${format === 'html' ? 'bg-blue-50' : ''}`}
                onClick={() => setFormat('html')}
              >
                HTML Format
              </Button>
              <Button
                variant="outline"
                className={`flex-1 ${format === 'docx' ? 'bg-blue-50' : ''}`}
                onClick={() => setFormat('docx')}
              >
                Word Document
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="cer" className="space-y-4">
            <div className="rounded-lg bg-emerald-50 p-4">
              <h3 className="text-sm font-medium flex items-center text-emerald-900">
                <Info className="h-4 w-4 mr-2" />
                Clinical Evaluation Report
              </h3>
              <p className="text-sm text-emerald-800 mt-1">
                Generate a complete Clinical Evaluation Report with device information, clinical
                data, literature review, and compliant formatting.
              </p>
            </div>

            <div className="flex space-x-4 mt-4">
              <Button
                variant="outline"
                className={`flex-1 ${format === 'html' ? 'bg-emerald-50' : ''}`}
                onClick={() => setFormat('html')}
              >
                HTML Format
              </Button>
              <Button
                variant="outline"
                className={`flex-1 ${format === 'docx' ? 'bg-emerald-50' : ''}`}
                onClick={() => setFormat('docx')}
              >
                Word Document
              </Button>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <Alert variant="destructive" className="mt-6">
            <AlertTitle>Error</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {generatedReport && (
          <Alert className="mt-6 bg-green-50 border-green-200">
            <CheckCircle className="h-4 w-4 text-green-600" />
            <AlertTitle className="text-green-800">Report Generated Successfully</AlertTitle>
            <AlertDescription className="text-green-700">
              Your {reportType.toUpperCase()} report is ready for download or viewing.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>

      <CardFooter className="flex flex-col sm:flex-row gap-3 pt-2">
        <Button
          onClick={generateExampleReport}
          disabled={loading}
          className="w-full sm:w-auto"
          variant="default"
        >
          {loading && <RefreshCw className="mr-2 h-4 w-4 animate-spin" />}
          Generate Example Report
        </Button>

        {generatedReport && (
          <>
            <Button onClick={downloadReport} variant="outline" className="w-full sm:w-auto">
              <Download className="mr-2 h-4 w-4" />
              Download Report
            </Button>

            <Button onClick={viewReport} variant="secondary" className="w-full sm:w-auto">
              View Report
            </Button>
          </>
        )}
      </CardFooter>
    </Card>
  );
};

export default ReportGenerationPanel;
