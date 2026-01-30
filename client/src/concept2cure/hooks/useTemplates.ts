/**
 * @fileoverview Concept2Cure Templates Hook
 * @module concept2cure/hooks/useTemplates
 * @version 2.0.0
 * 
 * @description
 * Fetches regulatory document templates from the API.
 * Templates include FDA-compliant document structures, checklists,
 * and interactive tools for various submission types.
 * 
 * @compliance
 * Templates are maintained with version control and reviewed
 * by regulatory experts. Updates follow QMS procedures.
 */

import { useQuery } from '@tanstack/react-query';
import { SubmissionType } from '../types';

/**
 * Regulatory document template structure
 * @interface Template
 */
interface Template {
  /** Unique template identifier */
  id: string;
  /** Human-readable template name */
  name: string;
  /** Template description and usage guidance */
  description: string;
  /** Submission types this template applies to */
  submissionTypes: string[];
  /** Template category (document or interactive tool) */
  category: 'document' | 'interactive';
  /** CTD section reference (e.g., '3.2.S.1') */
  ctdSection?: string;
  /** Template content (markdown or structured data) */
  content: string;
}

/**
 * Fetches templates for a specific submission type
 * 
 * @description
 * Templates are cached for 5 minutes as they rarely change.
 * Supports filtering by submission type for relevant suggestions.
 * 
 * @param submissionType - Optional filter for submission type
 * @returns Query result with array of templates
 * 
 * @example
 * ```tsx
 * // Get all 510(k) templates
 * const { data: templates } = useTemplates('510K');
 * ```
 */
export function useTemplates(submissionType?: SubmissionType) {
  return useQuery({
    queryKey: ['concept2cure-templates', submissionType],
    queryFn: async (): Promise<Template[]> => {
      const url = submissionType 
        ? `/api/concept2cure/templates?submissionType=${submissionType}`
        : '/api/concept2cure/templates';
      
      const response = await fetch(url);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error?.message || payload?.error || `Failed to fetch templates: ${response.status}`);
      }
      return payload?.data ?? payload;
    },
    staleTime: 1000 * 60 * 5, // 5 minutes - templates don't change often
  });
}

/**
 * Fetches a single template by ID
 * 
 * @description
 * Used when a user selects a specific template to preview
 * or apply to their project.
 * 
 * @param templateId - Template ID to fetch (null disables query)
 * @returns Query result with template data
 * 
 * @example
 * ```tsx
 * const { data: template } = useTemplate('tpl_510k_cover');
 * ```
 */
export function useTemplate(templateId: string | null) {
  return useQuery({
    queryKey: ['concept2cure-template', templateId],
    queryFn: async (): Promise<Template | null> => {
      if (!templateId) return null;
      
      const response = await fetch(`/api/concept2cure/templates/${templateId}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || payload?.success === false) {
        throw new Error(payload?.error?.message || payload?.error || `Template not found: ${response.status}`);
      }
      return payload?.data ?? payload;
    },
    enabled: !!templateId,
  });
}
