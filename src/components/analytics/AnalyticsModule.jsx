/**
 * Analytics Module Component
 *
 * This component provides analytics and reporting tools for the TrialSage platform,
 * allowing users to visualize and analyze regulatory data.
 */

import React, { useState } from 'react';
import {
  BarChart3,
  PieChart,
  LineChart,
  Calendar,
  Download,
  Filter,
  FileText,
  Search,
  RefreshCw,
} from 'lucide-react';
import { useIntegration } from '../integration/ModuleIntegrationLayer';

const AnalyticsModule = () => {
  const { regulatoryIntelligenceCore } = useIntegration();
  const [activeTab, setActiveTab] = useState('overview');
  const [dateRange, setDateRange] = useState('30days');
  const [searchQuery, setSearchQuery] = useState('');

  // Tabs configuration
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'submissions', label: 'Submission Analytics' },
    { id: 'regulatory', label: 'Regulatory Updates' },
    { id: 'compliance', label: 'Compliance Metrics' },
  ];

  // Date range options
  const dateRanges = [
    { id: '7days', label: 'Last 7 Days' },
    { id: '30days', label: 'Last 30 Days' },
    { id: '90days', label: 'Last Quarter' },
    { id: '365days', label: 'Last Year' },
    { id: 'custom', label: 'Custom Range' },
  ];

  // Handle tab change
  const handleTabChange = tabId => {
    setActiveTab(tabId);
  };

  // Handle date range change
  const handleDateRangeChange = e => {
    setDateRange(e.target.value);
  };

  // Handle search input change
  const handleSearchChange = e => {
    setSearchQuery(e.target.value);
  };

  // Handle refresh analytics
  const handleRefresh = () => {
    console.log('Refreshing analytics data...');
    // In a real app, this would refetch analytics data
  };

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return renderOverview();
      case 'submissions':
        return renderSubmissions();
      case 'regulatory':
        return renderRegulatory();
      case 'compliance':
        return renderCompliance();
      default:
        return renderOverview();
    }
  };

  // Overview tab content
  const renderOverview = () => {
    return (
      <div className="space-y-6">
        {/* Key metrics */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white rounded-lg shadow p-4 border">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium text-gray-700">Submissions</h3>
              <FileText className="h-5 w-5 text-blue-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">15</div>
            <div className="text-xs text-green-600">+23% vs. last period</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium text-gray-700">Regulatory Changes</h3>
              <RefreshCw className="h-5 w-5 text-amber-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">32</div>
            <div className="text-xs text-red-600">+8% vs. last period</div>
          </div>

          <div className="bg-white rounded-lg shadow p-4 border">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-sm font-medium text-gray-700">Compliance Score</h3>
              <PieChart className="h-5 w-5 text-green-500" />
            </div>
            <div className="text-2xl font-bold text-gray-900 mb-1">94%</div>
            <div className="text-xs text-green-600">+3% vs. last period</div>
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Submission Trends */}
          <div className="bg-white rounded-lg shadow border">
            <div className="p-4 border-b">
              <h3 className="font-medium">Submission Trends</h3>
            </div>
            <div className="p-4 h-64 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <BarChart3 className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p>Chart visualization would appear here</p>
                <p className="text-sm mt-2">Monthly submission metrics across organization</p>
              </div>
            </div>
          </div>

          {/* Regulatory Impact */}
          <div className="bg-white rounded-lg shadow border">
            <div className="p-4 border-b">
              <h3 className="font-medium">Regulatory Impact</h3>
            </div>
            <div className="p-4 h-64 flex items-center justify-center">
              <div className="text-center text-gray-500">
                <LineChart className="h-12 w-12 mx-auto text-gray-300 mb-3" />
                <p>Chart visualization would appear here</p>
                <p className="text-sm mt-2">Impact of regulatory changes on timelines</p>
              </div>
            </div>
          </div>
        </div>

        {/* Recent Analytics Reports */}
        <div className="bg-white rounded-lg shadow border">
          <div className="p-4 border-b">
            <h3 className="font-medium">Recent Analytics Reports</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Report Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Generated
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Author
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                <tr>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">Q1 2025 IND Metrics</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">Quarterly</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">Apr 15, 2025</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">John Smith</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <a href="#" className="text-primary hover:text-primary-dark">
                      <Download className="h-4 w-4" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">
                      Protocol Change Analysis
                    </div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">Ad-hoc</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">Apr 10, 2025</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">Jane Doe</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <a href="#" className="text-primary hover:text-primary-dark">
                      <Download className="h-4 w-4" />
                    </a>
                  </td>
                </tr>
                <tr>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">FDA Submission Tracking</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">Monthly</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">Apr 2, 2025</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap">
                    <div className="text-sm text-gray-500">Robert Chen</div>
                  </td>
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <a href="#" className="text-primary hover:text-primary-dark">
                      <Download className="h-4 w-4" />
                    </a>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  };

  // Submissions tab content (placeholder)
  const renderSubmissions = () => {
    return (
      <div className="bg-white rounded-lg shadow border p-6">
        <h3 className="text-lg font-medium mb-4">Submission Analytics</h3>
        <p className="text-gray-500">
          This tab will provide detailed analytics on regulatory submissions.
        </p>
      </div>
    );
  };

  // Regulatory tab content (placeholder)
  const renderRegulatory = () => {
    return (
      <div className="bg-white rounded-lg shadow border p-6">
        <h3 className="text-lg font-medium mb-4">Regulatory Updates Analytics</h3>
        <p className="text-gray-500">
          This tab will provide analytics on regulatory guidance changes and impacts.
        </p>
      </div>
    );
  };

  // Compliance tab content (placeholder)
  const renderCompliance = () => {
    return (
      <div className="bg-white rounded-lg shadow border p-6">
        <h3 className="text-lg font-medium mb-4">Compliance Metrics</h3>
        <p className="text-gray-500">
          This tab will provide compliance metrics and tracking across your organization.
        </p>
      </div>
    );
  };

  return (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Analytics</h1>
        <p className="text-gray-500 mt-1">Insights and reporting for regulatory operations</p>
      </div>

      {/* Controls */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center space-x-4">
          <div className="flex items-center space-x-2">
            <Calendar className="h-5 w-5 text-gray-400" />
            <select
              value={dateRange}
              onChange={handleDateRangeChange}
              className="block py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-sm"
            >
              {dateRanges.map(range => (
                <option key={range.id} value={range.id}>
                  {range.label}
                </option>
              ))}
            </select>
          </div>

          <div className="relative">
            <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-gray-400" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={handleSearchChange}
              className="block pl-10 pr-3 py-2 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-primary focus:border-primary text-sm"
              placeholder="Search analytics..."
            />
          </div>

          <button className="inline-flex items-center px-3 py-2 border border-gray-300 shadow-sm text-sm leading-4 font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary">
            <Filter className="h-4 w-4 mr-2" />
            Filters
          </button>
        </div>

        <button
          onClick={handleRefresh}
          className="inline-flex items-center px-3 py-2 border border-transparent text-sm leading-4 font-medium rounded-md shadow-sm text-white bg-primary hover:bg-primary-dark focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary"
        >
          <RefreshCw className="h-4 w-4 mr-2" />
          Refresh Data
        </button>
      </div>

      {/* Tabs */}
      <div className="mb-6">
        <div className="border-b">
          <nav className="-mb-px flex space-x-8">
            {tabs.map(tab => (
              <button
                key={tab.id}
                className={`py-4 px-1 border-b-2 font-medium text-sm ${
                  activeTab === tab.id
                    ? 'border-primary text-primary'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
                onClick={() => handleTabChange(tab.id)}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>
      </div>

      {/* Tab content */}
      <div>{renderTabContent()}</div>
    </div>
  );
};

export default AnalyticsModule;
