import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import EmbeddedCodingAgent from '../components/ai/EmbeddedCodingAgent';
import { LifeBuoy, ShieldCheck, Settings } from 'lucide-react';
import { useLocation } from 'wouter';

const SupportHub = () => {
  const [, setLocation] = useLocation();

  return (
    <div className="container mx-auto px-6 py-8 space-y-6">
      <div className="flex items-center gap-3">
        <LifeBuoy className="h-7 w-7 text-indigo-600" />
        <div>
          <h1 className="text-3xl font-bold">Support Command Center</h1>
          <p className="text-muted-foreground mt-1">
            Full-access operational support, troubleshooting, and rapid response workflows.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Settings className="h-5 w-5 text-blue-600" />
              Client Admin
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Manage client access, licensing, and environment configuration.
            </p>
            <Button variant="outline" onClick={() => setLocation('/admin')}>
              Open Admin Console
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              Security & Compliance
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Review audit trails, security controls, and compliance dashboards.
            </p>
            <Button variant="outline" onClick={() => setLocation('/security')}>
              Open Security Hub
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <LifeBuoy className="h-5 w-5 text-purple-600" />
              Live Support
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-3">
              Connect to the embedded support agent for immediate triage and execution.
            </p>
            <Button variant="outline" onClick={() => setLocation('/support#agent')}>
              Jump to Agent
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card id="agent">
        <CardHeader>
          <CardTitle>Embedded Support Agent</CardTitle>
        </CardHeader>
        <CardContent>
          <EmbeddedCodingAgent />
        </CardContent>
      </Card>
    </div>
  );
};

export default SupportHub;
