import { useState } from 'react';

/**
 * Custom hook for exporting FAERS data to various formats
 * and integrating it with Clinical Evaluation Reports
 */
export function useExportFAERS() {
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  /**
   * Create a professional PDF report from FAERS data
   *
   * @param {Object} faersData - The FAERS data to export
   * @param {string} productName - Name of the product for the report title
   * @param {Object} options - Export options for customizing the document
   * @returns {Promise} - Promise resolving to the exported file info
   */
  const exportToPDF = async (faersData, productName, options = {}) => {
    if (!faersData) {
      throw new Error('No FAERS data available for export');
    }

    try {
      setExporting(true);
      setExportError(null);

      console.log(`Exporting FAERS data for ${productName} to PDF`, faersData);

      // Prepare data for the API call
      const exportData = {
        title: `FAERS Safety Analysis: ${productName}`,
        faers: faersData.reports || [],
        comparators: faersData.comparators || [],
      };

      // Call the real PDF export endpoint
      const response = await fetch('/api/cer/export-pdf', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportData),
      });

      if (!response.ok) {
        throw new Error(`PDF export failed: ${response.statusText}`);
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link and click it
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `faers_report_${productName.replace(/\s+/g, '_').toLowerCase()}.pdf`;
      document.body.appendChild(a);
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Return success result
      return {
        success: true,
        fileName: a.download,
        fileSize: `${Math.round(blob.size / 1024)}KB`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error('Error exporting FAERS data to PDF:', err);
      setExportError(err);
      throw err;
    } finally {
      setExporting(false);
    }
  };

  /**
   * Create a professional Word document from FAERS data
   *
   * @param {Object} faersData - The FAERS data to export
   * @param {string} productName - Name of the product for the report title
   * @param {Object} options - Export options for customizing the document
   * @returns {Promise} - Promise resolving to the exported file info
   */
  const exportToWord = async (faersData, productName, options = {}) => {
    if (!faersData) {
      throw new Error('No FAERS data available for export');
    }

    try {
      setExporting(true);
      setExportError(null);

      console.log(`Exporting FAERS data for ${productName} to Word`, faersData);

      // Prepare data for the API call
      const exportData = {
        title: `FAERS Safety Analysis: ${productName}`,
        faers: faersData.reports || [],
        comparators: faersData.comparators || [],
      };

      // Call the real DOCX export endpoint
      const response = await fetch('/api/cer/export-docx', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(exportData),
      });

      if (!response.ok) {
        throw new Error(`DOCX export failed: ${response.statusText}`);
      }

      // Get the blob from the response
      const blob = await response.blob();

      // Create a download link and click it
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.style.display = 'none';
      a.href = url;
      a.download = `faers_report_${productName.replace(/\s+/g, '_').toLowerCase()}.docx`;
      document.body.appendChild(a);
      a.click();

      // Clean up
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      // Return success result
      return {
        success: true,
        fileName: a.download,
        fileSize: `${Math.round(blob.size / 1024)}KB`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error('Error exporting FAERS data to Word:', err);
      setExportError(err);
      throw err;
    } finally {
      setExporting(false);
    }
  };

  /**
   * Integrate FAERS data into a Clinical Evaluation Report
   *
   * @param {Object} faersData - The FAERS data to integrate
   * @param {string} cerId - ID of the CER to integrate with
   * @param {string} productName - Name of the product
   * @returns {Promise} - Promise resolving to the integration result
   */
  const integrateWithCER = async (faersData, cerId, productName) => {
    if (!faersData) {
      throw new Error('No FAERS data available for integration');
    }

    if (!cerId) {
      throw new Error('CER ID is required for integration');
    }

    try {
      setExporting(true);
      setExportError(null);

      // In a real implementation, this would make an API call to integrate the data
      // For demo purposes, we simulate the integration process
      console.log(`Integrating FAERS data for ${productName} into CER ${cerId}`, {
        faersData,
        cerId,
        productName,
      });

      // Build a summary of the data for integration
      const summary = {
        productName,
        totalReports: faersData.totalReports || faersData.reportCount,
        seriousEvents: faersData.seriousEvents?.length || 0,
        topReactions: faersData.topReactions?.slice(0, 5) || [],
        riskScore: faersData.riskScore,
        severityAssessment: faersData.severityAssessment,
        dateAdded: new Date().toISOString(),
        cerId,
      };

      // Add comparative analysis if available
      if (faersData.comparators && faersData.comparators.length > 0) {
        summary.comparativeAnalysis = {
          comparatorCount: faersData.comparators.length,
          comparators: faersData.comparators.map(comp => ({
            name: comp.comparator,
            riskScore: comp.riskScore,
            reportCount: comp.reportCount,
            comparisonResult: getComparisonResult(faersData.riskScore, comp.riskScore),
          })),
        };
      }

      // Simulate an API call with a delay
      await new Promise(resolve => setTimeout(resolve, 1200));

      // Return simulated result
      return {
        success: true,
        cerId,
        sectionsUpdated: ['2.7.4', '5.3.2', '7.2.1'],
        wordCount: 982,
        message: `FAERS data for ${productName} successfully integrated into CER ${cerId}`,
        timestamp: new Date().toISOString(),
      };
    } catch (err) {
      console.error('Error integrating FAERS data with CER:', err);
      setExportError(err);
      throw err;
    } finally {
      setExporting(false);
    }
  };

  /**
   * Helper function to determine relative safety between two risk scores
   */
  const getComparisonResult = (baseScore, comparatorScore) => {
    const ratio = comparatorScore / baseScore;

    if (ratio < 0.8) return 'better';
    if (ratio > 1.2) return 'worse';
    return 'similar';
  };

  // Return the hook interface
  return {
    exportToPDF,
    exportToWord,
    integrateWithCER,
    exporting,
    exportError,
  };
}
