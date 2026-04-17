import React, { useState } from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  Database,
  FileText,
  FlaskConical,
  BookOpen,
  ShieldCheck,
  PieChart,
  Users,
  Settings,
  Bookmark,
  HelpCircle,
  FileQuestion,
  Activity,
  Edit,
  Library,
  Search,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronLeft,
} from 'lucide-react';
import { useModuleIntegration } from '../integration/ModuleIntegrationLayer';
import HelpButton from './HelpButton';

const AppSidebar = () => {
  const [location] = useLocation();
  const { data } = useModuleIntegration();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedSection, setExpandedSection] = useState(null);

  // Don't show sidebar on landing page
  if (location === '/') {
    return null;
  }

  const toggleCollapse = () => {
    setCollapsed(!collapsed);
    // When expanding, reset expanded sections
    if (collapsed) {
      setExpandedSection(null);
    }
  };

  const toggleSection = section => {
    if (expandedSection === section) {
      setExpandedSection(null);
    } else {
      setExpandedSection(section);
    }
  };

  const isActive = path => {
    if (path === '/dashboard') {
      return location === '/dashboard';
    }
    // Match subpaths, e.g. /vault should match /vault/documents
    return location.startsWith(path);
  };

  // Link style based on active state
  const getLinkClass = path => {
    const baseClass =
      'flex items-center px-3 py-2 text-sm font-medium rounded-md whitespace-nowrap';
    const activeClass = 'bg-pink-50 text-pink-600';
    const inactiveClass = 'text-gray-700 hover:bg-gray-100';

    return `${baseClass} ${isActive(path) ? activeClass : inactiveClass}`;
  };

  return (
    <aside
      className={`bg-white border-r border-gray-200 flex flex-col ${collapsed ? 'w-16' : 'w-64'}`}
    >
      <div className="h-0 flex-1 flex flex-col pt-5 pb-4 overflow-y-auto">
        <div className="flex-1 flex flex-col px-3 space-y-1">
          {/* Dashboard */}
          <Link href="/dashboard">
            <a className={getLinkClass('/dashboard')}>
              <LayoutDashboard className="mr-3 flex-shrink-0 h-5 w-5" />
              {!collapsed && <span>Dashboard</span>}
            </a>
          </Link>

          {/* Major Modules Section */}
          <div className="pt-4">
            <div
              className={`mb-2 ${collapsed ? 'px-3' : 'px-3 flex justify-between items-center'}`}
            >
              {!collapsed && (
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Core Modules
                </h3>
              )}
              {collapsed && <div className="h-px bg-gray-200 w-full my-2"></div>}
            </div>

            {/* Vault */}
            <Link href="/vault">
              <a className={getLinkClass('/vault')}>
                <Database className="mr-3 flex-shrink-0 h-5 w-5" />
                {!collapsed && <span>Document Vault</span>}
              </a>
            </Link>

            {/* CSR Intelligence */}
            <Link href="/csr-intelligence">
              <a className={getLinkClass('/csr-intelligence')}>
                <FileText className="mr-3 flex-shrink-0 h-5 w-5" />
                {!collapsed && <span>CSR Intelligence</span>}
              </a>
            </Link>

            {/* Study Architect */}
            <Link href="/study-architect">
              <a className={getLinkClass('/study-architect')}>
                <FlaskConical className="mr-3 flex-shrink-0 h-5 w-5" />
                {!collapsed && <span>Study Architect</span>}
              </a>
            </Link>

            {/* ICH Wiz - Collapsible Section */}
            <div>
              <button
                onClick={() => toggleSection('regulatory')}
                className={`w-full text-left ${getLinkClass('/regulatory-intelligence')}`}
              >
                <BookOpen className="mr-3 flex-shrink-0 h-5 w-5" />
                {!collapsed && (
                  <>
                    <span className="flex-1">ICH Wiz</span>
                    {expandedSection === 'regulatory' ? (
                      <ChevronUp className="h-4 w-4" />
                    ) : (
                      <ChevronDown className="h-4 w-4" />
                    )}
                  </>
                )}
              </button>

              {!collapsed && expandedSection === 'regulatory' && (
                <div className="ml-8 space-y-1 mt-1">
                  <Link href="/regulatory-intelligence/guidance">
                    <a
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                        location === '/regulatory-intelligence/guidance'
                          ? 'text-pink-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <BookOpen className="mr-2 h-4 w-4" />
                      <span>Guidance Library</span>
                    </a>
                  </Link>
                  <Link href="/regulatory-intelligence/compliance">
                    <a
                      className={`flex items-center px-3 py-2 text-sm font-medium rounded-md ${
                        location === '/regulatory-intelligence/compliance'
                          ? 'text-pink-600'
                          : 'text-gray-600 hover:bg-gray-50'
                      }`}
                    >
                      <ShieldCheck className="mr-2 h-4 w-4" />
                      <span>Compliance Check</span>
                    </a>
                  </Link>
                </div>
              )}
            </div>

            {/* eCTD Co-Author Module */}
            <Link href="/coauthor">
              <a className={getLinkClass('/coauthor')}>
                <Edit className="mr-3 flex-shrink-0 h-5 w-5" />
                {!collapsed && <span>eCTD Co-Author</span>}
              </a>
            </Link>

            {/* IND Wizard */}
            <Link href="/ind-wizard">
              <a className={getLinkClass('/ind-wizard')}>
                <FileQuestion className="mr-3 flex-shrink-0 h-5 w-5" />
                {!collapsed && <span>IND Wizard</span>}
              </a>
            </Link>

            {/* Analytics */}
            <Link href="/analytics">
              <a className={getLinkClass('/analytics')}>
                <PieChart className="mr-3 flex-shrink-0 h-5 w-5" />
                {!collapsed && <span>Analytics</span>}
              </a>
            </Link>
          </div>

          {/* Secondary Links Section */}
          {!collapsed && (
            <div className="pt-4 mt-4 border-t border-gray-200">
              <div className="mb-2 px-3 flex justify-between items-center">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Administration
                </h3>
              </div>

              <button
                type="button"
                className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
                onClick={() => window.location.href = '/admin/team'}
              >
                <Users className="mr-3 flex-shrink-0 h-5 w-5 text-gray-500" />
                <span>Team Management</span>
              </button>
              <button
                type="button"
                className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
                onClick={() => window.location.href = '/settings'}
              >
                <Settings className="mr-3 flex-shrink-0 h-5 w-5 text-gray-500" />
                <span>Settings</span>
              </button>
              <button
                type="button"
                className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
                onClick={() => window.location.href = '/admin/audit-logs'}
              >
                <Activity className="mr-3 flex-shrink-0 h-5 w-5 text-gray-500" />
                <span>Audit Logs</span>
              </button>
            </div>
          )}

          {/* Help Section */}
          {!collapsed && (
            <div className="pt-4 mt-4 border-t border-gray-200">
              <div className="mb-2 px-3 flex justify-between items-center">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">
                  Help & Resources
                </h3>
              </div>

              <button
                type="button"
                className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
                onClick={() => window.location.href = '/docs'}
              >
                <HelpCircle className="mr-3 flex-shrink-0 h-5 w-5 text-gray-500" />
                <span>Documentation</span>
              </button>
              <button
                type="button"
                className="flex items-center w-full px-3 py-2 text-sm font-medium text-gray-700 rounded-md hover:bg-gray-100"
                onClick={() => window.location.href = '/resources'}
              >
                <Bookmark className="mr-3 flex-shrink-0 h-5 w-5 text-gray-500" />
                <span>Resources</span>
              </button>

              <div className="px-3 py-2">
                <HelpButton
                  position="inline"
                  size="sm"
                  variant="outline"
                  className="w-full justify-start text-gray-700 hover:bg-gray-100"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Collapse/Expand Button */}
      <div className="border-t border-gray-200 p-3">
        <button
          onClick={toggleCollapse}
          className="flex items-center justify-center w-full p-2 text-sm font-medium text-gray-600 rounded-md hover:bg-gray-100"
        >
          {collapsed ? <ChevronRight size={20} /> : <ChevronLeft size={20} />}
          {!collapsed && <span className="ml-2">Collapse Sidebar</span>}
        </button>
      </div>
    </aside>
  );
};

export default AppSidebar;
