/**
 * Client Portal Layout Component
 * 
 * Provides the main navigation shell and layout structure for the Client Portal.
 * Includes sidebar navigation, header, and content area.
 */

import { ReactNode, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { 
  Home, 
  FileText, 
  BarChart3, 
  Settings, 
  Users, 
  Bell, 
  Search,
  Menu,
  X,
  ChevronDown,
  LogOut,
  HelpCircle,
  Layers,
  Beaker,
  Brain,
  CheckCircle,
  Folder
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

interface ClientPortalLayoutProps {
  children: ReactNode;
}

const navigationItems = [
  { 
    name: 'Dashboard', 
    href: '/client-portal', 
    icon: Home,
    description: 'Overview and quick actions'
  },
  { 
    name: 'Documents', 
    href: '/client-portal/documents', 
    icon: FileText,
    description: 'Manage regulatory documents'
  },
  { 
    name: 'Projects', 
    href: '/client-portal/projects', 
    icon: Folder,
    description: 'Active submissions and projects'
  },
  { 
    name: 'Analytics', 
    href: '/client-portal/analytics', 
    icon: BarChart3,
    description: 'Insights and reports'
  },
  { 
    name: 'Team', 
    href: '/client-portal/team', 
    icon: Users,
    description: 'Manage team members'
  },
];

const solutionItems = [
  { name: 'IND Wizard', href: '/ind-wizard', icon: Beaker },
  { name: 'CSR Intelligence', href: '/csr-intelligence', icon: Brain },
  { name: 'Validation Hub', href: '/validation-hub-enhanced', icon: CheckCircle },
  { name: 'CMC Insights', href: '/cmc', icon: Layers },
];

export function ClientPortalLayout({ children }: ClientPortalLayoutProps) {
  const [location] = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-white border-r border-gray-200 transition-transform duration-300 lg:translate-x-0",
          mobileMenuOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
          !sidebarOpen && "lg:w-20"
        )}
      >
        {/* Logo */}
        <div className="flex h-16 items-center justify-between px-4 border-b border-gray-200">
          <Link href="/client-portal">
            <div className="flex items-center gap-2 cursor-pointer">
              <div className="h-8 w-8 rounded-lg bg-gradient-to-br from-blue-600 to-indigo-600 flex items-center justify-center">
                <span className="text-white font-bold text-sm">TS</span>
              </div>
              {sidebarOpen && (
                <span className="font-semibold text-gray-900">TrialSage</span>
              )}
            </div>
          </Link>
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(false)}
          >
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-4">
          <div className="space-y-1">
            {navigationItems.map((item) => {
              const isActive = location === item.href;
              return (
                <Link key={item.name} href={item.href}>
                  <div
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors cursor-pointer",
                      isActive
                        ? "bg-blue-50 text-blue-700"
                        : "text-gray-700 hover:bg-gray-100"
                    )}
                  >
                    <item.icon className={cn("h-5 w-5", isActive ? "text-blue-600" : "text-gray-500")} />
                    {sidebarOpen && <span>{item.name}</span>}
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Solutions Section */}
          {sidebarOpen && (
            <div className="mt-8">
              <h3 className="px-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Solutions
              </h3>
              <div className="mt-2 space-y-1">
                {solutionItems.map((item) => (
                  <Link key={item.name} href={item.href}>
                    <div className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 cursor-pointer">
                      <item.icon className="h-5 w-5 text-gray-500" />
                      <span>{item.name}</span>
                    </div>
                  </Link>
                ))}
              </div>
            </div>
          )}
        </nav>

        {/* User section */}
        <div className="border-t border-gray-200 p-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 rounded-lg p-2 hover:bg-gray-100 transition-colors">
                <Avatar className="h-9 w-9">
                  <AvatarImage src="/placeholder-avatar.jpg" />
                  <AvatarFallback className="bg-blue-100 text-blue-700">JD</AvatarFallback>
                </Avatar>
                {sidebarOpen && (
                  <div className="flex-1 text-left">
                    <p className="text-sm font-medium text-gray-900">John Doe</p>
                    <p className="text-xs text-gray-500">Admin</p>
                  </div>
                )}
                {sidebarOpen && <ChevronDown className="h-4 w-4 text-gray-500" />}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>My Account</DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem>
                <Settings className="mr-2 h-4 w-4" />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem>
                <HelpCircle className="mr-2 h-4 w-4" />
                Help & Support
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-red-600">
                <LogOut className="mr-2 h-4 w-4" />
                Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <div className={cn(
        "transition-all duration-300",
        sidebarOpen ? "lg:pl-64" : "lg:pl-20"
      )}>
        {/* Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center gap-4 border-b border-gray-200 bg-white px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            onClick={() => setMobileMenuOpen(true)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          <Button
            variant="ghost"
            size="icon"
            className="hidden lg:flex"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            <Menu className="h-5 w-5" />
          </Button>

          {/* Search */}
          <div className="flex-1 max-w-md">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
              <Input
                type="search"
                placeholder="Search documents, projects..."
                className="pl-10 bg-gray-50 border-gray-200 focus:bg-white"
              />
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Notifications */}
            <Button variant="ghost" size="icon" className="relative">
              <Bell className="h-5 w-5" />
              <span className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500" />
            </Button>

            {/* Help */}
            <Button variant="ghost" size="icon">
              <HelpCircle className="h-5 w-5" />
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1">
          {children}
        </main>
      </div>
    </div>
  );
}

export default ClientPortalLayout;
