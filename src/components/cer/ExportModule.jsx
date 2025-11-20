/**
 * ExportModule Component
 *
 * This component provides a comprehensive export and validation interface
 * for Clinical Evaluation Reports, with support for multiple export formats
 * and regulatory framework validation.
 */

import React, { useState } from 'react';
import { cerApiService } from '@/services/CerAPIService';
import ValidationEngine from './ValidationEngine';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Download,
  FileText,
  CheckSquare,
  ShieldCheck,
  RefreshCw,
  AlertTriangle,
  Download as DownloadIcon,
  FileSpreadsheet,
  FileCheck,
  FileCode,
} from 'lucide-react';
import { Loader2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const ExportModule = ({
  title,
  sections = [],
  deviceName,
  manufacturer,
  deviceType,
  isComplete = false,
  lastModified,
  onExport,
}) => {
  const [exportFormat, setExportFormat] = useState('pdf');
  const [exportTemplate, setExportTemplate] = useState('eu_mdr');
  const [includeAppendices, setIncludeAppendices] = useState(true);
  const [includeSummary, setIncludeSummary] = useState(true);
  const [includeArtwork, setIncludeArtwork] = useState(true);
  const [loading, setLoading] = useState(false);
  const [showPreExportDialog, setShowPreExportDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [reportUrl, setReportUrl] = useState('');
  const [documentId, setDocumentId] = useState('CER-2025-0508-001'); // In a real implementation, this would be passed in
  const [lastValidationData, setLastValidationData] = useState(null);
  const { toast } = useToast();

  // Format maps for UI
  const formatMap = {
    pdf: {
      icon: <FileText className="h-5 w-5" />,
      label: 'PDF Document',
      description: 'Standard PDF format suitable for submission and review',
    },
    docx: {
      icon: <FileText className="h-5 w-5" />,
      label: 'Word Document',
      description: 'Editable format with revision tracking capabilities',
    },
    html: {
      icon: <FileCode className="h-5 w-5" />,
      label: 'HTML Format',
      description: 'Web-friendly format for online viewing',
    },
    xml: {
      icon: <FileCode className="h-5 w-5" />,
      label: 'XML Format',
      description: 'Structured format suitable for eCTD submissions',
    },
    xlsx: {
      icon: <FileSpreadsheet className="h-5 w-5" />,
      label: 'Excel Format',
      description: 'Tabular format for data analysis and review',
    },
  };

  // Template maps for UI
  const templateMap = {
    eu_mdr: {
      label: 'EU MDR',
      description: 'Compliant with MEDDEV 2.7/1 Rev 4 and EU MDR requirements',
    },
    fda_510k: {
      label: 'FDA 510(k)',
      description: 'Suitable for US FDA 510(k) submissions',
    },
    ukca: {
      label: 'UKCA',
      description: 'Compliant with UK Conformity Assessment requirements',
    },
    health_canada: {
      label: 'Health Canada',
      description: 'Formatted for Health Canada Medical Device License applications',
    },
    ich: {
      label: 'ICH',
      description: 'International Council for Harmonisation format',
    },
  };

  // Handle validation completion
  const handleValidationComplete = data => {
    setLastValidationData(data);
  };

  // Handle export button click
  const handleExportClick = () => {
    if (!isComplete) {
      toast({
        title: 'Report Incomplete',
        description: 'Please complete all required sections before exporting',
        variant: 'warning',
      });
      return;
    }

    // Check if validation was performed and has issues
    if (lastValidationData && lastValidationData.summary.criticalIssues > 0) {
      setShowPreExportDialog(true);
    } else {
      // Proceed with export
      performExport();
    }
  };

  // Perform the actual export
  const performExport = async () => {
    setLoading(true);

    try {
      let result;

      // Prepare the export data
      const exportData = {
        title,
        sections,
        deviceInfo: {
          name: deviceName,
          manufacturer,
          type: deviceType,
        },
        metadata: {
          lastModified,
          includeAppendices,
          includeSummary,
          includeArtwork,
        },
        templateId: exportTemplate,
      };

      // Call the appropriate export function based on format
      if (exportFormat === 'pdf') {
        result = await cerApiService.exportToPDF(exportData);
      } else if (exportFormat === 'docx') {
        result = await cerApiService.exportToWord(exportData);
      } else {
        // For other formats, we would use different export functions
        // This is a placeholder for now
        await new Promise(resolve => setTimeout(resolve, 1500));
        result = { downloadUrl: '#' };
      }

      // Set the report URL for the success dialog
      setReportUrl(result.downloadUrl || '#');

      // Show success dialog
      setShowSuccessDialog(true);

      if (onExport) {
        onExport({
          format: exportFormat,
          template: exportTemplate,
          timestamp: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({
        title: 'Export Failed',
        description: error.message || 'An error occurred while exporting your report',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
      setShowPreExportDialog(false);
    }
  };

  return (
    <div className="space-y-4">
      <Tabs defaultValue="export">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="export" className="flex items-center gap-2">
            <Download className="h-4 w-4" />
            Export Options
          </TabsTrigger>
          <TabsTrigger value="validation" className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4" />
            Validation
          </TabsTrigger>
        </TabsList>

        <TabsContent value="export" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Export Clinical Evaluation Report</CardTitle>
              <CardDescription>Configure export options for your report</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Format selection */}
              <div className="space-y-2">
                <Label>Export Format</Label>
                <RadioGroup
                  value={exportFormat}
                  onValueChange={setExportFormat}
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
                >
                  {Object.entries(formatMap).map(([key, { icon, label, description }]) => (
                    <div key={key} className="relative">
                      <RadioGroupItem value={key} id={`format-${key}`} className="sr-only" />
                      <Label
                        htmlFor={`format-${key}`}
                        className={`
                          flex items-start gap-3 p-4 border rounded-md cursor-pointer hover:bg-secondary/20 transition-colors
                          ${exportFormat === key ? 'border-primary bg-primary/5' : 'border-muted bg-background'}
                        `}
                      >
                        <div className="mt-0.5">{icon}</div>
                        <div>
                          <p className="font-medium">{label}</p>
                          <p className="text-xs text-muted-foreground">{description}</p>
                        </div>
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>

              <Separator />

              {/* Template selection */}
              <div className="space-y-2">
                <Label>Regulatory Framework Template</Label>
                <Select value={exportTemplate} onValueChange={setExportTemplate}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select template" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(templateMap).map(([key, { label, description }]) => (
                      <SelectItem key={key} value={key}>
                        <div>
                          <span className="font-medium">{label}</span>
                          <span className="text-xs text-muted-foreground block mt-1">
                            {description}
                          </span>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Separator />

              {/* Content options */}
              <div className="space-y-3">
                <Label>Content Options</Label>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="include-appendices" className="cursor-pointer">
                      Include Appendices
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Add supporting documentation as appendices
                    </p>
                  </div>
                  <Switch
                    id="include-appendices"
                    checked={includeAppendices}
                    onCheckedChange={setIncludeAppendices}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="include-summary" className="cursor-pointer">
                      Include Executive Summary
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Add a comprehensive summary at the beginning
                    </p>
                  </div>
                  <Switch
                    id="include-summary"
                    checked={includeSummary}
                    onCheckedChange={setIncludeSummary}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <Label htmlFor="include-artwork" className="cursor-pointer">
                      Include Device Artwork
                    </Label>
                    <p className="text-xs text-muted-foreground">
                      Add device images and technical diagrams
                    </p>
                  </div>
                  <Switch
                    id="include-artwork"
                    checked={includeArtwork}
                    onCheckedChange={setIncludeArtwork}
                  />
                </div>
              </div>
            </CardContent>
            <CardFooter>
              <Button
                onClick={handleExportClick}
                className="gap-2"
                disabled={loading || !isComplete}
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Exporting...
                  </>
                ) : (
                  <>
                    <DownloadIcon className="h-4 w-4" />
                    Export Report
                  </>
                )}
              </Button>
              {!isComplete && (
                <p className="text-xs text-muted-foreground ml-4">
                  Please complete all required sections before exporting
                </p>
              )}
            </CardFooter>
          </Card>
        </TabsContent>

        <TabsContent value="validation">
          <ValidationEngine
            documentId={documentId}
            onValidationComplete={handleValidationComplete}
          />
        </TabsContent>
      </Tabs>

      {/* Pre-export warning dialog */}
      <Dialog open={showPreExportDialog} onOpenChange={setShowPreExportDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-amber-600">
              <AlertTriangle className="h-5 w-5" />
              Validation Issues Detected
            </DialogTitle>
            <DialogDescription>
              Your report has critical compliance issues that could affect regulatory submission
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p className="mb-4">The following critical issues were detected:</p>
            <ul className="list-disc pl-5 space-y-2">
              {lastValidationData?.issues
                .filter(issue => issue.severity === 'critical')
                .map(issue => (
                  <li key={issue.id} className="text-sm">
                    <span className="font-medium">{issue.location}:</span> {issue.message}
                  </li>
                ))}
            </ul>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPreExportDialog(false)}>
              Cancel Export
            </Button>
            <Button onClick={performExport} variant="default" className="gap-2">
              <DownloadIcon className="h-4 w-4" />
              Export Anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Export success dialog */}
      <Dialog open={showSuccessDialog} onOpenChange={setShowSuccessDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <FileCheck className="h-5 w-5" />
              Export Successful
            </DialogTitle>
            <DialogDescription>
              Your Clinical Evaluation Report has been exported successfully
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
            <p>
              The report has been generated in
              <span className="font-medium">
                {' '}
                {formatMap[exportFormat]?.label || exportFormat}{' '}
              </span>
              format using the
              <span className="font-medium">
                {' '}
                {templateMap[exportTemplate]?.label || exportTemplate}{' '}
              </span>
              template.
            </p>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSuccessDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExportModule;
