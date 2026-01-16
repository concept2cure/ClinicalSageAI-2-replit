import axios from 'axios';
import { DeficiencyBank } from '../../api/lumen/agents/deficiency-bank';

const CT_API = 'https://clinicaltrials.gov/api/v2/studies';

export const TrialsHunter = {
  async hunt(term: string = 'device') {
    console.log(`[Trials Hunter] Scraping results for: ${term}`);
    const url = `${CT_API}?query.term=${encodeURIComponent(term)}&filter.hasResults=true&pageSize=10`;

    try {
      const { data } = await axios.get(url);
      let hits = 0;
      for (const study of data.studies || []) {
        const results = study.resultsSection;
        if (!results) continue;

        const nctId = study.protocolSection?.identificationModule?.nctId;
        const measures = results.outcomeMeasuresModule?.outcomeMeasures || [];
        const primary = measures.find((m: any) => m.type === 'PRIMARY');

        if (primary && primary.analysisList?.length > 0) {
          const pValue = primary.analysisList[0].pValue || 'NR';
          const resultVal =
            primary.classList?.[0]?.categoryList?.[0]?.measurementList?.[0]?.value || 'N/A';
          const text = `Study ${nctId}: Primary Endpoint Result = ${resultVal} (p=${pValue}).`;

          await DeficiencyBank.upload('CLINICAL_TRIALS', text, {
            insight: 'Primary Endpoint Data',
            tags: ['Evidence', 'Clinical'],
            severity: 'LOW',
          });
          hits++;
        }
      }
      return { status: 'success', new_records: hits };
    } catch (e) {
      console.error('[Trials Hunter] API Error:', e);
      return { status: 'error' };
    }
  },
};
