import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiRequest } from '@/lib/queryClient';
import { QueryClient } from '@tanstack/react-query';

// Create a local instance to avoid the imported error
const queryClient = new QueryClient();
import { 
  Plus, 
  FolderOpen, 
  Clock, 
  Check, 
  MoreHorizontal, 
  Search,
  Brain,
  Sparkles,
  FileBadge,
  BookOpenCheck,
  Dna
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/hooks/use-toast';

// Types
interface StudySession {
  id: number;
  session_id: string;
  name: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
  project_id: string | null;
  metadata: any;
}

interface CreateStudySessionData {
  session_id?: string;
  name: string;
  description?: string;
  status?: string;
  project_id?: string;
  metadata?: any;
}

interface StudySessionSelectorProps {
  onSessionChange: (session: StudySession | null) => void;
  currentSessionId?: string | null;
  size?: 'sm' | 'md' | 'lg';
  projectId?: string;
  showNewButton?: boolean;
  showDetails?: boolean;
}

export default function StudySessionSelector({
  onSessionChange,
  currentSessionId = null,
  size = 'md',
  projectId,
  showNewButton = true,
  showDetails = false
}: StudySessionSelectorProps) {
  const { toast } = useToast();
  const [isNewSessionDialogOpen, setIsNewSessionDialogOpen] = useState(false);
  const [isSessionPopoverOpen, setIsSessionPopoverOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [newSession, setNewSession] = useState<CreateStudySessionData>({
    name: '',
    description: '',
    status: 'Active'
  });

  // Fetch study sessions
  const { data: studySessions = [], isLoading: isLoadingStudySessions } = useQuery({
    queryKey: ['/api/study-sessions', projectId],
    queryFn: async () => {
      const endpoint = projectId 
        ? `/api/study-sessions?projectId=${projectId}` 
        : '/api/study-sessions';
      const res = await apiRequest('GET', endpoint);
      return await res.json();
    }
  });

  // Create new study session mutation
  const createSessionMutation = useMutation({
    mutationFn: async (session: CreateStudySessionData) => {
      const res = await apiRequest('POST', '/api/study-sessions', session);
      return await res.json();
    },
    onSuccess: (newSession) => {
      // toast call replaced
  // Original: toast({
        title: 'Study Session Created',
        description: `"${newSession.name}" has been created successfully.`,
      })
  console.log('Toast would show:', {
        title: 'Study Session Created',
        description: `"${newSession.name}" has been created successfully.`,
      });
      queryClient.invalidateQueries({ queryKey: ['/api/study-sessions'] });
      setIsNewSessionDialogOpen(false);
      onSessionChange(newSession);
    },
    onError: (error: Error) => {
      // toast call replaced
  // Original: toast({
        title: 'Failed to Create Session',
        description: error.message,
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Failed to Create Session',
        description: error.message,
        variant: 'destructive',
      });
    }
  });

  // Find current session
  const currentSession = studySessions.find((session: StudySession) => 
    session.session_id === currentSessionId
  ) || null;

  // Handle creating new session
  const handleCreateSession = () => {
    if (!newSession.name.trim()) {
      // toast call replaced
  // Original: toast({
        title: 'Session Name Required',
        description: 'Please provide a name for the study session.',
        variant: 'destructive',
      })
  console.log('Toast would show:', {
        title: 'Session Name Required',
        description: 'Please provide a name for the study session.',
        variant: 'destructive',
      });
      return;
    }

    const sessionData: CreateStudySessionData = {
      ...newSession,
      session_id: `session_${Date.now()}`,
      project_id: projectId,
    };
    
    createSessionMutation.mutate(sessionData);
  };

  // Handle selecting a session
  const handleSelectSession = (session: StudySession) => {
    onSessionChange(session);
    setIsSessionPopoverOpen(false);
  };

  // Filter sessions based on search query
  const filteredSessions = studySessions.filter((session: StudySession) => 
    session.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (session.description && session.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  // Sizes for UI components
  const buttonSizes = {
    sm: 'h-8 text-xs px-2',
    md: 'h-9 text-sm px-3',
    lg: 'h-10 text-base px-4'
  };

  const sessionDisplayButton = (
    <Button 
      variant="outline" 
      className={`justify-start w-full text-left font-normal ${buttonSizes[size]}`}
      onClick={() => setIsSessionPopoverOpen(true)}
    >
      {currentSession ? (
        <div className="flex items-center gap-2 truncate">
          <FolderOpen className="h-4 w-4 shrink-0" />
          <span className="truncate">{currentSession.name}</span>
          {showDetails && currentSession.status && (
            <Badge variant="outline" className="ml-auto">
              {currentSession.status}
            </Badge>
          )}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-slate-500">
          <FolderOpen className="h-4 w-4" />
          <span>Select a study session</span>
        </div>
      )}
    </Button>
  );

  return (
    <div className="space-y-2">
      {showDetails && currentSession && (
        <div className="text-xs text-slate-500 mb-1">
          Current Study Session
        </div>
      )}

      <div className="flex gap-2">
        <Popover open={isSessionPopoverOpen} onOpenChange={setIsSessionPopoverOpen}>
          <PopoverTrigger asChild>
            {sessionDisplayButton}
          </PopoverTrigger>
          <PopoverContent className="p-0 w-[300px]" align="start" side="bottom" sideOffset={5}>
            <Command>
              <CommandInput 
                placeholder="Search sessions..." 
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                <CommandEmpty>No study sessions found</CommandEmpty>
                <CommandGroup heading="Your Study Sessions">
                  {isLoadingStudySessions ? (
                    <div className="p-2 text-center text-sm text-slate-500">
                      Loading sessions...
                    </div>
                  ) : filteredSessions.length === 0 ? (
                    <div className="p-2 text-center text-sm text-slate-500">
                      No sessions found. Create one?
                    </div>
                  ) : (
                    filteredSessions.map((session: StudySession) => (
                      <CommandItem
                        key={session.session_id}
                        value={session.session_id}
                        onSelect={() => handleSelectSession(session)}
                        className="flex justify-between"
                      >
                        <div className="flex items-center gap-2 truncate">
                          <FolderOpen className="h-4 w-4 shrink-0" />
                          <span className="truncate">{session.name}</span>
                        </div>
                        {session.session_id === currentSessionId && (
                          <Check className="h-4 w-4 text-green-500" />
                        )}
                      </CommandItem>
                    ))
                  )}
                </CommandGroup>
                <Separator />
                <div className="p-1">
                  <Button 
                    variant="ghost" 
                    className="w-full justify-start text-sm" 
                    onClick={() => {
                      setIsSessionPopoverOpen(false);
                      setIsNewSessionDialogOpen(true);
                    }}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    Create New Session
                  </Button>
                </div>
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>

        {showNewButton && (
          <Button 
            size="icon" 
            variant="ghost"
            className={buttonSizes[size]}
            onClick={() => setIsNewSessionDialogOpen(true)}
          >
            <Plus className="h-4 w-4" />
          </Button>
        )}
      </div>

      {showDetails && currentSession && (
        <Card className="mt-4">
          <CardHeader className="pb-2">
            <CardTitle className="text-lg flex items-center gap-2">
              <FolderOpen className="h-5 w-5 text-primary" />
              {currentSession.name}
            </CardTitle>
            {currentSession.description && (
              <CardDescription>
                {currentSession.description}
              </CardDescription>
            )}
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="insights">
              <TabsList className="grid grid-cols-2 mb-4">
                <TabsTrigger value="insights">
                  <Brain className="h-3.5 w-3.5 mr-1.5" />
                  Insights
                </TabsTrigger>
                <TabsTrigger value="traces">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  Wisdom Traces
                </TabsTrigger>
              </TabsList>
              
              <TabsContent value="insights" className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Recent Insights</h4>
                  <Badge variant="outline" className="text-xs">
                    <Dna className="h-3 w-3 mr-1" />
                    Memory Active
                  </Badge>
                </div>
                
                {/* This would be populated with actual insights in a real implementation */}
                <div className="text-sm text-slate-500 italic text-center py-2">
                  Insights will appear here as they're generated
                </div>
                
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs">
                  <BookOpenCheck className="h-3.5 w-3.5 mr-1.5" />
                  View All Insights
                </Button>
              </TabsContent>
              
              <TabsContent value="traces" className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-medium">Decision Traces</h4>
                  <Badge variant="outline" className="text-xs">
                    <FileBadge className="h-3 w-3 mr-1" />
                    Audit Ready
                  </Badge>
                </div>
                
                {/* This would be populated with actual traces in a real implementation */}
                <div className="text-sm text-slate-500 italic text-center py-2">
                  Decision logic traces will appear here
                </div>
                
                <Button variant="ghost" size="sm" className="w-full mt-2 text-xs">
                  <Sparkles className="h-3.5 w-3.5 mr-1.5" />
                  View All Traces
                </Button>
              </TabsContent>
            </Tabs>
          </CardContent>
          <CardFooter className="text-xs text-slate-500 pt-0">
            Created {new Date(currentSession.created_at).toLocaleDateString()}
          </CardFooter>
        </Card>
      )}

      {/* Create new session dialog */}
      <Dialog open={isNewSessionDialogOpen} onOpenChange={setIsNewSessionDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Create New Study Session</DialogTitle>
            <DialogDescription>
              Create a new session to organize your protocol insights and wisdom traces.
            </DialogDescription>
          </DialogHeader>
          
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label htmlFor="session-name">Session Name*</Label>
              <Input
                id="session-name"
                placeholder="e.g., NASH Phase 2 Protocol Design"
                value={newSession.name}
                onChange={(e) => setNewSession({ ...newSession, name: e.target.value })}
              />
            </div>
            
            <div className="grid gap-2">
              <Label htmlFor="session-description">Description (Optional)</Label>
              <Textarea
                id="session-description"
                placeholder="Brief description of this study session..."
                value={newSession.description || ''}
                onChange={(e) => setNewSession({ ...newSession, description: e.target.value })}
                className="resize-none"
                rows={3}
              />
            </div>
          </div>
          
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsNewSessionDialogOpen(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleCreateSession} 
              disabled={createSessionMutation.isPending || !newSession.name.trim()}
            >
              {createSessionMutation.isPending ? 'Creating...' : 'Create Session'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}