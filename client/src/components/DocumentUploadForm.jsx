import React, { useState, useCallback, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useDropzone } from 'react-dropzone';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import * as z from 'zod';
import { Loader2, Upload, File, X, FileText, AlertCircle, Check, FolderTree } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { apiRequest, queryClient } from '@/lib/queryClient';
import SubtypeSelect from './SubtypeSelect';
import { StaticTypeBreadcrumb } from './TypeBreadcrumb';
import useReferenceModel from '@/hooks/useReferenceModel';
import {
  getRecommendedFolders,
  isFolderValidForSubtype,
  buildFolderPath,
  formatFolderPath,
} from '@/utils/folderHierarchy';

/**
 * DocumentUploadForm Component
 *
 * Enhanced document upload form that uses the reference model
 * for document type classification, folder enforcement, and metadata.
 */
export default function DocumentUploadForm({ currentFolder, onSuccess }) {
  const [files, setFiles] = useState([]);
  const [previewUrl, setPreviewUrl] = useState(null);
  const { toast } = useToast();
  const [uploadProgress, setUploadProgress] = useState(0);

  // Get reference model data
  const referenceModel = useReferenceModel();

  // Get available folders
  const { data: folders, isLoading: foldersLoading } = useQuery({
    queryKey: ['/api/folders'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Form validation schema
  const formSchema = z.object({
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    document_subtype_id: z.string().min(1, 'Document subtype is required'),
    folder_id: z.number().optional(),
    status: z.string().optional(),
  });

  // Form initialization
  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: {
      title: '',
      description: '',
      document_subtype_id: '',
      folder_id: currentFolder?.id || undefined,
      status: '',
    },
  });

  // Update form when currentFolder changes
  useEffect(() => {
    if (currentFolder) {
      form.setValue('folder_id', currentFolder.id);
    }
  }, [currentFolder, form]);

  // Handle file drop
  const onDrop = useCallback(
    acceptedFiles => {
      if (acceptedFiles.length > 0) {
        const file = acceptedFiles[0]; // Take only the first file

        // Create preview URL
        const preview = URL.createObjectURL(file);
        setPreviewUrl(preview);

        // Set file name as title if not already set
        if (!form.getValues('title')) {
          // Remove file extension from name
          const fileName = file.name.replace(/\.[^/.]+$/, '');
          form.setValue('title', fileName);
        }

        setFiles([file]);
      }
    },
    [form]
  );

  // Configure dropzone
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'application/msword': ['.doc'],
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document': ['.docx'],
      'application/vnd.ms-excel': ['.xls'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
    maxFiles: 1,
  });

  // Handle form submit - upload document
  const uploadMutation = useMutation({
    mutationFn: async formData => {
      setUploadProgress(0);

      const response = await apiRequest('POST', '/api/documents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: progressEvent => {
          const percentCompleted = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(percentCompleted);
        },
      });

      return await response.json();
    },
    onSuccess: data => {
      toast({
        title: 'Document Uploaded',
        description: 'Your document was uploaded successfully.',
        variant: 'success',
      });

      // Reset form and state
      form.reset();
      setFiles([]);
      setPreviewUrl(null);
      setUploadProgress(0);

      // Invalidate queries
      queryClient.invalidateQueries({ queryKey: ['/api/documents'] });

      // Call success callback if provided
      if (onSuccess) {
        onSuccess(data);
      }
    },
    onError: error => {
      toast({
        title: 'Upload Failed',
        description:
          error.message || 'There was an error uploading your document. Please try again.',
        variant: 'destructive',
      });
    },
  });

  // Handle form submission
  const onSubmit = values => {
    if (files.length === 0) {
      toast({
        title: 'No File Selected',
        description: 'Please select a file to upload.',
        variant: 'destructive',
      });
      return;
    }

    // Create FormData object
    const formData = new FormData();
    formData.append('file', files[0]);
    formData.append('title', values.title);

    if (values.description) {
      formData.append('description', values.description);
    }

    formData.append('document_subtype_id', values.document_subtype_id);

    if (values.folder_id) {
      formData.append('folder_id', values.folder_id);
    }

    if (values.status) {
      formData.append('status', values.status);
    }

    // Submit the form
    uploadMutation.mutate(formData);
  };

  // Get the selected document subtype details
  const selectedSubtypeId = form.watch('document_subtype_id');
  const selectedSubtype = referenceModel.getEnrichedSubtype(selectedSubtypeId);

  // Get the selected folder
  const selectedFolderId = form.watch('folder_id');
  const selectedFolder = folders?.find(f => f.id === selectedFolderId);

  // Check if selected folder is valid for selected subtype
  const isFolderValid =
    !selectedSubtypeId ||
    !selectedFolder ||
    isFolderValidForSubtype(selectedFolder, selectedSubtypeId, folders || [], referenceModel);

  // Get list of recommended folders
  const recommendedFolders = selectedSubtypeId
    ? getRecommendedFolders(selectedSubtypeId, folders || [], referenceModel)
    : [];

  // Helper function to remove a file
  const removeFile = () => {
    setFiles([]);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
  };

  // Get available statuses based on lifecycle
  const availableStatuses = selectedSubtype?.lifecycle
    ? [selectedSubtype.lifecycle.start_state, selectedSubtype.lifecycle.steady_state]
    : [];

  return (
    <Card className="w-full max-w-3xl mx-auto">
      <CardHeader>
        <CardTitle>Upload Document</CardTitle>
        <CardDescription>
          Upload a document to the Vault with proper classification and metadata
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            {/* File Drop Area */}
            <div
              {...getRootProps()}
              className={`
                border-2 border-dashed rounded-md p-6 text-center cursor-pointer
                ${isDragActive ? 'border-primary bg-primary/5' : 'border-border'} 
                ${files.length > 0 ? 'bg-muted/50' : ''}
              `}
            >
              <input {...getInputProps()} />

              {files.length === 0 ? (
                <div className="space-y-3">
                  <Upload className="mx-auto h-12 w-12 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      Drag & drop a file here, or click to select
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Supports PDF, DOC, DOCX, XLS, XLSX formats
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-3">
                    <FileText className="h-8 w-8 text-primary" />
                    <div className="text-left">
                      <p className="text-sm font-medium">{files[0].name}</p>
                      <p className="text-xs text-muted-foreground">
                        {(files[0].size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={e => {
                      e.stopPropagation();
                      removeFile();
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            {/* Document Metadata Form */}
            <div className="space-y-4">
              {/* Title */}
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Title</FormLabel>
                    <FormControl>
                      <Input placeholder="Document title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Description */}
              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea placeholder="Optional document description" {...field} rows={3} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Document Subtype */}
              <FormField
                control={form.control}
                name="document_subtype_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Document Type</FormLabel>
                    <FormControl>
                      <SubtypeSelect
                        {...field}
                        topFolder={currentFolder?.document_type_id}
                        id="document_subtype"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Selected Type Info */}
              {selectedSubtype && (
                <div className="bg-muted p-3 rounded-md">
                  <div className="mb-2">
                    <StaticTypeBreadcrumb
                      typeName={selectedSubtype.type?.name || 'Unknown Type'}
                      subtypeName={selectedSubtype.name}
                    />
                  </div>

                  <div className="text-sm space-y-1">
                    {selectedSubtype.description && (
                      <p className="text-muted-foreground">{selectedSubtype.description}</p>
                    )}

                    <p>
                      <span className="font-medium">Lifecycle:</span>{' '}
                      {selectedSubtype.lifecycle?.name || 'Standard'}
                    </p>

                    {selectedSubtype.requires_training && (
                      <p className="text-blue-600 font-medium">Requires training</p>
                    )}

                    {selectedSubtype.review_interval && (
                      <p>
                        <span className="font-medium">Periodic review:</span> Every{' '}
                        {selectedSubtype.review_interval} months
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Document Status */}
              {selectedSubtype?.lifecycle && (
                <FormField
                  control={form.control}
                  name="status"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Status</FormLabel>
                      <Select
                        value={field.value}
                        onValueChange={field.onChange}
                        defaultValue={selectedSubtype.lifecycle.start_state}
                      >
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select status" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {availableStatuses.map(status => (
                            <SelectItem key={status} value={status}>
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormDescription>Initial status for the document</FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {/* Folder Selection */}
              <FormField
                control={form.control}
                name="folder_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Folder</FormLabel>
                    <Select
                      value={field.value?.toString()}
                      onValueChange={value => field.onChange(parseInt(value))}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select folder" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {folders?.map(folder => (
                          <SelectItem
                            key={folder.id}
                            value={folder.id.toString()}
                            disabled={
                              selectedSubtypeId &&
                              !isFolderValidForSubtype(
                                folder,
                                selectedSubtypeId,
                                folders,
                                referenceModel
                              )
                            }
                          >
                            {folder.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {/* Folder Validity Warning */}
              {selectedSubtypeId && selectedFolder && !isFolderValid && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertTitle>Invalid Folder</AlertTitle>
                  <AlertDescription>
                    {`Documents of type "${selectedSubtype?.type?.name || 'Unknown'}" must be placed in a compatible folder.`}
                  </AlertDescription>
                </Alert>
              )}

              {/* Recommended Folders */}
              {selectedSubtypeId && recommendedFolders.length > 0 && (
                <div>
                  <FormLabel>Recommended Folders</FormLabel>
                  <div className="mt-1 text-sm">
                    <Dialog>
                      <DialogTrigger asChild>
                        <Button variant="outline" size="sm">
                          <FolderTree className="h-4 w-4 mr-2" />
                          View Recommended Folders
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>Recommended Folders</DialogTitle>
                          <DialogDescription>
                            {`These folders are compatible with "${selectedSubtype?.name}" documents.`}
                          </DialogDescription>
                        </DialogHeader>

                        <div className="max-h-[300px] overflow-y-auto space-y-2 mt-4">
                          {recommendedFolders.map(folder => {
                            const path = buildFolderPath(folder, folders);
                            const pathString = formatFolderPath(path);

                            return (
                              <div
                                key={folder.id}
                                className="p-2 border rounded hover:bg-accent cursor-pointer"
                                onClick={() => {
                                  form.setValue('folder_id', folder.id);
                                  // Close the dialog
                                  document
                                    .querySelector('[role="dialog"] button[type="button"]')
                                    ?.click();
                                }}
                              >
                                <div className="font-medium">{folder.name}</div>
                                <div className="text-xs text-muted-foreground truncate">
                                  {pathString}
                                </div>
                              </div>
                            );
                          })}
                        </div>

                        <DialogFooter>
                          <Button type="button" variant="secondary">
                            Close
                          </Button>
                        </DialogFooter>
                      </DialogContent>
                    </Dialog>
                  </div>
                </div>
              )}
            </div>

            {/* Submit Button */}
            <Button
              type="submit"
              disabled={
                uploadMutation.isPending ||
                !form.formState.isValid ||
                files.length === 0 ||
                (selectedSubtypeId && selectedFolder && !isFolderValid)
              }
              className="w-full"
            >
              {uploadMutation.isPending ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading... {uploadProgress}%
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Document
                </>
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
