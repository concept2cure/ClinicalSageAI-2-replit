/**
 * Regulatory Project Details
 *
 * This component displays detailed information about a specific regulatory project,
 * whether it's an IND application or eCTD submission. It provides access to all
 * project-specific functions and shows the current status of each section.
 *
 * It serves as a bridge between the IND Wizard and eCTD modules, allowing files
 * and data to flow between them seamlessly.
 */

import React, { useState, useEffect } from 'react';
import {
  ChevronLeft,
  Calendar,
  Users,
  Clock,
  FileCheck,
  FileText,
  FileWarning,
  CheckCircle2,
  AlertCircle,
  Lock,
  Unlock,
  FileStack,
  ArrowRight,
  BookOpen,
  Clipboard,
  Beaker,
  Microscope,
  Stethoscope,
  Upload,
  Download,
  Edit3,
  Layers,
  ChevronRight,
  ExternalLink,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import { useLocation, useParams } from 'wouter';

// Import our stability monitoring hooks
import { useNetworkResilience } from '@/hooks/useNetworkResilience';
import { useHealthMonitor } from '@/hooks/useHealthMonitor';

// Mock data - in a real application, this would come from an API
const getProjectData = projectId => {
  // IND projects
  if (projectId === 'prj-001') {
    return {
      id: 'prj-001',
      name: 'XYZ-123 Initial IND',
      type: 'ind',
      stage: 'preparation',
      progress: 68,
      createdAt: '2025-03-15T10:00:00Z',
      updatedAt: '2025-04-28T14:30:00Z',
      status: 'in-progress',
      owner: 'John Smith',
      dueDate: '2025-06-15',
      description:
        'Initial IND submission for XYZ-123, a novel treatment for rheumatoid arthritis.',
      drugInfo: {
        name: 'XYZ-123',
        indication: 'Rheumatoid Arthritis',
        mechanism: 'JAK1/JAK2 inhibitor',
        formulation: 'Oral tablet, 10mg and 25mg',
        sponsor: 'XYZ Pharmaceuticals, Inc.',
      },
      team: [
        { name: 'John Smith', role: 'Project Manager', email: 'john.smith@example.com' },
        { name: 'Sarah Williams', role: 'Regulatory Expert', email: 'sarah.williams@example.com' },
        { name: 'Michael Johnson', role: 'CMC Lead', email: 'michael.johnson@example.com' },
      ],
      sections: [
        {
          id: 'forms',
          name: 'FDA Forms',
          status: 'completed',
          progress: 100,
          subsections: [
            { id: 'form-1571', name: 'Form FDA 1571', status: 'completed', progress: 100 },
            { id: 'form-1572', name: 'Form FDA 1572', status: 'completed', progress: 100 },
            { id: 'form-3674', name: 'Form FDA 3674', status: 'completed', progress: 100 },
          ],
        },
        {
          id: 'cover',
          name: 'Cover Letter and TOC',
          status: 'completed',
          progress: 100,
          subsections: [
            { id: 'cover-letter', name: 'Cover Letter', status: 'completed', progress: 100 },
            { id: 'toc', name: 'Table of Contents', status: 'completed', progress: 100 },
          ],
        },
        {
          id: 'cmc',
          name: 'Chemistry, Manufacturing, and Controls',
          status: 'in-progress',
          progress: 45,
          subsections: [
            { id: 'cmc-substance', name: 'Drug Substance', status: 'completed', progress: 100 },
            { id: 'cmc-product', name: 'Drug Product', status: 'in-progress', progress: 75 },
            {
              id: 'cmc-manufacturing',
              name: 'Manufacturing Process',
              status: 'in-progress',
              progress: 30,
            },
            {
              id: 'cmc-controls',
              name: 'Controls and Testing',
              status: 'not-started',
              progress: 0,
            },
            { id: 'cmc-stability', name: 'Stability Data', status: 'not-started', progress: 0 },
          ],
        },
        {
          id: 'nonclinical',
          name: 'Nonclinical Pharmacology/Toxicology',
          status: 'completed',
          progress: 100,
          subsections: [
            { id: 'nonc-pharmacology', name: 'Pharmacology', status: 'completed', progress: 100 },
            { id: 'nonc-pk', name: 'Pharmacokinetics', status: 'completed', progress: 100 },
            { id: 'nonc-toxicology', name: 'Toxicology', status: 'completed', progress: 100 },
          ],
        },
        {
          id: 'clinical',
          name: 'Clinical Protocol',
          status: 'in-progress',
          progress: 75,
          subsections: [
            {
              id: 'protocol-synopsis',
              name: 'Protocol Synopsis',
              status: 'completed',
              progress: 100,
            },
            {
              id: 'protocol-objectives',
              name: 'Objectives and Endpoints',
              status: 'completed',
              progress: 100,
            },
            {
              id: 'protocol-eligibility',
              name: 'Eligibility Criteria',
              status: 'completed',
              progress: 100,
            },
            { id: 'protocol-design', name: 'Study Design', status: 'completed', progress: 100 },
            {
              id: 'protocol-procedures',
              name: 'Study Procedures',
              status: 'in-progress',
              progress: 80,
            },
            {
              id: 'protocol-safety',
              name: 'Safety Assessments',
              status: 'in-progress',
              progress: 65,
            },
            {
              id: 'protocol-stats',
              name: 'Statistical Analysis',
              status: 'not-started',
              progress: 0,
            },
          ],
        },
        {
          id: 'investigator',
          name: 'Investigator Information',
          status: 'in-progress',
          progress: 50,
          subsections: [
            { id: 'inv-cv', name: 'Investigator CVs', status: 'in-progress', progress: 50 },
            {
              id: 'inv-facilities',
              name: 'Facility Information',
              status: 'in-progress',
              progress: 50,
            },
          ],
        },
      ],
      validationResults: [
        {
          level: 'error',
          message: 'Missing stability data in CMC section',
          section: 'cmc-stability',
        },
        {
          level: 'warning',
          message: 'Protocol statistical analysis needs completion',
          section: 'protocol-stats',
        },
        {
          level: 'info',
          message: 'Investigator CVs need updating with recent publications',
          section: 'inv-cv',
        },
      ],
      documents: [
        {
          id: 'doc-001',
          name: 'Form FDA 1571.pdf',
          section: 'forms',
          uploadedAt: '2025-03-20T09:15:00Z',
          status: 'final',
        },
        {
          id: 'doc-002',
          name: 'Cover Letter.pdf',
          section: 'cover',
          uploadedAt: '2025-03-21T10:30:00Z',
          status: 'final',
        },
        {
          id: 'doc-003',
          name: 'XYZ-123 Toxicology Report.pdf',
          section: 'nonclinical',
          uploadedAt: '2025-03-25T14:45:00Z',
          status: 'final',
        },
        {
          id: 'doc-004',
          name: 'Protocol v0.9.docx',
          section: 'clinical',
          uploadedAt: '2025-04-15T11:20:00Z',
          status: 'draft',
        },
      ],
      timeline: [
        {
          date: '2025-03-15',
          title: 'Project Initiated',
          description: 'IND project created in system',
        },
        {
          date: '2025-04-01',
          title: 'Forms Section Completed',
          description: 'All required FDA forms completed and verified',
        },
        {
          date: '2025-04-10',
          title: 'Nonclinical Section Completed',
          description: 'All nonclinical data compiled and reviewed',
        },
        {
          date: '2025-06-15',
          title: 'Submission Deadline',
          description: 'Target date for IND submission to FDA',
          status: 'upcoming',
        },
      ],
    };
  }
  // eCTD projects
  else if (projectId === 'prj-002') {
    return {
      id: 'prj-002',
      name: 'ABC-456 eCTD Submission',
      type: 'ectd',
      stage: 'assembly',
      progress: 82,
      createdAt: '2025-02-10T09:15:00Z',
      updatedAt: '2025-04-27T11:45:00Z',
      status: 'in-progress',
      owner: 'Jane Doe',
      dueDate: '2025-05-30',
      description:
        'Phase 3 trial results and supporting documentation for ABC-456, a novel anti-inflammatory agent.',
      drugInfo: {
        name: 'ABC-456',
        indication: "Crohn's Disease",
        mechanism: 'IL-23 inhibitor',
        formulation: 'Subcutaneous injection, 150mg/mL',
        sponsor: 'ABC Biopharma, Inc.',
      },
      team: [
        { name: 'Jane Doe', role: 'Project Manager', email: 'jane.doe@example.com' },
        { name: 'Robert Chen', role: 'Clinical Lead', email: 'robert.chen@example.com' },
        { name: 'Lisa Martinez', role: 'Regulatory Affairs', email: 'lisa.martinez@example.com' },
      ],
      sections: [
        {
          id: 'm1',
          name: 'Module 1 - Administrative Information',
          status: 'completed',
          progress: 100,
          subsections: [
            { id: 'm1-1', name: '1.1 Forms', status: 'completed', progress: 100 },
            { id: 'm1-2', name: '1.2 Cover Letter', status: 'completed', progress: 100 },
            {
              id: 'm1-3',
              name: '1.3 Administrative Information',
              status: 'completed',
              progress: 100,
            },
          ],
        },
        {
          id: 'm2',
          name: 'Module 2 - CTD Summaries',
          status: 'completed',
          progress: 100,
          subsections: [
            { id: 'm2-2', name: '2.2 Introduction', status: 'completed', progress: 100 },
            { id: 'm2-3', name: '2.3 Quality Overall Summary', status: 'completed', progress: 100 },
            { id: 'm2-4', name: '2.4 Nonclinical Overview', status: 'completed', progress: 100 },
            { id: 'm2-5', name: '2.5 Clinical Overview', status: 'completed', progress: 100 },
            { id: 'm2-6', name: '2.6 Nonclinical Summary', status: 'completed', progress: 100 },
            { id: 'm2-7', name: '2.7 Clinical Summary', status: 'completed', progress: 100 },
          ],
        },
        {
          id: 'm3',
          name: 'Module 3 - Quality',
          status: 'in-progress',
          progress: 90,
          subsections: [
            { id: 'm3-2-s', name: '3.2.S Drug Substance', status: 'completed', progress: 100 },
            { id: 'm3-2-p', name: '3.2.P Drug Product', status: 'completed', progress: 100 },
            { id: 'm3-2-a', name: '3.2.A Appendices', status: 'in-progress', progress: 80 },
            {
              id: 'm3-2-r',
              name: '3.2.R Regional Information',
              status: 'in-progress',
              progress: 50,
            },
          ],
        },
        {
          id: 'm4',
          name: 'Module 4 - Nonclinical Reports',
          status: 'completed',
          progress: 100,
          subsections: [
            { id: 'm4-2-1', name: '4.2.1 Pharmacology', status: 'completed', progress: 100 },
            { id: 'm4-2-2', name: '4.2.2 Pharmacokinetics', status: 'completed', progress: 100 },
            { id: 'm4-2-3', name: '4.2.3 Toxicology', status: 'completed', progress: 100 },
          ],
        },
        {
          id: 'm5',
          name: 'Module 5 - Clinical Reports',
          status: 'not-started',
          progress: 0,
          subsections: [
            {
              id: 'm5-3-1',
              name: '5.3.1 Reports of Biopharmaceutic Studies',
              status: 'not-started',
              progress: 0,
            },
            {
              id: 'm5-3-3',
              name: '5.3.3 Reports of Human PK Studies',
              status: 'not-started',
              progress: 0,
            },
            {
              id: 'm5-3-5',
              name: '5.3.5 Reports of Efficacy and Safety Studies',
              status: 'not-started',
              progress: 0,
            },
          ],
        },
      ],
      validationResults: [
        { level: 'error', message: 'Module 5 content missing', section: 'm5' },
        {
          level: 'warning',
          message: 'Regional information in Module 3 needs completion',
          section: 'm3-2-r',
        },
        { level: 'info', message: 'Appendices need final review', section: 'm3-2-a' },
      ],
      documents: [
        {
          id: 'doc-101',
          name: 'Module1/regional-info.pdf',
          section: 'm1',
          uploadedAt: '2025-03-05T09:15:00Z',
          status: 'final',
        },
        {
          id: 'doc-102',
          name: 'Module2/clinical-overview.pdf',
          section: 'm2',
          uploadedAt: '2025-03-10T10:30:00Z',
          status: 'final',
        },
        {
          id: 'doc-103',
          name: 'Module3/drug-substance.pdf',
          section: 'm3',
          uploadedAt: '2025-03-15T14:45:00Z',
          status: 'final',
        },
        {
          id: 'doc-104',
          name: 'Module3/appendices.docx',
          section: 'm3',
          uploadedAt: '2025-04-05T11:20:00Z',
          status: 'draft',
        },
      ],
      timeline: [
        {
          date: '2025-02-10',
          title: 'Project Initiated',
          description: 'eCTD project created in system',
        },
        {
          date: '2025-03-15',
          title: 'Module 1 & 2 Completed',
          description: 'Administrative information and summaries completed',
        },
        {
          date: '2025-04-10',
          title: 'Module 3 & 4 Reviewed',
          description: 'Quality and nonclinical sections reviewed',
        },
        {
          date: '2025-05-30',
          title: 'Submission Deadline',
          description: 'Target date for eCTD submission',
          status: 'upcoming',
        },
      ],
    };
  }
  return null;
};

const RegulatoryProjectDetails = () => {
  const navigate = useNavigate();
  const { projectId } = useParams();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);

  // Use network resilience and health monitor hooks
  const { isOnline, resilientFetch } = useNetworkResilience();
  const healthMonitor = useHealthMonitor();

  useEffect(() => {
    // In a real application, this would be an API call
    // using the resilientFetch from our hook
    const loadProject = async () => {
      try {
        setLoading(true);

        // Simulate API call
        const data = getProjectData(projectId);

        if (data) {
          setProject(data);
        } else {
          console.error('Project not found:', projectId);
        }
      } catch (error) {
        console.error('Error loading project:', error);

        // Report error to health monitor
        if (healthMonitor.isConnected) {
          healthMonitor.reportError({
            message: `Failed to load project ${projectId}`,
            stack: error.stack,
            severity: 'medium',
          });
        }
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [projectId, healthMonitor]);

  // Report status to health monitor
  useEffect(() => {
    if (healthMonitor.isConnected) {
      healthMonitor.sendHeartbeat({
        page: 'regulatory-project-details',
        projectId,
        status: 'active',
      });
    }
  }, [healthMonitor, projectId]);

  if (loading) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500">Loading project details...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!project) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-7xl">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <h2 className="text-2xl font-bold mb-2">Project Not Found</h2>
            <p className="text-gray-500 mb-4">
              The project you're looking for doesn't exist or you don't have permission to view it.
            </p>
            <Button onClick={() => navigate('/regulatory-submissions')}>Back to Submissions</Button>
          </div>
        </div>
      </div>
    );
  }

  // Get status colors
  const getStatusColor = status => {
    switch (status) {
      case 'completed':
        return 'bg-green-100 text-green-800';
      case 'in-progress':
        return 'bg-blue-100 text-blue-800';
      case 'not-started':
        return 'bg-gray-100 text-gray-800';
      case 'on-hold':
        return 'bg-yellow-100 text-yellow-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get validation level colors
  const getValidationLevelColor = level => {
    switch (level) {
      case 'error':
        return 'bg-red-100 text-red-800';
      case 'warning':
        return 'bg-yellow-100 text-yellow-800';
      case 'info':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get icon for section
  const getSectionIcon = sectionId => {
    if (project.type === 'ind') {
      switch (sectionId) {
        case 'forms':
          return <FileText className="h-5 w-5" />;
        case 'cover':
          return <BookOpen className="h-5 w-5" />;
        case 'cmc':
          return <Beaker className="h-5 w-5" />;
        case 'nonclinical':
          return <Microscope className="h-5 w-5" />;
        case 'clinical':
          return <Stethoscope className="h-5 w-5" />;
        case 'investigator':
          return <Users className="h-5 w-5" />;
        default:
          return <FileText className="h-5 w-5" />;
      }
    } else {
      // eCTD icons
      switch (sectionId) {
        case 'm1':
          return <FileText className="h-5 w-5" />;
        case 'm2':
          return <BookOpen className="h-5 w-5" />;
        case 'm3':
          return <Beaker className="h-5 w-5" />;
        case 'm4':
          return <Microscope className="h-5 w-5" />;
        case 'm5':
          return <Stethoscope className="h-5 w-5" />;
        default:
          return <Layers className="h-5 w-5" />;
      }
    }
  };

  return (
    <div className="container mx-auto px-4 py-6 max-w-7xl">
      {/* Breadcrumbs */}
      <Breadcrumb className="mb-6">
        <BreadcrumbItem>
          <BreadcrumbLink onClick={() => navigate('/regulatory-submissions')}>
            Regulatory Submissions
          </BreadcrumbLink>
        </BreadcrumbItem>
        <BreadcrumbSeparator />
        <BreadcrumbItem>
          <BreadcrumbLink>Project Details</BreadcrumbLink>
        </BreadcrumbItem>
      </Breadcrumb>

      {/* Project header */}
      <div className="mb-6">
        <div className="flex justify-between items-start mb-2">
          <div>
            <h1 className="text-3xl font-bold">{project.name}</h1>
            <p className="text-gray-500">{project.description}</p>
          </div>
          <Badge variant="outline" className={getStatusColor(project.status)}>
            {project.status.replace('-', ' ')}
          </Badge>
        </div>

        {/* Project metadata */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Calendar className="h-5 w-5 text-gray-500 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Due Date</p>
                  <p className="font-medium">{new Date(project.dueDate).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Users className="h-5 w-5 text-gray-500 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Owner</p>
                  <p className="font-medium">{project.owner}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <Clock className="h-5 w-5 text-gray-500 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Last Updated</p>
                  <p className="font-medium">{new Date(project.updatedAt).toLocaleDateString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center">
                <FileCheck className="h-5 w-5 text-gray-500 mr-2" />
                <div>
                  <p className="text-sm text-gray-500">Progress</p>
                  <div className="flex items-center">
                    <span className="font-medium mr-2">{project.progress}%</span>
                    <Progress value={project.progress} className="h-2 w-20" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Project tabs */}
      <Tabs defaultValue="sections" className="w-full">
        <TabsList className="mb-6 w-full justify-start">
          <TabsTrigger value="sections">Sections</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="validation">Validation</TabsTrigger>
          <TabsTrigger value="team">Team</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Sections tab */}
        <TabsContent value="sections">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Project Sections</h2>

              {/* Show different actions based on project type */}
              {project.type === 'ind' ? (
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={() => navigate(`/ind-wizard/${projectId}`)}>
                    Continue in IND Wizard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>

                  {project.progress >= 70 && (
                    <Button
                      variant="default"
                      onClick={() => navigate(`/regulatory-submissions/ind-to-ectd/${projectId}`)}
                    >
                      Generate eCTD Structure
                      <Layers className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={() => navigate(`/ectd-editor/${projectId}`)}>
                    Continue in eCTD Editor
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>

                  <Button variant="default">
                    Validate eCTD
                    <CheckCircle2 className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Sections list */}
            <div className="space-y-4">
              {project.sections.map(section => (
                <Card key={section.id} className="overflow-hidden">
                  <CardHeader className="pb-3">
                    <div className="flex justify-between items-center">
                      <div className="flex items-center">
                        {getSectionIcon(section.id)}
                        <CardTitle className="ml-2">{section.name}</CardTitle>
                      </div>
                      <Badge variant="outline" className={getStatusColor(section.status)}>
                        {section.status.replace('-', ' ')}
                      </Badge>
                    </div>
                  </CardHeader>

                  <CardContent className="pb-3">
                    <div className="mb-4">
                      <div className="flex justify-between text-sm mb-1">
                        <span>Progress</span>
                        <span>{section.progress}%</span>
                      </div>
                      <Progress value={section.progress} className="h-2" />
                    </div>

                    {/* Subsections */}
                    {section.subsections && section.subsections.length > 0 && (
                      <div className="space-y-2 mt-4">
                        <h4 className="text-sm font-medium mb-2">Subsections</h4>
                        {section.subsections.map(subsection => (
                          <div
                            key={subsection.id}
                            className="flex justify-between items-center text-sm p-2 rounded-md hover:bg-gray-50"
                          >
                            <span>{subsection.name}</span>
                            <div className="flex items-center">
                              <span className="text-xs mr-2">{subsection.progress}%</span>
                              <Badge
                                variant="outline"
                                className={getStatusColor(subsection.status)}
                              >
                                {subsection.status.replace('-', ' ')}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>

                  <CardFooter className="pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (project.type === 'ind') {
                          navigate(`/ind-wizard/${projectId}/section/${section.id}`);
                        } else {
                          navigate(`/ectd-editor/${projectId}/module/${section.id}`);
                        }
                      }}
                      className="ml-auto"
                    >
                      Edit Section
                      <Edit3 className="ml-2 h-4 w-4" />
                    </Button>
                  </CardFooter>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Documents tab */}
        <TabsContent value="documents">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Documents</h2>
              <div className="flex space-x-2">
                <Button variant="outline">
                  <Download className="h-4 w-4 mr-2" />
                  Download All
                </Button>
                <Button>
                  <Upload className="h-4 w-4 mr-2" />
                  Upload Document
                </Button>
              </div>
            </div>

            {/* Documents list */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">Document Name</th>
                        <th className="text-left py-3 px-4">Section</th>
                        <th className="text-left py-3 px-4">Uploaded</th>
                        <th className="text-left py-3 px-4">Status</th>
                        <th className="text-left py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.documents.map(doc => {
                        // Find section name
                        const section = project.sections.find(s => s.id === doc.section);
                        const sectionName = section ? section.name : doc.section;

                        return (
                          <tr key={doc.id} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4 flex items-center">
                              <FileText className="h-4 w-4 mr-2 text-gray-500" />
                              {doc.name}
                            </td>
                            <td className="py-3 px-4">{sectionName}</td>
                            <td className="py-3 px-4">
                              {new Date(doc.uploadedAt).toLocaleDateString()}
                            </td>
                            <td className="py-3 px-4">
                              <Badge
                                variant="outline"
                                className={
                                  doc.status === 'final'
                                    ? 'bg-green-100 text-green-800'
                                    : 'bg-amber-100 text-amber-800'
                                }
                              >
                                {doc.status}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">
                              <div className="flex space-x-2">
                                <Button variant="ghost" size="sm">
                                  <Download className="h-4 w-4" />
                                </Button>
                                <Button variant="ghost" size="sm">
                                  <Edit3 className="h-4 w-4" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Validation tab */}
        <TabsContent value="validation">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Validation Results</h2>
              <Button>
                Run Validation
                <CheckCircle2 className="ml-2 h-4 w-4" />
              </Button>
            </div>

            {/* Validation issues */}
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 px-4">Level</th>
                        <th className="text-left py-3 px-4">Message</th>
                        <th className="text-left py-3 px-4">Section</th>
                        <th className="text-left py-3 px-4">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {project.validationResults.map((issue, index) => {
                        // Find section name
                        let sectionName = issue.section;

                        // Try to find in main sections
                        const mainSection = project.sections.find(s => s.id === issue.section);
                        if (mainSection) {
                          sectionName = mainSection.name;
                        } else {
                          // Try to find in subsections
                          for (const section of project.sections) {
                            if (section.subsections) {
                              const subsection = section.subsections.find(
                                sub => sub.id === issue.section
                              );
                              if (subsection) {
                                sectionName = `${section.name} > ${subsection.name}`;
                                break;
                              }
                            }
                          }
                        }

                        return (
                          <tr key={index} className="border-b hover:bg-gray-50">
                            <td className="py-3 px-4">
                              <Badge
                                variant="outline"
                                className={getValidationLevelColor(issue.level)}
                              >
                                {issue.level}
                              </Badge>
                            </td>
                            <td className="py-3 px-4">{issue.message}</td>
                            <td className="py-3 px-4">{sectionName}</td>
                            <td className="py-3 px-4">
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (project.type === 'ind') {
                                    navigate(`/ind-wizard/${projectId}/section/${issue.section}`);
                                  } else {
                                    navigate(`/ectd-editor/${projectId}/module/${issue.section}`);
                                  }
                                }}
                              >
                                Fix Issue
                              </Button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Team tab */}
        <TabsContent value="team">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Project Team</h2>
              <Button>
                <Users className="h-4 w-4 mr-2" />
                Add Team Member
              </Button>
            </div>

            {/* Team members */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {project.team.map((member, index) => (
                <Card key={index}>
                  <CardContent className="pt-6">
                    <div className="flex items-center mb-4">
                      <div className="w-12 h-12 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-semibold text-lg">
                        {member.name
                          .split(' ')
                          .map(n => n[0])
                          .join('')}
                      </div>
                      <div className="ml-4">
                        <h3 className="font-semibold">{member.name}</h3>
                        <p className="text-sm text-gray-500">{member.role}</p>
                      </div>
                    </div>
                    <div className="text-sm">
                      <a
                        href={`mailto:${member.email}`}
                        className="text-blue-600 hover:underline flex items-center"
                      >
                        {member.email}
                        <ExternalLink className="h-3 w-3 ml-1" />
                      </a>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </TabsContent>

        {/* Activity tab */}
        <TabsContent value="activity">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Project Timeline</h2>
            </div>

            {/* Timeline */}
            <Card>
              <CardContent className="pt-6">
                <ol className="relative border-l border-gray-200 ml-3">
                  {project.timeline.map((event, index) => (
                    <li key={index} className="mb-10 ml-6">
                      <span className="absolute flex items-center justify-center w-6 h-6 bg-blue-100 rounded-full -left-3 ring-8 ring-white">
                        <Calendar className="w-3 h-3 text-blue-800" />
                      </span>
                      <div className="flex justify-between items-start">
                        <div>
                          <h3 className="flex items-center mb-1 text-lg font-semibold text-gray-900">
                            {event.title}
                            {event.status === 'upcoming' && (
                              <span className="bg-blue-100 text-blue-800 text-sm font-medium mr-2 px-2.5 py-0.5 rounded ml-3">
                                Upcoming
                              </span>
                            )}
                          </h3>
                          <time className="block mb-2 text-sm font-normal leading-none text-gray-400">
                            {new Date(event.date).toLocaleDateString()}
                          </time>
                          <p className="mb-4 text-base font-normal text-gray-500">
                            {event.description}
                          </p>
                        </div>
                      </div>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings">
          <div className="space-y-6">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-semibold">Project Settings</h2>
            </div>

            {/* Settings cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <Card>
                <CardHeader>
                  <CardTitle>Project Information</CardTitle>
                  <CardDescription>Update basic project information and metadata</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-gray-500 mb-4">
                    Edit project name, description, due date, and other basic properties.
                  </p>
                  <Button variant="outline">
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit Properties
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Drug Information</CardTitle>
                  <CardDescription>Manage drug product details</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2 mb-4">
                    <div className="flex">
                      <span className="font-medium w-1/3">Name:</span>
                      <span>{project.drugInfo.name}</span>
                    </div>
                    <div className="flex">
                      <span className="font-medium w-1/3">Indication:</span>
                      <span>{project.drugInfo.indication}</span>
                    </div>
                    <div className="flex">
                      <span className="font-medium w-1/3">Mechanism:</span>
                      <span>{project.drugInfo.mechanism}</span>
                    </div>
                    <div className="flex">
                      <span className="font-medium w-1/3">Formulation:</span>
                      <span>{project.drugInfo.formulation}</span>
                    </div>
                  </div>
                  <Button variant="outline">
                    <Edit3 className="h-4 w-4 mr-2" />
                    Edit Drug Info
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Access Control</CardTitle>
                  <CardDescription>Manage project permissions</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex items-center mb-4">
                    <div className="mr-2">
                      <Lock className="h-5 w-5 text-gray-500" />
                    </div>
                    <div>
                      <p className="font-medium">Project Access Level</p>
                      <p className="text-sm text-gray-500">
                        Currently restricted to project team members only
                      </p>
                    </div>
                  </div>
                  <Button variant="outline">
                    <Users className="h-4 w-4 mr-2" />
                    Manage Access
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Project Actions</CardTitle>
                  <CardDescription>Special operations for this project</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {project.type === 'ind' && project.progress >= 70 && (
                    <div>
                      <h4 className="font-medium mb-2">Convert to eCTD</h4>
                      <p className="text-sm text-gray-500 mb-2">
                        Generate an eCTD structure from this IND application
                      </p>
                      <Button
                        variant="outline"
                        onClick={() => navigate(`/regulatory-submissions/ind-to-ectd/${projectId}`)}
                      >
                        <Layers className="h-4 w-4 mr-2" />
                        Generate eCTD
                      </Button>
                    </div>
                  )}

                  <div>
                    <h4 className="font-medium mb-2 text-red-600">Danger Zone</h4>
                    <p className="text-sm text-gray-500 mb-2">These actions cannot be undone</p>
                    <div className="flex space-x-2">
                      <Button
                        variant="outline"
                        className="text-amber-600 border-amber-200 hover:bg-amber-50"
                      >
                        Archive Project
                      </Button>
                      <Button
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                      >
                        Delete Project
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {!isOnline && (
        <div className="fixed bottom-4 right-4 bg-amber-100 border border-amber-200 text-amber-800 p-4 rounded-lg shadow-lg">
          <div className="flex items-center">
            <div className="mr-3 text-amber-500">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="currentColor"
                className="w-6 h-6"
              >
                <path
                  fillRule="evenodd"
                  d="M9.401 3.003c1.155-2 4.043-2 5.197 0l7.355 12.748c1.154 2-.29 4.5-2.599 4.5H4.645c-2.309 0-3.752-2.5-2.598-4.5L9.4 3.003zM12 8.25a.75.75 0 01.75.75v3.75a.75.75 0 01-1.5 0V9a.75.75 0 01.75-.75zm0 8.25a.75.75 0 100-1.5.75.75 0 000 1.5z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div>
              <h3 className="font-medium">You're currently offline</h3>
              <p className="text-sm">Your changes will be synchronized when you reconnect</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default RegulatoryProjectDetails;
