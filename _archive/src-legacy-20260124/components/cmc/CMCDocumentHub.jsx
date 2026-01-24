import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import {
  RefreshCw,
  Upload,
  FileText,
  File,
  CheckCircle,
  AlertTriangle,
  Search,
  MoreHorizontal,
  Download,
  Trash2,
  Share2,
  PlusCircle,
  FolderPlus,
  Filter,
  Tag,
  Link,
  Clock,
  Calendar,
  Users,
  Shield,
  Eye,
  EyeOff,
  Edit,
  ArrowUpDown,
  ExternalLink,
  Copy,
  ChevronRight,
  ClipboardList,
  Microscope,
  FileCheck,
  FileLock2,
  FlaskConical,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

/**
 * CMC Document Hub
 *
 * A comprehensive document management system for CMC regulatory documents
 * with version control, AI-powered analysis, and collaboration features.
 */
const CMCDocumentHub = () => {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState('all');
  const [uploading, setUploading] = useState(false);
  const [documents, setDocuments] = useState([]);
  const [filteredDocuments, setFilteredDocuments] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocuments, setSelectedDocuments] = useState([]);
  const [documentTypes, setDocumentTypes] = useState([]);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [showNewFolderDialog, setShowNewFolderDialog] = useState(false);
  const [showUploadDialog, setShowUploadDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [uploadFiles, setUploadFiles] = useState([]);
  const [currentView, setCurrentView] = useState('grid');
  const [sortField, setSortField] = useState('lastModified');
  const [sortDirection, setSortDirection] = useState('desc');

  // Sample document data
  const sampleDocuments = [
    {
      id: '1',
      name: 'API Method Validation Report',
      type: 'Method Validation',
      status: 'Approved',
      version: '1.2',
      lastModified: '2025-03-24T14:30:00Z',
      modifiedBy: 'Sarah Johnson',
      size: '2.4 MB',
      format: 'pdf',
      path: '/CMC/Method Validation/',
      tags: ['API', 'HPLC', 'Validation'],
      aiAnalyzed: true,
      aiScore: 92,
      regulatory: ['FDA', 'EMA'],
      isLocked: false,
      isStarred: true,
      description: 'Validation report for HPLC assay method for API determination.',
      thumbnailUrl: 'https://placehold.co/400x500/e6f7ff/0099cc?text=HPLC+Validation+Report',
    },
    {
      id: '2',
      name: 'Drug Product Specification',
      type: 'Specification',
      status: 'Pending Review',
      version: '2.1',
      lastModified: '2025-04-10T09:15:00Z',
      modifiedBy: 'Michael Chen',
      size: '1.7 MB',
      format: 'docx',
      path: '/CMC/Specifications/',
      tags: ['Drug Product', 'Tablet', 'Release'],
      aiAnalyzed: true,
      aiScore: 85,
      regulatory: ['FDA', 'EMA', 'PMDA'],
      isLocked: false,
      isStarred: false,
      description: 'Drug product specification for tablet formulation.',
      thumbnailUrl: 'https://placehold.co/400x500/f9f9f9/333333?text=Product+Specification',
    },
    {
      id: '3',
      name: 'Stability Protocol',
      type: 'Protocol',
      status: 'Draft',
      version: '0.8',
      lastModified: '2025-04-15T11:45:00Z',
      modifiedBy: 'Jennifer Williams',
      size: '3.1 MB',
      format: 'docx',
      path: '/CMC/Stability/',
      tags: ['Stability', 'Protocol', 'Long-term'],
      aiAnalyzed: true,
      aiScore: 78,
      regulatory: ['FDA', 'ICH'],
      isLocked: false,
      isStarred: false,
      description: 'Long-term and accelerated stability protocol for drug product.',
      thumbnailUrl: 'https://placehold.co/400x500/fff5e6/cc7700?text=Stability+Protocol',
    },
    {
      id: '4',
      name: 'Manufacturing Process Validation',
      type: 'Validation',
      status: 'Approved',
      version: '2.0',
      lastModified: '2025-03-05T15:20:00Z',
      modifiedBy: 'Robert Miller',
      size: '8.5 MB',
      format: 'pdf',
      path: '/CMC/Manufacturing/',
      tags: ['Process Validation', 'GMP', 'Manufacturing'],
      aiAnalyzed: true,
      aiScore: 95,
      regulatory: ['FDA', 'EMA', 'Health Canada'],
      isLocked: true,
      isStarred: true,
      description: 'Process validation report for commercial manufacturing process.',
      thumbnailUrl: 'https://placehold.co/400x500/e6ffe6/009900?text=Process+Validation',
    },
    {
      id: '5',
      name: 'Container Closure System',
      type: 'Report',
      status: 'Needs Revision',
      version: '1.3',
      lastModified: '2025-04-02T10:05:00Z',
      modifiedBy: 'Emily Davis',
      size: '4.2 MB',
      format: 'pdf',
      path: '/CMC/Packaging/',
      tags: ['Container', 'Packaging', 'Compatibility'],
      aiAnalyzed: false,
      aiScore: null,
      regulatory: ['FDA'],
      isLocked: false,
      isStarred: false,
      description: 'Container closure system evaluation and compatibility assessment.',
      thumbnailUrl: 'https://placehold.co/400x500/f2f2f2/666666?text=Container+Closure',
    },
    {
      id: '6',
      name: 'API Starting Materials',
      type: 'Documentation',
      status: 'Approved',
      version: '1.0',
      lastModified: '2025-02-28T09:30:00Z',
      modifiedBy: 'David Thompson',
      size: '1.9 MB',
      format: 'pdf',
      path: '/CMC/API/',
      tags: ['Starting Materials', 'API', 'Synthesis'],
      aiAnalyzed: true,
      aiScore: 88,
      regulatory: ['FDA', 'EMA'],
      isLocked: true,
      isStarred: false,
      description: 'Documentation for API starting materials and synthesis routes.',
      thumbnailUrl: 'https://placehold.co/400x500/e6e6ff/3333cc?text=API+Materials',
    },
    {
      id: '7',
      name: 'Reference Standards',
      type: 'Certificate',
      status: 'Approved',
      version: '2.5',
      lastModified: '2025-03-20T14:10:00Z',
      modifiedBy: 'Lisa Roberts',
      size: '0.8 MB',
      format: 'pdf',
      path: '/CMC/Quality Control/',
      tags: ['Reference Standards', 'Certificate', 'QC'],
      aiAnalyzed: true,
      aiScore: 98,
      regulatory: ['FDA', 'EMA', 'PMDA', 'NMPA'],
      isLocked: false,
      isStarred: true,
      description: 'Certificate and characterization data for reference standards.',
      thumbnailUrl: 'https://placehold.co/400x500/ffffe6/999900?text=Reference+Standards',
    },
    {
      id: '8',
      name: 'Excipient Compatibility Study',
      type: 'Study Report',
      status: 'Pending Review',
      version: '1.1',
      lastModified: '2025-04-18T16:45:00Z',
      modifiedBy: 'Kevin Zhang',
      size: '5.6 MB',
      format: 'docx',
      path: '/CMC/Formulation/',
      tags: ['Excipients', 'Compatibility', 'Formulation'],
      aiAnalyzed: false,
      aiScore: null,
      regulatory: ['FDA'],
      isLocked: false,
      isStarred: false,
      description: 'Study report on API-excipient compatibility for formulation development.',
      thumbnailUrl: 'https://placehold.co/400x500/ffe6e6/cc3333?text=Excipient+Study',
    },
  ];

  useEffect(() => {
    // Initialize document list
    setDocuments(sampleDocuments);
    setFilteredDocuments(sampleDocuments);

    // Extract unique document types
    const types = [...new Set(sampleDocuments.map(doc => doc.type))];
    setDocumentTypes(types);

    toast({
      title: 'Document Hub Loaded',
      description: 'Connected to CMC document repository.',
    });
  }, []);

  // Apply filters and search
  useEffect(() => {
    let filtered = [...documents];

    // Apply search query
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(
        doc =>
          doc.name.toLowerCase().includes(query) ||
          doc.description.toLowerCase().includes(query) ||
          doc.tags.some(tag => tag.toLowerCase().includes(query))
      );
    }

    // Apply tag filters
    if (selectedTags.length > 0) {
      filtered = filtered.filter(doc => selectedTags.some(tag => doc.tags.includes(tag)));
    }

    // Apply document type filter
    if (activeTab !== 'all' && activeTab !== 'starred' && activeTab !== 'recent') {
      filtered = filtered.filter(doc => doc.type === activeTab);
    }

    // Apply starred filter
    if (activeTab === 'starred') {
      filtered = filtered.filter(doc => doc.isStarred);
    }

    // Apply status filter
    if (selectedStatus !== 'all') {
      filtered = filtered.filter(doc => doc.status === selectedStatus);
    }

    // Sort documents
    filtered = filtered.sort((a, b) => {
      if (sortField === 'name') {
        return sortDirection === 'asc'
          ? a.name.localeCompare(b.name)
          : b.name.localeCompare(a.name);
      } else if (sortField === 'lastModified') {
        return sortDirection === 'asc'
          ? new Date(a.lastModified) - new Date(b.lastModified)
          : new Date(b.lastModified) - new Date(a.lastModified);
      } else if (sortField === 'aiScore') {
        if (a.aiScore === null) return 1;
        if (b.aiScore === null) return -1;
        return sortDirection === 'asc' ? a.aiScore - b.aiScore : b.aiScore - a.aiScore;
      }
      return 0;
    });

    setFilteredDocuments(filtered);
  }, [documents, searchQuery, activeTab, selectedTags, selectedStatus, sortField, sortDirection]);

  const handleUpload = () => {
    setUploading(true);

    // Simulate upload delay
    setTimeout(() => {
      setUploading(false);
      setUploadFiles([]);
      setShowUploadDialog(false);

      toast({
        title: 'Upload Complete',
        description: `${uploadFiles.length} document(s) uploaded successfully.`,
      });
    }, 2000);
  };

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast({
        title: 'Folder Name Required',
        description: 'Please enter a name for the new folder.',
        variant: 'destructive',
      });
      return;
    }

    toast({
      title: 'Folder Created',
      description: `Folder "${newFolderName}" created successfully.`,
    });

    setNewFolderName('');
    setShowNewFolderDialog(false);
  };

  const handleSelectAll = e => {
    if (e.target.checked) {
      setSelectedDocuments(filteredDocuments.map(doc => doc.id));
    } else {
      setSelectedDocuments([]);
    }
  };

  const handleSelectDocument = id => {
    if (selectedDocuments.includes(id)) {
      setSelectedDocuments(selectedDocuments.filter(docId => docId !== id));
    } else {
      setSelectedDocuments([...selectedDocuments, id]);
    }
  };

  const handleToggleStar = id => {
    setDocuments(
      documents.map(doc => (doc.id === id ? { ...doc, isStarred: !doc.isStarred } : doc))
    );
  };

  const handleDeleteSelected = () => {
    if (selectedDocuments.length === 0) return;

    // Filter out selected documents
    setDocuments(documents.filter(doc => !selectedDocuments.includes(doc.id)));
    setSelectedDocuments([]);

    toast({
      title: 'Documents Deleted',
      description: `${selectedDocuments.length} document(s) deleted successfully.`,
    });
  };

  const handleSort = field => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const handleFileChange = e => {
    const files = Array.from(e.target.files);
    setUploadFiles(files);
  };

  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusColor = status => {
    switch (status) {
      case 'Approved':
        return 'text-green-800 dark:text-green-300 bg-green-100 dark:bg-green-950/30';
      case 'Pending Review':
        return 'text-blue-800 dark:text-blue-300 bg-blue-100 dark:bg-blue-950/30';
      case 'Draft':
        return 'text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-gray-950/30';
      case 'Needs Revision':
        return 'text-amber-800 dark:text-amber-300 bg-amber-100 dark:bg-amber-950/30';
      default:
        return 'text-gray-800 dark:text-gray-300 bg-gray-100 dark:bg-gray-950/30';
    }
  };

  const getDocumentIcon = (type, format) => {
    switch (type) {
      case 'Method Validation':
        return <Microscope className="h-4 w-4" />;
      case 'Specification':
        return <ClipboardList className="h-4 w-4" />;
      case 'Protocol':
        return <FileText className="h-4 w-4" />;
      case 'Validation':
        return <FileCheck className="h-4 w-4" />;
      case 'Report':
        return <FileText className="h-4 w-4" />;
      case 'Documentation':
        return <File className="h-4 w-4" />;
      case 'Certificate':
        return <Shield className="h-4 w-4" />;
      case 'Study Report':
        return <FlaskConical className="h-4 w-4" />;
      default:
        return <File className="h-4 w-4" />;
    }
  };

  return (
    <Card className="w-full shadow-md border-2 border-black dark:border-white">
      <CardHeader className="bg-black text-white dark:bg-white dark:text-black">
        <div className="flex justify-between items-start">
          <div>
            <CardTitle className="text-xl flex items-center gap-2">
              <FileText className="h-5 w-5" />
              CMC Document Hub
            </CardTitle>
            <CardDescription className="text-gray-300 dark:text-gray-700">
              Centralized document management for CMC regulatory submissions
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="bg-white/20 text-white border-white hover:bg-white/30 dark:bg-black/20 dark:text-black dark:border-black dark:hover:bg-black/30"
            >
              <FolderPlus className="h-4 w-4 mr-1" />
              New Folder
            </Button>
            <Button className="bg-white text-black hover:bg-white/90 dark:bg-black dark:text-white dark:hover:bg-black/90">
              <Upload className="h-4 w-4 mr-1" />
              Upload Documents
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="border-b border-gray-200 dark:border-gray-800">
          <div className="p-4 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
            <div className="flex-1 w-full sm:max-w-sm">
              <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-500 dark:text-gray-400" />
                <Input
                  placeholder="Search documents..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-2 items-center ml-auto">
              <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                <SelectTrigger className="w-[130px] h-9">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Statuses</SelectItem>
                  <SelectItem value="Approved">Approved</SelectItem>
                  <SelectItem value="Pending Review">Pending Review</SelectItem>
                  <SelectItem value="Draft">Draft</SelectItem>
                  <SelectItem value="Needs Revision">Needs Revision</SelectItem>
                </SelectContent>
              </Select>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-9">
                    <Filter className="h-4 w-4 mr-1" />
                    Filter
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <div className="p-2">
                    <div className="mb-2 font-medium">Filter by Tags</div>
                    <div className="flex flex-wrap gap-1">
                      {['API', 'Validation', 'Stability', 'Manufacturing', 'QC', 'Formulation'].map(
                        tag => (
                          <Badge
                            key={tag}
                            variant={selectedTags.includes(tag) ? 'default' : 'outline'}
                            className="cursor-pointer"
                            onClick={() => {
                              if (selectedTags.includes(tag)) {
                                setSelectedTags(selectedTags.filter(t => t !== tag));
                              } else {
                                setSelectedTags([...selectedTags, tag]);
                              }
                            }}
                          >
                            {tag}
                          </Badge>
                        )
                      )}
                    </div>
                  </div>
                </DropdownMenuContent>
              </DropdownMenu>

              <div className="flex rounded-md overflow-hidden border border-gray-200 dark:border-gray-800">
                <Button
                  variant="ghost"
                  size="sm"
                  className={`px-2 h-9 rounded-none ${currentView === 'grid' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                  onClick={() => setCurrentView('grid')}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <rect
                      x="3"
                      y="3"
                      width="7"
                      height="7"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <rect
                      x="14"
                      y="3"
                      width="7"
                      height="7"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <rect
                      x="3"
                      y="14"
                      width="7"
                      height="7"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                    <rect
                      x="14"
                      y="14"
                      width="7"
                      height="7"
                      rx="1"
                      stroke="currentColor"
                      strokeWidth="2"
                    />
                  </svg>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={`px-2 h-9 rounded-none ${currentView === 'list' ? 'bg-gray-100 dark:bg-gray-800' : ''}`}
                  onClick={() => setCurrentView('list')}
                >
                  <svg
                    className="h-4 w-4"
                    viewBox="0 0 24 24"
                    fill="none"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <path
                      d="M8 6H21"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 12H21"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M8 18H21"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M3 6H3.01"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M3 12H3.01"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                    <path
                      d="M3 18H3.01"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </Button>
              </div>
            </div>
          </div>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="p-0 px-4">
              <TabsTrigger value="all" className="data-[state=active]:bg-transparent">
                All Documents
              </TabsTrigger>
              <TabsTrigger value="starred" className="data-[state=active]:bg-transparent">
                Starred
              </TabsTrigger>
              <TabsTrigger value="recent" className="data-[state=active]:bg-transparent">
                Recent
              </TabsTrigger>
              <TabsTrigger value="Method Validation" className="data-[state=active]:bg-transparent">
                Method Validation
              </TabsTrigger>
              <TabsTrigger value="Specification" className="data-[state=active]:bg-transparent">
                Specifications
              </TabsTrigger>
              <TabsTrigger value="Protocol" className="data-[state=active]:bg-transparent">
                Protocols
              </TabsTrigger>
            </TabsList>
          </Tabs>
        </div>

        <div className="p-4">
          {selectedDocuments.length > 0 && (
            <div className="mb-4 flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-900 rounded">
              <span className="text-sm font-medium">
                {selectedDocuments.length} document(s) selected
              </span>
              <div className="ml-auto flex gap-2">
                <Button variant="outline" size="sm">
                  <Download className="h-4 w-4 mr-1" />
                  Download
                </Button>
                <Button variant="outline" size="sm">
                  <Share2 className="h-4 w-4 mr-1" />
                  Share
                </Button>
                <Button variant="destructive" size="sm" onClick={handleDeleteSelected}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
              </div>
            </div>
          )}

          {currentView === 'grid' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
              {filteredDocuments.map(doc => (
                <div
                  key={doc.id}
                  className={`group relative border dark:border-gray-800 rounded-lg overflow-hidden hover:shadow-md transition-shadow ${
                    selectedDocuments.includes(doc.id)
                      ? 'ring-2 ring-blue-500 dark:ring-blue-500'
                      : ''
                  }`}
                >
                  <div className="absolute top-2 left-2 z-10">
                    <Checkbox
                      checked={selectedDocuments.includes(doc.id)}
                      onCheckedChange={() => handleSelectDocument(doc.id)}
                      className="h-5 w-5 border-white bg-white/20 backdrop-blur-sm data-[state=checked]:bg-blue-500 data-[state=checked]:text-white"
                    />
                  </div>

                  <div className="absolute top-2 right-2 z-10 flex gap-1">
                    <Button
                      variant="ghost"
                      size="icon"
                      className={`h-7 w-7 rounded-full ${doc.isStarred ? 'text-yellow-500 hover:text-yellow-600' : 'text-white/70 hover:text-white'}`}
                      onClick={() => handleToggleStar(doc.id)}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill={doc.isStarred ? 'currentColor' : 'none'}
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="h-4 w-4"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </Button>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 rounded-full text-white/70 hover:text-white"
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent>
                        <DropdownMenuItem>
                          <Download className="h-4 w-4 mr-2" />
                          <span>Download</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Share2 className="h-4 w-4 mr-2" />
                          <span>Share</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <Edit className="h-4 w-4 mr-2" />
                          <span>Edit</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem className="text-red-600 dark:text-red-400">
                          <Trash2 className="h-4 w-4 mr-2" />
                          <span>Delete</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>

                  <div className="h-48 bg-gray-200 dark:bg-gray-800 relative">
                    <div className="absolute inset-0 flex items-center justify-center">
                      <img
                        src={doc.thumbnailUrl}
                        alt={doc.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent group-hover:opacity-80 transition-opacity"></div>
                  </div>

                  <div className="p-3">
                    <div className="flex items-start gap-2">
                      <div className="mt-0.5">{getDocumentIcon(doc.type, doc.format)}</div>
                      <div>
                        <h4 className="font-medium text-black dark:text-white line-clamp-1">
                          {doc.name}
                        </h4>
                        <p className="text-xs text-gray-500 dark:text-gray-400">
                          {doc.type} • v{doc.version}
                        </p>
                      </div>
                    </div>

                    <div className="flex justify-between items-center mt-2">
                      <Badge className={`text-xs ${getStatusColor(doc.status)}`}>
                        {doc.status}
                      </Badge>

                      {doc.aiAnalyzed && (
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-medium">AI:</span>
                          <Badge
                            variant="outline"
                            className={`text-xs ${
                              doc.aiScore >= 90
                                ? 'text-green-600 dark:text-green-400'
                                : doc.aiScore >= 80
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {doc.aiScore}%
                          </Badge>
                        </div>
                      )}
                    </div>

                    <div className="mt-2 text-xs text-gray-500 dark:text-gray-400 flex justify-between">
                      <span>Updated {formatDate(doc.lastModified)}</span>
                      <span>{doc.size}</span>
                    </div>

                    <div className="mt-2 flex flex-wrap gap-1">
                      {doc.tags.slice(0, 2).map((tag, i) => (
                        <Badge key={i} variant="outline" className="text-xs py-0">
                          {tag}
                        </Badge>
                      ))}
                      {doc.tags.length > 2 && (
                        <Badge variant="outline" className="text-xs py-0">
                          +{doc.tags.length - 2}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[30px]">
                      <Checkbox
                        onCheckedChange={handleSelectAll}
                        checked={
                          filteredDocuments.length > 0 &&
                          selectedDocuments.length === filteredDocuments.length
                        }
                      />
                    </TableHead>
                    <TableHead
                      className="min-w-[250px] cursor-pointer"
                      onClick={() => handleSort('name')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Name</span>
                        {sortField === 'name' && (
                          <ArrowUpDown
                            className={`h-3 w-3 ${sortDirection === 'asc' ? 'rotate-180' : ''}`}
                          />
                        )}
                      </div>
                    </TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead
                      className="cursor-pointer"
                      onClick={() => handleSort('lastModified')}
                    >
                      <div className="flex items-center gap-1">
                        <span>Last Modified</span>
                        {sortField === 'lastModified' && (
                          <ArrowUpDown
                            className={`h-3 w-3 ${sortDirection === 'asc' ? 'rotate-180' : ''}`}
                          />
                        )}
                      </div>
                    </TableHead>
                    <TableHead className="cursor-pointer" onClick={() => handleSort('aiScore')}>
                      <div className="flex items-center gap-1">
                        <span>AI Score</span>
                        {sortField === 'aiScore' && (
                          <ArrowUpDown
                            className={`h-3 w-3 ${sortDirection === 'asc' ? 'rotate-180' : ''}`}
                          />
                        )}
                      </div>
                    </TableHead>
                    <TableHead>Tags</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredDocuments.map(doc => (
                    <TableRow key={doc.id}>
                      <TableCell>
                        <Checkbox
                          checked={selectedDocuments.includes(doc.id)}
                          onCheckedChange={() => handleSelectDocument(doc.id)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="ghost"
                            size="icon"
                            className={`h-6 w-6 rounded-full ${doc.isStarred ? 'text-yellow-500 hover:text-yellow-600' : 'text-gray-400 hover:text-gray-500'}`}
                            onClick={() => handleToggleStar(doc.id)}
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill={doc.isStarred ? 'currentColor' : 'none'}
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3.5 w-3.5"
                            >
                              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                            </svg>
                          </Button>
                          <div className="w-8 h-8 bg-gray-100 dark:bg-gray-800 rounded flex items-center justify-center">
                            {getDocumentIcon(doc.type, doc.format)}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-black dark:text-white">
                              {doc.name}
                            </p>
                            <p className="text-xs text-gray-500 dark:text-gray-400">
                              {doc.path} • v{doc.version}
                            </p>
                          </div>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{doc.type}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge className={getStatusColor(doc.status)}>{doc.status}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{formatDate(doc.lastModified)}</div>
                        <div className="text-xs text-gray-500 dark:text-gray-400">
                          by {doc.modifiedBy}
                        </div>
                      </TableCell>
                      <TableCell>
                        {doc.aiAnalyzed ? (
                          <Badge
                            variant="outline"
                            className={`${
                              doc.aiScore >= 90
                                ? 'text-green-600 dark:text-green-400'
                                : doc.aiScore >= 80
                                  ? 'text-blue-600 dark:text-blue-400'
                                  : 'text-amber-600 dark:text-amber-400'
                            }`}
                          >
                            {doc.aiScore}%
                          </Badge>
                        ) : (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            Not analyzed
                          </span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {doc.tags.slice(0, 2).map((tag, i) => (
                            <Badge key={i} variant="outline" className="text-xs py-0">
                              {tag}
                            </Badge>
                          ))}
                          {doc.tags.length > 2 && (
                            <Badge variant="outline" className="text-xs py-0">
                              +{doc.tags.length - 2}
                            </Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Download className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <Share2 className="h-4 w-4" />
                          </Button>
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Edit className="h-4 w-4 mr-2" />
                                <span>Edit Metadata</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Copy className="h-4 w-4 mr-2" />
                                <span>Make a Copy</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Eye className="h-4 w-4 mr-2" />
                                <span>Preview</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Search className="h-4 w-4 mr-2" />
                                <span>Analyze with AI</span>
                              </DropdownMenuItem>
                              <DropdownMenuItem className="text-red-600 dark:text-red-400">
                                <Trash2 className="h-4 w-4 mr-2" />
                                <span>Delete</span>
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          {filteredDocuments.length === 0 && (
            <div className="p-8 text-center">
              <FileText className="h-12 w-12 text-gray-300 dark:text-gray-700 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 dark:text-gray-100 mb-1">
                No documents found
              </h3>
              <p className="text-gray-500 dark:text-gray-400 mb-4 max-w-md mx-auto">
                We couldn't find any documents matching your search criteria. Try adjusting your
                filters or upload new documents.
              </p>
              <div className="flex justify-center gap-2">
                <Button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedTags([]);
                    setSelectedStatus('all');
                    setActiveTab('all');
                  }}
                >
                  Clear Filters
                </Button>
                <Button variant="outline">
                  <Upload className="h-4 w-4 mr-1" />
                  Upload Documents
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>
      <CardFooter className="flex justify-between p-4 border-t border-gray-200 dark:border-gray-800">
        <div className="text-sm text-gray-500 dark:text-gray-400">
          Showing {filteredDocuments.length} of {documents.length} documents
        </div>
        <div>
          <Button variant="outline" size="sm" className="gap-1 h-8">
            <ExternalLink className="h-3.5 w-3.5" />
            Advanced Document Manager
          </Button>
        </div>
      </CardFooter>

      {/* Upload Dialog */}
      <Dialog open={showUploadDialog} onOpenChange={setShowUploadDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Upload Documents</DialogTitle>
            <DialogDescription>
              Upload new documents to the CMC repository. Supported formats include PDF, DOCX, XLSX,
              and PPT.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="flex items-center justify-center w-full">
              <label
                htmlFor="dropzone-file"
                className="flex flex-col items-center justify-center w-full h-64 border-2 border-gray-300 border-dashed rounded-lg cursor-pointer bg-gray-50 dark:hover:bg-gray-800 dark:bg-gray-900 hover:bg-gray-100 dark:border-gray-600"
              >
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-10 h-10 mb-3 text-gray-500 dark:text-gray-400" />
                  <p className="mb-2 text-sm text-gray-500 dark:text-gray-400">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    PDF, DOCX, XLSX, PPT (MAX. 50MB)
                  </p>
                </div>
                <input
                  id="dropzone-file"
                  type="file"
                  className="hidden"
                  multiple
                  onChange={handleFileChange}
                />
              </label>
            </div>

            {uploadFiles.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-sm font-medium">Selected Files:</h4>
                <div className="max-h-40 overflow-auto border rounded-md divide-y">
                  {uploadFiles.map((file, index) => (
                    <div key={index} className="flex items-center p-2 text-sm">
                      <File className="h-4 w-4 mr-2 text-gray-500 dark:text-gray-400" />
                      <span className="text-gray-700 dark:text-gray-300">{file.name}</span>
                      <span className="ml-auto text-xs text-gray-500 dark:text-gray-400">
                        {(file.size / 1024).toFixed(0)} KB
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="upload-type">Document Type</Label>
              <Select defaultValue="specification">
                <SelectTrigger id="upload-type">
                  <SelectValue placeholder="Select document type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="specification">Specification</SelectItem>
                  <SelectItem value="validation">Method Validation</SelectItem>
                  <SelectItem value="protocol">Protocol</SelectItem>
                  <SelectItem value="report">Report</SelectItem>
                  <SelectItem value="sop">SOP</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="upload-tags">Tags (Optional)</Label>
              <Input id="upload-tags" placeholder="Enter tags separated by commas" />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Example: API, HPLC, Validation, Release
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowUploadDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleUpload} disabled={uploadFiles.length === 0 || uploading}>
              {uploading ? (
                <>
                  <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                  Uploading...
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload {uploadFiles.length > 0 ? `(${uploadFiles.length})` : ''}
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New Folder Dialog */}
      <Dialog open={showNewFolderDialog} onOpenChange={setShowNewFolderDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Folder</DialogTitle>
            <DialogDescription>
              Create a new folder to organize your CMC documents.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="folder-name">Folder Name</Label>
              <Input
                id="folder-name"
                placeholder="Enter folder name"
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="folder-location">Location</Label>
              <Select defaultValue="root">
                <SelectTrigger id="folder-location">
                  <SelectValue placeholder="Select location" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="root">Root Directory</SelectItem>
                  <SelectItem value="specifications">Specifications</SelectItem>
                  <SelectItem value="methods">Method Validation</SelectItem>
                  <SelectItem value="stability">Stability</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewFolderDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleCreateFolder}>
              <FolderPlus className="mr-2 h-4 w-4" />
              Create Folder
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default CMCDocumentHub;
