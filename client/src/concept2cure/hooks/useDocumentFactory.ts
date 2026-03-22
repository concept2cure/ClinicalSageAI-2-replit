/**
 * useDocumentFactory — Hooks for DOCX generation pipeline.
 *
 * Connects:
 * - POST /api/knowledge-base/generate-docx       → Generate DOCX from content
 * - POST /api/knowledge-base/generate-ind-section → Generate IND section
 * - POST /api/knowledge-base/generate-ind-package → Generate full IND package
 * - POST /api/docx-factory/renders                → Queue DOCX Factory render
 * - POST /api/docx-factory/renders/:id/execute    → Execute render → download artifact
 */

import { useMutation } from '@tanstack/react-query';

function getAuthHeaders(): Record<string, string> {
  const token =
    sessionStorage.getItem('trialsage_access_token') ||
    localStorage.getItem('trialsage_access_token');
  return token
    ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }
    : { 'Content-Type': 'application/json' };
}

// ── Generate DOCX from content (via knowledge-base → shadow service) ──────
export interface GenerateDocxParams {
  title: string;
  content: string; // HTML content from editor
  submissionType?: string; // e.g., "IND", "510K", "NDA"
  sections?: Array<{
    title: string;
    content: string;
    sectionCode?: string; // e.g., "2.5" for Clinical Overview
  }>;
  metadata?: Record<string, string>;
}

export function useGenerateDocx() {
  return useMutation({
    mutationFn: async (params: GenerateDocxParams): Promise<Blob> => {
      const res = await fetch('/api/knowledge-base/generate-docx', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'DOCX generation failed' }));
        throw new Error(err.error || 'DOCX generation failed');
      }
      return res.blob();
    },
  });
}

// ── Generate a single IND section ──────────────────────────────────────────
export interface GenerateINDSectionParams {
  projectId: string;
  sectionCode: string; // e.g., "2.5", "3.2.S"
  sectionTitle: string;
  context?: string; // Additional context/instructions
}

export interface GeneratedSection {
  sectionCode: string;
  sectionTitle: string;
  content: string; // HTML content
  citations: Array<{ source: string; text: string }>;
}

export function useGenerateINDSection() {
  return useMutation({
    mutationFn: async (params: GenerateINDSectionParams): Promise<GeneratedSection> => {
      const res = await fetch('/api/knowledge-base/generate-ind-section', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Section generation failed' }));
        throw new Error(err.error || 'Section generation failed');
      }
      const data = await res.json();
      const content = data.content || data.data?.content || '';

      // Auto-persist as artifact if projectId provided and content is real
      if (params.projectId && content && content.trim().length > 0) {
        try {
          await fetch('/api/knowledge-base/save-docx-as-artifact', {
            method: 'POST',
            headers: getAuthHeaders(),
            body: JSON.stringify({
              projectId: params.projectId,
              title: `${params.sectionCode} — ${params.sectionTitle}`,
              htmlContent: content,
              ctdSection: params.sectionCode,
              type: 'regulatory_document',
            }),
          });
        } catch {
          // Non-blocking — artifact save failure doesn't break generation
        }
      }

      return data;
    },
  });
}

// ── Generate full IND package ──────────────────────────────────────────────
export interface GenerateINDPackageParams {
  projectId: string;
  submissionType?: string;
  sections?: string[]; // Section codes to include
}

export function useGenerateINDPackage() {
  return useMutation({
    mutationFn: async (params: GenerateINDPackageParams): Promise<Blob> => {
      // Pass saveAsArtifact flag so server persists as governed artifact
      const res = await fetch('/api/knowledge-base/generate-ind-package', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...params,
          saveAsArtifact: true,
          artifactProjectId: params.projectId,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Package generation failed' }));
        throw new Error(err.error || 'Package generation failed');
      }
      return res.blob();
    },
  });
}

// ── Download helper: triggers browser download from Blob ───────────────────
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Delay revocation to allow download to start
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// ── Generate Module 3 (CMC) DOCX from structured data ─────────────────────
export interface GenerateModule3Params {
  drug_name?: string;
  substance_name?: string;
  molecular_formula?: string;
  molecular_weight?: string;
  dosage_form?: string;
  strength?: string;
  route_of_administration?: string;
  manufacturing_process?: string;
  specifications?: unknown;
  stability_data?: unknown;
  impurities_profile?: unknown;
  composition?: unknown;
}

export function useGenerateModule3Docx() {
  return useMutation({
    mutationFn: async (params: GenerateModule3Params & { projectId?: string }): Promise<Blob> => {
      // Pass saveAsArtifact flag so server persists as governed artifact
      const res = await fetch('/api/knowledge-base/generate-module3-docx', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({
          ...params,
          saveAsArtifact: true,
          artifactProjectId: params.projectId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Module 3 generation failed' }));
        throw new Error(err.error || 'Module 3 generation failed');
      }
      return res.blob();
    },
  });
}

// ── Save generated document as a project artifact ─────────────────────────
export interface SaveAsArtifactParams {
  projectId: string;
  title: string;
  htmlContent: string;
  ctdSection?: string;
  type?: string;
}

export function useSaveAsArtifact() {
  return useMutation({
    mutationFn: async (
      params: SaveAsArtifactParams
    ): Promise<{ artifactId: string; title: string; version: number }> => {
      const res = await fetch('/api/knowledge-base/save-docx-as-artifact', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(params),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(err.error || 'Save failed');
      }
      const payload = await res.json();
      return payload.data;
    },
  });
}
