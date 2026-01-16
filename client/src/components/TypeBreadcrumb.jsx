import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, ChevronRight } from 'lucide-react'



/**
 * TypeBreadcrumb Component
 *
 * Displays a breadcrumb showing the document type hierarchy:
 * [Document Type] > [Document Subtype]
 *
 * Use this component in document preview/detail views to provide
 * context about where the document fits in the reference model taxonomy.
 *
 * @param {Object} props Component props
 * @param {string} props.subtypeId The document subtype ID
 * @param {string} props.className Optional additional CSS classes
 */
export default function TypeBreadcrumb({ subtypeId, className = '' }) {
  // Get subtype details with type information
  const {
    data: subtype,
    isLoading,
    error,
  } = useQuery({
    queryKey: ['/api/meta/subtypes', subtypeId],
    queryFn: async () => {
      if (!subtypeId) return null;
      const response = await fetch(`/api/meta/subtypes?id=${subtypeId}`);
      if (!response.ok) {
        throw new Error('Failed to fetch subtype information');
      }
      const data = await response.json();
      return data.length > 0 ? data[0] : null;
    },
    enabled: !!subtypeId,
    staleTime: 60 * 60 * 1000, // Cache for 1 hour
  });

  // If not yet loaded or no subtypeId provided
  if (isLoading) {
    return (
      <div className={`text-xs text-gray-500 flex items-center ${className}`}>
        <Loader2 className="h-3 w-3 animate-spin mr-1" />
        <span>Loading document type...</span>
      </div>
    );
  }

  // If error or no subtype found
  if (error || !subtype) {
    return null;
  }

  // Render the breadcrumb
  return (
    <div className={`text-xs text-gray-500 flex items-center ${className}`}>
      <span style={{ color: '#e6007d' }}>{subtype.document_types?.name || 'Unknown Type'}</span>
      <ChevronRight className="h-3 w-3 mx-1" />
      <span>{subtype.name}</span>
    </div>
  );
}

/**
 * A simpler version that doesn't fetch data but requires all props
 *
 * @param {Object} props Component props
 * @param {string} props.typeName The document type name
 * @param {string} props.subtypeName The document subtype name
 * @param {string} props.className Optional additional CSS classes
 */
export function StaticTypeBreadcrumb({ typeName, subtypeName, className = '' }) {
  if (!typeName || !subtypeName) return null;

  return (
    <div className={`text-xs text-gray-500 flex items-center ${className}`}>
      <span style={{ color: '#e6007d' }}>{typeName}</span>
      <ChevronRight className="h-3 w-3 mx-1" />
      <span>{subtypeName}</span>
    </div>
  );
}
