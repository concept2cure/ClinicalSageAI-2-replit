import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  FileText,
  Upload,
  Download,
  Eye,
  Edit,
  Share,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Folder,
  Search,
  Filter,
  Plus,
  Archive,
  FileCheck,
  FileX,
  Calendar,
  User,
  Tag,
  BookOpen,
  Microscope,
  FlaskConical,
  BarChart3,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export function CMCDocumentManager() {
  const [activeTab, setActiveTab] = useState('library');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const { toast } = useToast();

  // Sample CMC documents
  const documents = [
    {
      id: 1,
      name: 'Drug Substance Characterization Report',
      category: 'drug-substance',
      type: 'report',
      status: 'approved',
      version: '2.1',
      author: 'Dr. Sarah Chen',
      lastModified: '2025-08-10',
      size: '2.4 MB',
      description: 'Comprehensive characterization of the active pharmaceutical ingredient',
      tags: ['API', 'Characterization', 'ICH Q6A'],
      compliance: ['ICH Q6A', 'USP'],
      reviewStatus: 'completed',
      nextReview: '2025-11-10',
    },
    {
      id: 2,
      name: 'Analytical Method Validation Protocol',
      category: 'analytical',
      type: 'protocol',
      status: 'in-review',
      version: '1.3',
      author: 'Dr. Mike Johnson',
      lastModified: '2025-08-09',
      size: '1.8 MB',
      description: 'HPLC method validation for assay and related substances',
      tags: ['HPLC', 'Validation', 'ICH Q2'],
      compliance: ['ICH Q2(R1)', 'USP General Chapters'],
      reviewStatus: 'pending',
      nextReview: '2025-08-15',
    },
    {
      id: 3,
      name: 'Stability Study Protocol',
      category: 'stability',
      type: 'protocol',
      status: 'draft',
      version: '1.0',
      author: 'Dr. Lisa Wong',
      lastModified: '2025-08-08',
      size: '1.2 MB',
      description: 'Long-term stability study design for drug product',
      tags: ['Stability', 'ICH Q1A', 'Storage'],
      compliance: ['ICH Q1A(R2)', 'ICH Q1E'],
      reviewStatus: 'draft',
      nextReview: '2025-08-20',
    },
    {
      id: 4,
      name: 'Manufacturing Process Description',
      category: 'manufacturing',
      type: 'procedure',
      status: 'approved',
      version: '3.0',
      author: 'Dr. David Park',
      lastModified: '2025-08-07',
      size: '3.1 MB',
      description: 'Detailed manufacturing process for drug product',
      tags: ['Manufacturing', 'Process', 'QbD'],
      compliance: ['ICH Q8', 'ICH Q11'],
      reviewStatus: 'completed',
      nextReview: '2025-12-07',
    },
    {
      id: 5,
      name: 'Quality Control Specifications',
      category: 'quality-control',
      type: 'specification',
      status: 'approved',
      version: '2.0',
      author: 'Dr. Emily Rodriguez',
      lastModified: '2025-08-06',
      size: '0.9 MB',
      description: 'Release and shelf-life specifications for drug product',
      tags: ['QC', 'Specifications', 'Release'],
      compliance: ['ICH Q6A', 'ICH Q6B'],
      reviewStatus: 'completed',
      nextReview: '2025-10-06',
    },
    {
      id: 6,
      name: 'Container Closure Qualification',
      category: 'packaging',
      type: 'study',
      status: 'in-progress',
      version: '1.1',
      author: 'Dr. Robert Kim',
      lastModified: '2025-08-05',
      size: '2.7 MB',
      description: 'Container closure system qualification study',
      tags: ['Packaging', 'Container', 'Extractables'],
      compliance: ['USP <1664>', 'USP <1663>'],
      reviewStatus: 'ongoing',
      nextReview: '2025-09-05',
    },
  ];

  const categories = [
    { value: 'all', label: 'All Categories', icon: <Folder className="h-4 w-4" /> },
    {
      value: 'drug-substance',
      label: 'Drug Substance',
      icon: <FlaskConical className="h-4 w-4" />,
    },
    { value: 'analytical', label: 'Analytical', icon: <Microscope className="h-4 w-4" /> },
    { value: 'stability', label: 'Stability', icon: <BarChart3 className="h-4 w-4" /> },
    { value: 'manufacturing', label: 'Manufacturing', icon: <FileText className="h-4 w-4" /> },
    { value: 'quality-control', label: 'Quality Control', icon: <FileCheck className="h-4 w-4" /> },
    { value: 'packaging', label: 'Packaging', icon: <Archive className="h-4 w-4" /> },
  ];

  const statuses = [
    { value: 'all', label: 'All Statuses' },
    { value: 'draft', label: 'Draft' },
    { value: 'in-review', label: 'In Review' },
    { value: 'in-progress', label: 'In Progress' },
    { value: 'approved', label: 'Approved' },
  ];

  // Filter documents based on search and filters
  const filteredDocuments = documents.filter(doc => {
    const matchesSearch =
      doc.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
      doc.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || doc.category === selectedCategory;
    const matchesStatus = selectedStatus === 'all' || doc.status === selectedStatus;

    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusColor = status => {
    switch (status) {
      case 'approved':
        return 'bg-green-100 text-green-800';
      case 'in-review':
        return 'bg-yellow-100 text-yellow-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'draft':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = status => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="h-4 w-4" />;
      case 'in-review':
        return <Clock className="h-4 w-4" />;
      case 'in-progress':
        return <Edit className="h-4 w-4" />;
      case 'draft':
        return <FileX className="h-4 w-4" />;
      default:
        return <FileText className="h-4 w-4" />;
    }
  };

  const getCategoryIcon = category => {
    switch (category) {
      case 'drug-substance':
        return <FlaskConical className="h-4 w-4" />;
      case 'analytical':
        return <Microscope className="h-4 w-4" />;
      case 'stability':
        return <BarChart3 className="h-4 w-4" />;
      case 'manufacturing':
        return <FileText className="h-4 w-4" />;
      case 'quality-control':
        return <FileCheck className="h-4 w-4" />;
      case 'packaging':
        return <Archive className="h-4 w-4" />;
      default:
        return <Folder className="h-4 w-4" />;
    }
  };

  const handleDocumentAction = (action, doc) => {
    toast({
      title: `${action} Document`,
      description: `${action} action for ${doc.name}`,
    });
  };

  return (
    <div className="space-y-6">
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="library">Document Library</TabsTrigger>
          <TabsTrigger value="templates">Templates</TabsTrigger>
          <TabsTrigger value="compliance">Compliance Tracker</TabsTrigger>
          <TabsTrigger value="workflow">Review Workflow</TabsTrigger>
        </TabsList>

        {/* Document Library Tab */}
        <TabsContent value="library" className="space-y-6">
          {/* Search and Filters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                CMC Document Library
              </CardTitle>
              <CardDescription>
                Centralized repository for all Chemistry, Manufacturing, and Controls documentation
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-col md:flex-row gap-4 mb-6">
                <div className="flex-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                    <Input
                      placeholder="Search documents, descriptions, or tags..."
                      value={searchTerm}
                      onChange={e => setSearchTerm(e.target.value)}
                      className="pl-10"
                    />
                  </div>
                </div>

                <Select value={selectedCategory} onValueChange={setSelectedCategory}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map(category => (
                      <SelectItem key={category.value} value={category.value}>
                        <div className="flex items-center gap-2">
                          {category.icon}
                          {category.label}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={selectedStatus} onValueChange={setSelectedStatus}>
                  <SelectTrigger className="w-32">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {statuses.map(status => (
                      <SelectItem key={status.value} value={status.value}>
                        {status.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Button>
                  <Plus className="h-4 w-4 mr-2" />
                  Upload
                </Button>
              </div>

              {/* Document Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredDocuments.map(doc => (
                  <Card key={doc.id} className="hover:shadow-md transition-shadow">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-2">
                          {getCategoryIcon(doc.category)}
                          <Badge variant="outline" className={getStatusColor(doc.status)}>
                            {getStatusIcon(doc.status)}
                            <span className="ml-1">{doc.status}</span>
                          </Badge>
                        </div>
                        <span className="text-xs text-muted-foreground">v{doc.version}</span>
                      </div>
                      <CardTitle className="text-sm leading-tight">{doc.name}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <p className="text-xs text-muted-foreground line-clamp-2">
                        {doc.description}
                      </p>

                      <div className="flex flex-wrap gap-1">
                        {doc.tags.slice(0, 3).map((tag, index) => (
                          <Badge key={index} variant="secondary" className="text-xs">
                            {tag}
                          </Badge>
                        ))}
                        {doc.tags.length > 3 && (
                          <Badge variant="secondary" className="text-xs">
                            +{doc.tags.length - 3}
                          </Badge>
                        )}
                      </div>

                      <div className="space-y-2 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {doc.author}
                        </div>
                        <div className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {doc.lastModified}
                        </div>
                        <div className="flex items-center gap-1">
                          <FileText className="h-3 w-3" />
                          {doc.size}
                        </div>
                      </div>

                      <div className="flex gap-2 pt-2">
                        <Button
                          size="sm"
                          variant="outline"
                          className="flex-1"
                          onClick={() => handleDocumentAction('View', doc)}
                        >
                          <Eye className="h-3 w-3 mr-1" />
                          View
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDocumentAction('Edit', doc)}
                        >
                          <Edit className="h-3 w-3" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDocumentAction('Download', doc)}
                        >
                          <Download className="h-3 w-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>

              {filteredDocuments.length === 0 && (
                <div className="text-center py-12">
                  <FileText className="h-12 w-12 mx-auto text-gray-300 mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No documents found</h3>
                  <p className="text-gray-500">Try adjusting your search terms or filters</p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Templates Tab */}
        <TabsContent value="templates" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>CMC Document Templates</CardTitle>
              <CardDescription>Standardized templates for common CMC documentation</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { name: 'Analytical Method Validation Protocol', category: 'Analytical' },
                  { name: 'Stability Study Protocol', category: 'Stability' },
                  { name: 'Manufacturing Process Description', category: 'Manufacturing' },
                  { name: 'Quality Control Specification', category: 'QC' },
                  { name: 'Drug Substance Characterization', category: 'Drug Substance' },
                  { name: 'Container Closure Qualification', category: 'Packaging' },
                ].map((template, index) => (
                  <Card key={index} className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-sm">{template.name}</CardTitle>
                      <Badge variant="outline" className="w-fit">
                        {template.category}
                      </Badge>
                    </CardHeader>
                    <CardContent>
                      <Button className="w-full" size="sm">
                        <Plus className="h-4 w-4 mr-2" />
                        Use Template
                      </Button>
                    </CardContent>
                  </Card>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Compliance Tracker Tab */}
        <TabsContent value="compliance" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Regulatory Compliance Tracker</CardTitle>
              <CardDescription>
                Monitor compliance with ICH guidelines and regulatory requirements
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {[
                  {
                    guideline: 'ICH Q2(R1)',
                    description: 'Validation of Analytical Procedures',
                    compliance: 85,
                  },
                  {
                    guideline: 'ICH Q1A(R2)',
                    description: 'Stability Testing Guidelines',
                    compliance: 92,
                  },
                  {
                    guideline: 'ICH Q6A',
                    description: 'Specifications for Drug Substances',
                    compliance: 78,
                  },
                  {
                    guideline: 'ICH Q8',
                    description: 'Pharmaceutical Development',
                    compliance: 65,
                  },
                  {
                    guideline: 'ICH Q11',
                    description: 'Development of Drug Substances',
                    compliance: 88,
                  },
                ].map((item, index) => (
                  <div key={index} className="p-4 border rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <div>
                        <h4 className="font-medium">{item.guideline}</h4>
                        <p className="text-sm text-muted-foreground">{item.description}</p>
                      </div>
                      <Badge variant={item.compliance >= 80 ? 'default' : 'secondary'}>
                        {item.compliance}%
                      </Badge>
                    </div>
                    <Progress value={item.compliance} className="h-2" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Review Workflow Tab */}
        <TabsContent value="workflow" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Document Review Workflow</CardTitle>
              <CardDescription>Track document review status and approval workflow</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {documents
                  .filter(doc => doc.status !== 'approved')
                  .map(doc => (
                    <div key={doc.id} className="p-4 border rounded-lg">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <h4 className="font-medium">{doc.name}</h4>
                          <p className="text-sm text-muted-foreground">
                            Version {doc.version} • {doc.author}
                          </p>
                        </div>
                        <Badge className={getStatusColor(doc.status)}>{doc.status}</Badge>
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">
                          Next review: {doc.nextReview}
                        </span>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline">
                            <Eye className="h-4 w-4 mr-1" />
                            Review
                          </Button>
                          <Button size="sm">
                            <CheckCircle2 className="h-4 w-4 mr-1" />
                            Approve
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default CMCDocumentManager;
