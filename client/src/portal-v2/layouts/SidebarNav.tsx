/**
 * Concept2Cure Client Portal V2 - Sidebar Navigation
 *
 * Enterprise navigation sidebar with:
 * - Module groups organized by category
 * - Active module highlighting
 * - Collapsible sidebar
 * - Recent modules quick access
 * - Favorites support
 * - Role-based module visibility
 * - Intent-based command input (Week 4 integration)
 */

import React, { useState, useMemo, useCallback } from 'react';
import { useLocation } from 'wouter';
import {
  LayoutGrid,
  ShieldCheck,
  BookOpen,
  Settings,
  FileText,
  FlaskConical,
  Activity,
  Users,
  Briefcase,
  Scale,
  LineChart,
  Cog,
  ChevronDown,
  ChevronRight,
  Star,
  Clock,
  PanelLeftClose,
  PanelLeftOpen,
  Zap,
  FolderOpen,
  ClipboardList,
  Beaker,
  Building2,
  ScrollText,
  Microscope,
  Pill,
  Workflow,
  Brain,
  Shield,
  GraduationCap,
  Command,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { ScrollArea } from '@/components/ui/scroll-area';
import { usePortal, useModuleAccess } from '../core/portalContext';
import { getNavigationSections, MODULE_REGISTRY, CATEGORY_REGISTRY } from '../core/moduleRegistry';
import { useIntentEngine } from '../services/intentEngine';
import type { ModuleId, ModuleCategory } from '../core/portalTypes';

// Icon mapping for modules
const moduleIcons: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutGrid,
  vault: FolderOpen,
  regulatory_intel: ShieldCheck,
  cmc_platform: Beaker,
  clinical_trial: FlaskConical,
  quality_management: Shield,
  document_control: FileText,
  analytics: LineChart,
  ind_automation: Workflow,
  cer_generator: ScrollText,
  protocol_designer: ClipboardList,
  safety_database: Activity,
  biostatistics: Microscope,
  medical_writing: BookOpen,
  dossier_builder: Building2,
  submission_tracker: Briefcase,
  audit_trail: Scale,
  platform_readiness: Activity,
  settings: Settings,
};

// Category icons - must include all ModuleCategory values
const categoryIcons: Record<ModuleCategory, React.ComponentType<{ className?: string }>> = {
  core: LayoutGrid,
  regulatory: ShieldCheck,
  clinical: FlaskConical,
  quality: Shield,
  analytics: LineChart,
  administration: Cog,
  // Additional categories from portalTypes.ts
  system: Settings,
  submissions: Briefcase,
  intelligence: Brain,
  operations: Workflow,
};

// Route mapping for modules — keys must match ModuleId values in portalTypes.ts
const moduleRouteMap: Record<string, string> = {
  dashboard: '/client-portal',
  vault: '/client-portal/vault',
  cer_generator: '/client-portal/cer-generator',
  '510k_builder': '/client-portal/510k-builder',
  ectd_coauthor: '/client-portal/ectd-coauthor',
  regulatory_intel: '/client-portal/regulatory-intel',
  cmc_platform: '/client-portal/cmc-wizard',
  clinical_trial: '/client-portal/study-architect',
  safety_reporting: '/client-portal/safety',
  quality_management: '/client-portal/quality',
  document_control: '/client-portal/documents',
  training: '/client-portal/training',
  analytics: '/client-portal/analytics',
  ai_assistant: '/client-portal/ai-assistant',
  lumen_cortex: '/client-portal/lumen-cortex',
  project_hub: '/client-portal/project-hub',
  timeline_planner: '/client-portal/timeline-planner',
  platform_readiness: '/admin/platform-readiness',
  settings: '/client-portal/settings',
};

interface SidebarNavProps {
  collapsed?: boolean;
  onCollapseChange?: (collapsed: boolean) => void;
}

export const SidebarNav: React.FC<SidebarNavProps> = ({
  collapsed: controlledCollapsed,
  onCollapseChange,
}) => {
  const [location, setLocation] = useLocation();
  const {
    experience,
    activeModule,
    setActiveModule,
    recentModules,
    sidebarCollapsed,
    setSidebarCollapsed,
  } = usePortal();
  const { hasAccess } = useModuleAccess();
  const { processIntent, setContext } = useIntentEngine();

  // Command input state
  const [commandInput, setCommandInput] = useState('');
  const [commandFeedback, setCommandFeedback] = useState<string | null>(null);

  // Use controlled or internal collapse state
  const isCollapsed = controlledCollapsed ?? sidebarCollapsed;
  const setCollapsed = onCollapseChange ?? setSidebarCollapsed;

  // Expanded section state
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['core', 'regulatory'])
  );

  // Update intent engine context when role changes
  React.useEffect(() => {
    setContext({ userRole: experience.role, activeModule });
  }, [experience.role, activeModule, setContext]);

  // Handle command input submission
  const handleCommandSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!commandInput.trim()) return;

      const result = processIntent(commandInput);

      if (result.matched && result.match) {
        const { intent, confidence } = result.match;

        // Navigate to the matched module
        if (intent.params?.route) {
          setLocation(intent.params.route);
          setActiveModule(intent.moduleId as ModuleId);
          setCommandFeedback(`Navigating to ${intent.description || intent.moduleId}...`);
        } else {
          setCommandFeedback(
            `Intent: ${intent.action} ${intent.moduleId} (${Math.round(confidence * 100)}% confidence)`
          );
        }

        setCommandInput('');
      } else {
        setCommandFeedback(
          result.suggestion || 'No matching command found. Try "help" for options.'
        );
      }

      // Clear feedback after 3 seconds
      setTimeout(() => setCommandFeedback(null), 3000);
    },
    [commandInput, processIntent, setLocation, setActiveModule]
  );

  // Get navigation sections based on user role
  const navigationSections = useMemo(() => {
    return getNavigationSections(experience.role);
  }, [experience.role]);

  // Filter modules by access
  const accessibleModules = useMemo(() => {
    return experience.modules.filter(moduleId => hasAccess(moduleId));
  }, [experience.modules, hasAccess]);

  // Group modules by category
  const groupedModules = useMemo(() => {
    const groups: Record<string, typeof accessibleModules> = {};

    accessibleModules.forEach(moduleId => {
      const module = MODULE_REGISTRY[moduleId];
      if (module) {
        const category = module.category;
        if (!groups[category]) {
          groups[category] = [];
        }
        groups[category].push(moduleId);
      }
    });

    return groups;
  }, [accessibleModules]);

  // Get current active module from URL
  const currentActiveModule = useMemo(() => {
    const moduleEntry = Object.entries(moduleRouteMap).find(([, route]) => {
      if (route === '/client-portal') {
        return location === '/client-portal' || location === '/client-portal/';
      }
      return location.startsWith(route);
    });
    return moduleEntry ? (moduleEntry[0] as ModuleId) : 'dashboard';
  }, [location]);

  const toggleSection = (category: string) => {
    setExpandedSections(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const handleModuleClick = (moduleId: ModuleId) => {
    const route = moduleRouteMap[moduleId] || '/client-portal';
    setActiveModule(moduleId);
    setLocation(route);
  };

  const renderModuleItem = (moduleId: ModuleId) => {
    const module = MODULE_REGISTRY[moduleId];
    if (!module) return null;

    const Icon = moduleIcons[moduleId] || LayoutGrid;
    const isActive = currentActiveModule === moduleId;
    const route = moduleRouteMap[moduleId] || '/client-portal';

    if (isCollapsed) {
      return (
        <TooltipProvider key={moduleId}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              <button
                onClick={() => handleModuleClick(moduleId)}
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                  isActive
                    ? 'bg-blue-100 text-blue-700'
                    : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                )}
              >
                <Icon className="h-5 w-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="flex items-center gap-2">
              <span>{module.label}</span>
              {module.badge && (
                <Badge variant="secondary" className="text-[10px]">
                  {module.badge}
                </Badge>
              )}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      );
    }

    return (
      <button
        key={moduleId}
        onClick={() => handleModuleClick(moduleId)}
        className={cn(
          'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
          isActive
            ? 'bg-blue-50 font-medium text-blue-700'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
        )}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{module.label}</span>
        {module.badge && (
          <Badge
            variant={module.badge === 'New' ? 'default' : 'secondary'}
            className="ml-auto text-[10px]"
          >
            {module.badge}
          </Badge>
        )}
      </button>
    );
  };

  const renderSection = (category: ModuleCategory) => {
    const modules = groupedModules[category];
    if (!modules || modules.length === 0) return null;

    const categoryInfo = CATEGORY_REGISTRY[category];
    const CategoryIcon = categoryIcons[category];
    const isExpanded = expandedSections.has(category);

    if (isCollapsed) {
      return (
        <div key={category} className="flex flex-col items-center gap-1 py-2">
          {modules.map(moduleId => renderModuleItem(moduleId))}
        </div>
      );
    }

    return (
      <div key={category} className="py-2">
        <button
          onClick={() => toggleSection(category)}
          className="flex w-full items-center gap-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-gray-500 hover:text-gray-700"
        >
          {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
          <CategoryIcon className="h-3.5 w-3.5" />
          <span>{categoryInfo.label}</span>
          <Badge variant="outline" className="ml-auto text-[10px]">
            {modules.length}
          </Badge>
        </button>
        {isExpanded && (
          <div className="mt-1 space-y-0.5 pl-2">
            {modules.map(moduleId => renderModuleItem(moduleId))}
          </div>
        )}
      </div>
    );
  };

  // Order of categories to display
  const categoryOrder: ModuleCategory[] = [
    'core',
    'regulatory',
    'clinical',
    'quality',
    'analytics',
    'administration',
  ];

  return (
    <aside
      className={cn(
        'hidden flex-col border-r bg-white transition-all duration-200 lg:flex',
        isCollapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Sidebar header */}
      <div
        className={cn(
          'flex items-center border-b',
          isCollapsed ? 'justify-center p-2' : 'justify-between px-4 py-3'
        )}
      >
        {!isCollapsed && (
          <div className="flex items-center gap-2">
            <img src="/src/assets/concept2cure-logo.jpg" alt="Concept2Cure" className="h-8 w-8 rounded-lg" />
            <div>
              <div className="text-sm font-bold text-gray-900">Concept2Cure</div>
              <div className="text-xs text-muted-foreground">Client Portal</div>
            </div>
          </div>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={() => setCollapsed(!isCollapsed)}
        >
          {isCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Recent modules (only when expanded) */}
      {!isCollapsed && recentModules.length > 0 && (
        <div className="border-b px-3 py-2">
          <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>Recent</span>
          </div>
          <div className="flex flex-wrap gap-1">
            {recentModules.slice(0, 3).map(moduleId => {
              const module = MODULE_REGISTRY[moduleId];
              if (!module) return null;
              return (
                <Button
                  key={moduleId}
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleModuleClick(moduleId)}
                >
                  {module.label}
                </Button>
              );
            })}
          </div>
        </div>
      )}

      {/* Command Input - Intent Engine Integration */}
      {!isCollapsed && (
        <div className="border-b px-3 py-2">
          <form onSubmit={handleCommandSubmit}>
            <div className="relative">
              <Command className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Type a command..."
                value={commandInput}
                onChange={e => setCommandInput(e.target.value)}
                className="h-8 pl-8 pr-8 text-xs"
              />
              <button
                type="submit"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <Search className="h-3.5 w-3.5" />
              </button>
            </div>
            {commandFeedback && (
              <div className="mt-1.5 text-[10px] text-blue-600 animate-pulse">
                {commandFeedback}
              </div>
            )}
          </form>
          <div className="mt-1 text-[10px] text-muted-foreground">
            Try: "open vault", "510k", "analytics"
          </div>
        </div>
      )}

      {/* Navigation sections */}
      <ScrollArea className="flex-1">
        <nav className={cn('p-2', isCollapsed && 'flex flex-col items-center')}>
          {categoryOrder.map(category => renderSection(category))}
        </nav>
      </ScrollArea>

      {/* Footer */}
      <div className={cn('border-t', isCollapsed ? 'p-2' : 'p-3')}>
        {isCollapsed ? (
          <TooltipProvider>
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={() => handleModuleClick('settings')}
                  className={cn(
                    'flex h-10 w-10 items-center justify-center rounded-md transition-colors',
                    currentActiveModule === 'settings'
                      ? 'bg-blue-100 text-blue-700'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                  )}
                >
                  <Settings className="h-5 w-5" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="right">Settings</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ) : (
          <button
            onClick={() => handleModuleClick('settings')}
            className={cn(
              'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors',
              currentActiveModule === 'settings'
                ? 'bg-blue-50 font-medium text-blue-700'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            )}
          >
            <Settings className="h-4 w-4" />
            <span>Settings</span>
          </button>
        )}
      </div>
    </aside>
  );
};
