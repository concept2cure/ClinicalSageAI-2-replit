export type ComputeIntentType =
  | 'docx_generation'
  | 'spreadsheet_generation'
  | 'chart_report_generation'
  | 'pptx_generation'
  | 'bundle_assembly'
  | 'safe_html_generation';

export type ComputeSurfaceKey = 'ri_copilot' | 'cmc_module3' | 'ectd_ind' | 'governed_export';

export interface ComputeIntent {
  projectId: number;
  organizationId: number;
  requestedById: number;
  surfaceKey: ComputeSurfaceKey;
  intentType: ComputeIntentType;
  title: string;
  ctdSection?: string;
  content: string;
  format: 'docx' | 'xlsx' | 'pptx' | 'zip' | 'html';
  metadata?: Record<string, unknown>;
}

export interface ComputeOutput {
  outputType: string;
  mimeType: string;
  fileName: string;
  buffer: Buffer;
  sanitizerReport?: Record<string, unknown>;
}
