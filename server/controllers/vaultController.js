/**
 * Vault Controller
 *
 * Handles operations related to document vault functionality
 */

// Get recent documents
const getRecentDocuments = (req, res) => {
  const recentDocs = [
    {
      id: 1,
      name: 'IND-2025-034-Protocol.docx',
      type: 'Protocol',
      uploadedAt: '2025-04-26',
      uploadedBy: 'Sarah Johnson',
    },
    {
      id: 2,
      name: 'CSR-2024-089-Draft.pdf',
      type: 'CSR Draft',
      uploadedAt: '2025-04-25',
      uploadedBy: 'Mark Wilson',
    },
    {
      id: 3,
      name: 'Investigator_Brochure_v2.pdf',
      type: 'IB',
      uploadedAt: '2025-04-24',
      uploadedBy: 'Emily Chen',
    },
    {
      id: 4,
      name: 'BTX-331-SummaryStats.xlsx',
      type: 'Statistics',
      uploadedAt: '2025-04-23',
      uploadedBy: 'David Lee',
    },
    {
      id: 5,
      name: 'CIR-507-Amendment-Draft.docx',
      type: 'Protocol Amendment',
      uploadedAt: '2025-04-22',
      uploadedBy: 'Jennifer Smith',
    },
  ];

  res.status(200).json({
    success: true,
    data: recentDocs,
  });
};

module.exports = {
  getRecentDocuments,
};
