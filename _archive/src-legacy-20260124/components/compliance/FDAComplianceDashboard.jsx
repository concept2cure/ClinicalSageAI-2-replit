import React, { useState, useEffect } from 'react';

// We're using SVG directly since we had issues with the lucide-react package
const CheckIcon = () => (
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
    <polyline points="20 6 9 17 4 12"></polyline>
  </svg>
);

const AlertTriangleIcon = () => (
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
    <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
    <line x1="12" y1="9" x2="12" y2="13"></line>
    <line x1="12" y1="17" x2="12.01" y2="17"></line>
  </svg>
);

const ShieldIcon = () => (
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
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path>
  </svg>
);

const FileTextIcon = () => (
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

const FDAComplianceDashboard = () => {
  const [complianceStatus, setComplianceStatus] = useState(null);
  const [validationData, setValidationData] = useState(null);
  const [blockchainStatus, setBlockchainStatus] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Fetch data from API endpoints
  useEffect(() => {
    const fetchComplianceData = async () => {
      try {
        // Fetch compliance status
        const statusResponse = await fetch('/api/fda-compliance/status');
        if (statusResponse.ok) {
          const statusData = await statusResponse.json();
          setComplianceStatus(statusData);
        }

        // Fetch validation data
        const validationResponse = await fetch('/api/fda-compliance/validation');
        if (validationResponse.ok) {
          const validationData = await validationResponse.json();
          setValidationData(validationData);
        }

        // Fetch blockchain status
        const blockchainResponse = await fetch('/api/fda-compliance/blockchain-status');
        if (blockchainResponse.ok) {
          const blockchainData = await blockchainResponse.json();
          setBlockchainStatus(blockchainData);
        }

        setIsLoading(false);
      } catch (error) {
        console.error('Error fetching compliance data:', error);
        // In case of API errors, we'll inform the user but continue with best effort display
        setIsLoading(false);
      }
    };

    fetchComplianceData();
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-pink-500"></div>
      </div>
    );
  }

  return (
    <div>
      {/* Status Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
        <div
          className={`p-6 rounded-lg shadow ${complianceStatus?.status === 'compliant' ? 'bg-green-50 border border-green-100' : 'bg-yellow-50 border border-yellow-100'}`}
        >
          <div className="flex items-center mb-4">
            {complianceStatus?.status === 'compliant' ? (
              <span className="h-8 w-8 text-green-500 mr-3">
                <CheckIcon />
              </span>
            ) : (
              <span className="h-8 w-8 text-yellow-500 mr-3">
                <AlertTriangleIcon />
              </span>
            )}
            <h3 className="text-lg font-semibold">Compliance Status</h3>
          </div>
          <p className="text-gray-700 mb-2">
            <span className="font-medium">Status:</span>{' '}
            {complianceStatus?.status === 'compliant' ? 'Compliant' : 'Review Required'}
          </p>
          <p className="text-gray-700 mb-2">
            <span className="font-medium">Level:</span> {complianceStatus?.complianceLevel}
          </p>
          <p className="text-gray-700 text-sm">
            <span className="font-medium">Last Validated:</span>{' '}
            {new Date(complianceStatus?.lastValidated).toLocaleString()}
          </p>
        </div>

        <div
          className={`p-6 rounded-lg shadow ${validationData?.validationStatus === 'validated' ? 'bg-green-50 border border-green-100' : 'bg-yellow-50 border border-yellow-100'}`}
        >
          <div className="flex items-center mb-4">
            <span className="h-8 w-8 text-blue-500 mr-3">
              <FileTextIcon />
            </span>
            <h3 className="text-lg font-semibold">Validation Status</h3>
          </div>
          <p className="text-gray-700 mb-2">
            <span className="font-medium">Status:</span>{' '}
            {validationData?.validationStatus === 'validated' ? 'Validated' : 'Pending Validation'}
          </p>
          <p className="text-gray-700 mb-2">
            <span className="font-medium">Documents:</span>{' '}
            {validationData?.validationDocuments?.length || 0}
          </p>
          <p className="text-gray-700 text-sm">
            <span className="font-medium">Next Validation:</span>{' '}
            {new Date(validationData?.nextValidationDate).toLocaleDateString()}
          </p>
        </div>

        <div
          className={`p-6 rounded-lg shadow ${blockchainStatus?.status === 'active' ? 'bg-green-50 border border-green-100' : 'bg-yellow-50 border border-yellow-100'}`}
        >
          <div className="flex items-center mb-4">
            <span className="h-8 w-8 text-pink-500 mr-3">
              <ShieldIcon />
            </span>
            <h3 className="text-lg font-semibold">Blockchain Security</h3>
          </div>
          <p className="text-gray-700 mb-2">
            <span className="font-medium">Status:</span>{' '}
            {blockchainStatus?.status === 'active' ? 'Active' : 'Inactive'}
          </p>
          <p className="text-gray-700 mb-2">
            <span className="font-medium">Records:</span> {blockchainStatus?.verifiedRecords} /{' '}
            {blockchainStatus?.totalRecords}
          </p>
          <p className="text-gray-700 text-sm">
            <span className="font-medium">Last Verification:</span>{' '}
            {new Date(blockchainStatus?.lastVerification).toLocaleString()}
          </p>
        </div>
      </div>

      {/* Feature Compliance */}
      <div className="bg-white shadow-md rounded-lg p-6 mb-8">
        <h3 className="text-lg font-semibold mb-4">Feature Compliance</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <div className="flex items-center p-3 bg-gray-50 rounded-md">
            <div className="mr-3 bg-green-100 p-2 rounded-full">
              <span className="h-5 w-5 text-green-600">
                <CheckIcon />
              </span>
            </div>
            <div>
              <p className="font-medium">Electronic Signatures</p>
              <p className="text-sm text-gray-600">21 CFR 11.50-11.70</p>
            </div>
          </div>

          <div className="flex items-center p-3 bg-gray-50 rounded-md">
            <div className="mr-3 bg-green-100 p-2 rounded-full">
              <span className="h-5 w-5 text-green-600">
                <CheckIcon />
              </span>
            </div>
            <div>
              <p className="font-medium">Audit Trail</p>
              <p className="text-sm text-gray-600">21 CFR 11.10(e)</p>
            </div>
          </div>

          <div className="flex items-center p-3 bg-gray-50 rounded-md">
            <div className="mr-3 bg-green-100 p-2 rounded-full">
              <span className="h-5 w-5 text-green-600">
                <CheckIcon />
              </span>
            </div>
            <div>
              <p className="font-medium">Data Integrity</p>
              <p className="text-sm text-gray-600">21 CFR 11.10(a)-(d)</p>
            </div>
          </div>

          <div className="flex items-center p-3 bg-gray-50 rounded-md">
            <div className="mr-3 bg-green-100 p-2 rounded-full">
              <span className="h-5 w-5 text-green-600">
                <CheckIcon />
              </span>
            </div>
            <div>
              <p className="font-medium">System Validation</p>
              <p className="text-sm text-gray-600">21 CFR 11.10(a)</p>
            </div>
          </div>

          <div className="flex items-center p-3 bg-gray-50 rounded-md">
            <div className="mr-3 bg-green-100 p-2 rounded-full">
              <span className="h-5 w-5 text-green-600">
                <CheckIcon />
              </span>
            </div>
            <div>
              <p className="font-medium">Access Controls</p>
              <p className="text-sm text-gray-600">21 CFR 11.10(d), 11.300</p>
            </div>
          </div>

          <div className="flex items-center p-3 bg-gray-50 rounded-md">
            <div className="mr-3 bg-pink-100 p-2 rounded-full">
              <span className="h-5 w-5 text-pink-600">
                <ShieldIcon />
              </span>
            </div>
            <div>
              <p className="font-medium">Blockchain Security</p>
              <p className="text-sm text-gray-600">Enhanced Compliance</p>
            </div>
          </div>
        </div>
      </div>

      {/* Test Results */}
      {validationData?.testResults && (
        <div className="bg-white shadow-md rounded-lg p-6 mb-8">
          <h3 className="text-lg font-semibold mb-4">Validation Test Results</h3>
          <div className="flex flex-wrap">
            <div className="w-full md:w-1/2 lg:w-1/4 p-3">
              <div className="bg-gray-50 p-4 rounded-md text-center">
                <p className="text-3xl font-bold text-blue-600">
                  {validationData.testResults.totalTests}
                </p>
                <p className="text-sm text-gray-600">Total Tests</p>
              </div>
            </div>

            <div className="w-full md:w-1/2 lg:w-1/4 p-3">
              <div className="bg-green-50 p-4 rounded-md text-center">
                <p className="text-3xl font-bold text-green-600">
                  {validationData.testResults.passed}
                </p>
                <p className="text-sm text-gray-600">Passed</p>
              </div>
            </div>

            <div className="w-full md:w-1/2 lg:w-1/4 p-3">
              <div className="bg-red-50 p-4 rounded-md text-center">
                <p className="text-3xl font-bold text-red-600">
                  {validationData.testResults.failed}
                </p>
                <p className="text-sm text-gray-600">Failed</p>
              </div>
            </div>

            <div className="w-full md:w-1/2 lg:w-1/4 p-3">
              <div className="bg-yellow-50 p-4 rounded-md text-center">
                <p className="text-3xl font-bold text-yellow-600">
                  {validationData.testResults.incomplete}
                </p>
                <p className="text-sm text-gray-600">Incomplete</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Recent Certifications */}
      {complianceStatus?.certifications && (
        <div className="bg-white shadow-md rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">Certifications</h3>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Certification
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Status
                  </th>
                  <th
                    scope="col"
                    className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                  >
                    Expiry Date
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {complianceStatus.certifications.map((cert, index) => (
                  <tr key={index}>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{cert.name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span
                        className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full 
                        ${cert.status === 'verified' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'}`}
                      >
                        {cert.status === 'verified' ? 'Verified' : 'Pending'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(cert.expiryDate).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default FDAComplianceDashboard;
