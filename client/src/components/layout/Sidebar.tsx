import React from 'react';
import { Link, useLocation } from 'wouter';
import {
  LayoutDashboard,
  FileText,
  Upload,
  BarChart2,
  Settings,
  HelpCircle,
  Lightbulb,
  BookOpen,
  XCircle,
  Menu,
  ClipboardList,
  Globe,
  Database,
  FileSymlink,
  Microscope,
  FileCheck,
  Briefcase,
  AlertTriangle,
  Target,
  Radar,
  Beaker,
  GraduationCap,
  BarChart,
  LineChart,
  PieChart,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SidebarProps {
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
}

interface NavItemProps {
  href: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  end?: boolean;
}

function NavItem({ href, icon, children, end = false }: NavItemProps) {
  const [location] = useLocation();
  const isActive = end ? location === href : location.startsWith(href);

  return (
    <div>
      <Link
        href={href}
        className={cn(
          'group flex items-center px-3 py-2.5 text-sm font-medium rounded-md transition-colors duration-150',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-slate-700 hover:bg-slate-100 hover:text-primary'
        )}
      >
        <div
          className={cn(
            'mr-3 h-5 w-5 flex-shrink-0',
            isActive ? 'text-primary' : 'text-slate-500 group-hover:text-primary'
          )}
        >
          {icon}
        </div>
        {children}
      </Link>
    </div>
  );
}

export function Sidebar({ sidebarOpen, setSidebarOpen }: SidebarProps) {
  return (
    <>
      {/* Mobile sidebar backdrop */}
      <div
        className={cn(
          'fixed inset-0 z-40 bg-slate-600 bg-opacity-75 transition-opacity ease-linear duration-300',
          sidebarOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={() => setSidebarOpen(false)}
        aria-hidden="true"
      />

      {/* Mobile sidebar */}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-40 w-72 flex flex-col bg-white transform transition ease-in-out duration-300 shadow-lg',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-16 flex items-center justify-between px-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center">
            <Database className="h-7 w-7 text-primary" />
            <span className="ml-2 text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              Concept2Cure
            </span>
          </div>
          <button
            type="button"
            className="h-10 w-10 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-500 focus:outline-none"
            onClick={() => setSidebarOpen(false)}
          >
            <XCircle className="h-6 w-6" />
          </button>
        </div>

        <div className="flex-1 h-0 overflow-y-auto">
          <nav className="px-3 py-5 space-y-1">
            <NavItem href="/dashboard" icon={<LayoutDashboard />}>
              Dashboard
            </NavItem>
            <NavItem href="/reports" icon={<FileText />}>
              CSR Reports
            </NavItem>
            <NavItem href="/upload" icon={<Upload />}>
              Upload CSR
            </NavItem>
            <NavItem href="/analytics" icon={<BarChart2 />}>
              Analytics
            </NavItem>
            <NavItem href="/statistical-modeling" icon={<FileSymlink />}>
              Statistical Modeling
            </NavItem>
            <NavItem href="/use-cases" icon={<BookOpen />}>
              Use Case Library
            </NavItem>
            <NavItem href="/fail-map" icon={<AlertTriangle />}>
              Real-World Fail Map
            </NavItem>

            <div className="pt-5 mt-5 border-t border-slate-200">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                AI Tools
              </h3>
              <div className="space-y-1">
                <NavItem href="/protocol-designer" icon={<ClipboardList />}>
                  Protocol Designer
                </NavItem>
                <NavItem href="/study-design-agent" icon={<Lightbulb />}>
                  Study Design Agent
                </NavItem>
                <NavItem href="/translation" icon={<Globe />}>
                  Translation Service
                </NavItem>
                <NavItem href="/academic-knowledge-demo" icon={<GraduationCap />}>
                  Academic Knowledge
                </NavItem>
              </div>
            </div>

            <div className="pt-5 mt-5 border-t border-slate-200">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Strategic Services
              </h3>
              <div className="space-y-1">
                <NavItem href="/competitive-intelligence" icon={<Target />}>
                  Strategic Intelligence
                </NavItem>
                <NavItem href="/predicate-intelligence" icon={<Radar />}>
                  Predicate Intelligence
                </NavItem>
              </div>
            </div>

            <div className="pt-5 mt-5 border-t border-slate-200">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Settings
              </h3>
              <div className="space-y-1">
                <NavItem href="/settings" icon={<Settings />}>
                  Account Settings
                </NavItem>
              </div>
            </div>
            <div className="pt-5 mt-5 border-t border-slate-200">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Concept2Cure
              </h3>
              <div className="space-y-1">
                <NavItem href="/lumen-bio/dashboard" icon={<Microscope />}>
                  Concept2Cure Dashboard
                </NavItem>
              </div>
            </div>
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-64 lg:border-r lg:border-slate-200 lg:bg-white lg:shadow-sm">
        <div className="h-16 flex items-center justify-center px-6 border-b border-slate-200 bg-slate-50">
          <Database className="h-8 w-8 text-primary" />
          <span className="ml-2 text-xl font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            Concept2Cure
          </span>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto pt-5">
          <nav className="flex-1 px-3 space-y-1">
            <NavItem href="/dashboard" icon={<LayoutDashboard />}>
              Dashboard
            </NavItem>
            <NavItem href="/reports" icon={<FileText />}>
              CSR Reports
            </NavItem>
            <NavItem href="/upload" icon={<Upload />}>
              Upload CSR
            </NavItem>
            <NavItem href="/analytics" icon={<BarChart2 />}>
              Analytics
            </NavItem>
            <NavItem href="/statistical-modeling" icon={<FileSymlink />}>
              Statistical Modeling
            </NavItem>
            <NavItem href="/use-cases" icon={<BookOpen />}>
              Use Case Library
            </NavItem>
            <NavItem href="/fail-map" icon={<AlertTriangle />}>
              Real-World Fail Map
            </NavItem>

            <div className="pt-5 mt-5 border-t border-slate-200">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                AI Tools
              </h3>
              <div className="space-y-1">
                <NavItem href="/protocol-designer" icon={<ClipboardList />}>
                  Protocol Designer
                </NavItem>
                <NavItem href="/study-design-agent" icon={<Lightbulb />}>
                  Study Design Agent
                </NavItem>
                <NavItem href="/translation" icon={<Globe />}>
                  Translation Service
                </NavItem>
                <NavItem href="/academic-knowledge-demo" icon={<GraduationCap />}>
                  Academic Knowledge
                </NavItem>
              </div>
            </div>

            <div className="pt-5 mt-5 border-t border-slate-200">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Strategic Services
              </h3>
              <div className="space-y-1">
                <NavItem href="/competitive-intelligence" icon={<Target />}>
                  Strategic Intelligence
                </NavItem>
                <NavItem href="/predicate-intelligence" icon={<Radar />}>
                  Predicate Intelligence
                </NavItem>
              </div>
            </div>

            <div className="pt-5 mt-5 border-t border-slate-200">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Settings
              </h3>
              <div className="space-y-1">
                <NavItem href="/settings" icon={<Settings />}>
                  Account Settings
                </NavItem>
              </div>
            </div>
            <div className="pt-5 mt-5 border-t border-slate-200">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Concept2Cure
              </h3>
              <div className="space-y-1">
                <NavItem href="/lumen-bio/dashboard" icon={<Microscope />}>
                  Concept2Cure Dashboard
                </NavItem>
              </div>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
