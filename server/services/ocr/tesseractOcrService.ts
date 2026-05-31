/**
 * Tesseract OCR engine (pure WASM, zero system dependencies).
 *
 * AnA's portable OCR engine. Unlike the system `ocrmypdf`/`tesseract` CLI paths
 * (which silently no-op wherever those binaries aren't installed — e.g. the
 * managed/ephemeral runtime), this uses the `tesseract.js` WASM core that ships
 * in `node_modules`, so image OCR works with nothing installed on the host.
 *
 * It does NOT recreate any existing OCR wiring — it activates the already-declared
 * `tesseract.js` dependency and is consumed through {@link ../ocrService}.
 *
 * Offline note: the WASM core is bundled locally, but Tesseract language data
 * (`<lang>.traineddata`) is fetched from a CDN by default. Where outbound network
 * is restricted, vendor the data and point `TESSERACT_LANG_PATH` at it (see
 * `scripts/vendor-tesseract-langdata.mjs`). `getCapabilities()` reports whether
 * language data is available locally.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';
import { createWorker, type Worker } from 'tesseract.js';
import { createScopedLogger } from '../../utils/logger';

const logger = createScopedLogger('tesseract-ocr');

/** Languages we ship support for, mirroring the legacy OCR_CONFIG language list. */
const SUPPORTED_LANGUAGES = ['eng', 'fra', 'deu', 'spa', 'ita'] as const;

function defaultLanguages(): string[] {
  const fromEnv = (process.env.TESSERACT_LANG || '').trim();
  if (fromEnv) {
    return fromEnv
      .split(/[,+\s]+/)
      .map((l) => l.trim())
      .filter(Boolean);
  }
  return ['eng'];
}

/**
 * Directory holding `<lang>.traineddata[.gz]`. Explicit env wins; otherwise the
 * vendored location, if it exists. `undefined` ⇒ tesseract.js falls back to its
 * CDN default (only works where outbound network is allowed).
 */
function resolveLangPath(): string | undefined {
  const fromEnv = (process.env.TESSERACT_LANG_PATH || '').trim();
  if (fromEnv) return fromEnv;
  // Vendored under the repo: server/assets/tessdata
  const vendored = path.resolve(__dirname, '../../assets/tessdata');
  return existsSync(vendored) ? vendored : undefined;
}

function langDataPresent(langPath: string | undefined, langs: string[]): boolean {
  if (!langPath) return false;
  return langs.every(
    (l) =>
      existsSync(path.join(langPath, `${l}.traineddata`)) ||
      existsSync(path.join(langPath, `${l}.traineddata.gz`)),
  );
}

export interface OcrImageOptions {
  /** Languages to recognise, e.g. ['eng'] or ['eng','fra']. Defaults to TESSERACT_LANG or ['eng']. */
  languages?: string[];
}

export interface OcrImageResult {
  text: string;
  /** Mean recognition confidence, 0–100. */
  confidence: number;
  languages: string[];
  durationMs: number;
}

export interface TesseractCapabilities {
  engine: 'tesseract.js';
  /** WASM core is bundled in node_modules, so the engine itself is always loadable. */
  available: true;
  defaultLanguages: string[];
  supportedLanguages: readonly string[];
  langPath?: string;
  /** True when traineddata for the default languages is on disk (offline-ready). */
  langDataLocal: boolean;
}

export type ImageInput = Buffer | Uint8Array | string;

/**
 * Singleton WASM worker. A Tesseract worker processes one job at a time, so
 * recognise calls are serialised through a promise chain.
 */
class TesseractOcrService {
  private worker: Worker | null = null;
  private workerLangs: string[] = [];
  private chain: Promise<unknown> = Promise.resolve();

  getCapabilities(): TesseractCapabilities {
    const langPath = resolveLangPath();
    const langs = defaultLanguages();
    return {
      engine: 'tesseract.js',
      available: true,
      defaultLanguages: langs,
      supportedLanguages: SUPPORTED_LANGUAGES,
      langPath,
      langDataLocal: langDataPresent(langPath, langs),
    };
  }

  /** Recognise text in an image (PNG, JPEG, TIFF, BMP, PBM, WEBP). */
  async recognizeImage(input: ImageInput, options: OcrImageOptions = {}): Promise<OcrImageResult> {
    const languages = options.languages?.length ? options.languages : defaultLanguages();
    return this.serialize(async () => {
      const worker = await this.ensureWorker(languages);
      const startedAt = Date.now();
      const image = typeof input === 'string' ? input : Buffer.from(input);
      const { data } = await worker.recognize(image);
      const durationMs = Date.now() - startedAt;
      logger.info('OCR completed', {
        languages: languages.join('+'),
        chars: data.text.length,
        confidence: Math.round(data.confidence),
        durationMs,
      });
      return {
        text: data.text.trim(),
        confidence: data.confidence,
        languages,
        durationMs,
      };
    });
  }

  /** Release the WASM worker. Safe to call when no worker is running. */
  async terminate(): Promise<void> {
    const worker = this.worker;
    this.worker = null;
    this.workerLangs = [];
    if (worker) {
      await worker.terminate();
    }
  }

  private async ensureWorker(languages: string[]): Promise<Worker> {
    const key = languages.join('+');
    if (this.worker && this.workerLangs.join('+') === key) {
      return this.worker;
    }
    // Languages changed (or first use): rebuild the worker.
    if (this.worker) {
      await this.worker.terminate();
      this.worker = null;
    }

    const langPath = resolveLangPath();
    if (!langDataPresent(langPath, languages)) {
      logger.warn('Tesseract language data not found locally; relying on network fetch', {
        languages: key,
        langPath: langPath ?? '(tesseract.js default CDN)',
      });
    }

    const options: Record<string, unknown> = {
      logger: () => {}, // suppress tesseract.js progress noise; we log outcomes ourselves
    };
    if (langPath) options.langPath = langPath;

    const worker = await createWorker(languages, undefined, options);
    this.worker = worker;
    this.workerLangs = languages;
    return worker;
  }

  private serialize<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task, task);
    // Keep the chain alive regardless of individual task outcome.
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }
}

export const tesseractOcrService = new TesseractOcrService();
