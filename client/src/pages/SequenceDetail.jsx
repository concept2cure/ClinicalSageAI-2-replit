import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { useToast } from '@/hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { 
  FileText, 
  Package, 
  CheckCircle, 
  XCircle, 
  AlertTriangle, 
  SendIcon, 
  DownloadIcon, 
  FolderIcon, 
  BookIcon, 
  ClipboardList, 
  FileCheck, 
  Info,
  AlertCircle,
  Loader2
} from 'lucide-react';

const SequenceDetail = ({ params }) => {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [isSubmissionDialogOpen, setIsSubmissionDialogOpen] = useState(false);
  const [indSerialNumber, setIndSerialNumber] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const id = params?.id;

  // Fetch sequence data
  const { data: sequence, isLoading, error } = useQuery({
    queryKey: ['/api/ind/sequence', id],
    enabled: !!id
  });

  // Get sequence status
  const { data: validationStatus } = useQuery({
    queryKey: ['/api/ind/sequence/validate', id],
    enabled: !!id && !!sequence
  });

  // Submission mutation
  const { mutate: submitSequence, isPending: isSubmitting } = useMutation({
    mutationFn: async (data) => {
      return apiRequest(`/api/ind/sequence/${id}/submit`, {
        method: 'POST',
        body: JSON.stringify(data)
      });
    },
    onSuccess: (data) => {
      setIsSubmissionDialogOpen(false);
      // toast call replaced
  // Original: toast({
        title: "Submission initiated successfully",
        description: "Your sequence has been submitted to the FDA ESG. A confirmation will be available when processing is complete.",
      })
  console.log('Toast would show:', {
        title: "Submission initiated successfully",
        description: "Your sequence has been submitted to the FDA ESG. A confirmation will be available when processing is complete.",
      });
      queryClient.invalidateQueries({ queryKey: ['/api/ind/sequence', id] });
    },
    onError: (error) => {
      // toast call replaced
  // Original: toast({
        variant: "destructive",
        title: "Submission failed",
        description: error.message || "There was an error submitting the sequence to the FDA ESG."
      })
  console.log('Toast would show:', {
        variant: "destructive",
        title: "Submission failed",
        description: error.message || "There was an error submitting the sequence to the FDA ESG."
      });
    }
  });

  // Check submission requirements
  const isSubmissionReady = validationStatus?.status === 'valid' && 
    !isSubmitting && 
    !sequence?.submission_status?.includes('submitted');

  const handleSubmit = () => {
    if (confirmText !== 'SUBMIT') {
      // toast call replaced
  // Original: toast({
        variant: "destructive",
        title: "Confirmation text required",
        description: "Please type SUBMIT to confirm your submission."
      })
  console.log('Toast would show:', {
        variant: "destructive",
        title: "Confirmation text required",
        description: "Please type SUBMIT to confirm your submission."
      });
      return;
    }

    submitSequence({
      ind_serial: indSerialNumber,
      sponsor_name: sponsorName
    });
  };

  // Validation status badge component
  const ValidationStatusBadge = ({ status }) => {
    if (!status) return null;
    
    if (status === 'valid') {
      return (
        <div className="flex items-center space-x-1 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
          <CheckCircle className="w-4 h-4" />
          <span>Valid</span>
        </div>
      );
    } else if (status === 'invalid') {
      return (
        <div className="flex items-center space-x-1 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded-full">
          <XCircle className="w-4 h-4" />
          <span>Invalid</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center space-x-1 text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 px-2 py-1 rounded-full">
          <AlertTriangle className="w-4 h-4" />
          <span>Pending</span>
        </div>
      );
    }
  };

  // Submission status badge component
  const SubmissionStatusBadge = ({ status }) => {
    if (!status) return null;
    
    if (status === 'submitted' || status?.includes('submitted')) {
      return (
        <div className="flex items-center space-x-1 text-sm text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1 rounded-full">
          <CheckCircle className="w-4 h-4" />
          <span>Submitted</span>
        </div>
      );
    } else if (status === 'acknowledged' || status?.includes('acknowledged')) {
      return (
        <div className="flex items-center space-x-1 text-sm text-blue-700 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/30 px-2 py-1 rounded-full">
          <CheckCircle className="w-4 h-4" />
          <span>Acknowledged</span>
        </div>
      );
    } else if (status === 'failed' || status?.includes('failed')) {
      return (
        <div className="flex items-center space-x-1 text-sm text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-950/30 px-2 py-1 rounded-full">
          <XCircle className="w-4 h-4" />
          <span>Failed</span>
        </div>
      );
    } else if (status === 'in_progress' || status?.includes('progress')) {
      return (
        <div className="flex items-center space-x-1 text-sm text-yellow-700 dark:text-yellow-400 bg-yellow-50 dark:bg-yellow-950/30 px-2 py-1 rounded-full">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>In Progress</span>
        </div>
      );
    } else {
      return (
        <div className="flex items-center space-x-1 text-sm text-gray-700 dark:text-gray-400 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded-full">
          <Info className="w-4 h-4" />
          <span>Draft</span>
        </div>
      );
    }
  };

  if (isLoading) {
    return (
      <div className="container mx-auto p-6 space-y-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-10 w-64" />
          <Skeleton className="h-10 w-32" />
        </div>
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            Failed to load sequence details. {error.message}
          </AlertDescription>
        </Alert>
        <Button 
          className="mt-4"
          onClick={() => setLocation('/ind-sequence-manager')}
        >
          Back to Sequence Manager
        </Button>
      </div>
    );
  }

  if (!sequence) {
    return (
      <div className="container mx-auto p-6">
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Sequence Not Found</AlertTitle>
          <AlertDescription>
            The requested sequence could not be found.
          </AlertDescription>
        </Alert>
        <Button 
          className="mt-4"
          onClick={() => setLocation('/ind-sequence-manager')}
        >
          Back to Sequence Manager
        </Button>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Package className="w-6 h-6 text-emerald-600" />
            Sequence {sequence.sequence_id || id}
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mt-1">
            {sequence.title || 'Untitled Sequence'}
          </p>
        </div>
        
        <div className="flex items-center gap-2">
          <ValidationStatusBadge status={validationStatus?.status} />
          <SubmissionStatusBadge status={sequence.submission_status} />
          <Button
            onClick={() => setLocation('/ind-sequence-manager')}
            variant="outline"
          >
            Back to Sequences
          </Button>
        </div>
      </div>

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="submissions">Submission History</TabsTrigger>
        </TabsList>
        
        <TabsContent value="overview" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Sequence Details</CardTitle>
              <CardDescription>
                Key information about this sequence
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Sequence Number</h3>
                  <p className="text-base font-semibold">{sequence.sequence_id || 'Not assigned'}</p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</h3>
                  <p className="text-base font-semibold capitalize">
                    {sequence.status || 'Draft'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Created On</h3>
                  <p className="text-base font-semibold">
                    {new Date(sequence.created_at || Date.now()).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Last Modified</h3>
                  <p className="text-base font-semibold">
                    {new Date(sequence.updated_at || Date.now()).toLocaleDateString()}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">IND Serial Number</h3>
                  <p className="text-base font-semibold">
                    {sequence.ind_serial || 'Not assigned'}
                  </p>
                </div>
                <div>
                  <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">Sponsor</h3>
                  <p className="text-base font-semibold">
                    {sequence.sponsor_name || 'Not assigned'}
                  </p>
                </div>
              </div>
              
              <Separator />
              
              <div>
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">Description</h3>
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  {sequence.description || 'No description provided.'}
                </p>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                variant="outline"
                onClick={() => window.open(`/api/ind/sequence/${id}/download`, '_blank')}
                disabled={!sequence || validationStatus?.status !== 'valid'}
              >
                <DownloadIcon className="mr-2 h-4 w-4" />
                Download Package
              </Button>
              <Button
                onClick={() => setIsSubmissionDialogOpen(true)}
                disabled={!isSubmissionReady}
              >
                <SendIcon className="mr-2 h-4 w-4" />
                Submit to FDA
              </Button>
            </CardFooter>
          </Card>

          {validationStatus?.status === 'invalid' && (
            <Alert variant="destructive">
              <AlertTriangle className="h-4 w-4" />
              <AlertTitle>Validation Failed</AlertTitle>
              <AlertDescription>
                This sequence has validation errors that must be corrected before submission.
                Please check the Validation tab for details.
              </AlertDescription>
            </Alert>
          )}

          {sequence.submission_status?.includes('submitted') && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertTitle>Submission in Progress</AlertTitle>
              <AlertDescription>
                This sequence has been submitted to the FDA Electronic Submissions Gateway.
                Check the Submission History tab for status updates.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
        
        <TabsContent value="documents" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Sequence Documents</CardTitle>
              <CardDescription>
                Files included in this eCTD sequence
              </CardDescription>
            </CardHeader>
            <CardContent>
              {(sequence.documents?.length > 0) ? (
                <div className="space-y-2">
                  {sequence.documents.map((doc, index) => (
                    <div key={index} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
                      <div className="flex items-center">
                        <FileText className="w-5 h-5 text-gray-500 dark:text-gray-400 mr-3" />
                        <div>
                          <p className="font-medium">{doc.title || doc.filename}</p>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {doc.path || 'No path specified'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center">
                        <span className="text-xs text-gray-500 dark:text-gray-400 mr-2">
                          {new Date(doc.created_at || Date.now()).toLocaleDateString()}
                        </span>
                        <Button size="sm" variant="ghost" onClick={() => window.open(`/api/documents/${doc.id}`, '_blank')}>
                          <FileCheck className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <FolderIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No Documents Found</h3>
                  <p className="text-gray-500 dark:text-gray-400 max-w-md">
                    This sequence doesn't have any documents attached yet. Documents should be added through the Sequence Manager.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Validation Results</CardTitle>
              <CardDescription>
                Compliance checks for FDA eCTD submission requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              {validationStatus ? (
                <>
                  <div className="flex items-center mb-4">
                    <div className="mr-4">
                      {validationStatus.status === 'valid' ? (
                        <CheckCircle className="w-8 h-8 text-emerald-500" />
                      ) : validationStatus.status === 'invalid' ? (
                        <XCircle className="w-8 h-8 text-red-500" />
                      ) : (
                        <AlertTriangle className="w-8 h-8 text-yellow-500" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-medium">
                        {validationStatus.status === 'valid' 
                          ? 'Sequence is Valid' 
                          : validationStatus.status === 'invalid'
                            ? 'Validation Failed'
                            : 'Validation Pending'}
                      </h3>
                      <p className="text-gray-600 dark:text-gray-400">
                        {validationStatus.status === 'valid' 
                          ? 'This sequence meets all eCTD requirements' 
                          : validationStatus.status === 'invalid'
                            ? `Found ${validationStatus.issues?.length || 0} issues that require attention`
                            : 'The sequence is still being validated'}
                      </p>
                    </div>
                  </div>
                  
                  {validationStatus.issues?.length > 0 && (
                    <div className="space-y-3 mt-6">
                      <h4 className="font-medium">Issues Found</h4>
                      {validationStatus.issues.map((issue, index) => (
                        <Alert key={index} variant={issue.severity === 'error' ? "destructive" : "default"}>
                          <AlertTriangle className="h-4 w-4" />
                          <AlertTitle className="capitalize">{issue.severity || 'Issue'}</AlertTitle>
                          <AlertDescription>
                            {issue.message}
                            {issue.location && (
                              <div className="text-xs mt-1 text-gray-500 dark:text-gray-400">
                                Location: {issue.location}
                              </div>
                            )}
                          </AlertDescription>
                        </Alert>
                      ))}
                    </div>
                  )}
                  
                  {validationStatus.status === 'valid' && (
                    <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-md mt-4">
                      <div className="flex items-center">
                        <CheckCircle className="w-5 h-5 text-emerald-500 mr-2" />
                        <p className="text-emerald-700 dark:text-emerald-300 font-medium">
                          This sequence is ready for FDA submission
                        </p>
                      </div>
                      <p className="text-emerald-600/80 dark:text-emerald-400/80 text-sm mt-1">
                        All required components have been validated and meet eCTD specifications
                      </p>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <ClipboardList className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No Validation Data</h3>
                  <p className="text-gray-500 dark:text-gray-400 max-w-md">
                    Validation data is not available for this sequence yet.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="submissions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>FDA Submission History</CardTitle>
              <CardDescription>
                History of FDA Electronic Submissions Gateway (ESG) transmissions
              </CardDescription>
            </CardHeader>
            <CardContent>
              {sequence.submissions?.length > 0 ? (
                <div className="space-y-4">
                  {sequence.submissions.map((submission, index) => (
                    <div key={index} className="border dark:border-gray-700 rounded-lg overflow-hidden">
                      <div className="bg-gray-50 dark:bg-gray-800 p-4 flex justify-between items-center">
                        <div className="flex items-center">
                          {submission.status === 'success' ? (
                            <CheckCircle className="text-emerald-500 w-5 h-5 mr-2" />
                          ) : submission.status === 'failed' ? (
                            <XCircle className="text-red-500 w-5 h-5 mr-2" />
                          ) : (
                            <Loader2 className="text-yellow-500 w-5 h-5 mr-2 animate-spin" />
                          )}
                          <div>
                            <h4 className="font-medium capitalize">{submission.status}</h4>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {new Date(submission.timestamp).toLocaleString()}
                            </p>
                          </div>
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-300">
                          Submission ID: {submission.id || 'N/A'}
                        </p>
                      </div>
                      <div className="p-4">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div>
                            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              Tracking Number
                            </h5>
                            <p className="text-sm">
                              {submission.tracking_number || 'Not available'}
                            </p>
                          </div>
                          <div>
                            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400">
                              Acknowledgment
                            </h5>
                            <p className="text-sm">
                              {submission.acknowledgment_status || 'Pending'}
                            </p>
                          </div>
                        </div>
                        
                        {submission.message && (
                          <div className="mt-4">
                            <h5 className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                              Details
                            </h5>
                            <p className="text-sm whitespace-pre-wrap text-gray-700 dark:text-gray-300">
                              {submission.message}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <BookIcon className="w-12 h-12 text-gray-300 dark:text-gray-600 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">No Submission History</h3>
                  <p className="text-gray-500 dark:text-gray-400 max-w-md">
                    This sequence has not been submitted to the FDA Electronic Submissions Gateway yet.
                  </p>
                  {isSubmissionReady && (
                    <Button 
                      className="mt-4"
                      onClick={() => setIsSubmissionDialogOpen(true)}
                    >
                      <SendIcon className="mr-2 h-4 w-4" />
                      Submit Now
                    </Button>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* FDA Submission Dialog */}
      <Dialog open={isSubmissionDialogOpen} onOpenChange={setIsSubmissionDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit to FDA Electronic Submissions Gateway</DialogTitle>
            <DialogDescription>
              This will submit the validated eCTD package to the FDA ESG.
              Please provide the required information before proceeding.
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="ind-serial">IND Serial Number</Label>
              <Input
                id="ind-serial"
                placeholder="Enter IND serial number"
                value={indSerialNumber}
                onChange={(e) => setIndSerialNumber(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                The official IND number assigned by the FDA (e.g., 123456)
              </p>
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="sponsor-name">Sponsor Name</Label>
              <Input
                id="sponsor-name"
                placeholder="Enter sponsor company name"
                value={sponsorName}
                onChange={(e) => setSponsorName(e.target.value)}
              />
              <p className="text-xs text-gray-500">
                Official name of the sponsor company as registered with the FDA
              </p>
            </div>
            
            <Separator className="my-4" />
            
            <div className="space-y-2">
              <Label htmlFor="confirm-submission" className="text-red-500 dark:text-red-400">
                Confirm Submission
              </Label>
              <Input
                id="confirm-submission"
                placeholder="Type SUBMIT to confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                className="border-red-200 dark:border-red-800"
              />
              <p className="text-xs text-red-500 dark:text-red-400">
                This action cannot be undone. Type SUBMIT to confirm.
              </p>
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsSubmissionDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={isSubmitting || !indSerialNumber || !sponsorName || confirmText !== 'SUBMIT'}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <SendIcon className="mr-2 h-4 w-4" />
                  Submit to FDA
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SequenceDetail;