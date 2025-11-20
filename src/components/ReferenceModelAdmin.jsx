import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Loader2, AlertCircle, CheckCircle, PlusCircle, Edit, Trash } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiRequest, queryClient as queryClientRef } from '@/lib/queryClient';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';

/**
 * Reference Model Administration Component
 * Allows administrators to manage the Veeva-style document reference model
 */
export function ReferenceModelAdmin() {
  const [activeTab, setActiveTab] = useState('types');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  // Initialize folders mutation
  const initFoldersMutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest('POST', '/api/reference-model/initialize-folders');
      return await res.json();
    },
    onSuccess: data => {
      toast({
        title: 'Folders Initialized',
        description: data.message,
        variant: 'success',
      });
      queryClient.invalidateQueries({ queryKey: ['/api/folders'] });
    },
    onError: error => {
      toast({
        title: 'Initialization Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  return (
    <div className="container mx-auto py-6">
      <div className="flex flex-col gap-6">
        <div className="flex justify-between items-center">
          <h1 className="text-3xl font-bold">Reference Model Administration</h1>

          <Button
            onClick={() => initFoldersMutation.mutate()}
            disabled={initFoldersMutation.isPending}
          >
            {initFoldersMutation.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Initializing...
              </>
            ) : (
              <>Initialize Folder Structure</>
            )}
          </Button>
        </div>

        <Tabs defaultValue={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="mb-4">
            <TabsTrigger value="types">Document Types</TabsTrigger>
            <TabsTrigger value="subtypes">Document Subtypes</TabsTrigger>
            <TabsTrigger value="lifecycles">Lifecycles</TabsTrigger>
            <TabsTrigger value="folders">Folder Templates</TabsTrigger>
          </TabsList>

          <TabsContent value="types">
            <DocumentTypesTab />
          </TabsContent>

          <TabsContent value="subtypes">
            <DocumentSubtypesTab />
          </TabsContent>

          <TabsContent value="lifecycles">
            <LifecyclesTab />
          </TabsContent>

          <TabsContent value="folders">
            <FolderTemplatesTab />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

/**
 * Document Types Tab Component
 */
function DocumentTypesTab() {
  const {
    data: types,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/api/reference-model/document-types'],
    staleTime: 60 * 1000, // 1 minute
  });

  if (isLoading) {
    return <LoadingState message="Loading document types..." />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Document Types</CardTitle>
          <CardDescription>
            The four master document categories in your reference model
          </CardDescription>
        </div>
        <DocumentTypeDialog mode="create" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption>Document type definitions in your Vault reference model.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Display Order</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types?.map(type => (
              <TableRow key={type.id}>
                <TableCell className="font-medium">{type.id}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {type.icon && (
                      <i className={`fas fa-${type.icon}`} style={{ color: type.color }}></i>
                    )}
                    {type.name}
                  </div>
                </TableCell>
                <TableCell>{type.description}</TableCell>
                <TableCell>{type.display_order}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <DocumentTypeDialog mode="edit" type={type} />
                    <DeleteDocumentTypeDialog type={type} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!types || types.length === 0) && (
              <TableRow>
                <TableCell colSpan={5} className="text-center py-4 text-muted-foreground">
                  No document types found. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Document Subtypes Tab Component
 */
function DocumentSubtypesTab() {
  const {
    data: subtypes,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/api/reference-model/document-subtypes'],
    staleTime: 60 * 1000, // 1 minute
  });

  const { data: types } = useQuery({
    queryKey: ['/api/reference-model/document-types'],
    staleTime: 60 * 1000, // 1 minute
  });

  const [selectedTypeFilter, setSelectedTypeFilter] = useState('all');

  if (isLoading) {
    return <LoadingState message="Loading document subtypes..." />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  // Filter subtypes by selected type
  const filteredSubtypes =
    selectedTypeFilter === 'all'
      ? subtypes
      : subtypes?.filter(subtype => subtype.type_id === selectedTypeFilter);

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Document Subtypes</CardTitle>
          <CardDescription>Specific document categories with metadata and rules</CardDescription>
        </div>
        <div className="flex gap-4">
          <Select value={selectedTypeFilter} onValueChange={setSelectedTypeFilter}>
            <SelectTrigger className="w-[200px]">
              <SelectValue placeholder="Filter by type" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Types</SelectItem>
              {types?.map(type => (
                <SelectItem key={type.id} value={type.id}>
                  {type.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <DocumentSubtypeDialog mode="create" types={types} />
        </div>
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption>Document subtype definitions with their metadata and rules.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Type</TableHead>
              <TableHead>Lifecycle</TableHead>
              <TableHead>Training</TableHead>
              <TableHead>Review</TableHead>
              <TableHead>Business Unit</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filteredSubtypes?.map(subtype => (
              <TableRow key={subtype.id}>
                <TableCell className="font-medium">{subtype.id}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    {subtype.icon && <i className={`fas fa-${subtype.icon}`}></i>}
                    {subtype.name}
                  </div>
                </TableCell>
                <TableCell>{subtype.document_types?.name || subtype.type_id}</TableCell>
                <TableCell>{subtype.lifecycle?.name || subtype.lifecycle_id}</TableCell>
                <TableCell>
                  {subtype.requires_training ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell>
                  {subtype.review_interval ? `${subtype.review_interval} months` : '-'}
                </TableCell>
                <TableCell>
                  {subtype.business_unit || <span className="text-muted-foreground">Any</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <DocumentSubtypeDialog mode="edit" subtype={subtype} types={types} />
                    <DeleteDocumentSubtypeDialog subtype={subtype} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!filteredSubtypes || filteredSubtypes.length === 0) && (
              <TableRow>
                <TableCell colSpan={8} className="text-center py-4 text-muted-foreground">
                  {selectedTypeFilter === 'all'
                    ? 'No document subtypes found. Create one to get started.'
                    : 'No document subtypes for this type. Create one to get started.'}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Lifecycles Tab Component
 */
function LifecyclesTab() {
  const {
    data: lifecycles,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/api/reference-model/lifecycles'],
    staleTime: 60 * 1000, // 1 minute
  });

  if (isLoading) {
    return <LoadingState message="Loading lifecycles..." />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Document Lifecycles</CardTitle>
          <CardDescription>
            Define the state transitions for different document types
          </CardDescription>
        </div>
        <LifecycleDialog mode="create" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption>
            Lifecycle definitions that control document state transitions.
          </TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Start State</TableHead>
              <TableHead>Final State</TableHead>
              <TableHead>Description</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lifecycles?.map(lifecycle => (
              <TableRow key={lifecycle.id}>
                <TableCell className="font-medium">{lifecycle.id}</TableCell>
                <TableCell>{lifecycle.name}</TableCell>
                <TableCell>{lifecycle.start_state}</TableCell>
                <TableCell>{lifecycle.steady_state}</TableCell>
                <TableCell>{lifecycle.description}</TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <LifecycleDialog mode="edit" lifecycle={lifecycle} />
                    <DeleteLifecycleDialog lifecycle={lifecycle} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!lifecycles || lifecycles.length === 0) && (
              <TableRow>
                <TableCell colSpan={6} className="text-center py-4 text-muted-foreground">
                  No lifecycles found. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/**
 * Folder Templates Tab Component
 */
function FolderTemplatesTab() {
  const {
    data: templates,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/api/reference-model/folder-templates'],
    staleTime: 60 * 1000, // 1 minute
  });

  if (isLoading) {
    return <LoadingState message="Loading folder templates..." />;
  }

  if (error) {
    return <ErrorState error={error} />;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle>Folder Templates</CardTitle>
          <CardDescription>Define the default folder structure for new projects</CardDescription>
        </div>
        <FolderTemplateDialog mode="create" />
      </CardHeader>
      <CardContent>
        <Table>
          <TableCaption>Folder template definitions for the document hierarchy.</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead>ID</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Parent</TableHead>
              <TableHead>Document Type</TableHead>
              <TableHead>Description</TableHead>
              <TableHead>Default for New Tenants</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {templates?.map(template => (
              <TableRow key={template.id}>
                <TableCell className="font-medium">{template.id}</TableCell>
                <TableCell>{template.name}</TableCell>
                <TableCell>
                  {template.parent_id ? (
                    templates?.find(t => t.id === template.parent_id)?.name || template.parent_id
                  ) : (
                    <span className="text-muted-foreground">Root</span>
                  )}
                </TableCell>
                <TableCell>
                  {template.document_types?.name || template.document_type_id || '-'}
                </TableCell>
                <TableCell>{template.description}</TableCell>
                <TableCell>
                  {template.default_for_tenants ? (
                    <CheckCircle className="h-4 w-4 text-green-500" />
                  ) : (
                    <span className="text-muted-foreground">-</span>
                  )}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <FolderTemplateDialog mode="edit" template={template} />
                    <DeleteFolderTemplateDialog template={template} />
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {(!templates || templates.length === 0) && (
              <TableRow>
                <TableCell colSpan={7} className="text-center py-4 text-muted-foreground">
                  No folder templates found. Create one to get started.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

// Dialog components for CRUD operations would be implemented here
// For brevity, these are placeholders that would need implementation:

function DocumentTypeDialog({ mode, type }) {
  // Implementation for creating/editing document types
  return (
    <Button variant="ghost" size="icon">
      {mode === 'create' ? <PlusCircle className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
    </Button>
  );
}

function DeleteDocumentTypeDialog({ type }) {
  // Implementation for deleting document types
  return (
    <Button variant="ghost" size="icon">
      <Trash className="h-4 w-4" />
    </Button>
  );
}

function DocumentSubtypeDialog({ mode, subtype, types }) {
  // Implementation for creating/editing document subtypes
  return (
    <Button variant="ghost" size="icon">
      {mode === 'create' ? <PlusCircle className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
    </Button>
  );
}

function DeleteDocumentSubtypeDialog({ subtype }) {
  // Implementation for deleting document subtypes
  return (
    <Button variant="ghost" size="icon">
      <Trash className="h-4 w-4" />
    </Button>
  );
}

function LifecycleDialog({ mode, lifecycle }) {
  // Implementation for creating/editing lifecycles
  return (
    <Button variant="ghost" size="icon">
      {mode === 'create' ? <PlusCircle className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
    </Button>
  );
}

function DeleteLifecycleDialog({ lifecycle }) {
  // Implementation for deleting lifecycles
  return (
    <Button variant="ghost" size="icon">
      <Trash className="h-4 w-4" />
    </Button>
  );
}

function FolderTemplateDialog({ mode, template }) {
  // Implementation for creating/editing folder templates
  return (
    <Button variant="ghost" size="icon">
      {mode === 'create' ? <PlusCircle className="h-4 w-4" /> : <Edit className="h-4 w-4" />}
    </Button>
  );
}

function DeleteFolderTemplateDialog({ template }) {
  // Implementation for deleting folder templates
  return (
    <Button variant="ghost" size="icon">
      <Trash className="h-4 w-4" />
    </Button>
  );
}

// Helper components

function LoadingState({ message = 'Loading...' }) {
  return (
    <div className="flex justify-center items-center p-8">
      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
      <span>{message}</span>
    </div>
  );
}

function ErrorState({ error }) {
  return (
    <Alert variant="destructive" className="mb-4">
      <AlertCircle className="h-4 w-4" />
      <AlertTitle>Error</AlertTitle>
      <AlertDescription>
        {error.message || 'An error occurred while loading data.'}
      </AlertDescription>
    </Alert>
  );
}

export default ReferenceModelAdmin;
