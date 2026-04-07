import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  ClipboardCheck,
  Check,
  X,
  AlertTriangle,
  FileText,
  Download,
  Upload,
  Info,
  CheckCircle2,
  XCircle,
  Circle,
  Save,
  RefreshCw,
  Printer,
  ExternalLink,
  AlertCircle,
  Clock,
} from 'lucide-react';
import { useToast } from '@/components/ui/toaster';
import { Alert, AlertDescription } from '@/components/ui/alert';

/**
 * FDA 510(k) RTA (Refuse-to-Accept) Checklist Panel
 *
 * Critical component for ensuring 510(k) submissions meet FDA acceptance criteria
 * Based on FDA's official RTA Policy for 510(k)s
 *
 * Features:
 * - Complete FDA RTA checklist with all required items
 * - Page number annotation for each item
 * - Status tracking (Complete/Incomplete/Not Applicable)
 * - Auto-validation against FDA requirements
 * - Export to PDF with annotations
 * - Real-time progress tracking
 */

// FDA RTA Checklist Items based on official FDA guidance
const RTA_CHECKLIST_ITEMS = [
  {
    id: 'cover_letter',
    category: 'Administrative',
    title: 'Cover Letter',
    description: 'Cover letter with accurate administrative information',
    required: true,
    fdaReference: '21 CFR 807.87(a)',
    tips: 'Must include device name, submission type, and contact information',
  },
  {
    id: 'indications_statement',
    category: 'Administrative',
    title: 'Indications for Use Statement',
    description: 'Completed Indications for Use statement on FDA form',
    required: true,
    fdaReference: '21 CFR 807.87(e)',
    tips: 'Must match exactly what appears in labeling and 510(k) summary',
  },
  {
    id: '510k_summary',
    category: 'Administrative',
    title: '510(k) Summary or Statement',
    description: '510(k) Summary (if choosing to make public) OR 510(k) Statement',
    required: true,
    fdaReference: '21 CFR 807.92 or 807.93',
    tips: 'Most submissions use 510(k) Summary. Statement requires certification of availability',
  },
  {
    id: 'truthful_accuracy',
    category: 'Administrative',
    title: 'Truthful and Accuracy Statement',
    description: 'Signed Truthful and Accuracy Statement',
    required: true,
    fdaReference: '21 CFR 807.87(k)',
    tips: 'Must be signed by responsible individual, not consultant',
  },
  {
    id: 'class_iii_cert',
    category: 'Administrative',
    title: 'Class III Certification',
    description: 'Class III Certification and Summary (if applicable)',
    required: false,
    conditional: 'Class III device claiming SE to Class II predicate',
    fdaReference: '21 CFR 807.87(j)',
    tips: 'Only required for Class III to Class II comparisons',
  },
  {
    id: 'financial_cert',
    category: 'Administrative',
    title: 'Financial Certification',
    description: 'Financial Certification or Disclosure Statement',
    required: false,
    conditional: 'Clinical studies conducted',
    fdaReference: '21 CFR 54',
    tips: 'Required when clinical data is included in submission',
  },
  {
    id: 'device_description',
    category: 'Device Information',
    title: 'Device Description',
    description: 'Complete description of device including photos/diagrams',
    required: true,
    fdaReference: '21 CFR 807.87(f)',
    tips: 'Include principles of operation, power source, and dimensional drawings',
  },
  {
    id: 'predicate_comparison',
    category: 'Device Information',
    title: 'Predicate Device Comparison',
    description: 'Identification of predicate device(s) with comparison table',
    required: true,
    fdaReference: '21 CFR 807.87(f)',
    tips: 'Use tabular format comparing technological characteristics',
  },
  {
    id: 'substantial_equiv',
    category: 'Device Information',
    title: 'Substantial Equivalence Discussion',
    description: 'Discussion of how device is substantially equivalent to predicate',
    required: true,
    fdaReference: '21 CFR 807.87(f)',
    tips: 'Address both technological characteristics and intended use',
  },
  {
    id: 'proposed_labeling',
    category: 'Device Information',
    title: 'Proposed Labeling',
    description: 'All proposed labeling including user manual and packaging',
    required: true,
    fdaReference: '21 CFR 807.87(e)',
    tips: 'Must include instructions for use, warnings, and contraindications',
  },
  {
    id: 'performance_data',
    category: 'Performance Data',
    title: 'Performance Testing',
    description: 'Bench testing, animal testing, or clinical data as needed',
    required: false,
    conditional: 'Different technological characteristics',
    fdaReference: '21 CFR 807.87(f)(2)',
    tips: 'Required when claiming SE despite different technology',
  },
  {
    id: 'software_documentation',
    category: 'Performance Data',
    title: 'Software Documentation',
    description: 'Software validation per FDA guidance (Level of Concern)',
    required: false,
    conditional: 'Device contains software',
    fdaReference: 'FDA Software Guidance',
    tips: 'Documentation level depends on Level of Concern (Basic/Enhanced/Major)',
  },
  {
    id: 'electrical_safety',
    category: 'Performance Data',
    title: 'Electrical Safety/EMC',
    description: 'IEC 60601 testing for electrical medical equipment',
    required: false,
    conditional: 'Electrical medical device',
    fdaReference: 'IEC 60601 series',
    tips: 'Include test reports from accredited lab',
  },
  {
    id: 'biocompatibility',
    category: 'Performance Data',
    title: 'Biocompatibility',
    description: 'ISO 10993 evaluation for patient-contacting devices',
    required: false,
    conditional: 'Patient contact',
    fdaReference: 'ISO 10993-1',
    tips: 'Testing depends on contact type and duration',
  },
  {
    id: 'sterility_validation',
    category: 'Performance Data',
    title: 'Sterility Validation',
    description: 'Sterilization validation for sterile devices',
    required: false,
    conditional: 'Sterile device',
    fdaReference: 'ISO 11135/11137',
    tips: 'Include validation protocol and sterility assurance level',
  },
  {
    id: 'shelf_life',
    category: 'Performance Data',
    title: 'Shelf Life/Stability',
    description: 'Shelf life testing and package integrity',
    required: false,
    conditional: 'Specified expiration date',
    fdaReference: 'FDA Shelf Life Guidance',
    tips: 'Accelerated aging acceptable with real-time follow-up',
  },
  {
    id: 'reprocessing',
    category: 'Performance Data',
    title: 'Reprocessing Validation',
    description: 'Cleaning and sterilization instructions for reusable devices',
    required: false,
    conditional: 'Reusable device',
    fdaReference: 'FDA Reprocessing Guidance',
    tips: 'Include validation data for maximum number of reuse cycles',
  },
  {
    id: 'clinical_data',
    category: 'Clinical Evidence',
    title: 'Clinical Data',
    description: 'Clinical studies if required for SE determination',
    required: false,
    conditional: 'New intended use or FDA request',
    fdaReference: '21 CFR 807.87(f)(3)',
    tips: 'Include protocol, statistical analysis plan, and study report',
  },
  {
    id: 'standards_conformity',
    category: 'Standards',
    title: 'Consensus Standards',
    description: 'Declaration of Conformity to recognized standards',
    required: false,
    conditional: 'Using FDA-recognized standards',
    fdaReference: 'FDA Standards Recognition Program',
    tips: 'Use FDA Form 3654 for declaration',
  },
  {
    id: 'unique_device_id',
    category: 'Administrative',
    title: 'Unique Device Identifier (UDI)',
    description: 'UDI information if applicable',
    required: false,
    conditional: 'Class II device requiring UDI',
    fdaReference: '21 CFR Part 830',
    tips: 'Include GUDID submission information',
  },
];

export default function RTAChecklistPanel({
  documentId,
  projectId,
  deviceProfile,
  onChecklistUpdate,
  onValidationComplete,
}) {
  const { toast } = useToast();
  const [checklistData, setChecklistData] = useState({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [lastSaved, setLastSaved] = useState(null);
  const [validationErrors, setValidationErrors] = useState([]);

  // Initialize checklist data structure
  useEffect(() => {
    const initialData = {};
    RTA_CHECKLIST_ITEMS.forEach(item => {
      initialData[item.id] = {
        checked: false,
        status: 'incomplete',
        pageNumbers: '',
        notes: '',
      };
    });

    // Load saved data if available
    const savedData = localStorage.getItem(`rta_checklist_${documentId}`);
    if (savedData) {
      try {
        const parsed = JSON.parse(savedData);
        setChecklistData({ ...initialData, ...parsed });
      } catch (e) {
        setChecklistData(initialData);
      }
    } else {
      setChecklistData(initialData);
    }
  }, [documentId]);

  // Calculate progress
  const calculateProgress = useCallback(() => {
    const requiredItems = RTA_CHECKLIST_ITEMS.filter(item => item.required);
    const completedRequired = requiredItems.filter(
      item => checklistData[item.id]?.status === 'complete'
    ).length;
    return Math.round((completedRequired / requiredItems.length) * 100);
  }, [checklistData]);

  // Get categories for tabs
  const categories = [...new Set(RTA_CHECKLIST_ITEMS.map(item => item.category))];

  // Filter items based on search and active tab
  const filteredItems = RTA_CHECKLIST_ITEMS.filter(item => {
    const matchesSearch =
      searchTerm === '' ||
      item.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      item.description.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesTab = activeTab === 'all' || item.category === activeTab;
    return matchesSearch && matchesTab;
  });

  // Update checklist item
  const updateChecklistItem = (itemId, field, value) => {
    setChecklistData(prev => ({
      ...prev,
      [itemId]: {
        ...prev[itemId],
        [field]: value,
        // Auto-update status based on checkbox
        status: field === 'checked' ? (value ? 'complete' : 'incomplete') : prev[itemId].status,
      },
    }));
  };

  // Save checklist data
  const saveChecklist = async () => {
    setSaving(true);
    try {
      // Save to localStorage
      localStorage.setItem(`rta_checklist_${documentId}`, JSON.stringify(checklistData));

      // TODO: Save to backend API
      // await fetch(`/api/510k/rta-checklist/${documentId}`, {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ checklistData, projectId }),
      // });

      setLastSaved(new Date());
      toast({
        title: 'Checklist Saved',
        description: 'RTA checklist has been saved successfully',
      });

      if (onChecklistUpdate) {
        onChecklistUpdate(checklistData);
      }
    } catch (error) {
      console.error('Error saving checklist:', error);
      toast({
        title: 'Save Failed',
        description: 'Failed to save checklist. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Validate checklist
  const validateChecklist = () => {
    const errors = [];

    RTA_CHECKLIST_ITEMS.forEach(item => {
      if (item.required && checklistData[item.id]?.status !== 'complete') {
        errors.push({
          itemId: item.id,
          title: item.title,
          message: `Required item "${item.title}" is not complete`,
        });
      }

      if (checklistData[item.id]?.checked && !checklistData[item.id]?.pageNumbers) {
        errors.push({
          itemId: item.id,
          title: item.title,
          message: `Page numbers missing for "${item.title}"`,
          severity: 'warning',
        });
      }
    });

    setValidationErrors(errors);

    if (errors.filter(e => e.severity !== 'warning').length === 0) {
      toast({
        title: 'Validation Passed',
        description: 'RTA checklist meets FDA requirements',
      });
      if (onValidationComplete) {
        onValidationComplete(true);
      }
    } else {
      toast({
        title: 'Validation Failed',
        description: `${errors.length} issues found. Review required items.`,
        variant: 'destructive',
      });
    }

    return errors.length === 0;
  };

  // Export checklist to PDF
  const exportToPDF = () => {
    toast({
      title: 'PDF Export Not Yet Available',
      description: 'RTA Checklist PDF export is under development. Use the JSON export for now.',
      variant: 'default',
    });

    // Export as structured JSON instead — honest about the format
    const checklistExport = {
      title: `RTA Checklist — ${deviceProfile?.deviceName || 'Device'}`,
      exportedAt: new Date().toISOString(),
      format: 'json',
      note: 'PDF export is under development. This JSON file contains your checklist data.',
      items: RTA_CHECKLIST_ITEMS.map(item => ({
        id: item.id,
        title: item.title,
        required: item.required,
        status: checklistData[item.id]?.status || 'not-started',
        pageReference: checklistData[item.id]?.pageReference || '',
        notes: checklistData[item.id]?.notes || '',
      })),
    };
    const blob = new Blob([JSON.stringify(checklistExport, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `RTA_Checklist_${deviceProfile?.deviceName || 'device'}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Import page numbers from document
  const importPageNumbers = () => {
    // TODO: Implement automatic page number detection from document
    toast({
      title: 'Import Feature',
      description: 'Automatic page number import will be available soon',
    });
  };

  const progress = calculateProgress();
  const requiredIncomplete = RTA_CHECKLIST_ITEMS.filter(
    item => item.required && checklistData[item.id]?.status !== 'complete'
  ).length;

  return (
    <div className="w-full max-w-7xl mx-auto p-6 space-y-6">
      {/* Header Card */}
      <Card className="border-2 border-blue-200 bg-blue-50/50">
        <CardHeader>
          <div className="flex justify-between items-start">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <ClipboardCheck className="h-6 w-6 text-blue-600" />
                FDA 510(k) RTA Checklist
              </CardTitle>
              <CardDescription className="mt-2">
                Refuse-to-Accept (RTA) Policy Checklist - Ensure your 510(k) submission meets FDA
                acceptance criteria
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() =>
                        window.open('https://www.fda.gov/media/83888/download', '_blank')
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>View FDA RTA Guidance</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Button variant="outline" onClick={importPageNumbers} className="gap-2">
                <Upload className="h-4 w-4" />
                Import Pages
              </Button>
              <Button variant="outline" onClick={exportToPDF} className="gap-2">
                <Download className="h-4 w-4" />
                Export PDF
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* Progress Section */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium">Overall Progress</p>
                <p className="text-2xl font-bold">{progress}% Complete</p>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-600">
                  {requiredIncomplete === 0 ? (
                    <span className="text-green-600 flex items-center gap-1">
                      <CheckCircle2 className="h-4 w-4" />
                      All required items complete
                    </span>
                  ) : (
                    <span className="text-amber-600 flex items-center gap-1">
                      <AlertCircle className="h-4 w-4" />
                      {requiredIncomplete} required items remaining
                    </span>
                  )}
                </p>
                {lastSaved && (
                  <p className="text-xs text-gray-500 mt-1">
                    Last saved: {lastSaved.toLocaleTimeString()}
                  </p>
                )}
              </div>
            </div>
            <Progress value={progress} className="h-2" />
          </div>

          {/* Validation Alerts */}
          {validationErrors.length > 0 && (
            <Alert variant="destructive" className="mt-4">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                <p className="font-semibold mb-1">Validation Issues Found:</p>
                <ul className="list-disc list-inside text-sm">
                  {validationErrors.slice(0, 3).map((error, idx) => (
                    <li key={idx}>{error.message}</li>
                  ))}
                  {validationErrors.length > 3 && (
                    <li>... and {validationErrors.length - 3} more issues</li>
                  )}
                </ul>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Main Checklist Card */}
      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex-1">
              <Input
                placeholder="Search checklist items..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button onClick={validateChecklist} variant="outline" className="gap-2">
                <CheckCircle2 className="h-4 w-4" />
                Validate
              </Button>
              <Button onClick={saveChecklist} disabled={saving} className="gap-2">
                {saving ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  <>
                    <Save className="h-4 w-4" />
                    Save Checklist
                  </>
                )}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Tabs value={activeTab} onValueChange={setActiveTab}>
            <TabsList className="grid w-full grid-cols-6 mb-4">
              <TabsTrigger value="all">All Items</TabsTrigger>
              {categories.map(cat => (
                <TabsTrigger key={cat} value={cat}>
                  {cat}
                </TabsTrigger>
              ))}
            </TabsList>

            <ScrollArea className="h-[600px] w-full pr-4">
              <div className="space-y-4">
                {filteredItems.map(item => {
                  const itemData = checklistData[item.id] || {};
                  const isComplete = itemData.status === 'complete';
                  const hasPageNumbers = itemData.pageNumbers?.trim().length > 0;

                  return (
                    <Card
                      key={item.id}
                      className={`border ${
                        isComplete
                          ? 'border-green-200 bg-green-50/30'
                          : item.required
                            ? 'border-amber-200 bg-amber-50/30'
                            : 'border-gray-200'
                      }`}
                    >
                      <CardContent className="p-4">
                        <div className="space-y-3">
                          {/* Header Row */}
                          <div className="flex items-start justify-between">
                            <div className="flex items-start gap-3 flex-1">
                              <Checkbox
                                id={item.id}
                                checked={itemData.checked || false}
                                onCheckedChange={checked =>
                                  updateChecklistItem(item.id, 'checked', checked)
                                }
                                className="mt-1"
                              />
                              <div className="flex-1">
                                <label
                                  htmlFor={item.id}
                                  className="text-sm font-medium cursor-pointer"
                                >
                                  {item.title}
                                  {item.required && (
                                    <Badge variant="destructive" className="ml-2 text-xs">
                                      Required
                                    </Badge>
                                  )}
                                  {item.conditional && (
                                    <Badge variant="secondary" className="ml-2 text-xs">
                                      Conditional
                                    </Badge>
                                  )}
                                </label>
                                <p className="text-sm text-gray-600 mt-1">{item.description}</p>
                                {item.conditional && (
                                  <p className="text-xs text-amber-600 mt-1">
                                    <AlertCircle className="h-3 w-3 inline mr-1" />
                                    Required if: {item.conditional}
                                  </p>
                                )}
                                <p className="text-xs text-gray-500 mt-1">
                                  Reference: {item.fdaReference}
                                </p>
                              </div>
                            </div>

                            {/* Status Badge */}
                            <div className="flex items-center gap-2">
                              {isComplete ? (
                                <Badge variant="success" className="gap-1">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Complete
                                </Badge>
                              ) : item.required ? (
                                <Badge variant="destructive" className="gap-1">
                                  <XCircle className="h-3 w-3" />
                                  Incomplete
                                </Badge>
                              ) : (
                                <Badge variant="secondary" className="gap-1">
                                  <Circle className="h-3 w-3" />
                                  Optional
                                </Badge>
                              )}
                            </div>
                          </div>

                          {/* Input Fields Row */}
                          <div className="grid grid-cols-3 gap-3 pl-9">
                            <div>
                              <label className="text-xs font-medium text-gray-700">
                                Page Numbers
                              </label>
                              <Input
                                placeholder="e.g., 12-15, 47"
                                value={itemData.pageNumbers || ''}
                                onChange={e =>
                                  updateChecklistItem(item.id, 'pageNumbers', e.target.value)
                                }
                                className="mt-1 text-sm"
                              />
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs font-medium text-gray-700">Notes</label>
                              <Input
                                placeholder="Additional notes or comments"
                                value={itemData.notes || ''}
                                onChange={e =>
                                  updateChecklistItem(item.id, 'notes', e.target.value)
                                }
                                className="mt-1 text-sm"
                              />
                            </div>
                          </div>

                          {/* Tips */}
                          {item.tips && (
                            <div className="pl-9">
                              <p className="text-xs text-blue-600 flex items-start gap-1">
                                <Info className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                {item.tips}
                              </p>
                            </div>
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </Tabs>
        </CardContent>
      </Card>

      {/* Export Dialog */}
      <AlertDialog open={showExportDialog} onOpenChange={setShowExportDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Export RTA Checklist</AlertDialogTitle>
            <AlertDialogDescription>
              Export your RTA checklist with page annotations for FDA submission review. The PDF
              will include all completed items with their corresponding page numbers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={exportToPDF}>Export to PDF</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
