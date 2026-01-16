/**
 * Enterprise Client Portal - Full Implementation
 *
 * This is a completely rebuilt client portal with all required features:
 * - Multi-tenant organization & client management
 * - Module-based navigation system
 * - Global reporting integration
 * - CMC CoPilot™ features
 * - Advanced data visualization and project tracking
 */

import React, { useState, useEffect, useRef } from 'react';
import { useLocation, Link } from 'wouter';
import {
  Users, Building, ArrowLeft, FileText, BookOpen, BarChart2, CheckCircle, Clock, Calendar, Search, Plus, RefreshCw, Shield, Zap, Layout, Layers, Activity, Database, MessageSquare, Bell, Settings, ChevronDown, ChevronRight, ArrowRight, ArrowUpRight, BarChart, ClipboardCheck, FileCheck, SquareCode, AlertTriangle, BookMarked, ClipboardList, Beaker, BookOpenCheck, Repeat, Sparkles, CircleHelp } from 'lucide-react'

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useTenant } from '../../contexts/TenantContext';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

// Utility function for generating a random percentage
const randomPercent = () => Math.floor(Math.random() * 100);

// Sample data
const organizations = [
  {
    id: 'org-1',
    name: 'Acme CRO',
    subscriptionTier: 'Enterprise',
    clients: 12,
    projects: 48,
    color: 'blue',
  },
  {
    id: 'org-2',
    name: 'BioTech Partners',
    subscriptionTier: 'Professional',
    clients: 8,
    projects: 32,
    color: 'green',
  },
  {
    id: 'org-3',
    name: 'MedRex Research',
    subscriptionTier: 'Enterprise Plus',
    clients: 15,
    projects: 60,
    color: 'purple',
  },
  {
    id: 'org-4',
    name: 'Pharmaceutical Solutions',
    subscriptionTier: 'Enterprise',
    clients: 10,
    projects: 45,
    color: 'amber',
  },
];

const clients = [
  {
    id: 'client-1',
    orgId: 'org-1',
    name: 'NeuroPharma Inc.',
    activeProjects: 5,
    industry: 'Neuroscience',
    color: 'indigo',
  },
  {
    id: 'client-2',
    orgId: 'org-1',
    name: 'CardioMed Therapeutics',
    activeProjects: 3,
    industry: 'Cardiovascular',
    color: 'red',
  },
  {
    id: 'client-3',
    orgId: 'org-1',
    name: 'ImmuneTech',
    activeProjects: 4,
    industry: 'Immunology',
    color: 'emerald',
  },
  {
    id: 'client-4',
    orgId: 'org-2',
    name: 'Oncology Research Labs',
    activeProjects: 3,
    industry: 'Oncology',
    color: 'amber',
  },
  {
    id: 'client-5',
    orgId: 'org-2',
    name: 'GastroHealth Pharma',
    activeProjects: 2,
    industry: 'Gastroenterology',
    color: 'blue',
  },
  {
    id: 'client-6',
    orgId: 'org-3',
    name: 'Dermatology Innovations',
    activeProjects: 4,
    industry: 'Dermatology',
    color: 'violet',
  },
  {
    id: 'client-7',
    orgId: 'org-3',
    name: 'RespireTech Medical',
    activeProjects: 3,
    industry: 'Respiratory',
    color: 'cyan',
  },
  {
    id: 'client-8',
    orgId: 'org-4',
    name: 'EndocrineCare Systems',
    activeProjects: 2,
    industry: 'Endocrinology',
    color: 'teal',
  },
];

const projects = [
  // Neurology Projects
  {
    id: 'proj-1',
    clientId: 'client-1',
    name: 'NeuroVance Phase II',
    type: 'Clinical Trial',
    status: 'active',
    progress: 68,
    modules: ['cer', 'ind', 'cmc'],
    dueDate: '2025-07-15',
    lastUpdate: '2025-05-08',
    priority: 'high',
  },
  {
    id: 'proj-2',
    clientId: 'client-1',
    name: 'Neurexil IND Submission',
    type: 'IND Application',
    status: 'review',
    progress: 82,
    modules: ['ind', 'study', 'vault'],
    dueDate: '2025-06-10',
    lastUpdate: '2025-05-09',
    priority: 'critical',
  },
  {
    id: 'proj-3',
    clientId: 'client-1',
    name: 'AlzCure Biomarker Study',
    type: 'Clinical Study',
    status: 'planning',
    progress: 35,
    modules: ['study', 'analytics'],
    dueDate: '2025-08-22',
    lastUpdate: '2025-05-07',
    priority: 'medium',
  },

  // Cardio Projects
  {
    id: 'proj-4',
    clientId: 'client-2',
    name: 'CardioZen Phase III',
    type: 'Clinical Trial',
    status: 'active',
    progress: 42,
    modules: ['ind', 'cmc', 'regulatory'],
    dueDate: '2025-09-18',
    lastUpdate: '2025-05-06',
    priority: 'high',
  },
  {
    id: 'proj-5',
    clientId: 'client-2',
    name: 'Arterenol CMC Documentation',
    type: 'CMC Package',
    status: 'review',
    progress: 93,
    modules: ['cmc', 'vault'],
    dueDate: '2025-05-30',
    lastUpdate: '2025-05-09',
    priority: 'high',
  },

  // Immune Projects
  {
    id: 'proj-6',
    clientId: 'client-3',
    name: 'ImmuneBoost mAb Study',
    type: 'Clinical Study',
    status: 'active',
    progress: 56,
    modules: ['study', 'analytics', 'regulatory'],
    dueDate: '2025-07-28',
    lastUpdate: '2025-05-08',
    priority: 'medium',
  },
  {
    id: 'proj-7',
    clientId: 'client-3',
    name: 'AutoImmune-X IND',
    type: 'IND Application',
    status: 'active',
    progress: 71,
    modules: ['ind', 'cmc', 'vault'],
    dueDate: '2025-06-15',
    lastUpdate: '2025-05-09',
    priority: 'high',
  },

  // Oncology Projects
  {
    id: 'proj-8',
    clientId: 'client-4',
    name: 'OncoVax CTA Submission',
    type: 'CTA Application',
    status: 'planning',
    progress: 28,
    modules: ['ind', 'regulatory'],
    dueDate: '2025-08-10',
    lastUpdate: '2025-05-05',
    priority: 'medium',
  },
  {
    id: 'proj-9',
    clientId: 'client-4',
    name: 'BreastCA-117 Protocol',
    type: 'Protocol Design',
    status: 'active',
    progress: 64,
    modules: ['study', 'analytics'],
    dueDate: '2025-07-12',
    lastUpdate: '2025-05-08',
    priority: 'high',
  },
];

const documents = [
  {
    id: 'doc-1',
    projectId: 'proj-1',
    name: 'NeuroVance Protocol v2.3',
    type: 'Protocol',
    format: 'PDF',
    lastModified: '2025-05-08',
    status: 'Final',
    size: '4.2 MB',
  },
  {
    id: 'doc-2',
    projectId: 'proj-1',
    name: 'NeuroVance IB Update',
    type: 'Investigator Brochure',
    format: 'DOCX',
    lastModified: '2025-05-07',
    status: 'Draft',
    size: '2.8 MB',
  },
  {
    id: 'doc-3',
    projectId: 'proj-2',
    name: 'Neurexil IND Form 1571',
    type: 'FDA Form',
    format: 'PDF',
    lastModified: '2025-05-09',
    status: 'Final',
    size: '1.5 MB',
  },
  {
    id: 'doc-4',
    projectId: 'proj-2',
    name: 'Neurexil CMC Section 3.2.P',
    type: 'CMC Documentation',
    format: 'PDF',
    lastModified: '2025-05-06',
    status: 'Final',
    size: '8.7 MB',
  },
  {
    id: 'doc-5',
    projectId: 'proj-4',
    name: 'CardioZen Statistical Analysis Plan',
    type: 'SAP',
    format: 'DOCX',
    lastModified: '2025-05-05',
    status: 'Draft',
    size: '3.2 MB',
  },
  {
    id: 'doc-6',
    projectId: 'proj-5',
    name: 'Arterenol Stability Data',
    type: 'CMC Data',
    format: 'XLSX',
    lastModified: '2025-05-09',
    status: 'Final',
    size: '6.1 MB',
  },
  {
    id: 'doc-7',
    projectId: 'proj-7',
    name: 'AutoImmune-X Toxicology Report',
    type: 'Nonclinical Study Report',
    format: 'PDF',
    lastModified: '2025-05-08',
    status: 'Final',
    size: '12.4 MB',
  },
  {
    id: 'doc-8',
    projectId: 'proj-9',
    name: 'BreastCA-117 Endpoint Definition',
    type: 'Protocol Section',
    format: 'DOCX',
    lastModified: '2025-05-07',
    status: 'Review',
    size: '1.8 MB',
  },
];

const activities = [
  {
    id: 'act-1',
    projectId: 'proj-1',
    type: 'document',
    action: 'modified',
    item: 'NeuroVance Protocol v2.3',
    user: 'Sarah Chen',
    timestamp: '2025-05-08T14:32:00Z',
  },
  {
    id: 'act-2',
    projectId: 'proj-2',
    type: 'document',
    action: 'finalized',
    item: 'Neurexil IND Form 1571',
    user: 'John Smith',
    timestamp: '2025-05-09T10:15:00Z',
  },
  {
    id: 'act-3',
    projectId: 'proj-4',
    type: 'milestone',
    action: 'completed',
    item: 'Database Lock',
    user: 'Maria Rodriguez',
    timestamp: '2025-05-06T16:45:00Z',
  },
  {
    id: 'act-4',
    projectId: 'proj-5',
    type: 'document',
    action: 'uploaded',
    item: 'Arterenol Stability Data',
    user: 'David Kim',
    timestamp: '2025-05-09T09:20:00Z',
  },
  {
    id: 'act-5',
    projectId: 'proj-7',
    type: 'review',
    action: 'completed',
    item: 'CMC Section Review',
    user: 'Jennifer Wu',
    timestamp: '2025-05-08T11:05:00Z',
  },
  {
    id: 'act-6',
    projectId: 'proj-1',
    type: 'comment',
    action: 'added',
    item: 'Query Response',
    user: 'Robert Johnson',
    timestamp: '2025-05-08T15:30:00Z',
  },
];

// Module definitions with metadata
const modules = [
  { id: 'dashboard', name: 'Dashboard', icon: Layout, color: 'slate' },
  {
    id: 'cer',
    name: 'CER2V™',
    icon: FileText,
    color: 'green',
    description: 'Clinical Evaluation Report generation and management',
    moduleType: 'primary',
  },
  {
    id: 'ind',
    name: 'IND Wizard™',
    icon: ClipboardCheck,
    color: 'blue',
    description: 'Intelligent IND application preparation',
    moduleType: 'primary',
  },
  {
    id: 'ectd',
    name: 'eCTD Author™',
    icon: BookOpen,
    color: 'purple',
    description: 'Electronic Common Technical Document authoring',
    moduleType: 'primary',
  },
  {
    id: 'cmc',
    name: 'CMC Module™',
    icon: Beaker,
    color: 'amber',
    description: 'Chemistry, Manufacturing & Controls',
    moduleType: 'primary',
  },
  {
    id: 'csr',
    name: 'CSR Intelligence™',
    icon: Search,
    color: 'teal',
    description: 'Clinical Study Report insights',
    moduleType: 'primary',
  },
  {
    id: 'study',
    name: 'Study Architect™',
    icon: ClipboardList,
    color: 'orange',
    description: 'Protocol development with AI assistance',
    moduleType: 'primary',
  },
  {
    id: 'reports',
    name: 'Reports',
    icon: BarChart,
    color: 'pink',
    description: 'Cross-module analytics and reporting',
    moduleType: 'global',
  },
  {
    id: 'vault',
    name: 'Vault™',
    icon: Database,
    color: 'slate',
    description: 'Secure document repository',
    moduleType: 'global',
  },
  {
    id: 'regulatory',
    name: 'Regulatory Hub™',
    icon: BookMarked,
    color: 'indigo',
    description: 'Submission tracking and management',
    moduleType: 'primary',
  },
  {
    id: 'risk',
    name: 'Risk Heatmap™',
    icon: AlertTriangle,
    color: 'red',
    description: 'Risk visualization and analysis',
    moduleType: 'utility',
  },
  {
    id: 'analytics',
    name: 'Analytics',
    icon: BarChart2,
    color: 'cyan',
    description: 'Advanced data analytics',
    moduleType: 'utility',
  },
  {
    id: 'admin',
    name: 'Administration',
    icon: Settings,
    color: 'gray',
    description: 'Portal administration and settings',
    moduleType: 'utility',
  },
];

// CMC CoPilot suggested actions
const cmcCopilotActions = [
  {
    id: 'action-1',
    title: 'Complete CMC Section 3.2.P.3.3',
    description: 'Manufacturing process validation data needs review',
    priority: 'high',
  },
  {
    id: 'action-2',
    title: 'Update Drug Product Specifications',
    description: 'New analytical methods available',
    priority: 'medium',
  },
  {
    id: 'action-3',
    title: 'Review Stability Protocol',
    description: 'Updates needed for ICH Q1A(R2) compliance',
    priority: 'medium',
  },
];

// Function to format relative time
const formatRelativeTime = dateString => {
  const date = new Date(dateString);
  const now = new Date();
  const diffSeconds = Math.floor((now - date) / 1000);

  if (diffSeconds < 60) return 'Just now';
  if (diffSeconds < 3600) return `${Math.floor(diffSeconds / 60)} minutes ago`;
  if (diffSeconds < 86400) return `${Math.floor(diffSeconds / 3600)} hours ago`;
  if (diffSeconds < 2592000) return `${Math.floor(diffSeconds / 86400)} days ago`;

  return date.toLocaleDateString();
};

const EnterpriseClientPortalFinal = () => {
  // State management
  const [activeModule, setActiveModule] = useState('dashboard');
  const [selectedOrg, setSelectedOrg] = useState(organizations[0]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [selectedProject, setSelectedProject] = useState(null);
  const [clientList, setClientList] = useState([]);
  const [projectList, setProjectList] = useState([]);
  const [cmcCopilotVisible, setCmcCopilotVisible] = useState(false);
  const [asideVisible, setAsideVisible] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('projects');

  // TenantContext integration (when available)
  const tenantContext = useTenant && useTenant();

  // Setup client list when org changes
  useEffect(() => {
    if (selectedOrg) {
      const orgClients = clients.filter(client => client.orgId === selectedOrg.id);
      setClientList(orgClients);
      setSelectedClient(orgClients.length > 0 ? orgClients[0] : null);
    }
  }, [selectedOrg]);

  // Setup project list when client changes
  useEffect(() => {
    if (selectedClient) {
      const clientProjects = projects.filter(project => project.clientId === selectedClient.id);
      setProjectList(clientProjects);
    } else {
      setProjectList([]);
    }
  }, [selectedClient]);

  // Handle organization change
  const handleOrganizationChange = org => {
    setSelectedOrg(org);

    // Update tenant context if available
    if (tenantContext && tenantContext.setCurrentOrganization) {
      tenantContext.setCurrentOrganization(org);
    }
  };

  // Handle client change
  const handleClientChange = client => {
    setSelectedClient(client);

    // Update tenant context if available
    if (tenantContext && tenantContext.setCurrentClientWorkspace) {
      tenantContext.setCurrentClientWorkspace(client);
    }
  };

  // Handle module change
  const handleModuleChange = moduleId => {
    setActiveModule(moduleId);

    // Update tenant context if available
    if (tenantContext && tenantContext.setCurrentModule) {
      tenantContext.setCurrentModule(moduleId);
    }
  };

  // Handle project selection
  const handleProjectSelect = project => {
    setSelectedProject(project);
  };

  // Get module by ID
  const getModule = moduleId => {
    return modules.find(m => m.id === moduleId) || modules[0];
  };

  // Filter projects by search query
  const filteredProjects = searchQuery
    ? projectList.filter(
        project =>
          project.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          project.type.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : projectList;

  // Filter documents for current project
  const currentProjectDocuments = selectedProject
    ? documents.filter(doc => doc.projectId === selectedProject.id)
    : [];

  // Filter activities
  const filteredActivities = selectedProject
    ? activities.filter(activity => activity.projectId === selectedProject.id)
    : activities.slice(0, 5);

  // Get module color class
  const getModuleColorClass = (moduleId, type = 'bg') => {
    const module = getModule(moduleId);
    switch (module.color) {
      case 'green':
        return `${type}-green-500`;
      case 'blue':
        return `${type}-blue-500`;
      case 'purple':
        return `${type}-purple-500`;
      case 'amber':
        return `${type}-amber-500`;
      case 'teal':
        return `${type}-teal-500`;
      case 'orange':
        return `${type}-orange-500`;
      case 'pink':
        return `${type}-pink-500`;
      case 'slate':
        return `${type}-slate-500`;
      case 'indigo':
        return `${type}-indigo-500`;
      case 'red':
        return `${type}-red-500`;
      case 'cyan':
        return `${type}-cyan-500`;
      case 'gray':
        return `${type}-gray-500`;
      default:
        return `${type}-gray-500`;
    }
  };

  const getModuleTextColorClass = moduleId => {
    return getModuleColorClass(moduleId, 'text');
  };

  // Get status badge class
  const getStatusBadgeClass = status => {
    switch (status) {
      case 'active':
        return 'bg-green-100 text-green-800';
      case 'planning':
        return 'bg-blue-100 text-blue-800';
      case 'review':
        return 'bg-amber-100 text-amber-800';
      case 'completed':
        return 'bg-purple-100 text-purple-800';
      case 'paused':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Get priority badge class
  const getPriorityBadgeClass = priority => {
    switch (priority) {
      case 'critical':
        return 'bg-red-100 text-red-800';
      case 'high':
        return 'bg-orange-100 text-orange-800';
      case 'medium':
        return 'bg-blue-100 text-blue-800';
      case 'low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50">
      {/* Sidebar (Module Navigation) */}
      <aside
        className={`bg-white border-r border-gray-200 w-64 flex-shrink-0 flex flex-col ${!asideVisible ? 'hidden' : ''}`}
      >
        {/* Company Logo */}
        <div className="p-4 border-b border-gray-200">
          <div className="font-bold text-xl flex items-center">
            <span className="text-blue-600">TrialSage</span>
            <span className="text-xs ml-1 bg-blue-100 text-blue-800 px-1 rounded">Enterprise</span>
          </div>
          <div className="text-xs text-gray-500 mt-1">AI-Powered Regulatory Platform</div>
        </div>

        {/* Organization & Client Selection */}
        <div className="p-4 border-b border-gray-200 space-y-3">
          {/* Organization Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center">
                  <Building className="h-4 w-4 mr-2" />
                  <span className="truncate">{selectedOrg?.name || 'Select Organization'}</span>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Organizations</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {organizations.map(org => (
                <DropdownMenuItem
                  key={org.id}
                  className="cursor-pointer"
                  onClick={() => handleOrganizationChange(org)}
                >
                  <div className="flex items-center justify-between w-full">
                    <span>{org.name}</span>
                    {selectedOrg?.id === org.id && (
                      <CheckCircle className="h-4 w-4 text-green-500" />
                    )}
                  </div>
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Client Workspace Selector */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" className="w-full justify-between">
                <div className="flex items-center">
                  <Users className="h-4 w-4 mr-2" />
                  <span className="truncate">{selectedClient?.name || 'Select Client'}</span>
                </div>
                <ChevronDown className="h-4 w-4 opacity-50" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent className="w-56">
              <DropdownMenuLabel>Client Workspaces</DropdownMenuLabel>
              <DropdownMenuSeparator />
              {clientList.length > 0 ? (
                clientList.map(client => (
                  <DropdownMenuItem
                    key={client.id}
                    className="cursor-pointer"
                    onClick={() => handleClientChange(client)}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span>{client.name}</span>
                      {selectedClient?.id === client.id && (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      )}
                    </div>
                  </DropdownMenuItem>
                ))
              ) : (
                <DropdownMenuItem disabled>No clients available</DropdownMenuItem>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Module Navigation */}
        <div className="flex-1 overflow-y-auto py-2">
          <div className="px-3 py-2">
            <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
              Navigation
            </h3>
          </div>

          <nav className="space-y-1 px-2">
            {/* Dashboard */}
            <button
              className={`w-full flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                activeModule === 'dashboard'
                  ? 'bg-blue-50 text-blue-700'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}
              onClick={() => handleModuleChange('dashboard')}
            >
              <Layout className="mr-3 h-5 w-5 text-gray-500" />
              <span>Dashboard</span>
            </button>

            {/* Primary Modules */}
            <div className="px-3 py-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Primary Modules
              </h3>
            </div>

            {modules
              .filter(m => m.moduleType === 'primary')
              .map(module => (
                <button
                  key={module.id}
                  className={`w-full flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                    activeModule === module.id
                      ? `bg-${module.color}-50 ${getModuleTextColorClass(module.id)}`
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => handleModuleChange(module.id)}
                >
                  {React.createElement(module.icon, {
                    className: `mr-3 h-5 w-5 ${activeModule === module.id ? getModuleTextColorClass(module.id) : 'text-gray-500'}`,
                  })}
                  <span>{module.name}</span>
                </button>
              ))}

            {/* Global Modules */}
            <div className="px-3 py-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Enterprise Services
              </h3>
            </div>

            {modules
              .filter(m => m.moduleType === 'global' || m.moduleType === 'utility')
              .map(module => (
                <button
                  key={module.id}
                  className={`w-full flex items-center px-2 py-2 text-sm font-medium rounded-md ${
                    activeModule === module.id
                      ? `bg-${module.color}-50 ${getModuleTextColorClass(module.id)}`
                      : 'text-gray-700 hover:bg-gray-100'
                  }`}
                  onClick={() => handleModuleChange(module.id)}
                >
                  {React.createElement(module.icon, {
                    className: `mr-3 h-5 w-5 ${activeModule === module.id ? getModuleTextColorClass(module.id) : 'text-gray-500'}`,
                  })}
                  <span>{module.name}</span>
                </button>
              ))}

            {/* CMC CoPilot™ */}
            <div className="px-3 py-2">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                AI Assistant
              </h3>
            </div>

            <Dialog>
              <DialogTrigger asChild>
                <button className="w-full flex items-center px-2 py-2 text-sm font-medium rounded-md bg-amber-50 text-amber-700 border border-amber-200">
                  <Sparkles className="mr-3 h-5 w-5 text-amber-500" />
                  <span>CMC CoPilot™</span>
                </button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[425px]">
                <DialogHeader>
                  <DialogTitle className="flex items-center">
                    <Sparkles className="h-5 w-5 text-amber-500 mr-2" />
                    CMC CoPilot™ Assistant
                  </DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-4">
                  <div className="bg-amber-50 p-3 rounded-md border border-amber-200">
                    <h4 className="text-sm font-medium text-amber-800">
                      Voice-Enabled Regulatory Guidance
                    </h4>
                    <p className="text-sm text-amber-700 mt-1">
                      Ask questions or request guidance on regulatory requirements, CMC
                      documentation, or compliance issues.
                    </p>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Suggested Actions</h4>
                    {cmcCopilotActions.map(action => (
                      <div key={action.id} className="flex items-start p-2 border rounded-md">
                        <div
                          className={`mt-0.5 h-2 w-2 rounded-full ${action.priority === 'high' ? 'bg-red-500' : 'bg-amber-500'} mr-2`}
                        ></div>
                        <div>
                          <p className="text-sm font-medium">{action.title}</p>
                          <p className="text-xs text-gray-500">{action.description}</p>
                        </div>
                      </div>
                    ))}
                  </div>

                  <div>
                    <Input placeholder="Ask CMC CoPilot a question..." className="w-full" />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" className="w-full">
                    <Sparkles className="mr-2 h-4 w-4" />
                    Launch Full CMC CoPilot
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </nav>
        </div>

        {/* User Profile */}
        <div className="p-4 border-t border-gray-200">
          <div className="flex items-center">
            <div className="h-10 w-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-semibold">
              JD
            </div>
            <div className="ml-3">
              <p className="text-sm font-medium text-gray-700">John Doe</p>
              <p className="text-xs text-gray-500">Regulatory Manager</p>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top Navigation Bar */}
        <header className="bg-white border-b border-gray-200 flex items-center justify-between p-4">
          <div className="flex items-center">
            <button
              className="p-1 rounded-md hover:bg-gray-100 focus:outline-none"
              onClick={() => setAsideVisible(!asideVisible)}
            >
              <Layers className="h-5 w-5 text-gray-500" />
            </button>

            <div className="ml-4">
              <h1 className="text-xl font-semibold text-gray-900">
                {activeModule === 'dashboard' ? 'Dashboard' : getModule(activeModule).name}
              </h1>
              <div className="text-sm text-gray-500 flex items-center">
                {selectedOrg ? selectedOrg.name : 'No Organization'}
                {selectedClient && (
                  <>
                    <ChevronRight className="h-3 w-3 mx-1" />
                    {selectedClient.name}
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center space-x-4">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
              <Input
                placeholder="Search..."
                className="pl-9 w-64"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>

            <Button variant="outline" size="sm">
              <Plus className="h-4 w-4 mr-1" />
              New Project
            </Button>

            <Button variant="outline" size="icon" onClick={() => setCmcCopilotVisible(true)}>
              <Sparkles className="h-4 w-4 text-amber-500" />
            </Button>

            <Button variant="outline" size="icon">
              <Bell className="h-4 w-4" />
            </Button>
          </div>
        </header>

        {/* Dashboard View */}
        {activeModule === 'dashboard' && (
          <div className="flex-1 overflow-y-auto p-6">
            {/* Organization/Client Summary Row */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center">
                    <Building className="h-5 w-5 mr-2 text-blue-500" />
                    Organization
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedOrg ? (
                    <div>
                      <h3 className="font-semibold text-lg">{selectedOrg.name}</h3>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Subscription:</span>
                          <span>{selectedOrg.subscriptionTier}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Clients:</span>
                          <span>{selectedOrg.clients}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Projects:</span>
                          <span>{selectedOrg.projects}</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-500">Please select an organization</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center">
                    <Users className="h-5 w-5 mr-2 text-indigo-500" />
                    Client
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {selectedClient ? (
                    <div>
                      <h3 className="font-semibold text-lg">{selectedClient.name}</h3>
                      <div className="mt-2 space-y-1 text-sm">
                        <div className="flex justify-between">
                          <span className="text-gray-500">Industry:</span>
                          <span>{selectedClient.industry}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Active Projects:</span>
                          <span>{selectedClient.activeProjects}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-500">Last Activity:</span>
                          <span>Today</span>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="text-gray-500">Please select a client</div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center">
                    <Activity className="h-5 w-5 mr-2 text-green-500" />
                    Activity Summary
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Active Projects</span>
                      <Badge
                        variant="outline"
                        className="bg-green-50 text-green-700 border-green-200"
                      >
                        {projectList.filter(p => p.status === 'active').length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">In Review</span>
                      <Badge
                        variant="outline"
                        className="bg-amber-50 text-amber-700 border-amber-200"
                      >
                        {projectList.filter(p => p.status === 'review').length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Planning Phase</span>
                      <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                        {projectList.filter(p => p.status === 'planning').length}
                      </Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-sm">Recent Updates</span>
                      <Badge
                        variant="outline"
                        className="bg-purple-50 text-purple-700 border-purple-200"
                      >
                        {
                          activities.filter(
                            a => new Date(a.timestamp) > new Date(Date.now() - 86400000)
                          ).length
                        }
                      </Badge>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Project Stats / Documents / Activity */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2 space-y-6">
                {/* Project Details */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg flex items-center">
                        <ClipboardList className="h-5 w-5 mr-2 text-blue-500" />
                        Projects
                      </CardTitle>
                      <Button variant="ghost" size="sm">
                        <Plus className="h-4 w-4 mr-1" />
                        New Project
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {filteredProjects.length > 0 ? (
                        filteredProjects.map(project => (
                          <div
                            key={project.id}
                            className={`border rounded-md p-4 hover:bg-gray-50 cursor-pointer ${selectedProject?.id === project.id ? 'bg-blue-50 border-blue-200' : ''}`}
                            onClick={() => handleProjectSelect(project)}
                          >
                            <div className="flex justify-between">
                              <div>
                                <h3 className="font-medium">{project.name}</h3>
                                <div className="flex items-center mt-1 space-x-2">
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(project.status)}`}
                                  >
                                    {project.status.charAt(0).toUpperCase() +
                                      project.status.slice(1)}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${getPriorityBadgeClass(project.priority)}`}
                                  >
                                    {project.priority.charAt(0).toUpperCase() +
                                      project.priority.slice(1)}
                                  </span>
                                  <span className="text-xs text-gray-500">{project.type}</span>
                                </div>
                              </div>
                              <div className="text-sm text-right">
                                <div>Due: {project.dueDate}</div>
                                <div className="text-gray-500 text-xs mt-1">
                                  Last updated: {project.lastUpdate}
                                </div>
                              </div>
                            </div>

                            <div className="mt-3">
                              <div className="flex justify-between text-xs mb-1">
                                <span>Progress</span>
                                <span>{project.progress}%</span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${project.progress}%` }}
                                ></div>
                              </div>
                            </div>

                            <div className="mt-3 flex flex-wrap gap-1">
                              {project.modules.map(moduleId => {
                                const module = getModule(moduleId);
                                return (
                                  <Badge
                                    key={moduleId}
                                    variant="outline"
                                    className={`bg-${module.color}-50 text-${module.color}-700 border-${module.color}-200`}
                                  >
                                    {module.name}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-8">
                          <div className="text-gray-400 mb-2">
                            <ClipboardList className="h-12 w-12 mx-auto" />
                          </div>
                          <h3 className="text-lg font-medium text-gray-900">No projects found</h3>
                          <p className="text-gray-500 mt-1">
                            {searchQuery
                              ? 'No projects match your search criteria'
                              : 'Select a client workspace to view projects'}
                          </p>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>

                {/* Documents */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg flex items-center">
                        <FileText className="h-5 w-5 mr-2 text-teal-500" />
                        Recent Documents
                      </CardTitle>
                      <Button variant="ghost" size="sm">
                        View All
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {currentProjectDocuments.length > 0 ? (
                      <div className="overflow-hidden border rounded-md">
                        <table className="min-w-full divide-y divide-gray-200">
                          <thead className="bg-gray-50">
                            <tr>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                Name
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                Type
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                Modified
                              </th>
                              <th
                                scope="col"
                                className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                              >
                                Status
                              </th>
                              <th scope="col" className="relative px-3 py-2">
                                <span className="sr-only">Actions</span>
                              </th>
                            </tr>
                          </thead>
                          <tbody className="bg-white divide-y divide-gray-200">
                            {currentProjectDocuments.map(doc => (
                              <tr key={doc.id} className="hover:bg-gray-50">
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <div className="flex items-center">
                                    <FileText className="h-4 w-4 mr-2 text-gray-400" />
                                    <div className="text-sm font-medium text-gray-900 truncate max-w-[200px]">
                                      {doc.name}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <div className="text-sm text-gray-500">{doc.type}</div>
                                  <div className="text-xs text-gray-400">{doc.format}</div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <div className="text-sm text-gray-500">{doc.lastModified}</div>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap">
                                  <Badge
                                    variant="outline"
                                    className={
                                      doc.status === 'Final'
                                        ? 'bg-green-50 text-green-700 border-green-200'
                                        : doc.status === 'Draft'
                                          ? 'bg-amber-50 text-amber-700 border-amber-200'
                                          : 'bg-blue-50 text-blue-700 border-blue-200'
                                    }
                                  >
                                    {doc.status}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2 whitespace-nowrap text-right text-sm font-medium">
                                  <button className="text-indigo-600 hover:text-indigo-900">
                                    View
                                  </button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : selectedProject ? (
                      <div className="text-center py-8">
                        <div className="text-gray-400 mb-2">
                          <FileText className="h-12 w-12 mx-auto" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">No documents found</h3>
                        <p className="text-gray-500 mt-1">
                          This project doesn't have any documents yet
                        </p>
                        <Button variant="outline" className="mt-4">
                          <Plus className="mr-2 h-4 w-4" />
                          Add Document
                        </Button>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <div className="text-gray-400 mb-2">
                          <FileText className="h-12 w-12 mx-auto" />
                        </div>
                        <h3 className="text-lg font-medium text-gray-900">No documents</h3>
                        <p className="text-gray-500 mt-1">Select a project to view its documents</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                {/* Current Project Details */}
                {selectedProject && (
                  <Card>
                    <CardHeader className="pb-2 border-b">
                      <CardTitle className="text-lg flex items-center">
                        <ClipboardCheck className="h-5 w-5 mr-2 text-blue-500" />
                        Project Details
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="pt-4">
                      <div className="space-y-4">
                        <div>
                          <h3 className="text-xl font-semibold">{selectedProject.name}</h3>
                          <div className="flex items-center mt-1 space-x-2">
                            <span
                              className={`px-2 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(selectedProject.status)}`}
                            >
                              {selectedProject.status.charAt(0).toUpperCase() +
                                selectedProject.status.slice(1)}
                            </span>
                            <span className="text-xs text-gray-500">{selectedProject.type}</span>
                          </div>
                        </div>

                        <div className="pt-2 space-y-2">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="col-span-1">
                              <div className="text-xs text-gray-500">Due Date</div>
                              <div className="text-sm font-medium">{selectedProject.dueDate}</div>
                            </div>
                            <div className="col-span-1">
                              <div className="text-xs text-gray-500">Last Updated</div>
                              <div className="text-sm font-medium">
                                {selectedProject.lastUpdate}
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-gray-500">Progress</div>
                            <div className="mt-1">
                              <div className="flex justify-between text-xs mb-1">
                                <span className="font-medium">
                                  {selectedProject.progress}% Complete
                                </span>
                              </div>
                              <div className="w-full bg-gray-200 rounded-full h-2">
                                <div
                                  className="bg-blue-600 h-2 rounded-full"
                                  style={{ width: `${selectedProject.progress}%` }}
                                ></div>
                              </div>
                            </div>
                          </div>

                          <div>
                            <div className="text-xs text-gray-500">Modules</div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {selectedProject.modules.map(moduleId => {
                                const module = getModule(moduleId);
                                return (
                                  <Badge
                                    key={moduleId}
                                    variant="outline"
                                    className={`bg-${module.color}-50 text-${module.color}-700 border-${module.color}-200`}
                                  >
                                    {module.name}
                                  </Badge>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        <div className="pt-2">
                          <div className="flex space-x-2">
                            <Button className="flex-1">Open Project</Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="outline" size="icon">
                                  <ChevronDown className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem>
                                  <FileCheck className="mr-2 h-4 w-4" />
                                  View Details
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <BarChart className="mr-2 h-4 w-4" />
                                  Generate Report
                                </DropdownMenuItem>
                                <DropdownMenuItem>
                                  <Plus className="mr-2 h-4 w-4" />
                                  Add Document
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem>
                                  <Settings className="mr-2 h-4 w-4" />
                                  Project Settings
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Activity Feed */}
                <Card>
                  <CardHeader className="pb-2">
                    <div className="flex justify-between items-center">
                      <CardTitle className="text-lg flex items-center">
                        <Activity className="h-5 w-5 mr-2 text-purple-500" />
                        Activity
                      </CardTitle>
                      <Button variant="ghost" size="sm">
                        View All
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      {filteredActivities.map(activity => (
                        <div key={activity.id} className="flex">
                          <div className="mr-3 flex-shrink-0">
                            {activity.type === 'document' && (
                              <FileText className="h-5 w-5 text-blue-500" />
                            )}
                            {activity.type === 'milestone' && (
                              <CheckCircle className="h-5 w-5 text-green-500" />
                            )}
                            {activity.type === 'review' && (
                              <ClipboardCheck className="h-5 w-5 text-purple-500" />
                            )}
                            {activity.type === 'comment' && (
                              <MessageSquare className="h-5 w-5 text-amber-500" />
                            )}
                          </div>
                          <div>
                            <div className="text-sm">
                              <span className="font-medium">{activity.user}</span>
                              <span className="text-gray-500"> {activity.action} </span>
                              <span className="font-medium">{activity.item}</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              {formatRelativeTime(activity.timestamp)}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>

                {/* Global Reports Widget - Always visible across modules */}
                <Card className="border-pink-200">
                  <CardHeader className="pb-2 bg-pink-50 border-b border-pink-200">
                    <CardTitle className="text-lg flex items-center">
                      <BarChart className="h-5 w-5 mr-2 text-pink-500" />
                      <span className="text-pink-700">Global Reports</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center p-2 hover:bg-pink-50 rounded-md cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">Project Status Summary</div>
                          <div className="text-xs text-gray-500">All active projects</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-pink-500" />
                      </div>

                      <div className="flex justify-between items-center p-2 hover:bg-pink-50 rounded-md cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">Regulatory Timeline</div>
                          <div className="text-xs text-gray-500">Upcoming deadlines</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-pink-500" />
                      </div>

                      <div className="flex justify-between items-center p-2 hover:bg-pink-50 rounded-md cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">Document Metrics</div>
                          <div className="text-xs text-gray-500">Review statistics</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-pink-500" />
                      </div>
                    </div>

                    <Button
                      variant="outline"
                      className="w-full mt-4 border-pink-200 text-pink-700 hover:bg-pink-50"
                    >
                      <BarChart className="h-4 w-4 mr-2" />
                      View All Reports
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* CER2V Module */}
        {activeModule === 'cer' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <Alert className="bg-green-50 border-green-200">
                <FileText className="h-5 w-5 text-green-600" />
                <AlertTitle className="text-green-800">CER2V™ Module</AlertTitle>
                <AlertDescription className="text-green-700">
                  Generate and manage Clinical Evaluation Reports with AI-powered literature
                  analysis and device safety assessment.
                </AlertDescription>
              </Alert>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>CER Projects</CardTitle>
                    <CardDescription>Clinical Evaluation Reports in progress</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">Neuroclear Medical Device CER</h3>
                            <p className="text-sm text-gray-500 mt-1">EU MDR 2017/745 Compliance</p>
                          </div>
                          <Badge className="bg-green-100 text-green-800 border-green-200">
                            Active
                          </Badge>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span>Progress</span>
                            <span>28%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-600 h-2 rounded-full"
                              style={{ width: '28%' }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">CardioMonitor CER Update</h3>
                            <p className="text-sm text-gray-500 mt-1">Annual Review</p>
                          </div>
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                            Review
                          </Badge>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span>Progress</span>
                            <span>72%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-green-600 h-2 rounded-full"
                              style={{ width: '72%' }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>CER2V™ Features</CardTitle>
                    <CardDescription>
                      Advanced capabilities for regulatory compliance
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <div className="h-8 w-8 rounded-md bg-green-100 flex items-center justify-center mr-3">
                            <Search className="h-5 w-5 text-green-600" />
                          </div>
                          <h3 className="font-medium">Literature Analysis</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          AI-powered literature search and assessment with automatic relevance
                          scoring.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <div className="h-8 w-8 rounded-md bg-green-100 flex items-center justify-center mr-3">
                            <BarChart className="h-5 w-5 text-green-600" />
                          </div>
                          <h3 className="font-medium">PMCF Analysis</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          Post-market clinical follow-up data integration and automated reporting.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <div className="h-8 w-8 rounded-md bg-green-100 flex items-center justify-center mr-3">
                            <AlertTriangle className="h-5 w-5 text-green-600" />
                          </div>
                          <h3 className="font-medium">Vigilance Integration</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          Real-time adverse event data from global databases with trend analysis.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <div className="h-8 w-8 rounded-md bg-green-100 flex items-center justify-center mr-3">
                            <BookOpenCheck className="h-5 w-5 text-green-600" />
                          </div>
                          <h3 className="font-medium">Template Library</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          Extensive library of EU MDR-compliant templates with automatic formatting.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>CER Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Button className="w-full">
                        <Plus className="mr-2 h-4 w-4" />
                        New CER Project
                      </Button>
                      <Button variant="outline" className="w-full">
                        <Search className="mr-2 h-4 w-4" />
                        PubMed Search
                      </Button>
                      <Button variant="outline" className="w-full">
                        <FileCheck className="mr-2 h-4 w-4" />
                        Template Gallery
                      </Button>
                      <Button variant="outline" className="w-full">
                        <BarChart className="mr-2 h-4 w-4" />
                        PMCF Dashboard
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-pink-200">
                  <CardHeader className="pb-2 bg-pink-50 border-b border-pink-200">
                    <CardTitle className="text-lg flex items-center">
                      <BarChart className="h-5 w-5 mr-2 text-pink-500" />
                      <span className="text-pink-700">CER Reports</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center p-2 hover:bg-pink-50 rounded-md cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">Compliance Analytics</div>
                          <div className="text-xs text-gray-500">EU MDR requirement coverage</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-pink-500" />
                      </div>

                      <div className="flex justify-between items-center p-2 hover:bg-pink-50 rounded-md cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">Literature Review Metrics</div>
                          <div className="text-xs text-gray-500">Search efficacy analysis</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-pink-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-amber-200">
                  <CardHeader className="pb-2 bg-amber-50 border-b border-amber-200">
                    <CardTitle className="text-lg flex items-center">
                      <Sparkles className="h-5 w-5 mr-2 text-amber-500" />
                      <span className="text-amber-700">AI Assistant</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <p className="text-sm text-amber-700 mb-3">
                      Get help with your CER development
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-start p-2 border rounded-md border-amber-200 bg-amber-50">
                        <CircleHelp className="h-4 w-4 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
                        <p className="text-xs text-amber-700">
                          Need help with literature search strategy for Class III medical devices?
                        </p>
                      </div>
                      <div className="flex items-start p-2 border rounded-md border-amber-200 bg-amber-50">
                        <CircleHelp className="h-4 w-4 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
                        <p className="text-xs text-amber-700">
                          Want to optimize your PMCF data collection for improved CER quality?
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="relative">
                        <Input
                          placeholder="Ask CER Assistant..."
                          className="pl-3 pr-10 py-2 border-amber-200"
                        />
                        <Button
                          size="icon"
                          className="absolute right-1 top-1 h-6 w-6 bg-amber-500 hover:bg-amber-600"
                        >
                          <Sparkles className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* CMC Module */}
        {activeModule === 'cmc' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <Alert className="bg-amber-50 border-amber-200">
                <Beaker className="h-5 w-5 text-amber-600" />
                <AlertTitle className="text-amber-800">CMC Module™</AlertTitle>
                <AlertDescription className="text-amber-700">
                  Create and manage Chemistry, Manufacturing, and Controls documentation for
                  regulatory submissions with AI assistance.
                </AlertDescription>
              </Alert>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>CMC Projects</CardTitle>
                    <CardDescription>Active CMC documentation in progress</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">CardioZen Phase III CMC</h3>
                            <p className="text-sm text-gray-500 mt-1">Module 3.2.P</p>
                          </div>
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                            Active
                          </Badge>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span>Progress</span>
                            <span>42%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-amber-600 h-2 rounded-full"
                              style={{ width: '42%' }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">Arterenol CMC Documentation</h3>
                            <p className="text-sm text-gray-500 mt-1">Module 3.2.S</p>
                          </div>
                          <Badge className="bg-blue-100 text-blue-800 border-blue-200">
                            Review
                          </Badge>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span>Progress</span>
                            <span>93%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-amber-600 h-2 rounded-full"
                              style={{ width: '93%' }}
                            ></div>
                          </div>
                        </div>
                      </div>

                      <div className="p-4 border rounded-lg">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-medium">ImmuneBoost mAb CMC Package</h3>
                            <p className="text-sm text-gray-500 mt-1">Biologics Submission</p>
                          </div>
                          <Badge className="bg-amber-100 text-amber-800 border-amber-200">
                            Active
                          </Badge>
                        </div>
                        <div className="mt-3">
                          <div className="flex justify-between text-xs mb-1">
                            <span>Progress</span>
                            <span>56%</span>
                          </div>
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div
                              className="bg-amber-600 h-2 rounded-full"
                              style={{ width: '56%' }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>CMC Module™ Features</CardTitle>
                    <CardDescription>Advanced capabilities for CMC documentation</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <div className="h-8 w-8 rounded-md bg-amber-100 flex items-center justify-center mr-3">
                            <FileCheck className="h-5 w-5 text-amber-600" />
                          </div>
                          <h3 className="font-medium">Specification Builder</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          ICH-compliant specification templates with automated validation.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <div className="h-8 w-8 rounded-md bg-amber-100 flex items-center justify-center mr-3">
                            <Repeat className="h-5 w-5 text-amber-600" />
                          </div>
                          <h3 className="font-medium">Process Flow Modeling</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          Visual process flow diagramming with critical parameter tracking.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <div className="h-8 w-8 rounded-md bg-amber-100 flex items-center justify-center mr-3">
                            <AlertTriangle className="h-5 w-5 text-amber-600" />
                          </div>
                          <h3 className="font-medium">Control Strategy</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          Risk-based control strategy development with acceptance criteria wizard.
                        </p>
                      </div>

                      <div className="border rounded-lg p-4">
                        <div className="flex items-center mb-2">
                          <div className="h-8 w-8 rounded-md bg-amber-100 flex items-center justify-center mr-3">
                            <BookOpenCheck className="h-5 w-5 text-amber-600" />
                          </div>
                          <h3 className="font-medium">Stability Protocol Generator</h3>
                        </div>
                        <p className="text-sm text-gray-600">
                          ICH Q1A(R2) compliant stability protocol creation with automated
                          scheduling.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>CMC Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Button className="w-full">
                        <Plus className="mr-2 h-4 w-4" />
                        New CMC Project
                      </Button>
                      <Button variant="outline" className="w-full">
                        <FileCheck className="mr-2 h-4 w-4" />
                        Create Specification
                      </Button>
                      <Button variant="outline" className="w-full">
                        <Repeat className="mr-2 h-4 w-4" />
                        Process Flow Designer
                      </Button>
                      <Button variant="outline" className="w-full">
                        <BarChart className="mr-2 h-4 w-4" />
                        Stability Data Analysis
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-pink-200">
                  <CardHeader className="pb-2 bg-pink-50 border-b border-pink-200">
                    <CardTitle className="text-lg flex items-center">
                      <BarChart className="h-5 w-5 mr-2 text-pink-500" />
                      <span className="text-pink-700">CMC Reports</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-center p-2 hover:bg-pink-50 rounded-md cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">Specification Compliance</div>
                          <div className="text-xs text-gray-500">ICH guideline coverage</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-pink-500" />
                      </div>

                      <div className="flex justify-between items-center p-2 hover:bg-pink-50 rounded-md cursor-pointer">
                        <div>
                          <div className="text-sm font-medium">Stability Trending</div>
                          <div className="text-xs text-gray-500">Long-term stability analysis</div>
                        </div>
                        <ArrowRight className="h-4 w-4 text-pink-500" />
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* CMC CoPilot */}
                <Card className="border-amber-200">
                  <CardHeader className="pb-2 bg-gradient-to-br from-amber-50 to-orange-50 border-b border-amber-200">
                    <CardTitle className="text-lg flex items-center">
                      <Sparkles className="h-5 w-5 mr-2 text-amber-500" />
                      <span className="text-amber-700">CMC CoPilot™</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <p className="text-sm text-amber-700 mb-3">
                      Your 24/7 CMC regulatory assistant
                    </p>
                    <div className="space-y-2">
                      <div className="flex items-start p-2 border rounded-md border-amber-200 bg-amber-50">
                        <div className={`mt-0.5 h-2 w-2 rounded-full bg-red-500 mr-2`}></div>
                        <div>
                          <p className="text-sm font-medium">Complete CMC Section 3.2.P.3.3</p>
                          <p className="text-xs text-amber-700">
                            Manufacturing process validation data needs review
                          </p>
                        </div>
                      </div>
                      <div className="flex items-start p-2 border rounded-md border-amber-200 bg-amber-50">
                        <div className={`mt-0.5 h-2 w-2 rounded-full bg-amber-500 mr-2`}></div>
                        <div>
                          <p className="text-sm font-medium">Update Drug Product Specifications</p>
                          <p className="text-xs text-amber-700">New analytical methods available</p>
                        </div>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="relative">
                        <Input
                          placeholder="Ask CMC CoPilot..."
                          className="pl-3 pr-10 py-2 border-amber-200"
                        />
                        <Button
                          size="icon"
                          className="absolute right-1 top-1 h-6 w-6 bg-amber-500 hover:bg-amber-600"
                        >
                          <Sparkles className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>

                    <Button className="w-full mt-4 bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600">
                      <Sparkles className="mr-2 h-4 w-4" />
                      Launch Full CMC CoPilot
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* Reports Module - GLOBALLY CONNECTED */}
        {activeModule === 'reports' && (
          <div className="flex-1 overflow-y-auto p-6">
            <div className="mb-6">
              <Alert className="bg-pink-50 border-pink-200">
                <BarChart className="h-5 w-5 text-pink-600" />
                <AlertTitle className="text-pink-800">Global Reports Module</AlertTitle>
                <AlertDescription className="text-pink-700">
                  Access cross-module analytics, metrics, and insights across all TrialSage
                  services.
                </AlertDescription>
              </Alert>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2 space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Report Categories</CardTitle>
                    <CardDescription>Generate reports from all connected modules</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="border rounded-lg p-4 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-green-100 flex items-center justify-center mb-3">
                          <FileText className="h-6 w-6 text-green-600" />
                        </div>
                        <h3 className="font-medium">CER2V™</h3>
                        <p className="text-xs text-gray-500 mt-1">6 report types</p>
                      </div>

                      <div className="border rounded-lg p-4 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center mb-3">
                          <ClipboardCheck className="h-6 w-6 text-blue-600" />
                        </div>
                        <h3 className="font-medium">IND Wizard™</h3>
                        <p className="text-xs text-gray-500 mt-1">8 report types</p>
                      </div>

                      <div className="border rounded-lg p-4 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-amber-100 flex items-center justify-center mb-3">
                          <Beaker className="h-6 w-6 text-amber-600" />
                        </div>
                        <h3 className="font-medium">CMC Module™</h3>
                        <p className="text-xs text-gray-500 mt-1">7 report types</p>
                      </div>

                      <div className="border rounded-lg p-4 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-purple-100 flex items-center justify-center mb-3">
                          <BookOpen className="h-6 w-6 text-purple-600" />
                        </div>
                        <h3 className="font-medium">eCTD Author™</h3>
                        <p className="text-xs text-gray-500 mt-1">5 report types</p>
                      </div>

                      <div className="border rounded-lg p-4 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-teal-100 flex items-center justify-center mb-3">
                          <Search className="h-6 w-6 text-teal-600" />
                        </div>
                        <h3 className="font-medium">CSR Intelligence™</h3>
                        <p className="text-xs text-gray-500 mt-1">6 report types</p>
                      </div>

                      <div className="border rounded-lg p-4 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-orange-100 flex items-center justify-center mb-3">
                          <ClipboardList className="h-6 w-6 text-orange-600" />
                        </div>
                        <h3 className="font-medium">Study Architect™</h3>
                        <p className="text-xs text-gray-500 mt-1">5 report types</p>
                      </div>

                      <div className="border rounded-lg p-4 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-indigo-100 flex items-center justify-center mb-3">
                          <BookMarked className="h-6 w-6 text-indigo-600" />
                        </div>
                        <h3 className="font-medium">Regulatory Hub™</h3>
                        <p className="text-xs text-gray-500 mt-1">8 report types</p>
                      </div>

                      <div className="border rounded-lg p-4 text-center">
                        <div className="mx-auto w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                          <Database className="h-6 w-6 text-slate-600" />
                        </div>
                        <h3 className="font-medium">Vault™</h3>
                        <p className="text-xs text-gray-500 mt-1">4 report types</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Quick Report Generator</CardTitle>
                    <CardDescription>Create a new report from any module</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div>
                          <label className="text-sm text-gray-500 mb-1 block">
                            Report Category
                          </label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Select category" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="regulatory">Regulatory Reports</SelectItem>
                              <SelectItem value="quality">Quality Reports</SelectItem>
                              <SelectItem value="clinical">Clinical Reports</SelectItem>
                              <SelectItem value="cmc">CMC Reports</SelectItem>
                              <SelectItem value="project">Project Management</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm text-gray-500 mb-1 block">Report Type</label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Select report" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="status">Submission Status Report</SelectItem>
                              <SelectItem value="timeline">Regulatory Timeline Analysis</SelectItem>
                              <SelectItem value="compliance">Compliance Status Report</SelectItem>
                              <SelectItem value="gap">Submission Gap Analysis</SelectItem>
                              <SelectItem value="metrics">Performance Metrics</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div>
                          <label className="text-sm text-gray-500 mb-1 block">Time Period</label>
                          <Select>
                            <SelectTrigger>
                              <SelectValue placeholder="Select period" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="week">Last 7 Days</SelectItem>
                              <SelectItem value="month">Last 30 Days</SelectItem>
                              <SelectItem value="quarter">Last Quarter</SelectItem>
                              <SelectItem value="year">Last Year</SelectItem>
                              <SelectItem value="custom">Custom Range</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>

                      <div className="flex justify-end">
                        <Button className="bg-pink-600 hover:bg-pink-700">
                          <BarChart className="mr-2 h-4 w-4" />
                          Generate Report
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <div className="flex justify-between items-center">
                      <CardTitle>Recent Reports</CardTitle>
                      <Button variant="ghost" size="sm">
                        View All
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-md border">
                        <div className="flex items-center">
                          <div className="h-9 w-9 rounded-md bg-blue-100 flex items-center justify-center mr-3">
                            <BarChart className="h-5 w-5 text-blue-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">IND Readiness Report</h4>
                            <p className="text-sm text-gray-500">Generated May 8, 2025</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Badge className="mr-3">IND Wizard</Badge>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-md border">
                        <div className="flex items-center">
                          <div className="h-9 w-9 rounded-md bg-amber-100 flex items-center justify-center mr-3">
                            <BarChart className="h-5 w-5 text-amber-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">CMC Documentation Quality</h4>
                            <p className="text-sm text-gray-500">Generated May 5, 2025</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Badge className="mr-3">CMC Module</Badge>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-md border">
                        <div className="flex items-center">
                          <div className="h-9 w-9 rounded-md bg-orange-100 flex items-center justify-center mr-3">
                            <BarChart className="h-5 w-5 text-orange-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">Clinical Trial Enrollment Trends</h4>
                            <p className="text-sm text-gray-500">Generated May 1, 2025</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Badge className="mr-3">Study Architect</Badge>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </div>
                      </div>

                      <div className="flex items-center justify-between p-3 bg-white hover:bg-gray-50 rounded-md border">
                        <div className="flex items-center">
                          <div className="h-9 w-9 rounded-md bg-green-100 flex items-center justify-center mr-3">
                            <BarChart className="h-5 w-5 text-green-600" />
                          </div>
                          <div>
                            <h4 className="font-medium">CER Literature Assessment Quality</h4>
                            <p className="text-sm text-gray-500">Generated April 28, 2025</p>
                          </div>
                        </div>
                        <div className="flex items-center">
                          <Badge className="mr-3">CER2V</Badge>
                          <Button variant="outline" size="sm">
                            View
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-6">
                <Card>
                  <CardHeader>
                    <CardTitle>Report Actions</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <Button className="w-full bg-pink-600 hover:bg-pink-700">
                        <Plus className="mr-2 h-4 w-4" />
                        Create New Report
                      </Button>
                      <Button variant="outline" className="w-full">
                        <ArrowUpRight className="mr-2 h-4 w-4" />
                        Export Reports
                      </Button>
                      <Button variant="outline" className="w-full">
                        <Repeat className="mr-2 h-4 w-4" />
                        Schedule Recurring
                      </Button>
                      <Button variant="outline" className="w-full">
                        <Settings className="mr-2 h-4 w-4" />
                        Report Settings
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle>Report Metrics</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-4">
                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <div className="text-sm">Reports Generated</div>
                          <div className="text-sm font-medium">127</div>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="bg-pink-500 h-full" style={{ width: '68%' }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <div className="text-sm">Most Active Module</div>
                          <div className="text-sm font-medium">IND Wizard</div>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="bg-blue-500 h-full" style={{ width: '42%' }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <div className="text-sm">Scheduled Reports</div>
                          <div className="text-sm font-medium">8</div>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="bg-purple-500 h-full" style={{ width: '23%' }}></div>
                        </div>
                      </div>

                      <div>
                        <div className="flex justify-between items-center mb-1">
                          <div className="text-sm">30-Day Usage</div>
                          <div className="text-sm font-medium">+42%</div>
                        </div>
                        <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                          <div className="bg-green-500 h-full" style={{ width: '42%' }}></div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border-amber-200">
                  <CardHeader className="pb-2 bg-amber-50 border-b border-amber-200">
                    <CardTitle className="text-lg flex items-center">
                      <Sparkles className="h-5 w-5 mr-2 text-amber-500" />
                      <span className="text-amber-700">Reports Assistant</span>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="pt-4">
                    <p className="text-sm text-amber-700 mb-3">Get help with reporting needs</p>
                    <div className="space-y-2">
                      <div className="flex items-start p-2 border rounded-md border-amber-200 bg-amber-50">
                        <CircleHelp className="h-4 w-4 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
                        <p className="text-xs text-amber-700">
                          Need help designing a cross-module report for regulatory insights?
                        </p>
                      </div>
                      <div className="flex items-start p-2 border rounded-md border-amber-200 bg-amber-50">
                        <CircleHelp className="h-4 w-4 text-amber-500 mt-0.5 mr-2 flex-shrink-0" />
                        <p className="text-xs text-amber-700">
                          Want to visualize protocol compliance across multiple studies?
                        </p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="relative">
                        <Input
                          placeholder="Ask Reports Assistant..."
                          className="pl-3 pr-10 py-2 border-amber-200"
                        />
                        <Button
                          size="icon"
                          className="absolute right-1 top-1 h-6 w-6 bg-amber-500 hover:bg-amber-600"
                        >
                          <Sparkles className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        )}

        {/* Placeholder for other modules */}
        {activeModule !== 'dashboard' &&
          activeModule !== 'cer' &&
          activeModule !== 'cmc' &&
          activeModule !== 'reports' && (
            <div className="flex-1 overflow-y-auto p-6">
              <Alert
                className={`mb-6 bg-${getModule(activeModule).color}-50 border-${getModule(activeModule).color}-200`}
              >
                {React.createElement(getModule(activeModule).icon, {
                  className: `h-5 w-5 text-${getModule(activeModule).color}-600`,
                })}
                <AlertTitle className={`text-${getModule(activeModule).color}-800`}>
                  {getModule(activeModule).name}
                </AlertTitle>
                <AlertDescription className={`text-${getModule(activeModule).color}-700`}>
                  {getModule(activeModule).description}
                </AlertDescription>
              </Alert>

              <div className="flex items-center justify-center h-64 bg-white rounded-lg border shadow-sm">
                <div className="text-center">
                  <div className="text-gray-400 mb-3">
                    {React.createElement(getModule(activeModule).icon, {
                      className: 'h-12 w-12 mx-auto',
                    })}
                  </div>
                  <h2 className="text-xl font-medium">{getModule(activeModule).name} Module</h2>
                  <p className="text-gray-500 mt-2 max-w-md">
                    This module provides advanced functionality related to{' '}
                    {getModule(activeModule).description.toLowerCase()}
                  </p>
                </div>
              </div>
            </div>
          )}
      </div>
    </div>
  );
};

export default EnterpriseClientPortalFinal;
