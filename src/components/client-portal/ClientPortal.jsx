/**
 * Client Portal
 *
 * This component provides the main interface for biotech clients
 * when accessed through a CRO master account in a multi-tenant environment.
 */

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import securityService from '../../services/SecurityService';
import { useModuleIntegration } from '../integration/ModuleIntegrationLayer';

// Client Portal dashboard component
const ClientPortal = () => {
  const [location, setLocation] = useLocation();
  const [clientOrganization, setClientOrganization] = useState(null);
  const [parentOrganization, setParentOrganization] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [projects, setProjects] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [activities, setActivities] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const { getSharedContext, shareContext } = useModuleIntegration();

  // Fetch client data on mount
  useEffect(() => {
    const initClientPortal = async () => {
      try {
        // Get organization data
        const org = securityService.currentOrganization;
        const parentOrg = securityService.parentOrganization;

        if (!org) {
          throw new Error('No organization data available');
        }

        setClientOrganization(org);
        setParentOrganization(parentOrg);

        // Get shared context from integration layer
        const portalContext = getSharedContext('client_portal');

        // In a real app, these would be API calls
        // Fetch projects
        const projectList = await fetchProjects(org.id);
        setProjects(projectList);

        // Fetch recent documents
        const docList = await fetchDocuments(org.id);
        setDocuments(docList);

        // Fetch recent activities
        const activityList = await fetchActivities(org.id);
        setActivities(activityList);

        // Share client context with other modules
        shareContext('organization', org.id, {
          organization: org,
          parentOrganization: parentOrg,
        });

        setLoading(false);
      } catch (err) {
        console.error('Error initializing client portal:', err);
        setError(err.message);
        setLoading(false);
      }
    };

    initClientPortal();
  }, [getSharedContext, shareContext]);

  // Handle return to CRO portal
  const handleReturnToCRO = async () => {
    try {
      const result = await securityService.returnToParentOrganization();

      if (result.success) {
        // Redirect to CRO dashboard (admin)
        window.location.href = '/admin'; // Using window.location for immediate navigation
      } else {
        setError(result.error || 'Failed to return to CRO portal');
      }
    } catch (err) {
      console.error('Error returning to CRO portal:', err);
      setError(err.message);
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

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center">
          <div className="inline-block animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full mb-4"></div>
          <p className="text-gray-600">Loading client portal...</p>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <div className="text-center max-w-md p-6 bg-white rounded-lg shadow-md">
          <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
          <h2 className="text-xl font-semibold text-gray-800 mb-2">Error Loading Portal</h2>
          <p className="text-gray-600 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-primary text-white rounded hover:bg-opacity-90"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

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
                  {clientOrganization?.name || 'Client Portal'}
                </span>
                <span className="ml-2 bg-blue-100 text-blue-800 text-xs px-2 py-0.5 rounded">
                  {clientOrganization?.type?.toUpperCase() || 'CLIENT'}
                </span>
              </div>
            </div>

            <form onSubmit={handleSearch} className="relative max-w-xs w-full">
              <input
                type="text"
                placeholder="Search client portal..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 text-sm border rounded-lg focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary"
              />
              <Search size={16} className="absolute top-2.5 left-3 text-gray-400" />
            </form>
          </div>
        </div>
      </div>

      {/* Client Portal Content */}
      <div className="container mx-auto px-4 py-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Projects Column */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-800">Active Projects</h2>
            </div>
            <div className="divide-y">
              {projects.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No active projects found</div>
              ) : (
                projects.map(project => (
                  <div key={project.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start">
                      {getModuleIcon(project.module)}
                      <div className="ml-3 flex-1">
                        <div className="font-medium text-gray-800">{project.name}</div>
                        <div className="flex items-center mt-2 text-xs text-gray-500">
                          {getStatusDisplay(project.status).icon}
                          <span className={`ml-1 ${getStatusDisplay(project.status).className}`}>
                            {getStatusDisplay(project.status).text}
                          </span>
                          <span className="mx-2">•</span>
                          <span>Due {formatDate(project.dueDate)}</span>
                        </div>

                        {/* Progress bar */}
                        <div className="mt-2 w-full bg-gray-200 rounded-full h-2">
                          <div
                            className="bg-primary h-2 rounded-full"
                            style={{ width: `${project.progress}%` }}
                          ></div>
                        </div>
                        <div className="mt-1 text-xs text-right text-gray-500">
                          {project.progress}% complete
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 text-center">
              <Link to="/projects">
                <button className="text-sm text-primary hover:underline">View All Projects</button>
              </Link>
            </div>
          </div>

          {/* Recent Documents Column */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-800">Recent Documents</h2>
            </div>
            <div className="divide-y">
              {documents.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No recent documents found</div>
              ) : (
                documents.map(doc => (
                  <div key={doc.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start">
                      {getModuleIcon(doc.module)}
                      <div className="ml-3 flex-1">
                        <div className="font-medium text-gray-800">{doc.name}</div>
                        <div className="flex items-center mt-1 text-xs text-gray-500">
                          <span className="capitalize">{doc.type}</span>
                          <span className="mx-2">•</span>
                          <span>Updated {formatTimestamp(doc.updatedAt)}</span>
                        </div>
                        <div className="mt-1 text-xs text-gray-500">Updated by {doc.updatedBy}</div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 text-center">
              <Link to="/documents">
                <button className="text-sm text-primary hover:underline">View All Documents</button>
              </Link>
            </div>
          </div>

          {/* Recent Activity Column */}
          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            <div className="px-4 py-3 border-b bg-gray-50">
              <h2 className="font-semibold text-gray-800">Recent Activity</h2>
            </div>
            <div className="divide-y">
              {activities.length === 0 ? (
                <div className="p-4 text-center text-gray-500">No recent activity found</div>
              ) : (
                activities.map(activity => (
                  <div key={activity.id} className="p-4 hover:bg-gray-50">
                    <div className="flex items-start">
                      {getModuleIcon(activity.module)}
                      <div className="ml-3 flex-1">
                        <div className="font-medium text-gray-800">{activity.description}</div>
                        <div className="flex items-center mt-1 text-xs text-gray-500">
                          <span>{activity.user}</span>
                          <span className="mx-2">•</span>
                          <span>{formatTimestamp(activity.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="px-4 py-3 border-t bg-gray-50 text-center">
              <Link to="/activity">
                <button className="text-sm text-primary hover:underline">View All Activity</button>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientPortal;
