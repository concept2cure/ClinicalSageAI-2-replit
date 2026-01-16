import Parser from 'rss-parser';
import { Refinery } from '../refinery';
import { DeficiencyBank } from '../../api/lumen/agents/deficiency-bank';

const parser = new Parser();

export const SecHunter = {
  async run() {
    console.log('[SEC Hunter] Connecting to EDGAR...');
    const feeds = [
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=8-K&output=atom',
      'https://www.sec.gov/cgi-bin/browse-edgar?action=getcurrent&CIK=&type=10-K&output=atom',
    ];

    let hits = 0;
    for (const url of feeds) {
      try {
        const feed = await parser.parseURL(url);
        for (const item of feed.items || []) {
          const title = item.title || '';
          const summary = item.contentSnippet || '';

          if (title.includes('10-K') && /FDA|regulatory|approval/i.test(summary)) {
            await DeficiencyBank.upload('SEC_10K', `[ANNUAL_REPORT] ${title}`, {
              insight: 'Strategic Risk Analysis',
              tags: ['Strategy', '10-K'],
              severity: 'MEDIUM',
            });
            hits++;
          } else if (/complete response|clinical hold/i.test(summary)) {
            const analysis = await Refinery.extractDeficiency(summary, 'SEC_FILING');
            if (analysis) {
              await DeficiencyBank.upload('SEC_EDGAR', `[${title}] ${summary}`, analysis);
              hits++;
            }
          }
        }
      } catch (e) {
        console.error('[SEC Hunter] Error:', e);
      }
    }
    return { status: 'success', new_records: hits };
  },
};
