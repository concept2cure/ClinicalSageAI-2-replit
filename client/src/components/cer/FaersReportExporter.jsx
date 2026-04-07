import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, FileText, Download, FileDown } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { FaersRiskBadge } from './FaersRiskBadge';
import { useExportFAERS } from '../../hooks/useExportFAERS';

/**
 * FAERS Report Export Component
 *
 * Provides functionality to export FAERS data as PDF, Word, or integrate into CER
 */
export function FaersReportExporter({
  productName,
  faersData,
  cerId,
  onExportCompleted = () => {},
}) {
  const [isExporting, setIsExporting] = useState(false);
  const [exportFormat, setExportFormat] = useState('pdf');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [exportOptions, setExportOptions] = useState({
    includeSummary: true,
    includeAllReports: false,
    includeDemographics: true,
    includeRiskAssessment: true,
    includeMethodology: true,
  });

  // Toggle export option
  const toggleOption = option => {
    setExportOptions(prev => ({
      ...prev,
      [option]: !prev[option],
    }));
  };

  // Handle export button click
  const handleExport = () => {
    setShowExportDialog(true);
  };

  // Format summary text for export
  const formatSummary = () => {
    if (!faersData) return '';

    const { totalReports, seriousEvents, riskScore, severityAssessment } = faersData;
    const seriousEventsPercent = ((seriousEvents.length / totalReports) * 100).toFixed(1);

    return `
      Based on analysis of ${totalReports} adverse event reports from the FDA FAERS database, 
      ${productName} demonstrates a ${severityAssessment.toLowerCase()} risk profile with 
      ${seriousEvents.length} serious events reported (${seriousEventsPercent}% of all reports). 
      The calculated risk score is ${riskScore.toFixed(2)}. 
    `;
  };

  // Import the export hooks
  const { exportToPDF, exportToWord } = useExportFAERS();

  // Start export process
  const startExport = async () => {
    setIsExporting(true);

    try {
      // Basic construction of export data
      const exportData = {
        productName,
        cerId,
        summary: exportOptions.includeSummary ? formatSummary() : '',
        reportType: 'FAERS Adverse Event Analysis',
        riskLevel: faersData?.severityAssessment || 'Unknown',
        totalReports: faersData?.totalReports || 0,
        seriousEvents: faersData?.seriousEvents?.length || 0,
        exportFormat,
        exportOptions,
        exportDate: new Date().toISOString(),
      };

      console.log('Export data prepared:', exportData);

      let result;

      // Call the appropriate export function based on the selected format
      if (exportFormat === 'docx') {
        // Use the real DOCX export functionality
        result = await exportToWord(faersData, productName, exportOptions);
      } else if (exportFormat === 'pdf') {
        // Use the PDF export functionality
        result = await exportToPDF(faersData, productName);
      } else {
        // For JSON format - simply download as JSON
        const dataStr = JSON.stringify(faersData, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });
        const url = window.URL.createObjectURL(dataBlob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `faers_report_${productName.replace(/\s+/g, '_').toLowerCase()}.json`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        result = {
          success: true,
          fileName: a.download,
          fileSize: `${Math.round(dataBlob.size / 1024)}KB`,
          timestamp: new Date().toISOString(),
        };
      }

      // Inform parent component that export is complete
      onExportCompleted({
        ...result,
        format: exportFormat,
        message: `FAERS data for ${productName} exported successfully as ${exportFormat.toUpperCase()}`,
      });

      // Close the dialog
      setShowExportDialog(false);
    } catch (error) {
      console.error('Error exporting FAERS data:', error);

      onExportCompleted({
        success: false,
        error: error.message,
        message: 'Failed to export FAERS data',
      });
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <>
      <Button
        onClick={handleExport}
        disabled={!faersData || isExporting}
        className="flex items-center"
      >
        <FileDown className="mr-2 h-4 w-4" />
        Export Report
      </Button>

      {/* Export Configuration Dialog */}
      <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Export FAERS Report</DialogTitle>
            <DialogDescription>
              Configure your export options for the FAERS data analysis.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            {/* Product Information */}
            <div className="space-y-1">
              <h3 className="font-medium">Product Information</h3>
              <div className="text-sm text-gray-500">{productName}</div>
              {faersData && (
                <div className="flex items-center mt-1">
                  <span className="text-sm text-gray-500 mr-2">Risk Level:</span>
                  <FaersRiskBadge
                    riskLevel={faersData.severityAssessment.toLowerCase()}
                    score={faersData.riskScore}
                    compact
                  />
                </div>
              )}
            </div>

            {/* Format Selection */}
            <div className="space-y-2">
              <h3 className="font-medium">Export Format</h3>
              <div className="flex space-x-4">
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="pdf-format"
                    value="pdf"
                    checked={exportFormat === 'pdf'}
                    onChange={() => setExportFormat('pdf')}
                  />
                  <Label htmlFor="pdf-format">PDF</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="docx-format"
                    value="docx"
                    checked={exportFormat === 'docx'}
                    onChange={() => setExportFormat('docx')}
                  />
                  <Label htmlFor="docx-format">Word (DOCX)</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="radio"
                    id="json-format"
                    value="json"
                    checked={exportFormat === 'json'}
                    onChange={() => setExportFormat('json')}
                  />
                  <Label htmlFor="json-format">JSON</Label>
                </div>
              </div>
            </div>

            {/* Content Selection */}
            <div className="space-y-2">
              <h3 className="font-medium">Content to Include</h3>
              <div className="space-y-2">
                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-summary"
                    checked={exportOptions.includeSummary}
                    onCheckedChange={() => toggleOption('includeSummary')}
                  />
                  <Label htmlFor="include-summary">Executive Summary</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-risk"
                    checked={exportOptions.includeRiskAssessment}
                    onCheckedChange={() => toggleOption('includeRiskAssessment')}
                  />
                  <Label htmlFor="include-risk">Risk Assessment</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-demographics"
                    checked={exportOptions.includeDemographics}
                    onCheckedChange={() => toggleOption('includeDemographics')}
                  />
                  <Label htmlFor="include-demographics">Demographic Analysis</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-all-reports"
                    checked={exportOptions.includeAllReports}
                    onCheckedChange={() => toggleOption('includeAllReports')}
                  />
                  <Label htmlFor="include-all-reports">All Individual Reports</Label>
                </div>

                <div className="flex items-center space-x-2">
                  <Checkbox
                    id="include-methodology"
                    checked={exportOptions.includeMethodology}
                    onCheckedChange={() => toggleOption('includeMethodology')}
                  />
                  <Label htmlFor="include-methodology">Methodology &amp; References</Label>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowExportDialog(false)}
              disabled={isExporting}
            >
              Cancel
            </Button>
            <Button onClick={startExport} disabled={isExporting}>
              {isExporting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Exporting...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Export
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
