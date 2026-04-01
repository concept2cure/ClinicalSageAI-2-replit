// /client/src/components/navigation/UnifiedTopNavV3.jsx

import React from 'react';
import { useLocation, Link } from 'wouter';
import { OrganizationSwitcher } from '../tenant/OrganizationSwitcher';
import { ClientWorkspaceSwitcher } from '../tenant/ClientWorkspaceSwitcher';
import { Settings, Users, Building2, Home, Sparkles } from 'lucide-react';
import { useAnAAssistant } from '../../contexts/AnAAssistantContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import HelpButton from '../common/HelpButton';

export default function UnifiedTopNavV3({
  activeTab,
  onTabChange = () => {},
  breadcrumbs = [],
  navItems = [],
}) {
  const [location, navigate] = useLocation();
  const { openAssistant } = useAnAAssistant();

  const utilityChipClass =
    'h-8 px-2.5 text-[11px] font-medium rounded-md border border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900 transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none flex items-center cursor-pointer';
  const utilityChipActiveClass = `${utilityChipClass} border-stone-300 bg-stone-100 text-stone-900`;
  const tabChipClass =
    'text-[12px] font-medium px-3 py-1.5 rounded-md border transition-colors focus-visible:ring-2 focus-visible:ring-stone-400 focus-visible:outline-none';
  const topTabs = [
    { label: 'Risk Heatmap', onClick: () => navigate('/regulatory-risk-dashboard') },
    { label: 'Timeline Simulator', onClick: () => navigate('/timeline') },
    {
      label: 'Ask AnA',
      onClick: () =>
        openAssistant('regulatory_affairs', {
          source: 'top_nav',
          route: location,
          breadcrumbs,
          activeTab,
          humanGoal: 'regulatory_decision_support',
        }),
      icon: Sparkles,
    },
  ];

  return (
    <div className="w-full sticky top-0 z-[100] bg-white/95 backdrop-blur-sm border-b border-stone-200 flex flex-col">
      {/* Top row - utility navigation only */}
      <div className="flex flex-col md:flex-row justify-between items-center px-3 py-2 border-b border-stone-100">
        <div className="flex flex-wrap items-center gap-2 mb-2 md:mb-0">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                try {
                  window.history.back();
                } catch (error) {
                  console.error('Back navigation error:', error);
                  navigate('/concept2cure');
                }
              }}
              className={utilityChipClass}
            >
              ← Back
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                try {
                  window.history.forward();
                } catch (error) {
                  console.error('Forward navigation error:', error);
                  navigate('/concept2cure');
                }
              }}
              className={utilityChipClass}
            >
              → Forward
            </Button>
            <Button asChild type="button" variant="ghost" size="sm" className={utilityChipActiveClass}>
              <Link href="/concept2cure">Concept2Cure</Link>
            </Button>
          </div>

          <div className="flex items-center gap-2 mt-2 md:mt-0">
            {/* Organization Switcher */}
            <div className="relative z-20">
              <OrganizationSwitcher />
            </div>

            {/* Client Workspace Switcher */}
            <div className="relative z-10 ml-2">
              <ClientWorkspaceSwitcher />
            </div>
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-2 mt-2 md:mt-0">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild type="button" variant="ghost" size="sm" className={utilityChipClass}>
                  <Link href="/settings">
                    <Settings className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">Settings</span>
                    <span className="sm:hidden">Set</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">
                  Personal account settings, preferences, and appearance options
                </p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild type="button" variant="ghost" size="sm" className={utilityChipClass}>
                  <Link href="/client-management">
                    <Users className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">Client Management</span>
                    <span className="sm:hidden">Clients</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                sideOffset={10}
                className="max-w-[350px] p-3 z-[9999] bg-white border shadow-lg"
              >
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-primary">Client Management</p>
                  <p className="text-xs">
                    Manage client workspaces, access controls, and compliance settings.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild type="button" variant="ghost" size="sm" className={utilityChipClass}>
                  <Link href="/tenant-management">
                    <Building2 className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">Organization Settings</span>
                    <span className="sm:hidden">Orgs</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent
                side="bottom"
                align="center"
                sideOffset={10}
                className="max-w-[350px] p-3 z-[9999] bg-white border shadow-lg"
              >
                <div className="space-y-2">
                  <p className="text-sm font-semibold text-primary">Organization Settings</p>
                  <p className="text-xs">
                    Configure tenant-level governance, permissions, and policy defaults.
                  </p>
                </div>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <Button asChild type="button" variant="ghost" size="sm" className={utilityChipClass}>
                  <Link href="/concept2cure">
                    <Home className="h-3 w-3 mr-1" />
                    <span className="hidden sm:inline">Open Workspace</span>
                    <span className="sm:hidden">Workspace</span>
                  </Link>
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p className="text-xs max-w-xs">
                  Open the canonical Concept2Cure workspace shell.
                </p>
              </TooltipContent>
            </Tooltip>

            {/* CSR Navigation Links - Added as per specifications */}
            {navItems.length > 0 &&
              navItems.map((item, index) => (
                <Tooltip key={index}>
                  <TooltipTrigger asChild>
                    <Button
                      asChild
                      type="button"
                      variant="ghost"
                      size="sm"
                      className={location === item.path ? utilityChipActiveClass : utilityChipClass}
                    >
                      <Link href={item.path}>
                        <span className="hidden sm:inline">{item.label}</span>
                        <span className="sm:hidden">{item.label.substring(0, 3)}</span>
                      </Link>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p className="text-xs max-w-xs">CSR {item.label}</p>
                  </TooltipContent>
                </Tooltip>
              ))}
          </TooltipProvider>
        </div>

        {/* Help Button */}
        <div className="flex items-center ml-4">
          <HelpButton
            position="inline"
            size="sm"
            variant="outline"
            className="text-gray-600 hover:text-gray-900"
          />
        </div>
      </div>

      {/* Breadcrumb Trail */}
      <div className="px-4 py-1 text-[11px] text-stone-500 font-medium bg-white border-b border-stone-100">
        {breadcrumbs.map((crumb, idx) => (
          <span key={idx}>
            {idx > 0 && ' > '}
            <span className="hover:underline cursor-default transition">{crumb}</span>
          </span>
        ))}
      </div>

      {/* Functional row - secondary actions only */}
      <div className="flex justify-center overflow-x-auto whitespace-nowrap gap-2 border-b border-stone-100 bg-white py-2 px-2">
        {topTabs.map(tab => {
          const Icon = tab.icon;
          const isActive =
            (tab.label === 'Risk Heatmap' && location === '/regulatory-risk-dashboard') ||
            (tab.label === 'Timeline Simulator' && location === '/timeline') ||
            activeTab === tab.label.replace(/ /g, '');
          return (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              key={tab.label}
              onClick={tab.onClick}
              className={
                isActive
                  ? `${tabChipClass} border-stone-300 bg-stone-100 text-stone-900`
                  : `${tabChipClass} border-stone-200 bg-white text-stone-600 hover:bg-stone-50 hover:text-stone-900`
              }
            >
              {Icon ? (
                <span className="flex items-center">
                  <Icon className="w-3.5 h-3.5 mr-1.5" />
                  {tab.label}
                </span>
              ) : (
                tab.label
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
