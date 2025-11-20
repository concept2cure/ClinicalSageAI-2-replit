import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
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
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Label } from '@/components/ui/label';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';
import {
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
  BarChart3,
  Slash,
  Hash,
  AtSign,
  Diff,
  MessageCircle,
  CheckSquare,
  XSquare,
  UserCheck,
  FileSignature,
  RefreshCw,
  Copy,
  Trash2,
  PenTool,
  FileDown,
  Send,
  AlertTriangle,
  Info,
  HelpCircle,
  Package,
  Tag,
  Code,
  FileCode,
  GitCommit,
  GitMerge,
  Activity,
  Folder,
  FolderPlus,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const DocumentAuthoringEnhanced = () => {
  const { toast } = useToast();
  const editorRef = useRef(null);
  const [activeView, setActiveView] = useState('editor');
  const [showTemplateDialog, setShowTemplateDialog] = useState(false);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [selectedSection, setSelectedSection] = useState('3.2.S.1');
  const [rightPanelTab, setRightPanelTab] = useState('guidance');

  // Document state
  const [currentDocument, setCurrentDocument] = useState(null);
  const [documentContent, setDocumentContent] = useState('');
  const [documentTitle, setDocumentTitle] = useState('');
  const [documentStatus, setDocumentStatus] = useState('draft');
  const [documentSections, setDocumentSections] = useState([]);
  const [documentModified, setDocumentModified] = useState(false);

  // API state
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [revisions, setRevisions] = useState([]);
  const [citations, setCitations] = useState([]);
  const [comments, setComments] = useState([]);
  const [guidance, setGuidance] = useState(null);
  const [suggestions, setSuggestions] = useState([]);
  const [dataTokens, setDataTokens] = useState([]);

  // Track changes state
  const [trackChangesMode, setTrackChangesMode] = useState(false);
  const [changes, setChanges] = useState([]);
  const [selectedChange, setSelectedChange] = useState(null);

  // UI state
  const [showSlashMenu, setShowSlashMenu] = useState(false);
  const [slashMenuPosition, setSlashMenuPosition] = useState({ x: 0, y: 0 });
  const [showCitationDialog, setShowCitationDialog] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState(null);
  const [complianceScore, setComplianceScore] = useState(null);
  const [complianceIssues, setComplianceIssues] = useState([]);
  const [autoSaveEnabled, setAutoSaveEnabled] = useState(true);
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [showApprovalDialog, setShowApprovalDialog] = useState(false);
  const [eSignature, setESignature] = useState('');

  // Get tenant ID from localStorage
  const getTenantId = () => localStorage.getItem('currentOrganization') || '1';

  // Load documents from authoring API
  const loadDocuments = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/authoring/docs?module=M3`, {
        headers: {
          'x-tenant-id': getTenantId(),
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Error loading documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load documents',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Load document sections
  const loadDocumentSections = async docId => {
    try {
      const response = await fetch(`/api/authoring/docs/${docId}/sections`, {
        headers: {
          'x-tenant-id': getTenantId(),
        },
      });

      if (response.ok) {
        const data = await response.json();
        setDocumentSections(data.sections || []);

        // Load first section content if available
        if (data.sections && data.sections.length > 0) {
          setDocumentContent(data.sections[0].content || '');
          setSelectedSection(data.sections[0].code);
        }
      }
    } catch (error) {
      console.error('Error loading sections:', error);
    }
  };

  // Create new document
  const createDocument = async () => {
    try {
      const response = await fetch('/api/authoring/docs', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenantId(),
        },
        body: JSON.stringify({
          title: documentTitle || 'Untitled Document',
          module: 'M3',
          product_code: 'PROD-001',
          created_by: 'current_user',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCurrentDocument(data.document);
        toast({
          title: 'Success',
          description: 'Document created successfully',
        });
        await loadDocuments();
        return data.document;
      }
    } catch (error) {
      console.error('Error creating document:', error);
      toast({
        title: 'Error',
        description: 'Failed to create document',
        variant: 'destructive',
      });
    }
  };

  // Save document section
  const saveSection = async () => {
    if (!currentDocument) {
      // Create document first if doesn't exist
      const doc = await createDocument();
      if (!doc) return;
      setCurrentDocument(doc);
    }

    setSaving(true);
    try {
      // Check if section exists
      const existingSection = documentSections.find(s => s.code === selectedSection);

      if (existingSection) {
        // Update existing section
        const response = await fetch(`/api/authoring/sections/${existingSection.id}`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': getTenantId(),
          },
          body: JSON.stringify({
            content: documentContent,
            track_changes: trackChangesMode,
            updated_by: 'current_user',
          }),
        });

        if (response.ok) {
          toast({
            title: 'Saved',
            description: 'Section updated successfully',
          });
          setDocumentModified(false);
          setLastSavedTime(new Date());
        }
      } else {
        // Create new section
        const response = await fetch('/api/authoring/sections', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-tenant-id': getTenantId(),
          },
          body: JSON.stringify({
            doc_id: currentDocument.id,
            code: selectedSection,
            title: getSectionTitle(selectedSection),
            content: documentContent,
            order_index: documentSections.length,
            created_by: 'current_user',
          }),
        });

        if (response.ok) {
          const data = await response.json();
          setDocumentSections([...documentSections, data.section]);
          toast({
            title: 'Saved',
            description: 'Section created successfully',
          });
          setDocumentModified(false);
          setLastSavedTime(new Date());
        }
      }
    } catch (error) {
      console.error('Error saving section:', error);
      toast({
        title: 'Error',
        description: 'Failed to save section',
        variant: 'destructive',
      });
    } finally {
      setSaving(false);
    }
  };

  // Load templates
  const loadTemplates = async () => {
    try {
      const response = await fetch(`/api/authoring/templates?module=M3`, {
        headers: {
          'x-tenant-id': getTenantId(),
        },
      });

      if (response.ok) {
        const data = await response.json();
        setTemplates(data.templates || []);
      }
    } catch (error) {
      console.error('Error loading templates:', error);
    }
  };

  // Apply template
  const applyTemplate = async templateId => {
    if (!currentDocument) {
      toast({
        title: 'Error',
        description: 'Please create a document first',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch(`/api/authoring/templates/${templateId}/apply`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenantId(),
        },
        body: JSON.stringify({
          doc_id: currentDocument.id,
        }),
      });

      if (response.ok) {
        toast({
          title: 'Success',
          description: 'Template applied successfully',
        });
        await loadDocumentSections(currentDocument.id);
        setShowTemplateDialog(false);
      }
    } catch (error) {
      console.error('Error applying template:', error);
      toast({
        title: 'Error',
        description: 'Failed to apply template',
        variant: 'destructive',
      });
    }
  };

  // Load revision history
  const loadRevisions = async sectionId => {
    try {
      const response = await fetch(`/api/authoring/sections/${sectionId}/revisions`, {
        headers: {
          'x-tenant-id': getTenantId(),
        },
      });

      if (response.ok) {
        const data = await response.json();
        setRevisions(data.revisions || []);
      }
    } catch (error) {
      console.error('Error loading revisions:', error);
    }
  };

  // Insert data token
  const insertDataToken = token => {
    const cursorPosition = editorRef.current?.selectionStart || documentContent.length;
    const tokenText = `{{${token.type}.${token.key}}}`;

    const newContent =
      documentContent.slice(0, cursorPosition) + tokenText + documentContent.slice(cursorPosition);

    setDocumentContent(newContent);
    setDocumentModified(true);
    setShowSlashMenu(false);

    // Create citation
    createCitation(token, cursorPosition);
  };

  // Create citation
  const createCitation = async (token, position) => {
    const section = documentSections.find(s => s.code === selectedSection);
    if (!section) return;

    try {
      const response = await fetch(`/api/authoring/sections/${section.id}/cite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenantId(),
        },
        body: JSON.stringify({
          citation_key: `${token.type}.${token.key}`,
          source_type: token.type,
          source_id: token.id,
          position: position,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCitations([...citations, data.citation]);
      }
    } catch (error) {
      console.error('Error creating citation:', error);
    }
  };

  // Load guidance
  const loadGuidance = async () => {
    try {
      const response = await fetch(`/api/authoring/guidance?section=${selectedSection}`, {
        headers: {
          'x-tenant-id': getTenantId(),
        },
      });

      if (response.ok) {
        const data = await response.json();
        setGuidance(data.guidance);
      }
    } catch (error) {
      console.error('Error loading guidance:', error);
    }
  };

  // Load AI suggestions
  const loadSuggestions = async () => {
    if (!documentContent) return;

    try {
      const response = await fetch('/api/authoring/ai/suggest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenantId(),
        },
        body: JSON.stringify({
          content: documentContent,
          section: selectedSection,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    }
  };

  // Load data tokens
  const loadDataTokens = async () => {
    const tokenCategories = {
      'ANALYTICAL.METHODS': [
        {
          id: 'am1',
          key: 'HPLC_METHOD_01',
          label: 'HPLC Method Validation',
          lastUpdate: '2025-01-10',
        },
        {
          id: 'am2',
          key: 'DISSOLUTION_TEST',
          label: 'Dissolution Test Results',
          lastUpdate: '2025-01-08',
        },
      ],
      'STABILITY.P8.SUMMARY': [
        {
          id: 'st1',
          key: 'LONGTERM_25C',
          label: 'Long-term Stability 25°C',
          lastUpdate: '2025-01-15',
        },
        {
          id: 'st2',
          key: 'ACCELERATED_40C',
          label: 'Accelerated Stability 40°C',
          lastUpdate: '2025-01-12',
        },
      ],
      'QUALITY.SPECS': [
        {
          id: 'qs1',
          key: 'RELEASE_SPECS',
          label: 'Release Specifications',
          lastUpdate: '2025-01-05',
        },
        { id: 'qs2', key: 'IMPURITY_PROFILE', label: 'Impurity Profile', lastUpdate: '2025-01-03' },
      ],
      'PROCESS.CONTROL_STRATEGY': [
        {
          id: 'pc1',
          key: 'CPP_RANGES',
          label: 'Critical Process Parameters',
          lastUpdate: '2025-01-11',
        },
        {
          id: 'pc2',
          key: 'CQA_LIMITS',
          label: 'Critical Quality Attributes',
          lastUpdate: '2025-01-09',
        },
      ],
    };

    const tokens = [];
    Object.entries(tokenCategories).forEach(([category, items]) => {
      items.forEach(item => {
        tokens.push({
          ...item,
          type: category,
          icon: getTokenIcon(category),
        });
      });
    });

    setDataTokens(tokens);
  };

  // Get token icon
  const getTokenIcon = category => {
    switch (category.split('.')[0]) {
      case 'ANALYTICAL':
        return TestTube;
      case 'STABILITY':
        return Calendar;
      case 'QUALITY':
        return Shield;
      case 'PROCESS':
        return Activity;
      default:
        return Database;
    }
  };

  // Export document
  const exportDocument = async format => {
    if (!currentDocument) {
      toast({
        title: 'Error',
        description: 'No document to export',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch(
        `/api/authoring/docs/${currentDocument.id}/export?fmt=${format}`,
        {
          headers: {
            'x-tenant-id': getTenantId(),
          },
        }
      );

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${currentDocument.title || 'document'}.${format}`;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);

        toast({
          title: 'Success',
          description: `Document exported as ${format.toUpperCase()}`,
        });
      }
    } catch (error) {
      console.error('Error exporting document:', error);
      toast({
        title: 'Error',
        description: 'Failed to export document',
        variant: 'destructive',
      });
    }

    setShowExportDialog(false);
  };

  // Submit for review
  const submitForReview = async () => {
    if (!currentDocument) return;

    try {
      const response = await fetch(`/api/authoring/docs/${currentDocument.id}/status`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenantId(),
        },
        body: JSON.stringify({
          status: 'in_review',
        }),
      });

      if (response.ok) {
        setDocumentStatus('in_review');
        toast({
          title: 'Success',
          description: 'Document submitted for review',
        });
      }
    } catch (error) {
      console.error('Error submitting for review:', error);
      toast({
        title: 'Error',
        description: 'Failed to submit for review',
        variant: 'destructive',
      });
    }
  };

  // Approve document with e-signature
  const approveDocument = async () => {
    if (!currentDocument || !eSignature) {
      toast({
        title: 'Error',
        description: 'Please provide your e-signature',
        variant: 'destructive',
      });
      return;
    }

    try {
      const response = await fetch(`/api/authoring/docs/${currentDocument.id}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenantId(),
        },
        body: JSON.stringify({
          signature: eSignature,
          approver: 'current_user',
        }),
      });

      if (response.ok) {
        setDocumentStatus('approved');
        setShowApprovalDialog(false);
        toast({
          title: 'Success',
          description: 'Document approved successfully',
        });
      }
    } catch (error) {
      console.error('Error approving document:', error);
      toast({
        title: 'Error',
        description: 'Failed to approve document',
        variant: 'destructive',
      });
    }
  };

  // Check compliance
  const checkCompliance = async () => {
    if (!documentContent) return;

    try {
      const response = await fetch('/api/authoring/compliance/check', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenantId(),
        },
        body: JSON.stringify({
          content: documentContent,
          section: selectedSection,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setComplianceScore(data.score);
        setComplianceIssues(data.issues || []);
      }
    } catch (error) {
      console.error('Error checking compliance:', error);
    }
  };

  // Add comment
  const addComment = async (text, selectionStart, selectionEnd) => {
    const section = documentSections.find(s => s.code === selectedSection);
    if (!section || !currentDocument) return;

    try {
      const response = await fetch('/api/authoring/comments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-id': getTenantId(),
        },
        body: JSON.stringify({
          doc_id: currentDocument.id,
          section_id: section.id,
          content: text,
          position_start: selectionStart,
          position_end: selectionEnd,
          author: 'current_user',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setComments([...comments, data.comment]);
      }
    } catch (error) {
      console.error('Error adding comment:', error);
    }
  };

  // Accept/Reject change
  const handleChange = async (changeId, action) => {
    try {
      const response = await fetch(`/api/authoring/changes/${changeId}/${action}`, {
        method: 'POST',
        headers: {
          'x-tenant-id': getTenantId(),
        },
      });

      if (response.ok) {
        setChanges(changes.filter(c => c.id !== changeId));
        toast({
          title: 'Success',
          description: `Change ${action}ed`,
        });
      }
    } catch (error) {
      console.error(`Error ${action}ing change:`, error);
    }
  };

  // Handle slash menu
  const handleSlashCommand = e => {
    if (e.key === '/' && !showSlashMenu) {
      e.preventDefault();
      const rect = editorRef.current.getBoundingClientRect();
      const caretPos = getCaretCoordinates();
      setSlashMenuPosition({
        x: caretPos.x,
        y: caretPos.y + 20,
      });
      setShowSlashMenu(true);
    } else if (e.key === 'Escape' && showSlashMenu) {
      setShowSlashMenu(false);
    }
  };

  // Get caret coordinates
  const getCaretCoordinates = () => {
    // Simplified caret position calculation
    return { x: 100, y: 100 };
  };

  // Auto-save functionality
  useEffect(() => {
    if (autoSaveEnabled && documentModified) {
      const timer = setTimeout(() => {
        saveSection();
      }, 5000); // Auto-save after 5 seconds of inactivity

      return () => clearTimeout(timer);
    }
  }, [documentContent, documentModified, autoSaveEnabled]);

  // Load initial data
  useEffect(() => {
    loadDocuments();
    loadTemplates();
    loadDataTokens();
  }, []);

  // Load guidance and suggestions when section changes
  useEffect(() => {
    loadGuidance();
    loadSuggestions();
    checkCompliance();
  }, [selectedSection, documentContent]);

  // Get section title
  const getSectionTitle = code => {
    const sectionTitles = {
      '3.2.S.1': 'General Information',
      '3.2.S.2': 'Manufacture',
      '3.2.S.3': 'Characterisation',
      '3.2.S.4': 'Control of Drug Substance',
      '3.2.S.5': 'Reference Standards',
      '3.2.S.6': 'Container Closure System',
      '3.2.S.7': 'Stability',
      '3.2.P.1': 'Description and Composition',
      '3.2.P.2': 'Pharmaceutical Development',
      '3.2.P.3': 'Manufacture',
      '3.2.P.4': 'Control of Excipients',
      '3.2.P.5': 'Control of Drug Product',
      '3.2.P.6': 'Reference Standards',
      '3.2.P.7': 'Container Closure System',
      '3.2.P.8': 'Stability',
    };
    return sectionTitles[code] || code;
  };

  // Get status color
  const getStatusColor = status => {
    switch (status) {
      case 'draft':
        return 'bg-gray-500';
      case 'in_review':
        return 'bg-yellow-500';
      case 'approved':
        return 'bg-green-500';
      case 'archived':
        return 'bg-purple-500';
      default:
        return 'bg-gray-500';
    }
  };

  return (
    <div className="h-full flex flex-col bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold flex items-center gap-2">
              <FileText className="h-5 w-5" />
              Document Authoring
            </h2>
            {currentDocument && (
              <>
                <Badge className={`${getStatusColor(documentStatus)} text-white`}>
                  {documentStatus.toUpperCase().replace('_', ' ')}
                </Badge>
                {complianceScore !== null && (
                  <div className="flex items-center gap-2">
                    <div className="text-sm text-gray-600">Compliance:</div>
                    <div
                      className={`font-semibold ${complianceScore >= 80 ? 'text-green-600' : complianceScore >= 60 ? 'text-yellow-600' : 'text-red-600'}`}
                    >
                      {complianceScore}%
                    </div>
                  </div>
                )}
              </>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* Track Changes Toggle */}
            <Button
              variant={trackChangesMode ? 'default' : 'outline'}
              size="sm"
              onClick={() => setTrackChangesMode(!trackChangesMode)}
              className="flex items-center gap-2"
              data-testid="button-track-changes"
            >
              <GitBranch className="h-4 w-4" />
              Track Changes
            </Button>

            {/* Save Button */}
            <Button
              variant="outline"
              size="sm"
              onClick={saveSection}
              disabled={saving || !documentModified}
              className="flex items-center gap-2"
              data-testid="button-save"
            >
              {saving ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Save className="h-4 w-4" />
                  Save
                </>
              )}
            </Button>

            {/* Export Button */}
            <Dialog open={showExportDialog} onOpenChange={setShowExportDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="flex items-center gap-2"
                  data-testid="button-export"
                >
                  <Download className="h-4 w-4" />
                  Export
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Export Document</DialogTitle>
                </DialogHeader>
                <div className="grid gap-4 py-4">
                  <Button
                    onClick={() => exportDocument('docx')}
                    className="justify-start"
                    data-testid="button-export-docx"
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    Export as DOCX
                  </Button>
                  <Button
                    onClick={() => exportDocument('pdf')}
                    className="justify-start"
                    data-testid="button-export-pdf"
                  >
                    <FileDown className="h-4 w-4 mr-2" />
                    Export as PDF
                  </Button>
                  <Button
                    onClick={() => exportDocument('xml')}
                    className="justify-start"
                    data-testid="button-export-ectd"
                  >
                    <FileCode className="h-4 w-4 mr-2" />
                    Export as eCTD XML
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {/* Submit for Review / Approve */}
            {documentStatus === 'draft' && (
              <Button
                size="sm"
                onClick={submitForReview}
                className="flex items-center gap-2"
                data-testid="button-submit-review"
              >
                <Send className="h-4 w-4" />
                Submit for Review
              </Button>
            )}

            {documentStatus === 'in_review' && (
              <Dialog open={showApprovalDialog} onOpenChange={setShowApprovalDialog}>
                <DialogTrigger asChild>
                  <Button
                    size="sm"
                    className="flex items-center gap-2"
                    data-testid="button-approve"
                  >
                    <FileSignature className="h-4 w-4" />
                    Approve
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Approve Document</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-4">
                    <div className="space-y-2">
                      <Label>E-Signature (Part 11 Compliant)</Label>
                      <Input
                        type="password"
                        placeholder="Enter your e-signature"
                        value={eSignature}
                        onChange={e => setESignature(e.target.value)}
                        data-testid="input-esignature"
                      />
                    </div>
                    <Button
                      onClick={approveDocument}
                      className="w-full"
                      data-testid="button-confirm-approve"
                    >
                      Confirm Approval
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            )}
          </div>
        </div>

        {/* Auto-save indicator */}
        {lastSavedTime && (
          <div className="text-xs text-gray-500 mt-2">
            Last saved: {lastSavedTime.toLocaleTimeString()}
            {autoSaveEnabled && ' • Auto-save enabled'}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar - Document Tree */}
        <div className="w-64 bg-white border-r overflow-y-auto">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Documents</h3>
              <Button
                size="sm"
                variant="ghost"
                onClick={createDocument}
                data-testid="button-new-document"
              >
                <Plus className="h-4 w-4" />
              </Button>
            </div>

            <ScrollArea className="h-[200px]">
              {loading ? (
                <div className="text-center py-4 text-gray-500">Loading...</div>
              ) : documents.length === 0 ? (
                <div className="text-center py-4 text-gray-500">No documents</div>
              ) : (
                <div className="space-y-1">
                  {documents.map(doc => (
                    <Button
                      key={doc.id}
                      variant={currentDocument?.id === doc.id ? 'secondary' : 'ghost'}
                      size="sm"
                      className="w-full justify-start text-sm"
                      onClick={() => {
                        setCurrentDocument(doc);
                        loadDocumentSections(doc.id);
                      }}
                      data-testid={`button-doc-${doc.id}`}
                    >
                      <FileText className="h-3 w-3 mr-2" />
                      {doc.title}
                    </Button>
                  ))}
                </div>
              )}
            </ScrollArea>

            <Separator className="my-4" />

            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-sm">Sections</h3>
              <Dialog open={showTemplateDialog} onOpenChange={setShowTemplateDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" variant="ghost" data-testid="button-templates">
                    <FolderPlus className="h-4 w-4" />
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl">
                  <DialogHeader>
                    <DialogTitle>Template Library</DialogTitle>
                  </DialogHeader>
                  <div className="grid gap-4 py-4 max-h-[400px] overflow-y-auto">
                    {templates.map(template => (
                      <Card
                        key={template.id}
                        className="cursor-pointer hover:shadow-md transition-shadow"
                        onClick={() => applyTemplate(template.id)}
                      >
                        <CardHeader>
                          <CardTitle className="text-sm">{template.name}</CardTitle>
                          <CardDescription>{template.description}</CardDescription>
                        </CardHeader>
                      </Card>
                    ))}
                  </div>
                </DialogContent>
              </Dialog>
            </div>

            <div className="space-y-1">
              {documentSections.map(section => (
                <Button
                  key={section.id}
                  variant={selectedSection === section.code ? 'secondary' : 'ghost'}
                  size="sm"
                  className="w-full justify-start text-sm"
                  onClick={() => {
                    setSelectedSection(section.code);
                    setDocumentContent(section.content || '');
                    loadRevisions(section.id);
                  }}
                  data-testid={`button-section-${section.code}`}
                >
                  <Folder className="h-3 w-3 mr-2" />
                  {section.code} - {section.title}
                </Button>
              ))}
            </div>
          </div>
        </div>

        {/* Center - Editor */}
        <div className="flex-1 flex flex-col bg-white">
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-4xl mx-auto">
              {/* Document Title */}
              <Input
                className="text-2xl font-bold border-none px-0 mb-4"
                placeholder="Document Title"
                value={documentTitle}
                onChange={e => {
                  setDocumentTitle(e.target.value);
                  setDocumentModified(true);
                }}
                data-testid="input-document-title"
              />

              {/* Section Title */}
              <div className="mb-4">
                <h3 className="text-lg font-semibold text-gray-700">
                  {selectedSection} - {getSectionTitle(selectedSection)}
                </h3>
              </div>

              {/* Compliance Issues Banner */}
              {complianceIssues.length > 0 && (
                <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5" />
                    <div className="flex-1">
                      <div className="font-medium text-yellow-800 mb-1">Compliance Issues</div>
                      <ul className="text-sm text-yellow-700 space-y-1">
                        {complianceIssues.slice(0, 3).map((issue, idx) => (
                          <li key={idx}>• {issue}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {/* Editor */}
              <div className="relative">
                <Textarea
                  ref={editorRef}
                  className="min-h-[400px] font-mono text-sm"
                  placeholder="Start writing..."
                  value={documentContent}
                  onChange={e => {
                    setDocumentContent(e.target.value);
                    setDocumentModified(true);
                  }}
                  onKeyDown={handleSlashCommand}
                  data-testid="textarea-editor"
                />

                {/* Slash Menu */}
                {showSlashMenu && (
                  <div
                    className="absolute bg-white border rounded-lg shadow-lg p-2 z-50 w-64"
                    style={{ left: slashMenuPosition.x, top: slashMenuPosition.y }}
                  >
                    <div className="text-xs font-medium text-gray-500 px-2 py-1">
                      Insert Data Token
                    </div>
                    <ScrollArea className="h-[200px]">
                      {dataTokens.map(token => {
                        const Icon = token.icon;
                        return (
                          <Button
                            key={token.id}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start text-sm"
                            onClick={() => insertDataToken(token)}
                            data-testid={`button-token-${token.id}`}
                          >
                            <Icon className="h-3 w-3 mr-2" />
                            <div className="flex-1 text-left">
                              <div className="font-medium">{token.label}</div>
                              <div className="text-xs text-gray-500">{token.type}</div>
                            </div>
                          </Button>
                        );
                      })}
                    </ScrollArea>
                  </div>
                )}
              </div>

              {/* Citations */}
              {citations.length > 0 && (
                <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                  <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                    <Link className="h-4 w-4" />
                    Citations & References
                  </h4>
                  <div className="space-y-2">
                    {citations.map((citation, idx) => (
                      <div key={citation.id} className="text-sm flex items-start gap-2">
                        <span className="font-medium text-gray-500">[{idx + 1}]</span>
                        <span className="flex-1">{citation.citation_key}</span>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setSelectedCitation(citation);
                            setShowCitationDialog(true);
                          }}
                          data-testid={`button-citation-${citation.id}`}
                        >
                          <Eye className="h-3 w-3" />
                        </Button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Panel - Tabbed Interface */}
        <div className="w-80 bg-white border-l">
          <Tabs
            value={rightPanelTab}
            onValueChange={setRightPanelTab}
            className="h-full flex flex-col"
          >
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="guidance" data-testid="tab-guidance">
                Guidance
              </TabsTrigger>
              <TabsTrigger value="suggestions" data-testid="tab-suggestions">
                AI
              </TabsTrigger>
              <TabsTrigger value="data" data-testid="tab-data">
                Data
              </TabsTrigger>
              <TabsTrigger value="history" data-testid="tab-history">
                History
              </TabsTrigger>
            </TabsList>

            {/* Guidance Tab */}
            <TabsContent value="guidance" className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <div>
                  <h3 className="font-semibold mb-2 flex items-center gap-2">
                    <BookOpen className="h-4 w-4" />
                    Regulatory Guidance
                  </h3>
                  {guidance ? (
                    <div className="space-y-3">
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">ICH Guidelines</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600">
                            {guidance.ich || 'Loading guidance...'}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">FDA Requirements</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600">
                            {guidance.fda || 'Loading requirements...'}
                          </p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-sm">Best Practices</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600">
                            {guidance.bestPractices || 'Loading best practices...'}
                          </p>
                        </CardContent>
                      </Card>
                    </div>
                  ) : (
                    <div className="text-sm text-gray-500">Loading guidance...</div>
                  )}
                </div>
              </div>
            </TabsContent>

            {/* Suggestions Tab */}
            <TabsContent value="suggestions" className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Brain className="h-4 w-4" />
                  AI Suggestions
                </h3>
                {suggestions.length > 0 ? (
                  <div className="space-y-3">
                    {suggestions.map((suggestion, idx) => (
                      <Card key={idx}>
                        <CardHeader className="pb-3">
                          <div className="flex items-start justify-between">
                            <CardTitle className="text-sm">{suggestion.title}</CardTitle>
                            <Badge
                              variant={suggestion.priority === 'high' ? 'destructive' : 'secondary'}
                            >
                              {suggestion.priority}
                            </Badge>
                          </div>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-gray-600 mb-2">{suggestion.description}</p>
                          {suggestion.autofix && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full"
                              onClick={() => {
                                setDocumentContent(suggestion.autofix);
                                setDocumentModified(true);
                              }}
                              data-testid={`button-autofix-${idx}`}
                            >
                              <Zap className="h-3 w-3 mr-2" />
                              Apply Fix
                            </Button>
                          )}
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No suggestions available</div>
                )}
              </div>
            </TabsContent>

            {/* Data Tab */}
            <TabsContent value="data" className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Available Data Tokens
                </h3>
                <div className="text-xs text-gray-500 mb-3">
                  Type "/" in the editor to insert data tokens
                </div>
                <div className="space-y-3">
                  {Object.entries(
                    dataTokens.reduce((acc, token) => {
                      const category = token.type.split('.')[0];
                      if (!acc[category]) acc[category] = [];
                      acc[category].push(token);
                      return acc;
                    }, {})
                  ).map(([category, tokens]) => (
                    <div key={category}>
                      <div className="font-medium text-sm mb-2">{category}</div>
                      <div className="space-y-1">
                        {tokens.map(token => {
                          const Icon = token.icon;
                          return (
                            <Card
                              key={token.id}
                              className="cursor-pointer hover:bg-gray-50"
                              onClick={() => insertDataToken(token)}
                            >
                              <CardContent className="p-3">
                                <div className="flex items-center gap-2">
                                  <Icon className="h-4 w-4 text-gray-500" />
                                  <div className="flex-1">
                                    <div className="text-sm font-medium">{token.label}</div>
                                    <div className="text-xs text-gray-500">
                                      Updated: {token.lastUpdate}
                                    </div>
                                  </div>
                                </div>
                              </CardContent>
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </TabsContent>

            {/* History Tab */}
            <TabsContent value="history" className="flex-1 overflow-y-auto p-4">
              <div className="space-y-4">
                <h3 className="font-semibold mb-2 flex items-center gap-2">
                  <History className="h-4 w-4" />
                  Revision History
                </h3>
                {revisions.length > 0 ? (
                  <div className="space-y-2">
                    {revisions.map(revision => (
                      <Card key={revision.id} className="cursor-pointer hover:bg-gray-50">
                        <CardContent className="p-3">
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="text-sm font-medium">
                                v{revision.version || '1.0'}
                              </div>
                              <div className="text-xs text-gray-500">
                                {new Date(revision.created_at).toLocaleString()}
                              </div>
                              <div className="text-xs text-gray-600 mt-1">
                                By: {revision.created_by}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDocumentContent(revision.content);
                                toast({
                                  title: 'Revision Loaded',
                                  description: `Loaded revision from ${new Date(revision.created_at).toLocaleDateString()}`,
                                });
                              }}
                              data-testid={`button-load-revision-${revision.id}`}
                            >
                              <Eye className="h-3 w-3" />
                            </Button>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm text-gray-500">No revision history available</div>
                )}

                {/* Comments Section */}
                {comments.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <MessageCircle className="h-4 w-4" />
                      Comments
                    </h4>
                    <div className="space-y-2">
                      {comments.map(comment => (
                        <Card key={comment.id}>
                          <CardContent className="p-3">
                            <div className="text-sm">{comment.content}</div>
                            <div className="text-xs text-gray-500 mt-1">
                              {comment.author} • {new Date(comment.created_at).toLocaleString()}
                            </div>
                            {!comment.resolved && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="mt-2"
                                onClick={() => {
                                  // Mark as resolved
                                }}
                                data-testid={`button-resolve-comment-${comment.id}`}
                              >
                                <CheckSquare className="h-3 w-3 mr-1" />
                                Resolve
                              </Button>
                            )}
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}

                {/* Track Changes */}
                {trackChangesMode && changes.length > 0 && (
                  <>
                    <Separator className="my-4" />
                    <h4 className="font-medium text-sm mb-2 flex items-center gap-2">
                      <GitBranch className="h-4 w-4" />
                      Tracked Changes
                    </h4>
                    <div className="space-y-2">
                      {changes.map(change => (
                        <Card key={change.id}>
                          <CardContent className="p-3">
                            <div className="text-sm font-mono">
                              <del className="text-red-600">{change.oldText}</del>
                              <ins className="text-green-600 ml-2">{change.newText}</ins>
                            </div>
                            <div className="text-xs text-gray-500 mt-1">
                              {change.author} • {new Date(change.timestamp).toLocaleString()}
                            </div>
                            <div className="flex gap-2 mt-2">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleChange(change.id, 'accept')}
                                data-testid={`button-accept-change-${change.id}`}
                              >
                                <CheckSquare className="h-3 w-3 mr-1" />
                                Accept
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleChange(change.id, 'reject')}
                                data-testid={`button-reject-change-${change.id}`}
                              >
                                <XSquare className="h-3 w-3 mr-1" />
                                Reject
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default DocumentAuthoringEnhanced;
