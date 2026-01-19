import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { Button } from '@/components/ui/button';
import { useTenant } from '../contexts/TenantContext';
import { OrganizationSwitcher } from '../components/tenant/OrganizationSwitcher';
import { ClientWorkspaceSwitcher } from '../components/tenant/ClientWorkspaceSwitcher';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, Users, Info, MessageCircle, FileEdit, Database, FolderOpen, BarChart, Brain, Lock, Settings, Shield, Package, Network, UserPlus, Layers } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowRight, BarChart3, BookOpen, CheckCircle, Clock, FileText, MessageSquare, TrendingUp, Zap } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useLumenAiAssistant } from '../contexts/LumenAiAssistantContext';
import concept2cureLogo from '@/assets/concept2cure-logo.jpg';
import { authService } from '../services/authService';

// Import component placeholders (these would be real components in production)
import NextActionsSidebar from '../components/NextActionsSidebar';
import VaultQuickAccess from '../components/VaultQuickAccess';
import AnalyticsQuickView from '../components/AnalyticsQuickView';
import ReportsQuickWidget from '../components/ReportsQuickWidget';
import AboutConcept2CureAI from '../components/client-portal/AboutConcept2CureAI';
 

const ClientPortalLanding = () => {
  const [projects, setProjects] = useState([]);
  const [portalUser, setPortalUser] = useState(null);
  const [portalOrganization, setPortalOrganization] = useState(null);
  const [portalWorkspaces, setPortalWorkspaces] = useState([]);
  const [portalWorkspaceAccess, setPortalWorkspaceAccess] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [, setLocation] = useLocation();
  const [hasAuthToken, setHasAuthToken] = useState(false);
  const [entitledModules, setEntitledModules] = useState([]);
  
  // Safe tenant context access with fallback
  let tenantContext;
  try {
    tenantContext = useTenant();
  } catch (err) {
    console.error('Error accessing tenant context:', err);
    tenantContext = { 
      currentOrganization: null, 
      currentClientWorkspace: null, 
      currentModule: null, 
      setCurrentModule: () => {} 
    };
  }
  const { currentOrganization, currentClientWorkspace, currentModule, setCurrentModule } = tenantContext;

  // Safe Lumen AI context access with fallback
  let aiContext;
  try {
    aiContext = useLumenAiAssistant();
  } catch (err) {
    console.error('Error accessing Lumen AI context:', err);
    aiContext = { openAssistant: () => {} };
  }
  const { openAssistant } = aiContext;

  // Fetch client workspace settings to control module visibility
  const clientId = currentClientWorkspace?.id;
  const { data: workspaceSettings, isLoading: settingsLoading } = useQuery({
    queryKey: ['/api/clients', clientId, 'settings'],
    queryFn: () => {
      if (!clientId) {
        console.warn('No client workspace selected. Using default module visibility.');
        return null;
      }
      return apiRequest(`/api/clients/${clientId}/settings`).catch(err => {
        console.error('Error fetching workspace settings:', err);
        return null;
      });
    },
    enabled: !!clientId,
  });

  // Module ID to settings key mapping
  const moduleIdToSettingsKey = {
    'coauthor': 'ectdEnabled',
    'cmc': 'cmcEnabled',
    'medical-device': 'medicalDeviceEnabled',
    'module-editor': 'moduleSectionEditorEnabled',
    'document-authoring': 'enhancedDocumentEditorEnabled',
    'study-regulatory-suite': 'studyRegulatoryEnabled', // Unified module toggle
    'risk': 'riskHeatmapEnabled',
    'vault': 'vaultEnabled',
    'analytics': 'analyticsEnabled',
    'submission-center': 'submissionCenterEnabled',
    // 'ind': 'indEnabled', // DELETED per user request
    // 'ectd-unified': 'ectdUnifiedEnabled', // DELETED per user request
        {
          id: 'document-authoring',
          title: 'Enhanced Document Editor™',
          description: 'Collaborative authoring with compliance validation',
          path: '/enhanced-editor',
          isNew: true,
        },
        return;
      }

      try {
        setLoading(true);
        setError(null);
        const token = authService.getToken();
        const response = await fetch('/api/portal/bootstrap', {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        const payload = await response.json();
        if (!response.ok || !payload?.success) {
          throw new Error(payload?.message || 'Unable to load portal data');
        }

        setProjects(payload.projects || []);
        setPortalUser(payload.user || null);
        setPortalOrganization(payload.currentOrganization || null);
        setPortalWorkspaces(payload.clientWorkspaces || []);
        setPortalWorkspaceAccess(payload.workspaceAccess || []);
        setEntitledModules(payload.modules || []);
        setLoading(false);
      } catch (err) {
        console.error('Portal load error:', err);
        setError(err.message || 'Unable to load portal data');
        setLoading(false);
      }
    };

    loadPortal();
  }, [setLocation]);

  useEffect(() => {
    try {
      const token =
        localStorage.getItem('token') ||
        localStorage.getItem('authToken') ||
        localStorage.getItem('auth_token');
      setHasAuthToken(!!token);
    } catch (err) {
      console.warn('Unable to read auth token from localStorage.', err);
    }
  }, []);

  // Filter workflow sections based on enabled modules
  const allWorkflowSections = [
    {
      title: 'ACTIVE SUBMISSIONS',
      icon: <FileText className="h-5 w-5" />,
      description: 'Create and manage regulatory submissions',
      modules: [
        {
          id: 'submission-center',
          title: 'Submission Center™',
          description: 'Unified IND Wizard and eCTD Co-Author workspace',
          path: '/submission-center',
          highlight: true,
        },
        {
          id: 'coauthor',
          title: 'eCTD Co-Author™',
          description: 'AI-assisted co-authoring of CTD submission sections',
          path: '/ectd-co-author',
        },
        {
          id: 'cmc',
          title: 'CMC Wizard™',
          description: 'Chemistry, Manufacturing, and Controls documentation',
          path: '/cmc-blueprint',
        },
        {
          id: 'medical-device',
          title: 'Medical Device & Diagnostics RA™',
          description: 'Next-generation regulatory automation for medical device and diagnostics submissions',
          path: '/cerv2',
        },
      ]
    },
    {
      title: 'DOCUMENT AUTHORING',
      icon: <FileEdit className="h-5 w-5" />,
      description: 'Author and design regulatory documents',
      modules: [
        {
          id: 'module-editor',
          title: 'Module Section Editor™',
          description: 'Edit and manage CTD module sections with precision',
          path: '/module-editor',
          isNew: true,
        },
        {
          id: 'document-authoring',
          title: 'Enhanced Document Editor™',
          description: 'Professional document editor with advanced features for regulatory documentation',
          path: '/enhanced-editor',
          highlight: true,
        },
      ]
    },
    {
      title: 'REGULATORY INTELLIGENCE',
      icon: <Brain className="h-5 w-5" />,
      description: 'AI-powered insights and risk assessment',
      modules: [
        {
          id: 'study-regulatory-suite',
          title: 'Study & Regulatory Intelligence Suite™',
          description: 'Unified platform for protocol design, study planning, CSR analytics, regulatory compliance, and predictive insights',
          path: '/unified-suite',
          isNew: true,
          highlight: true,
        },
        {
          id: 'lumen-cortex',
          title: 'Lumen Cortex™',
          description: 'Command Center for hunter status, audit stream, and live intelligence telemetry',
          path: '/client-portal/lumen-cortex',
          highlight: true,
        },
        {
          id: 'risk',
          title: 'Risk Heatmap™',
          description: 'Interactive visualization of CTD risk gaps & impacts',
          path: '/regulatory-risk-dashboard',
        },
      ]
    },
    {
      title: 'REPOSITORY & ANALYTICS',
      icon: <Database className="h-5 w-5" />,
      description: 'Document management and performance analytics',
      modules: [
        {
          id: 'vault',
          title: 'C2C Vault™',
          description: 'Secure document storage with intelligent retrieval',
          path: '/vault',
        },
        {
          id: 'analytics',
          title: 'Analytics Dashboard',
          description: 'Metrics and insights on regulatory performance',
          path: '/analytics',
        },
      ]
    },
  ];

  // Filter modules based on workspace settings
  const filterEnabledModules = (sections) => {
    const entitledIds = new Set((entitledModules || []).map(module => module.moduleId || module.id));

    return sections.map(section => {
      const filteredModules = section.modules.filter(module => {
        if (entitledIds.size > 0 && !entitledIds.has(module.id)) {
          return false;
        }
        if (!workspaceSettings?.modules) {
          return true;
        }
        // Check if this module has a settings key
        const settingsKey = moduleIdToSettingsKey[module.id];
        
        // If it's a special case (true), always show
        if (settingsKey === true) {
          return true;
        }
        
        // If no settings key defined, show by default
        if (!settingsKey) {
          console.warn(`No settings key for module: ${module.id}`);
          return true;
        }
        
        // Check if module is enabled in settings
        const isEnabled = workspaceSettings.modules[settingsKey] !== false;
        console.log(`Module ${module.id} (${settingsKey}): ${isEnabled}`);
        return isEnabled;
      });

      return {
        ...section,
        modules: filteredModules
      };
    }).filter(section => section.modules.length > 0); // Remove empty sections
  };

  const normalize = value => String(value || '').toLowerCase();

  const accessIntelligence = useMemo(() => {
    const role = portalOrganization?.role || 'member';
    const title = portalUser?.title || '';
    const department = portalUser?.department || '';
    const jobSignal = `${title} ${department}`.trim();

    const focusMatrix = [
      {
        key: 'regulatory',
        match: ['regulatory', 'quality', 'qa', 'compliance', 'ra'],
        priority: ['submission-center', 'coauthor', 'module-editor', 'document-authoring', 'risk', 'analytics'],
        label: 'Regulatory strategy & submission readiness',
      },
      {
        key: 'clinical',
        match: ['clinical', 'study', 'trial', 'medical'],
        priority: ['study-regulatory-suite', 'analytics', 'vault', 'risk'],
        label: 'Clinical execution & study oversight',
      },
      {
        key: 'operations',
        match: ['operations', 'ops', 'program', 'project', 'pm'],
        priority: ['submission-center', 'vault', 'analytics', 'coauthor'],
        label: 'Program operations & delivery',
      },
      {
        key: 'executive',
        match: ['chief', 'vp', 'director', 'executive', 'c-level'],
        priority: ['analytics', 'risk', 'submission-center', 'study-regulatory-suite'],
        label: 'Executive visibility & risk posture',
      },
      {
        key: 'data',
        match: ['data', 'biostats', 'biostat', 'analytics', 'informatics'],
        priority: ['analytics', 'study-regulatory-suite', 'vault', 'risk'],
        label: 'Data intelligence & insights',
      },
    ];

    const matchedFocus = focusMatrix.find(entry =>
      entry.match.some(term => normalize(jobSignal).includes(term))
    );

    const rolePriority = role === 'admin'
      ? ['submission-center', 'analytics', 'risk']
      : role === 'manager'
        ? ['submission-center', 'coauthor', 'analytics']
        : role === 'viewer'
          ? ['analytics', 'vault']
          : [];

    const prioritySet = new Set([...(matchedFocus?.priority || []), ...rolePriority]);

    const activeProjects = projects || [];
    const workspaceRole = portalWorkspaceAccess.find(access =>
      String(access.clientWorkspaceId) === String(currentClientWorkspace?.id)
    )?.role;
    const projectTypes = Array.from(new Set(activeProjects.map(project => project.type).filter(Boolean)));
    const projectTags = Array.from(
      new Set(activeProjects.flatMap(project => project.tags || []).filter(Boolean))
    );
    const studyGroups = projectTags.length ? projectTags : projectTypes;

    return {
      role,
      title,
      department,
      focusLabel: matchedFocus?.label || 'Balanced enterprise workflow',
      priorityModules: Array.from(prioritySet),
      activeProjects,
      studyGroups,
      workspaceCount: portalWorkspaces.length,
      workspaceRole,
    };
  }, [portalOrganization, portalUser, projects, portalWorkspaces, portalWorkspaceAccess, currentClientWorkspace]);

  const personalizeSections = sections => {
    if (!accessIntelligence?.priorityModules?.length) return sections;
    return sections.map(section => {
      const scored = section.modules
        .map(module => ({
          ...module,
          isRecommended: accessIntelligence.priorityModules.includes(module.id),
          _priorityRank: accessIntelligence.priorityModules.indexOf(module.id),
        }))
        .sort((a, b) => {
          const aScore = a._priorityRank === -1 ? 999 : a._priorityRank;
          const bScore = b._priorityRank === -1 ? 999 : b._priorityRank;
          return aScore - bScore;
        })
        .map(({ _priorityRank, ...module }) => module);
      return { ...section, modules: scored };
    });
  };

  const isAdminUser = accessIntelligence?.role === 'admin' || accessIntelligence?.role === 'manager';

  // Apply module filtering based on workspace settings
  const workflowSections = useMemo(() => {
    const filtered = filterEnabledModules(allWorkflowSections);
    const personalized = personalizeSections(filtered);
    console.log('Filtered workflow sections:', personalized);
    return personalized;
  }, [workspaceSettings, allWorkflowSections, entitledModules, accessIntelligence]);

  const handleModuleSelect = moduleId => {
    console.log('Module clicked:', moduleId);
    try {
      // Find the module path
      let selectedModule = null;
      for (const section of workflowSections) {
        const found = section.modules.find(m => m.id === moduleId);
        if (found) {
          selectedModule = found;
          break;
        }
      }

      console.log('Selected module:', selectedModule);
      if (selectedModule) {
        console.log('Navigating to:', selectedModule.path);
        // Use safer navigation method
        setLocation(selectedModule.path);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback to direct navigation
      let selectedModule = null;
      for (const section of workflowSections) {
        const found = section.modules.find(m => m.id === moduleId);
        if (found) {
          selectedModule = found;
          break;
        }
      }
      if (selectedModule) {
        console.log('Fallback navigation to:', selectedModule.path);
        window.location.href = selectedModule.path;
      }
    }
  };


  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50" style={{ position: 'relative' }}>
      {loading && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
        </div>
      )}

      {error && (
        <div className="flex items-center justify-center min-h-screen">
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded">
            <p>{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="mt-2 bg-red-100 hover:bg-red-200 text-red-800 px-4 py-2 rounded"
            >
              Retry
            </button>
          </div>
        </div>
      )}

      {!loading && !error && (
        <div className="container mx-auto py-8 px-4">
          {/* Professional Header with Logo */}
          <div className="mb-8 bg-white rounded-xl shadow-lg p-6 border border-gray-100">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div className="flex items-center gap-4">
                <img
                  src={concept2cureLogo}
                  alt="Concept2Cure"
                  className="h-12 w-auto object-contain"
                />
                <div className="border-l-2 border-gray-200 pl-4">
                  <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-700 to-indigo-700 bg-clip-text text-transparent">
                    Client Portal
                  </h1>
                  <p className="text-gray-600 mt-1 text-sm">
                    Biotech Regulatory Management Platform
                  </p>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-white hover:bg-gray-50 transition-colors">
                  <Building className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-xs text-gray-500">Organization</div>
                    <OrganizationSwitcher />
                  </div>
                </div>

                <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-white hover:bg-gray-50 transition-colors">
                  <Users className="h-5 w-5 text-blue-600" />
                  <div>
                    <div className="text-xs text-gray-500">Workspace</div>
                    <ClientWorkspaceSwitcher />
                  </div>
                </div>

                <div className="flex gap-2">
                  {isAdminUser && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-white hover:bg-blue-50 transition-all duration-150">
                          <Settings className="h-5 w-5 text-blue-600" />
                          <div className="text-left">
                            <div className="text-xs text-gray-500">Admin</div>
                            <div className="text-sm font-medium">Console & Settings</div>
                          </div>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-72">
                        <DropdownMenuLabel>Enterprise Admin Console</DropdownMenuLabel>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setLocation('/admin-console')}>
                          <Settings className="h-4 w-4 text-blue-600" />
                          Open admin console
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setLocation('/settings?tab=general')}>
                          <Building className="h-4 w-4 text-blue-600" />
                          Organization settings
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation('/settings?tab=security')}>
                          <Shield className="h-4 w-4 text-indigo-600" />
                          Enterprise security
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation('/client-management?tab=users')}>
                          <UserPlus className="h-4 w-4 text-emerald-600" />
                          New users & access
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation('/client-licenses')}>
                          <Package className="h-4 w-4 text-amber-600" />
                          Licensing & entitlements
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setLocation('/tenant-management')}>
                          <Network className="h-4 w-4 text-slate-600" />
                          CRO parent / child hierarchy
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => setLocation('/client-management?tab=workspace-settings')}>
                          <Layers className="h-4 w-4 text-purple-600" />
                          Workspace & project dependencies
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-blue-200 text-blue-600 hover:bg-blue-50"
                    onClick={() => {
                      openAssistant('client_portal', { source: 'dashboard' });
                    }}
                  >
                    <MessageSquare className="h-4 w-4 mr-2" />
                    Ask Lumen
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="border-purple-200 text-purple-600 hover:bg-purple-50"
                    onClick={() => setLocation('/lumen-insights')}
                  >
                    <Brain className="h-4 w-4 mr-2" />
                    Lumen Insights
                  </Button>
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="flex items-center gap-2 text-slate-800 font-semibold">
                      <Shield className="h-5 w-5 text-indigo-600" />
                      Access intelligence
                    </div>
                    <p className="text-sm text-slate-600 mt-1">
                      {accessIntelligence?.focusLabel}
                    </p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge variant="outline">
                      Role: {accessIntelligence?.role || 'member'}
                    </Badge>
                    {accessIntelligence?.department && (
                      <Badge variant="outline">Dept: {accessIntelligence.department}</Badge>
                    )}
                    {accessIntelligence?.title && (
                      <Badge variant="outline">Title: {accessIntelligence.title}</Badge>
                    )}
                    <Badge variant="outline">
                      Projects: {accessIntelligence?.activeProjects?.length || 0}
                    </Badge>
                    <Badge variant="outline">
                      Workspaces: {accessIntelligence?.workspaceCount || 0}
                    </Badge>
                    {accessIntelligence?.workspaceRole && (
                      <Badge variant="outline">
                        Workspace role: {accessIntelligence.workspaceRole}
                      </Badge>
                    )}
                  </div>
                </div>
                {accessIntelligence?.studyGroups?.length > 0 && (
                  <div className="mt-4 flex flex-wrap gap-2">
                    <div className="text-xs text-slate-500 uppercase tracking-wide mr-2">Study groups</div>
                    {accessIntelligence.studyGroups.slice(0, 8).map(group => (
                      <Badge key={group} variant="secondary">
                        {group}
                      </Badge>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Current Context Info */}
            <div className="mt-4 border-t border-gray-100 pt-4">
              <div className="flex flex-wrap gap-8">
                <div>
                  <div className="text-xs text-gray-500">Current Organization</div>
                  <div className="text-sm font-medium">
                    {currentOrganization?.name || 'None Selected'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Current Client</div>
                  <div className="text-sm font-medium">
                    {currentClientWorkspace?.name || 'None Selected'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Subscription Tier</div>
                  <div className="text-sm font-medium">
                    {currentOrganization?.subscriptionTier || 'Standard'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Storage Usage</div>
                  <div className="text-sm font-medium">
                    {currentClientWorkspace?.storageUsedGB || '0'} GB /{' '}
                    {currentClientWorkspace?.quotaStorageGB || '5'} GB
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500">Projects</div>
                  <div className="text-sm font-medium">
                    {currentClientWorkspace?.activeProjects || '3'} /{' '}
                    {currentClientWorkspace?.quotaProjects || '10'}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-8 rounded-xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <div className="flex items-center gap-2 text-blue-700 font-semibold">
                  <Lock className="h-5 w-5" />
                  Security login
                </div>
                <p className="text-sm text-gray-600 mt-1">
                  Sign in to enable secure actions, audit trails, and regulated workflows.
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <Badge variant={hasAuthToken ? 'default' : 'secondary'}>
                  {hasAuthToken ? 'Security session active' : 'Not signed in'}
                </Badge>
                <Button onClick={() => setLocation('/login')}>
                  Security login
                </Button>
              </div>
            </div>
          </div>

          {/* Welcome Header Section */}
          <div className="flex items-start justify-between gap-4 mb-8">
            <div className="flex-1">
              <h2 className="text-2xl font-bold text-gray-900">
                Welcome to {currentOrganization?.name || 'Concept2Cure Platform'}
              </h2>
              <p className="text-gray-600 mt-1">
                {currentClientWorkspace?.name || 'Select a workspace to begin'}
              </p>
            </div>
          </div>


          {/* Prominent Submission Center Banner */}
          <div className="mb-8 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl shadow-xl p-8 text-white">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
              <div className="flex-1">
                <h2 className="text-3xl font-bold mb-2 flex items-center gap-3">
                  🚀 Unified Regulatory Submission Center
                  <Badge className="bg-yellow-400 text-black">NEW</Badge>
                </h2>
                <p className="text-lg opacity-95 mb-4">
                  Complete workflow orchestration from IND preparation through eCTD submission - all in one integrated workspace
                </p>
                <div className="flex flex-wrap gap-3 text-sm">
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    <span>IND Wizard Integration</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    <span>CMC Platform</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    <span>CSR Intelligence</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    <span>eCTD Assembly</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <CheckCircle className="h-4 w-4" />
                    <span>Task Management</span>
                  </div>
                </div>
              </div>
              <div className="flex flex-col gap-3">
                <Button
                  size="lg"
                  className="bg-white text-blue-600 hover:bg-gray-100 font-bold px-8 py-6 text-lg shadow-lg hover:shadow-xl transition-all duration-200"
                  onClick={() => setLocation('/submission-center')}
                >
                  <BarChart className="h-6 w-6 mr-2" />
                  Open Submission Center
                  <ArrowRight className="h-5 w-5 ml-2" />
                </Button>
                <div className="text-center text-sm opacity-90">
                  View consolidated progress across all modules
                </div>
              </div>
            </div>
          </div>

          {/* About Concept2Cure's AI */}
          <div className="mb-10">
            <AboutConcept2CureAI
              currentOrganization={currentOrganization}
              currentClientWorkspace={currentClientWorkspace}
            />
          </div>

          {/* Main Content - Modules Only */}
          <div className="max-w-6xl mx-auto">
            <div className="mb-8 text-center">
              <h2 className="text-3xl font-bold bg-gradient-to-r from-gray-900 to-gray-700 bg-clip-text text-transparent mb-3">
                Concept2Cure Platform Modules
              </h2>
              <p className="text-gray-600 text-lg">Navigate your complete regulatory workflow with intelligent automation</p>
            </div>

            {/* Workflow Sections */}
            {settingsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
                <Skeleton className="h-48 w-full" />
              </div>
            ) : (
            <div className="space-y-8">
              {workflowSections.map((section, sectionIndex) => (
                <div key={sectionIndex} className="bg-white/90 backdrop-blur-sm rounded-2xl shadow-lg shadow-gray-200/50 border border-gray-200/30 overflow-hidden transition-all duration-300 hover:shadow-xl">
                  {/* Section Header */}
                  <div className="bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 text-white px-6 py-5">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur flex items-center justify-center shadow-sm">
                        {section.icon}
                      </div>
                      <div>
                        <h3 className="text-xl font-bold tracking-tight">{section.title}</h3>
                        <p className="text-sm opacity-95 mt-0.5">{section.description}</p>
                      </div>
                    </div>
                  </div>

                  {/* Section Modules */}
                  <div className="p-4">
                    <div className="grid grid-cols-1 gap-3">
                      {section.modules.map(module => (
                        <div
                          key={module.id}
                          data-testid={`module-card-${module.id}`}
                          onClick={() => handleModuleSelect(module.id)}
                          className={`relative rounded-xl p-5 cursor-pointer transition-all duration-300 transform
                            hover:scale-[0.98] active:scale-[0.96] hover:shadow-xl
                            ${module.highlight
                              ? 'bg-gradient-to-br from-white via-blue-50/30 to-indigo-50/20 border-2 border-blue-200/50 shadow-lg shadow-blue-100/30'
                              : 'bg-white/80 backdrop-blur-sm border border-gray-200/50 hover:border-gray-300'
                            } hover:bg-gradient-to-br hover:from-white hover:to-gray-50/50`}
                        >
                          {module.isNew && (
                            <span className="absolute top-3 right-3 bg-gradient-to-r from-green-500 to-emerald-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                              NEW
                            </span>
                          )}
                          {module.highlight && !module.isNew && (
                            <span className="absolute top-3 right-3 bg-gradient-to-r from-indigo-500 to-purple-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                              ENHANCED
                            </span>
                          )}
                          {module.isRecommended && !module.isNew && !module.highlight && (
                            <span className="absolute top-3 right-3 bg-gradient-to-r from-blue-500 to-sky-500 text-white text-xs font-semibold px-2.5 py-1 rounded-full shadow-sm">
                              RECOMMENDED
                            </span>
                          )}
                          <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center flex-shrink-0 shadow-sm">
                              <ArrowRight className="h-5 w-5 text-white" />
                            </div>
                            <div className="flex-1">
                              <h4 className="text-lg font-semibold text-gray-900 tracking-tight">{module.title}</h4>
                              <p className="text-sm text-gray-600 mt-1 leading-relaxed">{module.description}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
            )}
          </div>
        </div>
      )}

    </div>
  );
};

export default ClientPortalLanding;