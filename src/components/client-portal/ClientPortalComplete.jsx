/**
 * Client Portal - Enterprise Edition
 *
 * This component provides a unified central hub for biotech clients, integrating
 * all activities across modules with seamless navigation and a global project manager.
 *
 * REBUILT: May 10, 2025 - Unified Client Experience Edition
 *
 * Features:
 * - Global project management across all modules
 * - Activity aggregation from all platform services
 * - Multi-organization support with seamless switching
 * - Real-time data synchronization with SecurityService
 * - Enhanced error resilience and recovery
 * - Adaptive cross-module navigation
 * - Integrated stability monitoring
 */

import React, { useState, useEffect, useCallback } from 'react';
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
} from 'lucide-react';
import securityService from '../../services/SecurityService';
import { useModuleIntegration } from '../integration/ModuleIntegrationLayer';
import { useToast } from '@/hooks/use-toast';
import ProjectManagerGrid from '../project-manager/ProjectManagerGrid';
import VaultQuickAccess from '../VaultQuickAccess';
import AnalyticsQuickView from '../AnalyticsQuickView';
import NextActionsSidebar from '../NextActionsSidebar';
import ReportsQuickWidget from '../ReportsQuickWidget';

// Client Portal dashboard component
const ClientPortal = () => {
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
      },
      {
        id: 2,
        name: 'IND Application for BTX-331',
        status: 'in_progress',
        module: 'ind-wizard',
        progress: 42,
        dueDate: '2025-05-30',
      },
      {
        id: 3,
        name: 'Clinical Study Report - Phase I',
        status: 'pending_review',
        module: 'csr-intelligence',
        progress: 95,
        dueDate: '2025-05-10',
      },
      {
        id: 4,
        name: 'Study Protocol Development',
        status: 'not_started',
        module: 'study-architect',
        progress: 0,
        dueDate: '2025-07-21',
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
        };
      case 'in_progress':
        return {
          icon: <Clock size={16} className="text-blue-500" />,
          text: 'In Progress',
          className: 'text-blue-600',
        };
      case 'pending_review':
        return {
          icon: <AlertCircle size={16} className="text-yellow-500" />,
          text: 'Pending Review',
          className: 'text-yellow-600',
        };
      case 'not_started':
        return {
          icon: <Calendar size={16} className="text-gray-500" />,
          text: 'Not Started',
          className: 'text-gray-600',
        };
      default:
        return {
          icon: <Clock size={16} className="text-gray-500" />,
          text: 'Unknown',
          className: 'text-gray-600',
        };
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
      {/* Client Portal Header */}
      <div className="bg-white border-b shadow-sm">
        <div className="container mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center">
              {parentOrganization && (
                <button
                  onClick={handleReturnToCRO}
                  className="mr-4 flex items-center text-sm text-gray-600 hover:text-gray-900"
                >
                  <ArrowLeft size={16} className="mr-1" />
                  Return to {parentOrganization.name}
                </button>
              )}

              <div className="flex items-center">
                <Building className="text-primary mr-2" size={20} />
                <span className="font-medium text-lg">
                  {currentOrganization?.name || 'Client Portal'}
                </span>
                <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                  {currentOrganization?.type?.toUpperCase() || 'CLIENT'}
                </span>
              </div>
            </div>

            <div className="flex items-center space-x-4">
              <Link
                to="/ind-wizard"
                className="text-sm text-primary hover:underline flex items-center"
              >
                <FileText size={16} className="mr-1" />
                IND Wizard
              </Link>
              <Link
                to="/regulatory-submissions"
                className="text-sm text-primary hover:underline flex items-center"
              >
                <ClipboardList size={16} className="mr-1" />
                Submissions
              </Link>
              <Link
                to="/study-architect"
                className="text-sm text-primary hover:underline flex items-center"
              >
                <Beaker size={16} className="mr-1" />
                Study Architect
              </Link>
              <Link to="/vault" className="text-sm text-primary hover:underline flex items-center">
                <Database size={16} className="mr-1" />
                Vault
              </Link>
            </div>

            <form onSubmit={handleSearch} className="relative max-w-xs w-full">
              <input
                type="text"
                placeholder="Search client portal..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-primary/50"
              />
              <button type="submit" className="absolute inset-y-0 left-0 pl-3 flex items-center">
                <Search size={16} className="text-gray-500" />
              </button>
            </form>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="container mx-auto px-4 pt-2">
          <div className="flex border-b">
            <button
              className={`px-4 py-2 border-b-2 font-medium ${
                activeTab === 'dashboard'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('dashboard')}
            >
              Dashboard
            </button>
            <button
              className={`px-4 py-2 border-b-2 font-medium ${
                activeTab === 'projects'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('projects')}
            >
              Projects
            </button>
            <button
              className={`px-4 py-2 border-b-2 font-medium ${
                activeTab === 'documents'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('documents')}
            >
              Documents
            </button>
            <button
              className={`px-4 py-2 border-b-2 font-medium ${
                activeTab === 'analytics'
                  ? 'border-primary text-primary'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
              onClick={() => setActiveTab('analytics')}
            >
              Analytics
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="container mx-auto px-4 py-6">
        {/* Welcome Banner with Organization Info */}
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-xl p-6 mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-800">
                Welcome to {currentOrganization?.name || 'TrialSage'}
              </h1>
              <p className="text-gray-600 mt-1">
                Your unified portal for managing clinical and regulatory projects across all modules
              </p>
            </div>
            <div className="flex space-x-4">
              <button
                onClick={() => setLocation('/projects/new')}
                className="px-4 py-2 bg-primary text-white rounded-md hover:bg-primary/90 flex items-center"
              >
                <Plus size={16} className="mr-2" />
                New Project
              </button>
              <button
                onClick={() => loadOrganizationData()}
                className="px-4 py-2 bg-white border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 flex items-center"
              >
                <RefreshCw size={16} className="mr-2" />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {/* Loading State */}
        {loading && (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary"></div>
            <span className="ml-3 text-gray-600">Loading client data...</span>
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

        {/* Main Dashboard Layout - 3 column grid */}
        {!loading && !error && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Left Sidebar - Quick Navigation */}
            <div className="lg:col-span-1">
              <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
                <h3 className="font-medium text-gray-800 mb-3 flex items-center">
                  <Folder size={18} className="text-primary mr-2" />
                  Module Quick Access
                </h3>
                <div className="space-y-2">
                  <Link
                    to="/ind-wizard"
                    className="flex items-center p-2 rounded-md hover:bg-gray-50"
                  >
                    <FileText size={16} className="text-primary mr-2" />
                    <span>IND Wizard</span>
                  </Link>
                  <Link
                    to="/csr-intelligence"
                    className="flex items-center p-2 rounded-md hover:bg-gray-50"
                  >
                    <BookMarked size={16} className="text-purple-500 mr-2" />
                    <span>CSR Intelligence</span>
                  </Link>
                  <Link
                    to="/trial-vault"
                    className="flex items-center p-2 rounded-md hover:bg-gray-50"
                  >
                    <Database size={16} className="text-blue-500 mr-2" />
                    <span>Trial Vault</span>
                  </Link>
                  <Link
                    to="/study-architect"
                    className="flex items-center p-2 rounded-md hover:bg-gray-50"
                  >
                    <Beaker size={16} className="text-green-500 mr-2" />
                    <span>Study Architect</span>
                  </Link>
                  <Link
                    to="/analytics"
                    className="flex items-center p-2 rounded-md hover:bg-gray-50"
                  >
                    <BarChartHorizontal size={16} className="text-amber-500 mr-2" />
                    <span>Analytics</span>
                  </Link>
                </div>
              </div>

              {/* Next Actions Sidebar */}
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-medium text-gray-800 mb-3 flex items-center">
                  <Clock size={18} className="text-primary mr-2" />
                  Next Actions
                </h3>
                <div className="space-y-1">
                  {activities.slice(0, 3).map(activity => (
                    <div key={activity.id} className="p-2 hover:bg-gray-50 rounded-md">
                      <div className="flex items-start">
                        <div className="rounded-full h-8 w-8 bg-primary/10 flex items-center justify-center mt-0.5">
                          {getModuleIcon(activity.module)}
                        </div>
                        <div className="ml-3">
                          <div className="text-sm font-medium">{activity.description}</div>
                          <div className="text-xs text-gray-500 mt-0.5 flex items-center">
                            <Clock size={12} className="mr-1" />
                            {formatTimestamp(activity.timestamp)}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                  <Link
                    to="/activities"
                    className="text-primary hover:underline text-sm flex items-center justify-end pt-2"
                  >
                    View All Activities
                    <ChevronRight className="h-3 w-3 ml-1" />
                  </Link>
                </div>
              </div>
            </div>

            {/* Center Content - Global Project Manager */}
            <div className="lg:col-span-2">
              <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold flex items-center">
                    <Briefcase size={20} className="text-primary mr-2" />
                    Global Project Manager
                  </h2>
                  <Link
                    to="/projects"
                    className="text-sm text-primary hover:underline flex items-center"
                  >
                    View All Projects
                    <ArrowUpRight className="ml-1 h-4 w-4" />
                  </Link>
                </div>

                {/* Project Manager Grid Component */}
                <ProjectManagerGrid
                  userId={securityService.currentUser?.id}
                  orgId={currentOrganization.id}
                  onProjectSelect={projectId => setLocation(`/projects/${projectId}`)}
                />
              </div>

              {/* Recent Documents */}
              <div className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-xl font-semibold flex items-center">
                    <FileText size={20} className="text-primary mr-2" />
                    Recent Documents
                  </h2>
                  <Link
                    to="/documents"
                    className="text-sm text-primary hover:underline flex items-center"
                  >
                    View All Documents
                    <ArrowUpRight className="ml-1 h-4 w-4" />
                  </Link>
                </div>

                <div className="divide-y">
                  {documents.map(doc => (
                    <div
                      key={doc.id}
                      className="py-3 flex items-center hover:bg-gray-50 px-2 cursor-pointer"
                      onClick={() => setLocation(`/${doc.module}/documents/${doc.id}`)}
                    >
                      <div className="rounded-full h-8 w-8 bg-primary/10 flex items-center justify-center">
                        {getModuleIcon(doc.module)}
                      </div>
                      <div className="ml-3 flex-1">
                        <div className="text-sm font-medium">{doc.name}</div>
                        <div className="text-xs text-gray-500 flex items-center mt-0.5">
                          <span className="mr-2">Updated {formatTimestamp(doc.updatedAt)}</span>
                          <span className="flex items-center">
                            <Users size={12} className="mr-1" />
                            {doc.updatedBy}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-4 w-4 text-gray-400" />
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Right Sidebar - Analytics and Vault Quick Access */}
            <div className="lg:col-span-1">
              {/* Analytics Quick View */}
              <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
                <h3 className="font-medium text-gray-800 mb-3 flex items-center">
                  <BarChart2 size={18} className="text-primary mr-2" />
                  Analytics Snapshot
                </h3>
                <AnalyticsQuickView
                  orgId={currentOrganization.id}
                  onViewDetails={() => setLocation('/analytics')}
                />
              </div>

              {/* Vault Quick Access */}
              <div className="bg-white rounded-xl shadow-sm p-4">
                <h3 className="font-medium text-gray-800 mb-3 flex items-center">
                  <Database size={18} className="text-primary mr-2" />
                  Vault Quick Access
                </h3>
                <VaultQuickAccess
                  orgId={currentOrganization.id}
                  onViewDocument={docId => setLocation(`/vault/documents/${docId}`)}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ClientPortal;
