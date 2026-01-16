import React, { useState } from 'react';
import { BarChart3, BookOpen, Calendar, CheckCircle, ClipboardList, FileText, FileWarning, Layers, SlidersHorizontal, Users, FileCheck, ArrowRight, Clock, ListTodo, BookText, Database, Shield, PieChart, ArrowUpRight, FlaskConical, BarChart, Bell, Plus, Pen, Brain, PlusCircle } from 'lucide-react'
import { useIntegration } from '../integration/ModuleIntegrationLayer';
import { Link } from 'wouter';

const DashboardModule = () => {
  const { data, blockchainStatus, addAuditEntry } = useIntegration();
  const [dateRange, setDateRange] = useState('month');

  const handleDateRangeChange = range => {
    setDateRange(range);
    addAuditEntry('dashboard_date_range_changed', { range });
  };

  // Dashboard stats
  const stats = [
    {
      name: 'Active Studies',
      value: '14',
      icon: <FlaskConical size={24} className="text-blue-500" />,
      trend: '+2 this month',
    },
    {
      name: 'Documents Stored',
      value: '3,842',
      icon: <Database size={24} className="text-purple-500" />,
      trend: '+210 this month',
    },
    {
      name: 'CSRs Generated',
      value: '26',
      icon: <FileText size={24} className="text-pink-500" />,
      trend: '+5 this month',
    },
    {
      name: 'Verified Documents',
      value: '3,651',
      icon: <Shield size={24} className="text-green-500" />,
      trend: '95% of total',
    },
  ];

  // Recent activities
  const recentActivities = [
    {
      id: 'act1',
      user: 'John Smith',
      action: 'uploaded',
      item: 'Phase 2 Protocol Amendment',
      timestamp: '2025-03-15T13:45:22Z',
      module: 'Vault',
    },
    {
      id: 'act2',
      user: 'Sarah Johnson',
      action: 'generated',
      item: 'Final CSR for XYZ-123 Study',
      timestamp: '2025-03-15T10:20:15Z',
      module: 'CSR Intelligence',
    },
    {
      id: 'act3',
      user: 'Michael Chen',
      action: 'created',
      item: 'New Phase 1 Protocol',
      timestamp: '2025-03-14T16:30:05Z',
      module: 'Study Architect',
    },
    {
      id: 'act4',
      user: 'Lisa Rodriguez',
      action: 'edited',
      item: 'Site Feasibility Questionnaire',
      timestamp: '2025-03-14T15:15:33Z',
      module: 'Study Architect',
    },
    {
      id: 'act5',
      user: 'AI Assistant',
      action: 'analyzed',
      item: 'Phase 3 Protocol Compliance',
      timestamp: '2025-03-14T11:05:47Z',
      module: 'Study Architect',
    },
  ];

  // Upcoming tasks
  const upcomingTasks = [
    {
      id: 'task1',
      title: 'Review Phase 2 CSR Draft',
      dueDate: '2025-03-18T00:00:00Z',
      priority: 'High',
      assignedTo: 'John Smith',
    },
    {
      id: 'task2',
      title: 'Submit FDA Form 1572 for Study XYZ-123',
      dueDate: '2025-03-20T00:00:00Z',
      priority: 'Medium',
      assignedTo: 'Sarah Johnson',
    },
    {
      id: 'task3',
      title: 'Finalize Protocol for ABC-456 Study',
      dueDate: '2025-03-25T00:00:00Z',
      priority: 'High',
      assignedTo: 'Michael Chen',
    },
  ];

  // Recent regulatory guidance updates
  const regulatoryUpdates = [
    {
      id: 'reg1',
      title: 'FDA Guidance for COVID-19 Trial Conduct',
      agency: 'FDA',
      date: '2025-03-10T00:00:00Z',
      type: 'Draft Guidance',
    },
    {
      id: 'reg2',
      title: 'EMA Update on Real-World Evidence Requirements',
      agency: 'EMA',
      date: '2025-03-07T00:00:00Z',
      type: 'Final Guidance',
    },
    {
      id: 'reg3',
      title: 'ICH E6(R3) Good Clinical Practice Update',
      agency: 'ICH',
      date: '2025-03-05T00:00:00Z',
      type: 'Draft Revision',
    },
  ];

  // Study status
  const studyStatusData = [
    { name: 'Planning', count: 3 },
    { name: 'Startup', count: 2 },
    { name: 'Enrolling', count: 5 },
    { name: 'Ongoing', count: 4 },
    { name: 'Reporting', count: 3 },
    { name: 'Closed', count: 7 },
  ];

  const formatDate = dateString => {
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const formatDateTime = dateString => {
    const options = {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    };
    return new Date(dateString).toLocaleDateString(undefined, options);
  };

  const getRelativeTime = dateString => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInSeconds = Math.floor((now - date) / 1000);

    if (diffInSeconds < 60) {
      return 'Just now';
    } else if (diffInSeconds < 3600) {
      const minutes = Math.floor(diffInSeconds / 60);
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 86400) {
      const hours = Math.floor(diffInSeconds / 3600);
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (diffInSeconds < 2592000) {
      const days = Math.floor(diffInSeconds / 86400);
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else {
      return formatDate(dateString);
    }
  };

  const getModuleColor = module => {
    switch (module) {
      case 'Vault':
        return 'bg-purple-100 text-purple-800';
      case 'CSR Intelligence':
        return 'bg-pink-100 text-pink-800';
      case 'Study Architect':
        return 'bg-blue-100 text-blue-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getPriorityColor = priority => {
    switch (priority) {
      case 'High':
        return 'bg-red-100 text-red-800';
      case 'Medium':
        return 'bg-yellow-100 text-yellow-800';
      case 'Low':
        return 'bg-green-100 text-green-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  return (
    <div className="flex flex-col">
      <div className="mb-6">
        <h1 className="text-2xl font-bold mb-2">Dashboard</h1>
        <p className="text-gray-600">
          Overview of your TrialSage platform activity and regulatory operations
        </p>
      </div>

      {/* Filters and date range selector */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-2">
        <div>
          <div className="inline-flex rounded-md shadow-sm" role="group">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-l-lg ${
                dateRange === 'week'
                  ? 'bg-pink-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border border-gray-200`}
              onClick={() => handleDateRangeChange('week')}
            >
              Week
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium ${
                dateRange === 'month'
                  ? 'bg-pink-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border-t border-b border-gray-200`}
              onClick={() => handleDateRangeChange('month')}
            >
              Month
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium rounded-r-lg ${
                dateRange === 'quarter'
                  ? 'bg-pink-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              } border border-gray-200`}
              onClick={() => handleDateRangeChange('quarter')}
            >
              Quarter
            </button>
          </div>
        </div>

        <button className="text-sm flex items-center text-gray-700 hover:text-gray-900">
          <SlidersHorizontal size={16} className="mr-1" />
          Customize Dashboard
        </button>
      </div>

      {/* Stats Section */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {stats.map((stat, index) => (
          <div key={index} className="bg-white p-5 rounded-lg border border-gray-200">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm text-gray-500">{stat.name}</p>
                <p className="text-2xl font-semibold mt-1">{stat.value}</p>
                <p className="text-xs text-gray-500 mt-1">{stat.trend}</p>
              </div>
              <div className="p-2 rounded-lg bg-gray-50">{stat.icon}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Main dashboard content - 2 columns on large screens */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left column */}
        <div className="lg:col-span-2 space-y-6">
          {/* Recent Activity */}
          <div className="bg-white p-5 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Recent Activity</h2>
              <Link href="#" className="text-sm text-pink-600 hover:underline flex items-center">
                View All <ArrowRight size={14} className="ml-1" />
              </Link>
            </div>

            <div className="space-y-4">
              {recentActivities.map(activity => (
                <div key={activity.id} className="flex items-start gap-4">
                  <div className="rounded-full h-9 w-9 flex items-center justify-center bg-gray-100 shrink-0 mt-1">
                    {activity.action === 'uploaded' && (
                      <FileCheck size={18} className="text-gray-600" />
                    )}
                    {activity.action === 'generated' && (
                      <FileText size={18} className="text-gray-600" />
                    )}
                    {activity.action === 'created' && (
                      <PlusCircle size={18} className="text-gray-600" />
                    )}
                    {activity.action === 'edited' && <Pen size={18} className="text-gray-600" />}
                    {activity.action === 'analyzed' && (
                      <Brain size={18} className="text-gray-600" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-1">
                      <p className="text-sm">
                        <span className="font-medium">{activity.user}</span>
                        <span className="text-gray-500"> {activity.action} </span>
                        <span className="font-medium">{activity.item}</span>
                      </p>
                      <span className="text-xs text-gray-500 whitespace-nowrap">
                        {getRelativeTime(activity.timestamp)}
                      </span>
                    </div>
                    <div className="mt-1">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getModuleColor(activity.module)}`}
                      >
                        {activity.module}
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Study Status Chart */}
          <div className="bg-white p-5 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Study Status Overview</h2>
              <div className="flex gap-2">
                <button className="text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-1 rounded">
                  By Phase
                </button>
                <button className="text-xs bg-pink-100 text-pink-700 px-2 py-1 rounded">
                  By Status
                </button>
              </div>
            </div>

            <div className="h-64 flex items-center justify-center">
              {/* This would be a real chart in the actual implementation */}
              <div className="w-full flex items-end justify-between h-48 px-4">
                {studyStatusData.map((item, index) => (
                  <div key={index} className="flex flex-col items-center">
                    <div
                      className="w-12 bg-pink-500 rounded-t-md transition-all duration-500 ease-in-out hover:bg-pink-600"
                      style={{ height: `${item.count * 20}px` }}
                    ></div>
                    <div className="mt-2 text-xs text-gray-600">{item.name}</div>
                    <div className="text-sm font-medium">{item.count}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Right column */}
        <div className="space-y-6">
          {/* Upcoming Tasks */}
          <div className="bg-white p-5 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Upcoming Tasks</h2>
              <button className="text-sm text-pink-600 hover:underline flex items-center">
                <ListTodo size={14} className="mr-1" />
                Task Manager
              </button>
            </div>

            <div className="space-y-3">
              {upcomingTasks.map(task => (
                <div key={task.id} className="border border-gray-200 rounded-md p-3">
                  <div className="flex items-start justify-between">
                    <h3 className="font-medium text-sm">{task.title}</h3>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getPriorityColor(task.priority)}`}
                    >
                      {task.priority}
                    </span>
                  </div>
                  <div className="mt-2 flex justify-between items-center text-xs text-gray-500">
                    <div className="flex items-center">
                      <Clock size={12} className="mr-1" />
                      Due: {formatDate(task.dueDate)}
                    </div>
                    <div>Assigned to: {task.assignedTo}</div>
                  </div>
                </div>
              ))}
            </div>

            <button className="w-full mt-3 border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 py-2 rounded-md text-sm font-medium flex items-center justify-center">
              <Plus size={14} className="mr-1" />
              Add New Task
            </button>
          </div>

          {/* Regulatory Updates */}
          <div className="bg-white p-5 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-medium">Regulatory Updates</h2>
              <button className="text-sm text-pink-600 hover:underline flex items-center">
                <BookText size={14} className="mr-1" />
                ICH Wiz
              </button>
            </div>

            <div className="space-y-3">
              {regulatoryUpdates.map(update => (
                <div key={update.id} className="p-3 border-l-2 border-blue-500 bg-blue-50">
                  <h3 className="font-medium text-sm">{update.title}</h3>
                  <div className="mt-1 flex justify-between items-center text-xs">
                    <span className="text-blue-700">{update.agency}</span>
                    <span className="text-gray-500">{formatDate(update.date)}</span>
                  </div>
                  <div className="mt-1 text-xs text-gray-600">{update.type}</div>
                </div>
              ))}
            </div>

            <button className="w-full mt-3 text-blue-600 hover:bg-blue-50 border border-blue-200 py-2 rounded-md text-sm font-medium flex items-center justify-center">
              View All Updates
            </button>
          </div>

          {/* Blockchain Status */}
          <div className="bg-white p-5 rounded-lg border border-gray-200">
            <div className="flex justify-between items-center mb-3">
              <h2 className="text-lg font-medium">Blockchain Status</h2>
              <span
                className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                  blockchainStatus.verified
                    ? 'bg-green-100 text-green-800'
                    : 'bg-yellow-100 text-yellow-800'
                }`}
              >
                {blockchainStatus.verified ? 'Operational' : 'Verification Needed'}
              </span>
            </div>

            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-md mb-3">
              <div className="flex items-center">
                <Shield size={16} className="text-green-600 mr-2" />
                <span className="text-sm font-medium">Document Integrity</span>
              </div>
              <span className="text-sm">95% Verified</span>
            </div>

            <div className="text-xs text-gray-500 flex items-center">
              <Clock size={12} className="mr-1" />
              <span>
                Last verified: {new Date(blockchainStatus.lastVerified).toLocaleTimeString()}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardModule;
