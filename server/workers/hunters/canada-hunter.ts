import axios from 'axios';
import { DeficiencyBank } from '../../api/lumen/agents/deficiency-bank';

// Note: Reusing the API endpoint logic from existing scripts
const HC_API = 'https://clinical-information.canada.ca/api/search';

export const CanadaHunter = {
  async run() {
    console.log('[Canada Hunter] Searching for full PDF CSRs...');
    try {
      const { data } = await axios.post(HC_API, {
        lang: 'en',
        term: 'device',
        type: 'csr',
      });

      let newRecords = 0;
      for (const record of (data.results || []).slice(0, 5)) {
        const downloadLink = `https://clinical-information.canada.ca${record.link}`;

        await DeficiencyBank.upload('CANADA_PRCI', `[FULL_CSR_PDF] ${record.title}`, {
          insight: 'Full Clinical Study Report',
          tags: ['CSR', 'Canada', 'Full Text'],
          severity: 'LOW',
          reference_url: downloadLink,
        });
        newRecords++;
      }
      return { status: 'success', new_records: newRecords };
    } catch (e) {
      console.error('[Canada Hunter] API Error:', e);
      return { status: 'error' };
    }
  },
};
