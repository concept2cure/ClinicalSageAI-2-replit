import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'wouter';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  FileText,
  TestTube,
  Package,
  Microscope,
  Shield,
  Plus,
  Edit,
  Eye,
  AlertCircle,
  CheckCircle,
  Clock,
  BarChart3,
  FlaskConical,
  Users,
  FileCheck,
  ArrowRight,
  Brain,
  MessageSquare,
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAnAAssistant } from '@/contexts/AnAAssistantContext';
import CMCReportsTab from './cmc/CMCReportsTab';

export default function CMCModule() {
  const [activeTab, setActiveTab] = useState('projects');
  const [projects, setProjects] = useState([]);
  const [drugSubstances, setDrugSubstances] = useState([]);
  const [drugProducts, setDrugProducts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  const { openAssistant } = useAnAAssistant();

  const loadCMCData = useCallback(async () => {
    setLoading(true);
    try {
      const [projectsRes, substancesRes, productsRes] = await Promise.all([
        fetch('/api/cmc/projects', { credentials: 'include' }),
        fetch('/api/cmc/drug-substances', { credentials: 'include' }),
        fetch('/api/cmc/drug-products', { credentials: 'include' }),
      ]);

      if (projectsRes.ok) {
        const projectsData = await projectsRes.json();
        setProjects(projectsData.data || []);
        if ((projectsData.data || []).length > 0) {
          setSelectedProjectId(current => current || projectsData.data[0].id);
        }
      }
      if (substancesRes.ok) {
        const substancesData = await substancesRes.json();
        setDrugSubstances(
          (substancesData.data || []).map(substance => ({
            ...substance,
            name: substance.name || substance.substanceName || 'Unnamed Substance',
            chemicalName: substance.chemicalName || substance.substanceName || '-',
            casNumber: substance.casNumber || substance.cas || '-',
            status: substance.status || 'draft',
          }))
        );
      }
      if (productsRes.ok) {
        const productsData = await productsRes.json();
        setDrugProducts(
          (productsData.data || []).map(product => ({
            ...product,
            name: product.name || product.productName || 'Unnamed Product',
            containerType: product.containerType || product.containerClosure || '-',
            status: product.status || 'draft',
          }))
        );
      }
    } catch (error) {
      console.error('Error loading CMC data:', error);
      toast({
        title: 'Error',
        description: 'Failed to load CMC data',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    document.title = 'Concept2Cure | CMC Module';
    loadCMCData();
  }, [loadCMCData]);

  const getStatusBadge = status => {
    const statusConfig = {
      active: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      draft: { color: 'bg-yellow-100 text-yellow-800', icon: Clock },
      review: { color: 'bg-blue-100 text-blue-800', icon: Eye },
      approved: { color: 'bg-green-100 text-green-800', icon: CheckCircle },
      pending: { color: 'bg-orange-100 text-orange-800', icon: Clock },
    };

    const config = statusConfig[status] || statusConfig['draft'];
    const IconComponent = config.icon;

    return (
      <Badge className={`${config.color} flex items-center gap-1`}>
        <IconComponent className="w-3 h-3" />
        {status}
      </Badge>
    );
  };

  const quickLaunchPaths = [
    {
      title: 'Medical Affairs',
      description: 'Summaries and defensible scientific narratives for cross-functional teams.',
      action: () => {
        openAssistant('cmc', {
          objective: 'medical_affairs_briefing',
          focus: 'module3_quality_story',
          projectId: selectedProjectId || undefined,
        });
      },
      buttonLabel: 'Ask AnA for medical summary',
    },
    {
      title: 'Regulatory Affairs',
      description: 'Drive Module 3 readiness, deficiency preemption, and submission packaging.',
      action: () => setLocation('/cmc-wizard'),
      buttonLabel: 'Open CMC Wizard',
    },
    {
      title: 'Clinical Affairs',
      description: 'Connect quality attributes to clinical implications and risk controls.',
      action: () => {
        openAssistant('cmc', {
          objective: 'clinical_cmc_alignment',
          focus: 'risk_benefit_alignment',
          projectId: selectedProjectId || undefined,
        });
      },
      buttonLabel: 'Generate alignment brief',
    },
  ];

  const handleBuildModule3Draft = async project => {
    try {
      const response = await fetch(`/api/cmc/projects/${project.id}/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title: `${project.name || project.drugName || 'Project'} - CTD Module 3 Draft`,
          documentType: 'ctd_module_3',
          status: 'draft',
          content: `Auto-seeded Module 3 draft for ${project.drugName || project.name || 'selected project'}.\n\nNext steps:\n1. Complete 3.2.S drug substance details\n2. Complete 3.2.P drug product details\n3. Run quality/compliance checks\n4. Generate submission-ready export`,
          metadata: {
            source: 'cmc_projects_table',
            generatedBy: 'ana_ri_quick_action',
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed with status ${response.status}`);
      }

      const created = await response.json();
      toast({
        title: 'Module 3 draft created',
        description: `Draft document created for ${project.name || 'project'}.`,
      });
      setActiveTab('reports');
      setSelectedProjectId(project.id);
      return created;
    } catch (error) {
      console.error('Failed to create Module 3 draft:', error);
      toast({
        title: 'Could not create Module 3 draft',
        description: 'Please verify project permissions and try again.',
        variant: 'destructive',
      });
      return null;
    }
  };

  const handleAskAnAAboutProject = (project, objective = 'module3_readiness') => {
    openAssistant('cmc', {
      source: 'cmc_projects_table',
      projectId: project?.id,
      projectName: project?.name,
      drugName: project?.drugName,
      developmentStage: project?.developmentStage,
      regulatoryRegion: project?.regulatoryRegion,
      objective,
      humanGoal: 'project_specific_regulatory_guidance',
    });
  };

  const getProjectReadinessScore = project => {
    let score = 35;
    if (project?.drugName) score += 15;
    if (project?.drugType) score += 10;
    if (project?.regulatoryRegion) score += 10;
    if (project?.developmentStage) score += 10;
    if (['active', 'review', 'approved'].includes(project?.status)) score += 15;
    return Math.min(score, 95);
  };

  return (
    <div className="container mx-auto px-6 py-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl text-blue-600 flex items-center gap-2">
            <FlaskConical className="w-7 h-7" />
            Chemistry, Manufacturing, and Controls (CMC)
          </CardTitle>
          <CardDescription>
            Complete CMC project management, regulatory compliance, and document control
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Card className="mb-6 border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50">
            <CardHeader className="pb-3">
              <CardTitle className="text-lg flex items-center gap-2">
                <Brain className="w-5 h-5 text-blue-600" />
                Human-first launchpad: biotech, pharma, and med-device teams
              </CardTitle>
              <CardDescription>
                Start from your function and quickly move CMC data into executable Module 3 outputs.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {quickLaunchPaths.map(item => (
                <Card key={item.title} className="border border-blue-100 bg-white/80">
                  <CardContent className="p-4 space-y-3">
                    <div>
                      <h3 className="font-semibold text-gray-900">{item.title}</h3>
                      <p className="text-sm text-gray-600">{item.description}</p>
                    </div>
                    <Button size="sm" className="w-full" onClick={item.action}>
                      {item.buttonLabel}
                    </Button>
                  </CardContent>
                </Card>
              ))}
            </CardContent>
            <CardContent className="pt-0">
              <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-gray-700">
                <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Top flow:</span>
                <span>Project setup</span>
                <ArrowRight className="w-4 h-4" />
                <span>Substance/Product data</span>
                <ArrowRight className="w-4 h-4" />
                <span>Quality checks</span>
                <ArrowRight className="w-4 h-4" />
                <span>Reports & Module 3 docs</span>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedProjectId}
                  onClick={() => {
                    const selectedProject = projects.find(project => project.id === selectedProjectId);
                    if (selectedProject) handleBuildModule3Draft(selectedProject);
                  }}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  Build Module 3 draft
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={!selectedProjectId}
                  onClick={() => {
                    const selectedProject = projects.find(project => project.id === selectedProjectId);
                    if (selectedProject) handleAskAnAAboutProject(selectedProject);
                  }}
                >
                  <MessageSquare className="w-4 h-4 mr-1" />
                  Ask AnA about this project
                </Button>
              </div>
            </CardContent>
          </Card>

          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-7">
              <TabsTrigger value="projects">Projects</TabsTrigger>
              <TabsTrigger value="substances">Drug Substances</TabsTrigger>
              <TabsTrigger value="products">Drug Products</TabsTrigger>
              <TabsTrigger value="analytics">Analytical Methods</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
              <TabsTrigger value="templates">Templates</TabsTrigger>
            </TabsList>

            <TabsContent value="projects" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold">CMC Projects</h2>
                  <p className="text-gray-600">
                    Manage your chemistry, manufacturing, and controls projects
                  </p>
                </div>
                <Button className="flex items-center gap-2">
                  <Plus className="w-4 h-4" />
                  New CMC Project
                </Button>
              </div>

              {/* Project Statistics */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Total Projects</p>
                        <p className="text-2xl font-bold text-gray-900">{projects.length}</p>
                      </div>
                      <div className="p-3 bg-blue-100 rounded-full">
                        <FlaskConical className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Active Projects</p>
                        <p className="text-2xl font-bold text-green-600">
                          {projects.filter(p => p.status === 'active').length}
                        </p>
                      </div>
                      <div className="p-3 bg-green-100 rounded-full">
                        <CheckCircle className="w-6 h-6 text-green-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Drug Substances</p>
                        <p className="text-2xl font-bold text-purple-600">
                          {drugSubstances.length}
                        </p>
                      </div>
                      <div className="p-3 bg-purple-100 rounded-full">
                        <TestTube className="w-6 h-6 text-purple-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-6">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600">Drug Products</p>
                        <p className="text-2xl font-bold text-orange-600">{drugProducts.length}</p>
                      </div>
                      <div className="p-3 bg-orange-100 rounded-full">
                        <Package className="w-6 h-6 text-orange-600" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* Projects Table */}
              <Card>
                <CardHeader>
                  <CardTitle>Recent CMC Projects</CardTitle>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8">Loading projects...</div>
                  ) : projects.length === 0 ? (
                    <div className="text-center py-8">
                      <FlaskConical className="w-12 h-12 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No CMC Projects</h3>
                      <p className="text-gray-600 mb-4">
                        Get started by creating your first CMC project
                      </p>
                      <Button>Create CMC Project</Button>
                    </div>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Project Name</TableHead>
                          <TableHead>Drug Name</TableHead>
                          <TableHead>Type</TableHead>
                          <TableHead>Stage</TableHead>
                          <TableHead>Region</TableHead>
                          <TableHead>Module 3 Readiness</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {projects.map(project => (
                          <TableRow key={project.id}>
                            <TableCell className="font-medium">{project.name}</TableCell>
                            <TableCell>{project.drugName}</TableCell>
                            <TableCell>{project.drugType}</TableCell>
                            <TableCell>{project.developmentStage}</TableCell>
                            <TableCell>{project.regulatoryRegion}</TableCell>
                            <TableCell>
                              <Badge className="bg-indigo-100 text-indigo-800">
                                {getProjectReadinessScore(project)}%
                              </Badge>
                            </TableCell>
                            <TableCell>{getStatusBadge(project.status)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-2">
                                <Button variant="ghost" size="sm">
                                  <Eye className="w-4 h-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Build Module 3 draft"
                                  onClick={() => handleBuildModule3Draft(project)}
                                >
                                  <FileText className="w-4 h-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  title="Ask AnA about this project"
                                  onClick={() => handleAskAnAAboutProject(project)}
                                >
                                  <MessageSquare className="w-4 h-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="substances" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold">Drug Substances (Module 3.2.S)</h2>
                  <p className="text-gray-600">
                    Manage drug substance information and specifications
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        '/document-templates?category=quality&filter=drug-substance',
                        '_blank'
                      )
                    }
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    Templates
                  </Button>
                  <Button>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Drug Substance
                  </Button>
                </div>
              </div>

              <Card>
                <CardContent className="p-6">
                  {drugSubstances.length === 0 ? (
                    <div className="text-center py-12">
                      <TestTube className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Drug Substances</h3>
                      <p className="text-gray-600 mb-4">
                        Add drug substance information to start CMC documentation
                      </p>
                      <Button>Add First Drug Substance</Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {drugSubstances.map(substance => (
                        <Card key={substance.id} className="border-l-4 border-l-blue-500">
                          <CardHeader>
                            <CardTitle className="text-lg">{substance.name}</CardTitle>
                            <CardDescription>{substance.chemicalName}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">CAS Number:</span>
                                <span className="font-medium">{substance.casNumber}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Molecular Weight:</span>
                                <span className="font-medium">{substance.molecularWeight}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Status:</span>
                                {getStatusBadge(substance.status)}
                              </div>
                            </div>
                            <div className="flex justify-end mt-4 gap-2">
                              <Button variant="ghost" size="sm">
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm">
                                <Edit className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="products" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold">Drug Products (Module 3.2.P)</h2>
                  <p className="text-gray-600">
                    Manage drug product formulations and specifications
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        '/document-templates?category=quality&filter=drug-product',
                        '_blank'
                      )
                    }
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    Templates
                  </Button>
                  <Button>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Drug Product
                  </Button>
                </div>
              </div>

              <Card>
                <CardContent className="p-6">
                  {drugProducts.length === 0 ? (
                    <div className="text-center py-12">
                      <Package className="w-16 h-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-lg font-medium text-gray-900 mb-2">No Drug Products</h3>
                      <p className="text-gray-600 mb-4">
                        Add drug product formulations to complete CMC documentation
                      </p>
                      <Button>Add First Drug Product</Button>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                      {drugProducts.map(product => (
                        <Card key={product.id} className="border-l-4 border-l-green-500">
                          <CardHeader>
                            <CardTitle className="text-lg">{product.name}</CardTitle>
                            <CardDescription>{product.dosageForm}</CardDescription>
                          </CardHeader>
                          <CardContent>
                            <div className="space-y-2">
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Strength:</span>
                                <span className="font-medium">{product.strength}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Container:</span>
                                <span className="font-medium">{product.containerType}</span>
                              </div>
                              <div className="flex justify-between text-sm">
                                <span className="text-gray-600">Status:</span>
                                {getStatusBadge(product.status)}
                              </div>
                            </div>
                            <div className="flex justify-end mt-4 gap-2">
                              <Button variant="ghost" size="sm">
                                <Eye className="w-4 h-4" />
                              </Button>
                              <Button variant="ghost" size="sm">
                                <Edit className="w-4 h-4" />
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="analytics" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold">Analytical Methods</h2>
                  <p className="text-gray-600">Method validation and analytical procedures</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      window.open(
                        '/document-templates?category=quality&filter=analytical',
                        '_blank'
                      )
                    }
                  >
                    <FileText className="w-4 h-4 mr-1" />
                    Templates
                  </Button>
                  <Button>
                    <Plus className="w-4 h-4 mr-1" />
                    Add Method
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Method Development</CardTitle>
                    <CardDescription>Develop and optimize analytical methods</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <Microscope className="w-5 h-5 text-blue-600" />
                          <div>
                            <p className="font-medium">HPLC Assay Method</p>
                            <p className="text-sm text-gray-600">Identity and purity testing</p>
                          </div>
                        </div>
                        <Badge className="bg-blue-100 text-blue-800">In Development</Badge>
                      </div>
                      <Button className="w-full" variant="outline">
                        Start Method Development
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Method Validation</CardTitle>
                    <CardDescription>
                      Validate analytical methods per ICH guidelines
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <CheckCircle className="w-5 h-5 text-green-600" />
                          <div>
                            <p className="font-medium">UV Spectroscopy</p>
                            <p className="text-sm text-gray-600">Quantitative analysis</p>
                          </div>
                        </div>
                        <Badge className="bg-green-100 text-green-800">Validated</Badge>
                      </div>
                      <Button className="w-full" variant="outline">
                        Generate Validation Report
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="compliance" className="space-y-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-semibold">Regulatory Compliance</h2>
                  <p className="text-gray-600">ICH guidelines and regulatory requirements</p>
                </div>
                <Button
                  variant="outline"
                  onClick={() => window.open('/document-templates?category=quality', '_blank')}
                >
                  <FileText className="w-4 h-4 mr-1" />
                  Compliance Templates
                </Button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Shield className="w-5 h-5 text-blue-600" />
                      ICH M4Q Compliance
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Module 3.2.S</span>
                        <Badge className="bg-green-100 text-green-800">Compliant</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Module 3.2.P</span>
                        <Badge className="bg-yellow-100 text-yellow-800">In Progress</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Module 3.2.A</span>
                        <Badge className="bg-red-100 text-red-800">Missing</Badge>
                      </div>
                    </div>
                    <Button className="w-full mt-4" variant="outline">
                      <FileCheck className="w-4 h-4 mr-1" />
                      Check Compliance
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <BarChart3 className="w-5 h-5 text-green-600" />
                      Quality Metrics
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Documentation Score</span>
                        <span className="font-semibold text-green-600">85%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Compliance Score</span>
                        <span className="font-semibold text-yellow-600">72%</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm">Review Progress</span>
                        <span className="font-semibold text-blue-600">60%</span>
                      </div>
                    </div>
                    <Button className="w-full mt-4" variant="outline">
                      <Eye className="w-4 h-4 mr-1" />
                      View Details
                    </Button>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="w-5 h-5 text-orange-600" />
                      Action Items
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="p-2 bg-orange-50 rounded border-l-2 border-orange-200">
                        <p className="text-sm font-medium">Missing stability data</p>
                        <p className="text-xs text-gray-600">Due: Next week</p>
                      </div>
                      <div className="p-2 bg-blue-50 rounded border-l-2 border-blue-200">
                        <p className="text-sm font-medium">Update method validation</p>
                        <p className="text-xs text-gray-600">Due: 2 weeks</p>
                      </div>
                    </div>
                    <Button className="w-full mt-4" variant="outline">
                      <Users className="w-4 h-4 mr-1" />
                      Assign Tasks
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>

            <TabsContent value="reports" className="space-y-6">
              <CMCReportsTab
                projects={projects}
                selectedProjectId={selectedProjectId}
                onSelectedProjectIdChange={setSelectedProjectId}
                drugSubstances={drugSubstances}
                drugProducts={drugProducts}
              />
            </TabsContent>

            <TabsContent value="templates" className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold mb-2">CMC Document Templates</h2>
                <p className="text-gray-600 mb-6">
                  Access regulatory-compliant templates for your CMC documentation
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-blue-500">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-blue-100 rounded-lg">
                        <TestTube className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Drug Substance Templates</h3>
                        <p className="text-sm text-gray-600">Module 3.2.S templates</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        window.open(
                          '/document-templates?category=quality&filter=drug-substance',
                          '_blank'
                        )
                      }
                    >
                      Access Templates
                    </Button>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-green-500">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-green-100 rounded-lg">
                        <Package className="w-6 h-6 text-green-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Drug Product Templates</h3>
                        <p className="text-sm text-gray-600">Module 3.2.P templates</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        window.open(
                          '/document-templates?category=quality&filter=drug-product',
                          '_blank'
                        )
                      }
                    >
                      Access Templates
                    </Button>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-purple-500">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-purple-100 rounded-lg">
                        <Microscope className="w-6 h-6 text-purple-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">Analytical Templates</h3>
                        <p className="text-sm text-gray-600">Method validation & testing</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() =>
                        window.open(
                          '/document-templates?category=quality&filter=analytical',
                          '_blank'
                        )
                      }
                    >
                      Access Templates
                    </Button>
                  </CardContent>
                </Card>

                <Card className="hover:shadow-md transition-shadow cursor-pointer border-l-4 border-l-orange-500">
                  <CardContent className="p-6">
                    <div className="flex items-center gap-3 mb-4">
                      <div className="p-2 bg-orange-100 rounded-lg">
                        <FileText className="w-6 h-6 text-orange-600" />
                      </div>
                      <div>
                        <h3 className="font-semibold">All Templates</h3>
                        <p className="text-sm text-gray-600">Browse complete library</p>
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => window.open('/document-templates', '_blank')}
                    >
                      Browse All
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}
