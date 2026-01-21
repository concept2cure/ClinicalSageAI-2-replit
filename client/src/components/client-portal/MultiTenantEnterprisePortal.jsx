/**
 * Multi-Tenant Enterprise Client Portal - Premium Edition
 *
 * This component provides a comprehensive multi-tenant enterprise hub for organizations,
 * supporting CRO clients with sub-clients and sub-projects, with full Lument ASSISTANT AI
 * integrated across all modules.
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocation, Link } from 'wouter';
import {
  Users,
  Building,
  ArrowLeft,
  FileText,
  BookOpen,
  BarChart2,
  CheckCircle,
  AlertCircle,
  Clock,
  Calendar,
  Search,
  Plus,
  RefreshCw,
  Shield,
  Zap,
  Layout,
  Layers,
  Activity,
  ActivitySquare,
  Folder,
  Database,
  BarChartHorizontal,
  BookMarked,
  ClipboardList,
  Lightbulb,
  Beaker,
  Network,
  Share2,
  ListChecks,
  Settings,
  Briefcase,
  ArrowUpRight,
  ChevronRight,
  Globe,
  LineChart,
  PieChart,
  UserCog,
  Lock,
  Bell,
  HelpCircle,
  LogOut,
  Menu,
  MessageSquare,
  Github,
  BarChart,
  Award,
  Edit3,
  Download,
  Server,
  Grid,
  FileCheck,
  Upload,
  File,
  Check,
  Sparkles,
  CreditCard,
  ChevronDown,
  X,
  User,
  UserPlus,
  Brain,
  Cpu,
  Bot,
  ExternalLink,
  List,
  ArrowRight,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

// Import our custom components
import LumentAssistant from '@/components/assistant/LumentAssistant';
import VaultQuickAccess from '@/components/VaultQuickAccess';
import AnalyticsQuickView from '@/components/AnalyticsQuickView';
import NextActionsSidebar from '@/components/NextActionsSidebar';
import ReportsQuickWidget from '@/components/ReportsQuickWidget';
import ProjectManagerGrid from '@/components/project-manager/ProjectManagerGrid';

// Import CMC CoPilot - NEW
import CMCCopilot from '@/components/cmc/CMCCopilot';

const MultiTenantEnterprisePortal = () => {
  // State hooks
  const [location, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [currentOrganization, setCurrentOrganization] = useState(null);
  const [currentClient, setCurrentClient] = useState(null);
  const [organizations, setOrganizations] = useState([]);
  const [clients, setClients] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [showCMCCopilot, setShowCMCCopilot] = useState(false);

  // Callback for loading organization data
  const loadOrganizationData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // In a real implementation, this would be an API call
      // Simulating network delay
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Sample data - in a real app, this would come from an API
      const orgsData = [
        {
          id: 'org-001',
          name: 'BioTech Solutions',
          logo: '/logos/biotech.png',
          type: 'CRO',
          memberCount: 124,
        },
        {
          id: 'org-002',
          name: 'PharmaGen',
          logo: '/logos/pharmagen.png',
          type: 'Sponsor',
          memberCount: 35,
        },
        {
          id: 'org-003',
          name: 'MediTrial Labs',
          logo: '/logos/meditrial.png',
          type: 'CRO',
          memberCount: 67,
        },
      ];

      setOrganizations(orgsData);

      // Select the first organization by default if none is already selected
      if (!currentOrganization) {
        setCurrentOrganization(orgsData[0]);
        await loadClientData(orgsData[0].id);
      }

      // Show toast notification
      console.log('Toast would show:', {
        title: 'Data Refreshed',
        description: 'Latest organization data has been loaded',
      });
    } catch (err) {
      setError('Failed to load organization data. Please try again.');
      console.error('Error loading organization data:', err);
    } finally {
      setLoading(false);
    }
  }, [currentOrganization]);

  // Function to load client data for a specific organization
  const loadClientData = useCallback(
    async organizationId => {
      try {
        setLoading(true);

        // Simulate API call
        await new Promise(resolve => setTimeout(resolve, 800));

        // Sample client data
        const clientsData = [
          {
            id: 'client-1',
            name: 'Nexus Pharmaceuticals',
            organizationId: 'org-001',
            logo: '/logos/nexus.png',
            type: 'Pharmaceutical',
            activeProjects: 7,
            tier: 'Enterprise',
          },
          {
            id: 'client-2',
            name: 'Genetek Research',
            organizationId: 'org-001',
            logo: '/logos/genetek.png',
            type: 'Biotech',
            activeProjects: 4,
            tier: 'Premium',
          },
          {
            id: 'client-3',
            name: 'Vitality Therapeutics',
            organizationId: 'org-001',
            logo: '/logos/vitality.png',
            type: 'Pharmaceutical',
            activeProjects: 2,
            tier: 'Standard',
          },
          {
            id: 'client-4',
            name: 'CellTech Innovations',
            organizationId: 'org-002',
            logo: '/logos/celltech.png',
            type: 'Biotech Research',
            activeProjects: 9,
            tier: 'Enterprise',
          },
        ];

        // Filter clients by the selected organization
        const filteredClients = clientsData.filter(
          client => client.organizationId === organizationId
        );

        setClients(filteredClients);

        // Clear the current client if it doesn't belong to the new organization
        if (currentClient && currentClient.organizationId !== organizationId) {
          setCurrentClient(null);
        }
      } catch (err) {
        setError('Failed to load client data. Please try again.');
        console.error('Error loading client data:', err);
      } finally {
        setLoading(false);
      }
    },
    [currentClient]
  );

  // Function to load project data for a specific client
  const loadProjectData = useCallback(async clientId => {
    try {
      setLoading(true);

      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 600));

      // In a real implementation, this would be an API call
      const clientProjectList = [
        {
          id: 'cp-1',
          name: 'Phase II Clinical Trial - BTX-112',
          clientId: 'client-1',
          organizationId: 'org-001',
          status: 'in_progress',
          module: 'trial-vault',
          progress: 65,
          dueDate: '2025-06-15',
          priority: 'high',
        },
        {
          id: 'cp-2',
          name: 'IND Application - BTX-112',
          clientId: 'client-1',
          organizationId: 'org-001',
          status: 'in_progress',
          module: 'ind-wizard',
          progress: 42,
          dueDate: '2025-07-20',
          priority: 'high',
        },
        {
          id: 'cp-3',
          name: 'CER for Medical Device XR-24',
          clientId: 'client-1',
          organizationId: 'org-001',
          status: 'completed',
          module: 'cer-generator',
          progress: 100,
          dueDate: '2025-05-01',
          priority: 'medium',
        },
        {
          id: 'cp-4',
          name: 'Protocol Design - BTX-339',
          clientId: 'client-1',
          organizationId: 'org-001',
          status: 'pending',
          module: 'study-architect',
          progress: 15,
          dueDate: '2025-08-30',
          priority: 'medium',
        },
        {
          id: 'cp-5',
          name: 'Risk Heatmap Assessment',
          clientId: 'client-1',
          organizationId: 'org-001',
          status: 'in_progress',
          module: 'risk-heatmap',
          progress: 78,
          dueDate: '2025-05-25',
          priority: 'low',
        },
        {
          id: 'cp-6',
          name: 'Chemistry Manufacturing Controls',
          clientId: 'client-1',
          organizationId: 'org-001',
          status: 'in_progress',
          module: 'cmc-wizard',
          progress: 51,
          dueDate: '2025-07-10',
          priority: 'high',
        },
        {
          id: 'cp-7',
          name: 'Annual Safety Update',
          clientId: 'client-1',
          organizationId: 'org-001',
          status: 'pending',
          module: 'safety-reporting',
          progress: 0,
          dueDate: '2025-09-15',
          priority: 'medium',
        },
        {
          id: 'cp-8',
          name: 'Gene Therapy IND',
          clientId: 'client-2',
          organizationId: 'org-001',
          status: 'in_progress',
          module: 'ind-wizard',
          progress: 32,
          dueDate: '2025-06-30',
          priority: 'high',
        },
        {
          id: 'cp-9',
          name: 'Oncology CSR Analysis',
          clientId: 'client-2',
          organizationId: 'org-001',
          status: 'in_progress',
          module: 'csr-intelligence',
          progress: 45,
          dueDate: '2025-07-15',
          priority: 'medium',
        },
        {
          id: 'cp-10',
          name: 'Biostats Report Review',
          clientId: 'client-2',
          organizationId: 'org-001',
          status: 'in_progress',
          module: 'analytics',
          progress: 68,
          dueDate: '2025-05-28',
          priority: 'medium',
        },
        {
          id: 'cp-11',
          name: 'CMC Documentation - GTX-12',
          clientId: 'client-2',
          organizationId: 'org-001',
          status: 'pending',
          module: 'cmc-wizard',
          progress: 5,
          dueDate: '2025-08-15',
          priority: 'low',
        },
      ];

      // Filter projects by client
      const filteredProjects = clientProjectList.filter(project => project.clientId === clientId);

      setProjects(filteredProjects);
    } catch (err) {
      setError('Failed to load project data. Please try again.');
      console.error('Error loading project data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  // Function to change the active tab
  const handleTabChange = tab => {
    setActiveTab(tab);
  };

  // Function to change the organization
  const handleOrganizationChange = async org => {
    setCurrentOrganization(org);
    setCurrentClient(null);
    await loadClientData(org.id);
  };

  // Function to change the client
  const handleClientChange = async client => {
    setCurrentClient(client);
    await loadProjectData(client.id);
  };

  // Create the assistant context with relevant information for AI
  const assistantContext = useMemo(() => {
    return {
      organization: currentOrganization,
      client: currentClient,
      activeTab,
      projects,
      // Additional context that might be useful for the AI
      module: activeTab,
      recentSearches: ['clinical trial', 'adverse events', 'protocol design'],
    };
  }, [currentOrganization, currentClient, activeTab, projects]);

  // Initial data load
  useEffect(() => {
    loadOrganizationData();

    // Log module access for analytics
    console.log('All module access links updated to point to /client-portal');
  }, [loadOrganizationData]);

  // When organization changes, load its clients
  useEffect(() => {
    if (currentOrganization) {
      loadClientData(currentOrganization.id);
    }
  }, [currentOrganization, loadClientData]);

  // When client changes, load its projects
  useEffect(() => {
    if (currentClient) {
      loadProjectData(currentClient.id);
    }
  }, [currentClient, loadProjectData]);

  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Global Header */}
      <header className="bg-white border-b shadow-sm fixed w-full z-10 top-0">
        <div className="h-16 px-4 mx-auto flex items-center justify-between">
          {/* Logo and Branding */}
          <div className="flex items-center space-x-2">
            <div className="font-bold text-xl flex items-center">
              <span className="text-primary">TrialSage</span>
              <span className="text-xs ml-1 bg-blue-100 text-blue-800 px-1 rounded">
                Enterprise
              </span>
            </div>
          </div>

          {/* Search */}
          <div className="hidden md:flex flex-1 max-w-md mx-4">
            <div className="relative w-full">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-400" />
              <Input
                type="text"
                placeholder="Search documents, projects, or clients..."
                className="pl-8 bg-gray-50 border-gray-200 focus:bg-white"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Right-side items */}
          <div className="flex items-center space-x-4">
            {/* Organization Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  {currentOrganization ? (
                    <>
                      <Avatar className="h-6 w-6">
                        <AvatarImage
                          src={currentOrganization.logo}
                          alt={currentOrganization.name}
                        />
                        <AvatarFallback>{currentOrganization.name.substring(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="hidden md:inline-block">{currentOrganization.name}</span>
                    </>
                  ) : (
                    <>
                      <Building size={16} />
                      <span className="hidden md:inline-block">Select Organization</span>
                    </>
                  )}
                  <ChevronDown size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {organizations.map(org => (
                  <DropdownMenuItem
                    key={org.id}
                    onClick={() => handleOrganizationChange(org)}
                    className={currentOrganization?.id === org.id ? 'bg-gray-100' : ''}
                  >
                    <Avatar className="h-6 w-6 mr-2">
                      <AvatarImage src={org.logo} alt={org.name} />
                      <AvatarFallback>{org.name.substring(0, 2)}</AvatarFallback>
                    </Avatar>
                    <span>{org.name}</span>
                    {currentOrganization?.id === org.id && (
                      <CheckCircle className="ml-auto h-4 w-4 text-primary" />
                    )}
                  </DropdownMenuItem>
                ))}
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <Plus size={16} className="mr-2" />
                  <span>Add Organization</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Client Workspace Switcher */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="flex items-center gap-2">
                  {currentClient ? (
                    <>
                      <Avatar className="h-6 w-6">
                        <AvatarImage src={currentClient.logo} alt={currentClient.name} />
                        <AvatarFallback>{currentClient.name.substring(0, 2)}</AvatarFallback>
                      </Avatar>
                      <span className="hidden md:inline-block">{currentClient.name}</span>
                    </>
                  ) : (
                    <>
                      <Users size={16} />
                      <span className="hidden md:inline-block">Select Client</span>
                    </>
                  )}
                  <ChevronDown size={16} />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56">
                <DropdownMenuLabel>Client Workspaces</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {clients.length > 0 ? (
                  clients.map(client => (
                    <DropdownMenuItem
                      key={client.id}
                      onClick={() => handleClientChange(client)}
                      className={currentClient?.id === client.id ? 'bg-gray-100' : ''}
                    >
                      <Avatar className="h-6 w-6 mr-2">
                        <AvatarImage src={client.logo} alt={client.name} />
                        <AvatarFallback>{client.name.substring(0, 2)}</AvatarFallback>
                      </Avatar>
                      <div className="flex flex-col">
                        <span>{client.name}</span>
                        <span className="text-xs text-gray-500">{client.type}</span>
                      </div>
                      {currentClient?.id === client.id && (
                        <CheckCircle className="ml-auto h-4 w-4 text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))
                ) : (
                  <DropdownMenuItem disabled>
                    <span className="text-gray-500">No clients available</span>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <UserPlus size={16} className="mr-2" />
                  <span>Add Client</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Notifications */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="relative">
                  <Bell size={18} />
                  <span className="absolute top-0 right-0 h-2 w-2 bg-red-500 rounded-full"></span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-80" align="end">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold">Notifications</h4>
                    <Badge variant="outline">5 New</Badge>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <ScrollArea className="h-[300px]">
                  <div className="p-2 space-y-2">
                    <div className="bg-blue-50 p-3 rounded-md">
                      <div className="flex items-start">
                        <div className="bg-blue-200 p-1 rounded-full">
                          <FileText className="h-3 w-3 text-blue-700" />
                        </div>
                        <div className="ml-2">
                          <p className="text-sm font-medium">New IND Document Upload</p>
                          <p className="text-xs text-gray-500">23 minutes ago</p>
                          <p className="text-xs mt-1">
                            Jane Smith uploaded "BTX-112 Clinical Protocol v2" to IND Wizard.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 rounded-md">
                      <div className="flex items-start">
                        <div className="bg-purple-100 p-1 rounded-full">
                          <Users className="h-3 w-3 text-purple-700" />
                        </div>
                        <div className="ml-2">
                          <p className="text-sm font-medium">New Team Member Added</p>
                          <p className="text-xs text-gray-500">1 hour ago</p>
                          <p className="text-xs mt-1">
                            Michael Chen has been added to BioTech Solutions.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 rounded-md">
                      <div className="flex items-start">
                        <div className="bg-amber-100 p-1 rounded-full">
                          <AlertCircle className="h-3 w-3 text-amber-700" />
                        </div>
                        <div className="ml-2">
                          <p className="text-sm font-medium">Deadline Approaching</p>
                          <p className="text-xs text-gray-500">Yesterday</p>
                          <p className="text-xs mt-1">
                            "Phase II Clinical Trial - BTX-112" has a deliverable due in 3 days.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 rounded-md">
                      <div className="flex items-start">
                        <div className="bg-green-100 p-1 rounded-full">
                          <CheckCircle className="h-3 w-3 text-green-700" />
                        </div>
                        <div className="ml-2">
                          <p className="text-sm font-medium">CSR Analysis Complete</p>
                          <p className="text-xs text-gray-500">2 days ago</p>
                          <p className="text-xs mt-1">
                            The AI analysis of "XR-24992 CSR" is complete with 8 findings.
                          </p>
                        </div>
                      </div>
                    </div>
                    <div className="p-3 rounded-md">
                      <div className="flex items-start">
                        <div className="bg-red-100 p-1 rounded-full">
                          <X className="h-3 w-3 text-red-700" />
                        </div>
                        <div className="ml-2">
                          <p className="text-sm font-medium">CER Validation Failed</p>
                          <p className="text-xs text-gray-500">3 days ago</p>
                          <p className="text-xs mt-1">
                            "TR-82 CER" validation failed with 3 critical errors. Review required.
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </ScrollArea>
                <DropdownMenuSeparator />
                <div className="p-2">
                  <Button variant="outline" className="w-full justify-center">
                    View All Notifications
                  </Button>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Help */}
            <Button variant="ghost" size="icon">
              <HelpCircle size={18} />
            </Button>

            {/* User Menu */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="relative h-8 w-8 rounded-full">
                  <Avatar className="h-8 w-8">
                    <AvatarImage src="/avatars/user.png" alt="User" />
                    <AvatarFallback>JD</AvatarFallback>
                  </Avatar>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent className="w-56" align="end">
                <DropdownMenuLabel className="font-normal">
                  <div className="flex flex-col space-y-1">
                    <p className="text-sm font-medium">John Doe</p>
                    <p className="text-xs text-gray-500">john.doe@biotechsolutions.com</p>
                  </div>
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem>
                  <User className="h-4 w-4 mr-2" />
                  <span>Profile</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Settings className="h-4 w-4 mr-2" />
                  <span>Settings</span>
                </DropdownMenuItem>
                <DropdownMenuItem>
                  <Shield className="h-4 w-4 mr-2" />
                  <span>Security</span>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="text-red-600">
                  <LogOut className="h-4 w-4 mr-2" />
                  <span>Log out</span>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>

        {/* Module Navigation */}
        <div className="bg-white border-b">
          {/* Main Navigation Tabs - TrialSage Platform Modules */}
          <nav className="flex px-4 overflow-x-auto pb-1">
            {/* Dashboard */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('dashboard')}
            >
              <div className="flex items-center whitespace-nowrap">
                <Layout size={16} className="mr-2" />
                Dashboard
              </div>
            </button>

            {/* Medical Device & Diagnostics Regulatory Module */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'cer2v'
                  ? 'border-green-500 text-green-600 bg-green-50'
                  : 'border-transparent text-green-600 hover:text-green-700 hover:border-green-300 hover:bg-green-50/50'
              }`}
              onClick={() => {
                setActiveTab('cer2v');
                setLocation('/client-portal/cer2v');
              }}
            >
              <div className="flex items-center whitespace-nowrap">
                <FileCheck size={16} className="mr-2" />
                <span className="font-semibold">Medical Device & Diagnostics</span>
              </div>
            </button>

            {/* IND Building & Submission Wizard */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'ind-wizard'
                  ? 'border-blue-500 text-blue-600 bg-blue-50'
                  : 'border-transparent text-blue-600 hover:text-blue-700 hover:border-blue-300 hover:bg-blue-50/50'
              }`}
              onClick={() => {
                setActiveTab('ind-wizard');
                setLocation('/client-portal/ind-wizard');
              }}
            >
              <div className="flex items-center whitespace-nowrap">
                <FileText size={16} className="mr-2" />
                <span className="font-semibold">IND Wizard</span>
              </div>
            </button>

            {/* eCTD Author */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'ectd-author'
                  ? 'border-purple-500 text-purple-600 bg-purple-50'
                  : 'border-transparent text-purple-600 hover:text-purple-700 hover:border-purple-300 hover:bg-purple-50/50'
              }`}
              onClick={() => {
                setActiveTab('ectd-author');
                setLocation('/client-portal/ectd-author');
              }}
            >
              <div className="flex items-center whitespace-nowrap">
                <BookOpen size={16} className="mr-2" />
                <span className="font-semibold">eCTD Author</span>
              </div>
            </button>

            {/* CMC Automation Module */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'cmc-module'
                  ? 'border-amber-500 text-amber-600 bg-amber-50'
                  : 'border-transparent text-amber-600 hover:text-amber-700 hover:border-amber-300 hover:bg-amber-50/50'
              }`}
              onClick={() => {
                setActiveTab('cmc-module');
                setLocation('/client-portal/cmc-module');
                setShowCMCCopilot(true);
              }}
            >
              <div className="flex items-center whitespace-nowrap">
                <Beaker size={16} className="mr-2" />
                <span className="font-semibold">CMC Module</span>
              </div>
            </button>

            {/* CSR Intelligence */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'csr-intelligence'
                  ? 'border-teal-500 text-teal-600 bg-teal-50'
                  : 'border-transparent text-teal-600 hover:text-teal-700 hover:border-teal-300 hover:bg-teal-50/50'
              }`}
              onClick={() => {
                setActiveTab('csr-intelligence');
                setLocation('/client-portal/csr-intelligence');
              }}
            >
              <div className="flex items-center whitespace-nowrap">
                <Search size={16} className="mr-2" />
                <span className="font-semibold">CSR Intelligence</span>
              </div>
            </button>

            {/* Study/Protocol Designer */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'study-architect'
                  ? 'border-orange-500 text-orange-600 bg-orange-50'
                  : 'border-transparent text-orange-600 hover:text-orange-700 hover:border-orange-300 hover:bg-orange-50/50'
              }`}
              onClick={() => {
                setActiveTab('study-architect');
                setLocation('/client-portal/study-architect');
              }}
            >
              <div className="flex items-center whitespace-nowrap">
                <ClipboardList size={16} className="mr-2" />
                <span className="font-semibold">Study Architect</span>
              </div>
            </button>

            {/* Regulatory Timeline */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'regulatory-timeline'
                  ? 'border-red-500 text-red-600 bg-red-50'
                  : 'border-transparent text-red-600 hover:text-red-700 hover:border-red-300 hover:bg-red-50/50'
              }`}
              onClick={() => {
                setActiveTab('regulatory-timeline');
                setLocation('/client-portal/regulatory-timeline');
              }}
            >
              <div className="flex items-center whitespace-nowrap">
                <Clock size={16} className="mr-2" />
                <span className="font-semibold">Reg Timeline</span>
              </div>
            </button>

            {/* Reports Module - GLOBALLY CONNECTED */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'reports'
                  ? 'border-pink-500 text-pink-600 bg-pink-50'
                  : 'border-transparent text-pink-600 hover:text-pink-700 hover:border-pink-300 hover:bg-pink-50/50'
              }`}
              onClick={() => {
                setActiveTab('reports');
                setLocation('/client-portal/reports');
              }}
            >
              <div className="flex items-center whitespace-nowrap">
                <BarChart size={16} className="mr-2" />
                <span className="font-semibold">Reports</span>
              </div>
            </button>

            {/* TrialSage Vault */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'vault'
                  ? 'border-slate-500 text-slate-600 bg-slate-50'
                  : 'border-transparent text-slate-600 hover:text-slate-700 hover:border-slate-300 hover:bg-slate-50/50'
              }`}
              onClick={() => {
                setActiveTab('vault');
                setLocation('/client-portal/vault');
              }}
            >
              <div className="flex items-center whitespace-nowrap">
                <Database size={16} className="mr-2" />
                <span className="font-semibold">Vault</span>
              </div>
            </button>

            {/* Ask Lumen AI */}
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'assistant'
                  ? 'border-indigo-500 text-indigo-600 bg-indigo-50'
                  : 'border-transparent text-indigo-600 hover:text-indigo-700 hover:border-indigo-300 hover:bg-indigo-50/50'
              }`}
              onClick={() => setActiveTab('assistant')}
            >
              <div className="flex items-center whitespace-nowrap">
                <Sparkles size={16} className="mr-2" />
                <span className="font-semibold">Ask Lument AI</span>
              </div>
            </button>

            {/* Administrative Features */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" className="gap-2">
                  <Settings className="h-4 w-4" />
                  <span>Admin</span>
                  <ChevronDown className="h-3 w-3" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Administration</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setActiveTab('lumen-insights')}>
                  <Sparkles className="mr-2 h-4 w-4" />
                  Lumen Insights
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation('/admin')}>
                  <UserCog className="mr-2 h-4 w-4" />
                  User Management
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation('/security')}>
                  <Shield className="mr-2 h-4 w-4" />
                  Security Settings
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setLocation('/audit')}>
                  <FileText className="mr-2 h-4 w-4" />
                  Audit Logs
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </nav>
        </div>
      </header>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6 mt-24">
        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <span className="ml-3 text-gray-600">Loading data...</span>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 mb-8">
            <div className="flex items-start">
              <AlertCircle className="h-6 w-6 text-red-500 mt-0.5 mr-3" />
              <div>
                <h3 className="font-medium text-red-800">Error Loading Data</h3>
                <p className="text-red-700 mt-1">{error}</p>
                <button
                  className="mt-3 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 flex items-center"
                  onClick={() => loadOrganizationData()}
                >
                  <RefreshCw size={14} className="mr-2" />
                  Retry
                </button>
              </div>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={handleTabChange}>
          <TabsList className="hidden">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="cer2v">Medical Device & Diagnostics</TabsTrigger>
            <TabsTrigger value="ind-wizard">IND Wizard</TabsTrigger>
            <TabsTrigger value="ectd-author">eCTD Author</TabsTrigger>
            <TabsTrigger value="cmc-module">CMC Module</TabsTrigger>
            <TabsTrigger value="csr-intelligence">CSR Intelligence</TabsTrigger>
            <TabsTrigger value="study-architect">Study Architect</TabsTrigger>
            <TabsTrigger value="regulatory-timeline">Reg Timeline</TabsTrigger>
            <TabsTrigger value="reports">Reports</TabsTrigger>
            <TabsTrigger value="vault">Vault</TabsTrigger>
            <TabsTrigger value="assistant">Ask Lument AI</TabsTrigger>
            <TabsTrigger value="lumen-insights">Lumen Insights</TabsTrigger>
          </TabsList>

          {/* Medical Device & Diagnostics Regulatory Module Tab */}
          <TabsContent value="cer2v" className="space-y-6">
            <div className="flex items-center mb-6">
              <FileCheck className="h-6 w-6 text-green-600 mr-2" />
              <h1 className="text-2xl font-bold text-gray-800">
                Medical Device & Diagnostics Regulatory Module
              </h1>
              <div className="ml-4 px-2 py-1 bg-green-100 text-green-800 text-xs font-medium rounded-full">
                Enterprise Feature
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                {/* Main Medical Device & Diagnostics Content - Load the actual CERV2Page component in an iframe */}
                <div
                  className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                  style={{ height: 'calc(100vh - 230px)' }}
                >
                  <iframe
                    src="/cerv2"
                    className="w-full h-full border-0"
                    title="Medical Device & Diagnostics Regulatory Module"
                  ></iframe>
                </div>
              </div>

              <div className="space-y-6">
                {/* Medical Device & Diagnostics Quick Actions */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full justify-start text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Create New CER Report
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Import Existing Report
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                    >
                      <ListChecks className="mr-2 h-4 w-4" />
                      View Report Templates
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-green-700 bg-green-50 hover:bg-green-100 border-green-200"
                    >
                      <BarChart className="mr-2 h-4 w-4" />
                      CER Analytics Dashboard
                    </Button>
                  </CardContent>
                </Card>

                {/* Recent CER Activities */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium">Recent Activities</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <div className="bg-green-100 p-1.5 rounded-full">
                        <Check className="h-3.5 w-3.5 text-green-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">CER Report for BTX-112 Updated</p>
                        <p className="text-xs text-gray-500">Today at 11:43 AM</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="bg-blue-100 p-1.5 rounded-full">
                        <File className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">New Literature Added</p>
                        <p className="text-xs text-gray-500">Yesterday at 4:15 PM</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="bg-amber-100 p-1.5 rounded-full">
                        <AlertCircle className="h-3.5 w-3.5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Vigilance Alert: Post-Market Data</p>
                        <p className="text-xs text-gray-500">May 9, 2025</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* AI Integration */}
                <Card className="bg-gradient-to-br from-indigo-50 to-purple-50 border-indigo-100">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium text-indigo-800">
                      AI Analysis
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-indigo-700 mb-3">
                      Ask Lument AI about your Clinical Evaluation Reports
                    </p>
                    <div className="relative">
                      <input
                        type="text"
                        placeholder="Ask about CER preparation, literature, etc..."
                        className="w-full px-4 py-2 pr-10 border border-indigo-200 rounded-md text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
                      />
                      <Sparkles className="absolute right-3 top-2.5 h-4 w-4 text-indigo-500" />
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* CMC Module Tab with CMC CoPilot */}
          <TabsContent value="cmc-module" className="space-y-6">
            <div className="flex items-center mb-6">
              <Beaker className="h-6 w-6 text-amber-600 mr-2" />
              <h1 className="text-2xl font-bold text-gray-800">CMC Automation Module</h1>
              <div className="ml-4 px-2 py-1 bg-amber-100 text-amber-800 text-xs font-medium rounded-full">
                Enterprise Feature
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              <div className="lg:col-span-2">
                {/* Main CMC Module Content */}
                <div
                  className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden"
                  style={{ height: 'calc(100vh - 230px)' }}
                >
                  <div className="p-6">
                    <div className="mb-8">
                      <h2 className="text-xl font-bold mb-4">AI-CMC Blueprint Generator™</h2>
                      <p className="text-gray-600 mb-4">
                        From Molecular Structure to Regulatory-Ready Draft in Minutes
                      </p>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mt-6">
                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">Automated CMC Drafting</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-gray-600 mb-4">
                              Instantly generates full ICH Module 3 sections from molecular
                              structure, synthesis pathway, formulation ingredients, and process
                              parameters.
                            </p>
                            <ul className="space-y-2 text-sm">
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Drug substance and product descriptions</span>
                              </li>
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Manufacturing process narratives</span>
                              </li>
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Analytical method writeups</span>
                              </li>
                            </ul>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">AI Change Impact Simulator™</CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-gray-600 mb-4">
                              Before you change anything, know what could go wrong and how to fix
                              it. Maps changes against prior global regulatory submissions and
                              predicts risk level.
                            </p>
                            <ul className="space-y-2 text-sm">
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Recommends preemptive actions</span>
                              </li>
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Suggests markets requiring notifications</span>
                              </li>
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Predicts approval timeline shifts</span>
                              </li>
                            </ul>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">
                              Manufacturing Intelligence Tuner™
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-gray-600 mb-4">
                              Let AI benchmark your process against the global GxP universe.
                              Connects to your batch records and process control logs for
                              optimization.
                            </p>
                            <ul className="space-y-2 text-sm">
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Identifies suboptimal step yields</span>
                              </li>
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Detects unusual variability</span>
                              </li>
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Improves control strategies</span>
                              </li>
                            </ul>
                          </CardContent>
                        </Card>

                        <Card>
                          <CardHeader>
                            <CardTitle className="text-lg">
                              Global Compliance Auto-Match™
                            </CardTitle>
                          </CardHeader>
                          <CardContent>
                            <p className="text-sm text-gray-600 mb-4">
                              One CMC draft, multiple jurisdictions—instantly harmonized. Auto-maps
                              content to EU, Japan, Canada, Brazil formats.
                            </p>
                            <ul className="space-y-2 text-sm">
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Adjusts terminology by region</span>
                              </li>
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Provides submission strategy notes</span>
                              </li>
                              <li className="flex items-start">
                                <Check className="h-4 w-4 text-green-600 mr-2 mt-0.5" />
                                <span>Scales globally with no added headcount</span>
                              </li>
                            </ul>
                          </CardContent>
                        </Card>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="space-y-6">
                {/* CMC CoPilot - New Feature */}
                <Card className="bg-gradient-to-br from-amber-50 to-orange-50 border-amber-100">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium text-amber-800">
                      <div className="flex items-center">
                        <Sparkles className="h-5 w-5 mr-2 text-amber-600" />
                        CMC CoPilot™
                      </div>
                    </CardTitle>
                    <CardDescription className="text-amber-700">
                      Your 24/7 Intelligent Partner
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="bg-white/80 p-3 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800 font-medium mb-2">Contextual Search</p>
                      <p className="text-xs text-amber-700">
                        Instantly finds documents, queries data, and synthesizes answers across all
                        your filings.
                      </p>
                    </div>

                    <div className="bg-white/80 p-3 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800 font-medium mb-2">Automated Drafting</p>
                      <p className="text-xs text-amber-700">
                        Generates compliant sections, SOPs, and protocols with a single
                        natural-language request.
                      </p>
                    </div>

                    <div className="bg-white/80 p-3 rounded-lg border border-amber-200">
                      <p className="text-sm text-amber-800 font-medium mb-2">Regulatory Coach</p>
                      <p className="text-xs text-amber-700">
                        Proactively identifies gaps and suggests remediation based on agency
                        precedent.
                      </p>
                    </div>

                    <div className="mt-4">
                      <div className="relative">
                        <div className="bg-amber-100 py-1 px-2 text-amber-800 text-xs font-medium inline-block rounded mb-2">
                          <div className="flex items-center">
                            <svg
                              viewBox="0 0 24 24"
                              width="14"
                              height="14"
                              stroke="currentColor"
                              strokeWidth="2"
                              fill="none"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="mr-1"
                            >
                              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                              <path d="M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                              <path d="M19.07 4.93a10 10 0 0 1 0 14.14"></path>
                            </svg>
                            VOICE ENABLED
                          </div>
                        </div>
                        <input
                          type="text"
                          placeholder="Ask CMC CoPilot a question..."
                          className="w-full px-4 py-2 pr-10 border border-amber-200 rounded-md text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500"
                        />
                        <Sparkles className="absolute right-3 top-2.5 h-4 w-4 text-amber-500" />
                      </div>

                      <div className="bg-white/80 rounded-md border border-amber-200 p-3 mt-2">
                        <p className="text-xs text-amber-800 italic">
                          "I found 3 critical validation gaps for the PMDA submission: (1) Missing
                          stability data for drug product, (2) Incomplete process validation for
                          Batch #247, (3) Required PMDA-specific documents not submitted."
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* CMC Quick Actions */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium">Quick Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Button
                      variant="outline"
                      className="w-full justify-start text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                    >
                      <FileText className="mr-2 h-4 w-4" />
                      Generate New CMC Module
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                    >
                      <Upload className="mr-2 h-4 w-4" />
                      Import Molecular Structure
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                    >
                      <ListChecks className="mr-2 h-4 w-4" />
                      View Validation Report
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full justify-start text-amber-700 bg-amber-50 hover:bg-amber-100 border-amber-200"
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Export to CTD Format
                    </Button>
                  </CardContent>
                </Card>

                {/* Recent CMC Activities */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium">Recent Activities</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex items-start space-x-3">
                      <div className="bg-amber-100 p-1.5 rounded-full">
                        <Check className="h-3.5 w-3.5 text-amber-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">BTX-112 CMC Changes Analyzed</p>
                        <p className="text-xs text-gray-500">Today at 09:17 AM</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="bg-blue-100 p-1.5 rounded-full">
                        <File className="h-3.5 w-3.5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">Module 3.2.S.4 Generated</p>
                        <p className="text-xs text-gray-500">Yesterday at 2:30 PM</p>
                      </div>
                    </div>
                    <div className="flex items-start space-x-3">
                      <div className="bg-red-100 p-1.5 rounded-full">
                        <AlertCircle className="h-3.5 w-3.5 text-red-600" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">PMDA Validation Issues Found</p>
                        <p className="text-xs text-gray-500">May 9, 2025</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Dashboard Tab Content */}
          <TabsContent value="dashboard" className="space-y-6">
            {/* Welcome Banner with Organization Info (When no client is selected) */}
            {!currentClient && (
              <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-6 mb-8">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold text-gray-800">
                      Welcome to {currentOrganization?.name || 'TrialSage'}
                    </h1>
                    <p className="text-gray-600 mt-1">
                      Access all your regulatory documentation from one central portal.
                    </p>
                  </div>
                  <div className="hidden md:block">
                    <Button variant="default">
                      <Plus size={16} className="mr-2" />
                      New Project
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Client Context Bar (When client is selected) */}
            {currentClient && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 mb-8">
                <div className="flex items-center justify-between">
                  <div className="flex items-center">
                    <Avatar className="h-12 w-12 mr-4">
                      <AvatarImage src={currentClient.logo} alt={currentClient.name} />
                      <AvatarFallback>{currentClient.name.substring(0, 2)}</AvatarFallback>
                    </Avatar>
                    <div>
                      <div className="flex items-center">
                        <h1 className="text-2xl font-bold text-gray-800">{currentClient.name}</h1>
                        <Badge variant="outline" className="ml-3">
                          {currentClient.tier}
                        </Badge>
                      </div>
                      <div className="flex items-center mt-1 text-sm text-gray-500">
                        <span>{currentClient.type}</span>
                        <span className="mx-2">•</span>
                        <span>{currentClient.activeProjects} Active Projects</span>
                        <span className="mx-2">•</span>
                        <span>Client ID: {currentClient.id}</span>
                      </div>
                    </div>
                  </div>
                  <div className="hidden md:flex space-x-2">
                    <Button variant="outline">
                      <Settings size={16} className="mr-2" />
                      Client Settings
                    </Button>
                    <Button variant="default">
                      <Plus size={16} className="mr-2" />
                      New Project
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Dashboard Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Main Content Area - 2/3 width */}
              <div className="md:col-span-2 space-y-6">
                {/* Project Cards */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg font-medium">Active Projects</CardTitle>
                    {projects.length > 0 && (
                      <Badge variant="outline">{projects.length} Projects</Badge>
                    )}
                  </CardHeader>
                  <CardContent>
                    {currentClient ? (
                      projects.length > 0 ? (
                        <ProjectManagerGrid projects={projects} />
                      ) : (
                        <div className="text-center py-8">
                          <Briefcase className="h-12 w-12 mx-auto text-gray-300" />
                          <h3 className="mt-4 text-lg font-medium text-gray-600">
                            No Projects Found
                          </h3>
                          <p className="mt-1 text-gray-500">
                            This client doesn't have any projects yet.
                          </p>
                          <Button className="mt-4" variant="outline">
                            <Plus size={16} className="mr-2" />
                            Create First Project
                          </Button>
                        </div>
                      )
                    ) : (
                      <div className="text-center py-8">
                        <Users className="h-12 w-12 mx-auto text-gray-300" />
                        <h3 className="mt-4 text-lg font-medium text-gray-600">
                          No Client Selected
                        </h3>
                        <p className="mt-1 text-gray-500">
                          Please select a client to view their projects.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Recent Documents */}
                <Card>
                  <CardHeader className="flex flex-row items-center justify-between pb-2">
                    <CardTitle className="text-lg font-medium">Recent Documents</CardTitle>
                    <Button variant="ghost" className="h-8 text-xs">
                      View All
                    </Button>
                  </CardHeader>
                  <CardContent>
                    {currentClient ? (
                      <div className="space-y-4">
                        <div className="flex items-start p-3 hover:bg-gray-50 rounded-md">
                          <div className="bg-blue-100 p-2 rounded-md mr-3">
                            <FileText className="h-6 w-6 text-blue-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium">
                                Protocol_BTX112_Phase2_v3.docx
                              </h4>
                              <Badge variant="outline" className="text-xs">
                                DOCX
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Updated 2 hours ago</p>
                            <div className="flex items-center mt-2">
                              <Avatar className="h-5 w-5 mr-1">
                                <AvatarFallback className="text-[8px]">JS</AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-gray-500">Jane Smith</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start p-3 hover:bg-gray-50 rounded-md">
                          <div className="bg-red-100 p-2 rounded-md mr-3">
                            <FileText className="h-6 w-6 text-red-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium">CMC_Section_3.2.P.3.1.pdf</h4>
                              <Badge variant="outline" className="text-xs">
                                PDF
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Updated yesterday</p>
                            <div className="flex items-center mt-2">
                              <Avatar className="h-5 w-5 mr-1">
                                <AvatarFallback className="text-[8px]">MC</AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-gray-500">Michael Chen</span>
                            </div>
                          </div>
                        </div>

                        <div className="flex items-start p-3 hover:bg-gray-50 rounded-md">
                          <div className="bg-green-100 p-2 rounded-md mr-3">
                            <FileText className="h-6 w-6 text-green-600" />
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center justify-between">
                              <h4 className="text-sm font-medium">CER_XR24_Final_2025-05-08.pdf</h4>
                              <Badge variant="outline" className="text-xs">
                                PDF
                              </Badge>
                            </div>
                            <p className="text-xs text-gray-500 mt-1">Updated 3 days ago</p>
                            <div className="flex items-center mt-2">
                              <Avatar className="h-5 w-5 mr-1">
                                <AvatarFallback className="text-[8px]">JD</AvatarFallback>
                              </Avatar>
                              <span className="text-xs text-gray-500">John Doe</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8">
                        <File className="h-12 w-12 mx-auto text-gray-300" />
                        <h3 className="mt-4 text-lg font-medium text-gray-600">No Documents Yet</h3>
                        <p className="mt-1 text-gray-500">
                          Select a client to view recent documents.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Sidebar Area - 1/3 width */}
              <div className="space-y-6">
                {/* Widgets */}
                {currentClient && (
                  <>
                    {/* Analytics Quick View */}
                    <AnalyticsQuickView clientId={currentClient.id} />

                    {/* Next Actions */}
                    <NextActionsSidebar clientId={currentClient.id} />

                    {/* Quick Access to Vault */}
                    <VaultQuickAccess clientId={currentClient.id} />

                    {/* Reports Quick Widget */}
                    <ReportsQuickWidget clientId={currentClient.id} />
                  </>
                )}

                {/* When no client is selected */}
                {!currentClient && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-lg font-medium">Organizations Overview</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-4">
                        {organizations.map(org => (
                          <div key={org.id} className="flex items-center justify-between">
                            <div className="flex items-center">
                              <Avatar className="h-8 w-8 mr-2">
                                <AvatarImage src={org.logo} alt={org.name} />
                                <AvatarFallback>{org.name.substring(0, 2)}</AvatarFallback>
                              </Avatar>
                              <div>
                                <h4 className="text-sm font-medium">{org.name}</h4>
                                <div className="flex items-center">
                                  <Badge variant="outline" className="mr-2 text-xs">
                                    {org.type}
                                  </Badge>
                                  <span className="text-xs text-gray-500">
                                    {org.memberCount} Members
                                  </span>
                                </div>
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => handleOrganizationChange(org)}
                            >
                              <ArrowRight size={16} />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                )}

                {/* Lument ASSISTANT */}
                <LumentAssistant context={assistantContext} active={false} />
              </div>
            </div>
          </TabsContent>

          {/* Lument ASSISTANT Tab */}
          <TabsContent value="assistant" className="space-y-6">
            <div className="flex items-center mb-6">
              <Sparkles className="h-6 w-6 text-indigo-600 mr-2" />
              <h1 className="text-2xl font-bold text-gray-800">Lument ASSISTANT</h1>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="md:col-span-2">
                {/* Full Assistant View */}
                <LumentAssistant context={assistantContext} active={true} />
              </div>

              <div className="space-y-6">
                {/* Suggested Queries */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium">Suggested Queries</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      <Button variant="outline" className="w-full justify-start text-left">
                        List regulatory requirements for clinical trials in EU 2025
                      </Button>
                      <Button variant="outline" className="w-full justify-start text-left">
                        Explain differences between FDA and EMA ICH guidelines
                      </Button>
                      <Button variant="outline" className="w-full justify-start text-left">
                        Help me write a CER section for biocompatibility
                      </Button>
                      <Button variant="outline" className="w-full justify-start text-left">
                        Find adverse events similar to headache in BTX-112 studies
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Assistant Capabilities */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-lg font-medium">Capabilities</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <div className="flex items-start">
                        <div className="bg-indigo-100 p-1.5 rounded-full mt-0.5">
                          <Search className="h-3.5 w-3.5 text-indigo-700" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium">Cross-Project Search</p>
                          <p className="text-xs text-gray-500">
                            Find documents and data across all your submissions
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start">
                        <div className="bg-indigo-100 p-1.5 rounded-full mt-0.5">
                          <FileText className="h-3.5 w-3.5 text-indigo-700" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium">Document Generation</p>
                          <p className="text-xs text-gray-500">
                            Create first drafts of regulatory documents
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start">
                        <div className="bg-indigo-100 p-1.5 rounded-full mt-0.5">
                          <Brain className="h-3.5 w-3.5 text-indigo-700" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium">Regulatory Intelligence</p>
                          <p className="text-xs text-gray-500">
                            Stay up-to-date with global regulatory requirements
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start">
                        <div className="bg-indigo-100 p-1.5 rounded-full mt-0.5">
                          <Clock className="h-3.5 w-3.5 text-indigo-700" />
                        </div>
                        <div className="ml-3">
                          <p className="text-sm font-medium">Timeline Prediction</p>
                          <p className="text-xs text-gray-500">
                            Forecast regulatory review timelines by region
                          </p>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </TabsContent>

          {/* Lumen Insights Tab */}
          <TabsContent value="lumen-insights" className="space-y-6">
            <div className="mb-6">
              <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg">
                  <Sparkles className="h-6 w-6 text-white" />
                </div>
                <div>
                  <h2 className="text-2xl font-bold">Lumen Insights</h2>
                  <p className="text-gray-600">
                    Configure and manage your AI-powered regulatory intelligence
                  </p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* RAG System Status */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Brain className="h-5 w-5 text-blue-600" />
                    RAG System Status
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Documents Indexed</span>
                    <Badge variant="secondary">1,247</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Vector Embeddings</span>
                    <Badge variant="secondary">Active</Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-gray-600">Query Response Time</span>
                    <Badge variant="secondary">1.2s avg</Badge>
                  </div>
                  <Button className="w-full" variant="outline" size="sm">
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Refresh Index
                  </Button>
                </CardContent>
              </Card>

              {/* Document Sources */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Database className="h-5 w-5 text-purple-600" />
                    Document Sources
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm">CTD Dossiers</span>
                    <Badge>342</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">FDA Guidelines</span>
                    <Badge>89</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">EMA Guidelines</span>
                    <Badge>76</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm">Internal Documents</span>
                    <Badge>740</Badge>
                  </div>
                  <Button className="w-full" variant="outline" size="sm">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Source
                  </Button>
                </CardContent>
              </Card>

              {/* AI Model Configuration */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Cpu className="h-5 w-5 text-green-600" />
                    AI Model Settings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div>
                    <label className="text-sm font-medium">Primary Model</label>
                    <select className="w-full mt-1 px-3 py-2 border rounded-md">
                      <option>GPT-4o</option>
                      <option>GPT-4 Turbo</option>
                      <option>Claude 3 Opus</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Temperature</label>
                    <input
                      type="range"
                      min="0"
                      max="1"
                      step="0.1"
                      defaultValue="0.3"
                      className="w-full mt-1"
                    />
                    <span className="text-xs text-gray-500">0.3 (Precise)</span>
                  </div>
                  <div>
                    <label className="text-sm font-medium">Max Tokens</label>
                    <input
                      type="number"
                      defaultValue="2048"
                      className="w-full mt-1 px-3 py-2 border rounded-md"
                    />
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Query Analytics */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart className="h-5 w-5" />
                  Query Analytics (Last 30 Days)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-4 gap-4 mb-6">
                  <div className="text-center p-4 bg-blue-50 rounded-lg">
                    <div className="text-2xl font-bold text-blue-600">3,847</div>
                    <div className="text-sm text-gray-600">Total Queries</div>
                  </div>
                  <div className="text-center p-4 bg-green-50 rounded-lg">
                    <div className="text-2xl font-bold text-green-600">96.2%</div>
                    <div className="text-sm text-gray-600">Success Rate</div>
                  </div>
                  <div className="text-center p-4 bg-purple-50 rounded-lg">
                    <div className="text-2xl font-bold text-purple-600">1.4s</div>
                    <div className="text-sm text-gray-600">Avg Response</div>
                  </div>
                  <div className="text-center p-4 bg-orange-50 rounded-lg">
                    <div className="text-2xl font-bold text-orange-600">23</div>
                    <div className="text-sm text-gray-600">Active Users</div>
                  </div>
                </div>
                <div className="h-64 bg-gray-50 rounded-lg flex items-center justify-center">
                  <span className="text-gray-400">Query volume chart visualization</span>
                </div>
              </CardContent>
            </Card>

            {/* Popular Queries */}
            <Card>
              <CardHeader>
                <CardTitle>Most Popular Queries</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {[
                    'What are the stability testing requirements for biologics?',
                    'Explain ICH Q1A(R2) guidelines for stability testing',
                    'CMC requirements for Phase 3 IND submission',
                    'Comparability protocols for manufacturing changes',
                    'Quality by Design (QbD) principles for formulation',
                  ].map((query, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="text-sm">{query}</span>
                      <Badge variant="secondary">{Math.floor(Math.random() * 50) + 10}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* CMC CoPilot Modal */}
          {showCMCCopilot && (
            <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
              <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full max-h-[90vh] overflow-hidden">
                <div className="flex items-center justify-between p-4 border-b">
                  <h2 className="text-xl font-semibold">CMC CoPilot™</h2>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowCMCCopilot(false)}
                  >
                    ×
                  </Button>
                </div>
                <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
                  <CMCCopilot />
                </div>
              </div>
            </div>
          )}
        </Tabs>
      </div>
    </div>
  );
};

export default MultiTenantEnterprisePortal;