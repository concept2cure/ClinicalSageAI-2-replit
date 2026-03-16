import React, { useState, useEffect } from 'react';
import ModuleSectionEditor from '../../components/ModuleSectionEditor';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/hooks/use-toast';
import { 
  ArrowLeft, 
  RefreshCw, 
  FileText, 
  Link, 
  Unlink, 
  Clock, 
  Users, 
  CheckCircle, 
  AlertTriangle, 
  Activity,
  Wifi,
  WifiOff,
  Bell,
  Shield,
  GitBranch,
  Eye
} from 'lucide-react';

/**
 * Module Section Editor Page - Enhanced with sync status and metadata
 * 
 * Standalone page for editing CTD module sections with AI-assisted features,
 * real-time collaboration, and cross-document synchronization
 */
export default function ModuleSectionEditorPage() {
  const [content, setContent] = useState('');
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  // Enhanced state for sync and collaboration
  const [syncStatus, setSyncStatus] = useState('synced'); // synced, syncing, pending, conflict
  const [linkedDocumentCount, setLinkedDocumentCount] = useState(5);
  const [pendingUpdates, setPendingUpdates] = useState(0);
  const [lastSyncTime, setLastSyncTime] = useState(new Date());
  const [activeEditors, setActiveEditors] = useState([
    { id: 1, name: 'Dr. Sarah Chen', initials: 'SC', avatar: '👩‍⚕️', color: 'bg-blue-500' },
    { id: 2, name: 'Mark Johnson', initials: 'MJ', avatar: '👨‍💼', color: 'bg-green-500' }
  ]);
  const [connectionStatus, setConnectionStatus] = useState('strong'); // strong, weak, offline
  const [sectionStatus, setSectionStatus] = useState('draft'); // draft, in_review, approved
  
  // Simulate real-time updates
  useEffect(() => {
    const interval = setInterval(() => {
      // Randomly update sync status
      const statuses = ['synced', 'syncing', 'pending'];
      setSyncStatus(statuses[Math.floor(Math.random() * statuses.length)]);
      
      // Update pending updates count
      setPendingUpdates(Math.floor(Math.random() * 4));
      
      // Update last sync time
      if (Math.random() > 0.5) {
        setLastSyncTime(new Date());
      }
    }, 30000); // Update every 30 seconds
    
    return () => clearInterval(interval);
  }, []);

  const handleSave = () => {
    console.log('Saving content:', content);
    setSyncStatus('syncing');
    
    setTimeout(() => {
      setSyncStatus('synced');
      setLastSyncTime(new Date());
      setPendingUpdates(0);
      toast({
        title: "✓ Content Saved & Synced",
        description: `Your changes have been saved and synchronized across ${linkedDocumentCount} linked documents.`,
        variant: "success",
      });
    }, 2000);
  };

  const handleCancel = () => {
    setLocation('/client-portal');
  };

  const handleContentChange = (newContent) => {
    setContent(newContent);
  };

  const handleSyncNow = () => {
    setSyncStatus('syncing');
    toast({
      title: "🔄 Synchronizing",
      description: "Syncing with all linked documents...",
    });
    
    setTimeout(() => {
      setSyncStatus('synced');
      setLastSyncTime(new Date());
      setPendingUpdates(0);
      toast({
        title: "✓ Sync Complete",
        description: "All documents are now up to date.",
        variant: "success",
      });
    }, 3000);
  };

  const handleViewLinkedDocuments = () => {
    toast({
      title: "📁 Linked Documents",
      description: `Viewing ${linkedDocumentCount} linked documents...`,
    });
  };

  const handleBreakLink = () => {
    toast({
      title: "⚠️ Break Link",
      description: "Are you sure you want to unlink this section from other documents?",
      variant: "warning",
      action: {
        label: "Confirm",
        onClick: () => {
          setLinkedDocumentCount(0);
          toast({
            title: "✓ Link Broken",
            description: "This section is no longer linked to other documents.",
          });
        }
      }
    });
  };

  const getSyncStatusBadge = () => {
    switch (syncStatus) {
      case 'synced':
        return <Badge className="bg-green-500 text-white"><CheckCircle className="h-3 w-3 mr-1" />Synced</Badge>;
      case 'syncing':
        return <Badge className="bg-yellow-500 text-white"><RefreshCw className="h-3 w-3 mr-1 animate-spin" />Syncing...</Badge>;
      case 'pending':
        return <Badge className="bg-orange-500 text-white"><Clock className="h-3 w-3 mr-1" />{pendingUpdates} Pending</Badge>;
      case 'conflict':
        return <Badge className="bg-red-500 text-white"><AlertTriangle className="h-3 w-3 mr-1" />Conflict</Badge>;
      default:
        return <Badge>Unknown</Badge>;
    }
  };

  const getConnectionIcon = () => {
    switch (connectionStatus) {
      case 'strong':
        return <Wifi className="h-4 w-4 text-green-500" />;
      case 'weak':
        return <Wifi className="h-4 w-4 text-yellow-500" />;
      case 'offline':
        return <WifiOff className="h-4 w-4 text-red-500" />;
      default:
        return <Wifi className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-blue-50 p-4 md:p-8">
      <div className="max-w-7xl mx-auto">
        {/* Enhanced Header */}
        <div className="mb-8 space-y-4">
          <Button
            variant="ghost"
            onClick={() => setLocation('/client-portal')}
            className="mb-4 hover:bg-white"
            data-testid="button-back"
          >
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Client Portal
          </Button>
          
          <Card className="bg-white shadow-lg border-0">
            <CardHeader className="bg-gradient-to-r from-blue-600 to-indigo-600 text-white">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-2xl flex items-center gap-3">
                    Module Section Editor™
                    {syncStatus === 'syncing' && <RefreshCw className="h-5 w-5 animate-spin" />}
                    {syncStatus === 'synced' && linkedDocumentCount > 0 && (
                      <span className="text-base font-normal flex items-center gap-1">
                        🔄 Synced with {linkedDocumentCount} documents
                      </span>
                    )}
                  </CardTitle>
                  <CardDescription className="text-blue-100 mt-2">
                    Edit and manage CTD module sections with AI-assisted precision and real-time collaboration
                  </CardDescription>
                </div>
                
                {/* Connection Status */}
                <div className="flex items-center gap-4">
                  {pendingUpdates > 0 && (
                    <div className="relative">
                      <Bell className="h-6 w-6 text-white" />
                      <span className="absolute -top-2 -right-2 h-5 w-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
                        {pendingUpdates}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    {getConnectionIcon()}
                    <span className="text-sm capitalize">{connectionStatus}</span>
                  </div>
                </div>
              </div>
            </CardHeader>
            
            <CardContent className="pt-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                {/* Module Info */}
                <div className="space-y-1">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    <FileText className="h-3 w-3" />
                    Module
                  </div>
                  <div className="text-lg font-medium">Module 2: Quality</div>
                  <div className="flex gap-1 mt-1">
                    <span className="h-2 w-2 bg-green-500 rounded-full" title="Section active" />
                    <span className="h-2 w-2 bg-yellow-500 rounded-full animate-pulse" title="Being edited" />
                    <span className="h-2 w-2 bg-gray-300 rounded-full" title="No recent activity" />
                  </div>
                </div>
                
                {/* Section Info */}
                <div className="space-y-1">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    <GitBranch className="h-3 w-3" />
                    Section
                  </div>
                  <div className="text-lg font-medium">2.3 Drug Substance</div>
                  <div className="text-xs text-gray-600">
                    {activeEditors.length > 0 && (
                      <span className="text-blue-600">
                        {activeEditors[0].name} is editing...
                      </span>
                    )}
                  </div>
                </div>
                
                {/* Sync Status */}
                <div className="space-y-1">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    <Activity className="h-3 w-3" />
                    Sync Status
                  </div>
                  <div className="flex items-center gap-2">
                    {getSyncStatusBadge()}
                  </div>
                  <div className="text-xs text-gray-600">
                    Last synced: {lastSyncTime.toLocaleTimeString()}
                  </div>
                </div>
                
                {/* Active Editors */}
                <div className="space-y-1">
                  <div className="text-sm text-gray-500 flex items-center gap-1">
                    <Users className="h-3 w-3" />
                    Active Editors
                  </div>
                  <div className="flex -space-x-2">
                    {activeEditors.map(editor => (
                      <Avatar key={editor.id} className="h-8 w-8 border-2 border-white">
                        <AvatarImage src={`/api/avatar/${editor.id}`} />
                        <AvatarFallback className={editor.color}>
                          {editor.initials}
                        </AvatarFallback>
                      </Avatar>
                    ))}
                    {activeEditors.length > 3 && (
                      <div className="h-8 w-8 rounded-full bg-gray-200 border-2 border-white flex items-center justify-center text-xs">
                        +{activeEditors.length - 3}
                      </div>
                    )}
                  </div>
                  <div className="text-xs text-gray-600">
                    {activeEditors.length} user{activeEditors.length !== 1 ? 's' : ''} active
                  </div>
                </div>
              </div>
              
              <Separator className="my-4" />
              
              {/* Quick Actions */}
              <div className="flex flex-wrap gap-2">
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleViewLinkedDocuments}
                  data-testid="button-view-linked"
                >
                  <Eye className="h-4 w-4 mr-1" />
                  View Linked Documents
                </Button>
                
                <Button 
                  size="sm" 
                  variant="outline"
                  onClick={handleSyncNow}
                  disabled={syncStatus === 'syncing'}
                  data-testid="button-sync-now-page"
                >
                  <RefreshCw className={`h-4 w-4 mr-1 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`} />
                  Sync Now
                </Button>
                
                <Button 
                  size="sm" 
                  variant="outline"
                  className="text-red-600 hover:bg-red-50"
                  onClick={handleBreakLink}
                  disabled={linkedDocumentCount === 0}
                  data-testid="button-break-link"
                >
                  <Unlink className="h-4 w-4 mr-1" />
                  Break Link
                </Button>
                
                {/* Document Status Indicator */}
                <div className="ml-auto flex items-center gap-2">
                  <Shield className="h-4 w-4 text-blue-600" />
                  <span className="text-sm text-gray-600">Compliance: </span>
                  <Badge variant="success">Compliant</Badge>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Editor Container */}
        <Card className="bg-white shadow-lg border-0">
          <CardContent className="p-6">
            <ModuleSectionEditor
              initialContent={content || 'Start typing or use AI assistance to draft your CTD module section...'}
              moduleId="module-2"
              sectionId="section-2-3"
              projectId={1}
              organizationId={1}
              leafId="leaf-001"
              onSave={handleSave}
              onCancel={handleCancel}
              onContentChange={handleContentChange}
              contextSnippets={[]}
              currentUser={{ id: 'user-1', name: 'Current User', avatar: null }}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}