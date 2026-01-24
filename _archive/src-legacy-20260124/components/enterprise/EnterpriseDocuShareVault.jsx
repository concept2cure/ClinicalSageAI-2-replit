import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/hooks/use-toast';
import {
  Library,
  ClipboardCheck,
  FileSearch,
  ShieldCheck,
  FileText,
  FolderCheck,
  FileDigit,
  Users,
  Clock,
  Lock,
  Certificate,
  FileSpreadsheet,
  Upload,
  Download,
  Eye,
  Search,
  Filter,
  BarChart4,
  FileSignature,
  History,
  ClipboardList,
  LifeBuoy,
} from 'lucide-react';

/**
 * Enterprise DocuShare Vault Component
 *
 * A comprehensive showcase of DocuShare's enterprise document management capabilities
 * with integration across all TrialSage modules.
 */
export default function EnterpriseDocuShareVault() {
  const [activeTab, setActiveTab] = useState('overview');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedModule, setSelectedModule] = useState('all');
  const [selectedDocType, setSelectedDocType] = useState('all');
  const { toast } = useToast();

  // Simulated document data that would typically come from the DocuShare API
  const documentData = {
    totalDocuments: 2457,
    totalCollections: 89,
    byModule: {
      ind: 342,
      csr: 563,
      nda: 218,
      protocol: 175,
      quality: 421,
      regulatory: 389,
      safety: 349,
    },
    recentDocuments: [
      {
        id: 'doc-1',
        name: 'Phase II Clinical Study Report - Compound XYZ-123',
        module: 'csr',
        docType: 'report',
        lastModified: '2025-04-18T14:30:00Z',
        author: 'Dr. Sarah Johnson',
        version: '2.1',
        status: 'approved',
      },
      {
        id: 'doc-2',
        name: 'IND Application Section 5 - Clinical Protocol',
        module: 'ind',
        docType: 'submission',
        lastModified: '2025-04-17T09:45:00Z',
        author: 'Dr. Michael Chen',
        version: '3.0',
        status: 'in_review',
      },
      {
        id: 'doc-3',
        name: 'Quality Control Test Procedures - Batch Release',
        module: 'quality',
        docType: 'procedure',
        lastModified: '2025-04-16T11:20:00Z',
        author: 'Jennifer Williams',
        version: '1.4',
        status: 'approved',
      },
      {
        id: 'doc-4',
        name: "Investigator's Brochure - Compound XYZ-123",
        module: 'regulatory',
        docType: 'brochure',
        lastModified: '2025-04-15T16:10:00Z',
        author: 'Dr. Robert Martinez',
        version: '4.2',
        status: 'approved',
      },
      {
        id: 'doc-5',
        name: 'Safety Monitoring Plan - Phase III Trial',
        module: 'safety',
        docType: 'plan',
        lastModified: '2025-04-14T13:25:00Z',
        author: 'Dr. Emily Parker',
        version: '2.0',
        status: 'approved',
      },
    ],
    integrations: [
      { module: 'IND Wizard', documentCount: 342, lastSync: '2025-04-22T08:30:00Z' },
      { module: 'CSR Intelligence', documentCount: 563, lastSync: '2025-04-22T09:15:00Z' },
      { module: 'NDA Accelerator', documentCount: 218, lastSync: '2025-04-22T07:45:00Z' },
      { module: 'Protocol Builder', documentCount: 175, lastSync: '2025-04-22T10:00:00Z' },
      { module: 'Quality Management', documentCount: 421, lastSync: '2025-04-22T08:00:00Z' },
      { module: 'Regulatory Affairs', documentCount: 389, lastSync: '2025-04-22T09:30:00Z' },
      { module: 'Safety Monitoring', documentCount: 349, lastSync: '2025-04-22T08:45:00Z' },
    ],
    compliance: {
      framework: '21 CFR Part 11',
      lastValidation: '2025-03-15',
      signatures: {
        electronic: true,
        biometric: true,
        smartCard: true,
      },
      audit: {
        lastAudit: '2025-04-01',
        status: 'compliant',
        findings: 0,
      },
      security: {
        encryption: 'AES-256',
        authentication: 'Multi-factor',
        accessControl: 'Role-based + Attribute-based',
      },
    },
  };

  // Function to format date
  const formatDate = dateString => {
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(date);
  };

  // Function to get a sample document for demo purposes
  const handleViewDocument = docId => {
    toast({
      title: 'Document Viewer',
      description: 'Opening document viewer with audit trail and e-signature capabilities.',
    });
  };

  // Function to handle document download
  const handleDownloadDocument = docId => {
    toast({
      title: 'Secure Download',
      description: 'Document download initiated with encryption and audit logging.',
    });
  };

  // Create module badges with appropriate colors
  const getModuleBadge = module => {
    const colors = {
      ind: 'bg-blue-100 text-blue-800',
      csr: 'bg-purple-100 text-purple-800',
      nda: 'bg-green-100 text-green-800',
      protocol: 'bg-orange-100 text-orange-800',
      quality: 'bg-teal-100 text-teal-800',
      regulatory: 'bg-indigo-100 text-indigo-800',
      safety: 'bg-red-100 text-red-800',
    };

    const labels = {
      ind: 'IND',
      csr: 'CSR',
      nda: 'NDA',
      protocol: 'Protocol',
      quality: 'Quality',
      regulatory: 'Regulatory',
      safety: 'Safety',
    };

    return (
      <Badge className={`${colors[module] || 'bg-gray-100 text-gray-800'}`}>
        {labels[module] || module}
      </Badge>
    );
  };

  // Get status badge with appropriate colors
  const getStatusBadge = status => {
    const statusColors = {
      approved: 'bg-green-100 text-green-800',
      in_review: 'bg-yellow-100 text-yellow-800',
      draft: 'bg-gray-100 text-gray-800',
      rejected: 'bg-red-100 text-red-800',
    };

    const statusLabels = {
      approved: 'Approved',
      in_review: 'In Review',
      draft: 'Draft',
      rejected: 'Rejected',
    };

    return (
      <Badge className={`${statusColors[status] || 'bg-gray-100 text-gray-800'}`}>
        {statusLabels[status] || status}
      </Badge>
    );
  };

  return (
    <div className="w-full">
      <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5 mb-6">
          <TabsTrigger value="overview" className="flex items-center gap-1">
            <Library className="h-4 w-4" />
            <span>Overview</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="flex items-center gap-1">
            <FileText className="h-4 w-4" />
            <span>Documents</span>
          </TabsTrigger>
          <TabsTrigger value="integrations" className="flex items-center gap-1">
            <ClipboardList className="h-4 w-4" />
            <span>Integrations</span>
          </TabsTrigger>
          <TabsTrigger value="compliance" className="flex items-center gap-1">
            <ShieldCheck className="h-4 w-4" />
            <span>Compliance</span>
          </TabsTrigger>
          <TabsTrigger value="case-studies" className="flex items-center gap-1">
            <ClipboardCheck className="h-4 w-4" />
            <span>Case Studies</span>
          </TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Library className="h-5 w-5 text-indigo-600" />
                  DocuShare Enterprise
                </CardTitle>
                <CardDescription>
                  Enterprise document management with 21 CFR Part 11 compliance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-medium">Total Documents</span>
                    <span className="font-bold text-indigo-600">
                      {documentData.totalDocuments.toLocaleString()}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-medium">Collections</span>
                    <span className="font-bold text-indigo-600">
                      {documentData.totalCollections}
                    </span>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-medium">Compliance Framework</span>
                    <Badge className="bg-green-100 text-green-800">21 CFR Part 11</Badge>
                  </div>
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-medium">Last Validated</span>
                    <span className="text-sm">{documentData.compliance.lastValidation}</span>
                  </div>
                </div>
              </CardContent>
              <CardFooter className="pt-2">
                <div className="w-full flex justify-between items-center text-xs text-gray-500">
                  <div className="flex items-center gap-1">
                    <Lock className="h-3 w-3" />
                    <span>Enterprise Security</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Certificate className="h-3 w-3" />
                    <span>Validated System</span>
                  </div>
                </div>
              </CardFooter>
            </Card>

            <Card className="md:col-span-2">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <BarChart4 className="h-5 w-5 text-indigo-600" />
                  Documents by Module
                </CardTitle>
                <CardDescription>Document distribution across TrialSage modules</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {Object.entries(documentData.byModule).map(([module, count]) => (
                    <div key={module} className="flex items-center">
                      <div className="w-24 shrink-0">{getModuleBadge(module)}</div>
                      <div className="flex-1 mx-2">
                        <div className="h-3 rounded-full overflow-hidden bg-slate-100">
                          <div
                            className="h-3 bg-indigo-600 rounded-full"
                            style={{ width: `${(count / documentData.totalDocuments) * 100}%` }}
                          ></div>
                        </div>
                      </div>
                      <div className="w-16 text-right text-sm font-medium">{count}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="flex justify-end">
                <Button variant="outline" size="sm" className="gap-1">
                  <FileSpreadsheet className="h-4 w-4" />
                  <span>Export Report</span>
                </Button>
              </CardFooter>
            </Card>

            <Card className="md:col-span-3">
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Clock className="h-5 w-5 text-indigo-600" />
                  Recent Documents
                </CardTitle>
                <CardDescription>
                  Recently added or modified documents across all modules
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {documentData.recentDocuments.map(doc => (
                    <div
                      key={doc.id}
                      className="flex items-start justify-between p-3 rounded-lg border hover:bg-slate-50"
                    >
                      <div className="flex items-start gap-3">
                        <FileText className="h-5 w-5 mt-0.5 text-indigo-600" />
                        <div>
                          <h4 className="text-sm font-medium">{doc.name}</h4>
                          <div className="flex gap-2 mt-1">
                            {getModuleBadge(doc.module)}
                            {getStatusBadge(doc.status)}
                            <span className="text-xs text-gray-500">v{doc.version}</span>
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            Updated {formatDate(doc.lastModified)} by {doc.author}
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleViewDocument(doc.id)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDownloadDocument(doc.id)}
                        >
                          <Download className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter className="flex justify-between">
                <Button variant="outline" size="sm" className="gap-1">
                  <Search className="h-4 w-4" />
                  <span>Advanced Search</span>
                </Button>
                <Button variant="outline" size="sm" className="gap-1">
                  <Upload className="h-4 w-4" />
                  <span>Upload Document</span>
                </Button>
              </CardFooter>
            </Card>
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="documents">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-xl flex items-center gap-2">
                <FileText className="h-5 w-5 text-indigo-600" />
                Document Repository
              </CardTitle>
              <CardDescription>
                Search, access, and manage all documents across the enterprise
              </CardDescription>

              <div className="flex flex-col md:flex-row gap-4 mt-4">
                <div className="flex-1">
                  <Input
                    placeholder="Search documents..."
                    value={searchTerm}
                    onChange={e => setSearchTerm(e.target.value)}
                    className="w-full"
                  />
                </div>
                <div className="flex gap-2">
                  <Select value={selectedModule} onValueChange={setSelectedModule}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Module" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Modules</SelectItem>
                      <SelectItem value="ind">IND</SelectItem>
                      <SelectItem value="csr">CSR</SelectItem>
                      <SelectItem value="nda">NDA</SelectItem>
                      <SelectItem value="protocol">Protocol</SelectItem>
                      <SelectItem value="quality">Quality</SelectItem>
                      <SelectItem value="regulatory">Regulatory</SelectItem>
                      <SelectItem value="safety">Safety</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={selectedDocType} onValueChange={setSelectedDocType}>
                    <SelectTrigger className="w-[150px]">
                      <SelectValue placeholder="Document Type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All Types</SelectItem>
                      <SelectItem value="report">Reports</SelectItem>
                      <SelectItem value="submission">Submissions</SelectItem>
                      <SelectItem value="procedure">Procedures</SelectItem>
                      <SelectItem value="brochure">Brochures</SelectItem>
                      <SelectItem value="form">Forms</SelectItem>
                      <SelectItem value="plan">Plans</SelectItem>
                      <SelectItem value="template">Templates</SelectItem>
                    </SelectContent>
                  </Select>

                  <Button variant="outline" size="icon">
                    <Filter className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {/* This would be populated with search results */}
                {/* For demo purposes, using recentDocuments */}
                {documentData.recentDocuments.map(doc => (
                  <div
                    key={doc.id}
                    className="flex items-start justify-between p-3 rounded-lg border hover:bg-slate-50"
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 mt-0.5 text-indigo-600" />
                      <div>
                        <h4 className="text-sm font-medium">{doc.name}</h4>
                        <div className="flex gap-2 mt-1">
                          {getModuleBadge(doc.module)}
                          {getStatusBadge(doc.status)}
                          <span className="text-xs text-gray-500">v{doc.version}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          Updated {formatDate(doc.lastModified)} by {doc.author}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleViewDocument(doc.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDownloadDocument(doc.id)}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <History className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon">
                        <FileSignature className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <div className="text-sm text-gray-500">
                Showing 5 of {documentData.totalDocuments.toLocaleString()} documents
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm">
                  Previous
                </Button>
                <Button variant="outline" size="sm">
                  Next
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Integrations Tab */}
        <TabsContent value="integrations">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Workflow className="h-5 w-5 text-indigo-600" />
                  Module Integrations
                </CardTitle>
                <CardDescription>
                  DocuShare integration status across TrialSage modules
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {documentData.integrations.map(integration => (
                    <div
                      key={integration.module}
                      className="flex items-center justify-between p-3 rounded-lg border"
                    >
                      <div>
                        <h4 className="text-sm font-medium">{integration.module}</h4>
                        <div className="mt-1 text-xs text-gray-500">
                          Last synchronized: {formatDate(integration.lastSync)}
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-800">Connected</Badge>
                        <div className="text-sm font-medium">{integration.documentCount}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="sm" className="gap-1">
                  <LifeBuoy className="h-4 w-4" />
                  <span>Integration Diagnostics</span>
                </Button>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <FolderCheck className="h-5 w-5 text-indigo-600" />
                  Integration Use Cases
                </CardTitle>
                <CardDescription>How DocuShare is used across different modules</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="p-3 rounded-lg border">
                    <h4 className="text-sm font-medium">IND Wizard Integration</h4>
                    <p className="mt-1 text-sm text-gray-600">
                      Automated document generation, versioning, and submission preparation with
                      electronic signatures for FDA submissions.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg border">
                    <h4 className="text-sm font-medium">CSR Intelligence Integration</h4>
                    <p className="mt-1 text-sm text-gray-600">
                      Direct access to historical CSRs and templates with automated validation
                      against regulatory requirements.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg border">
                    <h4 className="text-sm font-medium">Protocol Builder Integration</h4>
                    <p className="mt-1 text-sm text-gray-600">
                      Collaborative protocol development with version control, approval workflows,
                      and electronic signatures.
                    </p>
                  </div>

                  <div className="p-3 rounded-lg border">
                    <h4 className="text-sm font-medium">Quality Management Integration</h4>
                    <p className="mt-1 text-sm text-gray-600">
                      GxP document control with automated quality checks, approval routing, and
                      comprehensive audit trails.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Compliance Tab */}
        <TabsContent value="compliance">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <ShieldCheck className="h-5 w-5 text-indigo-600" />
                  Compliance Framework
                </CardTitle>
                <CardDescription>
                  21 CFR Part 11 compliance for electronic records and signatures
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-medium">Regulatory Framework</span>
                    <Badge className="bg-green-100 text-green-800">21 CFR Part 11</Badge>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-medium">Last System Validation</span>
                    <span className="text-sm">{documentData.compliance.lastValidation}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-medium">Last Compliance Audit</span>
                    <span className="text-sm">{documentData.compliance.audit.lastAudit}</span>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-medium">Audit Status</span>
                    <Badge className="bg-green-100 text-green-800">
                      {documentData.compliance.audit.status}
                    </Badge>
                  </div>

                  <div className="flex justify-between items-center pb-2 border-b">
                    <span className="text-sm font-medium">Audit Findings</span>
                    <span className="text-sm font-medium text-green-600">
                      {documentData.compliance.audit.findings}
                    </span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <Lock className="h-5 w-5 text-indigo-600" />
                  Security Features
                </CardTitle>
                <CardDescription>
                  Advanced security features for regulatory compliance
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="flex items-start gap-3 pb-2 border-b">
                    <Lock className="h-5 w-5 text-indigo-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Data Encryption</h4>
                      <p className="text-sm text-gray-600">
                        {documentData.compliance.security.encryption} encryption for all data at
                        rest and in transit
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pb-2 border-b">
                    <Users className="h-5 w-5 text-indigo-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Authentication</h4>
                      <p className="text-sm text-gray-600">
                        {documentData.compliance.security.authentication} authentication with
                        biometric options
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pb-2 border-b">
                    <FileSignature className="h-5 w-5 text-indigo-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Electronic Signatures</h4>
                      <p className="text-sm text-gray-600">
                        Compliant e-signatures with biometric authentication and unique digital
                        certificates
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pb-2 border-b">
                    <History className="h-5 w-5 text-indigo-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Comprehensive Audit Trails</h4>
                      <p className="text-sm text-gray-600">
                        Tamper-evident audit trails for all document actions with user, timestamp,
                        and IP address
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 pb-2 border-b">
                    <Users className="h-5 w-5 text-indigo-600 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium">Access Control</h4>
                      <p className="text-sm text-gray-600">
                        {documentData.compliance.security.accessControl} with granular permissions
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Case Studies Tab */}
        <TabsContent value="case-studies">
          <div className="grid grid-cols-1 gap-6">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl flex items-center gap-2">
                  <ClipboardCheck className="h-5 w-5 text-indigo-600" />
                  Life Sciences Use Cases
                </CardTitle>
                <CardDescription>
                  How pharmaceutical and biotech companies use DocuShare Enterprise
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  <div className="p-4 rounded-lg border">
                    <h3 className="text-lg font-medium mb-2">Global Pharmaceutical Company</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      A top 10 pharmaceutical company implemented DocuShare Enterprise to manage
                      their global regulatory submission documents across 20+ markets.
                    </p>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <FolderCheck className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">Challenge:</span> Managing 50,000+
                          regulatory documents across multiple regions with varying requirements.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <FolderCheck className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">Solution:</span> Centralized DocuShare vault
                          with region-specific workflows and automatic validation.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <FolderCheck className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">Results:</span> 40% reduction in document
                          processing time and 100% compliance across all regions.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border">
                    <h3 className="text-lg font-medium mb-2">Emerging Biotech Company</h3>
                    <p className="text-sm text-gray-600 mb-3">
                      A clinical-stage biotech company preparing for their first IND submission
                      implemented DocuShare to manage their regulatory documentation.
                    </p>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <FolderCheck className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">Challenge:</span> Limited regulatory
                          experience and resources with tight submission timeline.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <FolderCheck className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">Solution:</span> Preconfigured IND templates
                          and workflows with automated validation checks.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <FolderCheck className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">Results:</span> First-time IND submission
                          accepted without deficiencies, 30% faster preparation.
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="p-4 rounded-lg border">
                    <h3 className="text-lg font-medium mb-2">
                      Contract Research Organization (CRO)
                    </h3>
                    <p className="text-sm text-gray-600 mb-3">
                      A global CRO implemented DocuShare to standardize clinical trial documentation
                      across multiple sponsors and study sites.
                    </p>
                    <div className="mt-2 space-y-2">
                      <div className="flex items-start gap-2">
                        <FolderCheck className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">Challenge:</span> Managing varying document
                          requirements from multiple sponsors with different SOPs.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <FolderCheck className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">Solution:</span> Sponsor-specific workspaces
                          with configurable workflows and approval chains.
                        </div>
                      </div>
                      <div className="flex items-start gap-2">
                        <FolderCheck className="h-4 w-4 text-indigo-600 mt-0.5" />
                        <div className="text-sm">
                          <span className="font-medium">Results:</span> 50% reduction in document
                          queries, 100% compliance with sponsor requirements.
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <div className="flex justify-center">
              <Card className="max-w-2xl w-full">
                <CardHeader className="text-center pb-2">
                  <CardTitle className="text-xl">DocuShare Enterprise Certifications</CardTitle>
                </CardHeader>
                <CardContent className="flex flex-wrap justify-center gap-4 p-6">
                  <Badge className="py-2 px-4 text-sm bg-blue-100 text-blue-800">ISO 27001</Badge>
                  <Badge className="py-2 px-4 text-sm bg-green-100 text-green-800">
                    21 CFR Part 11
                  </Badge>
                  <Badge className="py-2 px-4 text-sm bg-purple-100 text-purple-800">
                    HIPAA Compliant
                  </Badge>
                  <Badge className="py-2 px-4 text-sm bg-orange-100 text-orange-800">
                    GxP Validated
                  </Badge>
                  <Badge className="py-2 px-4 text-sm bg-red-100 text-red-800">SOC 2 Type II</Badge>
                  <Badge className="py-2 px-4 text-sm bg-indigo-100 text-indigo-800">
                    FDA Submission Ready
                  </Badge>
                  <Badge className="py-2 px-4 text-sm bg-teal-100 text-teal-800">
                    EMA Compliant
                  </Badge>
                  <Badge className="py-2 px-4 text-sm bg-yellow-100 text-yellow-800">
                    PMDA Standards
                  </Badge>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <div className="mt-8 p-4 bg-gray-50 rounded-lg border">
        <h3 className="text-lg font-medium mb-2">About DocuShare Enterprise in Life Sciences</h3>
        <p className="text-sm text-gray-600 mb-4">
          DocuShare Enterprise is a comprehensive document management solution designed specifically
          for life sciences and biotechnology companies. It provides 21 CFR Part 11 compliant
          document management with advanced security, electronic signatures, and comprehensive audit
          trails to meet strict regulatory requirements.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex items-start gap-2">
            <ShieldCheck className="h-5 w-5 text-indigo-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium">Regulatory Compliance</h4>
              <p className="text-xs text-gray-600">
                Full 21 CFR Part 11, GxP, HIPAA, EMA, and PMDA compliance for global submissions
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <FileSignature className="h-5 w-5 text-indigo-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium">E-Signatures</h4>
              <p className="text-xs text-gray-600">
                Compliant electronic signatures with biometric, PIN, and certificate options
              </p>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Lock className="h-5 w-5 text-indigo-600 mt-0.5" />
            <div>
              <h4 className="text-sm font-medium">Enterprise Security</h4>
              <p className="text-xs text-gray-600">
                AES-256 encryption, multi-factor authentication, and role-based access controls
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
