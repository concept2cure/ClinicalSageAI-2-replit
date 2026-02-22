import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Loader2,
  Save,
  Trash,
  Check,
  Calendar,
  ShieldCheck,
  AlertTriangle,
  FileCheck,
  Lock,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

/**
 * Digital Signature Page - Capture and manage electronic signatures for documents
 */
const SignaturePage = () => {
  // Auth context — signer identity must come from authenticated session per §11.100
  const { session } = useAuth();
  const authenticatedUser = session?.user;

  // Signature pad references and state
  const signaturePadRef = useRef(null);
  const canvasRef = useRef(null);
  const [signing, setSigning] = useState(false);
  const [signatureImage, setSignatureImage] = useState(null);
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [componentToSign, setComponentToSign] = useState('');
  const [signaturePosition, setSignaturePosition] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('create');

  // Part 11 compliance state
  const [signatureMeaning, setSignatureMeaning] = useState('approval');
  const [complianceStatus, setComplianceStatus] = useState(null);

  // Password re-entry dialog state per §11.100(a)
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');

  // Signer name is bound to authenticated user — not editable
  const signatureName = authenticatedUser?.display_name || authenticatedUser?.username || '';
  // Display date — server generates the authoritative NIST timestamp on POST /api/part11/signatures.
  // This client-side date is for UI display only; the record of truth is the server-signed timestamp
  // returned in the API response and stored in the database.
  const [signatureDate, setSignatureDate] = useState(new Date().toISOString().slice(0, 10));

  // Fetch server time for display accuracy (NIST-synced)
  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/time');
        if (res.ok) {
          const data = await res.json();
          if (data.iso) setSignatureDate(data.iso.slice(0, 10));
        }
      } catch {
        // Falls back to client time — authoritative timestamp is still server-side on sign.
      }
    })();
  }, []);

  // Initialize signature pad when component mounts
  useEffect(() => {
    loadSavedSignatures();
    loadComplianceStatus();
  }, []);

  // Load Part 11 compliance status (progressive disclosure — shown as badge)
  const loadComplianceStatus = async () => {
    try {
      const response = await fetch('/api/part11/compliance-status');
      if (response.ok) {
        const data = await response.json();
        setComplianceStatus(data);
      }
    } catch (error) {
      // Graceful degradation — compliance badge just won't show
      console.warn('Part 11 compliance status unavailable:', error.message);
    }
  };

  // Initialize or reset signature pad
  useEffect(() => {
    if (!canvasRef.current || !signing) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Clear canvas
    ctx.fillStyle = 'white';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Set up signature pad
    if (typeof SignaturePad !== 'undefined') {
      if (signaturePadRef.current) {
        signaturePadRef.current.clear();
      } else {
        signaturePadRef.current = new SignaturePad(canvas, {
          backgroundColor: 'white',
          penColor: 'black',
          minWidth: 1,
          maxWidth: 3,
        });
      }
    } else {
      console.error('SignaturePad library not loaded');
    }
  }, [signing, canvasRef.current]);

  // Load saved signatures
  const loadSavedSignatures = async () => {
    try {
      const response = await fetch('/api/signature/list');
      if (response.ok) {
        const data = await response.json();
        setSavedSignatures(data.signatures || []);
      }
    } catch (error) {
      console.error('Error loading signatures:', error);
    }
  };

  // Initiate signing — validates fields, then opens password re-entry dialog per §11.100(a)
  const initiateSign = () => {
    if (!componentToSign || !signatureName) {
      setMessage('Please complete all required fields.');
      return;
    }

    // Validate signature image exists
    if (signaturePadRef.current) {
      if (signaturePadRef.current.isEmpty()) {
        setMessage('Please draw a signature.');
        return;
      }
    } else if (!signatureImage) {
      setMessage('No signature to save.');
      return;
    }

    // Open password re-entry dialog for identity verification per §11.100(a)
    setPasswordInput('');
    setPasswordError('');
    setShowPasswordDialog(true);
  };

  // Save signature via Part 11 compliant API after password verification (§11.50/§11.70/§11.100)
  const saveSignature = async password => {
    // Get signature image data
    let signatureData;
    if (signaturePadRef.current) {
      signatureData = signaturePadRef.current.toDataURL();
    } else if (signatureImage) {
      signatureData = signatureImage;
    }

    setLoading(true);
    try {
      // Part 11 compliant endpoint (includes meaning, NIST timestamp, SHA-256 hash)
      const part11Response = await fetch('/api/part11/signatures', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          documentId: componentToSign,
          documentType: componentToSign,
          signerName: signatureName,
          signerTitle: signaturePosition,
          meaning: signatureMeaning,
          password: password, // Real password for §11.100(a) identity verification
          signatureImage: signatureData,
        }),
      });

      if (part11Response.ok) {
        const data = await part11Response.json();
        setSavedSignatures(prev => [
          ...prev,
          {
            id: data.signature?.id || Date.now(),
            name: signatureName,
            component: componentToSign,
            position: signaturePosition,
            date: signatureDate,
            signature: signatureData,
            part11Compliant: true,
            meaning: signatureMeaning,
            hash: data.signature?.hash,
          },
        ]);
        setMessage('Signature saved successfully (21 CFR Part 11 compliant).');
        setShowPasswordDialog(false);
        resetSignatureForm();
        setActiveTab('manage');
      } else {
        const errorData = await part11Response.json().catch(() => ({}));
        if (part11Response.status === 401 || part11Response.status === 403) {
          setPasswordError('Identity verification failed. Please re-enter your password.');
          return; // Keep dialog open for retry
        }
        throw new Error(errorData.message || 'Failed to save signature');
      }
    } catch (error) {
      console.error('Error saving signature:', error);
      setMessage('Error saving signature. Please try again.');
      setShowPasswordDialog(false);
    } finally {
      setLoading(false);
    }
  };

  // Handle password dialog submission
  const handlePasswordSubmit = () => {
    if (!passwordInput.trim()) {
      setPasswordError('Password is required for identity verification.');
      return;
    }
    saveSignature(passwordInput);
  };

  // Reset signature form
  const resetSignatureForm = () => {
    setSigning(false);
    setSignatureImage(null);
    setComponentToSign('');
    setSignaturePosition('');

    // Reset canvas
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  // Handle type/draw toggle
  const startSigning = () => {
    setSigning(true);
    setSignatureImage(null);
  };

  // Clear signature drawing
  const clearSignature = () => {
    if (signaturePadRef.current) {
      signaturePadRef.current.clear();
    }
  };

  // Electronic signatures are legally binding per 21 CFR Part 11 §11.70
  // Signature deletion has been intentionally removed for regulatory compliance
  // Voiding a signature requires a counter-signature with documented reason

  // Format date for display
  const formatDate = dateString => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <div className="signature-page-container p-4">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Digital Signatures</h1>
        {complianceStatus && (
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium ${
              complianceStatus.overallCompliance === 'compliant'
                ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-amber-50 text-amber-700 border border-amber-200'
            }`}
          >
            {complianceStatus.overallCompliance === 'compliant' ? (
              <ShieldCheck className="h-3.5 w-3.5" />
            ) : (
              <AlertTriangle className="h-3.5 w-3.5" />
            )}
            21 CFR Part 11{' '}
            {complianceStatus.overallCompliance === 'compliant' ? 'Compliant' : 'Review Required'}
          </div>
        )}
      </div>

      <Tabs defaultValue="create" value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="mb-4">
          <TabsTrigger value="create">
            <Save className="h-4 w-4 mr-2" />
            Create Signature
          </TabsTrigger>
          <TabsTrigger value="manage">
            <Check className="h-4 w-4 mr-2" />
            Manage Signatures
          </TabsTrigger>
          <TabsTrigger value="compliance">
            <FileCheck className="h-4 w-4 mr-2" />
            Compliance
          </TabsTrigger>
        </TabsList>

        {/* Create Signature Tab */}
        <TabsContent value="create">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle>Signature Information</CardTitle>
                <CardDescription>Enter details for new signature</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div>
                    <label className="block mb-1 font-medium">
                      Component to Sign<span className="text-red-500">*</span>
                    </label>
                    <select
                      className="w-full p-2 border rounded"
                      value={componentToSign}
                      onChange={e => setComponentToSign(e.target.value)}
                      required
                    >
                      <option value="">Select Component</option>
                      <option value="ind">IND Application</option>
                      <option value="protocol">Study Protocol</option>
                      <option value="csr">Clinical Study Report</option>
                      <option value="cer">Clinical Evaluation Report</option>
                      <option value="coa">Certificate of Analysis</option>
                    </select>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">
                      Signer Name<span className="text-red-500">*</span>
                      <span className="text-xs text-gray-400 ml-1">
                        (bound to authenticated session per §11.100)
                      </span>
                    </label>
                    <div className="w-full p-2 border rounded bg-gray-50 text-gray-700 flex items-center gap-2">
                      <Lock className="h-4 w-4 text-gray-400" />
                      {signatureName || (
                        <span className="text-gray-400 italic">Not authenticated</span>
                      )}
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">Position/Title</label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded"
                      value={signaturePosition}
                      onChange={e => setSignaturePosition(e.target.value)}
                      placeholder="e.g., Medical Director"
                    />
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">
                      Date<span className="text-red-500">*</span>
                      <span className="text-xs text-gray-400 ml-1">
                        (server-generated per §11.50(b))
                      </span>
                    </label>
                    <div className="w-full p-2 border rounded bg-gray-50 text-gray-700 flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-gray-400" />
                      {new Date().toLocaleDateString('en-US', {
                        year: 'numeric',
                        month: 'long',
                        day: 'numeric',
                      })}
                    </div>
                  </div>

                  <div>
                    <label className="block mb-1 font-medium">
                      Signature Meaning<span className="text-red-500">*</span>
                      <span className="text-xs text-gray-400 ml-1">(§11.50)</span>
                    </label>
                    <select
                      className="w-full p-2 border rounded"
                      value={signatureMeaning}
                      onChange={e => setSignatureMeaning(e.target.value)}
                      required
                    >
                      <option value="approval">Approval — I approve this document</option>
                      <option value="review">Review — I have reviewed this document</option>
                      <option value="authorship">Authorship — I authored this content</option>
                      <option value="verification">
                        Verification — I verify accuracy of this data
                      </option>
                      <option value="responsibility">
                        Responsibility — I accept responsibility for this document
                      </option>
                    </select>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Signature</CardTitle>
                <CardDescription>Draw your signature below</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  <div className="border rounded p-1">
                    <div className="relative h-40 bg-white">
                      {signing ? (
                        <canvas
                          ref={canvasRef}
                          width={580}
                          height={160}
                          className="w-full h-full border rounded cursor-crosshair"
                        />
                      ) : (
                        <div className="flex items-center justify-center h-full">
                          <Button onClick={startSigning}>Draw Signature</Button>
                        </div>
                      )}
                    </div>
                  </div>

                  {signing && (
                    <div className="flex justify-between">
                      <Button
                        variant="outline"
                        onClick={clearSignature}
                        className="flex items-center"
                      >
                        <Trash className="h-4 w-4 mr-2" />
                        Clear
                      </Button>
                      <Button
                        onClick={initiateSign}
                        disabled={loading}
                        className="flex items-center"
                      >
                        {loading ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Saving...
                          </>
                        ) : (
                          <>
                            <Save className="h-4 w-4 mr-2" />
                            Save Signature
                          </>
                        )}
                      </Button>
                    </div>
                  )}

                  {message && (
                    <div
                      className={`p-2 rounded text-center text-sm ${message.includes('successfully') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                    >
                      {message}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Manage Signatures Tab */}
        <TabsContent value="manage">
          <Card>
            <CardHeader>
              <CardTitle>Saved Signatures</CardTitle>
              <CardDescription>View and manage saved signatures</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="border rounded">
                {savedSignatures.length > 0 ? (
                  <div className="divide-y">
                    {savedSignatures.map(signature => (
                      <div key={signature.id} className="p-4">
                        <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center">
                          <div className="flex-grow">
                            <div className="flex items-center">
                              <div
                                className="h-16 w-48 bg-white border rounded mr-4 p-1 flex-shrink-0 hidden md:block"
                                style={{
                                  backgroundImage: `url(${signature.imageUrl || signature.signature})`,
                                  backgroundSize: 'contain',
                                  backgroundRepeat: 'no-repeat',
                                  backgroundPosition: 'center',
                                }}
                              />
                              <div>
                                <h3 className="font-medium">{signature.name}</h3>
                                <div className="text-sm text-gray-500">
                                  {(signature.component || 'Unknown').toUpperCase()} -{' '}
                                  {signature.position || 'N/A'}
                                </div>
                                <div className="flex items-center gap-2 mt-1">
                                  <span className="text-xs text-gray-500">
                                    <Calendar className="h-3 w-3 inline-block mr-1" />
                                    {formatDate(signature.date)}
                                  </span>
                                  {signature.part11Compliant && (
                                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                                      <ShieldCheck className="h-3 w-3" />
                                      Part 11
                                    </span>
                                  )}
                                  {signature.meaning && (
                                    <span className="text-xs text-gray-400 capitalize">
                                      {signature.meaning}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 lg:mt-0">
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs bg-emerald-50 text-emerald-700 border border-emerald-200">
                              <ShieldCheck className="h-3 w-3" />
                              Legally Bound
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-8 text-center text-gray-500">
                    <p>No signatures saved yet.</p>
                    <Button onClick={() => setActiveTab('create')} className="mt-4">
                      Create New Signature
                    </Button>
                  </div>
                )}
              </div>

              {message && (
                <div
                  className={`mt-4 p-2 rounded text-center text-sm ${message.includes('successfully') ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}
                >
                  {message}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Part 11 Compliance Tab — progressive disclosure of regulatory detail */}
        <TabsContent value="compliance">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-emerald-600" />
                21 CFR Part 11 Compliance
              </CardTitle>
              <CardDescription>
                Electronic records and signatures compliance per FDA 21 CFR Part 11
              </CardDescription>
            </CardHeader>
            <CardContent>
              {complianceStatus ? (
                <div className="space-y-4">
                  <div
                    className={`p-4 rounded-lg border ${
                      complianceStatus.overallCompliance === 'compliant'
                        ? 'bg-emerald-50 border-emerald-200'
                        : 'bg-amber-50 border-amber-200'
                    }`}
                  >
                    <div className="font-medium mb-1">
                      Overall Status:{' '}
                      {complianceStatus.overallCompliance === 'compliant'
                        ? 'Compliant'
                        : 'Review Required'}
                    </div>
                    <div className="text-sm text-gray-600">
                      Score: {complianceStatus.complianceScore ?? '—'}%
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {(complianceStatus.controls || []).map((ctrl, i) => (
                      <div key={i} className="flex items-start gap-2 p-3 rounded border bg-white">
                        <span
                          className={`mt-0.5 h-2 w-2 rounded-full flex-shrink-0 ${
                            ctrl.status === 'passed'
                              ? 'bg-emerald-500'
                              : ctrl.status === 'failed'
                                ? 'bg-red-500'
                                : 'bg-amber-500'
                          }`}
                        />
                        <div>
                          <div className="text-sm font-medium">{ctrl.name || ctrl.controlId}</div>
                          <div className="text-xs text-gray-500">
                            {ctrl.description || ctrl.requirement}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="text-center py-8 text-gray-500">
                  <ShieldCheck className="h-8 w-8 mx-auto mb-2 opacity-40" />
                  <p>Compliance status loading...</p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-3"
                    onClick={loadComplianceStatus}
                  >
                    Refresh
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default SignaturePage;
