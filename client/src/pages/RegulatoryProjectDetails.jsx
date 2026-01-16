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
import { ChevronLeft, Calendar, Users, Clock, FileCheck, FileText, FileWarning, CheckCircle2, AlertCircle, Lock, Unlock, FileStack, ArrowRight, BookOpen, Clipboard, Beaker, Microscope, Stethoscope, Upload, Download, Edit3, Layers, ChevronRight, ExternalLink } from 'lucide-react'
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
import { useLocation, useNavigate, useParams } from 'wouter';

// Import our stability monitoring hooks
import { useNetworkResilience } from '@/hooks/useNetworkResilience';
import { useHealthMonitor } from '@/hooks/useHealthMonitor';

const TacticalToast = ({ message, type, onClose }) => (
  <div
    className={`fixed top-6 right-6 z-[10000] px-6 py-4 rounded shadow-2xl flex items-center gap-4 animate-in slide-in-from-right duration-300 ${
      type === 'SUCCESS'
        ? 'bg-emerald-900 border border-emerald-500 text-white'
        : 'bg-red-900 border border-red-500 text-white'
    }`}
  >
    <div
      className={`h-3 w-3 rounded-full ${
        type === 'SUCCESS' ? 'bg-emerald-400' : 'bg-red-400'
      }`}
    ></div>
    <div className="font-mono text-sm font-bold">{message}</div>
    <button onClick={onClose} className="text-white/50 hover:text-white ml-4">
      ✕
    </button>
  </div>
);
const RegulatoryProjectDetails = () => {
  const navigate = useNavigate();
  const { id, projectId } = useParams();
  const [location] = useLocation();
  const [project, setProject] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lumenAlert, setLumenAlert] = useState(null);
  const [mitigationStatus, setMitigationStatus] = useState('idle');
  const [toast, setToast] = useState(null);
  const resolvedProjectId = projectId || id;

  const { isOnline, resilientFetch } = useNetworkResilience();
  const healthMonitor = useHealthMonitor();

  useEffect(() => {
    const loadProject = async () => {
      try {
        setLoading(true);
        const tenantId =
          localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');
        const response = await resilientFetch(`/api/projects/${resolvedProjectId}`, {
          headers: {
            ...(tenantId ? { 'x-organization-id': tenantId } : {}),
          },
        });

        if (!response.ok) {
          throw new Error(`Failed to load project ${resolvedProjectId}`);
        }

        const payload = await response.json();
        const projectData = payload?.project || payload;

        if (projectData) {
          setProject({
            ...projectData,
            sections: payload?.sections || [],
            validationResults: payload?.validationResults || [],
            documents: payload?.documents || [],
            timeline: payload?.timeline || [],
            team: payload?.team || [],
            drugInfo: payload?.drugInfo || {},
          });
        } else {
          setProject(null);
          console.error('Project not found:', resolvedProjectId);
        }
      } catch (error) {
        console.error('Error loading project:', error);

        if (healthMonitor.isConnected) {
          healthMonitor.reportError({
            message: `Failed to load project ${resolvedProjectId}`,
            stack: error.stack,
            severity: 'medium',
          });
        }
      } finally {
        setLoading(false);
      }
    };

    loadProject();
  }, [resolvedProjectId, healthMonitor, resilientFetch]);

  useEffect(() => {
    if (healthMonitor.isConnected) {
      healthMonitor.sendHeartbeat({
        page: 'regulatory-project-details',
        projectId: resolvedProjectId,
        status: 'active',
      });
    }
  }, [healthMonitor, resolvedProjectId]);

  useEffect(() => {
    const alertContext = window.history.state?.lumenAlert;
    if (alertContext) {
      console.log('>>> 🛡️ LUMEN CORTEX INTERVENTION ACTIVE');
      setLumenAlert(alertContext);
      window.history.replaceState({}, document.title, location);
    }
  }, [location]);

  const handleExecuteMitigation = async () => {
    if (!lumenAlert) return;
    try {
      setMitigationStatus('saving');
      const tenantId =
        localStorage.getItem('organizationId') || localStorage.getItem('currentOrganizationId');
      const token = localStorage.getItem('token');

      const response = await fetch('/api/risks/create-from-lumen', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(tenantId ? { 'x-organization-id': tenantId } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          projectId: lumenAlert.projectId || resolvedProjectId,
          source: 'LUMEN_CORTEX',
          title: `Regulatory Intervention: ${lumenAlert.severity}`,
          description: lumenAlert.rationale,
          mitigation_plan: lumenAlert.actionItems || [],
          severity: lumenAlert.severity,
        }),
      });

      if (!response.ok) {
        throw new Error('Database Write Failed');
      }

      setToast({ msg: 'PROTOCOL EXECUTED. RISK LOGGED IN DHF.', type: 'SUCCESS' });
      setLumenAlert(null);
      setMitigationStatus('idle');
    } catch (error) {
      setToast({ msg: 'DB WRITE ERROR. CONTACT ADMIN.', type: 'ERROR' });
      setMitigationStatus('error');
    } finally {
      setTimeout(() => setToast(null), 5000);
    }
  };

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
    <div className="relative min-h-screen bg-slate-50">
      {toast && (
        <TacticalToast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
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
          <Badge variant="outline" className={getStatusColor(project.status || 'unknown')}>
            {(project.status || 'unknown').replace('-', ' ')}
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
                  <p className="font-medium">
                    {project.targetEndDate || project.dueDate
                      ? new Date(project.targetEndDate || project.dueDate).toLocaleDateString()
                      : '—'}
                  </p>
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
                  <p className="font-medium">
                    {project.owner || (project.ownerId ? `User ${project.ownerId}` : 'Unassigned')}
                  </p>
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
                  <p className="font-medium">
                    {project.updatedAt ? new Date(project.updatedAt).toLocaleDateString() : '—'}
                  </p>
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
                    <span className="font-medium mr-2">{project.progress ?? 0}%</span>
                    <Progress value={project.progress ?? 0} className="h-2 w-20" />
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
                  <Button variant="outline" onClick={() => navigate(`/ind-wizard/${resolvedProjectId}`)}>
                    Continue in IND Wizard
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>

                  {project.progress >= 70 && (
                    <Button
                      variant="default"
                      onClick={() => navigate(`/regulatory-submissions/ind-to-ectd/${resolvedProjectId}`)}
                    >
                      Generate eCTD Structure
                      <Layers className="ml-2 h-4 w-4" />
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex space-x-2">
                  <Button variant="outline" onClick={() => navigate(`/ectd-editor/${resolvedProjectId}`)}>
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
                          navigate(`/ind-wizard/${resolvedProjectId}/section/${section.id}`);
                        } else {
                          navigate(`/ectd-editor/${resolvedProjectId}/module/${section.id}`);
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
                                    navigate(`/ind-wizard/${resolvedProjectId}/section/${issue.section}`);
                                  } else {
                                    navigate(`/ectd-editor/${resolvedProjectId}/module/${issue.section}`);
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
                        onClick={() => navigate(`/regulatory-submissions/ind-to-ectd/${resolvedProjectId}`)}
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

      {lumenAlert && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-[#0f172a]/90 backdrop-blur-md animate-in fade-in duration-300">
          <div
            className={`w-full max-w-3xl bg-[#1e293b] border rounded-2xl shadow-2xl overflow-hidden relative ${
              lumenAlert.severity === 'CRITICAL'
                ? 'border-red-500/50 shadow-red-900/50'
                : 'border-orange-500/50 shadow-orange-900/50'
            }`}
          >
            <div
              className={`absolute top-0 inset-x-0 h-1 bg-gradient-to-r ${
                lumenAlert.severity === 'CRITICAL'
                  ? 'from-red-500 via-red-400 to-red-500'
                  : 'from-orange-500 via-amber-400 to-orange-500'
              }`}
            ></div>

            <div className="p-8 pb-6 border-b border-slate-700/50 flex items-start justify-between bg-slate-900/50">
              <div className="flex gap-5">
                <div
                  className={`p-4 rounded-xl flex items-center justify-center shadow-lg ${
                    lumenAlert.severity === 'CRITICAL'
                      ? 'bg-red-500/10 text-red-500 ring-1 ring-red-500/50'
                      : 'bg-orange-500/10 text-orange-500 ring-1 ring-orange-500/50'
                  }`}
                >
                  <svg className="w-10 h-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div>
                  <h2 className="text-2xl font-bold text-white tracking-tight flex items-center gap-3">
                    LUMEN CORTEX INTERVENTION
                    {lumenAlert.severity === 'CRITICAL' && (
                      <span className="text-[10px] font-black bg-red-600 text-white px-2 py-0.5 rounded tracking-widest animate-pulse">
                        URGENT
                      </span>
                    )}
                  </h2>
                  <p className="text-slate-400 mt-1 font-medium">
                    Intelligence Source:{' '}
                    <span className="text-slate-200 font-mono">{lumenAlert.source}</span>
                  </p>
                </div>
              </div>
              <div className="text-right hidden sm:block">
                <div className="text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                  Alert Reference ID
                </div>
                <div className="text-sm text-slate-300 font-mono bg-slate-800 px-2 py-1 rounded">
                  {lumenAlert.id?.substring(0, 8) || 'UNKNOWN'}
                </div>
              </div>
            </div>

            <div className="p-8 space-y-8">
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-slate-500"></span>
                  Threat Rationale
                </h3>
                <div className="p-5 rounded-lg bg-black/20 border border-white/5 text-lg text-slate-200 leading-relaxed font-light">
                  "{lumenAlert.rationale}"
                </div>
              </div>

              {lumenAlert.actionItems && lumenAlert.actionItems.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-blue-400 uppercase tracking-widest flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    Recommended Mitigation
                  </h3>
                  <div className="grid gap-3">
                    {lumenAlert.actionItems.map((action, index) => (
                      <div
                        key={`${lumenAlert.id}-action-${index}`}
                        className="flex items-center gap-4 bg-slate-800/50 p-4 rounded-lg border border-slate-700/50 group hover:border-blue-500/30 transition-colors"
                      >
                        <div className="h-6 w-6 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold ring-1 ring-blue-500/50">
                          {index + 1}
                        </div>
                        <span className="text-slate-300 font-medium">{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-900/80 border-t border-slate-800 flex items-center justify-between gap-4">
              <button
                onClick={() => setLumenAlert(null)}
                className="px-6 py-3 rounded-lg font-bold text-slate-400 hover:text-white hover:bg-slate-800 transition-all text-sm tracking-wide"
              >
                ACKNOWLEDGE & DISMISS
              </button>

              <button
                onClick={handleExecuteMitigation}
                className={`px-8 py-3 rounded-lg font-bold text-white shadow-xl transform transition-all hover:-translate-y-0.5 active:translate-y-0 flex items-center gap-2 ${
                  lumenAlert.severity === 'CRITICAL'
                    ? 'bg-gradient-to-r from-red-600 to-red-500 hover:from-red-500 hover:to-red-400 shadow-red-900/30'
                    : 'bg-gradient-to-r from-orange-600 to-orange-500 hover:from-orange-500 hover:to-orange-400 shadow-orange-900/30'
                }`}
                disabled={mitigationStatus === 'saving'}
              >
                <span>⚡</span>
                {mitigationStatus === 'saving'
                  ? 'WRITING TO LEDGER...'
                  : 'EXECUTE PROTOCOL'}
              </button>
            </div>
            {mitigationStatus === 'error' && (
              <div className="px-6 pb-6 text-xs text-red-400">
                Failed to create risk record. Please retry.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default RegulatoryProjectDetails;
