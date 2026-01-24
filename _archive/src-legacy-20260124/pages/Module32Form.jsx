import React, { useState } from 'react';
import withAuthGuard from '../utils/withAuthGuard';
import axiosWithToken from '../utils/axiosWithToken';
import { Link } from 'wouter';
import { ExternalLink, History, FileText, Download } from 'lucide-react';
import toast from '../lightweight-wrappers.js';
import Layout from '../components/Layout';
import Module32Tour from '../components/Module32Tour';

const Module32Form = () => {
  const [formData, setFormData] = useState({
    drug_name: '',
    molecular_formula: '',
    synthesis_steps: '',
    formulation_details: '',
    manufacturing_controls: '',
    analytical_methods: '',
  });

  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleChange = e => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    // Dismiss any existing toasts
    toast.dismiss();

    try {
      // Use axiosWithToken to make the authenticated request
      const response = await axiosWithToken.post('/generate/module32', formData);

      // Show success toast
      toast.success(`Module 3.2 document for ${formData.drug_name} created successfully`);

      // Set the result from the API response
      setResult(response.data);
    } catch (err) {
      // Determine specific error message based on response code
      let errorMessage = 'An error occurred while generating the document';

      if (err.response) {
        const status = err.response.status;

        if (status === 401 || status === 403) {
          errorMessage = 'Authentication failed. Please log in again.';
        } else if (status === 400) {
          errorMessage =
            err.response.data?.detail || 'Invalid input data. Please check your form entries.';
        } else if (status === 404) {
          errorMessage = 'Required API endpoint not found. Please contact support.';
        } else if (status === 500) {
          errorMessage = 'Server error occurred. Our team has been notified.';
        } else if (err.response.data?.detail) {
          errorMessage = err.response.data.detail;
        }
      } else if (err.message) {
        errorMessage = err.message;
      }

      // Set error state
      setError(errorMessage);

      // Show error toast
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Layout>
      <Module32Tour />
      <div className="module32-form-container py-12 px-6 max-w-5xl mx-auto">
        <div className="form-header">
          <h1 className="text-3xl font-bold text-blue-800 mb-4">
            Generate Module 3.2 Documentation
          </h1>
          <p className="text-gray-600 mb-8">
            Enter the drug substance and product details to generate a CMC document draft.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border-l-4 border-red-500 p-4 mb-6">
            <p className="text-red-700">{error}</p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-white shadow-md rounded-lg p-6 mb-8">
          <div className="mb-4">
            <label htmlFor="drug_name" className="block text-sm font-medium text-gray-700 mb-1">
              Drug Name
            </label>
            <input
              type="text"
              id="drug_name"
              name="drug_name"
              value={formData.drug_name}
              onChange={handleChange}
              required
              placeholder="Enter drug name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="mb-4">
            <label
              htmlFor="molecular_formula"
              className="block text-sm font-medium text-gray-700 mb-1"
            >
              Molecular Formula
            </label>
            <input
              type="text"
              id="molecular_formula"
              name="molecular_formula"
              value={formData.molecular_formula}
              onChange={handleChange}
              required
              placeholder="E.g., C21H23NO5"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div className="form-group">
            <label htmlFor="synthesis_steps">Synthesis Steps</label>
            <textarea
              id="synthesis_steps"
              name="synthesis_steps"
              value={formData.synthesis_steps}
              onChange={handleChange}
              rows={4}
              required
              placeholder="Describe the synthesis pathway..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="formulation_details">Formulation Details</label>
            <textarea
              id="formulation_details"
              name="formulation_details"
              value={formData.formulation_details}
              onChange={handleChange}
              rows={4}
              required
              placeholder="Describe the drug product formulation..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="manufacturing_controls">Manufacturing Controls</label>
            <textarea
              id="manufacturing_controls"
              name="manufacturing_controls"
              value={formData.manufacturing_controls}
              onChange={handleChange}
              rows={4}
              required
              placeholder="Describe manufacturing process controls..."
            />
          </div>

          <div className="form-group">
            <label htmlFor="analytical_methods">Analytical Methods</label>
            <textarea
              id="analytical_methods"
              name="analytical_methods"
              value={formData.analytical_methods}
              onChange={handleChange}
              rows={4}
              required
              placeholder="Describe analytical methods and specifications..."
            />
          </div>

          <div className="form-actions">
            <button type="submit" className="generate-btn" disabled={loading}>
              {loading ? 'Generating...' : 'Generate Module 3.2 Document'}
            </button>
          </div>
        </form>

        {result && (
          <div className="result-section">
            <h2>Generated Module 3.2 Document</h2>

            <div className="result-meta">
              <p>
                <strong>Drug:</strong> {result.drug}
              </p>
              <p>
                <strong>Generated:</strong> {new Date(result.timestamp).toLocaleString()}
              </p>
              <p>
                <strong>Export Paths:</strong>
              </p>
              <ul>
                <li>Text: {result.export_paths?.txt || result.export_path}</li>
                <li>PDF: {result.export_paths?.pdf}</li>
              </ul>
            </div>

            <div className="result-content">
              <h3>Document Preview</h3>
              <pre className="whitespace-pre-wrap">{result.module32_draft}</pre>
            </div>

            <div className="result-actions">
              <a
                href={'/' + (result.export_paths?.pdf || '')}
                className="download-btn"
                download
                onClick={() => {
                  toast.success('PDF download started');
                }}
              >
                Download as PDF
              </a>
              <a
                href={'/' + (result.export_paths?.txt || result.export_path || '')}
                className="download-btn"
                download
                onClick={() => {
                  toast.success('Text file download started');
                }}
              >
                Download as Text
              </a>
            </div>
          </div>
        )}
      </div>
    </Layout>
  );
};

// Export the component wrapped with the auth guard
export default withAuthGuard(Module32Form);
