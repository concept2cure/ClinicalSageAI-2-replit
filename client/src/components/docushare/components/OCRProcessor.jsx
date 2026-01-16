import React, { useState, useCallback } from 'react';
import { Upload, FileText, Eye, Settings, Loader2, CheckCircle, XCircle } from 'lucide-react'
import { Button } from '../../ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../../ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../../ui/select';
import { Switch } from '../../ui/switch';
import { Label } from '../../ui/label';
import { Textarea } from '../../ui/textarea';
import { Badge } from '../../ui/badge';
import { Progress } from '../../ui/progress';

const OCRProcessor = ({ onTextExtracted, className = '' }) => {
  const [processing, setProcessing] = useState(false);
  const [extractedText, setExtractedText] = useState('');
  const [ocrResults, setOcrResults] = useState(null);
  const [selectedFiles, setSelectedFiles] = useState([]);

  // OCR Settings
  const [ocrMethod, setOcrMethod] = useState('auto');
  const [preserveLayout, setPreserveLayout] = useState(true);
  const [analyzeStructure, setAnalyzeStructure] = useState(false);
  const [batchProcessing, setBatchProcessing] = useState(false);

  const handleFileSelect = useCallback(event => {
    const files = Array.from(event.target.files);
    setSelectedFiles(files);
  }, []);

  const processOCR = async (files = selectedFiles) => {
    if (!files || files.length === 0) return;

    setProcessing(true);
    setOcrResults(null);

    try {
      const formData = new FormData();

      if (files.length === 1) {
        // Single file processing
        formData.append('document', files[0]);
        formData.append('method', ocrMethod);
        formData.append('preserveLayout', preserveLayout);
        formData.append('analyzeStructure', analyzeStructure);

        const response = await fetch('/api/ocr/process', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (result.success) {
          const text = result.data.result?.text || '';
          setExtractedText(text);
          setOcrResults(result.data);
          onTextExtracted?.(text, result.data);
        } else {
          throw new Error(result.error || 'OCR processing failed');
        }
      } else {
        // Batch processing
        files.forEach(file => formData.append('documents', file));
        formData.append('method', ocrMethod);
        formData.append('preserveLayout', preserveLayout);

        const response = await fetch('/api/ocr/batch', {
          method: 'POST',
          body: formData,
        });

        const result = await response.json();

        if (result.success) {
          const combinedText = result.results
            .filter(r => r.result?.result?.success)
            .map(r => `=== ${r.filename} ===\n${r.result.result.text}`)
            .join('\n\n');

          setExtractedText(combinedText);
          setOcrResults(result);
          onTextExtracted?.(combinedText, result);
        } else {
          throw new Error(result.error || 'Batch OCR processing failed');
        }
      }
    } catch (error) {
      console.error('OCR Error:', error);
      setOcrResults({
        error: error.message,
        success: false,
      });
    } finally {
      setProcessing(false);
    }
  };

  const processDocuShareDocument = async documentId => {
    setProcessing(true);
    setOcrResults(null);

    try {
      const response = await fetch(`/api/ocr/docushare/${documentId}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          method: ocrMethod,
        }),
      });

      const result = await response.json();

      if (result.success) {
        const text = result.data.result?.text || '';
        setExtractedText(text);
        setOcrResults(result.data);
        onTextExtracted?.(text, result.data);
      } else {
        throw new Error(result.error || 'DocuShare OCR processing failed');
      }
    } catch (error) {
      console.error('DocuShare OCR Error:', error);
      setOcrResults({
        error: error.message,
        success: false,
      });
    } finally {
      setProcessing(false);
    }
  };

  const renderOCRSettings = () => (
    <Card className="mb-4">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Settings className="h-4 w-4" />
          OCR Settings
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label>OCR Method</Label>
            <Select value={ocrMethod} onValueChange={setOcrMethod}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="auto">Auto (Best Available)</SelectItem>
                <SelectItem value="docushare">DocuShare OCR</SelectItem>
                <SelectItem value="aws-textract">AWS Textract</SelectItem>
                <SelectItem value="tesseract">Tesseract</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label htmlFor="preserve-layout">Preserve Layout</Label>
              <Switch
                id="preserve-layout"
                checked={preserveLayout}
                onCheckedChange={setPreserveLayout}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="analyze-structure">Analyze Structure</Label>
              <Switch
                id="analyze-structure"
                checked={analyzeStructure}
                onCheckedChange={setAnalyzeStructure}
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );

  const renderUploadArea = () => (
    <Card className="border-dashed border-2 border-gray-300 hover:border-gray-400 transition-colors">
      <CardContent className="flex flex-col items-center justify-center py-8">
        <Upload className="h-12 w-12 text-gray-400 mb-4" />
        <div className="text-center space-y-2">
          <p className="text-sm font-medium">Drop files here or click to upload</p>
          <p className="text-xs text-gray-500">
            Supports PDF, PNG, JPG, TIFF (max 10 files for batch)
          </p>
        </div>
        <input
          type="file"
          multiple
          accept=".pdf,.png,.jpg,.jpeg,.tiff,.bmp"
          onChange={handleFileSelect}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
      </CardContent>
    </Card>
  );

  const renderResults = () => {
    if (!ocrResults) return null;

    return (
      <Card className="mt-4">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-sm">
            <FileText className="h-4 w-4" />
            OCR Results
            {ocrResults.result?.success ? (
              <Badge variant="success" className="ml-2">
                <CheckCircle className="h-3 w-3 mr-1" />
                Success
              </Badge>
            ) : (
              <Badge variant="destructive" className="ml-2">
                <XCircle className="h-3 w-3 mr-1" />
                Failed
              </Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Method and Confidence */}
          {ocrResults.result && (
            <div className="flex gap-4 text-sm">
              <div>
                <span className="font-medium">Method:</span> {ocrResults.result.method}
              </div>
              {ocrResults.result.confidence && (
                <div>
                  <span className="font-medium">Confidence:</span>{' '}
                  {Math.round(ocrResults.result.confidence * 100)}%
                </div>
              )}
            </div>
          )}

          {/* Processing Chain */}
          {ocrResults.processingChain && (
            <div>
              <span className="font-medium text-sm">Processing Chain:</span>
              <div className="flex gap-1 mt-1">
                {ocrResults.processingChain.map((method, index) => (
                  <Badge key={index} variant="outline" className="text-xs">
                    {method}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {/* Structure Analysis */}
          {ocrResults.structureAnalysis && (
            <div className="border rounded p-3 bg-gray-50">
              <div className="text-sm font-medium mb-2">Document Structure</div>
              <div className="grid grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="font-medium">Sections:</span>{' '}
                  {ocrResults.structureAnalysis.sections?.length || 0}
                </div>
                <div>
                  <span className="font-medium">Tables:</span>{' '}
                  {ocrResults.structureAnalysis.tables?.length || 0}
                </div>
                <div>
                  <span className="font-medium">Headers:</span>{' '}
                  {ocrResults.structureAnalysis.headers?.length || 0}
                </div>
              </div>
            </div>
          )}

          {/* Extracted Text */}
          <div>
            <Label className="text-sm font-medium">Extracted Text</Label>
            <Textarea
              value={extractedText}
              onChange={e => setExtractedText(e.target.value)}
              rows={12}
              className="mt-2 font-mono text-sm"
              placeholder="Extracted text will appear here..."
            />
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className={className}>
      {renderOCRSettings()}

      {renderUploadArea()}

      {selectedFiles.length > 0 && (
        <div className="mt-4 space-y-2">
          <div className="text-sm font-medium">Selected Files:</div>
          {selectedFiles.map((file, index) => (
            <div key={index} className="flex items-center gap-2 text-sm">
              <FileText className="h-4 w-4" />
              {file.name} ({(file.size / 1024 / 1024).toFixed(2)} MB)
            </div>
          ))}

          <Button onClick={() => processOCR()} disabled={processing} className="w-full mt-3">
            {processing ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Processing OCR...
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                Extract Text
              </>
            )}
          </Button>
        </div>
      )}

      {renderResults()}
    </div>
  );
};

export default OCRProcessor;
