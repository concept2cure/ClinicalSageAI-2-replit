import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Mail, FileText, MessageSquare, Upload, CheckCircle2, Clock, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';

interface Question {
  id: number;
  correspondenceId: number;
  questionText: string;
  sectionReference: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  severity: string;
  status: 'pending' | 'in_progress' | 'responded' | 'closed';
  region: string;
  dueDate: string;
  createdAt: string;
}

interface Response {
  id: number;
  questionId: number;
  responseText: string;
  evidenceUsed: any[];
  version: number;
  status: 'draft' | 'review' | 'approved' | 'submitted';
  draftedBy: string;
  createdAt: string;
}

interface Correspondence {
  id: number;
  submissionId?: number;
  correspondenceNumber: string;
  correspondenceType: string;
  direction: 'inbound' | 'outbound';
  agencyId: number;
  subject: string;
  receivedDate?: string;
  responseDeadline?: string;
  status: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  assignedTo?: string;
  agency?: {
    agencyCode: string;
    agencyName: string;
  };
}

export default function CorrespondenceManagement() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [selectedCorrespondence, setSelectedCorrespondence] = useState<number | null>(null);
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [draftDialogOpen, setDraftDialogOpen] = useState(false);
  const [selectedQuestion, setSelectedQuestion] = useState<Question | null>(null);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [evidence, setEvidence] = useState('');
  const [editableResponse, setEditableResponse] = useState('');

  // Fetch correspondence
  const { data: correspondenceData, isLoading: correspondenceLoading } = useQuery<{ success: boolean; data: Correspondence[] }>({
    queryKey: ['/api/regulatory/correspondence'],
  });

  // Fetch questions
  const { data: questionsData, isLoading: questionsLoading } = useQuery<{ success: boolean; data: Question[] }>({
    queryKey: ['/api/regulatory/questions'],
  });

  // Fetch responses for selected question
  const { data: responsesData } = useQuery<{ success: boolean; data: Response[] }>({
    queryKey: ['/api/regulatory/responses', selectedQuestion?.id],
    enabled: !!selectedQuestion,
  });

  // Upload and extract questions mutation
  const extractQuestionsMutation = useMutation({
    mutationFn: async (data: { correspondenceId: number; documentText: string; fileName: string; region: string; dueDate?: string }) => {
      const response = await apiRequest('POST', '/api/regulatory/questions/extract', data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: 'Questions Extracted',
        description: `Successfully extracted ${data.data.questions.length} questions from the document.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/regulatory/questions'] });
      setUploadDialogOpen(false);
      setUploadFile(null);
    },
    onError: (error: Error) => {
      toast({
        title: 'Extraction Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Draft response mutation
  const draftResponseMutation = useMutation({
    mutationFn: async (data: { questionId: number; evidence: string; tone?: string }) => {
      const response = await apiRequest('POST', '/api/regulatory/responses', data);
      return response.json();
    },
    onSuccess: (data) => {
      setEditableResponse(data.data.responseText);
      toast({
        title: 'Response Drafted',
        description: 'AI has drafted a response. Review and edit before finalizing.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/regulatory/questions'] });
      queryClient.invalidateQueries({ queryKey: ['/api/regulatory/responses', selectedQuestion?.id] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Draft Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Update response mutation
  const updateResponseMutation = useMutation({
    mutationFn: async (data: { id: number; responseText: string; status?: string }) => {
      const response = await apiRequest('PUT', `/api/regulatory/responses/${data.id}`, { 
        responseText: data.responseText, 
        status: data.status 
      });
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Response Updated',
        description: 'Response has been saved successfully.',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/regulatory/responses', selectedQuestion?.id] });
      setDraftDialogOpen(false);
      setSelectedQuestion(null);
      setEvidence('');
      setEditableResponse('');
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleFileUpload = async () => {
    if (!uploadFile || !selectedCorrespondence) return;

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const correspondence = correspondenceData?.data.find((c) => c.id === selectedCorrespondence);
      
      extractQuestionsMutation.mutate({
        correspondenceId: selectedCorrespondence,
        documentText: text,
        fileName: uploadFile.name,
        region: correspondence?.agency?.agencyCode || 'FDA',
        dueDate: correspondence?.responseDeadline,
      });
    };
    reader.readAsText(uploadFile);
  };

  const handleDraftResponse = () => {
    if (!selectedQuestion) return;
    
    draftResponseMutation.mutate({
      questionId: selectedQuestion.id,
      evidence: evidence,
      tone: 'Neutral',
    });
  };

  const handleSaveResponse = () => {
    const latestResponse = responsesData?.data?.[responsesData.data.length - 1];
    if (!latestResponse) return;

    updateResponseMutation.mutate({
      id: latestResponse.id,
      responseText: editableResponse,
      status: 'draft',
    });
  };

  const getStatusBadge = (status: string) => {
    const statusConfig = {
      pending: { variant: 'secondary' as const, icon: Clock, label: 'Pending' },
      in_progress: { variant: 'default' as const, icon: MessageSquare, label: 'In Progress' },
      responded: { variant: 'default' as const, icon: CheckCircle2, label: 'Responded' },
      closed: { variant: 'outline' as const, icon: CheckCircle2, label: 'Closed' },
    };
    const config = statusConfig[status as keyof typeof statusConfig] || statusConfig.pending;
    const Icon = config.icon;
    
    return (
      <Badge variant={config.variant} data-testid={`badge-status-${status}`}>
        <Icon className="w-3 h-3 mr-1" />
        {config.label}
      </Badge>
    );
  };

  const getPriorityBadge = (priority: string) => {
    const colors = {
      low: 'bg-blue-100 text-blue-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-orange-100 text-orange-800',
      critical: 'bg-red-100 text-red-800',
    };
    return (
      <Badge className={colors[priority as keyof typeof colors]} data-testid={`badge-priority-${priority}`}>
        {priority.toUpperCase()}
      </Badge>
    );
  };

  return (
    <div className="space-y-6" data-testid="correspondence-management">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold" data-testid="text-title">Correspondence Management</h2>
          <p className="text-muted-foreground" data-testid="text-description">
            Manage agency correspondence, extract questions, and draft responses
          </p>
        </div>
        <Button 
          onClick={() => setUploadDialogOpen(true)} 
          data-testid="button-upload-correspondence"
          disabled={!selectedCorrespondence}
        >
          <Upload className="w-4 h-4 mr-2" />
          Upload Document
        </Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Correspondence List */}
        <Card data-testid="card-correspondence-list">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Agency Correspondence
            </CardTitle>
            <CardDescription>Select correspondence to view and manage questions</CardDescription>
          </CardHeader>
          <CardContent>
            {correspondenceLoading ? (
              <div className="text-center py-8" data-testid="text-loading">Loading correspondence...</div>
            ) : (
              <div className="space-y-2">
                {correspondenceData?.data.map((corr) => (
                  <div
                    key={corr.id}
                    className={`p-4 border rounded-lg cursor-pointer hover:bg-accent transition-colors ${
                      selectedCorrespondence === corr.id ? 'bg-accent border-primary' : ''
                    }`}
                    onClick={() => setSelectedCorrespondence(corr.id)}
                    data-testid={`card-correspondence-${corr.id}`}
                  >
                    <div className="flex justify-between items-start mb-2">
                      <div>
                        <p className="font-semibold" data-testid={`text-correspondence-number-${corr.id}`}>
                          {corr.correspondenceNumber}
                        </p>
                        <p className="text-sm text-muted-foreground" data-testid={`text-correspondence-subject-${corr.id}`}>
                          {corr.subject}
                        </p>
                      </div>
                      {getStatusBadge(corr.status)}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span data-testid={`text-correspondence-agency-${corr.id}`}>
                        {corr.agency?.agencyCode || 'N/A'}
                      </span>
                      <span data-testid={`text-correspondence-type-${corr.id}`}>
                        {corr.correspondenceType}
                      </span>
                      {corr.receivedDate && (
                        <span data-testid={`text-correspondence-date-${corr.id}`}>
                          {new Date(corr.receivedDate).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Questions Panel */}
        <Card data-testid="card-questions-panel">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Extracted Questions
            </CardTitle>
            <CardDescription>Questions from selected correspondence</CardDescription>
          </CardHeader>
          <CardContent>
            {questionsLoading ? (
              <div className="text-center py-8" data-testid="text-questions-loading">Loading questions...</div>
            ) : (
              <div className="space-y-3">
                {questionsData?.data
                  .filter((q) => !selectedCorrespondence || q.correspondenceId === selectedCorrespondence)
                  .map((question) => (
                    <div
                      key={question.id}
                      className="p-4 border rounded-lg"
                      data-testid={`card-question-${question.id}`}
                    >
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex gap-2">
                          {getPriorityBadge(question.priority)}
                          {getStatusBadge(question.status)}
                        </div>
                      </div>
                      <p className="text-sm mb-2" data-testid={`text-question-${question.id}`}>
                        {question.questionText}
                      </p>
                      {question.sectionReference && (
                        <p className="text-xs text-muted-foreground mb-2" data-testid={`text-section-${question.id}`}>
                          Section: {question.sectionReference}
                        </p>
                      )}
                      <div className="flex justify-between items-center">
                        <span className="text-xs text-muted-foreground" data-testid={`text-due-date-${question.id}`}>
                          Due: {question.dueDate ? new Date(question.dueDate).toLocaleDateString() : 'N/A'}
                        </span>
                        <Button
                          size="sm"
                          onClick={() => {
                            setSelectedQuestion(question);
                            setDraftDialogOpen(true);
                          }}
                          data-testid={`button-draft-response-${question.id}`}
                        >
                          <MessageSquare className="w-4 h-4 mr-1" />
                          Draft Response
                        </Button>
                      </div>
                    </div>
                  ))}
                {questionsData?.data.filter((q) => !selectedCorrespondence || q.correspondenceId === selectedCorrespondence).length === 0 && (
                  <div className="text-center py-8 text-muted-foreground" data-testid="text-no-questions">
                    <AlertCircle className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    <p>No questions extracted yet</p>
                    <p className="text-sm">Upload a document to extract questions</p>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Upload Dialog */}
      <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
        <DialogContent data-testid="dialog-upload">
          <DialogHeader>
            <DialogTitle data-testid="text-upload-title">Upload Correspondence Document</DialogTitle>
            <DialogDescription data-testid="text-upload-description">
              Upload a PDF or DOCX file to automatically extract questions using AI
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="file-upload" data-testid="label-file-upload">Document File</Label>
              <Input
                id="file-upload"
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
                data-testid="input-file-upload"
              />
              {uploadFile && (
                <p className="text-sm text-muted-foreground" data-testid="text-selected-file">
                  Selected: {uploadFile.name}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button 
              variant="outline" 
              onClick={() => {
                setUploadDialogOpen(false);
                setUploadFile(null);
              }}
              data-testid="button-cancel-upload"
            >
              Cancel
            </Button>
            <Button
              onClick={handleFileUpload}
              disabled={!uploadFile || extractQuestionsMutation.isPending}
              data-testid="button-extract-questions"
            >
              {extractQuestionsMutation.isPending ? 'Extracting...' : 'Extract Questions'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Draft Response Dialog */}
      <Dialog open={draftDialogOpen} onOpenChange={setDraftDialogOpen}>
        <DialogContent className="max-w-3xl" data-testid="dialog-draft-response">
          <DialogHeader>
            <DialogTitle data-testid="text-draft-title">Draft Response</DialogTitle>
            <DialogDescription data-testid="text-draft-description">
              Provide evidence/context and let AI draft a response
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            {selectedQuestion && (
              <div className="p-3 bg-muted rounded-lg" data-testid="card-selected-question">
                <p className="text-sm font-medium mb-1">Question:</p>
                <p className="text-sm" data-testid="text-selected-question">{selectedQuestion.questionText}</p>
              </div>
            )}
            
            <div className="space-y-2">
              <Label htmlFor="evidence" data-testid="label-evidence">Evidence / Context</Label>
              <Textarea
                id="evidence"
                placeholder="Enter relevant evidence, data, or context for the response..."
                value={evidence}
                onChange={(e) => setEvidence(e.target.value)}
                rows={4}
                data-testid="input-evidence"
              />
            </div>

            {!editableResponse && (
              <Button
                onClick={handleDraftResponse}
                disabled={draftResponseMutation.isPending || !evidence.trim()}
                className="w-full"
                data-testid="button-generate-draft"
              >
                {draftResponseMutation.isPending ? 'Drafting with AI...' : 'Generate AI Draft'}
              </Button>
            )}

            {editableResponse && (
              <div className="space-y-2">
                <Label htmlFor="response" data-testid="label-response">AI Drafted Response (Edit as needed)</Label>
                <Textarea
                  id="response"
                  value={editableResponse}
                  onChange={(e) => setEditableResponse(e.target.value)}
                  rows={10}
                  data-testid="input-response"
                />
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDraftDialogOpen(false);
                setSelectedQuestion(null);
                setEvidence('');
                setEditableResponse('');
              }}
              data-testid="button-cancel-draft"
            >
              Cancel
            </Button>
            {editableResponse && (
              <Button
                onClick={handleSaveResponse}
                disabled={updateResponseMutation.isPending}
                data-testid="button-save-response"
              >
                {updateResponseMutation.isPending ? 'Saving...' : 'Save Response'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
