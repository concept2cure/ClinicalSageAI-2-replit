import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow, } from '@/components/ui/table';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger, } from '@/components/ui/accordion';
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue, } from '@/components/ui/select';
import {
  CalendarIcon, Check, CheckCircle2, ChevronRight, ClipboardList, Download, FileText, Filter, Folder, FolderPlus, HelpCircle, Link2, ListChecks, Plus, Search, Settings, Share2, ShieldAlert, ShieldCheck, Sparkles, Upload, Users, X, XCircle, AlertCircle, BarChart4, LineChart, PieChart, Cable, FileUp, Eye, Copy, Archive, Clock, Info, MoreHorizontal, Calendar, Star, StarHalf } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { format } from 'date-fns';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
} from '@/components/ui/command';

/**
 * Study Planner Page Component
 *
 * Provides a comprehensive interface for protocol deviation management
 * and Trial Master File (TMF) integration.
 */
const StudyPlanner = () => {
  const [activeTab, setActiveTab] = useState('deviation-log');
  const [deviations, setDeviations] = useState(generateMockDeviations());
  const [tmfDocuments, setTmfDocuments] = useState(generateMockTMFDocuments());
  const [showNewDeviationDialog, setShowNewDeviationDialog] = useState(false);
  const [selectedDeviation, setSelectedDeviation] = useState(null);
  const [newDeviationData, setNewDeviationData] = useState({
    title: '',
    description: '',
    protocol_section: '',
    impact_level: 'medium',
    site: '',
    reported_date: new Date(),
    status: 'open',
    capa_plan: '',
    preventative_measures: '',
  });
  const [showNewDocumentDialog, setShowNewDocumentDialog] = useState(false);
  const [newDocumentData, setNewDocumentData] = useState({
    title: '',
    type: '',
    zone: '',
    section: '',
    version: '1.0',
    status: 'draft',
    uploadDate: new Date(),
  });

  const [deviationStats, setDeviationStats] = useState({
    total: 24,
    open: 8,
    closed: 16,
    byCategory: {
      Protocol: 9,
      'Study Procedures': 6,
      'Informed Consent': 4,
      Eligibility: 3,
      Other: 2,
    },
    byImpact: {
      high: 4,
      medium: 14,
      low: 6,
    },
  });

  const { toast } = useToast();

  // Generate mock deviation data
  function generateMockDeviations() {
    return [
      {
        id: 'DEV-2024-001',
        title: 'Missed Laboratory Assessment at Visit 3',
        description:
          'Subject 1004 did not have the Week 8 chemistry panel collected during the scheduled visit.',
        protocol_section: 'Section 7.2.3 - Laboratory Assessments',
        impact_level: 'medium',
        site: 'Site 002 - Metro Medical Center',
        reported_date: '2024-03-15',
        status: 'open',
        capa_plan:
          'Site retraining completed on protocol requirements for laboratory assessments. Subject scheduled for additional visit within window to collect missing labs.',
        preventative_measures:
          'Updated site visit checklist to include verification of all required labs prior to subject departure. Monitoring frequency increased for this site.',
      },
      {
        id: 'DEV-2024-002',
        title: 'Inclusion Criteria Deviation',
        description:
          'Subject 2003 was enrolled despite not meeting inclusion criterion #4 (disease duration > 6 months).',
        protocol_section: 'Section 4.1 - Inclusion Criteria',
        impact_level: 'high',
        site: 'Site 003 - University Research Hospital',
        reported_date: '2024-03-10',
        status: 'closed',
        capa_plan:
          'Subject was discontinued from the study. Site PI and study coordinator received additional training on eligibility criteria.',
        preventative_measures:
          'Implemented enhanced eligibility verification process requiring second reviewer prior to randomization.',
      },
      {
        id: 'DEV-2024-003',
        title: 'Protocol-defined Visit Window Exceeded',
        description:
          'Subject 1008 completed Visit 5 seven days outside the protocol-defined visit window.',
        protocol_section: 'Section 6.1 - Schedule of Assessments',
        impact_level: 'low',
        site: 'Site 001 - Regional Medical Center',
        reported_date: '2024-02-22',
        status: 'closed',
        capa_plan:
          'Protocol deviation documented in subject file. All assessments were collected as required despite the timing deviation.',
        preventative_measures:
          'Site coordinators now receiving automated reminders for upcoming visit windows. More flexible scheduling options provided to subjects.',
      },
      {
        id: 'DEV-2024-004',
        title: 'Missing Informed Consent Documentation',
        description:
          'Unable to locate signed informed consent document for Subject 3002 during monitoring visit.',
        protocol_section: 'Section 10.1 - Informed Consent',
        impact_level: 'high',
        site: 'Site 004 - Community Research Associates',
        reported_date: '2024-04-02',
        status: 'open',
        capa_plan:
          'Urgent search for missing document in progress. If not found, ethics committee will be notified and appropriate steps taken.',
        preventative_measures:
          'Implementing electronic consent system to prevent future documentation loss. Required verification of consent prior to any study procedures.',
      },
      {
        id: 'DEV-2024-005',
        title: 'Medication Dispensing Error',
        description: 'Subject 2010 received incorrect study medication kit at Visit 2.',
        protocol_section: 'Section 5.5 - Study Drug Administration',
        impact_level: 'medium',
        site: 'Site 003 - University Research Hospital',
        reported_date: '2024-03-28',
        status: 'closed',
        capa_plan:
          'Error identified before subject took medication. Correct kit dispensed and subject instructed appropriately.',
        preventative_measures:
          'Updated medication dispensing procedure to include barcode verification of kit number against randomization system before providing to subject.',
      },
    ];
  }

  // Generate mock TMF documents data
  function generateMockTMFDocuments() {
    return [
      {
        id: 'TMF-001',
        title: 'Protocol v1.0',
        type: 'Protocol',
        description: 'Approved study protocol',
        zone: 'Trial Management',
        section: 'Essential Documents',
        version: '1.0',
        status: 'approved',
        uploadDate: '2024-01-10',
        approvalDate: '2024-01-15',
        fileSize: '2.3 MB',
        uploadedBy: 'John Smith',
        relatedDocuments: ['TMF-004', 'TMF-008'],
      },
      {
        id: 'TMF-002',
        title: 'Informed Consent Template',
        type: 'Informed Consent',
        description: 'Master ICF template for sites',
        zone: 'Ethics',
        section: 'Subject Information',
        version: '1.0',
        status: 'approved',
        uploadDate: '2024-01-12',
        approvalDate: '2024-01-18',
        fileSize: '1.5 MB',
        uploadedBy: 'Sarah Johnson',
        relatedDocuments: ['TMF-009'],
      },
      {
        id: 'TMF-003',
        title: 'Monitoring Plan',
        type: 'Plan',
        description: 'Clinical monitoring plan',
        zone: 'Monitoring',
        section: 'Oversight',
        version: '1.0',
        status: 'approved',
        uploadDate: '2024-01-20',
        approvalDate: '2024-01-25',
        fileSize: '1.8 MB',
        uploadedBy: 'Michael Brown',
        relatedDocuments: ['TMF-011'],
      },
      {
        id: 'TMF-004',
        title: 'Protocol Amendment 1',
        type: 'Protocol',
        description: 'First protocol amendment',
        zone: 'Trial Management',
        section: 'Essential Documents',
        version: '2.0',
        status: 'approved',
        uploadDate: '2024-02-15',
        approvalDate: '2024-02-28',
        fileSize: '2.5 MB',
        uploadedBy: 'John Smith',
        relatedDocuments: ['TMF-001', 'TMF-008'],
      },
      {
        id: 'TMF-005',
        title: 'Investigator Meeting Slides',
        type: 'Training',
        description: 'Presentation slides from investigator meeting',
        zone: 'Training',
        section: 'Investigator Training',
        version: '1.0',
        status: 'final',
        uploadDate: '2024-01-30',
        approvalDate: '2024-01-30',
        fileSize: '5.7 MB',
        uploadedBy: 'Lisa Williams',
        relatedDocuments: [],
      },
      {
        id: 'TMF-006',
        title: 'Safety Monitoring Committee Charter',
        type: 'Plan',
        description: 'SMC charter outlining responsibilities',
        zone: 'Safety',
        section: 'Oversight',
        version: '1.0',
        status: 'approved',
        uploadDate: '2024-01-22',
        approvalDate: '2024-02-01',
        fileSize: '1.2 MB',
        uploadedBy: 'Robert Chen',
        relatedDocuments: ['TMF-012'],
      },
      {
        id: 'TMF-007',
        title: 'Laboratory Manual',
        type: 'Manual',
        description: 'Central laboratory procedures manual',
        zone: 'Trial Management',
        section: 'Laboratory',
        version: '1.0',
        status: 'approved',
        uploadDate: '2024-01-25',
        approvalDate: '2024-02-02',
        fileSize: '4.3 MB',
        uploadedBy: 'Jennifer Adams',
        relatedDocuments: [],
      },
      {
        id: 'TMF-008',
        title: 'Protocol Amendment 2',
        type: 'Protocol',
        description: 'Second protocol amendment',
        zone: 'Trial Management',
        section: 'Essential Documents',
        version: '3.0',
        status: 'draft',
        uploadDate: '2024-03-10',
        approvalDate: null,
        fileSize: '2.6 MB',
        uploadedBy: 'John Smith',
        relatedDocuments: ['TMF-001', 'TMF-004'],
      },
    ];
  }

  // Handle new deviation submission
  const handleSubmitDeviation = () => {
    if (
      !newDeviationData.title ||
      !newDeviationData.description ||
      !newDeviationData.protocol_section
    ) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill out all required fields before submitting.',
        variant: 'destructive',
      });
      return;
    }

    const deviationId = selectedDeviation
      ? selectedDeviation.id
      : `DEV-2024-${String(deviations.length + 1).padStart(3, '0')}`;

    const newDeviation = {
      ...newDeviationData,
      id: deviationId,
      reported_date: format(newDeviationData.reported_date, 'yyyy-MM-dd'),
    };

    if (selectedDeviation) {
      // Update existing deviation
      setDeviations(deviations.map(dev => (dev.id === selectedDeviation.id ? newDeviation : dev)));

      toast({
        title: 'Deviation updated',
        description: `Protocol deviation ${deviationId} has been updated successfully.`,
        variant: 'default',
      });
    } else {
      // Add new deviation
      setDeviations([...deviations, newDeviation]);

      toast({
        title: 'Deviation logged',
        description: `Protocol deviation ${deviationId} has been logged successfully.`,
        variant: 'default',
      });
    }

    // Update stats
    setDeviationStats(prev => ({
      ...prev,
      total: prev.total + (selectedDeviation ? 0 : 1),
      open:
        newDeviationData.status === 'open'
          ? prev.open +
            (selectedDeviation && selectedDeviation.status !== 'open'
              ? 1
              : selectedDeviation
                ? 0
                : 1)
          : prev.open - (selectedDeviation && selectedDeviation.status === 'open' ? 1 : 0),
      closed:
        newDeviationData.status === 'closed'
          ? prev.closed +
            (selectedDeviation && selectedDeviation.status !== 'closed'
              ? 1
              : selectedDeviation
                ? 0
                : 1)
          : prev.closed - (selectedDeviation && selectedDeviation.status === 'closed' ? 1 : 0),
    }));

    // Reset form
    setShowNewDeviationDialog(false);
    setSelectedDeviation(null);
    setNewDeviationData({
      title: '',
      description: '',
      protocol_section: '',
      impact_level: 'medium',
      site: '',
      reported_date: new Date(),
      status: 'open',
      capa_plan: '',
      preventative_measures: '',
    });
  };

  // Handle editing a deviation
  const handleEditDeviation = deviation => {
    setSelectedDeviation(deviation);
    setNewDeviationData({
      ...deviation,
      reported_date: new Date(deviation.reported_date),
    });
    setShowNewDeviationDialog(true);
  };

  // Handle new TMF document submission
  const handleSubmitDocument = () => {
    if (!newDocumentData.title || !newDocumentData.type || !newDocumentData.zone) {
      toast({
        title: 'Missing required fields',
        description: 'Please fill out all required fields before submitting.',
        variant: 'destructive',
      });
      return;
    }

    const documentId = `TMF-${String(tmfDocuments.length + 1).padStart(3, '0')}`;

    const newDocument = {
      ...newDocumentData,
      id: documentId,
      uploadDate: format(newDocumentData.uploadDate, 'yyyy-MM-dd'),
      approvalDate: null,
      fileSize: '1.2 MB', // Mock file size
      uploadedBy: 'Current User',
      relatedDocuments: [],
    };

    setTmfDocuments([...tmfDocuments, newDocument]);

    toast({
      title: 'Document uploaded',
      description: `TMF document ${documentId} has been uploaded successfully.`,
      variant: 'default',
    });

    // Reset form
    setShowNewDocumentDialog(false);
    setNewDocumentData({
      title: '',
      type: '',
      zone: '',
      section: '',
      version: '1.0',
      status: 'draft',
      uploadDate: new Date(),
    });
  };

  return (
    <div className="container py-8 max-w-7xl mx-auto">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">Study Planner</h1>
        <p className="text-gray-600">
          Manage protocol deviations, TMF documents, and site monitoring activities
        </p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="deviation-log">
            <ShieldAlert className="h-4 w-4 mr-2" />
            Protocol Deviation Log
          </TabsTrigger>
          <TabsTrigger value="prevention-plan">
            <ShieldCheck className="h-4 w-4 mr-2" />
            Prevention Plan
          </TabsTrigger>
          <TabsTrigger value="tmf-documents">
            <Folder className="h-4 w-4 mr-2" />
            TMF Documents
          </TabsTrigger>
        </TabsList>

        {/* Protocol Deviation Log Tab */}
        <TabsContent value="deviation-log" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Protocol Deviation Log</h2>
              <p className="text-sm text-gray-500">
                Track and manage protocol deviations across all study sites
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Log
              </Button>
              <Button onClick={() => setShowNewDeviationDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Log New Deviation
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
            <div className="p-4 bg-blue-50 rounded-md flex items-center justify-between">
              <div>
                <div className="text-sm text-blue-600">Total Deviations</div>
                <div className="text-2xl font-bold">{deviationStats.total}</div>
              </div>
              <ClipboardList className="h-8 w-8 text-blue-500" />
            </div>

            <div className="p-4 bg-yellow-50 rounded-md flex items-center justify-between">
              <div>
                <div className="text-sm text-yellow-600">Open Deviations</div>
                <div className="text-2xl font-bold">{deviationStats.open}</div>
              </div>
              <AlertCircle className="h-8 w-8 text-yellow-500" />
            </div>

            <div className="p-4 bg-green-50 rounded-md flex items-center justify-between">
              <div>
                <div className="text-sm text-green-600">Closed Deviations</div>
                <div className="text-2xl font-bold">{deviationStats.closed}</div>
              </div>
              <CheckCircle2 className="h-8 w-8 text-green-500" />
            </div>

            <div className="p-4 bg-purple-50 rounded-md flex items-center justify-between">
              <div>
                <div className="text-sm text-purple-600">High Impact</div>
                <div className="text-2xl font-bold">{deviationStats.byImpact.high}</div>
              </div>
              <BarChart4 className="h-8 w-8 text-purple-500" />
            </div>
          </div>

          <Card>
            <CardHeader className="px-6 py-4">
              <div className="flex justify-between items-center">
                <CardTitle>Current Deviations</CardTitle>
                <div className="flex gap-2">
                  <div className="relative w-64">
                    <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                    <Input placeholder="Search deviations..." className="pl-8" />
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm">
                        <Settings className="h-4 w-4 mr-2" />
                        Filter
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-56">
                      <DropdownMenuLabel>Filter By</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <div className="flex items-center justify-between w-full">
                          <span>Status: Open</span>
                          <Check className="h-4 w-4" />
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <span>Status: Closed</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem>
                        <div className="flex items-center justify-between w-full">
                          <span>Impact: High</span>
                          <Check className="h-4 w-4" />
                        </div>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <span>Impact: Medium</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem>
                        <span>Impact: Low</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>ID</TableHead>
                    <TableHead>Title</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Impact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date Reported</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deviations.map(deviation => (
                    <TableRow key={deviation.id}>
                      <TableCell className="font-medium">{deviation.id}</TableCell>
                      <TableCell>{deviation.title}</TableCell>
                      <TableCell>
                        {deviation.site ? deviation.site.split(' - ')[0] : 'N/A'}
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            deviation.impact_level === 'high'
                              ? 'bg-red-100 text-red-800'
                              : deviation.impact_level === 'medium'
                                ? 'bg-yellow-100 text-yellow-800'
                                : 'bg-blue-100 text-blue-800'
                          }
                        >
                          {deviation.impact_level.charAt(0).toUpperCase() +
                            deviation.impact_level.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge
                          className={
                            deviation.status === 'open'
                              ? 'bg-yellow-100 text-yellow-800'
                              : 'bg-green-100 text-green-800'
                          }
                        >
                          {deviation.status.charAt(0).toUpperCase() + deviation.status.slice(1)}
                        </Badge>
                      </TableCell>
                      <TableCell>{deviation.reported_date}</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEditDeviation(deviation)}>
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem>View Details</DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem>
                              {deviation.status === 'open' ? 'Close Deviation' : 'Reopen Deviation'}
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
            <CardFooter className="flex justify-between px-6 py-4">
              <div className="text-sm text-gray-500">
                Showing {deviations.length} of {deviations.length} deviations
              </div>
              <div className="flex gap-1">
                <Button variant="outline" size="sm" disabled>
                  Previous
                </Button>
                <Button variant="outline" size="sm" disabled>
                  Next
                </Button>
              </div>
            </CardFooter>
          </Card>
        </TabsContent>

        {/* Prevention Plan Tab */}
        <TabsContent value="prevention-plan" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Protocol Deviation Prevention Plan</h2>
              <p className="text-sm text-gray-500">
                Proactive measures to minimize protocol deviations
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Download className="h-4 w-4 mr-2" />
                Export Plan
              </Button>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Measure
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle>Prevention Measures by Category</CardTitle>
                <CardDescription>
                  Targeted prevention strategies based on deviation categories
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Accordion type="single" collapsible className="w-full">
                  <AccordionItem value="eligibility">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center">
                        <Badge className="mr-2 bg-blue-100 text-blue-800">High Risk</Badge>
                        Eligibility Criteria
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pl-4">
                        <div className="border-l-2 border-blue-500 pl-4">
                          <h4 className="font-medium">Double Review of Eligibility</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Implement a dual review process for all subject eligibility assessments,
                            requiring sign-off from both the investigator and study coordinator
                            before randomization.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Site PI, Study Coordinator</span>
                          </div>
                        </div>

                        <div className="border-l-2 border-blue-500 pl-4">
                          <h4 className="font-medium">Eligibility Checklist Implementation</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Develop comprehensive eligibility checklists with required source
                            documentation for each criterion listed. Require completion before
                            subject enrollment.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Clinical Operations</span>
                          </div>
                        </div>

                        <div className="border-l-2 border-blue-500 pl-4">
                          <h4 className="font-medium">Pre-Screening Log Review</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Implement weekly review of pre-screening logs to identify potential
                            eligibility issues before formal screening visits.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Clinical Research Associates</span>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="informed_consent">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center">
                        <Badge className="mr-2 bg-blue-100 text-blue-800">High Risk</Badge>
                        Informed Consent Process
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pl-4">
                        <div className="border-l-2 border-blue-500 pl-4">
                          <h4 className="font-medium">Consent Process Training</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Conduct specialized training for all sites on informed consent
                            documentation requirements, including video training and role-playing
                            exercises.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Clinical Operations</span>
                          </div>
                        </div>

                        <div className="border-l-2 border-blue-500 pl-4">
                          <h4 className="font-medium">Consent Verification Call</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Implement post-consent verification calls for remote monitoring of the
                            consent process quality and participant understanding.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Clinical Research Associates</span>
                          </div>
                        </div>

                        <div className="border-l-2 border-blue-500 pl-4">
                          <h4 className="font-medium">Electronic Consent System</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Implement eConsent system with automated checks for completeness and
                            proper documentation.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Data Management</span>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="medication">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center">
                        <Badge className="mr-2 bg-yellow-100 text-yellow-800">Medium Risk</Badge>
                        Study Medication
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pl-4">
                        <div className="border-l-2 border-yellow-500 pl-4">
                          <h4 className="font-medium">IWRS Verification Process</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Implement dual-verification process for all IWRS transactions, requiring
                            two staff members to confirm correct kit assignment before dispensing.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Site Pharmacy, Study Coordinator</span>
                          </div>
                        </div>

                        <div className="border-l-2 border-yellow-500 pl-4">
                          <h4 className="font-medium">Medication Handling Training</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Conduct specialized training on study drug handling, storage, and
                            accountability procedures for all site staff involved.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Clinical Operations</span>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="procedures">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center">
                        <Badge className="mr-2 bg-yellow-100 text-yellow-800">Medium Risk</Badge>
                        Study Procedures
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pl-4">
                        <div className="border-l-2 border-yellow-500 pl-4">
                          <h4 className="font-medium">Visit Checklist Implementation</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Develop visit-specific checklists detailing all required procedures and
                            assessments for each protocol-defined visit.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Clinical Operations</span>
                          </div>
                        </div>

                        <div className="border-l-2 border-yellow-500 pl-4">
                          <h4 className="font-medium">EDC Edit Checks</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Implement real-time edit checks in the EDC system to flag missing or
                            out-of-range data at the time of entry.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Data Management</span>
                          </div>
                        </div>

                        <div className="border-l-2 border-yellow-500 pl-4">
                          <h4 className="font-medium">Central Laboratory Notifications</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Implement automated notification system for missing laboratory samples
                            or results.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Central Laboratory, Data Management</span>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="visit_windows">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center">
                        <Badge className="mr-2 bg-blue-100 text-blue-800">Low Risk</Badge>
                        Visit Windows
                      </div>
                    </AccordionTrigger>
                    <AccordionContent>
                      <div className="space-y-4 pl-4">
                        <div className="border-l-2 border-green-500 pl-4">
                          <h4 className="font-medium">Visit Scheduling Calendar</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Implement centralized visit scheduling system with automated reminders
                            for upcoming visits and visit window boundaries.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Study Coordinators</span>
                          </div>
                        </div>

                        <div className="border-l-2 border-green-500 pl-4">
                          <h4 className="font-medium">Subject Reminder System</h4>
                          <p className="text-sm text-gray-600 mt-1">
                            Implement automated subject reminder system (SMS/email) for upcoming
                            visits with configurable lead times.
                          </p>
                          <div className="flex items-center mt-2 text-sm text-gray-500">
                            <Users className="h-4 w-4 mr-1" />
                            <span>Responsible: Clinical Operations</span>
                          </div>
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Prevention Planning Metrics</CardTitle>
                <CardDescription>
                  Monitor the effectiveness of prevention strategies
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">Eligibility Deviations</span>
                    <span className="text-sm font-medium text-green-600">-42%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: '58%' }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Since prevention plan implementation</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">Informed Consent Deviations</span>
                    <span className="text-sm font-medium text-green-600">-35%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: '65%' }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Since prevention plan implementation</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">Study Medication Deviations</span>
                    <span className="text-sm font-medium text-green-600">-28%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: '72%' }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Since prevention plan implementation</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-sm font-medium">Overall Deviation Rate</span>
                    <span className="text-sm font-medium text-green-600">-31%</span>
                  </div>
                  <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500" style={{ width: '69%' }}></div>
                  </div>
                  <div className="flex justify-between text-xs text-gray-500 mt-1">
                    <span>Since prevention plan implementation</span>
                  </div>
                </div>

                <div className="bg-blue-50 p-3 rounded-md mt-4">
                  <div className="flex items-start">
                    <Info className="h-5 w-5 text-blue-500 mr-2 flex-shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-sm font-medium text-blue-800">Prevention Plan Impact</h4>
                      <p className="text-xs text-blue-700 mt-1">
                        Prevention measures have reduced overall protocol deviations by 31% since
                        implementation, with the most significant impact seen in eligibility
                        criteria deviations.
                      </p>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Site-Specific Prevention Measures</CardTitle>
              <CardDescription>
                Targeted prevention strategies based on site-specific deviation patterns
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Site</TableHead>
                    <TableHead>Risk Level</TableHead>
                    <TableHead>Top Deviation Category</TableHead>
                    <TableHead>Preventative Measures</TableHead>
                    <TableHead>Implementation Status</TableHead>
                    <TableHead>Last Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  <TableRow>
                    <TableCell className="font-medium">Site 001</TableCell>
                    <TableCell>
                      <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>
                    </TableCell>
                    <TableCell>Visit Windows</TableCell>
                    <TableCell>
                      <ul className="list-disc list-inside text-sm">
                        <li>Enhanced visit scheduling system</li>
                        <li>Weekly coordinator check-in calls</li>
                      </ul>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800">Implemented</Badge>
                    </TableCell>
                    <TableCell>2024-03-10</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium">Site 002</TableCell>
                    <TableCell>
                      <Badge className="bg-red-100 text-red-800">High</Badge>
                    </TableCell>
                    <TableCell>Laboratory Procedures</TableCell>
                    <TableCell>
                      <ul className="list-disc list-inside text-sm">
                        <li>Visit checklist implementation</li>
                        <li>Lab coordinator training program</li>
                        <li>Bi-weekly monitoring visits</li>
                      </ul>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-green-100 text-green-800">Implemented</Badge>
                    </TableCell>
                    <TableCell>2024-03-22</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium">Site 003</TableCell>
                    <TableCell>
                      <Badge className="bg-yellow-100 text-yellow-800">Medium</Badge>
                    </TableCell>
                    <TableCell>Eligibility Criteria</TableCell>
                    <TableCell>
                      <ul className="list-disc list-inside text-sm">
                        <li>Dual eligibility verification process</li>
                        <li>PI training refresher</li>
                      </ul>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-yellow-100 text-yellow-800">In Progress</Badge>
                    </TableCell>
                    <TableCell>2024-04-05</TableCell>
                  </TableRow>

                  <TableRow>
                    <TableCell className="font-medium">Site 004</TableCell>
                    <TableCell>
                      <Badge className="bg-red-100 text-red-800">High</Badge>
                    </TableCell>
                    <TableCell>Informed Consent</TableCell>
                    <TableCell>
                      <ul className="list-disc list-inside text-sm">
                        <li>eConsent implementation</li>
                        <li>Consent process retraining</li>
                        <li>Remote consent monitoring</li>
                      </ul>
                    </TableCell>
                    <TableCell>
                      <Badge className="bg-blue-100 text-blue-800">Planned</Badge>
                    </TableCell>
                    <TableCell>2024-04-15</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TMF Documents Tab */}
        <TabsContent value="tmf-documents" className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">Trial Master File Documents</h2>
              <p className="text-sm text-gray-500">
                Manage and organize all essential study documents
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline">
                <Link2 className="h-4 w-4 mr-2" />
                TMF Portal
              </Button>
              <Button onClick={() => setShowNewDocumentDialog(true)}>
                <Plus className="h-4 w-4 mr-2" />
                Add Document
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <Card className="md:col-span-3">
              <CardHeader className="px-6 py-4">
                <div className="flex justify-between items-center">
                  <CardTitle>Document Repository</CardTitle>
                  <div className="flex gap-2">
                    <div className="relative w-64">
                      <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                      <Input placeholder="Search documents..." className="pl-8" />
                    </div>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="outline" size="sm">
                          <Filter className="h-4 w-4 mr-2" />
                          Filter
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-56">
                        <DropdownMenuLabel>Filter By</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <div className="flex items-center justify-between w-full">
                            <span>Status: Approved</span>
                            <Check className="h-4 w-4" />
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <span>Status: Draft</span>
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem>
                          <div className="flex items-center justify-between w-full">
                            <span>Type: Protocol</span>
                            <Check className="h-4 w-4" />
                          </div>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <span>Type: Informed Consent</span>
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                          <span>Type: Plan</span>
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Version</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Upload Date</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tmfDocuments.map(document => (
                      <TableRow key={document.id}>
                        <TableCell className="font-medium">{document.title}</TableCell>
                        <TableCell>{document.type}</TableCell>
                        <TableCell>v{document.version}</TableCell>
                        <TableCell>
                          <Badge
                            className={
                              document.status === 'approved'
                                ? 'bg-green-100 text-green-800'
                                : document.status === 'final'
                                  ? 'bg-blue-100 text-blue-800'
                                  : 'bg-yellow-100 text-yellow-800'
                            }
                          >
                            {document.status.charAt(0).toUpperCase() + document.status.slice(1)}
                          </Badge>
                        </TableCell>
                        <TableCell>{document.uploadDate}</TableCell>
                        <TableCell className="text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem>
                                <Eye className="h-4 w-4 mr-2" />
                                View
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Download className="h-4 w-4 mr-2" />
                                Download
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <FileUp className="h-4 w-4 mr-2" />
                                Upload New Version
                              </DropdownMenuItem>
                              <DropdownMenuItem>
                                <Copy className="h-4 w-4 mr-2" />
                                Copy Link
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem>
                                <Archive className="h-4 w-4 mr-2" />
                                Archive
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
              <CardFooter className="flex justify-between px-6 py-4">
                <div className="text-sm text-gray-500">
                  Showing {tmfDocuments.length} of {tmfDocuments.length} documents
                </div>
                <div className="flex gap-1">
                  <Button variant="outline" size="sm" disabled>
                    Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled>
                    Next
                  </Button>
                </div>
              </CardFooter>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">TMF Metrics</CardTitle>
                </CardHeader>
                <CardContent className="py-0">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span>Total Documents</span>
                      <span className="font-medium">{tmfDocuments.length}</span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Approved Documents</span>
                      <span className="font-medium">
                        {tmfDocuments.filter(d => d.status === 'approved').length}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>Draft Documents</span>
                      <span className="font-medium">
                        {tmfDocuments.filter(d => d.status === 'draft').length}
                      </span>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span>TMF Completeness</span>
                      <span className="font-medium">84%</span>
                    </div>
                  </div>

                  <div className="h-1 bg-gray-100 rounded-full overflow-hidden mt-4">
                    <div className="h-full bg-green-500" style={{ width: '84%' }}></div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Recent Activity</CardTitle>
                </CardHeader>
                <CardContent className="py-0 space-y-3">
                  <div className="border-l-2 border-blue-500 pl-3">
                    <div className="text-xs text-gray-500 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      <span>Today, 9:45 AM</span>
                    </div>
                    <div className="text-sm">Protocol Amendment 2 uploaded</div>
                  </div>

                  <div className="border-l-2 border-green-500 pl-3">
                    <div className="text-xs text-gray-500 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      <span>Yesterday, 3:12 PM</span>
                    </div>
                    <div className="text-sm">Safety Monitoring Charter approved</div>
                  </div>

                  <div className="border-l-2 border-purple-500 pl-3">
                    <div className="text-xs text-gray-500 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      <span>Apr 12, 2024</span>
                    </div>
                    <div className="text-sm">3 site-specific ICFs uploaded</div>
                  </div>

                  <div className="border-l-2 border-orange-500 pl-3">
                    <div className="text-xs text-gray-500 flex items-center">
                      <Clock className="h-3 w-3 mr-1" />
                      <span>Apr 10, 2024</span>
                    </div>
                    <div className="text-sm">Statistical Analysis Plan updated to v2.0</div>
                  </div>
                </CardContent>
                <CardFooter className="pt-0 pb-3">
                  <Button variant="ghost" size="sm" className="w-full text-xs">
                    View All Activity
                  </Button>
                </CardFooter>
              </Card>

              <Card>
                <CardHeader className="py-3">
                  <CardTitle className="text-sm">Upcoming Deadlines</CardTitle>
                </CardHeader>
                <CardContent className="py-0 space-y-3">
                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-red-500 mr-2" />
                    <div>
                      <div className="text-sm font-medium">Apr 28, 2024</div>
                      <div className="text-xs text-gray-500">DSMB Charter Review Due</div>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-yellow-500 mr-2" />
                    <div>
                      <div className="text-sm font-medium">May 10, 2024</div>
                      <div className="text-xs text-gray-500">Annual Protocol Review</div>
                    </div>
                  </div>

                  <div className="flex items-center">
                    <Calendar className="h-4 w-4 text-blue-500 mr-2" />
                    <div>
                      <div className="text-sm font-medium">May 15, 2024</div>
                      <div className="text-xs text-gray-500">IRB Continuing Review</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* New Deviation Dialog */}
      <Dialog open={showNewDeviationDialog} onOpenChange={setShowNewDeviationDialog}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>
              {selectedDeviation ? 'Edit Protocol Deviation' : 'Log New Protocol Deviation'}
            </DialogTitle>
            <DialogDescription>
              {selectedDeviation
                ? 'Update the details of the existing protocol deviation'
                : 'Enter the details of the protocol deviation to log and track it'}
            </DialogDescription>
          </DialogHeader>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Deviation Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={newDeviationData.title}
                onChange={e => setNewDeviationData({ ...newDeviationData, title: e.target.value })}
                placeholder="Brief title describing the deviation"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="protocol_section">
                Protocol Section <span className="text-red-500">*</span>
              </Label>
              <Input
                id="protocol_section"
                value={newDeviationData.protocol_section}
                onChange={e =>
                  setNewDeviationData({ ...newDeviationData, protocol_section: e.target.value })
                }
                placeholder="e.g., Section 4.2 - Exclusion Criteria"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="description">
                Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="description"
                value={newDeviationData.description}
                onChange={e =>
                  setNewDeviationData({ ...newDeviationData, description: e.target.value })
                }
                placeholder="Detailed description of the protocol deviation"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="impact_level">Impact Level</Label>
              <Select
                value={newDeviationData.impact_level}
                onValueChange={value =>
                  setNewDeviationData({ ...newDeviationData, impact_level: value })
                }
              >
                <SelectTrigger id="impact_level">
                  <SelectValue placeholder="Select impact level" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="high">High</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="site">Site</Label>
              <Input
                id="site"
                value={newDeviationData.site}
                onChange={e => setNewDeviationData({ ...newDeviationData, site: e.target.value })}
                placeholder="e.g., Site 001 - Metro Medical Center"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="reported_date">Date Reported</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {newDeviationData.reported_date ? (
                      format(newDeviationData.reported_date, 'PPP')
                    ) : (
                      <span>Pick a date</span>
                    )}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <CalendarComponent
                    mode="single"
                    selected={newDeviationData.reported_date}
                    onSelect={date =>
                      setNewDeviationData({ ...newDeviationData, reported_date: date })
                    }
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={newDeviationData.status}
                onValueChange={value => setNewDeviationData({ ...newDeviationData, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="capa_plan">CAPA Plan</Label>
              <Textarea
                id="capa_plan"
                value={newDeviationData.capa_plan}
                onChange={e =>
                  setNewDeviationData({ ...newDeviationData, capa_plan: e.target.value })
                }
                placeholder="Corrective and preventive action plan"
                rows={3}
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="preventative_measures">Preventative Measures</Label>
              <Textarea
                id="preventative_measures"
                value={newDeviationData.preventative_measures}
                onChange={e =>
                  setNewDeviationData({
                    ...newDeviationData,
                    preventative_measures: e.target.value,
                  })
                }
                placeholder="Measures to prevent similar deviations in the future"
                rows={3}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDeviationDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitDeviation}>
              {selectedDeviation ? 'Update Deviation' : 'Log Deviation'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* New TMF Document Dialog */}
      <Dialog open={showNewDocumentDialog} onOpenChange={setShowNewDocumentDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New TMF Document</DialogTitle>
            <DialogDescription>Upload a new document to the Trial Master File</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="title">
                Document Title <span className="text-red-500">*</span>
              </Label>
              <Input
                id="title"
                value={newDocumentData.title}
                onChange={e => setNewDocumentData({ ...newDocumentData, title: e.target.value })}
                placeholder="Document title"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="type">
                  Document Type <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={newDocumentData.type}
                  onValueChange={value => setNewDocumentData({ ...newDocumentData, type: value })}
                >
                  <SelectTrigger id="type">
                    <SelectValue placeholder="Select type" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Protocol">Protocol</SelectItem>
                    <SelectItem value="Informed Consent">Informed Consent</SelectItem>
                    <SelectItem value="Plan">Plan</SelectItem>
                    <SelectItem value="Manual">Manual</SelectItem>
                    <SelectItem value="Training">Training</SelectItem>
                    <SelectItem value="Report">Report</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="version">Version</Label>
                <Input
                  id="version"
                  value={newDocumentData.version}
                  onChange={e =>
                    setNewDocumentData({ ...newDocumentData, version: e.target.value })
                  }
                  placeholder="e.g., 1.0"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="zone">
                  TMF Zone <span className="text-red-500">*</span>
                </Label>
                <Select
                  value={newDocumentData.zone}
                  onValueChange={value => setNewDocumentData({ ...newDocumentData, zone: value })}
                >
                  <SelectTrigger id="zone">
                    <SelectValue placeholder="Select zone" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Trial Management">Trial Management</SelectItem>
                    <SelectItem value="Ethics">Ethics</SelectItem>
                    <SelectItem value="Regulatory">Regulatory</SelectItem>
                    <SelectItem value="Safety">Safety</SelectItem>
                    <SelectItem value="Clinical">Clinical</SelectItem>
                    <SelectItem value="Monitoring">Monitoring</SelectItem>
                    <SelectItem value="Training">Training</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="section">TMF Section</Label>
                <Input
                  id="section"
                  value={newDocumentData.section}
                  onChange={e =>
                    setNewDocumentData({ ...newDocumentData, section: e.target.value })
                  }
                  placeholder="e.g., Essential Documents"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={newDocumentData.status}
                onValueChange={value => setNewDocumentData({ ...newDocumentData, status: value })}
              >
                <SelectTrigger id="status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="final">Final</SelectItem>
                  <SelectItem value="approved">Approved</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Upload Document</Label>
              <div className="border-2 border-dashed rounded-md p-4 flex flex-col items-center justify-center text-center">
                <Upload className="h-8 w-8 text-gray-300 mb-2" />
                <p className="text-sm text-gray-500 mb-2">
                  Drag and drop your file here, or click to browse
                </p>
                <Button size="sm" variant="outline">
                  Choose File
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowNewDocumentDialog(false)}>
              Cancel
            </Button>
            <Button onClick={handleSubmitDocument}>Upload Document</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default StudyPlanner;
