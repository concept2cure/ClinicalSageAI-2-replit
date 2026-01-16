import React from 'react';
import { Link } from 'wouter';
import AppPackagesBanner from '../components/AppPackagesBanner';
import {
  FileText, BarChart2, Clock, Calendar, ChevronRight, Download, Filter, PieChart, Search, Bookmark, CheckCircle2, AlertCircle } from 'lucide-react'

// Mock data - would come from API in production
const RECENT_TRIALS = [
  {
    id: 'NCT04596319',
    title: 'Investigational Study of LUM-1 for Treatment of Refractory Solid Tumors',
    phase: 'Phase 1/2',
    status: 'Recruiting',
    lastUpdated: '2025-03-28',
    completion: '72%',
  },
  {
    id: 'NCT04912765',
    title: 'LUM-2 Monotherapy and in Combination With Pembrolizumab in Advanced Solid Tumors',
    phase: 'Phase 1',
    status: 'Active, not recruiting',
    lastUpdated: '2025-04-01',
    completion: '89%',
  },
  {
    id: 'NCT05123327',
    title: 'Safety and Efficacy of LUM-3 in Participants With Advanced HPV-Associated Malignancies',
    phase: 'Phase 1',
    status: 'Active, not recruiting',
    lastUpdated: '2025-03-12',
    completion: '65%',
  },
];

const UPCOMING_MILESTONES = [
  {
    id: 1,
    date: 'Apr 25, 2025',
    event: 'Data Safety Monitoring Board Meeting - LUM-1 Phase 2',
    type: 'safety',
    critical: true,
  },
  {
    id: 2,
    date: 'May 10, 2025',
    event: 'Interim Analysis Report - LUM-2 Combination Study',
    type: 'data',
    critical: false,
  },
  {
    id: 3,
    date: 'May 15, 2025',
    event: 'FDA Type C Meeting - LUM-3 Program',
    type: 'regulatory',
    critical: true,
  },
];

const METRICS = [
  {
    label: 'Active Trials',
    value: '5',
    change: '+1',
    icon: <FileText size={18} className="text-purple-500" />,
  },
  {
    label: 'Subjects Enrolled',
    value: '187',
    change: '+12',
    icon: <BarChart2 size={18} className="text-green-500" />,
  },
  {
    label: 'Avg. Trial Duration',
    value: '14 mo',
    change: '-2',
    icon: <Clock size={18} className="text-blue-500" />,
  },
  {
    label: 'Upcoming Milestones',
    value: '8',
    change: '+3',
    icon: <Calendar size={18} className="text-amber-500" />,
  },
];

export default function LumenBioDashboard() {
  const [location] = React.useState('/lumen-bio/dashboard');

  return (
    <div className="min-h-screen flex flex-col bg-gray-50">
      <AppPackagesBanner currentPath={location} />

      <div className="py-6 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto w-full">
        {/* Client header */}
        <div className="flex justify-between items-center mb-8">
          <div>
            <div className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mb-2">
              Client Portal
            </div>
            <h1 className="text-2xl font-bold text-gray-900">
              Lumen Biosciences Pipeline Dashboard
            </h1>
            <p className="text-gray-500 mt-1">
              Real-time overview of your clinical development program
            </p>
          </div>
          <div className="flex gap-3">
            <button className="flex items-center gap-1 text-sm text-gray-700 px-3 py-1.5 border border-gray-300 rounded-md bg-white hover:bg-gray-50">
              <Filter size={16} />
              Filter
            </button>
            <button className="flex items-center gap-1 text-sm text-white px-3 py-1.5 border border-blue-600 rounded-md bg-blue-600 hover:bg-blue-700">
              <Download size={16} />
              Export
            </button>
          </div>
        </div>

        {/* Metrics cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          {METRICS.map((metric, i) => (
            <div key={i} className="bg-white p-4 rounded-lg shadow-sm border border-gray-200">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-sm font-medium text-gray-500 mb-1">{metric.label}</p>
                  <p className="text-2xl font-bold text-gray-900">{metric.value}</p>
                </div>
                <div className="rounded-full p-2 bg-gray-100">{metric.icon}</div>
              </div>
              <div
                className={`text-xs mt-2 ${metric.change.startsWith('+') ? 'text-green-600' : 'text-blue-600'}`}
              >
                {metric.change} from last month
              </div>
            </div>
          ))}
        </div>

        {/* Recent trials */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mb-6">
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Recent Trials</h2>
            <div className="relative rounded-md">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-gray-400" />
              </div>
              <input
                type="text"
                className="focus:ring-blue-500 focus:border-blue-500 block w-full pl-10 sm:text-sm border-gray-300 rounded-md"
                placeholder="Search trials"
              />
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Trial ID
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Title
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Phase
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Completion
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Last Updated
                  </th>
                  <th scope="col" className="relative px-6 py-3">
                    <span className="sr-only">Edit</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {RECENT_TRIALS.map(trial => (
                  <tr key={trial.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                      {trial.id}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-900">{trial.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {trial.phase}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${trial.status.includes('Recruiting') ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}
                      >
                        {trial.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      <div className="w-full bg-gray-200 rounded-full h-2.5">
                        <div
                          className="bg-blue-600 h-2.5 rounded-full"
                          style={{ width: trial.completion }}
                        ></div>
                      </div>
                      <span className="text-xs mt-1 inline-block">{trial.completion}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {trial.lastUpdated}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <Link
                        to={`/lumen-bio/trials/${trial.id}`}
                        className="text-blue-600 hover:text-blue-900"
                      >
                        View <ChevronRight size={14} className="inline" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Upcoming milestones and saved reports - 2 column layout */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Upcoming milestones */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Upcoming Milestones</h2>
              <button className="text-sm text-blue-600 hover:text-blue-800">View all</button>
            </div>
            <div className="p-4">
              <ul className="divide-y divide-gray-200">
                {UPCOMING_MILESTONES.map(milestone => (
                  <li key={milestone.id} className="py-3">
                    <div className="flex items-start">
                      <div
                        className={`flex-shrink-0 h-4 w-4 rounded-full mt-1 ${
                          milestone.type === 'safety'
                            ? 'bg-red-500'
                            : milestone.type === 'data'
                              ? 'bg-blue-500'
                              : 'bg-purple-500'
                        }`}
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-sm font-medium text-gray-900">{milestone.event}</p>
                          {milestone.critical && (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              Critical
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-500 mt-1">{milestone.date}</p>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Saved reports */}
          <div className="bg-white rounded-lg shadow-sm border border-gray-200">
            <div className="flex justify-between items-center p-4 border-b border-gray-200">
              <h2 className="text-lg font-medium text-gray-900">Saved Reports</h2>
              <button className="text-sm text-blue-600 hover:text-blue-800">View all</button>
            </div>
            <div className="p-4">
              <ul className="divide-y divide-gray-200">
                <li className="py-3">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <PieChart size={20} className="text-indigo-500" />
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Q1 2025 Enrollment Analytics
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Generated April 1, 2025</p>
                    </div>
                    <div>
                      <button className="text-gray-400 hover:text-gray-500">
                        <Download size={18} />
                      </button>
                    </div>
                  </div>
                </li>
                <li className="py-3">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <Bookmark size={20} className="text-blue-500" />
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">LUM-1 Safety Summary</p>
                      <p className="text-xs text-gray-500 mt-1">Generated March 15, 2025</p>
                    </div>
                    <div>
                      <button className="text-gray-400 hover:text-gray-500">
                        <Download size={18} />
                      </button>
                    </div>
                  </div>
                </li>
                <li className="py-3">
                  <div className="flex items-center">
                    <div className="flex-shrink-0">
                      <BarChart2 size={20} className="text-green-500" />
                    </div>
                    <div className="ml-3 flex-1">
                      <p className="text-sm font-medium text-gray-900">
                        Competitive Landscape Analysis
                      </p>
                      <p className="text-xs text-gray-500 mt-1">Generated February 28, 2025</p>
                    </div>
                    <div>
                      <button className="text-gray-400 hover:text-gray-500">
                        <Download size={18} />
                      </button>
                    </div>
                  </div>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Recent activity */}
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 mt-6">
          <div className="flex justify-between items-center p-4 border-b border-gray-200">
            <h2 className="text-lg font-medium text-gray-900">Recent Activity</h2>
            <button className="text-sm text-blue-600 hover:text-blue-800">View all</button>
          </div>
          <div className="p-4">
            <ul className="space-y-4">
              <li className="flex items-start">
                <div className="flex-shrink-0">
                  <CheckCircle2 size={18} className="text-green-500 mt-0.5" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-900">
                    LUM-2 combination arm completed enrollment
                  </p>
                  <p className="text-xs text-gray-500 mt-1">April 2, 2025 - 09:23 AM</p>
                </div>
              </li>
              <li className="flex items-start">
                <div className="flex-shrink-0">
                  <FileText size={18} className="text-blue-500 mt-0.5" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-900">LUM-1 Phase 2 interim report published</p>
                  <p className="text-xs text-gray-500 mt-1">April 1, 2025 - 02:45 PM</p>
                </div>
              </li>
              <li className="flex items-start">
                <div className="flex-shrink-0">
                  <AlertCircle size={18} className="text-amber-500 mt-0.5" />
                </div>
                <div className="ml-3">
                  <p className="text-sm text-gray-900">
                    Protocol amendment submitted for LUM-3 trial
                  </p>
                  <p className="text-xs text-gray-500 mt-1">March 30, 2025 - 11:15 AM</p>
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
