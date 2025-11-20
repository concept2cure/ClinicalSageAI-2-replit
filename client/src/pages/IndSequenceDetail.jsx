// IndSequenceDetail.jsx – detail view with XML validation & ESG submit
import React, { useState, useEffect } from 'react';
import { useParams, Link } from 'wouter';
import { useQuery, useMutation } from '@tanstack/react-query';
import { queryClient } from '@/lib/queryClient';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle,
  Calendar,
  Clock,
  Download,
  AlertTriangle,
  FileText,
  Send,
  Check,
  AlertCircle,
  FileWarning,
  ShieldCheck,
  ShieldOff,
  UploadCloud,
  Globe,
  Share2,
} from 'lucide-react';
import RegionalExportModal from '@/components/RegionalExportModal';

export default function IndSequenceDetail() {
  const { id } = useParams();
  const { toast } = useToast();
  const [indSerial, setIndSerial] = useState('');
  const [sponsorName, setSponsorName] = useState('');
  const [submitDialogOpen, setSubmitDialogOpen] = useState(false);
  const [validationResults, setValidationResults] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [missing, setMissing] = useState({ region: '', missing: [], count: 0 });

  // Fetch sequence details
  const sequenceQuery = useQuery({
    queryKey: ['/api/ind/sequence', id],
    enabled: !!id,
  });

  // Query for ACK status
  const ackQuery = useQuery({
    queryKey: ['/api/ind/sequence', id, 'acks'],
    queryFn: async () => {
      const response = await fetch(`/api/ind/sequence/${id}/acks`);
      if (!response.ok) {
        throw new Error('Failed to fetch acknowledgment status');
      }
      return response.json();
    },
    enabled:
      !!id &&
      !!sequence?.submission_status &&
      [
        'submitted',
        'submitted_in_progress',
        'ESG ACK1 Received',
        'ESG ACK2 Success',
        'ESG ACK2 Error',
        'Centre Receipt',
      ].includes(sequence.submission_status),
    refetchInterval: 60000, // Refresh every minute to check for new ACKs
  });

  const sequence = sequenceQuery.data;
  const isSubmitted = sequence?.submission_status === 'submitted';
  const isInProgress = sequence?.submission_status === 'submitted_in_progress';

  // Check for missing required documents based on region
  useEffect(() => {
    if (id && sequence) {
      fetch(`/api/ind/sequence/${id}/missing-required`)
        .then(r => r.json())
        .then(setMissing)
        .catch(err => console.error('Error fetching missing documents:', err));
    }
  }, [id, sequence]);

  // Mutation for submitting the sequence to FDA ESG
  const submitMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch(`/api/ind/sequence/${id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ind_serial: indSerial, sponsor_name: sponsorName }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Failed to submit sequence');
      }

      return response.json();
    },
    onSuccess: () => {
      // Notification for submission initiation
      console.log('Submission initiated notification would be shown');
      setSubmitDialogOpen(false);
      // Refetch sequence data to get updated status
      queryClient.invalidateQueries({ queryKey: ['/api/ind/sequence', id] });
    },
    onError: error => {
      // Show error notification
      console.log('Submission failed notification would be shown:', error.message);
    },
  });

  // Prepare data for UI
  const formatDate = dateString => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  const renderStatusBadge = status => {
    switch (status) {
      case 'draft':
        return (
          <Badge variant="outline" className="bg-gray-100 text-gray-700">
            Draft
          </Badge>
        );
      case 'ready':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-700">
            Ready
          </Badge>
        );
      case 'submitted_in_progress':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-700">
            Submission in Progress
          </Badge>
        );
      case 'submitted':
        return (
          <Badge variant="outline" className="bg-blue-100 text-blue-700">
            Submitted to FDA
          </Badge>
        );
      case 'invalid':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-700">
            Invalid
          </Badge>
        );
      case 'ESG ACK1 Received':
        return (
          <Badge variant="outline" className="bg-purple-100 text-purple-700">
            Receipt Acknowledged
          </Badge>
        );
      case 'ESG ACK2 Success':
        return (
          <Badge variant="outline" className="bg-green-100 text-green-700">
            FDA Processing Success
          </Badge>
        );
      case 'ESG ACK2 Error':
        return (
          <Badge variant="outline" className="bg-red-100 text-red-700">
            FDA Processing Error
          </Badge>
        );
      case 'Centre Receipt':
        return (
          <Badge variant="outline" className="bg-emerald-100 text-emerald-700">
            FDA Centre Received
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderModuleBadge = path => {
    if (!path) return null;

    if (path.startsWith('m1')) {
      return <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-200">Module 1</Badge>;
    } else if (path.startsWith('m2')) {
      return <Badge className="bg-green-100 text-green-700 hover:bg-green-200">Module 2</Badge>;
    } else if (path.startsWith('m3')) {
      return <Badge className="bg-purple-100 text-purple-700 hover:bg-purple-200">Module 3</Badge>;
    } else if (path.startsWith('m4')) {
      return <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-200">Module 4</Badge>;
    } else if (path.startsWith('m5')) {
      return <Badge className="bg-red-100 text-red-700 hover:bg-red-200">Module 5</Badge>;
    }

    return null;
  };

  const handleSubmit = e => {
    e.preventDefault();
    submitMutation.mutate();
  };

  // Function to run XML validation
  const runValidate = async () => {
    setIsValidating(true);
    setValidationResults(null);

    try {
      // If sequence has a region, use it for validation
      const regionParam = sequence.region ? `?region=${sequence.region}` : '';
      const response = await fetch(`/api/ind/sequence/${id}/validate${regionParam}`);

      if (!response.ok) {
        throw new Error('Failed to validate XML files');
      }

      const data = await response.json();
      setValidationResults(data);

      // Show appropriate notification based on validation result
      if (data.validation.valid) {
        console.log('Validation successful notification would be shown');
      } else {
        console.log('Validation failed notification would be shown');
      }
    } catch (error) {
      console.log('Validation error notification would be shown:', error.message);
    } finally {
      setIsValidating(false);
    }
  };

  if (sequenceQuery.isLoading) {
    return (
      <div className="container mx-auto py-6 space-y-4">
        <Skeleton className="h-12 w-3/4" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (sequenceQuery.isError) {
    return (
      <div className="container mx-auto py-6">
        <Card className="border-red-200 bg-red-50">
          <CardHeader>
            <CardTitle className="text-red-700 flex items-center">
              <AlertTriangle className="mr-2" />
              Error Loading Sequence
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-red-600">
              {sequenceQuery.error.message ||
                'Unable to load the sequence details. Please try again later.'}
            </p>
          </CardContent>
          <CardFooter>
            <Button onClick={() => sequenceQuery.refetch()} variant="outline">
              Retry
            </Button>
            <Link href="/portal/ind">
              <Button variant="ghost" className="ml-2">
                Return to Sequence List
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center">
            Sequence {sequence.sequence_id}: {sequence.title}
            {isSubmitted && <CheckCircle className="ml-2 text-green-500" size={24} />}
          </h1>
          <div className="flex space-x-4 text-gray-500">
            <div className="flex items-center">
              <Calendar className="mr-1" size={16} />
              <span>Created: {formatDate(sequence.created_at)}</span>
            </div>
            {sequence.updated_at && (
              <div className="flex items-center">
                <Clock className="mr-1" size={16} />
                <span>Updated: {formatDate(sequence.updated_at)}</span>
              </div>
            )}
            <div>Status: {renderStatusBadge(sequence.submission_status)}</div>
            {sequence.region && (
              <div className="flex items-center">
                <Globe className="mr-1" size={16} />
                <span>
                  Region: <Badge variant="secondary">{sequence.region}</Badge>
                </span>
              </div>
            )}
          </div>
        </div>

        <div className="flex space-x-2">
          <Button variant="outline" className="flex items-center" asChild>
            <Link href={`/api/ind/sequence/${id}/download`}>
              <Download className="mr-2" size={16} />
              Download Package
            </Link>
          </Button>

          <Button
            variant="outline"
            className="flex items-center"
            onClick={() => setExportModalOpen(true)}
          >
            <Share2 className="mr-2" size={16} />
            Export
          </Button>

          <Button
            variant="outline"
            className="flex items-center"
            onClick={runValidate}
            disabled={isValidating}
          >
            <FileWarning className="mr-2" size={16} />
            {isValidating ? 'Validating...' : 'Validate XML'}
          </Button>

          {!isSubmitted && !isInProgress && (
            <Dialog open={submitDialogOpen} onOpenChange={setSubmitDialogOpen}>
              <DialogTrigger asChild>
                <Button className="flex items-center">
                  <Send className="mr-2" size={16} />
                  Submit to FDA
                </Button>
              </DialogTrigger>
              <DialogContent>
                <form onSubmit={handleSubmit}>
                  <DialogHeader>
                    <DialogTitle>Submit Sequence to FDA ESG</DialogTitle>
                    <DialogDescription>
                      Provide the IND serial number and sponsor name to submit this sequence to the
                      FDA Electronic Submissions Gateway.
                    </DialogDescription>
                  </DialogHeader>

                  <div className="grid gap-4 py-4">
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="ind-serial" className="text-right">
                        IND Serial Number
                      </Label>
                      <Input
                        id="ind-serial"
                        value={indSerial}
                        onChange={e => setIndSerial(e.target.value)}
                        placeholder="e.g., 123456"
                        className="col-span-3"
                        required
                      />
                    </div>
                    <div className="grid grid-cols-4 items-center gap-4">
                      <Label htmlFor="sponsor-name" className="text-right">
                        Sponsor Name
                      </Label>
                      <Input
                        id="sponsor-name"
                        value={sponsorName}
                        onChange={e => setSponsorName(e.target.value)}
                        placeholder="e.g., Acme Pharmaceuticals, Inc."
                        className="col-span-3"
                        required
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => setSubmitDialogOpen(false)}
                    >
                      Cancel
                    </Button>
                    <Button type="submit" disabled={submitMutation.isPending}>
                      {submitMutation.isPending ? 'Submitting...' : 'Submit to FDA'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Missing Required Documents Alert */}
      {missing.count > 0 && (
        <Alert variant="destructive" className="mb-6 mt-2">
          <AlertTriangle className="h-5 w-5" />
          <AlertTitle>Missing Required Documents</AlertTitle>
          <AlertDescription>
            This {sequence.region} submission is missing {missing.count} required document(s):
            <ul className="ml-5 mt-2 list-disc">
              {missing.missing.map((doc, idx) => (
                <li key={idx} className="mt-1">
                  {doc}
                </li>
              ))}
            </ul>
          </AlertDescription>
        </Alert>
      )}

      {/* FDA ESG Acknowledgments Status */}
      {(sequence.submission_status === 'submitted' ||
        sequence.submission_status === 'submitted_in_progress' ||
        sequence.submission_status === 'ESG ACK1 Received' ||
        sequence.submission_status === 'ESG ACK2 Success' ||
        sequence.submission_status === 'ESG ACK2 Error' ||
        sequence.submission_status === 'Centre Receipt') && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="flex items-center">
              <ShieldCheck className="mr-2" size={20} />
              FDA ESG Acknowledgment Status
            </CardTitle>
            <CardDescription>
              FDA Electronic Submissions Gateway acknowledgment status
            </CardDescription>
          </CardHeader>
          <CardContent>
            {ackQuery.isLoading ? (
              <div className="space-y-3">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </div>
            ) : ackQuery.isError ? (
              <div className="p-4 border border-red-200 rounded-md bg-red-50 text-red-700">
                <p>
                  {ackQuery.error.message ||
                    'Failed to load acknowledgment status. Please try again later.'}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* ACK1 - Receipt */}
                  <div
                    className={`p-4 rounded-md border ${ackQuery.data.acknowledgments.ack1.received ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <div className="flex items-center mb-2">
                      {ackQuery.data.acknowledgments.ack1.received ? (
                        <CheckCircle className="mr-2 text-green-500" size={18} />
                      ) : (
                        <Clock className="mr-2 text-gray-400" size={18} />
                      )}
                      <span className="font-medium">
                        {ackQuery.data.acknowledgments.ack1.received
                          ? 'Receipt Acknowledged'
                          : 'Awaiting Receipt'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {ackQuery.data.acknowledgments.ack1.received
                        ? 'FDA ESG has received your submission package'
                        : 'Waiting for FDA ESG to acknowledge receipt of your submission'}
                    </p>
                  </div>

                  {/* ACK2 - Processing */}
                  <div
                    className={`p-4 rounded-md border ${
                      !ackQuery.data.acknowledgments.ack2.received
                        ? 'border-gray-200 bg-gray-50'
                        : ackQuery.data.acknowledgments.ack2.success
                          ? 'border-green-200 bg-green-50'
                          : 'border-red-200 bg-red-50'
                    }`}
                  >
                    <div className="flex items-center mb-2">
                      {!ackQuery.data.acknowledgments.ack2.received ? (
                        <Clock className="mr-2 text-gray-400" size={18} />
                      ) : ackQuery.data.acknowledgments.ack2.success ? (
                        <CheckCircle className="mr-2 text-green-500" size={18} />
                      ) : (
                        <AlertTriangle className="mr-2 text-red-500" size={18} />
                      )}
                      <span className="font-medium">
                        {!ackQuery.data.acknowledgments.ack2.received
                          ? 'Processing Pending'
                          : ackQuery.data.acknowledgments.ack2.success
                            ? 'Processing Successful'
                            : 'Processing Failed'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {!ackQuery.data.acknowledgments.ack2.received
                        ? 'Waiting for FDA ESG to process your submission package'
                        : ackQuery.data.acknowledgments.ack2.success
                          ? 'FDA ESG has successfully processed your submission'
                          : 'FDA ESG encountered errors processing your submission'}
                    </p>
                  </div>

                  {/* ACK3 - Centre Receipt */}
                  <div
                    className={`p-4 rounded-md border ${ackQuery.data.acknowledgments.ack3.received ? 'border-green-200 bg-green-50' : 'border-gray-200 bg-gray-50'}`}
                  >
                    <div className="flex items-center mb-2">
                      {ackQuery.data.acknowledgments.ack3.received ? (
                        <CheckCircle className="mr-2 text-green-500" size={18} />
                      ) : (
                        <Clock className="mr-2 text-gray-400" size={18} />
                      )}
                      <span className="font-medium">
                        {ackQuery.data.acknowledgments.ack3.received
                          ? 'Centre Received'
                          : 'Awaiting Centre Receipt'}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {ackQuery.data.acknowledgments.ack3.received
                        ? 'FDA Centre has received your submission'
                        : 'Waiting for FDA Centre to acknowledge receipt of your submission'}
                    </p>
                  </div>
                </div>

                {ackQuery.data.last_updated && (
                  <div className="text-xs text-gray-500 text-right">
                    Last updated: {formatDate(ackQuery.data.last_updated)}
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Display submissions history if available */}
      {sequence.submissions && sequence.submissions.length > 0 && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>Submission History</CardTitle>
            <CardDescription>Recent FDA ESG submissions and acknowledgments</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {sequence.submissions.map(submission => (
                <div
                  key={submission.id}
                  className="p-4 border rounded-md flex justify-between items-center"
                >
                  <div>
                    <div className="font-medium">
                      FDA ESG Tracking #: {submission.tracking_number}
                    </div>
                    <div className="text-sm text-gray-500">
                      Submitted: {formatDate(submission.timestamp)}
                    </div>
                    {submission.message && <div className="text-sm mt-1">{submission.message}</div>}
                  </div>
                  <div>
                    {submission.status === 'success' ? (
                      <Badge className="bg-green-100 text-green-700">Success</Badge>
                    ) : submission.status === 'error' ? (
                      <Badge className="bg-red-100 text-red-700">Error</Badge>
                    ) : (
                      <Badge className="bg-blue-100 text-blue-700">In Progress</Badge>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* XML Validation Results */}
      {validationResults && (
        <Card
          className={`mb-6 ${validationResults.validation.valid ? 'border-green-200' : 'border-red-200'}`}
        >
          <CardHeader>
            <CardTitle className="flex items-center">
              {validationResults.validation.valid ? (
                <Check className="mr-2 text-green-500" size={20} />
              ) : (
                <AlertCircle className="mr-2 text-red-500" size={20} />
              )}
              XML Validation Results
            </CardTitle>
            <CardDescription>
              {validationResults.validation.valid
                ? 'XML files are valid and conform to FDA eCTD DTD requirements'
                : 'XML files contain errors that must be fixed before submission'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {!validationResults.validation.valid && (
              <div className="space-y-4">
                {validationResults.validation.index.length > 0 && (
                  <div className="p-4 border border-red-200 rounded-md bg-red-50">
                    <h3 className="font-semibold text-red-700 mb-2">index.xml Errors</h3>
                    <ul className="list-disc pl-5 space-y-1">
                      {validationResults.validation.index.map((error, idx) => (
                        <li key={idx} className="text-sm text-red-700">
                          {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {validationResults.validation.regional.length > 0 && (
                  <div className="p-4 border border-red-200 rounded-md bg-red-50">
                    <h3 className="font-semibold text-red-700 mb-2">
                      {sequence.region === 'EMA'
                        ? 'eu'
                        : sequence.region === 'PMDA'
                          ? 'jp'
                          : sequence.region === 'Health Canada'
                            ? 'ca'
                            : 'us'}
                      -regional.xml Errors
                    </h3>
                    <ul className="list-disc pl-5 space-y-1">
                      {validationResults.validation.regional.map((error, idx) => (
                        <li key={idx} className="text-sm text-red-700">
                          {error}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
            {validationResults.validation.valid && (
              <div className="p-4 border border-green-200 rounded-md bg-green-50 text-green-700">
                <p>
                  All XML files have been validated against {sequence.region || 'FDA'} eCTD DTD
                  specifications and are ready for submission.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Documents */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center">
            <FileText className="mr-2" size={20} />
            Sequence Documents
          </CardTitle>
          <CardDescription>Documents included in this eCTD sequence</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {sequence.documents &&
              sequence.documents.map(doc => (
                <div
                  key={doc.id}
                  className="p-4 border rounded-md hover:bg-gray-50 transition-colors"
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className="font-medium">{doc.title}</h3>
                      <p className="text-sm text-gray-500">{doc.path}</p>
                    </div>
                    <div>{renderModuleBadge(doc.path)}</div>
                  </div>
                </div>
              ))}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <div>
            <span className="text-sm text-gray-500">
              {sequence.documents ? sequence.documents.length : 0} documents in sequence
            </span>
          </div>
          <div className="flex space-x-2">
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/ectd/${sequence.sequence_id}/index.xml`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View index.xml
              </a>
            </Button>
            <Button variant="outline" size="sm" asChild>
              <a
                href={`/ectd/${sequence.sequence_id}/${sequence.region === 'EMA' ? 'eu' : sequence.region === 'PMDA' ? 'jp' : sequence.region === 'Health Canada' ? 'ca' : 'us'}-regional.xml`}
                target="_blank"
                rel="noopener noreferrer"
              >
                View{' '}
                {sequence.region === 'EMA'
                  ? 'eu'
                  : sequence.region === 'PMDA'
                    ? 'jp'
                    : sequence.region === 'Health Canada'
                      ? 'ca'
                      : 'us'}
                -regional.xml
              </a>
            </Button>
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
