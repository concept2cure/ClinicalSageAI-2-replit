/**
 * Analytics Dashboard Components for Enterprise Regulatory Applications
 *
 * This module exports specialized UI components for the analytics dashboard,
 * including layouts, widgets, KPI tiles, and specialized visualizations
 * for regulatory data analysis.
 */

import React from 'react';
import { motion } from 'framer-motion';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import {
  Users,
  Clock,
  FileText,
  CheckCircle,
  BarChart2,
  TrendingUp,
  AlertCircle,
  ChevronUp,
  ChevronDown,
  Zap,
  Clipboard,
  MessageSquare,
  Code,
  Download,
  Check,
  X,
  AlertTriangle,
  Info,
} from 'lucide-react';

// Default color palette
const COLORS = {
  primary: '#FF1493', // Hot Pink
  secondary: '#FFB6C1',
  success: '#10B981',
  warning: '#F59E0B',
  danger: '#EF4444',
  info: '#3B82F6',
  dark: '#1F2937',
  light: '#F9FAFB',
};

// Dashboard Layout Component
export const DashboardLayout = ({ children, title, description }) => {
  return (
    <div className="bg-gray-50 min-h-screen">
      <header className="bg-white shadow-sm">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-2xl font-bold text-gray-900">{title}</h1>
          {description && <p className="text-gray-500 mt-1">{description}</p>}
        </div>
      </header>
      <main className="container mx-auto px-4 py-6">{children}</main>
    </div>
  );
};

// Widget Container Component
export const WidgetContainer = ({
  title,
  children,
  icon,
  actions,
  className = '',
  isLoading = false,
}) => {
  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <div className="px-4 py-3 border-b border-gray-200 flex justify-between items-center">
        <div className="flex items-center space-x-2">
          {icon && <span className="text-gray-500">{icon}</span>}
          <h3 className="font-medium text-gray-900">{title}</h3>
        </div>
        {actions && <div className="flex space-x-2">{actions}</div>}
      </div>
      <div className="p-4">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
          </div>
        ) : (
          children
        )}
      </div>
    </div>
  );
};

// Grid Layout with configurable columns
export const GridLayout = ({ children, columns = 12, gap = 6 }) => {
  const gridClass = `grid grid-cols-1 md:grid-cols-${Math.min(columns, 6)} lg:grid-cols-${Math.min(columns, 12)} gap-${gap}`;

  return <div className={gridClass}>{children}</div>;
};

// KPI Tile Component
export const KPITile = ({
  title,
  value,
  subtitle,
  icon,
  trend = null,
  trendLabel,
  className = '',
  valueClassName = '',
  onClick,
  color = 'primary',
}) => {
  const colorClasses = {
    primary: 'text-pink-600',
    secondary: 'text-indigo-600',
    success: 'text-green-600',
    warning: 'text-amber-600',
    danger: 'text-red-600',
    info: 'text-blue-600',
  };

  const trendClasses = {
    up: 'text-green-600',
    down: 'text-red-600',
    neutral: 'text-gray-500',
  };

  const trendIcon = {
    up: <ChevronUp className="h-4 w-4" />,
    down: <ChevronDown className="h-4 w-4" />,
    neutral: null,
  };

  const containerClasses = `bg-white rounded-lg shadow p-6 ${className} ${onClick ? 'cursor-pointer hover:shadow-md transition-shadow' : ''}`;

  return (
    <div className={containerClasses} onClick={onClick}>
      <div className="flex justify-between items-start">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className={`text-3xl font-bold ${valueClassName || colorClasses[color]}`}>{value}</p>
          {subtitle && <p className="text-sm text-gray-500 mt-1">{subtitle}</p>}
          {trend && (
            <div className={`flex items-center mt-2 ${trendClasses[trend]}`}>
              {trendIcon[trend]}
              <span className="text-sm font-medium ml-1">{trendLabel}</span>
            </div>
          )}
        </div>
        {icon && (
          <div
            className={`p-3 rounded-full ${color === 'primary' ? 'bg-pink-100' : `bg-${color}-100`}`}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  );
};

// Specialized Section Matrix for IND Submissions
export const SectionMatrix = ({ sections, onSectionClick, isLoading = false }) => {
  // Group sections by module
  const sectionsByModule = sections.reduce((acc, section) => {
    const module = section.module || 'Other';
    if (!acc[module]) {
      acc[module] = [];
    }
    acc[module].push(section);
    return acc;
  }, {});

  // Get status class for color coding
  const getStatusClass = status => {
    switch (status.toLowerCase()) {
      case 'complete':
      case 'completed':
      case 'approved':
        return 'bg-green-100 border-green-300 text-green-800';
      case 'in review':
      case 'reviewing':
        return 'bg-amber-100 border-amber-300 text-amber-800';
      case 'in progress':
      case 'draft':
        return 'bg-blue-100 border-blue-300 text-blue-800';
      case 'needs revision':
      case 'rejected':
        return 'bg-red-100 border-red-300 text-red-800';
      case 'not started':
      default:
        return 'bg-gray-100 border-gray-300 text-gray-800';
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {Object.entries(sectionsByModule).map(([module, moduleSections]) => (
        <div key={module} className="border rounded-lg overflow-hidden">
          <div className="bg-gray-50 px-4 py-2 font-medium border-b">Module {module}</div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
            {moduleSections.map(section => (
              <div
                key={section.id}
                className={`border rounded-lg p-4 cursor-pointer hover:shadow-md transition-shadow ${getStatusClass(section.status)}`}
                onClick={() => onSectionClick && onSectionClick(section)}
              >
                <div className="flex justify-between mb-2">
                  <span className="text-xs font-medium">{section.code}</span>
                  <span className="text-xs">{section.status}</span>
                </div>
                <h4 className="font-medium mb-3 text-gray-900">{section.title}</h4>
                <div className="flex justify-between text-xs">
                  <span>{section.author || 'Unassigned'}</span>
                  <div className="flex items-center">
                    <div className="w-16 h-1.5 bg-gray-200 rounded-full overflow-hidden mr-1">
                      <div
                        className={
                          section.completeness >= 90
                            ? 'bg-green-500'
                            : section.completeness >= 60
                              ? 'bg-amber-500'
                              : 'bg-red-500'
                        }
                        style={{ width: `${section.completeness}%`, height: '100%' }}
                      ></div>
                    </div>
                    <span>{section.completeness}%</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
};

// Status Ribbon Component for Submission Statuses
export const StatusRibbon = ({ statuses = [], activeStatus, onStatusChange }) => {
  return (
    <div className="flex overflow-x-auto space-x-2 py-2">
      {statuses.map(status => (
        <button
          key={status.value}
          className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap ${
            status.value === activeStatus
              ? 'bg-pink-600 text-white'
              : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
          }`}
          onClick={() => onStatusChange && onStatusChange(status.value)}
        >
          {status.icon && <span className="mr-1">{status.icon}</span>}
          {status.label}{' '}
          {status.count !== undefined && (
            <span className="ml-1 rounded-full bg-opacity-20 px-2 py-0.5 text-xs">
              {status.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
};

// Submission Timeline Component
export const SubmissionTimeline = ({ events = [], currentDate = new Date() }) => {
  const sortedEvents = [...events].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
  );

  return (
    <div className="relative">
      {/* Timeline line */}
      <div className="absolute left-6 top-0 bottom-0 w-px bg-gray-200"></div>

      {/* Timeline events */}
      <div className="space-y-6">
        {sortedEvents.map((event, index) => {
          const eventDate = new Date(event.date);
          const isPast = eventDate <= currentDate;

          return (
            <div key={index} className="flex">
              <div className="flex-shrink-0 relative z-10">
                <div
                  className={`h-12 w-12 rounded-full flex items-center justify-center ${
                    isPast ? 'bg-pink-100 text-pink-600' : 'bg-gray-100 text-gray-400'
                  }`}
                >
                  {event.icon || <Clock className="h-5 w-5" />}
                </div>
              </div>
              <div className="ml-4 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className={`font-medium ${isPast ? 'text-gray-900' : 'text-gray-500'}`}>
                    {event.title}
                  </h4>
                  <time className="text-sm text-gray-500">{eventDate.toLocaleDateString()}</time>
                </div>
                {event.description && (
                  <p className="mt-1 text-sm text-gray-600">{event.description}</p>
                )}
                {event.tags && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {event.tags.map((tag, tagIndex) => (
                      <span
                        key={tagIndex}
                        className="px-2 py-1 text-xs rounded-full bg-gray-100 text-gray-700"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// Data Table Component
export const DataTable = ({
  columns = [],
  data = [],
  isLoading = false,
  emptyMessage = 'No data available',
  onRowClick,
  pagination = null,
  sortable = false,
  sortColumn,
  sortDirection,
  onSort,
}) => {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-pink-600"></div>
      </div>
    );
  }

  if (!data.length) {
    return (
      <div className="flex items-center justify-center h-32 border rounded-lg bg-gray-50">
        <p className="text-gray-500">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            {columns.map((column, i) => (
              <th
                key={i}
                scope="col"
                className={`px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider ${
                  sortable && column.sortKey ? 'cursor-pointer hover:bg-gray-100' : ''
                }`}
                onClick={() => {
                  if (sortable && column.sortKey && onSort) {
                    onSort(
                      column.sortKey,
                      sortColumn === column.sortKey && sortDirection === 'asc' ? 'desc' : 'asc'
                    );
                  }
                }}
              >
                <div className="flex items-center space-x-1">
                  <span>{column.header}</span>
                  {sortable && column.sortKey && sortColumn === column.sortKey && (
                    <span>
                      {sortDirection === 'asc' ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </span>
                  )}
                </div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {data.map((row, rowIndex) => (
            <tr
              key={rowIndex}
              className={onRowClick ? 'cursor-pointer hover:bg-gray-50' : ''}
              onClick={() => onRowClick && onRowClick(row)}
            >
              {columns.map((column, colIndex) => (
                <td key={colIndex} className="px-6 py-4 whitespace-nowrap">
                  {column.cell ? column.cell(row) : row[column.accessor]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      {pagination && (
        <div className="border-t border-gray-200 px-4 py-3 flex items-center justify-between">
          <div className="flex-1 flex justify-between sm:hidden">
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
              disabled={pagination.currentPage === 1}
              className="relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Previous
            </button>
            <button
              onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
              disabled={pagination.currentPage === pagination.totalPages}
              className="ml-3 relative inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next
            </button>
          </div>
          <div className="hidden sm:flex-1 sm:flex sm:items-center sm:justify-between">
            <div>
              <p className="text-sm text-gray-700">
                Showing <span className="font-medium">{pagination.startIndex + 1}</span> to{' '}
                <span className="font-medium">
                  {Math.min(pagination.endIndex, pagination.totalItems)}
                </span>{' '}
                of <span className="font-medium">{pagination.totalItems}</span> results
              </p>
            </div>
            <div>
              <nav
                className="relative z-0 inline-flex rounded-md shadow-sm -space-x-px"
                aria-label="Pagination"
              >
                <button
                  onClick={() => pagination.onPageChange(pagination.currentPage - 1)}
                  disabled={pagination.currentPage === 1}
                  className="relative inline-flex items-center px-2 py-2 rounded-l-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Previous</span>
                  <ChevronUp className="h-5 w-5 transform -rotate-90" />
                </button>

                {/* Page numbers */}
                {Array.from({ length: pagination.totalPages }, (_, i) => i + 1).map(page => (
                  <button
                    key={page}
                    onClick={() => pagination.onPageChange(page)}
                    className={`relative inline-flex items-center px-4 py-2 border text-sm font-medium ${
                      page === pagination.currentPage
                        ? 'z-10 bg-pink-50 border-pink-500 text-pink-600'
                        : 'bg-white border-gray-300 text-gray-500 hover:bg-gray-50'
                    }`}
                  >
                    {page}
                  </button>
                ))}

                <button
                  onClick={() => pagination.onPageChange(pagination.currentPage + 1)}
                  disabled={pagination.currentPage === pagination.totalPages}
                  className="relative inline-flex items-center px-2 py-2 rounded-r-md border border-gray-300 bg-white text-sm font-medium text-gray-500 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <span className="sr-only">Next</span>
                  <ChevronDown className="h-5 w-5 transform -rotate-90" />
                </button>
              </nav>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// Filter Bar Component
export const FilterBar = ({
  filters = [],
  activeFilters = {},
  onFilterChange,
  searchValue = '',
  onSearchChange,
  allowMultiple = false,
  className = '',
}) => {
  return (
    <div className={`bg-white p-4 rounded-lg shadow-sm border ${className}`}>
      <div className="flex flex-col space-y-4 md:flex-row md:space-y-0 md:space-x-4">
        {/* Search input */}
        {onSearchChange && (
          <div className="flex-1">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg
                  className="h-5 w-5 text-gray-400"
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  aria-hidden="true"
                >
                  <path
                    fillRule="evenodd"
                    d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z"
                    clipRule="evenodd"
                  />
                </svg>
              </div>
              <input
                type="text"
                value={searchValue}
                onChange={e => onSearchChange(e.target.value)}
                className="block w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md leading-5 bg-white placeholder-gray-500 focus:outline-none focus:placeholder-gray-400 focus:ring-1 focus:ring-pink-500 focus:border-pink-500 sm:text-sm"
                placeholder="Search..."
              />
            </div>
          </div>
        )}

        {/* Filter dropdowns */}
        {filters.map((filter, index) => (
          <div key={index} className="flex-1">
            <select
              value={activeFilters[filter.key] || ''}
              onChange={e => {
                onFilterChange(filter.key, e.target.value);
              }}
              className="block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-pink-500 focus:border-pink-500 sm:text-sm rounded-md"
            >
              <option value="">{filter.placeholder || `All ${filter.label}`}</option>
              {filter.options.map((option, optionIndex) => (
                <option key={optionIndex} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>

      {/* Active filters */}
      {Object.keys(activeFilters).length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2">
          {Object.entries(activeFilters).map(([key, value]) => {
            if (!value) return null;
            const filterDef = filters.find(f => f.key === key);
            const option = filterDef?.options.find(o => o.value === value);
            if (!filterDef || !option) return null;

            return (
              <span
                key={key}
                className="inline-flex rounded-full items-center py-1 pl-3 pr-1 text-sm font-medium bg-pink-100 text-pink-800"
              >
                {filterDef.label}: {option.label}
                <button
                  type="button"
                  className="flex-shrink-0 ml-0.5 h-5 w-5 rounded-full inline-flex items-center justify-center text-pink-600 hover:bg-pink-200 hover:text-pink-800 focus:outline-none focus:bg-pink-200 focus:text-pink-800"
                  onClick={() => onFilterChange(key, '')}
                >
                  <span className="sr-only">Remove filter for {filterDef.label}</span>
                  <svg className="h-3 w-3" stroke="currentColor" fill="none" viewBox="0 0 8 8">
                    <path strokeLinecap="round" strokeWidth="1.5" d="M1 1l6 6m0-6L1 7" />
                  </svg>
                </button>
              </span>
            );
          })}

          <button
            type="button"
            className="text-sm text-gray-500 hover:text-gray-700"
            onClick={() => {
              const emptyFilters = Object.keys(activeFilters).reduce((acc, key) => {
                acc[key] = '';
                return acc;
              }, {});

              Object.entries(emptyFilters).forEach(([key, value]) => {
                onFilterChange(key, value);
              });
            }}
          >
            Clear all filters
          </button>
        </div>
      )}
    </div>
  );
};

// Export Menu Component
export const ExportMenu = ({
  exportOptions = [
    { value: 'pdf', label: 'Export as PDF' },
    { value: 'excel', label: 'Export as Excel' },
    { value: 'csv', label: 'Export as CSV' },
  ],
  onExport,
  className = '',
}) => {
  const [isOpen, setIsOpen] = React.useState(false);

  return (
    <div className={`relative inline-block text-left ${className}`}>
      <div>
        <button
          type="button"
          className="inline-flex justify-center w-full rounded-md border border-gray-300 shadow-sm px-4 py-2 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-100 focus:ring-pink-500"
          id="export-menu-button"
          aria-expanded="true"
          aria-haspopup="true"
          onClick={() => setIsOpen(!isOpen)}
        >
          <Download className="mr-2 h-4 w-4" />
          Export
          <svg
            className="-mr-1 ml-2 h-5 w-5"
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <path
              fillRule="evenodd"
              d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z"
              clipRule="evenodd"
            />
          </svg>
        </button>
      </div>

      {isOpen && (
        <div
          className="origin-top-right absolute right-0 mt-2 w-56 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 focus:outline-none z-10"
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="export-menu-button"
          tabIndex="-1"
        >
          <div className="py-1" role="none">
            {exportOptions.map((option, index) => (
              <button
                key={index}
                className="text-gray-700 block w-full text-left px-4 py-2 text-sm hover:bg-gray-100"
                role="menuitem"
                tabIndex="-1"
                onClick={() => {
                  onExport(option.value);
                  setIsOpen(false);
                }}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// User Activity Card Component
export const UserActivityCard = ({
  user = {
    name: 'John Doe',
    avatar: 'https://randomuser.me/api/portraits/men/1.jpg',
    role: 'Regulatory Writer',
  },
  activities = [],
  isLoading = false,
  className = '',
}) => {
  // Get activity icon based on type
  const getActivityIcon = type => {
    switch (type) {
      case 'edit':
        return <FileText className="h-4 w-4" />;
      case 'comment':
        return <MessageSquare className="h-4 w-4" />;
      case 'create':
        return <Code className="h-4 w-4" />;
      case 'approve':
        return <Check className="h-4 w-4" />;
      case 'reject':
        return <X className="h-4 w-4" />;
      default:
        return <Info className="h-4 w-4" />;
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow p-6 ${className}`}>
        <div className="animate-pulse">
          <div className="flex items-center mb-6">
            <div className="rounded-full bg-gray-200 h-12 w-12"></div>
            <div className="ml-4">
              <div className="h-4 bg-gray-200 rounded w-24"></div>
              <div className="h-3 bg-gray-200 rounded w-32 mt-2"></div>
            </div>
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="flex">
                <div className="rounded-full bg-gray-200 h-8 w-8"></div>
                <div className="ml-4 flex-1">
                  <div className="h-4 bg-gray-200 rounded w-3/4"></div>
                  <div className="h-3 bg-gray-200 rounded w-1/2 mt-2"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <div className="p-6">
        <div className="flex items-center mb-6">
          <div className="h-12 w-12 rounded-full bg-gray-200 flex items-center justify-center overflow-hidden">
            {user.avatar ? (
              <img src={user.avatar} alt={user.name} className="h-full w-full object-cover" />
            ) : (
              <Users className="h-6 w-6 text-gray-400" />
            )}
          </div>
          <div className="ml-4">
            <h3 className="font-medium text-gray-900">{user.name}</h3>
            <p className="text-sm text-gray-500">{user.role}</p>
          </div>
        </div>

        <div className="space-y-4">
          {activities.length > 0 ? (
            activities.map((activity, index) => (
              <div key={index} className="flex">
                <div
                  className={`
                  h-8 w-8 rounded-full flex items-center justify-center
                  ${
                    activity.type === 'edit'
                      ? 'bg-blue-100 text-blue-600'
                      : activity.type === 'comment'
                        ? 'bg-amber-100 text-amber-600'
                        : activity.type === 'create'
                          ? 'bg-green-100 text-green-600'
                          : activity.type === 'approve'
                            ? 'bg-pink-100 text-pink-600'
                            : activity.type === 'reject'
                              ? 'bg-red-100 text-red-600'
                              : 'bg-gray-100 text-gray-600'
                  }
                `}
                >
                  {getActivityIcon(activity.type)}
                </div>
                <div className="ml-4 flex-1">
                  <p className="text-sm text-gray-900">{activity.description}</p>
                  <p className="text-xs text-gray-500">{activity.time}</p>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-500 text-center py-4">No recent activity</p>
          )}
        </div>
      </div>
    </div>
  );
};

// Regulatory Intelligence Panel Component
export const RegulatoryIntelligencePanel = ({
  items = [],
  isLoading = false,
  onItemClick,
  className = '',
}) => {
  // Get severity color and icon
  const getSeverityInfo = severity => {
    switch (severity.toLowerCase()) {
      case 'high':
        return {
          color: 'border-red-500 bg-red-50',
          textColor: 'text-red-700',
          icon: <AlertTriangle className="h-4 w-4 text-red-500" />,
        };
      case 'medium':
        return {
          color: 'border-amber-500 bg-amber-50',
          textColor: 'text-amber-700',
          icon: <AlertCircle className="h-4 w-4 text-amber-500" />,
        };
      case 'low':
        return {
          color: 'border-blue-500 bg-blue-50',
          textColor: 'text-blue-700',
          icon: <Info className="h-4 w-4 text-blue-500" />,
        };
      default:
        return {
          color: 'border-gray-300 bg-gray-50',
          textColor: 'text-gray-700',
          icon: <Info className="h-4 w-4 text-gray-500" />,
        };
    }
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
        <div className="p-4 border-b">
          <h3 className="font-medium">Regulatory Intelligence</h3>
        </div>
        <div className="p-4">
          <div className="animate-pulse space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="border rounded-lg p-4">
                <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-full mb-2"></div>
                <div className="h-3 bg-gray-200 rounded w-2/3"></div>
                <div className="flex justify-between mt-4">
                  <div className="h-3 bg-gray-200 rounded w-20"></div>
                  <div className="h-3 bg-gray-200 rounded w-24"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <div className="p-4 border-b">
        <h3 className="font-medium">Regulatory Intelligence</h3>
      </div>
      <div className="p-4">
        {items.length > 0 ? (
          <div className="space-y-4">
            {items.map((item, index) => {
              const severityInfo = getSeverityInfo(item.severity);

              return (
                <div
                  key={index}
                  className={`border-l-4 ${severityInfo.color} rounded-r-lg p-4 hover:shadow-md transition-shadow cursor-pointer`}
                  onClick={() => onItemClick && onItemClick(item)}
                >
                  <div className="flex items-start justify-between">
                    <h4 className={`font-medium ${severityInfo.textColor}`}>{item.title}</h4>
                    <div className="flex items-center space-x-1 ml-2">
                      {severityInfo.icon}
                      <span className="text-xs font-medium">{item.severity}</span>
                    </div>
                  </div>
                  <p className="mt-1 text-sm text-gray-600 line-clamp-2">{item.summary}</p>
                  <div className="mt-2 flex justify-between text-xs text-gray-500">
                    <span>{item.authority}</span>
                    <span>{new Date(item.date).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="py-8 text-center">
            <p className="text-gray-500">No regulatory updates available</p>
          </div>
        )}
      </div>
    </div>
  );
};

// Prediction Card Component
export const PredictionCard = ({
  title = 'Submission Success Prediction',
  probability = 0.85,
  factors = [
    { name: 'Content Quality', value: 0.35, positive: true },
    { name: 'Data Completeness', value: 0.25, positive: true },
    { name: 'Missing Safety Data', value: 0.15, positive: false },
  ],
  recommendation = 'Your submission has a high likelihood of acceptance. Address the missing safety data to further improve chances.',
  isLoading = false,
  className = '',
}) => {
  // Get color based on probability
  const getProbabilityColor = prob => {
    if (prob >= 0.8) return 'text-green-600';
    if (prob >= 0.6) return 'text-blue-600';
    if (prob >= 0.4) return 'text-amber-600';
    return 'text-red-600';
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
        <div className="p-4 border-b">
          <h3 className="font-medium">{title}</h3>
        </div>
        <div className="p-6">
          <div className="animate-pulse flex flex-col items-center">
            <div className="h-24 w-24 bg-gray-200 rounded-full mb-4"></div>
            <div className="h-4 bg-gray-200 rounded w-1/4 mb-6"></div>
            <div className="w-full space-y-3 mb-6">
              {[1, 2, 3].map(i => (
                <div key={i} className="flex justify-between">
                  <div className="h-3 bg-gray-200 rounded w-1/3"></div>
                  <div className="h-3 bg-gray-200 rounded w-24"></div>
                </div>
              ))}
            </div>
            <div className="w-full h-24 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <div className="p-4 border-b">
        <h3 className="font-medium">{title}</h3>
      </div>
      <div className="p-6">
        <div className="flex flex-col items-center mb-6">
          <div className="relative mb-4">
            <svg height="100" width="100" viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="#E5E7EB" strokeWidth="8" />
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke={
                  probability >= 0.8
                    ? '#10B981'
                    : probability >= 0.6
                      ? '#3B82F6'
                      : probability >= 0.4
                        ? '#F59E0B'
                        : '#EF4444'
                }
                strokeWidth="8"
                strokeDasharray={`${probability * 283} 283`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <span className={`text-2xl font-bold ${getProbabilityColor(probability)}`}>
                {Math.round(probability * 100)}%
              </span>
              <span className="text-xs text-gray-500">Likelihood</span>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <h4 className="text-sm font-medium mb-3">Key Factors</h4>
          <div className="space-y-3">
            {factors.map((factor, index) => (
              <div key={index} className="flex justify-between items-center">
                <span className="text-sm">{factor.name}</span>
                <div className="flex items-center">
                  <div className="w-24 h-1.5 bg-gray-200 rounded-full mr-2 overflow-hidden">
                    <div
                      className={factor.positive ? 'bg-green-500' : 'bg-red-500'}
                      style={{ width: `${factor.value * 100}%`, height: '100%' }}
                    ></div>
                  </div>
                  <span
                    className={`text-xs ${factor.positive ? 'text-green-600' : 'text-red-600'}`}
                  >
                    {factor.positive ? '+' : '-'}
                    {Math.round(factor.value * 100)}%
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 p-4 rounded-lg">
          <h4 className="text-sm font-medium mb-2">AI Recommendation</h4>
          <p className="text-sm text-gray-700">{recommendation}</p>
        </div>
      </div>
    </div>
  );
};

// Document Quality Matrix Component
export const DocumentQualityMatrix = ({
  sections = [],
  qualityMetrics = ['Readability', 'Formatting', 'Completeness', 'Accuracy'],
  isLoading = false,
  onSectionClick,
  className = '',
}) => {
  // Get quality score color
  const getQualityColor = score => {
    if (score >= 90) return 'bg-green-500';
    if (score >= 70) return 'bg-blue-500';
    if (score >= 50) return 'bg-amber-500';
    if (score >= 30) return 'bg-orange-500';
    return 'bg-red-500';
  };

  if (isLoading) {
    return (
      <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
        <div className="p-4 border-b">
          <h3 className="font-medium">Document Quality Matrix</h3>
        </div>
        <div className="p-4">
          <div className="animate-pulse">
            <div className="h-64 bg-gray-200 rounded"></div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-lg shadow overflow-hidden ${className}`}>
      <div className="p-4 border-b">
        <h3 className="font-medium">Document Quality Matrix</h3>
      </div>
      <div className="p-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead>
            <tr>
              <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Section
              </th>
              {qualityMetrics.map((metric, index) => (
                <th
                  key={index}
                  className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                >
                  {metric}
                </th>
              ))}
              <th className="px-6 py-3 bg-gray-50 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Overall
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {sections.map((section, sectionIndex) => (
              <tr
                key={sectionIndex}
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => onSectionClick && onSectionClick(section)}
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                  {section.code} - {section.title}
                </td>
                {qualityMetrics.map((metric, metricIndex) => {
                  const metricKey = metric.toLowerCase();
                  const score = section.metrics?.[metricKey] || 0;

                  return (
                    <td key={metricIndex} className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="w-24 h-2 bg-gray-200 rounded-full overflow-hidden mr-2">
                          <div
                            className={getQualityColor(score)}
                            style={{ width: `${score}%`, height: '100%' }}
                          ></div>
                        </div>
                        <span className="text-sm text-gray-500">{score}%</span>
                      </div>
                    </td>
                  );
                })}
                <td className="px-6 py-4 whitespace-nowrap">
                  <div className="flex items-center">
                    <div className="w-24 h-3 bg-gray-200 rounded-full overflow-hidden mr-2">
                      <div
                        className={getQualityColor(section.overallScore)}
                        style={{ width: `${section.overallScore}%`, height: '100%' }}
                      ></div>
                    </div>
                    <span className="text-sm font-medium">{section.overallScore}%</span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// Export all components
export {
  DashboardLayout,
  WidgetContainer,
  GridLayout,
  KPITile,
  SectionMatrix,
  StatusRibbon,
  SubmissionTimeline,
  DataTable,
  FilterBar,
  ExportMenu,
  UserActivityCard,
  RegulatoryIntelligencePanel,
  PredictionCard,
  DocumentQualityMatrix,
};
