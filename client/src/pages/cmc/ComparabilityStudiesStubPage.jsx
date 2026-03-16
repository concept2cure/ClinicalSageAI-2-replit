import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
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
  BarChart,
  Calendar,
  ArrowRight,
  FileText,
  CheckCircle2,
  AlertTriangle,
  FileBarChart,
  ClipboardList,
  Beaker,
} from 'lucide-react';

/**
 * Comparability Studies Stub Page
 *
 * This page displays a list of comparability studies without requiring API connection.
 * It includes:
 * - Study listing with key properties
 * - Status tracking
 * - Result summary visualization
 */
const ComparabilityStudiesStubPage = () => {
  const [activeTab, setActiveTab] = useState('active');

  // Mock data for comparability studies
  const mockStudies = [
    {
      id: 'CS-001',
      title: 'API Manufacturing Process Change Assessment',
      product: 'Neuromax',
      type: 'Process Change',
      status: 'completed',
      startDate: '2024-11-15',
      endDate: '2025-02-10',
      methods: ['HPLC', 'DSC', 'FTIR', 'Particle Size'],
      outcome: 'comparable',
      owner: 'Sarah Johnson',
    },
    {
      id: 'CS-002',
      title: 'DP Manufacturing Site Transfer Comparability',
      product: 'Cardiostat',
      type: 'Site Transfer',
      status: 'in_progress',
      startDate: '2025-01-25',
      endDate: null,
      methods: ['Dissolution', 'Content Uniformity', 'Hardness', 'Disintegration'],
      outcome: null,
      owner: 'Michael Chen',
    },
    {
      id: 'CS-003',
      title: 'Raw Material Supplier Change Assessment',
      product: 'Neuromax',
      type: 'Supplier Change',
      status: 'completed',
      startDate: '2024-09-05',
      endDate: '2024-12-15',
      methods: ['HPLC', 'Karl Fischer', 'Elemental Impurities'],
      outcome: 'not_comparable',
      owner: 'Robert Smith',
    },
    {
      id: 'CS-004',
      title: 'Scale-Up Comparability for Commercial Production',
      product: 'Immunoboost',
      type: 'Scale-Up',
      status: 'in_progress',
      startDate: '2025-03-01',
      endDate: null,
      methods: ['Bioassay', 'SEC-HPLC', 'CEX-HPLC', 'Glycan Analysis'],
      outcome: null,
      owner: 'Amanda Wong',
    },
    {
      id: 'CS-005',
      title: 'Formulation Excipient Change Evaluation',
      product: 'Cardiostat',
      type: 'Formulation Change',
      status: 'planned',
      startDate: '2025-05-15',
      endDate: null,
      methods: ['Dissolution', 'Stability', 'Content Uniformity'],
      outcome: null,
      owner: 'James Wilson',
    },
    {
      id: 'CS-006',
      title: 'Container Closure System Change Assessment',
      product: 'Immunoboost',
      type: 'Packaging Change',
      status: 'completed',
      startDate: '2024-10-10',
      endDate: '2025-01-20',
      methods: ['Extractables/Leachables', 'Container Integrity', 'Stability'],
      outcome: 'comparable',
      owner: 'Emily Rodriguez',
    },
  ];

  // Filter studies based on active tab
  const filteredStudies = mockStudies.filter(study => {
    if (activeTab === 'active') {
      return study.status === 'in_progress' || study.status === 'planned';
    } else if (activeTab === 'completed') {
      return study.status === 'completed';
    }
    return true; // all tab
  });

  // Get counts for dashboard
  const plannedCount = mockStudies.filter(s => s.status === 'planned').length;
  const inProgressCount = mockStudies.filter(s => s.status === 'in_progress').length;
  const completedCount = mockStudies.filter(s => s.status === 'completed').length;
  const comparableCount = mockStudies.filter(s => s.outcome === 'comparable').length;
  const notComparableCount = mockStudies.filter(s => s.outcome === 'not_comparable').length;

  // Get status badge with appropriate styling
  const getStatusBadge = status => {
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
  const getOutcomeBadge = outcome => {
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

  return (
    <div className="comparability-studies-page p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Comparability Studies</h1>
          <p className="text-muted-foreground">
            Track and manage product comparability assessments
          </p>
        </div>
        <Button className="flex items-center">
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
            <div className="text-2xl font-bold">{mockStudies.length}</div>
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

      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Comparability Assessment by Product</CardTitle>
          <CardDescription>Visualization of comparability outcomes across products</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="border p-4 rounded-md bg-gray-50 text-center">
            <div className="flex items-center justify-center p-6">
              <BarChart className="h-48 w-full text-muted-foreground" />
            </div>
            <p className="text-muted-foreground text-sm">
              Comparability assessment chart would be displayed here
            </p>
          </div>
        </CardContent>
      </Card>

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
              {filteredStudies.map(study => (
                <TableRow key={study.id}>
                  <TableCell className="font-medium">{study.id}</TableCell>
                  <TableCell>{study.title}</TableCell>
                  <TableCell>{study.product}</TableCell>
                  <TableCell>{study.type}</TableCell>
                  <TableCell>{getStatusBadge(study.status)}</TableCell>
                  <TableCell>{study.startDate}</TableCell>
                  <TableCell>{study.endDate || '-'}</TableCell>
                  <TableCell>{getOutcomeBadge(study.outcome) || '-'}</TableCell>
                  <TableCell>{study.owner}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="sm" className="flex items-center">
                      <FileText className="h-4 w-4 mr-1" />
                      View
                      <ArrowRight className="h-3 w-3 ml-1" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {filteredStudies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="text-center py-8 text-muted-foreground">
                    No{' '}
                    {activeTab === 'active'
                      ? 'active'
                      : activeTab === 'completed'
                        ? 'completed'
                        : ''}{' '}
                    comparability studies found
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
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
              <li className="p-3 border rounded-md flex justify-between items-center hover:bg-gray-50 cursor-pointer">
                <div className="flex items-center">
                  <ClipboardList className="h-5 w-5 mr-3 text-blue-600" />
                  <span>API Manufacturing Process Change Protocol</span>
                </div>
                <Button variant="ghost" size="sm">
                  Use Template
                </Button>
              </li>
              <li className="p-3 border rounded-md flex justify-between items-center hover:bg-gray-50 cursor-pointer">
                <div className="flex items-center">
                  <ClipboardList className="h-5 w-5 mr-3 text-blue-600" />
                  <span>Site Transfer Comparability Protocol</span>
                </div>
                <Button variant="ghost" size="sm">
                  Use Template
                </Button>
              </li>
              <li className="p-3 border rounded-md flex justify-between items-center hover:bg-gray-50 cursor-pointer">
                <div className="flex items-center">
                  <ClipboardList className="h-5 w-5 mr-3 text-blue-600" />
                  <span>Raw Material Supplier Change Protocol</span>
                </div>
                <Button variant="ghost" size="sm">
                  Use Template
                </Button>
              </li>
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
            <ul className="space-y-2">
              <li className="p-3 border rounded-md flex justify-between items-center hover:bg-gray-50">
                <div className="flex items-center">
                  <span className="font-medium mr-2">CS-001:</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Submitted
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">FDA - March 15, 2025</span>
              </li>
              <li className="p-3 border rounded-md flex justify-between items-center hover:bg-gray-50">
                <div className="flex items-center">
                  <span className="font-medium mr-2">CS-003:</span>
                  <Badge
                    variant="outline"
                    className="bg-yellow-50 text-yellow-700 border-yellow-200"
                  >
                    In Preparation
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">FDA - Planned May 2025</span>
              </li>
              <li className="p-3 border rounded-md flex justify-between items-center hover:bg-gray-50">
                <div className="flex items-center">
                  <span className="font-medium mr-2">CS-006:</span>
                  <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                    Submitted
                  </Badge>
                </div>
                <span className="text-sm text-muted-foreground">EMA - February 8, 2025</span>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default ComparabilityStudiesStubPage;
