/**
 * Enterprise Client Portal - Premium Edition
 *
 * This component provides a comprehensive enterprise-grade central hub for biotech clients,
 * with dynamic personalization based on organization, team, and individual.
 *
 * Features:
 * - Global navigation with key sections (Reports, Dashboards, Settings)
 * - Dynamic personalization based on organization, team, and user
 * - Global project management across all modules
 * - Activity aggregation from all platform services
 * - Advanced reporting with analytical dashboards
 * - AI-powered Project Management Guide
 * - Real-time system health monitoring
 * - Enhanced security settings access
 * - Microsoft 365-quality design system
 */

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import ClientPortalLanding from '../../pages/ClientPortalLanding';
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
  Sliders,
  ChevronDown,
  User,
  Download,
  Server,
  Grid,
  Sparkles,
} from 'lucide-react';
import securityService from '../../services/SecurityService';
import { useModuleIntegration } from '../integration/ModuleIntegrationLayer';
import { useToast } from '@/hooks/use-toast';
import ProjectManagerGrid from '../project-manager/ProjectManagerGrid';
import VaultQuickAccess from '../VaultQuickAccess';
import AnalyticsQuickView from '../AnalyticsQuickView';
import NextActionsSidebar from '../NextActionsSidebar';
import ReportsQuickWidget from '../ReportsQuickWidget';

// Dropdown Menu Components
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Progress } from '@/components/ui/progress';

// AI Project Assistant Component
const AIProjectAssistant = ({ project, active = false }) => {
  const [isOpen, setIsOpen] = useState(active);
  const [aiSuggestions, setAiSuggestions] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (isOpen && project && aiSuggestions.length === 0) {
      setIsLoading(true);

      // Simulate AI suggestions loading
      setTimeout(() => {
        setAiSuggestions([
          {
            id: 1,
            title: 'Review Critical Path Tasks',
            description:
              'Your project timeline shows 3 critical path tasks that require attention to maintain timeline.',
            priority: 'high',
          },
          {
            id: 2,
            title: 'Schedule FDA Meeting Preparation',
            description:
              "Based on current progress, it's recommended to schedule an FDA meeting preparation session within 2 weeks.",
            priority: 'medium',
          },
          {
            id: 3,
            title: 'Update Data Management Plan',
            description:
              'Your data management plan should be updated to reflect recent protocol changes.',
            priority: 'medium',
          },
          {
            id: 4,
            title: 'Complete Risk Assessment',
            description:
              'The risk assessment for this study is incomplete. Consider reviewing and finalizing.',
            priority: 'low',
          },
        ]);
        setIsLoading(false);
      }, 1500);
    }
  }, [isOpen, project]);

  if (!isOpen) {
    return (
      <Button
        variant="outline"
        className="flex items-center gap-2 bg-indigo-50 border-indigo-200 text-indigo-700"
        onClick={() => setIsOpen(true)}
      >
        <Sparkles size={16} />
        <span>AI Assistant</span>
      </Button>
    );
  }

  return (
    <Card className="border border-indigo-200 shadow-sm">
      <CardHeader className="bg-indigo-50 pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-indigo-600" />
            <CardTitle className="text-indigo-700 text-lg">AI Project Assistant</CardTitle>
          </div>
          <Button variant="ghost" size="sm" onClick={() => setIsOpen(false)}>
            <ChevronDown className="h-4 w-4" />
          </Button>
        </div>
        <CardDescription className="text-indigo-700/80">
          Intelligent recommendations based on your project data
        </CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-8">
            <div className="h-8 w-8 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin"></div>
            <p className="mt-2 text-sm text-gray-500">Analyzing project data...</p>
          </div>
        ) : (
          <div className="space-y-3">
            {aiSuggestions.map(suggestion => (
              <div
                key={suggestion.id}
                className="p-3 rounded-lg border border-indigo-100 hover:bg-indigo-50 transition-colors"
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-6 w-6 rounded-full flex items-center justify-center ${
                      suggestion.priority === 'high'
                        ? 'bg-red-100 text-red-600'
                        : suggestion.priority === 'medium'
                          ? 'bg-amber-100 text-amber-600'
                          : 'bg-blue-100 text-blue-600'
                    }`}
                  >
                    {suggestion.priority === 'high' ? (
                      <AlertCircle size={14} />
                    ) : suggestion.priority === 'medium' ? (
                      <Clock size={14} />
                    ) : (
                      <CheckCircle size={14} />
                    )}
                  </div>
                  <div className="flex-1">
                    <h4 className="font-medium text-gray-800">{suggestion.title}</h4>
                    <p className="text-sm text-gray-600 mt-1">{suggestion.description}</p>
                  </div>
                  <Button size="sm" variant="ghost" className="h-8 w-8 p-0">
                    <ChevronRight size={16} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
      <CardFooter className="flex justify-end bg-indigo-50/50 pt-2 pb-3">
        <Button variant="link" size="sm" className="text-indigo-600">
          View detailed analysis
        </Button>
      </CardFooter>
    </Card>
  );
};

// Project KPI Card Component
const ProjectKPICard = ({ title, value, target, icon, change, trend }) => {
  const percentComplete = Math.min(100, Math.round((value / target) * 100));
  const trendColor =
    trend === 'up' ? 'text-green-600' : trend === 'down' ? 'text-red-600' : 'text-gray-600';

  return (
    <Card className="shadow-sm">
      <CardHeader className="pb-2">
        <div className="flex justify-between items-center">
          <CardTitle className="text-base font-medium text-gray-700">{title}</CardTitle>
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
            {icon}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex flex-col">
          <div className="flex items-baseline">
            <span className="text-2xl font-bold text-gray-900">{value}</span>
            <span className="text-sm text-gray-500 ml-1">/ {target}</span>
          </div>

          <div className="mt-2">
            <Progress value={percentComplete} className="h-2" />
          </div>

          <div className="flex items-center mt-2">
            <span className={`text-sm ${trendColor} font-medium flex items-center`}>
              {trend === 'up' ? (
                <ArrowUpRight size={14} className="mr-1" />
              ) : trend === 'down' ? (
                <ArrowLeft size={14} className="mr-1 transform rotate-90" />
              ) : null}
              {change}
            </span>
            <span className="text-xs text-gray-500 ml-1">vs. last month</span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

// Enterprise Client Portal Component
const EnterpriseClientPortal = () => {
  return <ClientPortalLanding />;
  const { toast } = useToast();
  const [location, setLocation] = useLocation();
  const [organizations, setOrganizations] = useState([]);
  const [currentOrganization, setCurrentOrganization] = useState(null);
  const [parentOrganization, setParentOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedProject, setSelectedProject] = useState(null);
  const [userTeams, setUserTeams] = useState([]);
  const [userRole, setUserRole] = useState('');
  const [notifications, setNotifications] = useState([]);
  const [systemHealth, setSystemHealth] = useState({
    status: 'healthy',
    components: {
      database: { status: 'healthy', latency: 32 },
      storage: { status: 'healthy', latency: 18 },
      api: { status: 'healthy', latency: 45 },
      cache: { status: 'healthy', latency: 8 },
    },
  });

  // User profile and personalization
  const [userProfile, setUserProfile] = useState({
    id: '',
    name: 'John Smith',
    email: 'john.smith@example.com',
    avatar: null,
    role: 'Administrator',
    preferences: {
      theme: 'light',
      notifications: true,
      dashboardLayout: 'default',
    },
  });

  // Create a fallback object if ModuleIntegrationProvider is not available
  let moduleIntegration = {
    getSharedContext: () => ({}),
    shareContext: () => {},
  };

  try {
    // Attempt to use the hook, but don't crash if the provider isn't available
    moduleIntegration = useModuleIntegration();
  } catch (error) {
    console.log('ModuleIntegration not available, using fallback');
  }

  // Fetch client data on mount
  useEffect(() => {
    const initClientPortal = async () => {
      try {
        // Get organization list
        const orgList = securityService.getAccessibleOrganizations() || [];
        setOrganizations(orgList);

        // Set the current organization if available, otherwise use the first one in the list
        const defaultOrg =
          securityService.currentOrganization || (orgList.length > 0 ? orgList[0] : null);
        const parentOrg = securityService.parentOrganization;

        if (defaultOrg) {
          setCurrentOrganization(defaultOrg);
          setParentOrganization(parentOrg);

          // Share client context with other modules (if available)
          if (moduleIntegration.shareContext) {
            moduleIntegration.shareContext('organization', defaultOrg.id, {
              organization: defaultOrg,
              parentOrganization: parentOrg,
            });
          }

          // Set user profile
          if (securityService.currentUser) {
            setUserProfile({
              ...userProfile,
              id: securityService.currentUser.id,
              name: `${securityService.currentUser.firstName} ${securityService.currentUser.lastName}`,
              email: securityService.currentUser.email,
            });

            // Set user role
            const roles = securityService.getUserRoles();
            if (roles && roles.length > 0) {
              setUserRole(roles[0]);
            }
          }

          // Load user teams (simulated)
          setUserTeams([
            { id: 'team-1', name: 'Clinical Operations', role: 'Member' },
            { id: 'team-2', name: 'Regulatory Affairs', role: 'Lead' },
            { id: 'team-3', name: 'Data Management', role: 'Member' },
          ]);

          // Simulate notifications
          setNotifications([
            {
              id: 'notif-1',
              title: 'Document requires approval',
              type: 'action',
              unread: true,
              time: '1h ago',
            },
            {
              id: 'notif-2',
              title: 'New comment on IND submission',
              type: 'comment',
              unread: true,
              time: '3h ago',
            },
            {
              id: 'notif-3',
              title: 'Meeting scheduled for tomorrow',
              type: 'meeting',
              unread: false,
              time: '1d ago',
            },
            {
              id: 'notif-4',
              title: 'Task deadline approaching',
              type: 'reminder',
              unread: false,
              time: '2d ago',
            },
          ]);

          // Load initial data for the selected organization
          await loadOrganizationData();
        }

        setLoading(false);
      } catch (err) {
        console.error('Error initializing client portal:', err);
        setError(err.message);
        setLoading(false);

        toast({
          title: 'Initialization Error',
          description: `Could not initialize client portal: ${err.message}`,
          variant: 'destructive',
        });
      }
    };

    initClientPortal();
  }, []);

  // Add a useEffect to reload data when currentOrganization changes
  useEffect(() => {
    if (currentOrganization) {
      // Load data for the selected organization
      const loadData = async () => {
        try {
          await loadOrganizationData();
        } catch (err) {
          console.error('Error loading organization data:', err);
          setError(err.message);

          toast({
            title: 'Data Loading Error',
            description: `Failed to load organization data: ${err.message}`,
            variant: 'destructive',
          });
        }
      };

      loadData();

      // Log the current organization to confirm changes
      console.log('Current organization updated:', currentOrganization.name);
    }
  }, [currentOrganization]);

  // Load organization data when organization changes
  const loadOrganizationData = async () => {
    if (!currentOrganization) return;

    try {
      setLoading(true);

      // In a real app, these would be API calls
      // Fetch projects
      const projectList = await fetchProjects(currentOrganization.id);
      setProjects(projectList);

      // Set a selected project if none is selected yet
      if (!selectedProject && projectList.length > 0) {
        setSelectedProject(projectList[0]);
      }

      // Fetch recent documents
      const docList = await fetchDocuments(currentOrganization.id);
      setDocuments(docList);

      // Fetch recent activities
      const activityList = await fetchActivities(currentOrganization.id);
      setActivities(activityList);

      // Update security service
      if (securityService.currentOrganization?.id !== currentOrganization.id) {
        securityService.switchOrganization(currentOrganization.id);
      }

      setLoading(false);

      toast({
        title: 'Data Refreshed',
        description: 'Latest organization data has been loaded',
      });
    } catch (err) {
      console.error('Error loading organization data:', err);
      setError(`Error loading organization data: ${err.message}`);
      setLoading(false);

      toast({
        title: 'Data Refresh Failed',
        description: `Could not load latest data: ${err.message}`,
        variant: 'destructive',
      });
    }
  };

  // Handle organization change
  const handleOrganizationChange = async newOrgId => {
    const newOrg = organizations.find(org => org.id === newOrgId);
    if (newOrg) {
      try {
        // Update the organization in SecurityService first
        await securityService.switchOrganization(newOrgId, {
          notifySubscribers: true,
          updateRoutes: false,
        });

        // Then update our local state - this will trigger the useEffect
        setCurrentOrganization(newOrg);
        console.log(`Switching to organization: ${newOrg.name} (${newOrg.id})`);
        setSelectedProject(null);

        toast({
          title: 'Organization Changed',
          description: `Now viewing ${newOrg.name}`,
        });

        // No need to explicitly call loadOrganizationData here
        // as it's now handled by the useEffect that watches currentOrganization
      } catch (err) {
        console.error('Error switching organization:', err);

        toast({
          title: 'Switch Failed',
          description: `Could not switch to ${newOrg.name}: ${err.message}`,
          variant: 'destructive',
        });
      }
    }
  };

  // Handle return to CRO portal
  const handleReturnToCRO = async () => {
    try {
      const result = await securityService.returnToParentOrganization();

      if (result.success) {
        toast({
          title: 'Returning to CRO Portal',
          description: 'You will be redirected to the CRO administration portal',
        });

        // Redirect to CRO dashboard (admin)
        window.location.href = '/admin'; // Using window.location for immediate navigation
      } else {
        setError(result.error || 'Failed to return to CRO portal');

        toast({
          title: 'Navigation Failed',
          description: result.error || 'Failed to return to CRO portal',
          variant: 'destructive',
        });
      }
    } catch (err) {
      console.error('Error returning to CRO portal:', err);
      setError(err.message);

      toast({
        title: 'Navigation Error',
        description: `Error returning to CRO portal: ${err.message}`,
        variant: 'destructive',
      });
    }
  };

  // Handle search
  const handleSearch = e => {
    e.preventDefault();

    if (!searchQuery.trim()) {
      return;
    }

    // In a real app, would navigate to search results
    console.log(`Searching for: ${searchQuery}`);
    setLocation(`/search?q=${encodeURIComponent(searchQuery)}`);
  };

  // Navigate to a module
  const navigateToModule = module => {
    console.log(`Navigating to module: ${module}`);
    setLocation(`/${module}`);
  };

  // Fetch projects (simulated for demo)
  const fetchProjects = async orgId => {
    // In a real app, would be an API call
    return [
      {
        id: 1,
        name: 'Phase II Clinical Trial - BX-107',
        status: 'in_progress',
        module: 'trial-vault',
        progress: 65,
        dueDate: '2025-06-15',
        team: 'Clinical Operations',
        priority: 'high',
        kpis: [
          {
            id: 'kpi-1',
            name: 'Patient Enrollment',
            value: 42,
            target: 65,
            change: '+8%',
            trend: 'up',
          },
          {
            id: 'kpi-2',
            name: 'Protocol Deviations',
            value: 3,
            target: 10,
            change: '-2%',
            trend: 'up',
          },
          {
            id: 'kpi-3',
            name: 'Data Completion',
            value: 65,
            target: 100,
            change: '+5%',
            trend: 'up',
          },
          {
            id: 'kpi-4',
            name: 'Site Activation',
            value: 8,
            target: 10,
            change: '0%',
            trend: 'neutral',
          },
        ],
      },
      {
        id: 2,
        name: 'IND Application for BTX-331',
        status: 'in_progress',
        module: 'ind-wizard',
        progress: 42,
        dueDate: '2025-05-30',
        team: 'Regulatory Affairs',
        priority: 'high',
        kpis: [
          {
            id: 'kpi-1',
            name: 'Module Completion',
            value: 12,
            target: 28,
            change: '+15%',
            trend: 'up',
          },
          {
            id: 'kpi-2',
            name: 'Review Cycles',
            value: 2,
            target: 3,
            change: '0%',
            trend: 'neutral',
          },
          {
            id: 'kpi-3',
            name: 'Document Approvals',
            value: 18,
            target: 42,
            change: '+12%',
            trend: 'up',
          },
          {
            id: 'kpi-4',
            name: 'Quality Metrics',
            value: 85,
            target: 100,
            change: '+3%',
            trend: 'up',
          },
        ],
      },
      {
        id: 3,
        name: 'Clinical Study Report - Phase I',
        status: 'pending_review',
        module: 'csr-intelligence',
        progress: 95,
        dueDate: '2025-05-10',
        team: 'Clinical Operations',
        priority: 'medium',
        kpis: [
          {
            id: 'kpi-1',
            name: 'Section Completion',
            value: 19,
            target: 20,
            change: '+5%',
            trend: 'up',
          },
          { id: 'kpi-2', name: 'Data Tables', value: 45, target: 45, change: '+15%', trend: 'up' },
          { id: 'kpi-3', name: 'QC Findings', value: 5, target: 20, change: '-30%', trend: 'up' },
          {
            id: 'kpi-4',
            name: 'Reviewer Approvals',
            value: 3,
            target: 4,
            change: '+50%',
            trend: 'up',
          },
        ],
      },
      {
        id: 4,
        name: 'Study Protocol Development',
        status: 'not_started',
        module: 'study-architect',
        progress: 0,
        dueDate: '2025-07-21',
        team: 'Clinical Operations',
        priority: 'low',
        kpis: [
          {
            id: 'kpi-1',
            name: 'Section Drafts',
            value: 0,
            target: 12,
            change: '0%',
            trend: 'neutral',
          },
          {
            id: 'kpi-2',
            name: 'Review Cycles',
            value: 0,
            target: 3,
            change: '0%',
            trend: 'neutral',
          },
          {
            id: 'kpi-3',
            name: 'Stakeholder Input',
            value: 2,
            target: 8,
            change: '+100%',
            trend: 'up',
          },
          {
            id: 'kpi-4',
            name: 'SAP Progress',
            value: 10,
            target: 100,
            change: '+10%',
            trend: 'up',
          },
        ],
      },
    ];
  };

  // Fetch documents (simulated for demo)
  const fetchDocuments = async orgId => {
    // In a real app, would be an API call
    return [
      {
        id: 1,
        name: 'BX-107 Protocol.docx',
        type: 'protocol',
        module: 'study-architect',
        updatedAt: '2025-04-25T15:30:00Z',
        updatedBy: 'John Davis',
      },
      {
        id: 2,
        name: 'BTX-331 Investigator Brochure.pdf',
        type: 'brochure',
        module: 'ind-wizard',
        updatedAt: '2025-04-24T09:15:00Z',
        updatedBy: 'Sarah Johnson',
      },
      {
        id: 3,
        name: 'Phase I CSR Draft.docx',
        type: 'report',
        module: 'csr-intelligence',
        updatedAt: '2025-04-23T11:45:00Z',
        updatedBy: 'Mark Wilson',
      },
      {
        id: 4,
        name: 'BTX-331 Chemistry Data.xlsx',
        type: 'data',
        module: 'ind-wizard',
        updatedAt: '2025-04-22T14:20:00Z',
        updatedBy: 'Emily Chen',
      },
    ];
  };

  // Fetch activities (simulated for demo)
  const fetchActivities = async orgId => {
    // In a real app, would be an API call
    return [
      {
        id: 1,
        type: 'document_updated',
        description: 'BX-107 Protocol updated',
        timestamp: '2025-04-25T15:30:00Z',
        user: 'John Davis',
        module: 'study-architect',
      },
      {
        id: 2,
        type: 'task_completed',
        description: 'Phase I CSR Quality Check completed',
        timestamp: '2025-04-24T16:45:00Z',
        user: 'Sarah Johnson',
        module: 'csr-intelligence',
      },
      {
        id: 3,
        type: 'comment_added',
        description: 'Comment added to BTX-331 IND application',
        timestamp: '2025-04-24T10:15:00Z',
        user: 'Mark Wilson',
        module: 'ind-wizard',
      },
      {
        id: 4,
        type: 'meeting_scheduled',
        description: 'FDA Meeting scheduled for May 10',
        timestamp: '2025-04-23T09:30:00Z',
        user: 'Emily Chen',
        module: 'ind-wizard',
      },
      {
        id: 5,
        type: 'document_shared',
        description: 'Phase I CSR shared with regulatory team',
        timestamp: '2025-04-22T14:20:00Z',
        user: 'Emily Chen',
        module: 'csr-intelligence',
      },
    ];
  };

  // Format date for display
  const formatDate = dateString => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Format timestamp for display
  const formatTimestamp = timestamp => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.round(diffMs / 1000);
    const diffMin = Math.round(diffSec / 60);
    const diffHr = Math.round(diffMin / 60);
    const diffDays = Math.round(diffHr / 24);

    if (diffSec < 60) {
      return 'Just now';
    } else if (diffMin < 60) {
      return `${diffMin}m ago`;
    } else if (diffHr < 24) {
      return `${diffHr}h ago`;
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return `${diffDays}d ago`;
    } else {
      return formatDate(timestamp);
    }
  };

  // Get status icon and text
  const getStatusDisplay = status => {
    switch (status) {
      case 'completed':
        return {
          icon: <CheckCircle size={16} className="text-green-500" />,
          text: 'Completed',
          className: 'text-green-600',
          bgColor: 'bg-green-100',
        };
      case 'in_progress':
        return {
          icon: <Clock size={16} className="text-blue-500" />,
          text: 'In Progress',
          className: 'text-blue-600',
          bgColor: 'bg-blue-100',
        };
      case 'pending_review':
        return {
          icon: <AlertCircle size={16} className="text-yellow-500" />,
          text: 'Pending Review',
          className: 'text-yellow-600',
          bgColor: 'bg-yellow-100',
        };
      case 'not_started':
        return {
          icon: <Calendar size={16} className="text-gray-500" />,
          text: 'Not Started',
          className: 'text-gray-600',
          bgColor: 'bg-gray-100',
        };
      default:
        return {
          icon: <Clock size={16} className="text-gray-500" />,
          text: 'Unknown',
          className: 'text-gray-600',
          bgColor: 'bg-gray-100',
        };
    }
  };

  // Get priority badge
  const getPriorityBadge = priority => {
    switch (priority) {
      case 'high':
        return (
          <Badge variant="outline" className="bg-red-100 border-red-200 text-red-700">
            High
          </Badge>
        );
      case 'medium':
        return (
          <Badge variant="outline" className="bg-yellow-100 border-yellow-200 text-yellow-700">
            Medium
          </Badge>
        );
      case 'low':
        return (
          <Badge variant="outline" className="bg-blue-100 border-blue-200 text-blue-700">
            Low
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-100 border-gray-200 text-gray-700">
            Normal
          </Badge>
        );
    }
  };

  // Get module icon
  const getModuleIcon = module => {
    switch (module) {
      case 'ind-wizard':
        return <FileText size={16} className="text-primary" />;
      case 'trial-vault':
        return <Building size={16} className="text-primary" />;
      case 'csr-intelligence':
        return <BookOpen size={16} className="text-primary" />;
      case 'study-architect':
        return <Users size={16} className="text-primary" />;
      case 'analytics':
        return <BarChart2 size={16} className="text-primary" />;
      default:
        return <FileText size={16} className="text-primary" />;
    }
  };

  // Get team badge
  const getTeamBadge = team => {
    switch (team) {
      case 'Clinical Operations':
        return (
          <Badge variant="outline" className="bg-purple-100 border-purple-200 text-purple-700">
            {team}
          </Badge>
        );
      case 'Regulatory Affairs':
        return (
          <Badge variant="outline" className="bg-green-100 border-green-200 text-green-700">
            {team}
          </Badge>
        );
      case 'Data Management':
        return (
          <Badge variant="outline" className="bg-blue-100 border-blue-200 text-blue-700">
            {team}
          </Badge>
        );
      default:
        return (
          <Badge variant="outline" className="bg-gray-100 border-gray-200 text-gray-700">
            {team}
          </Badge>
        );
    }
  };

  // Get notification icon
  const getNotificationIcon = type => {
    switch (type) {
      case 'action':
        return <AlertCircle size={16} className="text-amber-500" />;
      case 'comment':
        return <MessageSquare size={16} className="text-blue-500" />;
      case 'meeting':
        return <Calendar size={16} className="text-purple-500" />;
      case 'reminder':
        return <Bell size={16} className="text-red-500" />;
      default:
        return <Info size={16} className="text-gray-500" />;
    }
  };

  // Format KPI icon
  const getKPIIcon = name => {
    if (name.toLowerCase().includes('enrollment') || name.toLowerCase().includes('patient')) {
      return <Users size={16} />;
    } else if (
      name.toLowerCase().includes('completion') ||
      name.toLowerCase().includes('progress')
    ) {
      return <CheckCircle size={16} />;
    } else if (name.toLowerCase().includes('deviation') || name.toLowerCase().includes('finding')) {
      return <AlertCircle size={16} />;
    } else if (name.toLowerCase().includes('review') || name.toLowerCase().includes('approval')) {
      return <FileCheck size={16} />;
    } else if (name.toLowerCase().includes('site') || name.toLowerCase().includes('activation')) {
      return <Building size={16} />;
    } else if (name.toLowerCase().includes('data') || name.toLowerCase().includes('table')) {
      return <Database size={16} />;
    } else if (name.toLowerCase().includes('quality') || name.toLowerCase().includes('metric')) {
      return <Award size={16} />;
    } else {
      return <BarChart size={16} />;
    }
  };

  // Step 4: Render the landing page when no organization is selected
  if (!currentOrganization) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-md">
          <Building size={48} className="mx-auto text-primary mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Welcome to TrialSage</h2>
          <p className="text-gray-600 mb-4">Please select an organization to continue.</p>
          {error && (
            <div className="text-red-500 mb-4 flex items-center justify-center">
              <AlertCircle size={16} className="mr-1" />
              <span>{error}</span>
            </div>
          )}
          {organizations.length > 0 ? (
            <div className="space-y-2">
              {organizations.map(org => (
                <button
                  key={org.id}
                  onClick={() => {
                    setCurrentOrganization(org);
                    securityService.switchOrganization(org.id);
                  }}
                  className="w-full px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90 flex items-center justify-center"
                >
                  <Building size={16} className="mr-2" />
                  {org.name}
                </button>
              ))}
            </div>
          ) : loading ? (
            <div className="animate-pulse p-4">Loading organizations...</div>
          ) : (
            <button
              onClick={() => {
                const testOrg = {
                  id: 'test-org',
                  name: 'Acme CRO',
                  type: 'cro',
                  role: 'Administrator',
                  clients: 5,
                  lastUpdated: '2025-05-10',
                };
                setCurrentOrganization(testOrg);
                setOrganizations([testOrg]);
              }}
              className="px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90"
            >
              Use Test Organization
            </button>
          )}
        </div>
      </div>
    );
  }

  // Show the dashboard when organization is selected
  return (
    <div className="bg-gray-50 min-h-screen">
      {/* Global Navigation Header */}
      <div className="bg-white border-b">
        <div className="container mx-auto">
          {/* Top Navigation Bar */}
          <div className="flex items-center justify-between px-4 py-2 border-b">
            <div className="flex items-center space-x-2">
              <Link href="/" className="flex items-center">
                <Shield className="h-6 w-6 text-primary mr-2" />
                <span className="font-bold text-lg text-gray-900">TrialSage</span>
              </Link>

              <Separator orientation="vertical" className="h-6" />

              {/* Organization Selector */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center">
                    <Building className="h-4 w-4 mr-2 text-primary" />
                    <span className="font-medium">
                      {currentOrganization?.name || 'Select Organization'}
                    </span>
                    <ChevronDown className="h-4 w-4 ml-2" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-56">
                  <DropdownMenuLabel>Organizations</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {organizations.map(org => (
                    <DropdownMenuItem
                      key={org.id}
                      onClick={() => handleOrganizationChange(org.id)}
                      className="cursor-pointer"
                    >
                      <Building className="h-4 w-4 mr-2" />
                      <span>{org.name}</span>
                      {org.id === currentOrganization?.id && (
                        <CheckCircle className="h-4 w-4 ml-auto text-primary" />
                      )}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Return to CRO Button (if applicable) */}
              {parentOrganization && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleReturnToCRO}
                  className="text-sm flex items-center"
                >
                  <ArrowLeft size={14} className="mr-1" />
                  Return to {parentOrganization.name}
                </Button>
              )}
            </div>

            <div className="flex items-center space-x-3">
              {/* Global Search */}
              <form onSubmit={handleSearch} className="relative w-64">
                <input
                  type="text"
                  placeholder="Search across all modules..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
                />
                <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center pointer-events-none">
                  <Search size={14} className="text-gray-500" />
                </span>
              </form>

              {/* User Teams */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-sm">
                    <Users size={14} className="mr-1" />
                    <span>Teams</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Your Teams</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {userTeams.map(team => (
                    <DropdownMenuItem key={team.id} className="flex justify-between">
                      <span>{team.name}</span>
                      <Badge variant="outline" className="text-xs ml-2">
                        {team.role}
                      </Badge>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <UserPlus size={14} className="mr-2" />
                    <span>Manage Teams</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* System Health */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className={`text-sm ${
                      systemHealth.status === 'healthy'
                        ? 'text-green-600'
                        : systemHealth.status === 'warning'
                          ? 'text-amber-600'
                          : 'text-red-600'
                    }`}
                  >
                    {systemHealth.status === 'healthy' ? (
                      <CheckCircle size={14} className="mr-1" />
                    ) : systemHealth.status === 'warning' ? (
                      <AlertTriangle size={14} className="mr-1" />
                    ) : (
                      <AlertCircle size={14} className="mr-1" />
                    )}
                    <span>System</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-64">
                  <DropdownMenuLabel>System Health</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {Object.entries(systemHealth.components).map(([key, component]) => (
                    <div key={key} className="px-2 py-1.5 text-sm">
                      <div className="flex items-center justify-between">
                        <span className="font-medium capitalize">{key}</span>
                        <Badge
                          variant="outline"
                          className={
                            component.status === 'healthy'
                              ? 'bg-green-100 text-green-800 border-green-200'
                              : component.status === 'warning'
                                ? 'bg-yellow-100 text-yellow-800 border-yellow-200'
                                : 'bg-red-100 text-red-800 border-red-200'
                          }
                        >
                          {component.status === 'healthy'
                            ? 'Healthy'
                            : component.status === 'warning'
                              ? 'Warning'
                              : 'Error'}
                        </Badge>
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        Latency: {component.latency}ms
                      </div>
                    </div>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Notifications */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="relative">
                    <Bell size={18} />
                    {notifications.filter(n => n.unread).length > 0 && (
                      <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-red-500 text-white text-xs flex items-center justify-center">
                        {notifications.filter(n => n.unread).length}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80">
                  <DropdownMenuLabel className="flex items-center justify-between">
                    <span>Notifications</span>
                    {notifications.filter(n => n.unread).length > 0 && (
                      <Button variant="ghost" size="sm" className="h-8 text-xs">
                        Mark all as read
                      </Button>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {notifications.length === 0 ? (
                    <div className="py-4 text-center text-gray-500">
                      <p>No notifications</p>
                    </div>
                  ) : (
                    notifications.map(notification => (
                      <DropdownMenuItem key={notification.id} className="p-3 cursor-pointer">
                        <div className="flex items-start gap-3">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p
                              className={`text-sm font-medium ${notification.unread ? 'text-gray-900' : 'text-gray-600'}`}
                            >
                              {notification.title}
                            </p>
                            <p className="text-xs text-gray-500 mt-0.5">{notification.time}</p>
                          </div>
                          {notification.unread && (
                            <div className="h-2 w-2 rounded-full bg-primary" />
                          )}
                        </div>
                      </DropdownMenuItem>
                    ))
                  )}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="flex justify-center">
                    <Button variant="ghost" size="sm" className="w-full text-center" asChild>
                      <Link href="/notifications">View all notifications</Link>
                    </Button>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Help */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon">
                    <HelpCircle size={18} />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel>Help & Support</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem>
                    <BookOpen className="h-4 w-4 mr-2" />
                    <span>Documentation</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <MessageSquare className="h-4 w-4 mr-2" />
                    <span>Contact Support</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Lightbulb className="h-4 w-4 mr-2" />
                    <span>Product Tour</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem>
                    <Github className="h-4 w-4 mr-2" />
                    <span>API Documentation</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* User Profile */}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      <AvatarImage src={userProfile.avatar || null} alt={userProfile.name} />
                      <AvatarFallback className="bg-primary text-white">
                        {userProfile.name
                          .split(' ')
                          .map(n => n[0])
                          .join('')}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex flex-col items-start text-sm">
                      <span className="font-medium">{userProfile.name}</span>
                      <span className="text-xs text-gray-500">{userRole}</span>
                    </div>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <div className="flex items-center justify-start p-2">
                    <div className="flex flex-col space-y-1">
                      <p className="text-sm font-medium">{userProfile.name}</p>
                      <p className="text-xs text-gray-500">{userProfile.email}</p>
                    </div>
                  </div>
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

          {/* Main Navigation Tabs */}
          <nav className="flex px-4">
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'dashboard'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('dashboard')}
            >
              <div className="flex items-center">
                <Layout size={16} className="mr-2" />
                Dashboard
              </div>
            </button>
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'projects'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('projects')}
            >
              <div className="flex items-center">
                <Briefcase size={16} className="mr-2" />
                Projects
              </div>
            </button>
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'documents'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('documents')}
            >
              <div className="flex items-center">
                <FileText size={16} className="mr-2" />
                Documents
              </div>
            </button>
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'reports'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('reports')}
            >
              <div className="flex items-center">
                <BarChart size={16} className="mr-2" />
                Reports
              </div>
            </button>
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'analytics'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('analytics')}
            >
              <div className="flex items-center">
                <LineChart size={16} className="mr-2" />
                Analytics
              </div>
            </button>
            <button
              className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                activeTab === 'vault'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
              }`}
              onClick={() => setActiveTab('vault')}
            >
              <div className="flex items-center">
                <Database size={16} className="mr-2" />
                Vault
              </div>
            </button>

            {/* Settings Dropdown */}
            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    className={`px-4 py-3 font-medium border-b-2 transition-colors ${
                      activeTab === 'settings'
                        ? 'border-primary text-primary'
                        : 'border-transparent text-gray-600 hover:text-gray-900 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-center">
                      <Settings size={16} className="mr-2" />
                      Settings
                      <ChevronDown size={14} className="ml-1" />
                    </div>
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent className="w-56">
                  <DropdownMenuItem onClick={() => setActiveTab('org-settings')}>
                    <Building className="h-4 w-4 mr-2" />
                    <span>Organization Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('user-settings')}>
                    <UserCog className="h-4 w-4 mr-2" />
                    <span>User Management</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('security')}>
                    <Lock className="h-4 w-4 mr-2" />
                    <span>Security Settings</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => setActiveTab('integrations')}>
                    <Share2 className="h-4 w-4 mr-2" />
                    <span>Integrations</span>
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={() => setActiveTab('system-config')}>
                    <Server className="h-4 w-4 mr-2" />
                    <span>System Configuration</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </nav>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
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

        {/* Dashboard Tab Content */}
        {activeTab === 'dashboard' && !loading && !error && (
          <>
            {/* Welcome Banner with Organization Info */}
            <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-6 mb-8">
              <div className="flex items-center justify-between">
                <div>
                  <h1 className="text-2xl font-bold text-gray-800">
                    Welcome to {currentOrganization?.name || 'TrialSage'}
                  </h1>
                  <p className="text-gray-600 mt-1">
                    Your unified portal for managing clinical and regulatory projects across all
                    modules
                  </p>
                </div>
                <div className="flex space-x-4">
                  <Button
                    onClick={() => setLocation('/projects/new')}
                    className="flex items-center"
                  >
                    <Plus size={16} className="mr-2" />
                    New Project
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => loadOrganizationData()}
                    className="flex items-center"
                  >
                    <RefreshCw size={16} className="mr-2" />
                    Refresh
                  </Button>
                </div>
              </div>
            </div>

            {/* Project Quick Selector */}
            {projects.length > 0 && (
              <div className="mb-8">
                <h2 className="text-xl font-semibold mb-4 flex items-center">
                  <Briefcase className="h-5 w-5 mr-2 text-primary" />
                  Active Projects
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {projects.map(project => (
                    <Card
                      key={project.id}
                      className={`cursor-pointer transition-all ${
                        selectedProject?.id === project.id
                          ? 'ring-2 ring-primary border-primary'
                          : 'hover:shadow-md'
                      }`}
                      onClick={() => setSelectedProject(project)}
                    >
                      <CardHeader className="pb-3">
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <CardTitle className="text-base font-medium">{project.name}</CardTitle>
                            <CardDescription className="mt-1">
                              {getTeamBadge(project.team)}
                              <span className="ml-2">{getPriorityBadge(project.priority)}</span>
                            </CardDescription>
                          </div>
                          <Badge
                            variant="outline"
                            className={`${getStatusDisplay(project.status).bgColor} ${getStatusDisplay(project.status).className}`}
                          >
                            {getStatusDisplay(project.status).text}
                          </Badge>
                        </div>
                      </CardHeader>
                      <CardContent className="pb-3">
                        <div className="flex flex-col">
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-500">Progress</span>
                            <span className="font-medium">{project.progress}%</span>
                          </div>
                          <Progress value={project.progress} className="h-2 mt-1" />
                          <div className="flex items-center justify-between mt-2 text-sm">
                            <span className="text-gray-500">Due:</span>
                            <span className="font-medium">{formatDate(project.dueDate)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            )}

            {/* Selected Project Dashboard */}
            {selectedProject && (
              <div className="mb-8">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center">
                    <h2 className="text-xl font-semibold">{selectedProject.name}</h2>
                    <Badge
                      variant="outline"
                      className={`ml-3 ${getStatusDisplay(selectedProject.status).bgColor} ${getStatusDisplay(selectedProject.status).className}`}
                    >
                      {getStatusDisplay(selectedProject.status).text}
                    </Badge>
                  </div>
                  <div className="flex items-center space-x-3">
                    <Button variant="outline" className="text-gray-700 flex items-center gap-2">
                      <Edit3 size={14} />
                      <span>Edit Project</span>
                    </Button>
                    <Button variant="outline" className="text-gray-700 flex items-center gap-2">
                      <Download size={14} />
                      <span>Export</span>
                    </Button>
                    <Button variant="outline" className="text-gray-700 flex items-center gap-2">
                      <Sliders size={14} />
                      <span>Configure</span>
                    </Button>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {/* Project KPIs */}
                  <div className="md:col-span-2">
                    <h3 className="text-lg font-medium mb-3">Project KPIs</h3>
                    <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
                      {selectedProject.kpis.map(kpi => (
                        <ProjectKPICard
                          key={kpi.id}
                          title={kpi.name}
                          value={kpi.value}
                          target={kpi.target}
                          icon={getKPIIcon(kpi.name)}
                          change={kpi.change}
                          trend={kpi.trend}
                        />
                      ))}
                    </div>
                  </div>

                  {/* AI Project Assistant */}
                  <div className="md:col-span-1">
                    <AIProjectAssistant project={selectedProject} active={true} />
                  </div>
                </div>

                {/* Project Dashboard Grid */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-6">
                  {/* Recent Activity */}
                  <div className="md:col-span-1">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-medium flex items-center">
                          <Activity size={16} className="mr-2 text-primary" />
                          Recent Activity
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          {activities.slice(0, 5).map(activity => (
                            <div key={activity.id} className="flex items-start">
                              <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center mt-0.5">
                                {getModuleIcon(activity.module)}
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium">{activity.description}</p>
                                <div className="flex items-center text-xs text-gray-500 mt-0.5">
                                  <span>{formatTimestamp(activity.timestamp)}</span>
                                  <span className="mx-1">·</span>
                                  <span>{activity.user}</span>
                                </div>
                              </div>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Recent Documents */}
                  <div className="md:col-span-1">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-medium flex items-center">
                          <FileText size={16} className="mr-2 text-primary" />
                          Recent Documents
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-3">
                          {documents
                            .filter(
                              doc =>
                                selectedProject.module === doc.module ||
                                doc.name.includes(selectedProject.name.split(' - ')[1])
                            )
                            .slice(0, 4)
                            .map(doc => (
                              <div
                                key={doc.id}
                                className="p-2 rounded-md hover:bg-gray-50 cursor-pointer"
                              >
                                <div className="flex items-center">
                                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                                    {getModuleIcon(doc.module)}
                                  </div>
                                  <div className="ml-3 overflow-hidden">
                                    <p className="text-sm font-medium truncate">{doc.name}</p>
                                    <div className="flex items-center text-xs text-gray-500 mt-0.5">
                                      <span>{formatTimestamp(doc.updatedAt)}</span>
                                      <span className="mx-1">·</span>
                                      <span>{doc.updatedBy}</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            ))}
                        </div>
                        <div className="mt-3 text-center">
                          <Button variant="outline" size="sm" className="w-full">
                            View All Documents
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Next Actions */}
                  <div className="md:col-span-1">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-base font-medium flex items-center">
                          <ListChecks size={16} className="mr-2 text-primary" />
                          Next Actions
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-2">
                          <div className="p-2 rounded-md bg-blue-50 border border-blue-100">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-blue-500/10 flex items-center justify-center">
                                <FileText size={16} className="text-blue-600" />
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium text-blue-900">
                                  Review protocol amendments
                                </p>
                                <p className="text-xs text-blue-700">Due in 2 days</p>
                              </div>
                            </div>
                          </div>

                          <div className="p-2 rounded-md border border-gray-200">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-amber-500/10 flex items-center justify-center">
                                <CheckCircle size={16} className="text-amber-600" />
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium">Sign off on data tables</p>
                                <p className="text-xs text-gray-500">Due next week</p>
                              </div>
                            </div>
                          </div>

                          <div className="p-2 rounded-md border border-gray-200">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-purple-500/10 flex items-center justify-center">
                                <Calendar size={16} className="text-purple-600" />
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium">Schedule team review meeting</p>
                                <p className="text-xs text-gray-500">Due in 10 days</p>
                              </div>
                            </div>
                          </div>

                          <div className="p-2 rounded-md border border-gray-200">
                            <div className="flex items-center">
                              <div className="h-8 w-8 rounded-full bg-green-500/10 flex items-center justify-center">
                                <BarChart size={16} className="text-green-600" />
                              </div>
                              <div className="ml-3">
                                <p className="text-sm font-medium">
                                  Generate interim analysis report
                                </p>
                                <p className="text-xs text-gray-500">Due in 2 weeks</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </div>
            )}

            {/* Project Manager Grid */}
            <div className="mb-8">
              <h2 className="text-xl font-semibold mb-4 flex items-center">
                <Grid className="h-5 w-5 mr-2 text-primary" />
                Global Project Manager
              </h2>
              <Card className="shadow-sm">
                <CardContent className="p-6">
                  <ProjectManagerGrid
                    userId={userProfile.id}
                    orgId={currentOrganization.id}
                    onProjectSelect={projectId => {
                      const project = projects.find(p => p.id === projectId);
                      if (project) {
                        setSelectedProject(project);
                      }
                    }}
                  />
                </CardContent>
              </Card>
            </div>
          </>
        )}

        {/* Reports Tab Content */}
        {activeTab === 'reports' && !loading && !error && (
          <div>
            <div className="flex items-center justify-between mb-6">
              <h1 className="text-2xl font-bold">Reports</h1>
              <div className="flex items-center space-x-3">
                <Button variant="outline" className="flex items-center">
                  <Plus size={16} className="mr-2" />
                  New Report
                </Button>
                <Button variant="outline" className="flex items-center">
                  <Download size={16} className="mr-2" />
                  Export
                </Button>
              </div>
            </div>

            <Tabs defaultValue="standard-reports">
              <TabsList className="mb-6">
                <TabsTrigger value="standard-reports">Standard Reports</TabsTrigger>
                <TabsTrigger value="custom-reports">Custom Reports</TabsTrigger>
                <TabsTrigger value="scheduled">Scheduled Reports</TabsTrigger>
                <TabsTrigger value="archived">Archived</TabsTrigger>
              </TabsList>

              <TabsContent value="standard-reports">
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center">
                        <BarChart className="h-5 w-5 mr-2 text-blue-500" />
                        Project Progress Summary
                      </CardTitle>
                      <CardDescription>Overview of all project progress and status</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500">Last generated: Today at 9:30 AM</p>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button variant="ghost" size="sm">
                        Preview
                      </Button>
                      <Button variant="outline" size="sm">
                        Generate
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center">
                        <PieChart className="h-5 w-5 mr-2 text-green-500" />
                        Regulatory Submission Status
                      </CardTitle>
                      <CardDescription>Status of all regulatory submissions</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500">Last generated: Yesterday at 4:15 PM</p>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button variant="ghost" size="sm">
                        Preview
                      </Button>
                      <Button variant="outline" size="sm">
                        Generate
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center">
                        <Users className="h-5 w-5 mr-2 text-purple-500" />
                        Team Productivity Analysis
                      </CardTitle>
                      <CardDescription>Productivity metrics across teams</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500">Last generated: 2 days ago</p>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button variant="ghost" size="sm">
                        Preview
                      </Button>
                      <Button variant="outline" size="sm">
                        Generate
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center">
                        <FileText className="h-5 w-5 mr-2 text-amber-500" />
                        Document Status Report
                      </CardTitle>
                      <CardDescription>Status of all documents in the system</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500">Last generated: 3 days ago</p>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button variant="ghost" size="sm">
                        Preview
                      </Button>
                      <Button variant="outline" size="sm">
                        Generate
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center">
                        <Calendar className="h-5 w-5 mr-2 text-red-500" />
                        Deadline & Milestone Tracking
                      </CardTitle>
                      <CardDescription>Upcoming deadlines and milestone status</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500">Last generated: 1 week ago</p>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button variant="ghost" size="sm">
                        Preview
                      </Button>
                      <Button variant="outline" size="sm">
                        Generate
                      </Button>
                    </CardFooter>
                  </Card>

                  <Card className="hover:shadow-md transition-shadow cursor-pointer">
                    <CardHeader>
                      <CardTitle className="text-lg flex items-center">
                        <Activity className="h-5 w-5 mr-2 text-indigo-500" />
                        System Activity Log
                      </CardTitle>
                      <CardDescription>Comprehensive system activity log</CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-sm text-gray-500">Last generated: 2 weeks ago</p>
                    </CardContent>
                    <CardFooter className="flex justify-between">
                      <Button variant="ghost" size="sm">
                        Preview
                      </Button>
                      <Button variant="outline" size="sm">
                        Generate
                      </Button>
                    </CardFooter>
                  </Card>
                </div>
              </TabsContent>

              <TabsContent value="custom-reports">
                <div className="flex flex-col space-y-6">
                  <Card>
                    <CardHeader>
                      <CardTitle>Create Custom Report</CardTitle>
                      <CardDescription>
                        Select data sources and customize your report
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-500 mb-4">
                        Build custom reports by selecting modules, data fields, and visualization
                        options
                      </p>
                      <Button>Start Building</Button>
                    </CardContent>
                  </Card>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Custom Reports Library</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium">IND Submission Rate Analysis</h4>
                                <p className="text-sm text-gray-500">Created 1 month ago</p>
                              </div>
                              <Button variant="ghost" size="sm">
                                Run
                              </Button>
                            </div>
                          </div>

                          <div className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium">Cross-Project Resource Allocation</h4>
                                <p className="text-sm text-gray-500">Created 2 months ago</p>
                              </div>
                              <Button variant="ghost" size="sm">
                                Run
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardHeader>
                        <CardTitle className="text-lg">Report Templates</CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="space-y-4">
                          <div className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium">Executive Summary Template</h4>
                                <p className="text-sm text-gray-500">
                                  For high-level project overview
                                </p>
                              </div>
                              <Button variant="ghost" size="sm">
                                Use
                              </Button>
                            </div>
                          </div>

                          <div className="p-3 border rounded-md hover:bg-gray-50 cursor-pointer">
                            <div className="flex items-center justify-between">
                              <div>
                                <h4 className="font-medium">Regulatory Compliance Template</h4>
                                <p className="text-sm text-gray-500">
                                  For tracking compliance metrics
                                </p>
                              </div>
                              <Button variant="ghost" size="sm">
                                Use
                              </Button>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </div>
    </div>
  );
};

export default EnterpriseClientPortal;
