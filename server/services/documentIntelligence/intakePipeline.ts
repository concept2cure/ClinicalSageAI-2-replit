import { randomUUID } from 'node:crypto';
import { TikaClient } from '../../integrations/tika/client';
import { OcrMyPdfClient } from '../../integrations/ocrmypdf/client';
import { DoclingClient } from '../../integrations/docling/client';
import { UnstructuredClient } from '../../integrations/unstructured/client';
import type { IntakeFileDescriptor, IntakePipelineReport } from './contracts';

export interface IntakePipelineDependencies {
  tika: TikaClient;
  ocr: OcrMyPdfClient;
  docling: DoclingClient;
  unstructured: UnstructuredClient;
}

export class DocumentIntakePipeline {
  constructor(
    private readonly dependencies: IntakePipelineDependencies = {
      tika: new TikaClient(),
      ocr: new OcrMyPdfClient(),
      docling: new DoclingClient(),
      unstructured: new UnstructuredClient(),
    }
  ) {}

  async process(params: {
    file: IntakeFileDescriptor;
    inputBuffer: Buffer;
    inputPath?: string;
    ocrOutputPath?: string;
  }): Promise<IntakePipelineReport> {
    const requestId = `ana_intake_${randomUUID()}`;
    const provenance: IntakePipelineReport['provenance'] = [];

    const tikaStart = new Date();
    const tika = await this.dependencies.tika.detectMetadata(params.inputBuffer, params.file.filename);
    provenance.push({
      step: 'tika_metadata',
      provider: 'tika',
      startedAt: tikaStart.toISOString(),
      completedAt: new Date().toISOString(),
      success: true,
      details: `contentType=${tika.contentType}`,
    });

    let ocrApplied = false;
    if (tika.isScannedPdf && params.inputPath && params.ocrOutputPath) {
      const ocrStart = new Date();
      const ocr = await this.dependencies.ocr.run(params.inputPath, params.ocrOutputPath);
      ocrApplied = ocr.applied;
      provenance.push({
        step: 'ocrmypdf',
        provider: 'ocrmypdf',
        startedAt: ocrStart.toISOString(),
        completedAt: new Date().toISOString(),
        success: ocr.applied,
        details: ocr.stderr,
      });
    }

    const primaryStart = new Date();
    const primaryParse = await this.dependencies.docling.parse(params.inputBuffer, params.file.filename);
    provenance.push({
      step: 'docling_parse',
      provider: 'docling',
      startedAt: primaryStart.toISOString(),
      completedAt: new Date().toISOString(),
      success: primaryParse.text.length > 0,
      details: `confidence=${primaryParse.confidence}`,
    });

    let fallbackParse: IntakePipelineReport['fallbackParse'];
    let selectedProvider = primaryParse.provider;

    if (primaryParse.text.trim().length < 200 || primaryParse.confidence < 0.45) {
      const fallbackStart = new Date();
      fallbackParse = await this.dependencies.unstructured.parse(params.inputBuffer, params.file.filename);
      provenance.push({
        step: 'unstructured_fallback',
        provider: 'unstructured',
        startedAt: fallbackStart.toISOString(),
        completedAt: new Date().toISOString(),
        success: fallbackParse.text.length > 0,
        details: `confidence=${fallbackParse.confidence}`,
      });

      if (fallbackParse.text.length > primaryParse.text.length) {
        selectedProvider = fallbackParse.provider;
      }
    }

    return {
      requestId,
      file: params.file,
      tika,
      ocrApplied,
      primaryParse,
      fallbackParse,
      selectedProvider,
      provenance,
    };
  }
}
