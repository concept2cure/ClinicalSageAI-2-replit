/**
 * Client Dashboard
 *
 * This component provides a dashboard overview for biotech clients
 * in the multi-tenant environment, showing key metrics and project information.
 */

import React, { useState, useEffect } from 'react';
import { useLocation, Link } from 'wouter';
import {
  FileText,
  FileCheck,
  Calendar,
  Clock,
  AlertTriangle,
  CheckCircle,
  BarChart2,
  Users,
  ExternalLink,
  ChevronRight,
  Bookmark,
} from 'lucide-react';
import securityService from '../../services/SecurityService';
import { useModuleIntegration } from '../integration/ModuleIntegrationLayer';

// Progress card component
const ProgressCard = ({ title, current, total, icon, color, onClick }) => {
  const percentage = total > 0 ? Math.round((current / total) * 100) : 0;

  return (
    <div
      className="bg-white rounded-lg shadow-sm border overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-center mb-3">
          <div
            className={`w-8 h-8 rounded-full ${color} flex items-center justify-center text-white`}
          >
            {icon}
          </div>
          <h3 className="ml-3 font-medium text-gray-800">{title}</h3>
        </div>

        <div className="flex items-baseline mb-2">
          <span className="text-2xl font-bold">{current}</span>
          <span className="text-gray-500 ml-1">/ {total}</span>
        </div>

        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className={`${color} h-2 rounded-full`} style={{ width: `${percentage}%` }}></div>
        </div>
      </div>
    </div>
  );
};

// Upcoming deadline card
const DeadlineCard = ({ deadline, onClick }) => {
  // Format date for display
  const formatDate = dateString => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  // Calculate days remaining
  const getDaysRemaining = dateString => {
    const deadline = new Date(dateString);
    const today = new Date();
    const diffTime = deadline - today;
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
  };

  const daysRemaining = getDaysRemaining(deadline.date);
  const isOverdue = daysRemaining < 0;
  const isNearDue = daysRemaining >= 0 && daysRemaining <= 7;

  return (
    <div
      className="bg-white rounded-lg shadow-sm border overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center ${
              isOverdue
                ? 'bg-red-100 text-red-500'
                : isNearDue
                  ? 'bg-yellow-100 text-yellow-500'
                  : 'bg-green-100 text-green-500'
            }`}
          >
            {isOverdue ? (
              <AlertTriangle size={20} />
            ) : isNearDue ? (
              <Clock size={20} />
            ) : (
              <Calendar size={20} />
            )}
          </div>

          <div className="ml-3 flex-1">
            <h3 className="font-medium text-gray-800">{deadline.title}</h3>
            <div className="flex items-center mt-1">
              <Calendar size={14} className="text-gray-400" />
              <span className="ml-1 text-sm text-gray-600">{formatDate(deadline.date)}</span>
            </div>

            <div
              className={`mt-2 text-sm font-medium ${
                isOverdue ? 'text-red-600' : isNearDue ? 'text-yellow-600' : 'text-green-600'
              }`}
            >
              {isOverdue
                ? `Overdue by ${Math.abs(daysRemaining)} day${Math.abs(daysRemaining) !== 1 ? 's' : ''}`
                : `${daysRemaining} day${daysRemaining !== 1 ? 's' : ''} remaining`}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Recent document card
const DocumentCard = ({ document, onClick }) => {
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
      const options = { month: 'short', day: 'numeric' };
      return date.toLocaleDateString(undefined, options);
    }
  };

  // Get document icon
  const getDocumentIcon = () => {
    switch (document.type) {
      case 'protocol':
        return <FileText size={16} className="text-blue-500" />;
      case 'report':
        return <FileCheck size={16} className="text-green-500" />;
      case 'form':
        return <Bookmark size={16} className="text-purple-500" />;
      default:
        return <FileText size={16} className="text-gray-500" />;
    }
  };

  return (
    <div
      className="flex items-center p-3 hover:bg-gray-50 cursor-pointer border-b last:border-b-0"
      onClick={onClick}
    >
      <div className="mr-3">{getDocumentIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-800 truncate">{document.name}</div>
        <div className="text-xs text-gray-500">{formatTimestamp(document.updatedAt)}</div>
      </div>
      <ChevronRight size={16} className="text-gray-400" />
    </div>
  );
};

// Quick action button
const QuickActionButton = ({ icon, title, onClick }) => {
  return (
    <button
      className="flex flex-col items-center justify-center p-4 border rounded-lg hover:bg-gray-50 transition-colors"
      onClick={onClick}
    >
      <div className="w-10 h-10 rounded-full bg-primary bg-opacity-10 flex items-center justify-center text-primary mb-2">
        {icon}
      </div>
      <span className="text-sm font-medium text-gray-700">{title}</span>
    </button>
  );
};

// Client Dashboard component
const ClientDashboard = () => {
  const [location, setLocation] = useLocation();
  const [metrics, setMetrics] = useState(null);
  const [deadlines, setDeadlines] = useState([]);
  const [recentDocuments, setRecentDocuments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const { getSharedContext } = useModuleIntegration();

  // Load dashboard data
  useEffect(() => {
    const loadDashboardData = async () => {
      try {
        setLoading(true);

        // In a real implementation, these would be API calls
        // Get basic metrics data
        const metricsData = {
          documents: {
            total: 156,
            complete: 89,
          },
          tasks: {
            total: 42,
            complete: 27,
          },
          milestones: {
            total: 12,
            complete: 5,
          },
          issues: {
            total: 18,
            resolved: 15,
          },
        };

        // Get upcoming deadlines
        const deadlinesData = [
          {
            id: 1,
            title: 'IND Application Submission',
            date: '2025-05-15',
            type: 'regulatory',
            project: 'BTX-331',
          },
          {
            id: 2,
            title: 'CSR Final Draft Review',
            date: '2025-05-10',
            type: 'document',
            project: 'BX-107',
          },
          {
            id: 3,
            title: 'Protocol Amendment Submission',
            date: '2025-06-05',
            type: 'regulatory',
            project: 'BTX-331',
          },
          {
            id: 4,
            title: 'Data Safety Monitoring Board Meeting',
            date: '2025-05-20',
            type: 'meeting',
            project: 'BX-107',
          },
        ];

        // Get recent documents
        const documentsData = [
          {
            id: 1,
            name: 'BTX-331 IND Application.docx',
            type: 'form',
            updatedAt: '2025-04-26T10:15:00Z',
            updatedBy: 'Sarah Johnson',
            module: 'ind-wizard',
          },
          {
            id: 2,
            name: 'BX-107 Clinical Study Report.pdf',
            type: 'report',
            updatedAt: '2025-04-25T14:30:00Z',
            updatedBy: 'Mark Wilson',
            module: 'csr-intelligence',
          },
          {
            id: 3,
            name: 'BTX-331 Protocol v2.0.docx',
            type: 'protocol',
            updatedAt: '2025-04-24T09:45:00Z',
            updatedBy: 'John Davis',
            module: 'study-architect',
          },
          {
            id: 4,
            name: 'Patient Recruitment Status Report.xlsx',
            type: 'report',
            updatedAt: '2025-04-23T16:20:00Z',
            updatedBy: 'Emily Chen',
            module: 'trial-vault',
          },
          {
            id: 5,
            name: 'BTX-331 Chemistry Data Package.zip',
            type: 'data',
            updatedAt: '2025-04-22T11:05:00Z',
            updatedBy: 'Michael Brown',
            module: 'ind-wizard',
          },
        ];

        setMetrics(metricsData);
        setDeadlines(deadlinesData);
        setRecentDocuments(documentsData);
        setLoading(false);
      } catch (err) {
        console.error('Error loading dashboard data:', err);
        setError('Failed to load dashboard data');
        setLoading(false);
      }
    };

    loadDashboardData();
  }, []);

  // Location is already defined at the component level
  // const [location, setLocation] = useLocation();

  // Navigate to document
  const navigateToDocument = document => {
    // In a real app, would navigate to document viewer
    console.log('Navigate to document:', document);
    const path = `/${document.module}/documents/${document.id}`;
    setLocation(path); // Using React Router navigation
  };

  // Navigate to deadline
  const navigateToDeadline = deadline => {
    // In a real app, would navigate to deadline details
    console.log('Navigate to deadline:', deadline);
    const path = `/deadlines/${deadline.id}`;
    setLocation(path); // Using React Router navigation
  };

  // Navigate based on metric type
  const navigateToMetric = metricType => {
    // In a real app, would navigate to appropriate section
    console.log('Navigate to metric:', metricType);
    const path = `/${metricType}`;
    setLocation(path); // Using React Router navigation
  };

  // Handle quick action
  const handleQuickAction = action => {
    // In a real app, would navigate to appropriate action
    console.log('Quick action:', action);
    const path = `/${action}`;
    setLocation(path); // Using React Router navigation
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin w-8 h-8 border-4 border-primary border-t-transparent rounded-full"></div>
        <span className="ml-3 text-gray-600">Loading dashboard...</span>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 m-4">
        <div className="flex items-center">
          <AlertTriangle size={24} className="text-red-500 mr-3" />
          <div>
            <h3 className="font-medium text-red-800">Error Loading Dashboard</h3>
            <p className="text-red-700">{error}</p>
          </div>
        </div>
        <button
          onClick={() => window.location.reload()}
          className="mt-3 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
        >
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {/* Welcome section */}
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-800 mb-1">
          Welcome to TrialSage Client Portal
        </h1>
        <p className="text-gray-600">
          Your centralized dashboard for regulatory document management and submissions
        </p>
      </div>

      {/* Quick actions */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Quick Actions</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          <QuickActionButton
            icon={<FileText size={20} />}
            title="New Document"
            onClick={() => handleQuickAction('new-document')}
          />
          <QuickActionButton
            icon={<FileCheck size={20} />}
            title="Submissions"
            onClick={() => handleQuickAction('submissions')}
          />
          <QuickActionButton
            icon={<Calendar size={20} />}
            title="Calendar"
            onClick={() => handleQuickAction('calendar')}
          />
          <QuickActionButton
            icon={<BarChart2 size={20} />}
            title="Reports"
            onClick={() => handleQuickAction('reports')}
          />
          <QuickActionButton
            icon={<Users size={20} />}
            title="Team"
            onClick={() => handleQuickAction('team')}
          />
          <QuickActionButton
            icon={<ExternalLink size={20} />}
            title="Regulatory Links"
            onClick={() => handleQuickAction('regulatory-links')}
          />
        </div>
      </div>

      {/* Metrics */}
      <div className="mb-8">
        <h2 className="text-lg font-semibold text-gray-800 mb-4">Overview</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <ProgressCard
            title="Documents"
            current={metrics.documents.complete}
            total={metrics.documents.total}
            icon={<FileText size={16} />}
            color="bg-blue-500"
            onClick={() => navigateToMetric('documents')}
          />
          <ProgressCard
            title="Tasks"
            current={metrics.tasks.complete}
            total={metrics.tasks.total}
            icon={<CheckCircle size={16} />}
            color="bg-green-500"
            onClick={() => navigateToMetric('tasks')}
          />
          <ProgressCard
            title="Milestones"
            current={metrics.milestones.complete}
            total={metrics.milestones.total}
            icon={<Calendar size={16} />}
            color="bg-purple-500"
            onClick={() => navigateToMetric('milestones')}
          />
          <ProgressCard
            title="Issues Resolved"
            current={metrics.issues.resolved}
            total={metrics.issues.total}
            icon={<AlertTriangle size={16} />}
            color="bg-yellow-500"
            onClick={() => navigateToMetric('issues')}
          />
        </div>
      </div>

      {/* Two column layout for deadlines and documents */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Upcoming deadlines */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Upcoming Deadlines</h2>
            <Link to="/deadlines">
              <button className="text-sm text-primary hover:underline flex items-center">
                View All
                <ChevronRight size={16} className="ml-1" />
              </button>
            </Link>
          </div>

          <div className="space-y-4">
            {deadlines.length === 0 ? (
              <div className="bg-white rounded-lg shadow-sm border p-4 text-center text-gray-500">
                No upcoming deadlines
              </div>
            ) : (
              deadlines
                .slice(0, 4)
                .map(deadline => (
                  <DeadlineCard
                    key={deadline.id}
                    deadline={deadline}
                    onClick={() => navigateToDeadline(deadline)}
                  />
                ))
            )}
          </div>
        </div>

        {/* Recent documents */}
        <div>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-lg font-semibold text-gray-800">Recent Documents</h2>
            <Link to="/documents">
              <button className="text-sm text-primary hover:underline flex items-center">
                View All
                <ChevronRight size={16} className="ml-1" />
              </button>
            </Link>
          </div>

          <div className="bg-white rounded-lg shadow-sm border overflow-hidden">
            {recentDocuments.length === 0 ? (
              <div className="p-4 text-center text-gray-500">No recent documents</div>
            ) : (
              recentDocuments.map(document => (
                <DocumentCard
                  key={document.id}
                  document={document}
                  onClick={() => navigateToDocument(document)}
                />
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default ClientDashboard;
