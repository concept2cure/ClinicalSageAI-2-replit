import axios from 'axios';
import * as cheerio from 'cheerio';
import { DeficiencyBank } from '../../api/lumen/agents/deficiency-bank';

const EU_CTR_URL = 'https://www.clinicaltrialsregister.eu/ctr-search/search';

export const EmaHunter = {
  async run() {
    console.log('[EU Hunter] Initializing Scraper...');
    const queryUrl = `${EU_CTR_URL}?query=device&result=true&pagesize=20`;

    try {
      const { data } = await axios.get(queryUrl);
      const $ = cheerio.load(data);
      let newRecords = 0;

      const results = $('.result');
      for (const el of results.toArray()) {
        const eudraId = $(el)
          .find('span:contains("EudraCT Number:")')
          .next()
          .text()
          .trim();
        const resultLink = $(el).find('a:contains("View Results")').attr('href');

        if (eudraId && resultLink) {
          const fullLink = `https://www.clinicaltrialsregister.eu${resultLink}`;
          await DeficiencyBank.upload('EU_HUNTER', `Trial ${eudraId} Results`, {
            insight: 'EU Clinical Trial Result',
            tags: ['EU', 'Clinical Data'],
            severity: 'LOW',
            reference_url: fullLink,
          });
          newRecords++;
        }
      }

      return { status: 'success', new_records: newRecords };
    } catch (e) {
      console.error('[EU Hunter] API Error:', e);
      return { status: 'error' };
    }
  },
};
