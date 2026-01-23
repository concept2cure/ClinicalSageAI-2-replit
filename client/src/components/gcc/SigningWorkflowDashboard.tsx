/**
 * E-Signature Workflow Component
 * 
 * 21 CFR Part 11 compliant e-signature interface.
 * Supports multi-signer workflows with audit trails.
 */
import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Card, CardHeader, CardTitle, CardContent, CardDescription, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  PenLine,
  FileSignature,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  Shield,
  User,
  Calendar,
  Lock,
  Eye,
  Download,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { formatDistanceToNow, format } from 'date-fns';

// Types
interface SigningRequest {
  id: string;
  workflow_id: string;
  workflow_name: string;
  document_id: string;
  document_title: string;
  document_type: string;
  document_hash: string;
  status: 'pending' | 'in_progress' | 'completed' | 'declined' | 'expired';
  signers: Signer[];
  requested_by: string;
  urgency: 'normal' | 'high' | 'critical';
  due_date: string | null;
  created_at: string;
  completed_at: string | null;
  signatures?: Signature[];
}

interface Signer {
  userId: string;
  name: string;
  email: string;
  role: string;
  order: number;
  status: 'pending' | 'signed' | 'declined';
}

interface Signature {
  id: string;
  signer_id: string;
  signer_name: string;
  signer_email: string;
  role: string;
  meaning: string;
  signed_at: string;
  ip_address: string;
}

// Status Badge Component
function StatusBadge({ status }: { status: string }) {
  const variants: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; icon: any; label: string }> = {
    pending: { variant: 'secondary', icon: Clock, label: 'Pending' },
    in_progress: { variant: 'default', icon: PenLine, label: 'In Progress' },
    completed: { variant: 'default', icon: CheckCircle, label: 'Completed' },
    declined: { variant: 'destructive', icon: XCircle, label: 'Declined' },
    expired: { variant: 'outline', icon: AlertTriangle, label: 'Expired' },
  };
  
  const config = variants[status] || variants.pending;
  const Icon = config.icon;
  
  return (
    <Badge variant={config.variant} className="gap-1">
      <Icon className="h-3 w-3" />
      {config.label}
    </Badge>
  );
}

// Urgency Badge Component
function UrgencyBadge({ urgency }: { urgency: string }) {
  if (urgency === 'critical') {
    return <Badge variant="destructive">Critical</Badge>;
  }
  if (urgency === 'high') {
    return <Badge variant="default" className="bg-orange-500">High</Badge>;
  }
  return <Badge variant="outline">Normal</Badge>;
}

// Sign Document Dialog
function SignDocumentDialog({ 
  request, 
  open, 
  onOpenChange,
  onSign
}: { 
  request: SigningRequest;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSign: (data: { password: string; meaning: string; mfaToken?: string }) => void;
}) {
  const [password, setPassword] = useState('');
  const [meaning, setMeaning] = useState('');
  const [mfaToken, setMfaToken] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSign = async () => {
    if (!password || !meaning) return;
    
    setIsSubmitting(true);
    try {
      await onSign({ password, meaning, mfaToken });
      onOpenChange(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-green-600" />
            Sign Document
          </DialogTitle>
          <DialogDescription>
            21 CFR Part 11 compliant electronic signature
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          {/* Document Info */}
          <div className="bg-muted p-3 rounded-lg">
            <p className="font-medium">{request.document_title}</p>
            <p className="text-sm text-muted-foreground truncate">
              Hash: {request.document_hash}
            </p>
          </div>
          
          <Separator />
          
          {/* Signature Meaning */}
          <div className="space-y-2">
            <Label>Signature Meaning *</Label>
            <Select value={meaning} onValueChange={setMeaning}>
              <SelectTrigger>
                <SelectValue placeholder="Select signature meaning" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="I have reviewed and approve this document">
                  Reviewed and Approved
                </SelectItem>
                <SelectItem value="I have authored this document">
                  Authored
                </SelectItem>
                <SelectItem value="I have verified the accuracy of this document">
                  Verified
                </SelectItem>
                <SelectItem value="I am the responsible authority">
                  Responsible Authority
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          {/* Password */}
          <div className="space-y-2">
            <Label>Password *</Label>
            <Input
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          
          {/* MFA Token (optional) */}
          <div className="space-y-2">
            <Label>MFA Token (if enabled)</Label>
            <Input
              type="text"
              placeholder="6-digit code"
              value={mfaToken}
              onChange={(e) => setMfaToken(e.target.value)}
              maxLength={6}
            />
          </div>
          
          <div className="bg-yellow-50 dark:bg-yellow-900/20 p-3 rounded-lg text-sm">
            <p className="font-medium text-yellow-800 dark:text-yellow-200">
              Legal Notice
            </p>
            <p className="text-yellow-700 dark:text-yellow-300 text-xs mt-1">
              By signing, you acknowledge that this electronic signature is legally 
              binding and equivalent to a handwritten signature under 21 CFR Part 11.
            </p>
          </div>
        </div>
        
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSign}
            disabled={!password || !meaning || isSubmitting}
          >
            <PenLine className="h-4 w-4 mr-2" />
            Sign Document
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Request Details Component
function RequestDetails({ requestId }: { requestId: string }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [signDialogOpen, setSignDialogOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['signing-request', requestId],
    queryFn: async () => {
      const response = await fetch(`/api/gcc/signing/requests/${requestId}`);
      if (!response.ok) throw new Error('Failed to fetch request');
      return response.json();
    }
  });

  const signMutation = useMutation({
    mutationFn: async (signData: { password: string; meaning: string; mfaToken?: string }) => {
      const response = await fetch(`/api/gcc/signing/requests/${requestId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: 'current-user-id', // Would come from auth context
          userName: 'Current User',
          role: 'Reviewer',
          ...signData
        })
      });
      if (!response.ok) throw new Error('Signing failed');
      return response.json();
    },
    onSuccess: () => {
      toast({ title: 'Document Signed', description: 'Your signature has been recorded' });
      queryClient.invalidateQueries({ queryKey: ['signing-request', requestId] });
      queryClient.invalidateQueries({ queryKey: ['signing-requests'] });
    },
    onError: (error: any) => {
      toast({ title: 'Error', description: error.message, variant: 'destructive' });
    }
  });

  if (isLoading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-2/3" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const request = data?.request as SigningRequest;
  if (!request) return null;

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <FileSignature className="h-5 w-5" />
              {request.document_title}
            </CardTitle>
            <CardDescription className="mt-1">
              {request.workflow_name} • {request.document_type}
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <UrgencyBadge urgency={request.urgency} />
            <StatusBadge status={request.status} />
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Document Hash */}
        <div className="bg-muted p-3 rounded-lg font-mono text-xs break-all">
          <span className="text-muted-foreground">SHA-256: </span>
          {request.document_hash}
        </div>
        
        {/* Signers */}
        <div>
          <h4 className="font-medium mb-3">Signers</h4>
          <div className="space-y-3">
            {request.signers.map((signer, index) => (
              <div 
                key={signer.userId}
                className="flex items-center justify-between p-3 border rounded-lg"
              >
                <div className="flex items-center gap-3">
                  <Avatar className="h-8 w-8">
                    <AvatarFallback>
                      {signer.name.split(' ').map(n => n[0]).join('')}
                    </AvatarFallback>
                  </Avatar>
                  <div>
                    <p className="font-medium">{signer.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {signer.role} • {signer.email}
                    </p>
                  </div>
                </div>
                <div>
                  {signer.status === 'signed' ? (
                    <Badge variant="default" className="bg-green-500">
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Signed
                    </Badge>
                  ) : signer.status === 'declined' ? (
                    <Badge variant="destructive">
                      <XCircle className="h-3 w-3 mr-1" />
                      Declined
                    </Badge>
                  ) : (
                    <Badge variant="secondary">
                      <Clock className="h-3 w-3 mr-1" />
                      Pending
                    </Badge>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        
        {/* Signatures */}
        {request.signatures && request.signatures.length > 0 && (
          <div>
            <h4 className="font-medium mb-3">Signatures</h4>
            <div className="space-y-2">
              {request.signatures.map((sig) => (
                <div 
                  key={sig.id}
                  className="bg-green-50 dark:bg-green-900/20 p-3 rounded-lg"
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-medium text-green-800 dark:text-green-200">
                        {sig.signer_name}
                      </p>
                      <p className="text-sm text-green-600 dark:text-green-400">
                        "{sig.meaning}"
                      </p>
                    </div>
                    <div className="text-right text-sm text-muted-foreground">
                      <p>{format(new Date(sig.signed_at), 'PPpp')}</p>
                      <p className="text-xs">IP: {sig.ip_address}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
      
      <CardFooter className="justify-end gap-2">
        <Button variant="outline">
          <Eye className="h-4 w-4 mr-2" />
          View Document
        </Button>
        {request.status !== 'completed' && request.status !== 'declined' && (
          <Button onClick={() => setSignDialogOpen(true)}>
            <PenLine className="h-4 w-4 mr-2" />
            Sign
          </Button>
        )}
        {request.status === 'completed' && (
          <Button variant="outline">
            <Download className="h-4 w-4 mr-2" />
            Download Manifest
          </Button>
        )}
      </CardFooter>
      
      <SignDocumentDialog
        request={request}
        open={signDialogOpen}
        onOpenChange={setSignDialogOpen}
        onSign={(data) => signMutation.mutate(data)}
      />
    </Card>
  );
}

// Main Component
export default function SigningWorkflowDashboard({ userId }: { userId?: string }) {
  const [selectedRequest, setSelectedRequest] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const { data: requestsData, isLoading } = useQuery({
    queryKey: ['signing-requests', userId, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.append('userId', userId);
      if (statusFilter !== 'all') params.append('status', statusFilter);
      params.append('limit', '50');
      
      const response = await fetch(`/api/gcc/signing/requests?${params}`);
      if (!response.ok) throw new Error('Failed to fetch requests');
      return response.json();
    }
  });

  const { data: statsData } = useQuery({
    queryKey: ['signing-stats'],
    queryFn: async () => {
      const response = await fetch('/api/gcc/signing/stats');
      if (!response.ok) throw new Error('Failed to fetch stats');
      return response.json();
    }
  });

  const stats = statsData?.stats || {};

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Pending</p>
                <p className="text-3xl font-bold text-yellow-600">
                  {stats.pending_requests || 0}
                </p>
              </div>
              <Clock className="h-8 w-8 text-yellow-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Completed</p>
                <p className="text-3xl font-bold text-green-600">
                  {stats.completed_requests || 0}
                </p>
              </div>
              <CheckCircle className="h-8 w-8 text-green-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Signatures</p>
                <p className="text-3xl font-bold">{stats.total_signatures || 0}</p>
              </div>
              <PenLine className="h-8 w-8 text-blue-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
        
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">Manifests</p>
                <p className="text-3xl font-bold">{stats.total_manifests || 0}</p>
              </div>
              <Shield className="h-8 w-8 text-purple-500 opacity-50" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Requests List */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Signing Requests</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="in_progress">In Progress</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="declined">Declined</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                {requestsData?.requests?.map((req: SigningRequest) => (
                  <div
                    key={req.id}
                    className={`p-3 border rounded-lg cursor-pointer hover:bg-muted/50 transition-colors ${
                      selectedRequest === req.id ? 'border-primary bg-muted/50' : ''
                    }`}
                    onClick={() => setSelectedRequest(req.id)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate">{req.document_title}</p>
                        <p className="text-sm text-muted-foreground">
                          {req.workflow_name}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 ml-2">
                        <UrgencyBadge urgency={req.urgency} />
                        <StatusBadge status={req.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <User className="h-3 w-3" />
                        {req.signers?.length || 0} signers
                      </span>
                      <span className="flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {formatDistanceToNow(new Date(req.created_at), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                ))}
                
                {(!requestsData?.requests || requestsData.requests.length === 0) && (
                  <div className="text-center py-8 text-muted-foreground">
                    No signing requests found
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Request Details */}
        <div>
          {selectedRequest ? (
            <RequestDetails requestId={selectedRequest} />
          ) : (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-muted-foreground">
                <FileSignature className="h-12 w-12 mb-4 opacity-50" />
                <p>Select a request to view details</p>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
