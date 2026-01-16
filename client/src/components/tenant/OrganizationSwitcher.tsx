import React, { useState, useEffect } from 'react';
import { useTenant } from '../../contexts/TenantContext';

// Define the Organization type inline
interface Organization {
  id: string;
  name: string;
  logo?: string;
}
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList, CommandSeparator, } from '../ui/command';
import { Button } from '../ui/button';
import { Check, ChevronsUpDown, Building, Settings, Building2 } from 'lucide-react'
import { cn } from '../../lib/utils';
import { useLocation } from 'wouter';
import { Skeleton } from '../ui/skeleton';

export function OrganizationSwitcher() {
  const tenantContext = useTenant();

  // If tenant context is undefined, return early
  if (!tenantContext) return null;

  const {
    currentOrganization,
    setCurrentOrganization,
    organizations = [], // Provide default empty array
    isLoading = false, // Provide default value
  } = tenantContext;

  const [open, setOpen] = useState(false);
  const [location, navigate] = useLocation();

  // Close dropdown when location changes to prevent overlap issues
  useEffect(() => {
    setOpen(false);
  }, [location]);

  // If no organizations available and we're not loading, show placeholder
  if (organizations.length === 0 && !isLoading) {
    return (
      <Button
        variant="outline"
        onClick={() => navigate('/tenant-management')}
        className="flex items-center justify-between w-[240px] px-3 py-2 h-10 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-3 truncate">
          <div className="flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-gray-400">
            <Building className="h-3 w-3" />
          </div>
          <span className="truncate font-medium text-gray-500">No Organizations Available</span>
        </div>
        <Settings className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
      </Button>
    );
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-between w-[240px] px-3 py-2 h-10 border border-gray-200 rounded-md bg-gray-50">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-6 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-4 w-4" />
      </div>
    );
  }

  const handleSelect = (org: Organization) => {
    console.log('🔧 OrganizationSwitcher handleSelect called:', {
      selectedOrg: org,
      currentOrg: currentOrganization,
      isReallyDifferent: org.id !== currentOrganization?.id,
    });

    // Always set the organization, even if it's the same (to ensure context is properly set)
    console.log('🔧 Setting current organization to:', org);
    setCurrentOrganization(org);

    // Also save to localStorage immediately
    localStorage.setItem('currentOrganizationId', String(org.id));
    console.log('🔧 Saved organization to localStorage:', org.id);

    console.log('🔧 Organization selection complete');
    // Close the popover after selection
    setOpen(false);
  };

  const handleManageOrganizations = () => {
    setOpen(false);

    // Navigation path for organization management
    // This path should match the route defined in App.jsx
    navigate('/tenant-management');

    // Log navigation for debugging purposes
    console.log('Navigating to tenant management page');
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label="Select an organization"
          className="flex items-center justify-between w-[240px] px-3 py-2 h-10 border-gray-200 hover:border-gray-300 hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-3 truncate">
            <div className="flex items-center justify-center w-6 h-6 rounded-full bg-green-100 text-green-600">
              {currentOrganization?.logo ? (
                <img
                  src={currentOrganization.logo}
                  alt={currentOrganization.name}
                  className="h-3 w-3 rounded-sm object-contain"
                />
              ) : (
                <Building className="h-3 w-3" />
              )}
            </div>
            <span className="truncate font-medium text-gray-700">
              {currentOrganization?.name || 'Select Organization'}
            </span>
          </div>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-gray-400" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[260px] p-0 z-50 shadow-xl border border-gray-200 bg-white rounded-lg"
        align="start"
        sideOffset={8}
        side="bottom"
        avoidCollisions={true}
        collisionPadding={10}
      >
        <Command className="rounded-lg">
          <div className="px-3 py-2 border-b border-gray-100">
            <CommandInput
              placeholder="Search organization..."
              className="border-0 p-0 text-sm focus:ring-0 placeholder:text-gray-400"
            />
          </div>
          <CommandList className="max-h-[320px] overflow-auto">
            <CommandEmpty className="py-6 text-center text-sm text-gray-500">
              No organization found.
            </CommandEmpty>
            <CommandGroup>
              <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                Organizations
              </div>
              {organizations.map(org => (
                <CommandItem
                  key={org.id}
                  onSelect={() => handleSelect({ ...org, id: String(org.id) })}
                  className="mx-2 mb-1 rounded-md px-3 py-2.5 text-sm cursor-pointer hover:bg-gray-50 data-[selected]:bg-green-50 data-[selected]:text-green-900"
                >
                  <div className="flex items-center gap-3 truncate flex-1">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gradient-to-br from-green-100 to-emerald-100 text-green-600">
                      {org.logo ? (
                        <img
                          src={org.logo}
                          alt={org.name}
                          className="h-4 w-4 rounded-sm object-contain"
                        />
                      ) : (
                        <Building2 className="h-4 w-4" />
                      )}
                    </div>
                    <div className="flex flex-col truncate">
                      <span className="truncate font-medium text-gray-900">{org.name}</span>
                      <span className="text-xs text-gray-500">Organization</span>
                    </div>
                  </div>
                  <Check
                    className={cn(
                      'ml-auto h-4 w-4 text-green-600',
                      currentOrganization?.id === org.id ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
            <div className="border-t border-gray-100 mt-2">
              <CommandGroup>
                <CommandItem
                  onSelect={handleManageOrganizations}
                  className="mx-2 my-2 rounded-md px-3 py-2.5 text-sm cursor-pointer hover:bg-gray-50 data-[selected]:bg-gray-100"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-600">
                      <Settings className="h-4 w-4" />
                    </div>
                    <span className="font-medium text-gray-700">Manage Organizations</span>
                  </div>
                </CommandItem>
              </CommandGroup>
            </div>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
