/**
 * SharePoint-Style Document Preview Component
 * Provides inline editing, version tracking, and comprehensive document management
 * Part of the eCTD Co-Author Global Change Management System
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';

// These will be loaded dynamically when the component is used
let ReactQuill = null;
let Quill = null;
let diff_match_patch = null;

// Load optional dependencies from CDN
const loadOptionalDependencies = async () => {
  try {
    // Load Quill from CDN
    if (!window.Quill) {
      const quillScript = document.createElement('script');
      quillScript.src = 'https://cdn.quilljs.com/1.3.7/quill.min.js';
      
      const quillCSS = document.createElement('link');
      quillCSS.rel = 'stylesheet';
      quillCSS.href = 'https://cdn.quilljs.com/1.3.7/quill.snow.css';
      
      document.head.appendChild(quillCSS);
      
      await new Promise((resolve, reject) => {
        quillScript.onload = resolve;
        quillScript.onerror = reject;
        document.head.appendChild(quillScript);
      });
    }
    
    // Create a wrapper for CDN Quill to work with React
    if (window.Quill && !ReactQuill) {
      Quill = window.Quill;
      // Simple wrapper component for Quill
      ReactQuill = React.forwardRef(({ value, onChange, modules, theme, className }, ref) => {
        const editorRef = useRef(null);
        const quillRef = useRef(null);
        
        useEffect(() => {
          if (editorRef.current && !quillRef.current) {
            quillRef.current = new Quill(editorRef.current, {
              modules: modules || {},
              theme: theme || 'snow',
              placeholder: 'Start writing...'
            });
            
            quillRef.current.on('text-change', () => {
              if (onChange) {
                onChange(quillRef.current.root.innerHTML);
              }
            });
          }
          
          if (quillRef.current && value !== quillRef.current.root.innerHTML) {
            quillRef.current.root.innerHTML = value || '';
          }
        }, [value, onChange, modules, theme]);
        
        return <div ref={editorRef} className={className} />;
      });
    }
  } catch (err) {
    console.warn('Quill not available, using fallback editor');
  }
  
  // Load diff-match-patch from CDN
  try {
    if (!window.diff_match_patch) {
      const dmpScript = document.createElement('script');
      dmpScript.src = 'https://cdnjs.cloudflare.com/ajax/libs/diff-match-patch/1.0.5/diff_match_patch.min.js';
      
      await new Promise((resolve, reject) => {
        dmpScript.onload = resolve;
        dmpScript.onerror = reject;
        document.head.appendChild(dmpScript);
      });
    }
    
    if (window.diff_match_patch) {
      diff_match_patch = window.diff_match_patch;
    }
  } catch (err) {
    console.warn('diff-match-patch not available, version comparison disabled');
  }
};
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
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger, SheetFooter } from '@/components/ui/sheet';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { apiRequest, queryClient } from '@/lib/queryClient';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useTenantContext } from '@/contexts/TenantContext';
import {
  X,
  Edit,
  Download,
  Share2,
  History,
  Trash2,
  MoreVertical,
  Save,
  XCircle,
  FileText,
  Clock,
  User,
  Tag,
  Hash,
  GitBranch,
  CheckCircle,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronRight,
  MessageSquare,
  ThumbsUp,
  Reply,
  Send,
  AtSign,
  Bold,
  Italic,
  Underline,
  List,
  ListOrdered,
  Quote,
  Link,
  Table,
  Undo,
  Redo,
  Type,
  Palette,
  Image,
  Code,
  FileIcon,
  Shield,
  ShieldAlert,
  ShieldCheck,
  RefreshCw,
  Eye,
  Users,
  Lock,
  Unlock,
  Activity,
  // CheckCircle2 and XCircle2 don't exist in lucide-react, removed
  AlertTriangle,
  Plus,
  Minus,
  Copy,
  Maximize2,
  Minimize2,
  ExternalLink,
  Settings,
  HelpCircle,
  Star,
  Pin,
  Bell,
  Calendar,
  Briefcase,
  Database,
  Filter,
  Search,
  Presentation
} from 'lucide-react';

// Quill toolbar configuration matching SharePoint
const quillModules = {
  toolbar: {
    container: [
      [{ 'header': [1, 2, 3, 4, 5, 6, false] }],
      [{ 'font': [] }],
      [{ 'size': ['small', false, 'large', 'huge'] }],
      
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'color': [] }, { 'background': [] }],
      
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'indent': '-1'}, { 'indent': '+1' }],
      [{ 'align': [] }],
      
      ['blockquote', 'code-block'],
      ['link', 'image', 'video'],
      ['clean']
    ],
    handlers: {
      // Custom handlers can be added here
    }
  },
  history: {
    delay: 2000,
    maxStack: 500,
    userOnly: true
  }
};

// Get document type icon based on file extension or component type
function getDocumentTypeIcon(component) {
  const type = component?.type?.toLowerCase() || '';
  const fileName = component?.metadata?.fileName?.toLowerCase() || '';
  
  if (type.includes('word') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
    return <FileText className="h-8 w-8 text-blue-600 dark:text-blue-400" />;
  }
  if (type.includes('excel') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
    return <Table className="h-8 w-8 text-green-600 dark:text-green-400" />;
  }
  if (type.includes('powerpoint') || fileName.endsWith('.pptx') || fileName.endsWith('.ppt')) {
    return <Presentation className="h-8 w-8 text-orange-600 dark:text-orange-400" />;
  }
  if (type.includes('pdf') || fileName.endsWith('.pdf')) {
    return <FileText className="h-8 w-8 text-red-600 dark:text-red-400" />;
  }
  return <FileIcon className="h-8 w-8 text-slate-600 dark:text-slate-400" />;
}

/**
 * Main Document Preview Component
 */
export function DocumentPreview({ component, isOpen, onClose, onUpdate }) {
  const { toast } = useToast();
  const { currentUser, currentOrganization } = useTenantContext();
  const [isEditing, setIsEditing] = useState(false);
  const [editedContent, setEditedContent] = useState('');
  const [documentName, setDocumentName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const [selectedTab, setSelectedTab] = useState('content');
  const [isPropertiesOpen, setIsPropertiesOpen] = useState(true);
  const [isActivityOpen, setIsActivityOpen] = useState(true);
  const [isComplianceOpen, setIsComplianceOpen] = useState(false);
  const [comment, setComment] = useState('');
  const [compareVersion, setCompareVersion] = useState(null);
  const [showVersionComparison, setShowVersionComparison] = useState(false);
  const [autoSaveStatus, setAutoSaveStatus] = useState('saved');
  const [viewingUsers, setViewingUsers] = useState([]);
  const [isLocked, setIsLocked] = useState(false);
  const [lockedBy, setLockedBy] = useState(null);
  const [dependenciesLoaded, setDependenciesLoaded] = useState(false);
  const editorRef = useRef(null);
  const autoSaveTimerRef = useRef(null);
  const dmpRef = useRef(null);
  
  // Load optional dependencies when component mounts
  useEffect(() => {
    loadOptionalDependencies().then(() => {
      setDependenciesLoaded(true);
      // Initialize diff_match_patch if available
      if (diff_match_patch) {
        dmpRef.current = new diff_match_patch();
      }
    });
  }, []);

  // Initialize content and name
  useEffect(() => {
    if (component) {
      setEditedContent(component.content || '');
      setDocumentName(component.metadata?.fileName || component.name || 'Untitled Document');
    }
  }, [component]);

  // Fetch component versions
  const { data: versions, isLoading: versionsLoading } = useQuery({
    queryKey: [`/api/coauthor/components/${component?.id}/versions`],
    enabled: !!component?.id && isOpen,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/coauthor/components/${component.id}/versions`);
      return response.json();
    }
  });

  // Fetch component activity
  const { data: activity, isLoading: activityLoading } = useQuery({
    queryKey: [`/api/coauthor/components/${component?.id}/activity`],
    enabled: !!component?.id && isOpen,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/coauthor/components/${component.id}/activity`);
      return response.json();
    }
  });

  // Fetch compliance status
  const { data: compliance, isLoading: complianceLoading } = useQuery({
    queryKey: [`/api/coauthor/components/${component?.id}/compliance`],
    enabled: !!component?.id && isOpen,
    queryFn: async () => {
      const response = await apiRequest('GET', `/api/coauthor/components/${component.id}/compliance`);
      return response.json();
    }
  });

  // Update component mutation
  const updateComponentMutation = useMutation({
    mutationFn: async (data) => {
      const response = await apiRequest('PUT', `/api/coauthor/components/${component.id}/update`, data);
      return response.json();
    },
    onSuccess: (data) => {
      toast({
        title: "Document Updated",
        description: "Your changes have been saved successfully."
      });
      setAutoSaveStatus('saved');
      onUpdate?.(data);
      queryClient.invalidateQueries([`/api/coauthor/components/${component.id}`]);
    },
    onError: (error) => {
      toast({
        title: "Update Failed",
        description: error.message,
        variant: "destructive"
      });
      setAutoSaveStatus('error');
    }
  });

  // Add comment mutation
  const addCommentMutation = useMutation({
    mutationFn: async (commentData) => {
      const response = await apiRequest('POST', `/api/coauthor/components/${component.id}/comments`, commentData);
      return response.json();
    },
    onSuccess: () => {
      setComment('');
      queryClient.invalidateQueries([`/api/coauthor/components/${component.id}/activity`]);
      toast({
        title: "Comment Added",
        description: "Your comment has been posted."
      });
    }
  });

  // Lock/unlock document
  const toggleLockMutation = useMutation({
    mutationFn: async () => {
      const endpoint = isLocked ? 'unlock' : 'lock';
      const response = await apiRequest('POST', `/api/coauthor/components/${component.id}/${endpoint}`, {
        userId: currentUser?.id
      });
      return response.json();
    },
    onSuccess: (data) => {
      setIsLocked(!isLocked);
      setLockedBy(isLocked ? null : currentUser);
      toast({
        title: isLocked ? "Document Unlocked" : "Document Locked",
        description: isLocked ? "Others can now edit this document." : "Document is locked for your editing."
      });
    }
  });

  // Auto-save functionality
  useEffect(() => {
    if (isEditing && editedContent !== component?.content) {
      setAutoSaveStatus('saving');
      
      // Clear existing timer
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }

      // Set new timer for auto-save
      autoSaveTimerRef.current = setTimeout(() => {
        handleAutoSave();
      }, 3000); // Auto-save after 3 seconds of no typing
    }

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [editedContent, isEditing]);

  // Handle auto-save
  const handleAutoSave = () => {
    updateComponentMutation.mutate({
      content: editedContent,
      changeDescription: 'Auto-saved',
      userId: currentUser?.id,
      userName: currentUser?.name
    });
  };

  // Handle manual save
  const handleSave = () => {
    updateComponentMutation.mutate({
      content: editedContent,
      name: documentName,
      changeDescription: 'Manual save',
      userId: currentUser?.id,
      userName: currentUser?.name
    });
    setIsEditing(false);
  };

  // Handle cancel editing
  const handleCancelEdit = () => {
    setEditedContent(component.content || '');
    setDocumentName(component.metadata?.fileName || component.name || 'Untitled Document');
    setIsEditing(false);
    setIsEditingName(false);
  };

  // Handle add comment
  const handleAddComment = () => {
    if (!comment.trim()) return;
    
    addCommentMutation.mutate({
      text: comment,
      userId: currentUser?.id,
      userName: currentUser?.name
    });
  };

  // Handle version comparison
  const handleCompareVersions = (versionId) => {
    setCompareVersion(versionId);
    setShowVersionComparison(true);
  };

  // Generate version diff
  const generateVersionDiff = (oldContent, newContent) => {
    if (!dmpRef.current) {
      return []; // Return empty if diff-match-patch not available
    }
    const diffs = dmpRef.current.diff_main(oldContent, newContent);
    dmpRef.current.diff_cleanupSemantic(diffs);
    
    return diffs.map((diff, index) => {
      const [operation, text] = diff;
      if (operation === 0) {
        return <span key={index}>{text}</span>;
      } else if (operation === 1) {
        return <span key={index} className="bg-green-200 dark:bg-green-800">{text}</span>;
      } else {
        return <span key={index} className="bg-red-200 dark:bg-red-800 line-through">{text}</span>;
      }
    });
  };

  if (!component) return null;

  return (
    <Sheet open={isOpen} onOpenChange={onClose}>
      <SheetContent 
        side="right" 
        className="w-full sm:max-w-[900px] p-0 flex flex-col bg-white dark:bg-slate-900"
        style={{ fontFamily: 'Segoe UI, system-ui, -apple-system, sans-serif' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
          <div className="flex items-center gap-4">
            {/* Document Icon */}
            {getDocumentTypeIcon(component)}
            
            {/* Document Name */}
            <div className="flex-1">
              {isEditingName ? (
                <div className="flex items-center gap-2">
                  <Input
                    value={documentName}
                    onChange={(e) => setDocumentName(e.target.value)}
                    className="text-xl font-semibold"
                    data-testid="input-document-name"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') setIsEditingName(false);
                    }}
                    autoFocus
                  />
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setIsEditingName(false)}
                    data-testid="button-save-name"
                  >
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <div 
                  className="flex items-center gap-2 cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800 px-2 py-1 rounded"
                  onClick={() => setIsEditingName(true)}
                  data-testid="button-edit-document-name"
                >
                  <h2 className="text-xl font-semibold">{documentName}</h2>
                  <Edit className="h-4 w-4 text-slate-400" />
                </div>
              )}
              
              {/* Metadata */}
              <div className="flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400 mt-1">
                <span className="flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Modified {new Date(component.updatedAt || component.createdAt).toLocaleDateString()}
                </span>
                <span className="flex items-center gap-1">
                  <User className="h-3 w-3" />
                  {component.metadata?.modifiedBy || 'System'}
                </span>
                {isLocked && (
                  <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
                    <Lock className="h-3 w-3" />
                    Locked by {lockedBy?.name || 'Unknown'}
                  </span>
                )}
              </div>
            </div>
          </div>
          
          {/* Close Button */}
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            data-testid="button-close-preview"
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Action Toolbar */}
        <div className="flex items-center justify-between p-3 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800">
          <div className="flex items-center gap-2">
            {!isEditing ? (
              <Button
                size="sm"
                onClick={() => {
                  setIsEditing(true);
                  if (!isLocked) toggleLockMutation.mutate();
                }}
                disabled={isLocked && lockedBy?.id !== currentUser?.id}
                data-testid="button-edit"
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                <Edit className="h-4 w-4 mr-1" />
                Edit
              </Button>
            ) : (
              <>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateComponentMutation.isPending}
                  data-testid="button-save"
                  className="bg-green-600 hover:bg-green-700 text-white"
                >
                  <Save className="h-4 w-4 mr-1" />
                  Save
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCancelEdit}
                  data-testid="button-cancel"
                >
                  <XCircle className="h-4 w-4 mr-1" />
                  Cancel
                </Button>
                
                {/* Auto-save indicator */}
                <div className="flex items-center gap-2 ml-4 text-sm">
                  {autoSaveStatus === 'saving' && (
                    <>
                      <RefreshCw className="h-3 w-3 animate-spin text-blue-600" />
                      <span className="text-slate-600 dark:text-slate-400">Saving...</span>
                    </>
                  )}
                  {autoSaveStatus === 'saved' && (
                    <>
                      <CheckCircle className="h-3 w-3 text-green-600" />
                      <span className="text-slate-600 dark:text-slate-400">Saved</span>
                    </>
                  )}
                  {autoSaveStatus === 'error' && (
                    <>
                      <AlertCircle className="h-3 w-3 text-red-600" />
                      <span className="text-slate-600 dark:text-slate-400">Error saving</span>
                    </>
                  )}
                </div>
              </>
            )}
            
            <Separator orientation="vertical" className="h-6" />
            
            <Button size="sm" variant="ghost" data-testid="button-download">
              <Download className="h-4 w-4 mr-1" />
              Download
            </Button>
            
            <Button size="sm" variant="ghost" data-testid="button-share">
              <Share2 className="h-4 w-4 mr-1" />
              Share
            </Button>
            
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={() => setSelectedTab('versions')}
              data-testid="button-version-history"
            >
              <History className="h-4 w-4 mr-1" />
              Version History
            </Button>
            
            <Button size="sm" variant="ghost" data-testid="button-delete">
              <Trash2 className="h-4 w-4 mr-1" />
              Delete
            </Button>
            
            <Button size="sm" variant="ghost" data-testid="button-more-actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </div>
          
          {/* Viewing users */}
          {viewingUsers.length > 0 && (
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-slate-400" />
              <div className="flex -space-x-2">
                {viewingUsers.map((user, idx) => (
                  <Avatar key={idx} className="h-6 w-6 border-2 border-white dark:border-slate-800">
                    <AvatarImage src={user.avatar} />
                    <AvatarFallback>{user.name?.charAt(0)}</AvatarFallback>
                  </Avatar>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Main Content Area */}
        <div className="flex-1 overflow-hidden">
          <Tabs value={selectedTab} onValueChange={setSelectedTab} className="h-full flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b bg-transparent p-0">
              <TabsTrigger 
                value="content" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent"
                data-testid="tab-content"
              >
                Content
              </TabsTrigger>
              <TabsTrigger 
                value="properties" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent"
                data-testid="tab-properties"
              >
                Properties
              </TabsTrigger>
              <TabsTrigger 
                value="activity" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent"
                data-testid="tab-activity"
              >
                Activity
              </TabsTrigger>
              <TabsTrigger 
                value="versions" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent"
                data-testid="tab-versions"
              >
                Versions
              </TabsTrigger>
              <TabsTrigger 
                value="compliance" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-600 data-[state=active]:bg-transparent"
                data-testid="tab-compliance"
              >
                Compliance
              </TabsTrigger>
            </TabsList>
            
            <div className="flex-1 overflow-auto">
              {/* Content Tab */}
              <TabsContent value="content" className="h-full m-0">
                <div className="p-6">
                  {isEditing ? (
                    ReactQuill && dependenciesLoaded ? (
                      <ReactQuill
                        ref={editorRef}
                        value={editedContent}
                        onChange={setEditedContent}
                        modules={quillModules}
                        theme="snow"
                        className="h-[600px]"
                        data-testid="editor-content"
                      />
                    ) : (
                      <Textarea
                        value={editedContent}
                        onChange={(e) => setEditedContent(e.target.value)}
                        className="min-h-[600px] font-mono"
                        placeholder="Edit content here..."
                        data-testid="editor-fallback"
                      />
                    )
                  ) : (
                    <div 
                      className="prose prose-slate dark:prose-invert max-w-none"
                      dangerouslySetInnerHTML={{ __html: editedContent || '<p>No content available</p>' }}
                      data-testid="preview-content"
                    />
                  )}
                </div>
              </TabsContent>
              
              {/* Properties Tab */}
              <TabsContent value="properties" className="m-0">
                <div className="p-6 space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    {/* Document ID */}
                    <div className="space-y-2">
                      <Label>Document ID (UDI)</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          value={component.udi} 
                          readOnly 
                          className="font-mono"
                          data-testid="input-udi"
                        />
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            navigator.clipboard.writeText(component.udi);
                            toast({ title: "Copied", description: "UDI copied to clipboard" });
                          }}
                          data-testid="button-copy-udi"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    
                    {/* Module Context */}
                    <div className="space-y-2">
                      <Label>Module Context</Label>
                      <Select defaultValue={component.metadata?.module || 'module3'}>
                        <SelectTrigger data-testid="select-module">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="module1">Module 1 - Administrative</SelectItem>
                          <SelectItem value="module2">Module 2 - Common Technical</SelectItem>
                          <SelectItem value="module3">Module 3 - Quality</SelectItem>
                          <SelectItem value="module4">Module 4 - Nonclinical</SelectItem>
                          <SelectItem value="module5">Module 5 - Clinical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Priority */}
                    <div className="space-y-2">
                      <Label>Priority</Label>
                      <Select defaultValue={component.metadata?.priority || 'medium'}>
                        <SelectTrigger data-testid="select-priority">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="low">Low</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="critical">Critical</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Status */}
                    <div className="space-y-2">
                      <Label>Status</Label>
                      <Select defaultValue={component.status || 'draft'}>
                        <SelectTrigger data-testid="select-status">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="draft">Draft</SelectItem>
                          <SelectItem value="in_review">In Review</SelectItem>
                          <SelectItem value="approved">Approved</SelectItem>
                          <SelectItem value="rejected">Rejected</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    
                    {/* Tags */}
                    <div className="space-y-2 col-span-2">
                      <Label>Tags</Label>
                      <div className="flex items-center gap-2">
                        <Input 
                          placeholder="Add tags..." 
                          data-testid="input-tags"
                        />
                        <Button size="sm" data-testid="button-add-tag">
                          <Plus className="h-4 w-4" />
                        </Button>
                      </div>
                      <div className="flex flex-wrap gap-2 mt-2">
                        {component.metadata?.tags?.map((tag, idx) => (
                          <Badge key={idx} variant="secondary" className="flex items-center gap-1">
                            {tag}
                            <X className="h-3 w-3 cursor-pointer" />
                          </Badge>
                        ))}
                      </div>
                    </div>
                    
                    {/* Context of Use */}
                    <div className="space-y-2 col-span-2">
                      <Label>Context of Use (COU)</Label>
                      <Textarea 
                        placeholder="Describe the context of use..."
                        defaultValue={component.metadata?.contextOfUse}
                        rows={3}
                        data-testid="textarea-context-of-use"
                      />
                    </div>
                    
                    {/* Regulatory References */}
                    <div className="space-y-2 col-span-2">
                      <Label>Regulatory References</Label>
                      <Textarea 
                        placeholder="Add regulatory references (e.g., 21 CFR 314.50)..."
                        defaultValue={component.metadata?.regulatoryReferences}
                        rows={3}
                        data-testid="textarea-regulatory-references"
                      />
                    </div>
                  </div>
                </div>
              </TabsContent>
              
              {/* Activity Tab */}
              <TabsContent value="activity" className="m-0">
                <div className="p-6">
                  {/* Add Comment */}
                  <div className="mb-6">
                    <div className="flex items-start gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={currentUser?.avatar} />
                        <AvatarFallback>{currentUser?.name?.charAt(0)}</AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <Textarea
                          placeholder="Add a comment... Use @ to mention someone"
                          value={comment}
                          onChange={(e) => setComment(e.target.value)}
                          rows={3}
                          className="mb-2"
                          data-testid="textarea-comment"
                        />
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Button size="sm" variant="ghost" data-testid="button-mention">
                              <AtSign className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" data-testid="button-attach">
                              <Link className="h-4 w-4" />
                            </Button>
                          </div>
                          <Button 
                            size="sm"
                            onClick={handleAddComment}
                            disabled={!comment.trim() || addCommentMutation.isPending}
                            data-testid="button-post-comment"
                          >
                            <Send className="h-4 w-4 mr-1" />
                            Post
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                  
                  <Separator className="mb-6" />
                  
                  {/* Activity Timeline */}
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-4">
                      {activityLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
                        </div>
                      ) : activity?.items?.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                          No activity yet
                        </div>
                      ) : (
                        activity?.items?.map((item, idx) => (
                          <div key={idx} className="flex items-start gap-3">
                            <Avatar className="h-8 w-8">
                              <AvatarImage src={item.user?.avatar} />
                              <AvatarFallback>{item.user?.name?.charAt(0)}</AvatarFallback>
                            </Avatar>
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-medium text-sm">{item.user?.name}</span>
                                <span className="text-xs text-slate-500">
                                  {new Date(item.createdAt).toLocaleString()}
                                </span>
                              </div>
                              
                              {item.type === 'comment' ? (
                                <div className="bg-slate-50 dark:bg-slate-800 rounded-lg p-3">
                                  <p className="text-sm">{item.content}</p>
                                  <div className="flex items-center gap-3 mt-2">
                                    <Button size="sm" variant="ghost" className="h-6 px-2">
                                      <ThumbsUp className="h-3 w-3 mr-1" />
                                      Like
                                    </Button>
                                    <Button size="sm" variant="ghost" className="h-6 px-2">
                                      <Reply className="h-3 w-3 mr-1" />
                                      Reply
                                    </Button>
                                  </div>
                                </div>
                              ) : (
                                <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
                                  {item.type === 'version' && <GitBranch className="h-4 w-4" />}
                                  {item.type === 'edit' && <Edit className="h-4 w-4" />}
                                  {item.type === 'view' && <Eye className="h-4 w-4" />}
                                  <span>{item.description}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
              
              {/* Versions Tab */}
              <TabsContent value="versions" className="m-0">
                <div className="p-6">
                  {/* Version Comparison Controls */}
                  <div className="mb-6 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Label>Compare versions:</Label>
                      <Select 
                        value={compareVersion?.toString()} 
                        onValueChange={(v) => handleCompareVersions(v)}
                      >
                        <SelectTrigger className="w-[200px]" data-testid="select-compare-version">
                          <SelectValue placeholder="Select version" />
                        </SelectTrigger>
                        <SelectContent>
                          {versions?.map((ver) => (
                            <SelectItem key={ver.id} value={ver.id.toString()}>
                              v{ver.versionNumber} - {new Date(ver.createdAt).toLocaleDateString()}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowVersionComparison(!showVersionComparison)}
                        disabled={!compareVersion}
                        data-testid="button-toggle-comparison"
                      >
                        {showVersionComparison ? <Eye className="h-4 w-4 mr-1" /> : <Eye className="h-4 w-4 mr-1" />}
                        {showVersionComparison ? 'Hide' : 'Show'} Comparison
                      </Button>
                    </div>
                  </div>
                  
                  {/* Version Comparison View */}
                  {showVersionComparison && compareVersion && (
                    <Card className="mb-6">
                      <CardHeader>
                        <CardTitle className="text-lg">Version Comparison</CardTitle>
                        <CardDescription>
                          Changes between current version and v{versions?.find(v => v.id === compareVersion)?.versionNumber}
                        </CardDescription>
                      </CardHeader>
                      <CardContent>
                        <div className="prose prose-sm max-w-none">
                          {generateVersionDiff(
                            versions?.find(v => v.id === compareVersion)?.content || '',
                            editedContent
                          )}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* Version History List */}
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {versionsLoading ? (
                        <div className="flex items-center justify-center py-8">
                          <RefreshCw className="h-6 w-6 animate-spin text-slate-400" />
                        </div>
                      ) : versions?.length === 0 ? (
                        <div className="text-center py-8 text-slate-500">
                          No version history available
                        </div>
                      ) : (
                        versions?.map((version, idx) => (
                          <Card key={version.id} className="cursor-pointer hover:shadow-md transition-shadow">
                            <CardContent className="p-4">
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <Badge variant="outline">v{version.versionNumber}</Badge>
                                    {idx === 0 && <Badge className="bg-green-600">Current</Badge>}
                                    <span className="text-sm text-slate-500">
                                      {new Date(version.createdAt).toLocaleString()}
                                    </span>
                                  </div>
                                  <p className="text-sm text-slate-600 dark:text-slate-400 mb-2">
                                    {version.changeDescription || 'No description'}
                                  </p>
                                  <div className="flex items-center gap-2 text-sm text-slate-500">
                                    <User className="h-3 w-3" />
                                    <span>{version.createdBy || 'System'}</span>
                                  </div>
                                </div>
                                <div className="flex items-center gap-2">
                                  <Button size="sm" variant="ghost" data-testid={`button-restore-${version.id}`}>
                                    <RefreshCw className="h-4 w-4" />
                                  </Button>
                                  <Button size="sm" variant="ghost" data-testid={`button-download-version-${version.id}`}>
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            </CardContent>
                          </Card>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </TabsContent>
              
              {/* Compliance Tab */}
              <TabsContent value="compliance" className="m-0">
                <div className="p-6">
                  {/* Compliance Status Overview */}
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        {compliance?.status === 'compliant' ? (
                          <ShieldCheck className="h-5 w-5 text-green-600" />
                        ) : compliance?.status === 'warning' ? (
                          <ShieldAlert className="h-5 w-5 text-amber-600" />
                        ) : (
                          <Shield className="h-5 w-5 text-red-600" />
                        )}
                        Compliance Status
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-3 gap-4">
                        <div className="text-center p-3 bg-green-50 dark:bg-green-950/30 rounded-lg">
                          <div className="text-2xl font-bold text-green-600">{compliance?.passed || 0}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">Passed</div>
                        </div>
                        <div className="text-center p-3 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                          <div className="text-2xl font-bold text-amber-600">{compliance?.warnings || 0}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">Warnings</div>
                        </div>
                        <div className="text-center p-3 bg-red-50 dark:bg-red-950/30 rounded-lg">
                          <div className="text-2xl font-bold text-red-600">{compliance?.errors || 0}</div>
                          <div className="text-sm text-slate-600 dark:text-slate-400">Errors</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Validation Issues */}
                  {compliance?.issues?.length > 0 && (
                    <Card className="mb-6">
                      <CardHeader>
                        <CardTitle>Validation Issues</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {compliance.issues.map((issue, idx) => (
                            <Alert key={idx} variant={issue.severity === 'error' ? 'destructive' : 'default'}>
                              {issue.severity === 'error' ? (
                                <AlertCircle className="h-4 w-4" />
                              ) : (
                                <AlertTriangle className="h-4 w-4" />
                              )}
                              <AlertTitle>{issue.title}</AlertTitle>
                              <AlertDescription>
                                {issue.description}
                                {issue.reference && (
                                  <div className="mt-2 text-xs">
                                    Reference: <code>{issue.reference}</code>
                                  </div>
                                )}
                              </AlertDescription>
                            </Alert>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}
                  
                  {/* CFR References */}
                  <Card className="mb-6">
                    <CardHeader>
                      <CardTitle>CFR References</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        {compliance?.cfrReferences?.map((ref, idx) => (
                          <div key={idx} className="flex items-center justify-between p-2 hover:bg-slate-50 dark:hover:bg-slate-800 rounded">
                            <div className="flex items-center gap-2">
                              <FileText className="h-4 w-4 text-slate-400" />
                              <span className="font-mono text-sm">{ref.code}</span>
                              <span className="text-sm text-slate-600 dark:text-slate-400">{ref.title}</span>
                            </div>
                            <Badge variant="outline" className={ref.status === 'met' ? 'text-green-600' : 'text-red-600'}>
                              {ref.status}
                            </Badge>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                  
                  {/* Run Compliance Check Button */}
                  <Button 
                    className="w-full"
                    onClick={() => {
                      toast({
                        title: "Running Compliance Check",
                        description: "This may take a few moments..."
                      });
                    }}
                    data-testid="button-run-compliance-check"
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Run Compliance Check
                  </Button>
                </div>
              </TabsContent>
            </div>
          </Tabs>
        </div>
      </SheetContent>
    </Sheet>
  );
}