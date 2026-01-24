// Toast notification system upgraded to SecureToast

import React, { useState } from 'react';
import {
  Card,
  CardBody,
  CardHeader,
  CardFooter,
  CardTitle,
  CardSubtitle,
  Button,
  Alert,
  Spinner,
} from 'reactstrap';
import { FileDown, CheckCircle, AlertCircle, Loader2 } from 'lucide-react';
import { useToast } from '../App';
import 'bootstrap/dist/css/bootstrap.min.css';

const IQOQDownload: React.FC = () => {
  const [loading, setLoading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<'idle' | 'success' | 'error'>('idle');

  const handleDownload = async () => {
    try {
      setLoading(true);
      setDownloadStatus('idle');

      // Use the Express server's proxy to the FastAPI endpoint
      // This routes through the Express server which handles forwarding to FastAPI
      window.location.href = '/api/validation/iqoq';

      // Set success after a short delay (since we can't directly track download completion)
      setTimeout(() => {
        setDownloadStatus('success');
        useToast().showToast('IQ/OQ/PQ validation document download initiated.', 'success');
        setLoading(false);
      }, 1500);
    } catch (error) {
      console.error('Download error:', error);
      setDownloadStatus('error');
      useToast().showToast('Failed to download validation document. Please try again.', 'error');
      setLoading(false);
    }
  };

  return (
    <div className="container max-w-4xl mx-auto p-6">
      <Card className="bg-white shadow-md">
        <CardHeader className="bg-primary/5">
          <CardTitle className="text-2xl font-bold">Validation Documentation</CardTitle>
          <CardSubtitle className="text-muted">
            Download Installation Qualification (IQ), Operational Qualification (OQ), and
            Performance Qualification (PQ) documentation for system validation.
          </CardSubtitle>
        </CardHeader>
        <CardBody className="p-4">
          <div className="mb-4">
            <h3 className="fw-medium fs-5 mb-2">Documentation Details</h3>
            <p className="text-muted mb-4">
              These documents provide comprehensive validation information for TrialSage, including
              system specifications, validation test results, and regulatory compliance evidence.
            </p>
            <ul className="ps-4 mb-4">
              <li>
                Installation Qualification (IQ): System components and environment verification
              </li>
              <li>Operational Qualification (OQ): Core workflow testing and verification</li>
              <li>Performance Qualification (PQ): End-to-end performance validation</li>
              <li>Audit trail and compliance documentation</li>
            </ul>
          </div>

          {downloadStatus === 'success' && (
            <Alert color="success" className="d-flex align-items-center">
              <CheckCircle className="me-2" size={20} />
              <span>Document download initiated successfully.</span>
            </Alert>
          )}

          {downloadStatus === 'error' && (
            <Alert color="danger" className="d-flex align-items-center">
              <AlertCircle className="me-2" size={20} />
              <span>Failed to download document. Please try again or contact support.</span>
            </Alert>
          )}
        </CardBody>
        <CardFooter className="d-flex justify-content-center border-top pt-3">
          <Button
            color="primary"
            onClick={handleDownload}
            disabled={loading}
            className="d-flex align-items-center gap-2"
          >
            {loading ? (
              <>
                <Spinner size="sm" className="me-2" />
                Preparing Document...
              </>
            ) : (
              <>
                <FileDown size={16} className="me-2" />
                Download IQ/OQ/PQ Documentation
              </>
            )}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
};

export default IQOQDownload;
