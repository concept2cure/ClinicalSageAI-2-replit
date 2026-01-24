import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Save, Trash, Check, Calendar } from 'lucide-react';

/**
 * Digital Signature Page - Capture and manage electronic signatures for documents
 */
const SignaturePage = () => {
  // Signature pad references and state
  const signaturePadRef = useRef(null);
  const canvasRef = useRef(null);
  const [signing, setSigning] = useState(false);
  const [signatureImage, setSignatureImage] = useState(null);
  const [savedSignatures, setSavedSignatures] = useState([]);
  const [componentToSign, setComponentToSign] = useState('');
  const [signatureDate, setSignatureDate] = useState('');
  const [signaturePosition, setSignaturePosition] = useState('');
  const [signatureName, setSignatureName] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [activeTab, setActiveTab] = useState('create');

  // Initialize signature pad when component mounts
  useEffect(() => {
    loadSavedSignatures();

    // Set today's date as default
    const today = new Date();
    setSignatureDate(today.toISOString().slice(0, 10));
  }, []);

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

  // Save signature
  const saveSignature = async () => {
    if (!componentToSign || !signatureName || !signatureDate) {
      setMessage('Please complete all required fields.');
      return;
    }

    // Get signature image data
    let signatureData;
    if (signaturePadRef.current) {
      if (signaturePadRef.current.isEmpty()) {
        setMessage('Please draw a signature.');
        return;
      }
      signatureData = signaturePadRef.current.toDataURL();
    } else if (signatureImage) {
      signatureData = signatureImage;
    } else {
      setMessage('No signature to save.');
      return;
    }

    setLoading(true);
    try {
      const response = await fetch('/api/signature/save', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          component: componentToSign,
          name: signatureName,
          position: signaturePosition,
          date: signatureDate,
          signature: signatureData,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setSavedSignatures(prev => [...prev, data.signature]);
        setMessage('Signature saved successfully.');
        resetSignatureForm();
        setActiveTab('manage');
      } else {
        throw new Error('Failed to save signature');
      }
    } catch (error) {
      console.error('Error saving signature:', error);
      setMessage('Error saving signature. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Reset signature form
  const resetSignatureForm = () => {
    setSigning(false);
    setSignatureImage(null);
    setComponentToSign('');
    setSignaturePosition('');
    setSignatureName('');

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

  // Delete a saved signature
  const deleteSignature = async id => {
    setLoading(true);
    try {
      const response = await fetch(`/api/signature/${id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        setSavedSignatures(prev => prev.filter(sig => sig.id !== id));
        setMessage('Signature deleted successfully.');
      } else {
        throw new Error('Failed to delete signature');
      }
    } catch (error) {
      console.error('Error deleting signature:', error);
      setMessage('Error deleting signature. Please try again.');
    } finally {
      setLoading(false);
    }
  };

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
      <h1 className="text-2xl font-bold mb-6">Digital Signatures</h1>

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
                    </label>
                    <input
                      type="text"
                      className="w-full p-2 border rounded"
                      value={signatureName}
                      onChange={e => setSignatureName(e.target.value)}
                      placeholder="e.g., Dr. John Smith"
                      required
                    />
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
                    </label>
                    <input
                      type="date"
                      className="w-full p-2 border rounded"
                      value={signatureDate}
                      onChange={e => setSignatureDate(e.target.value)}
                      required
                    />
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
                        onClick={saveSignature}
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
                                  {signature.component.toUpperCase()} - {signature.position}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  <Calendar className="h-3 w-3 inline-block mr-1" />
                                  {formatDate(signature.date)}
                                </div>
                              </div>
                            </div>
                          </div>
                          <div className="mt-3 lg:mt-0">
                            <Button
                              variant="destructive"
                              size="sm"
                              onClick={() => deleteSignature(signature.id)}
                              disabled={loading}
                              className="flex items-center"
                            >
                              <Trash className="h-4 w-4 mr-1" />
                              Remove
                            </Button>
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
      </Tabs>
    </div>
  );
};

export default SignaturePage;
