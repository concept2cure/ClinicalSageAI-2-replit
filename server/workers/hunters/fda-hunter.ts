import axios from 'axios';
import { Refinery } from '../refinery';
import { DeficiencyBank } from '../../api/lumen/agents/deficiency-bank';

const FDA_API = 'https://api.fda.gov/device/enforcement.json';

export const FdaHunter = {
  async run() {
    console.log('[FDA Hunter] Querying OpenFDA...');
    const url = `${FDA_API}?search=status:"Open"+AND+product_type:"Medical+Devices"+AND+(classification:"Class+I"+OR+classification:"Class+II")&limit=10`;

    try {
      const { data } = await axios.get(url);
      let hits = 0;
      for (const event of data.results || []) {
        const analysis = await Refinery.extractDeficiency(event.reason_for_recall, 'FDA_WARNING');
        if (analysis) {
          await DeficiencyBank.upload('FDA_ENFORCEMENT', event.reason_for_recall, analysis);
          hits++;
        }
      }
      return { status: 'success', new_records: hits };
    } catch (e) {
      console.error('[FDA Hunter] API Error:', e);
      return { status: 'error' };
    }
  },
};
