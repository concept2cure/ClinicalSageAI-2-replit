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
  Beaker,
  GraduationCap,
  BarChart,
  LineChart,
  PieChart,
  FolderOpen,
  Save,
  LogOut,
  User,
  ClipboardList as ClipboardIcon,
  FileOutput,
  BookOpen as BookIcon,
  ScrollText,
  Library,
  Split,
  SearchCode,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';

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
          'group flex items-center px-2 py-1.5 text-sm font-medium rounded-md transition-colors duration-150',
          isActive
            ? 'bg-primary/10 text-primary'
            : 'text-slate-700 hover:bg-slate-100 hover:text-primary'
        )}
      >
        <div
          className={cn(
            'mr-2 h-4 w-4 flex-shrink-0',
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
  const { user, logoutMutation } = useAuth();

  const handleLogout = () => {
    logoutMutation.mutate();
  };

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
          'fixed inset-y-0 left-0 z-40 w-64 flex flex-col bg-white transform transition ease-in-out duration-300 shadow-lg',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <div className="h-12 flex items-center justify-between px-3 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center">
            <Database className="h-6 w-6 text-primary" />
            <span className="ml-2 text-base font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
              LumenTrialGuide.AI
            </span>
          </div>
          <button
            type="button"
            className="h-8 w-8 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-500 focus:outline-none"
            onClick={() => setSidebarOpen(false)}
          >
            <XCircle className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 h-0 overflow-y-auto">
          {user && (
            <div className="px-2 py-2 mb-2 bg-slate-50 rounded-md border border-slate-200">
              <div className="flex items-center">
                <div className="p-1.5 bg-primary/10 rounded-full">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="ml-2">
                  <p className="text-sm font-medium text-slate-900 truncate">{user.email}</p>
                  <p className="text-xs text-slate-500">Logged in</p>
                </div>
              </div>
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleLogout}
                >
                  <LogOut className="h-3 w-3 mr-1" />
                  Sign out
                </Button>
              </div>
            </div>
          )}

          <nav className="px-2 py-3 space-y-0.5">
            <NavItem href="/" icon={<Database />}>
              Home
            </NavItem>
            <NavItem href="/dashboard" icon={<LayoutDashboard />}>
              Dashboard
            </NavItem>
            <NavItem href="/reports-analytics" icon={<FileText />}>
              Reports & Analytics
            </NavItem>
            <NavItem href="/upload" icon={<Upload />}>
              Upload CSR
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

            <div className="pt-5 mt-5 border-t border-slate-200/70">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-indigo-500 mr-1.5"></span>
                AI Tools
              </h3>
              <div className="space-y-1">
                <NavItem
                  href="/protocol-designer"
                  icon={<ClipboardList className="text-indigo-500" />}
                >
                  Protocol Designer
                </NavItem>
                <NavItem href="/cer-generator" icon={<FileCheck className="text-indigo-500" />}>
                  CER Generator
                </NavItem>
                <NavItem
                  href="/study-design-agent"
                  icon={<Lightbulb className="text-indigo-500" />}
                >
                  Study Design Agent
                </NavItem>
                <NavItem href="/translation" icon={<Globe className="text-indigo-500" />}>
                  Translation Service
                </NavItem>
                <NavItem
                  href="/academic-knowledge-demo"
                  icon={<GraduationCap className="text-indigo-500" />}
                >
                  Academic Knowledge
                </NavItem>
                <NavItem href="/academic-regulatory" icon={<Library className="text-indigo-500" />}>
                  Academic & Regulatory
                </NavItem>
                <NavItem href="/trial-predictor" icon={<BarChart className="text-indigo-500" />}>
                  Trial Success Predictor
                </NavItem>
                <NavItem href="/ind-automation" icon={<Beaker className="text-indigo-500" />}>
                  IND Automation
                </NavItem>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-200">
              <h3 className="px-2 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Strategic Services
              </h3>
              <div className="space-y-0.5">
                <NavItem href="/competitive-intelligence" icon={<Target />}>
                  Strategic Intelligence
                </NavItem>
                <NavItem href="/dossier" icon={<FolderOpen />}>
                  Protocol Dossier
                </NavItem>
                <NavItem href="/my-dossiers" icon={<Save />}>
                  My Dossiers
                </NavItem>
                <NavItem href="/export-log" icon={<FileOutput />}>
                  Export Log
                </NavItem>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-200">
              <h3 className="px-2 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Settings
              </h3>
              <div className="space-y-0.5">
                <NavItem href="/settings" icon={<Settings />}>
                  Account Settings
                </NavItem>
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-200">
              <h3 className="px-2 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Lumen Bio
              </h3>
              <div className="space-y-0.5">
                <NavItem href="/lumen-bio/dashboard" icon={<Microscope />}>
                  Lumen Bio Dashboard
                </NavItem>
              </div>
            </div>
          </nav>
        </div>
      </div>

      {/* Desktop sidebar */}
      <div className="hidden lg:flex lg:flex-col lg:fixed lg:inset-y-0 lg:w-56 lg:border-r lg:border-slate-200 lg:bg-white lg:shadow-sm">
        <div className="h-12 flex items-center justify-center px-3 border-b border-slate-200 bg-slate-50">
          <Database className="h-6 w-6 text-primary" />
          <span className="ml-2 text-base font-bold bg-gradient-to-r from-primary to-primary/80 bg-clip-text text-transparent">
            LumenTrialGuide.AI
          </span>
        </div>

        <div className="flex-1 flex flex-col overflow-y-auto pt-3">
          {user && (
            <div className="px-2 py-2 mb-2 bg-slate-50 rounded-md border border-slate-200 mx-2">
              <div className="flex items-center">
                <div className="p-1.5 bg-primary/10 rounded-full">
                  <User className="h-4 w-4 text-primary" />
                </div>
                <div className="ml-2">
                  <p className="text-sm font-medium text-slate-900 truncate">{user.email}</p>
                  <p className="text-xs text-slate-500">Logged in</p>
                </div>
              </div>
              <div className="mt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={handleLogout}
                >
                  <LogOut className="h-3 w-3 mr-1" />
                  Sign out
                </Button>
              </div>
            </div>
          )}

          <nav className="flex-1 px-2 space-y-0.5">
            <NavItem href="/" icon={<Database />}>
              Home
            </NavItem>
            <NavItem href="/dashboard" icon={<LayoutDashboard />}>
              Dashboard
            </NavItem>
            <NavItem href="/reports-analytics" icon={<FileText />}>
              Reports & Analytics
            </NavItem>
            <NavItem href="/upload" icon={<Upload />}>
              Upload CSR
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

            <div className="pt-5 mt-5 border-t border-slate-200/70">
              <h3 className="px-3 mb-2 text-xs font-semibold text-slate-500 uppercase tracking-wider flex items-center">
                <span className="w-1.5 h-1.5 rounded-full bg-gradient-to-r from-indigo-400 to-indigo-500 mr-1.5"></span>
                AI Tools
              </h3>
              <div className="space-y-1">
                <NavItem
                  href="/protocol-designer"
                  icon={<ClipboardList className="text-indigo-500" />}
                >
                  Protocol Designer
                </NavItem>
                <NavItem href="/cer-generator" icon={<FileCheck className="text-indigo-500" />}>
                  CER Generator
                </NavItem>
                <NavItem
                  href="/study-design-agent"
                  icon={<Lightbulb className="text-indigo-500" />}
                >
                  Study Design Agent
                </NavItem>
                <NavItem href="/translation" icon={<Globe className="text-indigo-500" />}>
                  Translation Service
                </NavItem>
                <NavItem
                  href="/academic-knowledge-demo"
                  icon={<GraduationCap className="text-indigo-500" />}
                >
                  Academic Knowledge
                </NavItem>
                <NavItem href="/academic-regulatory" icon={<Library className="text-indigo-500" />}>
                  Academic & Regulatory
                </NavItem>
                <NavItem href="/trial-predictor" icon={<BarChart className="text-indigo-500" />}>
                  Trial Success Predictor
                </NavItem>
                <NavItem href="/ind-automation" icon={<Beaker className="text-indigo-500" />}>
                  IND Automation
                </NavItem>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-200">
              <h3 className="px-2 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Strategic Services
              </h3>
              <div className="space-y-0.5">
                <NavItem href="/competitive-intelligence" icon={<Target />}>
                  Strategic Intelligence
                </NavItem>
                <NavItem href="/dossier" icon={<FolderOpen />}>
                  Protocol Dossier
                </NavItem>
                <NavItem href="/my-dossiers" icon={<Save />}>
                  My Dossiers
                </NavItem>
                <NavItem href="/export-log" icon={<FileOutput />}>
                  Export Log
                </NavItem>
              </div>
            </div>

            <div className="pt-3 mt-3 border-t border-slate-200">
              <h3 className="px-2 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Settings
              </h3>
              <div className="space-y-0.5">
                <NavItem href="/settings" icon={<Settings />}>
                  Account Settings
                </NavItem>
              </div>
            </div>
            <div className="pt-3 mt-3 border-t border-slate-200">
              <h3 className="px-2 mb-1 text-xs font-semibold text-slate-500 uppercase tracking-wider">
                Lumen Bio
              </h3>
              <div className="space-y-0.5">
                <NavItem href="/lumen-bio/dashboard" icon={<Microscope />}>
                  Lumen Bio Dashboard
                </NavItem>
              </div>
            </div>
          </nav>
        </div>
      </div>
    </>
  );
}
