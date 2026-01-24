import React from 'react';
import { Badge } from '../ui/badge';
import { Building2 } from 'lucide-react';
import { useTenant } from '../../contexts/TenantContext';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '../ui/tooltip';

interface TenantBadgeProps {
  showName?: boolean;
  className?: string;
}

/**
 * A badge that displays the current tenant information.
 * Used to provide context to users about which tenant they're currently working in.
 */
export function TenantBadge({ showName = true, className = '' }: TenantBadgeProps) {
  const { currentTenant } = useTenant();

  if (!currentTenant) return null;

  // Determine badge variant based on tenant tier
  const getBadgeVariant = () => {
    switch (currentTenant.tier) {
      case 'enterprise':
        return 'default';
      case 'professional':
        return 'secondary';
      default:
        return 'outline';
    }
  };

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge variant={getBadgeVariant()} className={`flex items-center gap-1 ${className}`}>
            <Building2 className="h-3 w-3" />
            {showName && <span>{currentTenant.name}</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent>
          <div className="text-xs">
            <p className="font-semibold">{currentTenant.name}</p>
            <p className="capitalize">{currentTenant.tier} Tier</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
