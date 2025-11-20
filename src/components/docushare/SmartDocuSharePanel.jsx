// --- TrialSage Enterprise: Smart Search + Auto-Linking DocuShare Panel ---

import React, { useState, useEffect, useCallback } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
  CardFooter,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useDropzone } from 'react-dropzone';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { useForm } from 'react-hook-form';
import { Slider } from '@/components/ui/slider';
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from '@/components/ui/command';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

import {
  AlertCircle,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  BarChart3,
  BookOpen,
  Brain,
  Braces,
  Calendar,
  Check,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  Clock,
  Copy,
  Database,
  Download,
  Edit,
  ExternalLink,
  Eye,
  File,
  FileCheck,
  FileDown,
  FileSearch,
  FileStack,
  FileText,
  Filter,
  Folder,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Folders,
  HardDrive,
  History,
  Info,
  Link,
  ListFilter,
  Lock,
  LucideFileStack,
  MenuSquare,
  MoreHorizontal,
  Network,
  Package2,
  Pencil,
  Plus,
  PlusCircle,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Server,
  Settings,
  SlidersHorizontal,
  Sparkles,
  Star,
  StarHalf,
  Tag,
  ToggleLeft,
  Trash2,
  TrendingUp,
  Unlock,
  Upload,
  UserCircle2,
  X,
  ZoomIn,
} from 'lucide-react';

import {
  uploadDocument,
  listDocuments,
  downloadDocument,
  lockDocument,
  unlockDocument,
  deleteDocument,
  createFolder,
  renameFolder,
  deleteFolder,
  moveDocument,
  listFolders,
  listDocumentVersions,
  revertToVersion,
} from '@/services/DocuShareService';

import {
  generateDocumentTags,
  generateDocumentSummary,
  extractDocumentMetadata,
  categorizeDocument,
  processDocumentWithAI,
  extractKeyInsights,
  checkAIAvailability,
} from '@/services/AIDocumentService';

import {
  smartSearch,
  getSearchSuggestions,
  getRelatedDocuments,
  getTrendingSearchTerms,
  saveSearchQuery,
} from '@/services/SmartSearchService';

import {
  autoLinkDocument,
  getModuleRecommendations,
  assignDocumentToModules,
  getDocumentModules,
  getModuleDocuments,
  unassignDocumentFromModule,
} from '@/services/AutoLinkService';

import { logDocumentInteraction } from '@/services/RecommendationService';

import InlineViewer from '@/components/InlineViewer';
import DocumentRecommendations from '@/components/docushare/DocumentRecommendations';

// Simulated user session for development - in production, this would come from authentication
const mockUser = {
  id: 'user123',
  name: 'Jane Smith',
  tenantId: 'trialsage',
  role: 'admin',
};

// eCTD module definitions for auto-linking
const eCTDModules = [
  {
    id: 'module1',
    name: 'Module 1 - Administrative Information',
    description: 'Regional administrative information',
  },
  { id: 'module2', name: 'Module 2 - Summaries', description: 'CTD summaries' },
  {
    id: 'module3',
    name: 'Module 3 - Quality',
    description: 'Chemical, pharmaceutical and biological documentation',
  },
  {
    id: 'module4',
    name: 'Module 4 - Nonclinical Study Reports',
    description: 'Nonclinical study reports',
  },
  {
    id: 'module5',
    name: 'Module 5 - Clinical Study Reports',
    description: 'Clinical study reports',
  },
];

// Common document types in regulatory submissions
const commonDocumentTypes = [
  { value: 'clinicalStudyReport', label: 'Clinical Study Report' },
  { value: 'protocol', label: 'Protocol' },
  { value: 'investigatorBrochure', label: 'Investigator Brochure' },
  { value: 'statisticalAnalysisPlan', label: 'Statistical Analysis Plan' },
  { value: 'safetyReport', label: 'Safety Report' },
  { value: 'informedConsent', label: 'Informed Consent' },
  { value: 'caseReportForm', label: 'Case Report Form' },
  { value: 'laboratoryData', label: 'Laboratory Data' },
  { value: 'cmcDocumentation', label: 'CMC Documentation' },
  { value: 'regulatoryCorrespondence', label: 'Regulatory Correspondence' },
];

export default function SmartDocuSharePanel() {
  // State for documents and folders
  const [documents, setDocuments] = useState([]);
  const [folders, setFolders] = useState([]);
  const [currentFolder, setCurrentFolder] = useState('/');
  const [folderPath, setFolderPath] = useState([{ name: 'Root', path: '/' }]);

  // UI state
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [page, setPage] = useState(1);
  const [selectedDoc, setSelectedDoc] = useState(null);
  const [selectedView, setSelectedView] = useState('preview');
  const [viewWidth, setViewWidth] = useState('medium');

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searchSuggestions, setSearchSuggestions] = useState([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchFilters, setSearchFilters] = useState({
    documentType: '',
    trialPhase: '',
    molecule: '',
    trialId: '',
    tags: [],
  });
  const [advancedSearchMode, setAdvancedSearchMode] = useState(false);
  const [semanticSearch, setSemanticSearch] = useState(true);
  const [trendingSearches, setTrendingSearches] = useState([]);

  // New folder state
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  // Folder rename state
  const [showRenameFolderDialog, setShowRenameFolderDialog] = useState(false);
  const [folderToRename, setFolderToRename] = useState(null);
  const [renameFolderValue, setRenameFolderValue] = useState('');

  // Document move state
  const [showMoveDocDialog, setShowMoveDocDialog] = useState(false);
  const [docToMove, setDocToMove] = useState(null);
  const [targetFolder, setTargetFolder] = useState('');

  // Version history state
  const [versionHistory, setVersionHistory] = useState([]);
  const [showVersionHistory, setShowVersionHistory] = useState(false);

  // Module linking state
  const [showModuleLinkDialog, setShowModuleLinkDialog] = useState(false);
  const [docModules, setDocModules] = useState([]);
  const [docModuleRecommendations, setDocModuleRecommendations] = useState([]);
  const [selectedModules, setSelectedModules] = useState([]);
  const [autoModuleLinking, setAutoModuleLinking] = useState(true);

  // AI processing state
  const [aiAvailable, setAiAvailable] = useState(false);
  const [aiProcessing, setAiProcessing] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [docSummary, setDocSummary] = useState(null);
  const [docTags, setDocTags] = useState([]);
  const [docInsights, setDocInsights] = useState([]);
  const [docMetadata, setDocMetadata] = useState(null);
  const [processingProgress, setProcessingProgress] = useState(0);

  // AI settings
  const [aiSettings, setAiSettings] = useState({
    summarize: true,
    generateTags: true,
    extractMetadata: true,
    extractInsights: true,
    autoProcess: true,
  });

  // Pagination
  const pageSize = 12;
  const { toast } = useToast();

  // Initialize - check AI availability and load trending searches
  useEffect(() => {
    async function initialize() {
      try {
        // Check AI availability
        const status = await checkAIAvailability();
        setAiAvailable(status.available);

        if (!status.available) {
          console.warn('AI services are not available:', status.error);
        }

        // Get trending searches
        const trending = await getTrendingSearchTerms(mockUser.tenantId);
        setTrendingSearches(trending);
      } catch (error) {
        console.error('Error during initialization:', error);
      }
    }

    initialize();
  }, []);

  // Load documents and folders when folder changes
  useEffect(() => {
    fetchDocuments();
    fetchFolders();
  }, [currentFolder]);

  // Get search suggestions when query changes
  useEffect(() => {
    async function fetchSuggestions() {
      if (searchQuery.length < 2) {
        setSearchSuggestions([]);
        return;
      }

      try {
        const suggestions = await getSearchSuggestions(searchQuery, mockUser.tenantId);
        setSearchSuggestions(suggestions);
      } catch (error) {
        console.error('Error fetching search suggestions:', error);
      }
    }

    const debounceTimer = setTimeout(fetchSuggestions, 300);
    return () => clearTimeout(debounceTimer);
  }, [searchQuery]);

  // Fetch documents from the current folder
  const fetchDocuments = async () => {
    setLoading(true);
    try {
      // In a real implementation, add proper filtering
      const res = await listDocuments(currentFolder);
      setDocuments(res || []);
    } catch (error) {
      console.error('Error fetching documents:', error);
      toast({
        title: 'Error',
        description: 'Failed to load documents. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  // Fetch folder structure
  const fetchFolders = async () => {
    try {
      const res = await listFolders(currentFolder);
      setFolders(res || []);
    } catch (error) {
      console.error('Error fetching folders:', error);
    }
  };

  // Perform search
  const performSearch = async (query = searchQuery) => {
    if (!query && !Object.values(searchFilters).some(val => val && val.length)) return;

    setSearchLoading(true);
    try {
      // Save search query for analytics
      if (query) {
        saveSearchQuery(query, {
          tenantId: mockUser.tenantId,
          userId: mockUser.id,
        });
      }

      // Perform search with all parameters
      const results = await smartSearch({
        query,
        semanticSearch,
        tenantId: mockUser.tenantId,
        ...searchFilters,
      });

      setSearchResults(results);

      // Show toast if no results
      if (results.length === 0) {
        toast({
          title: 'No results found',
          description: 'Try changing your search terms or filters.',
          variant: 'default',
        });
      }
    } catch (error) {
      console.error('Error performing search:', error);
      toast({
        title: 'Search Failed',
        description: 'An error occurred while searching. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setSearchLoading(false);
    }
  };

  // Clear search
  const clearSearch = () => {
    setSearchQuery('');
    setSearchFilters({
      documentType: '',
      trialPhase: '',
      molecule: '',
      trialId: '',
      tags: [],
    });
    setSearchResults([]);
  };

  // Handle file uploads with AI processing
  const onDrop = useCallback(
    async acceptedFiles => {
      if (acceptedFiles.length === 0) return;

      setUploading(true);
      try {
        const file = acceptedFiles[0];

        // Extract basic metadata from filename
        const metadata = {
          trialId: extractTrialId(file.name),
          molecule: extractMolecule(file.name),
          trialPhase: extractTrialPhase(file.name),
          documentType: extractDocumentType(file.name),
          folder: currentFolder,
        };

        // Upload the document
        const uploadResult = await uploadDocument(currentFolder, file, metadata);

        toast({
          title: 'Document Uploaded',
          description: `${file.name} uploaded successfully.`,
        });

        // Process with AI if enabled
        if (aiEnabled && aiAvailable && aiSettings.autoProcess) {
          processWithAI(uploadResult.id);
        }

        // Auto-link to modules if enabled
        if (autoModuleLinking && aiAvailable) {
          autoLinkToModules(uploadResult.id);
        }

        // Refresh document list
        fetchDocuments();
      } catch (error) {
        console.error('Error uploading file:', error);
        toast({
          title: 'Upload Failed',
          description: error.message || 'Failed to upload document.',
          variant: 'destructive',
        });
      } finally {
        setUploading(false);
      }
    },
    [currentFolder, aiEnabled, aiAvailable, aiSettings, autoModuleLinking]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
      'text/plain': ['.txt'],
    },
  });

  // Process document with AI
  const processWithAI = async documentId => {
    if (!aiAvailable || !documentId) return;

    setAiProcessing(true);
    setProcessingProgress(10);

    try {
      // In a real implementation, use processDocumentWithAI to handle all processing
      // For demonstration, simulate processing steps with delays

      // Start AI processing based on settings
      const tasks = [];

      if (aiSettings.summarize) {
        tasks.push(generateDocumentSummary(documentId));
        setProcessingProgress(25);
      }

      if (aiSettings.generateTags) {
        tasks.push(generateDocumentTags(documentId));
        setProcessingProgress(50);
      }

      if (aiSettings.extractMetadata) {
        tasks.push(extractDocumentMetadata(documentId));
        setProcessingProgress(75);
      }

      if (aiSettings.extractInsights) {
        tasks.push(extractKeyInsights(documentId));
        setProcessingProgress(90);
      }

      // Process all tasks in parallel
      const results = await Promise.all(tasks);

      let summaryResult, tagsResult, metadataResult, insightsResult;
      let taskIndex = 0;

      if (aiSettings.summarize) {
        summaryResult = results[taskIndex++];
        setDocSummary(summaryResult);
      }

      if (aiSettings.generateTags) {
        tagsResult = results[taskIndex++];
        setDocTags(tagsResult.tags || []);
      }

      if (aiSettings.extractMetadata) {
        metadataResult = results[taskIndex++];
        setDocMetadata(metadataResult.metadata);
      }

      if (aiSettings.extractInsights) {
        insightsResult = results[taskIndex++];
        setDocInsights(insightsResult.insights || []);
      }

      setProcessingProgress(100);

      toast({
        title: 'AI Processing Complete',
        description: 'Document analysis and enrichment completed successfully.',
      });

      // Update document metadata in the database
      // This would update the document with AI-extracted metadata
      // Not implemented in this sample
    } catch (error) {
      console.error('Error processing document with AI:', error);
      toast({
        title: 'AI Processing Failed',
        description: error.message || 'Failed to process document with AI.',
        variant: 'destructive',
      });
    } finally {
      setAiProcessing(false);
    }
  };

  // Auto-link document to modules
  const autoLinkToModules = async documentId => {
    try {
      // Get module recommendations
      const recommendations = await getModuleRecommendations(documentId, mockUser.tenantId);

      // If auto-assign is enabled, automatically assign to recommended modules
      if (autoModuleLinking) {
        // Get modules with high confidence (above 0.7)
        const highConfidenceModules = recommendations.modules
          .filter(m => m.confidence >= 0.7)
          .map(m => m.moduleId);

        if (highConfidenceModules.length > 0) {
          // Automatically assign to high-confidence modules
          await assignDocumentToModules(documentId, highConfidenceModules, mockUser.tenantId);

          toast({
            title: 'Document Auto-Linked',
            description: `Document automatically linked to ${highConfidenceModules.length} modules.`,
          });
        }
      }
    } catch (error) {
      console.error('Error auto-linking document:', error);
      toast({
        title: 'Auto-Linking Failed',
        description: 'Failed to auto-link document to modules.',
        variant: 'destructive',
      });
    }
  };

  // Open module linking dialog
  const openModuleLinkDialog = async documentId => {
    try {
      // Get current module assignments
      const currentModules = await getDocumentModules(documentId, mockUser.tenantId);
      setDocModules(currentModules);

      // Get module recommendations
      const recommendations = await getModuleRecommendations(documentId, mockUser.tenantId);
      setDocModuleRecommendations(recommendations.modules);

      // Set initially selected modules to current assignments
      setSelectedModules(currentModules.map(m => m.moduleId));

      // Open dialog
      setShowModuleLinkDialog(true);
    } catch (error) {
      console.error('Error getting module information:', error);
      toast({
        title: 'Error',
        description: 'Failed to load module information.',
        variant: 'destructive',
      });
    }
  };

  // Save module assignments
  const saveModuleAssignments = async () => {
    if (!selectedDoc) return;

    try {
      // Get modules to add and remove
      const currentModuleIds = docModules.map(m => m.moduleId);
      const modulesToAdd = selectedModules.filter(id => !currentModuleIds.includes(id));
      const modulesToRemove = currentModuleIds.filter(id => !selectedModules.includes(id));

      // Add new modules
      if (modulesToAdd.length > 0) {
        await assignDocumentToModules(selectedDoc.id, modulesToAdd, mockUser.tenantId);
      }

      // Remove modules
      for (const moduleId of modulesToRemove) {
        await unassignDocumentFromModule(selectedDoc.id, moduleId, mockUser.tenantId);
      }

      // Close dialog
      setShowModuleLinkDialog(false);

      // Show success message
      toast({
        title: 'Modules Updated',
        description: 'Document module assignments updated successfully.',
      });

      // Refresh document list
      fetchDocuments();
    } catch (error) {
      console.error('Error saving module assignments:', error);
      toast({
        title: 'Error',
        description: 'Failed to update module assignments.',
        variant: 'destructive',
      });
    }
  };

  // Simple metadata extraction functions
  const extractTrialId = filename => {
    const match = filename.match(/(?:Trial|Study|ID)[_\s-]*(\w+\d+)/i);
    return match ? match[1] : '';
  };

  const extractMolecule = filename => {
    const match = filename.match(/(?:Molecule|Compound|Drug)[_\s-]*([A-Z0-9-]+)/i);
    return match ? match[1] : '';
  };

  const extractTrialPhase = filename => {
    const match = filename.match(/(?:Phase)[_\s-]*([1-4])/i);
    return match ? `Phase ${match[1]}` : '';
  };

  const extractDocumentType = filename => {
    const lowerName = filename.toLowerCase();
    if (lowerName.includes('protocol')) return 'Protocol';
    if (lowerName.includes('csr') || lowerName.includes('study report'))
      return 'Clinical Study Report';
    if (lowerName.includes('sap') || lowerName.includes('analysis plan'))
      return 'Statistical Analysis Plan';
    if (lowerName.includes('ib') || lowerName.includes('brochure')) return 'Investigator Brochure';
    if (lowerName.includes('consent')) return 'Informed Consent';
    return '';
  };

  // Navigate to a specific folder
  const navigateToFolder = folder => {
    setCurrentFolder(folder.path);

    // Update breadcrumb
    if (folder.path === '/') {
      setFolderPath([{ name: 'Root', path: '/' }]);
    } else {
      // Split path and construct breadcrumbs
      const parts = folder.path.split('/').filter(p => p);
      const breadcrumbs = [{ name: 'Root', path: '/' }];

      let currentPath = '';
      parts.forEach(part => {
        currentPath += '/' + part;
        breadcrumbs.push({
          name: part,
          path: currentPath,
        });
      });

      setFolderPath(breadcrumbs);
    }

    // Reset pagination when changing folders
    setPage(1);
  };

  // Create a new folder
  const handleCreateFolder = async () => {
    if (!newFolderName.trim()) return;

    try {
      await createFolder(currentFolder, newFolderName);
      setShowNewFolderDialog(false);
      setNewFolderName('');
      fetchFolders();
      toast({
        title: 'Folder Created',
        description: `Folder "${newFolderName}" created successfully.`,
      });
    } catch (error) {
      console.error('Error creating folder:', error);
      toast({
        title: 'Error',
        description: 'Failed to create folder.',
        variant: 'destructive',
      });
    }
  };

  // Rename a folder
  const handleRenameFolder = async () => {
    if (!folderToRename || !renameFolderValue.trim()) return;

    try {
      await renameFolder(folderToRename.id, renameFolderValue);
      setShowRenameFolderDialog(false);
      setFolderToRename(null);
      setRenameFolderValue('');
      fetchFolders();
      toast({
        title: 'Folder Renamed',
        description: `Folder renamed successfully.`,
      });
    } catch (error) {
      console.error('Error renaming folder:', error);
      toast({
        title: 'Error',
        description: 'Failed to rename folder.',
        variant: 'destructive',
      });
    }
  };

  // Delete a folder
  const handleDeleteFolder = async folder => {
    try {
      if (
        confirm(
          `Are you sure you want to delete the folder "${folder.name}"? This will delete all contents.`
        )
      ) {
        await deleteFolder(folder.id);
        fetchFolders();
        toast({
          title: 'Folder Deleted',
          description: `Folder "${folder.name}" deleted successfully.`,
        });
      }
    } catch (error) {
      console.error('Error deleting folder:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete folder.',
        variant: 'destructive',
      });
    }
  };

  // Move a document to a different folder
  const handleMoveDocument = async () => {
    if (!docToMove || !targetFolder) return;

    try {
      await moveDocument(docToMove.id, targetFolder);
      setShowMoveDocDialog(false);
      setDocToMove(null);
      setTargetFolder('');
      fetchDocuments();
      toast({
        title: 'Document Moved',
        description: `Document moved successfully.`,
      });
    } catch (error) {
      console.error('Error moving document:', error);
      toast({
        title: 'Error',
        description: 'Failed to move document.',
        variant: 'destructive',
      });
    }
  };

  // View document version history
  const handleViewVersionHistory = async docId => {
    try {
      const versions = await listDocumentVersions(docId);
      setVersionHistory(versions);
      setShowVersionHistory(true);
    } catch (error) {
      console.error('Error fetching version history:', error);
      toast({
        title: 'Error',
        description: 'Failed to load version history.',
        variant: 'destructive',
      });
    }
  };

  // Revert to a specific document version
  const handleRevertToVersion = async (docId, versionNumber) => {
    try {
      if (confirm(`Are you sure you want to revert to version ${versionNumber}?`)) {
        await revertToVersion(docId, versionNumber);
        fetchDocuments();
        setShowVersionHistory(false);
        toast({
          title: 'Document Reverted',
          description: `Document reverted to version ${versionNumber} successfully.`,
        });
      }
    } catch (error) {
      console.error('Error reverting document version:', error);
      toast({
        title: 'Error',
        description: 'Failed to revert document version.',
        variant: 'destructive',
      });
    }
  };

  // Document operations
  const handleDownload = async id => {
    try {
      await downloadDocument(id);
      toast({
        title: 'Download Started',
        description: 'Your document download has started.',
      });
    } catch (error) {
      console.error('Error downloading document:', error);
      toast({
        title: 'Error',
        description: 'Failed to download document.',
        variant: 'destructive',
      });
    }
  };

  const handleLock = async id => {
    try {
      await lockDocument(id);
      fetchDocuments();
      toast({
        title: 'Document Locked',
        description: 'Document locked successfully.',
      });
    } catch (error) {
      console.error('Error locking document:', error);
      toast({
        title: 'Error',
        description: 'Failed to lock document.',
        variant: 'destructive',
      });
    }
  };

  const handleUnlock = async id => {
    try {
      await unlockDocument(id);
      fetchDocuments();
      toast({
        title: 'Document Unlocked',
        description: 'Document unlocked successfully.',
      });
    } catch (error) {
      console.error('Error unlocking document:', error);
      toast({
        title: 'Error',
        description: 'Failed to unlock document.',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async id => {
    try {
      if (confirm('Are you sure you want to delete this document?')) {
        await deleteDocument(id);
        fetchDocuments();
        toast({
          title: 'Document Deleted',
          description: 'Document deleted successfully.',
        });
      }
    } catch (error) {
      console.error('Error deleting document:', error);
      toast({
        title: 'Error',
        description: 'Failed to delete document.',
        variant: 'destructive',
      });
    }
  };

  // Get documents to display - either search results or current folder contents
  const getDisplayDocuments = () => {
    if (searchResults.length > 0) {
      return searchResults;
    }
    return documents;
  };

  // Get paginated documents
  const getPaginatedDocuments = () => {
    const displayDocs = getDisplayDocuments();
    const startIndex = (page - 1) * pageSize;
    const endIndex = Math.min(startIndex + pageSize, displayDocs.length);
    return displayDocs.slice(startIndex, endIndex);
  };

  // Toggle module selection
  const toggleModuleSelection = moduleId => {
    if (selectedModules.includes(moduleId)) {
      setSelectedModules(selectedModules.filter(id => id !== moduleId));
    } else {
      setSelectedModules([...selectedModules, moduleId]);
    }
  };

  // Apply recommended modules
  const applyRecommendedModules = (confidenceThreshold = 0.7) => {
    if (!docModuleRecommendations || docModuleRecommendations.length === 0) return;

    const recommendedModules = docModuleRecommendations
      .filter(m => m.confidence >= confidenceThreshold)
      .map(m => m.moduleId);

    setSelectedModules(recommendedModules);
  };

  // Render loading skeleton
  if (loading && page === 1 && !searchResults.length) {
    return (
      <div className="p-6 bg-white rounded-lg">
        <Skeleton className="h-12 w-3/4 mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
        <Skeleton className="h-24 w-full mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 bg-white rounded-lg">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-2">
          {searchResults.length > 0 ? 'Search Results' : 'Document Management'}
          {aiAvailable && <Badge className="ml-2 bg-blue-500">AI Powered</Badge>}
        </h1>
        <div className="text-sm text-gray-500">
          {searchResults.length > 0
            ? `Found ${searchResults.length} documents matching your search`
            : 'Organize, search, and auto-link documents with AI assistance'}
        </div>
      </div>

      {/* Smart Search Bar */}
      <div className="mb-4">
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 h-4 w-4" />
            <Input
              placeholder="Search documents by content, metadata, or tags..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="pl-9 pr-24"
              onKeyDown={e => {
                if (e.key === 'Enter') {
                  performSearch();
                }
              }}
            />
            <div className="absolute right-2 top-1/2 transform -translate-y-1/2 flex gap-1">
              {searchQuery && (
                <Button variant="ghost" size="icon" onClick={() => setSearchQuery('')}>
                  <X className="h-4 w-4" />
                </Button>
              )}
              <TooltipProvider>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => setAdvancedSearchMode(!advancedSearchMode)}
                    >
                      <SlidersHorizontal className="h-4 w-4" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    {advancedSearchMode ? 'Hide advanced filters' : 'Show advanced filters'}
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
            </div>
          </div>
          <Button onClick={() => performSearch()} disabled={searchLoading}>
            {searchLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Search className="h-4 w-4 mr-2" />
            )}
            Search
          </Button>
          {searchResults.length > 0 && (
            <Button variant="outline" onClick={clearSearch}>
              Clear
            </Button>
          )}
        </div>

        {/* Search suggestions */}
        {searchQuery && searchSuggestions.length > 0 && !searchResults.length && (
          <div className="absolute z-10 mt-1 w-full max-w-lg bg-white rounded-md shadow-lg border border-gray-200">
            <Command>
              <CommandList>
                <CommandGroup heading="Suggestions">
                  {searchSuggestions.map((suggestion, index) => (
                    <CommandItem
                      key={index}
                      onSelect={() => {
                        setSearchQuery(suggestion);
                        performSearch(suggestion);
                      }}
                    >
                      <Search className="h-4 w-4 mr-2" />
                      {suggestion}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </CommandList>
            </Command>
          </div>
        )}

        {/* Advanced search options */}
        {advancedSearchMode && (
          <div className="mt-2 p-3 border rounded-md">
            <div className="mb-2 text-sm font-medium">Advanced Search Filters</div>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
              <Select
                value={searchFilters.documentType}
                onValueChange={val => setSearchFilters({ ...searchFilters, documentType: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Document Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any document type</SelectItem>
                  {commonDocumentTypes.map(type => (
                    <SelectItem key={type.value} value={type.value}>
                      {type.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select
                value={searchFilters.trialPhase}
                onValueChange={val => setSearchFilters({ ...searchFilters, trialPhase: val })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Trial Phase" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Any phase</SelectItem>
                  <SelectItem value="phase1">Phase 1</SelectItem>
                  <SelectItem value="phase2">Phase 2</SelectItem>
                  <SelectItem value="phase3">Phase 3</SelectItem>
                  <SelectItem value="phase4">Phase 4</SelectItem>
                </SelectContent>
              </Select>

              <Input
                placeholder="Trial ID"
                value={searchFilters.trialId}
                onChange={e => setSearchFilters({ ...searchFilters, trialId: e.target.value })}
              />

              <Input
                placeholder="Molecule"
                value={searchFilters.molecule}
                onChange={e => setSearchFilters({ ...searchFilters, molecule: e.target.value })}
              />
            </div>

            <div className="flex justify-between items-center mt-2">
              <div className="flex items-center gap-2">
                <Switch
                  id="semantic-search"
                  checked={semanticSearch}
                  onCheckedChange={setSemanticSearch}
                />
                <Label htmlFor="semantic-search" className="text-sm">
                  Semantic search
                </Label>
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <InfoIcon className="h-4 w-4 text-gray-400" />
                    </TooltipTrigger>
                    <TooltipContent>
                      Semantic search uses AI to understand the meaning of your query instead of
                      just matching keywords
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setSearchFilters({
                    documentType: '',
                    trialPhase: '',
                    molecule: '',
                    trialId: '',
                    tags: [],
                  });
                }}
              >
                Clear Filters
              </Button>
            </div>
          </div>
        )}

        {/* Search stats */}
        {searchResults.length > 0 && (
          <div className="flex justify-between items-center mt-2 text-sm text-gray-500">
            <div>
              Found {searchResults.length} {searchResults.length === 1 ? 'document' : 'documents'}
            </div>
            <Button
              variant="link"
              size="sm"
              onClick={() => {
                setSearchResults([]);
                setSearchQuery('');
              }}
            >
              Back to All Documents
            </Button>
          </div>
        )}
      </div>

      {/* Breadcrumb Navigation - only show when not in search results */}
      {searchResults.length === 0 && (
        <div className="flex items-center mb-4 text-sm">
          {folderPath.map((folder, index) => (
            <React.Fragment key={folder.path}>
              {index > 0 && <ChevronRight className="h-4 w-4 mx-1 text-gray-400" />}
              <button
                onClick={() => navigateToFolder(folder)}
                className={`hover:text-blue-600 ${
                  index === folderPath.length - 1 ? 'text-blue-600 font-medium' : 'text-gray-600'
                }`}
              >
                {folder.name}
              </button>
            </React.Fragment>
          ))}
        </div>
      )}

      {/* AI Settings Banner */}
      {aiAvailable && (
        <div className="mb-4">
          <Alert variant="default" className="bg-blue-50 border-blue-200">
            <div className="flex items-start">
              <Sparkles className="h-5 w-5 text-blue-500 mt-0.5" />
              <div className="ml-2 flex-1">
                <AlertTitle className="text-blue-700">AI-Powered Document Intelligence</AlertTitle>
                <AlertDescription className="text-blue-600">
                  <div className="flex items-center justify-between">
                    <div className="flex gap-x-6">
                      <div className="flex items-center gap-x-2">
                        <Switch
                          checked={aiEnabled}
                          onCheckedChange={setAiEnabled}
                          id="ai-enabled"
                        />
                        <Label htmlFor="ai-enabled">
                          {aiEnabled ? 'AI Processing On' : 'AI Processing Off'}
                        </Label>
                      </div>

                      <div className="flex items-center gap-x-2">
                        <Switch
                          checked={autoModuleLinking}
                          onCheckedChange={setAutoModuleLinking}
                          id="auto-linking"
                        />
                        <Label htmlFor="auto-linking">
                          {autoModuleLinking ? 'Auto-Linking On' : 'Auto-Linking Off'}
                        </Label>
                      </div>
                    </div>

                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Settings className="h-4 w-4 mr-2" />
                          Settings
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <div className="space-y-4">
                          <h4 className="font-medium leading-none">AI Processing Settings</h4>
                          <p className="text-sm text-muted-foreground">
                            Configure AI document processing features.
                          </p>
                          <Separator />
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="summarize"
                              checked={aiSettings.summarize}
                              onCheckedChange={checked =>
                                setAiSettings({ ...aiSettings, summarize: checked })
                              }
                            />
                            <label
                              htmlFor="summarize"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Document Summarization
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="tags"
                              checked={aiSettings.generateTags}
                              onCheckedChange={checked =>
                                setAiSettings({ ...aiSettings, generateTags: checked })
                              }
                            />
                            <label
                              htmlFor="tags"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Automatic Tagging
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="metadata"
                              checked={aiSettings.extractMetadata}
                              onCheckedChange={checked =>
                                setAiSettings({ ...aiSettings, extractMetadata: checked })
                              }
                            />
                            <label
                              htmlFor="metadata"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Metadata Extraction
                            </label>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="insights"
                              checked={aiSettings.extractInsights}
                              onCheckedChange={checked =>
                                setAiSettings({ ...aiSettings, extractInsights: checked })
                              }
                            />
                            <label
                              htmlFor="insights"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Key Insights Extraction
                            </label>
                          </div>
                          <Separator />
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              id="auto"
                              checked={aiSettings.autoProcess}
                              onCheckedChange={checked =>
                                setAiSettings({ ...aiSettings, autoProcess: checked })
                              }
                            />
                            <label
                              htmlFor="auto"
                              className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
                            >
                              Process automatically on upload
                            </label>
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>
                </AlertDescription>
              </div>
            </div>
          </Alert>
        </div>
      )}

      {/* Action Bar - only show when not in search results */}
      {searchResults.length === 0 && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4 mb-6">
          <div className="md:col-span-8 flex gap-2">
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    className="flex-1"
                    onClick={() => setShowNewFolderDialog(true)}
                  >
                    <FolderPlus className="h-4 w-4 mr-2" /> New Folder
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Create a new folder</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button className="flex-1">
                    <Upload className="h-4 w-4 mr-2" /> Upload Documents
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Upload new documents</TooltipContent>
              </Tooltip>
            </TooltipProvider>

            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" className="flex-1" onClick={fetchDocuments}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Refresh
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Refresh document list</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          </div>

          <div className="md:col-span-4 flex">
            <Select defaultValue="date">
              <SelectTrigger>
                <SelectValue placeholder="Sort by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="date">Date (Newest first)</SelectItem>
                <SelectItem value="name">Name (A-Z)</SelectItem>
                <SelectItem value="type">Document Type</SelectItem>
                <SelectItem value="size">Size</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {/* Upload Area - only show when not in search results */}
      {searchResults.length === 0 && (
        <div
          {...getRootProps()}
          className={`border-2 border-dashed rounded-lg p-6 mb-6 flex flex-col items-center justify-center cursor-pointer transition-colors ${
            isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:bg-gray-50'
          }`}
        >
          <input {...getInputProps()} />
          {uploading ? (
            <div className="text-center">
              <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-2"></div>
              <p className="text-blue-600 font-medium">Uploading document...</p>
            </div>
          ) : (
            <>
              <Upload className="h-10 w-10 text-blue-500 mb-2" />
              <p className="text-blue-600 font-medium">
                Drag & drop documents here, or click to select
              </p>
              <p className="text-sm text-gray-500 mt-1">
                {aiEnabled && aiAvailable
                  ? 'AI-powered processing will automatically extract metadata, tags, and link to relevant modules'
                  : 'Upload documents to the current folder'}
              </p>
            </>
          )}
        </div>
      )}

      {/* AI Processing Progress */}
      {aiProcessing && (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-2">
            <span className="text-sm font-medium text-gray-700">AI Processing Document</span>
            <span className="text-sm text-gray-500">{processingProgress}%</span>
          </div>
          <Progress value={processingProgress} className="h-2" />
          <p className="text-xs text-gray-500 mt-1">
            Analyzing document content, extracting metadata, and generating insights...
          </p>
        </div>
      )}

      {/* Folder Navigation - only show when not in search results */}
      {searchResults.length === 0 && (
        <div className="mb-6">
          {folders.length > 0 && (
            <>
              <h3 className="text-sm font-medium text-gray-600 mb-3">Folders</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                {folders.map(folder => (
                  <Card key={folder.id} className="cursor-pointer hover:bg-gray-50 transition">
                    <CardContent className="p-0">
                      <div
                        className="p-4 flex justify-between items-center"
                        onClick={() => navigateToFolder(folder)}
                      >
                        <div className="flex items-center">
                          <FolderOpen className="h-6 w-6 text-blue-500 mr-3" />
                          <span className="truncate">{folder.name}</span>
                        </div>
                        <Popover>
                          <PopoverTrigger asChild onClick={e => e.stopPropagation()}>
                            <Button variant="ghost" size="sm">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-56">
                            <div className="grid gap-1">
                              <Button
                                variant="ghost"
                                className="justify-start"
                                onClick={() => {
                                  setFolderToRename(folder);
                                  setRenameFolderValue(folder.name);
                                  setShowRenameFolderDialog(true);
                                }}
                              >
                                <Pencil className="h-4 w-4 mr-2" /> Rename Folder
                              </Button>
                              <Button
                                variant="ghost"
                                className="justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                                onClick={() => handleDeleteFolder(folder)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete Folder
                              </Button>
                            </div>
                          </PopoverContent>
                        </Popover>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Document List */}
      {getDisplayDocuments().length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border border-gray-200">
          <FileSearch className="h-12 w-12 text-gray-400 mx-auto mb-3" />
          <h3 className="text-lg font-medium text-gray-700">
            {searchResults.length > 0
              ? 'No documents match your search'
              : 'No documents found in this folder'}
          </h3>
          <p className="text-gray-500 mt-1 mb-4">
            {searchResults.length > 0
              ? 'Try different search terms or adjust your filters'
              : 'Upload documents to get started'}
          </p>
          {searchResults.length > 0 ? (
            <Button variant="outline" onClick={clearSearch}>
              Clear Search
            </Button>
          ) : (
            <Button variant="outline" onClick={fetchDocuments}>
              Refresh
            </Button>
          )}
        </div>
      ) : (
        <div className="mb-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-sm font-medium text-gray-600">
              {searchResults.length > 0
                ? 'Search Results'
                : `Documents (${getDisplayDocuments().length})`}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {getPaginatedDocuments().map(doc => (
              <Card
                key={doc.id}
                className={`overflow-hidden shadow-sm hover:shadow transition ${selectedDoc?.id === doc.id ? 'ring-2 ring-blue-500' : ''}`}
              >
                <CardContent className="p-0">
                  <div className="flex items-center p-4 border-b justify-between">
                    <div className="flex items-center min-w-0">
                      <FileText className={`h-5 w-5 flex-shrink-0 ${getDocumentIconColor(doc)}`} />
                      <div className="ml-3 min-w-0">
                        <p className="font-medium text-gray-800 truncate">{doc.name}</p>
                        <p className="text-xs text-gray-500">
                          {new Date(doc.createdAt).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="ghost" size="sm">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-56">
                        <div className="grid gap-1">
                          <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => {
                              setSelectedDoc(doc);
                              setSelectedView('preview');
                            }}
                          >
                            <Eye className="h-4 w-4 mr-2" /> Preview
                          </Button>
                          <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => handleDownload(doc.id)}
                          >
                            <Download className="h-4 w-4 mr-2" /> Download
                          </Button>
                          {!searchResults.length && (
                            <Button
                              variant="ghost"
                              className="justify-start"
                              onClick={() => {
                                setDocToMove(doc);
                                setTargetFolder(currentFolder);
                                setShowMoveDocDialog(true);
                              }}
                            >
                              <FolderOpen className="h-4 w-4 mr-2" /> Move
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => handleViewVersionHistory(doc.id)}
                          >
                            <History className="h-4 w-4 mr-2" /> Versions
                          </Button>
                          <Button
                            variant="ghost"
                            className="justify-start"
                            onClick={() => {
                              setSelectedDoc(doc);
                              openModuleLinkDialog(doc.id);
                            }}
                          >
                            <Link className="h-4 w-4 mr-2" /> Module Links
                          </Button>
                          {doc.locked ? (
                            <Button
                              variant="ghost"
                              className="justify-start"
                              onClick={() => handleUnlock(doc.id)}
                            >
                              <Unlock className="h-4 w-4 mr-2" /> Unlock
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              className="justify-start"
                              onClick={() => handleLock(doc.id)}
                            >
                              <Lock className="h-4 w-4 mr-2" /> Lock
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            className="justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleDelete(doc.id)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </Button>
                        </div>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="px-4 py-3">
                    <div className="grid grid-cols-2 gap-1 text-xs text-gray-600">
                      <div className="truncate">
                        <strong>Type:</strong> {doc.metadata?.documentType || 'Unknown'}
                      </div>
                      <div className="truncate">
                        <strong>Size:</strong> {formatFileSize(doc.size)}
                      </div>
                      {doc.metadata?.trialId && (
                        <div className="truncate">
                          <strong>Trial ID:</strong> {doc.metadata.trialId}
                        </div>
                      )}
                      {doc.metadata?.trialPhase && (
                        <div className="truncate">
                          <strong>Phase:</strong> {doc.metadata.trialPhase}
                        </div>
                      )}
                    </div>

                    {/* Module Assignments */}
                    {doc.modules && doc.modules.length > 0 && (
                      <div className="mt-2">
                        <div className="flex flex-wrap gap-1">
                          {doc.modules.map((module, i) => (
                            <Badge
                              key={i}
                              className="bg-blue-100 text-blue-800 hover:bg-blue-200 text-xs"
                            >
                              {getModuleName(module.moduleId)}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Tags */}
                    {doc.tags && doc.tags.length > 0 && (
                      <div className="mt-2">
                        <div className="flex flex-wrap gap-1">
                          {doc.tags.slice(0, 3).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs">
                              {tag.name || tag}
                            </Badge>
                          ))}
                          {doc.tags.length > 3 && (
                            <Badge variant="outline" className="text-xs">
                              +{doc.tags.length - 3}
                            </Badge>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        className="flex-1"
                        onClick={() => {
                          setSelectedDoc(doc);
                          setSelectedView('preview');
                        }}
                      >
                        <Eye className="h-3.5 w-3.5 mr-1" /> View
                      </Button>

                      {aiAvailable && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => {
                            setSelectedDoc(doc);
                            setSelectedView('ai');
                            if (!docSummary) {
                              processWithAI(doc.id);
                            }
                          }}
                        >
                          <Sparkles className="h-3.5 w-3.5 mr-1" /> AI Analysis
                        </Button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination Controls */}
          {getDisplayDocuments().length > pageSize && (
            <div className="flex justify-center gap-2 mt-6">
              <Button
                variant="outline"
                onClick={() => setPage(Math.max(page - 1, 1))}
                disabled={page === 1}
              >
                Previous
              </Button>
              <div className="flex items-center px-4">
                <span className="text-sm text-gray-600">
                  Page {page} of {Math.ceil(getDisplayDocuments().length / pageSize)}
                </span>
              </div>
              <Button
                variant="outline"
                onClick={() => setPage(page + 1)}
                disabled={page >= Math.ceil(getDisplayDocuments().length / pageSize)}
              >
                Next
              </Button>
            </div>
          )}
        </div>
      )}

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Enter a name for your new folder. Folders help you organize your documents.
            </DialogDescription>
          </DialogHeader>
          <Input
            value={newFolderName}
            onChange={e => setNewFolderName(e.target.value)}
            placeholder="Folder name"
            className="mt-2"
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>Create Folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Rename Folder Dialog */}
      <Dialog open={showRenameFolderDialog} onOpenChange={setShowRenameFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename Folder</DialogTitle>
            <DialogDescription>
              Enter a new name for the folder "{folderToRename?.name}".
            </DialogDescription>
          </DialogHeader>
          <Input
            value={renameFolderValue}
            onChange={e => setRenameFolderValue(e.target.value)}
            placeholder="New folder name"
            className="mt-2"
          />
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowRenameFolderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleRenameFolder}>Rename Folder</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Move Document Dialog */}
      <Dialog open={showMoveDocDialog} onOpenChange={setShowMoveDocDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Move Document</DialogTitle>
            <DialogDescription>
              Select a destination folder for "{docToMove?.name}".
            </DialogDescription>
          </DialogHeader>
          <Select value={targetFolder} onValueChange={setTargetFolder}>
            <SelectTrigger>
              <SelectValue placeholder="Select destination folder" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="/">Root</SelectItem>
              {folders.map(folder => (
                <SelectItem key={folder.id} value={folder.path}>
                  {folder.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DialogFooter className="mt-4">
            <Button variant="outline" onClick={() => setShowMoveDocDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleMoveDocument}>Move Document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Version History Dialog */}
      <Dialog open={showVersionHistory} onOpenChange={setShowVersionHistory}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Version History</DialogTitle>
            <DialogDescription>
              View and restore previous versions of the document.
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y">
            {versionHistory.map(version => (
              <div key={version.versionNumber} className="py-3 flex justify-between items-center">
                <div>
                  <p className="font-medium">Version {version.versionNumber}</p>
                  <p className="text-sm text-gray-500">
                    {new Date(version.createdAt).toLocaleString()} by {version.createdBy}
                  </p>
                  {version.comment && <p className="text-sm italic mt-1">{version.comment}</p>}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevertToVersion(version.documentId, version.versionNumber)}
                    disabled={version.current}
                  >
                    {version.current ? (
                      <Check className="h-4 w-4 mr-1" />
                    ) : (
                      <RotateCcw className="h-4 w-4 mr-1" />
                    )}
                    {version.current ? 'Current' : 'Restore'}
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowVersionHistory(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Module Linking Dialog */}
      <Dialog open={showModuleLinkDialog} onOpenChange={setShowModuleLinkDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Module Assignments</DialogTitle>
            <DialogDescription>
              Assign this document to relevant regulatory modules.
            </DialogDescription>
          </DialogHeader>

          {docModuleRecommendations && docModuleRecommendations.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium mb-2">AI Recommendations</h4>
              <div className="bg-blue-50 p-3 rounded-md border border-blue-100 text-sm">
                <p className="text-blue-700 mb-2">
                  Based on content analysis, this document is recommended for:
                </p>
                <div className="space-y-2">
                  {docModuleRecommendations.map(recommendation => (
                    <div
                      key={recommendation.moduleId}
                      className="flex justify-between items-center"
                    >
                      <div className="flex items-center gap-2">
                        <Checkbox
                          id={`rec-${recommendation.moduleId}`}
                          checked={selectedModules.includes(recommendation.moduleId)}
                          onCheckedChange={() => toggleModuleSelection(recommendation.moduleId)}
                        />
                        <label htmlFor={`rec-${recommendation.moduleId}`}>
                          {getModuleName(recommendation.moduleId)}
                        </label>
                      </div>
                      <div className="flex items-center">
                        <div className="w-24 bg-gray-200 rounded-full h-2.5">
                          <div
                            className="bg-blue-600 h-2.5 rounded-full"
                            style={{ width: `${Math.round(recommendation.confidence * 100)}%` }}
                          ></div>
                        </div>
                        <span className="ml-2 text-xs text-gray-600">
                          {Math.round(recommendation.confidence * 100)}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
                <div className="mt-3">
                  <Button variant="outline" size="sm" onClick={() => applyRecommendedModules(0.7)}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Apply Recommendations
                  </Button>
                </div>
              </div>
            </div>
          )}

          <div className="space-y-2">
            <h4 className="text-sm font-medium mb-2">All Modules</h4>
            {eCTDModules.map(module => (
              <div key={module.id} className="flex items-center space-x-2">
                <Checkbox
                  id={module.id}
                  checked={selectedModules.includes(module.id)}
                  onCheckedChange={() => toggleModuleSelection(module.id)}
                />
                <label htmlFor={module.id} className="flex flex-col">
                  <span className="font-medium">{module.name}</span>
                  <span className="text-xs text-gray-500">{module.description}</span>
                </label>
              </div>
            ))}
          </div>

          <DialogFooter className="mt-4">
            <div className="flex items-center mr-auto">
              <Switch
                id="auto-assign"
                checked={autoModuleLinking}
                onCheckedChange={setAutoModuleLinking}
              />
              <Label htmlFor="auto-assign" className="ml-2">
                Auto-assign future uploads
              </Label>
            </div>
            <Button variant="outline" onClick={() => setShowModuleLinkDialog(false)}>
              Cancel
            </Button>
            <Button onClick={saveModuleAssignments}>Save Assignments</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Document Viewer Dialog */}
      <Dialog
        open={!!selectedDoc}
        onOpenChange={open => {
          if (!open) {
            setSelectedDoc(null);
            setDocSummary(null);
            setDocTags([]);
            setDocInsights([]);
            setDocMetadata(null);
          }
        }}
      >
        <DialogContent
          className={`max-w-${viewWidth === 'large' ? '6xl' : viewWidth === 'medium' ? '4xl' : '2xl'} h-[80vh]`}
        >
          <DialogHeader className="flex flex-row items-center justify-between space-y-0">
            <div>
              <DialogTitle className="truncate max-w-md">{selectedDoc?.name}</DialogTitle>
              <DialogDescription>
                {selectedDoc?.metadata?.documentType || 'Document'} •{' '}
                {formatFileSize(selectedDoc?.size)}
              </DialogDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={viewWidth} onValueChange={setViewWidth}>
                <SelectTrigger className="w-28">
                  <SelectValue placeholder="View size" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="small">Small</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="large">Large</SelectItem>
                </SelectContent>
              </Select>

              <Tabs value={selectedView} onValueChange={setSelectedView}>
                <TabsList>
                  <TabsTrigger value="preview">Preview</TabsTrigger>
                  {aiAvailable && <TabsTrigger value="ai">AI Analysis</TabsTrigger>}
                  <TabsTrigger value="modules">Modules</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-auto">
            <TabsContent value="preview" className="h-full">
              {selectedDoc && (
                <div className="h-full border rounded">
                  <InlineViewer fileUrl={selectedDoc.viewUrl || selectedDoc.fileUrl} />
                </div>
              )}
            </TabsContent>

            <TabsContent value="ai" className="h-full">
              {aiProcessing ? (
                <div className="flex flex-col items-center justify-center h-full">
                  <div className="animate-spin h-8 w-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-4"></div>
                  <p className="text-blue-600 font-medium">Processing document with AI...</p>
                  <Progress value={processingProgress} className="w-1/2 mt-4" />
                </div>
              ) : (
                <div className="h-full overflow-y-auto">
                  <Accordion type="single" collapsible defaultValue="summary">
                    {/* Document Summary */}
                    <AccordionItem value="summary">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center">
                          <BookOpen className="h-5 w-5 mr-2 text-blue-500" />
                          <span>Document Summary</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {docSummary ? (
                          <div className="space-y-3">
                            <div className="relative bg-gray-50 p-4 rounded-md">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute right-2 top-2"
                                onClick={() => {
                                  navigator.clipboard.writeText(docSummary.summary);
                                  toast({
                                    title: 'Copied',
                                    description: 'Summary copied to clipboard.',
                                  });
                                }}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                              <p className="text-gray-700">{docSummary.summary}</p>
                            </div>

                            {docSummary.keyPoints && (
                              <div className="mt-4">
                                <h4 className="font-medium mb-2">Key Points</h4>
                                <ul className="list-disc list-inside space-y-1">
                                  {docSummary.keyPoints.map((point, i) => (
                                    <li key={i} className="text-gray-700">
                                      {point}
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="text-center py-6">
                            <p className="text-gray-500">No summary available</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => processWithAI(selectedDoc.id)}
                            >
                              Generate Summary
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>

                    {/* AI Generated Tags */}
                    <AccordionItem value="tags">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center">
                          <Tag className="h-5 w-5 mr-2 text-blue-500" />
                          <span>AI Generated Tags</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {docTags && docTags.length > 0 ? (
                          <div className="space-y-3">
                            <div className="flex flex-wrap gap-2">
                              {docTags.map((tag, i) => (
                                <div key={i} className="relative group">
                                  <Badge
                                    className="px-3 py-1 cursor-pointer hover:bg-blue-100"
                                    onClick={() => {
                                      // Use tag to filter documents
                                      if (searchFilters.tags.includes(tag.name || tag)) {
                                        setSearchFilters({
                                          ...searchFilters,
                                          tags: searchFilters.tags.filter(
                                            t => t !== (tag.name || tag)
                                          ),
                                        });
                                      } else {
                                        setSearchFilters({
                                          ...searchFilters,
                                          tags: [...searchFilters.tags, tag.name || tag],
                                        });
                                      }
                                      performSearch();
                                    }}
                                  >
                                    {tag.name || tag}
                                    {tag.confidence && (
                                      <span className="ml-2 opacity-60">
                                        {Math.round(tag.confidence * 100)}%
                                      </span>
                                    )}
                                  </Badge>
                                </div>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="text-center py-6">
                            <p className="text-gray-500">No tags available</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => processWithAI(selectedDoc.id)}
                            >
                              Generate Tags
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>

                    {/* Extracted Metadata */}
                    <AccordionItem value="metadata">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center">
                          <Braces className="h-5 w-5 mr-2 text-blue-500" />
                          <span>Extracted Metadata</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {docMetadata ? (
                          <div className="grid grid-cols-2 gap-3">
                            {Object.entries(docMetadata).map(([key, value]) => (
                              <div key={key} className="bg-gray-50 p-3 rounded">
                                <p className="text-sm font-medium text-gray-700">
                                  {formatMetadataKey(key)}
                                </p>
                                <p className="text-gray-600">{value}</p>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6">
                            <p className="text-gray-500">No extracted metadata available</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => processWithAI(selectedDoc.id)}
                            >
                              Extract Metadata
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>

                    {/* Key Insights */}
                    <AccordionItem value="insights">
                      <AccordionTrigger className="hover:no-underline">
                        <div className="flex items-center">
                          <Brain className="h-5 w-5 mr-2 text-blue-500" />
                          <span>Key Insights</span>
                        </div>
                      </AccordionTrigger>
                      <AccordionContent>
                        {docInsights && docInsights.length > 0 ? (
                          <div className="space-y-3">
                            {docInsights.map((insight, i) => (
                              <div key={i} className="bg-gray-50 p-3 rounded flex">
                                <div
                                  className={`w-2 self-stretch rounded-full mr-3 ${getInsightPriorityColor(insight.priority)}`}
                                ></div>
                                <div>
                                  <p className="text-gray-700">{insight.text}</p>
                                  <div className="flex gap-2 mt-1">
                                    {insight.category && (
                                      <Badge variant="outline" className="text-xs">
                                        {insight.category}
                                      </Badge>
                                    )}
                                    {insight.priority && (
                                      <Badge
                                        className={`text-xs ${getInsightPriorityBadgeColor(insight.priority)}`}
                                      >
                                        {insight.priority}
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6">
                            <p className="text-gray-500">No key insights available</p>
                            <Button
                              variant="outline"
                              size="sm"
                              className="mt-2"
                              onClick={() => processWithAI(selectedDoc.id)}
                            >
                              Extract Insights
                            </Button>
                          </div>
                        )}
                      </AccordionContent>
                    </AccordionItem>
                  </Accordion>
                </div>
              )}
            </TabsContent>

            <TabsContent value="modules" className="h-full">
              <div className="py-4 space-y-6">
                <div className="border rounded-md p-4">
                  <h2 className="text-lg font-medium mb-3">Module Assignments</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Assign this document to appropriate regulatory submission modules.
                  </p>

                  {selectedDoc && (
                    <>
                      <div className="space-y-3">
                        {eCTDModules.map(module => (
                          <div
                            key={module.id}
                            className="flex justify-between items-center border-b pb-2"
                          >
                            <div>
                              <p className="font-medium">{module.name}</p>
                              <p className="text-sm text-gray-500">{module.description}</p>
                            </div>
                            <Button
                              variant={
                                selectedDoc.modules?.some(m => m.moduleId === module.id)
                                  ? 'default'
                                  : 'outline'
                              }
                              size="sm"
                              onClick={() => openModuleLinkDialog(selectedDoc.id)}
                            >
                              {selectedDoc.modules?.some(m => m.moduleId === module.id) ? (
                                <>
                                  <Check className="h-4 w-4 mr-1" /> Assigned
                                </>
                              ) : (
                                'Assign'
                              )}
                            </Button>
                          </div>
                        ))}
                      </div>

                      <div className="mt-4">
                        <Button onClick={() => openModuleLinkDialog(selectedDoc.id)}>
                          Manage Module Assignments
                        </Button>
                      </div>
                    </>
                  )}
                </div>

                <div className="border rounded-md p-4">
                  <h2 className="text-lg font-medium mb-3">Auto-Linking</h2>
                  <p className="text-sm text-gray-500 mb-4">
                    Control how documents are automatically linked to regulatory modules.
                  </p>

                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-medium">Auto-Link Documents</p>
                        <p className="text-sm text-gray-500">
                          Automatically assign documents to recommended modules on upload
                        </p>
                      </div>
                      <Switch checked={autoModuleLinking} onCheckedChange={setAutoModuleLinking} />
                    </div>

                    <div className="space-y-2">
                      <p className="font-medium">Confidence Threshold</p>
                      <p className="text-sm text-gray-500">
                        Minimum confidence level required for automatic assignments
                      </p>
                      <div className="pt-2">
                        <Slider defaultValue={[70]} max={100} step={5} className="w-full" />
                        <div className="flex justify-between text-xs text-gray-500 mt-1">
                          <span>Low (50%)</span>
                          <span>Medium (70%)</span>
                          <span>High (90%)</span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </TabsContent>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// Helper function to format file size
function formatFileSize(bytes) {
  if (!bytes) return 'Unknown';

  const units = ['B', 'KB', 'MB', 'GB'];
  let size = bytes;
  let unitIndex = 0;

  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }

  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

// Helper function to get document icon color based on document type
function getDocumentIconColor(doc) {
  const docType = doc.metadata?.documentType?.toLowerCase() || '';

  if (docType.includes('protocol')) return 'text-purple-500';
  if (docType.includes('report') || docType.includes('csr')) return 'text-red-500';
  if (docType.includes('analysis') || docType.includes('sap')) return 'text-blue-600';
  if (docType.includes('brochure') || docType.includes('ib')) return 'text-green-600';
  if (docType.includes('consent')) return 'text-orange-500';

  const ext = doc.name.split('.').pop()?.toLowerCase();
  if (ext === 'pdf') return 'text-red-500';
  if (ext === 'doc' || ext === 'docx') return 'text-blue-600';
  if (ext === 'xls' || ext === 'xlsx') return 'text-green-600';

  return 'text-gray-500';
}

// Format metadata key for display
function formatMetadataKey(key) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, str => str.toUpperCase())
    .replace(/([a-z])([A-Z])/g, '$1 $2');
}

// Get color for insight priority
function getInsightPriorityColor(priority) {
  if (!priority) return 'bg-gray-300';

  switch (priority.toLowerCase()) {
    case 'high':
      return 'bg-red-500';
    case 'medium':
      return 'bg-yellow-500';
    case 'low':
      return 'bg-blue-500';
    default:
      return 'bg-gray-300';
  }
}

// Get badge color for insight priority
function getInsightPriorityBadgeColor(priority) {
  if (!priority) return 'bg-gray-200 text-gray-800';

  switch (priority.toLowerCase()) {
    case 'high':
      return 'bg-red-100 text-red-800';
    case 'medium':
      return 'bg-yellow-100 text-yellow-800';
    case 'low':
      return 'bg-blue-100 text-blue-800';
    default:
      return 'bg-gray-100 text-gray-800';
  }
}

// Get module name from ID
function getModuleName(moduleId) {
  const module = eCTDModules.find(m => m.id === moduleId);
  if (module) {
    return module.name.split(' - ')[0];
  }
  return moduleId;
}
