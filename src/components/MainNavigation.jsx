import React, { useState, useEffect } from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import {
  Home,
  FileText,
  Beaker,
  BookOpen,
  Users,
  BookCheck,
  MessageSquare,
  PencilRuler,
  Microscope,
  Settings,
  BarChart2,
  Layers,
  ChevronLeft,
  ChevronRight,
  Bell,
  Search,
  Menu,
  Grid,
  ExternalLink,
  Lock,
  HelpCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { LumenAssistantButton } from '@/components/assistant';
import { ScrollArea } from '@/components/ui/scroll-area';

// Navigation Context menu for quick access to cross-module features
const CrossModuleFeatures = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="rounded-full">
          <Grid className="h-5 w-5" />
          <span className="sr-only">Navigation</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Quick Access</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <FileText className="mr-2 h-4 w-4" />
          <span>Create IND Submission</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Beaker className="mr-2 h-4 w-4" />
          <span>New CMC Blueprint</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <BookOpen className="mr-2 h-4 w-4" />
          <span>Draft Protocol</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>Recent Documents</DropdownMenuLabel>
        <DropdownMenuItem>
          <span className="truncate">Protocol v1.2 - IMD-2023</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <span className="truncate">CMC Section - RA-502</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <MessageSquare className="mr-2 h-4 w-4" />
          <span>Ask LUMEN AI Assistant</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Project Selector for switching between active projects
const ProjectSelector = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="w-full justify-start font-normal text-left">
          <div className="flex items-center">
            <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
            <span className="truncate">IND-123 - Novel RA Therapeutic</span>
            <ChevronRight className="h-4 w-4 ml-auto shrink-0" />
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="w-56">
        <DropdownMenuLabel>Active Projects</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem className="cursor-pointer">
          <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
          IND-123 - Novel RA Therapeutic
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer">
          <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
          IND-456 - Oncology Compound
        </DropdownMenuItem>
        <DropdownMenuItem className="cursor-pointer">
          <div className="w-2 h-2 rounded-full bg-blue-500 mr-2"></div>
          IND-789 - CNS Treatment
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Grid className="mr-2 h-4 w-4" />
          <span>All Projects</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <FileText className="mr-2 h-4 w-4" />
          <span>Create New Project</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// UserMenu component for account management and settings
const UserMenu = () => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="relative h-8 w-8 rounded-full">
          <Avatar className="h-8 w-8">
            <AvatarImage src="/avatar.png" alt="User" />
            <AvatarFallback>SC</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>My Account</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Users className="mr-2 h-4 w-4" />
          <span>Concept2Cures</span>
          <Badge className="ml-auto" variant="outline">
            Enterprise
          </Badge>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <Settings className="mr-2 h-4 w-4" />
          <span>Settings</span>
        </DropdownMenuItem>
        <DropdownMenuItem>
          <HelpCircle className="mr-2 h-4 w-4" />
          <span>Help & Resources</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem>
          <Lock className="mr-2 h-4 w-4" />
          <span>Log out</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

// Define module structure with sub-modules for comprehensive navigation
const modulesStructure = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: Home,
    description: 'Overview of your projects and activities',
    recentActivity: true,
  },
  {
    name: 'IND Wizard™',
    href: '/ind-wizard',
    icon: FileText,
    description: 'Complete IND application preparation',
    badge: 'Active',
    subModules: [
      { name: 'Overview', href: '/ind-wizard', exact: true },
      { name: 'Regulatory Intelligence', href: '/ind-wizard/regulatory-intelligence' },
      { name: 'Protocol Builder', href: '/ind-wizard/protocol' },
      { name: 'CMC Section', href: '/ind-wizard/cmc' },
      { name: 'Nonclinical Data', href: '/ind-wizard/nonclinical' },
      { name: 'FDA Forms', href: '/ind-wizard/forms' },
      { name: 'Medical Writer', href: '/ind-wizard/medical-writer' },
      { name: 'ASK LUMEN AI', href: '/ind-wizard/ai-assistant' },
    ],
  },
  {
    name: 'TrialSage Vault™',
    href: '/vault',
    icon: Layers,
    description: 'Document management system',
    subModules: [
      { name: 'Document Library', href: '/vault/documents' },
      { name: 'Regulatory Submissions', href: '/vault/submissions' },
      { name: 'Templates', href: '/vault/templates' },
      { name: 'Archives', href: '/vault/archives' },
      { name: 'Audit Trail', href: '/vault/audit-trail' },
    ],
  },
  {
    name: 'CMC Intelligence™',
    href: '/cmc',
    icon: Beaker,
    description: 'Chemistry, Manufacturing & Controls',
    subModules: [
      { name: 'Dashboard', href: '/cmc', exact: true },
      { name: 'Blueprint Generator', href: '/cmc/blueprints/new' },
      { name: 'Change Impact Simulator', href: '/cmc/impact-simulator/new' },
      { name: 'Manufacturing Tuner', href: '/cmc/manufacturing/new' },
      { name: 'Compliance Tools', href: '/cmc/compliance/new' },
      { name: 'CMC Analytics', href: '/cmc/analytics' },
    ],
  },
  {
    name: 'Study Architect™',
    href: '/study-architect',
    icon: BookOpen,
    description: 'Protocol and study design',
    subModules: [
      { name: 'Study Designs', href: '/study-architect/designs' },
      { name: 'Protocol Builder', href: '/study-architect/protocol' },
      { name: 'Endpoint Library', href: '/study-architect/endpoints' },
      { name: 'Statistical Analysis', href: '/study-architect/statistics' },
    ],
  },
  {
    name: 'CSR Intelligence™',
    href: '/csr-intelligence',
    icon: Microscope,
    description: 'Clinical Study Report building',
    subModules: [
      { name: 'CSR Dashboard', href: '/csr-intelligence', exact: true },
      { name: 'CSR Writer', href: '/csr-intelligence/writer' },
      { name: 'Results Integration', href: '/csr-intelligence/results' },
      { name: 'Safety Summaries', href: '/csr-intelligence/safety' },
    ],
  },
  {
    name: 'ICH Wiz™',
    href: '/ich-wiz',
    icon: BookCheck,
    description: 'Digital Compliance Coach',
    subModules: [
      { name: 'ICH Guidelines', href: '/ich-wiz/guidelines' },
      { name: 'Compliance Checker', href: '/ich-wiz/compliance' },
      { name: 'Implementation Tracker', href: '/ich-wiz/implementation' },
    ],
  },
  {
    name: 'Analytics Module',
    href: '/analytics',
    icon: BarChart2,
    description: 'Business intelligence dashboards',
    subModules: [
      { name: 'Project Metrics', href: '/analytics/projects' },
      { name: 'Regulatory Insights', href: '/analytics/regulatory' },
      { name: 'Team Performance', href: '/analytics/team' },
      { name: 'Compliance Reports', href: '/analytics/compliance' },
    ],
  },
];

export default function MainNavigation({ showLabels = true }) {
  const [location] = useLocation();
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeModuleIndex, setActiveModuleIndex] = useState(null);
  const [subMenuVisible, setSubMenuVisible] = useState(false);

  // Determine the active module based on location
  useEffect(() => {
    const index = modulesStructure.findIndex(
      module =>
        location === module.href ||
        (module.subModules &&
          module.subModules.some(sub =>
            sub.exact ? location === sub.href : location.startsWith(sub.href)
          ))
    );

    setActiveModuleIndex(index >= 0 ? index : null);

    // Show submenu when a module with submodules is active
    if (index >= 0 && modulesStructure[index].subModules) {
      setSubMenuVisible(true);
    }
  }, [location]);

  const activeModule = activeModuleIndex !== null ? modulesStructure[activeModuleIndex] : null;

  // Calculate if a submodule is active
  const isSubModuleActive = (href, exact) => {
    return exact ? location === href : location.startsWith(href);
  };

  return (
    <div className="flex h-screen">
      {/* Primary side navigation */}
      <div
        className={cn(
          'bg-white border-r transition-all duration-300 flex flex-col z-10',
          isExpanded ? 'w-64' : 'w-16'
        )}
      >
        {/* Logo and collapse button */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className={cn('flex items-center', !isExpanded && 'justify-center w-full')}>
            {isExpanded ? (
              <div className="font-bold text-lg flex items-center">
                <span className="text-primary">Trial</span>
                <span>Sage™</span>
              </div>
            ) : (
              <span className="font-bold text-lg text-primary">TS</span>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setIsExpanded(!isExpanded)}
            className={cn(!isExpanded && 'hidden')}
            aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            {isExpanded ? (
              <ChevronLeft className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )}
          </Button>
        </div>

        {/* Active project selector */}
        {isExpanded && (
          <div className="p-2 border-b">
            <ProjectSelector />
          </div>
        )}

        {/* Main navigation items */}
        <ScrollArea className="flex-1">
          <div className="py-2">
            <nav className="space-y-1 px-2">
              {modulesStructure.map((module, idx) => {
                const isActive = idx === activeModuleIndex;

                return (
                  <TooltipProvider key={module.name} delayDuration={300}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Link
                          href={module.href}
                          className="block"
                          onClick={() => {
                            if (module.subModules && idx === activeModuleIndex) {
                              setSubMenuVisible(!subMenuVisible);
                            } else if (module.subModules) {
                              setSubMenuVisible(true);
                            }
                          }}
                        >
                          <div
                            className={cn(
                              'flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors',
                              isActive
                                ? 'bg-primary/10 text-primary'
                                : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                            )}
                          >
                            <module.icon
                              className={cn(
                                'h-5 w-5 shrink-0',
                                isActive
                                  ? 'text-primary'
                                  : 'text-muted-foreground group-hover:text-foreground'
                              )}
                            />
                            {isExpanded && <span className="ml-3 truncate">{module.name}</span>}
                            {isExpanded && module.badge && (
                              <Badge variant="outline" className="ml-auto py-0.5 text-xs">
                                {module.badge}
                              </Badge>
                            )}
                            {isExpanded && module.subModules && (
                              <ChevronRight
                                className={cn(
                                  'h-4 w-4 ml-auto',
                                  isActive && subMenuVisible && 'transform rotate-90'
                                )}
                              />
                            )}
                          </div>
                        </Link>
                      </TooltipTrigger>
                      {!isExpanded && (
                        <TooltipContent side="right" className="font-normal">
                          {module.name}
                          {module.badge && (
                            <Badge variant="outline" className="ml-2 py-0 h-4 text-xs">
                              {module.badge}
                            </Badge>
                          )}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                );
              })}
            </nav>
          </div>
        </ScrollArea>

        {/* Footer area with user profile and quick actions */}
        <div className={cn('border-t pt-2 pb-4 px-3', !isExpanded && 'flex flex-col items-center')}>
          {isExpanded ? (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <UserMenu />
                <div className="flex space-x-1">
                  <Button variant="ghost" size="icon" className="rounded-full">
                    <Bell className="h-4 w-4" />
                  </Button>
                  <CrossModuleFeatures />
                  <LumenAssistantButton
                    variant="outline"
                    size="icon"
                    tooltip="Ask LUMEN AI Assistant"
                  />
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-4 flex flex-col items-center">
              <UserMenu />
              <CrossModuleFeatures />
              <LumenAssistantButton variant="outline" size="icon" tooltip="Ask LUMEN AI" />
            </div>
          )}
        </div>
      </div>

      {/* Secondary navigation (submenu) */}
      {activeModule && activeModule.subModules && subMenuVisible && isExpanded && (
        <div className="w-48 bg-gray-50 border-r flex flex-col">
          <div className="p-3 border-b bg-muted/30">
            <h3 className="font-medium text-sm">{activeModule.name}</h3>
          </div>
          <nav className="flex-1 py-2">
            {activeModule.subModules.map(subModule => (
              <Link key={subModule.name} href={subModule.href} className="block">
                <div
                  className={cn(
                    'px-4 py-1.5 text-sm',
                    isSubModuleActive(subModule.href, subModule.exact)
                      ? 'bg-primary/5 text-primary font-medium'
                      : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground'
                  )}
                >
                  {subModule.name}
                </div>
              </Link>
            ))}
          </nav>
        </div>
      )}
    </div>
  );
}
