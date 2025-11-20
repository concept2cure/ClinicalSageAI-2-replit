import React, { useState } from 'react';
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
  Search,
  Plus,
  Calendar,
  FileText,
  ArrowRight,
  CheckCircle2,
  Clock,
  AlertTriangle,
  BarChart4,
  ThermometerSnowflake,
  Calculator,
  LineChart,
} from 'lucide-react';
import { Link } from 'wouter';

/**
 * Stability Studies Stub Page
 *
 * This page displays a list of stability studies without requiring API connection.
 * It includes:
 * - Study listing with key properties
 * - Status tracking
 * - Integration with shelf-life prediction
 */
const StabilityStudiesStubPage = () => {
  const [activeTab, setActiveTab] = useState('ongoing');
  const [searchTerm, setSearchTerm] = useState('');

  // Mock data for stability studies
  const mockStudies = [
    {
      id: 'STB-001',
      title: 'Long-term Storage Stability Assessment',
      product: 'Neuromax Tablets 10mg',
      type: 'Long-term',
      conditions: '25°C/60% RH',
      status: 'ongoing',
      startDate: '2024-10-15',
      duration: '36 months',
      timePoints: [0, 3, 6, 9, 12, 18, 24, 36],
      completedTimePoints: [0, 3, 6],
      batchNumbers: ['B2024-101', 'B2024-102', 'B2024-103'],
      owner: 'Sarah Johnson',
    },
    {
      id: 'STB-002',
      title: 'Accelerated Stability Study',
      product: 'Neuromax Tablets 10mg',
      type: 'Accelerated',
      conditions: '40°C/75% RH',
      status: 'ongoing',
      startDate: '2024-10-15',
      duration: '6 months',
      timePoints: [0, 1, 2, 3, 6],
      completedTimePoints: [0, 1, 2, 3],
      batchNumbers: ['B2024-101', 'B2024-102', 'B2024-103'],
      owner: 'Sarah Johnson',
    },
    {
      id: 'STB-003',
      title: 'Intermediate Stability Study',
      product: 'Neuromax Tablets 10mg',
      type: 'Intermediate',
      conditions: '30°C/65% RH',
      status: 'ongoing',
      startDate: '2024-10-15',
      duration: '12 months',
      timePoints: [0, 3, 6, 9, 12],
      completedTimePoints: [0, 3],
      batchNumbers: ['B2024-101', 'B2024-102', 'B2024-103'],
      owner: 'Sarah Johnson',
    },
    {
      id: 'STB-004',
      title: 'Long-term Storage Stability Assessment',
      product: 'Cardiostat Capsules 25mg',
      type: 'Long-term',
      conditions: '25°C/60% RH',
      status: 'ongoing',
      startDate: '2024-08-10',
      duration: '36 months',
      timePoints: [0, 3, 6, 9, 12, 18, 24, 36],
      completedTimePoints: [0, 3, 6],
      batchNumbers: ['B2024-054', 'B2024-055', 'B2024-056'],
      owner: 'Michael Chen',
    },
    {
      id: 'STB-005',
      title: 'In-use Stability Study',
      product: 'Immunoboost Injection',
      type: 'In-use',
      conditions: '5°C',
      status: 'completed',
      startDate: '2024-05-15',
      duration: '1 month',
      timePoints: [0, 7, 14, 21, 30],
      completedTimePoints: [0, 7, 14, 21, 30],
      batchNumbers: ['B2024-027', 'B2024-028'],
      owner: 'Robert Smith',
    },
    {
      id: 'STB-006',
      title: 'Photostability Study',
      product: 'Cardiostat Capsules 25mg',
      type: 'Photostability',
      conditions: 'Option 2 (ICH Q1B)',
      status: 'completed',
      startDate: '2024-06-10',
      duration: '10 days',
      timePoints: [0, 10],
      completedTimePoints: [0, 10],
      batchNumbers: ['B2024-054'],
      owner: 'Emily Rodriguez',
    },
    {
      id: 'STB-007',
      title: 'Freeze/Thaw Cycle Study',
      product: 'Immunoboost Injection',
      type: 'Cycling',
      conditions: '-20°C to 25°C',
      status: 'completed',
      startDate: '2024-07-05',
      duration: '21 days',
      timePoints: [0, 3, 7, 14, 21],
      completedTimePoints: [0, 3, 7, 14, 21],
      batchNumbers: ['B2024-039', 'B2024-040'],
      owner: 'Amanda Wong',
    },
    {
      id: 'STB-008',
      title: 'Shipping Simulation Study',
      product: 'Immunoboost Injection',
      type: 'Transport',
      conditions: 'ASTM D4169',
      status: 'planned',
      startDate: '2025-05-15',
      duration: '7 days',
      timePoints: [0, 7],
      completedTimePoints: [],
      batchNumbers: ['B2025-001', 'B2025-002'],
      owner: 'James Wilson',
    },
  ];

  // Filter studies based on active tab and search term
  const filteredStudies = mockStudies.filter(study => {
    const matchesTab =
      (activeTab === 'ongoing' && study.status === 'ongoing') ||
      (activeTab === 'completed' && study.status === 'completed') ||
      (activeTab === 'planned' && study.status === 'planned') ||
      activeTab === 'all';

    const matchesSearch =
      study.id.toLowerCase().includes(searchTerm.toLowerCase()) ||
      study.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      study.product.toLowerCase().includes(searchTerm.toLowerCase());

    return matchesTab && matchesSearch;
  });

  // Count studies by status
  const ongoingCount = mockStudies.filter(s => s.status === 'ongoing').length;
  const completedCount = mockStudies.filter(s => s.status === 'completed').length;
  const plannedCount = mockStudies.filter(s => s.status === 'planned').length;

  // Get status badge with appropriate styling
  const getStatusBadge = status => {
    switch (status) {
      case 'ongoing':
        return (
          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
            <Clock className="h-3 w-3 mr-1" /> Ongoing
          </Badge>
        );
      case 'completed':
        return (
          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
            <CheckCircle2 className="h-3 w-3 mr-1" /> Completed
          </Badge>
        );
      case 'planned':
        return (
          <Badge variant="outline" className="bg-gray-50 text-gray-700 border-gray-200">
            <Calendar className="h-3 w-3 mr-1" /> Planned
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200">
            <AlertTriangle className="h-3 w-3 mr-1" /> {status}
          </Badge>
        );
    }
  };

  // Calculate progress percentage
  const getProgressPercentage = study => {
    if (study.timePoints.length === 0) return 0;
    return Math.round((study.completedTimePoints.length / study.timePoints.length) * 100);
  };

  return (
    <div className="stability-studies-page p-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">Stability Studies</h1>
          <p className="text-muted-foreground">
            Manage product stability testing across different storage conditions
          </p>
        </div>
        <div className="flex gap-2">
          <Link href="/stability/shelf-life-predictor">
            <Button variant="outline" className="flex items-center">
              <Calculator className="h-4 w-4 mr-2" />
              Shelf-Life Predictor
            </Button>
          </Link>
          <Button className="flex items-center">
            <Plus className="h-4 w-4 mr-2" />
            New Stability Study
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Total Studies
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{mockStudies.length}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Ongoing</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-blue-600">{ongoingCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Completed</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{completedCount}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Planned</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-gray-500">{plannedCount}</div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        <Card className="col-span-1 lg:col-span-2">
          <CardHeader>
            <CardTitle>Stability Trends Overview</CardTitle>
            <CardDescription>Key stability indicators across products</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="border p-4 rounded-md bg-gray-50 min-h-[200px] flex items-center justify-center">
              <div className="text-center">
                <LineChart className="h-20 w-20 mx-auto text-muted-foreground mb-2" />
                <p className="text-muted-foreground">
                  Stability trend visualization would appear here
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="col-span-1">
          <CardHeader>
            <CardTitle>Upcoming Time Points</CardTitle>
            <CardDescription>Next scheduled stability assessments</CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-3">
              <li className="p-3 border rounded-md flex justify-between items-center">
                <div>
                  <div className="font-medium">STB-001: 9-month</div>
                  <div className="text-sm text-muted-foreground">Neuromax Tablets</div>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  Jul 15, 2025
                </Badge>
              </li>
              <li className="p-3 border rounded-md flex justify-between items-center">
                <div>
                  <div className="font-medium">STB-002: 6-month</div>
                  <div className="text-sm text-muted-foreground">Neuromax Tablets</div>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  Apr 15, 2025
                </Badge>
              </li>
              <li className="p-3 border rounded-md flex justify-between items-center">
                <div>
                  <div className="font-medium">STB-004: 9-month</div>
                  <div className="text-sm text-muted-foreground">Cardiostat Capsules</div>
                </div>
                <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                  May 10, 2025
                </Badge>
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Stability Studies</CardTitle>
          <div className="flex flex-wrap items-center justify-between gap-4 mt-4">
            <Tabs defaultValue="ongoing" value={activeTab} onValueChange={setActiveTab}>
              <TabsList>
                <TabsTrigger value="ongoing">Ongoing</TabsTrigger>
                <TabsTrigger value="completed">Completed</TabsTrigger>
                <TabsTrigger value="planned">Planned</TabsTrigger>
                <TabsTrigger value="all">All Studies</TabsTrigger>
              </TabsList>
            </Tabs>

            <div className="relative w-full max-w-sm">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search studies..."
                className="pl-8"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableCaption>
              List of {activeTab !== 'all' ? activeTab : ''} stability studies
            </TableCaption>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Title</TableHead>
                <TableHead>Product</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Conditions</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Start Date</TableHead>
                <TableHead>Progress</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredStudies.map(study => (
                <TableRow key={study.id}>
                  <TableCell className="font-medium">{study.id}</TableCell>
                  <TableCell>{study.title}</TableCell>
                  <TableCell>{study.product}</TableCell>
                  <TableCell>{study.type}</TableCell>
                  <TableCell>{study.conditions}</TableCell>
                  <TableCell>{getStatusBadge(study.status)}</TableCell>
                  <TableCell>{study.startDate}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full"
                          style={{ width: `${getProgressPercentage(study)}%` }}
                        ></div>
                      </div>
                      <span className="text-xs">{getProgressPercentage(study)}%</span>
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center">
                      <Button variant="ghost" size="sm" className="h-8 px-2">
                        <FileText className="h-4 w-4" />
                        <span className="sr-only">View</span>
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 px-2">
                        <BarChart4 className="h-4 w-4" />
                        <span className="sr-only">Results</span>
                      </Button>
                      <Button variant="ghost" size="sm" className="h-8 px-2">
                        <ThermometerSnowflake className="h-4 w-4" />
                        <span className="sr-only">Conditions</span>
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {filteredStudies.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="h-24 text-center">
                    No {activeTab !== 'all' ? activeTab : ''} stability studies found
                    {searchTerm && ` matching "${searchTerm}"`}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default StabilityStudiesStubPage;
