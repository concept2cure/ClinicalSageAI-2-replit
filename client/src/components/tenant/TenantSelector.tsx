import React, { useState } from 'react';
import { useTenant, Tenant } from '../../contexts/TenantContext';
import { Button } from '../ui/button';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, } from '../ui/dropdown-menu';
import { Building2, Check, ChevronsUpDown } from 'lucide-react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../ui/dialog';
import { Label } from '../ui/label';
import { Input } from '../ui/input';

export function TenantSelector() {
  const { currentTenant, setCurrentTenant, availableTenants } = useTenant();
  const [open, setOpen] = useState(false);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTenantName, setNewTenantName] = useState('');
  const [newTenantSlug, setNewTenantSlug] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Handler for switching tenants
  const handleSwitchTenant = (tenant: Tenant) => {
    setCurrentTenant(tenant);
    setOpen(false);
    // Reload the page to refresh data for the new tenant
    window.location.reload();
  };

  // Handler for creating a new tenant (for admin users)
  const handleCreateTenant = async () => {
    if (!newTenantName || !newTenantSlug) return;

    try {
      setIsSubmitting(true);

      const response = await fetch('/api/tenants', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: newTenantName,
          slug: newTenantSlug,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to create tenant');
      }

      const newTenant = await response.json();

      // Update available tenants list
      setCurrentTenant(newTenant);
      setShowCreateDialog(false);
      setNewTenantName('');
      setNewTenantSlug('');

      // Reload the page to refresh data for the new tenant
      window.location.reload();
    } catch (error) {
      console.error('Error creating tenant:', error);
      alert('Failed to create tenant. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Only show the selector if there are multiple tenants to choose from
  if (availableTenants.length <= 1) return null;

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="w-full justify-between">
            <div className="flex items-center gap-2">
              <Building2 className="h-4 w-4" />
              <span>{currentTenant?.name || 'Select Tenant'}</span>
            </div>
            <ChevronsUpDown className="h-4 w-4 opacity-50" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          <DropdownMenuLabel>Organizations</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {availableTenants.map(tenant => (
            <DropdownMenuItem
              key={tenant.id}
              onClick={() => handleSwitchTenant(tenant)}
              className="cursor-pointer"
            >
              <div className="flex items-center justify-between w-full">
                <span>{tenant.name}</span>
                {currentTenant?.id === tenant.id && <Check className="h-4 w-4" />}
              </div>
            </DropdownMenuItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onClick={() => setShowCreateDialog(true)}
            className="cursor-pointer text-primary"
          >
            Create New Organization
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Dialog for creating a new tenant */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New Organization</DialogTitle>
            <DialogDescription>
              Create a new organization to manage separate projects and data.
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="name" className="text-right">
                Name
              </Label>
              <Input
                id="name"
                value={newTenantName}
                onChange={e => setNewTenantName(e.target.value)}
                className="col-span-3"
                placeholder="Acme Corporation"
              />
            </div>
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="slug" className="text-right">
                URL Slug
              </Label>
              <Input
                id="slug"
                value={newTenantSlug}
                onChange={e =>
                  setNewTenantSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))
                }
                className="col-span-3"
                placeholder="acme-corp"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleCreateTenant}
              disabled={!newTenantName || !newTenantSlug || isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
