/**
 * D18 test fixture: narratives landed by the real narrative job (csr-narrative-job.ts
 * runNarrativeJob) into an in-memory store, as the build would land them in
 * csr_narrative_outputs and csr_section_outputs. SYNTHETIC: the slice-6
 * LMN-201-shaped ADaM set (adam-lmn201-synthetic.ts, every row invented) or the
 * slice-7 narrative set (adam-narrative-synthetic.ts) for scale. Tests only.
 */
import { getE3Section } from '../../../ind/ctd/csr-e3-guidance';
import { runNarrativeJob } from '../../csr-narrative-job';
import { adae, adcm, adex, adsl, bundle } from './adam-lmn201-synthetic';
import { read } from './csr-assembly-fixture';
import { MemoryStore } from './narrative-memory-store';
import { narrativeBundle, narrativeDatasets } from './adam-narrative-synthetic';

export interface LandedNarratives {
  store: MemoryStore;
  /** §12.3.2 and §14.3.3 as the import hands them to assembly (code, catalog title, landed text). */
  sections: Array<{ code: string; title: string; content: string }>;
}

function landed(store: MemoryStore): LandedNarratives {
  const section = (code: '12.3.2' | '14.3.3') => {
    const row = store.sections.get(code);
    if (!row) throw new Error(`SYNTHETIC fixture: the narrative job did not land §${code}.`);
    return { code, title: getE3Section(code)!.title, content: row.content };
  };
  return { store, sections: [section('12.3.2'), section('14.3.3')] };
}

/** The LMN-201-shaped study's own narratives (2 subjects), landed for study SYN-LMN201-B. */
export async function landLmn201Narratives(): Promise<LandedNarratives> {
  const store = new MemoryStore();
  const result = await runNarrativeJob({ bundle: bundle(), protocolNumber: 'SYN-LMN201-B', store,
    datasets: { ADSL: read(adsl()), ADAE: read(adae()), ADEX: read(adex()), ADCM: read(adcm()) } });
  if (result.status !== 'complete') throw new Error(`SYNTHETIC fixture: narrative job ${result.status}.`);
  return landed(store);
}

/** Many narratives (the slice-7 synthetic set of `n` subjects), for the streaming and scale case. */
export async function landManyNarratives(n: number): Promise<LandedNarratives> {
  const store = new MemoryStore();
  const result = await runNarrativeJob({ bundle: narrativeBundle(), datasets: narrativeDatasets(n), store, protocolNumber: 'SYN-LMN201-PROTOCOL' });
  if (result.status !== 'complete') throw new Error(`SYNTHETIC fixture: narrative job ${result.status}.`);
  return landed(store);
}
