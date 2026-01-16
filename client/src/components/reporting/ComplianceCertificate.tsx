import React, { useState } from 'react';

interface CertificateProps {
  projectTitle: string;
  riskScore: number;
  lastScanDate: string;
  clearedItems: number;
  userName: string;
}

const TacticalToast = ({ message, type, onClose }: { message: string; type: string; onClose: () => void }) => (
  <div
    className={`fixed top-6 right-6 z-[10000] px-6 py-4 rounded shadow-2xl flex items-center gap-4 animate-in slide-in-from-right duration-300 ${
      type === 'SUCCESS'
        ? 'bg-emerald-900 border border-emerald-500 text-white'
        : 'bg-red-900 border border-red-500 text-white'
    }`}
  >
    <div className={`h-3 w-3 rounded-full ${type === 'SUCCESS' ? 'bg-emerald-400' : 'bg-red-400'}`}></div>
    <div className="font-mono text-sm font-bold">{message}</div>
    <button onClick={onClose} className="text-white/50 hover:text-white ml-4">
      ✕
    </button>
  </div>
);

export const ComplianceCertificate: React.FC<CertificateProps> = ({
  projectTitle,
  riskScore,
  lastScanDate,
  clearedItems,
  userName,
}) => {
  const [signed, setSigned] = useState(false);
  const [signatureName, setSignatureName] = useState('');
  const [toast, setToast] = useState<{ msg: string; type: string } | null>(null);

  const handleSign = () => {
    if (signatureName.trim().toLowerCase() === userName.trim().toLowerCase()) {
      setSigned(true);
      setToast({ msg: 'SIGNATURE SEALED. CERTIFICATE UNLOCKED.', type: 'SUCCESS' });
    } else {
      setToast({ msg: 'SIGNATURE MISMATCH. VERIFY USER NAME.', type: 'ERROR' });
    }
  };

  const handlePrint = () => window.print();

  return (
    <div className="relative">
      {toast && (
        <TacticalToast message={toast.msg} type={toast.type} onClose={() => setToast(null)} />
      )}
      <div
        className="bg-white text-slate-900 p-12 max-w-5xl mx-auto shadow-2xl my-8 print:shadow-none print:m-0"
        id="certificate"
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs uppercase tracking-[0.3em] text-slate-400">Compliance Certificate</div>
            <h1 className="text-3xl font-bold text-slate-900 mt-3">{projectTitle}</h1>
            <div className="text-sm text-slate-500 mt-2">Issued by ClinicalSage AI</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-slate-400 uppercase">Risk Score</div>
            <div className="text-4xl font-bold text-slate-900">{riskScore}</div>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-6 mt-10">
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-400 uppercase">Last Scan</div>
            <div className="text-lg font-semibold text-slate-900 mt-2">{lastScanDate}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-400 uppercase">Cleared Items</div>
            <div className="text-lg font-semibold text-slate-900 mt-2">{clearedItems}</div>
          </div>
          <div className="border border-slate-200 rounded-lg p-4">
            <div className="text-xs text-slate-400 uppercase">Signer</div>
            <div className="text-lg font-semibold text-slate-900 mt-2">{userName}</div>
          </div>
        </div>

        <div className="mt-24 pt-8 border-t border-slate-300 flex justify-between items-end relative z-10">
          <div className="w-1/3">
            {!signed ? (
              <div className="print:hidden">
                <label className="text-xs font-bold text-slate-400 uppercase mb-2 block">
                  Type Name to Sign ({userName})
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={signatureName}
                    onChange={(e) => setSignatureName(e.target.value)}
                    className="border-b-2 border-slate-300 outline-none font-script text-xl w-full focus:border-blue-600 bg-transparent"
                    placeholder="Sign here..."
                  />
                  <button
                    onClick={handleSign}
                    disabled={!signatureName}
                    className="text-xs bg-slate-900 text-white px-3 py-1 rounded disabled:opacity-50"
                  >
                    SEAL
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <div className="font-script text-3xl text-blue-900 mb-2">{signatureName}</div>
                <div className="text-[10px] font-mono text-slate-400">
                  DIGITALLY SIGNED: {new Date().toISOString()}
                </div>
                <div className="h-px bg-slate-400 w-full my-1"></div>
                <div className="text-xs uppercase font-bold text-slate-500">Authorized Signature</div>
              </div>
            )}
          </div>

          <div className="w-1/3">
            <div className="text-xl text-slate-900 mb-2">{new Date().toLocaleDateString()}</div>
            <div className="h-px bg-slate-400 w-full my-1"></div>
            <div className="text-xs uppercase font-bold text-slate-500">Date</div>
          </div>
        </div>

        <div className="border-t border-slate-200 pt-8 mt-12 flex justify-between items-center print:hidden">
          <div className="text-xs text-slate-400">Generated by ClinicalSage AI • Secure Ledger</div>
          <button
            onClick={handlePrint}
            disabled={!signed}
            className={`px-8 py-4 rounded-lg font-bold shadow-xl flex items-center gap-3 transition-all ${
              signed ? 'bg-slate-900 text-white hover:bg-slate-800' : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <span>{signed ? '🖨️' : '🔒'}</span>
            {signed ? 'EXPORT CERTIFICATE' : 'SIGN TO UNLOCK'}
          </button>
        </div>

        <style>{`
          @import url('https://fonts.googleapis.com/css2?family=Dancing+Script:wght@700&display=swap');
          .font-script { font-family: 'Dancing Script', cursive; }
        `}</style>
      </div>
    </div>
  );
};
