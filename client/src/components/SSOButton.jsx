import React from 'react';
import { Button } from '@/components/ui/button';
import { Shield } from 'lucide-react'

export default function SSOButton({ projectId, className }) {
  const handleSSO = () => {
    window.location.href = `/saml/${projectId}/login`;
  };

  return (
    <Button variant="outline" className={className} onClick={handleSSO} disabled={!projectId}>
      <Shield className="mr-2 h-4 w-4" />
      SSO Login
    </Button>
  );
}
