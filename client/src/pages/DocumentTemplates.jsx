import React, { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import {
  FileText, Search, Filter, Clock, Plus, Star, Download, PlusCircle, Calendar, FileTerminal, Layers, Share2, CheckCircle, ClipboardList, Loader2, X } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import { Badge } from '../components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../components/ui/dialog';
import { useToast } from '../hooks/use-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

const DocumentTemplates = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedTab, setSelectedTab] = useState('templates');
  const [uploadDialogOpen, setUploadDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [duplicateDialogOpen, setDuplicateDialogOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [moduleField, setModuleField] = useState('');
  const [description, setDescription] = useState('');
  const [templateType, setTemplateType] = useState('custom');
  const [granuleId, setGranuleId] = useState('');
  const [ichGuidance, setIchGuidance] = useState('');
  const [tags, setTags] = useState('');
  const [file, setFile] = useState(null);
  const [duplicateName, setDuplicateName] = useState('');
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();

  // Fetch templates with React Query
  const {
    data: templatesData,
    isLoading: templatesLoading,
    error: templatesError,
  } = useQuery({
    queryKey: [
      '/api/templates',
      {
        category: selectedCategory !== 'all' ? selectedCategory : undefined,
        search: searchQuery || undefined,
      },
    ],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedCategory !== 'all') params.append('category', selectedCategory);
      if (searchQuery) params.append('search', searchQuery);

      const response = await fetch(`/api/templates?${params}`, {
        headers: {
          'x-organization-id': '7', // Use organization 7 which has the templates
        },
      });
      if (!response.ok) throw new Error('Failed to fetch templates');
      return response.json();
    },
  });

  // Fetch recent documents
  const { data: recentData, isLoading: recentLoading } = useQuery({
    queryKey: ['/api/templates/recent/documents'],
    queryFn: async () => {
      const response = await fetch('/api/templates/recent/documents', {
        headers: {
          'x-organization-id': '7',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch recent documents');
      return response.json();
    },
  });

  // Fetch featured templates
  const { data: featuredData, isLoading: featuredLoading } = useQuery({
    queryKey: ['/api/templates/featured/list'],
    queryFn: async () => {
      const response = await fetch('/api/templates/featured/list', {
        headers: {
          'x-organization-id': '7',
        },
      });
      if (!response.ok) throw new Error('Failed to fetch featured templates');
      return response.json();
    },
  });

  const templates = templatesData?.templates || [];
  const recentDocuments = recentData?.documents || [];
  const featuredTemplates = featuredData?.templates || [];

  // Templates are already filtered by the API, so we can use them directly
  const filteredTemplates = templates;

  // Track template usage mutation
  const trackUsageMutation = useMutation({
    mutationFn: async ({ templateId, usageType, documentTitle }) => {
      const response = await fetch(`/api/templates/${templateId}/use`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': '7',
        },
        body: JSON.stringify({ usageType, documentTitle }),
      });
      if (!response.ok) throw new Error('Failed to track template usage');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
    },
  });

  // Create template mutation
  const createTemplateMutation = useMutation({
    mutationFn: async templateData => {
      const response = await fetch('/api/templates', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': '7',
        },
        body: JSON.stringify(templateData),
      });
      if (!response.ok) throw new Error('Failed to create template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setUploadDialogOpen(false);
      resetForm();
      toast({
        title: 'Template created successfully',
        description: 'Your new template is ready to use',
      });
    },
  });

  // Update template mutation
  const updateTemplateMutation = useMutation({
    mutationFn: async ({ templateId, updateData }) => {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': '7',
        },
        body: JSON.stringify(updateData),
      });
      if (!response.ok) throw new Error('Failed to update template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setEditDialogOpen(false);
      resetForm();
      toast({ title: 'Template updated successfully', description: 'Changes have been saved' });
    },
  });

  // Delete template mutation
  const deleteTemplateMutation = useMutation({
    mutationFn: async templateId => {
      const response = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
        headers: { 'x-organization-id': '7' },
      });
      if (!response.ok) throw new Error('Failed to delete template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      toast({ title: 'Template deleted successfully', description: 'Template has been removed' });
    },
  });

  // Duplicate template mutation
  const duplicateTemplateMutation = useMutation({
    mutationFn: async ({ templateId, newName }) => {
      const response = await fetch(`/api/templates/${templateId}/duplicate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': '7',
        },
        body: JSON.stringify({ newName }),
      });
      if (!response.ok) throw new Error('Failed to duplicate template');
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
      setDuplicateDialogOpen(false);
      setDuplicateName('');
      toast({
        title: 'Template duplicated successfully',
        description: 'New template copy created',
      });
    },
  });

  const resetForm = () => {
    setName('');
    setCategory('');
    setModuleField('');
    setDescription('');
    setTemplateType('custom');
    setGranuleId('');
    setIchGuidance('');
    setTags('');
    setFile(null);
    setSelectedTemplate(null);
  };

  const handleCreateFromTemplate = template => {
    // Track template usage
    trackUsageMutation.mutate({
      templateId: template.id,
      usageType: 'create_new',
      documentTitle: `New document from ${template.name}`,
    });

    toast({
      title: 'Creating new document',
      description: 'Opening editor with the selected template...',
    });

    // Navigate to DocumentEditor with template
    setLocation(`/document-editor?template=${template.id}`);
  };

  const handleEditTemplate = template => {
    setSelectedTemplate(template);
    setName(template.name);
    setCategory(template.category);
    setModuleField(template.module);
    setDescription(template.description);
    setTemplateType(template.templateType || 'custom');
    setGranuleId(template.granuleId || '');
    setIchGuidance(template.ichGuidance || '');
    setTags(template.tags ? template.tags.join(', ') : '');
    setEditDialogOpen(true);
  };

  const handleDuplicateTemplate = template => {
    setSelectedTemplate(template);
    setDuplicateName(`${template.name} (Copy)`);
    setDuplicateDialogOpen(true);
  };

  const handleDeleteTemplate = template => {
    if (window.confirm(`Are you sure you want to delete "${template.name}"?`)) {
      deleteTemplateMutation.mutate(template.id);
    }
  };

  const handleCreateTemplate = () => {
    const templateData = {
      name,
      category,
      module: moduleField,
      description,
      templateType,
      granuleId,
      ichGuidance,
      tags,
    };
    createTemplateMutation.mutate(templateData);
  };

  const handleUpdateTemplate = () => {
    const updateData = {
      name,
      category,
      module: moduleField,
      description,
      templateType,
      granuleId,
      ichGuidance,
      tags,
    };
    updateTemplateMutation.mutate({ templateId: selectedTemplate.id, updateData });
  };

  const handleDuplicate = () => {
    duplicateTemplateMutation.mutate({
      templateId: selectedTemplate.id,
      newName: duplicateName,
    });
  };

  // Upload template mutation
  const uploadMutation = useMutation({
    mutationFn: async formData => {
      const response = await fetch('/api/templates/upload', {
        method: 'POST',
        body: formData,
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to upload template');
      }
      return response.json();
    },
    onSuccess: () => {
      toast({
        title: 'Template Uploaded',
        description: 'Your new template has been added to the library',
      });
      setUploadDialogOpen(false);
      setName('');
      setCategory('');
      setModuleField('');
      setDescription('');
      setFile(null);
      queryClient.invalidateQueries({ queryKey: ['/api/templates'] });
    },
    onError: error => {
      toast({
        title: 'Upload Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleUploadTemplate = async () => {
    if (!file) {
      toast({
        title: 'No file selected',
        description: 'Please select a file to upload',
        variant: 'destructive',
      });
      return;
    }

    if (!name || !category) {
      toast({
        title: 'Missing information',
        description: 'Please fill in template name and category',
        variant: 'destructive',
      });
      return;
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('category', category);
    formData.append('module', moduleField);
    formData.append('description', description);
    formData.append('file', file);

    uploadMutation.mutate(formData);
  };

  const handleDownloadTemplate = template => {
    // Track download usage
    trackUsageMutation.mutate({
      templateId: template.id,
      usageType: 'download',
      documentTitle: template.name,
    });

    if (template.fileUrl) {
      // Create download link
      const link = document.createElement('a');
      link.href = template.fileUrl;
      link.download = `${template.name}.${template.fileType || 'docx'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);

      toast({
        title: 'Template Downloaded',
        description: 'Template saved to your downloads',
      });
    } else {
      toast({
        title: 'Download not available',
        description: "This template doesn't have a downloadable file",
        variant: 'destructive',
      });
    }
  };

  return (
    <div className="container mx-auto p-6">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold mb-2">Document Templates</h1>
          <p className="text-gray-600">Regulatory-compliant templates for eCTD submissions</p>
        </div>

        <div className="flex gap-2">
          <Dialog open={uploadDialogOpen} onOpenChange={setUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button
                className="mt-4 md:mt-0 flex items-center"
                data-testid="button-upload-template"
              >
                <PlusCircle className="mr-2 h-4 w-4" /> Upload Template
              </Button>
            </DialogTrigger>

            <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <div className="flex items-center justify-between">
                  <DialogTitle>Upload New Template</DialogTitle>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setUploadDialogOpen(false)}
                    className="h-6 w-6 p-0"
                    data-testid="button-close-upload"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
                <DialogDescription>
                  Upload a new document template to the library. This will be available to all
                  users.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right font-medium">Template Name</label>
                  <Input
                    className="col-span-3"
                    placeholder="Enter template name"
                    value={name}
                    onChange={e => setName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right font-medium">Category</label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="clinical">Clinical</SelectItem>
                      <SelectItem value="nonclinical">Nonclinical</SelectItem>
                      <SelectItem value="quality">Quality</SelectItem>
                      <SelectItem value="administrative">Administrative</SelectItem>
                      <SelectItem value="pharmacovigilance">Pharmacovigilance</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right font-medium">Type</label>
                  <Select value={templateType} onValueChange={setTemplateType}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ich_standard">ICH Standard</SelectItem>
                      <SelectItem value="custom">Custom</SelectItem>
                      <SelectItem value="uploaded">Uploaded</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right font-medium">Granule ID</label>
                  <Input
                    className="col-span-3"
                    placeholder="e.g., 2.3.1"
                    value={granuleId}
                    onChange={e => setGranuleId(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right font-medium">ICH Guidance</label>
                  <Input
                    className="col-span-3"
                    placeholder="ICH guidance reference"
                    value={ichGuidance}
                    onChange={e => setIchGuidance(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right font-medium">Tags</label>
                  <Input
                    className="col-span-3"
                    placeholder="Comma-separated tags"
                    value={tags}
                    onChange={e => setTags(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right font-medium">Module</label>
                  <Input
                    className="col-span-3"
                    placeholder="e.g., Module 2.5"
                    value={moduleField}
                    onChange={e => setModuleField(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right font-medium">Description</label>
                  <Input
                    className="col-span-3"
                    placeholder="Brief description of the template"
                    value={description}
                    onChange={e => setDescription(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <label className="text-right font-medium">File</label>
                  <Input
                    className="col-span-3"
                    type="file"
                    onChange={e => setFile(e.target.files[0])}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setUploadDialogOpen(false)}
                  data-testid="button-cancel-upload"
                >
                  Cancel
                </Button>
                <Button
                  onClick={file ? handleUploadTemplate : handleCreateTemplate}
                  disabled={uploadMutation.isPending || createTemplateMutation.isPending}
                  data-testid="button-submit-upload"
                >
                  {uploadMutation.isPending || createTemplateMutation.isPending ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      {file ? 'Uploading...' : 'Creating...'}
                    </>
                  ) : file ? (
                    'Upload Template'
                  ) : (
                    'Create Template'
                  )}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button
            variant="outline"
            className="mt-4 md:mt-0 flex items-center"
            onClick={() => setUploadDialogOpen(true)}
            data-testid="button-create-template"
          >
            <Plus className="mr-2 h-4 w-4" /> Create New
          </Button>
        </div>
      </div>

      <Tabs value={selectedTab} onValueChange={setSelectedTab} className="mb-6">
        <TabsList>
          <TabsTrigger value="templates">Template Library</TabsTrigger>
          <TabsTrigger value="recent">Recent Documents</TabsTrigger>
          <TabsTrigger value="featured">Featured Templates</TabsTrigger>
        </TabsList>

        <TabsContent value="templates">
          {/* Search and Filter */}
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="Search templates..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={selectedCategory} onValueChange={setSelectedCategory}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Categories</SelectItem>
                <SelectItem value="clinical">Clinical</SelectItem>
                <SelectItem value="nonclinical">Nonclinical</SelectItem>
                <SelectItem value="quality">Quality</SelectItem>
                <SelectItem value="administrative">Administrative</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Templates Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {templatesLoading ? (
              <div className="col-span-full text-center p-8">
                <Loader2 className="mx-auto h-12 w-12 text-gray-400 mb-4 animate-spin" />
                <h3 className="text-xl font-medium mb-2">Loading templates...</h3>
                <p className="text-gray-500">Please wait while we fetch your templates</p>
              </div>
            ) : templatesError ? (
              <div className="col-span-full text-center p-8">
                <FileText className="mx-auto h-12 w-12 text-red-400 mb-4" />
                <h3 className="text-xl font-medium mb-2">Error loading templates</h3>
                <p className="text-gray-500 mb-4">Unable to load templates. Please try again.</p>
                <Button
                  onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/templates'] })}
                >
                  Retry
                </Button>
              </div>
            ) : filteredTemplates.length === 0 ? (
              <div className="col-span-full text-center p-8">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-xl font-medium mb-2">No templates found</h3>
                <p className="text-gray-500 mb-4">Try adjusting your search or filters</p>
                <Button
                  onClick={() => {
                    setSearchQuery('');
                    setSelectedCategory('all');
                  }}
                >
                  Clear Filters
                </Button>
              </div>
            ) : (
              filteredTemplates.map(template => (
                <Card key={template.id} className="flex flex-col h-full">
                  <CardHeader>
                    <div className="flex justify-between items-start">
                      <div>
                        <CardTitle className="text-lg">{template.name || template.title}</CardTitle>
                        <CardDescription>
                          {template.module || ''}
                          {template.version ? ` • Version ${template.version}` : ''}
                        </CardDescription>
                      </div>
                      <Badge variant="outline" className="capitalize">
                        {template.category}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1">
                    <p className="text-sm text-gray-600 mb-4">{template.description}</p>
                    <div className="flex flex-wrap gap-2 mb-4">
                      {(template.tags || []).map((tag, index) => (
                        <Badge key={index} variant="secondary" className="text-xs">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex items-center text-sm text-gray-500">
                      <Clock className="h-4 w-4 mr-1" />
                      <span>
                        Updated{' '}
                        {template.updatedAt
                          ? new Date(template.updatedAt).toLocaleDateString()
                          : 'Unknown'}
                      </span>
                    </div>
                    {template.downloadCount > 0 && (
                      <div className="flex items-center text-sm text-gray-500 mt-1">
                        <Download className="h-4 w-4 mr-1" />
                        <span>Downloaded {template.downloadCount} times</span>
                      </div>
                    )}
                  </CardContent>
                  <CardFooter className="border-t pt-4 space-y-2">
                    <div className="flex justify-between w-full">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center"
                        onClick={() => handleDownloadTemplate(template)}
                        disabled={trackUsageMutation.isPending}
                        data-testid={`button-download-${template.id}`}
                      >
                        {trackUsageMutation.isPending ? (
                          <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                        ) : (
                          <Download className="h-4 w-4 mr-1" />
                        )}
                        Download
                      </Button>
                      <Button
                        size="sm"
                        className="flex items-center"
                        onClick={() => handleCreateFromTemplate(template)}
                        disabled={trackUsageMutation.isPending}
                        data-testid={`button-use-${template.id}`}
                      >
                        <Plus className="h-4 w-4 mr-1" /> Use Template
                      </Button>
                    </div>

                    {/* Management Actions */}
                    <div className="flex justify-between w-full pt-2 border-t">
                      <div className="flex gap-1">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => handleEditTemplate(template)}
                          data-testid={`button-edit-${template.id}`}
                        >
                          Edit
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs"
                          onClick={() => handleDuplicateTemplate(template)}
                          data-testid={`button-duplicate-${template.id}`}
                        >
                          Duplicate
                        </Button>
                      </div>
                      {template.templateType === 'custom' && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 px-2 text-xs text-red-600 hover:text-red-700"
                          onClick={() => handleDeleteTemplate(template)}
                          data-testid={`button-delete-${template.id}`}
                        >
                          Delete
                        </Button>
                      )}
                    </div>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="recent">
          <div className="space-y-4">
            {recentLoading ? (
              <div className="text-center p-8">
                <Loader2 className="mx-auto h-8 w-8 text-gray-400 mb-4 animate-spin" />
                <p className="text-gray-500">Loading recent documents...</p>
              </div>
            ) : recentDocuments.length === 0 ? (
              <div className="text-center p-8">
                <FileText className="mx-auto h-12 w-12 text-gray-400 mb-4" />
                <h3 className="text-xl font-medium mb-2">No recent documents</h3>
                <p className="text-gray-500">
                  You haven't created any documents from templates yet
                </p>
              </div>
            ) : (
              recentDocuments.map(doc => (
                <Card key={doc.id} className="mb-4">
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-start">
                      <div className="flex items-center">
                        <FileText className="h-5 w-5 mr-3 text-blue-600" />
                        <div>
                          <CardTitle className="text-lg">{doc.title}</CardTitle>
                          <CardDescription>
                            Last edited: {new Date(doc.lastEditedAt).toLocaleDateString()}
                          </CardDescription>
                        </div>
                      </div>
                      <Badge
                        className={
                          doc.status === 'Draft'
                            ? 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                            : doc.status === 'In Review'
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-green-100 text-green-800 hover:bg-green-200'
                        }
                      >
                        {doc.status}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardFooter className="pt-2">
                    <div className="flex justify-end w-full space-x-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="flex items-center"
                        onClick={() => setLocation(`/document-editor?file=${doc.id}`)}
                        data-testid={`button-edit-${doc.id}`}
                      >
                        <FileText className="h-4 w-4 mr-1" /> Continue Editing
                      </Button>
                    </div>
                  </CardFooter>
                </Card>
              ))
            )}
          </div>
        </TabsContent>

        <TabsContent value="featured">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <Card className="md:col-span-3 bg-blue-50 border-blue-200">
              <CardHeader>
                <CardTitle className="text-blue-800">Regulatory-Compliant Templates</CardTitle>
                <CardDescription className="text-blue-700">
                  All templates are pre-validated against eCTD submission requirements
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="flex items-start">
                    <div className="bg-blue-100 p-2 rounded-full mr-3">
                      <CheckCircle className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-blue-800">Submission-Ready</h4>
                      <p className="text-sm text-blue-700">
                        All templates follow regional regulatory requirements
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="bg-blue-100 p-2 rounded-full mr-3">
                      <Layers className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-blue-800">Module-Specific</h4>
                      <p className="text-sm text-blue-700">
                        Templates organized by CTD/eCTD module
                      </p>
                    </div>
                  </div>
                  <div className="flex items-start">
                    <div className="bg-blue-100 p-2 rounded-full mr-3">
                      <FileTerminal className="h-5 w-5 text-blue-600" />
                    </div>
                    <div>
                      <h4 className="font-medium text-blue-800">Pre-Validated</h4>
                      <p className="text-sm text-blue-700">
                        Formatting and structure meets agency requirements
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-md">Most Popular Template</CardTitle>
                  <Badge className="bg-amber-100 text-amber-800">
                    <Star className="h-3 w-3 mr-1 fill-amber-500" /> Top Rated
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium text-lg mb-1">NDA Cover Letter Template</h3>
                <p className="text-sm text-gray-600 mb-2">Used 215 times • FDA compliant</p>
                <Button className="w-full mt-2" onClick={() => handleCreateFromTemplate(3)}>
                  Use Template
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-md">Recently Updated</CardTitle>
                  <Badge className="bg-green-100 text-green-800">
                    <Calendar className="h-3 w-3 mr-1" /> New
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium text-lg mb-1">Clinical Overview Template</h3>
                <p className="text-sm text-gray-600 mb-2">Updated May 5, 2025 • Version 2.3</p>
                <Button className="w-full mt-2" onClick={() => handleCreateFromTemplate(1)}>
                  Use Template
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <CardTitle className="text-md">Most Comprehensive</CardTitle>
                  <Badge className="bg-blue-100 text-blue-800">
                    <Share2 className="h-3 w-3 mr-1" /> Multi-Region
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <h3 className="font-medium text-lg mb-1">Module 3 Quality Template</h3>
                <p className="text-sm text-gray-600 mb-2">FDA, EMA & Health Canada compliant</p>
                <Button className="w-full mt-2" onClick={() => handleCreateFromTemplate(2)}>
                  Use Template
                </Button>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Edit Template Dialog */}
      <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
        <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Edit Template</DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setEditDialogOpen(false)}
                className="h-6 w-6 p-0"
                data-testid="button-close-edit"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogDescription>Update template information and properties.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">Template Name</label>
              <Input
                className="col-span-3"
                placeholder="Enter template name"
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">Category</label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="clinical">Clinical</SelectItem>
                  <SelectItem value="nonclinical">Nonclinical</SelectItem>
                  <SelectItem value="quality">Quality</SelectItem>
                  <SelectItem value="administrative">Administrative</SelectItem>
                  <SelectItem value="pharmacovigilance">Pharmacovigilance</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">Module</label>
              <Input
                className="col-span-3"
                placeholder="e.g., Module 2.5"
                value={moduleField}
                onChange={e => setModuleField(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">Description</label>
              <Input
                className="col-span-3"
                placeholder="Brief description of the template"
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">Type</label>
              <Select value={templateType} onValueChange={setTemplateType}>
                <SelectTrigger className="col-span-3">
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ich_standard">ICH Standard</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value="uploaded">Uploaded</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">Granule ID</label>
              <Input
                className="col-span-3"
                placeholder="e.g., 2.3.1"
                value={granuleId}
                onChange={e => setGranuleId(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">ICH Guidance</label>
              <Input
                className="col-span-3"
                placeholder="ICH guidance reference"
                value={ichGuidance}
                onChange={e => setIchGuidance(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">Tags</label>
              <Input
                className="col-span-3"
                placeholder="Comma-separated tags"
                value={tags}
                onChange={e => setTags(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setEditDialogOpen(false);
                resetForm();
              }}
              data-testid="button-cancel-edit"
            >
              Cancel
            </Button>
            <Button
              onClick={handleUpdateTemplate}
              disabled={updateTemplateMutation.isPending}
              data-testid="button-submit-edit"
            >
              {updateTemplateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Updating...
                </>
              ) : (
                'Update Template'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Duplicate Template Dialog */}
      <Dialog open={duplicateDialogOpen} onOpenChange={setDuplicateDialogOpen}>
        <DialogContent className="w-[95vw] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <div className="flex items-center justify-between">
              <DialogTitle>Duplicate Template</DialogTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setDuplicateDialogOpen(false)}
                className="h-6 w-6 p-0"
                data-testid="button-close-duplicate"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <DialogDescription>
              Create a copy of the selected template with a new name.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">Original Template</label>
              <div className="col-span-3 p-2 bg-gray-50 rounded border">
                {selectedTemplate?.name}
              </div>
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <label className="text-right font-medium">New Template Name</label>
              <Input
                className="col-span-3"
                placeholder="Enter new template name"
                value={duplicateName}
                onChange={e => setDuplicateName(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                setDuplicateDialogOpen(false);
                setDuplicateName('');
              }}
              data-testid="button-cancel-duplicate"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDuplicate}
              disabled={duplicateTemplateMutation.isPending || !duplicateName.trim()}
              data-testid="button-submit-duplicate"
            >
              {duplicateTemplateMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Duplicating...
                </>
              ) : (
                'Create Duplicate'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default DocumentTemplates;
