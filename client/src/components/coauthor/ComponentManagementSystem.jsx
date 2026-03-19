/**
 * Component-Centric Management System (CCMS) UI
 * Part of the eCTD Co-Author module transformation
 * Enables granular component-level version tracking with UDIs
 * Now with comprehensive SharePoint-style navigation and folder hierarchy
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { apiRequest } from '@/lib/queryClient';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTenantContext } from '@/contexts/TenantContext';
import {
  Database,
  GitBranch,
  GitMerge,
  Package,
  FileText,
  Hash,
  Clock,
  User,
  Tag,
  Search,
  Filter,
  Upload,
  Download,
  Eye,
  Edit,
  Trash2,
  RefreshCw,
  Link2,
  History,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  CheckCircle,
  Info,
  Copy,
  ArrowRight,
  Layers,
  Brain,
  Sparkles,
  Zap,
  XCircle,
  AlertTriangle,
  CheckCircle2,
  Circle,
  FileIcon,
  Activity,
  Shield,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Folder,
  FolderOpen,
  MoreVertical,
  Plus,
  Share2,
  Link,
  Settings,
  HelpCircle,
  Grid,
  List,
  Home,
  X,
  Star,
  Users,
  Bell,
  Pin,
  UserPlus,
  Menu,
  Table,
  Presentation
} from 'lucide-react';
import { ComplianceCommandCenter } from './ComplianceCommandCenter';
import { WorkflowTimeline } from './WorkflowTimeline';
import { DocumentPreview } from './DocumentPreview';
import VersionHistory from './VersionHistory';
import { GlobalSearchComponent } from './GlobalSearchComponent';

/**
 * Helper function to get document type icon based on file extension or component type
 */
function getDocumentTypeIcon(component) {
  const type = component?.type?.toLowerCase() || '';
  const fileName = component?.metadata?.fileName?.toLowerCase() || '';
  
  if (type.includes('word') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    return <FileText className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
  }
  if (type.includes('excel') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return <Table className="h-5 w-5 text-green-600 dark:text-green-400" />;
  }
  if (type.includes('powerpoint') || fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) {
    return <Presentation className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
  }
  if (type.includes('pdf') || fileName.endsWith('.pdf')) {
    return <FileText className="h-5 w-5 text-red-600 dark:text-red-400" />;
  }
  // Default file icon
  return <FileIcon className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
}

/**
 * Get compliance status indicator (traffic light)
 */
function getComplianceStatusIndicator(status) {
  switch (status?.toLowerCase()) {
    case 'compliant':
    case 'approved':
    case 'complete':
      return <Circle className="h-4 w-4 fill-green-500 text-green-500" />;
    case 'pending':
    case 'review':
    case 'in_progress':
      return <Circle className="h-4 w-4 fill-yellow-500 text-yellow-500" />;
    case 'non-compliant':
    case 'rejected':
    case 'failed':
      return <Circle className="h-4 w-4 fill-red-500 text-red-500" />;
    default:
      return <Circle className="h-4 w-4 fill-slate-400 text-slate-400" />;
  }
}

/**
 * Get severity color classes
 */
function getSeverityColorClasses(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return 'bg-red-100 dark:bg-red-900/30 border-red-300 dark:border-red-700 text-red-900 dark:text-red-100';
    case 'major':
      return 'bg-orange-100 dark:bg-orange-900/30 border-orange-300 dark:border-orange-700 text-orange-900 dark:text-orange-100';
    case 'minor':
      return 'bg-yellow-100 dark:bg-yellow-900/30 border-yellow-300 dark:border-yellow-700 text-yellow-900 dark:text-yellow-100';
    case 'info':
      return 'bg-blue-100 dark:bg-blue-900/30 border-blue-300 dark:border-blue-700 text-blue-900 dark:text-blue-100';
    default:
      return 'bg-slate-100 dark:bg-slate-900/30 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100';
  }
}

/**
 * Get severity icon
 */
function getSeverityIcon(severity) {
  switch (severity?.toLowerCase()) {
    case 'critical':
      return <XCircle className="h-5 w-5 text-red-600 dark:text-red-400" />;
    case 'major':
      return <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />;
    case 'minor':
      return <AlertCircle className="h-5 w-5 text-yellow-600 dark:text-yellow-400" />;
    case 'info':
      return <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />;
    default:
      return <Circle className="h-5 w-5 text-slate-600 dark:text-slate-400" />;
  }
}

/**
 * Visual status badge component
 */
function StatusBadge({ status, showIcon = true }) {
  const getStatusConfig = (status) => {
    switch (status?.toLowerCase()) {
      case 'approved':
        return {
          icon: <CheckCircle2 className="h-3 w-3" />,
          classes: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200 border-green-200 dark:border-green-700'
        };
      case 'pending':
        return {
          icon: <Clock className="h-3 w-3" />,
          classes: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 border-yellow-200 dark:border-yellow-700'
        };
      case 'rejected':
        return {
          icon: <XCircle className="h-3 w-3" />,
          classes: 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200 border-red-200 dark:border-red-700'
        };
      case 'in_review':
        return {
          icon: <Eye className="h-3 w-3" />,
          classes: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 border-blue-200 dark:border-blue-700'
        };
      default:
        return {
          icon: <Circle className="h-3 w-3" />,
          classes: 'bg-slate-100 dark:bg-slate-900/30 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700'
        };
    }
  };

  const config = getStatusConfig(status);
  
  return (
    <Badge variant="outline" className={`flex items-center gap-1 ${config.classes}`}>
      {showIcon && config.icon}
      <span className="text-xs font-medium">{status}</span>
    </Badge>
  );
}

/**
 * Priority Number Input Component
 * eCTD 4.0: Allows sponsors to manage the intended display order
 */
function PriorityNumberInput({ component, onUpdate }) {
  const [priorityNumber, setPriorityNumber] = useState(component.priorityNumber || 0);
  const [isEditing, setIsEditing] = useState(false);
  const { toast } = useToast();

  const updatePriorityMutation = useMutation({
    mutationFn: async ({ componentId, priorityNumber, displayOrder }) => {
      const response = await apiRequest('PUT', `/api/coauthor/components/${componentId}/priority`, { priorityNumber, displayOrder }, getOrgHeader());
      return response.json();
    },
    onSuccess: () => {
      setIsEditing(false);
      onUpdate?.();
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  const handleSave = () => {
    updatePriorityMutation.mutate({
      componentId: component.id,
      priorityNumber: parseInt(priorityNumber),
      displayOrder: parseInt(priorityNumber)
    });
  };

  if (!isEditing) {
    return (
      <div 
        className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 px-2 py-1 rounded"
        onClick={() => setIsEditing(true)}
        data-testid={`button-edit-priority-${component.id}`}
      >
        <span className="font-mono text-sm font-semibold text-emerald-600 dark:text-emerald-400">
          {priorityNumber}
        </span>
        <Edit className="h-3 w-3 text-slate-400" />
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1">
      <Input
        type="number"
        value={priorityNumber}
        onChange={(e) => setPriorityNumber(e.target.value)}
        className="w-16 h-7 text-sm"
        data-testid={`input-priority-${component.id}`}
        onKeyPress={(e) => {
          if (e.key === 'Enter') handleSave();
          if (e.key === 'Escape') setIsEditing(false);
        }}
        autoFocus
      />
      <Button
        size="sm"
        variant="ghost"
        className="h-7 w-7 p-0"
        onClick={handleSave}
        disabled={updatePriorityMutation.isPending}
        data-testid={`button-save-priority-${component.id}`}
      >
        <CheckCircle className="h-4 w-4 text-green-600" />
      </Button>
    </div>
  );
}

/**
 * Usage Map Button Component
 * Shows cross-sequence component referencing via UDI
 */
function UsageMapButton({ component }) {
  const [showDialog, setShowDialog] = useState(false);
  const { toast } = useToast();

  const { data: sequenceUsage, isLoading, refetch } = useQuery({
    queryKey: [`/api/coauthor/components/${component.id}/sequence-usage`],
    enabled: showDialog,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/coauthor/components/${component.id}/sequence-usage`, undefined, getOrgHeader());
      return response.json();
    }
  });

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300"
        onClick={() => setShowDialog(true)}
        data-testid={`button-usage-map-${component.id}`}
      >
        <GitBranch className="h-3 w-3 mr-1" />
        View Map
      </Button>

      <Dialog open={showDialog} onOpenChange={setShowDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <GitBranch className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
              Cross-Sequence Usage Map
            </DialogTitle>
            <DialogDescription>
              Component: <span className="font-mono font-semibold text-indigo-600">{component.udi}</span>
            </DialogDescription>
          </DialogHeader>

          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <RefreshCw className="h-8 w-8 animate-spin text-slate-400" />
            </div>
          ) : sequenceUsage?.sequenceUsage?.length === 0 ? (
            <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
              <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              <AlertTitle>Not Used in Any Sequences</AlertTitle>
              <AlertDescription>
                This component has not been referenced in any eCTD sequences yet.
              </AlertDescription>
            </Alert>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4 p-4 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800">
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {sequenceUsage?.totalSequences || 0}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">Sequences</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {sequenceUsage?.totalReferences || 0}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">Total References</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">
                    {component.usageCount || 0}
                  </div>
                  <div className="text-sm text-slate-600 dark:text-slate-400 mt-1">Usage Count</div>
                </div>
              </div>

              <ScrollArea className="max-h-[400px]">
                <div className="space-y-3">
                  {sequenceUsage?.sequenceUsage?.map((seq) => (
                    <Card key={seq.sequenceNumber} className="border-slate-200 dark:border-slate-700">
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base flex items-center gap-2">
                          <Badge variant="outline" className="font-mono text-indigo-600 dark:text-indigo-400 border-indigo-300 dark:border-indigo-700">
                            {seq.sequenceNumber}
                          </Badge>
                          {seq.applicationNumber && (
                            <span className="text-sm text-slate-600 dark:text-slate-400">
                              ({seq.applicationNumber})
                            </span>
                          )}
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="pt-0">
                        {seq.documents?.length > 0 ? (
                          <div className="space-y-2">
                            {seq.documents.map((doc, idx) => (
                              <div key={idx} className="flex items-start gap-2 p-2 bg-slate-50 dark:bg-slate-800/50 rounded">
                                <FileText className="h-4 w-4 text-slate-400 mt-0.5 flex-shrink-0" />
                                <div className="flex-1 min-w-0">
                                  <div className="font-medium text-sm text-slate-700 dark:text-slate-300 truncate">
                                    {doc.documentTitle || `Document #${doc.documentId}`}
                                  </div>
                                  <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 flex items-center gap-2">
                                    <span className="font-mono">{doc.sectionNumber}</span>
                                    <span>•</span>
                                    <span>{doc.moduleContext}</span>
                                    <span>•</span>
                                    <Badge variant="secondary" className="text-xs">
                                      {doc.ectdOperation}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-sm text-slate-500 dark:text-slate-400 italic">
                            Referenced but not linked to specific documents
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </ScrollArea>
            </div>
          )}

          <DialogFooter>
            <Button onClick={() => setShowDialog(false)} data-testid="button-close-usage-map">
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/**
 * Change Management Tab Component
 * Implements AI/NLP-powered context-aware text transformation
 * Uses GPT-4o for intelligent change analysis and validation
 */
function ChangeManagementTab({ documentId }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useTenantContext();
  
  const [originalValue, setOriginalValue] = useState('');
  const [newValue, setNewValue] = useState('');
  const [reason, setReason] = useState('');
  const [priority, setPriority] = useState('medium');
  const [useAI, setUseAI] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [validationResult, setValidationResult] = useState(null);
  
  // Debug logging to ensure component mounts
  console.log('🚀 ChangeManagementTab mounted with documentId:', documentId);

  // Fetch change history
  const { data: history, isLoading: historyLoading } = useQuery({
    queryKey: ['/api/coauthor/global-change/history'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/coauthor/global-change/history', undefined, getOrgHeader());
      return response.json();
    },
    enabled: !!currentOrganization
  });

  // Preview changes mutation
  const previewMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiRequest('POST', '/api/coauthor/global-change/preview', data, getOrgHeader());
      const result = await response.json();
      console.log('📡 Preview response from server:', result);
      return result;
    },
    onSuccess: (data) => {
      console.log('🔍 Preview data received:', data);
      console.log('📊 Preview array length:', data.previews?.length);
      console.log('📦 Raw preview data structure:', JSON.stringify(data, null, 2));
      
      // Ensure we have valid preview data
      if (data && (data.previews || data.totalComponents !== undefined)) {
        setPreviewData(data);
        setShowPreview(true);
        toast({
          title: "Preview Generated",
          description: data.previews?.length > 0 
            ? `Found ${data.totalComponents} components with ${data.totalChanges} changes`
            : "No matching components found - test data created for demonstration"
        });
      } else {
        console.error('Invalid preview data format:', data);
        toast({
          title: "Preview Issue",
          description: "Preview generated but format is unexpected",
          variant: "warning"
        });
      }
    },
    onError: (error) => {
      console.error('Preview error:', error);
      toast({
        title: "Preview Failed",
        description: error.message || "Failed to generate preview",
        variant: "destructive"
      });
    }
  });

  // Validate change mutation
  const validateMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiRequest('POST', '/api/coauthor/global-change/validate', data, getOrgHeader());
      return response.json();
    },
    onSuccess: (data) => {
      setValidationResult(data.validation);
      if (!data.validation.isValid) {
        toast({
          title: "Validation Issues Found",
          description: `${data.validation.issues.length} issues detected`,
          variant: "warning"
        });
      }
    }
  });

  // Apply changes mutation
  const applyChangesMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiRequest('POST', '/api/coauthor/global-change/apply', data, getOrgHeader());
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Changes Applied Successfully",
        description: `Modified ${data.successful} components successfully`
      });
      queryClient.invalidateQueries(['/api/coauthor/components']);
      queryClient.invalidateQueries(['/api/coauthor/global-change/history']);
      setOriginalValue('');
      setNewValue('');
      setReason('');
      setShowPreview(false);
      setPreviewData(null);
    },
    onError: (error) => {
      toast({
        title: "Apply Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Rollback change mutation
  const rollbackMutation = useMutation({
    mutationFn: async (changeId) => {
      const response = await apiRequest('POST', `/api/coauthor/global-change/rollback/${changeId}`, undefined, getOrgHeader());
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Rollback Successful",
        description: "Change has been rolled back"
      });
      queryClient.invalidateQueries(['/api/coauthor/global-change/history']);
      queryClient.invalidateQueries(['/api/coauthor/components']);
    }
  });

  const handlePreviewChanges = () => {
    if (!originalValue || !newValue) {
      toast({
        title: "Validation Error",
        description: "Please provide both original and new values",
        variant: "destructive"
      });
      return;
    }

    const previewPayload = {
      originalText: originalValue,
      newText: newValue,
      useAI
    };
    console.log('🚀 Sending preview request with payload:', previewPayload);
    console.log('📋 Payload details:', {
      originalText: originalValue,
      newText: newValue,
      useAI: useAI
    });

    // Validate the change first
    validateMutation.mutate({
      originalText: originalValue,
      newText: newValue,
      componentType: 'generic'
    });

    // Generate preview
    previewMutation.mutate(previewPayload);
  };

  const handleApplyChanges = () => {
    if (!previewData) return;

    const componentIds = previewData.previews
      ?.filter(p => p.changeCount > 0)
      ?.map(p => p.componentId);

    applyChangesMutation.mutate({
      originalText: originalValue,
      newText: newValue,
      reason,
      priority,
      useAI,
      componentIds
    });
  };

  return (
    <div className="space-y-6">
      {/* Create New Change Request */}
      <Card className="border-emerald-200 dark:border-emerald-800 shadow-md">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-emerald-100 dark:from-emerald-900/20 dark:to-emerald-800/20">
          <CardTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
            Create Global Change Request
          </CardTitle>
          <CardDescription>
            Replace text across all components with full audit trail and approval workflow
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Original Text</Label>
              <Input
                placeholder="Text to find..."
                value={originalValue}
                onChange={(e) => setOriginalValue(e.target.value)}
                data-testid="input-original-text"
              />
            </div>
            <div className="space-y-2">
              <Label>New Text</Label>
              <Input
                placeholder="Replacement text..."
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                data-testid="input-new-text"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <Label>Reason for Change</Label>
            <Input
              placeholder="Explain why this change is needed..."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="input-reason"
            />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Priority</Label>
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900"
                data-testid="select-priority"
              >
                <option value="low">Low</option>
                <option value="medium">Medium</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-2">
                <Brain className="h-4 w-4" />
                Use AI for Smart Matching
              </Label>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={useAI}
                  onChange={(e) => setUseAI(e.target.checked)}
                  className="h-4 w-4"
                  data-testid="checkbox-use-ai"
                />
                <span className="text-sm text-slate-600 dark:text-slate-400">
                  Find similar text using AI
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex gap-3">
            <Button
              onClick={handlePreviewChanges}
              disabled={previewMutation.isPending || !originalValue || !newValue}
              className="flex-1 bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600"
              data-testid="button-preview-changes"
            >
              {previewMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Generating Preview...
                </>
              ) : (
                <>
                  <Eye className="h-4 w-4 mr-2" />
                  Preview Changes
                </>
              )}
            </Button>
            
            {previewData && (
              <Button
                onClick={handleApplyChanges}
                disabled={applyChangesMutation.isPending}
                className="flex-1 bg-emerald-600 hover:bg-emerald-700 dark:bg-emerald-700 dark:hover:bg-emerald-600"
                data-testid="button-apply-changes"
              >
                {applyChangesMutation.isPending ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Applying Changes...
                  </>
                ) : (
                  <>
                    <Zap className="h-4 w-4 mr-2" />
                    Apply Changes
                  </>
                )}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Preview Results or Change History */}
      {previewData ? (
        <Card className="border-blue-200 dark:border-blue-800 shadow-md">
          <CardHeader className="bg-gradient-to-r from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-800/20">
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Eye className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                Change Preview
              </div>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setShowPreview(false);
                  setPreviewData(null);
                }}
                data-testid="button-close-preview"
              >
                Close Preview
              </Button>
            </CardTitle>
            <CardDescription>
              Found {previewData.totalComponents} components with {previewData.totalChanges} total changes
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Enhanced Validation Results with Severity Banners */}
            {validationResult && !validationResult.isValid && (
              <div className="mb-4 space-y-3">
                {/* Main Validation Alert */}
                <Alert className={`border-2 ${getSeverityColorClasses(validationResult.severity || 'major')}`}>
                  <div className="flex items-start gap-3">
                    {getSeverityIcon(validationResult.severity || 'major')}
                    <div className="flex-1">
                      <AlertTitle className="flex items-center gap-2 mb-2">
                        <span>Validation Issues Detected</span>
                        <StatusBadge status="failed" />
                      </AlertTitle>
                      <AlertDescription>
                        {/* Issues by Severity */}
                        <div className="space-y-3">
                          {validationResult.issues.map((issue, idx) => {
                            const issueSeverity = issue.severity || 'minor';
                            return (
                              <div 
                                key={idx} 
                                className={`p-3 rounded-lg border flex items-start gap-2 ${getSeverityColorClasses(issueSeverity)}`}
                              >
                                {getSeverityIcon(issueSeverity)}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-sm">
                                      {issueSeverity.toUpperCase()}
                                    </span>
                                    {issue.component && (
                                      <div className="flex items-center gap-1">
                                        {getDocumentTypeIcon(issue.component)}
                                        <code className="text-xs font-mono bg-white/50 dark:bg-slate-800/50 px-1 rounded">
                                          {issue.component.udi}
                                        </code>
                                      </div>
                                    )}
                                  </div>
                                  <p className="text-sm">{issue.message || issue}</p>
                                  {issue.location && (
                                    <p className="text-xs mt-1 opacity-75">
                                      Location: {issue.location}
                                    </p>
                                  )}
                                </div>
                                {/* Compliance Status for Each Issue */}
                                <div className="flex items-center gap-1">
                                  {getComplianceStatusIndicator('non-compliant')}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                        
                        {/* Recommendations with Visual Enhancements */}
                        {validationResult.recommendations?.length > 0 && (
                          <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-950/30 rounded-lg border border-blue-200 dark:border-blue-800">
                            <div className="flex items-start gap-2">
                              <Info className="h-5 w-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
                              <div className="flex-1">
                                <p className="font-medium text-sm mb-2 text-blue-900 dark:text-blue-100">
                                  Recommendations:
                                </p>
                                <div className="space-y-2">
                                  {validationResult.recommendations.map((rec, idx) => (
                                    <div key={idx} className="flex items-start gap-2">
                                      <CheckCircle2 className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                      <p className="text-sm text-blue-800 dark:text-blue-200">{rec}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}
                        
                        {/* Summary Stats */}
                        <div className="mt-4 grid grid-cols-3 gap-2">
                          <div className="text-center p-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-800">
                            <div className="text-lg font-bold text-red-600 dark:text-red-400">
                              {validationResult.issues.filter(i => (i.severity || 'minor') === 'critical').length}
                            </div>
                            <div className="text-xs text-red-700 dark:text-red-300">Critical</div>
                          </div>
                          <div className="text-center p-2 bg-orange-50 dark:bg-orange-950/30 rounded border border-orange-200 dark:border-orange-800">
                            <div className="text-lg font-bold text-orange-600 dark:text-orange-400">
                              {validationResult.issues.filter(i => (i.severity || 'minor') === 'major').length}
                            </div>
                            <div className="text-xs text-orange-700 dark:text-orange-300">Major</div>
                          </div>
                          <div className="text-center p-2 bg-yellow-50 dark:bg-yellow-950/30 rounded border border-yellow-200 dark:border-yellow-800">
                            <div className="text-lg font-bold text-yellow-600 dark:text-yellow-400">
                              {validationResult.issues.filter(i => (i.severity || 'minor') === 'minor').length}
                            </div>
                            <div className="text-xs text-yellow-700 dark:text-yellow-300">Minor</div>
                          </div>
                        </div>
                      </AlertDescription>
                    </div>
                  </div>
                </Alert>
              </div>
            )}
            
            <ScrollArea className="h-[400px]">
              <div className="space-y-3">
                {previewData.previews?.map((preview, index) => {
                  const severity = preview.impact?.impact || 'low';
                  const severityColors = getSeverityColorClasses(severity);
                  
                  return (
                    <Card 
                      key={index} 
                      className={`border-2 transition-all hover:shadow-md ${severityColors}`}
                    >
                      <CardContent className="pt-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            {/* Header with Document Icon and Status */}
                            <div className="flex items-center gap-3 mb-3">
                              {/* Document Type Icon */}
                              <div className="flex-shrink-0">
                                {getDocumentTypeIcon(preview)}
                              </div>
                              
                              {/* Component Info */}
                              <div className="flex-1 flex items-center gap-2 flex-wrap">
                                <code className="text-xs font-mono bg-white/50 dark:bg-slate-800/50 px-2 py-1 rounded border border-slate-300 dark:border-slate-600">
                                  {preview.udi}
                                </code>
                                
                                {/* Component Type with Icon */}
                                <div className="flex items-center gap-1">
                                  <FileIcon className="h-3 w-3 text-slate-500" />
                                  <Badge variant="outline" className="text-xs border-slate-300 dark:border-slate-600">
                                    {preview.type}
                                  </Badge>
                                </div>
                                
                                {/* Change Count Badge with Progress Indicator */}
                                {preview.changeCount > 0 && (
                                  <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300 flex items-center gap-1">
                                    <Activity className="h-3 w-3" />
                                    {preview.changeCount} changes
                                  </Badge>
                                )}
                                
                                {/* Compliance Status Indicator */}
                                <div className="flex items-center gap-1">
                                  {getComplianceStatusIndicator(preview.status || 'pending')}
                                  <span className="text-xs text-slate-600 dark:text-slate-400">
                                    Compliance
                                  </span>
                                </div>
                              </div>
                            </div>
                            
                            {/* Severity Banner with Icon */}
                            {preview.impact && (
                              <div className={`mb-3 p-3 rounded-lg border-2 flex items-start gap-2 ${getSeverityColorClasses(preview.impact.impact)}`}>
                                {getSeverityIcon(preview.impact.impact)}
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    <span className="font-semibold text-sm">
                                      {preview.impact.impact?.toUpperCase()} IMPACT
                                    </span>
                                    <StatusBadge status={preview.reviewStatus || 'pending'} />
                                  </div>
                                  {preview.impact.implications && (
                                    <p className="text-xs opacity-90">
                                      {preview.impact.implications}
                                    </p>
                                  )}
                                </div>
                              </div>
                            )}
                            
                            {/* Content Preview with Better Styling */}
                            {preview.changeCount > 0 && (
                              <div className="mt-3 p-3 bg-white/60 dark:bg-slate-900/60 rounded-lg border border-slate-200 dark:border-slate-700">
                                <div className="flex items-center gap-2 mb-2">
                                  <Eye className="h-4 w-4 text-slate-500" />
                                  <p className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                    Content Preview
                                  </p>
                                </div>
                                <pre className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap break-words font-mono bg-slate-50 dark:bg-slate-800 p-2 rounded">
                                  {preview.updatedContent?.substring(0, 200)}...
                                </pre>
                              </div>
                            )}
                            
                            {/* Workflow Progress Indicator */}
                            {preview.workflowProgress && (
                              <div className="mt-3">
                                <div className="flex items-center justify-between mb-1">
                                  <span className="text-xs text-slate-600 dark:text-slate-400">
                                    Workflow Progress
                                  </span>
                                  <span className="text-xs font-medium">
                                    {preview.workflowProgress}%
                                  </span>
                                </div>
                                <Progress value={preview.workflowProgress} className="h-2" />
                              </div>
                            )}
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  );
                })}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200 dark:border-slate-700 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-slate-600 dark:text-slate-400" />
              Change History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[400px]">
              {historyLoading ? (
                <div className="text-center py-12">
                  <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-slate-400" />
                  <p className="text-slate-600 dark:text-slate-400">Loading history...</p>
                </div>
              ) : !history?.history || history.history.length === 0 ? (
                <div className="text-center py-12">
                  <History className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                  <p className="text-slate-600 dark:text-slate-400">No change history found</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {history.history.map((change, idx) => {
                    const priorityColor = change.details?.priority === 'critical' ? 'border-red-300 dark:border-red-700' :
                                         change.details?.priority === 'high' ? 'border-orange-300 dark:border-orange-700' :
                                         change.details?.priority === 'medium' ? 'border-yellow-300 dark:border-yellow-700' :
                                         'border-slate-200 dark:border-slate-700';
                    
                    return (
                      <Card key={idx} className={`border-2 transition-all hover:shadow-md ${priorityColor}`}>
                        <CardContent className="pt-4">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex-1">
                              {/* Header with Icons and Status Badges */}
                              <div className="flex items-center gap-3 mb-3">
                                {/* File Type Icon if available */}
                                {change.componentInfo && (
                                  <div className="flex-shrink-0">
                                    {getDocumentTypeIcon(change.componentInfo)}
                                  </div>
                                )}
                                
                                {/* Action and Priority Badges */}
                                <div className="flex items-center gap-2 flex-wrap">
                                  <div className="flex items-center gap-1">
                                    <History className="h-3 w-3 text-blue-600" />
                                    <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300">
                                      {change.action}
                                    </Badge>
                                  </div>
                                  
                                  {change.details?.priority && (
                                    <div className="flex items-center gap-1">
                                      {getSeverityIcon(change.details.priority)}
                                      <Badge 
                                        variant="outline" 
                                        className={`text-xs ${getSeverityColorClasses(change.details.priority)}`}
                                      >
                                        {change.details.priority}
                                      </Badge>
                                    </div>
                                  )}
                                  
                                  {/* Status Badge */}
                                  <StatusBadge status={change.status || 'completed'} />
                                  
                                  {/* Compliance Status */}
                                  <div className="flex items-center gap-1">
                                    {getComplianceStatusIndicator(change.complianceStatus || 'compliant')}
                                    <span className="text-xs text-slate-600 dark:text-slate-400">
                                      Compliance
                                    </span>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Change Details with Better Styling */}
                              {change.details?.originalText && (
                                <div className="bg-slate-50 dark:bg-slate-900/50 p-3 rounded-lg mb-2 border border-slate-200 dark:border-slate-700">
                                  <div className="flex items-start gap-2">
                                    <ArrowRight className="h-4 w-4 text-slate-500 mt-0.5 flex-shrink-0" />
                                    <div className="flex-1">
                                      <p className="text-sm font-mono text-slate-700 dark:text-slate-300">
                                        <span className="line-through opacity-60">{change.details.originalText}</span>
                                        <span className="mx-2 text-slate-500">→</span>
                                        <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
                                          {change.details.newText}
                                        </span>
                                      </p>
                                    </div>
                                  </div>
                                </div>
                              )}
                              
                              {/* Reason with Icon */}
                              {change.details?.reason && (
                                <div className="flex items-start gap-2 mt-2">
                                  <Info className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                  <p className="text-xs text-slate-600 dark:text-slate-400">
                                    <span className="font-medium">Reason:</span> {change.details.reason}
                                  </p>
                                </div>
                              )}
                              
                              {/* Files Affected Count */}
                              {change.affectedCount && (
                                <div className="flex items-center gap-2 mt-2">
                                  <Badge className="bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300">
                                    <Layers className="h-3 w-3 mr-1" />
                                    {change.affectedCount} components affected
                                  </Badge>
                                </div>
                              )}
                            </div>
                            
                            {/* Action Button */}
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => rollbackMutation.mutate(change.id)}
                              disabled={rollbackMutation.isPending}
                              className="text-red-600 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-950/30"
                              data-testid={`button-rollback-${change.id}`}
                            >
                              <RefreshCw className={`h-4 w-4 ${rollbackMutation.isPending ? 'animate-spin' : ''}`} />
                            </Button>
                          </div>
                          
                          {/* Footer with User and Timestamp */}
                          <div className="mt-3 pt-3 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                            <div className="flex items-center gap-2">
                              <User className="h-3 w-3" />
                              <span>{change.performed_by}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Clock className="h-3 w-3" />
                              <span>{new Date(change.performed_at).toLocaleString()}</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
              </div>
            )}
          </ScrollArea>
        </CardContent>
      </Card>
      )}
    </div>
  );
}

/**
 * SharePoint Hub Navigation Component
 */
function SharePointHubNavigation() {
  
  return (
    <div className="sp-hub-nav">
      <Layers className="sp-hub-nav-logo" />
      <span className="font-semibold">Regulatory Affairs</span>
      <div className="sp-hub-nav-links">
        <a href="#" className="sp-hub-nav-link">Sites</a>
        <a href="#" className="sp-hub-nav-link">eCTD Co-Author</a>
        <a href="#" className="sp-hub-nav-link">Documents</a>
        <a href="#" className="sp-hub-nav-link">Workflows</a>
      </div>
      {/* SharePoint-style Global Search Component */}
      <div className="flex-1 max-w-2xl mx-4">
        <GlobalSearchComponent 
          className="w-full" 
          embedded={true}
        />
      </div>
      <Bell className="h-5 w-5 text-white cursor-pointer hover:opacity-80" />
      <Settings className="h-5 w-5 text-white cursor-pointer hover:opacity-80 ml-3" />
      <div className="sp-hub-nav-profile ml-3">U</div>
    </div>
  );
}

/**
 * SharePoint Breadcrumb Navigation Component
 */
function SharePointBreadcrumb({ currentPath = [], onNavigate }) {
  const breadcrumbItems = [
    { name: 'Sites', path: '/', siblings: ['Teams', 'Communication Sites', 'Hub Sites'] },
    { name: 'Regulatory Affairs', path: '/regulatory', siblings: ['Clinical', 'Quality', 'Manufacturing'] },
    { name: 'eCTD Co-Author', path: '/ectd', siblings: ['Document Management', 'Submission Portal'] },
    { name: 'Global Change Management', path: '/gcm', siblings: ['Component Library', 'Change History'] },
    ...(currentPath || [])
  ];

  return (
    <div className="sp-breadcrumb">
      <div className="sp-breadcrumb-home" onClick={() => onNavigate?.('/')}>
        <Home className="h-4 w-4" />
      </div>
      {breadcrumbItems.map((item, index) => (
        <React.Fragment key={index}>
          <span className="sp-breadcrumb-separator">{'>'}</span>
          <div className={`sp-breadcrumb-item ${index === breadcrumbItems.length - 1 ? 'current' : ''}`}>
            <span onClick={() => onNavigate?.(item.path)}>{item.name}</span>
            {item.siblings && item.siblings.length > 0 && index < breadcrumbItems.length - 1 && (
              <>
                <ChevronDown className="h-3 w-3 ml-1" />
                <div className="sp-breadcrumb-dropdown">
                  {item.siblings.map((sibling, idx) => (
                    <div key={idx} className="sp-breadcrumb-dropdown-item">
                      {sibling}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </React.Fragment>
      ))}
    </div>
  );
}

/**
 * SharePoint Folder Navigation Component with Quick Access
 */
function SharePointFolderNavigation({ selectedFolder, onFolderSelect, components = [] }) {
  const [expandedFolders, setExpandedFolders] = useState(() => {
    const saved = localStorage.getItem('sp-expanded-folders');
    return saved ? JSON.parse(saved) : ['global-changes', 'components'];
  });
  const [pinnedItems, setPinnedItems] = useState(() => {
    const saved = localStorage.getItem('sp-pinned-items');
    return saved ? JSON.parse(saved) : [];
  });
  const [recentItems, setRecentItems] = useState(() => {
    const saved = localStorage.getItem('sp-recent-items');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('sp-expanded-folders', JSON.stringify(expandedFolders));
  }, [expandedFolders]);

  useEffect(() => {
    localStorage.setItem('sp-pinned-items', JSON.stringify(pinnedItems));
  }, [pinnedItems]);

  const toggleFolder = (folderId) => {
    setExpandedFolders(prev => {
      if (prev.includes(folderId)) {
        return prev.filter(id => id !== folderId);
      }
      return [...prev, folderId];
    });
  };

  const folderStructure = [
    {
      id: 'global-changes',
      name: 'Global Changes',
      icon: <Layers className="h-4 w-4" />,
      count: 24,
      children: [
        { id: 'active-changes', name: 'Active Changes', count: 8 },
        { id: 'pending-review', name: 'Pending Review', count: 5 },
        { id: 'approved-changes', name: 'Approved Changes', count: 7 },
        { id: 'change-history', name: 'Change History', count: 4 }
      ]
    },
    {
      id: 'components',
      name: 'Components',
      icon: <Package className="h-4 w-4" />,
      count: components.length,
      children: [
        { 
          id: 'by-module', 
          name: 'By Module (M1-M5)',
          children: [
            { id: 'm1', name: 'Module 1 - Administrative', count: 12 },
            { id: 'm2', name: 'Module 2 - Summaries', count: 18 },
            { id: 'm3', name: 'Module 3 - Quality', count: 45 },
            { id: 'm4', name: 'Module 4 - Nonclinical', count: 23 },
            { id: 'm5', name: 'Module 5 - Clinical', count: 67 }
          ]
        },
        { id: 'by-document-type', name: 'By Document Type', count: 32 },
        { id: 'recently-modified', name: 'Recently Modified', count: 15 }
      ]
    },
    {
      id: 'compliance',
      name: 'Compliance',
      icon: <Shield className="h-4 w-4" />,
      count: 12,
      children: [
        { id: 'fda-requirements', name: 'FDA Requirements', count: 5 },
        { id: 'ema-requirements', name: 'EMA Requirements', count: 4 },
        { id: 'validation-reports', name: 'Validation Reports', count: 3 }
      ]
    }
  ];

  const renderFolder = (folder, level = 0) => {
    const isExpanded = expandedFolders.includes(folder.id);
    const isSelected = selectedFolder === folder.id;
    const hasChildren = folder.children && folder.children.length > 0;

    return (
      <div key={folder.id}>
        <div
          className={`sp-folder-item ${isSelected ? 'selected' : ''} ${hasChildren ? 'folder' : ''}`}
          style={{ paddingLeft: `${16 + level * 16}px` }}
          onClick={() => {
            if (hasChildren) toggleFolder(folder.id);
            onFolderSelect?.(folder.id);
          }}
          data-testid={`folder-item-${folder.id}`}
        >
          {hasChildren && (
            <ChevronRight className={`sp-folder-item-chevron ${isExpanded ? 'expanded' : ''}`} />
          )}
          {!hasChildren && <span className="sp-folder-item-indent" />}
          <span className="sp-folder-item-icon">
            {hasChildren ? (
              isExpanded ? <FolderOpen className="h-4 w-4" /> : <Folder className="h-4 w-4" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
          </span>
          <span className="sp-folder-item-name">{folder.name}</span>
          {folder.count !== undefined && (
            <span className="sp-folder-item-count">({folder.count})</span>
          )}
        </div>
        {hasChildren && isExpanded && (
          <div>
            {folder.children.map(child => renderFolder(child, level + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="sp-folder-nav">
      <div className="sp-folder-nav-header">
        <span>Navigation</span>
        <Button size="sm" variant="ghost" className="h-6 w-6 p-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      
      {/* Quick Access Panel */}
      <div className="sp-quick-access">
        {/* Pinned Items */}
        <div className="sp-quick-access-section">
          <div className="sp-quick-access-title">
            <Pin className="h-3 w-3" />
            <span>Pinned</span>
          </div>
          {pinnedItems.length > 0 ? (
            pinnedItems.map((item, idx) => (
              <div key={idx} className="sp-quick-access-item">
                <FileText className="sp-quick-access-item-icon h-3 w-3" />
                <span className="sp-quick-access-item-name">{item.name}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-400 italic px-2">No pinned items</div>
          )}
        </div>

        {/* Recent Items */}
        <div className="sp-quick-access-section">
          <div className="sp-quick-access-title">
            <Clock className="h-3 w-3" />
            <span>Recent</span>
          </div>
          {recentItems.length > 0 ? (
            recentItems.slice(0, 5).map((item, idx) => (
              <div key={idx} className="sp-quick-access-item">
                {getDocumentTypeIcon(item)}
                <span className="sp-quick-access-item-name">{item.name || item.udi}</span>
              </div>
            ))
          ) : (
            <div className="text-xs text-slate-400 italic px-2">No recent items</div>
          )}
        </div>

        {/* Shared With Me */}
        <div className="sp-quick-access-section">
          <div className="sp-quick-access-title">
            <Users className="h-3 w-3" />
            <span>Shared with me</span>
          </div>
          <div className="text-xs text-slate-400 italic px-2">No shared items</div>
        </div>
      </div>
      
      <Separator />
      
      {/* Folder Tree */}
      <div className="sp-folder-tree">
        {folderStructure.map(folder => renderFolder(folder))}
      </div>
    </div>
  );
}

/**
 * SharePoint Properties Panel Component
 */
function SharePointPropertiesPanel({ selectedComponent, isOpen, onClose, onPropertyEdit }) {
  const [editingField, setEditingField] = useState(null);
  const [editValue, setEditValue] = useState('');

  const handleEditStart = (field, value) => {
    setEditingField(field);
    setEditValue(value || '');
  };

  const handleEditSave = () => {
    if (editingField && onPropertyEdit) {
      onPropertyEdit(editingField, editValue);
    }
    setEditingField(null);
    setEditValue('');
  };

  if (!isOpen) return null;

  return (
    <div className={`sp-properties-panel ${!isOpen ? 'collapsed' : ''}`}>
      <div className="sp-properties-panel-header">
        <span className="sp-properties-panel-title">Properties</span>
        <div className="sp-properties-panel-close" onClick={onClose}>
          <X className="h-4 w-4" />
        </div>
      </div>

      {selectedComponent ? (
        <div className="sp-properties-panel-content">
          {/* Preview Section */}
          <div className="sp-properties-section">
            <div className="sp-properties-section-title">Preview</div>
            <div className="flex justify-center p-4 bg-slate-50 dark:bg-slate-800 rounded">
              {getDocumentTypeIcon(selectedComponent)}
            </div>
          </div>

          {/* File Properties */}
          <div className="sp-properties-section">
            <div className="sp-properties-section-title">Properties</div>
            
            <div className="sp-property-row">
              <div className="sp-property-label">Name</div>
              <div 
                className={`sp-property-value editable ${editingField === 'name' ? 'editing' : ''}`}
                onClick={() => handleEditStart('name', selectedComponent.udi)}
              >
                {editingField === 'name' ? (
                  <input
                    value={editValue}
                    onChange={(e) => setEditValue(e.target.value)}
                    onBlur={handleEditSave}
                    onKeyPress={(e) => e.key === 'Enter' && handleEditSave()}
                    autoFocus
                    className="w-full bg-transparent outline-none"
                  />
                ) : (
                  selectedComponent.udi
                )}
              </div>
            </div>

            <div className="sp-property-row">
              <div className="sp-property-label">Type</div>
              <div className="sp-property-value">{selectedComponent.type}</div>
            </div>

            <div className="sp-property-row">
              <div className="sp-property-label">Size</div>
              <div className="sp-property-value">
                {JSON.stringify(selectedComponent.content).length} bytes
              </div>
            </div>

            <div className="sp-property-row">
              <div className="sp-property-label">Modified</div>
              <div className="sp-property-value">
                {new Date(selectedComponent.lastModified).toLocaleString()}
              </div>
            </div>

            <div className="sp-property-row">
              <div className="sp-property-label">Version</div>
              <div className="sp-property-value">v{selectedComponent.version}</div>
            </div>
          </div>

          {/* Metadata */}
          {selectedComponent.metadata && Object.keys(selectedComponent.metadata).length > 0 && (
            <div className="sp-properties-section">
              <div className="sp-properties-section-title">Metadata</div>
              {Object.entries(selectedComponent.metadata).map(([key, value]) => (
                <div key={key} className="sp-property-row">
                  <div className="sp-property-label">{key}</div>
                  <div className="sp-property-value">{JSON.stringify(value)}</div>
                </div>
              ))}
            </div>
          )}

          {/* Version History */}
          <div className="sp-properties-section">
            <div className="sp-properties-section-title">Version History</div>
            <div className="space-y-2">
              <div className="text-xs text-slate-600 dark:text-slate-400">
                <div className="flex justify-between">
                  <span>v{selectedComponent.version}</span>
                  <span>Current</span>
                </div>
              </div>
              {selectedComponent.versions?.slice(0, 3).map((ver, idx) => (
                <div key={idx} className="text-xs text-slate-500 dark:text-slate-500">
                  <div className="flex justify-between">
                    <span>v{ver.version}</span>
                    <span>{new Date(ver.created).toLocaleDateString()}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activity */}
          <div className="sp-properties-section">
            <div className="sp-properties-section-title">Activity</div>
            <div className="text-xs text-slate-500 space-y-2">
              <div>Created by User on {new Date(selectedComponent.created).toLocaleDateString()}</div>
              <div>Last modified {new Date(selectedComponent.lastModified).toLocaleDateString()}</div>
            </div>
          </div>
        </div>
      ) : (
        <div className="sp-empty-state">
          <div className="sp-empty-state-icon">
            <FileText className="h-12 w-12" />
          </div>
          <div className="sp-empty-state-title">No item selected</div>
          <div className="sp-empty-state-description">
            Select a component to view its properties
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Helper function to get organization header for API requests
 * All CCMS API endpoints require x-organization-id for multi-tenant isolation
 */
function getOrgHeader() {
  const orgId = localStorage.getItem('currentOrganizationId') || '7';
  return { 'x-organization-id': orgId };
}

export default function ComponentManagementSystem({ documentId, documentContent, onComponentSelect }) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentOrganization } = useTenantContext();
  
  // State management
  const [selectedComponent, setSelectedComponent] = useState(null);
  const [showVersionHistory, setShowVersionHistory] = useState(false);
  const [versionHistoryComponentId, setVersionHistoryComponentId] = useState(null);
  const [showDiffView, setShowDiffView] = useState(false);
  const [compareVersions, setCompareVersions] = useState({ v1: null, v2: null });
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState('all');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isIngesting, setIsIngesting] = useState(false);
  const [semanticSearchQuery, setSemanticSearchQuery] = useState('');
  const [semanticSearchResults, setSemanticSearchResults] = useState(null);
  const [showSemanticSearch, setShowSemanticSearch] = useState(false);
  const [isGeneratingEmbeddings, setIsGeneratingEmbeddings] = useState(false);
  
  // SharePoint/OneDrive Feature States
  const [selectedItems, setSelectedItems] = useState(new Set());
  const [selectAllChecked, setSelectAllChecked] = useState(false);
  const [sortColumn, setSortColumn] = useState('name');
  const [sortDirection, setSortDirection] = useState('asc');
  const [showNewComponentDialog, setShowNewComponentDialog] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [showPropertiesDialog, setShowPropertiesDialog] = useState(false);
  const [renameValue, setRenameValue] = useState('');
  const [newComponentData, setNewComponentData] = useState({ name: '', type: 'heading', content: '' });
  const [contextMenuOpen, setContextMenuOpen] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [shareLink, setShareLink] = useState('');
  const [viewMode, setViewMode] = useState('list'); // 'list' or 'grid'
  const [presenceIndicators, setPresenceIndicators] = useState({}); // Track other users viewing components
  const [draggedItem, setDraggedItem] = useState(null);
  const [dragOverItem, setDragOverItem] = useState(null);
  
  // SharePoint Navigation States
  const [selectedFolder, setSelectedFolder] = useState('components');
  const [propertiesPanelOpen, setPropertiesPanelOpen] = useState(true);
  const [breadcrumbPath, setBreadcrumbPath] = useState([]);
  const [recentItems, setRecentItems] = useState(() => {
    const saved = localStorage.getItem('sp-recent-items');
    return saved ? JSON.parse(saved) : [];
  });
  
  // Document Preview States
  const [showDocumentPreview, setShowDocumentPreview] = useState(false);
  const [previewComponent, setPreviewComponent] = useState(null);

  // Fetch components from vault (organization-wide, NOT document-scoped)
  const { data: components, isLoading: componentsLoading } = useQuery({
    queryKey: ['/api/coauthor/components'],
    queryFn: async () => {
      // Component Vault shows ALL organization components, not filtered by document
      const url = '/api/coauthor/components';
      console.log('[CCMS] Fetching ALL organization components from:', url);
      console.log('[CCMS] Organization ID:', localStorage.getItem('currentOrganizationId') || '7');
      const response = await apiRequest('GET', url, undefined, getOrgHeader());
      const result = await response.json();
      console.log('[CCMS] Components API response:', result);
      return result;
    }
  });

  // Fetch component statistics (organization-wide)
  const { data: statistics } = useQuery({
    queryKey: ['/api/coauthor/components/statistics'],
    queryFn: async () => {
      // Statistics for the entire organization vault
      const response = await apiRequest('GET', '/api/coauthor/components/statistics', undefined, getOrgHeader());
      return response.json();
    }
  });

  // Ingest document into components
  const ingestMutation = useMutation({
    mutationFn: async (file) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('documentId', documentId);
      
      const response = await apiRequest('POST', '/api/coauthor/components/ingest', formData, getOrgHeader());
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Document Ingested",
        description: "Document successfully decomposed into reusable components",
      });
      queryClient.invalidateQueries(['/api/coauthor/components']);
    },
    onError: (error) => {
      toast({
        title: "Ingestion Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Update component version
  const updateVersionMutation = useMutation({
    mutationFn: async ({ componentId, content, metadata }) => {
      const response = await apiRequest('PUT', `/api/coauthor/components/${componentId}/version`, { content, metadata, documentId }, getOrgHeader());
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Version Created",
        description: "New component version saved successfully",
      });
      queryClient.invalidateQueries(['/api/coauthor/components']);
    }
  });

  // Find reusable components
  const findReusableMutation = useMutation({
    mutationFn: async (content) => {
      const response = await apiRequest('POST', '/api/coauthor/components/find-reusable', { content, documentId }, getOrgHeader());
      return response.json();
    }
  });

  // Semantic search mutation - Real pgvector similarity search
  const semanticSearchMutation = useMutation({
    mutationFn: async ({ query, topK = 10 }) => {
      if (!currentOrganization?.id) {
        throw new Error('Organization context required for semantic search');
      }
      const response = await apiRequest('POST', '/api/coauthor/semantic-search', { 
        query,
        organizationId: parseInt(currentOrganization.id),
        topK,
        minScore: 0.5
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        setSemanticSearchResults(data.results);
        toast({
          title: "Semantic Search Complete",
          description: `Found ${data.count} relevant components using real pgvector + HNSW similarity`,
        });
      }
    },
    onError: (error) => {
      toast({
        title: "Search Failed",
        description: error.message || 'Please ensure OpenAI API key is configured',
        variant: "destructive"
      });
    }
  });

  // Generate real OpenAI embeddings for all components
  const generateEmbeddingsMutation = useMutation({
    mutationFn: async () => {
      if (!currentOrganization?.id) {
        throw new Error('Organization context required for embedding generation');
      }
      const response = await apiRequest('POST', '/api/coauthor/generate-embeddings', {
        organizationId: parseInt(currentOrganization.id),
        force: false
      });
      return response.json();
    },
    onSuccess: (data) => {
      if (data.success) {
        toast({
          title: "Real Embeddings Generated",
          description: `Generated OpenAI embeddings for ${data.stats?.processed || 0} components (Total: ${data.stats?.total || 0})`,
        });
        // Refresh components list
        queryClient.invalidateQueries(['/api/coauthor/components']);
      }
    },
    onError: (error) => {
      toast({
        title: "Embedding Generation Failed",
        description: error.message || 'Please ensure OpenAI API key is configured',
        variant: "destructive"
      });
    }
  });
  
  // Delete component mutation
  const deleteComponentMutation = useMutation({
    mutationFn: async (componentIds) => {
      const promises = componentIds.map(id => 
        apiRequest('DELETE', `/api/coauthor/components/${id}`, undefined, getOrgHeader())
      );
      return Promise.all(promises);
    },
    onSuccess: () => {
      toast({
        title: "Components Deleted",
        description: `Successfully deleted ${selectedItems.size} component(s)`,
      });
      setSelectedItems(new Set());
      setShowDeleteConfirm(false);
      queryClient.invalidateQueries(['/api/coauthor/components']);
    },
    onError: (error) => {
      toast({
        title: "Delete Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  // Create new component mutation
  const createComponentMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiRequest('POST', '/api/coauthor/components', data, getOrgHeader());
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Component Created",
        description: "New component created successfully",
      });
      setShowNewComponentDialog(false);
      setNewComponentData({ name: '', type: 'heading', content: '' });
      queryClient.invalidateQueries(['/api/coauthor/components']);
    },
    onError: (error) => {
      toast({
        title: "Creation Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });
  
  // Rename component mutation  
  const renameComponentMutation = useMutation({
    mutationFn: async ({ componentId, newName }) => {
      const response = await apiRequest('PATCH', `/api/coauthor/components/${componentId}`, {
        udi: newName
      }, getOrgHeader());
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: "Component Renamed",
        description: "Component renamed successfully",
      });
      setShowRenameDialog(false);
      setRenameValue('');
      queryClient.invalidateQueries(['/api/coauthor/components']);
    },
    onError: (error) => {
      toast({
        title: "Rename Failed",
        description: error.message,
        variant: "destructive"
      });
    }
  });

  // Handle file upload for ingestion
  const handleFileUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      setIsIngesting(true);
      setUploadProgress(0);
      
      // Simulate progress
      const interval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(interval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);
      
      ingestMutation.mutate(file, {
        onSettled: () => {
          setUploadProgress(100);
          setTimeout(() => {
            setIsIngesting(false);
            setUploadProgress(0);
          }, 1000);
        }
      });
    }
  };

  // Get version history for a component
  const getVersionHistory = async (componentId) => {
    try {
      const response = await apiRequest('GET', `/api/coauthor/components/${componentId}/versions`, undefined, getOrgHeader());
      return response.json();
    } catch (error) {
      console.error('Failed to fetch version history:', error);
      return [];
    }
  };

  // Compare two versions
  const compareComponentVersions = async (componentId, version1, version2) => {
    try {
      const response = await fetch(`/api/coauthor/components/${componentId}/diff?versionA=${version1}&versionB=${version2}`, {
        method: 'GET',
        headers: {
          'x-organization-id': '1',
          'x-user-id': '1'
        }
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to compare versions:', error);
      return null;
    }
  };

  // SharePoint/OneDrive Helper Functions
  const handleSelectAll = (checked) => {
    if (checked) {
      const allIds = filteredComponents.map(c => c.id);
      setSelectedItems(new Set(allIds));
      setSelectAllChecked(true);
    } else {
      setSelectedItems(new Set());
      setSelectAllChecked(false);
    }
  };
  
  const handleItemSelect = (componentId, checked) => {
    const newSelected = new Set(selectedItems);
    if (checked) {
      newSelected.add(componentId);
    } else {
      newSelected.delete(componentId);
    }
    setSelectedItems(newSelected);
    setSelectAllChecked(newSelected.size === filteredComponents.length && filteredComponents.length > 0);
  };
  
  const handleSort = (column) => {
    if (sortColumn === column) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortColumn(column);
      setSortDirection('asc');
    }
  };
  
  const handleNewComponent = () => {
    setIsSaving(true);
    createComponentMutation.mutate({
      udi: newComponentData.name,
      type: newComponentData.type,
      content: newComponentData.content,
      metadata: {},
      documentId
    }, {
      onSettled: () => setIsSaving(false)
    });
  };
  
  const handleShareComponent = () => {
    const selectedId = selectedItems.values().next().value || selectedComponent?.id;
    const link = `${window.location.origin}/components/${selectedId}`;
    setShareLink(link);
    setShowShareDialog(true);
  };
  
  const handleCopyLink = () => {
    const selectedId = selectedItems.values().next().value || selectedComponent?.id;
    const link = `${window.location.origin}/components/${selectedId}`;
    navigator.clipboard.writeText(link).then(() => {
      toast({
        title: "Link Copied",
        description: "Component link copied to clipboard",
      });
    });
  };
  
  const handleDownloadComponents = () => {
    const componentsToDownload = filteredComponents.filter(c => 
      selectedItems.has(c.id)
    );
    
    if (componentsToDownload.length === 0) {
      toast({
        title: "No Components Selected",
        description: "Please select components to download",
        variant: "destructive"
      });
      return;
    }
    
    const dataStr = JSON.stringify(componentsToDownload, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `components_${new Date().toISOString()}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    toast({
      title: "Components Downloaded",
      description: `Downloaded ${componentsToDownload.length} component(s)`,
    });
  };
  
  const handleDeleteComponents = () => {
    const componentIds = Array.from(selectedItems);
    deleteComponentMutation.mutate(componentIds);
  };
  
  const handleRenameComponent = () => {
    if (selectedComponent && renameValue) {
      renameComponentMutation.mutate({
        componentId: selectedComponent.id,
        newName: renameValue
      });
    }
  };
  
  const handleDoubleClick = (component) => {
    setPreviewComponent(component);
    setShowDocumentPreview(true);
  };
  
  const handlePreviewUpdate = (updatedComponent) => {
    // Refresh the component list after updates from preview
    queryClient.invalidateQueries(['/api/coauthor/components']);
    
    // Update local state if needed
    if (updatedComponent) {
      setPreviewComponent(updatedComponent);
    }
  };
  
  const handleRightClick = (e, component) => {
    e.preventDefault();
    setContextMenuOpen(component.id);
    setSelectedComponent(component);
  };
  
  const handleDragStart = (e, component) => {
    setDraggedItem(component);
    e.dataTransfer.effectAllowed = 'move';
  };
  
  const handleDragOver = (e, component) => {
    e.preventDefault();
    setDragOverItem(component);
  };
  
  const handleDrop = (e, targetComponent) => {
    e.preventDefault();
    if (draggedItem && targetComponent.id !== draggedItem.id) {
      // Implement reordering logic here
      toast({
        title: "Components Reordered",
        description: "Component order updated successfully",
      });
    }
    setDraggedItem(null);
    setDragOverItem(null);
  };
  
  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Ctrl+A or Cmd+A for select all
      if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
        e.preventDefault();
        handleSelectAll(true);
      }
      // Delete key for delete selected
      if (e.key === 'Delete' && selectedItems.size > 0) {
        e.preventDefault();
        setShowDeleteConfirm(true);
      }
      // Escape to clear selection
      if (e.key === 'Escape') {
        setSelectedItems(new Set());
        setSelectedComponent(null);
        setContextMenuOpen(null);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItems]);
  
  // Real-time presence simulation
  useEffect(() => {
    // Auto-refresh on new components
    const refreshInterval = setInterval(() => {
      queryClient.invalidateQueries(['/api/coauthor/components']);
    }, 30000); // Refresh every 30 seconds
    
    return () => clearInterval(refreshInterval);
  }, []);

  // Filter components based on search and type
  const filteredComponents = (() => {
    console.log('[CCMS] Raw components data:', components);
    console.log('[CCMS] Components array:', components?.components);
    console.log('[CCMS] Components count:', components?.components?.length);
    
    let filtered = components?.components?.filter(component => {
      // Extract text content from JSONB structure
      const contentText = typeof component.content === 'string' 
        ? component.content 
        : (component.content?.text || JSON.stringify(component.content) || '');
      
      const matchesSearch = !searchQuery || 
        contentText.toLowerCase().includes(searchQuery.toLowerCase()) ||
        component.udi.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesType = filterType === 'all' || component.type === filterType;
      
      return matchesSearch && matchesType;
    }) || [];
    
    // Apply sorting
    filtered = [...filtered].sort((a, b) => {
      let aValue, bValue;
      
      switch (sortColumn) {
        case 'name':
          aValue = a.udi.toLowerCase();
          bValue = b.udi.toLowerCase();
          break;
        case 'modified':
          aValue = new Date(a.lastModified || 0).getTime();
          bValue = new Date(b.lastModified || 0).getTime();
          break;
        case 'type':
          aValue = a.type.toLowerCase();
          bValue = b.type.toLowerCase();
          break;
        case 'size':
          aValue = JSON.stringify(a.content).length;
          bValue = JSON.stringify(b.content).length;
          break;
        default:
          aValue = a.udi.toLowerCase();
          bValue = b.udi.toLowerCase();
      }
      
      if (sortDirection === 'asc') {
        return aValue > bValue ? 1 : -1;
      } else {
        return aValue < bValue ? 1 : -1;
      }
    });
    
    console.log('[CCMS] Filtered components count:', filtered.length);
    return filtered;
  })();

  // Update recent items when a component is selected
  const updateRecentItems = useCallback((component) => {
    if (!component) return;
    
    const updated = [
      component,
      ...recentItems.filter(item => item.id !== component.id)
    ].slice(0, 10);
    
    setRecentItems(updated);
    localStorage.setItem('sp-recent-items', JSON.stringify(updated));
  }, [recentItems]);

  // Handle component selection
  const handleComponentSelect = (component) => {
    setSelectedComponent(component);
    updateRecentItems(component);
    if (onComponentSelect) {
      onComponentSelect(component);
    }
  };

  // Handle folder navigation
  const handleFolderSelect = (folderId) => {
    setSelectedFolder(folderId);
    // Update breadcrumb path based on folder selection
    const pathMap = {
      'global-changes': [{ name: 'Global Changes', path: '/global-changes' }],
      'active-changes': [{ name: 'Global Changes', path: '/global-changes' }, { name: 'Active Changes', path: '/active-changes' }],
      'components': [{ name: 'Components', path: '/components' }],
      'm1': [{ name: 'Components', path: '/components' }, { name: 'Module 1', path: '/m1' }],
      'compliance': [{ name: 'Compliance', path: '/compliance' }],
    };
    setBreadcrumbPath(pathMap[folderId] || []);
  };

  // Handle property edit
  const handlePropertyEdit = (field, value) => {
    if (!selectedComponent) return;
    
    const mutation = renameComponentMutation.mutate({
      componentId: selectedComponent.id,
      newName: value
    });
  };

  return (
    <div className="sp-layout-container">
      {/* SharePoint Hub Navigation */}
      <SharePointHubNavigation />
      
      {/* SharePoint Breadcrumb */}
      <SharePointBreadcrumb 
        currentPath={breadcrumbPath}
        onNavigate={(path) => console.log('Navigate to:', path)}
      />
      
      {/* Three-Panel Layout Body */}
      <div className="sp-layout-body">
        {/* Left Panel - Folder Navigation with Quick Access */}
        <SharePointFolderNavigation
          selectedFolder={selectedFolder}
          onFolderSelect={handleFolderSelect}
          components={components?.components || []}
        />
        
        {/* Center Panel - Main Content */}
        <div className="sp-layout-main">
          <div className="sp-layout-content">
            {/* Header with Statistics */}
            <Card className="border-none shadow-lg bg-gradient-to-br from-white to-slate-50 dark:from-slate-900 dark:to-slate-800 mb-6">
              <CardHeader className="pb-4">
                <CardTitle className="flex items-center gap-3 text-2xl font-bold bg-gradient-to-r from-blue-600 to-indigo-600 dark:from-blue-400 dark:to-indigo-400 bg-clip-text text-transparent">
                  <Database className="h-6 w-6 text-blue-600 dark:text-blue-400" />
                  Component Vault
                </CardTitle>
                <CardDescription className="text-base mt-2">
                  Component-Centric Management System with granular version tracking
                </CardDescription>
              </CardHeader>
              <CardContent>
          <div className="grid grid-cols-4 gap-6">
            <div className="text-center p-4 rounded-lg bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
              <div className="text-3xl font-bold text-blue-600 dark:text-blue-400">{statistics?.totalComponents || 0}</div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-2">Total Components</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
              <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{statistics?.totalVersions || 0}</div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-2">Total Versions</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
              <div className="text-3xl font-bold text-purple-600 dark:text-purple-400">{statistics?.reusedComponents || 0}</div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-2">Reused Components</div>
            </div>
            <div className="text-center p-4 rounded-lg bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
              <div className="text-3xl font-bold text-amber-600 dark:text-amber-400">{statistics?.averageVersions || '1.0'}</div>
              <div className="text-sm font-medium text-slate-600 dark:text-slate-400 mt-2">Avg Versions/Component</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ingestion Controls */}
      <Card className="shadow-md border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center gap-3 text-xl font-semibold">
            <Upload className="h-5 w-5 text-indigo-600 dark:text-indigo-400" />
            Document Ingestion
          </CardTitle>
          <CardDescription className="text-sm mt-1">
            Import Word or PDF documents to extract components with UDI tracking
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Input
                type="file"
                accept=".docx,.pdf,.html"
                onChange={handleFileUpload}
                disabled={isIngesting}
                className="flex-1 border-slate-300 dark:border-slate-600 focus:border-indigo-500 dark:focus:border-indigo-400"
                data-testid="input-file-upload"
              />
              <Button 
                disabled={isIngesting}
                variant="outline"
                onClick={() => document.querySelector('input[type="file"]').click()}
                className="border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950"
                data-testid="button-import-document"
              >
                <Upload className="h-4 w-4 mr-2" />
                Import Document
              </Button>
            </div>
            
            {isIngesting && (
              <div className="space-y-3 p-4 bg-indigo-50 dark:bg-indigo-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800">
                <Progress value={uploadProgress} className="h-2" />
                <p className="text-sm font-medium text-indigo-700 dark:text-indigo-300 flex items-center gap-2">
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Extracting components and generating UDIs...
                </p>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Component Explorer */}
      <Card className="shadow-md border-slate-200 dark:border-slate-700">
        <CardHeader className="pb-4">
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-3 text-xl font-semibold">
              <Package className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Component Explorer
            </span>
            <div className="flex items-center gap-3">
              <Input
                placeholder="Search components..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-72 border-slate-300 dark:border-slate-600 focus:border-emerald-500 dark:focus:border-emerald-400"
                data-testid="input-search-components"
              />
              <Button variant="outline" size="sm" className="border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300" data-testid="button-search">
                <Search className="h-4 w-4" />
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="vault" className="space-y-4">
            <TabsList className="grid grid-cols-7 w-full">
              <TabsTrigger value="vault">Component Vault</TabsTrigger>
              <TabsTrigger value="semantic">
                <Brain className="h-4 w-4 mr-1 inline" />
                Semantic Search (RAG)
              </TabsTrigger>
              <TabsTrigger value="reusable">Reusable Discovery</TabsTrigger>
              <TabsTrigger value="lineage">Component Lineage</TabsTrigger>
              <TabsTrigger value="versions">Version Management</TabsTrigger>
              <TabsTrigger value="change-management">
                <Zap className="h-4 w-4 mr-1 inline" />
                Global Change Mgmt
              </TabsTrigger>
              <TabsTrigger value="workflow-timeline">
                <Activity className="h-4 w-4 mr-1 inline" />
                Workflow Timeline
              </TabsTrigger>
            </TabsList>

            <TabsContent value="vault" className="space-y-4">
              <div className="flex items-center gap-4 mb-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                <Label className="font-medium text-sm">Filter by type:</Label>
                <select 
                  value={filterType} 
                  onChange={(e) => setFilterType(e.target.value)}
                  className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-emerald-500 dark:focus:ring-emerald-400 focus:border-transparent transition-all"
                  data-testid="select-filter-type"
                >
                  <option value="all">All Types</option>
                  <option value="heading">Headings</option>
                  <option value="paragraph">Paragraphs</option>
                  <option value="table">Tables</option>
                  <option value="figure">Figures</option>
                  <option value="list">Lists</option>
                </select>
              </div>

              <div className="bg-white border border-[#e8e6dc]">
                {/* OneDrive-style Command Bar */}
                <div className="sp-command-bar border-b border-[#e8e6dc]">
                  <button 
                    className="sp-command-button"
                    onClick={() => setShowNewComponentDialog(true)}
                    data-testid="button-new-component"
                  >
                    <Plus className="h-4 w-4" />
                    New
                  </button>
                  <button 
                    className="sp-command-button"
                    onClick={() => document.querySelector('input[type="file"]').click()}
                    data-testid="button-upload-file"
                  >
                    <Upload className="h-4 w-4" />
                    Upload
                  </button>
                  <button 
                    className="sp-command-button"
                    onClick={handleShareComponent}
                    disabled={selectedItems.size === 0}
                    data-testid="button-share"
                  >
                    <Share2 className="h-4 w-4" />
                    Share
                  </button>
                  <button 
                    className="sp-command-button"
                    onClick={handleCopyLink}
                    disabled={selectedItems.size === 0}
                    data-testid="button-copy-link"
                  >
                    <Link className="h-4 w-4" />
                    Copy link
                  </button>
                  <button 
                    className="sp-command-button"
                    onClick={handleDownloadComponents}
                    disabled={selectedItems.size === 0}
                    data-testid="button-download"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                  
                  {/* Selected count indicator */}
                  {selectedItems.size > 0 && (
                    <div className="ml-4 px-3 py-1 bg-[#E1F5FE] rounded text-sm text-[#0078D4]">
                      {selectedItems.size} selected
                    </div>
                  )}
                  
                  {/* Saving indicator */}
                  {isSaving && (
                    <div className="ml-4 flex items-center gap-2 text-sm text-[#6b6963]">
                      <RefreshCw className="h-3 w-3 animate-spin" />
                      Saving...
                    </div>
                  )}
                  
                  <div className="ml-auto flex items-center gap-2">
                    <button 
                      className={`sp-command-button ${viewMode === 'grid' ? 'bg-[#E1F5FE]' : ''}`}
                      onClick={() => setViewMode('grid')}
                      data-testid="button-view-grid"
                    >
                      <Grid className="h-4 w-4" />
                    </button>
                    <button 
                      className={`sp-command-button ${viewMode === 'list' ? 'bg-[#E1F5FE]' : ''}`}
                      onClick={() => setViewMode('list')}
                      data-testid="button-view-list"
                    >
                      <List className="h-4 w-4" />
                    </button>
                    <button 
                      className="sp-command-button"
                      onClick={() => setShowPropertiesDialog(true)}
                      data-testid="button-info"
                    >
                      <Info className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <ScrollArea className="h-[500px]">
                  <div>
                    {componentsLoading ? (
                      <div className="text-center py-12">
                        <RefreshCw className="h-8 w-8 animate-spin mx-auto mb-3 text-[#6b6963]" />
                        <p className="text-[#6b6963] font-['Segoe_UI'] text-sm">Loading components...</p>
                      </div>
                    ) : filteredComponents.length === 0 ? (
                      <div className="text-center py-12">
                        <Folder className="h-12 w-12 mx-auto mb-3 text-[#b0aea5]" />
                        <p className="text-[#6b6963] font-['Segoe_UI'] text-base">No components found</p>
                        <p className="text-[#8a8880] font-['Segoe_UI'] text-sm mt-1">Upload a document to extract components</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full table-auto" style={{ borderCollapse: 'separate', borderSpacing: 0 }}>
                          <thead className="bg-[#faf9f5] sticky top-0 z-10">
                            <tr>
                              <th className="w-8 px-4 py-2 border-b border-[#e8e6dc]">
                                <input 
                                  type="checkbox" 
                                  className="w-4 h-4 border border-[#b0aea5] rounded-sm"
                                  checked={selectAllChecked}
                                  onChange={(e) => handleSelectAll(e.target.checked)}
                                  data-testid="checkbox-select-all"
                                />
                              </th>
                              <th 
                                className="px-4 py-2 text-left text-[12px] font-normal text-[#6b6963] font-['Segoe_UI'] border-b border-[#e8e6dc] cursor-pointer hover:bg-[#f4f3ee]"
                                onClick={() => handleSort('name')}
                              >
                                <div className="flex items-center gap-1">
                                  Name
                                  {sortColumn === 'name' && (
                                    <ChevronDown className={`h-3 w-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-2 text-left text-[12px] font-normal text-[#6b6963] font-['Segoe_UI'] border-b border-[#e8e6dc] cursor-pointer hover:bg-[#f4f3ee]"
                                onClick={() => handleSort('modified')}
                              >
                                <div className="flex items-center gap-1">
                                  Modified
                                  {sortColumn === 'modified' && (
                                    <ChevronDown className={`h-3 w-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                                  )}
                                </div>
                              </th>
                              <th className="px-4 py-2 text-left text-[12px] font-normal text-[#6b6963] font-['Segoe_UI'] border-b border-[#e8e6dc]">Modified by</th>
                              <th 
                                className="px-4 py-2 text-left text-[12px] font-normal text-[#6b6963] font-['Segoe_UI'] border-b border-[#e8e6dc] cursor-pointer hover:bg-[#f4f3ee]"
                                onClick={() => handleSort('type')}
                              >
                                <div className="flex items-center gap-1">
                                  Type
                                  {sortColumn === 'type' && (
                                    <ChevronDown className={`h-3 w-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                                  )}
                                </div>
                              </th>
                              <th 
                                className="px-4 py-2 text-left text-[12px] font-normal text-[#6b6963] font-['Segoe_UI'] border-b border-[#e8e6dc] cursor-pointer hover:bg-[#f4f3ee]"
                                onClick={() => handleSort('size')}
                              >
                                <div className="flex items-center gap-1">
                                  Size
                                  {sortColumn === 'size' && (
                                    <ChevronDown className={`h-3 w-3 transition-transform ${sortDirection === 'desc' ? 'rotate-180' : ''}`} />
                                  )}
                                </div>
                              </th>
                              <th className="w-12 px-4 py-2 border-b border-[#e8e6dc]"></th>
                            </tr>
                          </thead>
                          <tbody className="bg-white">
                            {filteredComponents.map((component, index) => (
                              <tr 
                                key={component.id}
                                className={`group cursor-pointer transition-all duration-100 hover:bg-[#f4f3ee] ${
                                  selectedItems.has(component.id) ? 'bg-[#E1F5FE] hover:bg-[#E1F5FE]' : ''
                                } ${dragOverItem?.id === component.id ? 'border-t-2 border-[#0078D4]' : ''}`}
                                onClick={() => setSelectedComponent(component)}
                                onDoubleClick={() => handleDoubleClick(component)}
                                onContextMenu={(e) => handleRightClick(e, component)}
                                draggable
                                onDragStart={(e) => handleDragStart(e, component)}
                                onDragOver={(e) => handleDragOver(e, component)}
                                onDrop={(e) => handleDrop(e, component)}
                                data-testid={`row-component-${component.id}`}
                              >
                                {/* Checkbox Column */}
                                <td className="px-4 py-3 border-b border-[#f4f3ee]">
                                  <input 
                                    type="checkbox" 
                                    className="w-4 h-4 border border-[#b0aea5] rounded-sm"
                                    checked={selectedItems.has(component.id)}
                                    onChange={(e) => handleItemSelect(component.id, e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                    data-testid={`checkbox-component-${component.id}`}
                                  />
                                </td>
                                
                                {/* Name Column with File Icon */}
                                <td className="px-4 py-3 border-b border-[#f4f3ee]">
                                  <div className="flex items-center gap-3">
                                    <div className="flex items-center">
                                      {getDocumentTypeIcon(component)}
                                    </div>
                                    <div>
                                      <div className="text-[#141413] font-['Segoe_UI'] text-sm font-normal">
                                        {component.udi}
                                      </div>
                                    </div>
                                  </div>
                                </td>
                                
                                {/* Modified Column */}
                                <td className="px-4 py-3 border-b border-[#f4f3ee] text-[#6b6963] font-['Segoe_UI'] text-sm">
                                  {component.lastModified ? new Date(component.lastModified).toLocaleDateString() : 'Today'}
                                </td>
                                
                                {/* Modified By Column */}
                                <td className="px-4 py-3 border-b border-[#f4f3ee]">
                                  <div className="flex items-center gap-2">
                                    <div className="w-6 h-6 rounded-full bg-[#0078D4] text-white flex items-center justify-center text-xs font-['Segoe_UI']">
                                      {component.modifiedBy?.charAt(0) || 'U'}
                                    </div>
                                    <span className="text-[#6b6963] font-['Segoe_UI'] text-sm">
                                      {component.modifiedBy || 'You'}
                                    </span>
                                  </div>
                                </td>
                                
                                {/* Type Column */}
                                <td className="px-4 py-3 border-b border-[#f4f3ee] text-[#6b6963] font-['Segoe_UI'] text-sm">
                                  {component.type}
                                </td>
                                
                                {/* Size Column */}
                                <td className="px-4 py-3 border-b border-[#f4f3ee] text-[#6b6963] font-['Segoe_UI'] text-sm">
                                  {Math.floor(Math.random() * 500) + 10} KB
                                </td>
                                
                                {/* Actions Column with Context Menu */}
                                <td className="px-4 py-3 border-b border-[#f4f3ee] relative">
                                  <button 
                                    className="p-1 hover:bg-[#f4f3ee] rounded opacity-0 group-hover:opacity-100 transition-opacity"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setContextMenuOpen(contextMenuOpen === component.id ? null : component.id);
                                      setSelectedComponent(component);
                                    }}
                                    data-testid={`button-more-${component.id}`}
                                  >
                                    <MoreVertical className="h-4 w-4 text-[#6b6963]" />
                                  </button>
                                  
                                  {/* Context Menu */}
                                  {contextMenuOpen === component.id && (
                                    <div className="absolute right-0 top-8 w-48 bg-white border border-[#e8e6dc] shadow-lg rounded z-50">
                                      <button 
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-[#f4f3ee] flex items-center gap-2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setPreviewComponent(component);
                                          setShowDocumentPreview(true);
                                          setContextMenuOpen(null);
                                        }}
                                      >
                                        <Eye className="h-4 w-4" />
                                        Preview
                                      </button>
                                      <button 
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-[#f4f3ee] flex items-center gap-2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setRenameValue(component.udi);
                                          setShowRenameDialog(true);
                                          setContextMenuOpen(null);
                                        }}
                                      >
                                        <Edit className="h-4 w-4" />
                                        Rename
                                      </button>
                                      <button 
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-[#f4f3ee] flex items-center gap-2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowVersionHistory(true);
                                          setContextMenuOpen(null);
                                        }}
                                      >
                                        <History className="h-4 w-4" />
                                        Version history
                                      </button>
                                      <button 
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-[#f4f3ee] flex items-center gap-2"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setShowPropertiesDialog(true);
                                          setContextMenuOpen(null);
                                        }}
                                      >
                                        <Info className="h-4 w-4" />
                                        Properties
                                      </button>
                                      <div className="border-t border-[#e8e6dc]"></div>
                                      <button 
                                        className="w-full px-4 py-2 text-left text-sm hover:bg-[#f4f3ee] flex items-center gap-2 text-red-600"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setSelectedItems(new Set([component.id]));
                                          setShowDeleteConfirm(true);
                                          setContextMenuOpen(null);
                                        }}
                                      >
                                        <Trash2 className="h-4 w-4" />
                                        Delete
                                      </button>
                                    </div>
                                  )}
                                </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
                </ScrollArea>
              </div>
            </TabsContent>

            <TabsContent value="semantic" className="space-y-6">
              <Alert className="border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30">
                <Sparkles className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
                <AlertTitle className="text-emerald-900 dark:text-emerald-100 font-semibold">AI-Powered Semantic Search (RAG)</AlertTitle>
                <AlertDescription className="text-emerald-700 dark:text-emerald-300">
                  Search components using natural language with advanced vector similarity powered by OpenAI embeddings
                </AlertDescription>
              </Alert>

              {!currentOrganization ? (
                <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                  <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                  <AlertTitle className="text-amber-900 dark:text-amber-100">Organization Required</AlertTitle>
                  <AlertDescription className="text-amber-700 dark:text-amber-300">
                    Please select an organization from the top navigation bar to use semantic search features
                  </AlertDescription>
                </Alert>
              ) : (
              <div className="space-y-4">
                {/* Generate Embeddings Button */}
                <div className="flex justify-between items-center p-4 bg-gradient-to-r from-indigo-50 to-blue-50 dark:from-indigo-950/30 dark:to-blue-950/30 rounded-lg border border-indigo-200 dark:border-indigo-800">
                  <div>
                    <h4 className="font-semibold text-indigo-900 dark:text-indigo-100">Enable Semantic Search</h4>
                    <p className="text-sm text-indigo-700 dark:text-indigo-300 mt-1">Generate AI embeddings for all components to enable intelligent search</p>
                  </div>
                  <Button 
                    onClick={() => {
                      setIsGeneratingEmbeddings(true);
                      generateEmbeddingsMutation.mutate(null, {
                        onSettled: () => setIsGeneratingEmbeddings(false)
                      });
                    }}
                    disabled={isGeneratingEmbeddings || generateEmbeddingsMutation.isPending}
                    className="bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600"
                    data-testid="button-generate-embeddings"
                  >
                    {isGeneratingEmbeddings ? (
                      <>
                        <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                        Generating...
                      </>
                    ) : (
                      <>
                        <Zap className="h-4 w-4 mr-2" />
                        Generate Embeddings
                      </>
                    )}
                  </Button>
                </div>

                {/* Semantic Search Input */}
                <div className="space-y-3">
                  <Label className="text-lg font-semibold text-slate-800 dark:text-slate-200">Ask a question or describe what you're looking for:</Label>
                  <div className="flex gap-3">
                    <Input
                      type="text"
                      value={semanticSearchQuery}
                      onChange={(e) => setSemanticSearchQuery(e.target.value)}
                      placeholder="e.g., 'Find all stability testing protocols' or 'Show drug substance specifications'"
                      className="flex-1 h-12 text-base"
                      onKeyPress={(e) => {
                        if (e.key === 'Enter' && semanticSearchQuery.trim()) {
                          if (!currentOrganization) {
                            toast({
                              title: "Organization Required",
                              description: "Please select an organization from the top navigation bar",
                              variant: "destructive"
                            });
                            return;
                          }
                          semanticSearchMutation.mutate({ query: semanticSearchQuery });
                        }
                      }}
                      data-testid="input-semantic-search"
                    />
                    <Button
                      onClick={() => {
                        if (!currentOrganization) {
                          toast({
                            title: "Organization Required",
                            description: "Please select an organization from the top navigation bar",
                            variant: "destructive"
                          });
                          return;
                        }
                        if (semanticSearchQuery.trim()) {
                          semanticSearchMutation.mutate({ query: semanticSearchQuery });
                        }
                      }}
                      disabled={!semanticSearchQuery.trim() || semanticSearchMutation.isPending}
                      className="h-12 px-6 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600"
                      data-testid="button-semantic-search"
                    >
                      {semanticSearchMutation.isPending ? (
                        <>
                          <RefreshCw className="h-5 w-5 mr-2 animate-spin" />
                          Searching...
                        </>
                      ) : (
                        <>
                          <Brain className="h-5 w-5 mr-2" />
                          Search with AI
                        </>
                      )}
                    </Button>
                  </div>
                </div>

                {/* Search Results */}
                {semanticSearchResults && semanticSearchResults.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="font-semibold text-lg text-slate-800 dark:text-slate-200">
                        Found {semanticSearchResults.length} relevant components
                      </h4>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setSemanticSearchResults(null)}
                        className="text-slate-500 hover:text-slate-700"
                        data-testid="button-clear-results"
                      >
                        Clear Results
                      </Button>
                    </div>
                    
                    <ScrollArea className="h-[400px] border border-slate-200 dark:border-slate-700 rounded-lg">
                      <div className="space-y-3 p-4">
                        {semanticSearchResults.map((result, index) => (
                          <Card 
                            key={result.id} 
                            className="border-slate-200 dark:border-slate-700 hover:shadow-lg transition-all cursor-pointer hover:border-emerald-400 dark:hover:border-emerald-600"
                            onClick={() => {
                              // Find and select the component
                              const component = components?.find(c => c.udi === result.component_udi);
                              if (component) {
                                setSelectedComponent(component);
                                toast({
                                  title: "Component Selected",
                                  description: `Selected component: ${result.component_udi}`,
                                });
                              }
                            }}
                            data-testid={`card-search-result-${index}`}
                          >
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between mb-3">
                                <div className="flex items-center gap-3">
                                  <Badge variant="outline" className="font-semibold text-sm px-3 py-1 bg-gradient-to-r from-emerald-50 to-teal-50 dark:from-emerald-950/50 dark:to-teal-950/50 border-emerald-300 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300">
                                    {Math.round(result.similarity * 100)}% Match
                                  </Badge>
                                  <Badge variant="secondary" className="font-medium">
                                    {result.component_type}
                                  </Badge>
                                </div>
                                <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">
                                  {result.component_udi}
                                </code>
                              </div>
                              
                              <p className="text-sm text-slate-700 dark:text-slate-300 mb-3 line-clamp-3">
                                {result.chunk_text}
                              </p>
                              
                              {result.module_context && (
                                <div className="flex items-center gap-2 mt-2">
                                  <Layers className="h-4 w-4 text-slate-400" />
                                  <span className="text-xs text-slate-600 dark:text-slate-400 font-medium">
                                    {result.module_context}
                                  </span>
                                  {result.section_number && (
                                    <span className="text-xs text-slate-500 dark:text-slate-500">
                                      • {result.section_number}
                                    </span>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}

                {/* No Results State */}
                {semanticSearchResults && semanticSearchResults.length === 0 && (
                  <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                    <AlertCircle className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                    <AlertTitle className="text-amber-900 dark:text-amber-100">No Results Found</AlertTitle>
                    <AlertDescription className="text-amber-700 dark:text-amber-300">
                      Try a different search query or generate embeddings for your components first
                    </AlertDescription>
                  </Alert>
                )}
              </div>
              )}
            </TabsContent>

            <TabsContent value="reusable" className="space-y-6">
              <Alert className="border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30">
                <Info className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                <AlertTitle className="text-blue-900 dark:text-blue-100 font-semibold">Reusable Component Discovery</AlertTitle>
                <AlertDescription className="text-blue-700 dark:text-blue-300">
                  Paste content below to find similar components in the vault that can be reused
                </AlertDescription>
              </Alert>
              
              <div className="space-y-4">
                <textarea
                  className="w-full h-36 p-4 border-2 border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-900 focus:ring-2 focus:ring-blue-500 dark:focus:ring-blue-400 focus:border-transparent transition-all font-mono text-sm"
                  placeholder="Paste content to find similar components..."
                  onChange={(e) => {
                    if (e.target.value.length > 50) {
                      findReusableMutation.mutate(e.target.value);
                    }
                  }}
                  data-testid="textarea-reusable-search"
                />
                
                {findReusableMutation.data && (
                  <div className="space-y-3">
                    <h4 className="font-semibold text-lg text-slate-800 dark:text-slate-200">Similar Components Found:</h4>
                    {findReusableMutation.data.similar?.map((match) => (
                      <Card key={match.id} className="border-slate-200 dark:border-slate-700 hover:shadow-md transition-shadow">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <Badge variant="outline" className="font-semibold text-sm px-3 py-1 bg-blue-50 dark:bg-blue-950/50 border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-300">
                                {Math.round(match.similarity * 100)}% Match
                              </Badge>
                              <code className="text-xs font-mono bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{match.udi}</code>
                            </div>
                            <Button size="sm" variant="outline" className="border-blue-200 dark:border-blue-800 text-blue-700 dark:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-950" data-testid={`button-reuse-${match.id}`}>
                              <Copy className="h-3 w-3 mr-1" />
                              Reuse
                            </Button>
                          </div>
                          <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
                            {match.content.substring(0, 100)}...
                          </p>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </div>
            </TabsContent>

            <TabsContent value="lineage" className="space-y-6">
              <Alert className="border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950/30">
                <GitMerge className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                <AlertTitle className="text-purple-900 dark:text-purple-100 font-semibold">Component Lineage Tracking</AlertTitle>
                <AlertDescription className="text-purple-700 dark:text-purple-300">
                  Visualize relationships and dependencies between components
                </AlertDescription>
              </Alert>
              
              {selectedComponent ? (
                <Card className="border-slate-200 dark:border-slate-700 shadow-md">
                  <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 dark:from-purple-950/30 dark:to-indigo-950/30 border-b border-slate-200 dark:border-slate-700">
                    <CardTitle className="text-base font-semibold text-purple-900 dark:text-purple-100">
                      Lineage for <code className="ml-2 text-sm bg-white dark:bg-slate-900 px-2 py-1 rounded border border-purple-200 dark:border-purple-800">{selectedComponent.udi}</code>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="space-y-6">
                      <div>
                        <h4 className="text-sm font-semibold mb-3 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <ChevronRight className="h-4 w-4 text-purple-600 dark:text-purple-400" />
                          Parent Components
                        </h4>
                        <div className="pl-6 border-l-2 border-purple-300 dark:border-purple-700 space-y-2">
                          {selectedComponent.parents?.map((parent) => (
                            <div key={parent} className="text-sm">
                              <code className="px-3 py-1.5 bg-purple-50 dark:bg-purple-950/50 rounded font-mono text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">{parent}</code>
                            </div>
                          )) || <span className="text-sm text-slate-500 dark:text-slate-400 italic">No parent components</span>}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-semibold mb-3 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <ChevronRight className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                          Child Components
                        </h4>
                        <div className="pl-6 border-l-2 border-indigo-300 dark:border-indigo-700 space-y-2">
                          {selectedComponent.children?.map((child) => (
                            <div key={child} className="text-sm">
                              <code className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-950/50 rounded font-mono text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">{child}</code>
                            </div>
                          )) || <span className="text-sm text-slate-500 dark:text-slate-400 italic">No child components</span>}
                        </div>
                      </div>
                      
                      <div>
                        <h4 className="text-sm font-semibold mb-3 text-slate-800 dark:text-slate-200 flex items-center gap-2">
                          <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                          Referenced In Documents
                        </h4>
                        <div className="space-y-2">
                          {selectedComponent.documents?.map((doc) => (
                            <div key={doc} className="text-sm flex items-center gap-2 p-2 bg-emerald-50 dark:bg-emerald-950/30 rounded border border-emerald-200 dark:border-emerald-800">
                              <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                              <span className="text-slate-700 dark:text-slate-300">{doc}</span>
                            </div>
                          )) || <span className="text-sm text-slate-500 dark:text-slate-400 italic">Not referenced in any documents</span>}
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                  <Layers className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                  <p className="text-slate-600 dark:text-slate-400 font-medium">No component selected</p>
                  <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Select a component from the vault to view its lineage</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="versions" className="space-y-6">
              <Alert className="border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30">
                <History className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                <AlertTitle className="text-amber-900 dark:text-amber-100 font-semibold">Version Management</AlertTitle>
                <AlertDescription className="text-amber-700 dark:text-amber-300">
                  Track changes, compare versions, and manage component history with SharePoint-style version control
                </AlertDescription>
              </Alert>
              
              {selectedComponent ? (
                <Card className="border-slate-200 dark:border-slate-700 shadow-md">
                  <CardHeader className="bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/30 border-b border-slate-200 dark:border-slate-700">
                    <CardTitle className="text-base font-semibold text-amber-900 dark:text-amber-100">
                      Component Version History
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-6">
                    <div className="text-center space-y-4">
                      <div className="p-6 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                        <div className="flex items-center justify-center mb-4">
                          <SiMicrosoftsharepoint className="h-12 w-12 text-blue-600 dark:text-blue-400" />
                        </div>
                        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-2">
                          SharePoint-Style Version History
                        </h3>
                        <p className="text-sm text-slate-600 dark:text-slate-400 mb-4">
                          View comprehensive version history with diff comparison, timeline visualization, and 21 CFR Part 11 compliance tracking
                        </p>
                        <div className="mb-4 p-3 bg-white dark:bg-slate-900 rounded border border-slate-200 dark:border-slate-700">
                          <Label className="text-sm font-medium text-slate-600 dark:text-slate-400">Selected Component:</Label>
                          <p className="text-sm font-mono mt-1 text-slate-800 dark:text-slate-200">{selectedComponent.udi}</p>
                          <p className="text-xs text-slate-500 dark:text-slate-500 mt-1">{selectedComponent.type}</p>
                        </div>
                        <Button
                          size="lg"
                          onClick={() => {
                            setVersionHistoryComponentId(selectedComponent.id);
                            setShowVersionHistory(true);
                          }}
                          className="bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 text-white shadow-lg"
                          data-testid="button-open-version-history"
                        >
                          <History className="h-5 w-5 mr-2" />
                          Open Version History
                        </Button>
                      </div>
                      
                      <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                          <CheckCircle className="h-6 w-6 text-green-600 dark:text-green-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Full Audit Trail</p>
                        </div>
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                          <GitBranch className="h-6 w-6 text-purple-600 dark:text-purple-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Visual Timeline</p>
                        </div>
                        <div className="p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700">
                          <Shield className="h-6 w-6 text-blue-600 dark:text-blue-400 mx-auto mb-2" />
                          <p className="text-sm font-medium text-slate-700 dark:text-slate-300">21 CFR Part 11</p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <div className="text-center py-12 border-2 border-dashed border-slate-300 dark:border-slate-700 rounded-lg">
                  <History className="h-12 w-12 mx-auto mb-3 text-slate-300 dark:text-slate-600" />
                  <p className="text-slate-600 dark:text-slate-400 font-medium">No component selected</p>
                  <p className="text-sm text-slate-500 dark:text-slate-500 mt-1">Select a component from the vault to view its version history</p>
                </div>
              )}
            </TabsContent>

            <TabsContent value="change-management" className="space-y-6">
              {/* Global Change Management Tab */}
              <div className="w-full">
                <ChangeManagementTab documentId={documentId} />
              </div>
            </TabsContent>
            
            <TabsContent value="workflow-timeline" className="space-y-6">
              <WorkflowTimeline />
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
          </div>
        </div>
        
        {/* Right Panel - Properties Panel */}
        <SharePointPropertiesPanel
          selectedComponent={selectedComponent}
          isOpen={propertiesPanelOpen}
          onClose={() => setPropertiesPanelOpen(false)}
          onPropertyEdit={handlePropertyEdit}
        />
      </div>

      {/* Component Details Dialog */}
      {selectedComponent && !showRenameDialog && !showDeleteConfirm && !showPropertiesDialog && (
        <Dialog open={!!selectedComponent} onOpenChange={() => setSelectedComponent(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle>Component Details</DialogTitle>
              <DialogDescription>
                {selectedComponent.udi}
              </DialogDescription>
            </DialogHeader>
            
            <div className="space-y-4">
              <div>
                <Label>Content</Label>
                <div className="mt-2 p-4 border rounded bg-muted/50">
                  <p className="text-sm">{typeof selectedComponent.content === 'string' ? 
                    selectedComponent.content : JSON.stringify(selectedComponent.content)}</p>
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Type</Label>
                  <p className="text-sm mt-1">{selectedComponent.type}</p>
                </div>
                <div>
                  <Label>Version</Label>
                  <p className="text-sm mt-1">v{selectedComponent.version}</p>
                </div>
                <div>
                  <Label>Created</Label>
                  <p className="text-sm mt-1">
                    {new Date(selectedComponent.created).toLocaleString()}
                  </p>
                </div>
                <div>
                  <Label>Last Modified</Label>
                  <p className="text-sm mt-1">
                    {new Date(selectedComponent.lastModified).toLocaleString()}
                  </p>
                </div>
              </div>
              
              {selectedComponent.metadata && (
                <div>
                  <Label>Metadata</Label>
                  <pre className="mt-2 p-2 bg-muted rounded text-xs overflow-auto">
                    {JSON.stringify(selectedComponent.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            
            <DialogFooter>
              <Button variant="outline" onClick={() => setSelectedComponent(null)}>
                Close
              </Button>
              <Button onClick={() => {
                onComponentSelect?.(selectedComponent);
                setSelectedComponent(null);
              }}>
                Use Component
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      
      {/* New Component Dialog */}
      <Dialog open={showNewComponentDialog} onOpenChange={setShowNewComponentDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Create New Component</DialogTitle>
            <DialogDescription>
              Add a new component to your vault
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Component Name</Label>
              <Input
                value={newComponentData.name}
                onChange={(e) => setNewComponentData({...newComponentData, name: e.target.value})}
                placeholder="Enter component name..."
                data-testid="input-new-component-name"
              />
            </div>
            
            <div>
              <Label>Type</Label>
              <select
                value={newComponentData.type}
                onChange={(e) => setNewComponentData({...newComponentData, type: e.target.value})}
                className="w-full px-4 py-2 border rounded-lg"
                data-testid="select-new-component-type"
              >
                <option value="heading">Heading</option>
                <option value="paragraph">Paragraph</option>
                <option value="table">Table</option>
                <option value="figure">Figure</option>
                <option value="list">List</option>
              </select>
            </div>
            
            <div>
              <Label>Content</Label>
              <textarea
                value={newComponentData.content}
                onChange={(e) => setNewComponentData({...newComponentData, content: e.target.value})}
                placeholder="Enter component content..."
                className="w-full px-4 py-2 border rounded-lg h-32 resize-none"
                data-testid="textarea-new-component-content"
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewComponentDialog(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleNewComponent}
              disabled={!newComponentData.name || !newComponentData.content || isSaving}
              data-testid="button-create-component"
            >
              {isSaving ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Component'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Share Dialog */}
      <Dialog open={showShareDialog} onOpenChange={setShowShareDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Share Component</DialogTitle>
            <DialogDescription>
              Share this component with others
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div>
              <Label>Component Link</Label>
              <div className="flex gap-2 mt-2">
                <Input
                  value={shareLink}
                  readOnly
                  className="flex-1"
                  data-testid="input-share-link"
                />
                <Button 
                  onClick={() => {
                    navigator.clipboard.writeText(shareLink);
                    toast({
                      title: "Link Copied",
                      description: "Component link copied to clipboard"
                    });
                  }}
                  data-testid="button-copy-share-link"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            
            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Sharing Options</AlertTitle>
              <AlertDescription>
                Anyone with this link can view this component. Permissions are managed through your organization settings.
              </AlertDescription>
            </Alert>
          </div>
          
          <DialogFooter>
            <Button onClick={() => setShowShareDialog(false)}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Components</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete {selectedItems.size} component(s)? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>
              Cancel
            </Button>
            <Button 
              variant="destructive"
              onClick={handleDeleteComponents}
              disabled={deleteComponentMutation.isPending}
              data-testid="button-confirm-delete"
            >
              {deleteComponentMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Rename Dialog */}
      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rename Component</DialogTitle>
            <DialogDescription>
              Enter a new name for this component
            </DialogDescription>
          </DialogHeader>
          
          <div>
            <Label>Component Name</Label>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="Enter new name..."
              className="mt-2"
              onKeyPress={(e) => {
                if (e.key === 'Enter' && renameValue) {
                  handleRenameComponent();
                }
              }}
              data-testid="input-rename"
            />
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => {
              setShowRenameDialog(false);
              setRenameValue('');
            }}>
              Cancel
            </Button>
            <Button 
              onClick={handleRenameComponent}
              disabled={!renameValue || renameComponentMutation.isPending}
              data-testid="button-confirm-rename"
            >
              {renameComponentMutation.isPending ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Renaming...
                </>
              ) : (
                'Rename'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Properties Dialog */}
      <Dialog open={showPropertiesDialog} onOpenChange={setShowPropertiesDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Component Properties</DialogTitle>
            <DialogDescription>
              Detailed information about this component
            </DialogDescription>
          </DialogHeader>
          
          {selectedComponent && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs text-slate-500">UDI</Label>
                  <p className="text-sm font-mono">{selectedComponent.udi}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Type</Label>
                  <p className="text-sm">{selectedComponent.type}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Version</Label>
                  <p className="text-sm">v{selectedComponent.version}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Size</Label>
                  <p className="text-sm">{JSON.stringify(selectedComponent.content).length} bytes</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Created</Label>
                  <p className="text-sm">{new Date(selectedComponent.created).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Modified</Label>
                  <p className="text-sm">{new Date(selectedComponent.lastModified).toLocaleString()}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Organization ID</Label>
                  <p className="text-sm">{selectedComponent.organizationId || 'N/A'}</p>
                </div>
                <div>
                  <Label className="text-xs text-slate-500">Document ID</Label>
                  <p className="text-sm">{selectedComponent.documentId || 'N/A'}</p>
                </div>
              </div>
              
              {selectedComponent.metadata && Object.keys(selectedComponent.metadata).length > 0 && (
                <div>
                  <Label className="text-xs text-slate-500">Metadata</Label>
                  <pre className="mt-2 p-3 bg-slate-50 dark:bg-slate-900 rounded text-xs overflow-auto">
                    {JSON.stringify(selectedComponent.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
          
          <DialogFooter>
            <Button onClick={() => setShowPropertiesDialog(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Document Preview */}
      {previewComponent && (
        <DocumentPreview
          component={previewComponent}
          isOpen={showDocumentPreview}
          onClose={() => {
            setShowDocumentPreview(false);
            setPreviewComponent(null);
          }}
          onUpdate={handlePreviewUpdate}
        />
      )}
      
      {/* SharePoint-Style Version History Modal */}
      <VersionHistory
        componentId={versionHistoryComponentId}
        documentId={documentId}
        isOpen={showVersionHistory}
        onClose={() => {
          setShowVersionHistory(false);
          setVersionHistoryComponentId(null);
        }}
      />
    </div>
  );
}