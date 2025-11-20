import React, { useEffect, useState } from 'react';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, AlertCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Document Type Selector component for the Vault reference model
 * Allows users to select document types and subtypes for document upload
 */
export function DocumentTypeSelector({
  onTypeChange,
  onSubtypeChange,
  selectedType,
  selectedSubtype,
  business_unit = null, // Optional filter for business unit
}) {
  // Get all document types
  const {
    data: documentTypes,
    isLoading: typesLoading,
    error: typesError,
  } = useQuery({
    queryKey: ['/api/document-types'],
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Get subtypes based on selected document type
  const {
    data: documentSubtypes,
    isLoading: subtypesLoading,
    error: subtypesError,
  } = useQuery({
    queryKey: ['/api/document-subtypes', selectedType],
    enabled: !!selectedType,
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });

  // Filter subtypes by business unit if specified
  const filteredSubtypes = documentSubtypes?.filter(
    subtype => !business_unit || !subtype.business_unit || subtype.business_unit === business_unit
  );

  // Handle errors
  const hasError = typesError || subtypesError;

  // Handle document type change
  const handleTypeChange = value => {
    onTypeChange(value);
    onSubtypeChange(null); // Reset subtype when type changes
  };

  // Render error state
  if (hasError) {
    return (
      <Alert variant="destructive" className="mb-4">
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>Error</AlertTitle>
        <AlertDescription>
          {typesError ? typesError.message : subtypesError.message}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      {/* Document Type Selector */}
      <div className="space-y-2">
        <Label htmlFor="document-type">Document Type</Label>
        <Select value={selectedType} onValueChange={handleTypeChange} disabled={typesLoading}>
          <SelectTrigger id="document-type" className="w-full">
            <SelectValue placeholder="Select a document type" />
          </SelectTrigger>
          <SelectContent>
            {typesLoading ? (
              <div className="flex justify-center items-center py-2">
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
                <span>Loading...</span>
              </div>
            ) : (
              documentTypes?.map(type => (
                <SelectItem key={type.id} value={type.id}>
                  <div className="flex items-center">
                    {type.icon && (
                      <span className="mr-2 text-muted-foreground" style={{ color: type.color }}>
                        <i className={`fas fa-${type.icon}`}></i>
                      </span>
                    )}
                    {type.name}
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
      </div>

      {/* Document Subtype Selector - only shown when a type is selected */}
      {selectedType && (
        <div className="space-y-2">
          <Label htmlFor="document-subtype">Document Subtype</Label>
          <Select
            value={selectedSubtype}
            onValueChange={onSubtypeChange}
            disabled={subtypesLoading || !selectedType}
          >
            <SelectTrigger id="document-subtype" className="w-full">
              <SelectValue placeholder="Select a document subtype" />
            </SelectTrigger>
            <SelectContent>
              {subtypesLoading ? (
                <div className="flex justify-center items-center py-2">
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  <span>Loading...</span>
                </div>
              ) : filteredSubtypes?.length > 0 ? (
                filteredSubtypes.map(subtype => (
                  <SelectItem key={subtype.id} value={subtype.id}>
                    <div className="flex items-center">
                      {subtype.icon && (
                        <span className="mr-2 text-muted-foreground">
                          <i className={`fas fa-${subtype.icon}`}></i>
                        </span>
                      )}
                      {subtype.name}
                      {subtype.business_unit && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({subtype.business_unit})
                        </span>
                      )}
                    </div>
                  </SelectItem>
                ))
              ) : (
                <div className="py-2 px-2 text-sm text-muted-foreground">No subtypes available</div>
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Show lifecycle information for selected subtype */}
      {selectedSubtype && documentSubtypes && (
        <div className="text-sm text-muted-foreground mt-2 bg-muted p-2 rounded">
          {(() => {
            const subtype = documentSubtypes.find(s => s.id === selectedSubtype);
            if (!subtype) return null;

            return (
              <>
                <p className="font-medium">{subtype.name}</p>
                <p>Lifecycle: {subtype.lifecycle?.name || 'Standard'}</p>
                {subtype.requires_training && <p className="text-blue-600">Requires training</p>}
                {subtype.review_interval && (
                  <p>Periodic review: Every {subtype.review_interval} months</p>
                )}
              </>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default DocumentTypeSelector;
