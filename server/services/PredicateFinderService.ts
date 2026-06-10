import axios from 'axios';

/**
 * PredicateFinderService
 *
 * This service interfaces with the FDA's public API to search for potential
 * predicate devices that could be used in a 510(k) submission.
 */

interface PredicateDevice {
  id: string;
  name: string;
  manufacturer: string;
  clearanceDate: string;
  productCode?: string;
  deviceClass?: string;
  decisionSummaryURL?: string;
}

interface SearchParams {
  deviceName?: string;
  manufacturer?: string;
  productCode?: string;
  intendedUse?: string;
  keywords?: string[];
  limit?: number;
  organizationId?: string;
}

class PredicateFinderService {
  private readonly FDA_ENDPOINT = 'https://api.fda.gov/device/510k.json';

  /**
   * Search for potential predicate devices based on device information
   *
   * @param params Search parameters including device name, manufacturer, etc.
   * @returns List of potential predicate devices
   */
  async findPredicates(params: SearchParams): Promise<PredicateDevice[]> {
    try {
      // Build FDA API query
      const query = [];

      // SECURITY/correctness: percent-encode the user-supplied VALUES only,
      // leaving the openFDA query operators (field:"", +AND+, (), +) intact.
      // Unencoded device names with spaces or quotes previously broke the
      // query string; encoding a value that is already URL-safe is a no-op.
      if (params.deviceName) {
        query.push(`device_name:"${encodeURIComponent(params.deviceName)}"`);
      }

      if (params.manufacturer) {
        query.push(`applicant:"${encodeURIComponent(params.manufacturer)}"`);
      }

      if (params.productCode) {
        query.push(`product_code:"${encodeURIComponent(params.productCode)}"`);
      }

      // Add keywords to the search if provided
      if (params.keywords && params.keywords.length > 0) {
        const keywordQuery = params.keywords
          .map(keyword => `"${encodeURIComponent(keyword)}"`)
          .join('+');
        query.push(`(${keywordQuery})`);
      }

      // If device name and intended use are empty but we have keywords, use those
      if (
        !params.deviceName &&
        !params.intendedUse &&
        (!params.keywords || params.keywords.length === 0)
      ) {
        throw new Error('Search requires at least device name, intended use, or keywords');
      }

      // Build the final search query
      const searchQuery = query.join('+AND+');

      // Set the result limit
      const limit = params.limit || 5;

      // Make API request
      const response = await axios.get(`${this.FDA_ENDPOINT}?search=${searchQuery}&limit=${limit}`);

      if (!response.data || !response.data.results) {
        return [];
      }

      // Map FDA API results to PredicateDevice format
      const predicates: PredicateDevice[] = response.data.results.map((result: any) => ({
        id: result.k_number || '',
        name: result.device_name || '',
        manufacturer: result.applicant || '',
        clearanceDate: result.decision_date || '',
        productCode: result.product_code || '',
        deviceClass: this.mapDeviceClass(result.device_class),
        decisionSummaryURL: this.generateDecisionSummaryURL(result.k_number),
      }));

      return predicates;
    } catch (error) {
      console.error('Error searching for predicates:', error);
      // In production, consider logging to a monitoring service
      return [];
    }
  }

  /**
   * Search for predicate device by 510(k) number
   *
   * @param k_number The 510(k) number to search for
   * @returns The predicate device information if found
   */
  async getPredicateById(k_number: string): Promise<PredicateDevice | null> {
    try {
      const response = await axios.get(
        `${this.FDA_ENDPOINT}?search=k_number:"${k_number}"&limit=1`
      );

      if (!response.data || !response.data.results || response.data.results.length === 0) {
        return null;
      }

      const result = response.data.results[0];

      return {
        id: result.k_number || '',
        name: result.device_name || '',
        manufacturer: result.applicant || '',
        clearanceDate: result.decision_date || '',
        productCode: result.product_code || '',
        deviceClass: this.mapDeviceClass(result.device_class),
        decisionSummaryURL: this.generateDecisionSummaryURL(result.k_number),
      };
    } catch (error) {
      console.error(`Error fetching predicate device ${k_number}:`, error);
      return null;
    }
  }

  /**
   * Get the most recently cleared devices for a given product code
   *
   * @param productCode The FDA product code to search
   * @param limit Maximum number of results to return
   * @returns List of recently cleared devices with the same product code
   */
  async getRecentPredicatesByProductCode(
    productCode: string,
    limit: number = 5
  ): Promise<PredicateDevice[]> {
    try {
      const response = await axios.get(
        `${this.FDA_ENDPOINT}?search=product_code:"${productCode}"&limit=${limit}&sort=decision_date:desc`
      );

      if (!response.data || !response.data.results) {
        return [];
      }

      return response.data.results.map((result: any) => ({
        id: result.k_number || '',
        name: result.device_name || '',
        manufacturer: result.applicant || '',
        clearanceDate: result.decision_date || '',
        productCode: result.product_code || '',
        deviceClass: this.mapDeviceClass(result.device_class),
        decisionSummaryURL: this.generateDecisionSummaryURL(result.k_number),
      }));
    } catch (error) {
      console.error(`Error fetching predicates for product code ${productCode}:`, error);
      return [];
    }
  }

  /**
   * Convert FDA device class to standard format (I, II, III)
   *
   * @param deviceClass The FDA device class designation
   * @returns Normalized device class (I, II, or III)
   */
  private mapDeviceClass(deviceClass?: string): string {
    if (!deviceClass) return '';

    // FDA returns device class in various formats, normalize to Roman numerals
    const classMap: Record<string, string> = {
      '1': 'I',
      '2': 'II',
      '3': 'III',
      I: 'I',
      II: 'II',
      III: 'III',
      'CLASS I': 'I',
      'CLASS II': 'II',
      'CLASS III': 'III',
      'CLASS 1': 'I',
      'CLASS 2': 'II',
      'CLASS 3': 'III',
    };

    return classMap[deviceClass.toUpperCase()] || deviceClass;
  }

  /**
   * Generate a URL to the FDA's decision summary page for a 510(k) submission
   *
   * @param k_number The 510(k) submission number
   * @returns URL to the FDA decision summary
   */
  private generateDecisionSummaryURL(k_number?: string): string {
    if (!k_number) return '';

    // Format: https://www.accessdata.fda.gov/cdrh_docs/pdf19/K191234.pdf
    // Extract the numeric portion and use it to generate the path
    const match = k_number.match(/K(\d+)/i);

    if (!match || !match[1]) {
      return '';
    }

    const numericPortion = match[1];
    const folderPrefix = numericPortion.substring(0, 2);

    return `https://www.accessdata.fda.gov/cdrh_docs/pdf${folderPrefix}/${k_number}.pdf`;
  }
}

export default new PredicateFinderService();
