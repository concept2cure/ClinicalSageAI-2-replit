import React, { useState, useCallback, KeyboardEvent, MouseEvent } from 'react';
import { useToast } from '@/hooks/use-toast';
import { 
  FileDown, 
  AlertCircle, 
  Loader2,
  Search,
  FileText,
  ArrowRight,
  FileBarChart,
  CheckCircle
} from 'lucide-react';

// Types for API response
interface CERResponse {
  success: boolean;
  ndc_code: string;
  product_name?: string;
  manufacturer?: string;
  total_reports?: number;
  serious_events?: number;
  cer_narrative?: string;
  pdf_url?: string;
  top_events?: Array<{
    name: string;
    count: number;
    percentage?: number;
  }>;
  message?: string;
}

/**
 * CERGenerator Component - Generates Clinical Evaluation Reports based on NDC codes
 */
const CERGenerator: React.FC = () => {
  // Form state
  const [ndcCode, setNdcCode] = useState<string>('');
  
  // API response state
  const [error, setError] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [result, setResult] = useState<CERResponse | null>(null);
  const [pdfUrl, setPdfUrl] = useState<string>('');
  
  // UI state
  const [pdfLoading, setPdfLoading] = useState<boolean>(false);
  
  // Toast notifications
  const { toast } = useToast();

  /**
   * Validate NDC code format
   */
  const validateNdcCode = (code: string): boolean => {
    // NDC code validation patterns
    const ndcPattern = /^\d{4,5}-\d{3,4}-\d{1,2}$|^\d{5}-\d{4}-\d{2}$|^\d{1,5}$/;
    return ndcPattern.test(code);
  };

  /**
   * Generate a Clinical Evaluation Report
   */
  const generateCER = useCallback(async (): Promise<void> => {
    // Validate input
    if (!ndcCode.trim()) {
      setError('Please enter an NDC code');
      // toast call replaced
  // Original: toast({
        title: "Missing NDC Code",
        description: "Please enter an NDC code to generate a CER.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Missing NDC Code",
        description: "Please enter an NDC code to generate a CER.",
        variant: "destructive"
      });
      return;
    }

    if (!validateNdcCode(ndcCode)) {
      setError('Please enter a valid NDC code format (e.g., 12345-678-90, 12345-6789-01, or numeric)');
      // toast call replaced
  // Original: toast({
        title: "Invalid Format",
        description: "Please enter a valid NDC code format.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Invalid Format",
        description: "Please enter a valid NDC code format.",
        variant: "destructive"
      });
      return;
    }

    setLoading(true);
    setError('');
    setResult(null);
    setPdfUrl('');

    try {
      // Call the API to generate CER
      const response = await fetch('/api/cer/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ndc_code: ndcCode }),
      });

      if (!response.ok) {
        throw new Error(`Error: ${response.status} - ${response.statusText}`);
      }

      const data: CERResponse = await response.json();

      if (!data.success) {
        throw new Error(data.message || 'Error generating CER');
      }

      setResult(data);
      
      // If PDF URL is returned, set it
      if (data.pdf_url) {
        setPdfUrl(data.pdf_url);
      }
      
      // toast call replaced
  // Original: toast({
        title: "CER Generated",
        description: `Clinical Evaluation Report for ${data.product_name || ndcCode} created successfully.`,
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "CER Generated",
        description: `Clinical Evaluation Report for ${data.product_name || ndcCode} created successfully.`,
        variant: "default"
      });

    } catch (err: any) {
      console.error('Error generating CER:', err);
      setError(err.message || 'An error occurred while generating the CER');
      
      // toast call replaced
  // Original: toast({
        title: "Generation Failed",
        description: err.message || "An error occurred while generating the report.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Generation Failed",
        description: err.message || "An error occurred while generating the report.",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  }, [ndcCode, toast]);

  /**
   * Download CER as PDF
   */
  const downloadPdf = useCallback(async (): Promise<void> => {
    setPdfLoading(true);
    
    try {
      // Either use the returned PDF URL or generate a new one
      let url: string;
      
      if (pdfUrl) {
        url = pdfUrl;
      } else if (result) {
        // Create a direct download link for the PDF
        url = `/api/cer/export-pdf?ndc_code=${encodeURIComponent(ndcCode)}`;
      } else {
        throw new Error('No report data available to download');
      }
      
      // Open the PDF in a new tab/window
      window.open(url, '_blank');
      
      // toast call replaced
  // Original: toast({
        title: "PDF Ready",
        description: "Your report has been prepared for download.",
        variant: "default"
      })
  console.log('Toast would show:', {
        title: "PDF Ready",
        description: "Your report has been prepared for download.",
        variant: "default"
      });
    } catch (err: any) {
      console.error('Error downloading PDF:', err);
      
      // toast call replaced
  // Original: toast({
        title: "Download Failed",
        description: err.message || "Failed to download the PDF report.",
        variant: "destructive"
      })
  console.log('Toast would show:', {
        title: "Download Failed",
        description: err.message || "Failed to download the PDF report.",
        variant: "destructive"
      });
    } finally {
      setPdfLoading(false);
    }
  }, [ndcCode, pdfUrl, result, toast]);

  /**
   * Handle Enter key press in input field
   */
  const handleKeyPress = useCallback((e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === 'Enter' && !loading) {
      generateCER();
    }
  }, [generateCER, loading]);

  /**
   * Update NDC code with example
   */
  const handleExampleClick = useCallback((code: string): void => {
    setNdcCode(code);
    setError('');
  }, []);

  // Example NDC codes that can be used
  const exampleNdcCodes = [
    '0002-3227-30',
    '0074-3799-13',
    '0078-0357-15',
    '0173-0519-00',
    '50580-506-01'
  ];

  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg shadow-md p-6 border border-gray-200 dark:border-gray-800">
      <div className="mb-6">
        <label htmlFor="ndcCode" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          NDC Code
        </label>
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <input
              id="ndcCode"
              type="text"
              value={ndcCode}
              onChange={(e) => setNdcCode(e.target.value)}
              placeholder="Enter NDC code (e.g., 12345-678-90)"
              className="w-full p-2 pr-10 border border-gray-300 dark:border-gray-700 bg-white dark:bg-slate-800 rounded-md dark:text-white"
              onKeyPress={handleKeyPress}
              disabled={loading}
            />
            {ndcCode && (
              <button 
                onClick={() => setNdcCode('')}
                className="absolute right-2 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                aria-label="Clear input"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <button
            onClick={generateCER}
            disabled={loading}
            className={`px-4 py-2 text-white rounded-md flex items-center justify-center min-w-[150px] ${
              loading ? 'bg-gray-400 dark:bg-gray-600 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 dark:bg-blue-700 dark:hover:bg-blue-600'
            }`}
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Search className="mr-2 h-4 w-4" />
                Generate CER
              </>
            )}
          </button>
        </div>
      </div>

      {/* Example NDC codes */}
      <div className="mb-4">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Example NDC codes:</p>
        <div className="flex flex-wrap gap-2">
          {exampleNdcCodes.map((code, index) => (
            <button
              key={index}
              onClick={() => handleExampleClick(code)}
              className="px-3 py-1 text-xs bg-gray-100 hover:bg-gray-200 dark:bg-gray-800 dark:hover:bg-gray-700 text-gray-800 dark:text-gray-200 rounded-full transition-colors"
            >
              {code}
            </button>
          ))}
        </div>
      </div>

      {/* Error message */}
      {error && (
        <div className="p-3 mb-4 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 rounded-md flex items-start">
          <AlertCircle className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
          <p>{error}</p>
        </div>
      )}

      {/* Loading indicator */}
      {loading && (
        <div className="flex flex-col justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-500 dark:text-gray-400">Generating your Clinical Evaluation Report...</p>
        </div>
      )}

      {/* Results section */}
      {result && !loading && (
        <div className="mt-6 animate-fadeIn">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div className="flex items-center">
              <FileText className="h-5 w-5 mr-2 text-blue-600 dark:text-blue-400" />
              <h2 className="text-xl font-bold">Clinical Evaluation Report</h2>
            </div>
            <button
              onClick={downloadPdf}
              disabled={pdfLoading}
              className="flex items-center px-4 py-2 bg-green-600 hover:bg-green-700 dark:bg-green-700 dark:hover:bg-green-600 text-white rounded-md transition-colors"
            >
              {pdfLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Preparing PDF...
                </>
              ) : (
                <>
                  <FileDown className="mr-2 h-4 w-4" />
                  Download PDF
                </>
              )}
            </button>
          </div>

          <div className="bg-gray-50 dark:bg-slate-800/50 p-4 rounded-md mb-6 border border-gray-200 dark:border-gray-700">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">Product Information</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">NDC Code: {result.ndc_code}</p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Product Name: {result.product_name || 'N/A'}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Manufacturer: {result.manufacturer || 'N/A'}
                </p>
              </div>
              <div>
                <h3 className="font-semibold text-gray-700 dark:text-gray-300">Report Summary</h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Total Reports: {result.total_reports?.toLocaleString() || 0}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Serious Events: {result.serious_events?.toLocaleString() || 0}
                </p>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Report Generated: {new Date().toLocaleDateString()}
                </p>
              </div>
            </div>
          </div>

          {/* Narrative section */}
          <div className="mb-6">
            <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Clinical Evaluation Narrative</h3>
            <div className="bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-md p-4 max-h-96 overflow-y-auto">
              {result.cer_narrative ? (
                <div 
                  dangerouslySetInnerHTML={{ 
                    __html: result.cer_narrative.replace(/\n/g, '<br/>') 
                  }} 
                  className="text-gray-800 dark:text-gray-200 text-sm leading-relaxed"
                />
              ) : (
                <p className="text-gray-500 dark:text-gray-400 italic">No narrative available.</p>
              )}
            </div>
          </div>

          {/* Top Adverse Events */}
          {result.top_events && result.top_events.length > 0 && (
            <div className="mb-6">
              <h3 className="font-semibold text-gray-700 dark:text-gray-300 mb-2">Top Adverse Events</h3>
              <div className="overflow-x-auto rounded-md border border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-50 dark:bg-slate-800">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Event</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Count</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">Percentage</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-slate-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {result.top_events.map((event, index) => (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white dark:bg-slate-800' : 'bg-gray-50 dark:bg-slate-700/30'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-200">{event.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{event.count}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                          {event.percentage ? `${(event.percentage * 100).toFixed(1)}%` : 'N/A'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Enhanced dashboard link */}
          <div className="p-4 rounded-md border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300 text-sm">
            <div className="flex items-start">
              <FileBarChart className="h-5 w-5 mr-2 mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-semibold mb-1">Need more detailed analysis?</p>
                <p>Visit the <a href="/enhanced-cer-dashboard" className="text-blue-600 dark:text-blue-400 hover:underline">Advanced CER Analysis</a> to compare multiple products, view interactive visualizations, and get AI-powered insights.</p>
                <a href="/enhanced-cer-dashboard" className="mt-2 inline-flex items-center text-blue-600 dark:text-blue-400 hover:underline">
                  View Advanced Analysis
                  <ArrowRight className="ml-1 h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
          
          <div className="mt-6 flex justify-center">
            <div className="inline-flex items-center text-sm text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full">
              <CheckCircle className="h-4 w-4 mr-2 text-green-500" />
              Report generated successfully
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CERGenerator;