export interface GrobidExtractionResult {
  title?: string;
  abstract?: string;
  authors: string[];
  sections: Array<{ heading: string; text: string }>;
  references: Array<{ title?: string; raw: string }>;
  parser: 'grobid' | 'fallback';
}

export function isGrobidEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.GROBID_ENABLED === 'true' && Boolean(env.GROBID_BASE_URL);
}

function textBetween(xml: string, startTag: string, endTag: string): string | undefined {
  const start = xml.indexOf(startTag);
  if (start < 0) return undefined;
  const end = xml.indexOf(endTag, start + startTag.length);
  if (end < 0) return undefined;
  return xml.slice(start + startTag.length, end).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

export function looksScholarlyDocument(fileName: string, extractedText = ''): boolean {
  const n = fileName.toLowerCase();
  const t = extractedText.slice(0, 3000).toLowerCase();
  return Boolean(
    n.endsWith('.pdf') &&
      (/(journal|study|trial|manuscript|paper|publication|csr|cer|pmid|doi)/.test(n) ||
        /(abstract|references|introduction|methods|results|discussion|doi|pmid)/.test(t))
  );
}

export async function extractWithGrobid(file: {
  buffer: Buffer;
  filename: string;
}): Promise<GrobidExtractionResult | null> {
  if (!isGrobidEnabled()) return null;
  const baseUrl = (process.env.GROBID_BASE_URL as string).replace(/\/$/, '');

  const body = new FormData();
  body.append('input', new Blob([file.buffer], { type: 'application/pdf' }), file.filename);
  body.append('consolidateHeader', '1');
  body.append('consolidateCitations', '1');
  body.append('includeRawCitations', '1');

  const resp = await fetch(`${baseUrl}/api/processFulltextDocument`, { method: 'POST', body });
  if (!resp.ok) {
    throw new Error(`GROBID processFulltextDocument failed (${resp.status})`);
  }

  const tei = await resp.text();
  const title = textBetween(tei, '<title level="a" type="main">', '</title>') || textBetween(tei, '<title>', '</title>');
  const abstract = textBetween(tei, '<abstract>', '</abstract>');

  const authors = Array.from(tei.matchAll(/<persName>([\s\S]*?)<\/persName>/g)).map(m =>
    m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  ).filter(Boolean);

  const sections = Array.from(tei.matchAll(/<div[^>]*>([\s\S]*?)<\/div>/g)).slice(0, 80).map(m => {
    const raw = m[1];
    const heading = (raw.match(/<head[^>]*>([\s\S]*?)<\/head>/)?.[1] || 'Section')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const text = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return { heading, text };
  }).filter(s => s.text.length > 20);

  const references = Array.from(tei.matchAll(/<biblStruct[\s\S]*?<\/biblStruct>/g)).map(m => {
    const raw = m[0].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    const refTitle = m[0].match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/<[^>]+>/g, ' ').trim();
    return { title: refTitle, raw };
  });

  return { title, abstract, authors, sections, references, parser: 'grobid' };
}
