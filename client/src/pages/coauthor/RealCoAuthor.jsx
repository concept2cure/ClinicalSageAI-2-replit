import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
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
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useLocation } from 'wouter';
import WorkingVault from '@/components/WorkingVault';
import {
  FileText,
  FolderOpen,
  Upload,
  Search,
  Check,
  BookOpen,
  Users,
  Settings,
  Download,
  Eye,
  Edit,
  Share,
  AlertTriangle,
  Zap,
  Target,
  Clock,
  CheckCircle,
  XCircle,
} from 'lucide-react';

function RealCoAuthor() {
  const [location, setLocation] = useLocation();
  const [isGenerating, setIsGenerating] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [formData, setFormData] = useState({
    documentTitle: '',
    ectdSection: '',
    submissionType: '',
    therapeuticArea: '',
    productName: '',
    indication: '',
    sponsorCompany: '',
    regulatoryStrategy: '',
    studyPhase: '',
    studyDesign: '',
  });
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [suggestions, setSuggestions] = useState([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const { toast } = useToast();

  // Load recent documents and suggestions on mount
  useEffect(() => {
    loadRecentDocuments();
    loadSuggestions();
  }, []);

  const loadRecentDocuments = async () => {
    try {
      // Get recent documents from drafting tasks
      const response = await fetch('/api/v1/drafting/recent_documents');
      if (response.ok) {
        const data = await response.json();
        setRecentDocuments(data.documents || []);
      }
    } catch (error) {
      console.error('Error loading recent documents:', error);
    }
  };

  const loadSuggestions = async () => {
    setLoadingSuggestions(true);
    try {
      const response = await fetch('/api/predictive-sections/suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentType: 'eCTD',
          submissionType: 'IND',
          existingSections: [],
          regulatoryRegion: 'FDA',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSuggestions(data.suggestions || []);
      }
    } catch (error) {
      console.error('Error loading suggestions:', error);
    } finally {
      setLoadingSuggestions(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const loadTemplate = async (category, subcategory, templateType) => {
    try {
      const response = await fetch(
        `/api/templates/regulatory/${category}/${subcategory}/${templateType}`
      );
      if (response.ok) {
        const template = await response.json();
        // Pre-fill form with template information
        setFormData(prev => ({
          ...prev,
          documentTitle: template.title,
          templateContent: template.content,
          selectedTemplate: `${category}-${subcategory}-${templateType}`,
        }));
        toast({
          title: 'Template Loaded',
          description: `${template.title} template loaded successfully`,
        });
      } else {
        toast({
          title: 'Template Error',
          description: 'Could not load regulatory template',
          variant: 'destructive',
        });
      }
    } catch (error) {
      console.error('Error loading template:', error);
      toast({
        title: 'Template Error',
        description: 'Failed to load template',
        variant: 'destructive',
      });
    }
  };

  const handleGenerateDocument = async () => {
    if (!formData.documentTitle || !formData.ectdSection) {
      toast({
        title: 'Missing Information',
        description: 'Please provide document title and eCTD section.',
        variant: 'destructive',
      });
      return;
    }

    setIsGenerating(true);
    try {
      // Use the working RAG API
      const response = await fetch('/api/v1/drafting/start_task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ectd_section: formData.ectdSection,
          project_id: 'coauthor-' + Date.now(),
          title: formData.documentTitle,
          submission_type: formData.submissionType,
          therapeutic_area: formData.therapeuticArea,
          product_name: formData.productName,
          indication: formData.indication,
          sponsor_company: formData.sponsorCompany,
          regulatory_strategy: formData.regulatoryStrategy,
          study_phase: formData.studyPhase,
          study_design: formData.studyDesign,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Document Generation Started',
          description: `Task ID: ${data.task_id}. Redirecting to editor...`,
        });

        setIsDialogOpen(false);
        // Navigate to DocumentEditor with taskId
        setLocation(`/editor?taskId=${data.task_id}`);
      } else {
        throw new Error('Failed to start document generation');
      }
    } catch (error) {
      console.error('Error generating document:', error);
      toast({
        title: 'Generation Failed',
        description: 'Failed to start document generation. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSuggestionClick = suggestion => {
    setFormData(prev => ({
      ...prev,
      ectdSection: suggestion.sectionCode,
      documentTitle: suggestion.title,
    }));
    setIsDialogOpen(true);
  };

  const getComplianceColor = score => {
    if (score >= 90) return 'text-green-600';
    if (score >= 80) return 'text-yellow-600';
    return 'text-red-600';
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'in_progress':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'failed':
        return <XCircle className="h-4 w-4 text-red-600" />;
      default:
        return <Clock className="h-4 w-4 text-gray-400" />;
    }
  };

  return (
    <div className="min-h-screen bg-zinc-50">
      {/* Header */}
      <div className="bg-white/80 border-b border-slate-200/70 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-6">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">eCTD Co-Author</h1>
              <p className="text-gray-600 mt-1">AI-powered regulatory document authoring</p>
            </div>
            <div className="flex items-center space-x-4">
              <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                Backend Connected
              </Badge>
              <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
                <DialogTrigger asChild>
                  <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700">
                    <FileText className="h-4 w-4 mr-2" />
                    Create AI Document
                  </Button>
                </DialogTrigger>
                <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Generate AI Regulatory Document</DialogTitle>
                    <DialogDescription>
                      Create a new eCTD document using AI assistance
                    </DialogDescription>
                  </DialogHeader>

                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="title">Document Title *</Label>
                        <Input
                          id="title"
                          value={formData.documentTitle}
                          onChange={e => handleInputChange('documentTitle', e.target.value)}
                          placeholder="e.g., Clinical Overview"
                        />
                      </div>
                      <div>
                        <Label htmlFor="section">eCTD Section *</Label>
                        <Select
                          value={formData.ectdSection}
                          onValueChange={value => handleInputChange('ectdSection', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select eCTD section" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="2.5">Module 2.5 - Clinical Overview</SelectItem>
                            <SelectItem value="2.7">Module 2.7 - Clinical Summary</SelectItem>
                            <SelectItem value="3.2.S">Module 3.2.S - Drug Substance</SelectItem>
                            <SelectItem value="3.2.P">Module 3.2.P - Drug Product</SelectItem>
                            <SelectItem value="5.3.5.1">
                              Module 5.3.5.1 - Clinical Study Reports
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="submissionType">Submission Type</Label>
                        <Select
                          value={formData.submissionType}
                          onValueChange={value => handleInputChange('submissionType', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="IND">IND</SelectItem>
                            <SelectItem value="NDA">NDA</SelectItem>
                            <SelectItem value="BLA">BLA</SelectItem>
                            <SelectItem value="510k">510(k)</SelectItem>
                            <SelectItem value="PMA">PMA</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label htmlFor="therapeuticArea">Therapeutic Area</Label>
                        <Select
                          value={formData.therapeuticArea}
                          onValueChange={value => handleInputChange('therapeuticArea', value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select area" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="oncology">Oncology</SelectItem>
                            <SelectItem value="cardiology">Cardiology</SelectItem>
                            <SelectItem value="neurology">Neurology</SelectItem>
                            <SelectItem value="immunology">Immunology</SelectItem>
                            <SelectItem value="infectious_diseases">Infectious Diseases</SelectItem>
                            <SelectItem value="endocrinology">Endocrinology</SelectItem>
                            <SelectItem value="gastroenterology">Gastroenterology</SelectItem>
                            <SelectItem value="other">Other</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <Label htmlFor="productName">Product Name</Label>
                        <Input
                          id="productName"
                          value={formData.productName}
                          onChange={e => handleInputChange('productName', e.target.value)}
                          placeholder="e.g., Example Drug"
                        />
                      </div>
                      <div>
                        <Label htmlFor="indication">Medical Indication</Label>
                        <Input
                          id="indication"
                          value={formData.indication}
                          onChange={e => handleInputChange('indication', e.target.value)}
                          placeholder="e.g., Treatment of cancer"
                        />
                      </div>
                    </div>

                    {/* Regulatory Templates Section */}
                    <div className="border rounded-lg p-4 bg-gray-50">
                      <Label className="text-sm font-semibold mb-2 block">
                        Regulatory Templates
                      </Label>
                      <div className="grid grid-cols-3 gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => loadTemplate('fda', '510k', 'device_description')}
                          className="text-xs"
                        >
                          FDA 510(k) Device
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => loadTemplate('fda', 'IND', 'investigational_plan')}
                          className="text-xs"
                        >
                          FDA IND Plan
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => loadTemplate('ich', 'M4', 'clinical_overview')}
                          className="text-xs"
                        >
                          ICH Clinical Overview
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            loadTemplate('therapeutic', 'oncology', 'clinical_overview')
                          }
                          className="text-xs"
                        >
                          Oncology Template
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            loadTemplate('therapeutic', 'cardiovascular', 'clinical_overview')
                          }
                          className="text-xs"
                        >
                          Cardiovascular
                        </Button>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => loadTemplate('fda', '510k', 'predicate_comparison')}
                          className="text-xs"
                        >
                          Predicate Comparison
                        </Button>
                      </div>
                    </div>

                    <div>
                      <Label htmlFor="sponsorCompany">Sponsor Company</Label>
                      <Input
                        id="sponsorCompany"
                        value={formData.sponsorCompany}
                        onChange={e => handleInputChange('sponsorCompany', e.target.value)}
                        placeholder="e.g., Biotech Corp"
                      />
                    </div>
                  </div>

                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={handleGenerateDocument}
                      disabled={isGenerating || !formData.documentTitle || !formData.ectdSection}
                      className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700"
                    >
                      {isGenerating ? (
                        <>
                          <Clock className="h-4 w-4 mr-2 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Zap className="h-4 w-4 mr-2" />
                          Generate with AI
                        </>
                      )}
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* AI Suggestions Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-5 w-5 mr-2 text-slate-600" />
                  AI Document Suggestions
                </CardTitle>
                <CardDescription>
                  Intelligent recommendations based on regulatory patterns
                </CardDescription>
              </CardHeader>
              <CardContent>
                {loadingSuggestions ? (
                  <div className="flex items-center justify-center py-8">
                    <Clock className="h-6 w-6 animate-spin text-slate-600 mr-2" />
                    Loading AI suggestions...
                  </div>
                ) : (
                  <div className="space-y-3">
                    {suggestions.slice(0, 4).map((suggestion, index) => (
                      <div
                        key={index}
                        className="p-4 border rounded-lg hover:bg-slate-50 cursor-pointer transition-colors"
                        onClick={() => handleSuggestionClick(suggestion)}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <h4 className="font-medium">{suggestion.title}</h4>
                            <p className="text-sm text-gray-600">{suggestion.description}</p>
                            <div className="flex items-center mt-2 space-x-2">
                              <Badge variant="outline" className="text-xs">
                                {suggestion.sectionCode}
                              </Badge>
                              <Badge
                                variant={
                                  suggestion.requirement === 'Mandatory' ? 'default' : 'secondary'
                                }
                                className="text-xs"
                              >
                                {suggestion.requirement}
                              </Badge>
                              <span className="text-xs text-gray-500">{suggestion.effort}</span>
                            </div>
                          </div>
                          <div className="text-right">
                            <div className="text-sm font-medium text-slate-600">
                              {suggestion.confidence}% match
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Recent Documents */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Clock className="h-5 w-5 mr-2 text-green-600" />
                  Recent Documents
                </CardTitle>
                <CardDescription>Your recently generated AI documents</CardDescription>
              </CardHeader>
              <CardContent>
                {recentDocuments.length > 0 ? (
                  <div className="space-y-3">
                    {recentDocuments.map((doc, index) => (
                      <div key={index} className="p-4 border rounded-lg hover:bg-slate-50">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            {getStatusIcon(doc.status)}
                            <div>
                              <h4 className="font-medium">{doc.title || 'Untitled Document'}</h4>
                              <p className="text-sm text-gray-600">
                                {doc.created_at
                                  ? new Date(doc.created_at).toLocaleDateString()
                                  : 'Recently created'}
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center space-x-2">
                            <Badge variant="outline" className="text-xs">
                              {doc.ectd_section || 'N/A'}
                            </Badge>
                            {doc.task_id && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setLocation(`/editor?taskId=${doc.task_id}`)}
                              >
                                <Eye className="h-3 w-3 mr-1" />
                                View
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-gray-500">
                    <FileText className="h-12 w-12 mx-auto mb-3 text-gray-300" />
                    <p>No documents yet. Create your first AI document to get started.</p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Sidebar */}
          <div className="space-y-6">
            {/* Quick Stats */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">System Status</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm">AI Engine</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      Online
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">RAG Pipeline</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      Active
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm">Document Storage</span>
                    <Badge variant="default" className="bg-green-100 text-green-800">
                      Connected
                    </Badge>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Quick Actions */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Quick Actions</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => setIsDialogOpen(true)}
                  >
                    <FileText className="h-4 w-4 mr-2" />
                    New Document
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={() => setLocation('/editor')}
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Document Editor
                  </Button>
                  <Button
                    className="w-full justify-start"
                    variant="outline"
                    onClick={loadSuggestions}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    Refresh Suggestions
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* FDA Submission Workflow */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <Target className="h-5 w-5 mr-2" />
                  FDA Submission Process
                </CardTitle>
                <CardDescription>Complete end-to-end FDA submission workflow</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  <div className="bg-slate-50 p-3 rounded-lg">
                    <h4 className="font-medium text-blue-900 text-sm mb-2">
                      How to Submit to FDA:
                    </h4>
                    <ol className="text-xs text-blue-800 space-y-1">
                      <li>1. Generate required documents using "Create AI Document"</li>
                      <li>2. Review documents in DocumentEditor</li>
                      <li>3. Compile eCTD package with all sections</li>
                      <li>4. Submit via FDA Electronic Submission Gateway</li>
                      <li>5. Track FDA review status (3-6 months)</li>
                    </ol>
                  </div>
                  <div className="space-y-2">
                    <Button
                      size="sm"
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => {
                        // Start FDA submission workflow
                        setFormData(prev => ({
                          ...prev,
                          submissionType: '510k',
                          ectdSection: '2.5',
                        }));
                        setIsDialogOpen(true);
                      }}
                    >
                      <Zap className="h-3 w-3 mr-2" />
                      Start FDA 510(k) Submission
                    </Button>
                    <Button
                      size="sm"
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          submissionType: 'IND',
                          ectdSection: '2.5',
                        }));
                        setIsDialogOpen(true);
                      }}
                    >
                      <FileText className="h-3 w-3 mr-2" />
                      Start IND Application
                    </Button>
                    <Button
                      size="sm"
                      className="w-full justify-start"
                      variant="outline"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          submissionType: 'NDA',
                          ectdSection: '2.5',
                        }));
                        setIsDialogOpen(true);
                      }}
                    >
                      <Upload className="h-3 w-3 mr-2" />
                      Start NDA Submission
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Working Vault with Real Files */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg flex items-center">
                  <FolderOpen className="h-5 w-5 mr-2" />
                  Document Vault
                </CardTitle>
                <CardDescription>
                  Access your regulatory documents (2,131 files available)
                </CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <WorkingVault />
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

export default RealCoAuthor;
