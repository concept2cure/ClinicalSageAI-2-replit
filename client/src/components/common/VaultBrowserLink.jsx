import React from 'react';
import { Link } from 'wouter';
import { Database, ExternalLink } from 'lucide-react'
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

/**
 * VaultBrowserLink Component
 *
 * Provides a direct link to access the VAULT Document Browser
 * from anywhere in the application.
 */
const VaultBrowserLink = ({ className }) => {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <Button variant="outline" className={`flex items-center ${className || ''}`} asChild>
            <Link href="/vault-browser">
              <Database className="h-4 w-4 mr-2" />
              <span>VAULT Document Browser</span>
              <ExternalLink className="h-3 w-3 ml-2" />
            </Link>
          </Button>
        </TooltipTrigger>
        <TooltipContent>
          <p>Access the Windows-style VAULT Document Browser</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
};

export default VaultBrowserLink;
