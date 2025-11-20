import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

/**
 * LiteratureService
 *
 * This service integrates with PubMed via E-utilities API to search
 * for relevant medical literature related to devices in 510(k) submissions.
 */

interface PubMedArticle {
  pmid: string;
  title: string;
  authors: string[];
  journal: string;
  publicationDate: string;
  abstract: string;
  keywords: string[];
  doi?: string;
  url: string;
  aiSummary?: string;
}

interface LiteratureSearchParams {
  deviceName?: string;
  manufacturer?: string;
  productCode?: string;
  medicalSpecialty?: string;
  intendedUse?: string;
  keywords?: string[];
  limit?: number;
  organizationId?: string;
}

class LiteratureService {
  private readonly PUBMED_BASE_URL = 'https://eutils.ncbi.nlm.nih.gov/entrez/eutils';
  private readonly PUBMED_API_KEY = process.env.PUBMED_API_KEY || '';

  /**
   * Search for medical literature related to a device
   *
   * @param params Search parameters
   * @returns List of relevant PubMed articles
   */
  async searchLiterature(params: LiteratureSearchParams): Promise<PubMedArticle[]> {
    try {
      // Build search query for PubMed API
      let searchTerms = [];

      if (params.deviceName) {
        searchTerms.push(`"${params.deviceName}"`);
      }

      if (params.manufacturer) {
        searchTerms.push(`"${params.manufacturer}"`);
      }

      if (params.medicalSpecialty) {
        searchTerms.push(`"${params.medicalSpecialty}"`);
      }

      // Add intended use keywords
      if (params.intendedUse) {
        // Extract key phrases from intended use and add them to search
        const useKeywords = this.extractKeywords(params.intendedUse);
        if (useKeywords.length > 0) {
          searchTerms.push(`(${useKeywords.join(' OR ')})`);
        }
      }

      // Add provided keywords
      if (params.keywords && params.keywords.length > 0) {
        searchTerms.push(`(${params.keywords.map(k => `"${k}"`).join(' OR ')})`);
      }

      // Always add "clinical trial" to focus on relevant studies
      searchTerms.push('("clinical trial" OR "medical device")');

      if (searchTerms.length === 0) {
        throw new Error('Search requires at least one search parameter');
      }

      // Build final search query
      const searchQuery = searchTerms.join(' AND ');
      const limit = params.limit || 5;

      // Step 1: Search for articles using esearch
      const searchUrl = `${this.PUBMED_BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}&retmax=${limit}&sort=relevance&retmode=json`;
      const searchResponse = await this.fetchWithApiKey(searchUrl);

      if (
        !searchResponse.data ||
        !searchResponse.data.esearchresult ||
        !searchResponse.data.esearchresult.idlist
      ) {
        return [];
      }

      const pmids = searchResponse.data.esearchresult.idlist;

      if (pmids.length === 0) {
        return [];
      }

      // Step 2: Fetch article details using efetch
      const detailsUrl = `${this.PUBMED_BASE_URL}/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
      const detailsResponse = await this.fetchWithApiKey(detailsUrl);

      if (!detailsResponse.data) {
        return [];
      }

      // Parse XML response to extract article details
      const articles = this.parseArticlesFromXml(detailsResponse.data);

      // Step 3: Generate AI summaries if needed
      // This would call your AI service to summarize the abstracts
      // Implement this in a real environment with appropriate AI provider

      return articles;
    } catch (error) {
      console.error('Error searching for literature:', error);
      return [];
    }
  }

  /**
   * Get article details by PubMed ID
   *
   * @param pmid PubMed ID of the article
   * @returns Article details if found
   */
  async getArticleById(pmid: string): Promise<PubMedArticle | null> {
    try {
      const url = `${this.PUBMED_BASE_URL}/efetch.fcgi?db=pubmed&id=${pmid}&retmode=xml`;
      const response = await this.fetchWithApiKey(url);

      if (!response.data) {
        return null;
      }

      const articles = this.parseArticlesFromXml(response.data);

      return articles.length > 0 ? articles[0] : null;
    } catch (error) {
      console.error(`Error fetching article ${pmid}:`, error);
      return null;
    }
  }

  /**
   * Search for literature by publication date range
   *
   * @param deviceName Device name to search for
   * @param startDate Start date in YYYY/MM/DD format
   * @param endDate End date in YYYY/MM/DD format
   * @param limit Maximum number of results
   * @returns List of matching articles
   */
  async searchByDateRange(
    deviceName: string,
    startDate: string,
    endDate: string,
    limit: number = 10
  ): Promise<PubMedArticle[]> {
    try {
      const searchQuery = `"${deviceName}" AND ("${startDate}"[Date - Publication] : "${endDate}"[Date - Publication])`;
      const searchUrl = `${this.PUBMED_BASE_URL}/esearch.fcgi?db=pubmed&term=${encodeURIComponent(searchQuery)}&retmax=${limit}&retmode=json`;

      const searchResponse = await this.fetchWithApiKey(searchUrl);

      if (
        !searchResponse.data ||
        !searchResponse.data.esearchresult ||
        !searchResponse.data.esearchresult.idlist
      ) {
        return [];
      }

      const pmids = searchResponse.data.esearchresult.idlist;

      if (pmids.length === 0) {
        return [];
      }

      const detailsUrl = `${this.PUBMED_BASE_URL}/efetch.fcgi?db=pubmed&id=${pmids.join(',')}&retmode=xml`;
      const detailsResponse = await this.fetchWithApiKey(detailsUrl);

      if (!detailsResponse.data) {
        return [];
      }

      return this.parseArticlesFromXml(detailsResponse.data);
    } catch (error) {
      console.error('Error searching by date range:', error);
      return [];
    }
  }

  /**
   * Generate an AI summary of an article abstract
   *
   * @param abstract The article abstract to summarize
   * @returns AI-generated summary of the abstract
   */
  async generateAbstractSummary(abstract: string): Promise<string> {
    try {
      // Check if OpenAI API key is available
      const openaiApiKey = process.env.OPENAI_API_KEY;

      if (!openaiApiKey) {
        console.warn('OpenAI API key not available for abstract summarization');
        return 'AI summary not available';
      }

      // In a real implementation, this would call an AI service
      // For now, return a placeholder message
      // This should be replaced with actual AI service integration
      return 'AI summary generation would happen here in production.';
    } catch (error) {
      console.error('Error generating abstract summary:', error);
      return 'Error generating summary';
    }
  }

  /**
   * Extract meaningful keywords from a text
   *
   * @param text Text to extract keywords from
   * @returns Array of extracted keywords
   */
  private extractKeywords(text: string): string[] {
    if (!text) return [];

    // Simple keyword extraction based on common medical terms
    // In a real application, this could be more sophisticated using NLP
    const words = text.split(/\s+/);
    const keywords = words
      .filter(word => word.length > 3) // Filter out short words
      .map(word => word.replace(/[^\w]/g, '')) // Remove non-word characters
      .filter(word => !this.isCommonWord(word)) // Filter out common words
      .map(word => `"${word}"`); // Add quotes for exact matching

    // Return unique keywords
    return [...new Set(keywords)];
  }

  /**
   * Check if a word is a common stopword
   *
   * @param word Word to check
   * @returns Whether the word is a common stopword
   */
  private isCommonWord(word: string): boolean {
    const stopwords = [
      'the',
      'and',
      'for',
      'with',
      'this',
      'that',
      'from',
      'have',
      'has',
      'been',
      'were',
      'they',
      'their',
      'which',
      'when',
      'what',
      'will',
    ];

    return stopwords.includes(word.toLowerCase());
  }

  /**
   * Parse PubMed article XML to extract article details
   *
   * @param xml XML response from PubMed efetch API
   * @returns Parsed article data
   */
  private parseArticlesFromXml(xml: string): PubMedArticle[] {
    // This is a simplified version - in a real application,
    // use a proper XML parser library like xml2js

    const articles: PubMedArticle[] = [];
    const articleMatches = xml.match(/<PubmedArticle>[\s\S]*?<\/PubmedArticle>/g) || [];

    for (const articleXml of articleMatches) {
      try {
        // Extract PMID
        const pmidMatch = articleXml.match(/<PMID[^>]*>(.*?)<\/PMID>/);
        const pmid = pmidMatch ? pmidMatch[1] : '';

        // Extract title
        const titleMatch = articleXml.match(/<ArticleTitle>(.*?)<\/ArticleTitle>/);
        const title = titleMatch
          ? titleMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          : '';

        // Extract journal
        const journalMatch = articleXml.match(/<Title>(.*?)<\/Title>/);
        const journal = journalMatch ? journalMatch[1] : '';

        // Extract publication date
        const yearMatch = articleXml.match(/<Year>(.*?)<\/Year>/);
        const monthMatch = articleXml.match(/<Month>(.*?)<\/Month>/);
        const dayMatch = articleXml.match(/<Day>(.*?)<\/Day>/);

        const year = yearMatch ? yearMatch[1] : '';
        const month = monthMatch ? monthMatch[1] : '';
        const day = dayMatch ? dayMatch[1] : '';

        const publicationDate = [year, month, day].filter(Boolean).join('-');

        // Extract abstract
        const abstractMatch = articleXml.match(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/);
        const abstract = abstractMatch
          ? abstractMatch[1].replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')
          : '';

        // Extract authors
        const authorMatches =
          articleXml.match(
            /<Author[^>]*>[\s\S]*?<LastName>(.*?)<\/LastName>[\s\S]*?<ForeName>(.*?)<\/ForeName>[\s\S]*?<\/Author>/g
          ) || [];
        const authors = authorMatches.map(authorXml => {
          const lastNameMatch = authorXml.match(/<LastName>(.*?)<\/LastName>/);
          const foreNameMatch = authorXml.match(/<ForeName>(.*?)<\/ForeName>/);

          const lastName = lastNameMatch ? lastNameMatch[1] : '';
          const foreName = foreNameMatch ? foreNameMatch[1] : '';

          return `${lastName} ${foreName}`.trim();
        });

        // Extract DOI
        const doiMatch = articleXml.match(/<ELocationID EIdType="doi"[^>]*>(.*?)<\/ELocationID>/);
        const doi = doiMatch ? doiMatch[1] : '';

        // Extract keywords
        const keywordMatches = articleXml.match(/<Keyword[^>]*>(.*?)<\/Keyword>/g) || [];
        const keywords = keywordMatches
          .map(keywordXml => {
            const keywordMatch = keywordXml.match(/<Keyword[^>]*>(.*?)<\/Keyword>/);
            return keywordMatch ? keywordMatch[1] : '';
          })
          .filter(Boolean);

        // Create PubMed URL
        const url = `https://pubmed.ncbi.nlm.nih.gov/${pmid}/`;

        articles.push({
          pmid,
          title,
          authors,
          journal,
          publicationDate,
          abstract,
          keywords,
          doi,
          url,
          aiSummary: '', // This would be populated by AI service in a real implementation
        });
      } catch (error) {
        console.error('Error parsing article XML:', error);
      }
    }

    return articles;
  }

  /**
   * Make a request to PubMed API with API key if available
   *
   * @param url The URL to request
   * @returns Axios response
   */
  private async fetchWithApiKey(url: string) {
    if (this.PUBMED_API_KEY) {
      // Add API key to URL if available
      const separator = url.includes('?') ? '&' : '?';
      const urlWithKey = `${url}${separator}api_key=${this.PUBMED_API_KEY}`;
      return axios.get(urlWithKey);
    } else {
      // Make request without API key
      console.warn('PubMed API key not available. Using public access with rate limits.');
      return axios.get(url);
    }
  }
}

export default new LiteratureService();
