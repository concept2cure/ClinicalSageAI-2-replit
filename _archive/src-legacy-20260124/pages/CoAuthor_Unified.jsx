import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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
import { useToast } from '@/hooks/use-toast';
import {
  FileText,
  Search,
  FolderOpen,
  CheckCircle,
  X,
  Users,
  AlertTriangle,
  TrendingUp,
  Database,
  Shield,
} from 'lucide-react';
import NavigationBanner from '@/components/NavigationBanner';

// Import VaultDocumentViewer component
const VaultDocumentViewer = () => {
  const [documents] = useState([
    {
      id: 1,
      name: 'Clinical Overview v2.1.pdf',
      type: 'Clinical',
      status: 'Approved',
      date: '2025-06-25',
      size: '2.3 MB',
    },
    {
      id: 2,
      name: 'Quality Summary - Drug Substance.pdf',
      type: 'Quality',
      status: 'Under Review',
      date: '2025-06-24',
      size: '1.8 MB',
    },
    {
      id: 3,
      name: 'Clinical Study Report - Phase II.pdf',
      type: 'Clinical',
      status: 'Draft',
      date: '2025-06-23',
      size: '5.2 MB',
    },
    {
      id: 4,
      name: 'Risk Management Plan v3.0.pdf',
      type: 'Administrative',
      status: 'Approved',
      date: '2025-06-22',
      size: '976 KB',
    },
    {
      id: 5,
      name: 'Investigator Brochure v4.1.pdf',
      type: 'Clinical',
      status: 'Final',
      date: '2025-06-21',
      size: '3.1 MB',
    },
  ]);

  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState('all');

  const filteredDocuments = documents.filter(doc => {
    const matchesSearch = doc.name.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = filterType === 'all' || doc.type.toLowerCase() === filterType;
    return matchesSearch && matchesFilter;
  });

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input
          placeholder="Search documents..."
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          className="flex-1"
        />
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Filter by type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Types</SelectItem>
            <SelectItem value="clinical">Clinical</SelectItem>
            <SelectItem value="quality">Quality</SelectItem>
            <SelectItem value="administrative">Administrative</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2 max-h-80 overflow-y-auto">
        {filteredDocuments.map(doc => (
          <div
            key={doc.id}
            className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
          >
            <div className="flex items-center gap-3">
              <FileText className="h-5 w-5 text-blue-600" />
              <div>
                <p className="font-medium text-sm">{doc.name}</p>
                <p className="text-xs text-gray-500">
                  {doc.type} • {doc.date} • {doc.size}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge
                variant={
                  doc.status === 'Approved' || doc.status === 'Final'
                    ? 'default'
                    : doc.status === 'Draft'
                      ? 'secondary'
                      : 'outline'
                }
              >
                {doc.status}
              </Badge>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  toast({
                    title: 'Opening Document',
                    description: `Loading ${doc.name}...`,
                  });
                  // Simulate document opening with real navigation
                  setTimeout(() => {
                    window.open(
                      `/editor?document=${doc.id}&name=${encodeURIComponent(doc.name)}`,
                      '_blank'
                    );
                  }, 500);
                }}
              >
                Open
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default function CoAuthorUnified() {
  const { toast } = useToast();

  // State management
  const [documents] = useState([
    {
      id: 1,
      title: 'Clinical Overview Module 2.5',
      module: 'Module 2',
      lastEdited: '2 hours ago',
      editedBy: 'Dr. Sarah Chen',
      status: 'Draft',
      version: 'v2.1',
      reviewers: ['Michael Rodriguez', 'Dr. Emily Watson'],
    },
    {
      id: 2,
      title: 'Quality Summary Module 2.3',
      module: 'Module 2',
      lastEdited: '1 day ago',
      editedBy: 'Mark Wilson',
      status: 'Under Review',
      version: 'v1.4',
      reviewers: ['John Kim', 'Dr. Sarah Chen'],
    },
    {
      id: 3,
      title: 'Clinical Study Report CSR-001',
      module: 'Module 5',
      lastEdited: '3 days ago',
      editedBy: 'Dr. Emily Watson',
      status: 'Final',
      version: 'v3.0',
      reviewers: ['Robert Johnson', 'Dr. Sarah Chen', 'David Kim'],
    },
  ]);

  const [complianceData] = useState({
    overall: 87,
    fda: 85,
    ich: 92,
    quality: 83,
    issues: [
      {
        type: 'Critical',
        count: 2,
        section: 'Module 2.5',
        description: 'Missing efficacy endpoints',
      },
      { type: 'Warning', count: 5, section: 'Module 3.2', description: 'Incomplete CMC data' },
      { type: 'Info', count: 3, section: 'Module 1.2', description: 'Format recommendations' },
    ],
  });

  const [sectionSuggestions] = useState([
    {
      sectionCode: '2.7',
      sectionTitle: 'Clinical Summary',
      requirement: 'Mandatory',
      effort: 'Medium',
      confidence: 92,
      priority: 'High',
    },
    {
      sectionCode: '3.2.S',
      sectionTitle: 'Drug Substance',
      requirement: 'Mandatory',
      effort: 'Complex',
      confidence: 87,
      priority: 'High',
    },
    {
      sectionCode: '5.3.5.1',
      sectionTitle: 'Clinical Study Reports',
      requirement: 'Optional',
      effort: 'Quick',
      confidence: 95,
      priority: 'Medium',
    },
  ]);

  const [showIndWizard, setShowIndWizard] = useState(false);
  const [completionProgress] = useState(68);

  const handleCreateDocument = async (sectionCode = '2.5') => {
    try {
      toast({
        title: 'Starting AI Generation',
        description: 'Creating your regulatory document with AI...',
      });

      const response = await fetch('/api/v1/drafting/start_task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ectd_section: sectionCode,
          project_id: `coauthor-${Date.now()}`,
          title: `Module ${sectionCode} Document`,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        toast({
          title: 'Document Generation Started',
          description: `Task ID: ${data.task_id}. Redirecting to editor...`,
        });
        // Give user feedback before redirecting
        setTimeout(() => {
          window.location.href = `/editor?taskId=${data.task_id}`;
        }, 1000);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Document creation failed:', error);
      toast({
        title: 'Error',
        description: `Failed to create document: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  const handleIndWizard = async () => {
    try {
      toast({
        title: 'Starting IND Generation',
        description: 'Creating comprehensive IND application package with AI...',
      });

      const response = await fetch('/api/v1/drafting/start_task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ectd_section: 'IND',
          project_id: `ind-wizard-${Date.now()}`,
          title: 'IND Application Package',
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setShowIndWizard(false);
        toast({
          title: 'IND Package Generation Started',
          description: `Task ID: ${data.task_id}. Generating complete IND submission...`,
        });
        setTimeout(() => {
          window.location.href = `/editor?taskId=${data.task_id}`;
        }, 1500);
      } else {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      console.error('IND generation failed:', error);
      toast({
        title: 'Error',
        description: `Failed to create IND package: ${error.message}`,
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 via-white to-indigo-50">
      <NavigationBanner />

      <div className="container mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-900 mb-2">eCTD Co-Author</h1>
          <p className="text-lg text-gray-600">
            Unified AI-Powered Regulatory Document Management & Creation Platform
          </p>
        </div>

        {/* Unified Dashboard Header */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-blue-600">{complianceData.overall}%</div>
              <div className="text-sm text-gray-500">Overall Compliance</div>
              <Progress value={complianceData.overall} className="mt-2" />
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-green-600">{documents.length}</div>
              <div className="text-sm text-gray-500">Active Documents</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-purple-600">{sectionSuggestions.length}</div>
              <div className="text-sm text-gray-500">AI Suggestions</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <div className="text-2xl font-bold text-orange-600">{completionProgress}%</div>
              <div className="text-sm text-gray-500">Submission Progress</div>
              <Progress value={completionProgress} className="mt-2" />
            </CardContent>
          </Card>
        </div>

        {/* Main Content Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
          {/* Left Column - Document Creation & AI */}
          <div className="xl:col-span-1 space-y-6">
            {/* AI Document Creation */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-5 w-5 text-blue-600" />
                  AI Document Creation
                </CardTitle>
                <CardDescription>Generate regulatory documents with AI assistance</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <Button
                  onClick={() => handleCreateDocument('2.5')}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  Create AI Document
                </Button>

                {/* IND Wizard Integration */}
                <Card className="bg-gradient-to-r from-green-50 to-emerald-50 border-green-200">
                  <CardContent className="p-4">
                    <h4 className="font-semibold text-green-800 mb-2">IND Submission Wizard</h4>
                    <p className="text-sm text-green-700 mb-3">
                      Complete IND application preparation with step-by-step guidance
                    </p>
                    <Button
                      variant="outline"
                      className="w-full border-green-600 text-green-700 hover:bg-green-100"
                      onClick={() => setShowIndWizard(true)}
                    >
                      Start IND Wizard
                    </Button>
                  </CardContent>
                </Card>
              </CardContent>
            </Card>

            {/* AI Suggestions */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Search className="h-5 w-5 text-purple-600" />
                  AI Section Suggestions
                </CardTitle>
                <CardDescription>
                  Smart recommendations for your next document sections
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {sectionSuggestions.map((suggestion, index) => (
                    <div key={index} className="p-3 border rounded-lg hover:bg-gray-50">
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="font-medium text-sm">{suggestion.sectionTitle}</div>
                          <div className="text-xs text-gray-500 mb-2">{suggestion.sectionCode}</div>
                          <div className="flex gap-1 mb-2">
                            <Badge
                              variant={
                                suggestion.requirement === 'Mandatory' ? 'destructive' : 'secondary'
                              }
                              className="text-xs"
                            >
                              {suggestion.requirement}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {suggestion.effort}
                            </Badge>
                            <Badge variant="outline" className="text-xs">
                              {suggestion.confidence}% confidence
                            </Badge>
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="ml-2"
                          onClick={() => handleCreateDocument(suggestion.sectionCode)}
                        >
                          Create
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Center Column - Vault DMS */}
          <div className="xl:col-span-1 space-y-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-indigo-600" />
                  Vault Document Management
                </CardTitle>
                <CardDescription>
                  Enterprise-grade document repository with version control
                </CardDescription>
              </CardHeader>
              <CardContent>
                <VaultDocumentViewer />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Recent Work & Compliance */}
          <div className="xl:col-span-1 space-y-6">
            {/* Recent Documents */}
            <Card>
              <CardHeader>
                <CardTitle>Recent Documents</CardTitle>
                <CardDescription>Your latest regulatory documents</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {documents.map(doc => (
                    <Card key={doc.id} className="cursor-pointer hover:shadow-md transition-shadow">
                      <CardContent className="p-4">
                        <div className="flex justify-between items-start">
                          <div>
                            <h4 className="font-medium">{doc.title}</h4>
                            <p className="text-sm text-gray-500">{doc.module}</p>
                            <p className="text-xs text-gray-400">
                              {doc.lastEdited} by {doc.editedBy}
                            </p>
                          </div>
                          <Badge variant={doc.status === 'Final' ? 'default' : 'secondary'}>
                            {doc.status}
                          </Badge>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Compliance Panel */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Real-time Compliance
                </CardTitle>
                <CardDescription>FDA, ICH, and Quality compliance monitoring</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-3 gap-4 mb-4">
                  <div className="text-center">
                    <div className="text-2xl font-bold text-blue-600">{complianceData.fda}%</div>
                    <div className="text-xs text-gray-500">FDA</div>
                    <Progress value={complianceData.fda} className="mt-1 h-2" />
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-green-600">{complianceData.ich}%</div>
                    <div className="text-xs text-gray-500">ICH</div>
                    <Progress value={complianceData.ich} className="mt-1 h-2" />
                  </div>
                  <div className="text-center">
                    <div className="text-2xl font-bold text-orange-600">
                      {complianceData.quality}%
                    </div>
                    <div className="text-xs text-gray-500">Quality</div>
                    <Progress value={complianceData.quality} className="mt-1 h-2" />
                  </div>
                </div>

                <div className="space-y-2">
                  <h4 className="font-medium text-sm">Active Issues</h4>
                  {complianceData.issues.map((issue, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-3 border rounded-lg"
                    >
                      <div className="flex items-center gap-3">
                        <Badge
                          variant={
                            issue.type === 'Critical'
                              ? 'destructive'
                              : issue.type === 'Warning'
                                ? 'secondary'
                                : 'outline'
                          }
                        >
                          {issue.type}
                        </Badge>
                        <div>
                          <div className="font-medium text-sm">{issue.section}</div>
                          <div className="text-xs text-gray-500">{issue.description}</div>
                        </div>
                      </div>
                      <div className="text-sm font-medium">{issue.count}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* IND Wizard Modal */}
        {showIndWizard && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-y-auto">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-2xl font-bold text-gray-900">IND Submission Wizard</h2>
                <Button variant="ghost" onClick={() => setShowIndWizard(false)}>
                  <X className="h-5 w-5" />
                </Button>
              </div>

              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Step 1: Protocol Development</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div>
                          <Label>Study Title</Label>
                          <Input placeholder="Enter study title" />
                        </div>
                        <div>
                          <Label>Therapeutic Area</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Select area" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="oncology">Oncology</SelectItem>
                              <SelectItem value="cardiology">Cardiology</SelectItem>
                              <SelectItem value="neurology">Neurology</SelectItem>
                              <SelectItem value="infectious">Infectious Diseases</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Study Phase</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Select phase" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="phase1">Phase I</SelectItem>
                              <SelectItem value="phase1-2">Phase I/II</SelectItem>
                              <SelectItem value="phase2">Phase II</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg">Step 2: Regulatory Strategy</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        <div>
                          <Label>Submission Type</Label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Select type" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="original">Original IND</SelectItem>
                              <SelectItem value="amendment">IND Amendment</SelectItem>
                              <SelectItem value="safety">Safety Report</SelectItem>
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
                              <SelectItem value="fda">FDA (US)</SelectItem>
                              <SelectItem value="ema">EMA (EU)</SelectItem>
                              <SelectItem value="pmda">PMDA (Japan)</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                <div className="flex justify-end gap-3">
                  <Button variant="outline" onClick={() => setShowIndWizard(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleIndWizard}
                    className="bg-green-600 hover:bg-green-700 text-white"
                  >
                    Generate IND Package
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
