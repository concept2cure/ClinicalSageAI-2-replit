/**
 * Client Portal Landing
 *
 * This component serves as the landing page for the Client Portal module,
 * designed specifically for CRO users managing multiple biotech clients
 * and biotech users managing their own projects.
 *
 * It provides an intelligent project manager and next actions sidebar embedded directly
 * on the landing page for immediate access to priorities and tasks.
 */

import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useModuleIntegration, MODULES } from '../integration/ModuleIntegrationLayer';

// UI components
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Filter, LayoutDashboard, Plus, Search, Badge } from 'lucide-react'

// Custom components
import ClientHeader from './ClientHeader';
import ProjectManagerGrid from '../project-manager/ProjectManagerGrid';
import NextActionsSidebar from '../project-manager/NextActionsSidebar';
import VaultQuickAccess from '../vault/VaultQuickAccess';
import AnalyticsQuickView from '../analytics/AnalyticsQuickView';
import AgentController from '../ai/AgentController';
import TutorialGuide from './TutorialGuide';
import INDWizardTooltip from '../ind-wizard/INDWizardTooltip';
import HelpButton from '../common/HelpButton';

/**
 * Client Portal Landing Component
 */
export const ClientPortalLanding = () => {
  // State
  const [clients, setClients] = useState([]);
  const [activeTab, setActiveTab] = useState('overview');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [filteredClients, setFilteredClients] = useState([]);

  // Integration hooks
  const { services, switchClient, clientContext } = useModuleIntegration();

  // Fetch clients on load
  useEffect(() => {
    const fetchClients = async () => {
      try {
        setIsLoading(true);

        // Fetch client organizations using security service
        const clientOrgs = await services.security.getClientOrganizations();
        setClients(clientOrgs);
        setFilteredClients(clientOrgs);

        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching client organizations:', error);
        setIsLoading(false);
      }
    };

    fetchClients();
  }, [services.security]);

  // Filter clients when search query changes
  useEffect(() => {
    if (searchQuery.trim() === '') {
      setFilteredClients(clients);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = clients.filter(
      client =>
        client.name.toLowerCase().includes(query) ||
        client.industry?.toLowerCase().includes(query) ||
        client.contactPerson?.toLowerCase().includes(query)
    );

    setFilteredClients(filtered);
  }, [searchQuery, clients]);

  // Handle client selection
  const handleClientSelect = async clientId => {
    try {
      await switchClient(clientId);
    } catch (error) {
      console.error('Error switching client context:', error);
    }
  };

  useEffect(() => {
    console.log('ClientPortalLanding component mounted');

    // Update all module access links to point to /client-portal
    const moduleLinks = document.querySelectorAll('a[href*="/modules/"]');
    moduleLinks.forEach(link => {
      const href = link.getAttribute('href');
      if (href && !href.includes('/client-portal')) {
        link.setAttribute('href', '/client-portal' + href);
      }
    });
    console.log('All module access links updated to point to /client-portal');

    // Suppress Google auth errors in console
    const originalError = console.error;
    console.error = (...args) => {
      const message = args[0];
      if (typeof message === 'string' && message.includes('Google')) {
        return; // Suppress Google-related errors
      }
      originalError.apply(console, args);
    };

    return () => {
      console.error = originalError;
    };
  }, []);

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  // Get the current organization and user
  const currentOrg = clientContext?.organization || {};
  const currentUser = clientContext?.user || {};

  // Check if this is a CRO user (managing multiple clients)
  const isCRO = currentOrg.type === 'cro';

  return (
    <div className="space-y-6">
      {/* Welcome Header Section */}
      <ClientHeader
        organization={currentOrg}
        user={currentUser}
        stats={{
          studies: 3,
          activeSubmissions: 2,
          lastLogin: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
        }}
      />

      {/* CRO Client Selector (only shown for CRO users) */}
      {isCRO && (
        <div className="mb-4">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-bold tracking-tight">Client Organizations</h2>
            <div className="flex items-center space-x-2">
              <div className="relative w-[260px]">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search clients..."
                  className="pl-8"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                />
              </div>
              <Button variant="outline" size="sm">
                <Filter className="h-4 w-4 mr-2" />
                Filter
              </Button>
              <Button size="sm">
                <Plus className="h-4 w-4 mr-2" />
                Add Client
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4 mb-6">
            {filteredClients.slice(0, 3).map(client => (
              <div
                key={client.id}
                className="border rounded-md p-4 cursor-pointer hover:border-primary transition-colors"
                onClick={() => handleClientSelect(client.id)}
              >
                <div className="flex justify-between items-start">
                  <h3 className="font-medium">{client.name}</h3>
                  <div
                    className={`px-2 py-1 text-xs rounded-full ${
                      client.status === 'active'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-amber-100 text-amber-800'
                    }`}
                  >
                    {client.status || 'Active'}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1">
                  {client.projectCount || 0} Active Projects
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main Content Layout with Intelligent Project Manager */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Project Manager Grid (Main Area) */}
        <div className="lg:col-span-2 space-y-6">
          <ProjectManagerGrid userId={currentUser.id} orgId={currentOrg.id} />

          {/* Secondary Components Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <VaultQuickAccess userId={currentUser.id} orgId={currentOrg.id} />

            <AnalyticsQuickView userId={currentUser.id} orgId={currentOrg.id} />
          </div>
        </div>

        {/* Next Actions Sidebar */}
        <div className="lg:col-span-1">
          <NextActionsSidebar userId={currentUser.id} orgId={currentOrg.id} />
        </div>
      </div>

      {/* Additional Tabs for Detailed Views */}
      <Tabs defaultValue="overview" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="projects">All Projects</TabsTrigger>
          <TabsTrigger value="documents">Documents</TabsTrigger>
          <TabsTrigger value="tutorial">Tutorial Guide</TabsTrigger>
          <TabsTrigger value="activity">Activity</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4 mt-6">
          <div className="mb-6">
            <AgentController />
          </div>

          <div className="border rounded-md p-4">
            <h3 className="font-medium mb-2">Quick Links</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/vault">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Document Vault
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/analytics">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Analytics
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/tasks">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  All Tasks
                </Link>
              </Button>
              <Button variant="outline" className="justify-start" asChild>
                <Link to="/settings">
                  <LayoutDashboard className="h-4 w-4 mr-2" />
                  Settings
                </Link>
              </Button>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="projects">
          <div className="p-8 text-center text-muted-foreground">
            Detailed projects view will be displayed here
          </div>
        </TabsContent>

        <TabsContent value="documents">
          <div className="p-8 text-center text-muted-foreground">
            All documents view will be displayed here
          </div>
        </TabsContent>

        <TabsContent value="tutorial">
          <TutorialGuide />
        </TabsContent>

        <TabsContent value="activity">
          <div className="p-8 text-center text-muted-foreground">
            Activity log will be displayed here
          </div>
        </TabsContent>
      </Tabs>
      
      {/* Floating Help Button */}
      <HelpButton />
    </div>
  );
};

// Export existing activity and deadline item components
const ActivityItem = ({ client, action, time, icon }) => {
  return (
    <div className="flex items-start space-x-3">
      <div className="mt-0.5">{icon}</div>
      <div className="flex-1">
        <p className="text-sm font-medium mb-0.5">{action}</p>
        <div className="flex justify-between">
          <p className="text-sm text-muted-foreground">{client}</p>
          <p className="text-xs text-muted-foreground">{time}</p>
        </div>
      </div>
    </div>
  );
};

const DeadlineItem = ({ client, deadline, daysLeft, severity }) => {
  return (
    <div className="space-y-2">
      <div className="flex justify-between">
        <div>
          <p className="text-sm font-medium">{deadline}</p>
          <p className="text-xs text-muted-foreground">{client}</p>
        </div>
        <Badge
          variant={
            severity === 'high' ? 'destructive' : severity === 'medium' ? 'outline' : 'secondary'
          }
        >
          {daysLeft} days
        </Badge>
      </div>
    </div>
  );
};

export default ClientPortalLanding;
