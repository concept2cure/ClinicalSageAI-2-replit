export interface TikaExtractionResult {
  text: string;
  metadata: Record<string, string | string[]>;
  contentType?: string;
  parser: 'tika' | 'fallback';
}

const DEFAULT_TIMEOUT_MS = 15000;

export function isTikaEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.TIKA_ENABLED === 'true' && Boolean(env.TIKA_BASE_URL);
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`Tika request timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}

export async function extractWithTika(file: {
  buffer: Buffer;
  filename: string;
  mimeType?: string;
}): Promise<TikaExtractionResult | null> {
  if (!isTikaEnabled()) return null;

  const baseUrl = process.env.TIKA_BASE_URL as string;
  const timeoutMs = Number(process.env.TIKA_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);

  const metadataReq = fetch(`${baseUrl.replace(/\/$/, '')}/meta`, {
    method: 'PUT',
    headers: {
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Accept': 'application/json',
      'X-Tika-OCRLanguage': process.env.TIKA_OCR_LANGUAGE || 'eng',
      'X-Tika-Filename': file.filename,
    },
    body: file.buffer,
  }).then(async r => {
    if (!r.ok) throw new Error(`Tika /meta failed (${r.status})`);
    return (await r.json()) as Record<string, string | string[]>;
  });

  const textReq = fetch(`${baseUrl.replace(/\/$/, '')}/tika`, {
    method: 'PUT',
    headers: {
      'Content-Type': file.mimeType || 'application/octet-stream',
      'Accept': 'text/plain',
      'X-Tika-Filename': file.filename,
    },
    body: file.buffer,
  }).then(async r => {
    if (!r.ok) throw new Error(`Tika /tika failed (${r.status})`);
    return r.text();
  });

  const [metadata, text] = await withTimeout(Promise.all([metadataReq, textReq]), timeoutMs);

  return {
    text,
    metadata,
    contentType: typeof metadata['Content-Type'] === 'string' ? metadata['Content-Type'] : file.mimeType,
    parser: 'tika',
  };
}
