import { diffLines } from 'diff';
import { RedlinesClient } from '../../integrations/redlines/client';
import type { ReviewDiffArtifact } from '../documentIntelligence/contracts';

export class ReviewDiffService {
  constructor(private readonly redlinesClient = new RedlinesClient()) {}

  async buildDiff(params: {
    artifactId: string;
    fromVersionId: string;
    toVersionId: string;
    previousText: string;
    nextText: string;
  }): Promise<ReviewDiffArtifact> {
    const unifiedDiff = createUnifiedDiff(params.previousText, params.nextText);
    const diff2html = await renderDiffHtml(unifiedDiff);
    const redlines = await this.redlinesClient.generate(params.previousText, params.nextText);

    return {
      artifactId: params.artifactId,
      fromVersionId: params.fromVersionId,
      toVersionId: params.toVersionId,
      redlinesJson: {
        provider: redlines ? 'python-redlines' : 'native-fallback',
        markdown: redlines?.html || '',
        summary: redlines?.summary || 'Redlines sidecar unavailable. Using unified diff + diff2html fallback.',
      },
      diff2html,
      generatedAt: new Date().toISOString(),
    };
  }
}

function createUnifiedDiff(previousText: string, nextText: string): string {
  const chunks = diffLines(previousText, nextText);
  const diffBody = chunks
    .map((chunk) => {
      const prefix = chunk.added ? '+' : chunk.removed ? '-' : ' ';
      return chunk.value
        .split('\n')
        .filter((line, index, arr) => !(index === arr.length - 1 && line === ''))
        .map((line) => `${prefix}${line}`)
        .join('\n');
    })
    .filter(Boolean)
    .join('\n');

  return ['--- a/document.txt', '+++ b/document.txt', '@@ -1 +1 @@', diffBody].join('\n');
}

async function renderDiffHtml(unifiedDiff: string): Promise<string> {
  try {
    const diff2htmlModule = await import('diff2html');
    const html = (diff2htmlModule as any).html(unifiedDiff, {
      drawFileList: false,
      matching: 'lines',
      outputFormat: 'side-by-side',
    });
    return String(html);
  } catch {
    return `<pre>${escapeHtml(unifiedDiff)}</pre>`;
  }
}

function escapeHtml(input: string): string {
  return input
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
