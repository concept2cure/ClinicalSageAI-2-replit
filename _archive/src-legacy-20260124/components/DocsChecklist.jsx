import React, { useState } from 'react';

/**
 * DocsChecklist - A component to display required documents for IND submission
 * @param {Object} props
 * @param {Array<string>} props.required - List of required document names
 */
const DocsChecklist = ({ required = [] }) => {
  const [uploaded, setUploaded] = useState({});

  const toggleUploaded = doc => {
    setUploaded(prev => ({
      ...prev,
      [doc]: !prev[doc],
    }));
  };

  return (
    <div className="border rounded-md p-4 bg-gray-50">
      <h3 className="text-sm font-medium mb-3">Required Documents:</h3>

      <ul className="space-y-2">
        {required.map((doc, index) => (
          <li key={index} className="flex items-center">
            <input
              type="checkbox"
              id={`doc-${index}`}
              checked={!!uploaded[doc]}
              onChange={() => toggleUploaded(doc)}
              className="h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-gray-300 rounded"
            />
            <label htmlFor={`doc-${index}`} className="ml-3 text-sm text-gray-700">
              {doc}
            </label>
          </li>
        ))}
      </ul>

      {required.some(doc => !uploaded[doc]) && (
        <p className="mt-3 text-sm text-amber-600">
          ⚠️ All documents must be uploaded before submission
        </p>
      )}
    </div>
  );
};

export default DocsChecklist;
