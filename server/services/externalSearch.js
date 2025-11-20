/**
 * External Search Service for Ask Lumen
 *
 * This service provides functions to search and retrieve data from external
 * regulatory and medical sources such as FDA, PubMed, etc.
 */

import axios from 'axios';

/**
 * Search FDA for 510(k) device information
 * @param {string} term - The search term
 * @returns {Promise<Array>} - Array of FDA 510(k) results
 */
export async function searchFDA(term) {
  try {
    const resp = await axios.get(
      `https://api.fda.gov/device/510k.json?search=${encodeURIComponent(term)}&limit=3`
    );
    return resp.data.results || [];
  } catch (error) {
    console.error(`Error searching FDA: ${error.message}`);
    return [];
  }
}

/**
 * Search ClinicalTrials.gov for trial information
 * @param {string} term - The search term
 * @returns {Promise<Array>} - Array of clinical trial results
 */
export async function searchClinicalTrials(term) {
  try {
    // Using the public API
    const resp = await axios.get(
      `https://clinicaltrials.gov/api/query/study_fields?expr=${encodeURIComponent(term)}&fields=NCTId,BriefTitle,Condition,InterventionName,Phase&fmt=json&max_rnk=3`
    );
    return resp.data.StudyFieldsResponse?.StudyFields || [];
  } catch (error) {
    console.error(`Error searching ClinicalTrials.gov: ${error.message}`);
    return [];
  }
}

/**
 * Search PubMed for medical literature
 * @param {string} term - The search term
 * @returns {Promise<Array>} - Array of PubMed results
 */
export async function searchPubMed(term) {
  try {
    // Using the NCBI E-utilities API
    const apiKey = process.env.PUBMED_API_KEY || '';
    const searchResp = await axios.get(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(term)}&retmax=3&retmode=json&api_key=${apiKey}`
    );

    const idList = searchResp.data.esearchresult?.idlist || [];
    if (idList.length === 0) return [];

    // Get details for each PubMed ID
    const summaryResp = await axios.get(
      `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${idList.join(',')}&retmode=json&api_key=${apiKey}`
    );

    const results = [];
    const summaries = summaryResp.data.result || {};

    for (const id of idList) {
      if (summaries[id]) {
        results.push({
          pmid: id,
          title: summaries[id].title || '',
          abstract: 'Abstract available on PubMed', // Full abstracts require additional API calls
          authors: (summaries[id].authors || []).map(a => a.name).join(', '),
          journal: summaries[id].fulljournalname || '',
          pubdate: summaries[id].pubdate || '',
        });
      }
    }

    return results;
  } catch (error) {
    console.error(`Error searching PubMed: ${error.message}`);
    return [];
  }
}

/**
 * Search FDA Adverse Event Reporting System (FAERS)
 * @param {string} term - The search term (drug or device name)
 * @returns {Promise<Object>} - FAERS data summary
 */
export async function searchFAERS(term) {
  try {
    // Using the FDA FAERS API
    const resp = await axios.get(
      `https://api.fda.gov/drug/event.json?search=${encodeURIComponent(term)}&limit=5`
    );
    return {
      total: resp.data.meta.results.total || 0,
      results: resp.data.results || [],
    };
  } catch (error) {
    console.error(`Error searching FAERS: ${error.message}`);
    return { total: 0, results: [] };
  }
}

/**
 * Search for guidelines from EMA (European Medicines Agency)
 * @param {string} term - The search term
 * @returns {Promise<Array>} - Array of EMA guideline results
 */
export async function searchEMA(term) {
  try {
    // For demonstration - in a real implementation, this would use EMA's API
    // or web scraping if no official API is available
    return [
      {
        title: `EMA guidelines related to ${term}`,
        summary: `This would contain actual EMA guidelines for ${term} from the EMA website`,
        url: `https://www.ema.europa.eu/en/search/search?search_api_views_fulltext=${encodeURIComponent(term)}`,
      },
    ];
  } catch (error) {
    console.error(`Error searching EMA: ${error.message}`);
    return [];
  }
}

/**
 * Comprehensive search across multiple regulatory sources
 * @param {string} term - The search term
 * @param {Array<string>} sources - Array of source names to search
 * @returns {Promise<Object>} - Consolidated results from all sources
 */
export async function comprehensiveSearch(
  term,
  sources = ['fda', 'pubmed', 'clinicaltrials', 'faers', 'ema']
) {
  const results = {};
  const searchPromises = [];

  if (sources.includes('fda')) {
    searchPromises.push(
      searchFDA(term).then(data => {
        results.fda = data;
      })
    );
  }

  if (sources.includes('pubmed')) {
    searchPromises.push(
      searchPubMed(term).then(data => {
        results.pubmed = data;
      })
    );
  }

  if (sources.includes('clinicaltrials')) {
    searchPromises.push(
      searchClinicalTrials(term).then(data => {
        results.clinicaltrials = data;
      })
    );
  }

  if (sources.includes('faers')) {
    searchPromises.push(
      searchFAERS(term).then(data => {
        results.faers = data;
      })
    );
  }

  if (sources.includes('ema')) {
    searchPromises.push(
      searchEMA(term).then(data => {
        results.ema = data;
      })
    );
  }

  await Promise.allSettled(searchPromises);
  return results;
}
