import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '../ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../ui/table';
import {
  Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue, } from '../ui/select';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, } from '../ui/dialog';
import {
  Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage, } from '../ui/form';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger, } from '../ui/alert-dialog';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Checkbox } from '../ui/checkbox';
import { useToast } from '../../hooks/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Textarea } from '../ui/textarea';
import LoadingSpinner from '../common/LoadingSpinner';
import { useTenant } from '../../contexts/TenantContext';
import { Badge } from '../ui/badge';
import {
  Activity, AlertCircle, AlertTriangle, CheckCircle, Filter, Info, Plus, RefreshCw, Settings, ShieldAlert, ShieldCheck, Trash2 } from 'lucide-react'
import { apiRequest } from '../../lib/queryClient';

// CTQ Factor schema
const ctqFactorSchema = z.object({
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(100, 'Name must be less than 100 characters'),
  description: z.string().optional(),
  category: z.enum(['safety', 'effectiveness', 'performance', 'clinical', 'regulatory', 'other']),
  appliesTo: z.enum(['all', 'device', 'medicinal', 'combination']).default('all'),
  sectionCode: z.string().min(1, 'Section code is required'),
  riskLevel: z.enum(['low', 'medium', 'high']),
  validationRule: z.string().optional(),
  active: z.boolean().default(true),
  required: z.boolean().default(false),
});

// Section Gating schema
const sectionGatingSchema = z.object({
  sectionCode: z
    .string()
    .min(3, 'Section code must be at least 3 characters')
    .max(100, 'Section code must be less than 100 characters'),
  name: z
    .string()
    .min(3, 'Name must be at least 3 characters')
    .max(255, 'Name must be less than 255 characters'),
  description: z.string().optional(),
  ctqFactors: z.array(z.number()).default([]),
  requiredCtqFactors: z.array(z.number()).default([]),
  warningCtqFactors: z.array(z.number()).default([]),
  informationalCtqFactors: z.array(z.number()).default([]),
  overridePolicy: z
    .enum(['none', 'admin-only', 'manager-approval', 'document-reason'])
    .default('none'),
  active: z.boolean().default(true),
});

// Section validation schema
const sectionValidationSchema = z.object({
  sectionCode: z.string().min(1, 'Section code is required'),
  satisfiedFactors: z.array(z.number()).default([]),
  content: z.string().optional(),
  projectId: z.number().optional(),
  documentId: z.number().optional(),
});

const QmpSectionGatingPanel = ({ projectId }) => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { currentTenant: tenant } = useTenant();
  const tenantId = tenant?.id || 1; // Fallback to default tenant if context not available

  const [activeTab, setActiveTab] = useState('factors');
  const [showFactorDialog, setShowFactorDialog] = useState(false);
  const [showGatingDialog, setShowGatingDialog] = useState(false);
  const [showValidationDialog, setShowValidationDialog] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [selectedSectionCode, setSelectedSectionCode] = useState('');
  const [selectedFactors, setSelectedFactors] = useState([]);

  // Define available section codes based on the CtQ mapping from console logs
  const availableSections = {
    'benefit-risk': 'Benefit-Risk Analysis',
    safety: 'Safety Analysis',
    'clinical-background': 'Clinical Background',
    'device-description': 'Device Description',
    'state-of-art': 'State of the Art Review',
    equivalence: 'Equivalence Assessment',
    'literature-analysis': 'Literature Review',
    'pms-data': 'Post-Market Surveillance',
    conclusion: 'Conclusion',
  };

  // Form for CTQ factors
  const factorForm = useForm({
    resolver: zodResolver(ctqFactorSchema),
    defaultValues: {
      name: '',
      description: '',
      category: 'safety',
      appliesTo: 'all',
      sectionCode: Object.keys(availableSections)[0],
      riskLevel: 'medium',
      validationRule: '',
      active: true,
      required: false,
    },
  });

  // Form for Section Gating rules
  const gatingForm = useForm({
    resolver: zodResolver(sectionGatingSchema),
    defaultValues: {
      sectionCode: Object.keys(availableSections)[0],
      name: availableSections[Object.keys(availableSections)[0]],
      description: '',
      ctqFactors: [],
      requiredCtqFactors: [],
      warningCtqFactors: [],
      informationalCtqFactors: [],
      overridePolicy: 'none',
      active: true,
    },
  });

  // Form for Section Validation
  const validationForm = useForm({
    resolver: zodResolver(sectionValidationSchema),
    defaultValues: {
      sectionCode: Object.keys(availableSections)[0],
      satisfiedFactors: [],
      content: '',
      projectId: projectId,
    },
  });

  // Query for fetching CTQ factors
  const {
    data: ctqFactors,
    isLoading: isLoadingFactors,
    isError: isErrorFactors,
  } = useQuery({
    queryKey: [`/api/tenant-ctq-factors/${tenantId}/ctq-factors`],
    queryFn: () => apiRequest.get(`/api/tenant-ctq-factors/${tenantId}/ctq-factors`),
  });

  // Query for fetching Section Gating rules
  const {
    data: gatingRules,
    isLoading: isLoadingGating,
    isError: isErrorGating,
  } = useQuery({
    queryKey: [`/api/tenant-section-gating/${tenantId}/section-gating`],
    queryFn: () => apiRequest.get(`/api/tenant-section-gating/${tenantId}/section-gating`),
  });

  // Query for fetching validation statistics if project ID is available
  const {
    data: validationStats,
    isLoading: isLoadingStats,
    isError: isErrorStats,
  } = useQuery({
    queryKey: [`/api/tenant-section-gating/${tenantId}/section-gating/project/${projectId}/stats`],
    queryFn: () =>
      projectId
        ? apiRequest.get(
            `/api/tenant-section-gating/${tenantId}/section-gating/project/${projectId}/stats`
          )
        : null,
    enabled: !!projectId,
  });

  // Mutation for creating a CTQ factor
  const createFactor = useMutation({
    mutationFn: data => apiRequest.post(`/api/tenant-ctq-factors/${tenantId}/ctq-factors`, data),
    onSuccess: () => {
      toast({
        title: 'CTQ Factor Created',
        description: 'The factor has been created successfully.',
        variant: 'default',
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/tenant-ctq-factors/${tenantId}/ctq-factors`],
      });
      setShowFactorDialog(false);
      factorForm.reset();
    },
    onError: error => {
      toast({
        title: 'Error Creating Factor',
        description: error.message || 'An error occurred while creating the factor.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for updating a CTQ factor
  const updateFactor = useMutation({
    mutationFn: data =>
      apiRequest.patch(`/api/tenant-ctq-factors/${tenantId}/ctq-factors/${data.id}`, data),
    onSuccess: () => {
      toast({
        title: 'CTQ Factor Updated',
        description: 'The factor has been updated successfully.',
        variant: 'default',
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/tenant-ctq-factors/${tenantId}/ctq-factors`],
      });
      setShowFactorDialog(false);
      setEditingItem(null);
      factorForm.reset();
    },
    onError: error => {
      toast({
        title: 'Error Updating Factor',
        description: error.message || 'An error occurred while updating the factor.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for deleting a CTQ factor
  const deleteFactor = useMutation({
    mutationFn: id => apiRequest.delete(`/api/tenant-ctq-factors/${tenantId}/ctq-factors/${id}`),
    onSuccess: () => {
      toast({
        title: 'CTQ Factor Deleted',
        description: 'The factor has been deleted successfully.',
        variant: 'default',
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/tenant-ctq-factors/${tenantId}/ctq-factors`],
      });
    },
    onError: error => {
      toast({
        title: 'Error Deleting Factor',
        description: error.message || 'An error occurred while deleting the factor.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for creating a Section Gating rule
  const createGatingRule = useMutation({
    mutationFn: data =>
      apiRequest.post(`/api/tenant-section-gating/${tenantId}/section-gating`, data),
    onSuccess: () => {
      toast({
        title: 'Section Gating Rule Created',
        description: 'The rule has been created successfully.',
        variant: 'default',
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/tenant-section-gating/${tenantId}/section-gating`],
      });
      setShowGatingDialog(false);
      gatingForm.reset();
    },
    onError: error => {
      toast({
        title: 'Error Creating Rule',
        description: error.message || 'An error occurred while creating the rule.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for updating a Section Gating rule
  const updateGatingRule = useMutation({
    mutationFn: data =>
      apiRequest.patch(`/api/tenant-section-gating/${tenantId}/section-gating/${data.id}`, data),
    onSuccess: () => {
      toast({
        title: 'Section Gating Rule Updated',
        description: 'The rule has been updated successfully.',
        variant: 'default',
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/tenant-section-gating/${tenantId}/section-gating`],
      });
      setShowGatingDialog(false);
      setEditingItem(null);
      gatingForm.reset();
    },
    onError: error => {
      toast({
        title: 'Error Updating Rule',
        description: error.message || 'An error occurred while updating the rule.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for deleting a Section Gating rule
  const deleteGatingRule = useMutation({
    mutationFn: id =>
      apiRequest.delete(`/api/tenant-section-gating/${tenantId}/section-gating/${id}`),
    onSuccess: () => {
      toast({
        title: 'Section Gating Rule Deleted',
        description: 'The rule has been deleted successfully.',
        variant: 'default',
      });
      queryClient.invalidateQueries({
        queryKey: [`/api/tenant-section-gating/${tenantId}/section-gating`],
      });
    },
    onError: error => {
      toast({
        title: 'Error Deleting Rule',
        description: error.message || 'An error occurred while deleting the rule.',
        variant: 'destructive',
      });
    },
  });

  // Mutation for validating a section
  const validateSection = useMutation({
    mutationFn: data =>
      apiRequest.post(`/api/tenant-section-gating/${tenantId}/section-gating/validate`, data),
    onSuccess: data => {
      toast({
        title: data.valid ? 'Section Validation Passed' : 'Section Validation Failed',
        description: data.message,
        variant: data.valid ? 'default' : 'destructive',
      });

      if (projectId) {
        queryClient.invalidateQueries({
          queryKey: [
            `/api/tenant-section-gating/${tenantId}/section-gating/project/${projectId}/stats`,
          ],
        });
      }
    },
    onError: error => {
      toast({
        title: 'Error Validating Section',
        description: error.message || 'An error occurred while validating the section.',
        variant: 'destructive',
      });
    },
  });

  // Handle creating/updating a CTQ factor
  const handleFactorSubmit = data => {
    if (editingItem) {
      updateFactor.mutate({ ...data, id: editingItem.id });
    } else {
      createFactor.mutate(data);
    }
  };

  // Handle creating/updating a Section Gating rule
  const handleGatingSubmit = data => {
    if (editingItem) {
      updateGatingRule.mutate({ ...data, id: editingItem.id });
    } else {
      createGatingRule.mutate(data);
    }
  };

  // Handle validating a section
  const handleValidationSubmit = data => {
    validateSection.mutate(data);
  };

  // Handle editing a CTQ factor
  const handleEditFactor = factor => {
    setEditingItem(factor);
    factorForm.reset({
      name: factor.name,
      description: factor.description || '',
      category: factor.category,
      appliesTo: factor.appliesTo,
      sectionCode: factor.sectionCode,
      riskLevel: factor.riskLevel,
      validationRule: factor.validationRule || '',
      active: factor.active,
      required: factor.required,
    });
    setShowFactorDialog(true);
  };

  // Handle editing a Section Gating rule
  const handleEditGating = rule => {
    setEditingItem(rule);
    gatingForm.reset({
      sectionCode: rule.sectionCode,
      name: rule.name,
      description: rule.description || '',
      ctqFactors: rule.ctqFactors || [],
      requiredCtqFactors: rule.requiredCtqFactors || [],
      warningCtqFactors: rule.warningCtqFactors || [],
      informationalCtqFactors: rule.informationalCtqFactors || [],
      overridePolicy: rule.overridePolicy,
      active: rule.active,
    });
    setShowGatingDialog(true);
  };

  // Handle setting up a validation test
  const handleSetupValidation = sectionCode => {
    setSelectedSectionCode(sectionCode);
    setSelectedFactors([]);
    validationForm.reset({
      sectionCode,
      satisfiedFactors: [],
      content: '',
      projectId: projectId,
    });
    setShowValidationDialog(true);
  };

  // Toggle a factor selection for validation
  const toggleFactorSelection = factorId => {
    if (selectedFactors.includes(factorId)) {
      setSelectedFactors(selectedFactors.filter(id => id !== factorId));
      validationForm.setValue(
        'satisfiedFactors',
        selectedFactors.filter(id => id !== factorId)
      );
    } else {
      setSelectedFactors([...selectedFactors, factorId]);
      validationForm.setValue('satisfiedFactors', [...selectedFactors, factorId]);
    }
  };

  // Show a badge for risk level
  const RiskBadge = ({ level }) => {
    switch (level) {
      case 'high':
        return (
          <Badge variant="destructive" className="ml-1">
            <ShieldAlert className="h-3 w-3 mr-1" />
            High
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant="warning" className="ml-1">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Medium
          </Badge>
        );
      case 'low':
        return (
          <Badge variant="outline" className="ml-1">
            <Info className="h-3 w-3 mr-1" />
            Low
          </Badge>
        );
      default:
        return null;
    }
  };

  // Show a badge for section validation status
  const ValidationStatusBadge = ({ status }) => {
    switch (status) {
      case 'passed':
        return (
          <Badge variant="success" className="ml-1">
            <CheckCircle className="h-3 w-3 mr-1" />
            Passed
          </Badge>
        );
      case 'warning':
        return (
          <Badge variant="warning" className="ml-1">
            <AlertTriangle className="h-3 w-3 mr-1" />
            Warning
          </Badge>
        );
      case 'failed':
        return (
          <Badge variant="destructive" className="ml-1">
            <AlertCircle className="h-3 w-3 mr-1" />
            Failed
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="ml-1">
            <Info className="h-3 w-3 mr-1" />
            Unknown
          </Badge>
        );
    }
  };

  return (
    <Card className="w-full h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center">
            <Settings className="h-5 w-5 mr-2" />
            Section Quality Gating
          </div>
          {projectId && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                queryClient.invalidateQueries({
                  queryKey: [
                    `/api/tenant-section-gating/${tenantId}/section-gating/project/${projectId}/stats`,
                  ],
                })
              }
              disabled={isLoadingStats}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${isLoadingStats ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          )}
        </CardTitle>
        <CardDescription>
          Manage Critical-to-Quality (CTQ) factors and section gating rules for quality control.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="factors">CTQ Factors</TabsTrigger>
            <TabsTrigger value="gating">Section Rules</TabsTrigger>
            {projectId && <TabsTrigger value="validation">Validation Status</TabsTrigger>}
          </TabsList>

          {/* CTQ Factors Tab */}
          <TabsContent value="factors" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Critical-to-Quality Factors</h3>
              <Button
                onClick={() => {
                  setEditingItem(null);
                  factorForm.reset();
                  setShowFactorDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Factor
              </Button>
            </div>

            {isLoadingFactors ? (
              <div className="flex justify-center items-center h-40">
                <LoadingSpinner />
              </div>
            ) : isErrorFactors ? (
              <div className="text-center text-destructive">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>Failed to load CTQ factors</p>
              </div>
            ) : ctqFactors?.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">
                <p>No CTQ factors defined yet. Create your first factor to get started.</p>
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Section</TableHead>
                      <TableHead>Risk Level</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ctqFactors?.map(factor => (
                      <TableRow key={factor.id}>
                        <TableCell className="font-medium">{factor.name}</TableCell>
                        <TableCell>
                          {availableSections[factor.sectionCode] || factor.sectionCode}
                        </TableCell>
                        <TableCell>
                          <RiskBadge level={factor.riskLevel} />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditFactor(factor)}
                            >
                              Edit
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete CTQ Factor</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this factor? This action cannot
                                    be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteFactor.mutate(factor.id)}>
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Section Gating Rules Tab */}
          <TabsContent value="gating" className="space-y-4">
            <div className="flex justify-between items-center">
              <h3 className="text-lg font-medium">Section Gating Rules</h3>
              <Button
                onClick={() => {
                  setEditingItem(null);
                  gatingForm.reset();
                  setShowGatingDialog(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Rule
              </Button>
            </div>

            {isLoadingGating ? (
              <div className="flex justify-center items-center h-40">
                <LoadingSpinner />
              </div>
            ) : isErrorGating ? (
              <div className="text-center text-destructive">
                <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                <p>Failed to load section gating rules</p>
              </div>
            ) : gatingRules?.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">
                <p>No section gating rules defined yet. Create your first rule to get started.</p>
              </div>
            ) : (
              <div className="border rounded-md">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Section</TableHead>
                      <TableHead>Required Factors</TableHead>
                      <TableHead>Warning Factors</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {gatingRules?.map(rule => (
                      <TableRow key={rule.id}>
                        <TableCell className="font-medium">{rule.name}</TableCell>
                        <TableCell>{rule.requiredCtqFactors?.length || 0}</TableCell>
                        <TableCell>{rule.warningCtqFactors?.length || 0}</TableCell>
                        <TableCell>
                          <div className="flex space-x-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleEditGating(rule)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetupValidation(rule.sectionCode)}
                            >
                              Test
                            </Button>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="sm" className="text-destructive">
                                  <Trash2 className="h-4 w-4" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete Gating Rule</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Are you sure you want to delete this section gating rule? This
                                    action cannot be undone.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => deleteGatingRule.mutate(rule.id)}
                                  >
                                    Delete
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </TabsContent>

          {/* Validation Status Tab (Only shown when projectId is available) */}
          {projectId && (
            <TabsContent value="validation" className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-lg font-medium">Section Validation Status</h3>
                <div className="flex items-center space-x-2">
                  {validationStats && (
                    <div className="flex items-center space-x-4 mr-4 text-sm">
                      <div className="flex items-center">
                        <ShieldCheck className="h-4 w-4 mr-1 text-green-500" />
                        <span>{validationStats.passedSections} Passed</span>
                      </div>
                      <div className="flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-1 text-yellow-500" />
                        <span>{validationStats.warningSections} Warning</span>
                      </div>
                      <div className="flex items-center">
                        <AlertCircle className="h-4 w-4 mr-1 text-red-500" />
                        <span>{validationStats.failedSections} Failed</span>
                      </div>
                    </div>
                  )}
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      queryClient.invalidateQueries({
                        queryKey: [
                          `/api/tenant-section-gating/${tenantId}/section-gating/project/${projectId}/stats`,
                        ],
                      })
                    }
                  >
                    <RefreshCw className="h-4 w-4 mr-1" />
                    Refresh
                  </Button>
                </div>
              </div>

              {isLoadingStats ? (
                <div className="flex justify-center items-center h-40">
                  <LoadingSpinner />
                </div>
              ) : isErrorStats ? (
                <div className="text-center text-destructive">
                  <AlertCircle className="h-8 w-8 mx-auto mb-2" />
                  <p>Failed to load validation status</p>
                </div>
              ) : !validationStats ? (
                <div className="text-center text-muted-foreground p-8">
                  <p>No validation data available for this project.</p>
                </div>
              ) : (
                <div className="border rounded-md">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Section</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Compliance</TableHead>
                        <TableHead>Last Validated</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {validationStats.sectionStats?.map(stat => (
                        <TableRow key={stat.sectionCode}>
                          <TableCell className="font-medium">{stat.sectionName}</TableCell>
                          <TableCell>
                            <ValidationStatusBadge status={stat.status} />
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center">
                              <span className="w-10">{stat.compliancePercentage}%</span>
                              <div className="w-24 h-2 ml-2 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className={`h-full ${
                                    stat.compliancePercentage >= 80
                                      ? 'bg-green-500'
                                      : stat.compliancePercentage >= 50
                                        ? 'bg-yellow-500'
                                        : 'bg-red-500'
                                  }`}
                                  style={{ width: `${stat.compliancePercentage}%` }}
                                ></div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell>{new Date(stat.lastValidated).toLocaleString()}</TableCell>
                          <TableCell>
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleSetupValidation(stat.sectionCode)}
                            >
                              Validate
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}

              <div className="mt-4 p-4 bg-muted rounded-md">
                <h4 className="text-sm font-semibold mb-2 flex items-center">
                  <Activity className="h-4 w-4 mr-1" />
                  Overall Project Compliance
                </h4>
                {validationStats && (
                  <div className="space-y-2">
                    <div className="flex items-center">
                      <span className="w-24">Quality Score:</span>
                      <span className="font-semibold">
                        {Math.round(validationStats.overallCompliancePercentage)}%
                      </span>
                      <div className="w-full h-3 ml-4 bg-gray-200 rounded-full overflow-hidden">
                        <div
                          className={`h-full ${
                            validationStats.overallCompliancePercentage >= 80
                              ? 'bg-green-500'
                              : validationStats.overallCompliancePercentage >= 50
                                ? 'bg-yellow-500'
                                : 'bg-red-500'
                          }`}
                          style={{ width: `${validationStats.overallCompliancePercentage}%` }}
                        ></div>
                      </div>
                    </div>
                    <div className="flex space-x-8 text-sm">
                      <div>
                        <span className="text-muted-foreground">Total Sections:</span>
                        <span className="ml-2 font-medium">{validationStats.totalSections}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Passed:</span>
                        <span className="ml-2 font-medium text-green-600">
                          {validationStats.passedSections}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Warnings:</span>
                        <span className="ml-2 font-medium text-yellow-600">
                          {validationStats.warningSections}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Failed:</span>
                        <span className="ml-2 font-medium text-red-600">
                          {validationStats.failedSections}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </TabsContent>
          )}
        </Tabs>
      </CardContent>

      {/* CTQ Factor Dialog */}
      <Dialog open={showFactorDialog} onOpenChange={setShowFactorDialog}>
        <DialogContent className="sm:max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit CTQ Factor' : 'Create CTQ Factor'}</DialogTitle>
            <DialogDescription>
              Define a Critical-to-Quality factor for document validation.
            </DialogDescription>
          </DialogHeader>

          <Form {...factorForm}>
            <form onSubmit={factorForm.handleSubmit(handleFactorSubmit)} className="space-y-4">
              <FormField
                control={factorForm.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Factor Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter factor name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={factorForm.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Category</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select category" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="safety">Safety</SelectItem>
                          <SelectItem value="effectiveness">Effectiveness</SelectItem>
                          <SelectItem value="performance">Performance</SelectItem>
                          <SelectItem value="clinical">Clinical</SelectItem>
                          <SelectItem value="regulatory">Regulatory</SelectItem>
                          <SelectItem value="other">Other</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={factorForm.control}
                  name="riskLevel"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Risk Level</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select risk level" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="high">High</SelectItem>
                          <SelectItem value="medium">Medium</SelectItem>
                          <SelectItem value="low">Low</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={factorForm.control}
                  name="sectionCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Applies to Section</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select section" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(availableSections).map(([code, name]) => (
                            <SelectItem key={code} value={code}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={factorForm.control}
                  name="appliesTo"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Device Type</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select type" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="all">All Products</SelectItem>
                          <SelectItem value="device">Medical Device</SelectItem>
                          <SelectItem value="medicinal">Medicinal Product</SelectItem>
                          <SelectItem value="combination">Combination Product</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={factorForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the quality factor requirements"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={factorForm.control}
                name="validationRule"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Validation Rule (Optional)</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter rule expression" {...field} />
                    </FormControl>
                    <FormDescription>
                      Advanced validation rule used for automated content checking.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={factorForm.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>Enable this CTQ factor for validation</FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                <FormField
                  control={factorForm.control}
                  name="required"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Required</FormLabel>
                        <FormDescription>Section cannot pass without this factor</FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowFactorDialog(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={createFactor.isPending || updateFactor.isPending}>
                  {createFactor.isPending || updateFactor.isPending ? (
                    <>
                      <LoadingSpinner className="mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Factor'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Section Gating Rule Dialog */}
      <Dialog open={showGatingDialog} onOpenChange={setShowGatingDialog}>
        <DialogContent className="sm:max-w-[650px]">
          <DialogHeader>
            <DialogTitle>
              {editingItem ? 'Edit Section Gating Rule' : 'Create Section Gating Rule'}
            </DialogTitle>
            <DialogDescription>
              Define quality requirements for document sections.
            </DialogDescription>
          </DialogHeader>

          <Form {...gatingForm}>
            <form onSubmit={gatingForm.handleSubmit(handleGatingSubmit)} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={gatingForm.control}
                  name="sectionCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Section Code</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={value => {
                          field.onChange(value);
                          gatingForm.setValue('name', availableSections[value] || value);
                        }}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select section" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {Object.entries(availableSections).map(([code, name]) => (
                            <SelectItem key={code} value={code}>
                              {name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={gatingForm.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Display Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Section display name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={gatingForm.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the section and its quality requirements"
                        className="resize-none"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={gatingForm.control}
                  name="overridePolicy"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Override Policy</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select policy" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="none">No Overrides</SelectItem>
                          <SelectItem value="admin-only">Admin Only</SelectItem>
                          <SelectItem value="manager-approval">Manager Approval</SelectItem>
                          <SelectItem value="document-reason">Document Reason</SelectItem>
                        </SelectContent>
                      </Select>
                      <FormDescription>How can users override failed validations</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={gatingForm.control}
                  name="active"
                  render={({ field }) => (
                    <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 h-[87px]">
                      <div className="space-y-0.5">
                        <FormLabel className="text-base">Active</FormLabel>
                        <FormDescription>Enable this rule for validation</FormDescription>
                      </div>
                      <FormControl>
                        <Checkbox checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />
              </div>

              <div className="border rounded-md p-4">
                <h4 className="text-sm font-medium mb-2">Required CTQ Factors (Hard Gate)</h4>
                <FormField
                  control={gatingForm.control}
                  name="requiredCtqFactors"
                  render={({ field }) => (
                    <FormItem>
                      <div className="max-h-40 overflow-y-auto space-y-2">
                        {isLoadingFactors ? (
                          <LoadingSpinner />
                        ) : ctqFactors?.filter(
                            f => f.sectionCode === gatingForm.getValues('sectionCode')
                          ).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No factors available for this section.
                          </p>
                        ) : (
                          ctqFactors
                            ?.filter(f => f.sectionCode === gatingForm.getValues('sectionCode'))
                            .map(factor => (
                              <div key={factor.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`req-${factor.id}`}
                                  checked={field.value?.includes(factor.id)}
                                  onCheckedChange={checked => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), factor.id]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter(id => id !== factor.id) || []
                                      );
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`req-${factor.id}`}
                                  className="text-sm flex items-center cursor-pointer"
                                >
                                  {factor.name}
                                  <RiskBadge level={factor.riskLevel} />
                                </label>
                              </div>
                            ))
                        )}
                      </div>
                      <FormDescription>
                        All these factors must be satisfied for the section to pass validation
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border rounded-md p-4">
                <h4 className="text-sm font-medium mb-2">Warning CTQ Factors (Soft Gate)</h4>
                <FormField
                  control={gatingForm.control}
                  name="warningCtqFactors"
                  render={({ field }) => (
                    <FormItem>
                      <div className="max-h-40 overflow-y-auto space-y-2">
                        {isLoadingFactors ? (
                          <LoadingSpinner />
                        ) : ctqFactors?.filter(
                            f => f.sectionCode === gatingForm.getValues('sectionCode')
                          ).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No factors available for this section.
                          </p>
                        ) : (
                          ctqFactors
                            ?.filter(f => f.sectionCode === gatingForm.getValues('sectionCode'))
                            .map(factor => (
                              <div key={factor.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`warn-${factor.id}`}
                                  checked={field.value?.includes(factor.id)}
                                  onCheckedChange={checked => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), factor.id]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter(id => id !== factor.id) || []
                                      );
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`warn-${factor.id}`}
                                  className="text-sm flex items-center cursor-pointer"
                                >
                                  {factor.name}
                                  <RiskBadge level={factor.riskLevel} />
                                </label>
                              </div>
                            ))
                        )}
                      </div>
                      <FormDescription>
                        These factors produce warnings but don't block section validation
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="border rounded-md p-4">
                <h4 className="text-sm font-medium mb-2">Informational CTQ Factors</h4>
                <FormField
                  control={gatingForm.control}
                  name="informationalCtqFactors"
                  render={({ field }) => (
                    <FormItem>
                      <div className="max-h-40 overflow-y-auto space-y-2">
                        {isLoadingFactors ? (
                          <LoadingSpinner />
                        ) : ctqFactors?.filter(
                            f => f.sectionCode === gatingForm.getValues('sectionCode')
                          ).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No factors available for this section.
                          </p>
                        ) : (
                          ctqFactors
                            ?.filter(f => f.sectionCode === gatingForm.getValues('sectionCode'))
                            .map(factor => (
                              <div key={factor.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`info-${factor.id}`}
                                  checked={field.value?.includes(factor.id)}
                                  onCheckedChange={checked => {
                                    if (checked) {
                                      field.onChange([...(field.value || []), factor.id]);
                                    } else {
                                      field.onChange(
                                        field.value?.filter(id => id !== factor.id) || []
                                      );
                                    }
                                  }}
                                />
                                <label
                                  htmlFor={`info-${factor.id}`}
                                  className="text-sm flex items-center cursor-pointer"
                                >
                                  {factor.name}
                                  <RiskBadge level={factor.riskLevel} />
                                </label>
                              </div>
                            ))
                        )}
                      </div>
                      <FormDescription>
                        These factors provide suggestions and best practices
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setShowGatingDialog(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={createGatingRule.isPending || updateGatingRule.isPending}
                >
                  {createGatingRule.isPending || updateGatingRule.isPending ? (
                    <>
                      <LoadingSpinner className="mr-2" />
                      Saving...
                    </>
                  ) : (
                    'Save Rule'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>

      {/* Section Validation Dialog */}
      <Dialog open={showValidationDialog} onOpenChange={setShowValidationDialog}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>Validate Section</DialogTitle>
            <DialogDescription>Test section against quality gating rules</DialogDescription>
          </DialogHeader>

          <Form {...validationForm}>
            <form
              onSubmit={validationForm.handleSubmit(handleValidationSubmit)}
              className="space-y-4"
            >
              <FormField
                control={validationForm.control}
                name="sectionCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Section to Validate</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select section" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {Object.entries(availableSections).map(([code, name]) => (
                          <SelectItem key={code} value={code}>
                            {name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={validationForm.control}
                name="content"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Test Content (Optional)</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Enter section content for validation..."
                        className="resize-none min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      Content will be analyzed as part of validation
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="border rounded-md p-4">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Satisfied CTQ Factors</h4>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      // Get all factors for this section
                      const sectionFactors =
                        ctqFactors
                          ?.filter(f => f.sectionCode === validationForm.getValues('sectionCode'))
                          .map(f => f.id) || [];

                      // Toggle all/none
                      if (selectedFactors.length === sectionFactors.length) {
                        setSelectedFactors([]);
                        validationForm.setValue('satisfiedFactors', []);
                      } else {
                        setSelectedFactors(sectionFactors);
                        validationForm.setValue('satisfiedFactors', sectionFactors);
                      }
                    }}
                  >
                    <Filter className="h-4 w-4 mr-1" />
                    {selectedFactors.length ===
                    ctqFactors?.filter(
                      f => f.sectionCode === validationForm.getValues('sectionCode')
                    ).length
                      ? 'Select None'
                      : 'Select All'}
                  </Button>
                </div>

                <FormField
                  control={validationForm.control}
                  name="satisfiedFactors"
                  render={({ field }) => (
                    <FormItem>
                      <div className="max-h-40 overflow-y-auto space-y-2">
                        {isLoadingFactors ? (
                          <LoadingSpinner />
                        ) : ctqFactors?.filter(
                            f => f.sectionCode === validationForm.getValues('sectionCode')
                          ).length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            No factors available for this section.
                          </p>
                        ) : (
                          ctqFactors
                            ?.filter(f => f.sectionCode === validationForm.getValues('sectionCode'))
                            .map(factor => (
                              <div key={factor.id} className="flex items-center space-x-2">
                                <Checkbox
                                  id={`sat-${factor.id}`}
                                  checked={selectedFactors.includes(factor.id)}
                                  onCheckedChange={() => toggleFactorSelection(factor.id)}
                                />
                                <label
                                  htmlFor={`sat-${factor.id}`}
                                  className="text-sm flex items-center cursor-pointer"
                                >
                                  {factor.name}
                                  <RiskBadge level={factor.riskLevel} />
                                </label>
                              </div>
                            ))
                        )}
                      </div>
                      <FormDescription>
                        Select the CTQ factors that are satisfied by the section
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowValidationDialog(false)}
                >
                  Cancel
                </Button>
                <Button type="submit" disabled={validateSection.isPending}>
                  {validateSection.isPending ? (
                    <>
                      <LoadingSpinner className="mr-2" />
                      Validating...
                    </>
                  ) : (
                    'Validate Section'
                  )}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        </DialogContent>
      </Dialog>
    </Card>
  );
};

export default QmpSectionGatingPanel;
