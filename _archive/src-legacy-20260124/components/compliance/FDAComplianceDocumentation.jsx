import React, { useState } from 'react';

// Simple document file icon
const DocumentIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="24"
    height="24"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
    <polyline points="14 2 14 8 20 8"></polyline>
    <line x1="16" y1="13" x2="8" y2="13"></line>
    <line x1="16" y1="17" x2="8" y2="17"></line>
    <polyline points="10 9 9 9 8 9"></polyline>
  </svg>
);

// Simple download icon
const DownloadIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
);

const FDAComplianceDocumentation = () => {
  const [activeCategory, setActiveCategory] = useState('guidance');
  const [documents, setDocuments] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch documents from API based on active category
  useEffect(() => {
    const fetchDocuments = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/fda-compliance/documents?category=${activeCategory}`);
        if (response.ok) {
          const data = await response.json();
          setDocuments(data);
        } else {
          console.error('Failed to fetch documents');
        }
      } catch (error) {
        console.error('Error fetching documents:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchDocuments();
  }, [activeCategory]);

  const categories = [
    { id: 'guidance', label: 'FDA Guidance' },
    { id: 'templates', label: 'Templates' },
    { id: 'validation', label: 'Validation Docs' },
    { id: 'procedures', label: 'Procedures' },
  ];

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-xl font-semibold mb-4">FDA Compliance Documentation</h2>
        <p className="text-gray-600 mb-6">
          Access regulatory guidance, validation templates, and procedures to support your FDA 21
          CFR Part 11 compliance program.
        </p>

        <div className="flex flex-wrap mb-6 border-b border-gray-200">
          {categories.map(category => (
            <button
              key={category.id}
              onClick={() => setActiveCategory(category.id)}
              className={`mr-2 py-2 px-4 text-sm font-medium border-b-2 ${
                activeCategory === category.id
                  ? 'border-pink-500 text-pink-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              {category.label}
            </button>
          ))}
        </div>
      </div>

      <div className="bg-white shadow-md rounded-lg overflow-hidden">
        <div className="bg-gray-50 px-4 py-2 border-b border-gray-200">
          <div className="grid grid-cols-12 text-xs font-medium text-gray-500 uppercase tracking-wider">
            <div className="col-span-6">Document</div>
            <div className="col-span-2">Date</div>
            <div className="col-span-2">Type</div>
            <div className="col-span-1">Size</div>
            <div className="col-span-1">Action</div>
          </div>
        </div>

        <div className="divide-y divide-gray-200">
          {isLoading ? (
            <div className="px-4 py-8 text-center">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-pink-500 mb-4"></div>
              <p className="text-gray-600">Loading documents...</p>
            </div>
          ) : documents.length === 0 ? (
            <div className="px-4 py-8 text-center">
              <p className="text-gray-600">No documents found in this category.</p>
            </div>
          ) : (
            documents.map(doc => (
              <div key={doc.id} className="px-4 py-4 grid grid-cols-12 text-sm">
                <div className="col-span-6">
                  <div className="flex items-start">
                    <span className="flex-shrink-0 text-gray-400 mr-3">
                      <DocumentIcon />
                    </span>
                    <div>
                      <div className="font-medium text-gray-900">{doc.title}</div>
                      <div className="text-gray-500 mt-1">{doc.description}</div>
                    </div>
                  </div>
                </div>
                <div className="col-span-2 flex items-center text-gray-500">{doc.date}</div>
                <div className="col-span-2 flex items-center">
                  <span
                    className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                      doc.type === 'pdf'
                        ? 'bg-blue-100 text-blue-800'
                        : doc.type === 'docx'
                          ? 'bg-green-100 text-green-800'
                          : 'bg-yellow-100 text-yellow-800'
                    }`}
                  >
                    {doc.type.toUpperCase()}
                  </span>
                </div>
                <div className="col-span-1 flex items-center text-gray-500">{doc.size}</div>
                <div className="col-span-1 flex items-center">
                  <button className="text-pink-600 hover:text-pink-900" title="Download document">
                    <DownloadIcon />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="mt-8 bg-gray-50 p-6 rounded-lg border border-gray-200">
        <h3 className="text-lg font-semibold mb-3">Need Custom Documentation?</h3>
        <p className="text-gray-600 mb-4">
          Our compliance experts can help develop custom documentation tailored to your specific
          regulatory needs and implementation.
        </p>
        <button className="bg-pink-600 hover:bg-pink-700 text-white py-2 px-4 rounded text-sm font-medium">
          Request Custom Documentation
        </button>
      </div>
    </div>
  );
};

export default FDAComplianceDocumentation;
