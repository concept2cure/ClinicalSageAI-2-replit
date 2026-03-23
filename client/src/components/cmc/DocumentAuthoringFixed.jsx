import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table as TableExtension, TableRow, TableHeader, TableCell } from '@tiptap/extension-table';
import { Highlight } from '@tiptap/extension-highlight';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import CharacterCount from '@tiptap/extension-character-count';
import TokenNode from './editor/extensions/TokenNode';
import AISuggestionEngine, { 
  useAISuggestionEngine, 
  AIAssistantPanel, 
  TextWithSuggestions 
} from './AISuggestionEngine';
import { cn } from '@/lib/utils';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
import { toast } from '@/hooks/use-toast';
  ChevronDown,
  FileText,
  Search,
  Plus,
  Clock,
  User,
  Globe,
  Sparkles,
  Download,
  Eye,
  Edit3,
  Save,
  X,
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Settings,
  Zap,
  BookOpen,
  Filter,
  Brain,
  Target,
  FileCheck,
  Lightbulb,
  TrendingUp,
  Shield,
  MessageSquare,
  ChevronRight,
  FolderOpen,
  Database,
  History,
  Link,
  GitBranch,
  Lock,
  Unlock,
  FileType,
  Table,
  Award,
  Calendar,
  TestTube,
  Upload,
  Bold,
  Italic,
  Underline,
  AlignLeft,
  AlignCenter,
  AlignRight,
  List,
  ListOrdered,
  Quote,
  Link2,
  Image,
  Type,
  Maximize,
  Minimize,
  BarChart2,
  Send,
  PenTool,
  Variable,
  Hash,
  FileDown,
  Code,
  Building2,
  Package,
} from 'lucide-react';

const DocumentAuthoringComponent = () => {
  // Helper function to get current tenant ID consistently
  const getCurrentTenantId = () => {
    const tenantId = localStorage.getItem('currentOrganizationId');
    if (!tenantId) {
      console.error('⚠️ CRITICAL: No tenant ID found in localStorage!');
      throw new Error('No organization selected. Please select an organization first.');
    }
    return tenantId;
  };

  // Comprehensive data normalization functions to handle inconsistent document shapes
  const normalizeDocument = (doc) => {
    if (!doc) return null;
    
    // Ensure all documents have consistent structure with complete null safety
    const normalizedTemplate = doc?.template ? {
      name: doc.template?.name || doc?.templateName || doc?.name || doc?.title || 'Default Template',
      category: doc.template?.category || doc?.category || 'eCTD Module 3',
      regions: Array.isArray(doc.template?.regions) ? doc.template.regions : 
               Array.isArray(doc?.regions) ? doc.regions : ['FDA', 'EMA'],
      version: doc.template?.version || doc?.version || 'v1.0',
      description: doc.template?.description || doc?.description || '',
      aiGuidance: doc.template?.aiGuidance !== undefined ? doc.template.aiGuidance : true,
      template: doc.template?.template || doc?.module || doc?.category || 'template',
      tags: Array.isArray(doc.template?.tags) ? doc.template.tags : [],
      moduleNumber: doc.template?.moduleNumber || doc?.module,
      templateType: doc.template?.templateType || doc?.category,
    } : {
      name: doc?.templateName || doc?.name || doc?.title || 'Default Template',
      category: doc?.category || 'eCTD Module 3',
      regions: Array.isArray(doc?.regions) ? doc.regions : ['FDA', 'EMA'],
      version: doc?.version || 'v1.0',
      description: doc?.description || '',
      aiGuidance: true,
      template: doc?.module || doc?.category || 'template',
      tags: [],
      moduleNumber: doc?.module,
      templateType: doc?.category,
    };
    
    return {
      id: doc?.id || `doc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      // Handle both 'name' and 'title' properties
      name: doc?.name || doc?.title || 'Untitled Document',
      title: doc?.title || doc?.name || 'Untitled Document',
      // Ensure template object exists with required properties
      template: normalizedTemplate,
      content: doc?.content || '',
      status: doc?.status || 'Draft',
      lastModified: doc?.lastModified || doc?.updated_at || new Date().toISOString(),
      progress: doc?.progress !== undefined ? doc.progress : 0,
      version: doc?.version || '1.0',
      module: doc?.module || 'M3',
    };
  };

  // Normalize template to ensure consistent structure with complete null safety
  const normalizeTemplate = (template) => {
    if (!template) return null;
    
    return {
      id: template?.id || `template-${Date.now()}`,
      name: template?.name || template?.title || 'Untitled Template',
      category: template?.category || 'Other Templates',
      description: template?.description || 'No description available',
      version: template?.version || 'v1.0',
      regions: Array.isArray(template?.regions) ? template.regions : ['FDA', 'EMA', 'PMDA', 'Health Canada'],
      aiGuidance: template?.aiGuidance !== undefined ? template.aiGuidance : true,
      template: template?.template || template?.module || template?.category || 'template',
      tags: Array.isArray(template?.tags) ? template.tags : [],
      moduleNumber: template?.moduleNumber || template?.module,
      templateType: template?.templateType || template?.category,
    };
  };

  const [activeView, setActiveView] = useState('overview');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showPreviewDialog, setShowPreviewDialog] = useState(false);
  const [showEditorView, setShowEditorView] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [previewTemplate, setPreviewTemplate] = useState(null);
  const [currentDocument, setCurrentDocument] = useState(null);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [selectedSection, setSelectedSection] = useState('3.2.S.1');
  const [rightPanelTab, setRightPanelTab] = useState('ai-assistant');
  const [documentState, setDocumentState] = useState('DRAFT');
  const [trackChangesMode, setTrackChangesMode] = useState(false);
  const [citationMode, setCitationMode] = useState(false);

  // Enhanced AI Guided Authoring Assistant States
  const [aiGuidance, setAiGuidance] = useState({
    complianceScore: 0,
    suggestions: [],
    missingElements: [],
    regulatoryFlags: [],
    boilerplateRecommendations: [],
    templateGuidance: null,
    analysisTimestamp: null,
  });
  const [aiAnalysisLoading, setAiAnalysisLoading] = useState(false);
  const [aiBoilerplateLoading, setAiBoilerplateLoading] = useState(false);
  const [documentContent, setDocumentContent] = useState('');
  
  // AI Suggestion Engine Integration
  const {
    suggestions,
    allSuggestions,
    scores,
    isAnalyzing,
    activeSuggestion,
    suggestionPosition,
    analyzeContent,
    getRealTimeSuggestions,
    acceptSuggestion,
    rejectSuggestion,
    ignoreSuggestion,
    batchAccept,
    batchReject,
    setActiveSuggestion,
    setSuggestionPosition,
  } = useAISuggestionEngine(
    currentDocument?.id || 'temp-doc',
    documentContent,
    showEditorView
  );
  const [autoAnalysisEnabled, setAutoAnalysisEnabled] = useState(true);
  const [lastAnalysisTime, setLastAnalysisTime] = useState(null);

  // Word document handling states
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [editorState, setEditorState] = useState({
    bold: false,
    italic: false,
    underline: false,
    alignment: 'left',
    fontSize: 12,
    fontFamily: 'Arial',
  });

  // Comments & Review States
  const [comments, setComments] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [commentFilter, setCommentFilter] = useState('all'); // all, open, resolved, archived
  const [commentSearchQuery, setCommentSearchQuery] = useState('');
  const [showAddCommentDialog, setShowAddCommentDialog] = useState(false);
  const [showReviewDialog, setShowReviewDialog] = useState(false);
  const [showRequestReviewDialog, setShowRequestReviewDialog] = useState(false);
  const [selectedComment, setSelectedComment] = useState(null);
  const [replyingTo, setReplyingTo] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [selectedText, setSelectedText] = useState(null);
  const [reviewStatus, setReviewStatus] = useState('pending');
  const [reviewComments, setReviewComments] = useState('');
  const [commentsLoading, setCommentsLoading] = useState(false);
  const [reviewsLoading, setReviewsLoading] = useState(false);
  const [commentActivity, setCommentActivity] = useState([]);
  const [reviewers, setReviewers] = useState([
    { id: 'reviewer-1', name: 'Dr. Sarah Chen', email: 'sarah.chen@company.com' },
    { id: 'reviewer-2', name: 'Dr. Michael Rodriguez', email: 'michael.rodriguez@company.com' },
    { id: 'reviewer-3', name: 'Dr. Jennifer Lee', email: 'jennifer.lee@company.com' },
  ]);
  const [selectedReviewers, setSelectedReviewers] = useState([]);
  const [showCommentActivity, setShowCommentActivity] = useState(false);

  // Complete CTD/eCTD Dossier Structure
  const dossierStructure = {
    'Module 3 - Quality': {
      'S - Drug Substance': {
        '3.2.S.1': { title: 'General Information', status: 'Complete', validation: 'Pass' },
        '3.2.S.2': { title: 'Manufacture', status: 'In Progress', validation: 'Minor Issues' },
        '3.2.S.3': { title: 'Characterisation', status: 'Draft', validation: 'Pending' },
        '3.2.S.4': {
          title: 'Control of Drug Substance',
          status: 'In Progress',
          validation: 'Major Issues',
        },
        '3.2.S.5': { title: 'Reference Standards', status: 'Complete', validation: 'Pass' },
        '3.2.S.6': { title: 'Container Closure System', status: 'Draft', validation: 'Pending' },
        '3.2.S.7': { title: 'Stability', status: 'In Progress', validation: 'Minor Issues' },
      },
      'P - Drug Product': {
        '3.2.P.1': { title: 'Description and Composition', status: 'Complete', validation: 'Pass' },
        '3.2.P.2': {
          title: 'Pharmaceutical Development',
          status: 'In Progress',
          validation: 'Minor Issues',
        },
        '3.2.P.3': { title: 'Manufacture', status: 'Draft', validation: 'Pending' },
        '3.2.P.4': { title: 'Control of Excipients', status: 'Complete', validation: 'Pass' },
        '3.2.P.5': {
          title: 'Control of Drug Product',
          status: 'In Progress',
          validation: 'Major Issues',
        },
        '3.2.P.6': { title: 'Reference Standards', status: 'Complete', validation: 'Pass' },
        '3.2.P.7': { title: 'Container Closure System', status: 'Draft', validation: 'Pending' },
        '3.2.P.8': { title: 'Stability', status: 'In Progress', validation: 'Minor Issues' },
      },
      'A - Appendices': {
        '3.2.A.1': { title: 'Facilities and Equipment', status: 'Complete', validation: 'Pass' },
        '3.2.A.2': {
          title: 'Adventitious Agents Safety Evaluation',
          status: 'Draft',
          validation: 'Pending',
        },
        '3.2.A.3': { title: 'Excipients', status: 'Complete', validation: 'Pass' },
      },
    },
  };

  // Enhanced Citations Database
  const [citationsDatabase, setCitationsDatabase] = useState([
    {
      id: 'cite-001',
      label: 'StabilityReport_2025Q1#Figure2',
      source: 'LIMS System Report',
      lastSync: '2025-08-16T10:00:00Z',
      confidence: 'High',
      sections: ['3.2.S.7', '3.2.P.8'],
      type: 'Data Table',
    },
    {
      id: 'cite-002',
      label: 'BatchAnalysis_DP001#Table3',
      source: 'QC Laboratory Data',
      lastSync: '2025-08-15T14:30:00Z',
      confidence: 'High',
      sections: ['3.2.P.5'],
      type: 'Analytical Data',
    },
    {
      id: 'cite-003',
      label: 'ICH_Q6A_Guidelines',
      source: 'ICH Harmonised Guideline',
      lastSync: '2025-01-01T00:00:00Z',
      confidence: 'Definitive',
      sections: ['3.2.S.4', '3.2.P.5'],
      type: 'Regulatory Guideline',
    },
  ]);

  // Document Version History
  const [versionHistory, setVersionHistory] = useState([
    {
      version: '1.3',
      date: '2025-08-16T09:15:00Z',
      author: 'Dr. Sarah Chen',
      status: 'Draft',
      changes: 'Updated stability data in Section 3.2.S.7',
      approver: null,
    },
    {
      version: '1.2',
      date: '2025-08-15T16:45:00Z',
      author: 'Dr. Michael Rodriguez',
      status: 'QA Review',
      changes: 'Added batch analysis data, corrected specification limits',
      approver: 'Dr. Jennifer Lee',
    },
  ]);

  // Export/Submit/Sign/Freeze operation states
  const [exportFormat, setExportFormat] = useState('docx');
  const [isExporting, setIsExporting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isFreezing, setIsFreezing] = useState(false);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showSubmitDialog, setShowSubmitDialog] = useState(false);
  const [showFreezeDialog, setShowFreezeDialog] = useState(false);
  const [signatureData, setSignatureData] = useState({ pin: '', reason: '', meaning: 'REVIEWER' });
  const [submitComment, setSubmitComment] = useState('');
  const [freezeReason, setFreezeReason] = useState('');
  const [documentSignatures, setDocumentSignatures] = useState([]);
  const [documentIsFrozen, setDocumentIsFrozen] = useState(false);
  const [showTokenEditor, setShowTokenEditor] = useState(false);
  const [tokenValues, setTokenValues] = useState({
    drug_name: 'Drug Product Name',
    study_id: 'STUDY-001',
    protocol_number: 'PROT-2025-001',
    manufacturer: 'Manufacturer Name',
    batch_number: 'BATCH-001',
    expiry_date: '2027-12-31',
  });
  const [customTokens, setCustomTokens] = useState([]);
  
  // Template States
  const [templates, setTemplates] = useState([]);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [showTemplateMenu, setShowTemplateMenu] = useState(false);
  const [templateSearchQuery, setTemplateSearchQuery] = useState('');
  const [templateCategory, setTemplateCategory] = useState('all');
  const [recentlyUsedTemplates, setRecentlyUsedTemplates] = useState([]);
  const [templatePreview, setTemplatePreview] = useState(null);
  const [showTemplatePreview, setShowTemplatePreview] = useState(false);
  
  // Guidance Drawer States
  const [guidanceDrawerOpen, setGuidanceDrawerOpen] = useState(false);
  const [guidanceContent, setGuidanceContent] = useState(null);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [guidanceTab, setGuidanceTab] = useState('guidance');
  const [aiQuestion, setAiQuestion] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [guidanceExamples, setGuidanceExamples] = useState([]);
  const [guidanceReferences, setGuidanceReferences] = useState([]);
  const [guidanceChecklist, setGuidanceChecklist] = useState([]);
  
  // Export History States
  const [exportHistory, setExportHistory] = useState([]);
  const [exportHistoryLoading, setExportHistoryLoading] = useState(false);
  const [exportHistoryFilter, setExportHistoryFilter] = useState({
    startDate: '',
    endDate: '',
    exportType: 'all',
  });
  const [exportHistoryTotal, setExportHistoryTotal] = useState(0);
  const [lastExport, setLastExport] = useState(null);
  const [deletingExportId, setDeletingExportId] = useState(null);
  
  // Template Categories
  const TEMPLATE_CATEGORIES = [
    { value: 'all', label: 'All Templates', icon: FileText },
    { value: 'fda', label: 'FDA Templates', icon: Globe },
    { value: 'ema', label: 'EMA Templates', icon: Globe },
    { value: 'pmda', label: 'PMDA Templates', icon: Globe },
    { value: 'health-canada', label: 'Health Canada', icon: Globe },
    { value: 'ich', label: 'ICH Guidelines', icon: BookOpen },
  ];
  
  // Sample Templates (will be loaded from API)
  const DEFAULT_TEMPLATES = [
    {
      id: 'template-1',
      name: 'Clinical Study Report (CSR)',
      type: 'csr',
      category: 'fda',
      description: 'Standard template for Clinical Study Reports following FDA guidelines',
      icon: FileCheck,
      regions: ['FDA', 'EMA'],
      usage_count: 145,
    },
    {
      id: 'template-2',
      name: 'Investigator\'s Brochure (IB)',
      type: 'ib',
      category: 'ich',
      description: 'ICH-compliant template for Investigator\'s Brochure documentation',
      icon: BookOpen,
      regions: ['ICH', 'FDA', 'EMA', 'PMDA'],
      usage_count: 89,
    },
    {
      id: 'template-3',
      name: 'Clinical Protocol',
      type: 'protocol',
      category: 'fda',
      description: 'Clinical trial protocol template with all required sections',
      icon: TestTube,
      regions: ['FDA'],
      usage_count: 234,
    },
    {
      id: 'template-4',
      name: 'Informed Consent Form (ICF)',
      type: 'icf',
      category: 'fda',
      description: 'Patient informed consent form template meeting regulatory requirements',
      icon: Shield,
      regions: ['FDA', 'EMA'],
      usage_count: 412,
    },
    {
      id: 'template-5',
      name: 'Drug Substance Section',
      type: 'drug-substance',
      category: 'ema',
      description: 'eCTD Module 3.2.S Drug Substance comprehensive template',
      icon: TestTube,
      regions: ['EMA', 'FDA'],
      usage_count: 67,
    },
  ];
  
  // Predefined tokens with types and descriptions
  const PREDEFINED_TOKENS = [
    { key: 'drug_name', type: 'drug_name', label: 'Drug Name', description: 'Product/drug name', icon: TestTube },
    { key: 'study_id', type: 'study_id', label: 'Study ID', description: 'Clinical study identifier', icon: Database },
    { key: 'protocol_number', type: 'protocol_number', label: 'Protocol #', description: 'Protocol number', icon: Hash },
    { key: 'manufacturer', type: 'manufacturer', label: 'Manufacturer', description: 'Manufacturing site', icon: Building2 },
    { key: 'batch_number', type: 'batch_number', label: 'Batch Number', description: 'Batch/lot number', icon: Package },
    { key: 'expiry_date', type: 'expiry_date', label: 'Expiry Date', description: 'Product expiration date', icon: Calendar },
  ];

  // Fetch templates on mount
  useEffect(() => {
    fetchTemplates();
  }, []);

  // Fetch guidance when section changes
  useEffect(() => {
    if (selectedSection && guidanceDrawerOpen) {
      fetchGuidance(selectedSection);
    }
  }, [selectedSection, guidanceDrawerOpen]);

  // Initialize TipTap Editor with TokenNode extension
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        heading: {
          levels: [1, 2, 3],
        },
      }),
      TableExtension.configure({
        resizable: true,
      }),
      TableRow,
      TableHeader,
      TableCell,
      Highlight,
      TaskList,
      TaskItem,
      CharacterCount,
      TokenNode,
    ],
    content: documentContent || '<p>Start typing your document here...</p>',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      setDocumentContent(html);
    },
  });
  
  // Update editor when document content changes
  useEffect(() => {
    if (editor && documentContent && !editor.isFocused) {
      editor.commands.setContent(documentContent);
    }
  }, [editor, documentContent]);
  
  // Set token context when document/section changes
  useEffect(() => {
    if (editor && currentDocument) {
      editor.commands.setTokenContext({
        docId: currentDocument.id,
        sectionId: selectedSection,
      });
      editor.commands.updateTokenValues(tokenValues);
    }
  }, [editor, currentDocument, selectedSection, tokenValues]);
  
  // Insert token function
  const insertToken = useCallback((tokenKey, tokenType, tokenLabel) => {
    if (!editor) return;
    
    const value = tokenValues[tokenKey] || customTokens.find(t => t.key === tokenKey)?.value || '';
    
    editor.chain().focus().insertToken({
      key: tokenKey,
      type: tokenType,
      title: tokenLabel,
      value: value,
    }).run();
  }, [editor, tokenValues, customTokens]);
  
  // Add custom token
  const addCustomToken = (key, value) => {
    const newToken = { key, value, type: 'custom', label: key };
    setCustomTokens([...customTokens, newToken]);
    setTokenValues({ ...tokenValues, [key]: value });
  };
  
  // Update token value
  const updateTokenValue = (key, value) => {
    setTokenValues({ ...tokenValues, [key]: value });
    if (editor) {
      editor.commands.updateTokenValues({ [key]: value });
    }
  };

  // Fetch export history
  const fetchExportHistory = async () => {
    if (!currentDocument?.id) return;
    
    setExportHistoryLoading(true);
    try {
      const params = new URLSearchParams();
      if (exportHistoryFilter.startDate) params.append('start_date', exportHistoryFilter.startDate);
      if (exportHistoryFilter.endDate) params.append('end_date', exportHistoryFilter.endDate);
      if (exportHistoryFilter.exportType !== 'all') params.append('export_type', exportHistoryFilter.exportType);
      params.append('limit', '100');
      
      const response = await fetch(
        `/api/authoring/docs/${currentDocument.id}/exports?${params}`,
        {
          headers: {
            'x-tenant-id': getCurrentTenantId(),
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setExportHistory(data.exports || []);
        setExportHistoryTotal(data.total || 0);
        setLastExport(data.last_export || null);
      } else {
        console.error('Failed to fetch export history');
      }
    } catch (error) {
      console.error('Error fetching export history:', error);
    } finally {
      setExportHistoryLoading(false);
    }
  };
  
  // Delete export history entry
  const deleteExportHistoryEntry = async (exportId) => {
    if (!confirm('Are you sure you want to delete this export history entry?')) {
      return;
    }
    
    setDeletingExportId(exportId);
    try {
      const response = await fetch(
        `/api/authoring/export-history/${exportId}`,
        {
          method: 'DELETE',
          headers: {
            'x-tenant-id': getCurrentTenantId(),
            'x-user-email': localStorage.getItem('userEmail') || 'user@company.com',
          }
        }
      );
      
      if (response.ok) {
        // Refresh export history
        await fetchExportHistory();
        console.log('Export history entry deleted successfully');
      } else {
        const error = await response.json();
        toast({ title: `Failed to delete: ${error.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Error deleting export history:', error);
      toast({ title: 'Failed to delete export history entry' });
    } finally {
      setDeletingExportId(null);
    }
  };

  // ============= Comments & Review Functions =============
  
  // Fetch comments for the current document
  const fetchComments = async () => {
    if (!currentDocument?.id) return;
    
    setCommentsLoading(true);
    try {
      const response = await fetch(
        `/api/authoring/documents/${currentDocument.id}/comments?includeReplies=true`,
        {
          headers: {
            'x-tenant-id': getCurrentTenantId(),
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setComments(data.comments || []);
      } else {
        console.error('Failed to fetch comments');
      }
    } catch (error) {
      console.error('Error fetching comments:', error);
    } finally {
      setCommentsLoading(false);
    }
  };

  // Fetch reviews for the current document
  const fetchReviews = async () => {
    if (!currentDocument?.id) return;
    
    setReviewsLoading(true);
    try {
      const response = await fetch(
        `/api/authoring/documents/${currentDocument.id}/reviews`,
        {
          headers: {
            'x-tenant-id': getCurrentTenantId(),
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setReviews(data.reviews || []);
      } else {
        console.error('Failed to fetch reviews');
      }
    } catch (error) {
      console.error('Error fetching reviews:', error);
    } finally {
      setReviewsLoading(false);
    }
  };

  // Fetch comment activity
  const fetchCommentActivity = async () => {
    if (!currentDocument?.id) return;
    
    try {
      const response = await fetch(
        `/api/authoring/documents/${currentDocument.id}/comment-activity?limit=20`,
        {
          headers: {
            'x-tenant-id': getCurrentTenantId(),
          }
        }
      );
      
      if (response.ok) {
        const data = await response.json();
        setCommentActivity(data.activities || []);
      }
    } catch (error) {
      console.error('Error fetching comment activity:', error);
    }
  };

  // Add a new comment
  const addComment = async (body, parentId = null, sectionId = null, anchor = null) => {
    if (!currentDocument?.id || !body.trim()) return;
    
    try {
      const response = await fetch('/api/authoring/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
          'x-user-name': localStorage.getItem('userName') || 'Current User',
          'x-user-email': localStorage.getItem('userEmail') || 'user@company.com',
        },
        body: JSON.stringify({
          doc_id: currentDocument.id,
          section_id: sectionId || selectedSection,
          body: body,
          anchor: anchor,
          parent_comment_id: parentId,
          position_data: selectedText ? { text: selectedText } : null,
        }),
      });

      if (response.ok) {
        await fetchComments();
        await fetchCommentActivity();
        setNewComment('');
        setReplyingTo(null);
        setSelectedText(null);
        setShowAddCommentDialog(false);
        console.log('Comment added successfully');
      } else {
        const error = await response.json();
        toast({ title: `Failed to add comment: ${error.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Error adding comment:', error);
      toast({ title: 'Failed to add comment' });
    }
  };

  // Update comment status
  const updateCommentStatus = async (commentId, status, resolutionNote = '') => {
    try {
      const response = await fetch(`/api/authoring/comments/${commentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
          'x-user-name': localStorage.getItem('userName') || 'Current User',
        },
        body: JSON.stringify({
          status: status,
          resolution_note: resolutionNote,
        }),
      });

      if (response.ok) {
        await fetchComments();
        await fetchCommentActivity();
        console.log(`Comment ${status} successfully`);
      } else {
        const error = await response.json();
        toast({ title: `Failed to update comment: ${error.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Error updating comment:', error);
      toast({ title: 'Failed to update comment' });
    }
  };

  // Delete comment
  const deleteComment = async (commentId) => {
    if (!confirm('Are you sure you want to delete this comment and all its replies?')) {
      return;
    }

    try {
      const response = await fetch(`/api/authoring/comments/${commentId}`, {
        method: 'DELETE',
        headers: {
          'x-tenant-id': getCurrentTenantId(),
          'x-user-name': localStorage.getItem('userName') || 'Current User',
        },
      });

      if (response.ok) {
        await fetchComments();
        await fetchCommentActivity();
        console.log('Comment deleted successfully');
      } else {
        const error = await response.json();
        toast({ title: `Failed to delete comment: ${error.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
      toast({ title: 'Failed to delete comment' });
    }
  };

  // Submit review
  const submitReview = async () => {
    if (!currentDocument?.id) return;

    try {
      const response = await fetch(`/api/authoring/documents/${currentDocument.id}/review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
          'x-user-name': localStorage.getItem('userName') || 'Current User',
          'x-user-email': localStorage.getItem('userEmail') || 'user@company.com',
        },
        body: JSON.stringify({
          review_status: reviewStatus,
          review_comments: reviewComments,
        }),
      });

      if (response.ok) {
        await fetchReviews();
        setShowReviewDialog(false);
        setReviewStatus('pending');
        setReviewComments('');
        console.log('Review submitted successfully');
        toast({ title: `Document ${reviewStatus.replace('_', ' ')} successfully!` });
      } else {
        const error = await response.json();
        toast({ title: `Failed to submit review: ${error.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Error submitting review:', error);
      toast({ title: 'Failed to submit review' });
    }
  };

  // Request review from selected users
  const requestReview = async () => {
    if (!currentDocument?.id || selectedReviewers.length === 0) {
      toast({ title: 'Please select at least one reviewer' });
      return;
    }

    try {
      const response = await fetch(`/api/authoring/documents/${currentDocument.id}/request-review`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
          'x-user-name': localStorage.getItem('userName') || 'Current User',
        },
        body: JSON.stringify({
          reviewers: selectedReviewers,
        }),
      });

      if (response.ok) {
        await fetchReviews();
        setShowRequestReviewDialog(false);
        setSelectedReviewers([]);
        console.log('Review requested successfully');
        toast({ title: `Review requested from ${selectedReviewers.length} reviewer(s)` });
      } else {
        const error = await response.json();
        toast({ title: `Failed to request review: ${error.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Error requesting review:', error);
      toast({ title: 'Failed to request review' });
    }
  };

  // Get user initials for avatar
  const getUserInitials = (name) => {
    if (!name) return 'U';
    const parts = name.split(' ');
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return name.substring(0, 2).toUpperCase();
  };

  // Generate user avatar color based on name
  const getUserAvatarColor = (name) => {
    const colors = [
      'bg-blue-500',
      'bg-green-500',
      'bg-purple-500',
      'bg-pink-500',
      'bg-indigo-500',
      'bg-red-500',
      'bg-yellow-500',
      'bg-teal-500',
    ];
    const hash = name?.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0) || 0;
    return colors[hash % colors.length];
  };

  // Filter comments based on status and search
  const filteredComments = comments.filter(comment => {
    const matchesStatus = commentFilter === 'all' || comment.status === commentFilter;
    const matchesSearch = !commentSearchQuery || 
      comment.body?.toLowerCase().includes(commentSearchQuery.toLowerCase()) ||
      comment.author_name?.toLowerCase().includes(commentSearchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  // Get review statistics
  const reviewStats = {
    total: reviews.length,
    pending: reviews.filter(r => r.review_status === 'pending').length,
    approved: reviews.filter(r => r.review_status === 'approved').length,
    rejected: reviews.filter(r => r.review_status === 'rejected').length,
    changes_requested: reviews.filter(r => r.review_status === 'changes_requested').length,
  };

  // Load comments and reviews when document changes
  useEffect(() => {
    if (currentDocument?.id) {
      fetchComments();
      fetchReviews();
      fetchCommentActivity();
    }
  }, [currentDocument?.id]);
  
  // Format relative time
  const formatRelativeTime = (dateStr) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays < 7) return diffDays === 1 ? 'Yesterday' : `${diffDays} days ago`;
    return date.toLocaleDateString();
  };
  
  // Format file size
  const formatFileSize = (bytes) => {
    if (!bytes) return 'Unknown';
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return Math.round(bytes / Math.pow(1024, i) * 100) / 100 + ' ' + sizes[i];
  };
  
  // Fetch export history when document changes or filter changes
  useEffect(() => {
    if (currentDocument?.id) {
      fetchExportHistory();
    }
  }, [currentDocument?.id, exportHistoryFilter]);

  // Export document function
  const exportDocument = async (format) => {
    if (!currentDocument?.id) {
      toast({ title: 'No document selected for export' });
      return;
    }

    setIsExporting(true);
    try {
      const response = await fetch(
        `/api/authoring/docs/${currentDocument.id}/export`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': getCurrentTenantId(),
            'x-user-email': localStorage.getItem('userEmail') || 'user@company.com',
          },
          body: JSON.stringify({ format }),
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const fileName = currentDocument?.name || currentDocument?.title || 'document';
        const extension = format === 'xml' ? 'xml' : format === 'pdf' ? 'pdf' : 'docx';
        a.download = `${fileName}.${extension}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        console.log(`Document exported as ${format}`);
        
        // Refresh export history after successful export
        setTimeout(() => fetchExportHistory(), 1000);
      } else {
        const error = await response.json();
        toast({ title: `Export failed: ${error.message || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Export error:', error);
      toast({ title: 'Export failed. Please try again.' });
    } finally {
      setIsExporting(false);
    }
  };

  // Submit document for review
  const submitDocument = async () => {
    if (!currentDocument?.id) {
      toast({ title: 'No document selected for submission' });
      return;
    }

    setIsSubmitting(true);
    try {
      const response = await fetch(
        `/api/authoring/docs/${currentDocument.id}/submit`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': getCurrentTenantId(),
            'x-user-email': localStorage.getItem('userEmail') || 'user@company.com',
          },
          body: JSON.stringify({
            comment: submitComment,
            workflow_steps: [
              { role: 'QA', approver_email: 'qa@company.com' },
              { role: 'RA_CMC', approver_email: 'ra@company.com' },
            ],
          }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        setCurrentDocument(prev => ({ ...prev, status: 'IN_REVIEW' }));
        setShowSubmitDialog(false);
        setSubmitComment('');
        toast({ title: 'Document submitted for review successfully!' });
      } else {
        const error = await response.json();
        toast({ title: `Submission failed: ${error.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Submit error:', error);
      toast({ title: 'Submission failed. Please try again.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  // Sign document electronically
  const signDocument = async () => {
    if (!currentDocument?.id) {
      toast({ title: 'No document selected for signing' });
      return;
    }

    if (!signatureData.pin || !signatureData.reason) {
      toast({ title: 'PIN and reason are required for signing' });
      return;
    }

    setIsSigning(true);
    try {
      const response = await fetch(
        `/api/authoring/docs/${currentDocument.id}/sign`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': getCurrentTenantId(),
            'x-user-email': localStorage.getItem('userEmail') || 'user@company.com',
          },
          body: JSON.stringify(signatureData),
        }
      );

      if (response.ok) {
        const result = await response.json();
        setShowSignDialog(false);
        setSignatureData({ pin: '', reason: '', meaning: 'REVIEWER' });
        // Fetch updated signatures
        await fetchSignatures();
        toast({ title: 'Document signed successfully!' });
      } else {
        const error = await response.json();
        toast({ title: `Signing failed: ${error.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Sign error:', error);
      toast({ title: 'Signing failed. Please try again.' });
    } finally {
      setIsSigning(false);
    }
  };

  // Freeze document to prevent edits
  const freezeDocument = async () => {
    if (!currentDocument?.id) {
      toast({ title: 'No document selected for freezing' });
      return;
    }

    setIsFreezing(true);
    try {
      const response = await fetch(
        `/api/authoring/docs/${currentDocument.id}/freeze`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': getCurrentTenantId(),
            'x-user-email': localStorage.getItem('userEmail') || 'user@company.com',
            'x-roles': 'QA,RA_CMC', // User roles
          },
          body: JSON.stringify({ reason: freezeReason }),
        }
      );

      if (response.ok) {
        const result = await response.json();
        setCurrentDocument(prev => ({ ...prev, status: 'FROZEN' }));
        setDocumentIsFrozen(true);
        setDocumentState('LOCKED');
        setShowFreezeDialog(false);
        setFreezeReason('');
        toast({ title: 'Document frozen successfully!' });
      } else {
        const error = await response.json();
        toast({ title: `Freeze failed: ${error.error || 'Unknown error'}` });
      }
    } catch (error) {
      console.error('Freeze error:', error);
      toast({ title: 'Freeze operation failed. Please try again.' });
    } finally {
      setIsFreezing(false);
    }
  };

  // Fetch document signatures
  const fetchSignatures = async () => {
    if (!currentDocument?.id) return;

    try {
      const response = await fetch(
        `/api/authoring/docs/${currentDocument.id}/signatures`,
        {
          headers: {
            'x-tenant-id': getCurrentTenantId(),
          },
        }
      );

      if (response.ok) {
        const result = await response.json();
        setDocumentSignatures(result.signatures || []);
      }
    } catch (error) {
      console.error('Failed to fetch signatures:', error);
    }
  };

  // Fetch Templates
  const fetchTemplates = async () => {
    setTemplatesLoading(true);
    try {
      const response = await fetch('/api/authoring/templates', {
        headers: {
          'x-tenant-id': getCurrentTenantId(),
        },
      });

      if (response.ok) {
        const result = await response.json();
        setTemplates(result.templates || DEFAULT_TEMPLATES);
      } else {
        // Use default templates if API fails
        setTemplates(DEFAULT_TEMPLATES);
      }
    } catch (error) {
      console.error('Failed to fetch templates:', error);
      setTemplates(DEFAULT_TEMPLATES);
    } finally {
      setTemplatesLoading(false);
    }
  };

  // Apply Template to Document
  const applyTemplate = async (templateId) => {
    if (!currentDocument?.id) {
      toast({ title: 'Please create or select a document first' });
      return;
    }

    const confirmed = window.confirm('This will replace the current document content with the template. Continue?');
    if (!confirmed) return;

    try {
      const response = await fetch(`/api/authoring/templates/apply/${templateId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
        },
        body: JSON.stringify({ document_id: currentDocument.id }),
      });

      if (response.ok) {
        // Refresh document content
        await fetchDocumentDetails(currentDocument.id);
        setShowTemplateMenu(false);
        setSelectedTemplate(templates.find(t => t.id === templateId));
        
        // Add to recently used
        setRecentlyUsedTemplates(prev => [
          templates.find(t => t.id === templateId),
          ...prev.filter(t => t.id !== templateId).slice(0, 4),
        ]);
        
        // Show success message
        toast({ title: 'Template applied successfully!' });
      } else {
        toast({ title: 'Failed to apply template' });
      }
    } catch (error) {
      console.error('Error applying template:', error);
      toast({ title: 'Failed to apply template' });
    }
  };

  // Fetch Guidance for Section
  const fetchGuidance = async (sectionId) => {
    setGuidanceLoading(true);
    try {
      const response = await fetch(`/api/authoring/guidance/${sectionId}`, {
        headers: {
          'x-tenant-id': getCurrentTenantId(),
        },
      });

      if (response.ok) {
        const result = await response.json();
        setGuidanceContent(result.guidance || []);
        setGuidanceExamples(result.template_guidance?.examples || []);
        setGuidanceReferences(result.template_guidance?.regulatory_references || []);
        setGuidanceChecklist(result.template_guidance?.compliance_checklist || []);
      } else {
        // Set default guidance
        setGuidanceContent([
          {
            guidance_type: 'regulatory',
            content: 'Follow FDA/EMA guidelines for this section.',
          },
          {
            guidance_type: 'best_practice',
            content: 'Ensure clarity and completeness in your documentation.',
          },
        ]);
      }
    } catch (error) {
      console.error('Failed to fetch guidance:', error);
    } finally {
      setGuidanceLoading(false);
    }
  };

  // Ask AI for Help
  const askAI = async () => {
    if (!aiQuestion.trim()) return;

    setAiLoading(true);
    try {
      const response = await fetch('/api/ai/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
        },
        body: JSON.stringify({
          question: aiQuestion,
          context: {
            section: selectedSection,
            document_type: currentDocument?.module,
            template: selectedTemplate?.name,
          },
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setAiResponse(result.answer || 'No response available');
      } else {
        setAiResponse('Unable to get AI response. Please try again.');
      }
    } catch (error) {
      console.error('AI request failed:', error);
      setAiResponse('AI service is currently unavailable.');
    } finally {
      setAiLoading(false);
    }
  };

  // Insert AI Suggestion into Editor
  const insertAISuggestion = (text) => {
    if (editor) {
      editor.chain().focus().insertContent(text).run();
    } else {
      setDocumentContent(documentContent + '\n\n' + text);
    }
    // Close guidance drawer after insertion
    setGuidanceDrawerOpen(false);
  };

  // Fetch Document Details
  const fetchDocumentDetails = async (docId) => {
    try {
      const response = await fetch(`/api/authoring/docs/${docId}`, {
        headers: {
          'x-tenant-id': getCurrentTenantId(),
        },
      });

      if (response.ok) {
        const result = await response.json();
        setCurrentDocument(result.document);
        setDocumentContent(result.sections?.[0]?.content || '');
      }
    } catch (error) {
      console.error('Failed to fetch document details:', error);
    }
  };

  // Toggle Guidance Drawer
  const toggleGuidanceDrawer = () => {
    setGuidanceDrawerOpen(!guidanceDrawerOpen);
    if (!guidanceDrawerOpen && selectedSection) {
      fetchGuidance(selectedSection);
    }
  };

  // ICH/FDA/EMA Regulatory Knowledge Base
  // AI-powered content analysis and suggestions
  const performAIAnalysis = async (content, templateName) => {
    if (!content || content.length < 20) return;

    setAiAnalysisLoading(true);
    try {
      const response = await fetch('/api/ai/analyze-compliance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
        },
        body: JSON.stringify({
          content,
          templateName,
          analysisType: 'comprehensive',
        }),
      });

      if (response.ok) {
        const analysis = await response.json();
        setAiGuidance(analysis);
        setLastAnalysisTime(new Date());
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  // Generate AI boilerplate content
  const generateBoilerplate = async (section, context = '') => {
    setAiBoilerplateLoading(true);
    try {
      const response = await fetch('/api/ai/generate-boilerplate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
        },
        body: JSON.stringify({
          section,
          context,
          templateType: selectedSection,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setDocumentContent(prev => prev + '\n\n' + result.boilerplateText);
      }
    } catch (error) {
      console.error('Boilerplate generation failed:', error);
    } finally {
      setAiBoilerplateLoading(false);
    }
  };

  // Recompute document with fresh LIMS data
  const [recomputeLoading, setRecomputeLoading] = useState(false);
  const recomputeWithLimsData = async () => {
    if (!currentDocument?.id) {
      toast({ title: 'No document selected for recomputation' });
      return;
    }

    setRecomputeLoading(true);
    try {
      // Get section ID for this document (simplified - assume one section per doc)
      const sectionResponse = await fetch(
        `/api/analytical/documents/${currentDocument.id}/sections`,
        {
          headers: { 'x-tenant-id': getCurrentTenantId() },
        }
      );

      if (sectionResponse.ok) {
        const sections = await sectionResponse.json();
        const mainSection = sections[0]; // Use first section

        if (mainSection && mainSection.section_id) {
          const recomputeResponse = await fetch(
            `/api/analytical/sections/${mainSection.section_id}/recompute-tokens`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'x-tenant-id': getCurrentTenantId(),
              },
            }
          );

          if (recomputeResponse.ok) {
            const result = await recomputeResponse.json();
            setDocumentContent(result.content_md);
            setCurrentDocument(prev => ({
              ...prev,
              content: result.content_md,
              lastModified: new Date().toISOString(),
            }));
            toast({ title: 
              `✅ Document recomputed with fresh LIMS data (${result.dataPoints.linearity + result.dataPoints.accuracy + result.dataPoints.precision} data points)`
             });
          } else {
            toast({ title: '❌ Failed to recompute document' });
          }
        } else {
          toast({ title: '❌ No linked analytical method found for this document' });
        }
      }
    } catch (error) {
      console.error('Recompute failed:', error);
      toast({ title: '❌ Recompute failed: ' + error.message });
    } finally {
      setRecomputeLoading(false);
    }
  };

  // MS Word Import/Export Functions
  const handleWordUpload = async event => {
    const file = event.target.files[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // Import mammoth for Word document parsing
      const mammoth = await import('mammoth');

      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer });

      // Convert HTML to plain text and update document content
      const tempDiv = document.createElement('div');
      tempDiv.innerHTML = result.value;
      const plainText = tempDiv.textContent || tempDiv.innerText || '';

      setDocumentContent(plainText);

      // Update current document if one is selected
      if (currentDocument) {
        setCurrentDocument(prev => ({
          ...prev,
          content: plainText,
          lastModified: new Date().toISOString(),
        }));
      }

      console.log('Word document imported successfully');
    } catch (error) {
      console.error('Failed to import Word document:', error);
      toast({ title: 'Failed to import Word document. Please try again.' });
    } finally {
      setIsUploading(false);
      event.target.value = ''; // Reset file input
    }
  };

  const handleWordDownload = async () => {
    if (!documentContent) {
      toast({ title: 'No content to export' });
      return;
    }

    setIsDownloading(true);
    try {
      // Import required libraries
      const { Document, Packer, Paragraph, TextRun } = await import('docx');
      const { saveAs } = await import('file-saver');

      // Create document sections from content
      const paragraphs = documentContent.split('\n').map(
        line =>
          new Paragraph({
            children: [new TextRun(line || ' ')], // Empty lines need space
          })
      );

      // Create Word document
      const doc = new Document({
        sections: [
          {
            properties: {},
            children: paragraphs,
          },
        ],
      });

      // Generate and download
      const blob = await Packer.toBlob(doc);
      const fileName = currentDocument?.name || currentDocument?.title || 'Document';
      saveAs(blob, `${fileName}.docx`);

      console.log('Word document exported successfully');
    } catch (error) {
      console.error('Failed to export Word document:', error);
      toast({ title: 'Failed to export Word document. Please try again.' });
    } finally {
      setIsDownloading(false);
    }
  };

  // Editor formatting functions
  const applyFormat = format => {
    const textarea = document.getElementById('document-editor');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selectedText = documentContent.substring(start, end);

    let formattedText = selectedText;

    switch (format) {
      case 'bold':
        formattedText = `**${selectedText}**`;
        setEditorState(prev => ({ ...prev, bold: !prev.bold }));
        break;
      case 'italic':
        formattedText = `*${selectedText}*`;
        setEditorState(prev => ({ ...prev, italic: !prev.italic }));
        break;
      case 'underline':
        formattedText = `__${selectedText}__`;
        setEditorState(prev => ({ ...prev, underline: !prev.underline }));
        break;
      case 'h1':
        formattedText = `# ${selectedText}`;
        break;
      case 'h2':
        formattedText = `## ${selectedText}`;
        break;
      case 'h3':
        formattedText = `### ${selectedText}`;
        break;
      case 'bullet':
        formattedText = `• ${selectedText}`;
        break;
      case 'number':
        formattedText = `1. ${selectedText}`;
        break;
      case 'quote':
        formattedText = `> ${selectedText}`;
        break;
      default:
        return;
    }

    const newContent =
      documentContent.substring(0, start) + formattedText + documentContent.substring(end);
    setDocumentContent(newContent);

    // Update current document
    if (currentDocument) {
      setCurrentDocument(prev => ({
        ...prev,
        content: newContent,
        lastModified: new Date().toISOString(),
      }));
    }
  };

  const insertContent = content => {
    if (editor) {
      editor.chain().focus().insertContent(content).run();
      return;
    }
    const textarea = document.getElementById('document-editor');
    if (!textarea) return;

    const start = textarea.selectionStart;
    const newContent =
      documentContent.substring(0, start) + content + documentContent.substring(start);
    setDocumentContent(newContent);

    if (currentDocument) {
      setCurrentDocument(prev => ({
        ...prev,
        content: newContent,
        lastModified: new Date().toISOString(),
      }));
    }
  };

  // Save document function
  const saveDocument = async () => {
    if (!currentDocument) return;

    try {
      const response = await fetch(`/api/cmc/documents/${currentDocument.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
        },
        body: JSON.stringify({
          content: documentContent,
          lastModified: new Date().toISOString(),
        }),
      });

      if (response.ok) {
        console.log('Document saved successfully');
        // Update the document in the recent documents list
        setRecentDocuments(prev =>
          prev.map(doc =>
            doc.id === currentDocument.id
              ? { ...doc, content: documentContent, lastModified: new Date().toISOString() }
              : doc
          )
        );
      }
    } catch (error) {
      console.error('Failed to save document:', error);
    }
  };

  // Auto-save functionality
  useEffect(() => {
    if (documentContent && currentDocument) {
      const timeoutId = setTimeout(() => {
        saveDocument();
      }, 2000); // Auto-save after 2 seconds of inactivity

      return () => clearTimeout(timeoutId);
    }
  }, [documentContent, currentDocument]);

  // Auto-analysis trigger
  useEffect(() => {
    if (autoAnalysisEnabled && documentContent && currentDocument) {
      const debounceTimer = setTimeout(() => {
        // Use optional chaining to safely access name property
        const docName = currentDocument?.name || currentDocument?.title || 'Document';
        performAIAnalysis(documentContent, docName);
      }, 2000);

      return () => clearTimeout(debounceTimer);
    }
  }, [documentContent, autoAnalysisEnabled, currentDocument]);

  const regulatoryGuidanceMap = {
    '3.2.S.4': {
      title: 'Drug Substance Control',
      ichReferences: ['ICH Q6A', 'ICH Q3A'],
      fdaGuidance: ['Pharmaceutical Development Q8'],
      emaGuidance: ['EMA/CHMP/ICH/295/95'],
      requiredElements: [
        'Specification rationale',
        'Analytical procedures',
        'Validation of analytical procedures',
        'Batch analysis data',
        'Justification of specification limits',
      ],
    },
    '3.2.P.2': {
      title: 'Pharmaceutical Development',
      ichReferences: ['ICH Q8(R2)', 'ICH Q9', 'ICH Q10'],
      fdaGuidance: ['Pharmaceutical Development Q8 Questions and Answers'],
      emaGuidance: ['EMA/CHMP/167068/2004'],
      requiredElements: [
        'Components of the drug product',
        'Drug product development',
        'Manufacturing process development',
        'Container closure system',
        'Microbiological attributes',
        'Compatibility',
      ],
    },
  };

  // AI Functions
  const analyzeDocumentCompliance = async (content, templateName) => {
    if (!content || content.length < 10) return;

    setAiAnalysisLoading(true);
    try {
      const response = await fetch('/api/ai/analyze-compliance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getCurrentTenantId(),
        },
        body: JSON.stringify({
          content,
          templateName,
          analysisType: 'regulatory_compliance',
        }),
      });

      if (response.ok) {
        const analysis = await response.json();
        setAiGuidance(analysis);
      }
    } catch (error) {
      console.error('AI analysis failed:', error);
    } finally {
      setAiAnalysisLoading(false);
    }
  };

  // Real-time compliance analysis when content changes
  useEffect(() => {
    if (currentDocument?.content) {
      const debounceTimer = setTimeout(() => {
        // Use optional chaining to safely access template name
        const templateName = currentDocument?.template?.name || currentDocument?.name || 'Default Template';
        analyzeDocumentCompliance(currentDocument.content, templateName);
      }, 2000);

      return () => clearTimeout(debounceTimer);
    }
  }, [currentDocument?.content]);

  // Helper functions for template categorization
  const getCategoryDisplayName = (category, module) => {
    if (module && module.startsWith('3.2.S')) return 'eCTD Module 3 - Drug Substance';
    if (module && module.startsWith('3.2.P')) return 'eCTD Module 3 - Drug Product';
    if (module && module.startsWith('3.2.A')) return 'eCTD Module 3 - Appendices';
    if (module && module.startsWith('2.')) return 'CTD Module 2';
    if (category === 'quality') return 'eCTD Module 3';
    if (category === 'clinical') return 'CTD Sections';
    if (category === 'nonclinical') return 'CTD Sections';
    if (category === 'administrative') return 'NDA/BLA';
    if (module === 'IND' || module === 'IMPD') return 'IND/IMPD';
    if (module === 'NDA' || module === 'BLA') return 'NDA/BLA';
    if (module === 'POST') return 'Post-Approval Variations';
    if (module === 'SPEC') return 'Specialized Submissions';
    if (module === 'GEN' || module === 'BIO') return 'Generic/Biosimilar';
    if (module === 'HC' || module === 'PMDA' || module === 'WHO' || module === 'TGA')
      return 'International Submissions';
    if (module === 'QMS') return 'Quality Management';
    if (module === 'ATMP') return 'Advanced Therapy';
    if (module === 'COMBO') return 'Combination Products';
    return 'Other Templates';
  };

  // Load recent documents from API with localStorage fallback
  useEffect(() => {
    const loadDocuments = async () => {
      const docs = await loadDocumentsFromAPI();
      if (docs.length === 0) {
        const defaultDocs = [
          {
            id: 'doc-1',
            name: 'Quality Overall Summary Draft',
            template: { 
              name: 'Quality Overall Summary (QOS)', 
              category: 'eCTD Module 3',
              regions: ['FDA', 'EMA'],
              version: 'v1.0'
            },
            status: 'In Progress',
            lastModified: new Date(Date.now() - 86400000).toISOString(),
            progress: 75,
            content:
              'This document provides a comprehensive overview of the quality data for the drug substance and drug product...',
          },
        ];
        // Normalize default documents before setting
        const normalizedDocs = defaultDocs.map(normalizeDocument).filter(Boolean);
        setRecentDocuments(normalizedDocs);
        localStorage.setItem('cmcDocuments', JSON.stringify(normalizedDocs));
      } else {
        // Normalize loaded documents
        const normalizedDocs = docs.map(normalizeDocument).filter(Boolean).slice(0, 10);
        setRecentDocuments(normalizedDocs);
      }
    };

    loadDocuments();
  }, []);

  // Default templates in case API fails
  const defaultTemplates = [
    { id: 'default-1', name: 'Module 3.2.S Drug Substance', category: 'eCTD Module 3', regions: ['FDA', 'EMA', 'PMDA'], description: 'Complete drug substance documentation template', version: 'v1.0', aiGuidance: true },
    { id: 'default-2', name: 'Module 3.2.P Drug Product', category: 'eCTD Module 3', regions: ['FDA', 'EMA'], description: 'Drug product manufacturing and control documentation', version: 'v1.0', aiGuidance: true },
    { id: 'default-3', name: 'Clinical Study Report', category: 'Clinical', regions: ['FDA', 'EMA', 'Health Canada'], description: 'Comprehensive clinical study report template', version: 'v2.0', aiGuidance: true },
    { id: 'default-4', name: 'Stability Protocol', category: 'Quality', regions: ['FDA', 'EMA', 'PMDA'], description: 'Stability study protocol and reporting template', version: 'v1.2', aiGuidance: true },
    { id: 'default-5', name: 'Process Validation', category: 'Manufacturing', regions: ['FDA', 'EMA'], description: 'Manufacturing process validation documentation', version: 'v1.0', aiGuidance: true },
    { id: 'default-6', name: 'IND Application', category: 'Regulatory', regions: ['FDA'], description: 'Investigational New Drug application template', version: 'v3.0', aiGuidance: true },
  ];

  // Real document templates from API
  const [documentTemplates, setDocumentTemplates] = useState(defaultTemplates);

  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setTemplatesLoading(true);
        const tenantId = getCurrentTenantId();
        console.log('🔍 Loading templates for tenant:', tenantId);
        
        const response = await fetch('/api/authoring/templates', {
          headers: {
            'x-tenant-id': tenantId,
            'Content-Type': 'application/json'
          },
        });
        
        console.log('📡 Template API response status:', response.status);
        const data = await response.json();
        console.log('📋 Template API response data:', data);
        
        if (data?.success && Array.isArray(data?.templates)) {
          const transformedTemplates = data.templates
            .map(template => {
              // Skip invalid templates
              if (!template) return null;
              
              return normalizeTemplate({
                id: template?.id,
                name: template?.title || template?.name || 'Untitled Template',
                category: getCategoryDisplayName(template?.category, template?.module),
                description: template?.description || 'No description available',
                version: 'v1.0',
                regions: Array.isArray(template?.regions) ? template.regions : ['FDA', 'EMA', 'PMDA', 'Health Canada'],
                aiGuidance: true,
                template: template?.module || template?.category || 'template',
                tags: Array.isArray(template?.tags) ? template.tags : [],
                moduleNumber: template?.module,
                templateType: template?.category,
              });
            })
            .filter(Boolean); // Remove any null values
          console.log('✅ Loaded', transformedTemplates.length, 'templates from API');
          setDocumentTemplates(transformedTemplates);
        } else {
          console.warn('⚠️ No templates returned from API:', data);
          setDocumentTemplates(defaultTemplates);
        }
      } catch (error) {
        console.error('❌ CRITICAL: Failed to load templates:', error);
        console.error('Stack trace:', error.stack);
        setDocumentTemplates(defaultTemplates);
      } finally {
        setTemplatesLoading(false);
      }
    };

    loadTemplates();
  }, []);

  const createNewDocument = template => {
    // Normalize template first to ensure it has all required properties
    const normalizedTemplate = normalizeTemplate(template);
    
    // Exit early if normalization failed
    if (!normalizedTemplate) {
      console.error('Failed to normalize template:', template);
      return;
    }
    
    const newDocument = normalizeDocument({
      id: `doc-${Date.now()}`,
      name: normalizedTemplate?.name || 'New Document',
      template: normalizedTemplate,
      content: `# ${normalizedTemplate?.name || 'New Document'}\n\nDocument created from ${normalizedTemplate?.name || 'template'} template.\n\nRegulatory regions: ${Array.isArray(normalizedTemplate?.regions) && normalizedTemplate.regions.length > 0 ? normalizedTemplate.regions.join(', ') : 'Global'}\nVersion: ${normalizedTemplate?.version || 'v1.0'}\n\n## Instructions\n\nThis document has been pre-configured with AI guidance and regulatory compliance checks. Begin editing below to start creating your submission document.\n\n---\n\n[Start writing your content here...]`,
      status: 'Draft',
      progress: 0,
      lastModified: new Date().toISOString(),
      version: '1.0',
    });

    // Exit if document normalization failed
    if (!newDocument) {
      console.error('Failed to create new document');
      return;
    }

    const existingDocs = JSON.parse(localStorage.getItem('cmcDocuments') || '[]');
    // Normalize all existing documents before saving with null safety
    const normalizedDocs = (Array.isArray(existingDocs) ? existingDocs : [])
      .map(normalizeDocument)
      .filter(Boolean);
    normalizedDocs.unshift(newDocument);
    localStorage.setItem('cmcDocuments', JSON.stringify(normalizedDocs));

    setShowTemplateDialog(false);
    setShowPreviewDialog(false);
    setCurrentDocument(newDocument);
    setDocumentContent(newDocument?.content || '');
    setShowEditorView(true);
  };

  const handlePreviewTemplate = template => {
    setPreviewTemplate(template);
    setShowPreviewDialog(true);
  };

  // API functions for real database persistence
  const saveDocumentToAPI = async () => {
    if (!currentDocument) return;

    try {
      const tenantId = getCurrentTenantId();

      // Create or update document
      const docResponse = await fetch('/api/authoring/docs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': tenantId,
          'x-user-id': 'current-user',
        },
        body: JSON.stringify({
          title: currentDocument.title || 'Untitled Document',
          module: 'M3',
          product_code: 'DEMO-001',
          locale: 'en-US',
          content: documentContent,
        }),
      });

      if (docResponse.ok) {
        const docResult = await docResponse.json();

        // Create/update section with current content
        const sectionResponse = await fetch('/api/authoring/sections', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': tenantId,
            'x-user-id': 'current-user',
          },
          body: JSON.stringify({
            doc_id: docResult.document.id,
            code: selectedSection || '3.2.S.1',
            title: currentDocument.title || 'Untitled Section',
            content: documentContent,
            order_index: 1,
          }),
        });

        if (sectionResponse.ok) {
          console.log('Document saved successfully to database');
          // Update localStorage as backup
          saveToLocalStorage();
          return true;
        }
      }
    } catch (error) {
      console.error('API save failed, falling back to localStorage:', error);
      saveToLocalStorage();
    }
  };

  // Load documents from API
  const loadDocumentsFromAPI = async () => {
    try {
      const tenantId = getCurrentTenantId();
      const response = await fetch(`/api/authoring/docs?module=M3`, {
        headers: {
          'x-tenant-id': tenantId,
        },
      });

      if (response.ok) {
        const result = await response.json();
        if (result?.success && Array.isArray(result?.documents)) {
          const formattedDocs = result.documents
            .map(doc => {
              // Skip invalid documents
              if (!doc) return null;
              
              return normalizeDocument({
                id: doc?.id,
                title: doc?.title,
                name: doc?.title, // Ensure both name and title exist
                module: doc?.module,
                status: doc?.status,
                lastModified: doc?.updated_at,
                content: '', // Will be loaded separately
                version: '1.0',
                // Add default template if missing
                template: doc?.template || {
                  name: doc?.title || 'Default Template',
                  category: 'eCTD Module 3',
                  regions: ['FDA', 'EMA'],
                  version: 'v1.0'
                }
              });
            })
            .filter(Boolean); // Remove any null values
          setRecentDocuments(formattedDocs.slice(0, 10));
          return formattedDocs;
        }
      }
    } catch (error) {
      console.error('Failed to load from API, using localStorage:', error);
    }

    // Fallback to localStorage with normalization
    const localDocs = JSON.parse(localStorage.getItem('cmcDocuments') || '[]');
    return localDocs.map(normalizeDocument).filter(Boolean);
  };

  // Local save functionality using localStorage as fallback
  const saveToLocalStorage = () => {
    if (currentDocument) {
      const existingDocs = JSON.parse(localStorage.getItem('cmcDocuments') || '[]');
      // Normalize the current document before saving
      const normalizedCurrent = normalizeDocument(currentDocument);
      const updatedDocs = existingDocs.map(doc =>
        doc.id === normalizedCurrent.id ? normalizedCurrent : normalizeDocument(doc)
      ).filter(Boolean);
      localStorage.setItem('cmcDocuments', JSON.stringify(updatedDocs));
      setRecentDocuments(updatedDocs.slice(0, 10));
    }
  };

  const closeEditor = () => {
    setShowEditorView(false);
    setCurrentDocument(null);
  };

  // Filter templates with complete null safety
  const filteredTemplates = (documentTemplates || []).filter(template => {
    // Skip null/undefined templates
    if (!template) return false;
    
    const matchesCategory = selectedCategory === 'all' || template?.category === selectedCategory;
    const matchesRegion = selectedRegion === 'all' || 
                          (Array.isArray(template?.regions) && template.regions.includes(selectedRegion));
    const matchesSearch =
      !searchQuery ||
      (template?.name?.toLowerCase()?.includes(searchQuery.toLowerCase())) ||
      (template?.description?.toLowerCase()?.includes(searchQuery.toLowerCase()));

    return matchesCategory && matchesRegion && matchesSearch;
  });

  const categories = [...new Set((documentTemplates || [])
    .filter(t => t?.category)
    .map(t => t.category))];
  const regions = [...new Set((documentTemplates || [])
    .filter(t => Array.isArray(t?.regions))
    .flatMap(t => t.regions || []))];

  // CMC-Grade Document Editor View
  if (showEditorView && currentDocument) {
    return (
      <div className="h-screen flex flex-col bg-gray-50">
        {/* CMC Document Editor Header Bar */}
        <div className="bg-white border-b px-6 py-3 flex items-center justify-between shadow-sm">
          <div className="flex items-center space-x-4">
            <Button
              variant="ghost"
              onClick={closeEditor}
              className="text-gray-600 hover:text-gray-800"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Templates
            </Button>
            <div className="text-sm text-gray-500">
              {selectedSection} •{' '}
              {regulatoryGuidanceMap[selectedSection]?.title || 'Document Section'}
            </div>
            <div className="flex items-center space-x-2">
              {documentState === 'LOCKED' && <Lock className="h-4 w-4 text-red-500" />}
              <Badge
                variant={
                  documentState === 'LOCKED'
                    ? 'destructive'
                    : documentState === 'REGULATORY_APPROVAL'
                      ? 'default'
                      : 'secondary'
                }
              >
                {documentState.replace('_', ' ')}
              </Badge>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <Button
              variant={trackChangesMode ? 'default' : 'ghost'}
              size="sm"
              onClick={() => setTrackChangesMode(!trackChangesMode)}
            >
              <GitBranch className="h-4 w-4 mr-1" />
              Track Changes
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={saveDocumentToAPI}
              className="bg-blue-600 hover:bg-blue-700 text-white"
              title="Save to Database"
            >
              <Save className="h-4 w-4 mr-1" />
              Save
            </Button>
            {/* Export Button with Dropdown */}
            <Select 
              value={exportFormat} 
              onValueChange={(format) => {
                setExportFormat(format);
                exportDocument(format);
              }}
            >
              <SelectTrigger className="w-32 h-8" disabled={isExporting}>
                {isExporting ? (
                  <div className="flex items-center">
                    <Clock className="h-4 w-4 mr-1 animate-spin" />
                    Exporting...
                  </div>
                ) : (
                  <div className="flex items-center">
                    <Download className="h-4 w-4 mr-1" />
                    Export
                  </div>
                )}
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="docx">Export as Word</SelectItem>
                <SelectItem value="pdf">Export as PDF</SelectItem>
                <SelectItem value="xml">Export as eCTD XML</SelectItem>
              </SelectContent>
            </Select>
            {/* Submit Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSubmitDialog(true)}
              disabled={currentDocument?.status !== 'DRAFT' && currentDocument?.status !== 'draft'}
              className="border-green-500 text-green-700 hover:bg-green-50"
            >
              <Send className="h-4 w-4 mr-1" />
              Submit
            </Button>
            {/* Sign Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowSignDialog(true)}
              disabled={documentIsFrozen}
              className="border-purple-500 text-purple-700 hover:bg-purple-50"
            >
              <Edit3 className="h-4 w-4 mr-1" />
              Sign
            </Button>
            {/* Freeze Button */}
            <Button
              size="sm"
              variant="outline"
              onClick={() => setShowFreezeDialog(true)}
              disabled={documentIsFrozen || (currentDocument?.status !== 'APPROVED' && currentDocument?.status !== 'approved')}
              className="border-red-500 text-red-700 hover:bg-red-50"
            >
              {documentIsFrozen ? (
                <><Lock className="h-4 w-4 mr-1" /> Frozen</>
              ) : (
                <><Unlock className="h-4 w-4 mr-1" /> Freeze</>
              )}
            </Button>
            {/* Templates Button */}
            <DropdownMenu open={showTemplateMenu} onOpenChange={setShowTemplateMenu}>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="border-indigo-500 text-indigo-700 hover:bg-indigo-50"
                >
                  <FileText className="h-4 w-4 mr-1" />
                  Templates
                  <ChevronDown className="h-3 w-3 ml-1" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-72 max-h-96 overflow-y-auto">
                <DropdownMenuLabel>
                  <div className="flex items-center justify-between">
                    <span>Document Templates</span>
                    {templatesLoading && <Clock className="h-3 w-3 animate-spin" />}
                  </div>
                </DropdownMenuLabel>
                <div className="px-2 py-1">
                  <Input
                    type="text"
                    placeholder="Search templates..."
                    value={templateSearchQuery}
                    onChange={(e) => setTemplateSearchQuery(e.target.value)}
                    className="h-7 text-xs"
                  />
                </div>
                <DropdownMenuSeparator />
                {recentlyUsedTemplates.length > 0 && (
                  <>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      Recently Used
                    </DropdownMenuLabel>
                    {recentlyUsedTemplates.map((template) => (
                      <DropdownMenuItem
                        key={`recent-${template.id}`}
                        onClick={() => applyTemplate(template.id)}
                        className="cursor-pointer"
                      >
                        <div className="flex items-start space-x-2">
                          <FileCheck className="h-4 w-4 mt-0.5 text-blue-500" />
                          <div className="flex-1">
                            <div className="text-sm font-medium">{template.name}</div>
                            <div className="text-xs text-gray-500">{template.description}</div>
                          </div>
                        </div>
                      </DropdownMenuItem>
                    ))}
                    <DropdownMenuSeparator />
                  </>
                )}
                {TEMPLATE_CATEGORIES.filter(cat => cat.value !== 'all').map((category) => (
                  <div key={category.value}>
                    <DropdownMenuLabel className="text-xs text-muted-foreground">
                      {category.label}
                    </DropdownMenuLabel>
                    {templates
                      .filter(t => t.category === category.value && 
                        (templateSearchQuery === '' || 
                         t.name.toLowerCase().includes(templateSearchQuery.toLowerCase())))
                      .map((template) => (
                        <DropdownMenuItem
                          key={template.id}
                          onClick={() => applyTemplate(template.id)}
                          className="cursor-pointer"
                        >
                          <div className="flex items-start space-x-2">
                            {template.icon ? (
                              <template.icon className="h-4 w-4 mt-0.5 text-blue-500" />
                            ) : (
                              <FileText className="h-4 w-4 mt-0.5 text-blue-500" />
                            )}
                            <div className="flex-1">
                              <div className="text-sm font-medium">{template.name}</div>
                              <div className="text-xs text-gray-500">{template.description}</div>
                              <div className="flex items-center gap-1 mt-1">
                                {template.regions?.map((region) => (
                                  <Badge key={region} variant="secondary" className="text-xs px-1 py-0">
                                    {region}
                                  </Badge>
                                ))}
                                <span className="text-xs text-gray-400 ml-1">
                                  Used {template.usage_count || 0} times
                                </span>
                              </div>
                            </div>
                          </div>
                        </DropdownMenuItem>
                      ))}
                  </div>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            {/* Guidance Toggle */}
            <Button
              size="sm"
              variant={guidanceDrawerOpen ? "default" : "outline"}
              onClick={toggleGuidanceDrawer}
              className={guidanceDrawerOpen ? "bg-blue-600 hover:bg-blue-700" : ""}
            >
              <Lightbulb className="h-4 w-4 mr-1" />
              Guidance
            </Button>
            <Select defaultValue="en-US">
              <SelectTrigger className="w-20 h-8">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="en-US">EN (FDA)</SelectItem>
                <SelectItem value="en-EU">EN (EMA)</SelectItem>
                <SelectItem value="ja-JP">JA (PMDA)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Main Editor Layout: Left Rail + Main Canvas + Right Context Panel */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Rail: Dossier Tree */}
          <div className="w-80 bg-white border-r flex flex-col">
            <div className="p-4 border-b bg-gray-50">
              <h3 className="font-semibold text-sm flex items-center">
                <FolderOpen className="h-4 w-4 mr-2 text-blue-500" />
                Dossier Structure
              </h3>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {Object.entries(dossierStructure).map(([moduleName, sections]) => (
                <div key={moduleName} className="mb-4">
                  <div className="flex items-center p-2 text-sm font-medium text-gray-700 bg-gray-100 rounded">
                    <ChevronDown className="h-4 w-4 mr-1" />
                    {moduleName}
                  </div>
                  {Object.entries(sections).map(([sectionGroup, subsections]) => (
                    <div key={sectionGroup} className="ml-4 mt-2">
                      <div className="flex items-center p-1 text-xs font-medium text-gray-600">
                        <ChevronRight className="h-3 w-3 mr-1" />
                        {sectionGroup}
                      </div>
                      {Object.entries(subsections).map(([sectionId, sectionData]) => (
                        <div
                          key={sectionId}
                          className={`ml-6 flex items-center p-2 text-sm cursor-pointer rounded transition-colors ${
                            selectedSection === sectionId
                              ? 'bg-blue-100 text-blue-800'
                              : 'hover:bg-gray-50'
                          }`}
                          onClick={() => setSelectedSection(sectionId)}
                        >
                          <div className="flex-1">
                            <div className="font-medium">{sectionId}</div>
                            <div className="text-xs text-gray-500">{sectionData.title}</div>
                          </div>
                          <div className="flex items-center space-x-1">
                            <Badge
                              variant={sectionData.status === 'Complete' ? 'default' : 'secondary'}
                              className="text-xs"
                            >
                              {sectionData.status}
                            </Badge>
                            <div
                              className={`w-2 h-2 rounded-full ${
                                sectionData.validation === 'Pass'
                                  ? 'bg-green-500'
                                  : sectionData.validation === 'Minor Issues'
                                    ? 'bg-yellow-500'
                                    : sectionData.validation === 'Major Issues'
                                      ? 'bg-red-500'
                                      : 'bg-gray-300'
                              }`}
                              title={sectionData.validation}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          {/* Main Canvas: Rich Editor */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Enhanced Toolbar with Word Integration */}
            <div className="bg-white border-b px-4 py-2 space-y-2">
              {/* Title Row */}
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">
                  {selectedSection} -{' '}
                  {regulatoryGuidanceMap[selectedSection]?.title || 'Document Section'}
                </h2>
                <div className="flex items-center space-x-2">
                  <Badge variant="outline" className="text-xs">
                    Words: {documentContent.split(' ').filter(word => word.length > 0).length}
                  </Badge>
                  <Badge variant="outline" className="text-xs">
                    Chars: {documentContent.length}
                  </Badge>
                </div>
              </div>

              {/* Main Toolbar */}
              <div className="flex items-center justify-between">
                {/* File Operations */}
                <div className="flex items-center space-x-1">
                  <input
                    type="file"
                    accept=".docx,.doc"
                    onChange={handleWordUpload}
                    style={{ display: 'none' }}
                    id="word-upload"
                  />
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => document.getElementById('word-upload').click()}
                    disabled={isUploading}
                    title="Import from Word Document"
                  >
                    {isUploading ? (
                      <Clock className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1" />
                    )}
                    Import Word
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleWordDownload}
                    disabled={isDownloading || !documentContent}
                    title="Export to Word Document"
                  >
                    {isDownloading ? (
                      <Clock className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-1" />
                    )}
                    Export Word
                  </Button>
                </div>

                {/* Formatting Tools */}
                <div className="flex items-center space-x-1">
                  <Button
                    size="sm"
                    variant={editorState.bold ? 'default' : 'ghost'}
                    onClick={() => applyFormat('bold')}
                    title="Bold"
                  >
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={editorState.italic ? 'default' : 'ghost'}
                    onClick={() => applyFormat('italic')}
                    title="Italic"
                  >
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={editorState.underline ? 'default' : 'ghost'}
                    onClick={() => applyFormat('underline')}
                    title="Underline"
                  >
                    <Underline className="h-4 w-4" />
                  </Button>
                  <div className="h-4 w-px bg-gray-300 mx-1"></div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => applyFormat('h1')}
                    title="Heading 1"
                  >
                    H1
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => applyFormat('h2')}
                    title="Heading 2"
                  >
                    H2
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => applyFormat('bullet')}
                    title="Bullet List"
                  >
                    <List className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => applyFormat('number')}
                    title="Numbered List"
                  >
                    <ListOrdered className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => applyFormat('quote')}
                    title="Quote"
                  >
                    <Quote className="h-4 w-4" />
                  </Button>
                </div>

                {/* Content Tools */}
                <div className="flex items-center space-x-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Insert Smart Placeholder"
                    onClick={() => insertContent('[PLACEHOLDER: Enter specific information]')}
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant={citationMode ? 'default' : 'ghost'}
                    title="Insert Citation"
                    onClick={() => setCitationMode(!citationMode)}
                  >
                    <Link2 className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    title="Insert Data Table"
                    onClick={() =>
                      editor?.chain().focus().insertContent(
                        '\n\n| Parameter | Specification | Result |\n|-----------|---------------|--------|\n| [Parameter] | [Spec] | [Result] |\n\n'
                      ).run()
                    }
                  >
                    <Table className="h-4 w-4" />
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => generateBoilerplate('regulatory_template', selectedSection)}
                    disabled={aiBoilerplateLoading}
                    title="Generate AI Content"
                  >
                    {aiBoilerplateLoading ? (
                      <Clock className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4 mr-1" />
                    )}
                    AI Generate
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={recomputeWithLimsData}
                    disabled={recomputeLoading || !currentDocument}
                    title="Refresh validation experiments with latest LIMS data"
                    className="bg-blue-50 hover:bg-blue-100 border-blue-200"
                  >
                    {recomputeLoading ? (
                      <Clock className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <BarChart2 className="h-4 w-4 mr-1" />
                    )}
                    Recompute in Doc
                  </Button>
                </div>
              </div>
            </div>

            {/* Rich Text Editor with CMC-specific features */}
            <div
              className="flex-1 p-6 overflow-y-auto"
              style={{ fontFamily: 'Times New Roman, serif' }}
            >
              {/* Document Header */}
              <div className="mb-6 p-4 bg-gray-50 border-l-4 border-blue-500">
                <h1 className="text-xl font-bold mb-2">
                  {selectedSection} {regulatoryGuidanceMap[selectedSection]?.title}
                </h1>
                <div className="text-sm text-gray-600">
                  <strong>Drug Product:</strong>{' '}
                  <input
                    type="text"
                    placeholder="Enter drug product name"
                    className="border-b border-gray-300 bg-transparent px-1"
                  />
                  <span className="mx-4">•</span>
                  <strong>Dosage Form:</strong>{' '}
                  <input
                    type="text"
                    placeholder="Enter dosage form"
                    className="border-b border-gray-300 bg-transparent px-1"
                  />
                  <span className="mx-4">•</span>
                  <strong>Strength:</strong>{' '}
                  <input
                    type="text"
                    placeholder="Enter strength"
                    className="border-b border-gray-300 bg-transparent px-1"
                  />
                </div>
              </div>

              {/* Required Elements Checklist */}
              {regulatoryGuidanceMap[selectedSection] && (
                <div className="mb-6 p-4 bg-blue-50 rounded border">
                  <h3 className="font-semibold mb-2 flex items-center">
                    <CheckCircle className="h-4 w-4 mr-2 text-blue-500" />
                    Required Elements (ICH Q6A/Q8)
                  </h3>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    {regulatoryGuidanceMap[selectedSection].requiredElements.map(
                      (element, index) => (
                        <div key={index} className="flex items-center">
                          <input type="checkbox" className="mr-2" />
                          <span>{element}</span>
                        </div>
                      )
                    )}
                  </div>
                </div>
              )}

              {/* Main Content Area */}
              <div className="space-y-6">
                <div className="border rounded-lg overflow-hidden">
                  <div className="bg-gray-100 px-4 py-2 border-b">
                    <h4 className="font-medium flex items-center">
                      <Shield className="h-4 w-4 mr-2 text-green-500" />
                      1. Regulatory Summary and Rationale
                    </h4>
                  </div>
                  <div className="p-4">
                    <textarea
                      id="document-editor"
                      value={documentContent}
                      onChange={e => {
                        const newContent = e.target.value;
                        setDocumentContent(newContent);
                        if (currentDocument) {
                          setCurrentDocument({
                            ...currentDocument,
                            content: newContent,
                            lastModified: new Date().toISOString(),
                          });
                        }
                        // Trigger real-time AI analysis
                        getRealTimeSuggestions(newContent);
                      }}
                      className="w-full h-64 p-3 border border-gray-200 rounded resize-none focus:ring-2 focus:ring-blue-500"
                      style={{
                        fontFamily: 'Times New Roman, serif',
                        fontSize: '12pt',
                        lineHeight: '1.6',
                      }}
                      placeholder="Provide a summary of the regulatory approach and rationale for this section. Include references to applicable ICH guidelines, pharmacopoeial standards, and regulatory precedents..."
                    />
                    <div className="mt-2 flex items-center justify-between text-xs text-gray-500">
                      <div className="flex items-center space-x-4">
                        <span>
                          {documentContent.split(' ').filter(w => w.length > 0).length} words
                        </span>
                        <span>{documentContent.length} characters</span>
                        <span>Lines: {documentContent.split('\n').length}</span>
                        {lastAnalysisTime && (
                          <span>
                            Last Analysis: {new Date(lastAnalysisTime).toLocaleTimeString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center space-x-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => generateBoilerplate('regulatory_summary', selectedSection)}
                          disabled={aiBoilerplateLoading}
                        >
                          {aiBoilerplateLoading ? (
                            <Clock className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Sparkles className="h-3 w-3 mr-1" />
                          )}
                          Generate Template
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => performAIAnalysis(documentContent, selectedSection)}
                          disabled={aiAnalysisLoading}
                        >
                          {aiAnalysisLoading ? (
                            <Clock className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Brain className="h-3 w-3 mr-1" />
                          )}
                          Analyze
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Specification Table for control sections */}
                {(selectedSection === '3.2.S.4' || selectedSection === '3.2.P.5') && (
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-100 px-4 py-2 border-b flex items-center justify-between">
                      <h4 className="font-medium flex items-center">
                        <FileType className="h-4 w-4 mr-2 text-purple-500" />
                        2. Specification Table
                      </h4>
                      <Badge variant="outline">Live QMS Data</Badge>
                    </div>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-left border-b">Attribute</th>
                            <th className="px-4 py-2 text-left border-b">Method</th>
                            <th className="px-4 py-2 text-left border-b">Acceptance Criteria</th>
                            <th className="px-4 py-2 text-left border-b">Justification</th>
                          </tr>
                        </thead>
                        <tbody>
                          <tr>
                            <td className="px-4 py-2 border-b">Assay</td>
                            <td className="px-4 py-2 border-b">HPLC (Method VAL-033)</td>
                            <td className="px-4 py-2 border-b">95.0 - 105.0% w/w</td>
                            <td className="px-4 py-2 border-b">
                              <button className="text-blue-600 hover:underline">
                                [Cite: ICH_Q6A_Guidelines#Section3.1]
                              </button>
                            </td>
                          </tr>
                          <tr>
                            <td className="px-4 py-2 border-b">Related Substances</td>
                            <td className="px-4 py-2 border-b">HPLC (Method VAL-034)</td>
                            <td className="px-4 py-2 border-b">Total: ≤ 2.0%</td>
                            <td className="px-4 py-2 border-b">
                              <button className="text-blue-600 hover:underline">
                                [Cite: BatchAnalysis_DP001#Table3]
                              </button>
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="p-2 bg-gray-50 text-xs text-gray-600">
                      <Database className="inline h-3 w-3 mr-1" />
                      Live data from QMS System • Last updated: 2025-08-16 09:15
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Right Context Panel: Guidance, Data, Citations, History */}
          <div className="w-96 bg-white border-l flex flex-col">
            <Tabs
              value={rightPanelTab}
              onValueChange={setRightPanelTab}
              className="flex-1 flex flex-col"
            >
              <TabsList className="grid w-full grid-cols-5 bg-gray-100 m-2">
                <TabsTrigger value="ai-assistant" className="text-xs">
                  <Brain className="h-3 w-3 mr-1" />
                  AI
                </TabsTrigger>
                <TabsTrigger value="guidance" className="text-xs">
                  Guide
                </TabsTrigger>
                <TabsTrigger value="data" className="text-xs">
                  Data
                </TabsTrigger>
                <TabsTrigger value="citations" className="text-xs">
                  Cite
                </TabsTrigger>
                <TabsTrigger value="history" className="text-xs">
                  History
                </TabsTrigger>
              </TabsList>

              {/* AI Assistant Tab */}
              <TabsContent value="ai-assistant" className="flex-1 overflow-hidden">
                <AIAssistantPanel
                  scores={scores}
                  suggestions={allSuggestions}
                  isAnalyzing={isAnalyzing}
                  onAnalyze={() => analyzeContent()}
                  onReviewAll={() => {
                    // Show all suggestions in editor
                    setRightPanelTab('ai-assistant');
                  }}
                  onBatchAccept={(ids) => {
                    batchAccept(ids).then((accepted) => {
                      // Apply accepted suggestions to content
                      let newContent = documentContent;
                      accepted.forEach(sugg => {
                        newContent = newContent.replace(sugg.original, sugg.suggested);
                      });
                      setDocumentContent(newContent);
                    });
                  }}
                  onBatchReject={batchReject}
                />
              </TabsContent>

              {/* Guidance Tab */}
              <TabsContent value="guidance" className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center">
                    <BookOpen className="h-4 w-4 mr-2 text-blue-500" />
                    ICH Guidelines
                  </h4>
                  {regulatoryGuidanceMap[selectedSection] && (
                    <div className="space-y-2 text-sm">
                      {regulatoryGuidanceMap[selectedSection].ichReferences.map((ref, index) => (
                        <div key={index} className="p-2 bg-blue-50 rounded border">
                          <div className="font-medium text-blue-800">{ref}</div>
                          <div className="text-xs text-gray-600 mt-1">
                            Click to view relevant excerpts and checklists
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center">
                    <AlertCircle className="h-4 w-4 mr-2 text-yellow-500" />
                    Common Deficiencies
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="p-2 bg-yellow-50 rounded border border-yellow-200">
                      <div className="text-xs text-yellow-800">
                        Missing stability commitment for post-approval studies
                      </div>
                    </div>
                    <div className="p-2 bg-red-50 rounded border border-red-200">
                      <div className="text-xs text-red-800">
                        Insufficient justification for specification limits
                      </div>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Data Tab */}
              <TabsContent value="data" className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center">
                    <Database className="h-4 w-4 mr-2 text-green-500" />
                    Live Data Sources
                  </h4>
                  <div className="space-y-2 text-sm">
                    <div className="p-2 bg-green-50 rounded border">
                      <div className="font-medium">QC Laboratory Data</div>
                      <div className="text-xs text-gray-600">Real-time batch analysis results</div>
                      <Button size="sm" variant="outline" className="mt-2 text-xs">
                        Insert Latest Results
                      </Button>
                    </div>
                    <div className="p-2 bg-blue-50 rounded border">
                      <div className="font-medium">Stability Study Data</div>
                      <div className="text-xs text-gray-600">
                        Ongoing stability protocols and results
                      </div>
                      <Button size="sm" variant="outline" className="mt-2 text-xs">
                        Insert Summary Table
                      </Button>
                    </div>
                  </div>
                </div>
              </TabsContent>

              {/* Citations Tab */}
              <TabsContent value="citations" className="flex-1 overflow-y-auto p-4 space-y-4">
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center">
                    <Link className="h-4 w-4 mr-2 text-orange-500" />
                    Citation Manager
                  </h4>
                  <div className="space-y-2">
                    {Array.isArray(citationsDatabase) && citationsDatabase.map(citation => (
                      <div key={citation.id} className="p-2 border rounded text-sm">
                        <div className="font-medium text-orange-800">{citation.label}</div>
                        <div className="text-xs text-gray-600">{citation.source}</div>
                        <div className="flex items-center justify-between mt-1">
                          <Badge variant="outline" className="text-xs">
                            {citation.confidence}
                          </Badge>
                          <Button size="sm" variant="ghost" className="text-xs">
                            Insert
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              {/* History Tab */}
              <TabsContent value="history" className="flex-1 overflow-y-auto p-4 space-y-4">
                {/* Export History Section */}
                <div>
                  <h4 className="font-semibold text-sm mb-4 flex items-center">
                    <Download className="h-4 w-4 mr-2 text-blue-500" />
                    Export History
                  </h4>
                  
                  {/* Export History Filters */}
                  <div className="mb-4 space-y-2">
                    <div className="flex items-center justify-between mb-2">
                      <div className="text-xs text-gray-600">
                        Total Exports: <span className="font-semibold">{exportHistoryTotal}</span>
                        {lastExport && (
                          <span className="ml-2">
                            • Last: {formatRelativeTime(lastExport.exported_at)}
                          </span>
                        )}
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => fetchExportHistory()}
                        disabled={exportHistoryLoading}
                      >
                        <ArrowLeft className="h-3 w-3 mr-1" />
                        Refresh
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-3 gap-2">
                      <Select
                        value={exportHistoryFilter.exportType}
                        onValueChange={(value) => 
                          setExportHistoryFilter({...exportHistoryFilter, exportType: value})
                        }
                      >
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="All Types" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Types</SelectItem>
                          <SelectItem value="docx">DOCX</SelectItem>
                          <SelectItem value="pdf">PDF</SelectItem>
                          <SelectItem value="html">HTML</SelectItem>
                          <SelectItem value="xml">XML</SelectItem>
                        </SelectContent>
                      </Select>
                      
                      <Input
                        type="date"
                        placeholder="Start Date"
                        value={exportHistoryFilter.startDate}
                        onChange={(e) => 
                          setExportHistoryFilter({...exportHistoryFilter, startDate: e.target.value})
                        }
                        className="h-8 text-xs"
                      />
                      
                      <Input
                        type="date"
                        placeholder="End Date"
                        value={exportHistoryFilter.endDate}
                        onChange={(e) => 
                          setExportHistoryFilter({...exportHistoryFilter, endDate: e.target.value})
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                  </div>
                  
                  {/* Export History Table */}
                  {exportHistoryLoading ? (
                    <div className="flex items-center justify-center py-8">
                      <div className="text-xs text-gray-500">Loading export history...</div>
                    </div>
                  ) : exportHistory.length === 0 ? (
                    <div className="text-center py-8 text-gray-500">
                      <FileText className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                      <p className="text-xs">No exports yet</p>
                      <p className="text-xs mt-1">Export the document to see history here</p>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {exportHistory.map((entry) => (
                        <div
                          key={entry.id}
                          className="p-3 border rounded-lg hover:bg-gray-50 transition-colors"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {entry.export_type === 'pdf' ? (
                                  <Badge variant="destructive" className="text-xs">
                                    <FileType className="h-3 w-3 mr-1" />
                                    PDF
                                  </Badge>
                                ) : entry.export_type === 'docx' ? (
                                  <Badge className="text-xs bg-blue-500">
                                    <FileText className="h-3 w-3 mr-1" />
                                    DOCX
                                  </Badge>
                                ) : entry.export_type === 'html' ? (
                                  <Badge variant="outline" className="text-xs text-green-600 border-green-600">
                                    <Code className="h-3 w-3 mr-1" />
                                    HTML
                                  </Badge>
                                ) : (
                                  <Badge variant="secondary" className="text-xs">
                                    <FileDown className="h-3 w-3 mr-1" />
                                    {entry.export_type?.toUpperCase()}
                                  </Badge>
                                )}
                                <span className="text-xs font-medium">
                                  {entry.file_name || 'Unnamed Export'}
                                </span>
                              </div>
                              
                              <div className="text-xs text-gray-600">
                                <span className="mr-3">
                                  <Clock className="h-3 w-3 inline mr-1" />
                                  {formatRelativeTime(entry.exported_at)}
                                </span>
                                <span className="mr-3">
                                  <User className="h-3 w-3 inline mr-1" />
                                  {entry.exported_by}
                                </span>
                                <span>
                                  <Database className="h-3 w-3 inline mr-1" />
                                  {formatFileSize(entry.file_size)}
                                </span>
                              </div>
                              
                              {entry.metadata && (
                                <div className="text-xs text-gray-500 mt-1">
                                  Version: {entry.metadata.version || 'N/A'} • 
                                  Sections: {entry.metadata.sections || 'N/A'}
                                </div>
                              )}
                            </div>
                            
                            <div className="flex items-center gap-1">
                              {entry.download_url && new Date(entry.cached_until) > new Date() && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7"
                                  onClick={() => window.open(entry.download_url, '_blank')}
                                >
                                  <Download className="h-3 w-3" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 text-red-600 hover:text-red-700"
                                onClick={() => deleteExportHistoryEntry(entry.id)}
                                disabled={deletingExportId === entry.id}
                              >
                                <X className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
                
                {/* Divider */}
                <div className="border-t pt-4"></div>
                
                {/* Version History Section */}
                <div>
                  <h4 className="font-semibold text-sm mb-2 flex items-center">
                    <History className="h-4 w-4 mr-2 text-gray-500" />
                    Version History
                  </h4>
                  <div className="space-y-2">
                    {Array.isArray(versionHistory) && versionHistory.map((version, index) => (
                      <div key={index} className="p-2 border rounded text-sm">
                        <div className="flex items-center justify-between">
                          <div className="font-medium">v{version.version}</div>
                          <Badge variant="outline" className="text-xs">
                            {version.status}
                          </Badge>
                        </div>
                        <div className="text-xs text-gray-600 mt-1">{version.author}</div>
                        <div className="text-xs text-gray-500 mt-1">{version.changes}</div>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(version.date).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </div>
    );
  }

  // Template Library View
  return (
    <div className="p-6 space-y-6 bg-gradient-to-br from-blue-50 to-indigo-100 min-h-screen">
      {/* Header */}
      <div className="bg-white p-6 rounded-lg shadow-sm border">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Document Authoring & Templates</h1>
            <p className="text-gray-600 mt-1">
              Create regulatory documents from professional templates with AI-powered guidance
            </p>
          </div>
          <div className="flex items-center space-x-3">
            <Button
              onClick={() => setShowTemplateDialog(true)}
              className="bg-blue-600 hover:bg-blue-700"
            >
              <Plus className="h-4 w-4 mr-2" />
              New Document
            </Button>
          </div>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <FileText className="h-8 w-8 text-blue-500" />
              <div>
                <p className="text-2xl font-bold">{Array.isArray(documentTemplates) ? documentTemplates.length : 0}</p>
                <p className="text-sm text-gray-600">Available Templates</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Edit3 className="h-8 w-8 text-green-500" />
              <div>
                <p className="text-2xl font-bold">{Array.isArray(recentDocuments) ? recentDocuments.length : 0}</p>
                <p className="text-sm text-gray-600">Active Documents</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Globe className="h-8 w-8 text-purple-500" />
              <div>
                <p className="text-2xl font-bold">{Array.isArray(regions) ? regions.length : 0}</p>
                <p className="text-sm text-gray-600">Regulatory Regions</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-4">
            <div className="flex items-center space-x-2">
              <Sparkles className="h-8 w-8 text-yellow-500" />
              <div>
                <p className="text-2xl font-bold">AI</p>
                <p className="text-sm text-gray-600">Enhanced Templates</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Content */}
      <Tabs value={activeView} onValueChange={setActiveView} className="space-y-6">
        <TabsList className="bg-white p-1 rounded-lg shadow-sm">
          <TabsTrigger
            value="overview"
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            Recent Documents
          </TabsTrigger>
          <TabsTrigger
            value="templates"
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white"
          >
            Template Library
          </TabsTrigger>
          <TabsTrigger
            value="comments"
            className="data-[state=active]:bg-blue-600 data-[state=active]:text-white relative"
          >
            <span className="flex items-center space-x-2">
              <MessageSquare className="h-4 w-4" />
              <span>Comments & Review</span>
              {filteredComments.length > 0 && (
                <Badge className="ml-2 bg-red-500 text-white text-xs px-1.5 py-0.5">
                  {filteredComments.filter(c => c.status === 'open').length}
                </Badge>
              )}
            </span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <Card>
            <CardHeader>
              <CardTitle>Recent Documents</CardTitle>
              <CardDescription>Your recently created and modified documents</CardDescription>
            </CardHeader>
            <CardContent>
              {Array.isArray(recentDocuments) && recentDocuments.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {recentDocuments.map(doc => (
                    <Card
                      key={doc.id}
                      className="hover:shadow-md transition-shadow cursor-pointer"
                      onClick={() => {
                        setCurrentDocument(doc);
                        setShowEditorView(true);
                      }}
                    >
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-medium text-sm">{doc?.name || 'Untitled'}</h3>
                          <Badge
                            variant={doc.status === 'Complete' ? 'default' : 'secondary'}
                            className="text-xs"
                          >
                            {doc?.status || 'Draft'}
                          </Badge>
                        </div>
                        <p className="text-xs text-gray-600 mb-3">{doc?.template?.name || 'No template'}</p>
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span>Progress</span>
                            <span>{doc?.progress || 0}%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                              style={{ width: `${doc?.progress || 0}%` }}
                            />
                          </div>
                          <div className="flex justify-between text-xs text-gray-500">
                            <span>Modified: {doc?.lastModified ? new Date(doc.lastModified).toLocaleDateString() : 'Unknown'}</span>
                            <span>{doc?.version || 'v1.0'}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-8">
                  <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">
                    No documents yet. Create your first document from a template.
                  </p>
                  <Button
                    onClick={() => setShowTemplateDialog(true)}
                    className="mt-4 bg-blue-600 hover:bg-blue-700"
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create Document
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="templates">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Template Library</CardTitle>
                  <CardDescription>
                    Choose from {Array.isArray(documentTemplates) ? documentTemplates.length : 0} professional regulatory templates
                  </CardDescription>
                </div>
                <div className="flex items-center space-x-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-3 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search templates..."
                      value={searchQuery}
                      onChange={e => setSearchQuery(e.target.value)}
                      className="pl-10 w-64"
                    />
                  </div>
                  <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="All Categories" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Categories</SelectItem>
                      {Array.isArray(categories) && categories.map(category => (
                        <SelectItem key={category} value={category}>
                          {category}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select value={selectedRegion} onValueChange={setSelectedRegion}>
                    <SelectTrigger className="w-40">
                      <SelectValue placeholder="All Regions" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Regions</SelectItem>
                      {Array.isArray(regions) && regions.map(region => (
                        <SelectItem key={region} value={region}>
                          {region}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {templatesLoading ? (
                <div className="text-center py-8">
                  <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-gray-600">Loading templates...</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {Array.isArray(filteredTemplates) && filteredTemplates.map(template => (
                    <Card key={template.id} className="hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <h3 className="font-medium text-sm mb-1">{template?.name || 'Untitled Template'}</h3>
                            <Badge variant="secondary" className="text-xs mb-2">
                              {template?.category || 'General'}
                            </Badge>
                          </div>
                          {template?.aiGuidance && (
                            <div className="flex items-center">
                              <Sparkles className="h-4 w-4 text-yellow-500" title="AI Enhanced" />
                            </div>
                          )}
                        </div>

                        <p className="text-xs text-gray-600 mb-3 line-clamp-2">
                          {template?.description || 'No description available'}
                        </p>

                        <div className="flex items-center justify-between">
                          <div className="flex flex-wrap gap-1">
                            {(template?.regions || []).slice(0, 2).map(region => (
                              <Badge key={region} variant="outline" className="text-xs">
                                {region}
                              </Badge>
                            ))}
                            {(template?.regions || []).length > 2 && (
                              <Badge variant="outline" className="text-xs">
                                +{(template?.regions || []).length - 2}
                              </Badge>
                            )}
                          </div>
                          <div className="flex space-x-1">
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handlePreviewTemplate(template)}
                              className="h-8 px-2"
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                            <Button
                              size="sm"
                              onClick={() => createNewDocument(template)}
                              className="h-8 px-3 bg-blue-600 hover:bg-blue-700"
                            >
                              <Plus className="h-3 w-3 mr-1" />
                              Use
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              )}

              {!templatesLoading && (!Array.isArray(filteredTemplates) || filteredTemplates.length === 0) && (
                <div className="text-center py-8">
                  <Search className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <p className="text-gray-600">No templates found matching your criteria.</p>
                  <Button
                    onClick={() => {
                      setSearchQuery('');
                      setSelectedCategory('all');
                      setSelectedRegion('all');
                    }}
                    variant="outline"
                    className="mt-4"
                  >
                    Clear Filters
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Comments & Review Tab */}
        <TabsContent value="comments">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Comments Section - 2 columns */}
            <div className="lg:col-span-2">
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="flex items-center space-x-2">
                        <MessageSquare className="h-5 w-5" />
                        <span>Comments</span>
                        <Badge variant="secondary">{filteredComments.length}</Badge>
                      </CardTitle>
                      <CardDescription>
                        Collaborate with your team on document review
                      </CardDescription>
                    </div>
                    <div className="flex items-center space-x-2">
                      <div className="relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
                        <Input
                          placeholder="Search comments..."
                          value={commentSearchQuery}
                          onChange={(e) => setCommentSearchQuery(e.target.value)}
                          className="pl-8 w-48"
                        />
                      </div>
                      <Select value={commentFilter} onValueChange={setCommentFilter}>
                        <SelectTrigger className="w-32">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">All Comments</SelectItem>
                          <SelectItem value="open">Open</SelectItem>
                          <SelectItem value="resolved">Resolved</SelectItem>
                          <SelectItem value="archived">Archived</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        onClick={() => setShowAddCommentDialog(true)}
                        className="bg-blue-600 hover:bg-blue-700"
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        Add Comment
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  {commentsLoading ? (
                    <div className="text-center py-8">
                      <div className="animate-spin h-8 w-8 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
                      <p className="text-gray-600">Loading comments...</p>
                    </div>
                  ) : filteredComments.length > 0 ? (
                    <div className="space-y-4 max-h-[600px] overflow-y-auto">
                      {filteredComments.map((comment) => (
                        <div key={comment.id} className="border-l-2 border-gray-200 pl-4 hover:border-blue-400 transition-colors">
                          <div className="flex items-start space-x-3">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center text-white font-semibold ${getUserAvatarColor(comment.author_name)}`}>
                              {getUserInitials(comment.author_name)}
                            </div>
                            <div className="flex-1">
                              <div className="bg-white border rounded-lg p-4">
                                <div className="flex items-start justify-between mb-2">
                                  <div>
                                    <span className="font-medium text-sm">{comment.author_name}</span>
                                    <span className="text-gray-500 text-xs ml-2">
                                      {formatRelativeTime(comment.created_at)}
                                    </span>
                                    {comment.section_code && (
                                      <Badge variant="outline" className="ml-2 text-xs">
                                        {comment.section_code}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center space-x-2">
                                    <Badge
                                      variant={comment.status === 'open' ? 'default' : 
                                              comment.status === 'resolved' ? 'secondary' : 'outline'}
                                      className={`text-xs ${
                                        comment.status === 'open' ? 'bg-yellow-100 text-yellow-800' :
                                        comment.status === 'resolved' ? 'bg-green-100 text-green-800' :
                                        'bg-gray-100 text-gray-800'
                                      }`}
                                    >
                                      {comment.status}
                                    </Badge>
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="h-8 w-8 p-0">
                                          <ChevronDown className="h-4 w-4" />
                                        </Button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end">
                                        <DropdownMenuItem onClick={() => setReplyingTo(comment.id)}>
                                          Reply
                                        </DropdownMenuItem>
                                        {comment.status === 'open' ? (
                                          <DropdownMenuItem onClick={() => updateCommentStatus(comment.id, 'resolved')}>
                                            Mark as Resolved
                                          </DropdownMenuItem>
                                        ) : (
                                          <DropdownMenuItem onClick={() => updateCommentStatus(comment.id, 'open')}>
                                            Reopen
                                          </DropdownMenuItem>
                                        )}
                                        <DropdownMenuItem onClick={() => updateCommentStatus(comment.id, 'archived')}>
                                          Archive
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem 
                                          className="text-red-600"
                                          onClick={() => deleteComment(comment.id)}
                                        >
                                          Delete
                                        </DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  </div>
                                </div>
                                <p className="text-sm text-gray-700 mb-2">{comment.body}</p>
                                {comment.position_data?.text && (
                                  <div className="mt-2 p-2 bg-gray-50 rounded text-xs text-gray-600 italic">
                                    Referenced text: "{comment.position_data.text}"
                                  </div>
                                )}
                                {comment.resolved_at && (
                                  <div className="mt-2 pt-2 border-t text-xs text-gray-500">
                                    Resolved by {comment.resolved_by} • {formatRelativeTime(comment.resolved_at)}
                                    {comment.resolution_note && (
                                      <p className="mt-1 text-gray-600">{comment.resolution_note}</p>
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Replies */}
                              {comment.replies && comment.replies.length > 0 && (
                                <div className="ml-8 mt-3 space-y-2">
                                  {comment.replies.map((reply) => (
                                    <div key={reply.id} className="flex items-start space-x-2">
                                      <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${getUserAvatarColor(reply.author_name)}`}>
                                        {getUserInitials(reply.author_name)}
                                      </div>
                                      <div className="flex-1 bg-gray-50 rounded-lg p-3">
                                        <div className="flex items-center justify-between mb-1">
                                          <span className="font-medium text-xs">{reply.author_name}</span>
                                          <span className="text-gray-500 text-xs">
                                            {formatRelativeTime(reply.created_at)}
                                          </span>
                                        </div>
                                        <p className="text-sm text-gray-700">{reply.body}</p>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}

                              {/* Reply Input */}
                              {replyingTo === comment.id && (
                                <div className="mt-3 ml-8">
                                  <div className="flex items-start space-x-2">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${getUserAvatarColor('Current User')}`}>
                                      CU
                                    </div>
                                    <div className="flex-1">
                                      <Textarea
                                        placeholder="Write a reply..."
                                        value={newComment}
                                        onChange={(e) => setNewComment(e.target.value)}
                                        className="min-h-[80px]"
                                      />
                                      <div className="flex justify-end space-x-2 mt-2">
                                        <Button
                                          variant="outline"
                                          size="sm"
                                          onClick={() => {
                                            setReplyingTo(null);
                                            setNewComment('');
                                          }}
                                        >
                                          Cancel
                                        </Button>
                                        <Button
                                          size="sm"
                                          className="bg-blue-600 hover:bg-blue-700"
                                          onClick={() => addComment(newComment, comment.id)}
                                        >
                                          Reply
                                        </Button>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8">
                      <MessageSquare className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                      <p className="text-gray-600">No comments yet</p>
                      <p className="text-sm text-gray-500 mt-1">
                        Be the first to add a comment on this document
                      </p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {/* Review Status Section - 1 column */}
            <div>
              <Card>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="flex items-center space-x-2">
                      <CheckCircle className="h-5 w-5" />
                      <span>Review Status</span>
                    </CardTitle>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowRequestReviewDialog(true)}
                    >
                      <User className="h-3 w-3 mr-1" />
                      Request
                    </Button>
                  </div>
                </CardHeader>
                <CardContent>
                  {/* Review Progress */}
                  <div className="mb-4">
                    <div className="flex justify-between text-sm mb-2">
                      <span>Overall Progress</span>
                      <span className="font-medium">
                        {reviewStats.approved}/{reviewStats.total} Approved
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-green-600 h-2 rounded-full transition-all duration-300"
                        style={{ width: `${reviewStats.total > 0 ? (reviewStats.approved / reviewStats.total) * 100 : 0}%` }}
                      />
                    </div>
                  </div>

                  {/* Review Statistics */}
                  <div className="grid grid-cols-2 gap-2 mb-4">
                    <div className="bg-orange-50 rounded-lg p-2 text-center">
                      <p className="text-2xl font-bold text-orange-600">{reviewStats.pending}</p>
                      <p className="text-xs text-gray-600">Pending</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-2 text-center">
                      <p className="text-2xl font-bold text-green-600">{reviewStats.approved}</p>
                      <p className="text-xs text-gray-600">Approved</p>
                    </div>
                    <div className="bg-red-50 rounded-lg p-2 text-center">
                      <p className="text-2xl font-bold text-red-600">{reviewStats.rejected}</p>
                      <p className="text-xs text-gray-600">Rejected</p>
                    </div>
                    <div className="bg-yellow-50 rounded-lg p-2 text-center">
                      <p className="text-2xl font-bold text-yellow-600">{reviewStats.changes_requested}</p>
                      <p className="text-xs text-gray-600">Changes</p>
                    </div>
                  </div>

                  {/* Reviewers List */}
                  <div className="space-y-3">
                    {reviewsLoading ? (
                      <div className="text-center py-4">
                        <div className="animate-spin h-6 w-6 border-3 border-blue-600 border-t-transparent rounded-full mx-auto"></div>
                      </div>
                    ) : reviews.length > 0 ? (
                      reviews.map((review) => (
                        <div key={review.id} className="border rounded-lg p-3">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center space-x-2">
                              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-xs font-semibold ${getUserAvatarColor(review.reviewer_name)}`}>
                                {getUserInitials(review.reviewer_name)}
                              </div>
                              <div>
                                <p className="font-medium text-sm">{review.reviewer_name}</p>
                                <p className="text-xs text-gray-500">
                                  {review.reviewed_at ? formatRelativeTime(review.reviewed_at) : 'Pending'}
                                </p>
                              </div>
                            </div>
                            <Badge
                              variant={review.review_status === 'approved' ? 'default' :
                                      review.review_status === 'rejected' ? 'destructive' :
                                      review.review_status === 'changes_requested' ? 'secondary' : 'outline'}
                              className={`text-xs ${
                                review.review_status === 'approved' ? 'bg-green-100 text-green-800' :
                                review.review_status === 'rejected' ? 'bg-red-100 text-red-800' :
                                review.review_status === 'changes_requested' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-orange-100 text-orange-800'
                              }`}
                            >
                              {review.review_status.replace('_', ' ')}
                            </Badge>
                          </div>
                          {review.review_comments && (
                            <p className="text-xs text-gray-600 mt-2 italic">
                              "{review.review_comments}"
                            </p>
                          )}
                        </div>
                      ))
                    ) : (
                      <div className="text-center py-4">
                        <User className="h-8 w-8 text-gray-400 mx-auto mb-2" />
                        <p className="text-sm text-gray-600">No reviewers assigned</p>
                        <Button
                          variant="link"
                          size="sm"
                          className="mt-1"
                          onClick={() => setShowRequestReviewDialog(true)}
                        >
                          Request Review
                        </Button>
                      </div>
                    )}
                  </div>

                  {/* Submit Review Button */}
                  <div className="mt-4">
                    <Button
                      className="w-full bg-blue-600 hover:bg-blue-700"
                      onClick={() => setShowReviewDialog(true)}
                    >
                      Submit My Review
                    </Button>
                  </div>
                </CardContent>
              </Card>

              {/* Activity Feed */}
              {showCommentActivity && (
                <Card className="mt-4">
                  <CardHeader>
                    <CardTitle className="flex items-center space-x-2 text-sm">
                      <Clock className="h-4 w-4" />
                      <span>Recent Activity</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2 max-h-64 overflow-y-auto">
                      {commentActivity.length > 0 ? (
                        commentActivity.map((activity) => (
                          <div key={activity.id} className="flex items-start space-x-2 text-xs">
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-white text-xs ${getUserAvatarColor(activity.actor_name)}`}>
                              {getUserInitials(activity.actor_name)}
                            </div>
                            <div className="flex-1">
                              <p>
                                <span className="font-medium">{activity.actor_name}</span>
                                <span className="text-gray-600 ml-1">
                                  {activity.activity_type.replace('_', ' ')}
                                </span>
                              </p>
                              <p className="text-gray-500">
                                {formatRelativeTime(activity.created_at)}
                              </p>
                            </div>
                          </div>
                        ))
                      ) : (
                        <p className="text-xs text-gray-500 text-center">No recent activity</p>
                      )}
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* Template Selection Dialog */}
      {showTemplateDialog && (
        <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
          <DialogContent className="max-w-4xl">
            <DialogHeader>
              <DialogTitle>Choose a Template</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-96 overflow-y-auto">
              {Array.isArray(documentTemplates) && documentTemplates.filter(t => t).slice(0, 12).map(template => (
                <Card
                  key={template?.id || Math.random()}
                  className="hover:shadow-md transition-shadow cursor-pointer"
                  onClick={() => createNewDocument(template)}
                >
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between mb-2">
                      <h3 className="font-medium text-sm">{template?.name || 'Untitled Template'}</h3>
                      {template?.aiGuidance && <Sparkles className="h-4 w-4 text-yellow-500" />}
                    </div>
                    <Badge variant="secondary" className="text-xs mb-2">
                      {template?.category || 'General'}
                    </Badge>
                    <p className="text-xs text-gray-600 mb-3">{template?.description || 'No description'}</p>
                    <div className="flex flex-wrap gap-1">
                      {(template?.regions || []).slice(0, 3).map(region => (
                        <Badge key={region} variant="outline" className="text-xs">
                          {region}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Template Preview Dialog */}
      {showPreviewDialog && previewTemplate && (
        <Dialog open={showPreviewDialog} onOpenChange={setShowPreviewDialog}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Template Preview</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <h3 className="text-lg font-semibold">{previewTemplate?.name || 'Untitled'}</h3>
                <Badge variant="secondary" className="mt-1">
                  {previewTemplate?.category || 'General'}
                </Badge>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Version:</span>
                  <div className="font-medium">{previewTemplate?.version || 'v1.0'}</div>
                </div>
                <div>
                  <span className="text-gray-600">Regions:</span>
                  <div className="flex flex-wrap gap-1">
                    {Array.isArray(previewTemplate?.regions) && previewTemplate.regions.map(region => (
                      <Badge key={region} variant="secondary" className="text-xs">
                        {region}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>

              <div>
                <h4 className="font-medium mb-2">Description</h4>
                <p className="text-sm text-gray-600">{previewTemplate?.description || 'No description available'}</p>
              </div>

              {previewTemplate?.aiGuidance && (
                <div className="p-3 bg-blue-50 rounded border-l-4 border-blue-500">
                  <div className="flex items-center space-x-2">
                    <Sparkles className="h-4 w-4 text-blue-500" />
                    <span className="text-sm font-medium">AI-Enhanced Template</span>
                  </div>
                  <p className="text-xs text-gray-600 mt-1">
                    This template includes AI-powered guidance, compliance checking, and content
                    suggestions.
                  </p>
                </div>
              )}

              <div className="flex justify-end space-x-2 pt-4">
                <Button variant="outline" onClick={() => setShowPreviewDialog(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => createNewDocument(previewTemplate)}
                  className="bg-blue-600 hover:bg-blue-700"
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Create Document
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* Submit Dialog */}
      <Dialog open={showSubmitDialog} onOpenChange={setShowSubmitDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Document for Review</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600 mb-4">
                Submitting this document will move it to 'In Review' status and notify approvers.
              </p>
              <div className="space-y-2">
                <label className="text-sm font-medium">Submission Comments (Optional)</label>
                <Textarea
                  value={submitComment}
                  onChange={(e) => setSubmitComment(e.target.value)}
                  placeholder="Enter any comments for reviewers..."
                  className="min-h-[100px]"
                />
              </div>
            </div>
            <div className="bg-yellow-50 p-3 rounded-lg border border-yellow-200">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-yellow-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-yellow-800">Review Workflow</p>
                  <ul className="mt-1 text-xs text-yellow-700 space-y-1">
                    <li>• QA Team Review</li>
                    <li>• Regulatory Affairs CMC Review</li>
                    <li>• Final Approval</li>
                  </ul>
                </div>
              </div>
            </div>
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowSubmitDialog(false);
                  setSubmitComment('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={submitDocument}
                disabled={isSubmitting}
                className="bg-green-600 hover:bg-green-700"
              >
                {isSubmitting ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Submitting...
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 mr-2" />
                    Submit for Review
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Sign Dialog */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Electronic Signature (21 CFR Part 11)</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-blue-50 p-3 rounded-lg border border-blue-200">
              <p className="text-sm text-blue-800">
                By signing this document, you certify that you have reviewed and approve its content.
              </p>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium">Signature Meaning</label>
                <Select 
                  value={signatureData.meaning} 
                  onValueChange={(value) => setSignatureData({...signatureData, meaning: value})}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AUTHOR">Author</SelectItem>
                    <SelectItem value="REVIEWER">Reviewer</SelectItem>
                    <SelectItem value="APPROVER">Approver</SelectItem>
                    <SelectItem value="QA">Quality Assurance</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <label className="text-sm font-medium">Reason for Signature</label>
                <Textarea
                  value={signatureData.reason}
                  onChange={(e) => setSignatureData({...signatureData, reason: e.target.value})}
                  placeholder="Enter reason for signing this document..."
                  className="min-h-[80px]"
                  required
                />
              </div>
              <div>
                <label className="text-sm font-medium">Enter PIN</label>
                <Input
                  type="password"
                  value={signatureData.pin}
                  onChange={(e) => setSignatureData({...signatureData, pin: e.target.value})}
                  placeholder="Enter your 6-digit PIN"
                  maxLength={6}
                  required
                />
              </div>
            </div>
            {/* Display existing signatures */}
            {documentSignatures.length > 0 && (
              <div className="border-t pt-3">
                <p className="text-sm font-medium mb-2">Previous Signatures:</p>
                <div className="space-y-1 text-xs">
                  {documentSignatures.slice(0, 3).map((sig, idx) => (
                    <div key={idx} className="flex items-center justify-between text-gray-600">
                      <span>{sig.signer_name || sig.signer_email}</span>
                      <span>{new Date(sig.signed_at).toLocaleDateString()}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowSignDialog(false);
                  setSignatureData({ pin: '', reason: '', meaning: 'REVIEWER' });
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={signDocument}
                disabled={isSigning || !signatureData.pin || !signatureData.reason}
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isSigning ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Signing...
                  </>
                ) : (
                  <>
                    <PenTool className="h-4 w-4 mr-2" />
                    Sign Document
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Freeze Dialog */}
      <Dialog open={showFreezeDialog} onOpenChange={setShowFreezeDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Freeze Document</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-red-50 p-3 rounded-lg border border-red-200">
              <div className="flex items-start space-x-2">
                <AlertCircle className="h-4 w-4 text-red-600 mt-0.5" />
                <div className="text-sm">
                  <p className="font-medium text-red-800">Warning</p>
                  <p className="text-red-700 mt-1">
                    Freezing this document will permanently lock it from any further edits.
                    This action cannot be undone.
                  </p>
                </div>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Reason for Freezing</label>
              <Textarea
                value={freezeReason}
                onChange={(e) => setFreezeReason(e.target.value)}
                placeholder="Enter reason for freezing this document..."
                className="min-h-[80px] mt-2"
                required
              />
            </div>
            <div className="text-sm text-gray-600">
              <p className="font-medium mb-1">Document will be:</p>
              <ul className="space-y-1 ml-4">
                <li>• Locked from all edits</li>
                <li>• Marked as FROZEN status</li>
                <li>• Available for export and viewing only</li>
                <li>• Included in audit trail</li>
              </ul>
            </div>
            <div className="flex justify-end space-x-2">
              <Button 
                variant="outline" 
                onClick={() => {
                  setShowFreezeDialog(false);
                  setFreezeReason('');
                }}
              >
                Cancel
              </Button>
              <Button
                onClick={freezeDocument}
                disabled={isFreezing || !freezeReason}
                variant="destructive"
              >
                {isFreezing ? (
                  <>
                    <Clock className="h-4 w-4 mr-2 animate-spin" />
                    Freezing...
                  </>
                ) : (
                  <>
                    <Lock className="h-4 w-4 mr-2" />
                    Freeze Document
                  </>
                )}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Step 10: GuidanceDrawer component
export function GuidanceDrawer({ open, onClose, sectionCode, locale }) {
  const [md, setMd] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  
  React.useEffect(() => {
    if (!open || !sectionCode) return;
    setLoading(true);
    const region = locale === 'eu' ? 'EMA' : locale === 'jp' ? 'PMDA' : 'ICH';
    
    fetch(`/api/authoring/guidance/compose?section=${encodeURIComponent(sectionCode)}&region=${region}`)
      .then(r => r.json())
      .then(x => setMd(x.guidance_md || ''))
      .catch(() => setMd('(No guidance)'))
      .finally(() => setLoading(false));
  }, [open, sectionCode, locale]);

  return open ? (
    <div className="fixed inset-0 z-40 bg-black/20">
      <div className="absolute right-0 top-0 h-full w-[520px] bg-white shadow-xl p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Guidance ({sectionCode || '—'})</div>
          <button onClick={onClose} className="text-slate-600 hover:text-black">✕</button>
        </div>
        {loading ? (
          <div className="text-sm text-slate-500">Loading…</div>
        ) : (
          <pre className="text-[12px] whitespace-pre-wrap">{md || '(No guidance)'}</pre>
        )}
      </div>
    </div>
  ) : null;
}

// Step 10: TemplatesDrawer component
export function TemplatesDrawer({ open, onClose, docId, locale, onApply }) {
  const [items, setItems] = React.useState([]);
  const [mode, setMode] = React.useState('merge'); // or 'overwrite'

  React.useEffect(() => {
    if (!open) return;
    fetch(`/api/authoring/templates?locale=${encodeURIComponent(locale || 'en')}`)
      .then(r => r.json())
      .then(setItems)
      .catch(() => setItems([]));
  }, [open, locale]);

  async function apply(templateKey) {
    const r = await fetch(`/api/authoring/docs/${docId}/apply-template`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ templateKey, mode }),
    });
    const x = await r.json();
    if (!r.ok) { toast({ title: x?.error || 'Apply failed.' }); return; };
    onApply?.(x);
    onClose();
  }

  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-40 bg-black/20">
      <div className="absolute right-0 top-0 h-full w-[520px] bg-white shadow-xl p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Templates (locale: {locale || 'en'})</div>
          <button onClick={onClose} className="text-slate-600 hover:text-black">✕</button>
        </div>
        <div className="flex items-center gap-2 mb-3 text-xs">
          <span>Apply mode:</span>
          <select 
            className="border px-2 py-1 rounded" 
            value={mode} 
            onChange={e => setMode(e.target.value)}
          >
            <option value="merge">Merge (non-destructive)</option>
            <option value="overwrite">Overwrite (replace existing sections)</option>
          </select>
        </div>
        <ul className="space-y-2">
          {items.map(it => (
            <li key={it.templateKey} className="border rounded p-2">
              <div className="text-sm font-medium">{it.title}</div>
              <div className="text-xs text-slate-500 font-mono">{it.templateKey}</div>
              <button 
                className="mt-2 border px-3 py-1 rounded text-xs hover:bg-gray-50" 
                onClick={() => apply(it.templateKey)}
              >
                Apply
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

// ====== STEP 14: REVIEWER CHECKLIST & CHANGE REQUEST COMPONENTS ======

export function ReviewerChecklistDrawer({ open, onClose, docId, sectionId, sectionCode, locale }) {
  const [data, setData] = React.useState(null);
  const [items, setItems] = React.useState([]);
  const region = (locale === "eu" ? "EMA" : locale === "jp" ? "PMDA" : "ICH");

  async function load() {
    const j = await fetch(`/api/authoring/docs/${docId}/checklist?section_id=${encodeURIComponent(sectionId)}&region=${region}`).then(r=>r.json());
    setData(j.checklist || null); setItems(j.items || []);
  }
  async function compose() {
    const r = await fetch(`/api/authoring/docs/${docId}/checklist/compose`, {
      method:"POST", headers:{ "Content-Type":"application/json" },
      body: JSON.stringify({ section_id: sectionId, region })
    });
    const x = await r.json(); if (!r.ok) { toast({ title: x?.error || "Compose failed" }); return; };
    setData(x.checklist); setItems(x.items);
  }
  async function update(itemId, patch) {
    const r = await fetch(`/api/authoring/checklist/items/${itemId}`, { method:"PATCH", headers:{ "Content-Type":"application/json" }, body: JSON.stringify(patch) });
    const x = await r.json(); if (!r.ok) { toast({ title: x?.error || "Update failed" }); return; };
    setItems(prev => prev.map(it => it.item_id===itemId ? x : it));
  }
  function jump(citeId){ window.dispatchEvent(new CustomEvent("cmc-jump-token", { detail: { citeId } })); }

  React.useEffect(()=>{ if (open && docId && sectionId) load(); }, [open, docId, sectionId, locale]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/20">
      <div className="absolute right-0 top-0 h-full w-[560px] bg-white shadow-xl p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-2">
          <div className="font-semibold">Reviewer Checklist — {sectionCode} ({region})</div>
          <button onClick={onClose} className="text-slate-600 hover:text-black">✕</button>
        </div>

        {!data
          ? <button className="border px-3 py-1 rounded text-sm" onClick={compose}>Compose from content</button>
          : <div className="text-xs text-slate-600 mb-2">Reviewer: {data.reviewer_email || "—"} • Created: {new Date(data.created_at).toLocaleString()}</div>
        }

        <ul className="space-y-2">
          {items.map(it => (
            <li key={it.item_id} className="border rounded p-2 text-sm">
              <div className="font-medium">{it.text}</div>
              <div className="mt-1 flex items-center gap-2">
                <select className="border rounded px-2 py-0.5 text-xs" value={it.status}
                        onChange={e=>update(it.item_id, { status: e.target.value })}>
                  <option value="OPEN">OPEN</option>
                  <option value="OK">OK</option>
                  <option value="ISSUE">ISSUE</option>
                  <option value="NA">N/A</option>
                </select>
                {it.evidence_cite && <button className="text-xs text-blue-600" onClick={()=>jump(it.evidence_cite)}>View Evidence</button>}
              </div>
              {it.comment && <div className="mt-1 text-xs text-slate-600 italic">{it.comment}</div>}
              <input type="text" className="mt-1 w-full border rounded px-2 py-0.5 text-xs" placeholder="Add comment..."
                     value={it.comment || ""} onChange={e=>update(it.item_id, { comment: e.target.value })} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function ChangeRequestsDrawer({ open, onClose, docId, sectionId, onCreateNew }) {
  const [crs, setCrs] = React.useState([]);

  async function load() {
    const r = await fetch(`/api/authoring/docs/${docId}/cr`);
    if (r.ok) setCrs(await r.json());
  }
  async function approve(crId) {
    const r = await fetch(`/api/authoring/cr/${crId}/approve`, { method:"POST" });
    if (r.ok) load();
  }
  async function reject(crId) {
    const r = await fetch(`/api/authoring/cr/${crId}/reject`, { method:"POST" });
    if (r.ok) load();
  }
  async function apply(crId) {
    const r = await fetch(`/api/authoring/cr/${crId}/apply`, { method:"POST" });
    if (r.ok) { load(); toast({ title: "Change applied!" }); }
  }

  React.useEffect(()=>{ if (open && docId) load(); }, [open, docId]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-40 bg-black/20">
      <div className="absolute right-0 top-0 h-full w-[600px] bg-white shadow-xl p-4 overflow-y-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="font-semibold">Change Requests</div>
          <div className="flex gap-2">
            <button className="border px-3 py-1 rounded text-sm bg-blue-50" onClick={()=>onCreateNew()}>+ New CR</button>
            <button onClick={onClose} className="text-slate-600 hover:text-black">✕</button>
          </div>
        </div>

        <ul className="space-y-3">
          {crs.map(cr => (
            <li key={cr.cr_id} className="border rounded p-3">
              <div className="flex justify-between items-start mb-2">
                <div className="font-medium text-sm">{cr.title}</div>
                <span className={`px-2 py-0.5 rounded text-xs ${
                  cr.status==='OPEN'?'bg-yellow-100 text-yellow-800':
                  cr.status==='APPROVED'?'bg-green-100 text-green-800':
                  cr.status==='APPLIED'?'bg-blue-100 text-blue-800':'bg-gray-100'
                }`}>{cr.status}</span>
              </div>
              <div className="text-xs text-slate-600 mb-1">
                Section: {cr.section_code || cr.section_id} • Type: {cr.apply_kind} • By: {cr.proposer_email}
              </div>
              {cr.reason && <div className="text-xs text-slate-700 mb-2 italic">{cr.reason}</div>}
              
              <div className="flex gap-1">
                {cr.status==='OPEN' && (
                  <>
                    <button className="border px-2 py-0.5 rounded text-xs bg-green-50" onClick={()=>approve(cr.cr_id)}>Approve</button>
                    <button className="border px-2 py-0.5 rounded text-xs bg-red-50" onClick={()=>reject(cr.cr_id)}>Reject</button>
                  </>
                )}
                {cr.status==='APPROVED' && (
                  <button className="border px-2 py-0.5 rounded text-xs bg-blue-50" onClick={()=>apply(cr.cr_id)}>Apply</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function CreateChangeRequestModal({ open, onClose, docId, sectionId, currentContent, onSubmit }) {
  const [title, setTitle] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [kind, setKind] = React.useState("CONTENT");
  const [content, setContent] = React.useState("");

  React.useEffect(() => {
    if (open && currentContent) {
      setContent(JSON.stringify(currentContent, null, 2));
    }
  }, [open, currentContent]);

  async function submit() {
    if (!title) { toast({ title: "Title required" }); return; };
    const patch = kind === "CONTENT" ? JSON.parse(content || "{}") : { cites: [] };
    const r = await fetch(`/api/authoring/docs/${docId}/cr`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ section_id: sectionId, title, reason, apply_kind: kind, patch_json: patch })
    });
    if (r.ok) {
      onSubmit && onSubmit();
      onClose();
      setTitle(""); setReason(""); setContent("");
    } else {
      toast({ title: "Failed to create change request" });
    }
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center">
      <div className="bg-white rounded-lg p-4 w-[500px] max-h-[80vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="font-semibold">Create Change Request</h3>
          <button onClick={onClose} className="text-slate-600 hover:text-black">✕</button>
        </div>

        <div className="space-y-3">
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input type="text" className="w-full border rounded px-3 py-2" value={title} onChange={e=>setTitle(e.target.value)} />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Reason</label>
            <textarea className="w-full border rounded px-3 py-2 h-20" value={reason} onChange={e=>setReason(e.target.value)} />
          </div>
          
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select className="w-full border rounded px-3 py-2" value={kind} onChange={e=>setKind(e.target.value)}>
              <option value="CONTENT">Content Change</option>
              <option value="TOKEN_REFRESH">Token Refresh</option>
              <option value="TOKEN_REPLACE">Token Replace</option>
            </select>
          </div>
          
          {kind === "CONTENT" && (
            <div>
              <label className="block text-sm font-medium mb-1">Content (JSON)</label>
              <textarea className="w-full border rounded px-3 py-2 h-32 font-mono text-xs" 
                        value={content} onChange={e=>setContent(e.target.value)} />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button className="border px-4 py-2 rounded" onClick={onClose}>Cancel</button>
          <button className="border px-4 py-2 rounded bg-blue-50" onClick={submit}>Create Request</button>
        </div>
      </div>
    </div>
  );
}

export default DocumentAuthoringComponent;
