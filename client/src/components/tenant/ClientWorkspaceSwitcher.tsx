import React, { useState } from 'react';
import { useTenant } from '../../contexts/TenantContext';

// Define ClientWorkspace type inline
interface ClientWorkspace {
 id: string;
 name: string;
 organizationId: string;
 logo?: string;
}
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import {
 Command,
 CommandEmpty,
 CommandGroup,
 CommandInput,
 CommandItem,
 CommandList,
 CommandSeparator,
} from '../ui/command';
import { Button } from '../ui/button';
import { Check, ChevronsUpDown, Users, Settings, Building2 } from 'lucide-react';
import { cn } from '../../lib/utils';
import { useLocation } from 'wouter';
import { Skeleton } from '../ui/skeleton';

export function ClientWorkspaceSwitcher() {
 const tenantContext = useTenant();

 // If tenant context is undefined, return early
 if (!tenantContext) return null;

 const {
 currentClientWorkspace,
 setCurrentClientWorkspace,
 filteredClientWorkspaces = [], // Use filtered client workspaces based on selected organization
 isLoading = false, // Provide default value
 } = tenantContext;

 console.log('🎯 ClientWorkspaceSwitcher Debug:', {
 currentOrganization: tenantContext.currentOrganization?.id,
 currentClientWorkspace: currentClientWorkspace?.name,
 filteredClientWorkspaces: filteredClientWorkspaces.map(
 c => `${c.name} (orgId: ${c.organizationId})`
 ),
 totalCount: filteredClientWorkspaces.length,
 isLoading,
 });

 const [open, setOpen] = useState(false);
 const [, navigate] = useLocation();

 // If no client workspaces available and we're not loading, show a placeholder button
 if (filteredClientWorkspaces.length === 0 && !isLoading) {
 console.log('⚠️ ClientWorkspaceSwitcher: No client workspaces found, showing placeholder');
 return (
 <Button
 variant="outline"
 onClick={() => navigate('/client-management')}
 className="flex items-center justify-between w-[240px] px-3 py-2 h-10 border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors"
 >
 <div className="flex items-center gap-3 truncate">
 <div className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-400">
 <Users className="h-3 w-3" />
 </div>
 <span className="truncate font-medium text-stone-500">No Clients Available</span>
 </div>
 <Settings className="ml-2 h-4 w-4 shrink-0 text-stone-400" />
 </Button>
 );
 }

 if (isLoading) {
 return (
 <div className="flex items-center justify-between w-[240px] px-3 py-2 h-10 border border-stone-200 rounded-md bg-stone-50">
 <div className="flex items-center gap-3">
 <Skeleton className="h-6 w-6 rounded-full" />
 <Skeleton className="h-4 w-24" />
 </div>
 <Skeleton className="h-4 w-4" />
 </div>
 );
 }

 const handleSelect = (client: ClientWorkspace) => {
 console.log('🎯 ClientWorkspaceSwitcher handleSelect called with:', client);
 console.log('🎯 Current client workspace ID:', currentClientWorkspace?.id);
 console.log('🎯 Selected client ID:', client.id);

 // Only allow selection of clients from the current organization

 if (client.id !== currentClientWorkspace?.id) {
 console.log('🎯 Setting new client workspace:', client);
 setCurrentClientWorkspace(client);
 // Close the popover after selection
 setOpen(false);
 } else {
 console.log('🎯 Same client selected, not changing');
 }
 };

 const handleManageClients = () => {
 setOpen(false);
 navigate('/client-management');
 };

 return (
 <Popover open={open} onOpenChange={setOpen}>
 <PopoverTrigger asChild>
 <Button
 variant="outline"
 role="combobox"
 aria-expanded={open}
 aria-label="Select a client workspace"
 className="flex items-center justify-between w-[240px] px-3 py-2 h-10 border-stone-200 hover:border-stone-300 hover:bg-stone-50 transition-colors"
 >
 <div className="flex items-center gap-3 truncate">
 <div className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-stone-600">
 <Users className="h-3 w-3" />
 </div>
 <span className="truncate font-medium text-stone-700">
 {currentClientWorkspace?.name || 'Select Client'}
 </span>
 </div>
 <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 text-stone-400" />
 </Button>
 </PopoverTrigger>
 <PopoverContent
 className="w-[260px] p-0 z-50 shadow-sm border border-stone-200 bg-white rounded-lg"
 align="start"
 sideOffset={8}
 side="bottom"
 avoidCollisions={true}
 collisionPadding={10}
 >
 <Command className="rounded-lg">
 <div className="px-3 py-2 border-b border-stone-100">
 <CommandInput
 placeholder="Search client..."
 className="border-0 p-0 text-sm focus:ring-0 placeholder:text-stone-400"
 />
 </div>
 <CommandList className="max-h-[320px] overflow-auto">
 <CommandEmpty className="py-6 text-center text-sm text-stone-500">
 No client workspace found.
 </CommandEmpty>
 <CommandGroup>
 <div className="px-3 py-2 text-xs font-semibold text-stone-500 uppercase tracking-wide">
 Client Workspaces
 </div>
 {filteredClientWorkspaces.map(client => (
 <CommandItem
 key={client.id}
 value={client.id}
 onSelect={value => {
 console.log('🎯 CommandItem onSelect triggered with value:', value);
 const selectedClient = filteredClientWorkspaces.find(c => c.id === value);
 console.log('🎯 Found client:', selectedClient);
 if (selectedClient) {
 handleSelect(selectedClient);
 }
 }}
 className="mx-2 mb-1 rounded-md px-3 py-2.5 text-sm cursor-pointer hover:bg-stone-50 data-[selected]:bg-stone-100 data-[selected]:text-stone-900"
 >
 <div className="flex items-center gap-3 truncate flex-1">
 <div className="flex items-center justify-center w-8 h-8 rounded-full bg-stone-100 text-stone-600">
 <Building2 className="h-4 w-4" />
 </div>
 <div className="flex flex-col truncate">
 <span className="truncate font-medium text-stone-900">{client.name}</span>
 <span className="text-xs text-stone-500">Workspace</span>
 </div>
 </div>
 <Check
 className={cn(
 'ml-auto h-4 w-4 text-stone-600',
 currentClientWorkspace?.id === client.id ? 'opacity-100' : 'opacity-0'
 )}
 />
 </CommandItem>
 ))}
 </CommandGroup>
 <div className="border-t border-stone-100 mt-2">
 <CommandGroup>
 <CommandItem
 value="manage-clients"
 onSelect={value => {
 console.log('🎯 Manage Clients selected:', value);
 handleManageClients();
 }}
 className="mx-2 my-2 rounded-md px-3 py-2.5 text-sm cursor-pointer hover:bg-stone-50 data-[selected]:bg-stone-100"
 >
 <div className="flex items-center gap-3">
 <div className="flex items-center justify-center w-8 h-8 rounded-full bg-stone-100 text-stone-600">
 <Settings className="h-4 w-4" />
 </div>
 <span className="font-medium text-stone-700">Manage Clients</span>
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
