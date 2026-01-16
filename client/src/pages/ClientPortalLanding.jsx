import React, { useState, useEffect, useMemo } from 'react';
import { useLocation, Link } from 'wouter';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { apiRequest } from '../lib/queryClient';
import { Button } from '@/components/ui/button';
import { useTenant } from '../contexts/TenantContext';
import { OrganizationSwitcher } from '../components/tenant/OrganizationSwitcher';
import { ClientWorkspaceSwitcher } from '../components/tenant/ClientWorkspaceSwitcher';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Building, Users, Info, MessageCircle, Bot, FileEdit, Database, FolderOpen, BarChart, Brain, Lock, Settings } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { AlertTriangle, ArrowRight, BarChart3, BookOpen, CheckCircle, Clock, FileText, MessageSquare, Shield, TrendingUp, Zap } from 'lucide-react';
import { useLumenAiAssistant } from '../contexts/LumenAiAssistantContext';
import concept2cureLogo from '@/assets/concept2cure-logo.jpg';

// Import component placeholders (these would be real components in production)
import NextActionsSidebar from '../components/NextActionsSidebar';
import VaultQuickAccess from '../components/VaultQuickAccess';
import AnalyticsQuickView from '../components/AnalyticsQuickView';
import ReportsQuickWidget from '../components/ReportsQuickWidget';
import EmbeddedCodingAgent from '../components/ai/EmbeddedCodingAgent';
import AboutConcept2CureAI from '../components/client-portal/AboutConcept2CureAI';
 

const ClientPortalLanding = () => {
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [, setLocation] = useLocation();
  const [showChatGPT, setShowChatGPT] = useState(false);
  const [chatMessages, setChatMessages] = useState([
    {
      role: 'assistant',
      content:
        "Hello! I'm your internal OpenAI ChatGPT coding and client support agent. How can I help you today?",
    },
  ]);
  const [currentMessage, setCurrentMessage] = useState('');
  
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
    'enhanced-editor': 'enhancedDocumentEditorEnabled',
    'study-regulatory-suite': 'studyRegulatoryEnabled', // Unified module toggle
    'risk': 'riskHeatmapEnabled',
    'vault': 'vaultEnabled',
    'analytics': 'analyticsEnabled',
    'submission-center': 'submissionCenterEnabled',
    // 'ind': 'indEnabled', // DELETED per user request
    // 'ectd-unified': 'ectdUnifiedEnabled', // DELETED per user request
  };
  

  useEffect(() => {
    // Log that the ClientPortalLanding component has mounted
    console.log('ClientPortalLanding component mounted');
    console.log('Current workspace settings:', workspaceSettings?.modules);

    // Use mock data instead of fetching from API
    const mockProjects = [
      {
        id: 'proj-001',
        name: 'Enzymax Forte IND',
        status: 'active',
        progress: 65,
        lastUpdated: '2025-04-20',
        modules: ['IND Wizard', 'CMC Wizard', 'Vault'],
      },
      {
        id: 'proj-002',
        name: 'Cardiozen Phase 2 Study',
        status: 'active',
        progress: 42,
        lastUpdated: '2025-04-22',
        modules: ['Study Architect', 'Protocol Designer'],
      },
      {
        id: 'proj-003',
        name: 'Neuroclear Medical Device',
        status: 'pending',
        progress: 28,
        lastUpdated: '2025-04-18',
        modules: ['CER Generator'],
      },
      {
        id: 'proj-004',
        name: 'Respironix eCTD Submission',
        status: 'active',
        progress: 75,
        lastUpdated: '2025-05-05',
        modules: ['eCTD Co-Author', 'Vault'],
      },
    ];

    // Set mock projects data
    setProjects(mockProjects);
    setLoading(false);

    // Update console log for tracking
    console.log('All module access links updated to point to /client-portal');
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
          id: 'enhanced-editor',
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
    if (!workspaceSettings?.modules) {
      // If no settings loaded yet, show all modules
      return sections;
    }

    return sections.map(section => {
      const filteredModules = section.modules.filter(module => {
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

  // Apply module filtering based on workspace settings
  const workflowSections = useMemo(() => {
    const filtered = filterEnabledModules(allWorkflowSections);
    console.log('Filtered workflow sections:', filtered);
    return filtered;
  }, [workspaceSettings, allWorkflowSections]);

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

  const handleSendMessage = async () => {
    if (!currentMessage.trim()) return;

    const userMessage = { role: 'user', content: currentMessage };
    const updatedMessages = [...chatMessages, userMessage];
    setChatMessages(updatedMessages);
    setCurrentMessage('');

    try {
      const response = await axios.post('/api/assistant/message', {
        message: currentMessage,
        mode: 'developer',
        context: 'Concept2Cure Technical Support',
        documentSection: 'Client Portal Interface',
      });

      setChatMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content: response.data.reply,
        },
      ]);
    } catch (error) {
      setChatMessages([
        ...updatedMessages,
        {
          role: 'assistant',
          content:
            "I apologize, but I'm having trouble connecting right now. Please try again in a moment.",
        },
      ]);
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
                  <button
                    onClick={() => setLocation('/settings?tab=module-management')}
                    className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-white hover:bg-blue-50 transition-all duration-150"
                  >
                    <Settings className="h-5 w-5 text-blue-600" />
                    <div className="text-left">
                      <div className="text-xs text-gray-500">Admin</div>
                      <div className="text-sm font-medium">Settings</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setLocation('/ai')}
                    className="flex items-center gap-2 border border-blue-200 rounded-lg p-2 bg-blue-50 hover:bg-blue-100 transition-all duration-150"
                  >
                    <Bot className="h-5 w-5 text-blue-600" />
                    <div className="text-left">
                      <div className="text-xs text-blue-500">Get Help</div>
                      <div className="text-sm font-medium">💬 Coding Agent</div>
                    </div>
                  </button>
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

      {/* Floating AI Agent Panel */}
      <div style={{ position: 'fixed', top: 20, right: 20, zIndex: 1000 }}>
        <EmbeddedCodingAgent />
      </div>
    </div>
  );
};

export default ClientPortalLanding;