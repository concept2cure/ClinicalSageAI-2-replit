import React, { useState } from 'react';
import axios from 'axios';
import { motion } from 'framer-motion';

export default function VaultMarketingPage() {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState(null);
  const [error, setError] = useState(null);

  const handleFileSelect = e => {
    setSelectedFile(e.target.files[0]);
    setError(null);
    setUploadResult(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }

    setUploading(true);
    setError(null);

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      // In a real app, you'd get this token from auth flow
      const mockToken =
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjEyMzQ1Njc4OTAiLCJyb2xlIjoidXNlciIsInRlbmFudElkIjoiMTIzNDU2Nzg5MCIsImlhdCI6MTUxNjIzOTAyMn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

      const response = await axios.post('http://localhost:4000/api/documents', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          Authorization: `Bearer ${mockToken}`,
        },
      });

      setUploadResult(response.data);
    } catch (err) {
      setError(err.response?.data?.message || 'Error uploading file');
      console.error('Upload error:', err);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-white to-pink-50">
      <header className="bg-white shadow-md">
        <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8 flex justify-between items-center">
          <h1 className="text-3xl font-bold text-gray-900">TrialSage Vault™</h1>
          <div className="hidden md:flex space-x-4">
            <a href="#features" className="text-gray-600 hover:text-pink-600 px-3 py-2">
              Features
            </a>
            <a href="#pricing" className="text-gray-600 hover:text-pink-600 px-3 py-2">
              Pricing
            </a>
            <a href="#contact" className="text-gray-600 hover:text-pink-600 px-3 py-2">
              Contact
            </a>
          </div>
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className="bg-pink-600 text-white px-6 py-2 rounded-md hover:bg-pink-700 transition-colors"
          >
            Log In
          </motion.button>
        </div>
      </header>

      <main>
        {/* Hero Section */}
        <section className="py-12 md:py-24">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row items-center gap-12">
              <div className="md:w-1/2">
                <motion.h2
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5 }}
                  className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight"
                >
                  Enterprise-Grade Document Management for Regulatory Teams
                </motion.h2>
                <motion.p
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.2 }}
                  className="mt-6 text-lg text-gray-600"
                >
                  TrialSage Vault™ delivers intelligent document management with AI-powered
                  insights, robust security, and FDA 21 CFR Part 11 compliance.
                </motion.p>
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: 0.4 }}
                  className="mt-8 flex flex-col sm:flex-row gap-4"
                >
                  <button className="bg-pink-600 text-white px-8 py-3 rounded-md hover:bg-pink-700 transition-colors text-lg font-medium">
                    Request Demo
                  </button>
                  <button className="bg-white text-pink-600 border border-pink-600 px-8 py-3 rounded-md hover:bg-pink-50 transition-colors text-lg font-medium">
                    Learn More
                  </button>
                </motion.div>
              </div>
              <div className="md:w-1/2 mt-8 md:mt-0">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, delay: 0.3 }}
                  className="bg-white p-6 rounded-xl shadow-xl"
                >
                  <h3 className="text-2xl font-semibold text-gray-800 mb-4">Try Vault AI Upload</h3>
                  <p className="text-gray-600 mb-6">
                    Upload a document to see how our AI automatically summarizes and tags your
                    content.
                  </p>

                  <div className="space-y-4">
                    <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                      <input
                        type="file"
                        onChange={handleFileSelect}
                        className="hidden"
                        id="file-upload"
                      />
                      <label
                        htmlFor="file-upload"
                        className="cursor-pointer text-pink-600 hover:text-pink-700"
                      >
                        {selectedFile ? selectedFile.name : 'Click to select file'}
                      </label>
                    </div>

                    <button
                      onClick={handleUpload}
                      disabled={uploading || !selectedFile}
                      className={`w-full py-3 rounded-md text-white font-medium ${
                        uploading || !selectedFile
                          ? 'bg-gray-400 cursor-not-allowed'
                          : 'bg-pink-600 hover:bg-pink-700'
                      }`}
                    >
                      {uploading ? 'Uploading...' : 'Upload Document'}
                    </button>

                    {error && <div className="p-4 bg-red-50 text-red-700 rounded-md">{error}</div>}

                    {uploadResult && (
                      <div className="p-4 bg-green-50 text-green-800 rounded-md">
                        <h4 className="font-semibold mb-2">Upload Successful!</h4>
                        <p className="text-sm mb-2">
                          <span className="font-medium">Filename:</span> {uploadResult.filename}
                        </p>
                        <p className="text-sm mb-2">
                          <span className="font-medium">Summary:</span> {uploadResult.summary}
                        </p>
                        <div className="text-sm">
                          <span className="font-medium">Tags:</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {uploadResult.tags.map((tag, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 bg-pink-100 text-pink-800 rounded-full text-xs"
                              >
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </div>
            </div>
          </div>
        </section>

        {/* Features */}
        <section id="features" className="py-16 bg-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center mb-16">
              <h2 className="text-3xl font-bold text-gray-900">Why Choose TrialSage Vault™</h2>
              <p className="mt-4 text-xl text-gray-600">
                Our platform goes beyond traditional document management
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {[
                {
                  title: 'AI-Powered Insights',
                  description:
                    'Automatic document summarization, tagging, and content analysis using advanced AI models.',
                  icon: '🧠',
                },
                {
                  title: 'FDA 21 CFR Part 11 Compliance',
                  description:
                    'Built-in electronic signatures, audit trails, and validation documentation.',
                  icon: '✓',
                },
                {
                  title: 'Enterprise Security',
                  description:
                    'Multi-tenant architecture with blockchain verification and zero-trust security model.',
                  icon: '🔒',
                },
                {
                  title: 'Intelligent Search',
                  description:
                    'Find documents by content, metadata, or even concepts mentioned within the text.',
                  icon: '🔍',
                },
                {
                  title: 'Regulatory Workflows',
                  description:
                    'Streamlined processes for submissions, reviews, and approvals with role-based access.',
                  icon: '📋',
                },
                {
                  title: 'Scalable Architecture',
                  description:
                    'Designed to handle millions of documents with consistent performance.',
                  icon: '📈',
                },
              ].map((feature, i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: i * 0.1 }}
                  viewport={{ once: true }}
                  className="bg-gray-50 p-6 rounded-lg shadow-sm hover:shadow-md transition-shadow"
                >
                  <div className="text-4xl mb-4">{feature.icon}</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">{feature.title}</h3>
                  <p className="text-gray-600">{feature.description}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="py-16 bg-pink-600 text-white">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <h2 className="text-3xl font-bold mb-4">
              Ready to transform your document management?
            </h2>
            <p className="text-xl mb-8 max-w-3xl mx-auto">
              Join leading pharmaceutical and biotech companies who trust TrialSage Vault™
            </p>
            <button className="bg-white text-pink-600 px-8 py-3 rounded-md hover:bg-gray-100 transition-colors text-lg font-medium">
              Schedule a Demo
            </button>
          </div>
        </section>
      </main>

      <footer className="bg-gray-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div>
              <h3 className="text-xl font-semibold mb-4">TrialSage Vault™</h3>
              <p className="text-gray-400">
                Enterprise-grade document management built for regulatory and clinical teams.
              </p>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Solutions</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="#" className="hover:text-pink-400">
                    Regulatory Documents
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-pink-400">
                    Clinical Trial Management
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-pink-400">
                    Quality Control
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-pink-400">
                    FDA Submissions
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Company</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="#" className="hover:text-pink-400">
                    About Us
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-pink-400">
                    Careers
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-pink-400">
                    Blog
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-pink-400">
                    Contact
                  </a>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="text-lg font-medium mb-4">Legal</h4>
              <ul className="space-y-2 text-gray-400">
                <li>
                  <a href="#" className="hover:text-pink-400">
                    Privacy Policy
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-pink-400">
                    Terms of Service
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-pink-400">
                    Security
                  </a>
                </li>
                <li>
                  <a href="#" className="hover:text-pink-400">
                    GDPR Compliance
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <div className="border-t border-gray-800 mt-12 pt-8 text-center text-gray-400">
            <p>© 2025 TrialSage, Inc. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
