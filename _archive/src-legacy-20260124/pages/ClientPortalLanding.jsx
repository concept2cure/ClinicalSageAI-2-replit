import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import axios from 'axios';
import { Button } from '@/components/ui/button';
import { useTenant } from '../contexts/TenantContext';
import { OrganizationSwitcher } from '../components/tenant/OrganizationSwitcher';
import { ClientWorkspaceSwitcher } from '../components/tenant/ClientWorkspaceSwitcher';
import { Building, Users, Settings, Info, MessageCircle, Bot } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  ArrowRight,
  BarChart3,
  BookOpen,
  Brain,
  CheckCircle,
  Clock,
  FileText,
  MessageSquare,
  Shield,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { useLumenAiAssistant } from '@/contexts/LumenAiAssistantContext';

// Import component placeholders (these would be real components in production)
import NextActionsSidebar from '../components/NextActionsSidebar';
import VaultQuickAccess from '../components/VaultQuickAccess';
import AnalyticsQuickView from '../components/AnalyticsQuickView';
import ReportsQuickWidget from '../components/ReportsQuickWidget';
import EmbeddedCodingAgent from '../components/ai/EmbeddedCodingAgent';

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
  const { currentOrganization, currentClientWorkspace, currentModule, setCurrentModule } =
    useTenant();

  const { openAssistant } = useLumenAiAssistant();

  useEffect(() => {
    // Log that the ClientPortalLanding component has mounted
    console.log('ClientPortalLanding component mounted');

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

  // Module cards for the dashboard
  const moduleCards = [
    {
      id: 'csr-intelligence',
      title: 'CSR Intelligence™',
      description: 'AI-powered Clinical Study Report analysis and intelligence',
      path: '/csr-intelligence',
    },
    {
      id: 'ind',
      title: 'IND Wizard™',
      description: 'FDA-compliant INDs with automated form generation',
      path: '/client-portal/ind-wizard',
    },
    {
      id: 'coauthor',
      title: 'eCTD Co-Author™',
      description: 'AI-assisted co-authoring of CTD submission sections',
      path: '/coauthor',
    },
    {
      id: 'cer',
      title: 'Medical Device and Diagnostics RA™',
      description:
        'The TrialSage Medical Device and Diagnostics RA is a next-generation regulatory automation module designed to eliminate bottlenecks in medical device and combination product submissions. Built for compliance with EU MDR 2017/745, FDA post-market expectations, and ISO 14155 guidance, it fuses real-world adverse event data with literature review automation, GPT-4o reasoning, and structured risk modeling. This CRO-ready platform includes multi-client project management for complete control of your entire CER and 510(k) documentation portfolio.',
      path: '/cerv2',
      highlight: true,
    },
    {
      id: 'cmc',
      title: 'CMC Wizard™',
      description: 'Chemistry, Manufacturing, and Controls documentation',
      path: '/cmc-blueprint',
    },
    {
      id: 'vault',
      title: 'TrialSage Vault™',
      description: 'Secure document storage with intelligent retrieval',
      path: '/vault',
    },
    {
      id: 'rih',
      title: 'Regulatory Intelligence Hub™',
      description: 'AI-powered strategy, timeline, and risk simulation',
      path: '/regulatory-intelligence-hub',
      highlight: true,
    },
    {
      id: 'risk',
      title: 'Risk Heatmap™',
      description: 'Interactive visualization of CTD risk gaps & impacts',
      path: '/regulatory-risk-dashboard',
    },
    {
      id: 'study',
      title: 'Study Architect™',
      description: 'Protocol development with regulatory intelligence',
      path: '/study-architect',
    },
    {
      id: 'analytics',
      title: 'Analytics Dashboard',
      description: 'Metrics and insights on regulatory performance',
      path: '/analytics',
    },
    {
      id: 'rai-test',
      title: 'Regulatory AI Testing',
      description: 'Test the enhanced regulatory AI assistant with global regulatory knowledge',
      path: '/regulatory-ai-test',
      isNew: true,
    },
  ];

  const handleModuleSelect = moduleId => {
    console.log('Module clicked:', moduleId);
    try {
      // Find the module path without trying to set the current module
      const selectedModule = moduleCards.find(m => m.id === moduleId);
      console.log('Selected module:', selectedModule);
      if (selectedModule) {
        console.log('Navigating to:', selectedModule.path);
        // Use safer navigation method
        setLocation(selectedModule.path);
      }
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback to direct navigation
      const selectedModule = moduleCards.find(m => m.id === moduleId);
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
        context: 'TrialSage Technical Support',
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
    <div className="min-h-screen bg-gray-50" style={{ position: 'relative' }}>
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
          {/* Tenant Information Header */}
          <div className="mb-8 bg-white rounded-xl shadow-md p-6">
            <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
              <div>
                <h1 className="text-3xl font-bold text-indigo-800">TrialSage™ Client Portal</h1>
                <p className="text-gray-600 mt-1">
                  Manage regulatory documents and projects across the enterprise
                </p>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-gray-50">
                  <Building className="h-5 w-5 text-indigo-600" />
                  <div>
                    <div className="text-xs text-gray-500">Organization</div>
                    <OrganizationSwitcher />
                  </div>
                </div>

                <div className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-gray-50">
                  <Users className="h-5 w-5 text-indigo-600" />
                  <div>
                    <div className="text-xs text-gray-500">Client Workspace</div>
                    <ClientWorkspaceSwitcher />
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => setLocation('/client-portal/client-management')}
                    className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-gray-50 hover:bg-gray-100 transition-all duration-150"
                  >
                    <Users className="h-5 w-5 text-indigo-600" />
                    <div>
                      <div className="text-xs text-gray-500">Manage</div>
                      <div className="text-sm font-medium">Clients</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setLocation('/tenant-management')}
                    className="flex items-center gap-2 border border-gray-200 rounded-lg p-2 bg-gray-50 hover:bg-gray-100 transition-all duration-150"
                  >
                    <Settings className="h-5 w-5 text-indigo-600" />
                    <div>
                      <div className="text-xs text-gray-500">Manage</div>
                      <div className="text-sm font-medium">Settings</div>
                    </div>
                  </button>
                  <button
                    onClick={() => setLocation('/ai')}
                    className="flex items-center gap-2 border border-blue-200 rounded-lg p-2 bg-blue-50 hover:bg-blue-100 transition-all duration-150"
                  >
                    <Bot className="h-5 w-5 text-blue-600" />
                    <div>
                      <div className="text-xs text-blue-500">Get Help</div>
                      <div className="text-sm font-medium text-white">💬 Coding Agent</div>
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

          {/* Main Content Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
            {/* Left Sidebar */}
            <div className="lg:col-span-1">
              <NextActionsSidebar />
            </div>

            {/* Main Module Grid */}
            <div className="lg:col-span-2">
              <div className="mb-6">
                <h2 className="text-2xl font-bold text-gray-900 mb-2">
                  TrialSage Platform Modules
                </h2>
                <p className="text-gray-600">Select a module to continue your work</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {moduleCards.map(module => (
                  <div
                    key={module.id}
                    onClick={() => handleModuleSelect(module.id)}
                    className={`relative bg-white rounded-lg shadow-md p-6 cursor-pointer transition-all duration-200 hover:shadow-lg hover:scale-105 ${
                      module.highlight
                        ? 'border-2 border-indigo-200 bg-gradient-to-br from-indigo-50 to-white'
                        : 'border border-gray-200'
                    }`}
                  >
                    {module.isNew && (
                      <span className="absolute top-2 right-2 bg-green-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        NEW
                      </span>
                    )}
                    {module.highlight && (
                      <span className="absolute top-2 right-2 bg-indigo-500 text-white text-xs font-bold px-2 py-1 rounded-full">
                        ENHANCED
                      </span>
                    )}
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">{module.title}</h3>
                    <p className="text-sm text-gray-600 leading-relaxed">{module.description}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* Right Sidebar */}
            <div className="lg:col-span-1 space-y-6">
              <VaultQuickAccess />
              <AnalyticsQuickView />
              <ReportsQuickWidget />
            </div>
          </div>

          {/* Recent Projects */}
          <div className="mt-12">
            <h2 className="text-2xl font-bold text-gray-900 mb-6">Recent Projects</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {projects.map(project => (
                <div
                  key={project.id}
                  className="bg-white rounded-lg shadow-md p-6 border border-gray-200"
                >
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="text-lg font-semibold text-gray-900">{project.name}</h3>
                    <span
                      className={`px-2 py-1 text-xs font-medium rounded-full ${
                        project.status === 'active'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                      }`}
                    >
                      {project.status}
                    </span>
                  </div>

                  <div className="mb-4">
                    <div className="flex justify-between text-sm text-gray-600 mb-1">
                      <span>Progress</span>
                      <span>{project.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-2">
                      <div
                        className="bg-indigo-600 h-2 rounded-full"
                        style={{ width: `${project.progress}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="text-xs text-gray-500 mb-2">Modules</div>
                    <div className="flex flex-wrap gap-1">
                      {project.modules.map((mod, index) => (
                        <span
                          key={index}
                          className="bg-gray-100 text-gray-700 text-xs px-2 py-1 rounded"
                        >
                          {mod}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="text-xs text-gray-500">Last updated: {project.lastUpdated}</div>
                </div>
              ))}
            </div>
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
