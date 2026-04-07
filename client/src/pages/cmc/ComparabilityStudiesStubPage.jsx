import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  BarChart,
  Calendar,
  ArrowRight,
  FileText,
  CheckCircle2,
  AlertTriangle,
  FileBarChart,
  ClipboardList,
  Beaker,
  Loader2,
  AlertCircle,
  Plus,
} from 'lucide-react';

const API_URL = '/api/cmc/comparability-studies';

/**
 * Comparability Studies Page
 *
 * Displays comparability studies fetched from the API with CRUD support.
 * Includes status tracking, tab filtering, and study creation.
 */
const ComparabilityStudiesPage = () => {
  const [activeTab, setActiveTab] = useState('active');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStudy, setEditingStudy] = useState(null);
  const [formData, setFormData] = useState({
    title: '',
    product: '',
    type: '',
    status: 'planned',
    startDate: '',
    methods: '',
  });

  const queryClient = useQueryClient();
  const { toast } = useToast();

  // Fetch comparability studies from API
  const {
    data: apiResponse,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: [API_URL],
  });

  const studies = apiResponse?.data ?? [];

  // Create study mutation
  const createMutation = useMutation({
    mutationFn: async (newStudy) => {
      const res = await apiRequest('POST', API_URL, newStudy);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_URL] });
      toast({ title: 'Study created', description: 'Comparability study has been created.' });
      closeDialog();
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Update study mutation
  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      const res = await apiRequest('PUT', `${API_URL}/${id}`, data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [API_URL] });
      toast({ title: 'Study updated', description: 'Comparability study has been updated.' });
      closeDialog();
    },
    onError: (err) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Dialog helpers
  const openCreateDialog = () => {
    setEditingStudy(null);
    setFormData({
      title: '',
      product: '',
      type: '',
      status: 'planned',
      startDate: '',
      methods: '',
    });
    setDialogOpen(true);
  };

  const openEditDialog = (study) => {
    setEditingStudy(study);
    setFormData({
      title: study.title || '',
      product: study.product || '',
      type: study.type || '',
      status: study.status || 'planned',
      startDate: study.startDate || '',
      methods: Array.isArray(study.methods) ? study.methods.join(', ') : study.methods || '',
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingStudy(null);
  };

  const handleSubmit = () => {
    const payload = {
      ...formData,
      methods: formData.methods
        ? formData.methods.split(',').map((m) => m.trim()).filter(Boolean)
        : [],
    };
    if (editingStudy) {
      updateMutation.mutate({ id: editingStudy.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // Filter studies based on active tab
  const filteredStudies = studies.filter((study) => {
    if (activeTab === 'active') {
      return study.status === 'in_progress' || study.status === 'planned';
    } else if (activeTab === 'completed') {
      return study.status === 'completed';
    }
    return true; // all tab
  });

  // Get counts for dashboard
  const plannedCount = studies.filter((s) => s.status === 'planned').length;
  const inProgressCount = studies.filter((s) => s.status === 'in_progress').length;
  const completedCount = studies.filter((s) => s.status === 'completed').length;
  const comparableCount = studies.filter((s) => s.outcome === 'comparable').length;
  const notComparableCount = studies.filter((s) => s.outcome === 'not_comparable').length;

  // Get status badge with appropriate styling
  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
          </Badge>
        );
      case 'in_progress':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <Beaker className="h-3 w-3 mr-1" /> In Progress
          </Badge>
        );
      case 'planned':
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            <Calendar className="h-3 w-3 mr-1" /> Planned
          </Badge>
        );
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  // Get outcome badge with appropriate styling
  const getOutcomeBadge = (outcome) => {
    if (!outcome) return null;

    switch (outcome) {
      case 'comparable':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Comparable
          </Badge>
        );
      case 'not_comparable':
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <AlertTriangle className="h-3 w-3 mr-1" /> Not Comparable
          </Badge>
        );
      default:
        return <Badge variant="outline">{outcome}</Badge>;
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="comparability-studies-page p-6 flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <Loader2 className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-muted-foreground">Loading comparability studies...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (isError) {
    return (
      <div className="comparability-studies-page p-6">
        <Card className="p-8 text-center">
          <AlertCircle className="h-8 w-8 mx-auto mb-4 text-red-500" />
          <p className="text-red-600 font-medium mb-2">Failed to load comparability studies</p>
          <p className="text-muted-foreground text-sm mb-4">{error?.message}</p>
          <Button
            variant="outline"
            onClick={() => queryClient.invalidateQueries({ queryKey: [API_URL] })}
          >
            Retry
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="comparability-studies-page p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Comparability Studies</h1>
          <p className="text-muted-foreground">
            Track and manage product comparability assessments
          </p>
        </div>
        <Button className="flex items-center" onClick={openCreateDialog}>
          <FileBarChart className="h-4 w-4 mr-2" />
          New Comparability Study
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Studies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{studies.length}</div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Planned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{plannedCount}</div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">In Progress</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{inProgressCount}</div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Comparable</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{comparableCount}</div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Not Comparable
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-red-600">{notComparableCount}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle>Comparability Studies</CardTitle>
        </CardHeader>
        <CardContent>
          <Tabs
            defaultValue="active"
            value={activeTab}
            onValueChange={setActiveTab}
            className="mb-4"
          >
            <TabsList>
              <TabsTrigger value="active">Active Studies</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
              <TabsTrigger value="all">All Studies</TabsTrigger>
            </TabsList>
          </Tabs>

          {filteredStudies.length === 0 ? (
            <div className="text-center py-12">
              <FileBarChart className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <p className="text-muted-foreground font-medium mb-1">
                No {activeTab === 'active' ? 'active' : activeTab === 'completed' ? 'completed' : ''} comparability studies found
              </p>
              <p className="text-muted-foreground text-sm mb-4">
                {studies.length === 0
                  ? 'Get started by creating your first comparability study.'
                  : 'Try switching tabs to see other studies.'}
              </p>
              {studies.length === 0 && (
                <Button onClick={openCreateDialog}>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Study
                </Button>
              )}
            </div>
          ) : (
            <Table>
              <TableCaption>
                List of{' '}
                {activeTab === 'active' ? 'active' : activeTab === 'completed' ? 'completed' : 'all'}{' '}
                comparability studies
              </TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Start Date</TableHead>
                  <TableHead>End Date</TableHead>
                  <TableHead>Outcome</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredStudies.map((study) => (
                  <TableRow key={study.id}>
                    <TableCell className="font-medium">{study.id}</TableCell>
                    <TableCell>{study.title}</TableCell>
                    <TableCell>{study.product}</TableCell>
                    <TableCell>{study.type}</TableCell>
                    <TableCell>{getStatusBadge(study.status)}</TableCell>
                    <TableCell>{study.startDate || '-'}</TableCell>
                    <TableCell>{study.endDate || '-'}</TableCell>
                    <TableCell>{getOutcomeBadge(study.outcome) || '-'}</TableCell>
                    <TableCell>{study.owner || '-'}</TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="flex items-center"
                        onClick={() => openEditDialog(study)}
                      >
                        <FileText className="h-4 w-4 mr-1" />
                        View
                        <ArrowRight className="h-3 w-3 ml-1" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
        <Card>
          <CardHeader>
            <CardTitle>Recent Protocol Templates</CardTitle>
            <CardDescription>
              Pre-configured study protocols for common comparability assessments
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {[
                'API Manufacturing Process Change Protocol',
                'Site Transfer Comparability Protocol',
                'Raw Material Supplier Change Protocol',
              ].map((template) => (
                <li
                  key={template}
                  className="p-3 border rounded-md flex justify-between items-center hover:bg-gray-50 cursor-pointer"
                >
                  <div className="flex items-center">
                    <ClipboardList className="h-5 w-5 mr-3 text-blue-600" />
                    <span>{template}</span>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFormData({
                        title: template.replace(' Protocol', ' Study'),
                        product: '',
                        type: template.includes('Site Transfer')
                          ? 'Site Transfer'
                          : template.includes('Supplier')
                            ? 'Supplier Change'
                            : 'Process Change',
                        status: 'planned',
                        startDate: new Date().toISOString().split('T')[0],
                        methods: '',
                      });
                      setEditingStudy(null);
                      setDialogOpen(true);
                    }}
                  >
                    Use Template
                  </Button>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Regulatory Submission Status</CardTitle>
            <CardDescription>
              Track which comparability reports have been submitted to regulatory agencies
            </CardDescription>
          </CardHeader>
          <CardContent>
            {studies.filter((s) => s.status === 'completed').length === 0 ? (
              <p className="text-muted-foreground text-center py-6 text-sm">
                No completed studies to show submission status for.
              </p>
            ) : (
              <ul className="space-y-2">
                {studies
                  .filter((s) => s.status === 'completed')
                  .slice(0, 3)
                  .map((study) => (
                    <li
                      key={study.id}
                      className="p-3 border rounded-md flex justify-between items-center hover:bg-gray-50"
                    >
                      <div className="flex items-center">
                        <span className="font-medium mr-2">{study.id}:</span>
                        {getOutcomeBadge(study.outcome) || (
                          <Badge variant="outline">Pending Review</Badge>
                        )}
                      </div>
                      <span className="text-sm text-muted-foreground">
                        Completed {study.endDate || 'N/A'}
                      </span>
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingStudy ? 'Edit Comparability Study' : 'New Comparability Study'}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">Study Title</Label>
              <Input
                id="title"
                value={formData.title}
                onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                placeholder="e.g. API Manufacturing Process Change Assessment"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="product">Product</Label>
              <Input
                id="product"
                value={formData.product}
                onChange={(e) => setFormData({ ...formData, product: e.target.value })}
                placeholder="e.g. Neuromax"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="type">Study Type</Label>
              <Input
                id="type"
                value={formData.type}
                onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                placeholder="e.g. Process Change, Site Transfer, Scale-Up"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="startDate">Start Date</Label>
              <Input
                id="startDate"
                type="date"
                value={formData.startDate}
                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="methods">Analytical Methods (comma-separated)</Label>
              <Input
                id="methods"
                value={formData.methods}
                onChange={(e) => setFormData({ ...formData, methods: e.target.value })}
                placeholder="e.g. HPLC, DSC, FTIR, Particle Size"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingStudy ? 'Save Changes' : 'Create Study'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

// Keep the export name matching the filename so lazy imports work
export default ComparabilityStudiesPage;
