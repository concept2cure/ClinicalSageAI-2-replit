/**
 * ExportsView - Clean export generation and download interface
 */

import { useState } from 'react';
import { Download, FileDown, Check, FileText } from 'lucide-react';
import { useExports, useGenerateExport } from '../../hooks/useCERv2Queries';
import { exportsApi } from '../../lib/cerv2WorkbenchContract';
import { truncateMiddle, formatBytes, formatTimestamp } from '../../lib/cerv2Utils';
import { CopyButton } from '../../components/cerv2/CopyButton';

export default function ExportsView({ programId }) {
  const [generating, setGenerating] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);
  
  const { data, isLoading, error, refetch } = useExports(programId);
  const generateClaimsMatrix = useGenerateExport(programId, 'claims-matrix');
  const generateStandardsCoverage = useGenerateExport(programId, 'standards-coverage');
  const generateOutcomesSubstantiation = useGenerateExport(programId, 'outcomes-substantiation');
  const generateDefensePack = useGenerateExport(programId, 'defense-pack');

  const exports = data?.items || [];

  const handleGenerateExport = async (type) => {
    setGenerating(true);
    try {
      switch (type) {
        case 'claims-matrix':
          await generateClaimsMatrix.mutateAsync();
          break;
        case 'standards-coverage':
          await generateStandardsCoverage.mutateAsync();
          break;
        case 'outcomes-substantiation':
          await generateOutcomesSubstantiation.mutateAsync();
          break;
        case 'defense-pack':
          await generateDefensePack.mutateAsync();
          break;
      }
      setShowExportModal(false);
    } catch (err) {
      console.error('Export generation failed:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleDownload = (exportId, filename) => {
    const downloadUrl = exportsApi.getDownloadUrl(programId, exportId);
    window.location.href = downloadUrl;
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Exports</h1>
          <p className="text-sm text-slate-500 mt-1">
            Generate and download regulatory deliverables with full audit trail
          </p>
        </div>
        <button
          onClick={() => setShowExportModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Download className="w-4 h-4" />
          Generate Export
        </button>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
          Failed to load exports. {error.message || 'Please try again.'}
          <button onClick={refetch} className="ml-2 underline">Retry</button>
        </div>
      )}

      {/* Exports List */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200">
        <div className="p-4 border-b border-slate-200">
          <h3 className="text-sm font-semibold text-slate-900">
            Generated Exports ({exports.length})
          </h3>
        </div>

        {isLoading ? (
          <div className="p-12 text-center text-slate-500">
            <div className="animate-spin h-8 w-8 border-4 border-slate-200 border-t-blue-600 rounded-full mx-auto mb-3"></div>
            Loading exports...
          </div>
        ) : exports.length === 0 ? (
          <div className="p-12 text-center">
            <FileText className="h-12 w-12 text-slate-300 mx-auto mb-3" />
            <div className="text-slate-600 font-medium mb-1">No exports generated yet</div>
            <div className="text-sm text-slate-500 mb-4">
              Exports are auditable snapshots with checksums and evidence fingerprints
            </div>
            <button
              onClick={() => setShowExportModal(true)}
              className="px-6 py-3 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors"
            >
              Generate First Export
            </button>
          </div>
        ) : (
          <div className="p-4 space-y-3">
            {exports.map((exp) => (
              <div
                key={exp.id}
                className="flex items-start gap-4 p-4 border-2 border-transparent hover:border-blue-200 rounded-lg bg-slate-50 transition-all"
              >
                <FileDown className="w-8 h-8 text-blue-600 flex-shrink-0 mt-1" />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-slate-900 mb-2">
                    {exp.filename}
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-slate-500">Created:</span>{' '}
                      <span className="text-slate-700">{formatTimestamp(exp.createdAt)}</span>
                    </div>
                    <div>
                      <span className="text-slate-500">Size:</span>{' '}
                      <span className="text-slate-700">{formatBytes(exp.sizeBytes)}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">SHA256:</span>
                      <code className="text-slate-700 font-mono">{truncateMiddle(exp.sha256, 16, 6)}</code>
                      <CopyButton text={exp.sha256} label="Copy SHA256" />
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-slate-500">Fingerprint:</span>
                      <code className="text-slate-700 font-mono">{truncateMiddle(exp.evidenceSetFingerprint, 16, 6)}</code>
                      <CopyButton text={exp.evidenceSetFingerprint} label="Copy fingerprint" />
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => handleDownload(exp.id, exp.filename)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors flex-shrink-0"
                >
                  <Download className="w-4 h-4" />
                  Download
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Export Modal */}
      {showExportModal && (
        <ExportModal
          onClose={() => setShowExportModal(false)}
          onGenerate={handleGenerateExport}
          generating={generating}
        />
      )}
    </div>
  );
}

/**
 * Export Modal Component
 */
function ExportModal({ onClose, onGenerate, generating }) {
  const [selectedType, setSelectedType] = useState('claims-matrix');

  const exportTypes = [
    {
      id: 'claims-matrix',
      label: 'Claims Matrix',
      description: 'Excel matrix of claims with linked evidence',
    },
    {
      id: 'standards-coverage',
      label: 'Standards Coverage',
      description: 'Coverage report for regulatory standards',
    },
    {
      id: 'outcomes-substantiation',
      label: 'Outcomes Substantiation',
      description: 'Clinical outcomes with supporting evidence',
    },
    {
      id: 'defense-pack',
      label: 'Defense Pack (ZIP)',
      description: 'Complete evidence package with all files',
    },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6 mx-4" onClick={(e) => e.stopPropagation()}>
        <h2 className="text-xl font-bold text-slate-900 mb-4">
          Generate Export
        </h2>

        <div className="space-y-3 mb-6">
          {exportTypes.map((type) => (
            <label
              key={type.id}
              className={`flex items-start gap-3 p-3 rounded-lg border-2 cursor-pointer transition-colors ${
                selectedType === type.id
                  ? 'border-blue-600 bg-blue-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="exportType"
                value={type.id}
                checked={selectedType === type.id}
                onChange={(e) => setSelectedType(e.target.value)}
                className="mt-1"
              />
              <div className="flex-1">
                <div className="font-medium text-slate-900">{type.label}</div>
                <div className="text-sm text-slate-600">{type.description}</div>
              </div>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <button
            onClick={onClose}
            disabled={generating}
            className="flex-1 px-4 py-2 border border-slate-300 text-slate-700 font-medium rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            onClick={() => onGenerate(selectedType)}
            disabled={generating}
            className="flex-1 px-4 py-2 bg-blue-600 text-white font-medium rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Generate
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
