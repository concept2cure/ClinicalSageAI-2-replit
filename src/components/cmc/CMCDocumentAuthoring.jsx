import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  FileText,
  Edit3,
  Globe,
  GitBranch,
  Link,
  Zap,
  Eye,
  Download,
  Upload,
  Plus,
  BookOpen,
  CheckCircle2,
  Clock,
  Users,
  History,
  Settings,
  Search,
  Filter,
  RefreshCcw,
  AlertCircle,
  Award,
  Target,
  BarChart3,
  Languages,
  Flag,
  Send,
  FileCheck,
  Lock,
  Package,
  MessageSquare,
  Database,
  FlaskConical,
} from 'lucide-react';
import { 
  GuidanceDrawer, 
  TemplatesDrawer,
  ReviewerChecklistDrawer,
  ChangeRequestsDrawer,
  CreateChangeRequestModal
} from './DocumentAuthoringFixed';
import { useToast } from '@/hooks/use-toast';
import { EditorContent, useEditor } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import TokenNode from './editor/extensions/TokenNode.jsx';

const CMCDocumentAuthoring = ({ activeDocId, onDocChange, activeSectionId, onSectionChange }) => {
  const [activeTab, setActiveTab] = useState('templates');
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [selectedDocument, setSelectedDocument] = useState(null);
  const [showNewDocumentDialog, setShowNewDocumentDialog] = useState(false);
  const [documentFilter, setDocumentFilter] = useState('all');

  // Step 5: New state variables for export, submit, sign functionality
  const [isExporting, setIsExporting] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSigning, setIsSigning] = useState(false);
  const [isSendingToPackager, setIsSendingToPackager] = useState(false);
  const [isSeedingStability, setIsSeedingStability] = useState(false);
  const [exportFormat, setExportFormat] = useState('docx');
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showPackagerDialog, setShowPackagerDialog] = useState(false);
  const [signData, setSignData] = useState({ actor: '', role: 'RA_CMC', reason: '' });
  const [packagerData, setPackagerData] = useState({ seqId: '', path: '', title: '', fmt: 'docx' });
  
  // Step 10: Drawer states
  const [showGuidanceDrawer, setShowGuidanceDrawer] = useState(false);
  const [showTemplatesDrawer, setShowTemplatesDrawer] = useState(false);
  const [currentSectionCode, setCurrentSectionCode] = useState('');
  const [currentLocale, setCurrentLocale] = useState('en');
  
  // Step 14: Reviewer Checklist & Change Requests state
  const [showChecklistDrawer, setShowChecklistDrawer] = useState(false);
  const [showChangeRequestsDrawer, setShowChangeRequestsDrawer] = useState(false);
  const [showCreateChangeRequestModal, setShowCreateChangeRequestModal] = useState(false);
  const [checklistData, setChecklistData] = useState(null);
  const [changeRequests, setChangeRequests] = useState([]);
  const [checklistItems, setChecklistItems] = useState([]);
  const { toast } = useToast();

  // Step 7: TipTap Editor with TokenNode extension
  const editor = useEditor({
    extensions: [
      StarterKit,
      TokenNode, // Token extension for smart renderers
    ],
    content: { type: 'doc', content: [] },
  });

  // Step 7: Update token context when section/doc changes
  useEffect(() => {
    if (!editor) return;
    editor.commands.setTokenContext({
      docId: activeDocId || null,
      sectionId: activeSectionId || null,
    });
  }, [editor, activeDocId, activeSectionId]);

  // Step 5: API Functions for Export, Submit, Sign, Send to Packager
  const handleExportDocument = async (docId, format = 'docx') => {
    if (!docId) return;

    setIsExporting(true);
    try {
      const response = await fetch(`/api/authoring/docs/${docId}/export?fmt=${format}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Export failed');

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `M3_document.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      alert(`Document exported successfully as ${format.toUpperCase()}`);
    } catch (error) {
      console.error('Export error:', error);
      alert(`Export failed: ${error.message}`);
    } finally {
      setIsExporting(false);
    }
  };

  const handleSubmitDocument = async docId => {
    if (!docId) return;

    setIsSubmitting(true);
    try {
      const response = await fetch(`/api/authoring/docs/${docId}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      if (!response.ok) throw new Error('Submit failed');

      const result = await response.json();
      alert('Document submitted for review successfully');
      // Refresh document list or update status
    } catch (error) {
      console.error('Submit error:', error);
      alert(`Submit failed: ${error.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSignDocument = async (docId, signData) => {
    if (!docId) return;

    setIsSigning(true);
    try {
      const response = await fetch(`/api/authoring/docs/${docId}/sign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(signData),
      });

      if (!response.ok) throw new Error('Sign failed');

      const result = await response.json();
      alert(`Document signed successfully. SHA256: ${result.doc_sha256.substring(0, 12)}...`);
      setShowSignDialog(false);
      // Refresh document list or update status
    } catch (error) {
      console.error('Sign error:', error);
      alert(`Sign failed: ${error.message}`);
    } finally {
      setIsSigning(false);
    }
  };

  const handleSendToPackager = async (docId, packagerData) => {
    if (!docId) return;

    setIsSendingToPackager(true);
    try {
      const response = await fetch(`/api/authoring/docs/${docId}/send-to-packager`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(packagerData),
      });

      if (!response.ok) throw new Error('Send to packager failed');

      const result = await response.json();
      alert('Document sent to eCTD packager successfully');
      setShowPackagerDialog(false);
      // Refresh document list or update status
    } catch (error) {
      console.error('Send to packager error:', error);
      alert(`Send to packager failed: ${error.message}`);
    } finally {
      setIsSendingToPackager(false);
    }
  };

  // Stability Seeder Function - Seeds stability study data and P.8 tokens
  const handleSeedStabilityData = async (docId) => {
    if (!docId) return;

    setIsSeedingStability(true);
    try {
      // Call the stability seeder API endpoint that runs the seeder script
      const response = await fetch(`/api/authoring/docs/${docId}/seed-stability`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          product_code: 'UAT-PROD',
          study_code: 'SS-UAT-001',
          study_name: 'UAT Stability 24M',
          doc_id: docId
        }),
      });

      if (!response.ok) throw new Error('Stability seeding failed');

      const result = await response.json();
      
      toast({
        title: 'Stability Data Seeded Successfully',
        description: `Created stability study: ${result.study_code || 'SS-UAT-001'} with P.8 tokens inserted`,
      });

      // Refresh tokens in the editor
      if (editor) {
        editor.commands.refreshAllTokens();
      }
      
    } catch (error) {
      console.error('Stability seeding error:', error);
      toast({
        title: 'Stability Seeding Failed',
        description: error.message,
        variant: 'destructive',
      });
    } finally {
      setIsSeedingStability(false);
    }
  };

  // Document Templates - Pre-built for Module 3 (eCTD), CTD, IND/IMPD, NDA/BLA
  const documentTemplates = [
    {
      id: 'TPL-001',
      name: 'Module 3.2.S Drug Substance',
      category: 'eCTD Module 3',
      type: 'CTD',
      description: 'Complete drug substance section template with ICH M4Q compliance',
      sections: [
        '3.2.S.1 General Information',
        '3.2.S.2 Manufacture',
        '3.2.S.3 Characterization',
        '3.2.S.4 Control of Drug Substance',
        '3.2.S.5 Reference Standards',
        '3.2.S.6 Container Closure System',
        '3.2.S.7 Stability',
      ],
      regions: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
      languages: ['English', 'German', 'French', 'Japanese'],
      aiGuidance: true,
      estimatedPages: 120,
      lastUpdated: '2025-08-10',
      version: '3.2.1',
    },
    {
      id: 'TPL-002',
      name: 'Module 3.2.P Drug Product',
      category: 'eCTD Module 3',
      type: 'CTD',
      description: 'Comprehensive drug product documentation with formulation details',
      sections: [
        '3.2.P.1 Description and Composition',
        '3.2.P.2 Pharmaceutical Development',
        '3.2.P.3 Manufacture',
        '3.2.P.4 Control of Excipients',
        '3.2.P.5 Control of Drug Product',
        '3.2.P.6 Reference Standards',
        '3.2.P.7 Container Closure System',
        '3.2.P.8 Stability',
      ],
      regions: ['FDA', 'EMA', 'PMDA', 'Health Canada'],
      languages: ['English', 'German', 'French', 'Japanese'],
      aiGuidance: true,
      estimatedPages: 180,
      lastUpdated: '2025-08-12',
      version: '3.2.0',
    },
    {
      id: 'TPL-003',
      name: 'IND CMC Section',
      category: 'IND/IMPD',
      type: 'IND',
      description: 'IND application CMC section with FDA-specific requirements',
      sections: [
        'Drug Substance Information',
        'Drug Product Information',
        'Manufacturing Information',
        'Control Information',
        'Stability Data',
        'Environmental Assessment',
      ],
      regions: ['FDA'],
      languages: ['English'],
      aiGuidance: true,
      estimatedPages: 80,
      lastUpdated: '2025-08-08',
      version: '2.1.3',
    },
    {
      id: 'TPL-004',
      name: 'NDA Module 3 Complete',
      category: 'NDA/BLA',
      type: 'NDA',
      description: 'Full NDA Module 3 with all required CMC sections',
      sections: [
        'Quality Overall Summary',
        'Drug Substance',
        'Drug Product',
        'Appendices and Facilities',
        'Regional Information',
      ],
      regions: ['FDA'],
      languages: ['English'],
      aiGuidance: true,
      estimatedPages: 400,
      lastUpdated: '2025-08-15',
      version: '1.0.0',
    },
    {
      id: 'TPL-005',
      name: 'IMPD Module 3',
      category: 'IND/IMPD',
      type: 'IMPD',
      description: 'European IMPD Module 3 with EMA-specific guidance',
      sections: [
        'Quality of the Investigational Medicinal Product',
        'Manufacture of the Product',
        'Control of Materials',
        'Control Tests on the Finished Product',
        'Stability',
      ],
      regions: ['EMA'],
      languages: ['English', 'German', 'French'],
      aiGuidance: true,
      estimatedPages: 150,
      lastUpdated: '2025-08-09',
      version: '2.3.1',
    },
  ];

  // Active Documents with Version Control
  const activeDocuments = [
    {
      id: 'DOC-001',
      name: 'Adalimumab Module 3.2.S',
      template: 'Module 3.2.S Drug Substance',
      status: 'In Progress',
      version: '1.2.3',
      author: 'Dr. Sarah Johnson',
      lastModified: '2025-08-14 14:30',
      region: 'FDA',
      language: 'English',
      completeness: 85,
      wordCount: 45680,
      pageCount: 123,
      reviewers: ['Dr. Mike Chen', 'Emily Davis'],
      citations: 47,
      linkedData: ['Batch Records BR-240801-05', 'Stability Study ST-2024-012'],
      aiSuggestions: 12,
      complianceScore: 94.2,
    },
    {
      id: 'DOC-002',
      name: 'Atorvastatin Drug Product CMC',
      template: 'Module 3.2.P Drug Product',
      status: 'Under Review',
      version: '2.1.0',
      author: 'Dr. Emily Davis',
      lastModified: '2025-08-13 16:45',
      region: 'EMA',
      language: 'English',
      completeness: 92,
      wordCount: 52340,
      pageCount: 167,
      reviewers: ['Dr. Sarah Johnson', 'Robert Kim'],
      citations: 63,
      linkedData: ['Method Val Report MV-2024-018', 'Process Validation PV-024'],
      aiSuggestions: 8,
      complianceScore: 96.7,
    },
    {
      id: 'DOC-003',
      name: 'Bevacizumab IND CMC Package',
      template: 'IND CMC Section',
      status: 'Approved',
      version: '3.0.0',
      author: 'Dr. Mike Chen',
      lastModified: '2025-08-12 10:15',
      region: 'FDA',
      language: 'English',
      completeness: 100,
      wordCount: 38920,
      pageCount: 98,
      reviewers: ['Dr. Sarah Johnson', 'Dr. Emily Davis', 'John Martinez'],
      citations: 52,
      linkedData: ['Analytical Methods AM-2024-033', 'Stability Data ST-2024-019'],
      aiSuggestions: 5,
      complianceScore: 98.1,
    },
  ];

  // AI Content Suggestions mapped to ICH Q-series guidelines
  const aiGuidanceLibrary = [
    {
      section: '3.2.S.2.3 Control of Materials',
      guidance: 'ICH Q7',
      suggestion:
        'Include detailed specifications for starting materials, intermediates, and reagents with acceptance criteria based on risk assessment.',
      confidence: 95,
      references: ['ICH Q7 Section 5', 'FDA Guidance on APIs'],
      type: 'content',
    },
    {
      section: '3.2.P.2 Pharmaceutical Development',
      guidance: 'ICH Q8(R2)',
      suggestion:
        'Describe quality by design (QbD) approach with design space definition and control strategy.',
      confidence: 92,
      references: ['ICH Q8(R2) Section 2.3', 'EMA QbD Questions & Answers'],
      type: 'structure',
    },
    {
      section: '3.2.S.7 Stability',
      guidance: 'ICH Q1A(R2)',
      suggestion:
        'Include photostability data per ICH Q1B if light-sensitive or unclear stability profile.',
      confidence: 89,
      references: ['ICH Q1A(R2)', 'ICH Q1B'],
      type: 'requirement',
    },
  ];

  // Citation & Reference System
  const citationLibrary = [
    {
      id: 'REF-001',
      type: 'Batch Record',
      title: 'Production Batch BR-240801-05',
      location: 'Manufacturing Records/2024/August/BR-240801-05.pdf',
      lastAccessed: '2025-08-14',
      linkedDocuments: ['DOC-001', 'DOC-002'],
      status: 'Active',
    },
    {
      id: 'REF-002',
      type: 'Analytical Method',
      title: 'HPLC Method Validation Report MV-2024-018',
      location: 'Analytical/Methods/HPLC/MV-2024-018.pdf',
      lastAccessed: '2025-08-13',
      linkedDocuments: ['DOC-002'],
      status: 'Active',
    },
    {
      id: 'REF-003',
      type: 'Stability Study',
      title: 'Long-term Stability Study ST-2024-012',
      location: 'Stability/Studies/2024/ST-2024-012/',
      lastAccessed: '2025-08-14',
      linkedDocuments: ['DOC-001', 'DOC-003'],
      status: 'Active',
    },
  ];

  const getStatusColor = status => {
    const colors = {
      'In Progress': 'bg-blue-100 text-blue-800',
      'Under Review': 'bg-yellow-100 text-yellow-800',
      Approved: 'bg-green-100 text-green-800',
      Rejected: 'bg-red-100 text-red-800',
      Draft: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const filteredDocuments = activeDocuments.filter(doc => {
    if (documentFilter === 'all') return true;
    if (documentFilter === 'in-progress') return doc.status === 'In Progress';
    if (documentFilter === 'review') return doc.status === 'Under Review';
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Document Authoring Header */}
      <div className="flex justify-between items-start">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">
            CMC Document Authoring & Lifecycle Management
          </h2>
          <p className="text-gray-600 mt-1">
            AI-powered regulatory document creation with compliance guidance
          </p>
        </div>
        <div className="flex space-x-3">
          <Select value={documentFilter} onValueChange={setDocumentFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Filter documents" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Documents</SelectItem>
              <SelectItem value="in-progress">In Progress</SelectItem>
              <SelectItem value="review">Under Review</SelectItem>
            </SelectContent>
          </Select>
          <Dialog open={showNewDocumentDialog} onOpenChange={setShowNewDocumentDialog}>
            <DialogTrigger asChild>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                <Plus className="h-4 w-4 mr-2" />
                New Document
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Create New Regulatory Document</DialogTitle>
                <DialogDescription>
                  Select a template and configure document settings
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Document Type</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select template" />
                      </SelectTrigger>
                      <SelectContent>
                        {documentTemplates.map(template => (
                          <SelectItem key={template.id} value={template.id}>
                            {template.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Regulatory Region</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select region" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="fda">FDA (United States)</SelectItem>
                        <SelectItem value="ema">EMA (Europe)</SelectItem>
                        <SelectItem value="pmda">PMDA (Japan)</SelectItem>
                        <SelectItem value="hc">Health Canada</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Primary Language</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select language" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="en">English</SelectItem>
                        <SelectItem value="de">German</SelectItem>
                        <SelectItem value="fr">French</SelectItem>
                        <SelectItem value="ja">Japanese</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>AI Assistance Level</Label>
                    <Select>
                      <SelectTrigger>
                        <SelectValue placeholder="Select level" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="full">Full AI Guidance</SelectItem>
                        <SelectItem value="moderate">Moderate Assistance</SelectItem>
                        <SelectItem value="minimal">Minimal Suggestions</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Document Title</Label>
                  <Input placeholder="Enter document title" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowNewDocumentDialog(false)}>
                  Cancel
                </Button>
                <Button className="bg-blue-600 hover:bg-blue-700 text-white">
                  Create Document
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Active Documents</CardTitle>
            <FileText className="h-4 w-4 text-blue-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeDocuments.length}</div>
            <p className="text-xs text-gray-600">
              {activeDocuments.filter(d => d.status === 'In Progress').length} in progress
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Templates Available</CardTitle>
            <BookOpen className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{documentTemplates.length}</div>
            <p className="text-xs text-green-600">ICH-compliant templates</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">AI Suggestions</CardTitle>
            <Zap className="h-4 w-4 text-purple-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">25</div>
            <p className="text-xs text-purple-600">Active recommendations</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Avg Compliance</CardTitle>
            <Award className="h-4 w-4 text-orange-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-orange-600">96.3%</div>
            <p className="text-xs text-gray-600">Regulatory compliance</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Languages</CardTitle>
            <Languages className="h-4 w-4 text-indigo-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-indigo-600">4</div>
            <p className="text-xs text-gray-600">Localization supported</p>
          </CardContent>
        </Card>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-8">
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="documents">Active Documents</TabsTrigger>
          <TabsTrigger value="authoring">AI Authoring</TabsTrigger>
          <TabsTrigger value="versions">Version Control</TabsTrigger>
          <TabsTrigger value="citations">Citations</TabsTrigger>
          <TabsTrigger value="export-history">Export History</TabsTrigger>
          <TabsTrigger value="comments">Comments</TabsTrigger>
          <TabsTrigger value="localization">Localization</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          <div className="space-y-4">
            {documentTemplates.map(template => (
              <Card
                key={template.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedTemplate(template)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{template.name}</CardTitle>
                      <CardDescription>
                        {template.category} • v{template.version} • {template.estimatedPages} pages
                      </CardDescription>
                      <p className="text-sm text-gray-600 mt-2">{template.description}</p>
                    </div>
                    <div className="flex space-x-2">
                      <Badge variant="outline">{template.type}</Badge>
                      {template.aiGuidance && (
                        <Badge className="bg-purple-100 text-purple-800">
                          <Zap className="h-3 w-3 mr-1" />
                          AI Guided
                        </Badge>
                      )}
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div>
                      <div className="text-sm font-medium mb-2">Key Sections:</div>
                      <div className="flex flex-wrap gap-1">
                        {template.sections.slice(0, 4).map((section, index) => (
                          <Badge key={index} variant="outline" className="text-xs">
                            {section}
                          </Badge>
                        ))}
                        {template.sections.length > 4 && (
                          <Badge variant="outline" className="text-xs">
                            +{template.sections.length - 4} more
                          </Badge>
                        )}
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex space-x-4 text-sm text-gray-600">
                        <span>Regions: {template.regions.join(', ')}</span>
                        <span>Languages: {template.languages.length}</span>
                      </div>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm">
                          <Eye className="h-3 w-3 mr-1" />
                          Preview
                        </Button>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                          Use Template
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="space-y-4">
            {filteredDocuments.map(document => (
              <Card
                key={document.id}
                className="cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setSelectedDocument(document)}
              >
                <CardHeader>
                  <div className="flex justify-between items-start">
                    <div>
                      <CardTitle className="text-lg">{document.name}</CardTitle>
                      <CardDescription>
                        v{document.version} • {document.author} • {document.lastModified}
                      </CardDescription>
                    </div>
                    <div className="flex space-x-2">
                      <Badge className={getStatusColor(document.status)}>{document.status}</Badge>
                      <Badge variant="outline">{document.region}</Badge>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                      <div>
                        <div className="text-gray-600">Completeness</div>
                        <div className="flex items-center space-x-2">
                          <Progress value={document.completeness} className="h-2 flex-1" />
                          <span className="font-medium">{document.completeness}%</span>
                        </div>
                      </div>
                      <div>
                        <div className="text-gray-600">Pages</div>
                        <div className="font-medium">{document.pageCount}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Citations</div>
                        <div className="font-medium">{document.citations}</div>
                      </div>
                      <div>
                        <div className="text-gray-600">Compliance Score</div>
                        <div className="font-medium text-green-600">
                          {document.complianceScore}%
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <div className="flex space-x-2 text-xs">
                        {document.reviewers.slice(0, 2).map((reviewer, index) => (
                          <Badge key={index} variant="outline">
                            {reviewer}
                          </Badge>
                        ))}
                        {document.aiSuggestions > 0 && (
                          <Badge className="bg-purple-100 text-purple-800">
                            {document.aiSuggestions} AI suggestions
                          </Badge>
                        )}
                      </div>
                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm">
                          <GitBranch className="h-3 w-3 mr-1" />
                          Versions
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="h-3 w-3 mr-1" />
                          Preview
                        </Button>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
                          <Edit3 className="h-3 w-3 mr-1" />
                          Edit
                        </Button>

                        {/* Step 5: Export Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleExportDocument(document.id, exportFormat)}
                          disabled={isExporting}
                          data-testid="button-export-doc"
                        >
                          {isExporting ? (
                            <RefreshCcw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <Download className="h-3 w-3 mr-1" />
                          )}
                          Export {exportFormat.toUpperCase()}
                        </Button>

                        {/* Step 5: Submit Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleSubmitDocument(document.id)}
                          disabled={isSubmitting || document.status === 'APPROVED'}
                          data-testid="button-submit-doc"
                        >
                          {isSubmitting ? (
                            <RefreshCcw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <FileCheck className="h-3 w-3 mr-1" />
                          )}
                          Submit
                        </Button>

                        {/* Step 5: Sign Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onDocChange(document.id); // Set activeDocId
                            setShowSignDialog(true);
                          }}
                          disabled={document.status !== 'IN_REVIEW'}
                          data-testid="button-sign-doc"
                        >
                          <Lock className="h-3 w-3 mr-1" />
                          Sign & Freeze
                        </Button>

                        {/* Step 5: Send to Packager Button */}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            onDocChange(document.id); // Set activeDocId
                            setShowPackagerDialog(true);
                          }}
                          disabled={document.status !== 'APPROVED'}
                          data-testid="button-send-packager"
                        >
                          <Send className="h-3 w-3 mr-1" />
                          Send to eCTD
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="authoring">
          {/* Step 7: TipTap Editor with TokenNode Extension */}
          <div className="mb-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Edit3 className="h-5 w-5 mr-2 text-blue-600" />
                  Document Editor with Smart Tokens
                </CardTitle>
                <CardDescription>
                  Rich text editor with regulatory token insertion and real-time compliance checking
                </CardDescription>
              </CardHeader>
              <CardContent>
                {selectedDocument ? (
                  <div className="space-y-4">
                    <div className="flex justify-between items-center mb-4">
                      <div>
                        <h3 className="font-medium">{selectedDocument.name}</h3>
                        <p className="text-sm text-gray-600">
                          Section: {selectedDocument.section || 'General'} • 
                          Version: {selectedDocument.version}
                        </p>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            // Step 7: Insert token functionality
                            alert('Token insertion UI would open here');
                          }}
                          data-testid="button-insert-token"
                        >
                          <Package className="h-3 w-3 mr-1" />
                          Insert Token
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            // Step 7: Refresh all tokens
                            alert('Refreshing all document tokens...');
                          }}
                          data-testid="button-refresh-tokens"
                        >
                          <RefreshCcw className="h-3 w-3 mr-1" />
                          Refresh Tokens
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setCurrentSectionCode(selectedDocument?.section || '3.2.P.5');
                            setShowGuidanceDrawer(true);
                          }}
                          data-testid="button-guidance"
                        >
                          <BookOpen className="h-3 w-3 mr-1" />
                          Guidance
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setCurrentLocale(selectedDocument?.locale || 'en');
                            setShowTemplatesDrawer(true);
                          }}
                          data-testid="button-templates"
                        >
                          <FileText className="h-3 w-3 mr-1" />
                          Templates
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => handleSeedStabilityData(activeDocId)}
                          disabled={isSeedingStability || !activeDocId}
                          data-testid="button-seed-stability"
                          className="bg-green-50 hover:bg-green-100 border-green-200 text-green-700"
                        >
                          {isSeedingStability ? (
                            <RefreshCcw className="h-3 w-3 mr-1 animate-spin" />
                          ) : (
                            <FlaskConical className="h-3 w-3 mr-1" />
                          )}
                          Seed Stability Data
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => {
                            setCurrentSectionCode(selectedDocument?.section || '3.2.P.5');
                            setShowChecklistDrawer(true);
                          }}
                          disabled={!selectedDocument}
                          data-testid="button-checklist"
                        >
                          <CheckCircle2 className="h-3 w-3 mr-1" />
                          Checklist
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setShowChangeRequestsDrawer(true)}
                          disabled={!selectedDocument}
                          data-testid="button-changes"
                        >
                          <MessageSquare className="h-3 w-3 mr-1" />
                          Changes
                        </Button>
                      </div>
                    </div>
                    
                    {/* Step 7: Editor placeholder - would be TipTap instance */}
                    <div className="border rounded-lg p-4 min-h-[400px] bg-white">
                      <div className="prose max-w-none">
                        {editorInstance ? (
                          <div>
                            {/* TipTap editor would render here */}
                            <p className="text-gray-500">TipTap editor with TokenNode extension active</p>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <h2 className="text-xl font-semibold">3.2.S.7 Stability</h2>
                            <p>The stability studies for {selectedDocument.drugName || 'the drug product'} have been conducted in accordance with ICH Q1A(R2) guidelines.</p>
                            
                            <div className="bg-blue-50 border border-blue-200 rounded p-3">
                              <div className="flex items-center gap-2 text-sm font-medium text-blue-800 mb-2">
                                <Package className="h-4 w-4" />
                                Smart Token: STABILITY.SUMMARY
                              </div>
                              <p className="text-sm text-gray-700">
                                Long-term stability data at 25°C/60% RH for 36 months and accelerated stability data at 40°C/75% RH for 6 months demonstrate that the drug product meets all specifications.
                              </p>
                            </div>
                            
                            <p>The following stability-indicating parameters were monitored:</p>
                            <ul className="list-disc pl-6">
                              <li>Appearance</li>
                              <li>Assay</li>
                              <li>Degradation products</li>
                              <li>Dissolution</li>
                              <li>Microbiological quality</li>
                            </ul>
                            
                            <div className="bg-green-50 border border-green-200 rounded p-3">
                              <div className="flex items-center gap-2 text-sm font-medium text-green-800 mb-2">
                                <CheckCircle2 className="h-4 w-4" />
                                Compliance Check Passed
                              </div>
                              <p className="text-sm text-gray-700">
                                All required stability studies are present and comply with ICH Q1A(R2) requirements.
                              </p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex justify-between items-center pt-4 border-t">
                      <div className="flex space-x-2">
                        <Button 
                          variant="outline" 
                          size="sm"
                          onClick={() => setSelectedDocument(null)}
                        >
                          Close Editor
                        </Button>
                        <Button 
                          variant="outline" 
                          size="sm"
                          data-testid="button-save-draft"
                        >
                          <Save className="h-3 w-3 mr-1" />
                          Save Draft
                        </Button>
                      </div>
                      <div className="flex space-x-2">
                        <Button 
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white"
                          data-testid="button-save-version"
                        >
                          <GitBranch className="h-3 w-3 mr-1" />
                          Save Version
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-12 text-gray-500">
                    <Edit3 className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                    <p>Select a document from the Documents tab to begin editing</p>
                    <p className="text-sm mt-2">Documents can include smart tokens that automatically pull data from your CMC database</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
          
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Zap className="h-5 w-5 mr-2 text-purple-600" />
                  AI Content Suggestions
                </CardTitle>
                <CardDescription>
                  Intelligent guidance mapped to ICH Q-series and regulatory expectations
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {aiGuidanceLibrary.map((guidance, index) => (
                    <div key={index} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h4 className="font-medium text-sm">{guidance.section}</h4>
                          <p className="text-xs text-gray-600">{guidance.guidance} Guidance</p>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge variant="outline" className="text-xs">
                            {guidance.confidence}% confidence
                          </Badge>
                          <Badge
                            className={
                              guidance.type === 'requirement'
                                ? 'bg-red-100 text-red-800'
                                : guidance.type === 'structure'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-green-100 text-green-800'
                            }
                          >
                            {guidance.type}
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm text-gray-800 mb-3">{guidance.suggestion}</p>
                      <div className="flex justify-between items-center">
                        <div className="flex space-x-1">
                          {guidance.references.map((ref, idx) => (
                            <Badge key={idx} variant="outline" className="text-xs">
                              {ref}
                            </Badge>
                          ))}
                        </div>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm">
                            <Link className="h-3 w-3 mr-1" />
                            View Reference
                          </Button>
                          <Button
                            size="sm"
                            className="bg-purple-600 hover:bg-purple-700 text-white"
                          >
                            Apply
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-5 w-5 mr-2 text-blue-600" />
                  Compliance Monitoring
                </CardTitle>
                <CardDescription>Real-time regulatory compliance assessment</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="text-center">
                    <div className="text-4xl font-bold text-green-600 mb-2">96.3%</div>
                    <p className="text-gray-600">Overall Compliance Score</p>
                  </div>

                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">ICH M4Q Compliance</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '98%' }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">98%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">FDA Guidance Alignment</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-green-600 h-2 rounded-full"
                            style={{ width: '95%' }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">95%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">EMA Requirements</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-yellow-500 h-2 rounded-full"
                            style={{ width: '92%' }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">92%</span>
                      </div>
                    </div>

                    <div className="flex justify-between items-center">
                      <span className="text-sm">Content Completeness</span>
                      <div className="flex items-center space-x-2">
                        <div className="w-20 bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-blue-600 h-2 rounded-full"
                            style={{ width: '89%' }}
                          ></div>
                        </div>
                        <span className="text-sm font-medium">89%</span>
                      </div>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3 text-sm">Recent Compliance Alerts</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-start space-x-2">
                        <AlertCircle className="h-4 w-4 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <span>Missing photostability data reference in Section 3.2.S.7</span>
                      </div>
                      <div className="flex items-start space-x-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0 mt-0.5" />
                        <span>All batch records properly cited in manufacturing section</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="versions">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <GitBranch className="h-5 w-5 mr-2 text-blue-600" />
                Version Control & Change Tracking
              </CardTitle>
              <CardDescription>
                Regulatory-compliant audit trails with redlining capabilities
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeDocuments.map(document => (
                  <div key={document.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium">{document.name}</h4>
                        <p className="text-sm text-gray-600">Current Version: {document.version}</p>
                      </div>
                      <Badge className={getStatusColor(document.status)}>{document.status}</Badge>
                    </div>

                    <div className="space-y-2 text-sm">
                      <div className="flex items-center justify-between p-2 bg-gray-50 rounded">
                        <div className="flex items-center space-x-3">
                          <span className="font-medium">v{document.version}</span>
                          <span>{document.lastModified}</span>
                          <span className="text-gray-600">{document.author}</span>
                        </div>
                        <div className="flex space-x-2">
                          <Badge variant="outline" className="text-xs">
                            Current
                          </Badge>
                          <Button variant="outline" size="sm">
                            <Eye className="h-3 w-3 mr-1" />
                            View Changes
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-2 rounded">
                        <div className="flex items-center space-x-3">
                          <span className="font-medium">v{parseFloat(document.version) - 0.1}</span>
                          <span>2025-08-12 09:30</span>
                          <span className="text-gray-600">{document.author}</span>
                        </div>
                        <div className="flex space-x-2">
                          <Button variant="outline" size="sm">
                            <Download className="h-3 w-3 mr-1" />
                            Download
                          </Button>
                          <Button variant="outline" size="sm">
                            Compare
                          </Button>
                        </div>
                      </div>
                    </div>

                    <div className="flex space-x-2 mt-3">
                      <Button variant="outline" size="sm">
                        <History className="h-3 w-3 mr-1" />
                        Full History
                      </Button>
                      <Button variant="outline" size="sm">
                        <GitBranch className="h-3 w-3 mr-1" />
                        Branch
                      </Button>
                      <Button variant="outline" size="sm">
                        Revert
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="citations">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <Link className="h-5 w-5 mr-2 text-green-600" />
                Auto-Citation & Reference Management
              </CardTitle>
              <CardDescription>
                Automated linking to batch records, stability data, and validation reports
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {citationLibrary.map(citation => (
                  <div key={citation.id} className="p-4 border rounded-lg">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <h4 className="font-medium">{citation.title}</h4>
                        <p className="text-sm text-gray-600">
                          {citation.type} • {citation.id}
                        </p>
                        <p className="text-xs text-gray-500 mt-1">{citation.location}</p>
                      </div>
                      <Badge
                        className={
                          citation.status === 'Active'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-100 text-gray-800'
                        }
                      >
                        {citation.status}
                      </Badge>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                      <div>
                        <span className="text-gray-600">Linked Documents:</span>
                        <div className="flex space-x-1 mt-1">
                          {citation.linkedDocuments.map((docId, index) => (
                            <Badge key={index} variant="outline" className="text-xs">
                              {docId}
                            </Badge>
                          ))}
                        </div>
                      </div>
                      <div>
                        <span className="text-gray-600">Last Accessed:</span>
                        <div className="font-medium">{citation.lastAccessed}</div>
                      </div>
                    </div>

                    <div className="flex space-x-2">
                      <Button variant="outline" size="sm">
                        <Eye className="h-3 w-3 mr-1" />
                        Preview
                      </Button>
                      <Button variant="outline" size="sm">
                        <Link className="h-3 w-3 mr-1" />
                        Insert Citation
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="h-3 w-3 mr-1" />
                        Download
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Step 8: Export History Tab */}
        <TabsContent value="export-history">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <History className="h-5 w-5 mr-2 text-indigo-600" />
                Export History & Audit Trail
              </CardTitle>
              <CardDescription>
                Track all document exports with timestamps, formats, and recipients
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Step 8: Export history would be fetched from /api/authoring/docs/:docId/exports */}
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium">Module 3.2.S - Drug Substance</h4>
                      <p className="text-sm text-gray-600">Exported 2025-09-12 14:30:00</p>
                    </div>
                    <Badge className="bg-green-100 text-green-800">DOCX</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-gray-600">Exported By:</span>
                      <div className="font-medium">Sarah Johnson</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Purpose:</span>
                      <div className="font-medium">FDA Submission</div>
                    </div>
                    <div>
                      <span className="text-gray-600">File Size:</span>
                      <div className="font-medium">2.4 MB</div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm" data-testid="button-view-diff">
                      <GitBranch className="h-3 w-3 mr-1" />
                      View Changes Since Export
                    </Button>
                    <Button variant="outline" size="sm" data-testid="button-re-export">
                      <Download className="h-3 w-3 mr-1" />
                      Re-export
                    </Button>
                  </div>
                </div>
                
                <div className="p-4 border rounded-lg">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <h4 className="font-medium">Module 3.2.P - Drug Product</h4>
                      <p className="text-sm text-gray-600">Exported 2025-09-10 10:15:00</p>
                    </div>
                    <Badge className="bg-blue-100 text-blue-800">PDF</Badge>
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-sm mb-3">
                    <div>
                      <span className="text-gray-600">Exported By:</span>
                      <div className="font-medium">Michael Chen</div>
                    </div>
                    <div>
                      <span className="text-gray-600">Purpose:</span>
                      <div className="font-medium">Internal Review</div>
                    </div>
                    <div>
                      <span className="text-gray-600">File Size:</span>
                      <div className="font-medium">3.1 MB</div>
                    </div>
                  </div>
                  <div className="flex space-x-2">
                    <Button variant="outline" size="sm">
                      <GitBranch className="h-3 w-3 mr-1" />
                      View Changes Since Export
                    </Button>
                    <Button variant="outline" size="sm">
                      <Download className="h-3 w-3 mr-1" />
                      Re-export
                    </Button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        {/* Step 9: Comments & Review Tab */}
        <TabsContent value="comments">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center">
                <MessageSquare className="h-5 w-5 mr-2 text-yellow-600" />
                Comments & Review Workflow
              </CardTitle>
              <CardDescription>
                Collaborative review system with threaded discussions and resolution tracking
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Step 9: Add new comment */}
                <div className="p-4 border rounded-lg bg-gray-50">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-sm font-medium">
                      SJ
                    </div>
                    <div className="flex-1">
                      <Textarea
                        placeholder="Add a comment or review note..."
                        className="mb-2"
                        data-testid="textarea-new-comment"
                      />
                      <div className="flex justify-between items-center">
                        <Select defaultValue="general">
                          <SelectTrigger className="w-[180px]" data-testid="select-comment-type">
                            <SelectValue placeholder="Comment type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="general">General Comment</SelectItem>
                            <SelectItem value="technical">Technical Review</SelectItem>
                            <SelectItem value="regulatory">Regulatory Feedback</SelectItem>
                            <SelectItem value="critical">Critical Issue</SelectItem>
                          </SelectContent>
                        </Select>
                        <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white" data-testid="button-post-comment">
                          <Send className="h-3 w-3 mr-1" />
                          Post Comment
                        </Button>
                      </div>
                    </div>
                  </div>
                </div>
                
                {/* Step 9: Existing comments */}
                <div className="p-4 border rounded-lg">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-green-600 text-white flex items-center justify-center text-sm font-medium">
                      MC
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-medium">Michael Chen</span>
                          <span className="text-sm text-gray-600 ml-2">2 hours ago</span>
                        </div>
                        <Badge className="bg-yellow-100 text-yellow-800">Technical Review</Badge>
                      </div>
                      <p className="text-sm mb-3">
                        The stability data in Section 3.2.S.7 needs to include the photostability study results. 
                        Please add the ICH Q1B compliant photostability data.
                      </p>
                      <div className="flex items-center space-x-4 text-sm">
                        <button className="text-blue-600 hover:text-blue-700" data-testid="button-reply-comment">
                          Reply
                        </button>
                        <button className="text-green-600 hover:text-green-700" data-testid="button-resolve-comment">
                          Mark as Resolved
                        </button>
                        <span className="text-gray-500">Section 3.2.S.7</span>
                      </div>
                    </div>
                  </div>
                </div>
                
                <div className="p-4 border rounded-lg bg-green-50">
                  <div className="flex items-start space-x-3">
                    <div className="w-8 h-8 rounded-full bg-purple-600 text-white flex items-center justify-center text-sm font-medium">
                      EW
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <span className="font-medium">Emily Wang</span>
                          <span className="text-sm text-gray-600 ml-2">Yesterday</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <Badge className="bg-red-100 text-red-800">Critical Issue</Badge>
                          <Badge className="bg-green-100 text-green-800">
                            <CheckCircle2 className="h-3 w-3 mr-1" />
                            Resolved
                          </Badge>
                        </div>
                      </div>
                      <p className="text-sm mb-3">
                        Manufacturing process validation protocols are missing from Section 3.2.P.3.5. 
                        This is required for submission.
                      </p>
                      <div className="bg-white rounded p-2 mt-2 text-sm">
                        <span className="font-medium text-green-700">Resolution:</span>
                        <span className="ml-2">Added validation protocols as Appendix 3.2.P.3.5-A</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        
        <TabsContent value="localization">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Globe className="h-5 w-5 mr-2 text-indigo-600" />
                  Language Localization Workflows
                </CardTitle>
                <CardDescription>
                  Multi-language document management for global submissions
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {activeDocuments.map(document => (
                    <div key={document.id} className="p-4 border rounded-lg">
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <h4 className="font-medium">{document.name}</h4>
                          <p className="text-sm text-gray-600">Primary: {document.language}</p>
                        </div>
                        <Badge variant="outline">{document.region}</Badge>
                      </div>

                      <div className="grid grid-cols-2 gap-4 text-sm mb-3">
                        <div>
                          <span className="text-gray-600">Available Languages:</span>
                          <div className="flex space-x-1 mt-1">
                            <Badge variant="outline" className="text-xs">
                              <Flag className="h-3 w-3 mr-1" />
                              EN
                            </Badge>
                            {document.region === 'EMA' && (
                              <>
                                <Badge variant="outline" className="text-xs">
                                  DE
                                </Badge>
                                <Badge variant="outline" className="text-xs">
                                  FR
                                </Badge>
                              </>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className="text-gray-600">Translation Status:</span>
                          <div className="font-medium text-blue-600">Source Ready</div>
                        </div>
                      </div>

                      <div className="flex space-x-2">
                        <Button variant="outline" size="sm">
                          <Languages className="h-3 w-3 mr-1" />
                          Request Translation
                        </Button>
                        <Button variant="outline" size="sm">
                          <Eye className="h-3 w-3 mr-1" />
                          View Translations
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Regional Requirements Matrix</CardTitle>
                <CardDescription>
                  Regulatory-specific requirements and language preferences
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="grid grid-cols-4 gap-4 text-sm">
                    <div className="font-medium">Region</div>
                    <div className="font-medium">Primary Language</div>
                    <div className="font-medium">Additional Languages</div>
                    <div className="font-medium">Status</div>

                    <div>FDA</div>
                    <div>English</div>
                    <div>-</div>
                    <div>
                      <Badge className="bg-green-100 text-green-800">Ready</Badge>
                    </div>

                    <div>EMA</div>
                    <div>English</div>
                    <div>German, French</div>
                    <div>
                      <Badge className="bg-blue-100 text-blue-800">Available</Badge>
                    </div>

                    <div>PMDA</div>
                    <div>English</div>
                    <div>Japanese</div>
                    <div>
                      <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>
                    </div>

                    <div>Health Canada</div>
                    <div>English</div>
                    <div>French</div>
                    <div>
                      <Badge className="bg-green-100 text-green-800">Ready</Badge>
                    </div>
                  </div>

                  <div className="pt-4 border-t">
                    <h4 className="font-medium mb-3 text-sm">Translation Workflow</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex items-center space-x-2">
                        <CheckCircle2 className="h-4 w-4 text-green-600" />
                        <span>Source document finalized</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Clock className="h-4 w-4 text-yellow-600" />
                        <span>Translation request submitted</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Users className="h-4 w-4 text-blue-600" />
                        <span>Professional review pending</span>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Step 5: Sign Dialog */}
      <Dialog open={showSignDialog} onOpenChange={setShowSignDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sign & Freeze Document</DialogTitle>
            <DialogDescription>
              Digitally sign this document and freeze it from further edits. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="actor">Signing Actor</Label>
              <Input
                id="actor"
                placeholder="Enter your name"
                value={signData.actor}
                onChange={e => setSignData({ ...signData, actor: e.target.value })}
                data-testid="input-sign-actor"
              />
            </div>
            <div>
              <Label htmlFor="role">Role</Label>
              <Select
                value={signData.role}
                onValueChange={value => setSignData({ ...signData, role: value })}
              >
                <SelectTrigger data-testid="select-sign-role">
                  <SelectValue placeholder="Select role" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="RA_CMC">Regulatory Affairs - CMC</SelectItem>
                  <SelectItem value="QA_LEAD">Quality Assurance Lead</SelectItem>
                  <SelectItem value="CMC_LEAD">CMC Lead</SelectItem>
                  <SelectItem value="TECHNICAL_LEAD">Technical Lead</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor="reason">Reason for Signing</Label>
              <Textarea
                id="reason"
                placeholder="Enter reason for signing"
                value={signData.reason}
                onChange={e => setSignData({ ...signData, reason: e.target.value })}
                data-testid="textarea-sign-reason"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSignDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleSignDocument(activeDocId, signData)}
              disabled={isSigning || !signData.actor || !signData.reason || !activeDocId}
              data-testid="button-confirm-sign"
            >
              {isSigning ? (
                <RefreshCcw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Lock className="h-3 w-3 mr-1" />
              )}
              Sign & Freeze
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Step 5: Send to Packager Dialog */}
      <Dialog open={showPackagerDialog} onOpenChange={setShowPackagerDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Send to eCTD Packager</DialogTitle>
            <DialogDescription>
              Send this document to the eCTD packaging system for submission preparation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label htmlFor="seqId">eCTD Sequence ID</Label>
              <Input
                id="seqId"
                placeholder="e.g., 0001"
                value={packagerData.seqId}
                onChange={e => setPackagerData({ ...packagerData, seqId: e.target.value })}
                data-testid="input-packager-seqid"
              />
            </div>
            <div>
              <Label htmlFor="path">eCTD Path</Label>
              <Input
                id="path"
                placeholder="e.g., m3/32s/32s7"
                value={packagerData.path}
                onChange={e => setPackagerData({ ...packagerData, path: e.target.value })}
                data-testid="input-packager-path"
              />
            </div>
            <div>
              <Label htmlFor="title">Document Title</Label>
              <Input
                id="title"
                placeholder="e.g., Stability Studies"
                value={packagerData.title}
                onChange={e => setPackagerData({ ...packagerData, title: e.target.value })}
                data-testid="input-packager-title"
              />
            </div>
            <div>
              <Label htmlFor="fmt">Format</Label>
              <Select
                value={packagerData.fmt}
                onValueChange={value => setPackagerData({ ...packagerData, fmt: value })}
              >
                <SelectTrigger data-testid="select-packager-format">
                  <SelectValue placeholder="Select format" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="docx">DOCX</SelectItem>
                  <SelectItem value="pdf">PDF</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowPackagerDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={() => handleSendToPackager(activeDocId, packagerData)}
              disabled={
                isSendingToPackager || !packagerData.seqId || !packagerData.path || !activeDocId
              }
              data-testid="button-confirm-packager"
            >
              {isSendingToPackager ? (
                <RefreshCcw className="h-3 w-3 mr-1 animate-spin" />
              ) : (
                <Send className="h-3 w-3 mr-1" />
              )}
              Send to eCTD
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      
      {/* Step 10: Guidance Drawer */}
      <GuidanceDrawer
        open={showGuidanceDrawer}
        onClose={() => setShowGuidanceDrawer(false)}
        sectionCode={currentSectionCode}
        locale={currentLocale}
      />
      
      {/* Step 10: Templates Drawer */}
      <TemplatesDrawer
        open={showTemplatesDrawer}
        onClose={() => setShowTemplatesDrawer(false)}
        docId={activeDocId}
        locale={currentLocale}
        onApply={(result) => {
          toast({
            title: 'Template Applied',
            description: `Successfully applied template with ${result.upserts} sections`,
          });
          // Refresh document data
          window.location.reload();
        }}
      />
      
      {/* Step 14: Reviewer Checklist & Change Request Components */}
      <ReviewerChecklistDrawer 
        open={showChecklistDrawer}
        onClose={() => setShowChecklistDrawer(false)}
        docId={activeDocId}
        sectionId={activeSectionId || 'section-1'}
        sectionCode={currentSectionCode}
        locale={currentLocale}
      />
      
      <ChangeRequestsDrawer 
        open={showChangeRequestsDrawer}
        onClose={() => setShowChangeRequestsDrawer(false)}
        docId={activeDocId}
        sectionId={activeSectionId || 'section-1'}
        onCreateNew={() => setShowCreateChangeRequestModal(true)}
      />
      
      <CreateChangeRequestModal 
        open={showCreateChangeRequestModal}
        onClose={() => setShowCreateChangeRequestModal(false)}
        docId={activeDocId}
        sectionId={activeSectionId || 'section-1'}
        currentContent={selectedDocument?.content}
        onSubmit={() => {
          setShowCreateChangeRequestModal(false);
          // Refresh change requests drawer if open
          if (showChangeRequestsDrawer) {
            // Trigger refresh via state change
            setChangeRequests([]);
          }
        }}
      />
    </div>
  );
};

export default CMCDocumentAuthoring;
