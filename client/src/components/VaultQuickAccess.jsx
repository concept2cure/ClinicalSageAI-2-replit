import React from 'react';
import { Database, Folder, FileText, Search, Plus, Calendar, Clock } from 'lucide-react'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';

/**
 * VaultQuickAccess Component
 *
 * Provides quick access to key documents stored in the TrialSage Vault.
 */
const VaultQuickAccess = ({ clientId }) => {
  // Sample recent documents - in a real app, these would come from an API call
  const recentDocuments = [
    {
      id: 'doc-1',
      title: 'BTX-112 Clinical Protocol v2.0',
      type: 'Protocol',
      dateModified: '2025-05-08T14:30:00Z',
      icon: 'file-text',
      status: 'approved',
    },
    {
      id: 'doc-2',
      title: 'CER Report XR-24 Final',
      type: 'CER',
      dateModified: '2025-05-07T11:15:00Z',
      icon: 'file-check',
      status: 'final',
    },
    {
      id: 'doc-3',
      title: 'CMC Section 3.2.P.3.1',
      type: 'CMC Document',
      dateModified: '2025-05-06T09:45:00Z',
      icon: 'clipboard',
      status: 'draft',
    },
  ];

  // Get client-specific documents
  const getClientDocuments = () => {
    if (!clientId) return recentDocuments;

    // In a real app, this would filter based on client ID
    // For demo purposes, we'll just return all documents
    return recentDocuments;
  };

  const clientDocuments = getClientDocuments();

  // Format dates for display
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <Database className="h-5 w-5 mr-2 text-slate-600" />
            <CardTitle className="text-lg font-medium">Vault Quick Access</CardTitle>
          </div>
          <Button variant="ghost" size="icon" className="h-8 w-8">
            <Plus size={16} />
          </Button>
        </div>
        <CardDescription>Recently accessed documents</CardDescription>
      </CardHeader>
      <CardContent className="pb-1">
        <div className="space-y-4">
          {/* Search Bar */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-gray-400" />
            <Input
              type="text"
              placeholder="Search vault documents..."
              className="pl-8 bg-gray-50 border-gray-200 focus:bg-white"
            />
          </div>

          {/* Document List */}
          <div className="space-y-2">
            {clientDocuments.map(doc => (
              <div
                key={doc.id}
                className="flex items-start p-2 hover:bg-gray-50 rounded-md cursor-pointer"
              >
                <div className="bg-slate-100 p-2 rounded-md mr-3">
                  <FileText className="h-5 w-5 text-slate-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-medium text-gray-800 truncate">{doc.title}</h4>
                    <Badge
                      variant={
                        doc.status === 'approved'
                          ? 'default'
                          : doc.status === 'final'
                            ? 'success'
                            : 'outline'
                      }
                      className="ml-2 text-xs"
                    >
                      {doc.status.charAt(0).toUpperCase() + doc.status.slice(1)}
                    </Badge>
                  </div>
                  <div className="flex items-center text-xs text-gray-500 mt-1">
                    <span className="truncate">{doc.type}</span>
                    <span className="mx-1.5">•</span>
                    <div className="flex items-center">
                      <Calendar className="h-3 w-3 mr-1" />
                      <span>{formatDate(doc.dateModified)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </CardContent>
      <CardFooter className="pt-0">
        <Button variant="outline" className="w-full mt-2" size="sm">
          <Folder className="h-4 w-4 mr-2" />
          View All Documents
        </Button>
      </CardFooter>
    </Card>
  );
};

export default VaultQuickAccess;
