import React, { useState } from 'react';
import axios from 'axios';
import Navigation from './Navigation';

export default function Module32Form() {
  const [formData, setFormData] = useState({
    drug_name: '',
    molecular_formula: '',
    synthesis_steps: '',
    formulation_details: '',
    manufacturing_controls: '',
    analytical_methods: '',
  });

  const [response, setResponse] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleChange = e => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async e => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Call the real API
      const res = await axios.post('/api/module32', formData);
      setResponse(res.data);

      // Automatically redirect to versions page after 3 seconds
      setTimeout(() => {
        window.location.href = '/versions';
      }, 3000);
    } catch (err) {
      console.error('Error generating CMC document:', err);
      setError(
        err.response?.data?.detail ||
          'An error occurred while generating the document. Please try again.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <Navigation />
      <div className="max-w-4xl mx-auto p-6 space-y-6 pt-8">
        <h1 className="text-2xl font-bold text-blue-800">Generate ICH Module 3.2</h1>
        <form onSubmit={handleSubmit} className="space-y-4">
          {Object.entries(formData).map(([key, val]) => (
            <div key={key}>
              <label className="block font-medium mb-1 capitalize">{key.replace('_', ' ')}</label>
              <textarea
                name={key}
                value={val}
                onChange={handleChange}
                required
                className="w-full border p-2 rounded shadow"
                rows={key === 'synthesis_steps' ? 5 : 3}
              />
            </div>
          ))}
          <button
            type="submit"
            disabled={loading}
            className="bg-blue-600 text-white px-6 py-2 rounded shadow hover:bg-blue-700"
          >
            {loading ? 'Generating...' : 'Generate CMC Draft'}
          </button>
        </form>

        {error && (
          <div className="mt-6 bg-red-50 p-4 border border-red-200 rounded shadow text-red-600">
            {error}
          </div>
        )}

        {response && (
          <div className="mt-6 bg-white p-4 border rounded shadow">
            <h2 className="text-xl font-semibold mb-2">Generated Module 3.2 Draft</h2>
            <pre className="whitespace-pre-wrap text-sm text-gray-800">
              {response.module32_draft}
            </pre>
            <div className="mt-4 space-x-4">
              <a
                href={'/' + response.export_paths.txt}
                download
                className="text-blue-600 underline"
              >
                Download TXT
              </a>
              <a
                href={'/' + response.export_paths.pdf}
                download
                className="text-blue-600 underline"
              >
                Download PDF
              </a>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
