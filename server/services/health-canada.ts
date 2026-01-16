import axios from 'axios';
import { parse } from 'csv-parse/sync';
import { db } from '../../lib/database.js';
import { logEvent } from '../api/system.js';
import { extractTextFromPdf } from '../utils/pdf-extractor.js';
import { LLMStructuredExtractor } from './deep-miner/llm-extractor.js';

const HC_PACKAGE_ID = 'clinical-information-portal-portail-renseignements-cliniques';
const API_BASE = 'https://open.canada.ca/data/en/api/3/action';

const AXIOS_CONFIG = {
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) ClinicalSage/1.0 (Research)',
    Accept: 'application/json, text/csv, application/pdf',
  },
};

type HealthCanadaStudy = {
  drug_name?: string;
  brand_name?: string;
  therapeutic_area?: string;
  study_title?: string;
  link?: string;
  url_en?: string;
  info_link?: string;
};

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

export const HealthCanadaConnector = {
  async getMasterIndexUrl() {
    try {
      console.log('[HC_CONNECTOR] Resolving Dataset Metadata...');
      const res = await axios.get(`${API_BASE}/package_show?id=${HC_PACKAGE_ID}`, AXIOS_CONFIG);
      const resources = res.data?.result?.resources || [];
      const csvResource = resources.find((resource: any) => {
        const format = String(resource?.format || '').toUpperCase();
        const name = String(resource?.name || '').toLowerCase();
        return format === 'CSV' && name.includes('metadata');
      });

      if (!csvResource?.url) throw new Error('CSV Resource not found in dataset package');
      return csvResource.url as string;
    } catch (e: any) {
      console.error('Failed to resolve Master Index URL:', e?.message || e);
      return null;
    }
  },

  async syncCatalog(therapeuticArea?: string) {
    const csvUrl = await this.getMasterIndexUrl();
    if (!csvUrl) throw new Error('Could not locate Master Index CSV');

    console.log(`[HC_CONNECTOR] Downloading Master Index from ${csvUrl}...`);
    const csvRes = await axios.get(csvUrl, { responseType: 'text', ...AXIOS_CONFIG });

    const records = parse(csvRes.data, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as HealthCanadaStudy[];

    console.log(`[HC_CONNECTOR] Index contains ${records.length} total studies.`);

    const candidates = records
      .filter((record: HealthCanadaStudy) => {
        const corpus = `${record.drug_name || ''} ${record.brand_name || ''} ${
          record.therapeutic_area || ''
        } ${record.study_title || ''}`.toLowerCase();
        return therapeuticArea ? corpus.includes(therapeuticArea.toLowerCase()) : true;
      })
      .slice(0, 50);

    console.log(
      `[HC_CONNECTOR] Found ${candidates.length} matches for "${therapeuticArea || 'ALL'}". Starting Ingestion...`
    );

    let importedCount = 0;

    const extractor = new LLMStructuredExtractor();

    for (const item of candidates) {
      const pdfUrl = item.link || item.url_en || item.info_link;
      if (!pdfUrl || !pdfUrl.endsWith('.pdf')) continue;

      const exists = await db.query('SELECT 1 FROM deficiency_bank WHERE source_url = $1', [pdfUrl]);
      if (exists.rows.length > 0) continue;

      try {
        console.log(`[HC_CONNECTOR] ⬇️ Downloading: ${item.drug_name || 'Unknown'}...`);
        const pdfRes = await axios.get(pdfUrl, {
          responseType: 'arraybuffer',
          timeout: 45000,
          ...AXIOS_CONFIG,
        });
        const pdfBuffer = Buffer.from(pdfRes.data);

        const rawText = await extractTextFromPdf(pdfBuffer);
        const deepData = await extractor.extractFullPayload(
          rawText,
          `CSR: ${item.drug_name || 'Unknown Drug'}`
        );

        await db.query(
          `
          INSERT INTO csr_deep_vault (
            regulatory_agency,
            submission_id,
            study_id,
            drug_name,
            deep_data,
            extraction_method,
            extraction_confidence_score,
            pdf_url
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
          [
            'Health Canada',
            deepData?.regulatory?.submission_id || 'UNKNOWN',
            deepData?.regulatory?.study_id || 'UNKNOWN',
            item.drug_name || null,
            JSON.stringify(deepData || {}),
            'gpt-4-structured',
            deepData?._extractionMetadata?.confidenceScore || null,
            pdfUrl,
          ]
        );

        importedCount++;
        await sleep(1500);
      } catch (err: any) {
        console.error(`Error processing ${item.drug_name || 'Unknown'}:`, err?.message || err);
        await logEvent('SYSTEM_HARVESTER', 'INGEST_FAIL', item.drug_name || 'Unknown', {
          error: err?.message || err,
        });
      }
    }

    await logEvent('SYSTEM_HARVESTER', 'BATCH_COMPLETE', 'Health Canada', {
      count: importedCount,
      query: therapeuticArea || null,
    });

    return importedCount;
  },
};
