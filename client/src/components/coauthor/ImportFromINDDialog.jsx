/**
 * Import from IND Dialog Component
 * 
 * Allows users to import IND submission data into eCTD Co-Author documents
 */

import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Checkbox } from '@/components/ui/checkbox';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  FileDown,
  AlertCircle,
  CheckCircle,
  ChevronRight,
  Loader2,
  Eye,
  FileText,
  Package,
  Shield,
  Calendar,
  User,
  TrendingUp,
  GitMerge,
  FileWarning,
  ArrowRight,
  Search,
} from 'lucide-react';

const ImportFromINDDialog = ({ isOpen, onClose, targetDocumentId, onImportComplete }) => {
  const { toast } = useToast();
  const [selectedSubmission, setSelectedSubmission] = useState(null);
  const [selectedSections, setSelectedSections] = useState([]);
  const [importType, setImportType] = useState('merge');
  const [currentStep, setCurrentStep] = useState(1); // 1: Select IND, 2: Select Sections, 3: Review & Import
  const [importProgress, setImportProgress] = useState(0);

  // Fetch available IND submissions
  const { data: submissions, isLoading: loadingSubmissions } = useQuery({
    queryKey: ['/api/coauthor/import/ind'],
    enabled: isOpen,
  });

  // Import mutation
  const importMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiRequest(
        `/api/coauthor/import/ind/${data.indId}`,
        'POST',
        {
          targetDocumentId,
          selectedSections: data.selectedSections,
          importType: data.importType,
          conflictResolution: 'merge',
        }
      );
      return response;
    },
    onMutate: () => {
      setImportProgress(10);
    },
    onSuccess: (data) => {
      setImportProgress(100);
      toast({
        title: 'Import Successful',
        description: data.message || 'IND data has been successfully imported',
        duration: 5000,
      });
      
      // Invalidate relevant queries
      queryClient.invalidateQueries(['/api/coauthor/documents']);
      queryClient.invalidateQueries([`/api/coauthor/documents/${targetDocumentId}`]);
      
      // Call parent callback
      if (onImportComplete) {
        onImportComplete(data);
      }
      
      // Close dialog after short delay
      setTimeout(() => {
        handleClose();
      }, 1500);
    },
    onError: (error) => {
      toast({
        title: 'Import Failed',
        description: error.message || 'Failed to import IND data',
        variant: 'destructive',
      });
      setImportProgress(0);
    },
  });

  // Handle section selection
  const handleSectionToggle = (section) => {
    setSelectedSections((prev) => {
      if (prev.includes(section)) {
        return prev.filter((s) => s !== section);
      } else {
        return [...prev, section];
      }
    });
  };

  // Handle import
  const handleImport = () => {
    if (!selectedSubmission || selectedSections.length === 0) {
      toast({
        title: 'Selection Required',
        description: 'Please select an IND submission and at least one section to import',
        variant: 'destructive',
      });
      return;
    }

    // Simulate progress updates
    setImportProgress(25);
    const progressInterval = setInterval(() => {
      setImportProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        return prev + 10;
      });
    }, 500);

    importMutation.mutate({
      indId: selectedSubmission.id,
      selectedSections,
      importType,
    });
  };

  // Reset dialog state
  const handleClose = () => {
    setSelectedSubmission(null);
    setSelectedSections([]);
    setImportType('merge');
    setCurrentStep(1);
    setImportProgress(0);
    onClose();
  };

  // Render step content
  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Select IND Submission</h3>
              <Badge variant="secondary">{submissions?.count || 0} Available</Badge>
            </div>

            {loadingSubmissions ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-24 w-full" />
                ))}
              </div>
            ) : (
              <ScrollArea className="h-[400px] pr-4">
                <div className="space-y-3">
                  {submissions?.submissions?.map((submission) => (
                    <Card
                      key={submission.id}
                      className={`cursor-pointer transition-all ${
                        selectedSubmission?.id === submission.id
                          ? 'ring-2 ring-primary'
                          : 'hover:shadow-md'
                      }`}
                      onClick={() => setSelectedSubmission(submission)}
                      data-testid={`ind-submission-${submission.id}`}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <CardTitle className="text-base">
                              {submission.drugName}
                            </CardTitle>
                            <CardDescription className="mt-1">
                              {submission.indication}
                            </CardDescription>
                          </div>
                          <div className="flex flex-col items-end gap-1">
                            <Badge variant={submission.status === 'completed' ? 'success' : 'default'}>
                              {submission.status}
                            </Badge>
                            {submission.complianceScore && (
                              <Badge variant="outline">
                                <TrendingUp className="h-3 w-3 mr-1" />
                                {submission.complianceScore}%
                              </Badge>
                            )}
                          </div>
                        </div>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-3 w-3" />
                            {submission.sponsor}
                          </div>
                          <div className="flex items-center gap-1">
                            <Shield className="h-3 w-3" />
                            {submission.phase}
                          </div>
                          <div className="flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(submission.updatedAt).toLocaleDateString()}
                          </div>
                          <div className="flex items-center gap-1">
                            <Package className="h-3 w-3" />
                            {Object.values(submission.availableSections).filter(s => s.available).length} Modules
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            )}
          </div>
        );

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Select Sections to Import</h3>
              <p className="text-sm text-muted-foreground">
                Choose which sections from {selectedSubmission?.drugName} to import
              </p>
            </div>

            <ScrollArea className="h-[350px] pr-4">
              <div className="space-y-4">
                {selectedSubmission && Object.entries(selectedSubmission.availableSections).map(([module, moduleData]) => {
                  if (!moduleData.available) return null;

                  return (
                    <Card key={module}>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-sm flex items-center justify-between">
                          {module}
                          <Badge variant="secondary">
                            {moduleData.sections.length} sections
                          </Badge>
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        <div className="space-y-2">
                          {moduleData.sections.map((section) => (
                            <div
                              key={section}
                              className="flex items-center space-x-2 p-2 rounded hover:bg-muted"
                              data-testid={`section-checkbox-${section}`}
                            >
                              <Checkbox
                                id={section}
                                checked={selectedSections.includes(section)}
                                onCheckedChange={() => handleSectionToggle(section)}
                              />
                              <Label
                                htmlFor={section}
                                className="text-sm font-normal cursor-pointer flex-1"
                              >
                                {section}
                              </Label>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>

            <div className="border-t pt-4">
              <Label className="text-sm font-semibold">Import Type</Label>
              <RadioGroup value={importType} onValueChange={setImportType} className="mt-2">
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="merge" id="merge" />
                  <Label htmlFor="merge" className="font-normal">
                    <div>
                      <span className="font-medium">Merge</span>
                      <p className="text-xs text-muted-foreground">
                        Append imported data to existing content
                      </p>
                    </div>
                  </Label>
                </div>
                <div className="flex items-center space-x-2">
                  <RadioGroupItem value="overwrite" id="overwrite" />
                  <Label htmlFor="overwrite" className="font-normal">
                    <div>
                      <span className="font-medium">Overwrite</span>
                      <p className="text-xs text-muted-foreground">
                        Replace matching sections with imported data
                      </p>
                    </div>
                  </Label>
                </div>
              </RadioGroup>
            </div>
          </div>
        );

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <h3 className="text-lg font-semibold mb-2">Review & Confirm Import</h3>
              <p className="text-sm text-muted-foreground">
                Please review your import settings before proceeding
              </p>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Import Summary</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Source IND:</span>
                  <span className="text-sm font-medium">{selectedSubmission?.title}</span>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Sections to Import:</span>
                  <Badge variant="secondary">{selectedSections.length} sections</Badge>
                </div>
                <div className="flex justify-between items-center py-2 border-b">
                  <span className="text-sm text-muted-foreground">Import Method:</span>
                  <Badge variant="outline">{importType}</Badge>
                </div>
                <div className="pt-2">
                  <p className="text-sm font-medium mb-2">Selected Sections:</p>
                  <div className="space-y-1">
                    {selectedSections.map((section) => (
                      <div key={section} className="flex items-center gap-2 text-sm">
                        <CheckCircle className="h-3 w-3 text-green-500" />
                        {section}
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            {importProgress > 0 && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>Importing data...</span>
                  <span>{importProgress}%</span>
                </div>
                <Progress value={importProgress} className="w-full" />
              </div>
            )}
          </div>
        );

      default:
        return null;
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileDown className="h-5 w-5" />
            Import from IND Submission
          </DialogTitle>
          <DialogDescription>
            Import clinical data, safety profiles, and regulatory content from completed IND submissions
          </DialogDescription>
        </DialogHeader>

        {/* Step Indicator */}
        <div className="flex items-center justify-center gap-2 py-4">
          {[1, 2, 3].map((step) => (
            <div key={step} className="flex items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
                  currentStep >= step
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step}
              </div>
              {step < 3 && (
                <ChevronRight
                  className={`h-4 w-4 mx-2 ${
                    currentStep > step ? 'text-primary' : 'text-muted-foreground'
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        <div className="min-h-[450px]">{renderStepContent()}</div>

        <DialogFooter>
          <Button variant="outline" onClick={handleClose} data-testid="button-cancel-import">
            Cancel
          </Button>
          {currentStep > 1 && (
            <Button
              variant="outline"
              onClick={() => setCurrentStep(currentStep - 1)}
              disabled={importMutation.isPending}
              data-testid="button-previous"
            >
              Previous
            </Button>
          )}
          {currentStep < 3 ? (
            <Button
              onClick={() => setCurrentStep(currentStep + 1)}
              disabled={
                (currentStep === 1 && !selectedSubmission) ||
                (currentStep === 2 && selectedSections.length === 0)
              }
              data-testid="button-next"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          ) : (
            <Button
              onClick={handleImport}
              disabled={importMutation.isPending}
              data-testid="button-confirm-import"
            >
              {importMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <FileDown className="h-4 w-4 mr-2" />
                  Import Data
                </>
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ImportFromINDDialog;